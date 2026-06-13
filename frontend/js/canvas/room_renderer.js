// Room Renderer — Composites room background from tileset + furniture

function renderRoom(themeName, placeName, places, canvas) {
  const ctx = canvas.getContext('2d');
  const theme = getThemePalette(themeName);
  const ts = getTileset(themeName);
  const layout = getRoomLayout(themeName, placeName, places);
  const cols = ROOM_COLS;
  const rows = ROOM_ROWS;

  // Clear to background color
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw floor tiles
  for (let r = 0; r < rows && r < layout.floor.length; r++) {
    for (let c = 0; c < cols && c < (layout.floor[r] || []).length; c++) {
      const variant = layout.floor[r][c];
      const tileImg = ts.floor[variant % ts.floor.length];
      if (tileImg) {
        ctx.drawImage(tileImg, c * TILE, r * TILE);
      }
    }
  }

  // Draw top wall row (row 0) — gives depth
  ctx.fillStyle = theme.wall[0];
  ctx.fillRect(0, 0, canvas.width, TILE);
  for (let c = 0; c < cols; c++) {
    const wt = ts.wall[c % ts.wall.length];
    if (wt) ctx.drawImage(wt, c * TILE, 0);
  }

  // Left and right wall borders
  ctx.fillStyle = theme.wall[1];
  ctx.fillRect(0, TILE, 2, canvas.height - TILE);
  ctx.fillRect(canvas.width - 2, TILE, 2, canvas.height - TILE);

  // Draw furniture (placed according to layout)
  for (const furn of (layout.furniture || [])) {
    const fx = furn.x;
    const fy = furn.y;
    const fw = furn.w ;
    const fh = furn.h ;
    drawFurniture(ctx, furn.type, fx, fy, fw, fh, theme);
  }

  // Save place name overlay position info for the renderer
  canvas._placeName = placeName;
  canvas._theme = theme;
}

// Pre-render a room to an offscreen canvas for caching
const roomCache = new Map();

function getOrRenderRoom(theme, placeName, places) {
  const key = `${theme}_${placeName}`;
  if (roomCache.has(key)) return roomCache.get(key);

  const c = document.createElement('canvas');
  c.width = ROOM_COLS * TILE;
  c.height = ROOM_ROWS * TILE;
  renderRoom(theme, placeName, places, c);
  roomCache.set(key, c);
  return c;
}

function clearRoomCache() {
  roomCache.clear();
}
