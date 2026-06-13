"""记忆 / 关系 / 心事 数据模型 + 分词工具。

v5 升级要点：
- Memory 增加 participants / importance / token 缓存，区分 episodic vs semantic（summary/belief）
- 提供 tokenize()（jieba 优先，缺失时用字符 unigram+bigram 兜底，纯 Python 零外部依赖）
- Relation：四维度关系向量，-10..+10
- Thread：未完结心事 unresolved thread，驱动 agent 主动行动

不在本模块做的事（留给 services/recall.py / agent.py / 上层）：
- recall / summarize 算法 —— 在 services/recall.py
- Agent 类如何持有 semantic 列表、何时调用 recall/summarize —— 由上层接入
- LLM client 怎么调 —— 通过 duck-typed `llm.chat_json(sys, usr, kind=...)` 接口
"""
from __future__ import annotations

import logging
from typing import Literal, Optional

from pydantic import BaseModel, Field, PrivateAttr, field_validator

logger = logging.getLogger("echoworld.memory")


# ---------- Memory 类型 ----------

# episodic: observed / talked / felt / thought / seed —— 一次性事件
# semantic: summary（自传摘要） / belief（agent 对他人/世界的长期信念）
MemoryKind = Literal[
    "observed", "talked", "felt", "thought", "seed",
    "summary", "belief",
]

EPISODIC_KINDS = {"observed", "talked", "felt", "thought", "seed"}
SEMANTIC_KINDS = {"summary", "belief"}

# kind -> 默认 importance（0..10），caller 也可显式覆盖
_KIND_IMPORTANCE_DEFAULT: dict[str, int] = {
    "seed":     8,
    "belief":   7,
    "summary":  5,
    "talked":   3,
    "thought":  2,
    "felt":     2,
    "observed": 1,
}


# ---------- 分词 ----------

try:  # jieba 可选
    import jieba  # type: ignore
    jieba.setLogLevel(60)  # 抑制初始化输出
    _HAS_JIEBA = True
except Exception:
    _HAS_JIEBA = False

# 中文常用虚词 + 单字标点
_STOPWORDS = set(
    "的了是和我你他她它在有就也都不没要么呢吧啊呀哦嗯哎哈得地着过把被让会还很太"
    "。，、；：？！「」『』（）()[]【】《》<>\"' \t\n\r"
)


def tokenize(text: str) -> list[str]:
    """中文友好分词：jieba 优先，否则 char-unigram + char-bigram。

    返回结果保留重复（caller 自己 set 或 tf）。
    """
    if not text:
        return []
    text = text.strip()
    if _HAS_JIEBA:
        raw = jieba.lcut(text)
    else:
        # 提取 CJK + 字母数字，丢弃标点/空白
        clean = []
        for c in text:
            if c.isalnum() or "一" <= c <= "鿿":
                clean.append(c.lower())
        # unigram + bigram
        raw = list(clean)
        for i in range(len(clean) - 1):
            raw.append(clean[i] + clean[i + 1])
    out: list[str] = []
    for t in raw:
        t = t.strip().lower()
        if not t:
            continue
        # 过滤单字虚词 + 纯标点
        if t in _STOPWORDS:
            continue
        if len(t) == 1 and not (t.isalnum() or "一" <= t <= "鿿"):
            continue
        out.append(t)
    return out


# ---------- 核心模型 ----------

class Memory(BaseModel):
    tick: int
    kind: MemoryKind
    content: str
    emotion: int = 0  # -5..+5
    # v5 新增：参与者 + 重要度（importance=0 表示用 kind 默认值）
    participants: list[str] = Field(default_factory=list)
    importance: int = 0  # 0..10

    @field_validator("emotion", mode="before")
    @classmethod
    def clamp_emotion(cls, v: object) -> int:
        try:
            iv = int(v)
        except (TypeError, ValueError):
            return 0
        return max(-5, min(5, iv))

    @field_validator("importance", mode="before")
    @classmethod
    def clamp_importance(cls, v: object) -> int:
        try:
            iv = int(v)
        except (TypeError, ValueError):
            return 0
        return max(0, min(10, iv))

    # 私有缓存（不参与序列化）
    _tokens_cache: Optional[set[str]] = PrivateAttr(default=None)
    _tf_cache: Optional[dict[str, int]] = PrivateAttr(default=None)

    def short(self) -> str:
        return f"[t{self.tick}|{self.kind}] {self.content}"

    @property
    def effective_importance(self) -> int:
        if self.importance and self.importance > 0:
            return min(10, self.importance)
        return _KIND_IMPORTANCE_DEFAULT.get(self.kind, 1)

    def is_episodic(self) -> bool:
        return self.kind in EPISODIC_KINDS

    def is_semantic(self) -> bool:
        return self.kind in SEMANTIC_KINDS

    def tokens(self) -> set[str]:
        if self._tokens_cache is None:
            self._build_token_cache()
        assert self._tokens_cache is not None
        return self._tokens_cache

    def tf(self) -> dict[str, int]:
        if self._tf_cache is None:
            self._build_token_cache()
        assert self._tf_cache is not None
        return self._tf_cache

    def _build_token_cache(self) -> None:
        # participants 也并入 token 池，让"对张三说"能被"张三"召回
        src = self.content
        if self.participants:
            src = f"{src} {' '.join(self.participants)}"
        toks = tokenize(src)
        self._tokens_cache = set(toks)
        tf: dict[str, int] = {}
        for t in toks:
            tf[t] = tf.get(t, 0) + 1
        self._tf_cache = tf


class Relation(BaseModel):
    """关系向量：四维度，-10..+10。"""
    trust: int = 0
    fondness: int = 0
    jealousy: int = 0
    guilt: int = 0

    def clamp(self) -> "Relation":
        for k in ("trust", "fondness", "jealousy", "guilt"):
            v = getattr(self, k)
            if v > 10:
                setattr(self, k, 10)
            elif v < -10:
                setattr(self, k, -10)
        return self

    def apply_delta(self, delta: dict) -> None:
        if not isinstance(delta, dict):
            return
        for k in ("trust", "fondness", "jealousy", "guilt"):
            v = delta.get(k)
            if isinstance(v, (int, float)):
                setattr(self, k, getattr(self, k) + int(v))
        self.clamp()

    def summary(self) -> str:
        """给 prompt 用的紧凑文字描述（只显示 |v|>=3 的维度）。"""
        parts = []
        for k in ("trust", "fondness", "jealousy", "guilt"):
            v = getattr(self, k)
            if abs(v) >= 3:
                parts.append(f"{k}={v:+d}")
        return ", ".join(parts) if parts else "中性"

    def intensity(self) -> int:
        return abs(self.trust) + abs(self.fondness) + abs(self.jealousy) + abs(self.guilt)


class Thread(BaseModel):
    """未完结心事 unresolved thread —— 驱动 agent 主动行动的核心机制。"""
    desc: str
    target: Optional[str] = None
    weight: int = 5

    def short(self) -> str:
        if self.target:
            return f"({self.weight}) 关于 {self.target}：{self.desc}"
        return f"({self.weight}) {self.desc}"
