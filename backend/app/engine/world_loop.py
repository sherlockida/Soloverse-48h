"""World 核心循环：tick 引擎主类 + tick 编排。

每 tick：think_and_act 并行 -> apply 串行 -> talk pair 并行 -> 种子事件注入 -> 叙事检测后台 -> 快照。

P1-T4 fix：do_tick() 中 dead agent 分支原本在 continue 之后有不可达的
pending_talk_intent / pending_talk_draft 清理代码（origin L178-180），
已将三笔 pending 赋值统一移到 continue 之前。
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from pathlib import Path
from typing import Optional

from app.agents import Action, Agent
from app.engine.events import Event, EventBus
from app.models.world import SeedEvent
from app.narrative import NarrativeDetector
from app.services import LLMClient, load_agents_and_places, load_seed_events

logger = logging.getLogger("echoworld.world")


class World:
    """Tick-driven world engine. Singleton created in FastAPI lifespan.

    Mixin composition: ActionMixin, SeedMixin, PlayerMixin, StateMixin
    are attached in ``app.engine.world`` thin re-export.
    """

    def __init__(self, llm: LLMClient) -> None:
        self.llm = llm
        self.event_bus = EventBus(history_size=300)
        self.narrative = NarrativeDetector(llm)

        # v5: 挂 provider 切换钩子 -> 广播 SSE
        try:
            llm.on_provider_switch = self._on_provider_switch  # type: ignore[attr-defined]
        except Exception:
            pass

        # 加载种子
        self.agents: list[Agent] = []
        self.places: list[str] = []
        self.seed_events: list[SeedEvent] = []
        self.reload_seeds()

        # 世界配置
        self.scene_id = "default"
        self.theme = "medieval"
        self.story_background = ""

        # 玩家化身（None = 上帝模式；str = 该 agent 由玩家接管，跳过 LLM decide/talk）
        self.player_avatar: Optional[str] = None

        # 剧情温度计：检测戏剧密度，过低时主动注入种子
        self._dramatic_events_recent: int = 0

        self.tick: int = 0
        self.start_ts_ms = int(time.time() * 1000)

        # 对话历史：key = (a, b) 双向同 key -> list of {speaker, utterance}
        self.dialog_history: dict[tuple[str, str], list[dict]] = {}

        # 调度参数
        # v5.3 pace 轨：tick 5.0 -> 8.0；给 think 链留 9-12s 余地
        self.tick_interval = float(os.getenv("TICK_INTERVAL_SECONDS", "8.0"))
        self.narrative_every = int(os.getenv("NARRATIVE_EVERY_N_TICKS", "4"))
        self.seed_every = int(os.getenv("SEED_EVENT_EVERY_N_TICKS", "4"))
        self.seed_prob = float(os.getenv("SEED_EVENT_PROBABILITY", "0.7"))
        # v5: agent reflect 周期
        self.reflect_every = int(os.getenv("REFLECT_EVERY_N_TICKS", "5"))
        # 单 agent think_and_act 时间上限（占 tick_interval 一定比例）
        # v5.3：think_timeout_min 4.5 -> 9.0 高基线；env 默认 12.0 拉得更宽
        self.think_timeout_ratio = float(os.getenv("THINK_TIMEOUT_RATIO", "0.8"))
        self.think_timeout_min = float(os.getenv("THINK_TIMEOUT_MIN", "9.0"))
        # v5.3：投种子后 2 tick 内 timeout x SHOCK_BOOST，给 LLM 更多思考时间
        self.shock_boost = float(os.getenv("SHOCK_BOOST", "1.5"))
        # v5.4：LLM reason 独立超时，解耦 tick_interval（修 F1：旧 max(9,tick*0.8) 太短致超时降级）
        self.reason_timeout = float(os.getenv("REASON_TIMEOUT_SECONDS", "15.0"))
        self._post_seed_boost_until_tick: int = 0

        self.snapshot_dir = Path(os.getenv("SNAPSHOT_PATH", "snapshots"))
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)

        self._running = False
        self._loop_task: Optional[asyncio.Task] = None
        self._background_tasks: set[asyncio.Task] = set()

    # ---------- 加载/重置 ----------

    def reload_seeds(self) -> None:
        """重新加载角色、地点和种子事件。"""
        self.agents, self.places = load_agents_and_places()
        self.seed_events = load_seed_events()

    async def reset(self) -> None:
        """重置：保留 event_bus 的订阅者但清空历史，重新加载 seed。"""
        self.tick = 0
        self.start_ts_ms = int(time.time() * 1000)
        self.dialog_history.clear()
        self.event_bus._history.clear()  # 清历史，订阅者保留
        self.narrative.active_headlines.clear()
        self.narrative._empty_streak = 0
        self.reload_seeds()
        await self.event_bus.publish(Event(
            tick=0, kind="system", text="🔁 世界已重置",
        ))

    # ---------- 时钟 ----------

    def clock(self, tick: Optional[int] = None) -> tuple[int, str]:
        """将 tick 编号转换为 (day, HH:MM) 格式的游戏内时间。起始：Day 1 06:00。"""
        t = self.tick if tick is None else tick
        minutes_total = t * 10
        # 起始时间 Day 1 06:00
        day = minutes_total // (24 * 60) + 1
        m_of_day = (6 * 60 + minutes_total) % (24 * 60)
        return day, f"{m_of_day // 60:02d}:{m_of_day % 60:02d}"

    # ---------- 主循环 ----------

    async def start_loop(self) -> None:
        """启动 tick 主循环（幂等：已在运行则跳过）。"""
        if self._running:
            return
        self._running = True
        self._loop_task = asyncio.create_task(self._loop())

    async def stop_loop(self) -> None:
        """停止 tick 主循环。"""
        self._running = False
        # Cancel all retained background tasks first
        for t in list(self._background_tasks):
            t.cancel()
        if self._background_tasks:
            await asyncio.gather(*self._background_tasks, return_exceptions=True)
        self._background_tasks.clear()
        if self._loop_task:
            self._loop_task.cancel()
            try:
                await self._loop_task
            except asyncio.CancelledError:
                pass
            self._loop_task = None

    def _spawn_background(self, coro) -> asyncio.Task:
        """Create a background task and retain a strong reference to prevent GC."""
        task = asyncio.create_task(coro)
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)
        return task

    async def _loop(self) -> None:
        """Tick 主循环体：广播欢迎 -> do_tick -> 按间隔 sleep。"""
        # 启动时立刻广播一条欢迎，确保订阅者能马上看到东西
        day, time_str = self.clock()
        await self.event_bus.publish(Event(
            tick=0, kind="system",
            text=f"🌅 EchoWorld 启动 — Day {day} {time_str}，{len(self.agents)} 个角色就位",
        ))
        while self._running:
            try:
                t0 = time.time()
                await self.do_tick()
                elapsed = time.time() - t0
                sleep_for = max(0.0, self.tick_interval - elapsed)
                if sleep_for > 0:
                    await asyncio.sleep(sleep_for)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.exception(f"tick loop error: {e}")
                await asyncio.sleep(2)

    # ---------- 单 tick ----------

    async def do_tick(self) -> None:
        """执行一次完整 tick：think -> apply -> talk -> 种子 -> 叙事 -> 快照。

        P1-T4 fix：dead agent 分支中 pending_talk_intent 和 pending_talk_draft
        的清理代码被提升到 continue 之前，消除不可达代码。
        """
        self.tick += 1
        day, time_str = self.clock()
        await self.event_bus.publish(Event(
            tick=self.tick, kind="tick_marker",
            text=f"Day {day} {time_str}",
            payload={"day": day, "time": time_str},
        ))

        # 1) v5：think_and_act 并行（跳过玩家化身 + non-alive 角色）
        # v5.3：投种子后 _post_seed_boost_until_tick 内 timeout x shock_boost（默认 1.5）
        boost = self.shock_boost if self.tick <= self._post_seed_boost_until_tick else 1.0
        # v5.4：reason 超时独立，给 LLM 足够时间 + 5s 余量给 tool dispatch（修 F1）
        timeout_s = (self.reason_timeout + 5.0) * boost
        think_coros: list[asyncio.Task] = []
        npc_indices: list[int] = []
        for i, a in enumerate(self.agents):
            if a.name == self.player_avatar:
                continue
            # v5.3：dead / unconscious / missing 一律跳过 think
            # FIX(P1-T4)：三笔 pending 赋值统一在 continue 之前完成，
            # 原始代码在 continue 之后还有 pending_talk_intent/draft 赋值（不可达）
            if not a.is_alive():
                a.pending_action = None
                a.pending_talk_intent = ""
                a.pending_talk_draft = ""
                continue
            npc_indices.append(i)
            think_coros.append(asyncio.create_task(self._safe_think(a, timeout_s)))
        if think_coros:
            await asyncio.gather(*think_coros, return_exceptions=True)

        # 2) Apply 串行（消费每个 agent 的 pending_action；None -> rest 兜底）
        actions: list[Action] = [Action.rest("（等待玩家操作）") for _ in self.agents]
        for idx in npc_indices:
            agent = self.agents[idx]
            # 双保险：非 alive 再次跳过
            if not agent.is_alive():
                continue
            act = agent.pending_action or Action.rest("（按兵不动）")
            actions[idx] = act
            await self._apply_action(agent, act)

        # 3) Talk pair 并行（同样跳过玩家化身 + non-alive）
        pairs = self._pair_up(actions)
        pairs = [(a, b) for (a, b) in pairs
                 if a.name != self.player_avatar and b.name != self.player_avatar
                 and a.is_alive() and b.is_alive()]
        if pairs:
            await asyncio.gather(*[self._run_talk_pair(a, b) for (a, b) in pairs],
                                 return_exceptions=True)

        # 3.5) 清空运行时槽（无论是否被消费）
        for a in self.agents:
            a.pending_action = None
            a.pending_talk_intent = ""
            a.pending_talk_draft = ""

        # 3.6) v5：周期性 reflect（错峰，每 tick 只让 1-2 个 agent reflect 以控 LLM 压力）
        if self.tick % self.reflect_every == 0:
            self._spawn_background(self._run_periodic_reflects())

        # 4) 种子事件（剧情温度计：戏剧低时主动注入）
        should_inject = False
        # v5.4（修 F3）：首 tick 强制注入一颗，确保开场即有戏剧
        if self.tick == 1 and self.seed_events:
            should_inject = True
        elif self.tick % self.seed_every == 0 and self.seed_events:
            if random.random() < self.seed_prob:
                should_inject = True
        # 戏剧温度计：每 10 tick 检查最近 30 个事件的"剧变"密度，过低就强制注入
        if self.tick > 5 and self.tick % 10 == 0 and self.seed_events:
            recent = self.event_bus._history[-30:]
            dramatic = sum(1 for ev in recent if (
                ev.kind == "narrative"
                or ev.kind == "seed"
                or (ev.kind == "talk" and (
                    abs(ev.payload.get("relation_delta", {}).get("trust", 0)) >= 2
                    or abs(ev.payload.get("relation_delta", {}).get("fondness", 0)) >= 2
                    or abs(ev.payload.get("relation_delta", {}).get("jealousy", 0)) >= 2
                ))
            ))
            if dramatic < 4:  # 30 个事件中戏剧性只有 <4，太平淡，强制注入
                should_inject = True
                logger.info(f"剧情温度过低 (dramatic={dramatic}/30)，强制注入种子")
        if should_inject:
            try:
                await self._inject_seed_event()
            except Exception as e:
                logger.warning(f"种子注入失败: {e}")

        # 5) 叙事检测后台
        if self.tick % self.narrative_every == 0:
            recent = self.event_bus.recent_for_narrative(15)
            if recent:
                self._spawn_background(self._run_narrative(recent))

        # 5.5) 性格演化（每 20 tick）
        if self.tick > 0 and self.tick % 20 == 0:
            try:
                await self.evolve_personalities()
            except Exception as e:
                logger.warning(f"evolve personalities fail: {e}")

        # 6) 快照
        if self.tick % 10 == 0:
            try:
                self._dump_snapshot()
            except Exception as e:
                logger.warning(f"snapshot fail: {e}")

