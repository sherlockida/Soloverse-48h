// Canvas Engine — requestAnimationFrame game loop with layer compositing
// This is the heart of the rendering system

class CanvasEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.layers = [];
    this.running = false;
    this.lastTime = 0;
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop() {
    this.running = false;
  }

  loop(timestamp) {
    if (!this.running) return;
    const dt = Math.min(timestamp - this.lastTime, 100); // Cap at 100ms to avoid spiral
    this.lastTime = timestamp;

    // FPS counter
    this.frameCount++;
    if (timestamp - this.fpsTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTime = timestamp;
    }

    this.update(dt, timestamp);
    this.render(timestamp);
    requestAnimationFrame(t => this.loop(t));
  }

  update(dt, timestamp) {
    for (const layer of this.layers) {
      if (layer.update) {
        layer.update(dt, timestamp);
      }
    }
  }

  render(timestamp) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Render layers bottom to top
    for (const layer of this.layers) {
      if (layer.render) {
        layer.render(ctx, timestamp);
      }
    }
  }

  addLayer(layer, index = -1) {
    if (index < 0 || index >= this.layers.length) {
      this.layers.push(layer);
    } else {
      this.layers.splice(index, 0, layer);
    }
  }

  removeLayer(layer) {
    const idx = this.layers.indexOf(layer);
    if (idx >= 0) this.layers.splice(idx, 1);
  }

  clearLayers() {
    this.layers = [];
  }
}
