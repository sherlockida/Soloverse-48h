"""recall / summarize 算法（无外部 embedding）。

recall: MMR + Jaccard + TF + recency + emotion + importance 打分去重取 top-k。
summarize: 最旧 N 条压成 1 条 summary，LLM 8s 超时保护，失败程序化降级。
append_semantic / build_recall_query 为辅助工具。依赖 app.models.memory。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.models.memory import Memory, tokenize

logger = logging.getLogger("echoworld.memory")


# ---------- recall 评分组件 ----------

def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


def _tf_overlap(q_tokens: set[str], m_tf: dict[str, int]) -> float:
    """query 命中 memory 词频的归一化得分，限制在 [0,1]。"""
    if not q_tokens or not m_tf:
        return 0.0
    total = sum(m_tf.values())
    if total <= 0:
        return 0.0
    hit = sum(m_tf.get(t, 0) for t in q_tokens)
    if hit <= 0:
        return 0.0
    # 命中权重相对 memory 总词频做归一化，至少除以 3 避免短句过爆
    return min(1.0, hit / max(3.0, total))


def _recency_decay(age: int, half_window: int = 50) -> float:
    if age <= 0:
        return 1.0
    return max(0.0, 1.0 - age / half_window)


def _emotion_boost(emotion: int) -> float:
    # |emotion| in [0,5] -> boost in [0, 0.5]
    return min(0.5, abs(int(emotion)) / 10.0)


def _score(mem: Memory, q_tokens: set[str], cur_tick: int) -> float:
    """主打分：jaccard*0.6 + tf*0.3 + recency*0.1，importance 作乘子，emotion 作加法 boost。"""
    if not q_tokens:
        return 0.0
    j = _jaccard(q_tokens, mem.tokens())
    tfo = _tf_overlap(q_tokens, mem.tf())
    rec = _recency_decay(max(0, cur_tick - mem.tick))
    base = j * 0.6 + tfo * 0.3 + rec * 0.1
    # importance 在 1..10 -> 乘子在 0.6..1.4
    imp_factor = 0.6 + (mem.effective_importance / 10.0) * 0.8
    return base * imp_factor + _emotion_boost(mem.emotion)


# ---------- recall 主函数 ----------

def recall(
    memories: list[Memory],
    query: str,
    *,
    k: int = 5,
    cur_tick: Optional[int] = None,
    semantic: Optional[list[Memory]] = None,
    mmr_lambda: float = 0.7,
    min_score: float = 0.02,
) -> list[Memory]:
    """根据 query 召回 top-k 最相关 memory，MMR 去重。返回 list[Memory]，长度 <= k。

    - memories: episodic memory 列表（通常是 agent.memories）
    - query:    自然语言描述当前情境，如 "在 茶水间 看到 Mia 阿凯 想 talk"
    - k: 返回上限；cur_tick: 当前 tick，缺省取 memories 内最大 tick
    - semantic: 可选 semantic memory（不进 30 条截断窗口），与 episodic 一起打分
    - mmr_lambda: 0..1，越高越偏 relevance，越低越偏多样性
    - min_score: 低于此分的 memory 不进候选；全 0 时回退最近 3 条 episodic
    """
    if k <= 0:
        return []
    if not memories and not semantic:
        return []

    if cur_tick is None:
        cur_tick = max(
            (m.tick for m in (memories or [])),
            default=max((m.tick for m in (semantic or [])), default=0),
        )

    q_tokens = set(tokenize(query or ""))
    if not q_tokens:
        # query 空 -> 直接退最近 episodic，仍按 k 截断
        recent = list(memories)[-k:]
        return recent

    pool: list[Memory] = list(memories or [])
    if semantic:
        pool.extend(semantic)

    scored: list[tuple[Memory, float]] = []
    for m in pool:
        try:
            s = _score(m, q_tokens, cur_tick)
        except Exception as e:
            logger.debug(f"score 异常 {e} on {m.short()}")
            s = 0.0
        if s >= min_score:
            scored.append((m, s))

    if not scored:
        # 全无命中 -> 用最近 3 条 episodic 兜底，保证 prompt 不空
        return list(memories)[-min(3, len(memories)):]

    scored.sort(key=lambda x: -x[1])

    # MMR 选 top-k：每步挑 (mmr_lambda*rel - (1-mmr_lambda)*max_jaccard_with_selected) 最大者
    selected: list[Memory] = []
    candidates = scored[: max(k * 4, k + 2)]  # 限制候选池规模
    while candidates and len(selected) < k:
        best_i = 0
        best_mmr = -1e18
        for i, (m, rel) in enumerate(candidates):
            if not selected:
                mmr = rel
            else:
                max_sim = max(_jaccard(m.tokens(), s.tokens()) for s in selected)
                mmr = mmr_lambda * rel - (1.0 - mmr_lambda) * max_sim
            if mmr > best_mmr:
                best_mmr = mmr
                best_i = i
        chosen, _ = candidates.pop(best_i)
        selected.append(chosen)

    return selected


# ---------- summarize：episodic -> semantic ----------

def should_summarize(
    memories: list[Memory],
    *,
    last_summarize_tick: int = -999,
    cur_tick: int = 0,
    threshold: int = 30,
    cooldown: int = 10,
) -> bool:
    """触发条件：episodic 数 > threshold 且距上次 summarize >= cooldown tick。"""
    return len(memories) > threshold and (cur_tick - last_summarize_tick) >= cooldown


def _programmatic_summary(old: list[Memory]) -> str:
    """LLM 不可用时的程序化降级摘要。"""
    if not old:
        return ""
    min_tick = min(m.tick for m in old)
    max_tick = max(m.tick for m in old)
    emo_avg = sum(m.emotion for m in old) / len(old)
    participant_count: dict[str, int] = {}
    for m in old:
        for p in m.participants:
            participant_count[p] = participant_count.get(p, 0) + 1
    top_actor = (
        max(participant_count.items(), key=lambda x: x[1])[0]
        if participant_count else "周围人"
    )
    if emo_avg > 0.8:
        mood = "氛围积极"
    elif emo_avg < -0.8:
        mood = "氛围低落"
    else:
        mood = "氛围起伏不大"
    return f"t{min_tick}-{max_tick} 多与 {top_actor} 互动，{mood}"


async def summarize(
    memories: list[Memory],
    *,
    llm=None,
    take: int = 10,
) -> Optional[Memory]:
    """挑最旧 take 条 episodic -> 浓缩成 1 条 summary Memory。

    LLM 可用则调用 chat_json(kind="summarize")（8s 超时，失败/超时/解析错误
    均降级到程序化拼接）；llm 为 None 时直接程序化拼接。
    返回 Memory(kind="summary")，输入空返回 None；caller 负责追加到 semantic。
    """
    if not memories:
        return None
    old = memories[: take]
    if not old:
        return None

    text = _programmatic_summary(old)

    if llm is not None:
        try:
            lines = "\n".join(f"- {m.short()}" for m in old)
            sys = (
                "你是 agent 的记忆压缩器。把下列多条事件浓缩为一句 <=30 字的第一人称中文摘要，"
                "聚焦最重要的人/事/感受。只输出纯文本一句话，不要 JSON、不要前缀、不要引号。"
            )
            usr = f"事件流：\n{lines}\n\n请输出一句话摘要："

            # 8 秒超时保护：超时自动降级到程序化摘要
            data, _usage = await asyncio.wait_for(
                llm.chat_json(sys, usr, kind="summarize"),
                timeout=8.0,
            )

            cand: Optional[str] = None
            if isinstance(data, str):
                cand = data
            elif isinstance(data, dict):
                for key in ("summary", "text", "content", "result"):
                    v = data.get(key)
                    if isinstance(v, str) and v.strip():
                        cand = v
                        break
            if cand:
                cand = cand.strip().strip("「」\"' ")
                if cand:
                    text = cand[:60]
        except asyncio.TimeoutError:
            logger.warning("summarize LLM 超时（8s），使用程序化兜底")
        except Exception as e:
            logger.debug(f"summarize LLM 失败，使用程序化兜底: {e}")

    participant_count: dict[str, int] = {}
    for m in old:
        for p in m.participants:
            participant_count[p] = participant_count.get(p, 0) + 1
    top_actors = [p for p, _ in sorted(participant_count.items(), key=lambda x: -x[1])[:3]]
    emo_avg = sum(m.emotion for m in old) / len(old)
    return Memory(
        tick=min(m.tick for m in old),
        kind="summary",
        content=text or "（一段难以言说的回忆）",
        emotion=int(round(emo_avg)),
        participants=top_actors,
        importance=5,
    )


# ---------- semantic 列表维护 ----------

def append_semantic(
    semantic_list: list[Memory],
    new: Memory,
    *,
    cap: int = 20,
) -> list[Memory]:
    """把一条 semantic memory 追加进列表并维护上限。

    超过 cap 时淘汰：(importance 升序, tick 升序) 最小者优先淘汰，
    确保高 importance 的长期信念不被新 summary 顶掉。
    in-place 修改并返回同一引用，方便链式。
    """
    if not new.is_semantic():
        logger.warning(f"append_semantic 收到非 semantic kind={new.kind}，仍接受")
    semantic_list.append(new)
    if len(semantic_list) > cap:
        semantic_list.sort(key=lambda m: (m.effective_importance, m.tick))
        # 砍掉最弱那条
        del semantic_list[0]
    return semantic_list


# ---------- 便利函数：根据 perception 构造 recall query ----------

def build_recall_query(
    *,
    location: str = "",
    nearby_names: Optional[list[str]] = None,
    primed_memory: Optional[str] = None,
    plan_goal: str = "",
    recent_event_text: str = "",
) -> str:
    """把当前情境拼成一句话喂 recall()。caller 想自定义可以不调用。"""
    bits = []
    if location:
        bits.append(location)
    if nearby_names:
        bits.append(" ".join(nearby_names))
    if primed_memory:
        bits.append(primed_memory)
    if plan_goal:
        bits.append(plan_goal)
    if recent_event_text:
        bits.append(recent_event_text)
    return " ".join(b for b in bits if b)
