// Pixel Tileset Generator — Theme-specific 32x32 tile generation
// All tiles are programmatically rendered via Canvas, no external assets needed

export const TILE_SIZE = 32;

// ====== Theme Color Palettes ======

const THEMES = {
  medieval: {
    name: '中世纪小镇',
    bg: '#1a1410',
    floor: ['#8b6914', '#7a5c12', '#6b4f10', '#5c4410'],
    wall: ['#6b5b4f', '#5c4d42', '#4d3f37', '#3e322a'],
    wood: ['#a0724a', '#8b5e3c', '#764d2e', '#613d20'],
    accent: '#c49a6c',
    detail: '#3d2b1a',
    roof: '#8b3a3a',
    plant: '#3d6b3d',
    water: '#4a7a9b',
  },
  space: {
    name: '空间站',
    bg: '#0a0a14',
    floor: ['#3a3a4a', '#2e2e3e', '#222232', '#1a1a28'],
    wall: ['#5a5a6e', '#4a4a5e', '#3e3e50', '#303042'],
    metal: ['#7a7a8e', '#6a6a7e', '#5a5a6e', '#4a4a5e'],
    wood: ['#6a6a7e', '#5a5a6e', '#4a4a5e', '#3a3a4a'],
    accent: '#4a9eff',
    detail: '#1a1a28',
    roof: '#2a2a3a',
    plant: '#2a5a2a',
    water: '#3a6a9a',
  },
  ocean: {
    name: '深海殖民地',
    bg: '#0a1a2a',
    floor: ['#3a7a6a', '#2e6a5e', '#225a50', '#1a4a42'],
    wall: ['#5a8a9a', '#4a7a8a', '#3e6a7a', '#30606a'],
    metal: ['#6a8a7a', '#5a7a6a', '#4a6a5a', '#3a5a4a'],
    wood: ['#5a7a6a', '#4a6a5a', '#3a5a4a', '#2a4a3a'],
    accent: '#5ad4b8',
    detail: '#1a2a2a',
    roof: '#2a5a6a',
    plant: '#3a8a5a',
    water: '#2a6a9a',
  },
  cyberpunk: {
    name: '赛博朋克之城',
    bg: '#0a0a0a',
    floor: ['#2a2a3a', '#222232', '#1a1a28', '#121220'],
    wall: ['#4a3a5a', '#3e2e4e', '#322242', '#261a36'],
    metal: ['#5a4a6a', '#4a3a5a', '#3e2e4e', '#322242'],
    wood: ['#4a3a5a', '#3e2e4e', '#322242', '#261a36'],
    accent: '#ff4ac8',
    detail: '#1a0a1a',
    roof: '#2a1a3a',
    plant: '#1a3a1a',
    water: '#2a1a4a',
  },
  office: {
    name: '办公室',
    bg: '#1a1c20',
    floor: ['#bcb8b0', '#a8a49c', '#969088', '#84807a'],
    wall: ['#dad6d0', '#c8c4be', '#b8b4ae', '#a8a49e'],
    metal: ['#8a8e94', '#7a7e84', '#6a6e74', '#5a6064'],
    wood: ['#9a8a72', '#866d52', '#6e573e', '#5a4530'],
    accent: '#4a9eff',
    detail: '#2c2e32',
    roof: '#3a4452',
    plant: '#3d8a5d',
    water: '#4a8eba'
  }
};

// ====== Helper: create offscreen canvas ======

function createTileCanvas(width = TILE_SIZE, height = TILE_SIZE) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  return c;
}

// ====== Tile Generators ======

function genFloorTile(theme, variant = 0) {
  const c = createTileCanvas();
  const ctx = c.getContext('2d');
  const colors = theme.floor;
  const base = colors[variant % colors.length];

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Add subtle grain/texture
  for (let i = 0; i < 8; i++) {
    const x = Math.floor((i * 7 + variant * 13) % TILE_SIZE);
    const y = Math.floor((i * 11 + variant * 17) % TILE_SIZE);
    ctx.fillStyle = i % 2 === 0 ? colors[(variant + 1) % colors.length] : colors[(variant + 2) % colors.length];
    ctx.fillRect(x, y, 2, 2);
  }

  // Plank lines (horizontal only for medieval wood)
  if (variant % 3 === 0) {
    ctx.fillStyle = theme.detail;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(0, TILE_SIZE / 2 - 1, TILE_SIZE, 1);
    ctx.globalAlpha = 1;
  }

  return c;
}

function genWallTile(theme, variant = 0) {
  const c = createTileCanvas();
  const ctx = c.getContext('2d');
  const colors = theme.wall;
  const base = colors[variant % colors.length];

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Brick pattern
  const brickH = TILE_SIZE / 4;
  const brickW = TILE_SIZE / 2;
  for (let row = 0; row < 4; row++) {
    const y = row * brickH;
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = 0; col < 3; col++) {
      const x = col * brickW + offset - (offset > 0 && col === 2 ? brickW : 0);
      if (x >= -2 && x < TILE_SIZE + 2) {
        ctx.fillStyle = colors[(variant + row + col) % colors.length];
        ctx.fillRect(x + 1, y + 1, brickW - 1, brickH - 1);
      }
    }
  }

  return c;
}

function genMetalTile(theme, variant = 0) {
  const c = createTileCanvas();
  const ctx = c.getContext('2d');
  const colors = theme.metal || theme.wall;
  const base = colors[variant % colors.length];

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Rivets
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(4, 4, 4, 4);
  ctx.fillRect(TILE_SIZE - 8, 4, 4, 4);
  ctx.fillRect(4, TILE_SIZE - 8, 4, 4);
  ctx.fillRect(TILE_SIZE - 8, TILE_SIZE - 8, 4, 4);
  ctx.globalAlpha = 1;

  return c;
}

function genDirtTile(theme) {
  const c = createTileCanvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = theme.floor[0];
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  // Random dirt specks
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = i % 3 === 0 ? theme.floor[2] : theme.detail;
    ctx.globalAlpha = 0.3 + (i % 3) * 0.1;
    ctx.fillRect(
      Math.floor((i * 17 + 5) % TILE_SIZE),
      Math.floor((i * 23 + 7) % TILE_SIZE),
      2 + (i % 3), 1 + (i % 2)
    );
  }
  ctx.globalAlpha = 1;
  return c;
}

// ====== Furniture Generators ======

function drawTable(ctx, x, y, w, h, theme) {
  // Table top
  ctx.fillStyle = theme.wood[0];
  ctx.fillRect(x, y, w, h * 0.3);
  // Edge highlight
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x, y, w, 2);
  ctx.globalAlpha = 1;
  // Legs
  ctx.fillStyle = theme.wood[2];
  ctx.fillRect(x + 4, y + h * 0.3, 3, h * 0.7);
  ctx.fillRect(x + w - 7, y + h * 0.3, 3, h * 0.7);
}

function drawChair(ctx, x, y, w, h, theme) {
  // Seat
  ctx.fillStyle = theme.wood[1];
  ctx.fillRect(x, y + h * 0.3, w, h * 0.15);
  // Back
  ctx.fillStyle = theme.wood[0];
  ctx.fillRect(x + 2, y, w * 0.25, h * 0.4);
  // Legs
  ctx.fillStyle = theme.wood[3];
  ctx.fillRect(x + 2, y + h * 0.45, 2, h * 0.55);
  ctx.fillRect(x + w - 4, y + h * 0.45, 2, h * 0.55);
}

function drawBarrel(ctx, x, y, w, h, theme) {
  ctx.fillStyle = theme.wood[0];
  ctx.fillRect(x + 2, y, w - 4, h);
  // Barrel bands
  ctx.fillStyle = theme.detail;
  ctx.fillRect(x, y + h * 0.2, w, 3);
  ctx.fillRect(x, y + h * 0.7, w, 3);
  // Highlight
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.2;
  ctx.fillRect(x + 3, y + 2, w - 6, h * 0.3);
  ctx.globalAlpha = 1;
}

function drawLantern(ctx, x, y, w, h, theme) {
  // Chain
  ctx.fillStyle = theme.detail;
  ctx.fillRect(x + w/2 - 1, y - 6, 2, 6);
  // Body
  ctx.fillStyle = '#f5c764';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x, y, w, h);
  // Glow
  ctx.fillStyle = '#ffdc8a';
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.globalAlpha = 1;
  // Frame
  ctx.strokeStyle = theme.wood[2];
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

function drawConsole(ctx, x, y, w, h, theme) {
  // Desk
  ctx.fillStyle = theme.metal[0];
  ctx.fillRect(x, y + h * 0.5, w, h * 0.5);
  // Screen
  ctx.fillStyle = '#1a2a3a';
  ctx.fillRect(x + 3, y, w - 6, h * 0.5);
  // Screen glow
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x + 5, y + 2, w - 10, h * 0.3);
  ctx.globalAlpha = 1;
  // Decorative dots
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i === 0 ? '#ff4444' : i === 1 ? '#44ff44' : '#4444ff';
    ctx.fillRect(x + 16 + i * 6, y + h * 0.55, 3, 3);
  }
}

function drawCoral(ctx, x, y, w, h, theme) {
  ctx.fillStyle = '#e8927c';
  const cx = x + w/2, base = y + h;
  // Branching coral
  for (let i = 0; i < 5; i++) {
    const angle = -Math.PI/2 + (i - 2) * 0.4;
    const len = h * (0.5 + (i % 3) * 0.2);
    ctx.beginPath();
    ctx.moveTo(cx, base);
    for (let j = 0; j < 3; j++) {
      const px = cx + Math.cos(angle) * len * (j + 1) / 3 + (j - 1) * 3;
      const py = base - len * (j + 1) / 3 + (j % 2) * 5;
      ctx.lineTo(px, py);
    }
    ctx.strokeStyle = i < 2 ? '#e8927c' : '#c87060';
    ctx.lineWidth = 2 + (i % 2);
    ctx.stroke();
  }
}

function drawNeonSign(ctx, x, y, w, h, theme) {
  // Bracket
  ctx.fillStyle = theme.metal[0];
  ctx.fillRect(x + w/2 - 2, y - 4, 4, 4);
  // Sign board
  ctx.fillStyle = theme.detail;
  ctx.fillRect(x, y, w, h);
  // Neon glow
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  // Sign text area
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  ctx.globalAlpha = 1;
  // Blinking dots
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x + 8, y + h/2 - 1, 3, 3);
  ctx.fillRect(x + w - 12, y + h/2 - 1, 3, 3);
}

function drawHologram(ctx, x, y, w, h, theme) {
  // Base
  ctx.fillStyle = theme.metal[2];
  ctx.fillRect(x + w/2 - 6, y + h - 6, 12, 6);
  // Beam
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x + w/2 - 3, y + 4, 6, h - 10);
  // Hologram projection
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = theme.accent;
  ctx.fillRect(x + 4, y, w - 8, h * 0.5);
  ctx.globalAlpha = 1;
}

function drawBed(ctx, x, y, w, h, theme) {
  // Frame
  ctx.fillStyle = theme.wood[1];
  ctx.fillRect(x, y + h * 0.3, w, h * 0.7);
  // Mattress
  ctx.fillStyle = '#c8c0b8';
  ctx.fillRect(x + 2, y + h * 0.3 + 2, w - 4, h * 0.5);
  // Pillow
  ctx.fillStyle = '#e8e0d8';
  ctx.fillRect(x + 4, y + h * 0.2, w * 0.3, h * 0.2);
  // Blanket
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x + 2, y + h * 0.4, w - 4, h * 0.3);
  ctx.globalAlpha = 1;
}

function drawPlant(ctx, x, y, w, h, theme) {
  // Pot
  ctx.fillStyle = theme.wood[2];
  ctx.fillRect(x + w/2 - 4, y + h * 0.6, 8, h * 0.4);
  // Leaves
  ctx.fillStyle = theme.plant;
  ctx.globalAlpha = 0.8;
  for (let i = 0; i < 4; i++) {
    const lx = x + w/2 + (i - 1.5) * 5;
    ctx.fillRect(lx, y + h * 0.15 + i * 3, 3, h * 0.4);
    ctx.fillRect(lx + 3, y + h * 0.2 + i * 2, 2, h * 0.3);
  }
  ctx.globalAlpha = 1;
}

function drawDesk(ctx, x, y, w, h, theme) {
  // 工位桌
  ctx.fillStyle = theme.wood[0];
  ctx.fillRect(x, y, w, h * 0.4);
  // 桌沿
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(x, y, w, 2);
  ctx.globalAlpha = 1;
  // 桌腿
  ctx.fillStyle = theme.metal[2];
  ctx.fillRect(x + 2, y + h * 0.4, 2, h * 0.6);
  ctx.fillRect(x + w - 4, y + h * 0.4, 2, h * 0.6);
  // 显示器
  ctx.fillStyle = '#0a0a14';
  ctx.fillRect(x + w/2 - 8, y - 8, 16, 10);
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(x + w/2 - 7, y - 7, 14, 8);
  ctx.globalAlpha = 1;
  // 显示器底座
  ctx.fillStyle = theme.metal[1];
  ctx.fillRect(x + w/2 - 4, y + 2, 8, 2);
}

function drawWhiteboard(ctx, x, y, w, h, theme) {
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(x, y, w, h * 0.85);
  ctx.strokeStyle = theme.metal[1];
  ctx.strokeRect(x, y, w, h * 0.85);
  // 几条线
  ctx.fillStyle = '#3a6abf';
  ctx.fillRect(x + 4, y + 4, w * 0.55, 1);
  ctx.fillStyle = '#bf3a3a';
  ctx.fillRect(x + 4, y + 8, w * 0.7, 1);
  ctx.fillStyle = '#3aafbf';
  ctx.fillRect(x + 4, y + 12, w * 0.4, 1);
  // 笔架
  ctx.fillStyle = theme.metal[0];
  ctx.fillRect(x, y + h * 0.85, w, h * 0.15);
}

function drawWaterCooler(ctx, x, y, w, h, theme) {
  // 桶身
  ctx.fillStyle = '#a8d8f0';
  ctx.fillRect(x + 2, y, w - 4, h * 0.45);
  ctx.fillStyle = '#88c8e0';
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x + 4, y + 4, w - 8, h * 0.35);
  ctx.globalAlpha = 1;
  // 底座
  ctx.fillStyle = theme.metal[1];
  ctx.fillRect(x, y + h * 0.45, w, h * 0.55);
  // 水龙头
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x + w/2 - 1, y + h * 0.55, 2, 4);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x + w/2 - 3, y + h * 0.6, 6, 2);
}

function drawPrinter(ctx, x, y, w, h, theme) {
  ctx.fillStyle = theme.metal[0];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = theme.detail;
  ctx.fillRect(x, y + h - 4, w, 2);
  ctx.fillStyle = '#f5f5f0';
  ctx.fillRect(x + 3, y - 4, w - 6, 5);   // 出纸口
  ctx.fillStyle = '#4aff88';                // 工作指示灯
  ctx.fillRect(x + w - 6, y + 4, 3, 3);
}

function drawSofa(ctx, x, y, w, h, theme) {
  ctx.fillStyle = '#5a4a6a';
  ctx.fillRect(x, y + h * 0.4, w, h * 0.6);
  // 靠垫
  ctx.fillStyle = '#7a6a8a';
  ctx.fillRect(x, y, w, h * 0.4);
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(x + 4, y + 4, w - 8, h * 0.32);
  ctx.globalAlpha = 1;
}

function drawCounter(ctx, x, y, w, h, theme) {
  // Base
  ctx.fillStyle = theme.wood[0];
  ctx.fillRect(x, y + h * 0.4, w, h * 0.6);
  // Counter top
  ctx.fillStyle = theme.wood[1];
  ctx.fillRect(x - 2, y + h * 0.35, w + 4, 5);
  // Items on counter
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x + 10, y + h * 0.25, 8, h * 0.15);
  ctx.fillRect(x + w - 20, y + h * 0.2, 6, h * 0.2);
  ctx.globalAlpha = 1;
}

// ====== Export helpers ======

export function getTileset(themeName) {
  const theme = THEMES[themeName] || THEMES.medieval;
  return {
    floor: [0, 1, 2, 3].map(v => genFloorTile(theme, v)),
    wall: [0, 1, 2, 3].map(v => genWallTile(theme, v)),
    metal: [0, 1, 2, 3].map(v => genMetalTile(theme, v)),
    dirt: genDirtTile(theme),
  };
}

export function getThemePalette(themeName) {
  return THEMES[themeName] || THEMES.medieval;
}

export function drawFurniture(ctx, type, x, y, w, h, theme) {
  const th = theme || THEMES.medieval;
  switch (type) {
    case 'table': drawTable(ctx, x, y, w, h, th); break;
    case 'chair': drawChair(ctx, x, y, w, h, th); break;
    case 'barrel': drawBarrel(ctx, x, y, w, h, th); break;
    case 'lantern': drawLantern(ctx, x, y, w, h, th); break;
    case 'console': drawConsole(ctx, x, y, w, h, th); break;
    case 'coral': drawCoral(ctx, x, y, w, h, th); break;
    case 'neon_sign': drawNeonSign(ctx, x, y, w, h, th); break;
    case 'hologram': drawHologram(ctx, x, y, w, h, th); break;
    case 'bed': drawBed(ctx, x, y, w, h, th); break;
    case 'plant': drawPlant(ctx, x, y, w, h, th); break;
    case 'counter': drawCounter(ctx, x, y, w, h, th); break;
    case 'desk': drawDesk(ctx, x, y, w, h, th); break;
    case 'whiteboard': drawWhiteboard(ctx, x, y, w, h, th); break;
    case 'cooler': drawWaterCooler(ctx, x, y, w, h, th); break;
    case 'printer': drawPrinter(ctx, x, y, w, h, th); break;
    case 'sofa': drawSofa(ctx, x, y, w, h, th); break;
  }
}
