"""LLM services: logging, retry, recall, prompts, LLM client, providers, seed loader.

Lazy-loaded (PEP 562) to avoid circular imports: seed_loader imports
app.agents.Agent, and agent modules import app.services (recall, prompts) during
their own init. With lazy resolution, a direct submodule import
(`from app.services.recall import recall`) never triggers the seed_loader chain;
package-level imports (`from app.services import LLMClient`) resolve on access.
"""
from __future__ import annotations

__all__ = [
    # LLM logging
    "log_llm_request",
    "log_llm_response",
    "log_llm_error",
    "log_llm_skip",
    "log_llm_fail",
    "llm_timer",
    "setup_llm_logging",
    # LLM retry
    "retry_with_backoff",
    "llm_call_with_retry",
    # Recall & memory
    "recall",
    "summarize",
    "should_summarize",
    "append_semantic",
    "build_recall_query",
    # Prompt builders
    "build_reason_prompt",
    "build_talk_prompt",
    "build_decide_prompt",
    "build_reflect_prompt",
    "build_narrative_prompt",
    # LLM client
    "LLMClient",
    "_safe_parse_json",
    "_strip_fences",
    # Mock backend
    "_MockBackend",
    # Providers
    "_CircuitBreaker",
    "_OpenAIBackend",
    "PROVIDER_REGISTRY",
    # Seed loader
    "load_agents_and_places",
    "load_seed_events",
]

# Public name -> (submodule path, attribute name)
_LAZY = {
    # LLM logging
    "log_llm_request": ("app.services.llm_logger", "log_llm_request"),
    "log_llm_response": ("app.services.llm_logger", "log_llm_response"),
    "log_llm_error": ("app.services.llm_logger", "log_llm_error"),
    "log_llm_skip": ("app.services.llm_logger", "log_llm_skip"),
    "log_llm_fail": ("app.services.llm_logger", "log_llm_fail"),
    "llm_timer": ("app.services.llm_logger", "llm_timer"),
    "setup_llm_logging": ("app.services.llm_logger", "setup_llm_logging"),
    # LLM retry
    "retry_with_backoff": ("app.services.llm_retry", "retry_with_backoff"),
    "llm_call_with_retry": ("app.services.llm_retry", "llm_call_with_retry"),
    # Recall & memory
    "recall": ("app.services.recall", "recall"),
    "summarize": ("app.services.recall", "summarize"),
    "should_summarize": ("app.services.recall", "should_summarize"),
    "append_semantic": ("app.services.recall", "append_semantic"),
    "build_recall_query": ("app.services.recall", "build_recall_query"),
    # Prompt builders
    "build_reason_prompt": ("app.services.prompts", "build_reason_prompt"),
    "build_talk_prompt": ("app.services.prompts", "build_talk_prompt"),
    "build_decide_prompt": ("app.services.prompts", "build_decide_prompt"),
    "build_reflect_prompt": ("app.services.prompts", "build_reflect_prompt"),
    "build_narrative_prompt": ("app.services.prompts", "build_narrative_prompt"),
    # LLM client
    "LLMClient": ("app.services.llm_client", "LLMClient"),
    "_safe_parse_json": ("app.services.llm_json", "_safe_parse_json"),
    "_strip_fences": ("app.services.llm_json", "_strip_fences"),
    # Mock backend
    "_MockBackend": ("app.services.mock_gen_output", "_MockBackend"),
    # Providers
    "_CircuitBreaker": ("app.services.providers", "_CircuitBreaker"),
    "_OpenAIBackend": ("app.services.providers", "_OpenAIBackend"),
    "PROVIDER_REGISTRY": ("app.services.providers", "PROVIDER_REGISTRY"),
    # Seed loader
    "load_agents_and_places": ("app.services.seed_loader", "load_agents_and_places"),
    "load_seed_events": ("app.services.seed_loader", "load_seed_events"),
}


def __getattr__(name):
    if name in _LAZY:
        import importlib

        mod_path, attr = _LAZY[name]
        value = getattr(importlib.import_module(mod_path), attr)
        globals()[name] = value  # cache so later access bypasses __getattr__
        return value
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__():
    return sorted(list(globals()) + __all__)
