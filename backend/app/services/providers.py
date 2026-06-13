"""Provider 注册表 + OpenAI 兼容 HTTP 后端 + 熔断器 + 文本去重工具。

v5: 全部走 OpenAI 兼容协议。CircuitBreaker 连续 N 次失败 → cooldown 期内
fast-fail；冷却到点后半开重试。
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Optional

from app.models.llm import ProviderConfig

logger = logging.getLogger("echoworld.llm")


# ============================================================================
# Provider 注册表 —— 全部走 OpenAI 兼容协议
# ============================================================================
PROVIDER_REGISTRY: dict[str, ProviderConfig] = {
    "deepseek": ProviderConfig(
        key_env="DEEPSEEK_API_KEY", base_url_env="DEEPSEEK_BASE_URL",
        default_base_url="https://api.deepseek.com/v1",
        model_env="DEEPSEEK_MODEL", default_model="deepseek-chat",
        allow_no_key=False,
    ),
    "zhipu": ProviderConfig(
        key_env="ZHIPU_API_KEY", base_url_env="ZHIPU_BASE_URL",
        default_base_url="https://open.bigmodel.cn/api/paas/v4",
        model_env="ZHIPU_MODEL", default_model="glm-4-flash",
        allow_no_key=False,
    ),
    "moonshot": ProviderConfig(
        key_env="MOONSHOT_API_KEY", base_url_env="MOONSHOT_BASE_URL",
        default_base_url="https://api.moonshot.cn/v1",
        model_env="MOONSHOT_MODEL", default_model="moonshot-v1-8k",
        allow_no_key=False,
    ),
    "qwen": ProviderConfig(
        key_env="QWEN_API_KEY", base_url_env="QWEN_BASE_URL",
        default_base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        model_env="QWEN_MODEL", default_model="qwen-turbo",
        allow_no_key=False,
    ),
    "ollama": ProviderConfig(
        key_env="OLLAMA_API_KEY", base_url_env="OLLAMA_BASE_URL",
        default_base_url="http://127.0.0.1:11434/v1",
        model_env="OLLAMA_MODEL", default_model="qwen2.5:3b",
        allow_no_key=True,
    ),
}


# ============================================================================
# 工具：char-level 3-gram（中文友好）
# ============================================================================

_PUNCT_RE = re.compile(r"[\s\W_]+", re.UNICODE)


def _trigrams(s: str) -> set[str]:
    s = _PUNCT_RE.sub("", s or "")
    if len(s) < 3:
        return {s} if s else set()
    return {s[i:i + 3] for i in range(len(s) - 2)}


# ============================================================================
# OpenAI 兼容后端（deepseek / zhipu / moonshot / qwen / ollama）
# ============================================================================

class _OpenAIBackend:
    """OpenAI-compatible chat backend.

    function-calling 开关（默认关闭，v5 保持现有 response_format=json_object 模式）
    -------------------------------------------------------------------------
    构造参数 ``use_function_calling=False``：
      - False（默认）：走 response_format=json_object，与 v5 完全一致
      - True：走原生 function-calling
    适用 provider：
      - zhipu (glm-4-flash)  已支持原生 function calling
      - qwen  (qwen-turbo)   已支持
      - deepseek-chat        已支持，strict mode 参数名略有差异
      - moonshot             部分模型支持
      - ollama / 本地小模型  通常不支持，需走 mock 或 JSON 模式
    TODO(v6): 等 llm-real / pace / tool-use 三轨稳定后，下个版本（v6）在 LLMClient
              里读 env LLM_USE_FUNCTION_CALLING=1 并优先为 zhipu/qwen 启用。
    """

    def __init__(self, api_key: str, base_url: str, model: str,
                 *, use_function_calling: bool = False):
        from openai import AsyncOpenAI
        # 没 key 时（如 ollama）给个 placeholder，sdk 校验不会爆
        self.client = AsyncOpenAI(api_key=api_key or "EMPTY", base_url=base_url)
        self.model = model
        self.base_url = base_url
        self.use_function_calling = bool(use_function_calling)

    async def chat(self, system: str, user: str, max_tokens: int = 2048,
                    tools: Optional[list] = None) -> tuple[str, dict]:
        """返回 (text, usage_dict)。usage_dict 至少含
        {prompt_tokens, completion_tokens, total_tokens, latency_ms, model}。
        provider 名由调用方 _call_backend 填进去。
        """
        t0 = time.time()
        if self.use_function_calling and tools:
            kwargs: dict[str, Any] = {
                "model": self.model,
                "max_tokens": max_tokens,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "tools": tools,
                "tool_choice": "auto",
            }
            resp = await self.client.chat.completions.create(**kwargs)
            msg = resp.choices[0].message
            tc = getattr(msg, "tool_calls", None)
            calls: list[dict] = []
            if tc:
                for c in tc:
                    fn = getattr(c, "function", None)
                    if not fn:
                        continue
                    name = getattr(fn, "name", "") or ""
                    raw_args = getattr(fn, "arguments", "") or "{}"
                    try:
                        args = (json.loads(raw_args)
                                if isinstance(raw_args, str) else (raw_args or {}))
                    except Exception:
                        args = {}
                    calls.append({"name": name, "args": args})
            text = json.dumps(
                {"thought": msg.content or "", "tool_calls": calls},
                ensure_ascii=False,
            )
            usage_obj = getattr(resp, "usage", None)
            usage = {
                "prompt_tokens": int(getattr(usage_obj, "prompt_tokens", 0) or 0),
                "completion_tokens": int(getattr(usage_obj, "completion_tokens", 0) or 0),
                "total_tokens": int(getattr(usage_obj, "total_tokens", 0) or 0),
                "latency_ms": int((time.time() - t0) * 1000),
                "model": self.model,
                "mode": "function_calling",
            }
            return text, usage

        # ===== 默认路径：不传 response_format，靠 prompt 约束 JSON（v5.4）=====
        resp = await self.client.chat.completions.create(
            model=self.model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        text = resp.choices[0].message.content or ""
        usage_obj = getattr(resp, "usage", None)
        usage = {
            "prompt_tokens": int(getattr(usage_obj, "prompt_tokens", 0) or 0),
            "completion_tokens": int(getattr(usage_obj, "completion_tokens", 0) or 0),
            "total_tokens": int(getattr(usage_obj, "total_tokens", 0) or 0),
            "latency_ms": int((time.time() - t0) * 1000),
            "model": self.model,
        }
        return text, usage


# ============================================================================
# Per-provider circuit breaker
# ============================================================================

class _CircuitBreaker:
    """连续 N 次失败 → 进 cooldown 期内全部 fast-fail；冷却到点后半开重试一次。"""

    def __init__(self, fail_threshold: int, cooldown_seconds: float):
        self.fail_threshold = max(1, fail_threshold)
        self.cooldown = max(1.0, cooldown_seconds)
        self.consecutive_failures = 0
        self.opened_at: Optional[float] = None
        self._half_open_in_flight = False

    @property
    def is_open(self) -> bool:
        return self.opened_at is not None and (time.time() - self.opened_at) < self.cooldown

    def allow(self) -> bool:
        if self.opened_at is None:
            return True
        if time.time() - self.opened_at >= self.cooldown:
            # 半开：放一个试试
            self._half_open_in_flight = True
            return True
        return False

    def record_success(self) -> None:
        self.consecutive_failures = 0
        self.opened_at = None
        self._half_open_in_flight = False

    def record_failure(self) -> None:
        self.consecutive_failures += 1
        if self._half_open_in_flight:
            # 半开试探又失败：重新计时
            self.opened_at = time.time()
            self._half_open_in_flight = False
            return
        if self.consecutive_failures >= self.fail_threshold and self.opened_at is None:
            self.opened_at = time.time()
