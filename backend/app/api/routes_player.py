"""Player interaction API routes.

Endpoints for the player avatar within a scene: set avatar, say, move,
act, plus ending/chronicle/seed-suggestions retrieval.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Query

logger = __import__("logging").getLogger("echoworld.routes.player")

router = APIRouter()


# =====================================================================
# Helpers
# =====================================================================

def _get_world(request: Request, scene_id: str):
    """Resolve a World by scene_id; raise 404 if not found."""
    from app.api.app import _get_world as _gw  # noqa: WPS442

    return _gw(request, scene_id)


# =====================================================================
# Player avatar
# =====================================================================

@router.post("/api/scenes/{scene_id}/avatar")
async def set_avatar(scene_id: str, request: Request):
    """Set or clear the player avatar for a scene.

    - ``name: "SomeAgent"`` – the player takes over that agent.
    - ``name: null`` – revert to God mode (observer).
    """
    from app.api.app import AvatarBody

    body = await request.json()
    validated = AvatarBody(**body)

    world = _get_world(request, scene_id)
    try:
        result = await world.set_player_avatar(validated.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"ok": True, **result}


# =====================================================================
# Player actions
# =====================================================================

@router.post("/api/scenes/{scene_id}/player/say")
async def player_say(scene_id: str, request: Request):
    """Player avatar speaks to a specific agent."""
    from app.api.app import PlayerSayBody

    body = await request.json()
    validated = PlayerSayBody(**body)

    world = _get_world(request, scene_id)
    if not validated.utterance.strip():
        raise HTTPException(status_code=400, detail="utterance cannot be empty")
    try:
        result = await world.player_say(
            validated.target,
            validated.utterance.strip(),
            validated.intent,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/api/scenes/{scene_id}/player/move")
async def player_move(scene_id: str, request: Request):
    """Player avatar moves to a different location."""
    from app.api.app import PlayerMoveBody

    body = await request.json()
    validated = PlayerMoveBody(**body)

    world = _get_world(request, scene_id)
    try:
        result = await world.player_move(validated.to.strip())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/api/scenes/{scene_id}/player/act")
async def player_act(scene_id: str, request: Request):
    """Player avatar performs an action (e.g. work, rest)."""
    from app.api.app import PlayerActBody

    body = await request.json()
    validated = PlayerActBody(**body)

    world = _get_world(request, scene_id)
    try:
        result = await world.player_act(validated.kind, validated.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


# =====================================================================
# Ending / Chronicle / Seed suggestions
# =====================================================================

@router.get("/api/scenes/{scene_id}/ending")
async def scene_ending(scene_id: str, request: Request):
    """Generate a story ending based on the current relationship matrix + dramatic density.

    Does not call the LLM.
    """
    world = _get_world(request, scene_id)
    return world.generate_ending()


@router.get("/api/scenes/{scene_id}/chronicle")
async def scene_chronicle(
    scene_id: str,
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
):
    """Global chronicle: important events in reverse tick order."""
    world = _get_world(request, scene_id)
    return world.chronicle(limit=limit)


@router.get("/api/scenes/{scene_id}/seed_suggestions")
async def scene_seed_suggestions(
    scene_id: str,
    request: Request,
    n: int = Query(default=6, ge=1, le=20),
):
    """Dynamically suggest narrative seeds based on current agent threads and relations."""
    world = _get_world(request, scene_id)
    return {"suggestions": world.suggest_seeds(n=n)}
