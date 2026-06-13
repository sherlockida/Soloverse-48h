"""LLM services: logging, retry, recall, memory management, prompt builders & LLM client."""

from app.services.llm_logger import (
    log_llm_request,
    log_llm_response,
    log_llm_error,
    log_llm_skip,
    log_llm_fail,
    llm_timer,
    setup_llm_logging,
)
from app.services.llm_retry import (
    retry_with_backoff,
    llm_call_with_retry,
)
from app.services.recall import (
    recall,
    summarize,
    should_summarize,
    append_semantic,
    build_recall_query,
)
from app.services.prompts import (
    build_reason_prompt,
    build_talk_prompt,
    build_decide_prompt,
    build_reflect_prompt,
    build_narrative_prompt,
)
from app.services.llm_client import (
    LLMClient,
    _safe_parse_json,
    _strip_fences,
)
from app.services.mock_gen_output import _MockBackend
from app.services.providers import (
    _CircuitBreaker,
    _OpenAIBackend,
    PROVIDER_REGISTRY,
)

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
]
