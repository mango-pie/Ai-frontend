(function () {
  'use strict';
  const SN = window.SN = window.SN || {};

  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  SN.canvas = canvas;
  SN.ctx = ctx;

  SN.cfg = {
    density: 1,
    aurora: 1,
    speed: 1,
    glow: 1,
    grain: 0.4,
    lines: true,
    parallax: true,
    paused: false,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  SN.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, down: false };
  SN.view = { scale: 1 };
  SN.size = { w: 0, h: 0, dpr: 1 };
  SN.time = 0;
  SN.starCount = 0;
  SN.wishMode = false;

  let bg = null;

  function buildBackground(w, h) {
    bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    const g = bg.getContext('2d');
    const lin = g.createLinearGradient(0, 0, 0, h);
    lin.addColorStop(0, '#0b1126');
    lin.addColorStop(0.55, '#070a18');
    lin.addColorStop(1, '#030409');
    g.fillStyle = lin;
    g.fillRect(0, 0, w, h);

    const glow = function (x, y, r, c) {
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, c);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    };
    glow(w * 0.32, h * 0.3, Math.max(w, h) * 0.55, 'rgba(84,110,220,0.13)');
    glow(w * 0.72, h * 0.2, Math.max(w, h) * 0.42, 'rgba(120,240,214,0.08)');
    glow(w * 0.5, h * 0.55, Math.max(w, h) * 0.5, 'rgba(139,124,247,0.1)');

    const band = g.createLinearGradient(0, 0, w, h);
    band.addColorStop(0, 'rgba(255,244,214,0)');
    band.addColorStop(0.5, 'rgba(255,244,214,0.05)');
    band.addColorStop(1, 'rgba(255,244,214,0)');
    g.fillStyle = band;
    g.save();
    g.translate(w * 0.5, h * 0.42);
    g.rotate(-0.42);
    g.fillRect(-w, -h * 0.16, w * 2, h * 0.32);
    g.restore();
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    SN.size = { w: w, h: h, dpr: dpr };
    buildBackground(w, h);
    SN.starfield.build(w, h);
    SN.aurora.build(w, h);
  }

  let fpsAcc = 0;
  let fpsCount = 0;
  let last = performance.now();
  let dimmed = false;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!SN.cfg.paused) SN.time += dt * SN.cfg.speed;
    SN.real = (SN.real || 0) + dt;
    const t = SN.time;
    const w = SN.size.w;
    const h = SN.size.h;
    const dpr = SN.size.dpr;
    const s = SN.view.scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    ctx.globalCompositeOperation = 'lighter';
    SN.starfield.draw(ctx, t);
    SN.aurora.draw(t);
    SN.aurora.blit(ctx);
    SN.constellations.draw(ctx, t);
    SN.interactions.drawMeteors(ctx, t, dt);
    SN.interactions.drawRipples(ctx, t);
    SN.interactions.drawSparks(ctx, t, dt);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    fpsAcc += dt;
    fpsCount++;
    if (fpsAcc >= 0.5) {
      SN.ui.updateStats(Math.round(fpsCount / fpsAcc), SN.starCount);
      fpsAcc = 0;
      fpsCount = 0;
    }

    const glow = document.getElementById('cursorGlow');
    if (glow) {
      glow.style.transform = 'translate3d(' + SN.mouse.x + 'px,' + SN.mouse.y + 'px,0)';
    }

    if (!dimmed && SN.real > 12) {
      dimmed = true;
      SN.ui.heroDimm();
    }
  }

  window.addEventListener('touchstart', function (e) {
    if (e.touches.length) {
      SN.mouse.x = e.touches[0].clientX;
      SN.mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener('touchmove', function (e) {
    if (e.touches.length) {
      SN.mouse.x = e.touches[0].clientX;
      SN.mouse.y = e.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener('resize', resize);
  document.addEventListener('fullscreenchange', resize);

  function init() {
    resize();
    SN.ui.buildTweaks();
    SN.ui.buildPanels();
    SN.ui.bindButtons();
    SN.ui.refreshConstellations();
    SN.ui.refreshWishes();
    SN.ui.startHints();
    SN.interactions.attach();
    document.documentElement.style.setProperty('--grain-opacity', SN.cfg.grain);
    requestAnimationFrame(frame);
  }

  init();
})();
