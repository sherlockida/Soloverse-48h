"""Engine: tick-driven world engine + event bus.

Lazy-loaded (PEP 562) to avoid circular imports between app.engine and
app.agents: world_actions/world_loop import Agent types from app.agents, while
agent modules import app.engine.events. With lazy resolution, a direct
submodule import like `from app.engine.events import Event` no longer triggers
the heavy world / world_manager chain; package-level imports
(`from app.engine import World`) resolve on first access.
"""
from __future__ import annotations

__all__ = ["Event", "EventBus", "World", "WorldManager"]

# Public name -> (submodule path, attribute name)
_LAZY = {
    "Event": ("app.engine.events", "Event"),
    "EventBus": ("app.engine.events", "EventBus"),
    "World": ("app.engine.world", "World"),
    "WorldManager": ("app.engine.world_manager", "WorldManager"),
}


def __getattr__(name):
    if name in _LAZY:
        import importlib

        mod_path, attr = _LAZY[name]
        value = getattr(importlib.import_module(mod_path), attr)
        globals()[name] = value  # cache so later access bypasses __getattr__
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted(list(globals()) + __all__)
