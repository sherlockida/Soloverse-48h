// Scene Layers — Overview and Focus layer setup for SceneRenderer
// Adds layer render callbacks to the CanvasEngine based on view mode
//
// ES Module

import { SPRITE_W, SPRITE_H, SPRITE_SCALE, drawShadow } from './sprite_parts.js';
import { drawSceneEffect, drawActivityIcon } from './effects.js';
import { getOrRenderRoom, ROOM_COLS, ROOM_ROWS, TILE } from './room.js';

// ====== Overview Layers (all rooms in a grid) ======

export function setupOverviewLayers(sr) {
  // L0: Room backgrounds + titles + borders
  sr.engine.addLayer({
    render: (ctx, t) => {
      const cells = sr._gridLayout();
      for (const c of cells) {
        const roomCanvas = getOrRenderRoom(sr.theme, c.place, sr.places);
        ctx.drawImage(roomCanvas, c.x, c.y, c.w, c.h);
        ctx.strokeStyle = c.place === sr.currentRoom ? '#f5c764' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = c.place === sr.currentRoom ? 2 : 1;
        ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.w - 1, c.h - 1);
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(c.x, c.y, c.w, 16);
        ctx.fillStyle = '#ece4d7';
        ctx.font = '11px "PingFang SC", "Microsoft YaHei", sans-serif';
        ctx.fillText(c.place, c.x + 5, c.y + 12);
      }
    }
  });

  // L1: Sprites in each room cell (scaled down)
  sr.engine.addLayer({
    render: (ctx, t) => {
      const cells = sr._gridLayout();
      for (const c of cells) {
        const inRoom = Object.values(sr.sprites).filter(s => s.location === c.place);
        inRoom.sort((a, b) => a.y - b.y);
        for (const sp of inRoom) {
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
          if (sr.avatarName === sp.name) {
            ctx.fillStyle = '#f5c764';
            ctx.globalAlpha = 0.5 + Math.sin(t / 300) * 0.2;
            ctx.beginPath();
            ctx.ellipse(sx + sw / 2, sy + sh - 2, sw * 0.6, 3, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.fillRect(sx + sw / 2 - 22, sy + sh + 1, 44, 10);
          ctx.fillStyle = '#ece4d7';
          ctx.font = '9px "PingFang SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(sp.name, sx + sw / 2, sy + sh + 9);
          ctx.textAlign = 'left';
          if (sp.moodEmoji && sp.moodUntil > t) {
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(sp.moodEmoji, sx + sw / 2, sy - 2);
            ctx.textAlign = 'left';
          }
          if (sp.flashUntil > t) {
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ff3a3a';
            ctx.globalAlpha = 0.6 + Math.sin(t / 120) * 0.4;
            ctx.fillText('❗', sx + sw / 2, sy - 4);
            ctx.globalAlpha = 1;
            ctx.textAlign = 'left';
          }
        }
      }
    }
  });

  // L2: Talk links (arcs across cells)
  sr.engine.addLayer({
    render: (ctx, t) => {
      sr.talkLinks = sr.talkLinks.filter(l => l.until > t);
      for (const link of sr.talkLinks) {
        const a = sr.sprites[link.a], b = sr.sprites[link.b];
        if (!a || !b) continue;
        const ca = sr._cellFor(a.location), cb = sr._cellFor(b.location);
        if (!ca || !cb) continue;
        const ax = ca.x + (a.x + SPRITE_W * SPRITE_SCALE / 2) * ca.scale;
        const ay = ca.y + (a.y + SPRITE_H * SPRITE_SCALE / 2) * ca.scale;
        const bx = cb.x + (b.x + SPRITE_W * SPRITE_SCALE / 2) * cb.scale;
        const by = cb.y + (b.y + SPRITE_H * SPRITE_SCALE / 2) * cb.scale;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ((link.until - t) / 1800) * 1.4);
        ctx.strokeStyle = link.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = -t / 30;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 12, bx, by);
        ctx.stroke();
        ctx.restore();
      }
    }
  });

  // L3: Speech bubbles (simplified, clamped to cell)
  sr.engine.addLayer({
    render: (ctx, t) => {
      for (const sp of Object.values(sr.sprites)) {
        if (!sp.bubble || sp.bubble.finished) continue;
        sp.bubble.update(t);
        const cell = sr._cellFor(sp.location);
        if (!cell) continue;
        const sx = cell.x + sp.x * cell.scale;
        const sy = cell.y + sp.y * cell.scale;
        const fullText = sp.bubble.text;
        const shown = fullText.slice(0, Math.max(1, sp.bubble.typedChars));
        const text = shown.length > 14 ? shown.slice(0, 13) + '…' : shown;
        ctx.font = '10px "PingFang SC", sans-serif';
        const tw = ctx.measureText(text).width + 8;
        let bx = sx + (SPRITE_W * SPRITE_SCALE * cell.scale) / 2 - tw / 2;
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

  _addSharedTopLayers(sr);
}

// ====== Focus Layers (single room zoomed in) ======

export function setupFocusLayers(sr) {
  // L0: Room background
  sr.engine.addLayer({
    render: (ctx, t) => {
      const roomCanvas = getOrRenderRoom(sr.theme, sr.currentRoom, sr.places);
      ctx.drawImage(roomCanvas, -sr.cameraX, -sr.cameraY);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, 200, 24);
      ctx.fillStyle = '#c49a6c';
      ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(sr.currentRoom, 8, 17);
    }
  });

  // L0.5: Talk links (below characters)
  sr.engine.addLayer({
    render: (ctx, t) => {
      sr.talkLinks = sr.talkLinks.filter(l => l.until > t);
      for (const link of sr.talkLinks) {
        const a = sr.sprites[link.a], b = sr.sprites[link.b];
        if (!a || !b || a.location !== sr.currentRoom || b.location !== sr.currentRoom) continue;
        const ax = a.x - sr.cameraX + SPRITE_W * SPRITE_SCALE / 2;
        const ay = a.y - sr.cameraY + SPRITE_H * SPRITE_SCALE / 2;
        const bx = b.x - sr.cameraX + SPRITE_W * SPRITE_SCALE / 2;
        const by = b.y - sr.cameraY + SPRITE_H * SPRITE_SCALE / 2;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ((link.until - t) / 1800) * 1.4);
        ctx.strokeStyle = link.color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -t / 30;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 20, bx, by);
        ctx.stroke();
        ctx.restore();
      }
    }
  });

  // L1: Characters (z-sorted by Y)
  sr.engine.addLayer({
    render: (ctx, t) => {
      const chars = Object.values(sr.sprites).filter(s => s.location === sr.currentRoom);
      chars.sort((a, b) => a.y - b.y);
      for (const sprite of chars) {
        const sx = sprite.getRenderX() - sr.cameraX;
        const sy = sprite.getRenderY() - sr.cameraY;
        drawShadow(ctx, sx, sy, SPRITE_W * SPRITE_SCALE);
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
        if (sr.avatarName === sprite.name) {
          ctx.save();
          const cx = sx + SPRITE_W * SPRITE_SCALE / 2;
          ctx.fillStyle = '#f5c764';
          ctx.globalAlpha = 0.45 + Math.sin(t / 300) * 0.18;
          ctx.beginPath();
          ctx.ellipse(cx, sy + SPRITE_H * SPRITE_SCALE - 6 + 10, SPRITE_W * SPRITE_SCALE * 0.55, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('👑', cx, sy - 22 - Math.sin(t / 400) * 2);
          ctx.textAlign = 'left';
          ctx.restore();
        }
        drawActivityIcon(ctx, sprite, sx, sy, t);
        if (sprite.moodEmoji && sprite.moodUntil > t) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (sprite.moodUntil - t) / 1000);
          ctx.font = '18px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(sprite.moodEmoji, sx + SPRITE_W * SPRITE_SCALE / 2, sy - 28 + Math.sin(t / 200) * 3);
          ctx.textAlign = 'left';
          ctx.restore();
        }
        if (sprite.flashUntil > t) {
          const pulse = 0.5 + Math.sin(t / 120) * 0.5;
          ctx.fillStyle = '#ff3a3a';
          ctx.globalAlpha = pulse;
          ctx.font = 'bold 18px "PingFang SC", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('❗', sx + SPRITE_W * SPRITE_SCALE / 2, sy - 12);
          ctx.strokeStyle = '#ff3a3a';
          ctx.lineWidth = 2;
          const ringR = 12 + Math.sin(t / 200) * 4;
          ctx.beginPath();
          ctx.arc(sx + SPRITE_W * SPRITE_SCALE / 2, sy + SPRITE_H * SPRITE_SCALE / 2, ringR + 30, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.textAlign = 'left';
        }
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 - 25, sy + SPRITE_H * SPRITE_SCALE + 2, 50, 12);
        ctx.fillStyle = '#ece4d7';
        ctx.font = '10px "PingFang SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(sprite.name, sx + SPRITE_W * SPRITE_SCALE / 2, sy + SPRITE_H * SPRITE_SCALE + 11);
        ctx.textAlign = 'left';
      }
    }
  });

  // L2: Speech bubbles
  sr.engine.addLayer({
    render: (ctx, t) => {
      for (const sprite of Object.values(sr.sprites)) {
        if (sprite.bubble && sprite.location === sr.currentRoom) {
          sprite.bubble.render(ctx, sr.cameraX, sr.cameraY);
        }
      }
    }
  });

  // L2.5: Particles (avatar entrance)
  sr.engine.addLayer({
    render: (ctx, t) => {
      sr.particles = sr.particles.filter(p => t - p.born < p.life);
      for (const p of sr.particles) {
        const age = t - p.born;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = (1 - age / p.life) * 0.9;
        const px = p.x + p.vx * age * 0.05 - sr.cameraX;
        const py = p.y + p.vy * age * 0.05 + 0.5 * 0.0008 * age * age - sr.cameraY;
        ctx.fillRect(px, py, 3, 3);
        ctx.globalAlpha = 1;
      }
    }
  });

  _addSharedTopLayers(sr);
}

// ====== Shared top layers (effects, mood flash, view mode hint) ======

function _addSharedTopLayers(sr) {
  // Scene effect layer
  sr.engine.addLayer({
    render: (ctx, t) => {
      sr.effects = sr.effects.filter(e => e.until > t);
      for (const e of sr.effects) {
        drawSceneEffect(ctx, e, t, sr.engine.canvas.width, sr.engine.canvas.height);
      }
    }
  });

  // Mood flash border
  sr.engine.addLayer({
    render: (ctx, t) => {
      if (sr.moodFlash && sr.moodFlash.until > t) {
        const remaining = (sr.moodFlash.until - t) / 900;
        ctx.save();
        ctx.globalAlpha = remaining * 0.6;
        ctx.strokeStyle = sr.moodFlash.color;
        ctx.lineWidth = 12;
        ctx.strokeRect(6, 6, sr.engine.canvas.width - 12, sr.engine.canvas.height - 12);
        ctx.restore();
      } else if (sr.moodFlash && sr.moodFlash.until <= t) {
        sr.moodFlash = null;
      }
    }
  });

  // View mode hint bar
  sr.engine.addLayer({
    render: (ctx, t) => {
      if (sr.viewMode !== 'overview') return;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, sr.engine.canvas.height - 16, sr.engine.canvas.width, 16);
      ctx.fillStyle = '#c49a6c';
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🗺️ 鸟瞰视图 · 点击任意房间可放大', sr.engine.canvas.width / 2, sr.engine.canvas.height - 4);
      ctx.textAlign = 'left';
    }
  });
}
