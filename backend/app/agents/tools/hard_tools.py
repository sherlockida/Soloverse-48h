"""硬工具（状态变更）：talk / move / work。

这些工具设置 agent.pending_action；世界 apply 阶段统一执行；最多 1 个。
每个 tool 是一个 async function(agent, world, **args) -> ToolResult。
同时包含 TOOL_REGISTRY 和 dispatch_tool 统一派发逻辑。
"""
from __future__ import annotations

import logging
import time as _time
from typing import Any, Callable, Optional

from app.agents import Action
from app.agents.tools.soft_tools import (
    SOFT_TOOLS,
    _build_tool_payload,
    _result_to_payload_dict,
    tool_observe,
    tool_recall,
)
from app.agents.tools.soft_tools_extra import (
    tool_introspect,
    tool_plan,
)
from app.engine.events import Event
from app.models.tools import ToolResult

logger = logging.getLogger("echoworld.tools")


# ---------- Tool 分类 ----------

HARD_TOOLS = {"talk", "move", "work"}


def is_hard(name: str) -> bool:
    """检查工具名是否为硬工具。"""
    return name in HARD_TOOLS


# ---------- 硬工具实现 ----------


async def tool_talk(
    agent,
    world,
    target: str = "",
    intent: str = "",
    draft: str = "",
    parent_thought: str = "",
    **_kw,
) -> ToolResult:
    """记录 talk 意图。真正的对话由 world 的 pair-up 阶段统一处理。

    talk 是硬工具：不在这里 publish tool_call 事件（避免与后续的 talk SSE 重复）。
    但仍记录 latency 与 brief 写入返回结果，agent 主循环可以接续记录到 thought 卡片。
    """
    t0 = _time.time()
    target = (target or "").strip()
    intent = (intent or "").strip() or "试探"
    if not target:
        return ToolResult(ok=False, error="talk: target 不能为空")
    target_agent = next((a for a in world.agents if a.name == target), None)
    if target_agent is None:
        return ToolResult(ok=False, error=f"talk: 没找到 {target}")
    if target_agent.location != agent.location:
        return ToolResult(ok=False, error=f"talk: {target} 不在你身边")
    agent.pending_action = Action(kind="talk", target=target, reason=draft or intent)
    agent.pending_talk_intent = intent
    agent.pending_talk_draft = draft or ""
    latency_ms = int((_time.time() - t0) * 1000)
    brief = f"will talk to {target} (intent={intent})"
    result = ToolResult(
        ok=True, kind="talk_intent",
        data={"target": target, "intent": intent},
    )

    await world.event_bus.publish(
        Event(
            tick=world.tick,
            kind="tool_call",
            actor=agent.name,
            target=target,
            text=f"🎯 {agent.emoji} {agent.name} 决定说话：{target}（{intent}）",
            payload=_build_tool_payload(
                tool="talk",
                args={"target": target, "intent": intent, "draft": draft},
                result=_result_to_payload_dict(result),
                latency_ms=latency_ms,
                brief=brief,
                actor_emoji=agent.emoji,
                parent_thought=parent_thought,
                extra={"hard": True, "intent": intent, "draft_preview": (draft or "")[:30]},
            ),
        )
    )
    return result


async def tool_move(
    agent, world, place: str = "", parent_thought: str = "", **_kw
) -> ToolResult:
    """记录 move 意图。world 的 apply 阶段会调 _apply_action 实际移动并发 move 事件。"""
    t0 = _time.time()
    place = (place or "").strip()
    if not place:
        return ToolResult(ok=False, error="move: place 不能为空")
    if place not in world.places:
        return ToolResult(ok=False, error=f"move: 未知地点 {place}")
    if place == agent.location:
        return ToolResult(ok=False, error=f"move: 已在 {place}")
    agent.pending_action = Action(
        kind="move",
        target=place,
        reason="（plan 驱动）" if agent.short_term_plan else "",
    )
    latency_ms = int((_time.time() - t0) * 1000)
    brief = f"will move {agent.location} -> {place}"
    result = ToolResult(ok=True, kind="move_intent", data={"place": place})

    await world.event_bus.publish(
        Event(
            tick=world.tick,
            kind="tool_call",
            actor=agent.name,
            target=place,
            text=f"🚶 {agent.emoji} {agent.name} 决定去：{place}",
            payload=_build_tool_payload(
                tool="move",
                args={"place": place},
                result=_result_to_payload_dict(result),
                latency_ms=latency_ms,
                brief=brief,
                actor_emoji=agent.emoji,
                parent_thought=parent_thought,
                extra={"hard": True, "from": agent.location, "to": place},
            ),
        )
    )
    return result


async def tool_work(
    agent, world, focus: str = "", parent_thought: str = "", **_kw
) -> ToolResult:
    """记录 work 意图。world 的 apply 阶段会发 thought 事件。"""
    t0 = _time.time()
    agent.pending_action = Action(kind="work", target=agent.location, reason=focus or "")
    latency_ms = int((_time.time() - t0) * 1000)
    brief = f"will work on: {focus[:18] or '手头活'}"
    result = ToolResult(ok=True, kind="work_intent", data={"focus": focus})

    await world.event_bus.publish(
        Event(
            tick=world.tick,
            kind="tool_call",
            actor=agent.name,
            text=f"🔧 {agent.emoji} {agent.name} 决定干活：{focus[:14] or '手头事'}",
            payload=_build_tool_payload(
                tool="work",
                args={"focus": focus},
                result=_result_to_payload_dict(result),
                latency_ms=latency_ms,
                brief=brief,
                actor_emoji=agent.emoji,
                parent_thought=parent_thought,
                extra={"hard": True, "focus": focus},
            ),
        )
    )
    return result


# ---------- Registry ----------

ToolFn = Callable[..., Any]

ALL_TOOL_NAMES = SOFT_TOOLS | HARD_TOOLS

TOOL_REGISTRY: dict[str, ToolFn] = {
    "observe": tool_observe,
    "recall": tool_recall,
    "introspect": tool_introspect,
    "plan": tool_plan,
    "talk": tool_talk,
    "move": tool_move,
    "work": tool_work,
}


async def dispatch_tool(
    name: str,
    agent,
    world,
    args: Optional[dict] = None,
    *,
    parent_thought: str = "",
) -> ToolResult:
    """统一派发。未知工具 / 异常都返回 ok=False。

    parent_thought 是 agent.think_and_act 在本 tick 已发出的 thought 头 40 字，
    用于让前端把 tool 卡片视觉嵌套到 thought 卡片下方。
    """
    fn = TOOL_REGISTRY.get(name)
    if fn is None:
        return ToolResult(ok=False, error=f"unknown tool: {name}")
    args = args if isinstance(args, dict) else {}
    try:
        return await fn(agent, world, parent_thought=parent_thought, **args)
    except TypeError as e:
        logger.debug(f"tool {name} TypeError, falling back: {e}")
        try:
            return await fn(agent, world, parent_thought=parent_thought)
        except Exception as ee:
            return ToolResult(
                ok=False,
                error=f"{name} fail: {type(ee).__name__}: {str(ee)[:120]}",
            )
    except Exception as e:
        return ToolResult(
            ok=False,
            error=f"{name} fail: {type(e).__name__}: {str(e)[:120]}",
        )
