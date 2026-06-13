"""HTTP request timeout middleware for FastAPI.

Wraps non-SSE endpoints with ``asyncio.wait_for`` so that slow handlers
(e.g. LLM calls) cannot block a request indefinitely.  On timeout the
middleware returns a JSON 504 response.  SSE/streaming paths are exempt
because they are long-lived by design.

Usage in ``main.py``::

    from app.api.middleware import add_timeout_middleware
    add_timeout_middleware(app)          # uses env var or 30 s default
    add_timeout_middleware(app, timeout=60)  # explicit override
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("echoworld.middleware")

# Paths that are known to be long-lived streams and must NOT be timed out.
_SSE_PATH_PREFIXES: tuple[str, ...] = ("/events", "/stream", "/sse")

_DEFAULT_TIMEOUT: float = 30.0


class TimeoutMiddleware(BaseHTTPMiddleware):
    """Starlette ``BaseHTTPMiddleware`` that enforces a per-request timeout.

    * **Default timeout**: 30 seconds.
    * **Configurable** via the ``REQUEST_TIMEOUT`` environment variable
      (parsed as ``float``).
    * **SSE exemption**: requests whose path starts with ``/events``,
      ``/stream``, or ``/sse`` bypass the timeout entirely.
    * On timeout a JSON ``504`` response is returned and the event is
      logged at ``WARNING`` level.
    """

    def __init__(
        self,
        app: Callable,
        timeout: float | None = None,
        sse_path_prefixes: tuple[str, ...] = _SSE_PATH_PREFIXES,
    ) -> None:
        super().__init__(app)
        env_timeout = os.getenv("REQUEST_TIMEOUT", "")
        if timeout is None:
            if env_timeout:
                try:
                    timeout = float(env_timeout)
                except ValueError:
                    logger.warning(
                        "[HTTP] Invalid REQUEST_TIMEOUT=%r, falling back to %s",
                        env_timeout,
                        _DEFAULT_TIMEOUT,
                    )
                    timeout = _DEFAULT_TIMEOUT
            else:
                timeout = _DEFAULT_TIMEOUT
        self.timeout: float = timeout
        self.sse_prefixes = sse_path_prefixes

    # ------------------------------------------------------------------
    # Core dispatch
    # ------------------------------------------------------------------
    async def dispatch(self, request: Request, call_next: Callable) -> JSONResponse:  # type: ignore[override]
        path: str = request.url.path
        method: str = request.method

        # Skip timeout for SSE / streaming endpoints.
        if any(path.startswith(prefix) for prefix in self.sse_prefixes):
            return await call_next(request)  # type: ignore[return-value]

        try:
            return await asyncio.wait_for(
                call_next(request),
                timeout=self.timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "[HTTP] Timeout: %s %s after %ds",
                method,
                path,
                self.timeout,
            )
            return JSONResponse(
                status_code=504,
                content={
                    "detail": "Request timeout",
                    "timeout_s": self.timeout,
                },
            )


# ------------------------------------------------------------------
# Convenience helper
# ------------------------------------------------------------------

def add_timeout_middleware(
    app: object,
    timeout: float | None = None,
) -> None:
    """Register :class:`TimeoutMiddleware` on *app*.

    Parameters
    ----------
    app:
        A ``FastAPI`` (or ``Starlette``) application instance.
    timeout:
        Override the default / env-var timeout.  ``None`` means read
        ``REQUEST_TIMEOUT`` from the environment, falling back to 30 s.
    """
    # Import locally so the module has no hard dependency on FastAPI at
    # import time – useful for testing with a plain Starlette app.
    from starlette.applications import Starlette

    if not isinstance(app, Starlette):
        raise TypeError(
            f"add_timeout_middleware expects a Starlette/FastAPI app, got {type(app)!r}"
        )

    app.add_middleware(TimeoutMiddleware, timeout=timeout)
    resolved = timeout or os.getenv("REQUEST_TIMEOUT") or str(_DEFAULT_TIMEOUT)
    logger.info(
        "[HTTP] TimeoutMiddleware registered: timeout=%ss", resolved
    )
