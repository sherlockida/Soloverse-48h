// Sprite Parts — Body/hair/face/legs/arms/accessory drawing functions
// Each draws directly onto a context at pixel scale (1px = 1px on the 24x32 sprite canvas)

const SPRITE_W = 24;
const SPRITE_H = 32;

// ====== Head & Body ======

function drawHead(ctx, palette) {
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

function drawHair(ctx, palette, role) {
  const hairCol = palette.hair;
  ctx.fillStyle = hairCol;

  // Common hair cap
  ctx.fillRect(6, 0, 12, 2);
  ctx.fillRect(5, 1, 14, 1);

  switch (role) {
    case 'farmer':
    case 'blacksmith':
      // Short messy hair
      ctx.fillRect(6, 0, 12, 1);
      ctx.fillRect(5, 1, 3, 2);
      ctx.fillRect(16, 1, 3, 2);
      ctx.fillRect(4, 2, 2, 1);
      ctx.fillRect(18, 2, 2, 1);
      break;
    case 'artist':
    case 'innkeeper':
      // Medium wavy hair
      ctx.fillRect(6, 0, 12, 1);
      ctx.fillRect(5, 1, 14, 2);
      ctx.fillRect(4, 2, 2, 3);
      ctx.fillRect(18, 2, 2, 3);
      break;
    case 'merchant':
      // Neat combed hair
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 12, 1);
      ctx.fillRect(5, 2, 3, 2);
      ctx.fillRect(16, 2, 3, 2);
      break;
    case 'medic':
    case 'doctor':
      // Tied back hair
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 12, 2);
      ctx.fillRect(5, 2, 2, 4);
      break;
    case 'elder':
      // Thin, wispy hair
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 3, 2);
      ctx.fillRect(15, 1, 3, 2);
      break;
    case 'child':
      // Messy mop
      ctx.fillRect(6, 0, 12, 2);
      ctx.fillRect(5, 1, 14, 3);
      ctx.fillRect(4, 2, 4, 2);
      ctx.fillRect(16, 2, 4, 2);
      break;
    case 'scientist':
      // Tidy short hair
      ctx.fillRect(8, 0, 8, 1);
      ctx.fillRect(7, 1, 10, 1);
      ctx.fillRect(5, 2, 4, 3);
      ctx.fillRect(15, 2, 4, 3);
      break;
    case 'engineer':
      // Spiky hair
      ctx.fillRect(8, 0, 2, 2);
      ctx.fillRect(12, 0, 2, 3);
      ctx.fillRect(15, 0, 2, 2);
      ctx.fillRect(6, 1, 3, 2);
      ctx.fillRect(16, 1, 3, 2);
      break;
    case 'botanist':
      // Flowing side-parted hair
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(5, 1, 14, 2);
      ctx.fillRect(4, 2, 3, 5);
      ctx.fillRect(17, 2, 3, 4);
      break;
    case 'pilot':
      // Slick practical cut
      ctx.fillRect(8, 0, 8, 1);
      ctx.fillRect(7, 1, 10, 1);
      break;
    case 'security':
      // Very short/buzzed
      ctx.fillRect(8, 0, 8, 1);
      break;
    case 'technician':
      // Messy hood-up look
      ctx.fillRect(6, 0, 12, 3);
      ctx.fillRect(5, 1, 14, 2);
      break;
    default:
      ctx.fillRect(7, 0, 10, 1);
      ctx.fillRect(6, 1, 12, 2);
      break;
  }
}

function drawAccessory(ctx, palette, role) {
  const acc = palette.accessory;
  switch (role) {
    case 'doctor':
    case 'medic':
      // Medical cross on hat/headband
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(11, 0, 2, 2);
      ctx.fillRect(10, 1, 4, 1);
      break;
    case 'farmer':
      // Straw hat
      ctx.fillStyle = '#c8a040';
      ctx.fillRect(5, -1, 14, 3);
      ctx.fillRect(4, 0, 16, 2);
      break;
    case 'blacksmith':
      // Leather apron strap
      ctx.fillStyle = '#3a2010';
      ctx.fillRect(6, 11, 12, 2);
      break;
    case 'artist':
      // Beret
      ctx.fillStyle = '#8b3a3a';
      ctx.fillRect(7, -1, 10, 3);
      ctx.fillRect(6, 0, 12, 2);
      ctx.fillRect(18, 1, 2, 1);
      break;
    case 'merchant':
      // Smart cap
      ctx.fillStyle = acc;
      ctx.fillRect(7, -1, 10, 2);
      ctx.fillRect(6, 0, 12, 2);
      ctx.fillRect(8, -1, 2, 1);
      break;
    case 'innkeeper':
      // Apron
      ctx.fillStyle = '#e8e0d0';
      ctx.fillRect(7, 14, 10, 12);
      ctx.fillRect(5, 14, 2, 4);
      ctx.fillRect(17, 14, 2, 4);
      break;
    case 'child':
      // Bow/ribbon
      ctx.fillStyle = '#ff8aaf';
      ctx.fillRect(8, 0, 3, 2);
      ctx.fillRect(6, 1, 2, 1);
      ctx.fillRect(16, 1, 2, 1);
      break;
    case 'elder':
      // Walking stick
      ctx.fillStyle = '#6b4f3a';
      ctx.fillRect(19, 12, 2, 12);
      break;
    case 'scientist':
      // Lab coat collar / goggles
      ctx.fillStyle = '#4a9eff';
      ctx.fillRect(8, 2, 8, 2);
      break;
    case 'engineer':
      // Welding goggles on forehead
      ctx.fillStyle = '#ff6a2a';
      ctx.fillRect(7, 0, 4, 2);
      ctx.fillRect(13, 0, 4, 2);
      break;
    case 'security':
      // Badge
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(10, 14, 4, 3);
      break;
    case 'pilot':
      // Visor/headset
      ctx.fillStyle = '#4a9eff';
      ctx.fillRect(14, 3, 3, 2);
      ctx.fillStyle = '#2a2a3a';
      ctx.fillRect(7, 3, 2, 5);
      break;
    case 'botanist':
      // Flower in hair
      ctx.fillStyle = '#ff8aaf';
      ctx.fillRect(5, 3, 3, 3);
      ctx.fillStyle = '#ffcc00';
      ctx.fillRect(6, 4, 1, 1);
      break;
    case 'technician':
      // Headphones
      ctx.fillStyle = '#3a3a5a';
      ctx.fillRect(5, 3, 2, 5);
      ctx.fillRect(17, 3, 2, 5);
      ctx.fillRect(6, 3, 12, 2);
      break;
  }
}

function drawEyes(ctx, palette) {
  const eyeCol = palette.eyes;
  ctx.fillStyle = eyeCol;
  // Left eye
  ctx.fillRect(8, 5, 3, 2);
  // Right eye
  ctx.fillRect(13, 5, 3, 2);
  // Eye highlights
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(8, 5, 1, 1);
  ctx.fillRect(13, 5, 1, 1);
  ctx.globalAlpha = 1;
}

function drawMouth(ctx, emotion = 'neutral') {
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
    default: // neutral
      ctx.fillRect(10, 8, 4, 1);
  }
}

// ====== Torso ======

function drawTorso(ctx, palette, role) {
  ctx.fillStyle = palette.clothes;
  // Shoulders
  ctx.fillRect(6, 11, 12, 1);
  // Body
  ctx.fillRect(5, 12, 14, 7);
  // Slight waist indent
  ctx.fillRect(6, 19, 12, 1);

  // Role-specific torso details
  switch (role) {
    case 'doctor':
    case 'medic':
      // White coat lapels
      ctx.fillStyle = '#d0d0d0';
      ctx.fillRect(9, 12, 2, 8);
      ctx.fillRect(13, 12, 2, 8);
      break;
    case 'security':
      // Armor plates
      ctx.fillStyle = '#5a5a6a';
      ctx.fillRect(8, 13, 8, 4);
      break;
    case 'engineer':
      // Tool belt
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(5, 17, 14, 2);
      break;
    case 'pilot':
      // Flight jacket
      ctx.fillStyle = '#4a3a2a';
      ctx.fillRect(8, 15, 8, 3);
      break;
  }
}

// ====== Arms ======

function drawArms(ctx, palette, frame = 0) {
  ctx.fillStyle = palette.clothes;
  // Left arm
  const lx = frame === 1 ? 3 : frame === 3 ? 7 : 5;
  ctx.fillRect(lx, 13, 3, 8);
  // Right arm
  const rx = frame === 2 ? 18 : frame === 3 ? 16 : 16;
  ctx.fillRect(rx, 13, 3, 8);
  // Hands
  ctx.fillStyle = palette.skin;
  ctx.fillRect(lx, 21, 3, 2);
  ctx.fillRect(rx, 21, 3, 2);
}

// ====== Legs & Feet ======

function drawLegs(ctx, palette, frame = 0) {
  const pantsCol = darkenColor(palette.clothes, 0.7);

  // Left leg
  let llx = 8;
  let lly = 20;
  if (frame === 1) { llx = 7; lly = 21; }  // walk frame 1
  if (frame === 3) { llx = 9; lly = 19; }  // walk frame 3
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
  if (frame > 0) ctx.fillRect(rlx, rly + 7, 5, 2);
}

function drawShadow(ctx, x, y, w = SPRITE_W) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x + w/2, y + SPRITE_H, w * 0.4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ====== Work 动作：role-specific 手臂姿势 ======
// phase: 0 (低位/收) 或 1 (高位/挥)
function drawArmsWork(ctx, palette, role, phase = 0) {
  ctx.fillStyle = palette.clothes;
  const high = phase === 1;
  switch (role) {
    case 'blacksmith':
    case 'engineer':
    case 'technician':
      // 双手抡锤：phase 1 高举，phase 0 砸下
      if (high) {
        ctx.fillRect(7, 9, 2, 6); ctx.fillRect(15, 9, 2, 6);    // 上举臂
        ctx.fillStyle = palette.skin; ctx.fillRect(7, 7, 2, 2); ctx.fillRect(15, 7, 2, 2);  // 手
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(6, 5, 12, 2);   // 锤头
      } else {
        ctx.fillRect(5, 14, 3, 7); ctx.fillRect(16, 14, 3, 7);  // 下挥臂
        ctx.fillStyle = palette.skin; ctx.fillRect(5, 21, 3, 2); ctx.fillRect(16, 21, 3, 2);
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(4, 22, 16, 2);  // 砧板/铁
      }
      break;
    case 'doctor':
    case 'medic':
    case 'scientist':
    case 'botanist':
      // 单手前伸（递听诊器/试管）
      ctx.fillRect(5, 13, 3, 8);    // 左手垂
      ctx.fillRect(17, 13, 4, 4);   // 右手前伸
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, 21, 3, 2);
      ctx.fillRect(20, 13, 2, 4);
      ctx.fillStyle = high ? '#ffffff' : '#c0c0c0';  // 物品
      ctx.fillRect(21, 14, 2, 2);
      break;
    case 'farmer':
      // 弯腰挥锄：phase 1 锄向下
      if (high) {
        ctx.fillRect(7, 11, 2, 8); ctx.fillRect(15, 11, 2, 8);
        ctx.fillStyle = palette.skin; ctx.fillRect(7, 19, 2, 2); ctx.fillRect(15, 19, 2, 2);
        ctx.fillStyle = '#8b6914'; ctx.fillRect(13, 5, 2, 8);    // 锄柄
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(11, 3, 6, 2);    // 锄头
      } else {
        ctx.fillRect(6, 14, 3, 8); ctx.fillRect(16, 14, 3, 8);
        ctx.fillStyle = palette.skin; ctx.fillRect(6, 22, 3, 2); ctx.fillRect(16, 22, 3, 2);
        ctx.fillStyle = '#8b6914'; ctx.fillRect(14, 18, 2, 8);
        ctx.fillStyle = '#3a2a1a'; ctx.fillRect(13, 24, 5, 2);
      }
      break;
    case 'artist':
      // 画笔前挥：phase 切换笔位置
      ctx.fillRect(5, 14, 3, 7);
      ctx.fillStyle = palette.skin; ctx.fillRect(5, 21, 3, 2);
      ctx.fillStyle = palette.clothes;
      ctx.fillRect(17, 12, 3, 6);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(20, high ? 11 : 13, 2, 2);
      ctx.fillStyle = '#8b3a3a';          // 画笔
      ctx.fillRect(22, high ? 10 : 12, 1, 3);
      break;
    case 'merchant':
    case 'innkeeper':
      // 双手前抬（端货/擦杯）
      ctx.fillRect(7, 13, 3, 6);
      ctx.fillRect(15, 13, 3, 6);
      ctx.fillStyle = palette.skin; ctx.fillRect(7, 19, 3, 2); ctx.fillRect(15, 19, 3, 2);
      // 物品：杯子/账本
      ctx.fillStyle = role === 'innkeeper' ? '#d4a574' : '#e8c890';
      const offY = high ? -1 : 1;
      ctx.fillRect(9, 16 + offY, 6, 4);
      break;
    case 'child':
      // 跳跃挥手：phase 1 跳起
      const dy = high ? -2 : 0;
      ctx.fillRect(5, 13 + dy, 3, 8); ctx.fillRect(16, 9 + dy, 3, 8);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, 21 + dy, 3, 2); ctx.fillRect(16, 7 + dy, 3, 2);
      break;
    case 'elder':
      // 静坐读书，手捧书本，几乎不动
      ctx.fillRect(7, 13, 3, 6);
      ctx.fillRect(14, 13, 3, 6);
      ctx.fillStyle = palette.skin; ctx.fillRect(7, 19, 3, 2); ctx.fillRect(14, 19, 3, 2);
      ctx.fillStyle = high ? '#e8c890' : '#d4a060';   // 书页
      ctx.fillRect(8, 16, 8, 4);
      ctx.fillStyle = '#3a2a1a';
      ctx.fillRect(11, 16, 1, 4);
      break;
    case 'pilot':
    case 'security':
      // 双手前伸（操控/警戒）
      ctx.fillRect(7, 13, 3, 5); ctx.fillRect(15, 13, 3, 5);
      ctx.fillStyle = palette.skin; ctx.fillRect(7, 17, 3, 2); ctx.fillRect(15, 17, 3, 2);
      ctx.fillStyle = high ? '#4a9eff' : '#2a6abf';
      ctx.fillRect(9, 14, 6, 3);
      break;
    default:
      // 通用版：phase 切换手臂高低
      const ly = high ? 11 : 13;
      const ry = high ? 11 : 13;
      ctx.fillRect(5, ly, 3, 8); ctx.fillRect(16, ry, 3, 8);
      ctx.fillStyle = palette.skin;
      ctx.fillRect(5, ly + 8, 3, 2); ctx.fillRect(16, ry + 8, 3, 2);
      break;
  }
}

// ====== Utility ======

function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (v) => Math.max(0, Math.floor(v * factor)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hashPalette(palette) {
  return Object.values(palette).join('').replace(/#/g, '');
}
