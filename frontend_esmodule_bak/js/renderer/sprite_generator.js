// Sprite Generator — Full 24x32 pixel sprite pipeline
// Generates character sprites programmatically from (role, colorPalette)
// Cached by `${role}_${hash}` for performance
//
// ES Module — imports sprite_parts drawing primitives

import { SPRITE_W, SPRITE_H, hashPalette } from './sprite_parts.js';
import {
  drawHair, drawHead, drawEyes, drawMouth, drawAccessory,
  drawTorso, drawArms, drawArmsWork, drawLegs,
} from './sprite_parts.js';
import { mergePalette } from './sprite_palettes.js';

// Global cache
const spriteCache = new Map();

export function generateSprite(role, palette, frame = 0, mode = 'walk') {
  const key = `${role}_${hashPalette(palette)}_${mode}_f${frame}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const c = document.createElement('canvas');
  c.width = SPRITE_W;
  c.height = SPRITE_H;
  const ctx = c.getContext('2d');

  // Draw order: back to front
  drawHair(ctx, palette, role);
  drawHead(ctx, palette);
  drawEyes(ctx, palette);
  drawMouth(ctx, mode === 'work' ? 'neutral' : 'neutral');
  drawAccessory(ctx, palette, role);
  drawTorso(ctx, palette, role);
  if (mode === 'work') {
    drawArmsWork(ctx, palette, role, frame);
    drawLegs(ctx, palette, 0);
  } else {
    drawArms(ctx, palette, frame);
    drawLegs(ctx, palette, frame);
  }

  spriteCache.set(key, c);
  return c;
}

export function generateAllFrames(role, palette) {
  return {
    stand: generateSprite(role, palette, 0, 'walk'),
    walk1: generateSprite(role, palette, 1, 'walk'),
    walk2: generateSprite(role, palette, 2, 'walk'),
    walk3: generateSprite(role, palette, 3, 'walk'),
    work1: generateSprite(role, palette, 0, 'work'),
    work2: generateSprite(role, palette, 1, 'work'),
  };
}

export function generatePreScaledSprite(role, palette, scale = 3, frame = 0) {
  const key = `${role}_${hashPalette(palette)}_f${frame}_s${scale}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const small = generateSprite(role, palette, frame);
  const sw = SPRITE_W * scale;
  const sh = SPRITE_H * scale;
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, sw, sh);
  spriteCache.set(key, c);
  return c;
}

export function clearSpriteCache() {
  spriteCache.clear();
}
