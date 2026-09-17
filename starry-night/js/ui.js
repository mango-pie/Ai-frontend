(function () {
  'use strict';
  const SN = window.SN = window.SN || {};

  const $ = function (id) { return document.getElementById(id); };

  const TIPS = [
    '点击夜空 &#8212; 激起星尘涟漪',
    '开启「画星座」&#8212; 点击连点成座',
    '开启「许愿」&#8212; 点亮一颗属于你的星',
    '「流星雨」&#8212; 让整片天空为你划过',
    '滚轮缩放 &#183; 双击复位 &#183; 空间暂停',
    '拖动 Tweaks &#8212; 调配属于你的夜色'
  ];

  const TWEAKS = [
    { type: 'slider', label: '星密度', key: 'density', min: 0.2, max: 2, step: 0.1, val: 1 },
    { type: 'slider', label: '极光强度', key: 'aurora', min: 0, max: 1.5, step: 0.05, val: 1 },
    { type: 'slider', label: '流速', key: 'speed', min: 0.1, max: 2.5, step: 0.1, val: 1 },
    { type: 'slider', label: '光晕', key: 'glow', min: 0, max: 2.2, step: 0.1, val: 1 },
    { type: 'slider', label: '噪点', key: 'grain', min: 0, max: 1, step: 0.05, val: 0.4 },
    { type: 'toggle', label: '星座连线', key: 'lines', val: true },
    { type: 'toggle', label: '视差', key: 'parallax', val: true }
  ];

  let toastTimer = 0;
  let hintTimer = 0;
  let hintIdx = 0;

  function buildTweaks() {
    const body = $('tweaksBody');
    TWEAKS.forEach(function (cfg) {
      if (cfg.type === 'slider') {
        const row = document.createElement('div');
        row.className = 'tweak-row';
        const label = document.createElement('div');
        label.className = 'tweak-label';
        label.innerHTML = '<span>' + cfg.label + '</span><b>' + cfg.val.toFixed(cfg.step >= 0.1 ? 1 : 2) + '</b>';
        const input = document.createElement('input');
        input.type = 'range';
        input.min = cfg.min;
        input.max = cfg.max;
        input.step = cfg.step;
        input.value = cfg.val;
        input.addEventListener('input', function () {
          const v = parseFloat(input.value);
          SN.cfg[cfg.key] = v;
          label.querySelector('b').textContent = (cfg.step >= 0.1 ? v.toFixed(1) : v.toFixed(2));
          applyKey(cfg.key, v);
        });
        row.appendChild(label);
        row.appendChild(input);
        body.appendChild(row);
      } else {
        const row = document.createElement('label');
        row.className = 'tweak-toggle';
        row.innerHTML = '<span>' + cfg.label + '</span><span class="switch"></span>';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = cfg.val;
        input.addEventListener('change', function () {
          SN.cfg[cfg.key] = input.checked;
          applyKey(cfg.key, input.checked);
        });
        row.insertBefore(input, row.firstChild);
        body.appendChild(row);
      }
    });
  }

  function applyKey(key, v) {
    if (key === 'density') {
      SN.starfield.build(SN.size.w, SN.size.h);
    } else if (key === 'grain') {
      document.documentElement.style.setProperty('--grain-opacity', v);
    }
  }

  function buildPanels() {
    $('constPanelHead').addEventListener('click', function () {
      $('constPanel').classList.toggle('is-collapsed');
    });
    $('wishPanelHead').addEventListener('click', function () {
      $('wishPanel').classList.toggle('is-collapsed');
    });
    $('tweaksHead').addEventListener('click', function () {
      $('tweaks').classList.toggle('is-collapsed');
    });
  }

  function refreshConstellations() {
    const list = $('constList');
    list.innerHTML = '';
    const saved = SN.constellations.saved;
    $('constCount').textContent = saved.length;
    if (!saved.length) {
      const empty = document.createElement('li');
      empty.className = 'panel-empty';
      empty.textContent = '还没有星座 &#8212; 开启「画星座」试试';
      list.appendChild(empty);
      return;
    }
    saved.forEach(function (c, i) {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = c.name;
      name.title = c.name;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = c.nodes.length + ' 星';
      const eye = document.createElement('button');
      eye.type = 'button';
      eye.textContent = c.visible ? '可见' : '隐藏';
      if (!c.visible) eye.classList.add('is-off');
      eye.addEventListener('click', function () {
        SN.constellations.toggle(!c.visible, i);
        refreshConstellations();
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = '删除';
      del.addEventListener('click', function () {
        SN.constellations.remove(i);
      });
      li.appendChild(name);
      li.appendChild(meta);
      li.appendChild(eye);
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function refreshWishes() {
    const list = $('wishList');
    list.innerHTML = '';
    const wishes = SN.constellations.wishes;
    $('wishCount').textContent = wishes.length;
    if (!wishes.length) {
      const empty = document.createElement('li');
      empty.className = 'panel-empty';
      empty.textContent = '还没有愿望 &#8212; 点亮一颗星星';
      list.appendChild(empty);
      return;
    }
    wishes.forEach(function (w, i) {
      const li = document.createElement('li');
      li.className = 'wish-item';
      const star = document.createElement('span');
      star.className = 'star';
      star.textContent = '&#10022;';
      const d = new Date(w.time);
      const pad = function (n) { return n < 10 ? '0' + n : n; };
      const meta = document.createElement('span');
      meta.className = 'name';
      meta.textContent = pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      li.appendChild(star);
      li.appendChild(meta);
      list.appendChild(li);
    });
  }

  function toggleMode(btn, state) {
    btn.classList.toggle('is-on', state);
  }

  function setMode(mode, on) {
    if (mode === 'wish') {
      SN.wishMode = on;
      toggleMode($('btnWish'), on);
      if (on && SN.constellations.drawing) {
        SN.constellations.drawing = false;
        toggleMode($('btnDraw'), false);
      }
    } else if (mode === 'draw') {
      SN.constellations.drawing = on;
      toggleMode($('btnDraw'), on);
      updateDrawUI();
      if (on) {
        SN.wishMode = false;
        toggleMode($('btnWish'), false);
      }
    }
  }

  function updateDrawUI() {
    const btn = $('finishDraw');
    btn.classList.toggle('is-show', SN.constellations.drawing);
    btn.onclick = function () {
      openNameModal();
    };
  }

  function openNameModal() {
    const modal = $('nameModal');
    const input = $('nameInput');
    modal.classList.add('is-open');
    input.value = '';
    setTimeout(function () { input.focus(); }, 60);
    function confirm() {
      SN.constellations.finish(input.value.trim());
      modal.classList.remove('is-open');
    }
    $('nameOk').onclick = confirm;
    $('nameCancel').onclick = function () {
      SN.constellations.cancel();
      modal.classList.remove('is-open');
    };
    input.onkeydown = function (e) {
      if (e.key === 'Enter') confirm();
    };
  }

  function toast(msg) {
    const el = $('toast');
    el.innerHTML = msg;
    el.hidden = false;
    el.classList.remove('is-hide');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.add('is-hide');
      setTimeout(function () { el.hidden = true; }, 400);
    }, 2200);
  }

  function startHints() {
    const bar = $('hintbar');
    bar.innerHTML = TIPS[0];
    hintIdx = 0;
    clearInterval(hintTimer);
    hintTimer = setInterval(function () {
      hintIdx = (hintIdx + 1) % TIPS.length;
      bar.innerHTML = TIPS[hintIdx];
    }, 5200);
    setTimeout(function () { bar.classList.add('is-hide'); }, 16000);
  }

  function togglePause() {
    SN.cfg.paused = !SN.cfg.paused;
    $('btnPause').classList.toggle('is-on', SN.cfg.paused);
    $('btnPause').textContent = SN.cfg.paused ? '继续' : '暂停';
  }

  function toggleFull() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(function () {});
    }
  }

  function showZoom() {
    const el = $('zoomHint');
    el.textContent = Math.round(SN.view.scale * 100) + '%';
    el.classList.add('is-show');
    clearTimeout(SN.ui._zoomTimer);
    SN.ui._zoomTimer = setTimeout(function () { el.classList.remove('is-show'); }, 1200);
  }

  function bindButtons() {
    $('btnWish').addEventListener('click', function () {
      setMode('wish', !SN.wishMode);
      toast(SN.wishMode ? '许愿模式已开启 &#8212; 点击一颗星星' : '许愿模式已关闭');
    });
    $('btnDraw').addEventListener('click', function () {
      setMode('draw', !SN.constellations.drawing);
      toast(SN.constellations.drawing ? '画星座模式已开启 &#8212; 点击夜空连点成座' : '画星座模式已关闭');
    });
    $('btnMeteor').addEventListener('click', function () {
      SN.interactions.meteorShower(16);
      toast('流星雨正在划过夜空 &#8230;');
    });
    $('btnPause').addEventListener('click', function () {
      togglePause();
    });
    $('btnFull').addEventListener('click', function () {
      toggleFull();
    });
    $('btnReset').addEventListener('click', function () {
      location.reload();
    });
  }

  function updateStats(fps, stars) {
    $('statFps').textContent = fps + ' FPS';
    $('statStars').textContent = stars + ' 星';
  }

  function heroDimm() {
    const hero = document.querySelector('.hero');
    hero.classList.add('is-dimm');
  }

  SN.ui = {
    buildTweaks: buildTweaks,
    buildPanels: buildPanels,
    refreshConstellations: refreshConstellations,
    refreshWishes: refreshWishes,
    setMode: setMode,
    updateDrawUI: updateDrawUI,
    toast: toast,
    startHints: startHints,
    togglePause: togglePause,
    toggleFull: toggleFull,
    showZoom: showZoom,
    bindButtons: bindButtons,
    updateStats: updateStats,
    heroDimm: heroDimm
  };

  SN.wishMode = false;
})();
