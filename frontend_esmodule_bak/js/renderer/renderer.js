// Scene Renderer + Canvas Engine — Orchestrates sprites, camera, layers
// Main interface between the simulation state and the canvas engine
//
// ES Module

import { CharacterSprite, SPRITE_W, SPRITE_H, SPRITE_SCALE } from './sprite.js';
import { drawSceneEffect, drawActivityIcon } from './effects.js';
import { getOrRenderRoom, clearRoomCache, ROOM_COLS, ROOM_ROWS, TILE } from './room.js';
import { getRoomLayout } from './room_layouts.js';
import { setupOverviewLayers, setupFocusLayers } from './scene_layers.js';

// ====== Canvas Engine — requestAnimationFrame game loop with layer compositing ======

export class CanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.layers = [];
    this.running = false;
    this.lastTime = 0;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop() { this.running = false; }

  loop(timestamp) {
    if (!this.running) return;
    const dt = Math.min(timestamp - this.lastTime, 100);
    this.lastTime = timestamp;
    this.frameCount++;
    if (timestamp - this.fpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = timestamp;
    }
    this.update(dt, timestamp);
    this.render(timestamp);
    requestAnimationFrame(t => this.loop(t));
  }

  update(dt, timestamp) {
    for (const layer of this.layers) {
      if (layer.update) layer.update(dt, timestamp);
    }
  }

  render(timestamp) {
    const ctx = this.ctx;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const layer of this.layers) {
      if (layer.render) layer.render(ctx, timestamp);
    }
  }

  addLayer(layer, index = -1) {
    if (index < 0 || index >= this.layers.length) this.layers.push(layer);
    else this.layers.splice(index, 0, layer);
  }

  removeLayer(layer) {
    const idx = this.layers.indexOf(layer);
    if (idx >= 0) this.layers.splice(idx, 1);
  }

  clearLayers() { this.layers = []; }
}

// ====== Scene Renderer — manages sprites, camera, layers, view modes ======

export class SceneRenderer {
  constructor(engine, theme = 'medieval', places = []) {
    this.engine = engine;
    this.theme = theme;
    this.places = places;
    this.currentRoom = places[0] || '';
    this.sprites = {}; // name -> CharacterSprite

    this.cameraX = 0;
    this.cameraY = 0;
    this.targetCameraX = 0;

    this.talkLinks = [];
    this.moodFlash = null;
    this.avatarName = null;
    this.particles = [];

    this.viewMode = 'overview'; // 'overview' | 'focus'
    this.effects = []; // [{kind, until, intensity}]

    this.setupLayers();
  }

  switchViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.engine.clearLayers();
    this.setupLayers();
  }

  // ====== Grid layout for overview mode ======

  _gridLayout() {
    const n = this.places.length;
    if (n === 0) return [];
    let cols, rows;
    if (n <= 1) { cols = 1; rows = 1; }
    else if (n <= 2) { cols = 2; rows = 1; }
    else if (n <= 4) { cols = 2; rows = 2; }
    else if (n <= 6) { cols = 3; rows = 2; }
    else if (n <= 9) { cols = 3; rows = 3; }
    else { cols = 4; rows = Math.ceil(n / 4); }
    const W = this.engine.canvas.width;
    const H = this.engine.canvas.height;
    const cellW = Math.floor(W / cols);
    const cellH = Math.floor(H / rows);
    return this.places.map((p, i) => ({
      place: p, col: i % cols, row: Math.floor(i / cols),
      x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH,
      w: cellW, h: cellH,
      scale: Math.min(cellW / (ROOM_COLS * TILE), cellH / (ROOM_ROWS * TILE)),
    }));
  }

  _cellFor(place) {
    return this._gridLayout().find(c => c.place === place);
  }

  cellAt(canvasX, canvasY) {
    if (this.viewMode !== 'overview') return null;
    return this._gridLayout().find(c =>
      canvasX >= c.x && canvasX < c.x + c.w &&
      canvasY >= c.y && canvasY < c.y + c.h
    );
  }

  // ====== Layer setup dispatch ======

  setupLayers() {
    if (this.viewMode === 'overview') setupOverviewLayers(this);
    else setupFocusLayers(this);
  }

  // ====== Public API ======

  setTheme(theme) {
    this.theme = theme;
    clearRoomCache();
  }

  switchRoom(placeName) {
    if (placeName === this.currentRoom) return;
    this.currentRoom = placeName;
    this._assignSlots();
  }

  nextRoom() {
    const idx = this.places.indexOf(this.currentRoom);
    this.switchRoom(this.places[(idx + 1) % this.places.length]);
    return this.currentRoom;
  }

  prevRoom() {
    const idx = this.places.indexOf(this.currentRoom);
    this.switchRoom(this.places[(idx - 1 + this.places.length) % this.places.length]);
    return this.currentRoom;
  }

  syncAgents(agentsData) {
    for (const ad of agentsData) {
      if (!this.sprites[ad.name]) {
        this.sprites[ad.name] = new CharacterSprite(ad);
      }
      this.sprites[ad.name].location = ad.location || this.sprites[ad.name].location;
    }
    this._assignSlots();
  }

  moveAgent(name, toPlace) {
    const sprite = this.sprites[name];
    if (!sprite) return;
    sprite.location = toPlace;
    if (toPlace === this.currentRoom) {
      const slot = this._findSlot(name);
      if (slot) {
        sprite.x = -50;
        sprite.y = slot.y;
        sprite.moveTo(slot.x, slot.y);
      }
    }
  }

  agentTalk(name, otherName, utterance, innerThought, relationDelta = null) {
    const sprite = this.sprites[name];
    const other = this.sprites[otherName];
    if (sprite && sprite.location === this.currentRoom) {
      sprite.say(utterance);
      if (other && other.location === this.currentRoom) {
        sprite.faceDir = other.x > sprite.x ? 1 : -1;
        other.faceDir = sprite.x > other.x ? 1 : -1;
        sprite.lastTalkPartnerX = other.x;
        const linkColor = this._linkColorFromDelta(relationDelta);
        this.talkLinks.push({ a: name, b: otherName, color: linkColor, until: performance.now() + 1800 });
        if (relationDelta) {
          const sum = Math.abs(relationDelta.trust || 0) + Math.abs(relationDelta.fondness || 0)
                    + Math.abs(relationDelta.jealousy || 0) + Math.abs(relationDelta.guilt || 0);
          if (sum >= 4) this.moodFlash = { color: linkColor, until: performance.now() + 900 };
          const f = relationDelta.fondness || 0;
          const j = relationDelta.jealousy || 0;
          const t = relationDelta.trust || 0;
          const g = relationDelta.guilt || 0;
          let mood = null;
          if (f >= 2) mood = '💕';
          else if (j >= 2) mood = '😡';
          else if (t <= -2) mood = '😒';
          else if (g >= 2) mood = '😞';
          if (mood) { sprite.moodEmoji = mood; sprite.moodUntil = performance.now() + 2400; }
        }
      }
    }
  }

  _linkColorFromDelta(d) {
    if (!d) return 'rgba(180,180,200,0.65)';
    const f = d.fondness || 0, t = d.trust || 0, j = d.jealousy || 0, g = d.guilt || 0;
    if (j >= 2) return 'rgba(181,156,240,0.85)';
    if (f >= 2) return 'rgba(255,138,175,0.85)';
    if (t >= 2) return 'rgba(107,189,125,0.85)';
    if (t <= -2 || f <= -2) return 'rgba(215,107,107,0.85)';
    if (g >= 2) return 'rgba(245,199,100,0.85)';
    return 'rgba(180,180,200,0.65)';
  }

  flashAgent(name, durationMs = 4000) {
    const sprite = this.sprites[name];
    if (sprite) sprite.flash(durationMs);
  }

  triggerEffect(kind, durationMs = 8000, intensity = 0.8) {
    this.effects.push({ kind, intensity, until: performance.now() + durationMs });
  }

  setAvatarName(name) {
    this.avatarName = name || null;
    if (name) {
      const s = this.sprites[name];
      if (s) {
        for (let i = 0; i < 20; i++) {
          this.particles.push({
            x: s.x + SPRITE_W * SPRITE_SCALE / 2, y: s.y + SPRITE_H * SPRITE_SCALE / 2,
            vx: (Math.random() - 0.5) * 4, vy: -Math.random() * 4 - 1,
            life: 800 + Math.random() * 600, born: performance.now(), color: '#f5c764',
          });
        }
      }
    }
  }

  agentWork(name) {
    const sprite = this.sprites[name];
    if (sprite) { sprite.activity = 'work'; sprite.activityTimer = 4500; }
  }

  setAgentActivity(name, activity) {
    const sprite = this.sprites[name];
    if (sprite) { sprite.activity = activity; sprite.activityTimer = activity === 'stand' ? 0 : 4500; }
  }

  // ====== Internal ======

  _assignSlots() {
    const layout = getRoomLayout(this.theme, this.currentRoom, this.places);
    const slots = layout.slots || [];
    const charsHere = Object.values(this.sprites).filter(s => s.location === this.currentRoom);
    for (let i = 0; i < charsHere.length; i++) {
      const slot = slots[i] || { x: 100 + i * 40, y: 160 };
      charsHere[i].moveTo(slot.x, slot.y);
    }
  }

  _findSlot(name) {
    const layout = getRoomLayout(this.theme, this.currentRoom, this.places);
    const slots = layout.slots || [];
    const charsHere = Object.values(this.sprites).filter(s => s.location === this.currentRoom);
    const idx = charsHere.findIndex(s => s.name === name);
    return slots[idx] || { x: 160, y: 160 };
  }

  getCharacterAt(canvasX, canvasY) {
    const worldX = canvasX + this.cameraX;
    const worldY = canvasY + this.cameraY;
    const chars = Object.values(this.sprites).filter(s => s.location === this.currentRoom);
    for (const s of chars) {
      if (worldX >= s.x && worldX <= s.x + SPRITE_W * SPRITE_SCALE &&
          worldY >= s.y && worldY <= s.y + SPRITE_H * SPRITE_SCALE) {
        return s.name;
      }
    }
    return null;
  }
}
