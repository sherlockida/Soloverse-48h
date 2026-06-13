"""Agent 数据模型层 — Pydantic models + AgentBase。

本模块只包含：
- 数据类定义 (Action, TalkResult, PlanStep, ShortTermPlan, ThinkResult)
- AgentBase 类：字段声明、基础工具方法、视图方法
- 不包含任何 LLM 调用逻辑
"""
from __future__ import annotations

import logging
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.memory import Memory, Relation, Thread

logger = logging.getLogger("echoworld.agent")


# ---------- 基本动作模型 (v4 兼容) ----------

ActionKind = Literal["move", "talk", "work", "rest"]


class Action(BaseModel):
    kind: ActionKind = "rest"
    target: str = ""
    reason: str = ""

    @classmethod
    def rest(cls, reason: str = "什么也不想做") -> "Action":
        return cls(kind="rest", target="", reason=reason)

    @field_validator("kind", mode="before")
    @classmethod
    def _normalize_kind(cls, v):
        if isinstance(v, str):
            v = v.strip().lower()
            if v in ("move", "talk", "work", "rest"):
                return v
        return "rest"


class TalkResult(BaseModel):
    utterance: str = "……"
    inner_thought: str = ""
    intent: str = "敷衍"
    relation_delta: dict = Field(default_factory=dict)


# ---------- v5 Plan 模型 ----------

class PlanStep(BaseModel):
    intent: str
    tool: str = ""
    args: dict = Field(default_factory=dict)
    status: Literal["pending", "doing", "done", "abandoned"] = "pending"
    born_tick: int = 0


class ShortTermPlan(BaseModel):
    goal: str = ""
    steps: list[PlanStep] = Field(default_factory=list)
    updated_tick: int = 0
    confidence: int = 5  # 0..10


class ThinkResult(BaseModel):
    """think_and_act 返回值。"""
    thought: str = ""
    tool_calls: list[dict] = Field(default_factory=list)
    observations: list[dict] = Field(default_factory=list)
    plan_patch: dict = Field(default_factory=dict)
    chosen_action: Optional[Action] = None
    elapsed_ms: int = 0
    fallback_used: bool = False


# ---------- AgentBase ----------

class AgentBase(BaseModel):
    """Agent 基类 — 字段声明 + 数据访问 + 视图方法。

    不含 LLM 调用逻辑。LLM 交互在 AgentThinkMixin / AgentReflectMixin 中。
    """
    name: str
    emoji: str
    persona: str
    voice: str
    goals: list[str] = Field(default_factory=list)
    location: str
    memories: list[Memory] = Field(default_factory=list)
    relations: dict[str, Relation] = Field(default_factory=dict)
    threads: list[Thread] = Field(default_factory=list)
    primed_memory: Optional[str] = None
    role: str = ""
    color_palette: dict = Field(default_factory=dict)

    # ----- v5 新增 -----
    semantic: list[Memory] = Field(default_factory=list)
    short_term_plan: Optional[ShortTermPlan] = None
    last_summarize_tick: int = -999
    last_reflect_tick: int = -999
    last_recalled: list[str] = Field(default_factory=list)
    recent_reasoning_traces: list[str] = Field(default_factory=list)
    # 运行时 only：被 think_and_act 写入，被 world.apply 阶段消费；不序列化到 snapshot
    pending_action: Optional[Action] = None
    pending_talk_intent: str = ""
    pending_talk_draft: str = ""
    # 本 tick 已发出的 thought 头 40 字，供 dispatch_tool 把 tool 卡片"嵌套"到 thought 下
    last_thought_text: str = ""

    # ----- v5.3 新增：状态机（默认 alive，向后兼容老 snapshot）-----
    status: Literal["alive", "dead", "unconscious", "missing"] = "alive"
    death_reason: str = ""
    status_changed_tick: int = -1

    def is_alive(self) -> bool:
        return self.status == "alive"

    # ============================================================
    # 基础工具
    # ============================================================

    def get_or_init_relation(self, other: str) -> Relation:
        if other not in self.relations:
            self.relations[other] = Relation()
        return self.relations[other]

    def add_memory(self, m: Memory) -> None:
        self.memories.append(m)
        # 上限 40：让 should_summarize（>30）能真正触发；reflect 后由 summarize 主动
        # 把最旧 10 条压缩进 semantic，再 slice 掉，让记忆向"长期信念"流动。
        if len(self.memories) > 40:
            self.memories = self.memories[-40:]

    def recent_memories(self, n: int = 5) -> list[Memory]:
        return self.memories[-n:]

    def pick_secret_agenda(self, other: str) -> str:
        related = [t for t in self.threads if t.target == other]
        chosen = max(related, key=lambda t: t.weight) if related else (
            max(self.threads, key=lambda t: t.weight) if self.threads else None
        )
        return chosen.desc if chosen else "顺其自然"

    def consume_primed(self) -> Optional[str]:
        v = self.primed_memory
        self.primed_memory = None
        return v

    # ============================================================
    # 视图：把 agent 内部状态转成 prompt slot 输入
    # ============================================================

    def _plan_dict(self) -> dict:
        if not self.short_term_plan:
            return {"goal": "", "steps": []}
        return {
            "goal": self.short_term_plan.goal,
            "steps": [
                {"intent": s.intent, "status": s.status}
                for s in self.short_term_plan.steps
            ],
        }

    def _relations_dicts(self) -> list[dict]:
        out = []
        for n, r in (self.relations or {}).items():
            if n == self.name:
                continue
            out.append({
                "name": n,
                "trust": r.trust, "fondness": r.fondness,
                "jealousy": r.jealousy, "guilt": r.guilt,
                "tag": r.summary(),
            })
        return out

    def _semantic_lines(self) -> list[str]:
        return [m.short() for m in (self.semantic or [])][-8:]
