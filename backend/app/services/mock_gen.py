"""Mock 后端核心生成 mixin —— decide / intent / slang 选择。

_MockGenMixin 提供动作决策和意图选择的基础方法：
- _pick_slang: 角色俚语匹配
- _pick_intent: 基于关系向量加权选择意图
- _gen_decide: 动作决策（talk/move/work/rest）

输出类生成方法（_gen_talk / _gen_reason / _gen_reflect / _gen_narrative / _gen_summarize）
和最终组合类 _MockBackend 在 mock_gen_output.py 中定义。
"""
from __future__ import annotations

import re
from typing import Optional

from app.services.mock_data import ROLE_ACTION_BIAS, ROLE_SLANG


class _MockGenMixin:
    """Mock 核心生成 mixin。需要与 _MockBackendBase 组合使用。

    依赖 _MockBackendBase 提供：
    - _rng: random.Random 实例
    - _extract_slots(system, user) -> dict
    """

    # ------------------------------------------------------------------
    # 角色俚语选取
    # ------------------------------------------------------------------
    def _pick_slang(self, persona: str, voice: str, fallback_blob: str = "") -> str:
        pool: list[str] = []
        hay = f"{persona} {voice} {fallback_blob}".lower()
        for k, v in ROLE_SLANG.items():
            if k.lower() in hay:
                pool.extend(v)
        if not pool:
            pool = list(ROLE_SLANG["default"])
        return self._rng.choice(pool)

    # ------------------------------------------------------------------
    # decide
    # ------------------------------------------------------------------
    def _gen_decide(self, system: str, user: str) -> dict:
        slots = self._extract_slots(system, user)
        role = "default"
        for r_key in ROLE_ACTION_BIAS:
            if r_key != "default" and r_key in system:
                role = r_key
                break

        nearby_names = slots["nearby_names"]
        places = slots["places"]
        primed = slots["primed"]
        thread_targets = slots["thread_targets"]

        bias = ROLE_ACTION_BIAS.get(role, ROLE_ACTION_BIAS["default"])
        weights = dict(bias)
        if not nearby_names:
            weights["talk"] = 0
        if not places:
            weights["move"] = 0

        forced_target: Optional[str] = None
        forced_kind: Optional[str] = None
        if primed:
            for n in nearby_names:
                if n in primed:
                    forced_target = n
                    forced_kind = "talk"
                    break
            if not forced_target:
                for tn in thread_targets:
                    if tn in primed:
                        for pl in places:
                            if pl in primed:
                                forced_target = pl
                                forced_kind = "move"
                                break
                        break
            if not forced_target:
                for pl in places:
                    if pl in primed:
                        forced_target = pl
                        forced_kind = "move"
                        break
            if not forced_kind:
                weights["talk"] = weights.get("talk", 1) + 5
                weights["move"] = weights.get("move", 1) + 3
                weights["rest"] = max(0, weights.get("rest", 1) - 3)

        if forced_kind:
            kind = forced_kind
            target = forced_target or ""
        else:
            kinds: list[str] = []
            for k, w in weights.items():
                kinds.extend([k] * max(0, w))
            if not kinds:
                kinds = ["rest"]
            kind = self._rng.choice(kinds)
            target = ""
            if kind == "talk" and nearby_names:
                target = self._rng.choice(nearby_names)
            elif kind == "move" and places:
                target = self._rng.choice(places)

        hint = slots.get("memory_hint") or ""
        thread_tgt = thread_targets[0] if thread_targets else ""
        if primed and len(primed) < 40:
            reason = f"心里想着「{primed[:18]}」"
        elif kind == "talk" and target:
            if thread_tgt and thread_tgt == target:
                reason = f"得跟 {target} 当面问清{hint[:10] or '那件事'}"
            elif hint and hint != "那件事":
                reason = f"想试探 {target} 关于「{hint[:10]}」"
            else:
                reason = f"刚好碰上 {target}，想说几句"
        elif kind == "move" and target:
            if target in (primed or "") or target in hint:
                reason = f"得去 {target} 看看{hint[:8] or '动静'}"
            else:
                reason = f"在这待不住，挪去 {target}"
        elif kind == "work":
            reason = (f"先把手上活做完，再想{hint[:10]}"
                      if hint and hint != "那件事" else "先把手上的活做完")
        elif kind == "rest":
            reason = (f"歇会儿——{hint[:10]} 压着喘不过气"
                      if hint and hint != "那件事" else "歇会儿，脑子有点乱")
        else:
            reason = f"先看清此刻：{slots.get('location') or '这里'} 的气氛"
        return {"kind": kind, "target": target, "reason": reason}

    # ------------------------------------------------------------------
    # intent 选择（关系向量加权）
    # ------------------------------------------------------------------
    def _pick_intent(self, rel_summary: str) -> str:
        rl = rel_summary.lower()
        def _val(key: str) -> int:
            m = re.search(rf"{key}=([+\-]?\d+)", rl)
            return int(m.group(1)) if m else 0

        trust = _val("trust")
        fondness = _val("fondness")
        jealousy = _val("jealousy")
        guilt = _val("guilt")

        scored: list[tuple[str, float]] = [
            ("示好",   max(0, fondness) * 2.0 + max(0, trust) * 1.0),
            ("拉拢",   max(0, fondness) * 1.0 + max(0, trust) * 1.5),
            ("挑衅",   max(0, -fondness) * 1.5 + max(0, jealousy) * 1.5),
            ("挖苦",   max(0, -fondness) * 1.0 + max(0, jealousy) * 1.0),
            ("质问",   max(0, -trust) * 2.0),
            ("试探",   max(0, -trust) * 1.0 + 1.0),
            ("忏悔",   max(0, guilt) * 2.0),
            ("示弱",   max(0, guilt) * 1.5 + max(0, -trust) * 0.5),
            ("敷衍",   1.0),
            ("示警",   max(0, -trust) * 0.5 + max(0, jealousy) * 0.5),
        ]
        total = sum(w for _, w in scored)
        if total <= 0:
            return "敷衍"
        r = self._rng.random() * total
        cum = 0.0
        for label, w in scored:
            cum += w
            if r <= cum:
                return label
        return "敷衍"
