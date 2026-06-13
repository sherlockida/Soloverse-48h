"""AgentReflectMixin — reflection, belief update, thread changes, summarize.

本模块包含：
- reflect(world)              周期性反思（由 world 调度，每 N tick 一次）
  - 构建 reflect prompt -> LLM 调用 -> 解析结果
  - apply plan_patch（复用 AgentThinkMixin._apply_plan_patch）
  - apply belief_update -> semantic memory + SSE belief_formed
  - apply thread_changes -> add/resolve threads
  - 触发 summarize（顺路）
  - 广播 reflect SSE 事件

反射逻辑集中在此模块。数据模型在 agent_model.py，思考逻辑在 agent_think.py。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.agents.agent_model import AgentBase
from app.engine.events import Event
from app.models.memory import Memory, Thread
from app.services import (
    append_semantic, recall, should_summarize, summarize,
)

logger = logging.getLogger("echoworld.agent")


class AgentReflectMixin(AgentBase):
    """反思 Mixin — belief 沉淀、thread 管理、记忆压缩。

    继承 AgentBase 以获取字段和基础方法。
    在 __init__.py 中与 AgentThinkMixin + AgentBase 组合成最终 Agent 类。
    """

    async def reflect(self, world: Any) -> None:
        """周期性反思：plan_patch + belief_update + thread_changes + summarize。

        由 world 调度（每 N tick 一次）。
        """
        from app.services.prompts import build_reflect_prompt

        sys, usr = build_reflect_prompt(
            name=self.name,
            persona=self.persona,
            voice=self.voice,
            goals=self.goals,
            current_plan=self._plan_dict(),
            recent_reasoning_traces=self.recent_reasoning_traces[-5:],
            observations=[m.short() for m in self.recent_memories(8)],
            recalled_memories=self.last_recalled,
            semantic_beliefs=self._semantic_lines(),
            relations_summary=self._relations_dicts(),
            threads=sorted(self.threads, key=lambda t: -t.weight)[:5],
            current_situation=self._perceive(world),
            world_background=getattr(world, "story_background", "") or "",
        )
        reflect_usage: dict = {}
        try:
            data, reflect_usage = await asyncio.wait_for(
                world.llm.chat_json(sys, usr, kind="reflect"),
                timeout=8.0,
            )
        except Exception as e:
            logger.debug(f"[{self.name}] reflect LLM 异常: {e}")
            data = None

        thought = ""
        patch: dict = {}
        beliefs: list[str] = []
        thread_changes: dict = {}
        if isinstance(data, dict):
            thought = str(data.get("thought") or "").strip()
            patch = (data.get("plan_patch")
                     if isinstance(data.get("plan_patch"), dict) else {})
            raw_beliefs = data.get("belief_update")
            if isinstance(raw_beliefs, list):
                for b in raw_beliefs[:3]:
                    if isinstance(b, str) and b.strip():
                        beliefs.append(b.strip()[:60])
            thread_changes = (data.get("thread_changes")
                              if isinstance(data.get("thread_changes"), dict)
                              else {})

        if not thought:
            recent_topic = (
                self.recent_reasoning_traces[-1]
                if self.recent_reasoning_traces else "今日无大事"
            )
            thought = f"回看这几 tick：{recent_topic[:40]}"

        # apply plan_patch
        await self._apply_plan_patch(world, patch)

        # apply belief_update -> semantic memory + 广播 belief_formed
        for b in beliefs:
            target = ""
            for other_name in (self.relations or {}).keys():
                if other_name and other_name in b:
                    target = other_name
                    break
            mem = Memory(
                tick=world.tick, kind="belief", content=b,
                participants=[target] if target else [],
                importance=7,
            )
            append_semantic(self.semantic, mem, cap=20)
            try:
                await world.event_bus.publish(Event(
                    tick=world.tick, kind="belief_formed",
                    actor=self.name,
                    target=target or None,
                    text=f"🧠 {self.emoji} {self.name} "
                         f"沉淀了一个信念：{b[:50]}",
                    payload={
                        "actor_emoji": self.emoji,
                        "belief": b,
                        "target": target,
                    },
                ))
            except Exception as e:
                logger.debug(f"belief_formed publish fail: {e}")

        # apply thread_changes
        self._apply_thread_changes(thread_changes)

        # 触发 summarize（顺路）
        self._trigger_summarize(world)

        self.last_reflect_tick = world.tick

        # 广播 reflect 事件
        reflect_tokens = int((reflect_usage or {}).get("total_tokens", 0) or 0)
        await world.event_bus.publish(Event(
            tick=world.tick, kind="reflect", actor=self.name,
            token_used=reflect_tokens,
            text=f"🪞 {self.emoji} {self.name}：{thought[:70]}",
            payload={
                "actor_emoji": self.emoji,
                "thought": thought,
                "new_beliefs": beliefs,
                "plan_patch": patch,
                "thread_changes": thread_changes,
                "usage": reflect_usage or {},
            },
        ))

    def _apply_thread_changes(self, thread_changes: dict) -> None:
        """应用 LLM 返回的 thread_changes（add / resolve）。"""
        add = thread_changes.get("add") if isinstance(thread_changes, dict) else []
        if isinstance(add, list):
            for t in add[:3]:
                if not isinstance(t, dict) or not t.get("desc"):
                    continue
                self.threads.append(Thread(
                    desc=str(t["desc"])[:40],
                    target=(str(t["target"])
                            if t.get("target") else None),
                    weight=int(t.get("weight", 5)),
                ))
        resolve = (thread_changes.get("resolve")
                   if isinstance(thread_changes, dict) else [])
        if isinstance(resolve, list):
            to_del = []
            for idx in resolve:
                try:
                    i = int(idx)
                    if 0 <= i < len(self.threads):
                        to_del.append(i)
                except Exception:
                    continue
            for i in sorted(set(to_del), reverse=True):
                del self.threads[i]

    async def _trigger_summarize(self, world: Any) -> None:
        """检查是否需要 summarize 并执行。"""
        try:
            if should_summarize(
                self.memories,
                last_summarize_tick=self.last_summarize_tick,
                cur_tick=world.tick,
            ):
                summ = await summarize(self.memories[:10], llm=world.llm)
                if summ:
                    append_semantic(self.semantic, summ, cap=20)
                    self.memories = self.memories[10:]
                    self.last_summarize_tick = world.tick
        except Exception as e:
            logger.debug(f"[{self.name}] summarize fail: {e}")
