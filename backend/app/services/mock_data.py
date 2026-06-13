"""Mock 后端数据常量 —— 角色俚语、意图模板、动作偏置、变形用词、兜底返回。

纯数据模块，无逻辑代码。被 mock_backend.py 和 mock_gen.py 共享引用。
"""
from __future__ import annotations


# ---------- 角色俚语池：persona/voice 中出现关键词即叠加 ----------
ROLE_SLANG: dict[str, list[str]] = {
    "老板":     ["这点事都搞不定", "别废话", "我说过多少遍", "你的态度有问题",
                 "今天必须出活", "下班再说"],
    "总监":     ["把数据拉出来", "复盘一下", "对齐目标"],
    "boss":     ["this is final", "no excuses", "today, not tomorrow"],
    "实习生":   ["我尽快", "我再确认一下", "请多指教", "我马上学", "（小声）我刚来"],
    "intern":   ["I'm on it", "let me check", "thanks for the heads up"],
    "诗人":     ["像风掠过山岗", "如月落空山", "似旧梦初醒", "比烟还轻", "字里藏着雪"],
    "医生":     ["先别动", "深呼吸", "这没什么", "按住这里"],
    "孩子":     ["我才不", "你才坏", "我要告诉爸爸", "好玩好玩", "哼"],
    "老人":     ["年轻人啊", "我跟你讲", "想当年", "唉", "听我一句"],
    "商人":     ["这价不行", "您看看", "好说好说", "都是朋友"],
    "店主":     ["欢迎光临", "新到的", "您试试"],
    "侦探":     ["有意思", "再说一遍", "细节呢？"],
    "学生":     ["我书还没看完", "下周就考试了"],
    "default":  ["嗯", "唉", "罢了", "懂吧"],
}

# ---------- role -> 偏好动作权重（_gen_decide 使用） ----------
ROLE_ACTION_BIAS = {
    "merchant":  {"talk": 3, "move": 2, "work": 1, "rest": 1},
    "innkeeper": {"talk": 2, "work": 3, "move": 1, "rest": 1},
    "child":     {"move": 3, "talk": 2, "rest": 1, "work": 1},
    "elder":     {"rest": 3, "talk": 1, "work": 1, "move": 1},
    "doctor":    {"work": 3, "talk": 2, "move": 1, "rest": 1},
    "boss":      {"talk": 3, "move": 2, "work": 1, "rest": 1},
    "default":   {"talk": 2, "move": 2, "work": 2, "rest": 1},
}

# ---------- intent -> 模板池（每池 >= 7 条，全部带 slot） ----------
INTENT_TEMPLATES: dict[str, list[str]] = {
    "试探": [
        "{other}，那件「{memory_hint}」的事，你心里到底怎么想？",
        "你最近躲着我，是不是因为{thread_target}？",
        "在{place}你说过的那句话，我一直没敢深问。",
        "我听到一点风声，关于{memory_hint}……是真的吗？",
        "你别瞒了，{other}，我能看出来。",
        "上回的事，给我个准话。",
        "你为什么这么紧张？",
        "我问一句，{slang}，{thread_target}的事到底跟你有没有关系？",
    ],
    "示好": [
        "{other}，上次你说{memory_hint}，我一直记着呢。",
        "见到你真好。{slang}。",
        "在{location}的光下，跟你说话特别舒服。",
        "我憋了很久才敢跟你说——{memory_hint}那次，谢谢你。",
        "陪我坐一会儿吧，{other}。",
        "你笑的时候，{slang}。",
        "其实我一直想换种方式跟你聊。",
        "我记得你说过{memory_hint}，那句话我没忘。",
    ],
    "挑衅": [
        "{slang}！{other}，你别想躲。",
        "在{location}你也敢这样跟我说话？",
        "你以为你赢了？这才到哪。",
        "{thread_target}的事，是你逼我说出来的。",
        "今天就把账算清。",
        "你最好掂量一下。",
        "我不是好惹的，{other}。",
        "再装一次试试，我等着。",
    ],
    "示弱": [
        "我……我也不知道该怎么办，{other}。",
        "{other}，我真的累了。",
        "{memory_hint}那次……是我不对。",
        "{slang}……你别再生气了。",
        "我不想再吵了，求你。",
        "我也是没办法，你听我说。",
        "你想怎样都行，我认。",
        "在{location}，只有你能懂我。",
    ],
    "拉拢": [
        "{other}，跟我一起干这事，亏不了你。",
        "你跟我是一头的，对吧？",
        "我们应该联手对付{thread_target}。",
        "在{location}，能信的就剩你了。",
        "你帮我，下次我也帮你。",
        "兄弟一场，这事得你扛一下。",
        "我们的目标其实是一样的，{slang}。",
        "{memory_hint}之后，你应该看清楚了。",
    ],
    "质问": [
        "{other}！{memory_hint}到底是怎么回事！",
        "你给我解释清楚。",
        "在{location}你做的那件事，别以为没人知道。",
        "你欠我一个交代。",
        "{thread_target}是不是被你害的？",
        "今天不说清楚，谁都别想走。",
        "你看着我的眼睛说，{slang}。",
        "够了——你别再装。",
    ],
    "敷衍": [
        "嗯，知道了。",
        "好，{slang}。",
        "随便吧。",
        "{other}，我现在没空。",
        "改天再说。",
        "……你说什么就是什么。",
        "哦。",
        "（点头）",
    ],
    "示警": [
        "{other}，小心{thread_target}。",
        "在{location}别多嘴。",
        "有些话别乱说，{slang}。",
        "我提醒你一次，下不为例。",
        "这事到我为止，听见没？",
        "{memory_hint}的事，烂在肚子里。",
        "你最好假装什么都没听过。",
    ],
    "忏悔": [
        "对不起，{other}，{memory_hint}那次是我错了。",
        "我一直想跟你说，关于{thread_target}的事，是我连累了你。",
        "如果可以重来，{slang}……",
        "你恨我也应该。",
        "我每次想到{memory_hint}都难受。",
        "请给我一次机会。",
        "在{location}我对不起你。",
    ],
    "挖苦": [
        "呵，{other}，您可真行。",
        "好哇，{slang}，您说了算。",
        "在{location}耍这一套，给谁看呢？",
        "{memory_hint}？哦，那可真了不起。",
        "祝您顺风顺水。",
        "我真是没想到您这水平。",
        "继续装，我看着。",
        "您这戏，一年比一年熟。",
    ],
}

# ---------- n-gram 强制变形用 ----------
MUTATION_PREFIXES = ["听着，", "我说，", "诶，", "你知道吗，", "其实，", "说真的，"]
MUTATION_SUFFIXES = ["……", "，懂吗？", "。", "，你说呢？", "，别多想。", "（叹气）"]

# ---------- mock 生成兜底返回（所有 kind 都在此） ----------
_MOCK_FALLBACKS: dict[str, dict] = {
    "decide": {"kind": "rest", "target": "", "reason": "（mock 兜底）"},
    "talk":   {"utterance": "……", "inner_thought": "", "intent": "敷衍", "relation_delta": {}},
    "narrative": {"headlines": []},
    "reason":  {"thought": "（一时间没想清楚）", "tool_calls": [], "plan_patch": {}},
    "reflect": {"thought": "", "plan_patch": {}, "belief_update": [], "thread_changes": {}},
    "summarize": {"summary": ""},
}
