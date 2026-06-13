// Room Renderer — Composites room background from tileset + furniture
//
// ES Module

import { ROOM_COLS, ROOM_ROWS, TILE, getRoomLayout } from './room_layouts.js';
import { getThemePalette, getTileset, drawFurniture } from './tileset.js';

export { ROOM_COLS, ROOM_ROWS, TILE };

export function renderRoom(themeName, placeName, places, canvas) {
  const ctx = canvas.getContext('2d');
  const theme = getThemePalette(themeName);
  const ts = getTileset(themeName);
  const layout = getRoomLayout(themeName, placeName, places);
  const cols = ROOM_COLS;
  const rows = ROOM_ROWS;

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let r = 0; r < rows && r < layout.floor.length; r++) {
    for (let c = 0; c < cols && c < (layout.floor[r] || []).length; c++) {
      const variant = layout.floor[r][c];
      const tileImg = ts.floor[variant % ts.floor.length];
      if (tileImg) {
        ctx.drawImage(tileImg, c * TILE, r * TILE);
      }
    }
  }

  ctx.fillStyle = theme.wall[0];
  ctx.fillRect(0, 0, canvas.width, TILE);
  for (let c = 0; c < cols; c++) {
    const wt = ts.wall[c % ts.wall.length];
    if (wt) ctx.drawImage(wt, c * TILE, 0);
  }

  ctx.fillStyle = theme.wall[1];
  ctx.fillRect(0, TILE, 2, canvas.height - TILE);
  ctx.fillRect(canvas.width - 2, TILE, 2, canvas.height - TILE);

  for (const furn of (layout.furniture || [])) {
    drawFurniture(ctx, furn.type, furn.x, furn.y, furn.w, furn.h, theme);
  }

  canvas._placeName = placeName;
  canvas._theme = theme;
}

// Pre-render a room to an offscreen canvas for caching
const roomCache = new Map();

export function getOrRenderRoom(theme, placeName, places) {
  const key = `${theme}_${placeName}`;
  if (roomCache.has(key)) return roomCache.get(key);

  const c = document.createElement('canvas');
  c.width = ROOM_COLS * TILE;
  c.height = ROOM_ROWS * TILE;
  renderRoom(theme, placeName, places, c);
  roomCache.set(key, c);
  return c;
}

export function clearRoomCache() {
  roomCache.clear();
}
