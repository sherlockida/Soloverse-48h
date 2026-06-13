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
    this._retryCount = 0;
    this._statusCallbacks = [];
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
      this._retryCount = 0;
      console.log(`SSE connected to ${url}`);
      this._notifyStatus('connected');
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

    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, this._retryCount), maxDelay);
    const jitter = Math.floor(Math.random() * 500);
    const totalDelay = delay + jitter;

    this._retryCount++;

    console.warn(`SSE error, reconnecting in ${totalDelay}ms (attempt ${this._retryCount})...`);
    this._notifyStatus('reconnecting', totalDelay);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, totalDelay);
  }

  onEvent(handler) {
    this.handlers.push(handler);
  }

  onStatusChange(cb) {
    this._statusCallbacks.push(cb);
  }

  _notifyStatus(status, delay) {
    for (const cb of this._statusCallbacks) {
      try {
        cb({ status, attempt: this._retryCount, delay: delay || 0 });
      } catch (err) { console.warn('SSE status callback error:', err); }
    }
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
    this._retryCount = 0;
    this.handlers = [];
    this._statusCallbacks = [];
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
