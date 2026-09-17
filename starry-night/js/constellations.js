(function () {
  'use strict';
  const SN = window.SN = window.SN || {};

  function loadList(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return Array.isArray(v) ? v : [];
    } catch (e) {
      return [];
    }
  }
  function saveList(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {}
  }

  const saved = loadList('sn.constellations');
  const wishes = loadList('sn.wishes');
  const drawing = { active: false, nodes: [], last: null };

  SN.constellations = {
    get saved() { return saved; },
    get wishes() { return wishes; },
    get drawing() { return drawing.active; },
    set drawing(v) {
      drawing.active = v;
      if (!v) { drawing.nodes.length = 0; drawing.last = null; }
    },

    addNode(x, y) {
      const star = SN.starfield.nearest(x, y, 46);
      const node = star ? { x: star._x !== undefined ? star._x : star.x, y: star._y !== undefined ? star._y : star.y } : { x: x, y: y };
      if (drawing.last && Math.hypot(node.x - drawing.last.x, node.y - drawing.last.y) < 26) return;
      drawing.nodes.push(node);
      drawing.last = node;
      SN.ui.updateDrawUI();
    },

    finish(name) {
      if (drawing.nodes.length >= 2) {
        saved.push({ name: name || '无名星座', nodes: drawing.nodes.slice(), visible: true });
        saveList('sn.constellations', saved);
        SN.ui.refreshConstellations();
        SN.ui.toast('星座已收入星图 &#10022;');
      } else {
        SN.ui.toast('至少需要两颗星来连成星座');
      }
      drawing.active = false;
      drawing.nodes.length = 0;
      drawing.last = null;
      SN.ui.updateDrawUI();
      SN.ui.setMode('draw', false);
    },

    cancel() {
      drawing.active = false;
      drawing.nodes.length = 0;
      drawing.last = null;
      SN.ui.updateDrawUI();
    },

    toggle(vis, i) {
      saved[i].visible = vis;
      saveList('sn.constellations', saved);
    },

    remove(i) {
      saved.splice(i, 1);
      saveList('sn.constellations', saved);
      SN.ui.refreshConstellations();
    },

    snapWish(x, y) {
      const star = SN.starfield.nearest(x, y, 52);
      if (!star) {
        SN.ui.toast('这里没有星星 &#8230; 再靠近一些');
        return;
      }
      if (star.golden && star._wish) {
        SN.ui.toast('这颗星星已经承载过愿望了');
        return;
      }
      star.golden = true;
      star._wish = true;
      wishes.push({ time: Date.now() });
      saveList('sn.wishes', wishes);
      SN.interactions.burst(x, y, 18, [255, 224, 150]);
      SN.interactions.spawnRipple(x, y);
      SN.ui.refreshWishes();
      SN.ui.toast('愿已寄往星辰 &#10022;');
    },

    draw(ctx, t) {
      for (const c of saved) {
        if (!c.visible) continue;
        ctx.globalAlpha = 0.5 + 0.25 * Math.sin(t * 1.1);
        ctx.strokeStyle = 'rgba(255,224,160,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < c.nodes.length; i++) {
          if (i === 0) ctx.moveTo(c.nodes[i].x, c.nodes[i].y);
          else ctx.lineTo(c.nodes[i].x, c.nodes[i].y);
        }
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = 'rgba(255,238,205,0.95)';
        for (const n of c.nodes) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (drawing.active && drawing.nodes.length > 0) {
        ctx.globalAlpha = 0.9;
        ctx.setLineDash([5, 7]);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i < drawing.nodes.length; i++) {
          if (i === 0) ctx.moveTo(drawing.nodes[i].x, drawing.nodes[i].y);
          else ctx.lineTo(drawing.nodes[i].x, drawing.nodes[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        for (const n of drawing.nodes) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  };
})();
