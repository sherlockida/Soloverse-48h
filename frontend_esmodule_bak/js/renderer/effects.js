// Scene Effects — Rain/snow/fire/blackout/alert/fog/blood/moonlight/celebration
// Particle-based visual effects overlaid on the canvas
//
// ES Module

import { SPRITE_W, SPRITE_H, SPRITE_SCALE } from './sprite_parts.js';

// Re-export SPRITE_SCALE used in activity icon drawing
export const _effectParticles = { rain: [], snow: [] };

export function drawSceneEffect(ctx, eff, t, w, h) {
  const intensity = Math.min(1, Math.max(0.2, eff.intensity || 0.8));
  switch (eff.kind) {
    case 'rain': {
      const count = Math.floor(60 * intensity);
      while (_effectParticles.rain.length < count) {
        _effectParticles.rain.push({
          x: Math.random() * w, y: Math.random() * h,
          vy: 6 + Math.random() * 4,
        });
      }
      ctx.strokeStyle = 'rgba(160,200,255,0.55)';
      ctx.lineWidth = 1;
      for (const p of _effectParticles.rain) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - 1, p.y + 6);
        ctx.stroke();
        p.y += p.vy;
        if (p.y > h) { p.y = -10; p.x = Math.random() * w; }
      }
      ctx.fillStyle = 'rgba(20,30,60,0.18)';
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'snow': {
      const count = Math.floor(50 * intensity);
      while (_effectParticles.snow.length < count) {
        _effectParticles.snow.push({
          x: Math.random() * w, y: Math.random() * h,
          vy: 0.5 + Math.random() * 1.2, r: 1 + Math.random() * 2,
          drift: Math.random() * Math.PI * 2,
        });
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const p of _effectParticles.snow) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.y += p.vy;
        p.x += Math.sin((t + p.drift * 1000) / 800) * 0.4;
        if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
      }
      break;
    }
    case 'fire': {
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, `rgba(255,90,30,${0.45 * intensity})`);
      grad.addColorStop(0.4, `rgba(255,150,40,${0.18 * intensity})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) {
        const x = ((t / 12) + i * 53) % w;
        const y = h - 10 - ((t / 8 + i * 37) % 60);
        ctx.fillStyle = `rgba(255,${180 + (i % 3) * 20},80,${0.4 + Math.sin(t / 100 + i) * 0.3})`;
        ctx.fillRect(x, y, 2, 2);
      }
      break;
    }
    case 'blackout':
    case 'night': {
      ctx.fillStyle = `rgba(0,0,16,${0.65 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'moonlight': {
      ctx.fillStyle = `rgba(80,90,160,${0.45 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(220,230,255,${0.15 * intensity})`;
      ctx.beginPath(); ctx.arc(w - 60, 40, 22, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'alert': {
      const pulse = 0.3 + Math.sin(t / 220) * 0.3;
      ctx.fillStyle = `rgba(255,0,0,${pulse * intensity * 0.35})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(255,0,0,${Math.min(1, pulse * 1.5)})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);
      break;
    }
    case 'fog': {
      ctx.fillStyle = `rgba(200,200,210,${0.35 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        const y = (h / 4) * i + (Math.sin(t / 1200 + i) * 18);
        ctx.fillStyle = `rgba(230,230,235,${0.18})`;
        ctx.fillRect(0, y, w, 18);
      }
      break;
    }
    case 'blood': {
      ctx.fillStyle = `rgba(140,0,0,${0.18 * intensity})`;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `rgba(180,0,0,${0.7})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      break;
    }
    case 'celebration': {
      for (let i = 0; i < 30; i++) {
        const x = ((t / 5) + i * 41) % w;
        const y = (((t / 3) + i * 23) % (h + 40)) - 10;
        ctx.fillStyle = ['#ff5a8a','#ffc764','#5ad4b8','#8aaaff','#b59cf0'][i % 5];
        ctx.fillRect(x, y, 3, 6);
      }
      break;
    }
  }
}

// Role -> work activity icon
export const ROLE_WORK_ICON = {
  doctor: '🩺', medic: '🩺', blacksmith: '⚒️', farmer: '🌾',
  artist: '🎨', merchant: '💰', innkeeper: '🍺', child: '🪁',
  elder: '📖', scientist: '🧪', engineer: '🔧', pilot: '🚀',
  botanist: '🌱', security: '🛡️', technician: '💻',
  boss: '👔', hr: '📋', designer: '🎨', salesperson: '💼',
  leader: '📈', veteran: '☕', intern: '📚',
};

export function drawActivityIcon(ctx, sprite, sx, sy, t) {
  const head = sy - 8;
  if (sprite.activity === 'work') {
    const icon = ROLE_WORK_ICON[sprite.role] || '⚙️';
    const bob = Math.sin(t / 250) * 3;
    ctx.font = '16px "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(icon, sx + SPRITE_W * SPRITE_SCALE / 2, head + bob);
    ctx.fillStyle = '#ffcc66';
    ctx.globalAlpha = 0.4 + Math.sin(t / 200) * 0.3;
    ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 - 8, head + 4, 2, 4);
    ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 + 6, head + 6, 2, 4);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  } else if (sprite.activity === 'talk') {
    ctx.fillStyle = '#4aff88';
    ctx.globalAlpha = 0.5 + Math.sin(t / 280) * 0.3;
    ctx.beginPath();
    ctx.arc(sx + SPRITE_W * SPRITE_SCALE / 2, head, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (sprite.activity === 'stand') {
    if (Math.sin((t + sprite.x * 13) / 1100) > 0.96) {
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.4;
      ctx.fillRect(sx + SPRITE_W * SPRITE_SCALE / 2 + 6, head + 14, 3, 1);
      ctx.globalAlpha = 1;
    }
  }
}
