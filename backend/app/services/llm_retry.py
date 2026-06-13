"""LLM retry wrapper with exponential backoff and jitter.

Wraps async LLM call functions so transient failures (rate-limit, server error,
timeout, connection loss) are automatically retried.  Non-retryable errors (e.g.
HTTP 400, JSON parse failure, ValueError) propagate immediately.

Design:
- `retry_with_backoff(fn, ...)` -- generic async retry decorator/callable.
- `llm_call_with_retry(llm, system, user, kind, ...)` -- convenience wrapper
  around `LLMClient.chat_json` that adds outer retry on top of the existing
  per-provider chain.
- Backoff formula: delay = min(base_delay * (2 ** attempt) + jitter, max_delay)
- Retryable: HTTP 429, 5xx, asyncio.TimeoutError, ConnectionError
- Logging: each retry attempt logged with attempt number, delay, and error.

Usage::

    from app.services.llm_retry import llm_call_with_retry

    result, usage = await llm_call_with_retry(
        llm, system_prompt, user_prompt, kind="decide",
    )

    # Or with the generic wrapper:
    from app.services.llm_retry import retry_with_backoff

    async def _call():
        return await llm.chat_json(sys, usr, kind="reason")

    result, usage = await retry_with_backoff(_call, max_retries=3)
"""
from __future__ import annotations

import asyncio
import random
import logging
from typing import Any, Awaitable, Callable, Optional, Sequence, Type

logger = logging.getLogger("echoworld.llm_retry")


# ---------------------------------------------------------------------------
# Exception classification
# ---------------------------------------------------------------------------

def _is_retryable(exc: BaseException) -> bool:
    """Return True if *exc* is a transient failure worth retrying.

    Retryable:
    - asyncio.TimeoutError / TimeoutError
    - ConnectionError (and subclasses: ConnectionResetError, BrokenPipeError, etc.)
    - httpx/httpcore 429, 5xx status exceptions
    - OSError with errno indicating transient network issues

    Non-retryable (propagate immediately):
    - HTTP 400, 401, 403 (client errors)
    - ValueError, TypeError, json.JSONDecodeError (logic bugs)
    - Any other exception
    """
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError)):
        return True

    # httpx / openai SDK: HTTPStatusError, APIStatusError, etc.
    status_code: Optional[int] = None
    for attr in ("status_code", "code"):
        if hasattr(exc, attr):
            val = getattr(exc, attr)
            if isinstance(val, int):
                status_code = val
                break

    if status_code is not None:
        if status_code == 429:
            return True
        if 500 <= status_code < 600:
            return True
        # Client errors (4xx except 429) are not retryable
        return False

    return False


# ---------------------------------------------------------------------------
# Core retry logic
# ---------------------------------------------------------------------------

async def retry_with_backoff(
    fn: Callable[[], Awaitable[Any]],
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    retryable_exceptions: Optional[Sequence[Type[BaseException]]] = None,
    description: str = "llm_call",
) -> Any:
    """Execute *fn* with exponential-backoff retry on transient failures.

    Parameters
    ----------
    fn:
        A zero-argument async callable that produces the desired result.
    max_retries:
        Maximum number of retries (total attempts = max_retries + 1).
    base_delay:
        Base delay in seconds before first retry.
    max_delay:
        Upper-bound cap on any single delay.
    retryable_exceptions:
        Optional explicit list of exception types to treat as retryable.  When
        provided, only these types are retried.  When *None*, the built-in
        ``_is_retryable`` classifier is used.
    description:
        Human-readable label for log messages.

    Returns
    -------
    The return value of *fn* on first successful invocation.

    Raises
    ------
    The last exception encountered after all retries are exhausted.
    """
    last_exc: Optional[BaseException] = None

    for attempt in range(max_retries + 1):
        try:
            result = await fn()
            if attempt > 0:
                logger.info(
                    f"[RETRY] {description} succeeded on attempt {attempt + 1}"
                )
            return result
        except BaseException as exc:
            last_exc = exc

            # Decide whether to retry
            if retryable_exceptions is not None:
                is_retry = isinstance(exc, tuple(retryable_exceptions))
            else:
                is_retry = _is_retryable(exc)

            if not is_retry or attempt >= max_retries:
                raise

            # Compute delay with exponential backoff + jitter
            delay = min(
                base_delay * (2 ** attempt) + random.uniform(0, base_delay * 0.5),
                max_delay,
            )

            logger.warning(
                f"[RETRY] {description} attempt {attempt + 1}/{max_retries + 1} "
                f"failed: {type(exc).__name__}: {_safe_str(exc)} -- "
                f"retrying in {delay:.2f}s"
            )

            await asyncio.sleep(delay)

    # Should not reach here, but just in case
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("retry_with_backoff: unexpected termination")


# ---------------------------------------------------------------------------
# Convenience wrapper for LLMClient.chat_json
# ---------------------------------------------------------------------------

async def llm_call_with_retry(
    llm: Any,
    system: str,
    user: str,
    *,
    kind: str = "decide",
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
) -> tuple[Any, dict]:
    """Call ``llm.chat_json(system, user, kind=kind)`` with retry protection.

    This wraps the existing per-provider chain inside ``LLMClient.chat_json``
    with an *outer* retry loop, so even if the entire chain fails (e.g. all
    providers return 429, or the semaphore times out), the call is retried
    with exponential backoff.

    Parameters
    ----------
    llm:
        An ``LLMClient`` instance (or any object with a compatible
        ``chat_json(system, user, kind=...)`` coroutine method).
    system:
        System prompt.
    user:
        User prompt.
    kind:
        LLM call kind (``"decide"``, ``"talk"``, ``"reason"``, ``"reflect"``,
        ``"narrative"``, ``"summarize"``).
    max_retries:
        Maximum retry attempts on top of the chain.
    base_delay:
        Base delay in seconds.
    max_delay:
        Cap on delay.

    Returns
    -------
    tuple[Any, dict]
        ``(parsed_result, usage_dict)`` -- same shape as ``LLMClient.chat_json``.
    """
    async def _call() -> tuple[Any, dict]:
        return await llm.chat_json(system, user, kind=kind)

    return await retry_with_backoff(
        _call,
        max_retries=max_retries,
        base_delay=base_delay,
        max_delay=max_delay,
        description=f"llm_call/{kind}",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_str(exc: BaseException, max_len: int = 160) -> str:
    """Convert an exception to a safe log string, truncated."""
    try:
        s = str(exc)
    except Exception:
        s = repr(exc)
    return s[:max_len]
