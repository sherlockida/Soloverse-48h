"""AgentDecideMixin — LLM reasoning, tool dispatch, v4 compat.
感知和兜底在 agent_think.py。
"""
from __future__ import annotations

import asyncio
import logging
import random
import time as _t
from typing import Any, Optional

from app.agents.agent_model import Action, ThinkResult, TalkResult
from app.agents.agent_think import AgentThinkMixin
from app.engine.events import Event

logger = logging.getLogger("echoworld.agent")


class AgentDecideMixin(AgentThinkMixin):
    """决策 Mixin — LLM 交互、工具派发、v4 兼容。继承 AgentThinkMixin。"""

    async def think_and_act(self, world: Any, *,
                            timeout_seconds: float = 8.0) -> ThinkResult:
        """v5 主循环：perceive -> recall -> reason(LLM) -> dispatch tools。"""
        from app.agents.tools import dispatch_tool, is_hard, is_soft
        t0 = _t.time()
        self.pending_action = None
        self.pending_talk_intent = ""
        self.pending_talk_draft = ""

        try:
            return await asyncio.wait_for(
                self._think_and_act_inner(world), timeout=timeout_seconds,
            )
        except asyncio.TimeoutError:
            elapsed = int((_t.time() - t0) * 1000)
            try:
                perception = self._perceive(world)
                self.primed_memory = None
                thought_text = self._fallback_thought(perception, [])
            except Exception:
                thought_text = "（一时没接上劲，先缓一缓）"
                perception = {"nearby": []}

            nearby = perception.get("nearby") or []
            has_urgent = bool(self.threads
                              or perception.get("just_heard")
                              or perception.get("world_shocks"))
            if nearby and (has_urgent or random.random() < 0.35):
                tgt = nearby[0][0] if isinstance(nearby[0], tuple) else str(nearby[0])
                self.pending_action = Action(
                    kind="talk", target=tgt,
                    reason=thought_text[:18] or "想找人说说话",
                )
                self.pending_talk_intent = "试探" if has_urgent else "闲聊"
                self.pending_talk_draft = thought_text[:60]
                logger.info(f"[{self.name}] fallback -> talk to {tgt}")
            else:
                self.pending_action = Action.rest(
                    thought_text[:18] or "（按兵不动）")

            await world.event_bus.publish(Event(
                tick=world.tick, kind="thought", actor=self.name,
                text=f"💭 {self.emoji} {self.name}：{thought_text[:80]}",
                payload={"actor_emoji": self.emoji, "fallback": True,
                         "thought": thought_text, "fallback_reason": "think_timeout"},
            ))
            return ThinkResult(thought=thought_text,
                               chosen_action=self.pending_action,
                               elapsed_ms=elapsed, fallback_used=True)
        except Exception as e:
            elapsed = int((_t.time() - t0) * 1000)
            logger.exception(f"[{self.name}] think_and_act 异常: {e}")
            self.pending_action = Action.rest("（系统颠簸）")
            return ThinkResult(thought=f"（出错：{type(e).__name__}）",
                               chosen_action=self.pending_action,
                               elapsed_ms=elapsed, fallback_used=True)

    async def _think_and_act_inner(self, world: Any) -> ThinkResult:
        """think_and_act 核心逻辑（无超时包装，由 think_and_act 调用）。"""
        from app.agents.tools import dispatch_tool, is_hard, is_soft
        from app.services.prompts import build_reason_prompt
        from app.services import build_recall_query, recall as mem_recall
        t0 = _t.time()

        # 0) perceive
        perception = self._perceive(world)
        self.primed_memory = None

        # 1) memory recall
        nearby_names = [n for n, _ in perception["nearby"]]
        q = build_recall_query(
            location=perception["location"], nearby_names=nearby_names,
            primed_memory=perception["just_heard"],
            plan_goal=self.short_term_plan.goal if self.short_term_plan else "",
            recent_event_text=perception.get("just_happened") or "",
        )
        try:
            hits = mem_recall(self.memories, q, k=5,
                              cur_tick=world.tick, semantic=self.semantic)
        except Exception as e:
            logger.debug(f"[{self.name}] reason recall fail: {e}")
            hits = []
        recalled = [m.short() for m in hits]
        self.last_recalled = recalled

        # 2) reason via LLM (or mock)
        sys, usr = build_reason_prompt(
            name=self.name, persona=self.persona, voice=self.voice,
            goals=self.goals, current_plan=self._plan_dict(),
            recalled_memories=recalled,
            semantic_beliefs=self._semantic_lines(),
            relations_summary=self._relations_dicts(),
            threads=sorted(self.threads, key=lambda t: -t.weight)[:5],
            current_situation=perception,
            world_background=getattr(world, "story_background", "") or "",
        )
        reason_data: Any = None
        reason_usage: dict = {}
        try:
            reason_data, reason_usage = await world.llm.chat_json(sys, usr, kind="reason")
        except Exception as e:
            logger.warning(f"[{self.name}] reason LLM 异常: {e}")

        # reason 返回空 -> 本地 fallback_thought
        if not isinstance(reason_data, dict) or (
            not reason_data.get("tool_calls")
            and not reason_data.get("kind")
            and not reason_data.get("thought")
        ):
            logger.debug(f"[{self.name}] reason empty -> local fallback_thought")
            reason_data = {
                "thought": self._fallback_thought(perception, hits),
                "tool_calls": [], "plan_patch": {},
            }
            if not isinstance(reason_usage, dict) or not reason_usage:
                reason_usage = {"prompt_tokens": 0, "completion_tokens": 0,
                                "total_tokens": 0, "latency_ms": 0,
                                "provider": "local_fallback", "model": "", "kind": "reason"}

        # decode reason_data
        thought = ""
        tool_calls: list[dict] = []
        plan_patch: dict = {}
        if isinstance(reason_data, dict):
            thought = str(reason_data.get("thought") or reason_data.get("reason") or "").strip()
            raw_calls = reason_data.get("tool_calls")
            if isinstance(raw_calls, list):
                for c in raw_calls[:3]:
                    if isinstance(c, dict) and isinstance(c.get("name"), str):
                        tool_calls.append({
                            "name": c["name"].strip().lower(),
                            "args": c.get("args") if isinstance(c.get("args"), dict) else {},
                        })
            plan_patch = (reason_data.get("plan_patch")
                          if isinstance(reason_data.get("plan_patch"), dict) else {})
            # mock 兜底兼容：reason_data 像 decide 输出
            if not tool_calls and isinstance(reason_data.get("kind"), str):
                k = reason_data["kind"]
                if k == "talk" and reason_data.get("target"):
                    tool_calls = [{"name": "talk", "args": {
                        "target": reason_data["target"], "intent": "试探",
                        "draft": reason_data.get("reason", "")}}]
                elif k == "move" and reason_data.get("target"):
                    tool_calls = [{"name": "move", "args": {
                        "place": reason_data["target"]}}]
                elif k == "work":
                    tool_calls = [{"name": "work", "args": {
                        "focus": reason_data.get("reason", "")}}]
                if not thought:
                    thought = reason_data.get("reason", "")

        if not thought:
            thought = self._fallback_thought(perception, hits)

        # 3) 广播 thought 事件
        reason_tokens = int((reason_usage or {}).get("total_tokens", 0) or 0)
        await world.event_bus.publish(Event(
            tick=world.tick, kind="thought", actor=self.name,
            token_used=reason_tokens,
            text=f"💭 {self.emoji} {self.name}：{thought[:80]}",
            payload={"actor_emoji": self.emoji, "thought": thought,
                     "location": self.location, "recalled_count": len(recalled),
                     "tool_planned": [c["name"] for c in tool_calls],
                     "usage": reason_usage or {}},
        ))
        self.recent_reasoning_traces.append(f"t{world.tick}: {thought[:60]}")
        if len(self.recent_reasoning_traces) > 8:
            self.recent_reasoning_traces = self.recent_reasoning_traces[-8:]

        # 4) 派发 tools
        self.last_thought_text = thought[:40]
        parent_thought = self.last_thought_text
        observations: list[dict] = []
        chosen: Optional[Action] = None
        for call in tool_calls:
            name = call["name"]
            args = call["args"]
            if name not in ("talk", "move", "work", "observe", "recall", "introspect", "plan"):
                continue
            result = await dispatch_tool(name, self, world, args, parent_thought=parent_thought)
            observations.append({"call": call, "result": result})
            if is_hard(name) and result.ok:
                chosen = self.pending_action
                break
            if is_hard(name) and not result.ok:
                continue

        # 5) plan_patch 落地
        await self._apply_plan_patch(world, plan_patch)

        # 6) chosen action 兜底
        if chosen is None:
            self.pending_action = Action.rest(thought[:18] or "（按兵不动）")
            chosen = self.pending_action

        elapsed = int((_t.time() - t0) * 1000)
        return ThinkResult(
            thought=thought, tool_calls=tool_calls,
            observations=observations, plan_patch=plan_patch,
            chosen_action=chosen, elapsed_ms=elapsed,
            fallback_used=(reason_data is None or not isinstance(reason_data, dict)),
        )

    # v4 兼容入口

    async def decide(self, *, llm, day: int, time_str: str,
                     places: list[str], nearby: list[tuple[str, str]],
                     primed_peek: Optional[str],
                     world_background: str = "") -> Action:
        """v4 兼容：基于 decide prompt 做单步决策。"""
        from app.services.prompts import build_decide_prompt
        threads_sorted = sorted(self.threads, key=lambda t: -t.weight)[:3]
        sys, usr = build_decide_prompt(
            agent=self, day=day, time_str=time_str, location=self.location,
            memories=self.recent_memories(5), nearby_pairs=nearby,
            places=places, threads=threads_sorted, primed_memory=primed_peek,
            world_background=world_background,
        )
        data, _usage = await llm.chat_json(sys, usr, kind="decide")
        if not isinstance(data, dict):
            return Action.rest("（思绪混乱）")
        try:
            return Action.model_validate(data)
        except Exception:
            return Action.rest("（思绪混乱）")

    async def talk(self, *, llm, other_name: str,
                   history_turns: list[dict],
                   primed_peek: Optional[str],
                   world_background: str = "",
                   draft: str = "", intent_hint: str = "") -> TalkResult:
        """v4 兼容：生成对话 utterance。"""
        from app.services.prompts import build_talk_prompt
        rel = self.get_or_init_relation(other_name)
        agenda = self.pick_secret_agenda(other_name)
        sys, usr = build_talk_prompt(
            agent=self, other_name=other_name, relation=rel,
            history_turns=history_turns, voice=self.voice,
            secret_agenda=agenda, primed_memory=primed_peek,
            world_background=world_background,
            draft=draft or None, intent_hint=intent_hint or None,
        )
        data, talk_usage = await llm.chat_json(sys, usr, kind="talk")
        try:
            self._last_talk_usage = talk_usage  # type: ignore[attr-defined]
        except Exception:
            pass
        if not isinstance(data, dict):
            return self._talk_fallback(other_name, rel, agenda)
        if "inner_thought" not in data and "thought" in data:
            data["inner_thought"] = data.get("thought", "")
        try:
            return TalkResult.model_validate(data)
        except Exception:
            return TalkResult(utterance="……", inner_thought="", intent="敷衍")

    def _talk_fallback(self, other_name: str, rel, agenda: str) -> TalkResult:
        """LLM 未返回 dict 时的对话兜底。"""
        recent_mem = self.recent_memories(1)
        hint = (recent_mem[0].content[:14] if recent_mem
                else (self.primed_memory[:14] if self.primed_memory else ""))
        agenda_snip = (agenda or "").split("：")[-1][:12]
        if hint:
            utt = f"……关于{hint}……（话到嘴边）"
            inner = f"（{hint}……还在心里）"
        elif agenda_snip:
            utt = f"我想问你件事——关于{agenda_snip}。"
            inner = f"（{agenda_snip}得问出来）"
        else:
            rel_tag = rel.summary() or "中性"
            utt = f"……（看着{other_name}，欲言又止）"
            inner = f"（对{other_name}：{rel_tag}）"
        return TalkResult(utterance=utt, inner_thought=inner, intent="敷衍")
