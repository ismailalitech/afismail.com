/* The moving background of the home page: a patch of FPGA fabric behind the name.

   Logic cells sit in a regular array with routing channels between them and a switch box
   where two channels cross; every seventh column holds memory blocks, which are taller. On the right, where the photo would go, is the hard block:
   the same chip as in the mark beside the name. Signals are routed the way a placer and
   router would: out of a cell, along the channels, turning only at a switch box, and into
   another cell or into the hard block. A cell lights for a moment when a signal arrives;
   so does the core of the block, which then answers now and then.

   Markup: <div data-fabric> holding two canvases (the fixed fabric and the signals) and,
   elsewhere in the hero, <div data-fabric-anchor> marking where the block sits. The colours
   come from CSS: "color" for the fabric, "stroke" for the signals.

   For visitors who ask their system for reduced motion it draws one still moment. It stops
   while the tab is hidden or the hero is scrolled out of view. */
(function () {
  var holder = document.querySelector('[data-fabric]');
  if (!holder || !window.ResizeObserver || !window.matchMedia) { return; }
  var layers = holder.querySelectorAll('canvas');
  if (layers.length < 2) { return; }
  var boardCtx = layers[0].getContext('2d');
  var ctx = layers[1].getContext('2d');
  if (!boardCtx || !ctx) { return; }

  var anchor = document.querySelector('[data-fabric-anchor]');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fabric = null;
  var signals = [];
  var lit = {};
  var raf = 0;
  var last = 0;
  var timer = 0;
  var inView = true;

  /* ---------- small helpers ---------- */

  /* A repeatable random source, for the still frame. */
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Turns a colour as the browser reports it into [red, green, blue]. */
  function channels(color) {
    var numbers = (color.match(/-?[\d.]+/g) || []).map(Number);
    if (color.indexOf('color(') === 0) {
      return [numbers[0] * 255, numbers[1] * 255, numbers[2] * 255].map(Math.round);
    }
    return numbers.length >= 3 ? numbers.slice(0, 3) : [128, 128, 128];
  }

  function rgba(c, alpha) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  }

  function pick(random, list) {
    return list[Math.floor(random() * list.length)];
  }

  /* ---------- the fabric ---------- */

  /* Lays out the array so that the hard block lands where the anchor is. */
  function layout() {
    var box = holder.getBoundingClientRect();
    var w = Math.round(box.width);
    var h = Math.round(box.height);
    if (w < 60 || h < 60) { return null; }
    var wide = w >= 700;
    var p = wide ? 50 : 40;
    var span = wide ? 3 : 2;
    var f = { w: w, h: h, p: p, cell: Math.round(p * 0.32), block: null, memory: 0 };

    var spot = anchor ? anchor.getBoundingClientRect() : null;
    var ax = spot && spot.width ? spot.left - box.left + spot.width / 2 : w * 0.72;
    var ay = spot && spot.height ? spot.top - box.top + spot.height / 2 : h * 0.5;
    var left = ax - span * p / 2;
    var top = ay - span * p / 2;
    f.ox = (left % p) - p;
    f.oy = (top % p) - p;
    f.cols = Math.ceil((w - f.ox) / p);
    f.rows = Math.ceil((h - f.oy) / p);
    if (spot && spot.width) {
      var inset = Math.round(p * 0.2);
      var c0 = Math.round((left - f.ox) / p);
      var r0 = Math.round((top - f.oy) / p);
      f.block = {
        c0: c0, r0: r0, span: span, inset: inset,
        x0: f.ox + c0 * p, y0: f.oy + r0 * p,
        x1: f.ox + (c0 + span) * p, y1: f.oy + (r0 + span) * p,
        glow: 0
      };
      f.memory = c0 + 4;
    }
    return f;
  }

  function inBlock(f, c, r) {
    var b = f.block;
    return b && c >= b.c0 && c < b.c0 + b.span && r >= b.r0 && r < b.r0 + b.span;
  }

  /* Height of the cells in a column: memory columns have taller ones. */
  function cellHeight(f, c) {
    return (((c - f.memory) % 7) + 7) % 7 === 0 ? Math.round(f.p * 0.66) : f.cell;
  }

  function cellCentre(f, c, r) {
    return [f.ox + (c + 0.5) * f.p, f.oy + (r + 0.5) * f.p];
  }

  /* True when a straight piece of route would cut through the hard block. */
  function crossesBlock(f, a, b) {
    var k = f.block;
    if (!k) { return false; }
    var x0 = Math.min(a[0], b[0]);
    var x1 = Math.max(a[0], b[0]);
    var y0 = Math.min(a[1], b[1]);
    var y1 = Math.max(a[1], b[1]);
    return x1 > k.x0 + 1 && x0 < k.x1 - 1 && y1 > k.y0 + 1 && y0 < k.y1 - 1;
  }

  /* ---------- routing ---------- */

  /* A cell drives its output to the channel on its right and takes its input from the
     channel above it. */
  function cellOut(f, c, r) {
    var centre = cellCentre(f, c, r);
    return { from: [centre[0] + f.cell / 2, centre[1]], channel: [f.ox + (c + 1) * f.p, centre[1]] };
  }

  function cellIn(f, c, r) {
    var centre = cellCentre(f, c, r);
    return { to: [centre[0], centre[1] - cellHeight(f, c) / 2], channel: [centre[0], f.oy + r * f.p], vertical: false };
  }

  /* One of the block's pins: a point on the channel around it and the pin on its edge. */
  function blockPin(f, random) {
    var b = f.block;
    var side = Math.floor(random() * 4);
    var along = (Math.floor(random() * b.span) + 0.5) * f.p;
    if (side === 0) { return { to: [b.x0 + b.inset, b.y0 + along], channel: [b.x0, b.y0 + along], vertical: true }; }
    if (side === 1) { return { to: [b.x1 - b.inset, b.y0 + along], channel: [b.x1, b.y0 + along], vertical: true }; }
    if (side === 2) { return { to: [b.x0 + along, b.y0 + b.inset], channel: [b.x0 + along, b.y0], vertical: false }; }
    return { to: [b.x0 + along, b.y1 - b.inset], channel: [b.x0 + along, b.y1], vertical: false };
  }

  /* From a cell's output to an input, along the channels. "end.vertical" says which kind
     of channel the input sits on. One or two jogs, each turning at a switch box. */
  function route(f, random, start, end) {
    var s = start.channel;
    var e = end.channel;
    var pts = [start.from, s];
    var lowRow = Math.round((Math.min(s[1], e[1]) - f.oy) / f.p);
    var highRow = Math.round((Math.max(s[1], e[1]) - f.oy) / f.p);
    var row = f.oy + (lowRow + Math.floor(random() * (highRow - lowRow + 1))) * f.p;
    if (end.vertical) {
      pts.push([s[0], row], [e[0], row]);
    } else if (random() < 0.5) {
      pts.push([s[0], e[1]]);
    } else {
      var lowCol = Math.round((Math.min(s[0], e[0]) - f.ox) / f.p);
      var highCol = Math.round((Math.max(s[0], e[0]) - f.ox) / f.p);
      var col = f.ox + (lowCol + Math.floor(random() * (highCol - lowCol + 1))) * f.p;
      pts.push([s[0], row], [col, row], [col, e[1]]);
    }
    pts.push(e, end.to);

    var clean = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var prev = clean[clean.length - 1];
      if (Math.abs(pts[i][0] - prev[0]) + Math.abs(pts[i][1] - prev[1]) < 0.5) { continue; }
      if (i > 1 && i < pts.length - 1 && crossesBlock(f, prev, pts[i])) { return null; }
      clean.push(pts[i]);
    }
    if (clean.length < 3) { return null; }
    return measure({ pts: clean });
  }

  function measure(path) {
    var total = 0;
    path.at = [0];
    for (var i = 1; i < path.pts.length; i++) {
      total += Math.abs(path.pts[i][0] - path.pts[i - 1][0]) + Math.abs(path.pts[i][1] - path.pts[i - 1][1]);
      path.at.push(total);
    }
    path.length = total;
    return path;
  }

  function pointAt(path, distance) {
    var d = Math.max(0, Math.min(path.length, distance));
    var i = 1;
    while (i < path.at.length - 1 && path.at[i] < d) { i++; }
    var span = path.at[i] - path.at[i - 1] || 1;
    var k = (d - path.at[i - 1]) / span;
    var a = path.pts[i - 1];
    var b = path.pts[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  /* A cell in view, mostly away from the text: right of it on a wide screen, below it on
     a phone. */
  function sourceCell(f, random) {
    for (var attempt = 0; attempt < 20; attempt++) {
      var c = Math.floor(random() * f.cols);
      var r = Math.floor(random() * f.rows);
      var centre = cellCentre(f, c, r);
      if (inBlock(f, c, r) || centre[0] < f.p * 0.5 || centre[0] > f.w - f.p || centre[1] < f.p * 0.5 || centre[1] > f.h - f.p * 1.5) { continue; }
      var quiet = f.w >= 700 ? centre[0] > f.w * 0.42 : centre[1] > f.h * 0.5;
      if (quiet || random() < 0.12) { return [c, r]; }
    }
    return null;
  }

  /* A path for one signal: cell to cell, cell to block, or block to cell. */
  function newPath(f, random, from, kind) {
    for (var attempt = 0; attempt < 12; attempt++) {
      var src = from || sourceCell(f, random);
      if (!src) { return null; }
      var toBlock = kind === 'in' || (!kind && f.block && random() < 0.3);
      var path;
      if (kind === 'out') {
        var dst = sourceCell(f, random);
        if (!dst) { continue; }
        var pin = blockPin(f, random);
        var back = route(f, random, cellOut(f, dst[0], dst[1]), pin);
        if (!back) { continue; }
        back.pts.reverse();
        path = measure({ pts: back.pts });
        path.target = dst;
        return path;
      }
      if (toBlock && f.block) {
        path = route(f, random, cellOut(f, src[0], src[1]), blockPin(f, random));
        if (path) { path.source = src; path.target = 'block'; return path; }
        continue;
      }
      var dc = src[0] + Math.round((random() * 2 - 1) * 6);
      var dr = src[1] + Math.round((random() * 2 - 1) * 3);
      if (dc < 0 || dr < 1 || dc >= f.cols || dr >= f.rows - 1 || inBlock(f, dc, dr) || (dc === src[0] && dr === src[1])) { continue; }
      path = route(f, random, cellOut(f, src[0], src[1]), cellIn(f, dc, dr));
      if (path) { path.source = src; path.target = [dc, dr]; return path; }
    }
    return null;
  }

  /* ---------- drawing ---------- */

  function roundedRect(c, x, y, w, h, radius) {
    c.beginPath();
    c.moveTo(x + radius, y);
    c.arcTo(x + w, y, x + w, y + h, radius);
    c.arcTo(x + w, y + h, x, y + h, radius);
    c.arcTo(x, y + h, x, y, radius);
    c.arcTo(x, y, x + w, y, radius);
    c.closePath();
  }

  /* The part that never changes: channels, switch boxes, cells and the hard block. */
  function drawBoard(f) {
    var c = boardCtx;
    var p = f.p;
    var b = f.block;
    var col;
    var row;
    c.setTransform(f.scale, 0, 0, f.scale, 0, 0);
    c.clearRect(0, 0, f.w, f.h);
    c.lineWidth = 1;
    c.strokeStyle = rgba(f.line, 1);

    /* Channels, interrupted by the block. */
    c.beginPath();
    for (col = 0; col <= f.cols; col++) {
      var x = Math.round(f.ox + col * p) + 0.5;
      if (b && col > b.c0 && col < b.c0 + b.span) {
        c.moveTo(x, 0); c.lineTo(x, b.y0);
        c.moveTo(x, b.y1); c.lineTo(x, f.h);
      } else {
        c.moveTo(x, 0); c.lineTo(x, f.h);
      }
    }
    for (row = 0; row <= f.rows; row++) {
      var y = Math.round(f.oy + row * p) + 0.5;
      if (b && row > b.r0 && row < b.r0 + b.span) {
        c.moveTo(0, y); c.lineTo(b.x0, y);
        c.moveTo(b.x1, y); c.lineTo(f.w, y);
      } else {
        c.moveTo(0, y); c.lineTo(f.w, y);
      }
    }
    c.globalAlpha = 0.55;
    c.stroke();
    c.globalAlpha = 1;

    /* Cells with their output and input connections, and a switch box at each crossing. */
    var half = f.cell / 2;
    c.beginPath();
    for (col = 0; col < f.cols; col++) {
      for (row = 0; row < f.rows; row++) {
        if (inBlock(f, col, row)) { continue; }
        var centre = cellCentre(f, col, row);
        var cx = Math.round(centre[0]) + 0.5;
        var cy = Math.round(centre[1]) + 0.5;
        var tall = cellHeight(f, col) / 2;
        c.rect(cx - half, cy - tall, f.cell, tall * 2);
        c.moveTo(cx + half, cy); c.lineTo(f.ox + (col + 1) * p, cy);
        c.moveTo(cx, cy - tall); c.lineTo(cx, f.oy + row * p);
      }
    }
    for (col = 0; col <= f.cols; col++) {
      for (row = 0; row <= f.rows; row++) {
        if (b && col > b.c0 && col < b.c0 + b.span && row > b.r0 && row < b.r0 + b.span) { continue; }
        c.rect(Math.round(f.ox + col * p) - 2, Math.round(f.oy + row * p) - 2, 5, 5);
      }
    }
    c.stroke();

    if (b) {
      var size = b.span * p - 2 * b.inset;
      var bx = b.x0 + b.inset;
      var by = b.y0 + b.inset;
      c.strokeStyle = rgba(f.signal, 0.9);
      c.lineWidth = 1.5;
      c.beginPath();
      /* Pins: those at the middle of a cell side reach the channel, the others are short. */
      for (var k = 1; k < b.span * 2; k++) {
        var along = k * p / 2;
        var reach = k % 2 ? b.inset : 6;
        c.moveTo(b.x0 + b.inset, b.y0 + along); c.lineTo(b.x0 + b.inset - reach, b.y0 + along);
        c.moveTo(b.x1 - b.inset, b.y0 + along); c.lineTo(b.x1 - b.inset + reach, b.y0 + along);
        c.moveTo(b.x0 + along, b.y0 + b.inset); c.lineTo(b.x0 + along, b.y0 + b.inset - reach);
        c.moveTo(b.x0 + along, b.y1 - b.inset); c.lineTo(b.x0 + along, b.y1 - b.inset + reach);
      }
      c.stroke();
      roundedRect(c, bx, by, size, size, size * 0.12);
      c.fillStyle = rgba(f.bg, 1);
      c.fill();
      c.fillStyle = rgba(f.signal, 0.07);
      c.fill();
      c.stroke();
      var core = size * 0.44;
      roundedRect(c, bx + (size - core) / 2, by + (size - core) / 2, core, core, core * 0.1);
      c.stroke();
    }
  }

  /* One frame of what moves: lit cells, the block's core, the signals. */
  function drawSignals(f) {
    var c = ctx;
    c.setTransform(f.scale, 0, 0, f.scale, 0, 0);
    c.clearRect(0, 0, f.w, f.h);

    Object.keys(lit).forEach(function (key) {
      var parts = key.split(',');
      var centre = cellCentre(f, +parts[0], +parts[1]);
      var tall = cellHeight(f, +parts[0]);
      c.fillStyle = rgba(f.signal, 0.5 * lit[key]);
      c.fillRect(Math.round(centre[0] - f.cell / 2) + 1, Math.round(centre[1] - tall / 2) + 1, f.cell - 1, tall - 1);
    });

    var b = f.block;
    if (b && b.glow > 0.01) {
      var size = b.span * f.p - 2 * b.inset;
      var core = size * 0.44;
      roundedRect(c, b.x0 + b.inset + (size - core) / 2, b.y0 + b.inset + (size - core) / 2, core, core, core * 0.1);
      c.fillStyle = rgba(f.signal, 0.5 * b.glow);
      c.fill();
    }

    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    signals.forEach(function (signal) {
      var path = signal.path;
      var head = Math.min(path.length, signal.d);
      var lo = Math.max(0, signal.d - signal.tail);
      if (head <= lo) { return; }
      var a = pointAt(path, lo);
      var z = pointAt(path, head);
      var gradient = c.createLinearGradient(a[0], a[1], z[0], z[1]);
      gradient.addColorStop(0, rgba(f.signal, 0));
      gradient.addColorStop(1, rgba(f.signal, 0.9));
      c.strokeStyle = gradient;
      c.beginPath();
      c.moveTo(a[0], a[1]);
      for (var i = 1; i < path.at.length - 1; i++) {
        if (path.at[i] > lo && path.at[i] < head) { c.lineTo(path.pts[i][0], path.pts[i][1]); }
      }
      c.lineTo(z[0], z[1]);
      c.stroke();
      if (signal.d <= path.length) {
        c.fillStyle = rgba(f.signal, 1);
        c.fillRect(z[0] - 1.5, z[1] - 1.5, 3, 3);
      }
    });
  }

  /* The still frame: a few routes in place, as if the fabric were caught mid-transfer. */
  function drawStill(f) {
    var random = seeded(7);
    signals = [];
    lit = {};
    for (var n = 0; n < 4; n++) {
      var path = newPath(f, random, null, n === 0 && f.block ? 'in' : null);
      if (!path) { continue; }
      signals.push({ path: path, d: path.length * (0.55 + 0.35 * random()), tail: path.length });
      if (path.source) { lit[path.source.join(',')] = 0.6; }
    }
    if (f.block) { f.block.glow = 0.6; }
    drawSignals(f);
    signals = [];
  }

  /* ---------- set-up and the loop ---------- */

  function colors(f) {
    var style = window.getComputedStyle(holder);
    f.line = channels(style.color);
    f.signal = channels(style.stroke);
    f.bg = channels(window.getComputedStyle(document.body).backgroundColor);
  }

  function build() {
    stop();
    signals = [];
    lit = {};
    fabric = layout();
    if (!fabric) { return; }
    var f = fabric;
    f.scale = Math.min(2, window.devicePixelRatio || 1);
    for (var i = 0; i < 2; i++) {
      layers[i].width = Math.round(f.w * f.scale);
      layers[i].height = Math.round(f.h * f.scale);
    }
    colors(f);
    drawBoard(f);
    if (reducedMotion.matches) { drawStill(f); } else { drawSignals(f); }
    holder.dataset.state = reducedMotion.matches ? 'still' : 'live';
    start();
  }

  function running() {
    return fabric && !reducedMotion.matches && !document.hidden && inView;
  }

  function launch(from, kind) {
    var limit = fabric.w >= 700 ? 5 : 3;
    if (signals.length >= limit) { return; }
    var path = newPath(fabric, Math.random, from, kind);
    if (!path) { return; }
    if (path.source) { lit[path.source.join(',')] = 0.7; }
    signals.push({ path: path, d: 0, tail: 50 + Math.random() * 30, speed: 80 + Math.random() * 45 });
    if (!raf) { last = 0; raf = window.requestAnimationFrame(frame); }
  }

  /* Sends the next signal after a short, irregular wait. */
  function plan() {
    window.clearTimeout(timer);
    if (!running()) { return; }
    timer = window.setTimeout(function () {
      if (running()) { launch(null, null); }
      plan();
    }, 700 + Math.random() * 1100);
  }

  function frame(now) {
    raf = 0;
    if (!running()) { return; }
    var elapsed = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    var f = fabric;
    signals = signals.filter(function (signal) {
      signal.d += signal.speed * elapsed;
      if (!signal.arrived && signal.d >= signal.path.length) {
        signal.arrived = true;
        var target = signal.path.target;
        if (target === 'block') {
          f.block.glow = 1;
          if (Math.random() < 0.6) { window.setTimeout(function () { if (running()) { launch(null, 'out'); } }, 350); }
        } else if (target) {
          lit[target.join(',')] = 1;
          if (Math.random() < 0.3) { window.setTimeout(function () { if (running()) { launch(target, null); } }, 400); }
        }
      }
      return signal.d < signal.path.length + signal.tail;
    });
    var fade = elapsed / 2.6;
    Object.keys(lit).forEach(function (key) {
      lit[key] -= fade;
      if (lit[key] <= 0) { delete lit[key]; }
    });
    if (f.block) { f.block.glow = Math.max(0, f.block.glow - elapsed / 1.4); }
    drawSignals(f);
    if (signals.length || Object.keys(lit).length || (f.block && f.block.glow > 0)) {
      raf = window.requestAnimationFrame(frame);
    }
  }

  function start() {
    if (!running()) { return; }
    plan();
    if (signals.length || Object.keys(lit).length) {
      last = 0;
      if (!raf) { raf = window.requestAnimationFrame(frame); }
    }
  }

  function stop() {
    window.clearTimeout(timer);
    if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
  }

  new window.ResizeObserver(build).observe(holder);

  if ('IntersectionObserver' in window) {
    new window.IntersectionObserver(function (entries) {
      inView = entries[entries.length - 1].isIntersecting;
      if (inView) { start(); } else { stop(); }
    }).observe(holder);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { stop(); } else { start(); }
  });

  /* The colours follow the theme switch and the system's light or dark setting. */
  function recolor() {
    if (!fabric) { return; }
    colors(fabric);
    drawBoard(fabric);
    if (reducedMotion.matches) { drawStill(fabric); } else { drawSignals(fabric); }
  }
  new window.MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  if (dark.addEventListener) { dark.addEventListener('change', recolor); }

  /* Reduced motion can be switched while the page is open. */
  if (reducedMotion.addEventListener) { reducedMotion.addEventListener('change', build); }
})();
