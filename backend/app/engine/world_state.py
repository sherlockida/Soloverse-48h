"""World state mixin: read-only state, snapshots, personality evolution, config.

Methods split from origin world.py for P2-T1:
- snapshot_dict, _dump_snapshot, chronicle, suggest_seeds, generate_ending
- evolve_personalities, build_from_config
"""
from __future__ import annotations

import json
import logging
import random
from pathlib import Path
from typing import Optional

from app.agents import Agent
from app.engine.events import Event
from app.models.memory import Memory, Relation, Thread
from app.models.world import SeedEvent

logger = logging.getLogger("echoworld.world")


class WorldStateMixin:
    """Mixin providing read-only state methods for World."""

    # ------------------------------------------------------------------
    # Internal references set at composition time (see world.py)
    # ------------------------------------------------------------------
    event_bus: object  # EventBus
    agents: list[Agent]
    places: list[str]
    scene_id: str
    theme: str
    story_background: str
    player_avatar: Optional[str]
    tick: int
    tick_interval: float
    snapshot_dir: Path
    narrative: object  # NarrativeDetector

    # ------------------------------------------------------------------
    # Constants
    # ------------------------------------------------------------------

    PERSONA_MAX_LEN: int = 300

    # ------------------------------------------------------------------
    # Snapshot
    # ------------------------------------------------------------------

    def _dump_snapshot(self) -> None:
        """Write tick snapshot to disk."""
        path = self.snapshot_dir / f"tick_{self.tick:04d}.json"
        with path.open("w", encoding="utf-8") as f:
            json.dump(self.snapshot_dict(), f, ensure_ascii=False, indent=2)

    def snapshot_dict(self) -> dict:
        """Return world snapshot as dict (for API / SSE / disk)."""
        return {
            "tick": self.tick,
            "clock": {"day": self.clock()[0], "time": self.clock()[1]},
            "agents": [a.model_dump() for a in self.agents],
            "places": self.places,
            "scene_id": self.scene_id,
            "theme": self.theme,
            "story_background": self.story_background,
            "active_headlines": [h.model_dump() for h in self.narrative.active_headlines[-10:]],
            "tick_interval": self.tick_interval,
            "player_avatar": self.player_avatar,
        }

    # ------------------------------------------------------------------
    # Chronicle (global timeline of important events)
    # ------------------------------------------------------------------

    def chronicle(self, limit: int = 50) -> dict:
        """Global important event stream: narrative + seed + hot talk + system."""
        all_events = self.event_bus._history
        important: list[dict] = []
        for ev in all_events:
            if ev.kind == "narrative":
                p = ev.payload or {}
                important.append({
                    "tick": ev.tick, "kind": "narrative",
                    "text": p.get("headline") or ev.text,
                    "meta": f"drama={p.get('drama','?')} | {', '.join(p.get('involved', []))}",
                })
            elif ev.kind == "seed":
                p = ev.payload or {}
                affected_str = ", ".join(p.get("affected", []))
                effects_str = ", ".join(p.get("effects", [])) if p.get("effects") else ""
                meta = "影响：" + affected_str
                if effects_str:
                    meta += " | 触发特效：" + effects_str
                important.append({
                    "tick": ev.tick, "kind": "seed",
                    "text": p.get("desc") or ev.text,
                    "meta": meta,
                })
            elif ev.kind == "system" and ("性格悄悄变了" in ev.text or "化身" in ev.text or "重置" in ev.text):
                important.append({
                    "tick": ev.tick, "kind": "system",
                    "text": ev.text, "meta": "",
                })
            elif ev.kind == "talk":
                p = ev.payload or {}
                d = p.get("relation_delta") or {}
                s = abs(d.get("trust", 0)) + abs(d.get("fondness", 0)) + abs(d.get("jealousy", 0)) + abs(d.get("guilt", 0))
                if s >= 4:
                    important.append({
                        "tick": ev.tick, "kind": "talk_hot",
                        "text": f"{ev.actor} → {ev.target}：「{p.get('utterance', '')}」",
                        "meta": f"关系变化 Δ={s} | intent={p.get('intent', '')}",
                    })
        important.sort(key=lambda x: -x["tick"])
        return {
            "tick": self.tick,
            "total_events": len(all_events),
            "important_count": len(important),
            "items": important[:limit],
        }

    # ------------------------------------------------------------------
    # Seed suggestions (rule-based, no LLM)
    # ------------------------------------------------------------------

    def suggest_seeds(self, n: int = 6) -> list[dict]:
        """Generate n customized seed suggestions for the current scene."""
        suggestions: list[dict] = []
        names = [a.name for a in self.agents]
        if len(names) < 2:
            return [{"label": "🌫 一阵奇怪的雾笼罩了世界",
                     "text": "一阵奇怪的雾笼罩了所有人的视野",
                     "effect": "fog"}]

        # 1) From threads:暗恋/秘密/债务/嫉妒
        for a in self.agents:
            for t in (a.threads or []):
                if not t.target or t.target not in names:
                    continue
                if any(k in t.desc for k in ["暗恋", "喜欢", "对...着迷", "好感", "爱", "心动"]):
                    suggestions.append({
                        "label": f"💌 一封写给 {t.target} 的匿名情书",
                        "text": f"一封匿名情书出现在 {t.target} 面前，没有署名，只写着「我想见你」",
                    })
                    break
                if any(k in t.desc for k in ["秘密", "真相", "知道", "目击", "内情"]):
                    suggestions.append({
                        "label": f"🕵 关于{t.target}的秘密被传开",
                        "text": f"一段关于 {t.target} 的隐秘传闻在场景里悄悄流传",
                    })
                if any(k in t.desc for k in ["欠", "债务", "钱", "利息"]):
                    suggestions.append({
                        "label": f"💰 {t.target} 突然要钱",
                        "text": f"{t.target} 当众催讨一笔旧债",
                    })
                if any(k in t.desc for k in ["嫉妒", "对手", "抢"]):
                    suggestions.append({
                        "label": f"🔥 {a.name} 和 {t.target} 当众撕起来",
                        "text": f"{a.name} 当着大家的面跟 {t.target} 撕破脸",
                    })

        # 2) Hot relation pairs
        hot_pairs: list[tuple[str, str, int]] = []
        for a in self.agents:
            for other, r in (a.relations or {}).items():
                if other == a.name or other not in names:
                    continue
                inten = abs(r.trust) + abs(r.fondness) + abs(r.jealousy) + abs(r.guilt)
                hot_pairs.append((a.name, other, inten))
        hot_pairs.sort(key=lambda x: -x[2])
        for x, y, _ in hot_pairs[:2]:
            suggestions.append({
                "label": f"👀 有人撞见 {x} 和 {y} 单独在一起",
                "text": f"目击者称看见 {x} 和 {y} 单独相处，神情不寻常",
            })

        # 3) Random character incidents
        if self.agents:
            random_agent = random.choice(self.agents).name
            suggestions.append({
                "label": f"🏥 {random_agent} 突然病倒",
                "text": f"{random_agent} 突然在场景里晕倒，所有人围过去",
            })
            another = random.choice(self.agents).name
            suggestions.append({
                "label": f"📦 {another} 收到一份不寻常的包裹",
                "text": f"{another} 收到一个没寄件人的包裹，里面装着不该出现的东西",
            })

        # 4) Environmental seeds with effects
        env_seeds = [
            {"label": "⚡ 突然停电", "text": "整个场景陷入黑暗，谁也看不见谁，只能凭声音判断", "effect": "blackout"},
            {"label": "🌧 暴雨突袭", "text": "天突然下起暴雨，所有人都被困在最近的房间里", "effect": "rain"},
            {"label": "🔥 起火了！", "text": "某个角落突然起火，所有人都得做出反应", "effect": "fire"},
            {"label": "🚨 警报响起", "text": "突然响起警报声，没人知道为什么", "effect": "alert"},
            {"label": "🌙 时间跳到深夜", "text": "时间突然跳到深夜，每个人都该回房间了，但没人想动", "effect": "night"},
            {"label": "🌫 浓雾席卷", "text": "一阵浓雾席卷而来，视线模糊，气氛诡异", "effect": "fog"},
        ]
        suggestions.extend(self._rng_pick(env_seeds, 2))

        # Deduplicate + shuffle
        seen: set[str] = set()
        unique: list[dict] = []
        for s in suggestions:
            if s["label"] in seen:
                continue
            seen.add(s["label"])
            unique.append(s)
        random.shuffle(unique)
        return unique[:n]

    @staticmethod
    def _rng_pick(arr: list, n: int) -> list:
        """Pick n random items from arr without replacement."""
        if n >= len(arr):
            return arr[:]
        return random.sample(arr, n)

    # ------------------------------------------------------------------
    # Personality evolution (every 20 ticks)
    # ------------------------------------------------------------------

    async def evolve_personalities(self) -> None:
        """Evolve personas based on strongest relations."""
        for a in self.agents:
            if not a.is_alive():
                continue
            if not a.relations:
                continue
            items: list[tuple[str, Relation, int]] = []
            for n, r in a.relations.items():
                if n == a.name:
                    continue
                inten = abs(r.trust) + abs(r.fondness) + abs(r.jealousy) + abs(r.guilt)
                items.append((n, r, inten))
            if not items:
                continue
            items.sort(key=lambda x: -x[2])
            n, r, inten = items[0]
            if inten < 6:
                continue
            line = None
            if r.fondness >= 7:
                line = f"（这段日子因为{n}，ta 变得更愿意敞开心扉。）"
            elif r.trust <= -5:
                line = f"（被{n}反复刺痛后，ta 学会了对人留三分戒备。）"
            elif r.jealousy >= 6:
                line = f"（{n}的存在让 ta 心里多了一根拔不掉的刺。）"
            elif r.guilt >= 6:
                line = f"（对{n}的愧疚日益沉重，ta 越来越不敢直视对方。）"
            elif r.fondness <= -5:
                line = f"（对{n}的厌烦累积成了一道墙。）"
            else:
                continue
            if line in a.persona:
                continue
            new_persona = a.persona + line
            if len(new_persona) > self.PERSONA_MAX_LEN:
                head_keep = self.PERSONA_MAX_LEN - len(line) - 10
                new_persona = a.persona[:head_keep] + "…" + line
            a.persona = new_persona
            a.add_memory(Memory(tick=self.tick, kind="felt",
                                 content=f"内心变化：{line.strip('（）')}"))
            await self.event_bus.publish(Event(
                tick=self.tick, kind="system",
                text=f"💭 {a.emoji} {a.name} 的性格悄悄变了：{line}",
                payload={"agent": a.name, "evolved": line},
            ))

    # ------------------------------------------------------------------
    # Ending generation
    # ------------------------------------------------------------------

    def generate_ending(self) -> dict:
        """Generate per-agent endings + global ending based on relations."""
        endings: list[dict] = []
        for a in self.agents:
            rels = a.relations or {}
            strong: list[tuple[str, Relation, int]] = []
            for n, r in rels.items():
                inten = abs(r.trust) + abs(r.fondness) + abs(r.jealousy) + abs(r.guilt)
                strong.append((n, r, inten))
            strong.sort(key=lambda x: -x[2])
            top = strong[:3]

            lines: list[str] = []
            for name, r, _ in top:
                if r.fondness >= 6 and r.trust >= 3:
                    lines.append(f"和 {name} 走到了一起")
                elif r.fondness >= 6 and r.trust <= -2:
                    lines.append(f"和 {name} 之间是说不清的纠葛")
                elif r.trust <= -5 or r.fondness <= -5:
                    lines.append(f"和 {name} 彻底翻了脸")
                elif r.jealousy >= 6:
                    lines.append(f"始终没放下对 {name} 的嫉妒")
                elif r.guilt >= 6:
                    lines.append(f"心里欠着 {name} 一笔账，没能说出口")
                elif r.fondness >= 3:
                    lines.append(f"和 {name} 关系比从前更近")
                elif r.trust >= 3:
                    lines.append(f"成了 {name} 默认的盟友")
                elif r.trust <= -3:
                    lines.append(f"被 {name} 列入了警惕名单")
                elif r.fondness <= -3:
                    lines.append(f"和 {name} 早就懒得寒暄")

            unfin = ", ".join(t.desc[:18] for t in (a.threads or [])[:2])
            persona_line = ""
            if unfin:
                persona_line = f"心里那件「{unfin}」依然悬着。"
            ending_text = (
                ("、".join(lines) or "保持着自己原本的样子") + "。"
                + (persona_line if persona_line else "")
            )
            endings.append({
                "name": a.name,
                "emoji": a.emoji,
                "role": a.role,
                "ending": ending_text,
            })

        # Global summary
        recent = self.event_bus._history[-50:]
        narratives = [e for e in recent if e.kind == "narrative"]
        seeds = [e for e in recent if e.kind == "seed"]
        flavor = (
            f"在 {self.tick} 个 tick 的时间里，他们一共制造了 {len(narratives)} 条头条、"
            f"经历了 {len(seeds)} 次扰动。"
        )
        pairs: list[tuple[str, str, Relation, int]] = []
        for a in self.agents:
            for n, r in (a.relations or {}).items():
                if n == a.name:
                    continue
                inten = abs(r.trust) + abs(r.fondness) + abs(r.jealousy) + abs(r.guilt)
                if inten >= 8:
                    pairs.append((a.name, n, r, inten))
        pairs.sort(key=lambda x: -x[3])
        headline = ""
        if pairs:
            a, b, r, _ = pairs[0]
            if r.fondness >= 6 and r.trust >= 3:
                headline = f"💕 故事的主角最终是 {a} 和 {b}"
            elif r.jealousy >= 5:
                headline = f"🔥 {a} 和 {b} 的恩怨成了这个世界的注脚"
            elif r.guilt >= 5:
                headline = f"😞 {a} 始终没能向 {b} 说出那句对不起"
            elif r.trust <= -5 or r.fondness <= -5:
                headline = f"💔 {a} 和 {b} 已经撕到了不可挽回"
            else:
                headline = f"🎭 {a} 和 {b} 之间始终保持着一段戏"
        else:
            headline = "🎭 没有谁的故事被推到顶峰，所有人各自安好"

        player_line = ""
        if self.player_avatar:
            player_line = f"而你作为 {self.player_avatar}，在这个故事里留下了自己的痕迹。"

        return {
            "tick": self.tick,
            "headline": headline,
            "flavor": flavor,
            "player_line": player_line,
            "agents": endings,
        }

    # ------------------------------------------------------------------
    # Build from config
    # ------------------------------------------------------------------

    def build_from_config(self, config: dict) -> "World":
        """Build world from config dict: agents, places, relations, seed_events."""
        agent_configs: list[dict] = config.get("agents", [])
        places_config: list[str] = config.get("places", [])
        relations_config: list[dict] = config.get("relations", [])

        agents: list[Agent] = []
        for a in agent_configs:
            agent = Agent(
                name=a["name"],
                emoji=a["emoji"],
                persona=a["persona"],
                voice=a["voice"],
                goals=list(a.get("goals", [])),
                location=a["location"],
                threads=[Thread(**t) for t in (a.get("threads") or [])],
                role=a.get("role", ""),
                color_palette=a.get("color_palette", {}),
            )
            agents.append(agent)

        agent_map = {a.name: a for a in agents}
        for r in relations_config:
            src = r.get("from")
            dst = r.get("to")
            if src in agent_map and dst in agent_map:
                agent_map[src].relations[dst] = Relation(
                    trust=int(r.get("trust", 0)),
                    fondness=int(r.get("fondness", 0)),
                    jealousy=int(r.get("jealousy", 0)),
                    guilt=int(r.get("guilt", 0)),
                )

        if config.get("seed_events"):
            # v5.4（修 F3）：转 SeedEvent 对象，否则 _inject_seed_event 用 ev.desc 会 AttributeError 被吞
            self.seed_events = [
                SeedEvent(
                    desc=ev.get("desc", ""),
                    affected=ev.get("affected", []) or [],
                    effects=ev.get("effects", []) or [],
                )
                for ev in config["seed_events"]
            ]

        self.agents = agents
        self.places = places_config
        return self
