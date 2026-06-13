// EchoWorld — event-panel.js — event feed rendering + seed visual effects
// Imports shared utilities from app.js, patches render methods onto APP.

import { $, escapeHtml, APP } from './app.js';
import { API } from './api.js';

// ====== Right-side event panel ======

export function appendPanelEvent(kind, ev, skipHistoryPush = false) {
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
    const delta = formatDelta(p.relation_delta);
    const isHot = APP.isCoreEvent(ev);
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
    const isMe = ev.actor === APP.playerAvatar;
    const emoji = APP._emojiOf(ev.actor);
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
    return; // skip unhandled event kinds
  }

  panel.prepend(el);
  while (panel.children.length > 80) panel.removeChild(panel.lastChild);
  // pace track: record append timestamp for 6/s rate limit
  APP._appendStamps.push(Date.now());
}

// ====== Seed impact: flash ❗ on affected agents + screen shake ======

export function flashSeedImpact(affected, durationMs = 4000) {
  if (!affected || !affected.length) return;
  affected.forEach(name => {
    APP._highlightAgents.add(name);
    if (APP.renderer && APP.renderer.flashAgent) {
      APP.renderer.flashAgent(name, durationMs);
    }
  });
  const section = $('#canvas-section');
  section.classList.add('shake');
  setTimeout(() => section.classList.remove('shake'), 500);
  showSeedRipple(affected);
}

// ====== Roster pulse for affected agents ======

export function pulseRosterFor(affected) {
  if (!affected || !affected.length) return;
  requestAnimationFrame(() => {
    const list = $('#roster-list');
    if (!list) return;
    const target = new Set(affected);
    list.querySelectorAll('.roster-item').forEach(el => {
      if (target.has(el.dataset.name)) {
        el.classList.remove('roster-pulse');
        void el.offsetWidth;
        el.classList.add('roster-pulse');
        setTimeout(() => el.classList.remove('roster-pulse'), 3000);
      }
    });
  });
}

// ====== Player seed sticky card (top bar, countdown progress) ======

export function showSeedSticky(ev, fromPlayer) {
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
    .map(n => `<span class="ssc-chip">${APP._emojiOf(n)} ${escapeHtml(n)}</span>`)
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

  c.insertBefore(card, c.firstChild);

  const closeBtn = card.querySelector('.ssc-close');
  if (closeBtn) closeBtn.addEventListener('click', () => removeSeedSticky(card));

  const timer = setTimeout(() => removeSeedSticky(card), TTL);
  APP._seedStickyCards.unshift({ el: card, timer });

  while (APP._seedStickyCards.length > 3) {
    const oldest = APP._seedStickyCards.pop();
    if (oldest) removeSeedSticky(oldest.el);
  }
}

function removeSeedSticky(card) {
  if (!card || !card.parentNode) return;
  const idx = APP._seedStickyCards.findIndex(x => x.el === card);
  if (idx >= 0) {
    clearTimeout(APP._seedStickyCards[idx].timer);
    APP._seedStickyCards.splice(idx, 1);
  }
  card.classList.add('removing');
  setTimeout(() => { if (card.parentNode) card.parentNode.removeChild(card); }, 220);
}

// ====== Clear all sticky cards ======

export function clearSeedSticky() {
  for (const x of APP._seedStickyCards) {
    clearTimeout(x.timer);
    if (x.el && x.el.parentNode) x.el.parentNode.removeChild(x.el);
  }
  APP._seedStickyCards = [];
  const c = $('#seed-sticky');
  if (c) c.innerHTML = '';
}

// ====== Seed ripple banner ======

export function showSeedRipple(affected) {
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
  void banner.offsetWidth;
  banner.classList.add('show');
  clearTimeout(APP._rippleTimer);
  APP._rippleTimer = setTimeout(() => banner.classList.add('hidden'), 3500);
}

// ====== Format relation delta ======

export function formatDelta(d) {
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
}

// ====== Immediate roster refresh after world_state_change ======

export async function refreshRosterNow() {
  try {
    const state = await API.sceneState(APP.sceneId);
    if (state && state.agents) {
      APP._agentsCache = state.agents;
      APP.renderRoster();
      if (APP.renderRoomBar) APP.renderRoomBar();
    }
  } catch (e) { /* ignore */ }
}

// ====== Patch onto APP ======

APP.appendPanelEvent = appendPanelEvent;
APP.flashSeedImpact = flashSeedImpact;
APP.showSeedSticky = showSeedSticky;
APP.showSeedRipple = showSeedRipple;
APP._pulseRosterFor = pulseRosterFor;
APP._clearSeedSticky = clearSeedSticky;
APP._refreshRosterNow = refreshRosterNow;
APP.formatDelta = formatDelta;
