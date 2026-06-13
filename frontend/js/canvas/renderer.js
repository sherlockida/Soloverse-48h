// Scene Renderer — Combines room, characters, speech bubbles into layers
// Main interface between the simulation state and the canvas engine

const SPRITE_SCALE = 3; // 24×32 scaled 3x = 72×96 display pixels

// ====== 场景特效绘制（rain/snow/fire/blackout/alert/fog/blood/moonlight）======
const _effectParticles = { rain: [], snow: [] };

function drawSceneEffect(ctx, eff, t, w, h) {
  const intensity = Math.min(1, Math.max(0.2, eff.intensity || 0.8));
  switch (eff.kind) {
    case 'rain': {
      const count = Math.floor(60 * intensity);
      while (_effectParticles.rain.length < count) {
        _effectParticles.rain.push({
          x: Math.random() * w, y: Math.random() * h,
          vy: 6 + Math.random() * 4,
        });
      }
      ctx.strokeStyle = 'rgba(160,200,255,0.55)';
      ctx.lineWidth = 1;
      for (const p of _effectParticles.rain) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 1, p.y + 6);
        ctx.stroke();
        p.y += p.vy;
        if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
      }
      // 微暗
      ctx.fillStyle = 'rgba(20,30,60,0.18)';
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'snow': {
      const count = Math.floor(50 * intensity);
      while (_effectParticles.snow.length < count) {
        _effectParticles.snow.push({
          x: Math.random() * w, y: Math.random() * h,
          vy: 0.5 + Math.random() * 1.2, r: 1 + Math.random() * 2,
          drift: Math.random() * Math.PI * 2,
        });
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of _effectParticles.snow) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.y += p.vy;
        p.x += Math.sin((t + p.drift * 1000) / 800) * 0.4;
        if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
      }
      break;
    }
    case 'fire': {
      // 屏幕底部红色火光 + 顶部暗
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, `rgba(255,90,30,${0.45 * intensity})`);
      grad.addColorStop(0.4, `rgba(255,150,40,${0.18 * intensity})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // 火花粒子
      for (let i = 0; i < 8; i++) {
        const x = ((t / 12) + i * 53) % w;
        const y = h - 10 - ((t / 8 + i * 37) % 60);
        ctx.fillStyle = `rgba(255,${180 + (i % 3) * 20},80,${0.4 + Math.sin(t / 100 + i) * 0.3})`;
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }
    case 'blackout':
    case 'night': {
      ctx.fillStyle = `rgba(0,0,16,${0.65 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'moonlight': {
      ctx.fillStyle = `rgba(80,90,160,${0.45 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(220,230,255,${0.15 * intensity})`;
      ctx.beginPath(); ctx.arc(w - 60, 40, 22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'alert': {
      const pulse = 0.3 + Math.sin(t / 220) * 0.3;
      ctx.fillStyle = `rgba(255,0,0,${pulse * intensity * 0.35})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(255,0,0,${Math.min(1, pulse * 1.5)})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      break;
    }
    case 'fog': {
      ctx.fillStyle = `rgba(200,200,210,${0.35 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const y = (h / 4) * i + (Math.sin(t / 1200 + i) * 18);
        ctx.fillStyle = `rgba(230,230,235,${0.18})`;
        ctx.fillRect(0, y, w, 18);
      }
      break;
    }
    case 'blood': {
      ctx.fillStyle = `rgba(140,0,0,${0.18 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(180,0,0,${0.7})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      break;
    }
    case 'celebration': {
      // 彩纸雨
      for (let i = 0; i < 30; i++) {
        const x = ((t / 5) + i * 41) % w;
        const y = (((t / 3) + i * 23) % (h + 40)) - 10;
        ctx.fillStyle = ['#ff5a8a','#ffc764','#5ad4b8','#8aaaff','#b59cf0'][i % 5];
        ctx.fillRect(x, y, 3, 6);
      }
      break;
    }
  }
}

// Role → work activity icon（头顶浮动的 emoji，标识"在干啥"）
const ROLE_WORK_ICON = {
  doctor:     '🩺',
  medic:      '🩺',
  blacksmith: '⚒️',
  farmer:     '🌾',
  artist:     '🎨',
  merchant:   '💰',
  innkeeper:  '🍺',
  child:      '🪁',
  elder:      '📖',
  scientist:  '🧪',
  engineer:   '🔧',
  pilot:      '🚀',
  botanist:   '🌱',
  security:   '🛡️',
  technician: '💻',
  // 办公室角色
  boss:       '👔',
  hr:         '📋',
  designer:   '🎨',
  salesperson:'💼',
  leader:     '📈',
  veteran:    '☕',
  intern:     '📚',
};

function drawActivityIcon(ctx, sprite, sx, sy, t) {
  const head = sy - 8;
  if (sprite.activity === 'work') {
    const icon = ROLE_WORK_ICON[sprite.role] || '⚙️';
    const bob = Math.sin(t / 250) * 3;
    ctx.font = '16px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, sx + SPRITE_W * SPRITE_SCALE / 2, head + bob);
    // 工作"汗滴"小线
    ctx.fillStyle = '#ffcc66';
    ctx.globalAlpha = 0.4 + Math.sin(t / 200) * 0.3;
    ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 - 8, head + 4, 2, 4);
    ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 + 6, head + 6, 2, 4);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  } else if (sprite.activity === 'talk') {
    // 绿色对话指示点（淡化，气泡是主体）
    ctx.fillStyle = '#4aff88';
    ctx.globalAlpha = 0.5 + Math.sin(t / 280) * 0.3;
    ctx.beginPath();
    ctx.arc(sx + SPRITE_W * SPRITE_SCALE / 2, head, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (sprite.activity === 'stand') {
    // idle 小眨眼提示
    if (Math.sin((t + sprite.x * 13) / 1100) > 0.96) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.4;
      ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 + 6, head + 14, 3, 1);
      ctx.globalAlpha = 1;
    }
  }
}

class CharacterSprite {
  constructor(agentData) {
    this.name = agentData.name;
    this.role = agentData.role || '';
    this.palette = mergePalette(agentData.color_palette || {}, this.role);
    this.frames = generateAllFrames(this.role, this.palette);
    this.currentFrame = 'stand';
    this.x = 100;
    this.y = 100;
    this.targetX = 100;
    this.targetY = 100;
    this.location = agentData.location || '';
    this.moving = false;
    this.emoji = agentData.emoji || '';
    this.bubble = null;
    this.activity = 'stand'; // 'stand', 'walk', 'work', 'talk'
    this.activityTimer = 0;
    this.flashUntil = 0;       // 时间戳；> now 时头顶有 ❗ 闪烁
    this.workPhase = 0;        // role-specific work 动作时间
    this.faceDir = 1;          // 1 = right, -1 = left
    this.lastTalkPartnerX = 0; // 用于 talk 时面向对方
  }

  moveTo(slotX, slotY) {
    if (slotX > this.x + 2) this.faceDir = 1;
    else if (slotX < this.x - 2) this.faceDir = -1;
    this.targetX = slotX;
    this.targetY = slotY;
    if (Math.abs(this.x - slotX) > 5 || Math.abs(this.y - slotY) > 5) {
      this.moving = true;
      this.activity = 'walk';
    }
  }

  update(dt) {
    const now = performance.now();
    if (this.moving) {
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 2) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.moving = false;
        this.currentFrame = 'stand';
        this.activity = 'stand';
      } else {
        const speed = 0.08;
        const step = speed * dt;
        const ratio = Math.min(1, step / dist);
        this.x += dx * ratio;
        this.y += dy * ratio;
        this.currentFrame = Math.floor(now / 150) % 2 === 0 ? 'walk1' : 'walk2';
      }
    } else {
      // 不在移动 → 根据 activity 决定帧
      if (this.activity === 'work') {
        this.currentFrame = Math.floor(now / 350) % 2 === 0 ? 'work1' : 'work2';
        // Idle bob 稍弱
        this.y = this.targetY + Math.sin(now / 400) * 0.5;
      } else if (this.activity === 'talk') {
        this.currentFrame = 'stand';
        this.y = this.targetY + Math.sin(now / 250) * 1.5;  // 头微微晃
      } else {
        this.currentFrame = 'stand';
        this.y = this.targetY + Math.sin(now / 800) * 1;
      }
    }

    // activity 自动衰减
    if (this.activityTimer > 0) {
      this.activityTimer -= dt;
      if (this.activityTimer <= 0 && this.activity !== 'stand') {
        this.activity = 'stand';
      }
    }

    if (this.bubble) {
      this.bubble.update(now);
      if (this.bubble.finished) this.bubble = null;
    }
  }

  say(text) {
    this.bubble = new SpeechBubble(text, this.x + SPRITE_W * SPRITE_SCALE / 2, this.y);
    this.activity = 'talk';
    this.activityTimer = 2000;
  }

  flash(durationMs = 4000) {
    this.flashUntil = performance.now() + durationMs;
  }

  getRenderX() { return this.x; }
  getRenderY() { return this.y; }
}

class SceneRenderer {
  constructor(engine, theme = 'medieval', places = []) {
    this.engine = engine;
    this.theme = theme;
    this.places = places;
    this.currentRoom = places[0] || '';
    this.sprites = {}; // name → CharacterSprite
    this.bubbles = [];

    this.cameraX = 0;
    this.cameraY = 0;
    this.targetCameraX = 0;
    this.walkQueue = [];

    this.talkLinks = [];
    this.moodFlash = null;
    this.avatarName = null;
    this.particles = [];

    // 视图模式：overview = 一屏看所有房间；focus = 单房间放大
    this.viewMode = 'overview';
    // 场景特效（雨/雪/火/警报/夜晚）
    this.effects = [];  // [{kind, until, intensity}]

    this.setupLayers();
  }

  switchViewMode(mode) {
    if (mode === this.viewMode) return;
    this.viewMode = mode;
    this.engine.clearLayers();
    this.setupLayers();
  }

  // ====== 鸟瞰网格布局 ======
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
      place: p,
      col: i % cols, row: Math.floor(i / cols),
      x: (i % cols) * cellW,
      y: Math.floor(i / cols) * cellH,
      w: cellW, h: cellH,
      scale: Math.min(cellW / (ROOM_COLS * TILE), cellH / (ROOM_ROWS * TILE)),
    }));
  }

  _cellFor(place) {
    return this._gridLayout().find(c => c.place === place);
  }

  // 当前画布坐标对应的房间（用于点击）
  cellAt(canvasX, canvasY) {
    if (this.viewMode !== 'overview') return null;
    return this._gridLayout().find(c =>
      canvasX >= c.x && canvasX < c.x + c.w &&
      canvasY >= c.y && canvasY < c.y + c.h
    );
  }

  setupLayers() {
    if (this.viewMode === 'overview') return this.setupOverviewLayers();
    return this.setupFocusLayers();
  }

  // ====== Overview Layers (一屏看所有房间) ======
  setupOverviewLayers() {
    // L0: 每格的房间背景 + 房间标题 + 格子边框
    this.engine.addLayer({
      render: (ctx, t) => {
        const cells = this._gridLayout();
        for (const c of cells) {
          const roomCanvas = getOrRenderRoom(this.theme, c.place, this.places);
          ctx.drawImage(roomCanvas, c.x, c.y, c.w, c.h);
          // 格子边框
          ctx.strokeStyle = c.place === this.currentRoom ? '#f5c764' : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = c.place === this.currentRoom ? 2 : 1;
          ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
          // 标题
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(c.x, c.y, c.w, 16);
          ctx.fillStyle = '#ece4d7';
          ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
          ctx.fillText(c.place, c.x + 5, c.y + 12);
        }
      }
    });

    // L1: 每个房间内的 sprite（缩小绘制）
    this.engine.addLayer({
      render: (ctx, t) => {
        const cells = this._gridLayout();
        for (const c of cells) {
          const inRoom = Object.values(this.sprites).filter(s => s.location === c.place);
          inRoom.sort((a, b) => a.y - b.y);
          for (const sp of inRoom) {
            // 房间内坐标 → 格内坐标
            const sx = c.x + sp.x * c.scale;
            const sy = c.y + sp.y * c.scale;
            const sw = SPRITE_W * SPRITE_SCALE * c.scale;
            const sh = SPRITE_H * SPRITE_SCALE * c.scale;
            const frame = sp.frames[sp.currentFrame] || sp.frames.stand;
            if (frame) {
              ctx.imageSmoothingEnabled = false;
              if (sp.faceDir < 0) {
                ctx.save();
                ctx.translate(sx + sw, sy);
                ctx.scale(-1, 1);
                ctx.drawImage(frame, 0, 0, sw, sh);
                ctx.restore();
              } else {
                ctx.drawImage(frame, sx, sy, sw, sh);
              }
            }
            // 玩家化身金光
            if (this.avatarName === sp.name) {
              ctx.fillStyle = '#f5c764';
              ctx.globalAlpha = 0.5 + Math.sin(t / 300) * 0.2;
              ctx.beginPath();
              ctx.ellipse(sx + sw/2, sy + sh - 2, sw * 0.6, 3, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
            }
            // 名字
            ctx.fillStyle = 'rgba(0,0,0,0.65)';
            ctx.fillRect(sx + sw/2 - 22, sy + sh + 1, 44, 10);
            ctx.fillStyle = '#ece4d7';
            ctx.font = '9px "PingFang SC", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sp.name, sx + sw/2, sy + sh + 9);
            ctx.textAlign = 'left';
            // 头顶情绪 emoji
            if (sp.moodEmoji && sp.moodUntil > t) {
              ctx.font = '12px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(sp.moodEmoji, sx + sw/2, sy - 2);
              ctx.textAlign = 'left';
            }
            // 高亮闪烁
            if (sp.flashUntil > t) {
              ctx.font = 'bold 14px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillStyle = '#ff3a3a';
              ctx.globalAlpha = 0.6 + Math.sin(t / 120) * 0.4;
              ctx.fillText('❗', sx + sw/2, sy - 4);
              ctx.globalAlpha = 1;
              ctx.textAlign = 'left';
            }
          }
        }
      }
    });

    // L2: talk 连线（鸟瞰下同样画弧线，按格内坐标）
    this.engine.addLayer({
      render: (ctx, t) => {
        this.talkLinks = this.talkLinks.filter(l => l.until > t);
        for (const link of this.talkLinks) {
          const a = this.sprites[link.a];
          const b = this.sprites[link.b];
          if (!a || !b) continue;
          const ca = this._cellFor(a.location);
          const cb = this._cellFor(b.location);
          if (!ca || !cb) continue;
          const ax = ca.x + (a.x + SPRITE_W * SPRITE_SCALE / 2) * ca.scale;
          const ay = ca.y + (a.y + SPRITE_H * SPRITE_SCALE / 2) * ca.scale;
          const bx = cb.x + (b.x + SPRITE_W * SPRITE_SCALE / 2) * cb.scale;
          const by = cb.y + (b.y + SPRITE_H * SPRITE_SCALE / 2) * cb.scale;
          ctx.save();
          const remaining = (link.until - t) / 1800;
          ctx.globalAlpha = Math.min(1, remaining * 1.4);
          ctx.strokeStyle = link.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          ctx.lineDashOffset = -t / 30;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2 - 12;
          ctx.quadraticCurveTo(mx, my, bx, by);
          ctx.stroke();
          ctx.restore();
        }
      }
    });

    // L3: 气泡（鸟瞰下简化为一行小字 + clamp 到格内）
    this.engine.addLayer({
      render: (ctx, t) => {
        for (const sp of Object.values(this.sprites)) {
          if (!sp.bubble || sp.bubble.finished) continue;
          sp.bubble.update(t);
          const cell = this._cellFor(sp.location);
          if (!cell) continue;
          const sx = cell.x + sp.x * cell.scale;
          const sy = cell.y + sp.y * cell.scale;
          // 简化气泡：白底黑字一行，clamp 到格子
          const fullText = sp.bubble.text;
          const shown = fullText.slice(0, Math.max(1, sp.bubble.typedChars));
          const text = shown.length > 14 ? shown.slice(0, 13) + '…' : shown;
          ctx.font = '10px "PingFang SC", sans-serif';
          const tw = ctx.measureText(text).width + 8;
          let bx = sx + (SPRITE_W * SPRITE_SCALE * cell.scale) / 2 - tw / 2;
          // clamp 到格内
          bx = Math.max(cell.x + 3, Math.min(cell.x + cell.w - tw - 3, bx));
          let by = sy - 14;
          if (by < cell.y + 16) by = sy + SPRITE_H * SPRITE_SCALE * cell.scale + 12;
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.strokeStyle = '#1a1410';
          ctx.lineWidth = 1;
          ctx.fillRect(bx, by, tw, 14);
          ctx.strokeRect(bx + 0.5, by + 0.5, tw - 1, 13);
          ctx.fillStyle = '#1a1410';
          ctx.fillText(text, bx + 4, by + 10);
        }
      }
    });

    this._addSharedTopLayers();
  }

  // ====== Focus Layers (放大单房间) ======
  setupFocusLayers() {
    // Layer 0: Room background
    this.engine.addLayer({
      render: (ctx, t) => {
        const roomCanvas = getOrRenderRoom(this.theme, this.currentRoom, this.places);
        ctx.drawImage(roomCanvas, -this.cameraX, -this.cameraY);

        // Place name overlay
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, 200, 24);
        ctx.fillStyle = '#c49a6c';
        ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText(this.currentRoom, 8, 17);
      }
    });

    // Layer 0.5: 关系连线（在角色之下）
    this.engine.addLayer({
      render: (ctx, t) => {
        // 清理过期连线
        this.talkLinks = this.talkLinks.filter(l => l.until > t);
        for (const link of this.talkLinks) {
          const a = this.sprites[link.a];
          const b = this.sprites[link.b];
          if (!a || !b || a.location !== this.currentRoom || b.location !== this.currentRoom) continue;
          const ax = a.x - this.cameraX + SPRITE_W * SPRITE_SCALE / 2;
          const ay = a.y - this.cameraY + SPRITE_H * SPRITE_SCALE / 2;
          const bx = b.x - this.cameraX + SPRITE_W * SPRITE_SCALE / 2;
          const by = b.y - this.cameraY + SPRITE_H * SPRITE_SCALE / 2;
          const remaining = (link.until - t) / 1800;
          ctx.save();
          ctx.globalAlpha = Math.min(1, remaining * 1.4);
          ctx.strokeStyle = link.color;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          ctx.lineDashOffset = -t / 30;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          // 弯一点的弧线，更像心电感应
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2 - 20;
          ctx.quadraticCurveTo(mx, my, bx, by);
          ctx.stroke();
          ctx.restore();
        }
      }
    });

    // Layer 1: Characters (z-sorted by y)
    this.engine.addLayer({
      render: (ctx, t) => {
        const chars = Object.values(this.sprites).filter(s => s.location === this.currentRoom);
        // Sort by Y for depth
        chars.sort((a, b) => a.y - b.y);

        for (const sprite of chars) {
          const sx = sprite.getRenderX() - this.cameraX;
          const sy = sprite.getRenderY() - this.cameraY;

          // Shadow
          drawShadow(ctx, sx, sy, SPRITE_W * SPRITE_SCALE);

          // Sprite image（支持水平翻转，让角色面向对方）
          const frameCanvas = sprite.frames[sprite.currentFrame] || sprite.frames.stand;
          if (frameCanvas) {
            ctx.imageSmoothingEnabled = false;
            const dw = SPRITE_W * SPRITE_SCALE;
            const dh = SPRITE_H * SPRITE_SCALE;
            if (sprite.faceDir < 0) {
              ctx.save();
              ctx.translate(sx + dw, sy);
              ctx.scale(-1, 1);
              ctx.drawImage(frameCanvas, 0, 0, dw, dh);
              ctx.restore();
            } else {
              ctx.drawImage(frameCanvas, sx, sy, dw, dh);
            }
          }

          // 玩家化身：金色光环
          if (this.avatarName === sprite.name) {
            ctx.save();
            const cx = sx + SPRITE_W * SPRITE_SCALE / 2;
            const cy = sy + SPRITE_H * SPRITE_SCALE - 6;
            ctx.fillStyle = '#f5c764';
            ctx.globalAlpha = 0.45 + Math.sin(t / 300) * 0.18;
            ctx.beginPath();
            ctx.ellipse(cx, cy + 10, SPRITE_W * SPRITE_SCALE * 0.55, 6, 0, 0, Math.PI * 2);
            ctx.fill();
            // 顶上小皇冠
            ctx.globalAlpha = 0.9;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👑', cx, sy - 22 - Math.sin(t / 400) * 2);
            ctx.textAlign = 'left';
            ctx.restore();
          }

          // Activity icon overlay（role-specific 装饰图标）
          drawActivityIcon(ctx, sprite, sx, sy, t);

          // 情绪表情头顶（短暂）
          if (sprite.moodEmoji && sprite.moodUntil > t) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, (sprite.moodUntil - t) / 1000);
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sprite.moodEmoji, sx + SPRITE_W * SPRITE_SCALE / 2,
                         sy - 28 + Math.sin(t / 200) * 3);
            ctx.textAlign = 'left';
            ctx.restore();
          }

          // 种子涟漪：头顶 ❗ 红色闪烁
          if (sprite.flashUntil > t) {
            const pulse = 0.5 + Math.sin(t / 120) * 0.5;
            ctx.fillStyle = '#ff3a3a';
            ctx.globalAlpha = pulse;
            ctx.font = 'bold 18px "PingFang SC", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('❗', sx + SPRITE_W * SPRITE_SCALE / 2, sy - 12);
            // 红色光环
            ctx.strokeStyle = '#ff3a3a';
            ctx.lineWidth = 2;
            const ringR = 12 + Math.sin(t / 200) * 4;
            ctx.beginPath();
            ctx.arc(sx + SPRITE_W * SPRITE_SCALE / 2, sy + SPRITE_H * SPRITE_SCALE / 2, ringR + 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
          }

          // 名字 + role 标签（在脚下）
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          const labelW = 50;
          ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 - labelW / 2,
                       sy + SPRITE_H * SPRITE_SCALE + 2, labelW, 12);
          ctx.fillStyle = '#ece4d7';
          ctx.font = '10px "PingFang SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(sprite.name, sx + SPRITE_W * SPRITE_SCALE / 2, sy + SPRITE_H * SPRITE_SCALE + 11);
          ctx.textAlign = 'left';
        }
      }
    });

    // Layer 2: Speech bubbles
    this.engine.addLayer({
      update: (dt, t) => {
        for (const sprite of Object.values(this.sprites)) {
          if (sprite.bubble) {
            sprite.bubble.update(t);
          }
        }
      },
      render: (ctx, t) => {
        for (const sprite of Object.values(this.sprites)) {
          if (sprite.bubble && sprite.location === this.currentRoom) {
            sprite.bubble.render(ctx, this.cameraX, this.cameraY);
          }
        }
      }
    });

    // Layer 2.5: 粒子（化身入场）
    this.engine.addLayer({
      render: (ctx, t) => {
        this.particles = this.particles.filter(p => t - p.born < p.life);
        for (const p of this.particles) {
          const age = t - p.born;
          const ratio = age / p.life;
          ctx.fillStyle = p.color;
          ctx.globalAlpha = (1 - ratio) * 0.9;
          const px = p.x + p.vx * age * 0.05 - this.cameraX;
          const py = p.y + p.vy * age * 0.05 + 0.5 * 0.0008 * age * age - this.cameraY;
          ctx.fillRect(px, py, 3, 3);
          ctx.globalAlpha = 1;
        }
      }
    });

    // Layer 2.7: 屏幕边色（剧情高光）
    this.engine.addLayer({
      render: (ctx, t) => {
        if (this.moodFlash && this.moodFlash.until > t) {
          const remaining = (this.moodFlash.until - t) / 900;
          ctx.save();
          ctx.globalAlpha = remaining * 0.6;
          ctx.strokeStyle = this.moodFlash.color;
          ctx.lineWidth = 12;
          ctx.strokeRect(6, 6, this.engine.canvas.width - 12, this.engine.canvas.height - 12);
          ctx.restore();
        } else if (this.moodFlash && this.moodFlash.until <= t) {
          this.moodFlash = null;
        }
      }
    });

    this._addSharedTopLayers();
  }

  // 共享顶层：场景特效（雨/雪/火/警报）+ 屏幕染色边
  _addSharedTopLayers() {
    // Effect layer
    this.engine.addLayer({
      render: (ctx, t) => {
        this.effects = this.effects.filter(e => e.until > t);
        for (const e of this.effects) {
          drawSceneEffect(ctx, e, t, this.engine.canvas.width, this.engine.canvas.height);
        }
      }
    });
    // 屏幕染色边
    this.engine.addLayer({
      render: (ctx, t) => {
        if (this.moodFlash && this.moodFlash.until > t) {
          const remaining = (this.moodFlash.until - t) / 900;
          ctx.save();
          ctx.globalAlpha = remaining * 0.6;
          ctx.strokeStyle = this.moodFlash.color;
          ctx.lineWidth = 12;
          ctx.strokeRect(6, 6, this.engine.canvas.width - 12, this.engine.canvas.height - 12);
          ctx.restore();
        } else if (this.moodFlash && this.moodFlash.until <= t) {
          this.moodFlash = null;
        }
      }
    });

    // 视图模式底部提示
    this.engine.addLayer({
      render: (ctx, t) => {
        if (this.viewMode !== 'overview') return;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, this.engine.canvas.height - 16, this.engine.canvas.width, 16);
        ctx.fillStyle = '#c49a6c';
        ctx.font = '10px "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🗺️ 鸟瞰视图 · 点击任意房间可放大', this.engine.canvas.width / 2, this.engine.canvas.height - 4);
        ctx.textAlign = 'left';
      }
    });
  }

  _addOldFocusUIOverlay() {
    // Layer 3: UI overlay (room navigation, etc.)
    this.engine.addLayer({
      render: (ctx, t) => {
        const w = this.engine.canvas.width;
        const h = this.engine.canvas.height;

        // Room dots at bottom
        const dotY = h - 20;
        const dotSpacing = 20;
        const startX = w / 2 - (this.places.length * dotSpacing) / 2;
        for (let i = 0; i < this.places.length; i++) {
          const dx = startX + i * dotSpacing + 10;
          ctx.fillStyle = this.places[i] === this.currentRoom ? '#c49a6c' : '#4a3a2a';
          ctx.beginPath();
          ctx.arc(dx, dotY, 4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Current room name tooltip
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(w / 2 - 60, h - 40, 120, 16);
        ctx.fillStyle = '#ece4d7';
        ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(this.currentRoom, w / 2, h - 28);
        ctx.textAlign = 'left';
      }
    });
  }

  // ====== Public API ======

  setTheme(theme) {
    this.theme = theme;
    clearRoomCache();
  }

  switchRoom(placeName) {
    if (placeName === this.currentRoom) return;
    this.currentRoom = placeName;
    // Re-assign character slots
    this._assignSlots();
  }

  nextRoom() {
    const idx = this.places.indexOf(this.currentRoom);
    const next = (idx + 1) % this.places.length;
    this.switchRoom(this.places[next]);
    return this.currentRoom;
  }

  prevRoom() {
    const idx = this.places.indexOf(this.currentRoom);
    const prev = (idx - 1 + this.places.length) % this.places.length;
    this.switchRoom(this.places[prev]);
    return this.currentRoom;
  }

  syncAgents(agentsData) {
    // Add new sprites
    for (const ad of agentsData) {
      if (!this.sprites[ad.name]) {
        this.sprites[ad.name] = new CharacterSprite(ad);
      }
      // Update location
      const sprite = this.sprites[ad.name];
      sprite.location = ad.location || sprite.location;
    }
    this._assignSlots();
  }

  moveAgent(name, toPlace) {
    const sprite = this.sprites[name];
    if (!sprite) return;
    sprite.location = toPlace;

    // If moving into current room, animate in
    if (toPlace === this.currentRoom) {
      const layout = getRoomLayout(this.theme, this.currentRoom, this.places);
      const slot = this._findSlot(name);
      if (slot) {
        sprite.x = -50; // Start off-screen left
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
        // 关系色连线
        const linkColor = this._linkColorFromDelta(relationDelta);
        this.talkLinks.push({
          a: name, b: otherName,
          color: linkColor,
          until: performance.now() + 1800,
        });
        // 关系剧变 → 屏幕色边
        if (relationDelta) {
          const sum = Math.abs(relationDelta.trust || 0) + Math.abs(relationDelta.fondness || 0)
                    + Math.abs(relationDelta.jealousy || 0) + Math.abs(relationDelta.guilt || 0);
          if (sum >= 4) {
            this.moodFlash = { color: linkColor, until: performance.now() + 900 };
          }
        }
        // 情绪头顶表情
        if (relationDelta) {
          const f = relationDelta.fondness || 0;
          const t = relationDelta.trust || 0;
          const j = relationDelta.jealousy || 0;
          const g = relationDelta.guilt || 0;
          let mood = null;
          if (f >= 2) mood = '💕';
          else if (j >= 2) mood = '😡';
          else if (t <= -2) mood = '😒';
          else if (g >= 2) mood = '😞';
          if (mood) {
            sprite.moodEmoji = mood;
            sprite.moodUntil = performance.now() + 2400;
          }
        }
      }
    }
  }

  _linkColorFromDelta(d) {
    if (!d) return 'rgba(180,180,200,0.65)';
    const f = d.fondness || 0, t = d.trust || 0, j = d.jealousy || 0, g = d.guilt || 0;
    if (j >= 2) return 'rgba(181,156,240,0.85)';   // 紫 = 嫉妒
    if (f >= 2) return 'rgba(255,138,175,0.85)';   // 粉 = 暧昧
    if (t >= 2) return 'rgba(107,189,125,0.85)';   // 绿 = 信任
    if (t <= -2 || f <= -2) return 'rgba(215,107,107,0.85)'; // 红 = 冲突
    if (g >= 2) return 'rgba(245,199,100,0.85)';   // 黄 = 愧疚
    return 'rgba(180,180,200,0.65)';               // 灰 = 中性
  }

  flashAgent(name, durationMs = 4000) {
    const sprite = this.sprites[name];
    if (sprite) sprite.flash(durationMs);
  }

  // 触发场景特效（rain/snow/fire/blackout/night/moonlight/alert/fog/blood/celebration）
  triggerEffect(kind, durationMs = 8000, intensity = 0.8) {
    this.effects.push({
      kind, intensity,
      until: performance.now() + durationMs,
    });
  }

  setAvatarName(name) {
    this.avatarName = name || null;
    // 玩家化身入场粒子
    if (name) {
      const s = this.sprites[name];
      if (s) {
        for (let i = 0; i < 20; i++) {
          this.particles.push({
            x: s.x + SPRITE_W * SPRITE_SCALE / 2,
            y: s.y + SPRITE_H * SPRITE_SCALE / 2,
            vx: (Math.random() - 0.5) * 4,
            vy: -Math.random() * 4 - 1,
            life: 800 + Math.random() * 600,
            born: performance.now(),
            color: '#f5c764',
          });
        }
      }
    }
  }

  agentWork(name) {
    const sprite = this.sprites[name];
    if (sprite) {
      sprite.activity = 'work';
      sprite.activityTimer = 4500;
    }
  }

  setAgentActivity(name, activity) {
    const sprite = this.sprites[name];
    if (sprite) {
      sprite.activity = activity;
      sprite.activityTimer = activity === 'stand' ? 0 : 4500;
    }
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
