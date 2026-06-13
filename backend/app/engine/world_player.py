"""World player mixin: player avatar operations.

Methods split from origin world.py for P2-T1:
- set_player_avatar, player_move, player_say, player_act
- _get_agent, _dialog_key
"""
from __future__ import annotations

import logging
from typing import Optional

from app.agents import Agent
from app.engine.events import Event
from app.models.memory import Memory

logger = logging.getLogger("echoworld.world")


class WorldPlayerMixin:
    """Mixin providing player avatar operations for World."""

    # ------------------------------------------------------------------
    # Internal references set at composition time (see world.py)
    # ------------------------------------------------------------------
    event_bus: object  # EventBus
    agents: list[Agent]
    places: list[str]
    dialog_history: dict[tuple[str, str], list[dict]]
    player_avatar: Optional[str]
    tick: int

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _get_agent(self, name: str) -> Optional[Agent]:
        """Look up agent by name. Returns None if not found."""
        for a in self.agents:
            if a.name == name:
                return a
        return None

    def _dialog_key(self, a: str, b: str) -> tuple[str, str]:
        """Generate sorted dialog history key (bidirectional)."""
        return tuple(sorted([a, b]))  # type: ignore

    # ------------------------------------------------------------------
    # Player avatar control
    # ------------------------------------------------------------------

    async def set_player_avatar(self, name: Optional[str]) -> dict:
        """Switch player identity. None = god mode; str = avatar that agent."""
        if name is not None:
            agent = self._get_agent(name)
            if not agent:
                raise ValueError(f"agent {name} not found")
            self.player_avatar = name
            await self.event_bus.publish(Event(
                tick=self.tick, kind="system",
                text=f"👤 玩家化身为 {agent.emoji} {name}（NPC AI 已暂停接管 ta）",
                payload={"avatar": name},
            ))
        else:
            old = self.player_avatar
            self.player_avatar = None
            await self.event_bus.publish(Event(
                tick=self.tick, kind="system",
                text=f"☁️ 玩家退回上帝模式{f'（{old} 重新交回 AI）' if old else ''}",
                payload={"avatar": None},
            ))
        return {"player_avatar": self.player_avatar}

    # ------------------------------------------------------------------
    # Player actions
    # ------------------------------------------------------------------

    async def player_move(self, place: str) -> dict:
        """Player avatar: move to a location."""
        if not self.player_avatar:
            raise ValueError("当前是上帝模式，没有化身")
        agent = self._get_agent(self.player_avatar)
        if not agent:
            raise ValueError("avatar agent missing")
        if place not in self.places:
            raise ValueError(f"unknown place: {place}")
        if place == agent.location:
            return {"ok": True, "note": "已在该地点", "tick": self.tick}
        old = agent.location
        agent.location = place
        agent.add_memory(Memory(tick=self.tick, kind="observed",
                                 content=f"（玩家操控）从 {old} 走到了 {place}"))
        await self.event_bus.publish(Event(
            tick=self.tick, kind="move", actor=agent.name, target=place,
            text=f"👤 {agent.emoji} {agent.name}（你）从 {old} 来到 {place}",
            payload={"emoji": agent.emoji, "from": old, "to": place,
                     "reason": "玩家操作", "by_player": True},
        ))
        return {"ok": True, "tick": self.tick, "from": old, "to": place}

    async def player_say(self, target: str, utterance: str,
                        intent: str = "玩家发言") -> dict:
        """Player avatar: speak to someone. Utterance enters their context."""
        if not self.player_avatar:
            raise ValueError("当前是上帝模式，没有化身")
        agent = self._get_agent(self.player_avatar)
        target_agent = self._get_agent(target)
        if not agent or not target_agent:
            raise ValueError("avatar or target missing")
        if target_agent.location != agent.location:
            raise ValueError(
                f"{target} 不在你身边（你在 {agent.location}，ta 在 {target_agent.location}）"
            )
        key = self._dialog_key(agent.name, target_agent.name)
        self.dialog_history.setdefault(key, []).append(
            {"speaker": agent.name, "utterance": utterance}
        )
        self.dialog_history[key] = self.dialog_history[key][-8:]
        agent.add_memory(Memory(tick=self.tick, kind="talked",
                                 content=f"（玩家说）对 {target_agent.name} 说：「{utterance}」"))
        target_agent.add_memory(Memory(tick=self.tick, kind="talked",
                                        content=f"{agent.name} 对我说：「{utterance}」"))
        prime = f"{agent.name} 刚刚对我说：「{utterance}」"
        if target_agent.primed_memory:
            target_agent.primed_memory = f"{target_agent.primed_memory}；{prime}"
        else:
            target_agent.primed_memory = prime
        await self.event_bus.publish(Event(
            tick=self.tick, kind="talk",
            actor=agent.name, target=target_agent.name,
            text=f"👤 {agent.emoji} {agent.name}（你）→ {target_agent.emoji} {target_agent.name}：「{utterance}」",
            payload={
                "actor_emoji": agent.emoji,
                "target_emoji": target_agent.emoji,
                "utterance": utterance,
                "inner_thought": "",
                "intent": intent,
                "relation_delta": {},
                "location": agent.location,
                "by_player": True,
            },
        ))
        return {"ok": True, "tick": self.tick}

    async def player_act(self, kind: str, reason: str = "") -> dict:
        """Player avatar: work/rest action in-place."""
        if not self.player_avatar:
            raise ValueError("当前是上帝模式，没有化身")
        agent = self._get_agent(self.player_avatar)
        if not agent:
            raise ValueError("avatar agent missing")
        if kind == "work":
            agent.add_memory(Memory(tick=self.tick, kind="observed",
                                     content=f"（玩家选择）在 {agent.location} 忙碌：{reason or '日常活计'}"))
            await self.event_bus.publish(Event(
                tick=self.tick, kind="thought", actor=agent.name,
                text=f"👤 {agent.emoji} {agent.name}（你）在 {agent.location} 忙活（{reason or '日常'}）",
                payload={"emoji": agent.emoji, "reason": reason, "by_player": True},
            ))
        elif kind == "rest":
            agent.add_memory(Memory(tick=self.tick, kind="felt",
                                     content=f"（玩家选择）歇了一会儿：{reason or ''}"))
            await self.event_bus.publish(Event(
                tick=self.tick, kind="thought", actor=agent.name,
                text=f"👤 {agent.emoji} {agent.name}（你）在 {agent.location} 休息",
                payload={"emoji": agent.emoji, "reason": reason, "by_player": True},
            ))
        else:
            raise ValueError(f"unknown act kind: {kind}")
        return {"ok": True, "tick": self.tick}
