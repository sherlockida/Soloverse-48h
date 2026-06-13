"""Backward-compatible re-export facade.

All build_* functions and CONTRACT constants are re-exported here so that
existing code doing ``from app.services.prompts import build_reason_prompt``
continues to work without changes.
"""
# v5 core
from app.services.prompts_reason import (
    build_reason_prompt,
    REASON_OUTPUT_CONTRACT,
    TOOL_REGISTRY_BRIEF_DEFAULT,
    DEFAULT_WORLD_BACKGROUND,
    _est_tokens,
    _trim_recall,
    _fmt_persona,
    _fmt_plan,
    _fmt_recalled,
    _fmt_relations,
    _fmt_threads,
    _fmt_situation,
    _fmt_tools,
)
# talk + decide
from app.services.prompts_talk import (
    build_talk_prompt,
    build_decide_prompt,
    TALK_OUTPUT_CONTRACT,
)
# reflect + narrative
from app.services.prompts_other import (
    build_reflect_prompt,
    build_narrative_prompt,
    REFLECT_OUTPUT_CONTRACT,
)

__all__ = [
    # v5 core
    "build_reason_prompt",
    "build_talk_prompt",
    "build_reflect_prompt",
    # v4 compat
    "build_decide_prompt",
    "build_narrative_prompt",
    # contracts
    "REASON_OUTPUT_CONTRACT",
    "TALK_OUTPUT_CONTRACT",
    "REFLECT_OUTPUT_CONTRACT",
    "TOOL_REGISTRY_BRIEF_DEFAULT",
    # utilities
    "_est_tokens",
    # formatters (shared)
    "_fmt_persona",
    "_fmt_plan",
    "_fmt_recalled",
    "_fmt_relations",
    "_fmt_threads",
    "_fmt_situation",
    "_fmt_tools",
    "_trim_recall",
    "DEFAULT_WORLD_BACKGROUND",
]
