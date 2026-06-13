"""World actions mixin: think/decide, apply, talk pair, nearby computation.

Methods split from origin world.py for P2-T1:
- _apply_action, _pair_up, _run_talk_pair, _apply_talk_turn
- _compute_nearby, _safe_decide, _safe_think
- _run_periodic_reflects, _on_provider_switch
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.agents import Action, Agent, TalkResult
from app.engine.events import Event
from app.models.memory import Memory

logger = logging.getLogger("echoworld.world")


class WorldActionsMixin:
    """Mixin providing think/act/apply/talk methods for World.

    Designed to be mixed into ``World`` via ``type(World).__mro__`` or
    direct assignment in the re-export ``world.py``.
    """

    # ------------------------------------------------------------------
    # Internal references set at composition time (see world.py)
    # ------------------------------------------------------------------
    llm: object  # LLMClient
    event_bus: object  # EventBus
    places: list[str]
    story_background: str
    dialog_history: dict[tuple[str, str], list[dict]]
    player_avatar: Optional[str]
    tick: int

    # ------------------------------------------------------------------
    # Safe think / decide wrappers
    # ------------------------------------------------------------------

    async def _safe_decide(self, agent: Agent, day: int, time_str: str,
                           nearby: list[tuple[str, str]]) -> Action:
        """v4 compat: legacy decide entry (fallback path only)."""
        try:
            return await agent.decide(
                llm=self.llm,
                day=day, time_str=time_str,
                places=self.places,
                nearby=nearby,
                primed_peek=agent.primed_memory,
                world_background=self.story_background,
            )
        except Exception as e:
            logger.warning(f"[{agent.name}] decide raise: {e}")
            return Action.rest("(系统颠簸)")

    async def _safe_think(self, agent: Agent, timeout_s: float) -> None:
        """think_and_act wrapper: failure -> pending_action = rest."""
        try:
            await agent.think_and_act(self, timeout_seconds=timeout_s)
        except Exception as e:
            logger.warning(f"[{agent.name}] think_and_act raise: {e}")
            agent.pending_action = Action.rest("（系统颠簸）")

    async def _run_periodic_reflects(self) -> None:
        """Trigger 1-2 agents with oldest reflect_tick to reflect."""
        try:
            candidates = [a for a in self.agents if a.name != self.player_avatar and a.is_alive()]
            if not candidates:
                return
            candidates.sort(key=lambda a: a.last_reflect_tick)
            picks = candidates[:2]
            for a in picks:
                if self.tick - a.last_reflect_tick < self.reflect_every:
                    continue
                try:
                    await a.reflect(self)
                except Exception as e:
                    logger.debug(f"[{a.name}] reflect error: {e}")
        except Exception as e:
            logger.warning(f"_run_periodic_reflects fail: {e}")

    async def _on_provider_switch(self, name: str, extra: dict) -> None:
        """LLMClient callback on provider switch; broadcast SSE."""
        try:
            extra = extra or {}
            previous = extra.get("previous") or extra.get("from") or ""
            health = extra.get("health") or {}
            reason = extra.get("reason") or ""
            if not reason:
                last_err = (health.get("providers") or {}).get(previous, {}).get("last_error")
                if last_err:
                    reason = f"{previous} 失败：{str(last_err)[:40]}"
                elif previous:
                    reason = f"{previous} 不可用，已切换"
                else:
                    reason = "首次连通"
            await self.event_bus.publish(Event(
                tick=self.tick, kind="provider_switch",
                text=f"🛰 LLM 切换 {previous or '初始化'} -> {name}",
                payload={
                    "provider": name,
                    "previous": previous,
                    "from": previous or "?",
                    "to": name,
                    "reason": reason,
                    "chain": extra.get("chain") or [],
                    "health": health,
                },
            ))
        except Exception as e:
            logger.debug(f"provider_switch publish fail: {e}")

    # ------------------------------------------------------------------
    # Nearby computation (v4 decide helper)
    # ------------------------------------------------------------------

    def _compute_nearby(self) -> dict[str, list[tuple[str, str]]]:
        """Compute per-location agent neighbor list for v4 decide."""
        by_loc: dict[str, list[Agent]] = {}
        for a in self.agents:
            by_loc.setdefault(a.location, []).append(a)
        result: dict[str, list[tuple[str, str]]] = {}
        for _loc, ag_list in by_loc.items():
            for a in ag_list:
                others = [
                    (b.name, a.get_or_init_relation(b.name).summary())
                    for b in ag_list if b.name != a.name
                ]
                result[a.name] = others
        return result

    # ------------------------------------------------------------------
    # Action application
    # ------------------------------------------------------------------

    async def _apply_action(self, agent: Agent, act: Action) -> None:
        """Apply a single agent's action (move/work/rest). Talk actions are
        handled in the talk pair phase."""
        if act.kind == "move":
            target = act.target.strip()
            if target in self.places and target != agent.location:
                old = agent.location
                agent.location = target
                primed = agent.consume_primed()
                if primed:
                    agent.add_memory(Memory(tick=self.tick, kind="thought",
                                             content=f"想着「{primed}」走向了 {target}"))
                agent.add_memory(Memory(tick=self.tick, kind="observed",
                                         content=f"从 {old} 走到了 {target}"))
                await self.event_bus.publish(Event(
                    tick=self.tick, kind="move", actor=agent.name, target=target,
                    text=f"{agent.emoji} {agent.name} 从 {old} 来到 {target}",
                    payload={"emoji": agent.emoji, "from": old, "to": target,
                             "reason": act.reason},
                ))
            else:
                agent.add_memory(Memory(tick=self.tick, kind="felt",
                                         content=f"想去 {target or '别处'}，但终究没动"))
        elif act.kind == "work":
            agent.add_memory(Memory(tick=self.tick, kind="observed",
                                     content=f"在 {agent.location} 忙碌：{act.reason or '日常活计'}"))
            agent.consume_primed()
            await self.event_bus.publish(Event(
                tick=self.tick, kind="thought", actor=agent.name,
                text=f"{agent.emoji} {agent.name} 在 {agent.location} 忙活（{act.reason or '日常'}）",
                payload={"emoji": agent.emoji, "reason": act.reason},
            ))
        elif act.kind == "talk":
            pass  # handled in talk pair phase
        else:  # rest
            agent.add_memory(Memory(tick=self.tick, kind="felt",
                                     content=f"歇了一会儿：{act.reason or ''}"))
            await self.event_bus.publish(Event(
                tick=self.tick, kind="thought", actor=agent.name,
                text=f"{agent.emoji} {agent.name} 在 {agent.location} 休息",
                payload={"emoji": agent.emoji, "reason": act.reason},
            ))

    # ------------------------------------------------------------------
    # Talk pair
    # ------------------------------------------------------------------

    def _pair_up(self, actions: list[Action]) -> list[tuple[Agent, Agent]]:
        """Match agents wanting to talk into pairs."""
        name_to_agent = {a.name: a for a in self.agents}
        used: set[str] = set()
        pairs: list[tuple[Agent, Agent]] = []
        for agent, act in zip(self.agents, actions):
            if act.kind != "talk":
                continue
            if agent.name in used:
                continue
            if not agent.is_alive():
                continue
            target_name = (act.target or "").strip()
            if not target_name or target_name not in name_to_agent:
                continue
            target = name_to_agent[target_name]
            if target.name in used:
                continue
            if not target.is_alive():
                agent.add_memory(Memory(tick=self.tick, kind="felt",
                                         content=f"想找 {target.name} 说话，可 {target.name} 已经不在了"))
                continue
            if target.location != agent.location:
                agent.add_memory(Memory(tick=self.tick, kind="felt",
                                         content=f"想找 {target.name} 说话，但他/她不在身边"))
                continue
            pairs.append((agent, target))
            used.add(agent.name)
            used.add(target.name)
        return pairs

    async def _run_talk_pair(self, a: Agent, b: Agent) -> None:
        """Execute a talk exchange between two agents."""
        key = self._dialog_key(a.name, b.name)
        history = self.dialog_history.get(key, [])[-3:]

        # A speaks first
        a_primed = a.consume_primed()
        a_draft = getattr(a, "pending_talk_draft", "") or ""
        a_intent_hint = getattr(a, "pending_talk_intent", "") or ""
        try:
            res_a: TalkResult = await a.talk(
                llm=self.llm, other_name=b.name,
                history_turns=history, primed_peek=a_primed,
                world_background=self.story_background,
                draft=a_draft, intent_hint=a_intent_hint,
            )
        except Exception as e:
            logger.warning(f"[{a.name}] talk raise: {e}")
            res_a = TalkResult()

        await self._apply_talk_turn(a, b, res_a)
        history = self.dialog_history[key]

        # B responds (sees updated history)
        b_primed = b.consume_primed()
        b_draft = getattr(b, "pending_talk_draft", "") or ""
        b_intent_hint = getattr(b, "pending_talk_intent", "") or ""
        try:
            res_b: TalkResult = await b.talk(
                llm=self.llm, other_name=a.name,
                history_turns=history[-3:], primed_peek=b_primed,
                world_background=self.story_background,
                draft=b_draft, intent_hint=b_intent_hint,
            )
        except Exception as e:
            logger.warning(f"[{b.name}] talk raise: {e}")
            res_b = TalkResult()

        await self._apply_talk_turn(b, a, res_b)

    async def _apply_talk_turn(self, speaker: Agent, listener: Agent,
                                res: TalkResult) -> None:
        """Record a single talk turn: dialog history, memories, relations, SSE."""
        key = self._dialog_key(speaker.name, listener.name)
        self.dialog_history.setdefault(key, []).append(
            {"speaker": speaker.name, "utterance": res.utterance}
        )
        self.dialog_history[key] = self.dialog_history[key][-8:]

        speaker.add_memory(Memory(
            tick=self.tick, kind="talked",
            content=f"对 {listener.name} 说：「{res.utterance}」（心里：{res.inner_thought}）",
        ))
        listener.add_memory(Memory(
            tick=self.tick, kind="talked",
            content=f"{speaker.name} 对我说：「{res.utterance}」",
        ))
        speaker.get_or_init_relation(listener.name).apply_delta(res.relation_delta or {})

        talk_usage = getattr(speaker, "_last_talk_usage", {}) or {}
        talk_tokens = int(talk_usage.get("total_tokens", 0) or 0)
        await self.event_bus.publish(Event(
            tick=self.tick, kind="talk",
            actor=speaker.name, target=listener.name,
            token_used=talk_tokens,
            text=f"{speaker.emoji} {speaker.name} → {listener.emoji} {listener.name}：「{res.utterance}」",
            payload={
                "actor_emoji": speaker.emoji,
                "target_emoji": listener.emoji,
                "utterance": res.utterance,
                "inner_thought": res.inner_thought,
                "intent": res.intent,
                "relation_delta": res.relation_delta,
                "location": speaker.location,
                "usage": talk_usage,
            },
        ))
