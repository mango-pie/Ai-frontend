(function () {
  'use strict';
  const SN = window.SN = window.SN || {};

  const HUES = [
    [140, 255, 208],
    [120, 215, 255],
    [170, 160, 255],
    [255, 150, 220]
  ];

  const sprites = {};
  function ball(c) {
    const k = c.join(',');
    if (sprites[k]) return sprites[k];
    const s = 96;
    const el = document.createElement('canvas');
    el.width = el.height = s;
    const g = el.getContext('2d');
    const grd = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grd.addColorStop(0, 'rgba(' + k + ',0.9)');
    grd.addColorStop(0.5, 'rgba(' + k + ',0.28)');
    grd.addColorStop(1, 'rgba(' + k + ',0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    sprites[k] = el;
    return el;
  }

  let cv = null;
  let cx = null;
  let W = 0;
  let H = 0;

  const bands = [];
  function reset() {
    bands.length = 0;
    const n = SN.cfg.reduced ? 2 : 4;
    for (let i = 0; i < n; i++) {
      bands.push({
        hue: HUES[i % HUES.length],
        cx: 0.1 + Math.random() * 0.8,
        y: 0.02 + Math.random() * 0.28,
        amp: 0.03 + Math.random() * 0.08,
        wave: 1.4 + Math.random() * 1.6,
        speed: 0.25 + Math.random() * 0.5,
        width: 0.05 + Math.random() * 0.06,
        off: Math.random() * Math.PI * 2
      });
    }
  }

  SN.aurora = {
    build(w, h) {
      W = Math.max(2, Math.round(w / 4));
      H = Math.max(2, Math.round(h / 3));
      if (!cv) {
        cv = document.createElement('canvas');
        cx = cv.getContext('2d');
      }
      cv.width = W;
      cv.height = H;
      if (!bands.length) reset();
    },

    draw(t) {
      if (!cv) return;
      const inten = SN.cfg.aurora;
      cx.clearRect(0, 0, W, H);
      if (inten <= 0) return;
      cx.globalCompositeOperation = 'lighter';
      for (const b of bands) {
        const alpha = 0.32 * inten;
        const step = 6;
        for (let x = -40; x <= W + 40; x += step) {
          const p = (x / W) * Math.PI * 2 * b.wave + t * b.speed + b.off;
          const y = b.y * H + Math.sin(p) * b.amp * H + Math.sin(p * 0.47 + t * 0.6) * b.amp * 0.5 * H;
          const r = b.width * W * (0.7 + 0.4 * Math.sin(p * 1.6));
          cx.globalAlpha = alpha * (0.7 + 0.3 * Math.sin(p * 1.9 + 1.3));
          cx.drawImage(ball(b.hue), x - r, y - r, r * 2, r * 2);
        }
      }
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = 'source-over';
    },

    blit(ctx) {
      if (!cv) return;
      const w = SN.size.w;
      const h = SN.size.h;
      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = SN.cfg.reduced ? 'blur(10px)' : 'blur(24px)';
      ctx.drawImage(cv, 0, 0, W, H, 0, 0, w, h);
      ctx.filter = 'none';
    }
  };
})();
