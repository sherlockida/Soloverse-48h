"""Shared fixtures for EchoWorld test suite.

All tests import from the origin/backend directory. The source modules use
relative imports (e.g. ``from .memory import ...``), so they must be loaded as
a proper Python package. We register the origin/backend package manually via
importlib and inject it into sys.modules BEFORE any ``from backend.xxx``
statement, which prevents the empty SoloVerse/backend/__init__.py from
shadowing it.
"""
from __future__ import annotations

import importlib
import importlib.util
import sys
import asyncio
from pathlib import Path
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock

import pytest

# ---------------------------------------------------------------------------
# Register origin/backend as the canonical ``backend`` package.
# ---------------------------------------------------------------------------
_ORIGIN_DIR = Path(__file__).resolve().parents[2] / "origin"
_ORIGIN_BACKEND_DIR = _ORIGIN_DIR / "backend"
_PACKAGE_NAME = "echoworld_src"  # unique name to avoid collision

# We register origin/backend under a unique top-level name so it never
# collides with SoloVerse/backend (the current project directory).
_SPEC = importlib.util.spec_from_file_location(
    _PACKAGE_NAME,
    str(_ORIGIN_BACKEND_DIR / "__init__.py"),
    submodule_search_locations=[str(_ORIGIN_BACKEND_DIR)],
)
_PKG: ModuleType = importlib.util.module_from_spec(_SPEC)
sys.modules[_PACKAGE_NAME] = _PKG
_SPEC.loader.exec_module(_PKG)  # type: ignore[union-attr]

# Expose sub-modules as shortcuts: conftest will import them once here,
# then individual test files can use ``from backend.xxx import ...`` after
# we alias the names into the global ``backend`` namespace.
_memory_mod = importlib.import_module(".memory", package=_PACKAGE_NAME)
_agent_mod = importlib.import_module(".agent", package=_PACKAGE_NAME)
_events_mod = importlib.import_module(".events", package=_PACKAGE_NAME)
_tools_mod = importlib.import_module(".tools", package=_PACKAGE_NAME)
_world_mod = importlib.import_module(".world", package=_PACKAGE_NAME)
_llm_mod = importlib.import_module(".llm_client", package=_PACKAGE_NAME)
_prompts_mod = importlib.import_module(".prompts", package=_PACKAGE_NAME)
_narrative_mod = importlib.import_module(".narrative", package=_PACKAGE_NAME)
_seed_loader_mod = importlib.import_module(".seed_loader", package=_PACKAGE_NAME)

# ---------------------------------------------------------------------------
# Re-export into test-friendly ``backend`` namespace so test files can do
# ``from backend.memory import Memory`` etc.
# ---------------------------------------------------------------------------
class _BackendNamespace:
    """Lazy namespace that delegates to the real origin sub-modules."""
    memory = _memory_mod
    agent = _agent_mod
    events = _events_mod
    tools = _tools_mod
    world = _world_mod
    llm_client = _llm_mod
    prompts = _prompts_mod
    narrative = _narrative_mod
    seed_loader = _seed_loader_mod

# Inject into sys.modules so that ``from backend.xxx import yyy`` works
sys.modules["backend"] = _BackendNamespace()
sys.modules["backend.memory"] = _memory_mod
sys.modules["backend.agent"] = _agent_mod
sys.modules["backend.events"] = _events_mod
sys.modules["backend.tools"] = _tools_mod
sys.modules["backend.world"] = _world_mod
sys.modules["backend.llm_client"] = _llm_mod
sys.modules["backend.prompts"] = _prompts_mod
sys.modules["backend.narrative"] = _narrative_mod
sys.modules["backend.seed_loader"] = _seed_loader_mod

# Now safe to import using the familiar names
from backend.memory import Memory, Relation, Thread  # noqa: E402
from backend.agent import Agent, Action, TalkResult, ShortTermPlan, PlanStep, ThinkResult  # noqa: E402
from backend.events import Event, EventBus  # noqa: E402
from backend.tools import dispatch_tool, is_soft, is_hard, TOOL_REGISTRY  # noqa: E402
from backend.world import World  # noqa: E402
from backend.llm_client import LLMClient  # noqa: E402

# ---------------------------------------------------------------------------
# Async event-loop fixture (pytest-asyncio >=0.23)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.WindowsSelectorEventLoopPolicy()


@pytest.fixture(scope="session")
def event_loop(event_loop_policy):
    policy = event_loop_policy
    loop = policy.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# mock_llm
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_llm():
    """AsyncMock LLM client with chat_json returning canned responses per kind."""
    llm = MagicMock(spec=LLMClient)

    canned: dict[str, dict | list | str] = {
        "decide":    {"kind": "rest", "target": "", "reason": "（mock decide）", "thought": "（mock thought）"},
        "talk":      {"utterance": "嗯……我知道了。", "inner_thought": "（心里想着别的事）", "intent": "敷衍", "relation_delta": {}},
        "narrative": {"headlines": []},
        "reason":    {"thought": "（mock reason）", "tool_calls": [], "plan_patch": {}},
        "reflect":   {"thought": "（mock reflect）", "plan_patch": {}, "belief_update": [], "thread_changes": {}},
        "summarize": "一段平静的日子",
        "extract":   {"world_changes": []},
    }

    async def _chat_json(system: str, user: str, *, kind: str = "decide"):
        resp = canned.get(kind, {"thought": "mock fallback"})
        usage = {
            "prompt_tokens": 10, "completion_tokens": 10, "total_tokens": 20,
            "latency_ms": 1, "provider": "mock", "model": "mock", "kind": kind,
        }
        return resp, usage

    llm.chat_json = AsyncMock(side_effect=_chat_json)
    llm.on_provider_switch = None
    return llm


# ---------------------------------------------------------------------------
# sample_memory
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_memory():
    """A Memory with known content for testing recall / scoring."""
    return Memory(
        tick=10, kind="observed",
        content="Alice 在广场上和 Bob 聊了聊天气",
        participants=["Alice", "Bob"],
        emotion=2, importance=3,
    )


# ---------------------------------------------------------------------------
# sample_agent
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_agent():
    """Agent with name='TestAgent' and minimal persona."""
    return Agent(
        name="TestAgent",
        emoji="🧪",
        persona="一个用于测试的虚拟角色。",
        voice="简洁冷静",
        goals=["完成测试"],
        location="广场",
        memories=[],
    )


# ---------------------------------------------------------------------------
# event_bus
# ---------------------------------------------------------------------------

@pytest.fixture
def event_bus():
    """Fresh EventBus instance."""
    return EventBus(history_size=200)


# ---------------------------------------------------------------------------
# sample_world
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_world(mock_llm, event_bus):
    """World instance with mock_llm and manually constructed agents/places.

    We build the world manually to avoid seed_loader FileNotFound errors
    that would occur if config/seed.yaml were missing.
    """
    test_agents = [
        Agent(name="Alice", emoji="👩‍⚕️", persona="镇上唯一的医生", voice="简短直接",
              goals=["健康"], location="医院"),
        Agent(name="Bob", emoji="🔨", persona="沉默寡言的铁匠", voice="少言寡语",
              goals=["还债"], location="农场"),
        Agent(name="Carol", emoji="💼", persona="杂货店老板", voice="爱笑",
              goals=["生意"], location="广场"),
    ]
    test_places = ["广场", "农场", "医院", "画室", "酒馆", "民居"]

    # Build World manually via __new__ to bypass __init__ (which calls
    # seed_loader and NarrativeDetector requiring external deps).
    world = World.__new__(World)
    world.llm = mock_llm
    world.event_bus = event_bus
    world.narrative = MagicMock()
    world.narrative.active_headlines = []
    world.narrative._empty_streak = 0
    world.agents = test_agents
    world.places = test_places
    world.seed_events = [
        {"desc": "镇上突然停电了", "affected": ["Alice", "Bob"]},
    ]
    world.scene_id = "default"
    world.theme = "medieval"
    world.story_background = ""
    world.player_avatar = None
    world._dramatic_events_recent = 0
    world.tick = 0
    world.start_ts_ms = 0
    world.dialog_history = {}
    world.tick_interval = 8.0
    world.narrative_every = 4
    world.seed_every = 8
    world.seed_prob = 0.3
    world.reflect_every = 5
    world.think_timeout_ratio = 0.8
    world.think_timeout_min = 9.0
    world.shock_boost = 1.5
    world._post_seed_boost_until_tick = 0
    world.snapshot_dir = Path("/tmp/soloverse_test_snapshots")
    world.snapshot_dir.mkdir(parents=True, exist_ok=True)
    world._running = False
    world._loop_task = None

    def _reload_seeds():
        world.agents = list(test_agents)
        world.places = list(test_places)
        world.seed_events = [
            {"desc": "镇上突然停电了", "affected": ["Alice", "Bob"]},
        ]
    world.reload_seeds = _reload_seeds

    return world
