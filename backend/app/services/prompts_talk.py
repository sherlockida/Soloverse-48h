"""Prompt 工厂 —— talk + decide prompt。

build_talk_prompt：talk tool 内部用（兼容 v4 旧签名）。
build_decide_prompt：v4 兼容入口，Builder 4 改 agent.py 前保持不破。
"""
from __future__ import annotations

from typing import Any, Optional

from app.services.prompts_reason import (
    DEFAULT_WORLD_BACKGROUND,
    _est_tokens,
    _fmt_plan,
    _fmt_recalled,
    _fmt_situation,
    _trim_recall,
)

# 输出契约：talk 阶段
TALK_OUTPUT_CONTRACT = """请严格返回单个 JSON 对象（禁止 markdown 围栏，禁止任何解释文字）：
{
  "thought": "<≤80字内心独白；你此刻心里真正想的；潜台词原则>",
  "inner_thought": "<同 thought，留作兼容；可直接复制>",
  "utterance": "<说出口的话，≤30字>",
  "intent": "试探|示好|挑衅|示弱|拉拢|质问|敷衍|示警|忏悔|挖苦",
  "relation_delta": {
    "trust": <-3至3整数>, "fondness": <-3至3整数>,
    "jealousy": <-3至3整数>, "guilt": <-3至3整数>
  }
}

潜台词原则：说出口的话不必等于心里想的。允许撒谎、暗讽、欲言又止、答非所问。

额外规则：
- utterance 中禁止出现「对方」二字，必须用对方名字（如沈晚、吴野）或省略称呼
- 说话要有场景感和关系感：根据关系、最近记忆、当前地点说具体的话
- 避免万能套话（如「陪我坐一会儿」「改天再说」），除非关系确实到了那一步
"""


def build_talk_prompt(
    *,
    # —— v5 新签名（推荐）——
    name: Optional[str] = None,
    persona: Optional[str] = None,
    voice: Optional[str] = None,
    other_name: str = "",
    recalled_memories: Optional[list[str]] = None,
    relation_summary: Optional[str] = None,
    relations_summary: Optional[list[dict]] = None,
    secret_agenda: Optional[str] = None,
    history_turns: Optional[list[dict]] = None,
    current_situation: Optional[dict] = None,
    current_plan: Optional[dict] = None,
    draft: Optional[str] = None,
    intent_hint: Optional[str] = None,
    threads: Optional[list[Any]] = None,
    world_background: str = "",
    token_budget: int = 1500,
    # —— v4 兼容签名（agent.py 旧调用走这条）——
    agent: Any = None,
    relation: Any = None,
    primed_memory: Optional[str] = None,
) -> tuple[str, str]:
    """talk tool prompt。

    两套签名都支持：
      v5 显式 slot：name/persona/voice/recalled_memories/relation_summary/...
      v4 旧入口：  agent=<Agent>, relation=<Relation>, primed_memory=str
    Builder 4 改 agent.py 时优先用 v5；旧调用照样能 work。
    """
    # —— v4 兼容：从 agent 对象抽 slot ——
    if agent is not None:
        name = name or getattr(agent, "name", "?")
        persona = persona or getattr(agent, "persona", "")
        voice = voice or getattr(agent, "voice", "")
        if recalled_memories is None:
            recents = getattr(agent, "recent_memories", lambda n=5: [])(5)
            recalled_memories = [m.short() if hasattr(m, "short") else str(m) for m in recents]
        if relation_summary is None and relation is not None:
            relation_summary = relation.summary() if hasattr(relation, "summary") else str(relation)
        if current_situation is None:
            current_situation = {"location": getattr(agent, "location", "?"),
                                 "nearby": [other_name] if other_name else []}
        if primed_memory:
            current_situation = dict(current_situation or {})
            current_situation.setdefault("just_heard", primed_memory)

    name = name or "?"
    persona_short = (persona or "")[:120]
    voice = voice or "（自然口语）"
    history_bullet = (
        "\n".join(f"  - {t.get('speaker','?')}: 「{t.get('utterance','')}」"
                  for t in (history_turns or []))
        if history_turns else "  - （首次对话）"
    )
    relation_block = relation_summary or "（中性）"
    if not relation_summary and relations_summary:
        # 从 relations_summary 找匹配
        for r in relations_summary:
            if r.get("name") == other_name:
                parts = [f"{k}={r.get(k,0):+d}"
                         for k in ("trust", "fondness", "jealousy", "guilt")
                         if abs(r.get(k, 0)) >= 3]
                relation_block = ", ".join(parts) or "中性"
                break
    world_bg = (world_background or DEFAULT_WORLD_BACKGROUND).strip()

    sys = f"""【世界设定】{world_bg}

你扮演 {name}。{persona_short}
你和 {other_name} 的关系：{relation_block}
说话风格：{voice}

{TALK_OUTPUT_CONTRACT}"""

    for recall_try in _trim_recall(list(recalled_memories or [])):
        recalled_block = _fmt_recalled(recall_try)
        situation_block = _fmt_situation(current_situation or {})
        plan_hint = ""
        if current_plan:
            plan_hint = f"\n【你眼下的 plan】\n{_fmt_plan(current_plan)}"
        draft_hint = f"\n【你的草稿（可润色，也可推翻）】{draft}" if draft else ""
        intent_hint_str = f"\n【建议 intent】{intent_hint}" if intent_hint else ""
        # v5.4（F4）：传 threads，让对话围绕心事
        from app.services.prompts_reason import _fmt_threads
        _tb = _fmt_threads(threads)
        threads_hint = (f"\n【你的未完结心事】(🔥=必须谈及)\n{_tb}"
                        if _tb.strip() and _tb.strip() != "  - （无）" else "")

        usr = f"""【情境】
{situation_block}

【对话历史（最近 3 轮）】
{history_bullet}

【你的隐藏目标】{secret_agenda or '顺其自然'}{threads_hint}

【你刚想起的事】
{recalled_block}{plan_hint}{draft_hint}{intent_hint_str}

请说一句话。"""

        total = _est_tokens(sys) + _est_tokens(usr)
        if total <= token_budget or not recall_try:
            return sys, usr
    return sys, usr  # type: ignore[return-value]


# ============================================================================
# v4 兼容入口 —— Builder 4 改 agent.py 前保持不破
# ============================================================================

DECIDE_SYSTEM = """【世界设定】{world_background}

你是 {name}。{persona}
长期目标：{goals_joined}
说话风格：{voice}

你必须严格返回 JSON 对象（不要 markdown 围栏，不要解释，不要多余文字）：
{{"action":"move|talk|work|rest","target":"<地点名或角色名；rest 时留空字符串>","reason":"<内心独白一句，≤20字>","thought":"<同 reason，≤80字详细版>"}}

规则：
- action=move：target 必须是【可去地点】之一
- action=talk：target 必须是【此处其他人】之一（同一地点才能说话）
- action=work：target 写当前地点名即可
- action=rest：休息
- 优先推进【未完结心事】，特别是【你刚听说的事】
- thought 字段是后面 SSE thought 事件的源，必须填
"""

DECIDE_USER = """【此刻】第 {day} 日 {time}，你在 {location}
【最近 5 条记忆】
{memories_bullet}

【此处其他人】{nearby_str}

【可去地点】{places_joined}

【未完结心事】（优先推进这些）
{threads_bullet}

【你刚听说的事】{primed_memory}

请决定下一刻做什么。"""


def build_decide_prompt(
    *, agent, day, time_str, location, memories, nearby_pairs, places, threads,
    primed_memory, world_background="",
):
    """v4 兼容：保持原签名，但 system 中新增 thought 字段要求。"""
    memories_bullet = "\n".join(
        f"- {m.short() if hasattr(m, 'short') else str(m)}" for m in memories
    ) or "- （空白）"
    nearby_str = "、".join(f"{n}（{r}）" for n, r in nearby_pairs) or "无"
    places_joined = "、".join(places)
    threads_bullet = "\n".join(
        f"- {t.short() if hasattr(t, 'short') else str(t)}" for t in threads
    ) or "- （无）"
    sys = DECIDE_SYSTEM.format(
        world_background=(world_background or DEFAULT_WORLD_BACKGROUND).strip(),
        name=agent.name,
        persona=agent.persona,
        goals_joined="；".join(agent.goals) or "（无）",
        voice=agent.voice,
    )
    usr = DECIDE_USER.format(
        day=day,
        time=time_str,
        location=location,
        memories_bullet=memories_bullet,
        nearby_str=nearby_str,
        places_joined=places_joined,
        threads_bullet=threads_bullet,
        primed_memory=primed_memory or "无",
    )
    return sys, usr
