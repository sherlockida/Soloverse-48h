// SSE — EventSource connection manager with scene filtering (ES module)
//
// v5：新增事件类型（dispatch 仍然是通用的，由 app.js 在 handleSSEEvent 里分流）：
//   - thought        : { agent, trace, tick }            → 心声流
//   - tool_call      : { agent, tool, args, result_brief}→ 心声流次级条目
//   - plan_updated   : { agent, goal, steps, diff }      → 计划 tab + roster plan 条
//   - reflect        : { agent, belief_updates, abandoned_steps, mood }
//   - provider_switch: { from, to, reason }              → 顶部状态小标
//   - memory_recall  : { agent, query, hits[] }          → 召回 tab（debug 模式）
//   - belief_formed  : { agent, target, belief }         → 角色详情 / 召回 tab

export class SSEConnection {
  constructor(sceneId = null) {
    this.sceneId = sceneId;
    this.es = null;
    this.handlers = [];
    this.reconnectTimer = null;
    this.connected = false;
  }

  connect() {
    const url = this.sceneId
      ? `/api/scenes/${this.sceneId}/events`
      : '/events';

    this.es = new EventSource(url);

    this.es.onmessage = (e) => {
      let ev;
      try { ev = JSON.parse(e.data); }
      catch (_) { return; }
      for (const h of this.handlers) {
        try { h(ev); } catch (err) { console.warn('SSE handler error:', err); }
      }
    };

    this.es.onopen = () => {
      this.connected = true;
      console.log(`SSE connected to ${url}`);
    };

    this.es.onerror = (e) => {
      this.connected = false;
      console.warn('SSE error, reconnecting in 3s...');
      this._scheduleReconnect();
    };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.es) { this.es.close(); this.es = null; }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  onEvent(handler) {
    this.handlers.push(handler);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.connected = false;
    this.handlers = [];
  }

  switchScene(sceneId) {
    this.disconnect();
    this.sceneId = sceneId;
    this.handlers = []; // Will be re-added by caller
    this.connect();
  }
}

if (typeof window !== 'undefined') {
  window.SSEConnection = SSEConnection;
}
