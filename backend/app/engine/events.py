"""事件总线：所有世界变化通过 EventBus 推到 SSE 订阅者 + 内存事件流。"""
from __future__ import annotations

import asyncio
import json
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal, Optional
from pydantic import BaseModel, Field

EventKind = Literal[
    "tick_marker",      # 时钟推进
    "move",             # agent 移动
    "talk",             # agent 对话
    "narrative",        # 叙事检测出来的 headline
    "seed",             # 玩家或种子事件库注入
    "system",           # 系统消息（重置、错误等）
    "thought",          # agent 内心独白（v5：source of agent thinking stream）
    "plan_update",      # agent 的 short_term_plan 更新（goal/steps/confidence）
    "tool_call",        # agent 调用工具（observe/introspect 等"想"动作）
    "memory_recall",    # agent 主动 recall 命中的记忆条目
    "reflect",          # agent 周期性反思的结果摘要
    "provider_switch",  # LLM provider 切换通知（chain 内 fallback 时触发）
    "belief_formed",    # agent reflect 沉淀新的 semantic 信念
    "world_state_change",  # v5.3 世界级状态变更（agent 死亡/昏迷/失踪），全场可见
]


class Event(BaseModel):
    tick: int
    kind: EventKind
    actor: str = ""
    target: str = ""
    text: str = ""              # 人类可读一句话
    payload: dict = Field(default_factory=dict)  # 结构化数据（如 talk 的 inner_thought）
    ts_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
    # v5: LLM 真实 token 消耗（顶层，给前端 HUD 一行代码就能累加；
    # 完整明细仍放 payload['usage']：{prompt_tokens, completion_tokens, total_tokens, latency_ms, provider, model}）
    token_used: int = 0

    def to_sse(self) -> str:
        return json.dumps(self.model_dump(), ensure_ascii=False)


@dataclass
class _SubscriberInfo:
    """Internal bookkeeping for one subscriber queue."""
    queue: asyncio.Queue[Event]
    created_at: float = field(default_factory=time.time)
    last_put_ok: float = field(default_factory=time.time)  # last successful put timestamp


class EventBus:
    """每个 SSE 连接是一个 subscriber，独立 queue。

    线程/协程安全：
    - 所有对 _subscribers 的读写都在 self._lock 保护下进行
    - 死订阅者清理：连续 50 次 QueueFull 后自动移除
    - TTL 清理：每 100 次 publish 自动清理超龄且满队列的订阅者
    """

    _DEAD_THRESHOLD: int = 50  # consecutive QueueFull before removal
    _CLEANUP_INTERVAL: int = 100  # publish calls between TTL cleanups
    _DEFAULT_MAX_AGE: float = 300.0  # seconds before stale subscriber eligible for removal

    def __init__(self, history_size: int = 200):
        self._subscribers: list[asyncio.Queue[Event]] = []
        self._subscriber_info: dict[asyncio.Queue[Event], _SubscriberInfo] = {}
        self._history: list[Event] = []
        self._history_size = history_size
        self._lock = asyncio.Lock()
        self._dead_count: dict[asyncio.Queue[Event], int] = defaultdict(int)
        self._publish_count: int = 0

    async def publish(self, ev: Event) -> None:
        async with self._lock:
            self._publish_count += 1
            self._history.append(ev)
            if len(self._history) > self._history_size:
                self._history = self._history[-self._history_size:]
            dead_queues: list[asyncio.Queue[Event]] = []
            now = time.time()
            for q in list(self._subscribers):
                try:
                    q.put_nowait(ev)
                    self._dead_count[q] = 0  # reset on successful delivery
                    info = self._subscriber_info.get(q)
                    if info is not None:
                        info.last_put_ok = now
                except asyncio.QueueFull:
                    self._dead_count[q] += 1
                    if self._dead_count[q] >= self._DEAD_THRESHOLD:
                        dead_queues.append(q)
            for q in dead_queues:
                self._subscribers.remove(q)
                del self._dead_count[q]
                self._subscriber_info.pop(q, None)
            # Periodic TTL cleanup
            if self._publish_count % self._CLEANUP_INTERVAL == 0:
                self._cleanup_stale_subscribers()

    def history(self, limit: int = 50) -> list[Event]:
        return self._history[-limit:]

    def recent_for_narrative(self, n: int = 15) -> list[Event]:
        """给 NarrativeDetector 用：只取关键叙事事件，避开高频 tick_marker / thought / tool_call。"""
        keep = [e for e in self._history if e.kind in (
            "move", "talk", "seed", "reflect", "world_state_change",
        )]
        return keep[-n:]

    async def subscribe(self) -> asyncio.Queue[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=500)
        info = _SubscriberInfo(queue=q)
        async with self._lock:
            # 推送历史，让新连接也能看到上下文
            for ev in self._history[-50:]:
                try:
                    q.put_nowait(ev)
                except asyncio.QueueFull:
                    break
            self._subscribers.append(q)
            self._dead_count[q] = 0
            self._subscriber_info[q] = info
        return q

    def unsubscribe(self, q: asyncio.Queue[Event]) -> None:
        # 同步方法，调用者需自行协调或在已有锁上下文中调用
        if q in self._subscribers:
            self._subscribers.remove(q)
        self._dead_count.pop(q, None)
        self._subscriber_info.pop(q, None)

    def subscriber_stats(self) -> dict:
        """Diagnostic: return current subscriber count and dead-count info."""
        return {
            "subscriber_count": len(self._subscribers),
            "dead_count_tracked": len(self._dead_count),
            "dead_threshold": self._DEAD_THRESHOLD,
            "dead_counts": {
                str(id(q)): count
                for q, count in self._dead_count.items()
            },
            "history_size": len(self._history),
            "history_limit": self._history_size,
            "publish_count": self._publish_count,
            "subscriber_info_count": len(self._subscriber_info),
        }

    # ------------------------------------------------------------------
    # TTL cleanup (called internally under self._lock)
    # ------------------------------------------------------------------

    def _cleanup_stale_subscribers(
        self, max_age_seconds: float = _DEFAULT_MAX_AGE
    ) -> list[asyncio.Queue[Event]]:
        """Remove subscribers whose queue is persistently full AND older than max_age_seconds.

        Must be called while self._lock is held (publish already holds it).
        Returns list of removed queues for diagnostic purposes.
        """
        now = time.time()
        removed: list[asyncio.Queue[Event]] = []
        for q in list(self._subscribers):
            info = self._subscriber_info.get(q)
            if info is None:
                continue
            age = now - info.created_at
            # Only consider stale if: queue is full AND older than max_age
            if age < max_age_seconds:
                continue
            # Check if queue is full (dead_count > 0 indicates recent failures)
            if self._dead_count.get(q, 0) > 0:
                removed.append(q)
        for q in removed:
            self._subscribers.remove(q)
            self._dead_count.pop(q, None)
            self._subscriber_info.pop(q, None)
        return removed
