"""Tool result models: typed Pydantic schemas for tool return values.

Every async tool function(agent, world, **args) currently returns a plain dict.
These models define the expected shapes so that callers can validate / serialize.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ---------- Observe: agent seen ----------

class ObserveAgentSeen(BaseModel):
    """Information returned when an agent observes another agent."""

    kind: str = Field(default="agent")
    name: str = ""
    location: str = ""
    emoji: str = ""
    role: str = ""
    in_same_room: bool = False
    relation_summary: str = ""
    primed: bool = False


# ---------- Observe: place seen ----------

class ObservePlaceSeen(BaseModel):
    """Information returned when an agent observes a place."""

    kind: str = Field(default="place")
    name: str = ""
    people_there: list[str] = Field(default_factory=list)
    is_current: bool = False


# ---------- Introspect: self snapshot ----------

class IntrospectSnapshot(BaseModel):
    """Full introspection snapshot of an agent's current state."""

    persona: str = ""
    voice: str = ""
    location: str = ""
    top_relations: list[dict[str, Any]] = Field(default_factory=list)
    threads: list[str] = Field(default_factory=list)
    plan_goal: str = ""
    plan_steps: list[dict[str, Any]] = Field(default_factory=list)
    primed: str = ""


# ---------- Generic tool result ----------

class ToolResult(BaseModel):
    """Universal tool result envelope. All tools return this shape.

    - ok=False  -> error tool call (error holds message)
    - ok=True   -> data holds tool-specific payload
    - kind      -> discriminator for which tool produced the result
    """

    ok: bool = False
    kind: str = ""
    error: str = ""
    data: dict[str, Any] = Field(default_factory=dict)
