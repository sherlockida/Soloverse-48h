// EchoWorld — 主入口
// 管理应用状态：落地页 → 创建向导 → 模拟运行

const $ = (sel) => document.querySelector(sel);

const APP = {
  sceneId: null,           // null = 还没创建任何场景；非 null = 当前激活 scene
  engine: null,
  renderer: null,
  sse: null,
  currentSpeed: 1,
  places: [],
  theme: 'medieval',
  _eventsStarted: false,
  _eventHistory: [],          // 缓存所有事件，用于切换 filter 时重渲染
  _eventFilter: 'core',       // 'core' | 'all' | 'thought'
  _highlightAgents: new Set(),// 受种子影响的 agent，用于头顶 ❗ 闪烁
  playerAvatar: null,         // 当前化身的 agent 名（null = 上帝模式）
  _agentsCache: [],           // 最近一次拉的 agent 列表，化身 UI 用

  // ====== v5 思考流状态 ======
  _thoughts: [],              // 心声列表（{tick, agent, emoji, kind, text, trace, tool, args}），最多 50
  _thoughtsByAgent: {},       // 每个 agent 最近一条 thought 的 text（用于 canvas hover tooltip）
  _plans: {},                 // {agent: {goal, steps, updated_tick}}
  _recalls: [],               // 最近的 recall 命中（{tick, agent, query, hits}），最多 30
  _tsTab: 'thoughts',         // 心声面板当前 tab：thoughts | plans | recalls
  _tsCollapsed: true,         // 心声面板是否收起
  _tsUnread: 0,               // 收起时未读 thought 数
  _hotAgents: new Set(),      // 关系热点 agent（其 thought 会被推到主面板）
  _currentProvider: null,     // 当前 LLM provider（来自 provider_switch）
  // v5.1: LLM HUD —— 每个带 token_used>0 的事件就累加，证明真 LLM 在跑而不是装样子
  _llmStats: { calls: 0, tokens: 0 },

  // ====== pace 轨：事件流节流 + 玩家种子 sticky ======
  _renderQ: [],               // 待渲染的低优先级事件队列（talk/move/thought）
  _renderQTimer: null,        // 队列 drain 定时器
  _appendStamps: [],          // 最近 1s 内主面板 append 时间戳，用作 6/s 阈值
  _thoughtRenderPending: false, // 心声 tab 渲染合并标记（避免 8 个 NPC 同 tick 各刷一次）
  _seedStickyCards: [],       // 当前 sticky 卡片元数据 {el, timer}
  _windowBlurBound: false,    // 失焦 flush 绑定标记

  // ====== tool-use 轨：工具调用可视化 ======
  _toolStats: { total: 0, ok: 0, fail: 0, latency_sum_ms: 0, by_tool: {} },
  _lastToolByAgent: {},       // {agent: {tool, latency_ms, ok, tick}}，roster icon 用

  async init() {
    this.bindGlobalControls();
    await this.showLanding();
  },

  // ====== 落地页 ======

  async showLanding() {
    $('#simulation-view').classList.add('hidden');
    $('#landing-view').classList.remove('hidden');
    $('#wizard-view').classList.add('hidden');
    // 回到首页时清空当前 scene 引用 + 关闭 SSE + 停 polls
    if (this.sse) { this.sse.disconnect(); this.sse = null; }
    this.stopAvatarPoll && this.stopAvatarPoll();
    this.stopRosterPoll && this.stopRosterPoll();
    // pace 轨：停掉事件流节流定时器 + 清空 sticky
    if (this._renderQTimer) { clearInterval(this._renderQTimer); this._renderQTimer = null; }
    this._renderQ.length = 0;
    this._appendStamps = [];
    this._clearSeedSticky && this._clearSeedSticky();
    this.sceneId = null;
    this.playerAvatar = null;

    // 快速开始按钮（避免重复绑定）
    $$('.theme-card').forEach(card => {
      if (card._bound) return;
      card._bound = true;
      card.addEventListener('click', () => {
        const theme = card.dataset.theme;
        this.quickStart(theme);
      });
    });

    // 渲染 4 个主题预览（用 renderRoom 画到 512×320，CSS 缩放显示）
    this.renderLandingPreviews();
    // 启动 hero 区动态预览
    this.startHeroLoop();
  },

  renderLandingPreviews() {
    // 注意：第二个元素是渲染 canvas 用的"主题视觉"（不一定等于实际 places[0]），用于 preview
    const themes = [
      ['office', '工位区', 'office'],
      ['campus', '工位区', 'office'],    // 校园复用 office 像素风
      ['variety', '中心广场', 'ocean'],  // 恋综复用 ocean 海岛风
      ['medieval', '广场', 'medieval'],
      ['space', '指挥舱', 'space'],
      ['ocean', '中心广场', 'ocean'],
      ['cyberpunk', '霓虹广场', 'cyberpunk'],
    ];
    themes.forEach(([theme, place, visualTheme]) => {
      const c = document.getElementById(`landing-preview-${theme}`);
      if (!c) return;
      c.width = ROOM_COLS * TILE;
      c.height = ROOM_ROWS * TILE;
      try {
        const places = {
          medieval: ['广场','农场','医院'],
          space: ['指挥舱','实验室','生态舱'],
          ocean: ['中心广场','生物穹顶'],
          cyberpunk: ['霓虹广场','地下诊所'],
          office: ['工位区','会议室','茶水间'],
        }[visualTheme] || ['广场'];
        renderRoom(visualTheme, place, places, c);

        const ctx = c.getContext('2d');
        ctx.font = `${TILE * 1.2}px sans-serif`;
        ctx.textAlign = 'center';
        const sample = {
          medieval: ['👩‍⚕️','🔨','🎨','👧'],
          space: ['🧑‍🚀','🧑‍🔬','🧑‍✈️','👶'],
          ocean: ['🤿','🧜‍♀️','🐙','🧬'],
          cyberpunk: ['🕴️','🤖','💃','🧑‍💻'],
          office: ['👔','💼','🎨','🧑‍💻'],
          campus: ['🎓','🎀','🎨','💼'],
          variety: ['🏄','💃','🌸','🎸'],
        }[theme] || ['🙂'];
        sample.forEach((e, i) => { ctx.fillText(e, 80 + i * 100, 200); });
      } catch (err) {
        console.warn(`preview ${theme} fail:`, err);
      }
    });
  },

  startHeroLoop() {
    // 如果有 hero canvas 就跑一个 mini 模拟
    const heroCanvas = document.getElementById('landing-hero-canvas');
    if (!heroCanvas) return;
    if (this._heroEngine) this._heroEngine.stop();
    heroCanvas.width = ROOM_COLS * TILE;
    heroCanvas.height = ROOM_ROWS * TILE;
    this._heroEngine = new CanvasEngine(heroCanvas);
    this._heroRenderer = new SceneRenderer(this._heroEngine, 'medieval', ['广场']);
    this._heroRenderer.syncAgents([
      { name: 'Alice',  role: 'doctor',     emoji: '👩‍⚕️', location: '广场', color_palette: {} },
      { name: 'Bob',    role: 'blacksmith', emoji: '🔨',    location: '广场', color_palette: {} },
      { name: 'Carol',  role: 'merchant',   emoji: '💼',    location: '广场', color_palette: {} },
      { name: 'Dan',    role: 'artist',     emoji: '🎨',    location: '广场', color_palette: {} },
    ]);
    this._heroEngine.start();

    // 周期性让小人乱走 + 偶尔说话
    const phrases = [
      '今天的天气不错。',
      '你听说了吗？',
      '我有事告诉你。',
      '别再问我那件事。',
      '我知道是谁干的。',
    ];
    const slots = [
      { x: 80, y: 80 }, { x: 200, y: 120 }, { x: 320, y: 100 }, { x: 410, y: 140 },
      { x: 140, y: 200 }, { x: 280, y: 180 }, { x: 380, y: 220 },
    ];
    if (this._heroInterval) clearInterval(this._heroInterval);
    this._heroInterval = setInterval(() => {
      const r = this._heroRenderer;
      if (!r) return;
      const names = Object.keys(r.sprites);
      if (!names.length) return;
      const name = names[Math.floor(Math.random() * names.length)];
      const s = r.sprites[name];
      const slot = slots[Math.floor(Math.random() * slots.length)];
      s.moveTo(slot.x, slot.y);
      // 1/4 概率说话
      if (Math.random() < 0.25 && s.bubble == null) {
        s.say(phrases[Math.floor(Math.random() * phrases.length)]);
      }
      // 1/4 概率 work
      if (Math.random() < 0.25) {
        s.activity = 'work';
        s.activityTimer = 3000;
      }
    }, 1800);
  },

  async quickStart(theme) {
    try {
      const config = await API.loadTemplate(theme);
      const result = await API.createScene({
        scene_id: `quick_${theme}_${Date.now()}`,
        ...config,
      });
      this.sceneId = result.scene_id;
      this.theme = theme;
      await this.launchSimulation();
    } catch (e) {
      console.error('快速启动失败:', e);
      alert('启动失败，请检查后端是否运行。');
    }
  },

  // ====== 创建向导 ======

  showWizard() {
    $('#landing-view').classList.add('hidden');
    $('#simulation-view').classList.add('hidden');
    $('#wizard-view').classList.remove('hidden');
    this.wizard = new SceneWizard(async (config) => {
      try {
        const result = await API.createScene(config);
        this.sceneId = result.scene_id;
        this.theme = config.theme || 'medieval';
        await this.launchSimulation();
      } catch (e) {
        alert('创建世界失败：' + e.message);
      }
    });
    this.wizard.init();
  },

  // ====== 启动模拟 ======

  async launchSimulation() {
    $('#landing-view').classList.add('hidden');
    $('#wizard-view').classList.add('hidden');
    $('#simulation-view').classList.remove('hidden');

    // 加载场景状态
    const state = await API.sceneState(this.sceneId);
    this.places = state.places || [];
    this.theme = state.theme || 'medieval';

    // 初始化 Canvas
    const canvas = $('#game-canvas');
    canvas.width = ROOM_COLS * TILE;
    canvas.height = ROOM_ROWS * TILE;

    // 启动/重启引擎
    if (this.engine) this.engine.stop();
    this.engine = new CanvasEngine(canvas);
    this.renderer = new SceneRenderer(this.engine, this.theme, this.places);
    this.engine.start();

    // 同步初始角色
    this.renderer.syncAgents(state.agents || []);
    this._agentsCache = state.agents || [];
    this.playerAvatar = state.player_avatar || null;
    this.updatePlayerModeBadge();
    if (this.renderer && this.renderer.setAvatarName) this.renderer.setAvatarName(this.playerAvatar);
    this.updateClock(state);
    $('#room-name').textContent = this.places[0] || '';
    this.renderRoster();
    this.renderRoomBar();
    this.startRosterPoll();
    this.refreshSeedSuggestions();
    this.updateViewModeButtons('overview');

    // 连接 SSE 事件流
    if (this.sse) this.sse.disconnect();
    this.sse = new SSEConnection(this.sceneId);
    this.sse.onEvent(ev => this.handleSSEEvent(ev));
    this.sse.connect();
    this._eventsStarted = false;
    this._eventHistory = [];
    $('#event-panel').innerHTML = '<div class="panel-ev panel-system"><div class="pe-text" style="color:var(--fg-dim)">等待事件发生……</div></div>';

    // pace 轨：清空 seed sticky + 启动事件流节流器
    this._clearSeedSticky();
    this._appendStamps = [];
    this._renderQ.length = 0;
    if (this._renderQTimer) clearInterval(this._renderQTimer);
    // 每 250ms 从队列尾部取最多 2 条渲染（≈8/s 上限），低优先级事件走这里
    this._renderQTimer = setInterval(() => this._drainRenderQueue(2), 250);
    if (!this._windowBlurBound) {
      window.addEventListener('blur', () => this._flushRenderQueue());
      this._windowBlurBound = true;
    }

    // v5：重置心声流缓存 + 绑定面板/hover tooltip
    this._thoughts = [];
    this._thoughtsByAgent = {};
    this._plans = {};
    this._recalls = [];
    this._tsUnread = 0;
    // tool-use 轨：重置工具调用统计
    this._toolStats = { total: 0, ok: 0, fail: 0, latency_sum_ms: 0, by_tool: {} };
    this._lastToolByAgent = {};
    this._recomputeHotAgents();
    this.bindThoughtPanelToggle();
    this.bindCanvasHoverTip();
    this.renderThoughtsTab();
    this.renderPlansTab();
    this.renderRecallsTab();
    this._updateUnreadBadge();

    // canvas click：鸟瞰下点房间放大；focus 下点角色看详情
    if (!canvas._clickBound) {
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        // CSS 缩放：把屏幕坐标换算到内部 canvas 坐标
        const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
        const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
        if (this.renderer && this.renderer.viewMode === 'overview') {
          const cell = this.renderer.cellAt(sx, sy);
          if (cell) {
            this.renderer.switchRoom(cell.place);
            this.renderer.switchViewMode('focus');
            this.updateViewModeButtons('focus');
            $('#room-name').textContent = cell.place;
            this.renderRoster();
            this.renderRoomBar();
          }
        } else {
          const name = this.renderer.getCharacterAt(sx, sy);
          if (name) this.showCharacterPanel(name);
        }
      });
      canvas._clickBound = true;
    }

    // 房间导航 + 场景 tab
    this.setupRoomNav();
    await this.refreshSceneTabs();
  },

  // ====== 多场景 tab ======

  async refreshSceneTabs() {
    try {
      const scenes = await API.listScenes();
      const row = $('#scene-tabs-row');
      if (!row) return;
      row.innerHTML = scenes.map(s => `
        <div class="scene-tab ${s.scene_id === this.sceneId ? 'active' : ''}" data-sid="${s.scene_id}">
          <span class="st-name" title="${escapeHtml(s.story_background || '')}">${escapeHtml(this._sceneLabel(s))}</span>
          <span class="st-meta">${s.agent_count}🙂 · ${s.tick}t</span>
          ${s.scene_id !== 'default' ? `<button class="st-close" data-sid="${s.scene_id}" title="删除场景">✕</button>` : ''}
        </div>
      `).join('');
      // 绑定切换
      row.querySelectorAll('.scene-tab').forEach(el => {
        el.addEventListener('click', async (e) => {
          if (e.target.classList.contains('st-close')) return;
          const sid = el.dataset.sid;
          if (sid && sid !== this.sceneId) await this.switchScene(sid);
        });
      });
      row.querySelectorAll('.st-close').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const sid = btn.dataset.sid;
          if (!confirm(`确认删除场景 ${sid}？所有角色和事件将丢失。`)) return;
          try {
            await API.deleteScene(sid);
            if (sid === this.sceneId) {
              await this.switchScene('default');
            } else {
              await this.refreshSceneTabs();
            }
          } catch (err) {
            alert('删除失败：' + err.message);
          }
        });
      });
    } catch (e) {
      console.warn('refreshSceneTabs failed:', e);
    }
  },

  _sceneLabel(s) {
    if (s.scene_id === 'default') return '🏘️ 默认';
    const themeIcon = { medieval: '🏘️', space: '🚀', ocean: '🌊', cyberpunk: '🌃' }[s.theme] || '🌍';
    return `${themeIcon} ${s.scene_id.replace(/^(quick|custom)_/, '').slice(0, 14)}`;
  },

  async switchScene(sceneId) {
    if (sceneId === this.sceneId) return;
    this.sceneId = sceneId;
    await this.launchSimulation();
  },

  handleSSEEvent(ev) {
    const r = this.renderer;
    if (!r) return;

    // v5.1: LLM HUD —— 真实 LLM 消耗 (token_used>0) 才计入。
    // mock 兜底 / 本地 tool_call / tick_marker 一律 token_used=0 → HUD 不动，
    // 这样玩家一眼能看出现在跑的是不是真 LLM。
    if (ev && ev.token_used && ev.token_used > 0) {
      this._llmStats.calls += 1;
      this._llmStats.tokens += ev.token_used;
      // 顺手从 payload.usage 抓 provider（比 provider_switch 更频繁，
      // 避免初始链路没切换时看不到名字）
      const provider = ev.payload && ev.payload.usage && ev.payload.usage.provider;
      if (provider && provider !== 'mock' && provider !== 'none') {
        this._currentProvider = provider;
      }
      this._renderLlmHud();
    }

    // 清除"等待事件"占位
    if (!this._eventsStarted && ev.kind !== 'tick_marker') {
      this._eventsStarted = true;
      const panel = $('#event-panel');
      const placeholder = panel.querySelector('.panel-system');
      if (placeholder) placeholder.remove();
    }

    // 1) canvas 副作用（与是否进事件流无关，让世界活起来）
    switch (ev.kind) {
      case 'tick_marker':
        if (ev.payload && ev.payload.day != null) {
          $('#clock').textContent = `第 ${ev.payload.day} 天 ${ev.payload.time}`;
        }
        $('#tick-badge').textContent = `tick ${ev.tick}`;
        return; // tick_marker 不进事件流

      case 'move':
        if (ev.payload && ev.payload.to) {
          r.moveAgent(ev.actor, ev.payload.to);
        }
        break;

      case 'talk':
        r.agentTalk(ev.actor, ev.target,
                    ev.payload?.utterance || '',
                    ev.payload?.inner_thought || '',
                    ev.payload?.relation_delta || null);
        break;

      case 'narrative':
        this.showHeadline(ev.payload || {});
        break;

      case 'seed': {
        // 受影响 agent 头顶 ❗ 闪烁 + 屏幕轻微震动（保留原有视觉冲击）
        const affected = ev.payload?.affected || [];
        const fromPlayer = (ev.payload?.source === 'player');
        // 玩家投的：受影响 NPC 头顶弹 ❗ 气泡 3 秒；非玩家走原 4 秒
        this.flashSeedImpact(affected, fromPlayer ? 3000 : 4000);
        // 触发场景特效（雨/雪/火/停电/警报...）
        const fx = ev.payload?.effects || [];
        if (fx.length && this.renderer && this.renderer.triggerEffect) {
          fx.forEach(e => this.renderer.triggerEffect(e, 10000));
        }
        // 玩家种子：顶部 sticky + roster 红色脉冲
        if (fromPlayer) {
          this.showSeedSticky(ev, true);
          this._pulseRosterFor(affected);
        }
        break;
      }

      case 'world_state_change': {
        // v5.3：世界级状态变更（agent 死亡/昏迷/失踪），全场可见
        const p = ev.payload || {};
        const actor = p.actor || ev.actor || '';
        const affected = p.affected || (actor ? [actor] : []);
        // 红色脉冲 + 视觉冲击
        this.flashSeedImpact(affected.length ? affected : [actor], 4500);
        if (this._pulseRosterFor) this._pulseRosterFor(affected.length ? affected : [actor]);
        // 顶部 sticky 横幅（带 is-shock 类，更醒目）
        try {
          this.showSeedSticky(ev, true);
          // 给最新 sticky 卡片加 is-shock class
          requestAnimationFrame(() => {
            const sc = $('#seed-sticky');
            const first = sc && sc.firstChild;
            if (first && first.classList) first.classList.add('is-shock');
          });
        } catch (e) { /* ignore */ }
        // 立即刷新 roster，让 💀/😴/🚪 当下就出现（API 在 NextTick 即返回新 status）
        try {
          if (this._refreshRosterNow) this._refreshRosterNow();
        } catch (e) { /* ignore */ }
        break;
      }

      case 'thought':
        // v5：thought 进心声流，主面板只在 filter=thought 或为热点角色时显示
        this.ingestThought(ev);
        // 给 sprite 一个轻微 work 暗示（但允许后续 tool_call 覆盖）
        if (r.setAgentActivity) r.setAgentActivity(ev.actor, 'work');
        // 是否继续走 main panel：只有热点角色或玩家化身才推送
        if (this._eventFilter !== 'thought' && !this._isHotOrAvatar(ev.actor)) {
          return;
        }
        break;

      case 'tool_call':
        this.ingestToolCall(ev);
        return; // tool_call 只进心声流次级条目

      case 'plan_update':
      case 'plan_updated':  // 兼容：旧契约名
        this.ingestPlanUpdate(ev);
        return; // plan 进计划 tab + roster 进度条，不进主事件流

      case 'reflect':
        this.ingestReflect(ev);
        return;

      case 'memory_recall':
        this.ingestRecall(ev);
        return;

      case 'belief_formed':
        this.ingestBelief(ev);
        return;

      case 'provider_switch':
        this.handleProviderSwitch(ev);
        return;
    }

    // 2) 记入历史并按当前 filter 决定是否显示
    this._eventHistory.push(ev);
    if (this._eventHistory.length > 200) this._eventHistory.shift();
    if (this.passesFilter(ev)) {
      // pace 轨：关键事件立即渲染（narrative/seed/system/provider_switch/belief 等不被节流吞）；
      // 高频事件（talk/move/thought）走 1s/6 条阈值 + 队列稳定排出
      if (this._isHighPriorityKind(ev.kind) || !this._isOverAppendRate()) {
        this.appendPanelEvent(ev.kind, ev);
      } else {
        this._renderQ.push(ev);
        // 队列保护：超过 60 条丢最老的，避免无限堆积
        if (this._renderQ.length > 60) this._renderQ.shift();
      }
    }
  },

  // pace 轨：判断哪些事件 kind 永远立即渲染，绕过节流
  _isHighPriorityKind(kind) {
    return (
      kind === 'narrative' ||
      kind === 'seed' ||
      kind === 'system' ||
      kind === 'provider_switch' ||
      kind === 'belief_formed' ||
      kind === 'reflect' ||
      kind === 'world_state_change'   // v5.3
    );
  },

  // v5.3：world_state_change 后立刻拉一次最新 state 渲染 roster，
  // 不用等 3.5s roster poll 才看到 💀/😴/🚪。
  async _refreshRosterNow() {
    try {
      const state = await API.sceneState(this.sceneId);
      if (state && state.agents) {
        this._agentsCache = state.agents;
        this.renderRoster();
        if (this.renderRoomBar) this.renderRoomBar();
      }
    } catch (e) { /* ignore */ }
  },

  // pace 轨：1 秒内已经 append 超过 6 条就视为"刷屏"，把后续低优先级事件入队
  _isOverAppendRate() {
    const now = Date.now();
    const cutoff = now - 1000;
    this._appendStamps = this._appendStamps.filter(t => t > cutoff);
    return this._appendStamps.length >= 6;
  },

  // pace 轨：从队列尾部（保留最新）取最多 max 条渲染
  _drainRenderQueue(max = 2) {
    if (!this._renderQ.length) return;
    const batch = this._renderQ.splice(0, max);
    for (const ev of batch) {
      // 二次过滤：filter 可能在排队期间被用户切了
      if (!this.passesFilter(ev)) continue;
      this.appendPanelEvent(ev.kind, ev, /*skipHistoryPush=*/true);
    }
  },

  // pace 轨：窗口失焦立刻 flush（用户回来时已经看完了，不要再卡进度条）
  _flushRenderQueue() {
    if (!this._renderQ.length) return;
    const all = this._renderQ.splice(0, this._renderQ.length);
    for (const ev of all) {
      if (!this.passesFilter(ev)) continue;
      this.appendPanelEvent(ev.kind, ev, /*skipHistoryPush=*/true);
    }
  },

  // 是否为「应推到主面板」的 agent（关系热点 + 玩家化身）
  _isHotOrAvatar(name) {
    if (!name) return false;
    if (this.playerAvatar === name) return true;
    return this._hotAgents.has(name);
  },

  // 基于 _agentsCache 计算关系热点（每条关系强度 sum 最大的 top 3）
  _recomputeHotAgents() {
    const scores = (this._agentsCache || []).map(a => {
      let s = 0;
      const rels = a.relations || {};
      for (const k of Object.keys(rels)) {
        const r = rels[k] || {};
        s += Math.abs(r.trust || 0) + Math.abs(r.fondness || 0)
           + Math.abs(r.jealousy || 0) + Math.abs(r.guilt || 0);
      }
      return { name: a.name, score: s };
    });
    scores.sort((x, y) => y.score - x.score);
    this._hotAgents = new Set(scores.slice(0, 3).filter(x => x.score > 0).map(x => x.name));
  },

  // ====== v5: 心声流核心 ======

  ingestThought(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    // trace 可能是 string 或 array of strings；统一成 array
    let trace = p.trace || p.reasoning_trace || [];
    if (typeof trace === 'string') trace = [trace];
    const text = (trace[0] || ev.text || '……').toString();
    // v5.1: 把 token_used / provider 挂到 rec 上，让卡片渲染时能显示"本条耗了多少 token"
    const usage = p.usage || {};
    const rec = {
      tick: ev.tick,
      agent,
      emoji: this._emojiOf(agent),
      kind: 'thought',
      text,
      trace,
      token_used: ev.token_used || 0,
      provider: usage.provider || (ev.token_used > 0 ? this._currentProvider : 'mock'),
      ts: Date.now(),
    };
    this._pushThought(rec);
    // 同步给 hover tooltip 字典
    this._thoughtsByAgent[agent] = { text, tick: ev.tick };
  },

  ingestToolCall(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    const tool = p.tool || 'tool';
    const args = p.args || {};
    const brief = p.result_brief || '';
    const result = p.result !== undefined ? p.result : null;
    const latency = typeof p.latency_ms === 'number' ? p.latency_ms : 0;
    const parent = p.parent_thought || '';
    const source = p.source || 'local';
    const ok = result && typeof result === 'object'
      ? (result.ok !== false)
      : true;
    const argsStr = this._briefArgs(args);
    const rec = {
      tick: ev.tick,
      agent,
      emoji: this._emojiOf(agent),
      kind: 'tool',
      // text 字段保留：filter=thought 主面板降级渲染时用
      text: `🔧 ${tool}(${argsStr})${brief ? ' → ' + brief : ''}`,
      tool, args, brief, result, latency_ms: latency,
      parent_thought: parent, source, ok,
      ts: Date.now(),
    };
    this._pushThought(rec);
    // 工具调用统计 + roster 最近 tool icon
    this._updateToolStats(tool, ok, latency);
    this._lastToolByAgent[agent] = { tool, latency_ms: latency, ok, tick: ev.tick };
    // 若心声面板正在显示 thoughts tab，刷新一下顶部总览
    if (!this._tsCollapsed && this._tsTab === 'thoughts') {
      this._renderToolStatsBar();
    }
    // roster 那里也刷新一下 icon
    this.renderRoster();
  },

  _updateToolStats(tool, ok, latency) {
    const s = this._toolStats;
    s.total += 1;
    if (ok) s.ok += 1; else s.fail += 1;
    s.latency_sum_ms += Math.max(0, latency || 0);
    if (!s.by_tool[tool]) s.by_tool[tool] = { n: 0, ok: 0 };
    s.by_tool[tool].n += 1;
    if (ok) s.by_tool[tool].ok += 1;
  },

  _renderToolStatsBar() {
    const bar = $('#ts-tool-stats');
    if (!bar) return;
    const s = this._toolStats;
    if (s.total === 0) {
      bar.innerHTML = '<span class="tts-empty">尚无工具调用</span>';
      return;
    }
    const avg = s.total ? Math.round(s.latency_sum_ms / s.total) : 0;
    const topTools = Object.entries(s.by_tool)
      .sort((a, b) => b[1].n - a[1].n).slice(0, 4)
      .map(([k, v]) => `<span class="tts-chip" title="${k}: ${v.n} 次, ${v.ok} 成功">${this._toolIcon(k)} ${v.n}</span>`)
      .join('');
    bar.innerHTML = `<span class="tts-main">🛠 工具调用 <b>${s.total}</b> · ✅ <b>${s.ok}</b> · ⏱ avg <b>${avg}</b>ms</span>
      <span class="tts-chips">${topTools}</span>`;
  },

  _toolIcon(tool) {
    return ({
      observe: '🔍', recall: '💭', introspect: '🪞', plan: '📋',
      talk: '💬', move: '🚶', work: '🔧',
    })[tool] || '🔧';
  },

  ingestPlanUpdate(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    this._plans[agent] = {
      goal: p.goal || '',
      steps: p.steps || [],
      diff: p.diff || null,
      updated_tick: ev.tick,
    };
    // 进心声流的一条轻量记录
    const diffNote = p.diff ? ` (${p.diff})` : '';
    this._pushThought({
      tick: ev.tick,
      agent,
      emoji: this._emojiOf(agent),
      kind: 'plan',
      text: `📋 新计划：${p.goal || '(无目标)'}${diffNote}`,
      goal: p.goal, steps: p.steps,
      ts: Date.now(),
    });
    // 刷新计划 tab + roster plan 条
    if (this._tsTab === 'plans') this.renderPlansTab();
    this.renderRoster();
  },

  ingestReflect(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    const beliefs = p.belief_updates || [];
    const abandoned = p.abandoned_steps || [];
    const mood = p.mood || '';
    const summary = [];
    if (mood) summary.push(`心情：${mood}`);
    if (beliefs.length) summary.push(`刻板印象+${beliefs.length}`);
    if (abandoned.length) summary.push(`放弃 ${abandoned.length} 步`);
    this._pushThought({
      tick: ev.tick,
      agent,
      emoji: this._emojiOf(agent),
      kind: 'reflect',
      text: `🪞 反思：${summary.join(' · ') || '一切照旧'}`,
      payload: p,
      ts: Date.now(),
    });
  },

  ingestRecall(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    const hits = p.hits || [];
    const rec = {
      tick: ev.tick,
      agent,
      query: p.query || '',
      hits,
      ts: Date.now(),
    };
    this._recalls.unshift(rec);
    if (this._recalls.length > 30) this._recalls.length = 30;
    if (this._tsTab === 'recalls') this.renderRecallsTab();
  },

  ingestBelief(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    this._pushThought({
      tick: ev.tick,
      agent,
      emoji: this._emojiOf(agent),
      kind: 'belief',
      text: `🧩 形成印象：${p.target || '?'} → ${p.belief || ''}`,
      ts: Date.now(),
    });
    // 同时把它也写进 recall tab 的"已形成印象"区
    this._recalls.unshift({
      tick: ev.tick, agent, query: '(belief_formed)',
      hits: [{ content: `${p.target || '?'} → ${p.belief || ''}` }],
      ts: Date.now(),
    });
    if (this._recalls.length > 30) this._recalls.length = 30;
    if (this._tsTab === 'recalls') this.renderRecallsTab();
  },

  handleProviderSwitch(ev) {
    const p = ev.payload || {};
    const from = p.from || '?';
    const to = p.to || '?';
    const reason = p.reason || '';
    this._currentProvider = to;
    const tag = $('#ts-provider-tag');
    if (tag) {
      tag.textContent = `LLM: ${to}`;
      tag.title = `provider 切换：${from} → ${to}${reason ? '（' + reason + '）' : ''}`;
      tag.classList.remove('flash-warn');
      void tag.offsetWidth;
      tag.classList.add('flash-warn');
    }
    // v5.1: 顶部 HUD 同步刷新 + 闪一下
    this._renderLlmHud(/*flashProvider*/ true);
    // 一条系统级 thought 卡片，提示玩家
    this._pushThought({
      tick: ev.tick || 0,
      agent: 'system',
      emoji: '⚙️',
      kind: 'provider',
      text: `LLM provider 切换：${from} → ${to}${reason ? '（' + reason + '）' : ''}`,
      ts: Date.now(),
    });
  },

  // v5.1: 顶栏 LLM HUD 渲染。calls/tokens 来自 _llmStats；provider 来自 _currentProvider
  // （由 provider_switch 或带 usage 的事件填）。token=0 时 hud 视觉变暗，提示玩家"还没真的烧 LLM"。
  _renderLlmHud(flashProvider) {
    const callsEl = $('#llm-calls');
    const tokensEl = $('#llm-tokens');
    const provEl = $('#llm-provider');
    const hud = $('#llm-hud');
    if (!hud) return;
    if (callsEl) callsEl.textContent = `${this._llmStats.calls} calls`;
    if (tokensEl) tokensEl.textContent = `${this._formatTokens(this._llmStats.tokens)} tok`;
    const prov = this._currentProvider || '—';
    if (provEl) provEl.textContent = prov;
    hud.classList.toggle('has-tokens', this._llmStats.tokens > 0);
    hud.classList.toggle('provider-mock',
      !this._currentProvider || this._currentProvider === 'mock' || this._currentProvider === 'none');
    if (flashProvider) {
      hud.classList.remove('flash-provider');
      void hud.offsetWidth;
      hud.classList.add('flash-provider');
    }
  },

  _formatTokens(n) {
    if (n < 1000) return String(n);
    if (n < 10000) return (n / 1000).toFixed(1) + 'k';
    return Math.round(n / 1000) + 'k';
  },

  _pushThought(rec) {
    this._thoughts.unshift(rec);
    if (this._thoughts.length > 50) this._thoughts.length = 50;
    // pace 轨：同 tick 8 个 NPC 集中 push 时只重排一次（合并到下一帧）
    if (this._tsTab === 'thoughts') this._scheduleThoughtsRender();
    // 收起状态时累加未读数
    if (this._tsCollapsed) {
      this._tsUnread++;
      this._updateUnreadBadge();
    }
  },

  _scheduleThoughtsRender() {
    if (this._thoughtRenderPending) return;
    this._thoughtRenderPending = true;
    requestAnimationFrame(() => {
      this._thoughtRenderPending = false;
      if (this._tsTab === 'thoughts') this.renderThoughtsTab();
    });
  },

  _emojiOf(name) {
    const a = (this._agentsCache || []).find(x => x.name === name);
    return (a && a.emoji) || '🙂';
  },

  _briefArgs(args) {
    if (!args || typeof args !== 'object') return '';
    const parts = [];
    for (const k of Object.keys(args).slice(0, 3)) {
      const v = args[k];
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      parts.push(`${k}=${s.slice(0, 24)}`);
    }
    return parts.join(', ');
  },

  // ====== v5: 心声面板渲染 ======

  renderThoughtsTab() {
    // tool-use 轨：每次渲染 thoughts tab 同步刷新顶部 tool 调用总览
    this._renderToolStatsBar();
    const list = $('#ts-thoughts-list');
    if (!list) return;
    if (!this._thoughts.length) {
      list.innerHTML = '<div class="ts-empty">还没有角色开始思考，让世界跑一会儿……</div>';
      return;
    }
    list.innerHTML = this._thoughts.map((rec, idx) => this._thoughtCardHtml(rec, idx)).join('');
    // 绑定点击事件：jump to agent
    list.querySelectorAll('.ts-card').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.agent;
        if (!name || name === 'system') return;
        const a = (this._agentsCache || []).find(x => x.name === name);
        if (a && a.location && this.renderer) {
          // 切到 focus 模式 + 跳到对应房间 + 闪烁
          this.renderer.switchRoom(a.location);
          this.renderer.switchViewMode('focus');
          this.updateViewModeButtons('focus');
          $('#room-name').textContent = a.location;
          if (this.renderer.flashAgent) this.renderer.flashAgent(name, 2200);
          this.renderRoster();
          this.renderRoomBar();
        }
      });
    });
    // 卡片可点击展开 trace
    list.querySelectorAll('.ts-card-expand').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.ts-card');
        if (card) card.classList.toggle('expanded');
      });
    });
  },

  _thoughtCardHtml(rec, idx) {
    // tool 卡片走单独通道：可视化 args / result / latency badge
    if (rec.kind === 'tool') return this._toolCardHtml(rec, idx);

    const isMe = rec.agent === this.playerAvatar;
    const isHot = this._hotAgents.has(rec.agent);
    const cls = [
      'ts-card',
      `ts-${rec.kind}`,
      isMe ? 'ts-me' : '',
      isHot ? 'ts-hot' : '',
    ].filter(Boolean).join(' ');

    const trace = rec.trace || [];
    const traceHtml = trace.length > 1
      ? `<div class="ts-card-trace">${trace.slice(1).map(t => `<div>· ${escapeHtml(String(t))}</div>`).join('')}</div>`
      : '';
    const hasExpand = trace.length > 1;

    // v5.1: 本条耗了多少 token / 哪个 provider —— 让玩家肉眼分得清真 LLM vs mock
    const tk = rec.token_used || 0;
    const provLabel = rec.provider || (tk > 0 ? 'llm' : 'mock');
    const tokenBadge = tk > 0
      ? `<span class="ts-card-tokens ts-tk-real" title="本条心声由 ${escapeHtml(provLabel)} 生成，耗 ${tk} token">${provLabel} · ${tk}t</span>`
      : `<span class="ts-card-tokens ts-tk-mock" title="本条心声由 mock 兜底，0 token">mock · 0t</span>`;

    return `<div class="${cls}" data-agent="${escapeHtml(rec.agent)}" data-idx="${idx}">
      <div class="ts-card-head">
        <span class="ts-card-emoji">${rec.emoji || '🙂'}</span>
        <span class="ts-card-name">${escapeHtml(rec.agent)}</span>
        <span class="ts-card-tick">t${rec.tick}</span>
        ${tokenBadge}
        ${isMe ? '<span class="ts-me-tag">你</span>' : ''}
      </div>
      <div class="ts-card-text">${escapeHtml(rec.text)}</div>
      ${hasExpand ? `<button class="ts-card-expand" title="展开完整推理链">▼ 推理链 ${trace.length}</button>` : ''}
      ${traceHtml}
    </div>`;
  },

  // ====== tool 卡片：参数 KV + 结果摘要 + 可展开 result JSON + 延迟 badge ======
  _toolCardHtml(rec, idx) {
    const isMe = rec.agent === this.playerAvatar;
    const isHot = this._hotAgents.has(rec.agent);
    const lat = rec.latency_ms || 0;
    const latCls = lat < 200 ? 'lat-fast' : lat < 800 ? 'lat-mid' : 'lat-slow';
    const okCls = rec.ok === false ? 'ts-tool-fail' : 'ts-tool-ok';
    const nested = rec.parent_thought ? 'ts-tool-nested' : '';
    const cls = [
      'ts-card', 'ts-tool', okCls, nested,
      isMe ? 'ts-me' : '',
      isHot ? 'ts-hot' : '',
    ].filter(Boolean).join(' ');

    const icon = this._toolIcon(rec.tool);
    const argsHtml = this._renderToolArgs(rec.args || {});
    const briefText = rec.brief || (rec.ok === false ? (rec.result && rec.result.error) || '失败' : '');
    const sourceTag = `<span class="ts-tool-source" title="本地工具调用（非 MCP）">本地工具</span>`;

    let resultBlock = '';
    if (rec.result !== undefined && rec.result !== null) {
      let pretty = '';
      try { pretty = JSON.stringify(rec.result, null, 2); }
      catch (e) { pretty = String(rec.result); }
      resultBlock = `<details class="ts-tool-result-details"><summary>展开 result JSON</summary><pre class="ts-tool-result-pre">${escapeHtml(pretty)}</pre></details>`;
    }

    const parentLine = rec.parent_thought
      ? `<div class="ts-tool-parent" title="本工具发起时的 thought">💭 ${escapeHtml(rec.parent_thought)}</div>`
      : '';

    return `<div class="${cls}" data-agent="${escapeHtml(rec.agent)}" data-idx="${idx}">
      <div class="ts-tool-head">
        <span class="ts-tool-name">${icon} <b>${escapeHtml(rec.tool)}</b></span>
        <span class="ts-card-emoji">${rec.emoji || '🙂'}</span>
        <span class="ts-card-name">${escapeHtml(rec.agent)}</span>
        ${sourceTag}
        <span class="ts-card-tick">t${rec.tick}</span>
        <span class="ts-lat ${latCls}" title="本次工具执行 ${lat}ms">${lat}ms</span>
      </div>
      ${parentLine}
      <div class="ts-tool-args">${argsHtml || '<i class="ts-tool-empty">无参数</i>'}</div>
      <div class="ts-tool-result">${rec.ok === false ? '❌' : '→'} ${escapeHtml(briefText || '（无摘要）')}</div>
      ${resultBlock}
    </div>`;
  },

  // 渲染工具参数 KV：短字符串 inline；超长值单独成块
  _renderToolArgs(args) {
    if (!args || typeof args !== 'object') return '';
    const rows = [];
    for (const k of Object.keys(args)) {
      let v = args[k];
      let val = '';
      let long = false;
      if (typeof v === 'string') {
        val = v;
        long = v.length > 60;
      } else if (v == null) {
        val = '∅';
      } else {
        try { val = JSON.stringify(v); }
        catch (e) { val = String(v); }
        long = val.length > 60;
      }
      if (long) {
        rows.push(`<div class="ts-tool-arg-row"><span class="ts-tool-arg-k">${escapeHtml(k)}</span><pre class="ts-tool-arg-vlong">${escapeHtml(val)}</pre></div>`);
      } else {
        rows.push(`<span class="ts-tool-arg-kv"><span class="ts-tool-arg-k">${escapeHtml(k)}</span>=<span class="ts-tool-arg-v">${escapeHtml(val)}</span></span>`);
      }
    }
    return rows.join(' ');
  },

  renderPlansTab() {
    const list = $('#ts-plans-list');
    if (!list) return;
    const entries = Object.entries(this._plans);
    if (!entries.length) {
      list.innerHTML = '<div class="ts-empty">尚无角色发布计划。</div>';
      return;
    }
    list.innerHTML = entries.map(([name, p]) => {
      const emoji = this._emojiOf(name);
      const stepsHtml = (p.steps || []).map(s => {
        const status = typeof s === 'object' ? (s.status || (s.done ? 'done' : 'todo')) : 'todo';
        const text = typeof s === 'object' ? (s.text || s.desc || '') : String(s);
        const sym = status === 'done' ? '✓' : status === 'doing' ? '▶' : '○';
        return `<li class="ts-plan-step ts-step-${status}"><span class="ts-step-sym">${sym}</span> ${escapeHtml(text)}</li>`;
      }).join('');
      return `<div class="ts-plan-card" data-agent="${escapeHtml(name)}">
        <div class="ts-plan-head">
          <span class="ts-card-emoji">${emoji}</span>
          <b>${escapeHtml(name)}</b>
          <span class="ts-card-tick">@t${p.updated_tick || 0}</span>
        </div>
        <div class="ts-plan-goal">🎯 ${escapeHtml(p.goal || '(无目标)')}</div>
        <ol class="ts-plan-steps">${stepsHtml || '<li class="ts-empty">(无步骤)</li>'}</ol>
      </div>`;
    }).join('');
  },

  renderRecallsTab() {
    const list = $('#ts-recalls-list');
    if (!list) return;
    if (!this._recalls.length) {
      list.innerHTML = '<div class="ts-empty">还没有记忆召回事件。打开 debug 模式可看到全部召回。</div>';
      return;
    }
    list.innerHTML = this._recalls.map(rec => {
      const emoji = this._emojiOf(rec.agent);
      const hitsHtml = (rec.hits || []).slice(0, 5).map(h => {
        const content = h.content || h.text || JSON.stringify(h);
        const score = h.score != null ? ` <span class="ts-recall-score">${(h.score * 100).toFixed(0)}%</span>` : '';
        return `<li>${escapeHtml(content)}${score}</li>`;
      }).join('');
      return `<div class="ts-recall-card">
        <div class="ts-recall-head">
          <span class="ts-card-emoji">${emoji}</span>
          <b>${escapeHtml(rec.agent)}</b>
          <span class="ts-card-tick">t${rec.tick}</span>
          <span class="ts-recall-q">查询：「${escapeHtml(rec.query)}」</span>
        </div>
        <ul class="ts-recall-hits">${hitsHtml || '<li class="ts-empty">无命中</li>'}</ul>
      </div>`;
    }).join('');
  },

  _updateUnreadBadge() {
    const u = $('#ts-unread');
    if (!u) return;
    if (this._tsUnread > 0 && this._tsCollapsed) {
      u.style.display = '';
      u.textContent = this._tsUnread > 99 ? '99+' : String(this._tsUnread);
    } else {
      u.style.display = 'none';
    }
  },

  // 切换心声面板展开/收起
  toggleThoughtStream(forceOpen = null) {
    const panel = $('#thought-stream');
    if (!panel) return;
    const willCollapse = forceOpen === null ? !this._tsCollapsed : !forceOpen;
    this._tsCollapsed = willCollapse;
    panel.classList.toggle('collapsed', willCollapse);
    if (!willCollapse) {
      this._tsUnread = 0;
      this._updateUnreadBadge();
      // 切到当前 tab 时刷新一下
      if (this._tsTab === 'thoughts') this.renderThoughtsTab();
      else if (this._tsTab === 'plans') this.renderPlansTab();
      else this.renderRecallsTab();
    }
  },

  switchThoughtTab(tab) {
    if (!['thoughts', 'plans', 'recalls'].includes(tab)) return;
    this._tsTab = tab;
    document.querySelectorAll('.ts-tab').forEach(b => b.classList.toggle('active', b.dataset.tsTab === tab));
    document.querySelectorAll('.ts-tab-content').forEach(c => c.classList.toggle('active', c.dataset.tsTab === tab));
    if (tab === 'thoughts') this.renderThoughtsTab();
    else if (tab === 'plans') this.renderPlansTab();
    else this.renderRecallsTab();
  },

  bindThoughtPanelToggle() {
    const toggle = $('#ts-toggle');
    const close = $('#ts-close');
    if (toggle && !toggle._bound) {
      toggle._bound = true;
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleThoughtStream();
      });
    }
    if (close && !close._bound) {
      close._bound = true;
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleThoughtStream(false);
      });
    }
    document.querySelectorAll('.ts-tab').forEach(b => {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', () => this.switchThoughtTab(b.dataset.tsTab));
    });
  },

  // canvas hover tooltip：鼠标悬停 sprite 时显示最近一条心声
  bindCanvasHoverTip() {
    const canvas = $('#game-canvas');
    const tip = $('#sprite-thought-tip');
    if (!canvas || !tip || canvas._hoverBound) return;
    canvas._hoverBound = true;
    canvas.addEventListener('mousemove', (e) => {
      if (!this.renderer || this.renderer.viewMode !== 'focus') {
        tip.classList.add('hidden');
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
      const name = this.renderer.getCharacterAt(sx, sy);
      if (!name) {
        tip.classList.add('hidden');
        return;
      }
      const th = this._thoughtsByAgent[name];
      if (!th) {
        tip.classList.add('hidden');
        return;
      }
      const emoji = this._emojiOf(name);
      tip.innerHTML = `<div class="stt-head">${emoji} <b>${escapeHtml(name)}</b> <span class="stt-tick">t${th.tick}</span></div>
        <div class="stt-text">💭 ${escapeHtml(th.text)}</div>`;
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
      tip.classList.remove('hidden');
    });
    canvas.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  },

  // 判断一个事件是否属于"核心"
  isCoreEvent(ev) {
    if (ev.kind === 'narrative' || ev.kind === 'seed' || ev.kind === 'system' || ev.kind === 'world_state_change') return true;
    if (ev.kind === 'talk') {
      const d = ev.payload?.relation_delta;
      if (!d) return false;
      const sum = Math.abs(d.trust || 0) + Math.abs(d.fondness || 0) + Math.abs(d.jealousy || 0) + Math.abs(d.guilt || 0);
      return sum >= 4;  // 关系剧变才进核心
    }
    return false; // move/talk 普通版不算核心
  },

  passesFilter(ev) {
    if (this._eventFilter === 'all') return true;
    if (this._eventFilter === 'thought') {
      // 心声 filter：只看 thought / reflect / belief_formed / 热点角色的 talk
      if (['thought', 'reflect', 'belief_formed', 'tool_call'].includes(ev.kind)) return true;
      if (ev.kind === 'talk' && this._isHotOrAvatar(ev.actor)) return true;
      return false;
    }
    // core：原有逻辑 + 热点角色的 thought 也算
    if (ev.kind === 'thought') return this._isHotOrAvatar(ev.actor);
    return this.isCoreEvent(ev);
  },

  // filter 切换 → 全量重渲染
  rerenderEventPanel() {
    const panel = $('#event-panel');
    panel.innerHTML = '';
    const filtered = this._eventHistory.filter(ev => this.passesFilter(ev));
    if (filtered.length === 0) {
      panel.innerHTML = '<div class="panel-ev panel-system"><div class="pe-text" style="color:var(--fg-dim)">' +
        (this._eventFilter === 'core' ? '尚无核心事件，等待故事发酵……' : '等待事件发生……') +
        '</div></div>';
      return;
    }
    // 倒序追加（最新在上）
    for (const ev of filtered) {
      this.appendPanelEvent(ev.kind, ev, /*skipHistoryPush=*/true);
    }
  },

  // ====== 右侧事件面板 ======

  appendPanelEvent(kind, ev, skipHistoryPush = false) {
    const panel = $('#event-panel');
    const el = document.createElement('div');
    el.className = `panel-ev panel-${kind}`;

    if (kind === 'narrative') {
      const p = ev.payload || {};
      el.innerHTML = `<div class="pe-icon">📰</div>
        <div class="pe-headline">${escapeHtml(p.headline || ev.text)}</div>
        <div class="pe-meta">drama=${p.drama || '?'} · ${(p.involved || []).join(', ') || ''}</div>
        ${p.predict_next ? `<div class="pe-predict">🔮 ${escapeHtml(p.predict_next)}</div>` : ''}`;
    } else if (kind === 'seed') {
      const aff = (ev.payload?.affected || []).join('、');
      el.innerHTML = `<div class="pe-icon">🌱</div>
        <div class="pe-text">${escapeHtml(ev.text || '')}</div>
        ${aff ? `<div class="pe-meta">扰动：<b>${escapeHtml(aff)}</b></div>` : ''}`;
    } else if (kind === 'talk') {
      const p = ev.payload || {};
      const delta = this.formatDelta(p.relation_delta);
      const isHot = this.isCoreEvent(ev);
      el.classList.toggle('panel-talk-hot', isHot);
      el.innerHTML = `<div class="pe-icon">${isHot ? '🔥' : '💬'}</div>
        <div class="pe-text"><b>${escapeHtml(ev.actor)}</b> → ${escapeHtml(ev.target)}：「${escapeHtml(p.utterance || '')}」</div>
        ${delta !== '无变化' ? `<div class="pe-meta">关系变化：${delta}</div>` : ''}`;
    } else if (kind === 'move') {
      const p = ev.payload || {};
      el.innerHTML = `<div class="pe-icon">🚶</div>
        <div class="pe-text">${escapeHtml(ev.actor)} 来到了 ${escapeHtml(p.to || '')}</div>`;
    } else if (kind === 'system') {
      el.innerHTML = `<div class="pe-icon">⚙️</div>
        <div class="pe-text" style="color:var(--fg-dim)">${escapeHtml(ev.text || '')}</div>`;
    } else if (kind === 'thought') {
      const p = ev.payload || {};
      let trace = p.trace || p.reasoning_trace || [];
      if (typeof trace === 'string') trace = [trace];
      const text = (trace[0] || ev.text || '……').toString();
      const isMe = ev.actor === this.playerAvatar;
      const emoji = this._emojiOf(ev.actor);
      el.classList.add(isMe ? 'panel-thought-me' : 'panel-thought-hot');
      el.innerHTML = `<div class="pe-icon">💭</div>
        <div class="pe-text"><span class="pe-emoji">${emoji}</span> <b>${escapeHtml(ev.actor)}</b> 心声：<i>${escapeHtml(text)}</i></div>
        ${isMe ? '<div class="pe-meta" style="color:var(--gold)">这是你的内心独白</div>' : ''}`;
    } else if (kind === 'reflect') {
      const p = ev.payload || {};
      el.innerHTML = `<div class="pe-icon">🪞</div>
        <div class="pe-text"><b>${escapeHtml(ev.actor)}</b> 反思了一番${p.mood ? '（心情：' + escapeHtml(p.mood) + '）' : ''}</div>`;
    } else if (kind === 'belief_formed') {
      const p = ev.payload || {};
      el.innerHTML = `<div class="pe-icon">🧩</div>
        <div class="pe-text"><b>${escapeHtml(ev.actor)}</b> 对 <b>${escapeHtml(p.target || '?')}</b> 形成印象：「${escapeHtml(p.belief || '')}」</div>`;
    } else {
      return; // 跳过不关心的事件
    }

    panel.prepend(el);
    while (panel.children.length > 80) panel.removeChild(panel.lastChild);
    // pace 轨：记录 append 时间戳用于 6/s 阈值判定
    this._appendStamps.push(Date.now());
  },

  // 种子投放 → canvas 上让受影响 agent 头顶 ❗ + 屏幕轻震
  flashSeedImpact(affected, durationMs = 4000) {
    if (!affected || !affected.length) return;
    affected.forEach(name => {
      this._highlightAgents.add(name);
      if (this.renderer && this.renderer.flashAgent) {
        this.renderer.flashAgent(name, durationMs);
      }
    });
    // 全屏轻震
    const section = $('#canvas-section');
    section.classList.add('shake');
    setTimeout(() => section.classList.remove('shake'), 500);
    // 顶部短暂横幅
    this.showSeedRipple(affected);
  },

  // pace 轨：玩家投种子后，对应 roster 卡片红色脉冲 3 次（约 2.7s）
  _pulseRosterFor(affected) {
    if (!affected || !affected.length) return;
    requestAnimationFrame(() => {
      const list = $('#roster-list');
      if (!list) return;
      const target = new Set(affected);
      list.querySelectorAll('.roster-item').forEach(el => {
        if (target.has(el.dataset.name)) {
          el.classList.remove('roster-pulse');
          void el.offsetWidth;            // 重启动画
          el.classList.add('roster-pulse');
          setTimeout(() => el.classList.remove('roster-pulse'), 3000);
        }
      });
    });
  },

  // pace 轨：玩家种子专属顶部 sticky 卡片，8s 倒计时进度条，最多保留 3 张
  showSeedSticky(ev, fromPlayer) {
    const c = $('#seed-sticky');
    if (!c) return;
    const p = ev.payload || {};
    const desc = p.desc || (ev.text || '').replace(/^🌱\s*/, '').replace(/^玩家种子：/, '');
    const affected = p.affected || [];
    const effects = p.effects || [];
    const TTL = 8000;

    const card = document.createElement('div');
    card.className = 'seed-sticky-card' + (fromPlayer ? ' player' : '');
    const chipsHtml = affected
      .map(n => `<span class="ssc-chip">${this._emojiOf(n)} ${escapeHtml(n)}</span>`)
      .join('');
    const fxHtml = effects
      .map(e => `<span class="ssc-chip fx">✨ ${escapeHtml(e)}</span>`)
      .join('');
    card.innerHTML = `
      <div class="ssc-head">
        <span class="ssc-emoji">🌱</span>
        <span class="ssc-title">${fromPlayer ? '你投放了一个种子' : '世界涟漪'}</span>
        ${fromPlayer ? '<span class="ssc-you-tag">YOU</span>' : ''}
      </div>
      <div class="ssc-text">${escapeHtml(desc)}</div>
      <div class="ssc-chips">${chipsHtml}${fxHtml}</div>
      <button class="ssc-close" title="关闭">✕</button>
      <div class="ssc-progress" style="animation: seedSticky-progress ${TTL}ms linear forwards;"></div>
    `;

    // prepend：最新在上
    c.insertBefore(card, c.firstChild);

    // 关闭按钮
    const closeBtn = card.querySelector('.ssc-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this._removeSeedSticky(card));

    // 自动消失
    const timer = setTimeout(() => this._removeSeedSticky(card), TTL);
    this._seedStickyCards.unshift({ el: card, timer });

    // 最多保留 3 张：超出的删掉最老的
    while (this._seedStickyCards.length > 3) {
      const oldest = this._seedStickyCards.pop();
      if (oldest) this._removeSeedSticky(oldest.el);
    }
  },

  _removeSeedSticky(card) {
    if (!card || !card.parentNode) return;
    // 找到并清理 timer
    const idx = this._seedStickyCards.findIndex(x => x.el === card);
    if (idx >= 0) {
      clearTimeout(this._seedStickyCards[idx].timer);
      this._seedStickyCards.splice(idx, 1);
    }
    card.classList.add('removing');
    setTimeout(() => { if (card.parentNode) card.parentNode.removeChild(card); }, 220);
  },

  _clearSeedSticky() {
    for (const x of this._seedStickyCards) {
      clearTimeout(x.timer);
      if (x.el && x.el.parentNode) x.el.parentNode.removeChild(x.el);
    }
    this._seedStickyCards = [];
    const c = $('#seed-sticky');
    if (c) c.innerHTML = '';
  },

  showSeedRipple(affected) {
    let banner = $('#seed-ripple-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'seed-ripple-banner';
      banner.className = 'ripple-banner';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `🌱 涟漪扩散：<b>${affected.map(escapeHtml).join('、')}</b>`;
    banner.classList.remove('hidden');
    banner.classList.remove('show');
    void banner.offsetWidth; // restart animation
    banner.classList.add('show');
    clearTimeout(this._rippleTimer);
    this._rippleTimer = setTimeout(() => banner.classList.add('hidden'), 3500);
  },

  formatDelta(d) {
    if (!d || typeof d !== 'object') return '无变化';
    const map = { trust: '信任', fondness: '好感', jealousy: '嫉妒', guilt: '愧疚' };
    const parts = [];
    for (const k of ['trust', 'fondness', 'jealousy', 'guilt']) {
      const v = d[k];
      if (typeof v === 'number' && v !== 0) {
        parts.push(`${map[k]}${v > 0 ? '+' : ''}${v}`);
      }
    }
    return parts.length ? parts.join(' ') : '无变化';
  },

  // ====== 头条横幅 ======

  showHeadline(p) {
    $('#hb-headline').textContent = p.headline || '—';
    const involved = (p.involved || []).join('、') || '-';
    const chain = (p.chain || []).join(' → ') || '';
    $('#hb-meta').innerHTML = `涉及：${involved} · drama=${p.drama || '?'}${chain ? `<br>因果链：${chain}` : ''}`;
    const banner = $('#headline-banner');
    banner.classList.remove('hidden');
    clearTimeout(this._hbTimer);
    this._hbTimer = setTimeout(() => banner.classList.add('hidden'), 8000);
  },

  // ====== 角色面板 ======

  async showCharacterPanel(name) {
    const panel = $('#character-panel');
    panel.classList.remove('hidden');
    $('#panel-name').textContent = name;
    $('#panel-body').innerHTML = '加载中……';
    try {
      const a = await API.sceneAgent(this.sceneId, name);
      this.renderCharacterPanel(a);
    } catch (e) {
      $('#panel-body').textContent = '加载失败';
    }
  },

  renderCharacterPanel(a) {
    this._currentPanelAgent = a;
    const memories = (a.memories || []).slice(-8).reverse();
    const memHtml = memories.length
      ? `<ul>${memories.map(m => `<li class="mem">[t${m.tick}] ${escapeHtml(m.content)}</li>`).join('')}</ul>`
      : '<i>（暂无记忆）</i>';

    const threadsHtml = (a.threads || []).length
      ? `<ul>${a.threads.map(t => `<li class="thread">(${t.weight}) ${escapeHtml(t.desc)}${t.target ? ` →<b>${t.target}</b>` : ''}</li>`).join('')}</ul>`
      : '<i>（暂无心事）</i>';

    const rels = Object.entries(a.relations || {})
      .map(([n, r]) => ({ name: n, r, intensity: Math.abs(r.trust||0) + Math.abs(r.fondness||0) + Math.abs(r.jealousy||0) + Math.abs(r.guilt||0) }))
      .filter(x => x.intensity > 0)
      .sort((x, y) => y.intensity - x.intensity)
      .slice(0, 8);
    const relHtml = rels.length
      ? rels.map(({ name, r }) =>
        `<div class="rel-row"><span>${escapeHtml(name)}</span>
          <span class="rel-vals">信任${r.trust >= 0 ? '+' : ''}${r.trust||0} 好感${r.fondness >= 0 ? '+' : ''}${r.fondness||0} 嫉妒${r.jealousy >= 0 ? '+' : ''}${r.jealousy||0} 愧疚${r.guilt >= 0 ? '+' : ''}${r.guilt||0}</span></div>`
      ).join('')
      : '<i>（暂无明显关系）</i>';

    const palette = a.color_palette || {};
    const colorDots = palette.skin
      ? `<div class="palette-row">${['skin','hair','clothes','eyes','accessory'].map(k =>
          palette[k] ? `<span class="color-dot" style="background:${palette[k]}" title="${k}"></span>` : ''
        ).join('')}</div>`
      : '';

    const roleLabel = a.role ? `<span class="role-tag">${a.role}</span>` : '';

    const isMe = this.playerAvatar === a.name;
    const avatarBtn = isMe
      ? `<button class="pixel-btn sm panel-avatar-btn" id="char-avatar-exit">⤴ 退出化身</button>`
      : `<button class="pixel-btn sm primary panel-avatar-btn" id="char-avatar-btn">👤 化身为 ta</button>`;

    $('#panel-body').innerHTML = `
      <div class="panel-section">
        <h4>${a.emoji || ''} ${a.name} ${roleLabel}
          ${isMe ? '<span class="me-tag">这是你</span>' : ''}
        </h4>
        <div class="persona">${escapeHtml(a.persona || '')}</div>
        ${colorDots}
        <div class="voice">语气：${escapeHtml(a.voice || '')}</div>
        <div class="goals">目标：${(a.goals || []).join('；') || '-'}</div>
        <div class="loc">📍 ${escapeHtml(a.location || '-')}</div>
        <div class="panel-row-btns">
          ${avatarBtn}
          <button class="pixel-btn sm panel-edit-btn" id="char-edit-btn">✏️ 编辑</button>
        </div>
      </div>
      <div class="panel-section"><h4>💭 心事</h4>${threadsHtml}</div>
      <div class="panel-section"><h4>🧠 记忆</h4>${memHtml}</div>
      <div class="panel-section"><h4>❤️ 关系</h4>${relHtml}</div>`;

    const editBtn = $('#char-edit-btn');
    if (editBtn) editBtn.addEventListener('click', () => this.renderCharacterEditor(a));
    const avBtn = $('#char-avatar-btn');
    if (avBtn) avBtn.addEventListener('click', () => this.setAvatar(a.name));
    const avExit = $('#char-avatar-exit');
    if (avExit) avExit.addEventListener('click', () => this.setAvatar(null));
  },

  // ====== 玩家化身控制 ======

  async setAvatar(name) {
    try {
      const r = await API.setAvatar(this.sceneId, name);
      this.playerAvatar = r.player_avatar || null;
      // 同步状态
      const state = await API.sceneState(this.sceneId);
      this._agentsCache = state.agents || [];
      this.updatePlayerModeBadge();
      // 通知 renderer：皇冠 + 入场粒子
      if (this.renderer && this.renderer.setAvatarName) {
        this.renderer.setAvatarName(this.playerAvatar);
      }
      // 化身入场闪烁
      if (this.playerAvatar && this.renderer && this.renderer.flashAgent) {
        this.renderer.flashAgent(this.playerAvatar, 3000);
      }
      // 角色面板若开着，重新渲染
      const panel = $('#character-panel');
      if (panel && !panel.classList.contains('hidden') && this._currentPanelAgent) {
        const me = this._agentsCache.find(x => x.name === this._currentPanelAgent.name);
        if (me) this.renderCharacterPanel(me);
      }
    } catch (e) {
      alert('切换身份失败：' + e.message);
    }
  },

  updateViewModeButtons(mode) {
    document.querySelectorAll('.view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === mode);
    });
  },

  // ====== 角色花名册 + 房间分布条 ======

  renderRoster() {
    const list = $('#roster-list');
    if (!list) return;
    const cur = this.renderer ? this.renderer.currentRoom : '';
    // v5.3：status → emoji / class / badge 映射
    const STATUS_EMOJI = { dead: '💀', unconscious: '😴', missing: '🚪', gone: '🚪' };
    const STATUS_LABEL = { dead: '已故', unconscious: '昏迷', missing: '失踪', gone: '离场' };
    list.innerHTML = (this._agentsCache || []).map(a => {
      const status = (a.status || 'alive').toLowerCase();
      const isAlive = (status === 'alive');
      const statusCls = !isAlive ? `is-${status} status-${status}` : '';
      const cls = [
        'roster-item',
        a.location === cur ? 'in-current-room' : '',
        a.name === this.playerAvatar ? 'is-me' : '',
        this._hotAgents.has(a.name) ? 'is-hot' : '',
        statusCls,
      ].filter(Boolean).join(' ');
      const planStrip = isAlive ? this._planStripHtml(a.name) : '';
      // tool-use 轨：最近一次 tool 调用图标（roster 卡片左下角）
      const lt = this._lastToolByAgent && this._lastToolByAgent[a.name];
      const toolHint = (lt && isAlive)
        ? `<span class="roster-tool ${lt.ok === false ? 'tool-fail' : ''}" title="最近：${lt.tool} ${lt.latency_ms}ms @t${lt.tick}">${this._toolIcon(lt.tool)}</span>`
        : '';
      const emoji = isAlive ? (a.emoji || '🙂') : (STATUS_EMOJI[status] || a.emoji || '❔');
      const reason = a.death_reason ? escapeHtml(String(a.death_reason)) : '';
      const statusBadge = !isAlive
        ? `<span class="death-badge" title="${reason}">${STATUS_LABEL[status] || status}</span>`
        : '';
      return `<div class="${cls}" data-name="${escapeHtml(a.name)}" data-loc="${escapeHtml(a.location || '')}" data-status="${escapeHtml(status)}">
        <div class="roster-row-main">
          <span class="roster-emoji">${emoji}</span>
          <span class="roster-name">${escapeHtml(a.name)}</span>
          ${statusBadge}
          ${toolHint}
          <span class="roster-loc">${escapeHtml(a.location || '')}</span>
        </div>
        ${planStrip}
      </div>`;
    }).join('');
    list.querySelectorAll('.roster-item').forEach(el => {
      el.addEventListener('click', () => {
        const name = el.dataset.name;
        const loc = el.dataset.loc;
        // 切到该房间
        if (this.renderer && loc && this.places.includes(loc)) {
          this.renderer.switchRoom(loc);
          $('#room-name').textContent = loc;
          this.renderRoster();
          this.renderRoomBar();
        }
        // 打开角色面板
        this.showCharacterPanel(name);
      });
    });
  },

  _planStripHtml(name) {
    const p = this._plans[name];
    if (!p || !p.steps || !p.steps.length) return '';
    const dots = p.steps.slice(0, 5).map(s => {
      const status = typeof s === 'object' ? (s.status || (s.done ? 'done' : 'todo')) : 'todo';
      const sym = status === 'done' ? '▷' : status === 'doing' ? '▶' : '○';
      return `<span class="plan-dot plan-${status}" title="${escapeHtml(typeof s === 'object' ? (s.text || s.desc || '') : String(s))}">${sym}</span>`;
    }).join('');
    return `<div class="plan-strip" title="${escapeHtml(p.goal || '')}">${dots}</div>`;
  },

  renderRoomBar() {
    const bar = $('#room-bar');
    if (!bar) return;
    const cur = this.renderer ? this.renderer.currentRoom : '';
    bar.innerHTML = (this.places || []).map(p => {
      const peopleEmojis = (this._agentsCache || [])
        .filter(a => a.location === p)
        .map(a => a.emoji || '🙂')
        .join('');
      const cls = 'room-cell' + (p === cur ? ' current' : '');
      return `<div class="${cls}" data-loc="${escapeHtml(p)}">
        ${escapeHtml(p)} <span class="rc-emoji">${peopleEmojis || '·'}</span>
      </div>`;
    }).join('');
    bar.querySelectorAll('.room-cell').forEach(el => {
      el.addEventListener('click', () => {
        const loc = el.dataset.loc;
        if (this.renderer && loc && this.places.includes(loc)) {
          this.renderer.switchRoom(loc);
          $('#room-name').textContent = loc;
          this.renderRoster();
          this.renderRoomBar();
        }
      });
    });
  },

  stopRosterPoll() {
    if (this._rosterPollTimer) { clearInterval(this._rosterPollTimer); this._rosterPollTimer = null; }
  },

  startRosterPoll() {
    if (this._rosterPollTimer) return;
    this._rosterPollTimer = setInterval(async () => {
      try {
        const state = await API.sceneState(this.sceneId);
        this._agentsCache = state.agents || [];
        this._recomputeHotAgents();
        // 化身可能在另一会话被改
        if (state.player_avatar !== this.playerAvatar) {
          this.playerAvatar = state.player_avatar;
          this.updatePlayerModeBadge();
          if (this.renderer && this.renderer.setAvatarName) this.renderer.setAvatarName(this.playerAvatar);
        }
        this.renderRoster();
        this.renderRoomBar();
      } catch (e) { /* ignore */ }
    }, 3500);
  },

  startAvatarPoll() {
    if (this._avatarPollTimer) return;
    this._avatarPollTimer = setInterval(async () => {
      if (!this.playerAvatar) return;
      try {
        const state = await API.sceneState(this.sceneId);
        this._agentsCache = state.agents || [];
        this.refreshAvatarPanel();
      } catch (e) { /* ignore */ }
    }, 4000);
  },

  stopAvatarPoll() {
    if (this._avatarPollTimer) { clearInterval(this._avatarPollTimer); this._avatarPollTimer = null; }
  },

  updatePlayerModeBadge() {
    const badge = $('#player-mode-badge');
    const icon = $('#pm-icon');
    const label = $('#pm-label');
    const exitBtn = $('#pm-exit');
    if (!badge) return;
    if (this.playerAvatar) {
      const me = this._agentsCache.find(a => a.name === this.playerAvatar);
      icon.textContent = (me && me.emoji) || '🙂';
      label.textContent = `我是 ${this.playerAvatar}`;
      badge.classList.add('mode-avatar');
      badge.classList.remove('mode-god');
      exitBtn.style.display = '';
      this.showAvatarPanel();
    } else {
      icon.textContent = '☁️';
      label.textContent = '上帝视角';
      badge.classList.add('mode-god');
      badge.classList.remove('mode-avatar');
      exitBtn.style.display = 'none';
      this.hideAvatarPanel();
    }
  },

  showAvatarPanel() {
    const panel = $('#avatar-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    this.refreshAvatarPanel();
    this.startAvatarPoll();
  },

  hideAvatarPanel() {
    const panel = $('#avatar-panel');
    if (panel) panel.classList.add('hidden');
    this.stopAvatarPoll();
  },

  refreshAvatarPanel() {
    if (!this.playerAvatar) return;
    const me = this._agentsCache.find(a => a.name === this.playerAvatar);
    if (!me) return;
    $('#ap-me-icon').textContent = me.emoji || '🙂';
    $('#ap-me-name').textContent = me.name;
    $('#ap-me-loc').textContent = me.location || '—';

    // "做我不敢做" 快速台词：基于关系矩阵生成
    const bold = this.suggestBoldActions(me);
    const row = $('#ap-bold-row');
    row.innerHTML = bold.map(b =>
      `<button class="pixel-btn sm bold-btn" data-target="${escapeHtml(b.target)}" data-utterance="${escapeHtml(b.utterance)}" data-intent="${escapeHtml(b.intent)}">${escapeHtml(b.label)}</button>`
    ).join('');
    row.querySelectorAll('.bold-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.submitPlayerSay(btn.dataset.target, btn.dataset.utterance, btn.dataset.intent);
      });
    });
  },

  // 根据当前 avatar 的关系矩阵 + 在场人员，建议一些"敢说但不敢说"的台词
  suggestBoldActions(me) {
    const out = [];
    const others = this._agentsCache.filter(a => a.name !== me.name);
    const rels = me.relations || {};
    others.forEach(o => {
      const r = rels[o.name] || {};
      const f = r.fondness || 0, t = r.trust || 0, j = r.jealousy || 0, g = r.guilt || 0;
      if (f >= 5) {
        out.push({ target: o.name, utterance: `${o.name}，我喜欢你。`, intent: '示好',
                   label: `💕 跟 ${o.name} 表白` });
      }
      if (t <= -3 || j >= 5) {
        out.push({ target: o.name, utterance: `${o.name}，你够了。我都看在眼里。`, intent: '质问',
                   label: `🔥 跟 ${o.name} 对峙` });
      }
      if (o.role === 'boss' || /老板|总监|经理|CEO/.test(o.role || '')) {
        out.push({ target: o.name, utterance: `${o.name}，凭什么是我？这事不是我的责任。`, intent: '挑衅',
                   label: `😤 顶撞 ${o.name}` });
      }
      if (g >= 4) {
        out.push({ target: o.name, utterance: `${o.name}，关于那件事，我想跟你说对不起。`, intent: '忏悔',
                   label: `🙇 向 ${o.name} 道歉` });
      }
    });
    // 去重 + 最多 4 条
    const seen = new Set();
    return out.filter(x => {
      const k = x.target + x.label;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 4);
  },

  async openPlayerSayModal(presetTarget = '', presetUtterance = '', presetIntent = '玩家发言') {
    if (!this.playerAvatar) return;
    const me = this._agentsCache.find(a => a.name === this.playerAvatar);
    if (!me) return;
    const nearbyAll = this._agentsCache.filter(a => a.location === me.location && a.name !== me.name);
    if (nearbyAll.length === 0) {
      alert(`你现在身边没人（你在 ${me.location}）。试试'去别处'。`);
      return;
    }
    const sel = $('#ps-target');
    sel.innerHTML = nearbyAll.map(a =>
      `<option value="${escapeHtml(a.name)}" ${a.name === presetTarget ? 'selected' : ''}>${a.emoji || ''} ${escapeHtml(a.name)}</option>`
    ).join('');
    $('#ps-utterance').value = presetUtterance;
    $('#ps-intent').value = presetIntent;

    // 快速台词建议
    const quickRow = $('#ps-quick-row');
    const QUICKS = ['嗨。', '你今天怎么样？', '我有事要跟你说。', '你听说了吗？', '我不同意。', '别这样。', '我想一个人静静。'];
    quickRow.innerHTML = '<div class="ps-q-label">快速台词：</div>' +
      QUICKS.map(q => `<button class="pixel-btn sm ps-quick" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
    quickRow.querySelectorAll('.ps-quick').forEach(b => b.addEventListener('click', () => { $('#ps-utterance').value = b.dataset.q; }));

    $('#player-say-modal').classList.remove('hidden');
    setTimeout(() => $('#ps-utterance').focus(), 50);
  },

  async submitPlayerSay(target, utterance, intent) {
    if (!target || !utterance.trim()) return;
    try {
      await API.playerSay(this.sceneId, target, utterance.trim(), intent || '玩家发言');
      $('#player-say-modal').classList.add('hidden');
    } catch (e) {
      alert('说话失败：' + e.message);
    }
  },

  async openPlayerMoveModal() {
    if (!this.playerAvatar) return;
    const list = $('#pm-place-list');
    const me = this._agentsCache.find(a => a.name === this.playerAvatar);
    list.innerHTML = (this.places || []).map(p => {
      const here = me && me.location === p ? '<span class="here-tag">这里</span>' : '';
      const ppl = this._agentsCache.filter(a => a.location === p && a.name !== this.playerAvatar);
      const others = ppl.length ? `（${ppl.map(a => (a.emoji || '') + a.name).join('、')}）` : '（空）';
      return `<button class="pixel-btn place-pick" data-place="${escapeHtml(p)}">${escapeHtml(p)} ${others} ${here}</button>`;
    }).join('');
    list.querySelectorAll('.place-pick').forEach(b => b.addEventListener('click', async () => {
      try {
        await API.playerMove(this.sceneId, b.dataset.place);
        $('#player-move-modal').classList.add('hidden');
      } catch (e) {
        alert('移动失败：' + e.message);
      }
    }));
    $('#player-move-modal').classList.remove('hidden');
  },

  async playerActFast(kind) {
    try {
      await API.playerAct(this.sceneId, kind);
    } catch (e) { alert('操作失败：' + e.message); }
  },

  async openChronicle() {
    if (!this.sceneId) return;
    $('#chronicle-modal').classList.remove('hidden');
    $('#chronicle-body').innerHTML = '加载中……';
    try {
      const c = await API.chronicle(this.sceneId, 60);
      const items = c.items || [];
      const summary = `<div class="chronicle-summary">共 ${c.total_events} 个事件，其中 ${c.important_count} 个被记入编年史。当前 tick: ${c.tick}</div>`;
      if (!items.length) {
        $('#chronicle-body').innerHTML = summary + '<i style="color:var(--fg-dim)">还没有重要事件——让世界再跑一会儿吧。</i>';
        return;
      }
      const rows = items.map(it => {
        const iconMap = { narrative: '📰', seed: '🌱', talk_hot: '🔥', system: '💭' };
        const colorMap = { narrative: 'var(--gold)', seed: '#b59cf0', talk_hot: 'var(--red)', system: 'var(--accent)' };
        return `<div class="chronicle-row" style="border-left-color:${colorMap[it.kind] || 'var(--fg-dim)'}">
          <div class="cr-head"><span class="cr-icon">${iconMap[it.kind] || '·'}</span><b>t${it.tick}</b></div>
          <div class="cr-text">${escapeHtml(it.text)}</div>
          ${it.meta ? `<div class="cr-meta">${escapeHtml(it.meta)}</div>` : ''}
        </div>`;
      }).join('');
      $('#chronicle-body').innerHTML = summary + `<div class="chronicle-list">${rows}</div>`;
    } catch (e) {
      $('#chronicle-body').innerHTML = '加载失败：' + e.message;
    }
  },

  async openEnding() {
    $('#ending-modal').classList.remove('hidden');
    $('#ending-body').innerHTML = '生成中……';
    try {
      const e = await API.getEnding(this.sceneId);
      const cards = (e.agents || []).map(a =>
        `<div class="ending-card">
          <div class="ec-head"><span class="ec-emoji">${a.emoji || '🙂'}</span><b>${escapeHtml(a.name)}</b><span class="ec-role">${escapeHtml(a.role || '')}</span></div>
          <div class="ec-text">${escapeHtml(a.ending)}</div>
        </div>`
      ).join('');
      $('#ending-body').innerHTML = `
        <div class="ending-headline">${escapeHtml(e.headline || '')}</div>
        <div class="ending-flavor">${escapeHtml(e.flavor || '')} ${escapeHtml(e.player_line || '')}</div>
        <div class="ending-grid">${cards}</div>`;
    } catch (err) {
      $('#ending-body').innerHTML = '生成失败：' + err.message;
    }
  },

  renderCharacterEditor(a) {
    const threads = a.threads || [];
    const palette = a.color_palette || {};
    const paletteKeys = ['skin','hair','clothes','eyes','accessory'];
    const colorPickers = paletteKeys.map(k =>
      `<label class="cp-row">${k}
        <input type="color" data-pkey="${k}" value="${palette[k] || '#aaaaaa'}" />
      </label>`
    ).join('');
    $('#panel-body').innerHTML = `
      <div class="panel-section edit-section">
        <h4>✏️ 编辑 ${a.name}</h4>
        <label>Emoji</label>
        <input id="ce-emoji" value="${escapeHtml(a.emoji || '')}" maxlength="4" />
        <label>人物设定（persona）</label>
        <textarea id="ce-persona" rows="3">${escapeHtml(a.persona || '')}</textarea>
        <label>说话风格（voice）</label>
        <input id="ce-voice" value="${escapeHtml(a.voice || '')}" />
        <label>目标（每行一条）</label>
        <textarea id="ce-goals" rows="2">${(a.goals || []).join('\n')}</textarea>
        <label>心事 threads（每行：desc | target | weight）</label>
        <textarea id="ce-threads" rows="3">${threads.map(t => `${t.desc} | ${t.target || ''} | ${t.weight}`).join('\n')}</textarea>
        <label>配色</label>
        <div class="color-pickers">${colorPickers}</div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="pixel-btn primary sm" id="ce-save">💾 保存</button>
          <button class="pixel-btn sm" id="ce-cancel">取消</button>
        </div>
      </div>`;
    $('#ce-cancel').addEventListener('click', () => this.renderCharacterPanel(a));
    $('#ce-save').addEventListener('click', () => this.saveCharacterEdit(a.name));
  },

  async saveCharacterEdit(name) {
    const body = {
      emoji: $('#ce-emoji').value.trim() || '🙂',
      persona: $('#ce-persona').value.trim(),
      voice: $('#ce-voice').value.trim(),
      goals: $('#ce-goals').value.split('\n').map(s => s.trim()).filter(Boolean),
      threads: $('#ce-threads').value.split('\n').map(line => {
        const parts = line.split('|').map(s => s.trim());
        if (!parts[0]) return null;
        return { desc: parts[0], target: parts[1] || null, weight: parseInt(parts[2] || '5', 10) };
      }).filter(Boolean),
      color_palette: {},
    };
    document.querySelectorAll('.color-pickers input[type=color]').forEach(inp => {
      body.color_palette[inp.dataset.pkey] = inp.value;
    });
    try {
      const res = await API.patchAgent(this.sceneId, name, body);
      // 重建 sprite（palette/emoji 变了）
      if (this.renderer && this.renderer.sprites[name]) {
        delete this.renderer.sprites[name];
        const state = await API.sceneState(this.sceneId);
        this.renderer.syncAgents(state.agents || []);
      }
      this.renderCharacterPanel(res.agent);
    } catch (e) {
      alert('保存失败：' + e.message);
    }
  },

  // ====== 控件绑定 ======

  bindGlobalControls() {
    // 速度
    $$('.speed-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        $$('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const factor = parseFloat(btn.dataset.speed);
        this.currentSpeed = factor;
        try {
          if (this.sceneId && this.sceneId !== 'default') {
            await API.sceneSpeed(this.sceneId, factor);
          } else {
            await API.setSpeed(factor);
          }
        } catch (e) { console.warn('调速失败:', e); }
      });
    });

    // 自定义世界
    $('#custom-btn').addEventListener('click', () => this.showWizard());

    // 重置
    $('#reset-btn').addEventListener('click', async () => {
      if (!confirm('确认重置整个世界吗？所有记忆和关系将被清空。')) return;
      try {
        await API.sceneReset(this.sceneId);
        this._eventHistory = [];
        $('#event-panel').innerHTML = '<div class="panel-ev panel-system"><div class="pe-text" style="color:var(--fg-dim)">世界已重置，等待新的事件……</div></div>';
        this._eventsStarted = false;
        const state = await API.sceneState(this.sceneId);
        if (this.renderer) this.renderer.syncAgents(state.agents || []);
      } catch (e) { console.warn('重置失败:', e); }
    });

    // 事件流 filter 切换
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._eventFilter = btn.dataset.filter || 'core';
        this.rerenderEventPanel();
      });
    });

    // 新世界 / 新角色 按钮
    const newSceneBtn = $('#new-scene-btn');
    if (newSceneBtn) newSceneBtn.addEventListener('click', () => this.showWizard());
    const addAgentBtn = $('#add-agent-btn');
    if (addAgentBtn) addAgentBtn.addEventListener('click', () => this.openAddAgentModal());
    const aaClose = $('#add-agent-close');
    if (aaClose) aaClose.addEventListener('click', () => this.closeAddAgentModal());
    const aaSubmit = $('#aa-submit');
    if (aaSubmit) aaSubmit.addEventListener('click', () => this.submitAddAgent());

    // 玩家化身控件
    const pmExit = $('#pm-exit');
    if (pmExit) pmExit.addEventListener('click', (e) => { e.stopPropagation(); this.setAvatar(null); });
    const apSay = $('#ap-say');
    if (apSay) apSay.addEventListener('click', () => this.openPlayerSayModal());
    const apMove = $('#ap-move');
    if (apMove) apMove.addEventListener('click', () => this.openPlayerMoveModal());
    const apWork = $('#ap-work');
    if (apWork) apWork.addEventListener('click', () => this.playerActFast('work'));
    const apRest = $('#ap-rest');
    if (apRest) apRest.addEventListener('click', () => this.playerActFast('rest'));
    const psClose = $('#ps-close');
    if (psClose) psClose.addEventListener('click', () => $('#player-say-modal').classList.add('hidden'));
    const psSubmit = $('#ps-submit');
    if (psSubmit) psSubmit.addEventListener('click', () => {
      this.submitPlayerSay($('#ps-target').value, $('#ps-utterance').value, $('#ps-intent').value);
    });
    const pmCloseM = $('#pm-close');
    if (pmCloseM) pmCloseM.addEventListener('click', () => $('#player-move-modal').classList.add('hidden'));

    // 视图模式切换
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view;
        if (this.renderer) {
          this.renderer.switchViewMode(mode);
          this.updateViewModeButtons(mode);
        }
      });
    });

    // 编年史
    const chBtn = $('#chronicle-btn');
    if (chBtn) chBtn.addEventListener('click', () => this.openChronicle());
    const chClose = $('#chronicle-close');
    if (chClose) chClose.addEventListener('click', () => $('#chronicle-modal').classList.add('hidden'));
    const chCloseB = $('#chronicle-close-btn');
    if (chCloseB) chCloseB.addEventListener('click', () => $('#chronicle-modal').classList.add('hidden'));
    const chRef = $('#chronicle-refresh');
    if (chRef) chRef.addEventListener('click', () => this.openChronicle());

    // 故事结局
    const endingBtn = $('#ending-btn');
    if (endingBtn) endingBtn.addEventListener('click', () => this.openEnding());
    const endingClose = $('#ending-close');
    if (endingClose) endingClose.addEventListener('click', () => $('#ending-modal').classList.add('hidden'));
    const endingCloseBtn = $('#ending-close-btn');
    if (endingCloseBtn) endingCloseBtn.addEventListener('click', () => $('#ending-modal').classList.add('hidden'));
    const endingRefresh = $('#ending-refresh');
    if (endingRefresh) endingRefresh.addEventListener('click', () => this.openEnding());

    // 种子投放
    this._submitSeed = async (text, effect = '') => {
      if (!text || !text.trim() || !this.sceneId) return;
      try {
        // 触发由 SSE handler 统一处理，避免双重
        await API.post(`/api/scenes/${this.sceneId}/seed`, { text: text.trim(), effect });
      } catch (e) { console.warn('种子投放失败:', e); }
      $('#seed-input').value = '';
      setTimeout(() => this.refreshSeedSuggestions(), 200);
    };
    $('#seed-submit').addEventListener('click', () => this._submitSeed($('#seed-input').value));
    $('#seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._submitSeed(e.target.value);
    });
    const refreshSeedsBtn = $('#refresh-seeds-btn');
    if (refreshSeedsBtn) refreshSeedsBtn.addEventListener('click', () => this.refreshSeedSuggestions());

    // 面板关闭
    $('#panel-close').addEventListener('click', () => $('#character-panel').classList.add('hidden'));
    $('#hb-close').addEventListener('click', () => $('#headline-banner').classList.add('hidden'));
  },

  async refreshSeedSuggestions() {
    if (!this.sceneId) return;
    const row = $('#seed-presets');
    if (!row) return;
    try {
      const data = await API.seedSuggestions(this.sceneId, 6);
      const items = data.suggestions || [];
      row.innerHTML = '<span class="seed-hint">为你智能推荐：</span>' + items.map(s =>
        `<button class="pixel-btn sm preset-btn" data-text="${escapeHtml(s.text)}" data-effect="${escapeHtml(s.effect || '')}">${escapeHtml(s.label)}</button>`
      ).join('') + '<button class="pixel-btn sm" id="refresh-now">🔁 换</button><button class="pixel-btn sm" id="custom-seed-btn">+ 自定义</button>';
      row.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => this._submitSeed(btn.dataset.text, btn.dataset.effect));
      });
      const rn = row.querySelector('#refresh-now');
      if (rn) rn.addEventListener('click', () => this.refreshSeedSuggestions());
      const cs = row.querySelector('#custom-seed-btn');
      if (cs) cs.addEventListener('click', () => {
        const text = prompt('描述一个事件（包含人名/地点/天气词都会被解析）');
        if (text) this._submitSeed(text);
      });
    } catch (e) { console.warn('refresh seed suggestions fail:', e); }
  },

  // ====== Add agent 弹窗 ======

  openAddAgentModal() {
    // role 现在是自由文本 input（含 datalist 提示），不用动态填充
    const locSel = $('#aa-location');
    locSel.innerHTML = (this.places.length ? this.places : ['广场'])
      .map(p => `<option>${escapeHtml(p)}</option>`).join('');
    ['aa-name','aa-emoji','aa-persona','aa-voice','aa-thread','aa-thread-target','aa-role']
      .forEach(id => { const el = $('#' + id); if (el) el.value = ''; });
    $('#add-agent-modal').classList.remove('hidden');
    setTimeout(() => $('#aa-name').focus(), 50);
  },

  closeAddAgentModal() {
    $('#add-agent-modal').classList.add('hidden');
  },

  async submitAddAgent() {
    const name = $('#aa-name').value.trim();
    if (!name) { alert('请填写名字'); return; }
    const body = {
      name,
      emoji: $('#aa-emoji').value.trim() || '🙂',
      role: $('#aa-role').value,
      location: $('#aa-location').value,
      persona: $('#aa-persona').value.trim(),
      voice: $('#aa-voice').value.trim(),
    };
    const threadDesc = $('#aa-thread').value.trim();
    if (threadDesc) {
      body.threads = [{
        desc: threadDesc,
        target: $('#aa-thread-target').value.trim() || null,
        weight: 7,
      }];
    }
    try {
      await API.addAgent(this.sceneId, body);
      this.closeAddAgentModal();
      const state = await API.sceneState(this.sceneId);
      if (this.renderer) this.renderer.syncAgents(state.agents || []);
      if (this.renderer && this.renderer.flashAgent) this.renderer.flashAgent(name, 5000);
      await this.refreshSceneTabs();
    } catch (e) {
      alert('投放失败：' + e.message);
    }
  },

  setupRoomNav() {
    $('#room-prev').addEventListener('click', () => {
      if (!this.renderer) return;
      const room = this.renderer.prevRoom();
      $('#room-name').textContent = room;
    });
    $('#room-next').addEventListener('click', () => {
      if (!this.renderer) return;
      const room = this.renderer.nextRoom();
      $('#room-name').textContent = room;
    });

    // 键盘方向键
    document.addEventListener('keydown', (e) => {
      if ($('#simulation-view').classList.contains('hidden')) return;
      if (e.key === 'ArrowLeft' && this.renderer) {
        const room = this.renderer.prevRoom();
        $('#room-name').textContent = room;
      }
      if (e.key === 'ArrowRight' && this.renderer) {
        const room = this.renderer.nextRoom();
        $('#room-name').textContent = room;
      }
    });

    // 初始显示
    if (this.renderer) {
      $('#room-name').textContent = this.renderer.currentRoom;
    }
  },

  updateClock(state) {
    if (state.clock) {
      $('#clock').textContent = `第 ${state.clock.day} 天 ${state.clock.time}`;
    }
    $('#tick-badge').textContent = `tick ${state.tick}`;
  },
};

// ====== 场景创建向导（5 步剧本式） ======

const THEME_PRESET = {
  office: {
    label: '🏢 办公室浮世绘', desc: '裁员前夕的暗流',
    tensionTips: [
      '一个不能见光的办公室恋情',
      '一份被偷拿的方案',
      '一个看穿一切的实习生',
      '一份谁也不愿看到的裁员名单',
    ],
    defaultRoles: ['boss','hr','designer','engineer','salesperson','leader','veteran','intern'],
  },
  campus: {
    label: '🎓 大学暗潮', desc: '保研竞争 · 暗恋 · 室友夜谈',
    tensionTips: [
      '一封作者不明的匿名情书',
      '保研名单泄露',
      '老师和学生不合适的距离',
      '室友的双面人设',
    ],
    defaultRoles: ['leader','engineer','intern','artist','salesperson','hr','boss','child'],
  },
  variety: {
    label: '💋 恋综·海岛之夜', desc: 'CP · 淘汰 · 节目组操控',
    tensionTips: [
      '一个上一季没结束的男嘉宾',
      '节目组偷装的麦克风',
      '一个安插进来的"白月光"演员',
      '今晚必须公开告白的规则',
    ],
    defaultRoles: ['pilot','artist','intern','engineer','salesperson','leader','child','boss'],
  },
  medieval: {
    label: '🏘️ 中世纪小镇', desc: '山谷小镇，火灾的秘密',
    tensionTips: [
      '一场未破的命案',
      '一笔无法兑现的债务',
      '一段不能公开的暗恋',
      '一个外乡人带来的真相',
    ],
    defaultRoles: ['doctor','blacksmith','merchant','artist','innkeeper','farmer','child','elder'],
  },
  space: {
    label: '🚀 深空空间站', desc: '失联47天，氧气告急',
    tensionTips: ['资源即将枯竭', '舰员之间的派系', '舰长的隐瞒', '神秘信号'],
    defaultRoles: ['pilot','scientist','engineer','medic','security','botanist','technician','child'],
  },
  ocean: {
    label: '🌊 深海殖民地', desc: '海底的秘密浮出水面',
    tensionTips: ['压力舱故障', '深海生物入侵', '地表的指令', '殖民地分裂'],
    defaultRoles: ['scientist','engineer','medic','pilot','security','botanist','technician','child'],
  },
  cyberpunk: {
    label: '🌃 赛博朋克之城', desc: '霓虹下的暗影',
    tensionTips: ['公司清洗行动', '黑客联盟的暗号', '一具失踪的躯壳', '记忆植入丑闻'],
    defaultRoles: ['technician','medic','merchant','security','engineer','artist','child','elder'],
  },
};

const ROLE_LABELS = {
  doctor: '医生', medic: '军医/医务', blacksmith: '铁匠', farmer: '农夫',
  merchant: '商人', artist: '艺术家', innkeeper: '酒馆老板', child: '孩子', elder: '长者',
  scientist: '科学家', engineer: '工程师', pilot: '驾驶员', security: '安保',
  technician: '技术员', botanist: '植物学家',
  boss: '老板', hr: 'HR', designer: '设计师', salesperson: '销售',
  leader: '部门主管', veteran: '老员工', intern: '实习生',
};

class SceneWizard {
  constructor(onComplete) {
    this.onComplete = onComplete;
    this.config = {
      theme: 'medieval',
      story_background: '',
      agents: [],
      places: [],
      relations: [],
      seed_events: [],
      scene_id: '',
    };
  }

  init() {
    this.step = 1;
    // 防止多次绑定（用户多次进向导）
    if (!this._navBound) {
      this.bindWizardNav();
      this._navBound = true;
    }
    this.showStep(1);
  }

  bindWizardNav() {
    $('#wiz-next').addEventListener('click', () => {
      if (!this.saveStep()) return;
      if (this.step < 5) { this.step++; this.showStep(this.step); }
      else this.launch();
    });
    $('#wiz-back').addEventListener('click', () => {
      if (this.step > 1) { this.step--; this.showStep(this.step); }
    });
    const exitBtn = $('#wiz-exit-btn');
    if (exitBtn) exitBtn.addEventListener('click', () => {
      if (confirm('放弃当前世界编辑？')) APP.showLanding();
    });
  }

  showStep(n) {
    for (let i = 1; i <= 5; i++) {
      $(`#wiz-step-${i}`).classList.toggle('active', i === n);
    }
    document.querySelectorAll('.wiz-dot').forEach((d, i) => d.classList.toggle('active', i + 1 === n));
    $('#wiz-back').style.display = n > 1 ? '' : 'none';
    $('#wiz-next').textContent = n === 5 ? '🚀 启动世界！' : '下一步 →';

    if (n === 1) this.renderThemeStep();
    if (n === 2) this.renderStoryStep();
    if (n === 3) this.renderAgentStep();
    if (n === 4) this.renderRelationStep();
    if (n === 5) this.renderReviewStep();
  }

  saveStep() {
    if (this.step === 1) {
      const selected = document.querySelector('.theme-option.selected');
      if (selected) this.config.theme = selected.dataset.theme;
    }
    if (this.step === 2) {
      const txt = $('#wiz-story-text').value.trim();
      if (!txt) { alert('请写一段背景故事，哪怕一句话也好'); return false; }
      this.config.story_background = txt;
    }
    if (this.step === 3) {
      if (this.config.agents.length < 2) {
        alert('至少需要 2 个角色');
        return false;
      }
    }
    return true;
  }

  // ====== Step 1: 主题 ======
  renderThemeStep() {
    const themes = Object.entries(THEME_PRESET).map(([id, t]) => ({ id, ...t }));
    const container = $('#wiz-step-1');
    container.innerHTML = `
      <h2>选择世界舞台</h2>
      <div class="theme-grid">
        ${themes.map(t => `
          <div class="theme-option${this.config.theme === t.id ? ' selected' : ''}" data-theme="${t.id}">
            <canvas class="theme-preview" id="preview-${t.id}" width="160" height="100"></canvas>
            <div class="theme-label">${t.label}</div>
            <div style="font-size:11px;color:var(--fg-dim)">${t.desc}</div>
          </div>
        `).join('')}
      </div>`;
    container.querySelectorAll('.theme-option').forEach(el => {
      el.addEventListener('click', () => {
        container.querySelectorAll('.theme-option').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        // 切主题清空 agents/places，下步重新装载
        if (this.config.theme !== el.dataset.theme) {
          this.config.theme = el.dataset.theme;
          this.config.agents = [];
          this.config.places = [];
          this.config.relations = [];
        }
      });
    });
    setTimeout(() => {
      themes.forEach(t => {
        const c = document.getElementById(`preview-${t.id}`);
        if (c) {
          try {
            const places = (t.id === 'medieval') ? ['广场'] :
                           (t.id === 'space') ? ['指挥舱'] :
                           (t.id === 'ocean') ? ['中心广场'] : ['霓虹广场'];
            renderRoom(t.id, places[0], places, c);
          } catch(e) {}
        }
      });
    }, 100);
  }

  // ====== Step 2: 故事背景（含张力提示）======
  renderStoryStep() {
    const tips = (THEME_PRESET[this.config.theme] || {}).tensionTips || [];
    const container = $('#wiz-step-2');
    container.innerHTML = `
      <h2>这个世界发生了什么？</h2>
      <p style="color:var(--fg-dim);font-size:13px">写一段背景故事——它决定了角色们说话和决策的氛围。
        好的故事里有"张力"：未解的谜、不能公开的秘密、即将到来的危机。</p>
      <textarea id="wiz-story-text" rows="6"
        placeholder="举例：一个被遗忘在山谷中的小镇。去年谷仓的一场大火改变了所有人——有人丧生，有人隐瞒真相，有人在灰烬中找到了新的欲望。表面平静的日常下，暗流涌动……">${escapeHtml(this.config.story_background || '')}</textarea>
      <div class="tension-tips">
        <div style="color:var(--gold);font-size:12px;margin:8px 0 4px;">💡 试试加入这些张力：</div>
        ${tips.map(t => `<button class="pixel-btn sm tension-tip" data-tip="${escapeHtml(t)}">+ ${escapeHtml(t)}</button>`).join('')}
      </div>`;
    container.querySelectorAll('.tension-tip').forEach(btn => {
      btn.addEventListener('click', () => {
        const ta = $('#wiz-story-text');
        ta.value = (ta.value.trim() + (ta.value ? '\n' : '') + btn.dataset.tip).slice(0, 800);
        ta.focus();
      });
    });
  }

  // ====== Step 3: 角色编辑器 ======
  renderAgentStep() {
    const container = $('#wiz-step-3');
    container.innerHTML = `<h2>加载角色中…</h2>`;
    if (this.config.agents.length === 0) {
      API.loadTemplate(this.config.theme).then(t => {
        this.config.agents = (t.agents || []).map(a => ({...a}));
        this.config.places = t.places || this.config.places;
        if (t.relations) this.config.relations = t.relations;
        if (!this.config.story_background && t.story_background) {
          this.config.story_background = t.story_background;
        }
        this._renderAgentEditor(container);
      }).catch(() => this._renderAgentEditor(container));
    } else {
      this._renderAgentEditor(container);
    }
  }

  _renderAgentEditor(container) {
    const preset = THEME_PRESET[this.config.theme] || {};
    const roleSuggestionOpts = (preset.defaultRoles || Object.keys(ROLE_LABELS))
      .concat(Object.keys(ROLE_LABELS))
      .filter((v, i, a) => a.indexOf(v) === i)
      .map(r => `<option value="${ROLE_LABELS[r] || r}">`).join('');
    const placeOpts = (this.config.places || []).map(p => `<option>${escapeHtml(p)}</option>`).join('');

    container.innerHTML = `
      <h2>设计角色（${this.config.agents.length} 人）</h2>
      <p style="color:var(--fg-dim);font-size:12px">点击任意一张卡片展开编辑。建议 4-10 人，太少没戏，太多吵杂。<br>
        <b>身份可以随便写</b>——「老板的小三」、「流浪诗人」、「住在 4 楼的猫」都行，LLM 会自己理解。</p>
      <div class="agent-grid" id="wiz-agent-grid">
        ${this.config.agents.map((a, i) => this._agentCardHtml(a, i)).join('')}
      </div>
      <datalist id="wiz-role-suggestions">${roleSuggestionOpts}</datalist>
      <div class="agent-add-row" style="margin-top:12px;">
        <input id="wiz-agent-name" placeholder="名字" style="width:90px">
        <input id="wiz-agent-emoji" placeholder="🙂" style="width:50px" maxlength="4">
        <input id="wiz-agent-role" list="wiz-role-suggestions" placeholder="身份（随便写）" style="width:170px" autocomplete="off">
        <select id="wiz-agent-loc">${placeOpts}</select>
        <button class="pixel-btn sm primary" id="wiz-add-agent">+ 添加角色</button>
      </div>`;

    // 卡片展开/收起
    container.querySelectorAll('.agent-card').forEach(card => {
      const header = card.querySelector('.agent-card-header');
      header.addEventListener('click', () => card.classList.toggle('expanded'));
    });
    // 卡片字段绑定
    container.querySelectorAll('[data-field]').forEach(inp => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.closest('.agent-card').dataset.idx, 10);
        const field = inp.dataset.field;
        if (field === 'goals') {
          this.config.agents[idx][field] = inp.value.split('\n').map(s => s.trim()).filter(Boolean);
        } else if (field === 'thread_desc') {
          if (!this.config.agents[idx].threads || !this.config.agents[idx].threads.length) {
            this.config.agents[idx].threads = [{ desc: '', target: null, weight: 7 }];
          }
          this.config.agents[idx].threads[0].desc = inp.value;
        } else if (field === 'thread_target') {
          if (!this.config.agents[idx].threads || !this.config.agents[idx].threads.length) {
            this.config.agents[idx].threads = [{ desc: '', target: null, weight: 7 }];
          }
          this.config.agents[idx].threads[0].target = inp.value.trim() || null;
        } else {
          this.config.agents[idx][field] = inp.value;
        }
      });
    });
    // 删除按钮
    container.querySelectorAll('.del-agent').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx, 10);
        if (confirm(`删除角色 ${this.config.agents[idx].name}？`)) {
          this.config.agents.splice(idx, 1);
          this._renderAgentEditor(container);
        }
      });
    });
    // 添加角色
    $('#wiz-add-agent').addEventListener('click', () => {
      const name = $('#wiz-agent-name').value.trim();
      if (!name) return;
      const role = $('#wiz-agent-role').value;
      const emoji = $('#wiz-agent-emoji').value.trim() || '🙂';
      const loc = $('#wiz-agent-loc').value || (this.config.places[0] || '广场');
      this.config.agents.push({
        name, role, emoji, location: loc,
        persona: '', voice: '', goals: [],
        color_palette: mergePalette({}, role),
        threads: [],
      });
      this._renderAgentEditor(container);
    });
  }

  _agentCardHtml(a, i) {
    const t = (a.threads && a.threads[0]) || { desc: '', target: '' };
    const placeOpts = (this.config.places || []).map(p =>
      `<option ${p === a.location ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('');
    return `<div class="agent-card" data-idx="${i}">
      <div class="agent-card-header">
        <span class="agent-emoji">${a.emoji || '🙂'}</span>
        <span class="agent-name">${escapeHtml(a.name)}</span>
        <span class="agent-role">${escapeHtml(ROLE_LABELS[a.role] || a.role || '')}</span>
        <span class="agent-loc">📍 ${escapeHtml(a.location || '')}</span>
        <button class="del-agent" data-idx="${i}" title="删除">🗑</button>
        <span class="expand-hint">▼</span>
      </div>
      <div class="agent-card-body">
        <label>Emoji</label>
        <input data-field="emoji" value="${escapeHtml(a.emoji || '')}" maxlength="4">
        <label>身份 / 职业（随便写，LLM 自动理解）</label>
        <input data-field="role" list="wiz-role-suggestions" value="${escapeHtml(a.role || '')}" autocomplete="off" placeholder="如：老板的小三、流浪诗人">
        <label>人物设定（persona）</label>
        <textarea data-field="persona" rows="2">${escapeHtml(a.persona || '')}</textarea>
        <label>说话风格（voice）</label>
        <input data-field="voice" value="${escapeHtml(a.voice || '')}">
        <label>目标（每行一条）</label>
        <textarea data-field="goals" rows="2">${(a.goals || []).join('\n')}</textarea>
        <label>未完结心事（驱动 ta 行动）</label>
        <input data-field="thread_desc" value="${escapeHtml(t.desc || '')}" placeholder="比如：暗中调查火灾真相">
        <label>心事针对的角色</label>
        <input data-field="thread_target" value="${escapeHtml(t.target || '')}" placeholder="留空表示无指定对象">
        <label>初始地点</label>
        <select data-field="location">${placeOpts}</select>
      </div>
    </div>`;
  }

  // ====== Step 4: 关系矩阵 ======
  renderRelationStep() {
    const names = this.config.agents.map(a => a.name);
    const relMap = {};   // {from: {to: {trust,fondness,jealousy,guilt}}}
    for (const r of (this.config.relations || [])) {
      if (!relMap[r.from]) relMap[r.from] = {};
      relMap[r.from][r.to] = r;
    }
    const container = $('#wiz-step-4');
    container.innerHTML = `
      <h2>关系矩阵</h2>
      <p style="color:var(--fg-dim);font-size:12px">手工设几对张力关系（信任/好感/嫉妒/愧疚）—— 数值范围 -10~+10，
        点击格子编辑。这是涌现叙事最重要的"火药桶"。可跳过用默认。</p>
      <div class="rel-matrix-wrap">
        <table class="rel-matrix">
          <thead>
            <tr><th></th>${names.map(n => `<th>${escapeHtml(n)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${names.map(src => `<tr>
              <th>${escapeHtml(src)}</th>
              ${names.map(dst => {
                if (src === dst) return '<td class="rel-self">—</td>';
                const r = (relMap[src] || {})[dst];
                const intensity = r
                  ? (Math.abs(r.trust||0) + Math.abs(r.fondness||0) + Math.abs(r.jealousy||0) + Math.abs(r.guilt||0))
                  : 0;
                const hot = intensity >= 5 ? 'rel-hot' : intensity > 0 ? 'rel-mild' : '';
                const label = r ? `t${r.trust>=0?'+':''}${r.trust||0}\nf${r.fondness>=0?'+':''}${r.fondness||0}` : '·';
                return `<td class="rel-cell ${hot}" data-src="${escapeHtml(src)}" data-dst="${escapeHtml(dst)}">${escapeHtml(label).replace(/\n/g,'<br>')}</td>`;
              }).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div id="rel-editor" class="hidden">
        <h4>编辑 <b id="rel-edit-src"></b> → <b id="rel-edit-dst"></b></h4>
        <div class="rel-edit-row">
          <label>信任 trust</label><input type="number" id="rel-trust" min="-10" max="10" value="0" step="1">
        </div>
        <div class="rel-edit-row">
          <label>好感 fondness</label><input type="number" id="rel-fondness" min="-10" max="10" value="0" step="1">
        </div>
        <div class="rel-edit-row">
          <label>嫉妒 jealousy</label><input type="number" id="rel-jealousy" min="-10" max="10" value="0" step="1">
        </div>
        <div class="rel-edit-row">
          <label>愧疚 guilt</label><input type="number" id="rel-guilt" min="-10" max="10" value="0" step="1">
        </div>
        <div style="margin-top:8px;">
          <button class="pixel-btn primary sm" id="rel-save">保存</button>
          <button class="pixel-btn sm" id="rel-clear">清零</button>
        </div>
      </div>`;

    container.querySelectorAll('.rel-cell').forEach(td => {
      td.addEventListener('click', () => this._openRelEdit(td.dataset.src, td.dataset.dst));
    });
  }

  _openRelEdit(src, dst) {
    const r = (this.config.relations || []).find(x => x.from === src && x.to === dst)
      || { from: src, to: dst, trust: 0, fondness: 0, jealousy: 0, guilt: 0 };
    $('#rel-edit-src').textContent = src;
    $('#rel-edit-dst').textContent = dst;
    $('#rel-trust').value = r.trust || 0;
    $('#rel-fondness').value = r.fondness || 0;
    $('#rel-jealousy').value = r.jealousy || 0;
    $('#rel-guilt').value = r.guilt || 0;
    $('#rel-editor').classList.remove('hidden');
    $('#rel-save').onclick = () => {
      const newR = {
        from: src, to: dst,
        trust: parseInt($('#rel-trust').value, 10) || 0,
        fondness: parseInt($('#rel-fondness').value, 10) || 0,
        jealousy: parseInt($('#rel-jealousy').value, 10) || 0,
        guilt: parseInt($('#rel-guilt').value, 10) || 0,
      };
      this.config.relations = (this.config.relations || []).filter(x => !(x.from === src && x.to === dst));
      this.config.relations.push(newR);
      this.renderRelationStep();
    };
    $('#rel-clear').onclick = () => {
      this.config.relations = (this.config.relations || []).filter(x => !(x.from === src && x.to === dst));
      this.renderRelationStep();
    };
  }

  // ====== Step 5: 预览 + 启动 ======
  renderReviewStep() {
    const container = $('#wiz-step-5');
    const themeLabel = (THEME_PRESET[this.config.theme] || {}).label || this.config.theme;
    const agentList = this.config.agents.map(a =>
      `<span class="review-chip">${a.emoji || '🙂'} ${escapeHtml(a.name)}</span>`).join('');
    const relCount = (this.config.relations || []).length;
    container.innerHTML = `
      <h2>世界即将启动</h2>
      <div class="review-card">
        <div><b>主题：</b>${escapeHtml(themeLabel)}</div>
        <div><b>背景：</b><div class="review-bg">${escapeHtml(this.config.story_background)}</div></div>
        <div><b>地点（${(this.config.places || []).length}）：</b>${(this.config.places || []).map(escapeHtml).join('、') || '—'}</div>
        <div><b>角色（${this.config.agents.length}）：</b><div class="review-agents">${agentList}</div></div>
        <div><b>关系网：</b>${relCount} 条设定关系</div>
      </div>
      <p style="color:var(--gold);margin-top:16px;text-align:center;font-size:14px;">
        ✨ 准备好了。点击下方按钮，让他们活过来。
      </p>`;
  }

  launch() {
    this.config.scene_id = `custom_${Date.now()}`;
    this.onComplete(this.config);
  }
}

// ====== 工具函数 ======

function $$(sel) { return document.querySelectorAll(sel); }

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ====== 启动 ======

document.addEventListener('DOMContentLoaded', () => APP.init());
