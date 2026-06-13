"""Mock 后端输出生成 mixin —— talk / reason / reflect / narrative / summarize。

_MockOutputMixin(_MockGenMixin) 提供所有 _gen_* 输出方法：
- _gen_talk: 槽位组合 + 3-gram 去重 + 强制变形
- _gen_narrative: 低频组合叙事生成
- _gen_reason: 感知→分析→决策三段 thought + tool_calls
- _gen_reflect: 程序化"反思" + belief 沉淀
- _gen_summarize: 最近事件摘要
- lookup: 统一分发入口（缓存优先 → 生成器兜底）

最终组合类 _MockBackend = _MockOutputMixin + _MockBackendBase 在此文件底部。
MRO: _MockOutputMixin -> _MockGenMixin -> _MockBackendBase -> object
"""
from __future__ import annotations

import logging
import re
from typing import Any

from app.services.mock_backend import _MockBackendBase
from app.services.mock_data import (
    INTENT_TEMPLATES,
    MUTATION_PREFIXES,
    MUTATION_SUFFIXES,
    _MOCK_FALLBACKS,
)
from app.services.mock_gen import _MockGenMixin
from app.services.providers import _trigrams

logger = logging.getLogger("echoworld.llm")


class _MockOutputMixin(_MockGenMixin):
    """Mock 输出生成 mixin。继承 _MockGenMixin 获得 _pick_slang / _pick_intent / _gen_decide。

    依赖 _MockBackendBase 提供：
    - _rng, _cache, _uttered_trigrams, _extract_slots
    """

    # ------------------------------------------------------------------
    # talk：槽位组合 + 3-gram 去重 + 强制变形
    # ------------------------------------------------------------------
    def _gen_talk(self, system: str, user: str) -> dict:
        slots = self._extract_slots(system, user)
        self_name = slots["self_name"]
        other = slots["other"]
        persona = slots["persona"]
        voice = slots["voice"]

        intent = self._pick_intent(slots["rel_summary"])
        slang = self._pick_slang(persona, voice, fallback_blob=system + user[:160])
        thread_target = slots["thread_targets"][0] if slots["thread_targets"] else other
        place = slots["location"]

        fmt_slots = {
            "other": other, "name": self_name, "slang": slang,
            "memory_hint": slots["memory_hint"], "thread_target": thread_target,
            "place": place, "location": place,
        }
        templates = INTENT_TEMPLATES.get(intent, INTENT_TEMPLATES["敷衍"])
        history_grams = self._uttered_trigrams.setdefault(self_name, set())

        utterance = ""
        for _attempt in range(5):
            tpl = self._rng.choice(templates)
            try:
                cand = tpl.format(**fmt_slots)
            except Exception:
                cand = tpl
            cand_grams = _trigrams(cand)
            if not cand_grams:
                utterance = cand
                break
            overlap = len(cand_grams & history_grams) / max(1, len(cand_grams))
            if overlap <= 0.5:
                utterance = cand
                break
            utterance = cand
        else:
            utterance = (
                self._rng.choice(MUTATION_PREFIXES)
                + utterance
                + self._rng.choice(MUTATION_SUFFIXES)
            )

        history_grams.update(_trigrams(utterance))
        if len(history_grams) > 1500:
            lst = list(history_grams)
            self._rng.shuffle(lst)
            self._uttered_trigrams[self_name] = set(lst[:750])

        hint = slots.get("memory_hint") or ""
        rel_summary = slots.get("rel_summary") or ""
        intent_inner_map = {
            "示好":   f"（{hint}……要不要再靠近一点）" if hint else f"（{other}……今天看上去比平时近）",
            "拉拢":   f"（拉住 {other}，比独自扛{hint[:8] or '事'}强）",
            "试探":   f"（{other} 知道多少？{hint[:10] or '那件事'}得探出来）",
            "质问":   f"（憋了这么久，今天必须说{hint[:10] or '清楚'}）",
            "挖苦":   f"（{rel_summary or '心里堵'}：嘴上软不下来）",
            "敷衍":   f"（{hint}……不想多说）" if hint else f"（{slang}）",
            "示弱":   f"（{other} 还能信我吗？{hint[:10]}）",
            "挑衅":   f"（看 ta 这副样子，火气压不住）",
            "示警":   f"（{hint[:10] or '别走错'}——这话得说在前面）",
            "忏悔":   f"（{hint[:10] or '欠下的'} 不还，今夜难眠）",
        }
        inner = intent_inner_map.get(intent) or (
            f"（{hint}……还没翻篇）" if hint and hint != "那件事"
            else f"（对 {other}：{rel_summary or '说不上来'}）"
        )

        delta_map = {
            "示好":  {"trust": 1, "fondness": 2, "jealousy": 0, "guilt": 0},
            "拉拢":  {"trust": 1, "fondness": 1, "jealousy": 0, "guilt": 0},
            "试探":  {"trust": -1, "fondness": 0, "jealousy": 0, "guilt": 0},
            "质问":  {"trust": -2, "fondness": -1, "jealousy": 0, "guilt": 1},
            "挖苦":  {"trust": -1, "fondness": -2, "jealousy": 1, "guilt": 0},
            "敷衍":  {"trust": 0, "fondness": 0, "jealousy": 0, "guilt": 0},
            "示弱":  {"trust": 1, "fondness": 1, "jealousy": 0, "guilt": 1},
            "挑衅":  {"trust": -2, "fondness": -2, "jealousy": 1, "guilt": 0},
            "示警":  {"trust": -1, "fondness": 0, "jealousy": 0, "guilt": 0},
            "忏悔":  {"trust": 1, "fondness": 1, "jealousy": 0, "guilt": -1},
        }
        delta = dict(delta_map.get(intent, {"trust": 0, "fondness": 0, "jealousy": 0, "guilt": 0}))
        delta = {k: int(v) + self._rng.choice([-1, 0, 0, 0, 1]) for k, v in delta.items()}

        return {
            "utterance": utterance, "inner_thought": inner,
            "intent": intent, "relation_delta": delta,
        }

    # ------------------------------------------------------------------
    # narrative
    # ------------------------------------------------------------------
    def _gen_narrative(self, system: str, user: str) -> dict:
        actors = list(dict.fromkeys(
            re.findall(r"\]\s*([\w一-鿿·\-]+)\s*(?:→|对|从|在|向)", user)
        ))[:4]
        if not actors or self._rng.random() < 0.7:
            return {"headlines": []}
        templates = [
            "{a} 和 {b} 之间的暗流终于浮上水面",
            "{a} 当众失态，全场目光聚焦",
            "{a} 在 {b} 面前说漏了嘴",
            "{a} 偷偷做了一件没人知道的事",
            "{b} 被 {a} 一句话刺中了痛处",
        ]
        a = actors[0]
        b = actors[1] if len(actors) > 1 else actors[0]
        headline = self._rng.choice(templates).format(a=a, b=b)
        return {"headlines": [{
            "headline": headline, "involved": actors[:3], "chain": [],
            "drama": self._rng.choice([6, 7, 7, 8]),
            "predict_next": self._rng.choice([
                "下一幕，矛盾还会发酵", "可能有人会站出来", "看似平息，其实更深",
            ]),
        }]}

    # ------------------------------------------------------------------
    # reason
    # ------------------------------------------------------------------
    def _gen_reason(self, system: str, user: str) -> dict:
        slots = self._extract_slots(system, user)
        nearby = list(slots.get("nearby_names") or [])
        places = list(slots.get("places") or [])
        primed = slots.get("primed") or ""
        hint = slots.get("memory_hint") or ""
        thread_targets = slots.get("thread_targets") or []
        thread_target = thread_targets[0] if thread_targets else ""
        self_name = slots.get("self_name") or "我"
        location = slots.get("location") or "这里"
        rel_summary = slots.get("rel_summary") or ""

        perceived = []
        if primed:
            perceived.append(f"刚听说「{primed[:18]}」")
        if nearby:
            perceived.append(f"{nearby[0]} 就在身边")
        elif location:
            perceived.append(f"此刻在 {location}")
        analysis = ""
        if thread_target and thread_target in nearby:
            analysis = f"——{thread_target} 这事不能再拖"
        elif primed and any(n in primed for n in nearby):
            who = next(n for n in nearby if n in primed)
            analysis = f"——{who} 应该听到一些风声"
        elif hint and hint != "那件事":
            analysis = f"——「{hint[:12]}」一直没下文"

        decision = ""
        if nearby and (primed or thread_target or hint != "那件事"):
            decision = f"，先找 {thread_target if thread_target in nearby else nearby[0]} 探探口风"
        elif places:
            decision = f"，挪到 {places[0]} 换个气氛"
        else:
            decision = "，先把手上的事做完"
        thought = ("、".join(perceived) + analysis + decision).strip("，、 ")
        if not thought:
            thought = f"{self_name} 站在 {location}，一时不知该怎么动"

        tool_calls: list[dict] = []
        if hint and hint != "那件事" and self._rng.random() < 0.5:
            tool_calls.append({"name": "recall", "args": {"query": hint[:20]}})
        if nearby:
            target_name = (thread_target if thread_target in nearby else
                           next((n for n in nearby if primed and n in primed), nearby[0]))
            intent = self._pick_intent(rel_summary)
            tool_calls.append({"name": "talk",
                               "args": {"target": target_name, "intent": intent, "draft": ""}})
        elif places:
            target_place = places[0]
            for p in places:
                if (primed and p in primed) or (hint and p in hint):
                    target_place = p
                    break
            if not (primed and target_place in primed):
                target_place = self._rng.choice(places)
            tool_calls.append({"name": "move", "args": {"place": target_place}})
        else:
            focus = hint[:12] if hint and hint != "那件事" else ""
            tool_calls.append({"name": "work", "args": {"focus": focus}})

        return {"thought": thought[:80], "tool_calls": tool_calls[:3], "plan_patch": {}}

    # ------------------------------------------------------------------
    # reflect
    # ------------------------------------------------------------------
    def _gen_reflect(self, system: str, user: str) -> dict:
        slots = self._extract_slots(system, user)
        hint = slots.get("memory_hint") or ""
        nearby = slots.get("nearby_names") or []
        thread_targets = slots.get("thread_targets") or []

        traces = re.findall(r"-\s*([^\n]+)", user)
        recent = traces[-1][:30] if traces else hint[:30] or "今日无大事"
        thought = f"回看：{recent}……心里慢慢有了底"

        beliefs: list[str] = []
        candidate_target = thread_targets[0] if thread_targets else (nearby[0] if nearby else "")
        if candidate_target and self._rng.random() < 0.3:
            tmpl = self._rng.choice([
                f"{candidate_target} 这人话里有话，不能全信",
                f"对 {candidate_target} 别再先开口，让 ta 自己说",
                f"{candidate_target} 在 {slots.get('location') or '这里'} 总是绕弯",
            ])
            beliefs.append(tmpl[:50])

        return {
            "thought": thought[:80], "plan_patch": {},
            "belief_update": beliefs, "thread_changes": {},
        }

    # ------------------------------------------------------------------
    # summarize
    # ------------------------------------------------------------------
    def _gen_summarize(self, system: str, user: str) -> dict:
        ev_lines = re.findall(r"-\s*([^\n]+)", user)
        if not ev_lines:
            return {"summary": ""}
        first = ev_lines[0][:14]
        last = ev_lines[-1][:14]
        return {"summary": f"这段日子从「{first}」走到「{last}」"}

    # ------------------------------------------------------------------
    # 统一入口
    # ------------------------------------------------------------------
    def lookup(self, prompt_hash: str, kind: str,
               system: str = "", user: str = "") -> Any:
        from app.services.llm_client import _safe_parse_json

        text = self._cache.get(prompt_hash)
        if text is not None:
            parsed = _safe_parse_json(text)
            if parsed is not None:
                return parsed
        try:
            gen_map = {
                "decide": self._gen_decide, "talk": self._gen_talk,
                "narrative": self._gen_narrative, "reason": self._gen_reason,
                "reflect": self._gen_reflect, "summarize": self._gen_summarize,
            }
            gen_fn = gen_map.get(kind)
            if gen_fn is not None:
                return gen_fn(system, user)
        except Exception as e:
            logger.warning(f"mock gen fail kind={kind}: {e}")
        return _MOCK_FALLBACKS.get(kind, {})


# ======================================================================
# 最终组合类
# ======================================================================

class _MockBackend(_MockOutputMixin, _MockBackendBase):
    """规则 + 组合槽位生成器（最终组合类）。

    MRO: _MockOutputMixin -> _MockGenMixin -> _MockBackendBase -> object
    """
    pass
