// API — Fetch wrappers for all EchoWorld endpoints (ES module)

export const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
    return r.json();
  },

  async post(url, body = {}) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
    return r.json();
  },

  async del(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
    return r.json();
  },

  // ====== Old compat endpoints (default scene) ======

  async worldState() {
    return this.get('/world/state');
  },

  async injectSeed(text) {
    return this.post('/seed', { text });
  },

  async setSpeed(factor) {
    return this.post('/speed', { factor });
  },

  async resetWorld() {
    return this.post('/reset');
  },

  async getAgent(name) {
    return this.get(`/agents/${encodeURIComponent(name)}`);
  },

  // ====== Scene endpoints ======

  async listScenes() {
    return this.get('/api/scenes');
  },

  async createScene(config) {
    return this.post('/api/scenes', config);
  },

  async deleteScene(sceneId) {
    return this.del(`/api/scenes/${sceneId}`);
  },

  async sceneState(sceneId) {
    return this.get(`/api/scenes/${sceneId}/state`);
  },

  async sceneSeed(sceneId, text) {
    return this.post(`/api/scenes/${sceneId}/seed`, { text });
  },

  async sceneSpeed(sceneId, factor) {
    return this.post(`/api/scenes/${sceneId}/speed`, { factor });
  },

  async sceneReset(sceneId) {
    return this.post(`/api/scenes/${sceneId}/reset`);
  },

  async sceneAgent(sceneId, name) {
    return this.get(`/api/scenes/${sceneId}/agents/${encodeURIComponent(name)}`);
  },

  async addAgent(sceneId, body) {
    return this.post(`/api/scenes/${sceneId}/agents`, body);
  },

  async patchAgent(sceneId, name, body) {
    const r = await fetch(`/api/scenes/${sceneId}/agents/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  },

  // ====== 玩家化身 ======
  async setAvatar(sceneId, name) {
    return this.post(`/api/scenes/${sceneId}/avatar`, { name });
  },
  async playerSay(sceneId, target, utterance, intent = '玩家发言') {
    return this.post(`/api/scenes/${sceneId}/player/say`, { target, utterance, intent });
  },
  async playerMove(sceneId, to) {
    return this.post(`/api/scenes/${sceneId}/player/move`, { to });
  },
  async playerAct(sceneId, kind, reason = '') {
    return this.post(`/api/scenes/${sceneId}/player/act`, { kind, reason });
  },
  async getEnding(sceneId) {
    return this.get(`/api/scenes/${sceneId}/ending`);
  },
  async seedSuggestions(sceneId, n = 6) {
    return this.get(`/api/scenes/${sceneId}/seed_suggestions?n=${n}`);
  },
  async chronicle(sceneId, limit = 50) {
    return this.get(`/api/scenes/${sceneId}/chronicle?limit=${limit}`);
  },

  // ====== Template loading ======

  async loadTemplate(theme) {
    try {
      return this.get(`/api/templates/${theme}`);
    } catch {
      console.warn(`Template ${theme} not found, using empty config`);
      return { theme, places: [], agents: [], relations: [], story_background: '' };
    }
  },
};

// Also register on window for any legacy global references
if (typeof window !== 'undefined') {
  window.API = API;
}
