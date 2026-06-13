// Speech Bubble — Rounded rect bubble with typewriter effect
// Renders above character sprites on the canvas
//
// ES Module

export class SpeechBubble {
  constructor(text, x, y, maxWidth = 200) {
    this.text = text || '';
    this.x = x;
    this.y = y;
    this.maxWidth = maxWidth;
    this.alpha = 0;
    this.scale = 0;
    this.typedChars = 0;
    this.typingSpeed = 40; // ms per char
    this.birth = performance.now();
    this.displayDuration = 5000; // ms to show after typing finishes
    this.lines = [];
    this.bubbleW = 0;
    this.bubbleH = 0;
    this.finished = false;
    this._wrapText();
  }

  _wrapText() {
    const maxCharsPerLine = Math.floor(this.maxWidth / 7);
    if (this.text.length <= maxCharsPerLine) {
      this.lines = [this.text];
    } else {
      this.lines = [];
      let remaining = this.text;
      while (remaining.length > 0) {
        if (remaining.length <= maxCharsPerLine) {
          this.lines.push(remaining);
          break;
        }
        this.lines.push(remaining.slice(0, maxCharsPerLine));
        remaining = remaining.slice(maxCharsPerLine);
      }
      if (this.lines.length > 3) {
        this.lines = this.lines.slice(0, 3);
        this.lines[2] = this.lines[2].slice(0, maxCharsPerLine - 2) + '…';
      }
    }
    this.bubbleW = Math.min(this.maxWidth, Math.max(...this.lines.map(l => l.length * 7)) + 16);
    this.bubbleH = this.lines.length * 16 + 16;
  }

  update(now) {
    if (this.finished) return;
    const age = now - this.birth;
    const totalChars = this.text.length;
    const typingEnd = totalChars * this.typingSpeed;

    this.scale = Math.min(1, age / 200);
    this.alpha = Math.min(1, age / 150);

    if (age < typingEnd) {
      this.typedChars = Math.floor(age / this.typingSpeed);
    } else {
      this.typedChars = totalChars;
    }

    if (age > typingEnd + this.displayDuration) {
      this.finished = true;
    }
  }

  render(ctx, cameraX = 0, cameraY = 0) {
    if (this.finished) return;
    let bx = this.x - cameraX - this.bubbleW / 2;
    let by = this.y - cameraY - this.bubbleH - 28;
    const canvasW = ctx.canvas.width;
    const canvasH = ctx.canvas.height;
    if (bx < 4) bx = 4;
    if (bx + this.bubbleW > canvasW - 4) bx = canvasW - this.bubbleW - 4;
    if (by < 4) by = this.y - cameraY + 30;
    if (by + this.bubbleH > canvasH - 4) by = canvasH - this.bubbleH - 4;
    const totalChars = this.text.length;

    ctx.save();
    ctx.globalAlpha = this.alpha;

    const cx = bx + this.bubbleW / 2;
    const cy = by + this.bubbleH / 2;
    ctx.translate(cx, cy);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-cx, -cy);

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, this.bubbleW, this.bubbleH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    let tailX = this.x - cameraX;
    tailX = Math.max(bx + 8, Math.min(bx + this.bubbleW - 8, tailX));
    ctx.moveTo(tailX - 5, by + this.bubbleH);
    ctx.lineTo(tailX, by + this.bubbleH + 8);
    ctx.lineTo(tailX + 5, by + this.bubbleH);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#3a2a1a';
    ctx.stroke();

    ctx.fillStyle = '#2a1a0a';
    ctx.font = '12px "Press Start 2P", "PingFang SC", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    let charsDrawn = 0;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const remaining = this.typedChars - charsDrawn;
      if (remaining <= 0) break;
      const visible = line.slice(0, remaining);
      ctx.fillText(visible, bx + 8, by + 8 + i * 16);
      charsDrawn += line.length;
    }

    if (this.typedChars < totalChars && Math.floor(performance.now() / 400) % 2 === 0) {
      const lastLineIdx = Math.min(this.lines.length - 1,
        Math.floor(this.typedChars / (this.maxWidth / 7)));
      ctx.fillStyle = '#2a1a0a';
      ctx.fillText('|', bx + 8 + (this.typedChars % (this.maxWidth / 7)) * 7,
        by + 8 + lastLineIdx * 16);
    }

    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
