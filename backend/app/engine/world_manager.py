"""WorldManager：管理多个独立 World 实例（多场景支持）。"""
from __future__ import annotations

import logging
from typing import Optional

from app.services import LLMClient
from app.engine.world import World

logger = logging.getLogger("echoworld.manager")


class WorldManager:
    """管理 dict[scene_id -> World]。每个 scene 有独立的 tick loop、agents、places。"""

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.scenes: dict[str, World] = {}

    async def create_scene(self, scene_id: str, config: dict) -> World:
        """从 config 创建新 World，启动 tick loop。"""
        if scene_id in self.scenes:
            await self.delete_scene(scene_id)
        world = World(self.llm)
        world.scene_id = scene_id
        world.theme = config.get("theme", "medieval")
        world.story_background = config.get("story_background", "")
        world.build_from_config(config)
        world.reload_seeds = lambda: None  # 禁止从 YAML 重新加载
        self.scenes[scene_id] = world
        await world.start_loop()
        logger.info(f"scene created: {scene_id} (theme={world.theme}, agents={len(world.agents)})")
        return world

    def get_scene(self, scene_id: str) -> Optional[World]:
        return self.scenes.get(scene_id)

    def get_default(self) -> World:
        """返回 default scene（向后兼容）。"""
        return self.scenes.get("default")

    async def delete_scene(self, scene_id: str) -> None:
        if scene_id not in self.scenes:
            return
        w = self.scenes[scene_id]
        await w.stop_loop()
        del self.scenes[scene_id]
        logger.info(f"scene deleted: {scene_id}")

    def list_scenes(self) -> list[dict]:
        return [
            {
                "scene_id": w.scene_id,
                "theme": w.theme,
                "story_background": w.story_background,
                "tick": w.tick,
                "agent_count": len(w.agents),
                "place_count": len(w.places),
                "headlines": w.narrative.active_headlines[-3:],
            }
            for w in self.scenes.values()
        ]
