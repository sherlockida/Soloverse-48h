"""Tests for agent.py — Action, TalkResult, Agent model operations, ShortTermPlan.

All imports come from the origin/backend directory (set up in conftest.py).
"""
from __future__ import annotations

import pytest

from backend.agent import (
    Action, Agent, TalkResult, ShortTermPlan, PlanStep, ThinkResult,
)
from backend.memory import Memory, Relation, Thread


# ======================== Action ========================

class TestAction:
    def test_default_is_rest(self):
        a = Action()
        assert a.kind == "rest"
        assert a.target == ""
        assert a.reason == ""

    def test_rest_factory(self):
        a = Action.rest("累了")
        assert a.kind == "rest"
        assert a.reason == "累了"

    def test_kind_validation_normalizes(self):
        a = Action(kind="MOVE")  # uppercase
        assert a.kind == "move"

    def test_kind_validation_unknown_becomes_rest(self):
        a = Action(kind="fly")
        assert a.kind == "rest"

    def test_explicit_fields(self):
        a = Action(kind="talk", target="Bob", reason="想聊天")
        assert a.kind == "talk"
        assert a.target == "Bob"
        assert a.reason == "想聊天"

    def test_model_dump_roundtrip(self):
        a = Action(kind="move", target="广场")
        data = a.model_dump()
        a2 = Action.model_validate(data)
        assert a2.kind == "move"
        assert a2.target == "广场"


# ======================== TalkResult ========================

class TestTalkResult:
    def test_defaults(self):
        tr = TalkResult()
        assert tr.utterance == "……"
        assert tr.inner_thought == ""
        assert tr.intent == "敷衍"
        assert tr.relation_delta == {}

    def test_explicit_fields(self):
        tr = TalkResult(
            utterance="你好啊", inner_thought="（不太想说话）",
            intent="示好", relation_delta={"trust": 1, "fondness": 2},
        )
        assert tr.utterance == "你好啊"
        assert tr.intent == "示好"
        assert tr.relation_delta["trust"] == 1

    def test_model_dump_roundtrip(self):
        tr = TalkResult(utterance="test")
        data = tr.model_dump()
        tr2 = TalkResult.model_validate(data)
        assert tr2.utterance == "test"


# ======================== PlanStep / ShortTermPlan ========================

class TestPlanStep:
    def test_defaults(self):
        ps = PlanStep(intent="做事情")
        assert ps.intent == "做事情"
        assert ps.tool == ""
        assert ps.status == "pending"
        assert ps.born_tick == 0

    def test_with_tool_and_args(self):
        ps = PlanStep(intent="观察", tool="observe", args={"target": "Bob"})
        assert ps.tool == "observe"
        assert ps.args["target"] == "Bob"


class TestShortTermPlan:
    def test_defaults(self):
        plan = ShortTermPlan()
        assert plan.goal == ""
        assert plan.steps == []
        assert plan.confidence == 5

    def test_with_steps(self):
        plan = ShortTermPlan(
            goal="找到真相",
            steps=[
                PlanStep(intent="去广场", status="done"),
                PlanStep(intent="问Bob", status="pending"),
            ],
            confidence=7,
        )
        assert plan.goal == "找到真相"
        assert len(plan.steps) == 2
        assert plan.steps[0].status == "done"


# ======================== ThinkResult ========================

class TestThinkResult:
    def test_defaults(self):
        tr = ThinkResult()
        assert tr.thought == ""
        assert tr.tool_calls == []
        assert tr.chosen_action is None
        assert tr.elapsed_ms == 0
        assert tr.fallback_used is False

    def test_with_data(self):
        action = Action(kind="move", target="广场")
        tr = ThinkResult(
            thought="我想去广场看看",
            tool_calls=[{"name": "move", "args": {"place": "广场"}}],
            chosen_action=action,
            elapsed_ms=150,
            fallback_used=False,
        )
        assert tr.chosen_action.kind == "move"
        assert tr.elapsed_ms == 150


# ======================== Agent model ========================

class TestAgentModel:
    def test_basic_construction(self, sample_agent):
        assert sample_agent.name == "TestAgent"
        assert sample_agent.emoji == "🧪"
        assert sample_agent.location == "广场"
        assert sample_agent.memories == []
        assert sample_agent.relations == {}
        assert sample_agent.status == "alive"

    def test_get_or_init_relation(self, sample_agent):
        rel = sample_agent.get_or_init_relation("Alice")
        assert isinstance(rel, Relation)
        assert rel.trust == 0
        # Calling again should return the same relation
        rel2 = sample_agent.get_or_init_relation("Alice")
        assert rel is rel2

    def test_add_memory(self, sample_agent):
        m = Memory(tick=1, kind="observed", content="test")
        sample_agent.add_memory(m)
        assert len(sample_agent.memories) == 1
        assert sample_agent.memories[0].content == "test"

    def test_add_memory_caps_at_40(self, sample_agent):
        for i in range(50):
            sample_agent.add_memory(Memory(tick=i, kind="observed", content=f"m{i}"))
        assert len(sample_agent.memories) == 40

    def test_recent_memories(self, sample_agent):
        for i in range(10):
            sample_agent.add_memory(Memory(tick=i, kind="observed", content=f"m{i}"))
        recent = sample_agent.recent_memories(3)
        assert len(recent) == 3
        assert recent[-1].tick == 9

    def test_consume_primed(self, sample_agent):
        sample_agent.primed_memory = "听说了一些事"
        primed = sample_agent.consume_primed()
        assert primed == "听说了一些事"
        assert sample_agent.primed_memory is None

    def test_consume_primed_none(self, sample_agent):
        assert sample_agent.primed_memory is None
        result = sample_agent.consume_primed()
        assert result is None

    def test_pick_secret_agenda_with_target(self, sample_agent):
        sample_agent.threads = [
            Thread(desc="想知道真相", target="Alice", weight=9),
            Thread(desc="另一件事", target="Bob", weight=5),
        ]
        agenda = sample_agent.pick_secret_agenda("Alice")
        assert "真相" in agenda

    def test_pick_secret_agenda_fallback(self, sample_agent):
        sample_agent.threads = [
            Thread(desc="心事", target=None, weight=7),
        ]
        agenda = sample_agent.pick_secret_agenda("Nobody")
        assert "心事" in agenda

    def test_is_alive(self, sample_agent):
        assert sample_agent.is_alive()

    def test_is_dead(self, sample_agent):
        sample_agent.status = "dead"
        assert not sample_agent.is_alive()

    def test_is_missing(self, sample_agent):
        sample_agent.status = "missing"
        assert not sample_agent.is_alive()

    def test_status_transitions(self, sample_agent):
        sample_agent.status = "unconscious"
        assert sample_agent.status == "unconscious"
        assert not sample_agent.is_alive()

    def test_plan_dict_empty(self, sample_agent):
        pd = sample_agent._plan_dict()
        assert pd["goal"] == ""
        assert pd["steps"] == []

    def test_plan_dict_with_plan(self, sample_agent):
        sample_agent.short_term_plan = ShortTermPlan(
            goal="test goal",
            steps=[PlanStep(intent="step1", status="done")],
        )
        pd = sample_agent._plan_dict()
        assert pd["goal"] == "test goal"
        assert len(pd["steps"]) == 1

    def test_relations_dicts(self, sample_agent):
        sample_agent.relations["Bob"] = Relation(trust=5, fondness=3)
        sample_agent.relations["Alice"] = Relation(trust=-2)
        rdicts = sample_agent._relations_dicts()
        # Self should be excluded
        names = [r["name"] for r in rdicts]
        assert sample_agent.name not in names
        assert "Bob" in names

    def test_semantic_lines(self, sample_agent):
        sample_agent.semantic = [
            Memory(tick=1, kind="belief", content="Alice 可信"),
            Memory(tick=2, kind="summary", content="最近平静"),
        ]
        lines = sample_agent._semantic_lines()
        assert len(lines) == 2

    def test_model_dump_roundtrip(self, sample_agent):
        data = sample_agent.model_dump()
        a2 = Agent.model_validate(data)
        assert a2.name == sample_agent.name
        assert a2.location == sample_agent.location
        assert a2.status == sample_agent.status
