// EchoWorld — roster.js — roster list + room bar + polling
// Imports shared utilities from app.js, patches render methods onto APP.

import { $, escapeHtml, APP } from './app.js';
import { API } from './api.js';

// ====== Roster list ======

export function renderRoster() {
  const list = $('#roster-list');
  if (!list) return;
  const cur = APP.renderer ? APP.renderer.currentRoom : '';
  // v5.3: status emoji / class / badge mapping
  const STATUS_EMOJI = { dead: '💀', unconscious: '😴', missing: '🚪', gone: '🚪' };
  const STATUS_LABEL = { dead: '已故', unconscious: '昏迷', missing: '失踪', gone: '离场' };
  list.innerHTML = (APP._agentsCache || []).map(a => {
    const status = (a.status || 'alive').toLowerCase();
    const isAlive = (status === 'alive');
    const statusCls = !isAlive ? `is-${status} status-${status}` : '';
    const cls = [
      'roster-item',
      a.location === cur ? 'in-current-room' : '',
      a.name === APP.playerAvatar ? 'is-me' : '',
      APP._hotAgents.has(a.name) ? 'is-hot' : '',
      statusCls,
    ].filter(Boolean).join(' ');
    const planStrip = isAlive ? planStripHtml(a.name) : '';
    // tool-use track: last tool call icon
    const lt = APP._lastToolByAgent && APP._lastToolByAgent[a.name];
    const toolHint = (lt && isAlive)
      ? `<span class="roster-tool ${lt.ok === false ? 'tool-fail' : ''}" title="最近：${lt.tool} ${lt.latency_ms}ms @t${lt.tick}">${APP._toolIcon(lt.tool)}</span>`
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
      // Switch to that room
      if (APP.renderer && loc && APP.places.includes(loc)) {
        APP.renderer.switchRoom(loc);
        $('#room-name').textContent = loc;
        APP.renderRoster();
        APP.renderRoomBar();
      }
      // Open character panel
      APP.showCharacterPanel(name);
    });
  });
}

// ====== Plan strip dots under roster item ======

function planStripHtml(name) {
  const p = APP._plans[name];
  if (!p || !p.steps || !p.steps.length) return '';
  const dots = p.steps.slice(0, 5).map(s => {
    const status = typeof s === 'object' ? (s.status || (s.done ? 'done' : 'todo')) : 'todo';
    const sym = status === 'done' ? '▷' : status === 'doing' ? '▶' : '○';
    return `<span class="plan-dot plan-${status}" title="${escapeHtml(typeof s === 'object' ? (s.text || s.desc || '') : String(s))}">${sym}</span>`;
  }).join('');
  return `<div class="plan-strip" title="${escapeHtml(p.goal || '')}">${dots}</div>`;
}

// ====== Room bar ======

export function renderRoomBar() {
  const bar = $('#room-bar');
  if (!bar) return;
  const cur = APP.renderer ? APP.renderer.currentRoom : '';
  bar.innerHTML = (APP.places || []).map(p => {
    const peopleEmojis = (APP._agentsCache || [])
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
      if (APP.renderer && loc && APP.places.includes(loc)) {
        APP.renderer.switchRoom(loc);
        $('#room-name').textContent = loc;
        APP.renderRoster();
        APP.renderRoomBar();
      }
    });
  });
}

// ====== Roster polling ======

export function startRosterPoll() {
  if (APP._rosterPollTimer) return;
  APP._rosterPollTimer = setInterval(async () => {
    try {
      const state = await API.sceneState(APP.sceneId);
      APP._agentsCache = state.agents || [];
      APP._recomputeHotAgents();
      // Avatar may have changed in another session
      if (state.player_avatar !== APP.playerAvatar) {
        APP.playerAvatar = state.player_avatar;
        APP.updatePlayerModeBadge();
        if (APP.renderer && APP.renderer.setAvatarName) APP.renderer.setAvatarName(APP.playerAvatar);
      }
      APP.renderRoster();
      APP.renderRoomBar();
    } catch (e) { /* ignore */ }
  }, 3500);
}

export function stopRosterPoll() {
  if (APP._rosterPollTimer) { clearInterval(APP._rosterPollTimer); APP._rosterPollTimer = null; }
}

// ====== Patch onto APP ======

APP.renderRoster = renderRoster;
APP.renderRoomBar = renderRoomBar;
APP.startRosterPoll = startRosterPoll;
APP.stopRosterPoll = stopRosterPoll;
