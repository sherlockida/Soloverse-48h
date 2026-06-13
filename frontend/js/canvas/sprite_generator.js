// Sprite Generator — Full 24×32 pixel sprite pipeline
// Generates character sprites programmatically from (role, colorPalette)
// Cached by `${role}_${hash}` for performance
// SPRITE_W / SPRITE_H 由 sprite_parts.js 顶层声明，本文件直接复用

// Global cache
const spriteCache = new Map();

function generateSprite(role, palette, frame = 0, mode = 'walk') {
  const key = `${role}_${hashPalette(palette)}_${mode}_f${frame}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const c = document.createElement('canvas');
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext('2d');

  // Draw order: back to front
  drawHair(ctx, palette, role);       // hair behind head
  drawHead(ctx, palette);             // face
  drawEyes(ctx, palette);             // eyes
  drawMouth(ctx, mode === 'work' ? 'neutral' : 'neutral');
  drawAccessory(ctx, palette, role);  // hat/glasses/etc
  drawTorso(ctx, palette, role);      // body
  if (mode === 'work') {
    drawArmsWork(ctx, palette, role, frame);
    drawLegs(ctx, palette, 0);        // 工作时下肢站立
  } else {
    drawArms(ctx, palette, frame);
    drawLegs(ctx, palette, frame);
  }

  spriteCache.set(key, c);
  return c;
}

function generateAllFrames(role, palette) {
  return {
    stand: generateSprite(role, palette, 0, 'walk'),
    walk1: generateSprite(role, palette, 1, 'walk'),
    walk2: generateSprite(role, palette, 2, 'walk'),
    walk3: generateSprite(role, palette, 3, 'walk'),
    work1: generateSprite(role, palette, 0, 'work'),
    work2: generateSprite(role, palette, 1, 'work'),
  };
}

function generatePreScaledSprite(role, palette, scale = 3, frame = 0) {
  const key = `${role}_${hashPalette(palette)}_f${frame}_s${scale}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const small = generateSprite(role, palette, frame);
  const sw = SPRITE_W * scale;
  const sh = SPRITE_H * scale;
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;  // Keep pixel-crisp look
  ctx.drawImage(small, 0, 0, sw, sh);
  spriteCache.set(key, c);
  return c;
}

function clearSpriteCache() {
  spriteCache.clear();
}
