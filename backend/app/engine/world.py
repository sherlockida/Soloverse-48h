"""World: thin re-export with mixin composition.

Composes the World class from:
- world_loop.World (core class: init, loop, do_tick, clock, reload/reset)
- world_actions.WorldActionsMixin (think/act/apply/talk)
- world_seed.WorldSeedMixin (seed injection, narrative scan)
- world_player.WorldPlayerMixin (player avatar operations)
- world_state.WorldStateMixin (snapshots, chronicle, endings, config)

Public API: ``from app.engine.world import World``  (unchanged).
"""
from __future__ import annotations

from app.engine.world_actions import WorldActionsMixin
from app.engine.world_loop import World as _WorldBase
from app.engine.world_player import WorldPlayerMixin
from app.engine.world_seed import WorldSeedMixin
from app.engine.world_state import WorldStateMixin


def _compose_world() -> type:
    """Create the composed World class via multiple inheritance.

    MRO order ensures:
    1. WorldActionsMixin (leftmost wins on conflicts)
    2. WorldSeedMixin
    3. WorldPlayerMixin
    4. WorldStateMixin
    5. _WorldBase (core: init, do_tick, clock, loop)
    """
    return type(
        "World",
        (
            WorldActionsMixin,
            WorldSeedMixin,
            WorldPlayerMixin,
            WorldStateMixin,
            _WorldBase,
        ),
        {},
    )


World = _compose_world()

__all__ = ["World"]
