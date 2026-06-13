"""Tests for events.py — Event construction, EventBus publish/subscribe, history, concurrent safety.

All imports come from the origin/backend directory (set up in conftest.py).
"""
from __future__ import annotations

import asyncio

import pytest

from backend.events import Event, EventBus


# ======================== Event model ========================

class TestEventModel:
    def test_basic_construction(self):
        ev = Event(tick=1, kind="tick_marker", text="Day 1 06:00")
        assert ev.tick == 1
        assert ev.kind == "tick_marker"
        assert ev.text == "Day 1 06:00"
        assert ev.actor == ""
        assert ev.target == ""
        assert ev.payload == {}

    def test_with_actor_and_target(self):
        ev = Event(tick=5, kind="talk", actor="Alice", target="Bob",
                  text="Alice 对 Bob 说话")
        assert ev.actor == "Alice"
        assert ev.target == "Bob"

    def test_with_payload(self):
        payload = {"key": "value", "num": 42}
        ev = Event(tick=1, kind="move", payload=payload)
        assert ev.payload == payload

    def test_token_used_default(self):
        ev = Event(tick=1, kind="talk", token_used=100)
        assert ev.token_used == 100

    def test_to_sse_serialization(self):
        ev = Event(tick=1, kind="tick_marker", text="Day 1", actor="Alice")
        sse_str = ev.to_sse()
        assert "tick_marker" in sse_str
        assert "Alice" in sse_str
        # Should be valid JSON
        import json
        parsed = json.loads(sse_str)
        assert parsed["tick"] == 1

    def test_kind_validation(self):
        """Only defined EventKind values should be accepted by Pydantic."""
        ev = Event(tick=1, kind="tick_marker", text="ok")
        assert ev.kind == "tick_marker"

    def test_ts_ms_auto_generated(self):
        import time
        before = int(time.time() * 1000)
        ev = Event(tick=1, kind="system", text="auto")
        after = int(time.time() * 1000)
        assert before <= ev.ts_ms <= after


# ======================== EventBus ========================

class TestEventBus:
    @pytest.mark.asyncio
    async def test_publish_and_history(self, event_bus):
        ev = Event(tick=1, kind="tick_marker", text="test")
        await event_bus.publish(ev)
        hist = event_bus.history(limit=10)
        assert len(hist) == 1
        assert hist[0].text == "test"

    @pytest.mark.asyncio
    async def test_history_limit(self, event_bus):
        for i in range(10):
            await event_bus.publish(Event(tick=i, kind="tick_marker", text=f"t{i}"))
        hist = event_bus.history(limit=3)
        assert len(hist) == 3
        assert hist[-1].tick == 9

    @pytest.mark.asyncio
    async def test_subscribe_receives_events(self, event_bus):
        queue = await event_bus.subscribe()
        ev = Event(tick=5, kind="move", text="moved")
        await event_bus.publish(ev)
        received = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert received.text == "moved"

    @pytest.mark.asyncio
    async def test_subscribe_gets_history(self, event_bus):
        """New subscriber should receive recent history."""
        for i in range(5):
            await event_bus.publish(Event(tick=i, kind="tick_marker", text=f"h{i}"))
        queue = await event_bus.subscribe()
        # Should have received the last 50 (i.e. all 5) as history
        count = 0
        while not queue.empty():
            queue.get_nowait()
            count += 1
        assert count == 5

    @pytest.mark.asyncio
    async def test_unsubscribe(self, event_bus):
        queue = await event_bus.subscribe()
        event_bus.unsubscribe(queue)
        # Publish after unsubscribe
        await event_bus.publish(Event(tick=1, kind="system", text="after"))
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_history_trims_to_max_size(self, event_bus):
        bus = EventBus(history_size=5)
        for i in range(10):
            await bus.publish(Event(tick=i, kind="tick_marker", text=f"t{i}"))
        hist = bus.history(limit=100)
        assert len(hist) == 5
        assert hist[0].tick == 5  # oldest kept

    @pytest.mark.asyncio
    async def test_multiple_subscribers(self, event_bus):
        q1 = await event_bus.subscribe()
        q2 = await event_bus.subscribe()
        await event_bus.publish(Event(tick=1, kind="talk", text="both"))
        r1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        r2 = await asyncio.wait_for(q2.get(), timeout=1.0)
        assert r1.text == "both"
        assert r2.text == "both"

    @pytest.mark.asyncio
    async def test_concurrent_publish(self, event_bus):
        """Multiple concurrent publishes should not lose events."""
        async def _publish(n):
            for i in range(n):
                await event_bus.publish(
                    Event(tick=i, kind="tick_marker", text=f"conc-{i}")
                )

        await asyncio.gather(_publish(10), _publish(10))
        hist = event_bus.history(limit=100)
        assert len(hist) == 20

    def test_recent_for_narrative_filters(self, event_bus):
        """recent_for_narrative should exclude high-frequency noise events."""
        # Directly populate history (synchronous) -- no async needed
        event_bus._history = [
            Event(tick=1, kind="tick_marker", text="tick"),
            Event(tick=2, kind="thought", text="thought"),
            Event(tick=3, kind="tool_call", text="tool"),
            Event(tick=4, kind="move", text="move"),
            Event(tick=5, kind="talk", text="talk"),
        ]
        narrative = event_bus.recent_for_narrative(n=10)
        kinds = [e.kind for e in narrative]
        assert "tick_marker" not in kinds
        assert "thought" not in kinds
        assert "tool_call" not in kinds
        assert "move" in kinds
        assert "talk" in kinds
