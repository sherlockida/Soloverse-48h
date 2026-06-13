// Character Sprite — Per-character sprite state, animation, and movement
// Manages frame selection, position interpolation, speech bubbles, and activities
//
// ES Module

import { SPRITE_W, SPRITE_H, SPRITE_SCALE, drawShadow } from './sprite_parts.js';
import { mergePalette } from './sprite_palettes.js';
import { generateAllFrames } from './sprite_generator.js';
import { SpeechBubble } from './speech_bubble.js';

export { SPRITE_W, SPRITE_H, SPRITE_SCALE };

export class CharacterSprite {
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
    this.flashUntil = 0;       // timestamp; > now means show flashing exclamation
    this.workPhase = 0;        // role-specific work animation phase
    this.faceDir = 1;           // 1 = right, -1 = left
    this.lastTalkPartnerX = 0; // used to face talk partner
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
      if (this.activity === 'work') {
        this.currentFrame = Math.floor(now / 350) % 2 === 0 ? 'work1' : 'work2';
        this.y = this.targetY + Math.sin(now / 400) * 0.5;
      } else if (this.activity === 'talk') {
        this.currentFrame = 'stand';
        this.y = this.targetY + Math.sin(now / 250) * 1.5;
      } else {
        this.currentFrame = 'stand';
        this.y = this.targetY + Math.sin(now / 800) * 1;
      }
    }

    // activity auto-decay
    if (this.activityTimer > 0) {
      this.activityTimer -= dt;
      if (this.activityTimer <= 0 && this.activity !== 'stand') {
        this.activity = 'stand';
      }
    }

    // BUG FIX [P1-T8]: Original code called `this.bubble.update(now)` here in
    // CharacterSprite.update(), AND the focus-mode Layer 2 also called
    // `sprite.bubble.update(t)` per frame, causing double update per frame.
    // This doubled the typing speed, making text appear twice as fast as intended.
    // Fix: only update bubble here in CharacterSprite.update(); the focus-mode
    // Layer 2 update callback that duplicated this call has been removed.
    // Bubble cleanup remains here.
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
