"""World seed mixin: seed event injection, effect detection, narrative scan.

Methods split from origin world.py for P2-T1:
- _inject_seed_event, _detect_effects, _parse_world_changes
- inject_player_seed, _run_narrative
"""
from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import Optional

from app.agents import Agent
from app.engine.events import Event
from app.models.memory import Memory, Thread
from app.models.narrative import Headline
from app.models.world import SeedEvent, WorldChange

logger = logging.getLogger("echoworld.world")


class WorldSeedMixin:
    """Mixin providing seed injection and narrative scan for World."""

    # ------------------------------------------------------------------
    # Internal references set at composition time (see world.py)
    # ------------------------------------------------------------------
    llm: object  # LLMClient
    event_bus: object  # EventBus
    agents: list[Agent]
    seed_events: list[SeedEvent]
    tick: int

    # ------------------------------------------------------------------
    # Constants
    # ------------------------------------------------------------------

    EFFECT_KEYWORDS: dict[str, list[str]] = {
        "rain":       ["下雨", "暴雨", "雨水", "雨声", "下了雨"],
        "snow":       ["下雪", "飘雪", "雪花"],
        "fire":       ["着火", "起火", "火灾", "燃烧", "火苗", "烧起来"],
        "blackout":   ["停电", "断电", "黑暗", "停了电"],
        "night":      ["深夜", "天黑", "入夜", "夜幕", "晚上"],
        "moonlight":  ["月光", "月亮"],
        "alert":      ["警报", "报警", "警笛", "鸣笛", "紧急"],
        "fog":        ["浓雾", "起雾", "雾气", "雾天"],
        "blood":      ["流血", "血光", "受伤", "尸体"],
        "celebration": ["庆祝", "派对", "狂欢", "生日", "撒花"],
    }

    _STATUS_RULES: list[tuple[str, str]] = [
        (r"(死了|已死|去世|阵亡|被杀|自杀|身亡|没了|断气|挂了|遇害|丧生|丧命|牺牲|不在了|没救|救不活|没人了)", "dead"),
        (r"(倒下|倒地|晕倒|昏迷|不省人事|失去意识|昏过去)", "unconscious"),
        (r"(失踪|消失|不见了|走失|跑了|离开了|不知所踪|逃走)", "missing"),
    ]

    MAX_PRIMED_LEN: int = 100
    BROADCAST_PRIMED_CAP: int = 200

    # ------------------------------------------------------------------
    # Auto seed injection (called by do_tick)
    # ------------------------------------------------------------------

    async def _inject_seed_event(self) -> None:
        """Auto-inject a random seed event from the seed library."""
        ev = random.choice(self.seed_events)
        desc = ev.desc
        affected = ev.affected
        name_set = {a.name for a in self.agents}
        applied: list[str] = []
        for n in affected:
            if n in name_set:
                target = next(a for a in self.agents if a.name == n)
                if target.primed_memory:
                    target.primed_memory = f"{target.primed_memory}；又听说：{desc}"
                else:
                    target.primed_memory = desc
                target.add_memory(Memory(tick=self.tick, kind="seed", content=desc))
                applied.append(n)
        await self.event_bus.publish(Event(
            tick=self.tick, kind="seed",
            text=f"🌱 {desc}（影响：{'、'.join(applied) if applied else '无人'}）",
            payload={"desc": desc, "affected": applied, "source": "auto"},
        ))

    # ------------------------------------------------------------------
    # Effect detection
    # ------------------------------------------------------------------

    def _detect_effects(self, text: str) -> list[str]:
        """Detect scene effects (rain, fire, etc.) from text keywords."""
        out: list[str] = []
        for kind, kws in self.EFFECT_KEYWORDS.items():
            if any(k in text for k in kws):
                out.append(kind)
        return out

    # ------------------------------------------------------------------
    # World state change parsing (rule-based)
    # ------------------------------------------------------------------

    def _parse_world_changes(self, desc: str) -> list[WorldChange]:
        """Rule-track: extract (actor, kind, reason) from desc.

        Each agent name is checked against status keywords with priority:
        dead > unconscious > missing. First match wins per agent.
        """
        if not desc:
            return []
        seen_actors: set[str] = set()
        changes: list[WorldChange] = []
        for a in self.agents:
            if not a.name or a.name in seen_actors:
                continue
            if a.name not in desc:
                continue
            for pat, status in self._STATUS_RULES:
                if re.search(pat, desc):
                    changes.append(WorldChange(
                        actor=a.name,
                        kind=status,
                        reason=desc[:60],
                    ))
                    seen_actors.add(a.name)
                    break
        return changes

    # ------------------------------------------------------------------
    # Player seed injection (API entry)
    # ------------------------------------------------------------------

    async def inject_player_seed(
        self, desc: str, explicit_effect: str = "",
        explicit_affected: list[str] | None = None,
    ) -> dict:
        """Player-initiated seed. v5.3:
        1) Rule + LLM dual-track world_changes (status changes)
        2) Apply status changes to agents
        3) Publish world_state_change events
        4) Broadcast to all alive agents via primed_memory
        5) Set post-seed boost for next 2 ticks
        """
        affected: list[str] = []
        if explicit_affected:
            affected = [n for n in explicit_affected if any(a.name == n for a in self.agents)]
        for a in self.agents:
            if a.name in desc and a.name not in affected:
                affected.append(a.name)
        # Ensure minimum 2 affected
        if len(affected) < 2:
            pool = [a.name for a in self.agents if a.name not in affected and a.is_alive()]
            random.shuffle(pool)
            need = max(0, 2 - len(affected))
            affected.extend(pool[:need])
        affected = affected[:5]

        # Rule-track: world changes
        world_changes: list[WorldChange] = self._parse_world_changes(desc)

        # LLM track: fallback when rule-track yields nothing (retry 1x)
        if not world_changes and self.agents:
            for attempt in range(2):
                try:
                    names_hint = "、".join(a.name for a in self.agents[:8])
                    sem_sys = (
                        "你是一个世界事件解析器。给定一段中文文本，"
                        "判断其中是否有【角色】发生【死亡/昏迷/失踪】之一的变化。"
                        "严格返回 JSON：{\"world_changes\":["
                        "{\"actor\":\"角色名\",\"kind\":\"dead|unconscious|missing\",\"reason\":\"≤30字\"}"
                        "]}，没有则返回 {\"world_changes\":[]}。"
                    )
                    sem_usr = f"已知角色：{names_hint}\n\n文本：{desc}\n\n仅按 schema 输出 JSON。"
                    data, _u = await asyncio.wait_for(
                        self.llm.chat_json(sem_sys, sem_usr, kind="extract"),
                        timeout=15.0,
                    )
                    if isinstance(data, dict):
                        raw_changes = data.get("world_changes") or []
                        if isinstance(raw_changes, list):
                            valid_names = {a.name for a in self.agents}
                            for ch in raw_changes[:5]:
                                if not isinstance(ch, dict):
                                    continue
                                actor = str(ch.get("actor", "")).strip()
                                kind = str(ch.get("kind", "")).strip().lower()
                                if actor not in valid_names:
                                    continue
                                if kind not in ("dead", "unconscious", "missing"):
                                    continue
                                world_changes.append(WorldChange(
                                    actor=actor,
                                    kind=kind,
                                    reason=str(ch.get("reason", desc))[:60],
                                ))
                    break  # success
                except Exception as e:
                    if attempt == 0:
                        logger.debug(f"[SEED] inject_player_seed LLM attempt 1 fail, retrying: {e}")
                    else:
                        logger.debug(f"[SEED] inject_player_seed LLM attempt 2 fail, fallback to rule-only: {e}")
                    break

        # Apply status changes
        for ch in world_changes:
            actor_name = ch.actor
            target_agent = next((a for a in self.agents if a.name == actor_name), None)
            if not target_agent:
                continue
            target_agent.status = ch.kind  # type: ignore[assignment]
            target_agent.death_reason = ch.reason
            target_agent.status_changed_tick = self.tick
            target_agent.add_memory(Memory(
                tick=self.tick, kind="seed",
                content=f"[最后一笔] {ch.reason}",
                importance=10,
            ))
            kind_zh = {"dead": "死了", "unconscious": "昏迷", "missing": "失踪"}.get(ch.kind, ch.kind)
            for a in self.agents:
                if not a.is_alive() or a.name == actor_name:
                    continue
                rel = a.get_or_init_relation(actor_name)
                if rel.intensity() >= 3:
                    a.threads.append(Thread(
                        desc=f"{actor_name} {kind_zh}了（{ch.reason}），我还不能接受",
                        target=actor_name,
                        weight=9,
                    ))

        # Merge primed_memory (truncate to MAX_PRIMED_LEN)
        for n in affected:
            target = next((a for a in self.agents if a.name == n), None)
            if not target or not target.is_alive():
                continue
            if target.primed_memory:
                merged = f"{desc}（之前：{target.primed_memory[:40]}）"
            else:
                merged = desc
            target.primed_memory = merged[:self.MAX_PRIMED_LEN]
            target.add_memory(Memory(tick=self.tick, kind="seed", content=desc))

        # Detect effects
        effects: list[str] = []
        if explicit_effect:
            effects.append(explicit_effect)
        effects.extend(self._detect_effects(desc))
        effects = list(dict.fromkeys(effects))

        # Publish seed event
        await self.event_bus.publish(Event(
            tick=self.tick, kind="seed",
            text=f"🌱 玩家种子：{desc}（影响：{'、'.join(affected)}）",
            payload={
                "desc": desc,
                "affected": affected,
                "source": "player",
                "effects": effects,
                "world_changes": [ch.model_dump() for ch in world_changes],
            },
        ))

        # Publish world_state_change events (one per change)
        for ch in world_changes:
            kind_zh = {"dead": "死亡", "unconscious": "昏迷", "missing": "失踪"}.get(ch.kind, ch.kind)
            await self.event_bus.publish(Event(
                tick=self.tick, kind="world_state_change",
                actor=ch.actor,
                text=f"⚡ {ch.actor} {kind_zh}：{ch.reason}",
                payload={
                    "actor": ch.actor,
                    "kind": ch.kind,
                    "reason": ch.reason,
                    "severity": "high",
                    "desc": desc,
                    "effects": effects,
                    "affected": affected,
                    "source": "player",
                },
            ))

        # Broadcast to all alive agents
        if world_changes:
            broadcast_text = "；".join(
                f"{ch.actor} {ch.kind}（{ch.reason}）" for ch in world_changes
            )
        else:
            broadcast_text = desc
        if broadcast_text:
            msg = f"听说：{broadcast_text}"
            for a in self.agents:
                if not a.is_alive():
                    continue
                if a.primed_memory:
                    combined = f"{a.primed_memory}；{msg}"
                else:
                    combined = msg
                a.primed_memory = combined[:self.BROADCAST_PRIMED_CAP]
                a.add_memory(Memory(
                    tick=self.tick, kind="observed",
                    content=msg, importance=8,
                ))

        # Enable post-seed boost for next 2 ticks
        self._post_seed_boost_until_tick = self.tick + 2

        return {
            "affected": affected,
            "tick": self.tick,
            "effects": effects,
            "world_changes": [ch.model_dump() for ch in world_changes],
        }

    # ------------------------------------------------------------------
    # Narrative scan
    # ------------------------------------------------------------------

    async def _run_narrative(self, events: list[Event]) -> None:
        """Run narrative detection on recent events and publish headlines."""
        try:
            headlines = await self.narrative.scan(events, tick=self.tick)
        except Exception as e:
            logger.warning(f"narrative scan exception: {e}")
            return
        for h in headlines or []:
            try:
                await self.event_bus.publish(Event(
                    tick=self.tick, kind="narrative",
                    text=f"📰 {h.headline}（drama={h.drama}）",
                    payload=h.model_dump(),
                ))
            except Exception as e:
                logger.warning(f"narrative publish fail: {e}")
