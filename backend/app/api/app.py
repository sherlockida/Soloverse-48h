"""FastAPI app factory: lifespan, middleware, utility routes, router mounting.

Creates the application via ``create_app()`` and wires up:
- Lifespan context manager (startup/shutdown WorldManager)
- CORS + TimeoutMiddleware
- NoCacheStaticFiles for development
- Utility routes: /, /hello
- Backward-compatible routes: /world/state, /events, /seed, /speed, /reset, /agents/{name}
- Mounted APIRouter from routes_scene and routes_player
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# -- must load .env before importing World so env vars are available --
load_dotenv(override=True)

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("echoworld.main")


# =====================================================================
# Request / Response body models (shared across route modules)
# =====================================================================

class SeedBody(BaseModel):
    text: str
    effect: str = ""
    affected: list[str] = []


class SpeedBody(BaseModel):
    factor: float = 1.0


class SceneCreateBody(BaseModel):
    scene_id: str = ""
    theme: str = "medieval"
    story_background: str = ""
    agents: list[dict] = []
    places: list[str] = []
    relations: list[dict] = []
    seed_events: list[dict] = []


class AgentCreateBody(BaseModel):
    name: str
    emoji: str = ":)"
    role: str = ""
    persona: str = ""
    voice: str = ""
    location: str = ""
    goals: list[str] = []
    threads: list[dict] = []
    color_palette: dict = {}


class AgentPatchBody(BaseModel):
    emoji: str | None = None
    persona: str | None = None
    voice: str | None = None
    goals: list[str] | None = None
    threads: list[dict] | None = None
    color_palette: dict | None = None
    location: str | None = None


class AvatarBody(BaseModel):
    name: str | None = None  # None = revert to God mode


class PlayerSayBody(BaseModel):
    target: str
    utterance: str
    intent: str = ""


class PlayerMoveBody(BaseModel):
    to: str


class PlayerActBody(BaseModel):
    kind: str  # "work" | "rest"
    reason: str = ""


# =====================================================================
# Helpers
# =====================================================================

def _get_world(request: Request, scene_id: str | None = None):
    """Resolve a World instance from the request's WorldManager state.

    Import deferred so this module has no hard compile-time dependency
    on the engine (useful for testing).
    """
    from app.engine.world import World  # noqa: F401 – trigger lazy import

    mgr = request.app.state.manager
    if scene_id:
        w = mgr.get_scene(scene_id)
        if not w:
            raise HTTPException(status_code=404, detail=f"scene {scene_id} not found")
        return w
    raise HTTPException(
        status_code=410,
        detail=(
            "No default world. Use /api/scenes/{scene_id}/... routes. "
            "Create a scene first via POST /api/scenes."
        ),
    )


# =====================================================================
# Static files wrapper (no-cache during development)
# =====================================================================

class NoCacheStaticFiles(StaticFiles):
    """Dev-time wrapper: prevents browser caching of static assets."""

    async def get_response(self, path: str, scope: dict) -> JSONResponse:  # type: ignore[override]
        resp = await super().get_response(path, scope)
        try:
            resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            resp.headers["Pragma"] = "no-cache"
            resp.headers["Expires"] = "0"
        except Exception:
            pass
        return resp


# =====================================================================
# Lifespan
# =====================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create WorldManager on startup; stop all loops on shutdown."""
    # WorldManager lives in origin/backend/ until migrated; import lazily
    # so the module structure stays decoupled.
    try:
        from origin.backend.world_manager import WorldManager
    except ImportError:
        from app.engine.world_manager import WorldManager  # future home

    from app.services import LLMClient

    llm = LLMClient()
    mgr = WorldManager(llm)
    app.state.manager = mgr
    app.state.world = None
    logger.info("EchoWorld started; waiting for user to create a world.")
    try:
        yield
    finally:
        for sid in list(mgr.scenes.keys()):
            await mgr.scenes[sid].stop_loop()
        logger.info("All world loops stopped")


# =====================================================================
# App factory
# =====================================================================

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend"


def create_app() -> FastAPI:
    """Build and return the fully-wired FastAPI application."""
    from app.api.middleware import add_timeout_middleware
    from app.api.routes_scene import router as scene_router
    from app.api.routes_player import router as player_router

    app = FastAPI(title="EchoWorld", lifespan=lifespan)

    # -- Static files --
    if FRONTEND_DIR.exists():
        app.mount("/static", NoCacheStaticFiles(directory=str(FRONTEND_DIR)), name="static")

    # -- Timeout middleware --
    add_timeout_middleware(app)

    # -- No-cache for root / and /index.html --
    @app.middleware("http")
    async def no_cache_root_index(request: Request, call_next):
        response = await call_next(request)
        if request.url.path in ("/", "/index.html"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

    # -- Utility routes --
    @app.get("/")
    async def index():
        f = FRONTEND_DIR / "index.html"
        if f.exists():
            return FileResponse(str(f))
        return JSONResponse({"error": "frontend not found"}, status_code=404)

    @app.get("/hello")
    async def hello():
        return {"ok": True, "name": "EchoWorld"}

    # -- Backward-compatible routes (default scene) --
    @app.get("/world/state")
    async def world_state(request: Request):
        return _get_world(request).snapshot_dict()

    @app.get("/events")
    async def events(request: Request):
        world = _get_world(request)
        queue = await world.event_bus.subscribe()

        async def stream():
            try:
                while True:
                    if await request.is_disconnected():
                        break
                    try:
                        ev = await asyncio.wait_for(queue.get(), timeout=15.0)
                        yield {"data": ev.to_sse()}
                    except asyncio.TimeoutError:
                        yield {"event": "ping", "data": "{}"}
            finally:
                world.event_bus.unsubscribe(queue)

        return EventSourceResponse(stream())

    @app.post("/seed")
    async def post_seed(body: SeedBody, request: Request):
        if not body.text.strip():
            raise HTTPException(status_code=400, detail="text cannot be empty")
        result = await _get_world(request).inject_player_seed(body.text.strip())
        return {"ok": True, **result}

    @app.post("/speed")
    async def post_speed(body: SpeedBody, request: Request):
        if body.factor <= 0:
            raise HTTPException(status_code=400, detail="factor must be > 0")
        base = float(os.getenv("TICK_INTERVAL_SECONDS", "5.0"))
        _get_world(request).tick_interval = max(0.3, base / body.factor)
        return {"ok": True, "tick_interval": _get_world(request).tick_interval, "factor": body.factor}

    @app.post("/reset")
    async def post_reset(request: Request):
        await _get_world(request).reset()
        return {"ok": True, "tick": _get_world(request).tick}

    @app.get("/agents/{name}")
    async def agent_detail(name: str, request: Request):
        for a in _get_world(request).agents:
            if a.name == name:
                return a.model_dump()
        raise HTTPException(status_code=404, detail=f"agent {name} not found")

    # -- API route modules --
    app.include_router(scene_router)
    app.include_router(player_router)

    return app
