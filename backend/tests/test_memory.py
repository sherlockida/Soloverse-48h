"""Tests for memory.py — tokenize, Memory, Relation, recall, summarize, append_semantic.

All imports come from the origin/backend directory (set up in conftest.py).
"""
from __future__ import annotations

import pytest

from backend.memory import (
    Memory, Relation, Thread,
    tokenize, recall, summarize, should_summarize, append_semantic,
    build_recall_query,
    _jaccard, _tf_overlap, _recency_decay, _emotion_boost,
    EPISODIC_KINDS, SEMANTIC_KINDS,
)


# ======================== tokenize ========================

class TestTokenize:
    def test_empty_string(self):
        assert tokenize("") == []

    def test_whitespace_only(self):
        assert tokenize("   \t\n") == []

    def test_chinese_text(self):
        result = tokenize("你好世界")
        # Should produce unigrams + bigrams for each CJK char
        assert len(result) >= 4  # at least 4 unigrams
        assert "你好" in result
        assert "好世" in result

    def test_stopwords_filtered(self):
        result = tokenize("的了是和在我")
        # 的、了、是、和、我、在 should all be filtered
        for sw in ("的", "了", "是", "和", "我", "在"):
            assert sw not in result

    def test_english_text(self):
        result = tokenize("hello world")
        # Without jieba, fallback tokenizer produces char-unigrams + bigrams
        # "hello" -> h, e, l, l, o, he, el, ll, lo  (duplicates kept)
        assert "h" in result
        assert "w" in result
        # Bigrams exist too
        assert "he" in result
        assert "wo" in result

    def test_mixed_text(self):
        result = tokenize("我去了医院hospital")
        assert len(result) > 0
        # stopwords should be removed
        assert "了" not in result

    def test_punctuation_filtered(self):
        result = tokenize("。，！？")
        assert result == []


# ======================== Memory model ========================

class TestMemoryModel:
    def test_basic_construction(self):
        m = Memory(tick=1, kind="observed", content="test")
        assert m.tick == 1
        assert m.kind == "observed"
        assert m.content == "test"
        assert m.emotion == 0
        assert m.importance == 0
        assert m.participants == []

    def test_short_format(self):
        m = Memory(tick=5, kind="talked", content="hello")
        short = m.short()
        assert "[t5|talked]" in short
        assert "hello" in short

    def test_is_episodic(self):
        for kind in EPISODIC_KINDS:
            m = Memory(tick=0, kind=kind, content="x")
            assert m.is_episodic(), f"{kind} should be episodic"

    def test_is_semantic(self):
        for kind in SEMANTIC_KINDS:
            m = Memory(tick=0, kind=kind, content="x")
            assert m.is_semantic(), f"{kind} should be semantic"

    def test_effective_importance_default(self):
        m = Memory(tick=0, kind="seed", content="x")
        assert m.effective_importance == 8  # seed default

    def test_effective_importance_explicit(self):
        m = Memory(tick=0, kind="seed", content="x", importance=10)
        assert m.effective_importance == 10

    def test_effective_importance_clamp_max(self):
        m = Memory(tick=0, kind="observed", content="x", importance=15)
        assert m.effective_importance == 10  # clamped

    def test_tokens_include_participants(self):
        m = Memory(tick=0, kind="observed", content="看到了情况",
                   participants=["Alice"])
        toks = m.tokens()
        # Without jieba, "Alice" is split into char-unigrams + bigrams
        assert "a" in toks  # first char of "Alice"
        assert "li" in toks  # bigram within "Alice"

    def test_tf_dict(self):
        m = Memory(tick=0, kind="observed", content="下雨 下雨 下雪")
        tf = m.tf()
        assert tf["下雨"] == 2
        assert tf["下雪"] == 1


# ======================== Relation model ========================

class TestRelationModel:
    def test_default_values(self):
        r = Relation()
        assert r.trust == 0
        assert r.fondness == 0
        assert r.jealousy == 0
        assert r.guilt == 0

    def test_clamp_upper(self):
        r = Relation(trust=15, fondness=20)
        r.clamp()
        assert r.trust == 10
        assert r.fondness == 10

    def test_clamp_lower(self):
        r = Relation(trust=-15, guilt=-20)
        r.clamp()
        assert r.trust == -10
        assert r.guilt == -10

    def test_apply_delta(self):
        r = Relation(trust=3, fondness=2)
        r.apply_delta({"trust": 2, "fondness": -1})
        assert r.trust == 5
        assert r.fondness == 1

    def test_apply_delta_clamps(self):
        r = Relation(trust=9)
        r.apply_delta({"trust": 5})  # 9+5=14, should clamp to 10
        assert r.trust == 10

    def test_summary_neutral(self):
        r = Relation()
        assert r.summary() == "中性"

    def test_summary_with_values(self):
        r = Relation(trust=5, fondness=-4, jealousy=0, guilt=0)
        s = r.summary()
        assert "trust=+5" in s
        assert "fondness=-4" in s

    def test_summary_filters_small_values(self):
        r = Relation(trust=1)
        assert r.summary() == "中性"  # |1| < 3

    def test_intensity(self):
        r = Relation(trust=3, fondness=3, jealousy=3, guilt=3)
        assert r.intensity() == 12

    def test_intensity_zero(self):
        r = Relation()
        assert r.intensity() == 0


# ======================== Thread model ========================

class TestThreadModel:
    def test_with_target(self):
        t = Thread(desc="想知道真相", target="Alice", weight=8)
        s = t.short()
        assert "Alice" in s
        assert "想知道真相" in s

    def test_without_target(self):
        t = Thread(desc="隐藏着秘密", weight=5)
        s = t.short()
        assert "隐藏着秘密" in s
        assert "5" in s


# ======================== recall helpers ========================

class TestRecallHelpers:
    def test_jaccard_empty_sets(self):
        assert _jaccard(set(), set()) == 0.0

    def test_jaccard_identical(self):
        s = {"a", "b", "c"}
        assert _jaccard(s, s) == 1.0

    def test_jaccard_no_overlap(self):
        assert _jaccard({"a"}, {"b"}) == 0.0

    def test_jaccard_partial(self):
        j = _jaccard({"a", "b"}, {"b", "c"})
        assert 0 < j < 1

    def tf_overlap_zero(self):
        assert _tf_overlap(set(), {}) == 0.0

    def test_recency_decay_current(self):
        assert _recency_decay(0) == 1.0

    def test_recency_decay_future(self):
        assert _recency_decay(-5) == 1.0

    def test_recency_decay_old(self):
        decay = _recency_decay(100)
        assert decay < 0.5

    def test_emotion_boost_zero(self):
        assert _emotion_boost(0) == 0.0

    def test_emotion_boost_max(self):
        assert _emotion_boost(5) == 0.5


# ======================== recall ========================

class TestRecall:
    def test_empty_memories(self):
        result = recall([], "test")
        assert result == []

    def test_k_zero(self):
        m = Memory(tick=1, kind="observed", content="test")
        assert recall([m], "test", k=0) == []

    def test_returns_at_most_k(self):
        memories = [Memory(tick=i, kind="observed", content=f"memory {i}") for i in range(20)]
        result = recall(memories, "memory", k=3)
        assert len(result) <= 3

    def test_query_empty_returns_recent(self):
        memories = [Memory(tick=i, kind="observed", content=f"item {i}") for i in range(10)]
        result = recall(memories, "", k=3)
        assert len(result) == 3
        # Should be the most recent
        assert result[-1].tick == 9

    def test_relevance_ordering(self):
        m1 = Memory(tick=1, kind="observed", content="Alice 和 Bob 在广场聊天")
        m2 = Memory(tick=2, kind="observed", content="下雨了什么也没做")
        result = recall([m2, m1], "Alice 广场", k=1)
        assert len(result) == 1
        assert "Alice" in result[0].content

    def test_with_semantic_memories(self):
        episodic = [Memory(tick=5, kind="observed", content="看到 Bob 走过")]
        semantic = [Memory(tick=1, kind="belief", content="Bob 是个好人", importance=7)]
        result = recall(episodic, "Bob", k=2, semantic=semantic)
        assert len(result) <= 2
        kinds = {m.kind for m in result}
        # semantic can appear alongside episodic
        assert kinds & {"observed", "belief"}


# ======================== should_summarize ========================

class TestShouldSummarize:
    def test_below_threshold(self):
        mems = [Memory(tick=i, kind="observed", content="x") for i in range(20)]
        assert not should_summarize(mems, cur_tick=30)

    def test_above_threshold_cooldown_ok(self):
        mems = [Memory(tick=i, kind="observed", content="x") for i in range(35)]
        assert should_summarize(mems, last_summarize_tick=0, cur_tick=50)

    def test_within_cooldown(self):
        mems = [Memory(tick=i, kind="observed", content="x") for i in range(35)]
        assert not should_summarize(mems, last_summarize_tick=45, cur_tick=50)


# ======================== summarize ========================

class TestSummarize:
    @pytest.mark.asyncio
    async def test_empty_memories(self):
        result = await summarize([])
        assert result is None

    @pytest.mark.asyncio
    async def test_no_llm_programmatic(self):
        mems = [Memory(tick=i, kind="observed", content=f"event {i}",
                        participants=["Alice"]) for i in range(5)]
        result = await summarize(mems, llm=None)
        assert result is not None
        assert result.kind == "summary"
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_with_mock_llm(self, mock_llm):
        mems = [Memory(tick=i, kind="observed", content=f"event {i}") for i in range(5)]
        result = await summarize(mems, llm=mock_llm)
        assert result is not None
        assert result.kind == "summary"

    @pytest.mark.asyncio
    async def test_llm_failure_fallback(self, mock_llm):
        mock_llm.chat_json.side_effect = RuntimeError("LLM down")
        mems = [Memory(tick=i, kind="observed", content=f"event {i}") for i in range(5)]
        result = await summarize(mems, llm=mock_llm)
        assert result is not None
        assert result.kind == "summary"
        # Should have programmatic fallback text
        assert "t0-" in result.content  # tick range indicator


# ======================== append_semantic ========================

class TestAppendSemantic:
    def test_appends_and_returns_same_list(self):
        lst: list[Memory] = []
        m = Memory(tick=1, kind="summary", content="test")
        result = append_semantic(lst, m)
        assert result is lst
        assert len(lst) == 1

    def test_evicts_when_over_cap(self):
        lst: list[Memory] = []
        cap = 3
        for i in range(5):
            m = Memory(tick=i, kind="summary" if i % 2 == 0 else "belief",
                       content=f"item {i}", importance=i)
            append_semantic(lst, m, cap=cap)
        assert len(lst) == cap

    def test_low_importance_evicted_first(self):
        lst: list[Memory] = []
        # Add low importance
        append_semantic(lst, Memory(tick=1, kind="summary", content="low", importance=1), cap=10)
        # Add high importance
        append_semantic(lst, Memory(tick=2, kind="belief", content="high", importance=9), cap=10)
        # Fill up to cap then evict
        for i in range(9):
            append_semantic(lst, Memory(tick=10+i, kind="summary", content=f"fill {i}",
                                        importance=5), cap=10)
        # "low" (importance=1, tick=1) should be the first evicted
        contents = [m.content for m in lst]
        assert "low" not in contents
        assert "high" in contents


# ======================== build_recall_query ========================

class TestBuildRecallQuery:
    def test_all_fields(self):
        q = build_recall_query(
            location="广场", nearby_names=["Alice", "Bob"],
            primed_memory="听说了一些事", plan_goal="找到真相",
            recent_event_text="Bob 离开了"
        )
        assert "广场" in q
        assert "Alice" in q
        assert "听说了一些事" in q

    def test_empty_returns_empty(self):
        q = build_recall_query()
        assert q == ""

    def test_partial_fields(self):
        q = build_recall_query(location="医院")
        assert q == "医院"
