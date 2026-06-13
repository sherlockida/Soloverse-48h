// EchoWorld — character-panel.js — character detail panel + player controls (avatar, say, move)
// Imports shared utilities from app.js, patches methods onto APP.

import { $, escapeHtml, APP } from './app.js';
import { API } from './api.js';

// ====== Show character panel (load from API) ======

export async function showCharacterPanel(name) {
  const panel = $('#character-panel');
  panel.classList.remove('hidden');
  $('#panel-name').textContent = name;
  $('#panel-body').innerHTML = '加载中……';
  try {
    const a = await API.sceneAgent(APP.sceneId, name);
    renderCharacterPanel(a);
  } catch (e) {
    $('#panel-body').textContent = '加载失败';
  }
}

// ====== Render character panel detail ======

export function renderCharacterPanel(a) {
  APP._currentPanelAgent = a;
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

  const isMe = APP.playerAvatar === a.name;
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
  if (editBtn) editBtn.addEventListener('click', () => renderCharacterEditor(a));
  const avBtn = $('#char-avatar-btn');
  if (avBtn) avBtn.addEventListener('click', () => APP.setAvatar(a.name));
  const avExit = $('#char-avatar-exit');
  if (avExit) avExit.addEventListener('click', () => APP.setAvatar(null));
}

// ====== Character editor ======

export function renderCharacterEditor(a) {
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
  $('#ce-cancel').addEventListener('click', () => renderCharacterPanel(a));
  $('#ce-save').addEventListener('click', () => saveCharacterEdit(a.name));
}

// ====== Save character edit ======

export async function saveCharacterEdit(name) {
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
    const res = await API.patchAgent(APP.sceneId, name, body);
    if (APP.renderer && APP.renderer.sprites[name]) {
      delete APP.renderer.sprites[name];
      const state = await API.sceneState(APP.sceneId);
      APP.renderer.syncAgents(state.agents || []);
    }
    renderCharacterPanel(res.agent);
  } catch (e) {
    alert('保存失败：' + e.message);
  }
}

// ====== Set avatar ======

export async function setAvatar(name) {
  try {
    const r = await API.setAvatar(APP.sceneId, name);
    APP.playerAvatar = r.player_avatar || null;
    const state = await API.sceneState(APP.sceneId);
    APP._agentsCache = state.agents || [];
    APP.updatePlayerModeBadge();
    if (APP.renderer && APP.renderer.setAvatarName) {
      APP.renderer.setAvatarName(APP.playerAvatar);
    }
    if (APP.playerAvatar && APP.renderer && APP.renderer.flashAgent) {
      APP.renderer.flashAgent(APP.playerAvatar, 3000);
    }
    const panel = $('#character-panel');
    if (panel && !panel.classList.contains('hidden') && APP._currentPanelAgent) {
      const me = APP._agentsCache.find(x => x.name === APP._currentPanelAgent.name);
      if (me) renderCharacterPanel(me);
    }
  } catch (e) {
    alert('切换身份失败：' + e.message);
  }
}

// ====== Avatar poll (refresh panel when avatar) ======

export function startAvatarPoll() {
  if (APP._avatarPollTimer) return;
  APP._avatarPollTimer = setInterval(async () => {
    if (!APP.playerAvatar) return;
    try {
      const state = await API.sceneState(APP.sceneId);
      APP._agentsCache = state.agents || [];
      refreshAvatarPanel();
    } catch (e) { /* ignore */ }
  }, 4000);
}

export function stopAvatarPoll() {
  if (APP._avatarPollTimer) { clearInterval(APP._avatarPollTimer); APP._avatarPollTimer = null; }
}

// ====== Avatar panel refresh ======

export function refreshAvatarPanel() {
  if (!APP.playerAvatar) return;
  const me = APP._agentsCache.find(a => a.name === APP.playerAvatar);
  if (!me) return;
  $('#ap-me-icon').textContent = me.emoji || '🙂';
  $('#ap-me-name').textContent = me.name;
  $('#ap-me-loc').textContent = me.location || '—';

  const bold = suggestBoldActions(me);
  const row = $('#ap-bold-row');
  row.innerHTML = bold.map(b =>
    `<button class="pixel-btn sm bold-btn" data-target="${escapeHtml(b.target)}" data-utterance="${escapeHtml(b.utterance)}" data-intent="${escapeHtml(b.intent)}">${escapeHtml(b.label)}</button>`
  ).join('');
  row.querySelectorAll('.bold-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      submitPlayerSay(btn.dataset.target, btn.dataset.utterance, btn.dataset.intent);
    });
  });
}

// ====== Suggest bold actions based on relationship matrix ======

function suggestBoldActions(me) {
  const out = [];
  const others = APP._agentsCache.filter(a => a.name !== me.name);
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
  const seen = new Set();
  return out.filter(x => {
    const k = x.target + x.label;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

// ====== Player say modal ======

export async function openPlayerSayModal(presetTarget = '', presetUtterance = '', presetIntent = '玩家发言') {
  if (!APP.playerAvatar) return;
  const me = APP._agentsCache.find(a => a.name === APP.playerAvatar);
  if (!me) return;
  const nearbyAll = APP._agentsCache.filter(a => a.location === me.location && a.name !== me.name);
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

  const quickRow = $('#ps-quick-row');
  const QUICKS = ['嗨。', '你今天怎么样？', '我有事要跟你说。', '你听说了吗？', '我不同意。', '别这样。', '我想一个人静静。'];
  quickRow.innerHTML = '<div class="ps-q-label">快速台词：</div>' +
    QUICKS.map(q => `<button class="pixel-btn sm ps-quick" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
  quickRow.querySelectorAll('.ps-quick').forEach(b => b.addEventListener('click', () => { $('#ps-utterance').value = b.dataset.q; }));

  $('#player-say-modal').classList.remove('hidden');
  setTimeout(() => $('#ps-utterance').focus(), 50);
}

export async function submitPlayerSay(target, utterance, intent) {
  if (!target || !utterance.trim()) return;
  try {
    await API.playerSay(APP.sceneId, target, utterance.trim(), intent || '玩家发言');
    $('#player-say-modal').classList.add('hidden');
  } catch (e) {
    alert('说话失败：' + e.message);
  }
}

// ====== Player move modal ======

export async function openPlayerMoveModal() {
  if (!APP.playerAvatar) return;
  const list = $('#pm-place-list');
  const me = APP._agentsCache.find(a => a.name === APP.playerAvatar);
  list.innerHTML = (APP.places || []).map(p => {
    const here = me && me.location === p ? '<span class="here-tag">这里</span>' : '';
    const ppl = APP._agentsCache.filter(a => a.location === p && a.name !== APP.playerAvatar);
    const others = ppl.length ? `（${ppl.map(a => (a.emoji || '') + a.name).join('、')}）` : '（空）';
    return `<button class="pixel-btn place-pick" data-place="${escapeHtml(p)}">${escapeHtml(p)} ${others} ${here}</button>`;
  }).join('');
  list.querySelectorAll('.place-pick').forEach(b => b.addEventListener('click', async () => {
    try {
      await API.playerMove(APP.sceneId, b.dataset.place);
      $('#player-move-modal').classList.add('hidden');
    } catch (e) {
      alert('移动失败：' + e.message);
    }
  }));
  $('#player-move-modal').classList.remove('hidden');
}

// ====== Player fast action ======

export async function playerActFast(kind) {
  try {
    await API.playerAct(APP.sceneId, kind);
  } catch (e) { alert('操作失败：' + e.message); }
}

// ====== Patch onto APP ======

APP.showCharacterPanel = showCharacterPanel;
APP.renderCharacterPanel = renderCharacterPanel;
APP.renderCharacterEditor = renderCharacterEditor;
APP.saveCharacterEdit = saveCharacterEdit;
APP.setAvatar = setAvatar;
APP.startAvatarPoll = startAvatarPoll;
APP.stopAvatarPoll = stopAvatarPoll;
APP.refreshAvatarPanel = refreshAvatarPanel;
APP.openPlayerSayModal = openPlayerSayModal;
APP.submitPlayerSay = submitPlayerSay;
APP.openPlayerMoveModal = openPlayerMoveModal;
APP.playerActFast = playerActFast;
