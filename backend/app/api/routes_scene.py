"""Scene management API routes.

All endpoints under ``/api/scenes/*``: CRUD, SSE events, agent
management (add / patch / detail), seed/speed/reset per scene, and
theme template serving.
"""
from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger("echoworld.routes.scene")

router = APIRouter()


# =====================================================================
# Helpers (local to this module to keep app.py clean)
# =====================================================================

def _get_world(request: Request, scene_id: str):
    """Resolve a World by scene_id; raise 404 if not found."""
    from app.api.app import _get_world as _gw  # noqa: WPS442 – shared helper

    return _gw(request, scene_id)


def _get_manager(request: Request):
    """Return the WorldManager from app.state."""
    return request.app.state.manager


# =====================================================================
# Scene CRUD
# =====================================================================

@router.get("/api/scenes")
async def list_scenes(request: Request):
    """List all active scenes."""
    mgr = _get_manager(request)
    return mgr.list_scenes()


@router.post("/api/scenes")
async def create_scene(request: Request):
    """Create a new scene from a JSON body (SceneCreateBody)."""
    from app.api.app import SceneCreateBody

    body = await request.json()
    validated = SceneCreateBody(**body)

    mgr = _get_manager(request)
    scene_id = validated.scene_id.strip() or f"scene_{len(mgr.scenes) + 1}"
    config = validated.model_dump()
    world = await mgr.create_scene(scene_id, config)
    return {"ok": True, "scene_id": scene_id, **world.snapshot_dict()}


@router.get("/api/scenes/{scene_id}/state")
async def scene_state(scene_id: str, request: Request):
    """Full world-state snapshot for a scene."""
    return _get_world(request, scene_id).snapshot_dict()


@router.delete("/api/scenes/{scene_id}")
async def delete_scene(scene_id: str, request: Request):
    """Delete a scene (stops its tick loop)."""
    if scene_id == "default":
        raise HTTPException(status_code=400, detail="cannot delete default scene")
    mgr = _get_manager(request)
    await mgr.delete_scene(scene_id)
    return {"ok": True}


# =====================================================================
# SSE – scene-scoped event stream
# =====================================================================

@router.get("/api/scenes/{scene_id}/events")
async def scene_events(scene_id: str, request: Request):
    """Server-Sent Events stream for a specific scene."""
    world = _get_world(request, scene_id)
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


# =====================================================================
# Scene controls: seed / speed / reset
# =====================================================================

@router.post("/api/scenes/{scene_id}/seed")
async def scene_seed(scene_id: str, request: Request):
    """Inject a narrative seed into a scene."""
    from app.api.app import SeedBody

    body = await request.json()
    validated = SeedBody(**body)

    if not validated.text.strip():
        raise HTTPException(status_code=400, detail="text cannot be empty")
    world = _get_world(request, scene_id)
    result = await world.inject_player_seed(
        validated.text.strip(),
        explicit_effect=validated.effect or "",
        explicit_affected=validated.affected or None,
    )
    return {"ok": True, **result}


@router.post("/api/scenes/{scene_id}/speed")
async def scene_speed(scene_id: str, request: Request):
    """Adjust tick speed for a scene."""
    from app.api.app import SpeedBody
    import os

    body = await request.json()
    validated = SpeedBody(**body)

    if validated.factor <= 0:
        raise HTTPException(status_code=400, detail="factor must be > 0")
    world = _get_world(request, scene_id)
    base = float(os.getenv("TICK_INTERVAL_SECONDS", "5.0"))
    world.tick_interval = max(0.3, base / validated.factor)
    return {"ok": True, "tick_interval": world.tick_interval, "factor": validated.factor}


@router.post("/api/scenes/{scene_id}/reset")
async def scene_reset(scene_id: str, request: Request):
    """Reset a scene's tick to 0."""
    world = _get_world(request, scene_id)
    await world.reset()
    return {"ok": True, "tick": world.tick}


# =====================================================================
# Agent management (per scene)
# =====================================================================

@router.get("/api/scenes/{scene_id}/agents/{name}")
async def scene_agent_detail(scene_id: str, name: str, request: Request):
    """Return full agent details within a scene."""
    world = _get_world(request, scene_id)
    for a in world.agents:
        if a.name == name:
            return a.model_dump()
    raise HTTPException(status_code=404, detail=f"agent {name} not found in scene {scene_id}")


@router.post("/api/scenes/{scene_id}/agents")
async def add_agent_to_scene(scene_id: str, request: Request):
    """Spawn a new agent into a running scene."""
    from app.agents import Agent
    from app.api.app import AgentCreateBody
    from app.models.memory import Memory, Thread

    body = await request.json()
    validated = AgentCreateBody(**body)

    world = _get_world(request, scene_id)
    if not validated.name.strip():
        raise HTTPException(status_code=400, detail="name cannot be empty")
    if any(a.name == validated.name for a in world.agents):
        raise HTTPException(status_code=409, detail=f"agent {validated.name} already exists")

    location = validated.location.strip() or (world.places[0] if world.places else "")
    if location not in world.places:
        location = world.places[0] if world.places else ""

    threads = []
    for t in (validated.threads or []):
        if isinstance(t, dict) and t.get("desc"):
            threads.append(Thread(
                desc=t["desc"],
                target=t.get("target"),
                weight=int(t.get("weight", 5)),
            ))

    new_agent = Agent(
        name=validated.name.strip(),
        emoji=validated.emoji or ":)",
        role=validated.role or "",
        persona=validated.persona or f"A new {validated.role or 'mysterious'} arrival.",
        voice=validated.voice or "speaks briefly and directly",
        goals=list(validated.goals or []),
        location=location,
        threads=threads,
        color_palette=validated.color_palette or {},
    )

    # Entry memory
    new_agent.add_memory(Memory(
        tick=world.tick, kind="observed",
        content=f"Just arrived at {location}, knowing nothing about this world.",
    ))

    world.agents.append(new_agent)

    # Broadcast spawn event
    from app.engine.events import Event
    await world.event_bus.publish(Event(
        tick=world.tick, kind="seed",
        text=f"New agent {new_agent.emoji} {new_agent.name} appears at {location}!",
        payload={
            "desc": f"New agent {new_agent.name} joined the world",
            "affected": [new_agent.name],
            "source": "spawn",
        },
    ))

    return {"ok": True, "agent": new_agent.model_dump()}


@router.patch("/api/scenes/{scene_id}/agents/{name}")
async def patch_agent(scene_id: str, name: str, request: Request):
    """Edit an existing agent's persona / voice / threads / palette / location."""
    from app.api.app import AgentPatchBody
    from app.models.memory import Thread

    body = await request.json()
    validated = AgentPatchBody(**body)

    world = _get_world(request, scene_id)
    target = None
    for a in world.agents:
        if a.name == name:
            target = a
            break
    if target is None:
        raise HTTPException(status_code=404, detail=f"agent {name} not found")

    if validated.emoji is not None:
        target.emoji = validated.emoji
    if validated.persona is not None:
        target.persona = validated.persona
    if validated.voice is not None:
        target.voice = validated.voice
    if validated.goals is not None:
        target.goals = list(validated.goals)
    if validated.threads is not None:
        target.threads = [
            Thread(desc=t["desc"], target=t.get("target"), weight=int(t.get("weight", 5)))
            for t in validated.threads if isinstance(t, dict) and t.get("desc")
        ]
    if validated.color_palette is not None:
        target.color_palette = validated.color_palette
    if validated.location is not None and validated.location in world.places:
        target.location = validated.location

    return {"ok": True, "agent": target.model_dump()}


# =====================================================================
# Templates
# =====================================================================

@router.get("/api/templates/{theme}")
async def get_template(theme: str):
    """Serve a pre-built theme template JSON."""
    template_path = Path(__file__).resolve().parents[3] / "config" / "templates" / f"{theme}.json"
    if not template_path.exists():
        raise HTTPException(status_code=404, detail=f"template {theme} not found")
    return JSONResponse(content=json.loads(template_path.read_text(encoding="utf-8")))
