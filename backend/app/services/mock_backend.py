"""Mock 后端基础设施：缓存管理 + slot 抽取。

_MockBackendBase 负责：
- 缓存加载（JSONL）
- per-agent 3-gram 去重历史管理
- 从 prompt 提取 slot（兼容 v4【tag】与 v5 缩进两种格式）

数据常量（ROLE_SLANG, ROLE_ACTION_BIAS, INTENT_TEMPLATES 等）在 mock_data.py 中。
组合类 _MockBackend = _MockGenMixin + _MockBackendBase 定义在 mock_gen.py 中。
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

logger = logging.getLogger("echoworld.llm")


class _MockBackendBase:
    """Mock 后端基础：缓存 + slot 抽取。"""

    import random as _random
    _rng = _random.Random()

    def __init__(self, cache_path: str):
        self.cache_path = cache_path
        self._cache: dict[str, str] = {}
        self._uttered_trigrams: dict[str, set[str]] = {}
        self._load()

    def _load(self) -> None:
        p = Path(self.cache_path)
        if not p.exists():
            return
        try:
            with p.open("r", encoding="utf-8") as f:
                for line in f:
                    try:
                        row = json.loads(line)
                        self._cache[row["hash"]] = row["response"]
                    except Exception:
                        continue
        except Exception as e:
            logger.warning(f"cache load fail: {e}")
        logger.info(f"mock loaded {len(self._cache)} cached responses from {self.cache_path}")

    def _extract_slots(self, system: str, user: str) -> dict[str, Any]:
        """从 prompt 抽 agent / persona / memories / threads / relation / 地点 等。
        兼容 v4【tag】与 v5 缩进两种 prompt 格式。
        """
        def _field(txt: str, *labels: str) -> str:
            for lab in labels:
                m = re.search(rf"【{lab}】\s*([^\n]+)", txt)
                if m:
                    return m.group(1).strip()
            for lab in labels:
                m = re.search(rf"(?:^|\n)\s*{lab}\s*[:：]\s*([^\n]+)", txt)
                if m:
                    return m.group(1).strip()
            return ""

        m_self = (re.search(r"你叫\s*([\w一-鿿·\-]+)", system)
                  or re.search(r"你扮演\s*([\w一-鿿·\-]+)", system)
                  or re.search(r"你是\s*([\w一-鿿·\-]+)", system))
        self_name = m_self.group(1) if m_self else "我"

        m_persona = (re.search(r"你叫\s*[\w一-鿿·\-]+。\s*\n?\s*([^\n]+)", system)
                     or re.search(r"你扮演\s*[\w一-鿿·\-]+。\s*([^\n]+)", system)
                     or re.search(r"你是\s*[\w一-鿿·\-]+。\s*([^\n]+)", system))
        persona = m_persona.group(1).strip() if m_persona else ""
        if not persona:
            blk = re.search(r"【你是谁】[\s\S]*?\n([^\n【]+)", system)
            if blk:
                persona = blk.group(1).strip()

        voice = _field(system, "说话风格")
        m_other = re.search(r"与对方\s*([\w一-鿿·\-]+)\s*的关系", system)
        other = m_other.group(1) if m_other else ""
        if not other:
            other = _field(user, "对方", "你正在和谁说话", "对手")

        m_rel = re.search(r"的关系：([^\n]+)", system)
        rel_summary = (m_rel.group(1).strip() if m_rel else "") or _field(user, "关系") or "中性"

        places_raw = _field(user, "可去地点")
        places = [s.strip() for s in places_raw.split("、") if s.strip() and s.strip() != "（无）"]

        nearby_raw = _field(user, "此处其他人")
        nearby_names: list[str] = []
        if nearby_raw and nearby_raw.strip() not in ("无", "", "（无）"):
            for chunk in nearby_raw.split("、"):
                name = chunk.split("（")[0].strip()
                if name and name not in ("无", "（无）"):
                    nearby_names.append(name)

        m_location = re.search(r"你在\s*([\w一-鿿·\-]+)", user)
        location = m_location.group(1) if m_location else ""
        if not location:
            loc_field = _field(user, "此刻", "你在")
            m_loc2 = re.search(r"你在\s*([\w一-鿿·\-]+)", loc_field)
            if m_loc2:
                location = m_loc2.group(1)

        memory_lines = re.findall(r"-\s*\[t\d+\|\w+\]\s*([^\n]+)", user)
        EMOTION_HINTS = ("！", "？！", "痛", "恨", "爱", "谢", "怕", "气", "崩", "撞见")
        weighted_memories = sorted(
            memory_lines,
            key=lambda m: sum(1 for h in EMOTION_HINTS if h in m),
            reverse=True,
        )

        thread_lines = re.findall(r"-\s*\(\d+\)\s*([^\n]+)", user)
        thread_targets = re.findall(r"关于 ([\w一-鿿·\-]+)", "\n".join(thread_lines))

        primed = (
            _field(user, "你刚听说的事", "刚听说", "你最近想起的事")
            or _field(user, "刚发生", "刚听说的事")
        )
        if primed in ("无", "（无）"):
            primed = ""

        agenda = _field(user, "你的隐藏目标", "隐藏目标")
        if agenda in ("无", "（无）"):
            agenda = ""
        if not agenda:
            m_goal = re.search(r"goal[:：]\s*([^\n]+)", user)
            if m_goal:
                g = m_goal.group(1).strip()
                if g and g not in ("（未制定）", "（空）"):
                    agenda = g

        if primed:
            memory_hint = primed[:18]
        elif weighted_memories:
            memory_hint = weighted_memories[0][:18]
        elif agenda and agenda != "无":
            memory_hint = agenda[:18]
        else:
            memory_hint = "那件事"

        return {
            "self_name": self_name, "persona": persona, "voice": voice,
            "other": other or "对方", "rel_summary": rel_summary,
            "places": places, "nearby_names": nearby_names,
            "location": location or (places[0] if places else "这里"),
            "memories": memory_lines, "threads": thread_lines,
            "thread_targets": thread_targets, "primed": primed,
            "agenda": agenda, "memory_hint": memory_hint,
        }
