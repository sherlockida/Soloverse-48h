"""Prompt 工厂 —— reflect + narrative prompt。

build_reflect_prompt：每 5 tick 反思：plan_patch + belief_update + thread_changes。
build_narrative_prompt：编年史，沿用 v4。
"""
from __future__ import annotations

from typing import Any, Optional

from app.services.prompts_reason import (
    DEFAULT_WORLD_BACKGROUND,
    _est_tokens,
    _fmt_persona,
    _fmt_plan,
    _fmt_recalled,
    _fmt_relations,
    _fmt_situation,
    _fmt_threads,
    _trim_recall,
)

# 输出契约：reflect 阶段
REFLECT_OUTPUT_CONTRACT = """请严格返回单个 JSON 对象（禁止 markdown 围栏）：
{
  "thought": "<≤80字反思感悟；这几 tick 我学到了什么，下一步重心要不要调整>",
  "plan_patch": {
    "mark_done": [<已完成步骤索引>],
    "add_steps": [{"intent": "<新 step，≤20字>"}],
    "replace_goal": "<可选；只在 goal 需要调整时填>"
  },
  "belief_update": [
    "<新沉淀的语义信念，1 句话；将进入 semantic memory；最多 3 条>"
  ],
  "thread_changes": {
    "add":     [{"desc": "<新心事>", "target": "<可选>", "weight": <1-10>}],
    "resolve": [<已了结的 thread 索引整数>]
  }
}

规则：
  - 反思要诚实，不要为了产出而强行编造
  - belief_update 必须是"原则/规律"级别的，不是事件流水
  - 没什么可反思时各字段留空数组即可
"""


def build_reflect_prompt(
    *,
    name: str,
    persona: str,
    voice: str = "",
    goals: Optional[list[str]] = None,
    current_plan: Optional[dict] = None,
    recent_reasoning_traces: Optional[list[str]] = None,
    observations: Optional[list[str]] = None,
    recalled_memories: Optional[list[str]] = None,
    semantic_beliefs: Optional[list[str]] = None,
    relations_summary: Optional[list[dict]] = None,
    threads: Optional[list[Any]] = None,
    current_situation: Optional[dict] = None,
    world_background: str = "",
    token_budget: int = 1500,
) -> tuple[str, str]:
    """每 5 tick 反思一次：吃 reasoning_traces + observations，输出 plan_patch + belief_update + thread_changes。"""
    persona_block = _fmt_persona(persona, goals)
    beliefs_block = _fmt_recalled(semantic_beliefs or []) if semantic_beliefs else "  - （暂无）"
    relations_block = _fmt_relations(relations_summary)
    threads_block = _fmt_threads(threads)
    plan_block = _fmt_plan(current_plan)
    situation_block = _fmt_situation(current_situation or {})
    world_bg = (world_background or DEFAULT_WORLD_BACKGROUND).strip()

    traces_bullet = (
        "\n".join(f"  - {t}" for t in (recent_reasoning_traces or [])[-5:])
        if recent_reasoning_traces else "  - （无）"
    )
    obs_bullet = (
        "\n".join(f"  - {o}" for o in (observations or [])[-8:])
        if observations else "  - （无）"
    )

    sys = f"""【世界设定】{world_bg}

【你是谁】你叫 {name}。
{persona_block}
【说话风格】{voice or '（自然口语）'}

现在是周期性反思时刻。回看最近几 tick 的所思所感，决定：
  ① 当前 plan 哪些步骤已完成 / 该加 / goal 要不要换
  ② 这段经历能沉淀出什么"原则级"信念（belief_update）
  ③ 心事 thread 要不要新增 / 解决

{REFLECT_OUTPUT_CONTRACT}"""

    for recall_try in _trim_recall(list(recalled_memories or [])):
        recalled_block = _fmt_recalled(recall_try)
        usr = f"""【当前情境】
{situation_block}

【近 5 次内心独白】
{traces_bullet}

【近期观察】
{obs_bullet}

【相关旧记忆】
{recalled_block}

【已有语义信念】
{beliefs_block}

【关系速描】
{relations_block}

【未完结心事】
{threads_block}

【当前 plan】
{plan_block}

请按上方 JSON 契约反思。诚实优先，不要为产出而编造。"""

        total = _est_tokens(sys) + _est_tokens(usr)
        if total <= token_budget or not recall_try:
            return sys, usr
    return sys, usr  # type: ignore[return-value]


# ============================================================================
# narrative prompt —— 编年史，沿用 v4
# ============================================================================

NARRATIVE_SYSTEM = """你是小镇报社的主编。从近期事件中**挑出值得讲的故事线**。

判定标准（满足任一即可）：
①涉及关系剧变（trust/jealousy/guilt 大幅变化）
②同一两个角色反复出现
③明显冲突或合作
④反常行为
⑤伏笔回收

你必须严格返回 JSON 对象（不要 markdown 围栏，不要解释，不要多余文字）：
{{
  "headlines": [
    {{
      "headline": "≤25字，必须用动词，禁止写'某人去了某地'这种废话",
      "involved": ["角色A", "角色B"],
      "chain": ["事件1的一句话总结", "事件2的一句话总结", "事件3的一句话总结"],
      "drama": 1到10之间的整数,
      "predict_next": "一句话猜测下一步会发生什么"
    }}
  ]
}}

**只输出 drama>=6 的，最多 3 条。没值得讲的就返回 {{"headlines":[]}}**。
"""

NARRATIVE_USER = """【最近 {n_events} 条事件（已去重）】
{events_bullet}

【正在追踪的叙事线（不要重复报道；可标注'进展'）】
{active_threads_bullet}
"""


def build_narrative_prompt(*, events, active_headlines):
    events_bullet = (
        "\n".join(f"- [t{e.tick}|{e.kind}] {e.text}" for e in events)
        if events else "- （无）"
    )
    active = (
        "\n".join(f"- {h.get('headline','?')}" for h in active_headlines)
        if active_headlines else "- （无）"
    )
    sys = NARRATIVE_SYSTEM
    usr = NARRATIVE_USER.format(
        n_events=len(events),
        events_bullet=events_bullet,
        active_threads_bullet=active,
    )
    return sys, usr
