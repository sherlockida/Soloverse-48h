"""软工具（只读）：observe / recall / introspect / plan。

这些工具不消耗"硬动作"名额，仅产生 thought/observation。
每个 tool 是一个 async function(agent, world, **args) -> ToolResult。
"""
from __future__ import annotations

import json
import logging
import time as _time
from typing import Any, Optional

from app.engine.events import Event
from app.models.memory import Memory
from app.models.tools import ToolResult

logger = logging.getLogger("echoworld.tools")


# ---------- Tool 分类 ----------

SOFT_TOOLS = {"observe", "recall", "introspect", "plan"}


def is_soft(name: str) -> bool:
    """检查工具名是否为软工具。"""
    return name in SOFT_TOOLS


# ---------- payload 工具 ----------

_MAX_PAYLOAD_BYTES = 2048  # 2KB 上限


def _truncate_for_payload(obj: Any, max_bytes: int = _MAX_PAYLOAD_BYTES) -> Any:
    """把任意 obj 序列化后压到 max_bytes，超出则替换为 {'_truncated': True, 'preview': ...}。"""
    try:
        s = json.dumps(obj, ensure_ascii=False)
    except Exception:
        return {"_unserializable": str(type(obj).__name__)}
    if len(s.encode("utf-8")) <= max_bytes:
        return obj
    preview = s[: max(64, max_bytes - 64)]
    return {"_truncated": True, "preview": preview + "..."}


def _build_tool_payload(
    *,
    tool: str,
    args: dict,
    result: Any,
    latency_ms: int,
    brief: str,
    actor_emoji: str,
    parent_thought: str = "",
    extra: Optional[dict] = None,
) -> dict:
    """统一 tool_call SSE payload 结构，保留向后兼容字段（seen/snapshot/goal/steps）。"""
    payload: dict[str, Any] = {
        "tool": tool,
        "args": _truncate_for_payload(args or {}),
        "result": _truncate_for_payload(result),
        "result_brief": brief,
        "latency_ms": int(latency_ms),
        "actor_emoji": actor_emoji,
        "source": "local",
    }
    if parent_thought:
        payload["parent_thought"] = parent_thought[:40]
    if extra:
        for k, v in extra.items():
            payload.setdefault(k, v)
    return payload


# ---------- 软工具实现 ----------


def _result_to_payload_dict(r: ToolResult) -> dict:
    """Flatten a ToolResult into a plain dict matching the old SSE payload structure.

    Old: {"ok": True, "kind": "observe_agent", "seen": {...}}
    New ToolResult.data carries {"seen": {...}}; kind is on the envelope.
    We flatten so the payload 'result' field stays identical for the frontend.
    """
    out: dict[str, Any] = {"ok": r.ok, "kind": r.kind}
    if r.error:
        out["error"] = r.error
    out.update(r.data)
    return out


async def tool_observe(
    agent, world, target: str = "", parent_thought: str = "", **_kw
) -> ToolResult:
    """观察某人/某地。返回该 target 当前可见状态（位置、最后动作、相对关系）。"""
    t0 = _time.time()
    target = (target or "").strip()
    if not target:
        return ToolResult(ok=False, error="observe: target 不能为空")

    # 先按角色名匹配
    other = None
    for a in world.agents:
        if a.name == target:
            other = a
            break
    if other is not None:
        rel = agent.get_or_init_relation(other.name)
        seen = {
            "kind": "agent",
            "name": other.name,
            "location": other.location,
            "emoji": other.emoji,
            "role": other.role,
            "in_same_room": other.location == agent.location,
            "relation_summary": rel.summary(),
            "primed": bool(other.primed_memory),
        }
        agent.add_memory(
            Memory(
                tick=world.tick,
                kind="observed",
                content=f"仔细看了看 {other.name}，{('就在身边' if seen['in_same_room'] else f'在 {other.location}')}",
                participants=[other.name],
                importance=2,
            )
        )
        result = ToolResult(ok=True, kind="observe_agent", data={"seen": seen})
        latency_ms = int((_time.time() - t0) * 1000)
        brief = f"看到 {other.name} 在 {other.location}" + (
            "（同房间）" if seen["in_same_room"] else ""
        )
        await world.event_bus.publish(
            Event(
                tick=world.tick,
                kind="tool_call",
                actor=agent.name,
                target=other.name,
                text=f"🔍 {agent.emoji} {agent.name} 观察 {other.name}",
                payload=_build_tool_payload(
                    tool="observe",
                    args={"target": other.name},
                    result=_result_to_payload_dict(result),
                    latency_ms=latency_ms,
                    brief=brief,
                    actor_emoji=agent.emoji,
                    parent_thought=parent_thought,
                    extra={"seen": seen},
                ),
            )
        )
        return result

    # 按地点匹配
    if target in world.places:
        peers = [
            a.name
            for a in world.agents
            if a.location == target and a.name != agent.name
        ]
        seen = {
            "kind": "place",
            "name": target,
            "people_there": peers,
            "is_current": target == agent.location,
        }
        agent.add_memory(
            Memory(
                tick=world.tick,
                kind="observed",
                content=f"留意了 {target}，那里有 {('、'.join(peers) if peers else '没人')}",
                importance=1,
            )
        )
        result = ToolResult(ok=True, kind="observe_place", data={"seen": seen})
        latency_ms = int((_time.time() - t0) * 1000)
        brief = f"{target} 有 {len(peers)} 人：" + (
            "、".join(peers[:3]) if peers else "空"
        )
        await world.event_bus.publish(
            Event(
                tick=world.tick,
                kind="tool_call",
                actor=agent.name,
                target=target,
                text=f"🔍 {agent.emoji} {agent.name} 留意 {target}",
                payload=_build_tool_payload(
                    tool="observe",
                    args={"target": target},
                    result=_result_to_payload_dict(result),
                    latency_ms=latency_ms,
                    brief=brief,
                    actor_emoji=agent.emoji,
                    parent_thought=parent_thought,
                    extra={"seen": seen},
                ),
            )
        )
        return result

    return ToolResult(ok=False, error=f"observe: 找不到目标 {target}")


async def tool_recall(
    agent, world, query: str = "", k: int = 5, parent_thought: str = "", **_kw
) -> ToolResult:
    """主动召回与 query 相关的记忆。命中条目会塞回 agent.last_recalled 供后续 reasoning 用。"""
    from app.services.recall import build_recall_query, recall as mem_recall

    t0 = _time.time()
    query = (query or "").strip()
    if not query:
        nearby = [
            a.name
            for a in world.agents
            if a.location == agent.location and a.name != agent.name
        ]
        query = build_recall_query(
            location=agent.location,
            nearby_names=nearby,
            primed_memory=agent.primed_memory,
            plan_goal=(agent.short_term_plan.goal if agent.short_term_plan else ""),
        )
    try:
        k = max(1, min(10, int(k)))
    except Exception:
        k = 5
    hits = mem_recall(
        agent.memories,
        query,
        k=k,
        cur_tick=world.tick,
        semantic=agent.semantic,
    )
    hit_texts = [m.short() for m in hits]
    agent.last_recalled = hit_texts

    result = ToolResult(ok=True, kind="recall", data={"query": query, "hits": hit_texts})
    latency_ms = int((_time.time() - t0) * 1000)
    if hit_texts:
        preview = "；".join(t[:18] for t in hit_texts[:2])
        brief = f"{len(hit_texts)} 条命中：{preview}"
    else:
        brief = f"0 命中（query={query[:14]}）"

    await world.event_bus.publish(
        Event(
            tick=world.tick,
            kind="memory_recall",
            actor=agent.name,
            text=f"💭 {agent.emoji} {agent.name} 回想：{query[:24]} -> {len(hit_texts)} 条",
            payload=_build_tool_payload(
                tool="recall",
                args={"query": query, "k": k},
                result=_result_to_payload_dict(result),
                latency_ms=latency_ms,
                brief=brief,
                actor_emoji=agent.emoji,
                parent_thought=parent_thought,
                extra={"query": query, "k": k, "hits": hit_texts},
            ),
        )
    )
    return result


