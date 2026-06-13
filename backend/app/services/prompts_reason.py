"""Prompt 工厂 —— 共享格式化工具 + reason prompt。

共享 slot 格式化器（_fmt_*）和 token 预算工具（_est_tokens / _trim_recall）集中在此文件，
供 prompts_talk / prompts_other / prompts_narrative 按需 import。

v5 核心：build_reason_prompt —— 主循环：感知→分析→决策→tool_calls。
"""
from __future__ import annotations

from typing import Any, Iterable, Optional

# 默认 slot 内容（caller 可覆盖）

DEFAULT_WORLD_BACKGROUND = "一个普通的小世界"

TOOL_REGISTRY_BRIEF_DEFAULT = """你可调用的工具（tool_calls 数组，0-3 个，按顺序执行）：
  talk(target: str, intent: str, draft: str)
      和【此处其他人】之一说话；intent 例：试探/示好/挑衅/示弱/拉拢/质问/敷衍/示警/忏悔/挖苦
      draft 是你想说的草稿（最终 utterance 由 talk 子 prompt 润色，可留空）
  move(place: str)
      移动到【可去地点】之一
  work()
      在原地做事
  observe(target: str)
      仔细观察某人或环境（target 为人名或地点；产生 observation，不消耗 talk 名额）
  recall(query: str)
      主动回忆和 query 相关的事（产生新的 recalled_memories，不消耗 talk 名额）
  plan(steps: list[str])
      重写 short_term_plan 的 steps（一般用 plan_patch 增量更新，整段重写慎用）
  introspect()
      内省，理清思路（仅产生 thought，不消耗 talk 名额，相当于"软思考 tick"）

  注：talk_calls 首项是 observe / recall / introspect 时算"软思考 tick"，
      允许后接 talk/move/work 等"硬动作"，自然涵盖"先想再做"。
"""

# 输出契约：reason 阶段的 JSON schema
REASON_OUTPUT_CONTRACT = """请严格返回单个 JSON 对象（禁止 markdown 围栏，禁止任何解释文字）：
{
  "thought": "<≤80字内心独白；结构：先感知（我看到/感到…）→再分析（这意味着…）→再决策（所以我要…）>",
  "tool_calls": [
    {"name": "<工具名>", "args": {"...": "..."}}
  ],
  "plan_patch": {
    "mark_done": [<已完成步骤的索引整数>],
    "add_steps": [{"intent": "<新加入的 step 文字描述，≤20字>"}],
    "replace_goal": "<可选；若要改 goal 才填，否则省略>"
  }
}

硬规则：
  - thought 字段必填，且必须真实反映你这一刻的想法
  - 若【⚠️ 世界刚发生】栏非空，thought 必须先回应它（围绕事件展开），再谈别的
  - tool_calls 可以是空数组（=本 tick 只想不动），但建议至少 1 个
  - tool_calls 内的 name 必须出自上方工具清单
  - move 的 place 必须出自【可去地点】；talk 的 target 必须出自【此处其他人】
  - plan_patch 可以全空 {{}}；若你完成了某步骤，记得 mark_done
  - 若【未完结心事】栏有🔥标记的心事，thought 必须围绕它展开，tool_calls 必须推进它（talk/observe/recall 中选与心事相关的）
"""

# token 预算工具

def _est_tokens(s: str) -> int:
    """粗估 token 数：CJK 1.2/char，ASCII 0.3/char。对 GLM/DeepSeek/Qwen tokenizer 偏保守。"""
    if not s:
        return 0
    n = 0.0
    for c in s:
        n += 1.2 if ord(c) > 127 else 0.3
    return int(n) + 1

def _trim_recall(recalled: list[str], step_levels: tuple[int, ...] = (5, 3, 2, 1)) -> Iterable[list[str]]:
    """生成器：依次给出 recall 被裁短的版本，让外层挑第一个满足预算的。"""
    seen = set()
    for k in step_levels:
        cut = recalled[:k]
        key = tuple(cut)
        if key in seen:
            continue
        seen.add(key)
        yield cut
    yield []  # 最后兜底：全砍

# slot 格式化

def _fmt_persona(persona: str, goals: Optional[list[str]] = None) -> str:
    persona = (persona or "").strip() or "（无设定）"
    if goals:
        goals_str = "；".join(g for g in goals if g)
        if goals_str:
            return f"{persona}\n  长期目标：{goals_str}"
    return persona

def _fmt_plan(current_plan: Optional[dict]) -> str:
    """current_plan = {'goal': str, 'steps': [{'intent': str, 'status': 'done|doing|pending'}]}。"""
    if not current_plan:
        return "  goal: （未制定）\n  steps: （空）"
    goal = current_plan.get("goal") or "（未制定）"
    steps = current_plan.get("steps") or []
    if not steps:
        return f"  goal: {goal}\n  steps: （空）"
    lines = [f"  goal: {goal}", "  steps:"]
    icon = {"done": "✓ [done]", "doing": "▶ [doing]", "pending": "☐ [pending]"}
    for i, s in enumerate(steps):
        status = s.get("status", "pending")
        intent = s.get("intent", "（？）")
        lines.append(f"    {i}. {icon.get(status, '☐')} {intent}")
    return "\n".join(lines)

def _fmt_recalled(recalled: list[str]) -> str:
    if not recalled:
        return "  - （此刻没想起什么）"
    return "\n".join(f"  - {m}" for m in recalled)

def _fmt_relations(relations_summary: Optional[list[dict]], top_k: int = 3) -> str:
    """自动取 |trust|+|fondness|+|jealousy|+|guilt| Top-K 关系。"""
    if not relations_summary:
        return "  - （还没建立任何关系）"
    def _score(r):
        return abs(r.get("trust", 0)) + abs(r.get("fondness", 0)) + \
               abs(r.get("jealousy", 0)) + abs(r.get("guilt", 0))
    ranked = sorted(relations_summary, key=_score, reverse=True)[:top_k]
    ranked = [r for r in ranked if _score(r) >= 3]  # 过弱不展示
    if not ranked:
        return "  - （目前关系都很淡）"
    lines = []
    for r in ranked:
        parts = []
        for k in ("trust", "fondness", "jealousy", "guilt"):
            v = r.get(k, 0)
            if abs(v) >= 3:
                parts.append(f"{k}={v:+d}")
        tag = r.get("tag") or ""
        suffix = f" → \"{tag}\"" if tag else ""
        lines.append(f"  - {r.get('name','?')} {' '.join(parts) or '中性'}{suffix}")
    return "\n".join(lines)

def _fmt_threads(threads: Optional[list[Any]]) -> str:
    """threads: list[Thread]-like。v5.4（F4）：高权重(w>=7)🔥必须推进，中(4-6)▶建议，低(<4)·可选。"""
    if not threads:
        return "  - （无）"
    lines = []
    for t in threads[:5]:
        if hasattr(t, "short"):
            raw = t.short()
        elif isinstance(t, dict):
            tgt = t.get("target")
            w = t.get("weight", 5)
            desc = t.get("desc", "?")
            raw = f"({w}) 关于 {tgt}：{desc}" if tgt else f"({w}) {desc}"
        else:
            raw = str(t)
        w = t.weight if hasattr(t, "weight") else (t.get("weight", 5) if isinstance(t, dict) else 5)
        if w >= 7:
            lines.append(f"  🔥 {raw}")
        elif w >= 4:
            lines.append(f"  ▶ {raw}")
        else:
            lines.append(f"  · {raw}")
    return "\n".join(lines)

def _fmt_situation(situation: dict, *, just_heard_max_len: int = 0,
                   shocks_keep: int = 3) -> str:
    """渲染当前情境；world_shocks 非空时插入⚠️栏，just_heard_max_len 截断，shocks_keep 控制条数。"""
    day = situation.get("day", "?")
    time_str = situation.get("time", "?")
    location = situation.get("location", "?")
    nearby = situation.get("nearby") or []
    if nearby and isinstance(nearby[0], tuple):
        nearby_str = "、".join(f"{n}（{tag}）" if tag else n for n, tag in nearby)
    else:
        nearby_str = "、".join(str(n) for n in nearby)
    places = situation.get("places") or []
    places_str = "、".join(places) or "（无）"
    just_heard = situation.get("just_heard") or "无"
    if just_heard_max_len and just_heard != "无" and len(just_heard) > just_heard_max_len:
        just_heard = just_heard[:just_heard_max_len] + "…"
    just_happened = situation.get("just_happened")

    lines = [
        f"  此刻：第 {day} 日 {time_str}，你在 {location}",
        f"  此处其他人：{nearby_str or '无'}",
        f"  可去地点：{places_str}",
        f"  刚听说：{just_heard}",
    ]
    if just_happened:
        lines.append(f"  刚发生：{just_happened}")

    # v5.3：顶部插【⚠️ 世界刚发生】栏（affects_me 加 🔥 前缀）
    shocks = situation.get("world_shocks") or []
    if shocks and shocks_keep > 0:
        # 排序：affects_me 优先，dist 越小越靠前
        shocks_sorted = sorted(shocks, key=lambda s: (not s.get("affects_me"), s.get("dist", 99)))
        kept = shocks_sorted[:max(1, shocks_keep)]
        head = ["  ⚠️ 世界刚发生（你必须先回应这个）："]
        for s in kept:
            prefix = "🔥" if s.get("affects_me") else "·"
            text = str(s.get("text", ""))[:60]
            head.append(f"    {prefix} (t{s.get('tick','?')}, {s.get('dist','?')} tick 前) {text}")
        lines = head + lines

    return "\n".join(lines)

def _fmt_tools(tools: Optional[list[str]]) -> str:
    """工具名白名单；None 用默认全套。"""
    if tools is None:
        return TOOL_REGISTRY_BRIEF_DEFAULT
    # 仅保留命中的行（粗匹配）
    keep = []
    for line in TOOL_REGISTRY_BRIEF_DEFAULT.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("注") or stripped.startswith("你可"):
            keep.append(line)
            continue
        if any(line.lstrip().startswith(f"{t}(") or line.lstrip().startswith(f"{t} ") or
               line.lstrip().startswith(f"{t}\n") for t in tools):
            keep.append(line)
    return "\n".join(keep) if keep else TOOL_REGISTRY_BRIEF_DEFAULT

# v5 reason prompt

def build_reason_prompt(
    *,
    name: str,
    persona: str,
    voice: str,
    goals: Optional[list[str]] = None,
    current_plan: Optional[dict] = None,
    recalled_memories: Optional[list[str]] = None,
    semantic_beliefs: Optional[list[str]] = None,
    relations_summary: Optional[list[dict]] = None,
    threads: Optional[list[Any]] = None,
    current_situation: Optional[dict] = None,
    available_tools: Optional[list[str]] = None,
    world_background: str = "",
    token_budget: int = 2000,
) -> tuple[str, str]:
    """主循环 reason prompt：感知→分析→决策→tool_calls。超预算时三维裁剪 recall/primed/shocks。"""
    persona_block = _fmt_persona(persona, goals)
    tools_block = _fmt_tools(available_tools)
    recalled = list(recalled_memories or [])
    beliefs_block = _fmt_recalled(semantic_beliefs or []) if semantic_beliefs else "  - （暂无）"
    relations_block = _fmt_relations(relations_summary)
    threads_block = _fmt_threads(threads)
    plan_block = _fmt_plan(current_plan)
    world_bg = (world_background or DEFAULT_WORLD_BACKGROUND).strip()

    sys = f"""【世界设定】{world_bg}

【你是谁】你叫 {name}。
{persona_block}
【说话风格】{voice or '（自然口语）'}

{tools_block}

{REASON_OUTPUT_CONTRACT}"""

    # v5.3：三维裁剪 —— recall_try / primed_len / shocks_keep
    trim_levels: list[tuple[int, int, int]] = [
        (5, 0, 3),   # 默认：5 条 recall，primed 不截断，shock 保留 3 条
        (3, 80, 2),  # 一档
        (2, 60, 2),  # 二档
        (1, 40, 1),  # 三档
        (0, 20, 1),  # 极限档：无 recall，primed 砍到 20 字，shock 只留 1 条（affects_me 优先）
    ]
    usr = ""
    for recall_n, primed_len, shocks_keep in trim_levels:
        recall_try = recalled[:recall_n]
        recalled_block = _fmt_recalled(recall_try)
        situation_block = _fmt_situation(
            current_situation or {},
            just_heard_max_len=primed_len,
            shocks_keep=shocks_keep,
        )
        usr = f"""【情境】
{situation_block}

【你对世界的认知】(长期信念)
{beliefs_block}

【你刚想起来的事】(相关记忆 Top-{len(recall_try)})
{recalled_block}

【关系速描】(Top-3，按强度排序)
{relations_block}

【未完结心事】(🔥=必须推进 ▶=建议推进)
{threads_block}

【当前 plan】
{plan_block}

请按上方 JSON 契约决定接下来这一刻：先想，再选工具。"""

        total = _est_tokens(sys) + _est_tokens(usr)
        if total <= token_budget:
            return sys, usr
    # 走完所有档仍超：返回最后一档（兜底）
    return sys, usr
