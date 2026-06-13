// EchoWorld — thought-stream.js — thought/plan/recall/tool card rendering
// Imports shared utilities from app.js, patches render methods onto APP.

import { $, escapeHtml, APP } from './app.js';

// ====== Tool stats bar ======

export function renderToolStatsBar() {
  const bar = $('#ts-tool-stats');
  if (!bar) return;
  const s = APP._toolStats;
  if (s.total === 0) {
    bar.innerHTML = '<span class="tts-empty">尚无工具调用</span>';
    return;
  }
  const avg = s.total ? Math.round(s.latency_sum_ms / s.total) : 0;
  const topTools = Object.entries(s.by_tool)
    .sort((a, b) => b[1].n - a[1].n).slice(0, 4)
    .map(([k, v]) => `<span class="tts-chip" title="${k}: ${v.n} 次, ${v.ok} 成功">${APP._toolIcon(k)} ${v.n}</span>`)
    .join('');
  bar.innerHTML = `<span class="tts-main">🛠 工具调用 <b>${s.total}</b> · ✅ <b>${s.ok}</b> · ⏱ avg <b>${avg}</b>ms</span>
    <span class="tts-chips">${topTools}</span>`;
}

// ====== Thoughts tab ======

export function renderThoughtsTab() {
  APP._renderToolStatsBar();
  const list = $('#ts-thoughts-list');
  if (!list) return;
  if (!APP._thoughts.length) {
    list.innerHTML = '<div class="ts-empty">还没有角色开始思考，让世界跑一会儿……</div>';
    return;
  }
  list.innerHTML = APP._thoughts.map((rec, idx) => thoughtCardHtml(rec, idx)).join('');
  // Bind click: jump to agent
  list.querySelectorAll('.ts-card').forEach(el => {
    el.addEventListener('click', () => {
      const name = el.dataset.agent;
      if (!name || name === 'system') return;
      const a = (APP._agentsCache || []).find(x => x.name === name);
      if (a && a.location && APP.renderer) {
        APP.renderer.switchRoom(a.location);
        APP.renderer.switchViewMode('focus');
        APP.updateViewModeButtons('focus');
        $('#room-name').textContent = a.location;
        if (APP.renderer.flashAgent) APP.renderer.flashAgent(name, 2200);
        APP.renderRoster();
        APP.renderRoomBar();
      }
    });
  });
  // Expand trace
  list.querySelectorAll('.ts-card-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.ts-card');
      if (card) card.classList.toggle('expanded');
    });
  });
}

function thoughtCardHtml(rec, idx) {
  if (rec.kind === 'tool') return toolCardHtml(rec, idx);

  const isMe = rec.agent === APP.playerAvatar;
  const isHot = APP._hotAgents.has(rec.agent);
  const cls = [
    'ts-card', `ts-${rec.kind}`,
    isMe ? 'ts-me' : '', isHot ? 'ts-hot' : '',
  ].filter(Boolean).join(' ');

  const trace = rec.trace || [];
  const traceHtml = trace.length > 1
    ? `<div class="ts-card-trace">${trace.slice(1).map(t => `<div>· ${escapeHtml(String(t))}</div>`).join('')}</div>`
    : '';
  const hasExpand = trace.length > 1;

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
}

// ====== Tool card ======

function toolCardHtml(rec, idx) {
  const isMe = rec.agent === APP.playerAvatar;
  const isHot = APP._hotAgents.has(rec.agent);
  const lat = rec.latency_ms || 0;
  const latCls = lat < 200 ? 'lat-fast' : lat < 800 ? 'lat-mid' : 'lat-slow';
  const okCls = rec.ok === false ? 'ts-tool-fail' : 'ts-tool-ok';
  const nested = rec.parent_thought ? 'ts-tool-nested' : '';
  const cls = [
    'ts-card', 'ts-tool', okCls, nested,
    isMe ? 'ts-me' : '', isHot ? 'ts-hot' : '',
  ].filter(Boolean).join(' ');

  const icon = APP._toolIcon(rec.tool);
  const argsHtml = renderToolArgs(rec.args || {});
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
}

// ====== Tool args rendering ======

function renderToolArgs(args) {
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
}

// ====== Plans tab ======

export function renderPlansTab() {
  const list = $('#ts-plans-list');
  if (!list) return;
  const entries = Object.entries(APP._plans);
  if (!entries.length) {
    list.innerHTML = '<div class="ts-empty">尚无角色发布计划。</div>';
    return;
  }
  list.innerHTML = entries.map(([name, p]) => {
    const emoji = APP._emojiOf(name);
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
}

// ====== Recalls tab ======

export function renderRecallsTab() {
  const list = $('#ts-recalls-list');
  if (!list) return;
  if (!APP._recalls.length) {
    list.innerHTML = '<div class="ts-empty">还没有记忆召回事件。打开 debug 模式可看到全部召回。</div>';
    return;
  }
  list.innerHTML = APP._recalls.map(rec => {
    const emoji = APP._emojiOf(rec.agent);
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
}

// ====== Patch onto APP ======

APP._renderToolStatsBar = renderToolStatsBar;
APP.renderThoughtsTab = renderThoughtsTab;
APP.renderPlansTab = renderPlansTab;
APP.renderRecallsTab = renderRecallsTab;
