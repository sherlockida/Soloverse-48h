"""Pydantic models for LLM provider configuration, health stats, and circuit breaker state."""
from __future__ import annotations

from pydantic import BaseModel


class ProviderConfig(BaseModel):
    """Configuration for a single LLM provider entry in PROVIDER_REGISTRY."""

    key_env: str
    base_url_env: str = ""
    default_base_url: str = ""
    model_env: str = ""
    default_model: str = ""
    allow_no_key: bool = False


class HealthStats(BaseModel):
    """Per-provider health statistics accumulated during LLMClient operation."""

    calls: int = 0
    failures: int = 0
    timeouts: int = 0
    last_latency_ms: int = 0
    last_error: str = ""


class CircuitBreakerState(BaseModel):
    """Snapshot of a provider's circuit breaker state."""

    fails: int = 0
    cooldown_until: float = 0.0
    state: str = "closed"
