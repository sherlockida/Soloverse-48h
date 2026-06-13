"""LLM 响应 JSON 容错解析。

LLM 经常返回带 markdown 围栏、礼貌前缀/后缀、或混入解释文字的 "JSON"。
这里做三层兜底：strip 围栏 → 去礼貌语 → json.loads；失败则按括号配对提取首个合法 JSON 片段。
"""
from __future__ import annotations

import json
import re
from typing import Any


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        m = re.match(r"^```[a-zA-Z]*\n?(.*?)```\s*$", s, re.DOTALL)
        if m:
            s = m.group(1).strip()
        else:
            s = s.strip("`").strip()
    return s


def _safe_parse_json(text: str) -> Any:
    if not text:
        return None
    text = _strip_fences(text)
    for pat in (
        r"好的[，,]\s*以下是[\w一二三]*[格式的]*JSON[格式]*[回复回答]*[：:]\s*",
        r"以下是[\w一二三]*JSON[格式]*[：:]\s*",
        r"好的[，,]\s*[回复回答]*[：:]\s*",
        r"当然[，,]\s*[回复回答]*[：:]\s*",
    ):
        text = re.sub(r"^" + pat, "", text, flags=re.IGNORECASE)
    for pat in (
        r"[，,]*\s*希望这[个些对您]*[有帮]*助[。！]*\s*$",
        r"[，,]*\s*如果[还]*[有需要]*[，,]\s*[请]*[告]*诉我[。！]*\s*$",
    ):
        text = re.sub(pat + r"$", "", text, flags=re.IGNORECASE)
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        if start == -1:
            continue
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(text)):
            c = text[i]
            if escape:
                escape = False
                continue
            if c == '\\':
                escape = True
                continue
            if c == '"' and not in_string:
                in_string = True
            elif c == '"' and in_string:
                in_string = False
            elif not in_string:
                if c == opener:
                    depth += 1
                elif c == closer:
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(text[start:i + 1])
                        except json.JSONDecodeError:
                            break
    return None
