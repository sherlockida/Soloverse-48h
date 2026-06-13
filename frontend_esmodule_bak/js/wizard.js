// EchoWorld — wizard.js — SceneWizard class + THEME_PRESET + ROLE_LABELS
// Imports shared utilities from app.js. Exports SceneWizard, THEME_PRESET, ROLE_LABELS.

import { $, escapeHtml } from './app.js';
import { API } from './api.js';
import { renderRoom } from './renderer/room.js';
import { mergePalette } from './renderer/sprite_palettes.js';

// ====== Theme presets ======

export const THEME_PRESET = {
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

// ====== Role labels ======

export const ROLE_LABELS = {
  doctor: '医生', medic: '军医/医务', blacksmith: '铁匠', farmer: '农夫',
  merchant: '商人', artist: '艺术家', innkeeper: '酒馆老板', child: '孩子', elder: '长者',
  scientist: '科学家', engineer: '工程师', pilot: '驾驶员', security: '安保',
  technician: '技术员', botanist: '植物学家',
  boss: '老板', hr: 'HR', designer: '设计师', salesperson: '销售',
  leader: '部门主管', veteran: '老员工', intern: '实习生',
};

// ====== Scene Wizard class ======

export class SceneWizard {
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
      if (confirm('放弃当前世界编辑？')) window.APP.showLanding();
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

  // ====== Step 1: Theme ======
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

  // ====== Step 2: Story background ======
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

  // ====== Step 3: Agent editor ======
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

    // Card expand/collapse
    container.querySelectorAll('.agent-card').forEach(card => {
      const header = card.querySelector('.agent-card-header');
      header.addEventListener('click', () => card.classList.toggle('expanded'));
    });
    // Card field bindings
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
    // Delete button
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
    // Add agent
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

  // ====== Step 4: Relation matrix ======
  renderRelationStep() {
    const names = this.config.agents.map(a => a.name);
    const relMap = {};
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

  // ====== Step 5: Review + launch ======
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
