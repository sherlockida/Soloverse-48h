"""YAML -> initial World objects (agents, places, seed_events)."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from app.agents import Agent
from app.models.memory import Relation, Thread
from app.models.world import SeedEvent

logger = logging.getLogger("echoworld.seed")

_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_CONFIG_DIR = _PROJECT_ROOT / "config"


def load_agents_and_places(seed_path: str | None = None) -> tuple[list[Agent], list[str]]:
    if seed_path is None:
        seed_path = str(_CONFIG_DIR / "seed.yaml")

    p = Path(seed_path)
    if not p.exists():
        raise FileNotFoundError(f"seed.yaml not found: {seed_path}")
    try:
        with p.open("r", encoding="utf-8") as f:
            data: dict[str, Any] = yaml.safe_load(f)
    except yaml.YAMLError as exc:
        logger.error("Failed to parse %s: %s", seed_path, exc)
        return [], []

    places: list[str] = list(data.get("places", []))
    agents: list[Agent] = []
    for a in data.get("agents", []):
        threads = [Thread(**t) for t in (a.get("threads") or [])]
        agent = Agent(
            name=a["name"],
            emoji=a["emoji"],
            persona=a["persona"],
            voice=a["voice"],
            goals=list(a.get("goals", [])),
            location=a["location"],
            threads=threads,
        )
        agents.append(agent)

    # relation matrix
    agent_map = {a.name: a for a in agents}
    for r in data.get("relations", []):
        src = r.get("from")
        dst = r.get("to")
        if src not in agent_map or dst not in agent_map:
            logger.warning("Ignoring relation with unknown agent: %s->%s", src, dst)
            continue
        agent_map[src].relations[dst] = Relation(
            trust=int(r.get("trust", 0)),
            fondness=int(r.get("fondness", 0)),
            jealousy=int(r.get("jealousy", 0)),
            guilt=int(r.get("guilt", 0)),
        )

    # validate every agent location exists in places
    for a in agents:
        if a.location not in places:
            logger.warning(
                "Agent %s initial location %s not in places, forcing to %s",
                a.name, a.location, places[0],
            )
            a.location = places[0]

    logger.info("loaded %d agents, %d places", len(agents), len(places))
    return agents, places


def load_seed_events(events_path: str | None = None) -> list[SeedEvent]:
    """Load seed events from YAML and return as list[SeedEvent].

    YAML fields (desc, affected, effects) map directly to SeedEvent.
    Extra fields like 'weight' are silently ignored.
    """
    if events_path is None:
        events_path = str(_CONFIG_DIR / "seed_events.yaml")

    p = Path(events_path)
    if not p.exists():
        logger.warning("seed_events.yaml not found: %s, seed event library is empty", events_path)
        return []
    try:
        with p.open("r", encoding="utf-8") as f:
            data: dict[str, Any] = yaml.safe_load(f)
    except yaml.YAMLError as exc:
        logger.error("Failed to parse %s: %s", events_path, exc)
        return []
    raw_events = data.get("events", [])
    events: list[SeedEvent] = []
    for ev in raw_events:
        events.append(SeedEvent(
            desc=ev.get("desc", ""),
            affected=ev.get("affected", []) or [],
            effects=ev.get("effects", []) or [],
        ))
    logger.info("loaded %d seed events", len(events))
    return events
