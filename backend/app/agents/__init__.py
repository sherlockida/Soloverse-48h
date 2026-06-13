"""Agent 模块 — Mixin 组合：Agent = AgentReflectMixin + AgentDecideMixin + AgentThinkMixin + AgentBase。

公共 API（verify agent 请导出这些）：
  - Agent                最终组合类
  - Action               动作模型
  - TalkResult           对话结果模型
  - PlanStep             计划步骤模型
  - ShortTermPlan        短期计划模型
  - ThinkResult          思考结果模型
  - ActionKind           动作类型 Literal
"""
from app.agents.agent_model import (
    Action, ActionKind, AgentBase, PlanStep, ShortTermPlan, TalkResult,
    ThinkResult,
)
from app.agents.agent_reflect import AgentReflectMixin
from app.agents.agent_decide import AgentDecideMixin
from app.agents.agent_think import AgentThinkMixin


class Agent(AgentReflectMixin, AgentDecideMixin, AgentThinkMixin, AgentBase):
    """最终 Agent 类 — Mixin 组合。

    MRO: AgentReflectMixin -> AgentDecideMixin -> AgentThinkMixin -> AgentBase
    - AgentBase: 字段、基础工具、视图方法
    - AgentThinkMixin: perception、recall、plan patch、fallback thought
    - AgentDecideMixin: LLM reasoning、tool dispatch、v4 compat (decide/talk)
    - AgentReflectMixin: reflection、belief update、thread changes、summarize
    """
    pass


__all__ = [
    "Agent",
    "AgentBase",
    "AgentReflectMixin",
    "AgentDecideMixin",
    "AgentThinkMixin",
    "Action",
    "ActionKind",
    "TalkResult",
    "PlanStep",
    "ShortTermPlan",
    "ThinkResult",
]
