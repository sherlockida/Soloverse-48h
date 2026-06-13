"""Tests for tools.py — is_soft/is_hard, dispatch_tool, each tool function.

All imports come from the origin/backend directory (set up in conftest.py).
"""
from __future__ import annotations

import pytest

from backend.tools import (
    is_soft, is_hard, dispatch_tool,
    SOFT_TOOLS, HARD_TOOLS, ALL_TOOL_NAMES,
    TOOL_REGISTRY,
)
from backend.memory import Memory


# ======================== Classification ========================

class TestToolClassification:
    def test_soft_tools_set(self):
        assert "observe" in SOFT_TOOLS
        assert "recall" in SOFT_TOOLS
        assert "introspect" in SOFT_TOOLS
        assert "plan" in SOFT_TOOLS

    def test_hard_tools_set(self):
        assert "talk" in HARD_TOOLS
        assert "move" in HARD_TOOLS
        assert "work" in HARD_TOOLS

    def test_all_tool_names(self):
        assert SOFT_TOOLS | HARD_TOOLS == ALL_TOOL_NAMES

    def test_is_soft_true(self):
        for name in SOFT_TOOLS:
            assert is_soft(name), f"{name} should be soft"

    def test_is_soft_false(self):
        for name in HARD_TOOLS:
            assert not is_soft(name), f"{name} should not be soft"

    def test_is_hard_true(self):
        for name in HARD_TOOLS:
            assert is_hard(name), f"{name} should be hard"

    def test_is_hard_false(self):
        for name in SOFT_TOOLS:
            assert not is_hard(name), f"{name} should not be hard"

    def test_unknown_tool_neither(self):
        assert not is_soft("nonexistent")
        assert not is_hard("nonexistent")


# ======================== TOOL_REGISTRY ========================

class TestToolRegistry:
    def test_all_registered(self):
        for name in ALL_TOOL_NAMES:
            assert name in TOOL_REGISTRY, f"{name} missing from registry"

    def test_registry_callables(self):
        import asyncio
        for name, fn in TOOL_REGISTRY.items():
            assert callable(fn), f"{name} is not callable"


# ======================== dispatch_tool ========================

class TestDispatchTool:
    @pytest.mark.asyncio
    async def test_unknown_tool(self, sample_agent, sample_world):
        result = await dispatch_tool("nonexistent", sample_agent, sample_world)
        assert result.ok is False
        assert "unknown tool" in result.error

    @pytest.mark.asyncio
    async def test_observe_agent(self, sample_agent, sample_world, event_bus):
        """Observe a real agent in the world."""
        # Ensure Bob exists
        bob = next((a for a in sample_world.agents if a.name == "Bob"), None)
        assert bob is not None
        result = await dispatch_tool("observe", sample_agent, sample_world,
                                     args={"target": "Bob"})
        assert result.ok is True
        assert result.kind == "observe_agent"
        assert result.data["seen"]["name"] == "Bob"

    @pytest.mark.asyncio
    async def test_observe_place(self, sample_agent, sample_world):
        result = await dispatch_tool("observe", sample_agent, sample_world,
                                     args={"target": "广场"})
        assert result.ok is True
        assert result.kind == "observe_place"
        assert result.data["seen"]["name"] == "广场"

    @pytest.mark.asyncio
    async def test_observe_empty_target(self, sample_agent, sample_world):
        result = await dispatch_tool("observe", sample_agent, sample_world,
                                     args={"target": ""})
        assert result.ok is False
        assert "target" in result.error

    @pytest.mark.asyncio
    async def test_observe_nonexistent(self, sample_agent, sample_world):
        result = await dispatch_tool("observe", sample_agent, sample_world,
                                     args={"target": "Nobody"})
        assert result.ok is False
        assert "找不到" in result.error

    @pytest.mark.asyncio
    async def test_recall_tool(self, sample_agent, sample_world):
        sample_agent.add_memory(
            Memory(tick=1, kind="observed", content="看到了一些事情")
        )
        result = await dispatch_tool("recall", sample_agent, sample_world,
                                     args={"query": "事情"})
        assert result.ok is True
        assert result.kind == "recall"

    @pytest.mark.asyncio
    async def test_introspect_tool(self, sample_agent, sample_world):
        result = await dispatch_tool("introspect", sample_agent, sample_world,
                                     args={})
        assert result.ok is True
        assert result.kind == "introspect"
        assert "snapshot" in result.data

    @pytest.mark.asyncio
    async def test_talk_tool_target_not_nearby(self, sample_agent, sample_world):
        """Talk to someone not in the same location should fail."""
        sample_agent.location = "医院"
        result = await dispatch_tool("talk", sample_agent, sample_world,
                                     args={"target": "Bob"})
        assert result.ok is False
        assert "不在你身边" in result.error

    @pytest.mark.asyncio
    async def test_move_tool(self, sample_agent, sample_world):
        sample_agent.location = "医院"
        result = await dispatch_tool("move", sample_agent, sample_world,
                                     args={"place": "广场"})
        assert result.ok is True
        assert result.kind == "move_intent"
        # Should set pending_action
        assert sample_agent.pending_action is not None
        assert sample_agent.pending_action.kind == "move"

    @pytest.mark.asyncio
    async def test_move_unknown_place(self, sample_agent, sample_world):
        result = await dispatch_tool("move", sample_agent, sample_world,
                                     args={"place": "月球"})
        assert result.ok is False
        assert "未知地点" in result.error

    @pytest.mark.asyncio
    async def test_work_tool(self, sample_agent, sample_world):
        result = await dispatch_tool("work", sample_agent, sample_world,
                                     args={"focus": "测试工作"})
        assert result.ok is True
        assert result.kind == "work_intent"
        assert sample_agent.pending_action is not None
        assert sample_agent.pending_action.kind == "work"

    @pytest.mark.asyncio
    async def test_dispatch_none_args(self, sample_agent, sample_world):
        """dispatch_tool with None args should not crash."""
        result = await dispatch_tool("introspect", sample_agent, sample_world,
                                     args=None)
        assert result.ok is True
