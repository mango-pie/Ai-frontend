(function () {
  'use strict';
  const SN = window.SN = window.SN || {};

  const ripples = [];
  const sparks = [];
  const meteors = [];

  const goldSprite = (function () {
    const s = 96;
    const el = document.createElement('canvas');
    el.width = el.height = s;
    const g = el.getContext('2d');
    const grd = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grd.addColorStop(0, 'rgba(255,236,180,1)');
    grd.addColorStop(0.4, 'rgba(255,224,150,0.4)');
    grd.addColorStop(1, 'rgba(255,224,150,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return el;
  })();

  function spawnRipple(x, y) {
    ripples.push({ x: x, y: y, r: 4, max: 70 + Math.random() * 60, life: 0, maxLife: 1.1, ph: Math.random() * Math.PI * 2 });
  }

  function burst(x, y, n, color) {
    const c = color || null;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 160;
      sparks.push({
        x: x, y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        max: 0.6 + Math.random() * 0.7,
        size: 1 + Math.random() * 2,
        color: c
      });
    }
  }

  function spawnMeteor(speedBoost) {
    const w = SN.size.w;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const ang = Math.PI / 2 + dir * (0.15 + Math.random() * 0.35);
    const base = (1100 + Math.random() * 700) * (speedBoost || 1);
    meteors.push({
      x: Math.random() * w,
      y: -30,
      vx: Math.cos(ang) * base,
      vy: Math.sin(ang) * base,
      life: 0,
      max: 1.3 + Math.random() * 0.6,
      warm: Math.random() < 0.55
    });
  }

  function meteorShower(n) {
    for (let i = 0; i < n; i++) {
      setTimeout(function () { spawnMeteor(1.4); }, i * 90);
    }
  }

  function autoMeteor(dt) {
    if (Math.random() < dt * 0.035) spawnMeteor(1);
  }

  function drawMeteors(ctx, t, dt) {
    autoMeteor(dt);
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life > m.max || m.x < -80 || m.x > SN.size.w + 80 || m.y > SN.size.h + 80) {
        meteors.splice(i, 1);
        continue;
      }
      const fade = 1 - m.life / m.max;
      const tailX = m.x - m.vx * 0.12;
      const tailY = m.y - m.vy * 0.12;
      const c = m.warm ? '255,224,170' : '255,248,232';
      const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
      grad.addColorStop(0, 'rgba(' + c + ',0)');
      grad.addColorStop(1, 'rgba(' + c + ',' + (0.9 * fade) + ')');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      ctx.globalAlpha = 0.9 * fade;
      ctx.fillStyle = 'rgba(' + c + ',1)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = fade * 0.8;
      const g = 26 * fade;
      ctx.drawImage(goldSprite, m.x - g, m.y - g, g * 2, g * 2);
      ctx.globalAlpha = 1;
    }
  }

  function drawRipples(ctx, t) {
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.life += 0.016;
      if (r.life >= r.maxLife) { ripples.splice(i, 1); continue; }
      const e = r.life / r.maxLife;
      const rad = r.r + (r.max - r.r) * (1 - Math.pow(1 - e, 3));
      const alpha = (1 - e) * 0.55;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = 'rgba(210,235,255,1)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha * 0.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, rad * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks(ctx, t, dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.life += dt;
      if (s.life >= s.max) { sparks.splice(i, 1); continue; }
      s.vy += 30 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const e = s.life / s.max;
      const alpha = (1 - e) * 0.9;
      if (s.color) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(goldSprite, s.x - s.size * 3, s.y - s.size * 3, s.size * 6, s.size * 6);
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(215,236,255,1)';
        ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function tap(e) {
    const x = e.clientX;
    const y = e.clientY;
    SN.mouse.x = x;
    SN.mouse.y = y;
    spawnRipple(x, y);
    if (SN.constellations.drawing) {
      SN.constellations.addNode(x, y);
      return;
    }
    if (SN.wishMode) {
      SN.constellations.snapWish(x, y);
      return;
    }
    burst(x, y, 12);
    if (Math.random() < 0.1) spawnMeteor(1);
  }

  function attach() {
    const canvas = SN.canvas;

    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      SN.mouse.down = true;
      tap(e);
    });

    window.addEventListener('pointermove', function (e) {
      SN.mouse.x = e.clientX;
      SN.mouse.y = e.clientY;
      if (SN.mouse.down && SN.constellations.drawing) {
        SN.constellations.addNode(e.clientX, e.clientY);
      }
    }, { passive: true });

    window.addEventListener('pointerup', function () {
      SN.mouse.down = false;
    });

    window.addEventListener('pointercancel', function () {
      SN.mouse.down = false;
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      const s = SN.view.scale * (e.deltaY > 0 ? 0.92 : 1.08);
      SN.view.scale = Math.max(0.5, Math.min(2, s));
      SN.ui.showZoom();
    }, { passive: false });

    canvas.addEventListener('dblclick', function () {
      SN.view.scale = 1;
      SN.ui.showZoom();
    });

    window.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'p') {
        e.preventDefault();
        SN.ui.togglePause();
      } else if (e.key === 'f') {
        SN.ui.toggleFull();
      } else if (e.key === 'Escape') {
        SN.constellations.cancel();
        SN.ui.updateDrawUI();
      }
    });
  }

  SN.interactions = {
    burst: burst,
    spawnRipple: spawnRipple,
    meteorShower: meteorShower,
    drawMeteors: drawMeteors,
    drawRipples: drawRipples,
    drawSparks: drawSparks,
    attach: attach
  };
})();
