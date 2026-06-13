"""Agent 工具包：软工具（只读）+ 硬工具（状态变更）+ 统一派发。

公共 API：
  - SOFT_TOOLS, HARD_TOOLS, ALL_TOOL_NAMES   -- 工具名集合
  - is_soft(name), is_hard(name)              -- 分类判断
  - TOOL_REGISTRY                             -- {name: async fn} 映射
  - dispatch_tool(name, agent, world, args, parent_thought=...) -> dict
  - tool_observe, tool_recall, tool_introspect, tool_plan   -- 软工具
  - tool_talk, tool_move, tool_work                       -- 硬工具
"""
from app.agents.tools.soft_tools import (
    SOFT_TOOLS,
    is_soft,
    tool_observe,
    tool_recall,
)
from app.agents.tools.soft_tools_extra import (
    tool_introspect,
    tool_plan,
)
from app.agents.tools.hard_tools import (
    HARD_TOOLS,
    is_hard,
    ALL_TOOL_NAMES,
    TOOL_REGISTRY,
    dispatch_tool,
    tool_talk,
    tool_move,
    tool_work,
)

__all__ = [
    "SOFT_TOOLS",
    "HARD_TOOLS",
    "ALL_TOOL_NAMES",
    "is_soft",
    "is_hard",
    "TOOL_REGISTRY",
    "dispatch_tool",
    "tool_observe",
    "tool_recall",
    "tool_introspect",
    "tool_plan",
    "tool_talk",
    "tool_move",
    "tool_work",
]
