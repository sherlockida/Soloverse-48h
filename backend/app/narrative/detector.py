"""NarrativeDetector：扫近期事件流 → drama≥6 headline 列表。

降级保护：LLM 失败 / 连续 3 次空数组 → 模板拼一条占位。
"""
from __future__ import annotations

import logging
from typing import Optional

from app.engine.events import Event
from app.models.narrative import Headline
from app.services.prompts import build_narrative_prompt

logger = logging.getLogger("echoworld.narrative")


class NarrativeDetector:
    def __init__(self, llm, drama_threshold: int = 6, max_per_scan: int = 3):
        self.llm = llm
        self.drama_threshold = drama_threshold
        self.max_per_scan = max_per_scan
        self.active_headlines: list[Headline] = []  # 最近 N 条已发布的 headline
        self._empty_streak = 0

    async def scan(self, events: list[Event], tick: int) -> list[Headline]:
        if not events:
            return []
        sys, usr = build_narrative_prompt(events=events, active_headlines=[h.model_dump() for h in self.active_headlines[-5:]])
        data, _usage = await self.llm.chat_json(sys, usr, kind="narrative")

        raw_headlines: list[dict] = []
        if isinstance(data, dict):
            raw = data.get("headlines", [])
            if isinstance(raw, list):
                raw_headlines = raw
        elif isinstance(data, list):
            raw_headlines = data

        # 过滤 drama 并构建 Headline 模型
        kept: list[Headline] = []
        for h in raw_headlines:
            if not isinstance(h, dict):
                continue
            try:
                drama = int(h.get("drama", 0))
            except Exception:
                drama = 0
            if drama < self.drama_threshold:
                continue
            kept.append(Headline(
                headline=h.get("headline", "(无标题)"),
                involved=h.get("involved", []) or [],
                chain=h.get("chain", []) or [],
                drama=drama,
                predict_next=h.get("predict_next", ""),
                tick=tick,
                is_fallback=False,
            ))

        kept = kept[: self.max_per_scan]

        if not kept:
            self._empty_streak += 1
        else:
            self._empty_streak = 0
            self.active_headlines.extend(kept)
            # 保留最近 20 条避免无限增长
            self.active_headlines = self.active_headlines[-20:]

        # 兜底：连续 3 次空，但近期有事件 → 模板拼一条"今日小镇"占位
        if not kept and self._empty_streak >= 3 and events:
            actors = list({e.actor for e in events if e.actor})[:3]
            who = "、".join(actors) if actors else "镇民们"
            fallback = Headline(
                headline=f"{who} 各自忙活，小镇暂时平静",
                involved=actors,
                chain=[e.text for e in events[-3:]],
                drama=5,
                predict_next="暗流仍在涌动",
                tick=tick,
                is_fallback=True,
            )
            self._empty_streak = 0
            self.active_headlines.append(fallback)
            self.active_headlines = self.active_headlines[-20:]
            kept = [fallback]
            logger.info("narrative fallback 触发")

        return kept
