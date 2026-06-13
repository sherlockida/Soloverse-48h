"""Narrative data models — Headline, etc."""
from __future__ import annotations

from pydantic import BaseModel, field_validator, Field


class Headline(BaseModel):
    """A single narrative headline produced by NarrativeDetector."""

    headline: str
    involved: list[str] = Field(default_factory=list)
    chain: list[str] = Field(default_factory=list)
    drama: int = 0
    predict_next: str = ""
    tick: int = 0
    is_fallback: bool = False

    @field_validator("drama", mode="before")
    @classmethod
    def clamp_drama(cls, v: object) -> int:
        """Clamp drama value to 0..10 inclusive."""
        return max(0, min(10, int(v)))
