"""涌现质量修复单元测试（F1-F6）。

随修复进度追加各 F 的测试。
"""
from __future__ import annotations

import inspect


# ============================================================
# F1: reason 超时解耦
# ============================================================

def test_think_and_act_default_timeout_is_20():
    """F1: think_and_act 默认超时应为 20s（解耦 tick_interval，旧值 8.0 太短）。

    诊断时 tick_interval=3 → think_timeout=max(9, 3*0.8)=9s，DeepSeek reason 5-10s 超时。
    """
    from app.agents.agent_decide import AgentDecideMixin
    sig = inspect.signature(AgentDecideMixin.think_and_act)
    default = sig.parameters["timeout_seconds"].default
    assert default == 20.0, f"think_and_act 默认 timeout 应为 20.0，实际 {default}"


# ============================================================
# F2: mock「对方」占位符修复
# ============================================================

def test_mock_extract_slots_other_from_talk_prompt():
    """F2: _extract_slots 应从「你和X的关系」提取对方名，不返回字面「对方」。

    根因：旧正则「与对方\\s*(\\w)」匹配不到实际 prompt「你和 沈晚 的关系」，
    兜底硬编码 other or "对方" → 「对方」泄漏进对话。
    """
    from app.services.mock_backend import _MockBackendBase
    mb = _MockBackendBase.__new__(_MockBackendBase)
    system = "你是 江屿。\n你和 沈晚 的关系：trust=3, fondness=7"
    user = ""
    slots = mb._extract_slots(system, user)
    assert slots.get("other") == "沈晚", f"应提取'沈晚'，实际'{slots.get('other')}'"


# ============================================================
# F4: thread 驱动强化
# ============================================================

def test_fmt_threads_weight_stratified():
    """F4: _fmt_threads 高权重(w>=7)🔥必须推进，中(4-6)▶建议，低(<4)·可选。"""
    from app.services.prompts_reason import _fmt_threads
    from app.models.memory import Thread
    threads = [
        Thread(desc="怀疑沈晚", target="沈晚", weight=9),
        Thread(desc="欠债", target="Carol", weight=5),
        Thread(desc="小事", target=None, weight=2),
    ]
    out = _fmt_threads(threads)
    assert "🔥" in out, f"w9 应有🔥，实际：{out}"
    assert "▶" in out, f"w5 应有▶，实际：{out}"
    assert "·" in out, f"w2 应有·，实际：{out}"


# ============================================================
# F6: fallback 质量（thread 驱动）
# ============================================================

def test_fallback_thought_thread_driven():
    """F6: _fallback_thought 应读 threads，有 target 在 nearby 时输出含 target 名。"""
    from app.agents import Agent
    from app.models.memory import Thread
    a = Agent(name="Test", emoji="🧪", persona="测试", voice="简短", goals=[],
              location="沙滩",
              threads=[Thread(desc="怀疑她在演", target="沈晚", weight=9)])
    perception = {"nearby": [("沈晚", "中性")], "just_heard": None, "world_shocks": []}
    out = a._fallback_thought(perception, [])
    assert "沈晚" in out, f"fallback 应含心事 target '沈晚'，实际：{out}"
