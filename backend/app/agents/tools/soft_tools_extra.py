"""软工具扩展：introspect / plan。

从 soft_tools 拆出，避免单文件超过 300 行。
"""
from __future__ import annotations

import time as _time
from typing import Any, Optional

from app.engine.events import Event

from app.agents.tools.soft_tools import (
    _MAX_PAYLOAD_BYTES,
    _build_tool_payload,
    _truncate_for_payload,
)


async def tool_introspect(
    agent, world, parent_thought: str = "", **_kw
) -> dict:
    """内省 -- 把 agent 的核心状态打成 dict 返回给 LLM 自查。不产生持久副作用。"""
    t0 = _time.time()
    rels = []
    for n, r in (agent.relations or {}).items():
        if n == agent.name:
            continue
        rels.append(
            {
                "name": n,
                "trust": r.trust,
                "fondness": r.fondness,
                "jealousy": r.jealousy,
                "guilt": r.guilt,
                "intensity": r.intensity(),
            }
        )
    rels.sort(key=lambda x: -x["intensity"])
    snapshot = {
        "persona": agent.persona,
        "voice": agent.voice,
        "location": agent.location,
        "top_relations": rels[:3],
        "threads": [t.short() for t in (agent.threads or [])[:3]],
        "plan_goal": agent.short_term_plan.goal if agent.short_term_plan else "",
        "plan_steps": [
            {"intent": s.intent, "status": s.status}
            for s in (
                agent.short_term_plan.steps if agent.short_term_plan else []
            )
        ],
        "primed": agent.primed_memory or "",
    }
    result = {"ok": True, "kind": "introspect", "snapshot": snapshot}
    latency_ms = int((_time.time() - t0) * 1000)
    top_rel = rels[0] if rels else None
    if top_rel:
        brief = f"top_rel: {top_rel['name']}(intensity={top_rel['intensity']})"
    else:
        brief = f"无显著关系；plan={snapshot['plan_goal'][:16] or '空'}"

    await world.event_bus.publish(
        Event(
            tick=world.tick,
            kind="tool_call",
            actor=agent.name,
            text=f"🪞 {agent.emoji} {agent.name} 整理思绪",
            payload=_build_tool_payload(
                tool="introspect",
                args={},
                result=result,
                latency_ms=latency_ms,
                brief=brief,
                actor_emoji=agent.emoji,
                parent_thought=parent_thought,
                extra={"snapshot": snapshot},
            ),
        )
    )
    return result


async def tool_plan(
    agent,
    world,
    goal: str = "",
    steps: Optional[list] = None,
    confidence: Optional[int] = None,
    parent_thought: str = "",
    **_kw,
) -> dict:
    """覆盖/合并短期 plan。steps 是 list[str] 或 list[{intent, status?}]。"""
    from app.agents import ShortTermPlan, PlanStep

    t0 = _time.time()

    if agent.short_term_plan is None:
        agent.short_term_plan = ShortTermPlan(
            goal=goal or "", updated_tick=world.tick, confidence=5,
        )
    plan = agent.short_term_plan
    if goal:
        plan.goal = goal[:60]
    if steps is not None:
        new_steps: list[PlanStep] = []
        for s in steps[:5]:
            if isinstance(s, str):
                new_steps.append(PlanStep(intent=s[:30], born_tick=world.tick))
            elif isinstance(s, dict):
                new_steps.append(
                    PlanStep(
                        intent=str(s.get("intent", ""))[:30],
                        tool=str(s.get("tool", "")),
                        args=s.get("args") if isinstance(s.get("args"), dict) else {},
                        status=(
                            s.get("status")
                            if s.get("status") in ("pending", "doing", "done", "abandoned")
                            else "pending"
                        ),
                        born_tick=world.tick,
                    )
                )
        plan.steps = new_steps
    if confidence is not None:
        try:
            plan.confidence = max(0, min(10, int(confidence)))
        except Exception:
            pass
    plan.updated_tick = world.tick

    result = {
        "ok": True,
        "kind": "plan",
        "goal": plan.goal,
        "step_count": len(plan.steps),
        "confidence": plan.confidence,
    }
    latency_ms = int((_time.time() - t0) * 1000)
    brief = f"goal: {plan.goal[:18] or '空'} / {len(plan.steps)} 步"

    await world.event_bus.publish(
        Event(
            tick=world.tick,
            kind="plan_update",
            actor=agent.name,
            text=f"📋 {agent.emoji} {agent.name} 的 plan：{plan.goal or '（无 goal）'}（{len(plan.steps)} 步）",
            payload=_build_tool_payload(
                tool="plan",
                args={
                    "goal": goal,
                    "steps": steps if steps is not None else [],
                    "confidence": confidence,
                },
                result=result,
                latency_ms=latency_ms,
                brief=brief,
                actor_emoji=agent.emoji,
                parent_thought=parent_thought,
                extra={
                    "goal": plan.goal,
                    "steps": [
                        {"intent": s.intent, "status": s.status} for s in plan.steps
                    ],
                    "confidence": plan.confidence,
                },
            ),
        )
    )
    return result
