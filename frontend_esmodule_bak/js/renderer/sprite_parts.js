// Sprite Parts — Body/hair/face/legs/arms/accessory drawing functions
// Each draws directly onto a context at pixel scale (1px = 1px on the 24x32 sprite canvas)
//
// ES Module — exports drawing primitives used by sprite_generator.js

export const SPRITE_W = 24;
export const SPRITE_H = 32;
export const SPRITE_SCALE = 3; // 24x32 scaled 3x = 72x96 display pixels

// ====== Head & Body ======

export function drawHead(ctx, palette) {
  // Head oval (rows 1-9, cols 6-17)
  ctx.fillStyle = palette.skin;
  ctx.fillRect(8, 1, 8, 1);   // top
  ctx.fillRect(6, 2, 12, 1);
  ctx.fillRect(5, 3, 14, 2);
  ctx.fillRect(4, 5, 16, 3);  // widest
  ctx.fillRect(5, 8, 14, 2);
  ctx.fillRect(6, 10, 12, 1);

  // Neck
  ctx.fillRect(10, 11, 4, 2);
}

export function drawHair(ctx, palette, role) {
  const hairCol = palette.hair;
  ctx.fillStyle = hairCol;

  // Common hair cap
  ctx.fillRect(6, 0, 12, 2);
  ctx.fillRect(5, 1, 14, 1);

  switch (role) {
    case 'farmer':
    case 'blacksmith':
      ctx.fillRect(6, 0, 12, 1);
      ctx.fillRect(5, 1, 3, 2);
      ctx.fillRect(16, 1, 3, 2);
      ctx.fillRect(4, 2, 2, 1);
      ctx.fillRect(18, 2, 2, 1);
      break;
    case 'artist':
    case 'innkeeper':
      ctx.fillRect(6, 0, 12, 1);
      ctx.fillRect(5, 1, 14, 2);
      ctx.fillRect(4, 2, 2, 3);
      ctx.fillRect(18, 2, 2, 3);
      break;
    case 'merchant':
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 12, 1);
      ctx.fillRect(5, 2, 3, 2);
      ctx.fillRect(16, 2, 3, 2);
      break;
    case 'medic':
    case 'doctor':
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 12, 2);
      ctx.fillRect(5, 2, 2, 4);
      break;
    case 'elder':
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 3, 2);
      ctx.fillRect(15, 1, 3, 2);
      break;
    case 'child':
      ctx.fillRect(6, 0, 12, 2);
      ctx.fillRect(5, 1, 14, 3);
      ctx.fillRect(4, 2, 4, 2);
      ctx.fillRect(16, 2, 4, 2);
      break;
    case 'scientist':
      ctx.fillRect(8, 0, 8, 1);
      ctx.fillRect(7, 1, 10, 1);
      ctx.fillRect(5, 2, 4, 3);
      ctx.fillRect(15, 2, 4, 3);
      break;
    case 'engineer':
      ctx.fillRect(8, 0, 2, 2);
      ctx.fillRect(12, 0, 2, 3);
      ctx.fillRect(15, 0, 2, 2);
      ctx.fillRect(6, 1, 3, 2);
      ctx.fillRect(16, 1, 3, 2);
      break;
    case 'botanist':
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(5, 1, 14, 2);
      ctx.fillRect(4, 2, 3, 5);
      ctx.fillRect(17, 2, 3, 4);
      break;
    case 'pilot':
      ctx.fillRect(8, 0, 8, 1);
      ctx.fillRect(7, 1, 10, 1);
      break;
    case 'security':
      ctx.fillRect(8, 0, 8, 1);
      break;
    case 'technician':
      ctx.fillRect(6, 0, 12, 3);
      ctx.fillRect(5, 1, 14, 2);
      break;
    default:
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 12, 2);
      break;
  }
}

export function drawAccessory(ctx, palette, role) {
  const acc = palette.accessory;
  switch (role) {
    case 'doctor':
    case 'medic':
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(11, 0, 2, 2);
      ctx.fillRect(10, 1, 4, 1);
      break;
    case 'farmer':
      ctx.fillStyle = '#c8a040';
      ctx.fillRect(5, -1, 14, 3);
      ctx.fillRect(4, 0, 16, 2);
      break;
    case 'blacksmith':
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(6, 11, 12, 2);
      break;
    case 'artist':
      ctx.fillStyle = '#8b3a3a';
      ctx.fillRect(7, -1, 10, 3);
      ctx.fillRect(6, 0, 12, 2);
      ctx.fillRect(18, 1, 2, 1);
      break;
    case 'merchant':
      ctx.fillStyle = acc;
      ctx.fillRect(7, -1, 10, 2);
      ctx.fillRect(6, 0, 12, 2);
      ctx.fillRect(8, -1, 2, 1);
      break;
    case 'innkeeper':
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(7, 14, 10, 12);
      ctx.fillRect(5, 14, 2, 4);
      ctx.fillRect(17, 14, 2, 4);
      break;
    case 'child':
      ctx.fillStyle = '#ff8aaf';
      ctx.fillRect(8, 0, 3, 2);
      ctx.fillRect(6, 1, 2, 1);
      ctx.fillRect(16, 1, 2, 1);
      break;
    case 'elder':
      ctx.fillStyle = '#6b4f3a';
      ctx.fillRect(19, 12, 2, 12);
      break;
    case 'scientist':
      ctx.fillStyle = '#4a9eff';
      ctx.fillRect(8, 2, 8, 2);
      break;
    case 'engineer':
      ctx.fillStyle = '#ff6a2a';
      ctx.fillRect(7, 0, 4, 2);
      ctx.fillRect(13, 0, 4, 2);
      break;
    case 'security':
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(10, 14, 4, 3);
      break;
    case 'pilot':
      ctx.fillStyle = '#4a9eff';
      ctx.fillRect(14, 3, 3, 2);
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(7, 3, 2, 5);
      break;
    case 'botanist':
      ctx.fillStyle = '#ff8aaf';
      ctx.fillRect(5, 3, 3, 3);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(6, 4, 1, 1);
      break;
    case 'technician':
      ctx.fillStyle = '#3a3a5a';
      ctx.fillRect(5, 3, 2, 5);
      ctx.fillRect(17, 3, 2, 5);
      ctx.fillRect(6, 3, 12, 2);
      break;
  }
}

export function drawEyes(ctx, palette) {
  const eyeCol = palette.eyes;
  ctx.fillStyle = eyeCol;
  ctx.fillRect(8, 5, 3, 2);
  ctx.fillRect(13, 5, 3, 2);
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(8, 5, 1, 1);
  ctx.fillRect(13, 5, 1, 1);
  ctx.globalAlpha = 1;
}

export function drawMouth(ctx, emotion = 'neutral') {
  ctx.fillStyle = '#4a2a2a';
  switch (emotion) {
    case 'happy':
      ctx.fillRect(10, 8, 4, 2);
      ctx.fillRect(9, 9, 6, 1);
      break;
    case 'sad':
      ctx.fillRect(10, 9, 4, 2);
      ctx.fillRect(9, 8, 6, 1);
      break;
    case 'surprised':
      ctx.fillRect(10, 8, 4, 3);
      break;
    default:
      ctx.fillRect(10, 8, 4, 1);
  }
}

// ====== Torso ======

export function drawTorso(ctx, palette, role) {
  ctx.fillStyle = palette.clothes;
  ctx.fillRect(6, 11, 12, 1);
  ctx.fillRect(5, 12, 14, 7);
  ctx.fillRect(6, 19, 12, 1);

  switch (role) {
    case 'doctor':
    case 'medic':
      ctx.fillStyle = '#d0d0d0';
      ctx.fillRect(9, 12, 2, 8);
      ctx.fillRect(13, 12, 2, 8);
      break;
    case 'security':
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(8, 13, 8, 4);
      break;
    case 'engineer':
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(5, 17, 14, 2);
      break;
    case 'pilot':
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(8, 15, 8, 3);
      break;
  }
}

// ====== Arms ======

export function drawArms(ctx, palette, frame = 0) {
  ctx.fillStyle = palette.clothes;
  const lx = frame === 1 ? 3 : frame === 3 ? 7 : 5;
  ctx.fillRect(lx, 13, 3, 8);
  const rx = frame === 2 ? 18 : frame === 3 ? 16 : 16;
  ctx.fillRect(rx, 13, 3, 8);
  ctx.fillStyle = palette.skin;
  ctx.fillRect(lx, 21, 3, 2);
  ctx.fillRect(rx, 21, 3, 2);
}

// ====== Legs & Feet ======

export function drawLegs(ctx, palette, frame = 0) {
  const pantsCol = darkenColor(palette.clothes, 0.7);

  // Left leg
  let llx = 8;
  let lly = 20;
  if (frame === 1) { llx = 7; lly = 21; }
  if (frame === 3) { llx = 9; lly = 19; }
  ctx.fillStyle = pantsCol;
  ctx.fillRect(llx, lly, 4, 7);

  // Right leg
  let rlx = 12;
  let rly = 20;
  if (frame === 2) { rlx = 13; rly = 21; }
  if (frame === 3) { rlx = 11; rly = 19; }
  ctx.fillRect(rlx, rly, 4, 7);

  // Feet
  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(llx, lly + 7, 5, 2);
  // BUG FIX [P1-T8]: Original code had `if (frame > 0)` condition on right foot,
  // causing the standing frame (frame=0) to only show the left foot.
  // Removed the condition so both feet are drawn on all frames including standing.
  ctx.fillRect(rlx, rly + 7, 5, 2);
}

export function drawShadow(ctx, x, y, w = SPRITE_W) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + SPRITE_H, w * 0.4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ====== Work 动作：role-specific 手臂姿势 ======
// phase: 0 (低位/收) 或 1 (高位/挥)

export function drawArmsWork(ctx, palette, role, phase = 0) {
  ctx.fillStyle = palette.clothes;
  const high = phase === 1;
  switch (role) {
    case 'blacksmith':
    case 'engineer':
    case 'technician':
      if (high) {
        ctx.fillRect(7, 9, 2, 6); ctx.fillRect(15, 9, 2, 6);
        ctx.fillStyle = palette.skin; ctx.fillRect(7, 7, 2, 2); ctx.fillRect(15, 7, 2, 2);
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(6, 5, 12, 2);
      } else {
        ctx.fillRect(5, 14, 3, 7); ctx.fillRect(16, 14, 3, 7);
        ctx.fillStyle = palette.skin; ctx.fillRect(5, 21, 3, 2); ctx.fillRect(16, 21, 3, 2);
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(4, 22, 16, 2);
      }
      break;
    case 'doctor':
    case 'medic':
    case 'scientist':
    case 'botanist':
      ctx.fillRect(5, 13, 3, 8);
      ctx.fillRect(17, 13, 4, 4);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, 21, 3, 2);
      ctx.fillRect(20, 13, 2, 4);
      ctx.fillStyle = high ? '#ffffff' : '#c0c0c0';
      ctx.fillRect(21, 14, 2, 2);
      break;
    case 'farmer':
      if (high) {
        ctx.fillRect(7, 11, 2, 8); ctx.fillRect(15, 11, 2, 8);
        ctx.fillStyle = palette.skin; ctx.fillRect(7, 19, 2, 2); ctx.fillRect(15, 19, 2, 2);
        ctx.fillStyle = '#8b6914'; ctx.fillRect(13, 5, 2, 8);
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(11, 3, 6, 2);
      } else {
        ctx.fillRect(6, 14, 3, 8); ctx.fillRect(16, 14, 3, 8);
        ctx.fillStyle = palette.skin; ctx.fillRect(6, 22, 3, 2); ctx.fillRect(16, 22, 3, 2);
        ctx.fillStyle = '#8b6914'; ctx.fillRect(14, 18, 2, 8);
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(13, 24, 5, 2);
      }
      break;
    case 'artist':
      ctx.fillRect(5, 14, 3, 7);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, 21, 3, 2);
      ctx.fillStyle = palette.clothes;
      ctx.fillRect(17, 12, 3, 6);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(20, high ? 11 : 13, 2, 2);
      ctx.fillStyle = '#8b3a3a';
      ctx.fillRect(22, high ? 10 : 12, 1, 3);
      break;
    case 'merchant':
    case 'innkeeper':
      ctx.fillRect(7, 13, 3, 6);
      ctx.fillRect(15, 13, 3, 6);
      ctx.fillStyle = palette.skin; ctx.fillRect(7, 19, 3, 2); ctx.fillRect(15, 19, 3, 2);
      ctx.fillStyle = role === 'innkeeper' ? '#d4a574' : '#e8c890';
      const offY = high ? -1 : 1;
      ctx.fillRect(9, 16 + offY, 6, 4);
      break;
    case 'child':
      const dy = high ? -2 : 0;
      ctx.fillRect(5, 13 + dy, 3, 8); ctx.fillRect(16, 9 + dy, 3, 8);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, 21 + dy, 3, 2); ctx.fillRect(16, 7 + dy, 3, 2);
      break;
    case 'elder':
      ctx.fillRect(7, 13, 3, 6);
      ctx.fillRect(14, 13, 3, 6);
      ctx.fillStyle = palette.skin; ctx.fillRect(7, 19, 3, 2); ctx.fillRect(14, 19, 3, 2);
      ctx.fillStyle = high ? '#e8c890' : '#d4a060';
      ctx.fillRect(8, 16, 8, 4);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(11, 16, 1, 4);
      break;
    case 'pilot':
    case 'security':
      ctx.fillRect(7, 13, 3, 5); ctx.fillRect(15, 13, 3, 5);
      ctx.fillStyle = palette.skin; ctx.fillRect(7, 17, 3, 2); ctx.fillRect(15, 17, 3, 2);
      ctx.fillStyle = high ? '#4a9eff' : '#2a6abf';
      ctx.fillRect(9, 14, 6, 3);
      break;
    default:
      const ly = high ? 11 : 13;
      const ry = high ? 11 : 13;
      ctx.fillRect(5, ly, 3, 8); ctx.fillRect(16, ry, 3, 8);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, ly + 8, 3, 2); ctx.fillRect(16, ry + 8, 3, 2);
      break;
  }
}

// ====== Utility ======

export function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (v) => Math.max(0, Math.floor(v * factor)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hashPalette(palette) {
  return Object.values(palette).join('').replace(/#/g, '');
}
