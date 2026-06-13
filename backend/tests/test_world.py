"""Tests for world.py — clock, reload_seeds, pair_up, nearby, world_changes, snapshot, ending, seeds.

All imports come from the origin/backend directory (set up in conftest.py).
"""
from __future__ import annotations

import asyncio

import pytest

from backend.world import World
from backend.agent import Action
from backend.events import Event
from backend.memory import Memory, Relation


# ======================== clock ========================

class TestWorldClock:
    def test_tick_zero(self, sample_world):
        day, time_str = sample_world.clock(0)
        assert day == 1
        assert time_str == "06:00"

    def test_tick_one_hour(self, sample_world):
        # 1 tick = 10 minutes; 6 ticks = 1 hour from 06:00 -> 07:00
        day, time_str = sample_world.clock(6)
        assert day == 1
        assert time_str == "07:00"

    def test_day_rollover(self, sample_world):
        # 24h = 1440 min; need 144 ticks from 06:00 to wrap to next day 06:00
        # (24*60)/10 = 144 ticks per day
        day, time_str = sample_world.clock(144)
        assert day == 2
        assert time_str == "06:00"

    def test_current_tick(self, sample_world):
        sample_world.tick = 50
        day, time_str = sample_world.clock()
        assert day >= 1


# ======================== reload_seeds ========================

class TestReloadSeeds:
    def test_reload_preserves_structure(self, sample_world):
        original_agent_count = len(sample_world.agents)
        original_place_count = len(sample_world.places)
        sample_world.reload_seeds()
        assert len(sample_world.agents) == original_agent_count
        assert len(sample_world.places) == original_place_count

    def test_reload_resets_seed_events(self, sample_world):
        sample_world.seed_events = []
        sample_world.reload_seeds()
        assert len(sample_world.seed_events) > 0


# ======================== pair_up ========================

class TestPairUp:
    def test_basic_pairing(self, sample_world):
        """Two agents at the same location wanting to talk should be paired."""
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        alice.location = "广场"
        bob.location = "广场"

        actions = [
            Action(kind="talk", target="Bob", reason="") if a.name == "Alice"
            else Action.rest()
            for a in sample_world.agents
        ]
        pairs = sample_world._pair_up(actions)
        paired_names = {(p[0].name, p[1].name) for p in pairs}
        assert ("Alice", "Bob") in paired_names

    def test_different_locations_not_paired(self, sample_world):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        alice.location = "医院"
        bob.location = "农场"

        actions = [
            Action(kind="talk", target="Bob", reason="") if a.name == "Alice"
            else Action.rest()
            for a in sample_world.agents
        ]
        pairs = sample_world._pair_up(actions)
        assert len(pairs) == 0

    def test_no_duplicate_pairing(self, sample_world):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        carol = next(a for a in sample_world.agents if a.name == "Carol")
        alice.location = "广场"
        bob.location = "广场"
        carol.location = "广场"

        # Both Alice and Carol want to talk to Bob
        actions = []
        for a in sample_world.agents:
            if a.name == "Alice":
                actions.append(Action(kind="talk", target="Bob", reason=""))
            elif a.name == "Carol":
                actions.append(Action(kind="talk", target="Bob", reason=""))
            else:
                actions.append(Action.rest())
        pairs = sample_world._pair_up(actions)
        # Bob can only be in one pair
        all_names = []
        for p1, p2 in pairs:
            all_names.extend([p1.name, p2.name])
        bob_count = all_names.count("Bob")
        assert bob_count <= 1


# ======================== _compute_nearby ========================

class TestComputeNearby:
    def test_nearby_same_location(self, sample_world):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        alice.location = "广场"
        bob.location = "广场"
        nearby = sample_world._compute_nearby()
        alice_others = [n for n, _ in nearby.get("Alice", [])]
        assert "Bob" in alice_others

    def test_nearby_different_location(self, sample_world):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        alice.location = "医院"
        bob.location = "农场"
        nearby = sample_world._compute_nearby()
        alice_others = nearby.get("Alice", [])
        assert len(alice_others) == 0


# ======================== _parse_world_changes ========================

class TestParseWorldChanges:
    def test_detects_death(self, sample_world):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        desc = "Alice 走到路上被车撞了，死了"
        changes = sample_world._parse_world_changes(desc)
        assert len(changes) == 1
        assert changes[0]["actor"] == "Alice"
        assert changes[0]["kind"] == "dead"

    def test_detects_unconscious(self, sample_world):
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        desc = "Bob 突然晕倒在田里"
        changes = sample_world._parse_world_changes(desc)
        assert len(changes) >= 1
        found = [c for c in changes if c["actor"] == "Bob"]
        assert found
        assert found[0]["kind"] == "unconscious"

    def test_detects_missing(self, sample_world):
        carol = next(a for a in sample_world.agents if a.name == "Carol")
        desc = "Carol 失踪了，没人知道去哪了"
        changes = sample_world._parse_world_changes(desc)
        found = [c for c in changes if c["actor"] == "Carol"]
        assert found
        assert found[0]["kind"] == "missing"

    def test_empty_desc(self, sample_world):
        changes = sample_world._parse_world_changes("")
        assert changes == []

    def test_no_match(self, sample_world):
        desc = "天气很好，大家都在广场晒太阳"
        changes = sample_world._parse_world_changes(desc)
        assert changes == []


# ======================== snapshot ========================

class TestSnapshot:
    def test_snapshot_dict_structure(self, sample_world):
        sample_world.tick = 5
        snap = sample_world.snapshot_dict()
        assert snap["tick"] == 5
        assert "clock" in snap
        assert "agents" in snap
        assert "places" in snap
        assert snap["clock"]["day"] >= 1
        assert len(snap["agents"]) == len(sample_world.agents)
        assert snap["places"] == sample_world.places

    def test_snapshot_contains_agent_data(self, sample_world):
        snap = sample_world.snapshot_dict()
        agent_names = [a["name"] for a in snap["agents"]]
        assert "Alice" in agent_names
        assert "Bob" in agent_names


# ======================== generate_ending ========================

class TestGenerateEnding:
    def test_ending_structure(self, sample_world):
        sample_world.tick = 10
        ending = sample_world.generate_ending()
        assert "tick" in ending
        assert "headline" in ending
        assert "flavor" in ending
        assert "agents" in ending
        assert ending["tick"] == 10

    def test_ending_agent_endings(self, sample_world):
        ending = sample_world.generate_ending()
        agent_endings = ending["agents"]
        assert len(agent_endings) == len(sample_world.agents)
        names = [e["name"] for e in agent_endings]
        assert "Alice" in names
        for e in agent_endings:
            assert "ending" in e

    def test_ending_headline_not_empty(self, sample_world):
        ending = sample_world.generate_ending()
        assert ending["headline"]  # should not be empty string

    def test_ending_with_relations(self, sample_world):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        bob = next(a for a in sample_world.agents if a.name == "Bob")
        alice.relations["Bob"] = Relation(trust=8, fondness=9)
        bob.relations["Alice"] = Relation(trust=7, fondness=8)
        ending = sample_world.generate_ending()
        assert "Alice" in ending["headline"] or "Bob" in ending["headline"]


# ======================== seed_events ========================

class TestSeedEvents:
    def test_seed_events_loaded(self, sample_world):
        assert len(sample_world.seed_events) > 0
        first = sample_world.seed_events[0]
        assert "desc" in first
        assert "affected" in first

    def test_detect_effects(self, sample_world):
        effects = sample_world._detect_effects("突然下起了暴雨，大家四处躲避")
        assert "rain" in effects

    def test_detect_effects_fire(self, sample_world):
        effects = sample_world._detect_effects("角落起火了")
        assert "fire" in effects

    def test_detect_effects_no_match(self, sample_world):
        effects = sample_world._detect_effects("今天天气不错")
        assert effects == []

    def test_detect_effects_multiple(self, sample_world):
        effects = sample_world._detect_effects("深夜停电了，周围一片黑暗")
        assert "night" in effects or "blackout" in effects


# ======================== dialog_key ========================

class TestDialogKey:
    def test_dialog_key_sorted(self, sample_world):
        k1 = sample_world._dialog_key("Alice", "Bob")
        k2 = sample_world._dialog_key("Bob", "Alice")
        assert k1 == k2

    def test_dialog_key_is_tuple(self, sample_world):
        k = sample_world._dialog_key("Alice", "Bob")
        assert isinstance(k, tuple)
        assert len(k) == 2


# ======================== _apply_action ========================

class TestApplyAction:
    @pytest.mark.asyncio
    async def test_move_action(self, sample_world, event_bus):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        old_loc = alice.location
        new_loc = "广场"
        sample_world.tick = 1
        action = Action(kind="move", target=new_loc, reason="test")
        await sample_world._apply_action(alice, action)
        assert alice.location == new_loc
        # A move event should have been published
        hist = event_bus.history(limit=10)
        move_events = [e for e in hist if e.kind == "move" and e.actor == "Alice"]
        assert len(move_events) == 1

    @pytest.mark.asyncio
    async def test_rest_action(self, sample_world, event_bus):
        alice = next(a for a in sample_world.agents if a.name == "Alice")
        sample_world.tick = 1
        action = Action.rest("休息一下")
        await sample_world._apply_action(alice, action)
        # Should have added a "felt" memory
        felt_memories = [m for m in alice.memories if m.kind == "felt"]
        assert len(felt_memories) == 1
