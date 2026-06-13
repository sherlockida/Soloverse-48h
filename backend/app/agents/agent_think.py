"""AgentThinkMixin — perception, recall, plan patch, fallback thought.

本模块包含：
- _perceive(world)          收集情境 slot（nearby, just_happened, world_shocks）
- _build_recall_for_reason  构造 recall query 并执行
- _apply_plan_patch        处理 LLM 返回的 plan_patch
- _fallback_thought         LLM 无输出时的程序化兜底

思考支持函数集中在此模块。决策函数在 agent_decide.py。
"""
from __future__ import annotations

import logging
from typing import Any

from app.agents.agent_model import (
    AgentBase, PlanStep, ShortTermPlan,
)
from app.engine.events import Event
from app.models.memory import Memory
from app.services import build_recall_query, recall as mem_recall

logger = logging.getLogger("echoworld.agent")


class AgentThinkMixin(AgentBase):
    """思考支持 Mixin — perception、recall、plan patch、fallback。

    继承 AgentBase 以获取字段和基础方法。
    AgentDecideMixin 继承此类以访问感知和兜底方法。
    在 __init__.py 中与 AgentDecideMixin + AgentReflectMixin + AgentBase
    组合成最终 Agent 类。
    """

    # ============================================================
    # Perception
    # ============================================================

    def _perceive(self, world: Any) -> dict:
        """收集情境 slot（v5.3：回看 30 + world_shocks 抽取）。"""
        import os as _os
        day, time_str = world.clock()
        nearby = []
        for a in world.agents:
            if a.name == self.name or a.location != self.location:
                continue
            # v5.3：非 alive 的角色不再出现在 nearby
            if not a.is_alive():
                continue
            rel = self.get_or_init_relation(a.name)
            nearby.append((a.name, rel.summary()))

        # 回看窗口 30，但 just_happened 只取近邻可见
        history_window = world.event_bus._history[-30:]
        recent_evs = []
        for ev in history_window[-6:]:
            if ev.kind in ("move", "talk", "seed") and (
                ev.actor in (self.name,) or ev.target in (self.name,)
                or self.name in (ev.payload.get("affected") or [])
                or (ev.kind == "talk" and ev.payload.get("location") == self.location)
            ):
                recent_evs.append(ev.text)
        just_happened = "；".join(recent_evs[-2:]) if recent_evs else None

        # ---- v5.3 world_shocks ----
        try:
            shock_window = int(_os.getenv("WORLD_SHOCK_WINDOW_TICKS", "5"))
        except Exception:
            shock_window = 5
        world_shocks: list[dict] = []
        for ev in history_window:
            if ev.kind not in ("seed", "world_state_change", "narrative"):
                continue
            dist = world.tick - ev.tick
            if dist < 0 or dist > shock_window:
                continue
            payload = ev.payload or {}
            affected_list = payload.get("affected") or []
            affects_me = (self.name in affected_list) or (
                bool(self.name) and self.name in (ev.text or "")
            )
            world_shocks.append({
                "text": ev.text or payload.get("desc", ""),
                "tick": ev.tick,
                "dist": dist,
                "affects_me": bool(affects_me),
                "kind": ev.kind,
            })
        world_shocks.sort(key=lambda s: (not s["affects_me"], s["dist"]))
        world_shocks = world_shocks[:5]

        return {
            "day": day,
            "time": time_str,
            "location": self.location,
            "nearby": nearby,
            "places": world.places,
            "just_heard": self.primed_memory,
            "just_happened": just_happened,
            "world_shocks": world_shocks,
        }

    # ============================================================
    # Recall helper
    # ============================================================

    def _build_recall_for_reason(self, perception: dict, k: int = 5) -> list[str]:
        nearby_names = [n for n, _ in perception["nearby"]]
        q = build_recall_query(
            location=perception["location"],
            nearby_names=nearby_names,
            primed_memory=perception["just_heard"],
            plan_goal=self.short_term_plan.goal if self.short_term_plan else "",
            recent_event_text=perception.get("just_happened") or "",
        )
        try:
            hits = mem_recall(self.memories, q, k=k,
                              cur_tick=perception["day"] * 1000,
                              semantic=self.semantic)
        except Exception as e:
            logger.debug(f"[{self.name}] recall fail: {e}")
            return []
        return [m.short() for m in hits]

    # ============================================================
    # Plan patch
    # ============================================================

    async def _apply_plan_patch(self, world: Any, patch: dict) -> None:
        """处理 reason / reflect 返回的 plan_patch。"""
        if not isinstance(patch, dict) or not patch:
            return
        if self.short_term_plan is None:
            self.short_term_plan = ShortTermPlan(
                goal=patch.get("replace_goal", "") or "",
                updated_tick=world.tick, confidence=5,
            )
        plan = self.short_term_plan
        changed = False

        if isinstance(patch.get("replace_goal"), str) and patch["replace_goal"].strip():
            plan.goal = patch["replace_goal"].strip()[:60]
            changed = True

        # mark_done 必须先做（add_steps 后索引会乱）
        mark_done = patch.get("mark_done") or []
        if isinstance(mark_done, list):
            for idx in mark_done:
                try:
                    i = int(idx)
                    if 0 <= i < len(plan.steps):
                        if plan.steps[i].status != "done":
                            plan.steps[i].status = "done"
                            changed = True
                except Exception:
                    continue

        add_steps = patch.get("add_steps") or []
        if isinstance(add_steps, list):
            for st in add_steps[:5]:
                if not isinstance(st, dict):
                    continue
                intent = str(st.get("intent", "")).strip()
                if not intent:
                    continue
                plan.steps.append(PlanStep(
                    intent=intent[:30],
                    tool=str(st.get("tool", "")),
                    status="pending",
                    born_tick=world.tick,
                ))
                changed = True
        # 限制长度
        if len(plan.steps) > 8:
            keep = [s for s in plan.steps if s.status in ("pending", "doing")][-5:]
            plan.steps = keep
            changed = True

        if changed:
            plan.updated_tick = world.tick
            await world.event_bus.publish(Event(
                tick=world.tick, kind="plan_update", actor=self.name,
                text=f"📋 {self.emoji} {self.name} 调整 plan："
                     f"{plan.goal or '（无 goal）'}"
                     f"（{len([s for s in plan.steps if s.status!='done'])} 步未完）",
                payload={
                    "actor_emoji": self.emoji,
                    "goal": plan.goal,
                    "steps": [{"intent": s.intent, "status": s.status}
                              for s in plan.steps],
                    "confidence": plan.confidence,
                },
            ))

    # ============================================================
    # Fallback thought
    # ============================================================

    def _fallback_thought(self, perception: dict,
                         hits: list[Memory]) -> str:
        """LLM 完全没出 thought 时的程序化兜底独白。

        v5.3：world_shocks 处理——
        affects_me -> "听说…，我得想想"
        其他 shock -> "刚刚…，总觉得不对劲"
        """
        shocks = perception.get("world_shocks") or []
        mine = [s for s in shocks if s.get("affects_me")]
        if mine:
            snip = str(mine[0].get("text", ""))[:30]
            return f"听说{snip}…我得想想这意味着什么"[:80]
        if shocks:
            snip = str(shocks[0].get("text", ""))[:30]
            return f"刚刚{snip}…总觉得不对劲"[:80]

        # v5.4（F6）：引入 threads（心事）+ traces，让 fallback 有角色感而非填表
        nearby = [n for n, _ in perception["nearby"]]
        top_thread = sorted(self.threads, key=lambda t: -t.weight)[0] if self.threads else None
        bits = []
        if top_thread:
            desc = (getattr(top_thread, "desc", "") or "")[:16]
            tgt = getattr(top_thread, "target", None) or ""
            if tgt and tgt in nearby:
                bits.append(f"看着{tgt}，心里想着{desc}的事")
            elif tgt:
                bits.append(f"不知道{tgt}现在怎么样了")
            else:
                bits.append(f"脑海里挥不去：{desc}")
        if not bits and getattr(self, "recent_reasoning_traces", None):
            last = self.recent_reasoning_traces[-1].split(":", 1)[-1].strip()[:18]
            if last:
                bits.append(f"（接着刚才的想法：{last}…）")
        if perception.get("just_heard"):
            bits.append(f"「{str(perception['just_heard'])[:16]}」这话还在耳边")
        if not top_thread and nearby:
            bits.append(f"身边有{nearby[0]}，要不要搭句话")
        if self.short_term_plan and self.short_term_plan.goal:
            goal = self.short_term_plan.goal[:16]
            bits.append(f"还有{goal}没搞定" if bits else f"接下来得{goal}")
        if hits:
            bits.append(f"突然想起{hits[0].content[:14]}")
        if not bits:
            bits.append(f"在{self.location}歇了会儿")
        seen = set()
        unique = [b for b in bits if not (b in seen or seen.add(b))]
        return "；".join(unique[:3])[:80] or "（百无聊赖地发呆）"
