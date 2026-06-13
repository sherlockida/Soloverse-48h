"""World-level Pydantic models: snapshot, dialog entries, seed events, world changes.

Provides validated, typed wrappers for dicts that flow through
snapshot_dict(), chronicle(), _parse_world_changes(), and inject_player_seed().
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class DialogEntry(BaseModel):
    """A single line of agent dialog (speaker + utterance)."""
    speaker: str
    utterance: str = ""


class SeedEvent(BaseModel):
    """A seed event from the seed library or player injection.

    Mirrors the shape used in seed_events.yaml and
    Event.payload for kind='seed': {desc, affected, effects, ...}.
    """
    desc: str = ""
    affected: list[str] = Field(default_factory=list)
    effects: list[dict] = Field(default_factory=list)


class WorldChange(BaseModel):
    """A world-level status change extracted from seed / narrative text.

    Mirrors the dict produced by _parse_world_changes():
    {actor, kind, reason}.
    """
    actor: str = ""
    kind: str = ""
    reason: str = ""


class WorldSnapshot(BaseModel):
    """Point-in-time snapshot of the world state.

    Mirrors the dict returned by WorldStateMixin.snapshot_dict():
    {tick, clock, day, time, agents, places, recent_events,
     headlines, seed_events}.
    """
    tick: int = 0
    clock: str = ""
    day: int = 0
    time: str = ""
    agents: list[dict] = Field(default_factory=list)
    places: list[str] = Field(default_factory=list)
    recent_events: list[str] = Field(default_factory=list)
    headlines: list[dict] = Field(default_factory=list)
    seed_events: list[dict] = Field(default_factory=list)
