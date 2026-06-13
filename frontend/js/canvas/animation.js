// Animation Engine — Simple tween/promise-based animation system

// ====== Tween ======

function tween(start, end, duration, onUpdate, easing = 'easeInOutQuad') {
  return new Promise(resolve => {
    const t0 = performance.now();
    function step(now) {
      const elapsed = now - t0;
      const progress = Math.min(1, elapsed / duration);
      const eased = applyEasing(progress, easing);
      onUpdate(lerp(start, end, eased));
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        onUpdate(end);
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function lerp(a, b, t) {
  if (typeof a === 'number') return a + (b - a) * t;
  if (typeof a === 'object' && a !== null) {
    const result = {};
    for (const k of Object.keys(a)) {
      result[k] = lerp(a[k], b[k], t);
    }
    return result;
  }
  return a;
}

// ====== Easing functions ======

function applyEasing(t, name) {
  switch (name) {
    case 'linear': return t;
    case 'easeInQuad': return t * t;
    case 'easeOutQuad': return t * (2 - t);
    case 'easeInOutQuad': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'easeOutBack': {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    case 'easeOutBounce': {
      const n1 = 7.5625, d1 = 2.75;
      if (t < 1 / d1) return n1 * t * t;
      else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
      else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
      else return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
    default: return t;
  }
}

// ====== Character walk animation ======

const WALK_DURATION = 600; // ms per walk

async function animateWalk(sprite, fromX, fromY, toX, toY) {
  const frames = sprite.frames;
  const startTime = performance.now();
  const duration = WALK_DURATION;

  return new Promise(resolve => {
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // Position interpolation
      sprite.x = fromX + (toX - fromX) * progress;
      sprite.y = fromY + (toY - fromY) * progress + Math.sin(progress * Math.PI) * 6; // Hop

      // Walk frame cycling
      const cyclePhase = Math.floor(progress * 8) % 4;
      if (cyclePhase === 0) sprite.currentFrame = 'stand';
      else if (cyclePhase === 1 || cyclePhase === 3) sprite.currentFrame = 'walk1';
      else sprite.currentFrame = 'walk2';

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        sprite.x = toX;
        sprite.y = toY;
        sprite.currentFrame = 'stand';
        sprite.moving = false;
        resolve();
      }
    }
    sprite.moving = true;
    requestAnimationFrame(step);
  });
}

// ====== Bubble pop-in ======

async function animateBubblePop(bubble) {
  return tween(0, 1, 250, (v) => {
    bubble.scale = v;
    bubble.alpha = v;
  }, 'easeOutBack');
}

// ====== Fade out ======

async function animateFadeOut(obj, duration = 300) {
  return tween(1, 0, duration, (v) => {
    obj.alpha = v;
  }, 'easeInQuad');
}

// ====== Camera pan ======

async function animateCamera(camera, fromX, fromY, toX, toY, duration = 400) {
  return tween({x: fromX, y: fromY}, {x: toX, y: toY}, duration, (pos) => {
    camera.x = pos.x;
    camera.y = pos.y;
  }, 'easeInOutQuad');
}
