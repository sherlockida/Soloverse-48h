"""LLM 客户端 v5：多 provider fallback 链 + per-provider 熔断 + 组合式 mock。"""
from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable, Optional

from app.models.llm import HealthStats
from app.services.llm_json import _safe_parse_json, _strip_fences
from app.services.mock_gen_output import _MockBackend
from app.services.providers import (
    PROVIDER_REGISTRY,
    _CircuitBreaker,
    _OpenAIBackend,
)

logger = logging.getLogger("echoworld.llm")
_NULL_USAGE = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "latency_ms": 0}  # mock/超时/全链失败共用


class LLMClient:
    """统一入口。chat_json 返回 (parsed_json, usage_dict)。"""

    DEFAULT_CHAIN = "zhipu,moonshot,qwen,deepseek,ollama,mock"

    def __init__(self):
        chain_raw = os.getenv("LLM_PROVIDER_CHAIN", "").strip()
        if not chain_raw:
            primary = os.getenv("LLM_PROVIDER", "").strip()
            fallback = os.getenv("LLM_FALLBACK_PROVIDER", "").strip()
            chain_raw = ",".join(p for p in [primary, fallback] if p) or self.DEFAULT_CHAIN
        chain = [p.strip().lower() for p in chain_raw.split(",") if p.strip()]
        if "mock" not in chain:
            chain.append("mock")

        self.cache_enabled = os.getenv("LLM_CACHE_ENABLED", "1") == "1"
        self.cache_path = os.getenv("LLM_CACHE_PATH", "cache/llm_responses.jsonl")
        Path(self.cache_path).parent.mkdir(parents=True, exist_ok=True)
        self.max_concurrency = int(os.getenv("LLM_MAX_CONCURRENCY", "8"))
        self.timeout_seconds = float(os.getenv("LLM_TIMEOUT_SECONDS", "30"))
        self.max_retries = int(os.getenv("LLM_MAX_RETRIES", "1"))
        self._sem = asyncio.Semaphore(self.max_concurrency)

        circuit_fail = int(os.getenv("LLM_CIRCUIT_FAIL_THRESHOLD", "3"))
        circuit_cool = float(os.getenv("LLM_CIRCUIT_COOLDOWN_SECONDS", "60"))

        self.chain: list[str] = []
        self._backends: dict[str, Any] = {}
        self._breakers: dict[str, _CircuitBreaker] = {}
        self.health: dict[str, HealthStats] = {}
        self._provider_extra: dict[str, dict[str, Any]] = {}

        for name in chain:
            backend = self._build(name)
            if backend is None:
                continue
            self.chain.append(name)
            self._backends[name] = backend
            self._breakers[name] = _CircuitBreaker(circuit_fail, circuit_cool)
            self.health[name] = HealthStats()
            self._provider_extra[name] = {
                "successes": 0, "circuit_open": False,
                "tokens_total": 0, "last_tokens": 0,
            }

        self.on_provider_switch: Optional[Callable[[str, dict], Any]] = None
        self._last_active_provider: Optional[str] = None
        self.totals: dict[str, int] = {"calls": 0, "tokens": 0}
        logger.info(
            f"LLMClient v5: chain={self.chain}, max_conc={self.max_concurrency}, "
            f"timeout={self.timeout_seconds}s, circuit={circuit_fail}fails/{circuit_cool}s"
        )

    @property
    def primary_name(self) -> str:
        return self.chain[0] if self.chain else "mock"
    @property
    def fallback_name(self) -> str:
        return self.chain[1] if len(self.chain) > 1 else "mock"

    def _build(self, name: str) -> Any:
        name = name.lower()
        if name == "mock":
            return _MockBackend(self.cache_path)
        cfg = PROVIDER_REGISTRY.get(name)
        if not cfg:
            logger.warning(f"未知 provider 已跳过: {name}")
            return None
        key = os.getenv(cfg.key_env, "") if cfg.key_env else ""
        if not key and not cfg.allow_no_key:
            logger.info(f"provider [{name}] 缺 {cfg.key_env}，跳过")
            return None
        base = os.getenv(cfg.base_url_env, cfg.default_base_url)
        model = os.getenv(cfg.model_env, cfg.default_model)
        try:
            backend = _OpenAIBackend(key, base, model)
            logger.info(f"provider [{name}] 已装载: base={base}, model={model}")
            return backend
        except Exception as e:
            logger.warning(f"provider [{name}] 装载失败: {e}")
            return None

    @staticmethod
    def _hash(system: str, user: str) -> str:
        return hashlib.md5(f"{system}\n---\n{user}".encode("utf-8")).hexdigest()

    def _cache_write(self, prompt_hash: str, response: str) -> None:
        if not self.cache_enabled:
            return
        try:
            with open(self.cache_path, "a", encoding="utf-8") as f:
                f.write(json.dumps({"hash": prompt_hash, "response": response}, ensure_ascii=False) + "\n")
        except Exception as e:
            logger.warning(f"cache write fail: {e}")

    async def _maybe_emit_switch(self, name: str) -> None:
        if name == self._last_active_provider:
            return
        prev = self._last_active_provider
        self._last_active_provider = name
        if self.on_provider_switch is None:
            return
        try:
            merged: dict[str, dict[str, Any]] = {}
            for k, hs in self.health.items():
                d = hs.model_dump()
                if k in self._provider_extra:
                    d.update(self._provider_extra[k])
                merged[k] = d
            res = self.on_provider_switch(name, {
                "chain": list(self.chain), "previous": prev,
                "health": merged,
            })
            if inspect.isawaitable(res):
                await res
        except Exception as e:
            logger.warning(f"on_provider_switch hook error: {e}")

    async def _call_backend(self, name: str, backend,
                            system: str, user: str, kind: str) -> tuple[Any, dict]:
        """对单一 backend 发请求。返回 (parsed, usage_dict)。"""
        if isinstance(backend, _MockBackend):
            parsed = backend.lookup(self._hash(system, user), kind, system=system, user=user)
            return parsed, {**_NULL_USAGE, "provider": name, "model": "mock", "kind": kind}

        # v5.4（F1b）：按 kind 给 max_tokens，reason/reflect 输出长，2048 截断致非法 JSON → fallback
        _kind_max = {"reason": 4096, "reflect": 4096, "decide": 2048, "talk": 2048,
                     "narrative": 2048, "summarize": 1024, "extract": 2048}
        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                text, usage = await asyncio.wait_for(
                    backend.chat(system, user, max_tokens=_kind_max.get(kind, 2048)),
                    timeout=self.timeout_seconds
                )
                parsed = _safe_parse_json(text)
                if parsed is None:
                    raise ValueError(f"非法 JSON：{text[:200]}")
                self._cache_write(self._hash(system, user), text)
                usage = dict(usage or {})
                usage["provider"] = name
                usage["kind"] = kind
                usage.setdefault("model", getattr(backend, "model", ""))
                return parsed, usage
            except Exception as e:
                last_err = e
                logger.warning(
                    f"[{name}] attempt#{attempt} fail kind={kind}: "
                    f"{type(e).__name__}: {str(e)[:160]}"
                )
        raise last_err if last_err else RuntimeError("unknown backend failure")

    async def chat_json(self, system: str, user: str, *,
                       kind: str = "decide") -> tuple[Any, dict]:
        """按 chain 顺序串行尝试；任一 provider 命中即返回。"""
        try:
            await asyncio.wait_for(self._sem.acquire(), timeout=60.0)
        except asyncio.TimeoutError:
            logger.warning(f"chat_json: 信号量 60s 未获取，降级 mock_fallback kind={kind}")
            mock_backend = self._backends.get("mock")
            if mock_backend is not None:
                try:
                    parsed = mock_backend.lookup(
                        self._hash(system, user), kind, system=system, user=user)
                    return parsed, {**_NULL_USAGE, "provider": "mock_fallback",
                                    "model": "mock", "kind": kind}
                except Exception as e:
                    logger.warning(f"mock_fallback lookup fail: {e}")
            return None, {**_NULL_USAGE, "provider": "sem_timeout", "model": "", "kind": kind}

        try:
            for name in self.chain:
                breaker = self._breakers[name]
                if not breaker.allow():
                    self._provider_extra[name]["circuit_open"] = True
                    continue
                self.health[name].calls += 1
                try:
                    result, usage = await self._call_backend(name, self._backends[name],
                                                              system, user, kind)
                except Exception as e:
                    breaker.record_failure()
                    hs = self.health[name]
                    hs.failures += 1
                    hs.last_error = f"{type(e).__name__}: {str(e)[:120]}"
                    self._provider_extra[name]["circuit_open"] = breaker.is_open
                    logger.warning(f"[{name}] dropped; next in chain")
                    continue
                breaker.record_success()
                hs = self.health[name]
                extra = self._provider_extra[name]
                extra["successes"] += 1
                extra["circuit_open"] = False
                total_t = int(usage.get("total_tokens", 0) or 0)
                latency = int(usage.get("latency_ms", 0) or 0)
                hs.last_latency_ms = latency
                extra["last_tokens"] = total_t
                extra["tokens_total"] = int(extra.get("tokens_total", 0)) + total_t
                self.totals["calls"] += 1
                self.totals["tokens"] += total_t
                if name != "mock":
                    logger.info(f"LLM [{name}] kind={kind} tokens={total_t} latency={latency}ms")
                await self._maybe_emit_switch(name)
                return result, usage

            logger.error(f"chat_json: 全链失败 chain={self.chain} kind={kind}")
            return None, {**_NULL_USAGE, "provider": "none", "model": "", "kind": kind}
        finally:
            self._sem.release()

    def get_health(self) -> dict[str, Any]:
        providers_merged: dict[str, dict[str, Any]] = {}
        for name, br in self._breakers.items():
            hs = self.health[name]
            d = hs.model_dump()
            extra = self._provider_extra.get(name, {})
            d["successes"] = extra.get("successes", 0)
            d["circuit_open"] = br.is_open
            d["consecutive_failures"] = br.consecutive_failures
            d["tokens_total"] = extra.get("tokens_total", 0)
            d["last_tokens"] = extra.get("last_tokens", 0)
            providers_merged[name] = d
        return {
            "chain": list(self.chain), "active": self._last_active_provider,
            "providers": providers_merged,
            "totals": dict(self.totals),
        }
