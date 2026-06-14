# EchoWorld（SoloVerse）

> **一个活着的像素世界——AI 居民有自己的人格、记忆与恩怨，故事从他们的社交碰撞中涌现。你是上帝：投下种子引爆连锁，或化身其中卷入博弈。**

<div align="center">

**涌现叙事 · 多 Agent · 像素社会模拟器**

`Python FastAPI` · `原生 Canvas` · `DeepSeek LLM` · `SSE 实时`

</div>

---

## ✨ 这是什么

EchoWorld 是一个 **AI 原生的像素社会模拟器**。你不写剧本——你创造一个世界，放入一群有独立人格、记忆、目标和未了心事的 AI 角色，然后**故事会自己长出来**。

它和已有的东西都不一样：

| 对比 | 区别 |
|------|------|
| vs **脚本叙事游戏** | 没有预设剧情，每一幕都由角色当下的记忆、关系与心事实时涌现 |
| vs **单 Agent 聊天机器人** | 是一群角色在**互相**博弈，关系会演变、秘密会曝光、联盟会崩塌 |
| vs **Generative Agents（Stanford 小镇）** | 聚焦「可引爆的戏剧」：强戏剧种子 + 玩家化身干预 + 像素可视化 + 实时 SSE，而非日常模拟 |

核心机制：**每个角色都带着「未完结的心事」(thread)**——暗恋、秘密、复仇、未还的债。这些心事是戏剧冲突的发动机，让涌现朝**有张力的故事**收敛，而不是散漫的闲聊。

---

## 🎬 效果展示（真实涌现，非预设）

以「恋综·海岛之夜」主题为例（8 位嘉宾 + 节目组操纵 + 无摄像头夜），以下全部是 DeepSeek 实时涌现，**没有任何剧本**：

**📰 自动生成的戏剧头条**
> 江屿深夜质问沈晚沙滩见谁
> 安总秘密单独约谈温柔
> 林婉小可互爆隐私拉帮结派

**💭 角色心声（真内心，体现各自心事）**
> 🏄 江屿：*听到录音要播，我慌了。昨晚对沈晚说的那些话……我得赶在录音公开前先找到她，不能让她误会我是在演。*
> 📺 安总（节目导演）：*录音要播了，机会来了。江屿和沈晚的崩盘计划可以利用这段录音制造。*
> 🌸 温柔（节目组安插的卧底）：*听到录音要播，我心里一紧——万一暴露演员身份就完了。但任务优先，先靠近江屿试探他对这事的反应。*

**💬 群像博弈对话**
> 🐱 小可试探：「婉姐，我好像看见你和江屿昨晚在沙滩上？」
> 💋 林婉反击：「光聊内幕要聊半小时啊？我还以为你们在偷偷组 CP 呢！」
> 📺 安总话里有话：「节目组演戏？我倒觉得，有人该谢这场戏了。」

![EchoWorld 前端界面](images/EchoWorld前端界面.png)

---

## 🚀 快速开始

### 1. 配置 LLM Key

在 `backend/` 下创建 `.env`（参考 `.env.example`），填入 DeepSeek API Key：

```bash
DEEPSEEK_API_KEY=sk-你的key
# 其余省 token 调参已默认配好（tick 间隔、缓存、降级链等）
```

> Key 从 https://platform.deepseek.com/ 获取。没有 key 也能跑（自动降级 mock backend，但涌现质量会下降）。

### 2. 安装依赖

```bash
cd backend && pip install -r requirements.txt
```

### 3. 启动

**Windows（推荐）**：双击 `backend/start.bat`

**命令行**：
```bash
cd backend && uvicorn app.main:app --port 8000
```

### 4. 打开

浏览器访问 **http://localhost:8000/** ，选一个主题（推荐「💋 恋综·海岛之夜」，最容易出戏），点 quickStart 即可。

> ⚠️ **启动不烧 token；创建场景跑模拟会调用 DeepSeek（每 tick 多次）。看完一段记得停**（命令行 `Ctrl+C`，或双击 `backend/stop.bat`）。

---

## 🎮 玩法

**上帝视角（默认）**：旁观世界自动演化——看角色在画布上移动、对话、内心活动，看右侧实时生成的戏剧头条。

**投下种子**：底部输入框投一个「叙事种子」引爆连锁，例如：
- `匿名小纸条出现在告白屋桌上：她在演你`
- `起火了！`
- `天突然下起大雨`

种子会被相关角色感知，下一 tick 必然引发反应，可能引爆整条故事线。

**化身参与**：点击顶部切换身份，**附身**一个角色进入社交博弈——你说话、移动、行动，其他 AI 角色会真实地回应你。你不再只是上帝，你是棋局里的一枚棋子。

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│  前端（原生 Canvas + ES module）                          │
│  像素渲染 · 对话气泡 · 心声流 · headline · SSE 实时        │
└──────────────────────────┬──────────────────────────────┘
                           │ SSE + REST
┌──────────────────────────▼──────────────────────────────┐
│  FastAPI 后端（asyncio）                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ tick 引擎 │  │  Agents  │  │ 叙事检测  │  │  LLM 网关│ │
│  │ world_loop│→│ 多Agent并行│→│NarrativeDet│→│ DeepSeek │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
│       │  perceive→recall→reason→tool_dispatch→talk       │
│       └── 记忆三层：短期对话 · 长期摘要 · semantic beliefs ─┘
└─────────────────────────────────────────────────────────┘
```

**每 tick 的涌现管线**：
1. **感知**：每个角色收集身边人、刚发生的事、世界冲击（种子/头条）
2. **回忆**：基于当前情境做记忆 recall（MMR 去重 + Jaccard + TF + 时效 + 情绪 + 重要性打分）
3. **推理**：LLM 综合人格/记忆/关系/心事，产出内心独白 + 工具调用
4. **行动**：派发工具（观察/回忆/内省/计划 = 软工具；说话/移动/工作 = 硬工具）
5. **对话**：相邻角色两两配对，LLM 生成对话（带潜台词、可撒谎）
6. **种子注入 + 叙事检测**：戏剧性不足时主动注入种子；检测 drama 生成头条/编年史

**关键设计**：
- **角色心事 (thread) 驱动**：高权重心事用 🔥 标记，prompt 强制「thought 必须围绕它展开」——这是涌现收敛成戏剧的关键
- **LLM 可靠性**：多 provider 链 + 熔断 + 超时 + 重试 + mock 兜底 + 响应缓存
- **记忆压缩**：定期把旧记忆 summarize 成 semantic belief，防止上下文爆炸
- **结构化 prompt**：reason/talk/reflect/narrative 四类 prompt + 输出契约（JSON），容错解析

---

## 📁 项目结构

```
SoloVerse/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── agents/          # AI 角色（人格/记忆/推理/反思/工具）
│   │   ├── engine/          # tick 世界引擎 + 事件总线 + 世界状态
│   │   ├── services/        # LLM 网关 + 记忆召回 + prompt 构建
│   │   ├── narrative/       # 涌现叙事检测（headline/编年史）
│   │   ├── models/          # Pydantic 数据模型
│   │   └── api/             # REST + SSE 路由
│   ├── tests/               # pytest（162 测试）
│   ├── .env.example         # 环境变量模板（复制为 .env 填 key）
│   ├── start.bat / stop.bat # 一键启停脚本
│   └── requirements.txt
├── frontend/                # 原版 demo 前端（后端 /static serve）
│   ├── index.html
│   ├── css/style.css
│   └── js/（main + canvas 渲染器）
├── config/
│   ├── templates/           # 7 个主题配置（恋综/办公室/中世纪…）
│   ├── seed.yaml            # 默认种子（角色/关系/心事）
│   └── seed_events.yaml     # 戏剧种子库
├── images/                  # 截图素材
└── README.md
```

> 注：`.env`（含 API key）、设计文档、开发日志等已 `.gitignore`，不入库。

---

## 🔧 开发

```bash
# 测试
cd backend && pytest tests/ -v

# 开发模式（热重载，Ctrl+C 可能漏杀孤儿，测完用 stop.bat）
cd backend && uvicorn app.main:app --reload --port 8000

# 彻底关后端（防 LLM tick 循环持续烧 token）
双击 backend/stop.bat
```

**7 个内置主题**：办公室浮世绘 · 恋综·海岛之夜 · 中世纪小镇（火灾） · 深空空间站 · 深海殖民地 · 赛博朋克之城 · 大学暗潮——每个都有精心设计的角色、火药桶关系和戏剧种子。

---

## 📝 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.10+ · FastAPI · asyncio · uvicorn · Pydantic |
| 前端 | 原生 JS · Canvas API · SSE（EventSource） |
| LLM | DeepSeek（reason/talk/reflect/narrative/summarize） |
| 通信 | SSE 实时推送 · REST API |
| 测试 | pytest（162 测试覆盖 agents/engine/services/tools） |

---

## License

MIT（用于黑客松展示与学习交流）
