(function () {
  'use strict';
  const SN = window.SN = window.SN || {};

  const WHITE = [255, 246, 224];
  const WARM = [255, 208, 168];
  const COOL = [196, 224, 255];
  const PAR = [0.016, 0.045, 0.1];
  const DRIFT = [0.008, 0.016, 0.028];

  const sprites = {};
  function spriteFor(c) {
    const k = c[0] + ',' + c[1] + ',' + c[2];
    if (sprites[k]) return sprites[k];
    const s = 64;
    const el = document.createElement('canvas');
    el.width = el.height = s;
    const g = el.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(' + k + ',1)');
    grd.addColorStop(0.28, 'rgba(' + k + ',0.35)');
    grd.addColorStop(1, 'rgba(' + k + ',0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    sprites[k] = el;
    return el;
  }

  function pickColor() {
    const r = Math.random();
    return r < 0.14 ? WARM : r < 0.22 ? COOL : WHITE;
  }

  function make(layer) {
    const size = SN.size;
    const far = layer === 0;
    return {
      layer: layer,
      x: Math.random() * size.w,
      y: Math.random() * size.h,
      color: pickColor(),
      r: far ? 0.35 + Math.random() * 0.55 : layer === 1 ? 0.7 + Math.random() * 0.8 : 1.3 + Math.random() * 2.2,
      base: 0.3 + Math.random() * 0.6,
      ph: Math.random() * Math.PI * 2,
      tw: 0.6 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * DRIFT[layer] * 2,
      vy: (Math.random() - 0.5) * DRIFT[layer] * 2,
      glow: far ? Math.random() < 0.05 : layer === 1 ? Math.random() < 0.28 : true
    };
  }

  const stars = [];

  SN.starfield = {
    build(w, h) {
      stars.length = 0;
      const d = SN.cfg.density;
      const far = Math.round((w * h) / 9000 * d);
      const mid = Math.round((w * h) / 20000 * d);
      const near = Math.min(Math.round((w * h) / 60000 * d), 90);
      for (let i = 0; i < far; i++) stars.push(make(0));
      for (let i = 0; i < mid; i++) stars.push(make(1));
      for (let i = 0; i < near; i++) stars.push(make(2));
      SN.starCount = stars.length;
    },

    nearest(x, y, radius) {
      let best = null;
      let bd = radius * radius;
      for (const s of stars) {
        const px = s._x !== undefined ? s._x : s.x;
        const py = s._y !== undefined ? s._y : s.y;
        const dx = px - x;
        const dy = py - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = s; }
      }
      return best;
    },

    draw(ctx, t) {
      const w = SN.size.w;
      const h = SN.size.h;
      const cfg = SN.cfg;
      const mx = SN.mouse.x - w / 2;
      const my = SN.mouse.y - h / 2;

      for (const s of stars) {
        let sx, sy;
        if (cfg.parallax) {
          sx = s.x - mx * PAR[s.layer];
          sy = s.y - my * PAR[s.layer];
        } else {
          sx = s.x;
          sy = s.y;
        }
        sx = ((sx + s.vx * t * 40) % w + w) % w;
        sy = ((sy + s.vy * t * 40) % h + h) % h;
        s._x = sx;
        s._y = sy;

        const a = s.base * (0.55 + 0.45 * Math.sin(t * s.tw + s.ph));

        if (s.golden) {
          ctx.globalAlpha = 0.55 + 0.4 * Math.sin(t * 1.3 + s.ph);
          const gs = spriteFor([255, 224, 150]);
          const g = s.r * 9 * cfg.glow;
          ctx.drawImage(gs, sx - g, sy - g, g * 2, g * 2);
          ctx.globalAlpha = 0.9 + 0.1 * Math.sin(t * 1.3 + s.ph);
          ctx.fillStyle = 'rgba(255,236,180,1)';
          ctx.beginPath();
          ctx.arc(sx, sy, s.r * 1.7, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        if (s.glow) {
          ctx.globalAlpha = a * 0.5 * cfg.glow;
          const sp = spriteFor(s.color);
          const g = s.r * 7;
          ctx.drawImage(sp, sx - g, sy - g, g * 2, g * 2);
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(' + s.color[0] + ',' + s.color[1] + ',' + s.color[2] + ',1)';
        ctx.fillRect(sx - s.r * 0.5, sy - s.r * 0.5, s.r, s.r);
      }
      ctx.globalAlpha = 1;

      if (cfg.lines) drawLines(ctx);
    }
  };

  function drawLines(ctx) {
    const mids = [];
    for (const s of stars) {
      if (s.layer === 1 && s._x !== undefined) mids.push(s);
    }
    const R = 130;
    let count = 0;
    for (let i = 0; i < mids.length && count < 120; i++) {
      const a = mids[i];
      for (let j = i + 1; j < mids.length && count < 120; j++) {
        const b = mids[j];
        const dx = a._x - b._x;
        const dy = a._y - b._y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2);
          ctx.globalAlpha = (1 - d / R) * 0.16;
          ctx.strokeStyle = 'rgba(190,220,255,1)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a._x, a._y);
          ctx.lineTo(b._x, b._y);
          ctx.stroke();
          count++;
        }
      }
    }
    ctx.globalAlpha = 1;
  }
})();
