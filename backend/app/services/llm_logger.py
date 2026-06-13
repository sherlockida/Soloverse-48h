"""Structured LLM logging with [LLM] prefix.

Provides consistent, structured log lines for all LLM interactions:
  - Request:  [LLM] REQ model=... msg_count=... params=...
  - Response: [LLM] RES model=... tokens=... latency=...ms
  - Error:    [LLM] ERR model=... error_type=... error=... retry=...
  - Skip:     [LLM] SKIP model=... reason=...
  - Fail:     [LLM] FAIL model=... reason=...

Usage::

    from app.services.llm_logger import (
        log_llm_request, log_llm_response, log_llm_error,
        log_llm_skip, log_llm_fail, llm_timer, setup_llm_logging,
    )

    setup_llm_logging()

    with llm_timer() as t:
        log_llm_request("deepseek-chat", messages, {"temperature": 0.7})
        response = await call_llm(...)
        log_llm_response("deepseek-chat", response, t.elapsed_ms)
"""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Any, Generator, Optional


logger = logging.getLogger("soloVerse.llm")


# ---------------------------------------------------------------------------
# Structured log helpers
# ---------------------------------------------------------------------------

def log_llm_request(
    model: str,
    messages: list[dict[str, Any]],
    params: Optional[dict[str, Any]] = None,
) -> None:
    """Log an outgoing LLM request.

    Args:
        model: Model identifier (e.g. ``deepseek-chat``).
        messages: The messages list sent to the LLM.
        params: Optional extra parameters (temperature, max_tokens, etc.).
    """
    logger.info(
        "[LLM] REQ model=%s msg_count=%d params=%s",
        model,
        len(messages),
        params,
    )


def log_llm_response(
    model: str,
    response: Any,
    latency_ms: float,
) -> None:
    """Log a successful LLM response.

    Args:
        model: Model identifier.
        response: The parsed response object (dict or similar).
        latency_ms: Round-trip latency in milliseconds.
    """
    tokens: int = 0
    if isinstance(response, dict):
        tokens = int(response.get("total_tokens", 0) or 0)
    logger.info(
        "[LLM] RES model=%s tokens=%d latency=%.1fms",
        model,
        tokens,
        latency_ms,
    )


def log_llm_error(
    model: str,
    error: Exception,
    retry_count: int = 0,
) -> None:
    """Log an LLM call failure.

    Args:
        model: Model identifier.
        error: The exception that was raised.
        retry_count: How many retries have already been attempted (0 = first attempt).
    """
    logger.error(
        "[LLM] ERR model=%s error_type=%s error=%s retry=%d",
        model,
        type(error).__name__,
        str(error)[:300],
        retry_count,
    )


def log_llm_skip(model: str, reason: str) -> None:
    """Log that an LLM call was skipped (e.g. circuit breaker open).

    Args:
        model: Model / provider identifier.
        reason: Human-readable skip reason.
    """
    logger.info("[LLM] SKIP model=%s reason=%s", model, reason)


def log_llm_fail(model: str, reason: str) -> None:
    """Log that an entire LLM chain was exhausted with no successful response.

    Args:
        model: The final model attempted, or ``chain`` if the full chain failed.
        reason: Human-readable failure reason.
    """
    logger.error("[LLM] FAIL model=%s reason=%s", model, reason)


# ---------------------------------------------------------------------------
# Latency timer context manager
# ---------------------------------------------------------------------------

class _TimerCtx:
    """Lightweight object holding wall-clock elapsed time.

    Created by :func:`llm_timer`.  ``elapsed_ms`` is populated only
    after the ``with`` block exits; during the block it reads ``0.0``.
    """

    __slots__ = ("_start", "elapsed_ms")

    def __init__(self, start: float) -> None:
        self._start: float = start
        self.elapsed_ms: float = 0.0


@contextmanager
def llm_timer() -> Generator[_TimerCtx, None, None]:
    """Context manager that measures latency for an LLM call.

    Usage::

        with llm_timer() as t:
            response = await llm.chat(...)
        log_llm_response(model, response, t.elapsed_ms)

    The ``elapsed_ms`` attribute is populated only after the ``with`` block
    exits; during the block it reads ``0.0``.
    """
    ctx = _TimerCtx(time.perf_counter())
    try:
        yield ctx
    finally:
        ctx.elapsed_ms = (time.perf_counter() - ctx._start) * 1000.0


# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

_LOG_FORMAT = "[%(asctime)s] %(name)s %(levelname)s %(message)s"
_LOG_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_llm_logging(
    level: int = logging.INFO,
    handler: Optional[logging.Handler] = None,
) -> logging.Logger:
    """Configure the ``soloVerse.llm`` logger with a handler and formatter.

    If no *handler* is provided a :class:`logging.StreamHandler` writing to
    ``stderr`` is created and attached.  Calling this function multiple times
    is safe -- handlers are not duplicated.

    Args:
        level: Logging level (default ``logging.INFO``).
        handler: Optional pre-configured handler.

    Returns:
        The configured ``soloVerse.llm`` logger instance.
    """
    log = logging.getLogger("soloVerse.llm")
    log.setLevel(level)

    # Avoid duplicate handlers on repeated calls.
    if not log.handlers:
        if handler is None:
            handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(_LOG_FORMAT, datefmt=_LOG_DATE_FORMAT))
        log.addHandler(handler)

    # Ensure the logger does not propagate to the root logger (avoids double
    # output when the root logger already has a handler configured).
    log.propagate = False

    return log
