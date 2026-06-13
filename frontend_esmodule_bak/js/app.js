// EchoWorld — app.js — APP core: init, landing, simulation launch, SSE dispatch, boot logic
// Shared utilities exported for other modules.

import { API } from './api.js';
import { SSEConnection } from './sse.js';
import { CanvasEngine, SceneRenderer } from './renderer/renderer.js';
import { renderRoom } from './renderer/room.js';
import { ROOM_COLS, ROOM_ROWS, TILE } from './renderer/room_layouts.js';
import { SceneWizard } from './wizard.js';

// ====== Shared utilities (exported) ======

export const $ = (sel) => document.querySelector(sel);

export function $$(sel) { return document.querySelectorAll(sel); }

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ====== APP singleton ======

export const APP = {
  sceneId: null,
  engine: null,
  renderer: null,
  sse: null,
  currentSpeed: 1,
  places: [],
  theme: 'medieval',
  _eventsStarted: false,
  _eventHistory: [],
  _eventFilter: 'core',
  _highlightAgents: new Set(),
  playerAvatar: null,
  _agentsCache: [],
  _currentPanelAgent: null,
  wizard: null,

  // ====== v5 thought-stream state ======
  _thoughts: [],
  _thoughtsByAgent: {},
  _plans: {},
  _recalls: [],
  _tsTab: 'thoughts',
  _tsCollapsed: true,
  _tsUnread: 0,
  _hotAgents: new Set(),
  _currentProvider: null,
  _llmStats: { calls: 0, tokens: 0 },

  // ====== pace track: event throttle + player seed sticky ======
  _renderQ: [],
  _renderQTimer: null,
  _appendStamps: [],
  _thoughtRenderPending: false,
  _seedStickyCards: [],
  _windowBlurBound: false,

  // ====== tool-use track ======
  _toolStats: { total: 0, ok: 0, fail: 0, latency_sum_ms: 0, by_tool: {} },
  _lastToolByAgent: {},

  // Misc timers / refs
  _heroEngine: null,
  _heroRenderer: null,
  _heroInterval: null,
  _rosterPollTimer: null,
  _avatarPollTimer: null,
  _rippleTimer: null,
  _hbTimer: null,

  async init() {
    this.bindGlobalControls();
    await this.showLanding();
  },

  // ====== Landing ======

  async showLanding() {
    $('#simulation-view').classList.add('hidden');
    $('#landing-view').classList.remove('hidden');
    $('#wizard-view').classList.add('hidden');
    if (this.sse) { this.sse.disconnect(); this.sse = null; }
    this.stopAvatarPoll && this.stopAvatarPoll();
    this.stopRosterPoll && this.stopRosterPoll();
    if (this._renderQTimer) { clearInterval(this._renderQTimer); this._renderQTimer = null; }
    this._renderQ.length = 0;
    this._appendStamps = [];
    this._clearSeedSticky && this._clearSeedSticky();
    this.sceneId = null;
    this.playerAvatar = null;

    $$('.theme-card').forEach(card => {
      if (card._bound) return;
      card._bound = true;
      card.addEventListener('click', () => {
        const theme = card.dataset.theme;
        this.quickStart(theme);
      });
    });

    this.renderLandingPreviews();
    this.startHeroLoop();
  },

  renderLandingPreviews() {
    const themes = [
      ['office', '工位区', 'office'],
      ['campus', '工位区', 'office'],
      ['variety', '中心广场', 'ocean'],
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
    const phrases = [
      '今天的天气不错。', '你听说了吗？', '我有事告诉你。',
      '别再问我那件事。', '我知道是谁干的。',
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
      if (Math.random() < 0.25 && s.bubble == null) {
        s.say(phrases[Math.floor(Math.random() * phrases.length)]);
      }
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

  // ====== Wizard ======

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

  // ====== Launch simulation ======

  async launchSimulation() {
    $('#landing-view').classList.add('hidden');
    $('#wizard-view').classList.add('hidden');
    $('#simulation-view').classList.remove('hidden');

    const state = await API.sceneState(this.sceneId);
    this.places = state.places || [];
    this.theme = state.theme || 'medieval';

    const canvas = $('#game-canvas');
    canvas.width = ROOM_COLS * TILE;
    canvas.height = ROOM_ROWS * TILE;

    if (this.engine) this.engine.stop();
    this.engine = new CanvasEngine(canvas);
    this.renderer = new SceneRenderer(this.engine, this.theme, this.places);
    this.engine.start();

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

    if (this.sse) this.sse.disconnect();
    this.sse = new SSEConnection(this.sceneId);
    this.sse.onEvent(ev => this.handleSSEEvent(ev));
    this.sse.connect();
    this._eventsStarted = false;
    this._eventHistory = [];
    $('#event-panel').innerHTML = '<div class="panel-ev panel-system"><div class="pe-text" style="color:var(--fg-dim)">等待事件发生……</div></div>';

    this._clearSeedSticky();
    this._appendStamps = [];
    this._renderQ.length = 0;
    if (this._renderQTimer) clearInterval(this._renderQTimer);
    this._renderQTimer = setInterval(() => this._drainRenderQueue(2), 250);
    if (!this._windowBlurBound) {
      window.addEventListener('blur', () => this._flushRenderQueue());
      this._windowBlurBound = true;
    }

    this._thoughts = [];
    this._thoughtsByAgent = {};
    this._plans = {};
    this._recalls = [];
    this._tsUnread = 0;
    this._toolStats = { total: 0, ok: 0, fail: 0, latency_sum_ms: 0, by_tool: {} };
    this._lastToolByAgent = {};
    this._recomputeHotAgents();
    this.bindThoughtPanelToggle();
    this.bindCanvasHoverTip();
    this.renderThoughtsTab();
    this.renderPlansTab();
    this.renderRecallsTab();
    this._updateUnreadBadge();

    if (!canvas._clickBound) {
      canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
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

    this.setupRoomNav();
    await this.refreshSceneTabs();
  },

  // ====== Multi-scene tabs ======

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

  // ====== SSE dispatch ======

  handleSSEEvent(ev) {
    const r = this.renderer;
    if (!r) return;

    // v5.1: LLM HUD
    if (ev && ev.token_used && ev.token_used > 0) {
      this._llmStats.calls += 1;
      this._llmStats.tokens += ev.token_used;
      const provider = ev.payload && ev.payload.usage && ev.payload.usage.provider;
      if (provider && provider !== 'mock' && provider !== 'none') {
        this._currentProvider = provider;
      }
      this._renderLlmHud();
    }

    if (!this._eventsStarted && ev.kind !== 'tick_marker') {
      this._eventsStarted = true;
      const panel = $('#event-panel');
      const placeholder = panel.querySelector('.panel-system');
      if (placeholder) placeholder.remove();
    }

    switch (ev.kind) {
      case 'tick_marker':
        if (ev.payload && ev.payload.day != null) {
          $('#clock').textContent = `第 ${ev.payload.day} 天 ${ev.payload.time}`;
        }
        $('#tick-badge').textContent = `tick ${ev.tick}`;
        return;

      case 'move':
        if (ev.payload && ev.payload.to) r.moveAgent(ev.actor, ev.payload.to);
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
        const affected = ev.payload?.affected || [];
        const fromPlayer = (ev.payload?.source === 'player');
        this.flashSeedImpact(affected, fromPlayer ? 3000 : 4000);
        const fx = ev.payload?.effects || [];
        if (fx.length && r.triggerEffect) fx.forEach(e => r.triggerEffect(e, 10000));
        if (fromPlayer) {
          this.showSeedSticky(ev, true);
          this._pulseRosterFor(affected);
        }
        break;
      }

      case 'world_state_change': {
        const p = ev.payload || {};
        const actor = p.actor || ev.actor || '';
        const affected = p.affected || (actor ? [actor] : []);
        this.flashSeedImpact(affected.length ? affected : [actor], 4500);
        if (this._pulseRosterFor) this._pulseRosterFor(affected.length ? affected : [actor]);
        try {
          this.showSeedSticky(ev, true);
          requestAnimationFrame(() => {
            const sc = $('#seed-sticky');
            const first = sc && sc.firstChild;
            if (first && first.classList) first.classList.add('is-shock');
          });
        } catch (e) { /* ignore */ }
        try {
          if (this._refreshRosterNow) this._refreshRosterNow();
        } catch (e) { /* ignore */ }
        break;
      }

      case 'thought':
        this.ingestThought(ev);
        if (r.setAgentActivity) r.setAgentActivity(ev.actor, 'work');
        if (this._eventFilter !== 'thought' && !this._isHotOrAvatar(ev.actor)) return;
        break;

      case 'tool_call':
        this.ingestToolCall(ev);
        return;

      case 'plan_update':
      case 'plan_updated':
        this.ingestPlanUpdate(ev);
        return;

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

    this._eventHistory.push(ev);
    if (this._eventHistory.length > 200) this._eventHistory.shift();
    if (this.passesFilter(ev)) {
      if (this._isHighPriorityKind(ev.kind) || !this._isOverAppendRate()) {
        this.appendPanelEvent(ev.kind, ev);
      } else {
        this._renderQ.push(ev);
        if (this._renderQ.length > 60) this._renderQ.shift();
      }
    }
  },

  // ====== Pace track helpers ======

  _isHighPriorityKind(kind) {
    return ['narrative','seed','system','provider_switch','belief_formed','reflect','world_state_change'].includes(kind);
  },

  _isOverAppendRate() {
    const now = Date.now();
    const cutoff = now - 1000;
    this._appendStamps = this._appendStamps.filter(t => t > cutoff);
    return this._appendStamps.length >= 6;
  },

  _drainRenderQueue(max = 2) {
    if (!this._renderQ.length) return;
    const batch = this._renderQ.splice(0, max);
    for (const ev of batch) {
      if (!this.passesFilter(ev)) continue;
      this.appendPanelEvent(ev.kind, ev, /*skipHistoryPush=*/true);
    }
  },

  _flushRenderQueue() {
    if (!this._renderQ.length) return;
    const all = this._renderQ.splice(0, this._renderQ.length);
    for (const ev of all) {
      if (!this.passesFilter(ev)) continue;
      this.appendPanelEvent(ev.kind, ev, /*skipHistoryPush=*/true);
    }
  },

  _isHotOrAvatar(name) {
    if (!name) return false;
    if (this.playerAvatar === name) return true;
    return this._hotAgents.has(name);
  },

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

  // ====== Thought ingest (data only; render in thought-stream.js) ======

  ingestThought(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    let trace = p.trace || p.reasoning_trace || [];
    if (typeof trace === 'string') trace = [trace];
    const text = (trace[0] || ev.text || '……').toString();
    const usage = p.usage || {};
    const rec = {
      tick: ev.tick, agent,
      emoji: this._emojiOf(agent), kind: 'thought', text, trace,
      token_used: ev.token_used || 0,
      provider: usage.provider || (ev.token_used > 0 ? this._currentProvider : 'mock'),
      ts: Date.now(),
    };
    this._pushThought(rec);
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
    const ok = result && typeof result === 'object' ? (result.ok !== false) : true;
    const argsStr = this._briefArgs(args);
    const rec = {
      tick: ev.tick, agent,
      emoji: this._emojiOf(agent), kind: 'tool',
      text: `🔧 ${tool}(${argsStr})${brief ? ' → ' + brief : ''}`,
      tool, args, brief, result, latency_ms: latency,
      parent_thought: parent, source: p.source || 'local', ok,
      ts: Date.now(),
    };
    this._pushThought(rec);
    this._updateToolStats(tool, ok, latency);
    this._lastToolByAgent[agent] = { tool, latency_ms: latency, ok, tick: ev.tick };
    if (!this._tsCollapsed && this._tsTab === 'thoughts') this._renderToolStatsBar();
    this.renderRoster();
  },

  ingestPlanUpdate(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    this._plans[agent] = {
      goal: p.goal || '', steps: p.steps || [],
      diff: p.diff || null, updated_tick: ev.tick,
    };
    const diffNote = p.diff ? ` (${p.diff})` : '';
    this._pushThought({
      tick: ev.tick, agent,
      emoji: this._emojiOf(agent), kind: 'plan',
      text: `📋 新计划：${p.goal || '(无目标)'}${diffNote}`,
      goal: p.goal, steps: p.steps, ts: Date.now(),
    });
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
      tick: ev.tick, agent,
      emoji: this._emojiOf(agent), kind: 'reflect',
      text: `🪞 反思：${summary.join(' · ') || '一切照旧'}`,
      payload: p, ts: Date.now(),
    });
  },

  ingestRecall(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    this._recalls.unshift({
      tick: ev.tick, agent,
      query: p.query || '', hits: p.hits || [], ts: Date.now(),
    });
    if (this._recalls.length > 30) this._recalls.length = 30;
    if (this._tsTab === 'recalls') this.renderRecallsTab();
  },

  ingestBelief(ev) {
    const p = ev.payload || {};
    const agent = ev.actor || p.agent || '?';
    this._pushThought({
      tick: ev.tick, agent,
      emoji: this._emojiOf(agent), kind: 'belief',
      text: `🧩 形成印象：${p.target || '?'} → ${p.belief || ''}`,
      ts: Date.now(),
    });
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
    this._renderLlmHud(/*flashProvider*/ true);
    this._pushThought({
      tick: ev.tick || 0, agent: 'system', emoji: '⚙️', kind: 'provider',
      text: `LLM provider 切换：${from} → ${to}${reason ? '（' + reason + '）' : ''}`,
      ts: Date.now(),
    });
  },

  // ====== LLM HUD ======

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

  // ====== Thought push helpers ======

  _pushThought(rec) {
    this._thoughts.unshift(rec);
    if (this._thoughts.length > 50) this._thoughts.length = 50;
    if (this._tsTab === 'thoughts') this._scheduleThoughtsRender();
    if (this._tsCollapsed) { this._tsUnread++; this._updateUnreadBadge(); }
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

  _updateToolStats(tool, ok, latency) {
    const s = this._toolStats;
    s.total += 1;
    if (ok) s.ok += 1; else s.fail += 1;
    s.latency_sum_ms += Math.max(0, latency || 0);
    if (!s.by_tool[tool]) s.by_tool[tool] = { n: 0, ok: 0 };
    s.by_tool[tool].n += 1;
    if (ok) s.by_tool[tool].ok += 1;
  },

  _toolIcon(tool) {
    return ({ observe:'🔍', recall:'💭', introspect:'🪞', plan:'📋', talk:'💬', move:'🚶', work:'🔧' })[tool] || '🔧';
  },

  // ====== Thought panel toggle / switch ======

  toggleThoughtStream(forceOpen = null) {
    const panel = $('#thought-stream');
    if (!panel) return;
    const willCollapse = forceOpen === null ? !this._tsCollapsed : !forceOpen;
    this._tsCollapsed = willCollapse;
    panel.classList.toggle('collapsed', willCollapse);
    if (!willCollapse) {
      this._tsUnread = 0;
      this._updateUnreadBadge();
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
      toggle.addEventListener('click', (e) => { e.stopPropagation(); this.toggleThoughtStream(); });
    }
    if (close && !close._bound) {
      close._bound = true;
      close.addEventListener('click', (e) => { e.stopPropagation(); this.toggleThoughtStream(false); });
    }
    document.querySelectorAll('.ts-tab').forEach(b => {
      if (b._bound) return;
      b._bound = true;
      b.addEventListener('click', () => this.switchThoughtTab(b.dataset.tsTab));
    });
  },

  bindCanvasHoverTip() {
    const canvas = $('#game-canvas');
    const tip = $('#sprite-thought-tip');
    if (!canvas || !tip || canvas._hoverBound) return;
    canvas._hoverBound = true;
    canvas.addEventListener('mousemove', (e) => {
      if (!this.renderer || this.renderer.viewMode !== 'focus') { tip.classList.add('hidden'); return; }
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top) * (canvas.height / rect.height);
      const name = this.renderer.getCharacterAt(sx, sy);
      if (!name) { tip.classList.add('hidden'); return; }
      const th = this._thoughtsByAgent[name];
      if (!th) { tip.classList.add('hidden'); return; }
      const emoji = this._emojiOf(name);
      tip.innerHTML = `<div class="stt-head">${emoji} <b>${escapeHtml(name)}</b> <span class="stt-tick">t${th.tick}</span></div>
        <div class="stt-text">💭 ${escapeHtml(th.text)}</div>`;
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
      tip.classList.remove('hidden');
    });
    canvas.addEventListener('mouseleave', () => tip.classList.add('hidden'));
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

  // ====== Event filter ======

  isCoreEvent(ev) {
    if (['narrative','seed','system','world_state_change'].includes(ev.kind)) return true;
    if (ev.kind === 'talk') {
      const d = ev.payload?.relation_delta;
      if (!d) return false;
      const sum = Math.abs(d.trust||0) + Math.abs(d.fondness||0) + Math.abs(d.jealousy||0) + Math.abs(d.guilt||0);
      return sum >= 4;
    }
    return false;
  },

  passesFilter(ev) {
    if (this._eventFilter === 'all') return true;
    if (this._eventFilter === 'thought') {
      if (['thought','reflect','belief_formed','tool_call'].includes(ev.kind)) return true;
      if (ev.kind === 'talk' && this._isHotOrAvatar(ev.actor)) return true;
      return false;
    }
    if (ev.kind === 'thought') return this._isHotOrAvatar(ev.actor);
    return this.isCoreEvent(ev);
  },

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
    for (const ev of filtered) {
      this.appendPanelEvent(ev.kind, ev, /*skipHistoryPush=*/true);
    }
  },

  // ====== Headline banner ======

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

  // ====== Player mode badge ======

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

  updateViewModeButtons(mode) {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
  },

  // ====== Room nav ======

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
    if (this.renderer) $('#room-name').textContent = this.renderer.currentRoom;
  },

  updateClock(state) {
    if (state.clock) $('#clock').textContent = `第 ${state.clock.day} 天 ${state.clock.time}`;
    $('#tick-badge').textContent = `tick ${state.tick}`;
  },

  // ====== Global controls ======

  bindGlobalControls() {
    $$('.speed-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        $$('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const factor = parseFloat(btn.dataset.speed);
        this.currentSpeed = factor;
        try {
          if (this.sceneId && this.sceneId !== 'default') await API.sceneSpeed(this.sceneId, factor);
          else await API.setSpeed(factor);
        } catch (e) { console.warn('调速失败:', e); }
      });
    });

    $('#custom-btn').addEventListener('click', () => this.showWizard());

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

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._eventFilter = btn.dataset.filter || 'core';
        this.rerenderEventPanel();
      });
    });

    const newSceneBtn = $('#new-scene-btn');
    if (newSceneBtn) newSceneBtn.addEventListener('click', () => this.showWizard());
    const addAgentBtn = $('#add-agent-btn');
    if (addAgentBtn) addAgentBtn.addEventListener('click', () => this.openAddAgentModal());
    const aaClose = $('#add-agent-close');
    if (aaClose) aaClose.addEventListener('click', () => this.closeAddAgentModal());
    const aaSubmit = $('#aa-submit');
    if (aaSubmit) aaSubmit.addEventListener('click', () => this.submitAddAgent());

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

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.view;
        if (this.renderer) { this.renderer.switchViewMode(mode); this.updateViewModeButtons(mode); }
      });
    });

    const chBtn = $('#chronicle-btn');
    if (chBtn) chBtn.addEventListener('click', () => this.openChronicle());
    const chClose = $('#chronicle-close');
    if (chClose) chClose.addEventListener('click', () => $('#chronicle-modal').classList.add('hidden'));
    const chCloseB = $('#chronicle-close-btn');
    if (chCloseB) chCloseB.addEventListener('click', () => $('#chronicle-modal').classList.add('hidden'));
    const chRef = $('#chronicle-refresh');
    if (chRef) chRef.addEventListener('click', () => this.openChronicle());

    const endingBtn = $('#ending-btn');
    if (endingBtn) endingBtn.addEventListener('click', () => this.openEnding());
    const endingClose = $('#ending-close');
    if (endingClose) endingClose.addEventListener('click', () => $('#ending-modal').classList.add('hidden'));
    const endingCloseBtn = $('#ending-close-btn');
    if (endingCloseBtn) endingCloseBtn.addEventListener('click', () => $('#ending-modal').classList.add('hidden'));
    const endingRefresh = $('#ending-refresh');
    if (endingRefresh) endingRefresh.addEventListener('click', () => this.openEnding());

    this._submitSeed = async (text, effect = '') => {
      if (!text || !text.trim() || !this.sceneId) return;
      try {
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

  // ====== Add agent modal ======

  openAddAgentModal() {
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
      body.threads = [{ desc: threadDesc, target: $('#aa-thread-target').value.trim() || null, weight: 7 }];
    }
    try {
      await API.addAgent(this.sceneId, body);
      this.closeAddAgentModal();
      const state = await API.sceneState(this.sceneId);
      if (this.renderer) this.renderer.syncAgents(state.agents || []);
      if (this.renderer && this.renderer.flashAgent) this.renderer.flashAgent(name, 5000);
      await this.refreshSceneTabs();
    } catch (e) { alert('投放失败：' + e.message); }
  },

  // ====== Chronicle ======

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
    } catch (e) { $('#chronicle-body').innerHTML = '加载失败：' + e.message; }
  },

  // ====== Ending ======

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
    } catch (err) { $('#ending-body').innerHTML = '生成失败：' + err.message; }
  },
};

// ====== Boot ======
document.addEventListener('DOMContentLoaded', () => APP.init());
