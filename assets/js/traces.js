/* The moving background: circuit-board traces with signals travelling along them.

   It draws on <canvas data-traces="..."> elements:
     data-traces="left" / "right"   the page margins, on every page except the home page
                                    (wide screens only)
     data-traces="board"            the home page: a whole board, with chips, their traces
                                    fanning out, small parts and bundles of traces

   The routing is drawn by rules a real board follows: traces run in lanes, change lane
   at 45 degrees, stay parallel while they do, and end on a via (a small ring). Each page
   gets its own layout, always the same for that page.

   Nothing moves for visitors who ask their system for reduced motion: they get the
   traces without the signals. The loop stops whenever no signal is travelling. */
(function () {
  var canvases = document.querySelectorAll('canvas[data-traces]');
  if (!canvases.length || !window.ResizeObserver || !window.matchMedia) { return; }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fields = [];
  var raf = 0;
  var last = 0;

  /* ---------- small helpers ---------- */

  /* A repeatable random source, so a page keeps its layout from one visit to the next. */
  function seeded(text) {
    var seed = 2166136261;
    for (var i = 0; i < text.length; i++) {
      seed = Math.imul(seed ^ text.charCodeAt(i), 16777619);
    }
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

  /* Gives a trace its length, and the length reached at each corner. */
  function measure(trace) {
    var total = 0;
    trace.at = [0];
    for (var i = 1; i < trace.pts.length; i++) {
      total += Math.hypot(trace.pts[i][0] - trace.pts[i - 1][0], trace.pts[i][1] - trace.pts[i - 1][1]);
      trace.at.push(total);
    }
    trace.length = total;
    return trace;
  }

  /* The point at a given distance along a trace. */
  function pointAt(trace, distance) {
    var d = Math.max(0, Math.min(trace.length, distance));
    var i = 1;
    while (i < trace.at.length - 1 && trace.at[i] < d) { i++; }
    var span = trace.at[i] - trace.at[i - 1] || 1;
    var k = (d - trace.at[i - 1]) / span;
    var a = trace.pts[i - 1];
    var b = trace.pts[i];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }

  /* ---------- routing: the page margins ---------- */

  /* A bundle of traces running down a region { x, w, h, mirror, most }. It works in
     "distance from the outer edge", so the left and right margins mirror each other,
     with the busiest lanes at the edge of the screen and none near the text. */
  function routeLanes(region, random) {
    var field = region;
    var pitch = 14;
    var first = 12;
    var count = Math.min(region.most || 12, Math.floor((region.w - first - 18) / pitch) + 1);
    var traces = [];
    if (count < 2) { return traces; }

    var lanes = [];
    var lane;
    for (lane = 0; lane < count; lane++) { lanes.push(null); }
    function x(index) { return first + index * pitch; }
    function begin(index, y, via) {
      var trace = { pts: [[x(index), y]], startVia: via, endVia: false };
      lanes[index] = trace;
      traces.push(trace);
    }
    function indexes(wanted) {
      var found = [];
      for (var i = 0; i < count; i++) {
        if ((lanes[i] !== null) === wanted) { found.push(i); }
      }
      return found;
    }

    for (lane = 0; lane < count; lane++) {
      if (random() < 0.62 - 0.4 * lane / count) { begin(lane, -12, false); }
    }

    var y = 30 + random() * 60;
    while (y < field.h - 40) {
      var busy = indexes(true);
      var free = indexes(false);
      var choice = random();

      var jogged = false;

      if (choice < 0.66 && busy.length) {
        /* A group of neighbours changes lane together, at 45 degrees. A few groups are
           tried, because a move is only possible into empty lanes. */
        for (var attempt = 0; attempt < 6 && !jogged; attempt++) {
          var from = busy[Math.floor(random() * busy.length)];
          var to = from;
          while (to + 1 < count && lanes[to + 1] && to - from < 3 && random() < 0.75) { to++; }
          while (from > 0 && lanes[from - 1] && to - from < 3 && random() < 0.5) { from--; }
          var direction = random() < 0.5 ? 1 : -1;
          var shift = 1 + Math.floor(random() * 3);
          var clear = true;
          var step;
          for (step = 1; step <= shift; step++) {
            var target = direction > 0 ? to + step : from - step;
            if (target < 0 || target >= count || lanes[target]) { clear = false; }
          }
          if (!clear) { continue; }
          var moved = [];
          for (lane = from; lane <= to; lane++) {
            /* The stagger keeps the diagonals the same distance apart as the verticals. */
            var startY = y + (direction > 0 ? to - lane : lane - from) * 0.414 * pitch;
            lanes[lane].pts.push([x(lane), startY]);
            lanes[lane].pts.push([x(lane + direction * shift), startY + shift * pitch]);
            moved.push(lanes[lane]);
            lanes[lane] = null;
          }
          for (step = 0; step < moved.length; step++) {
            lanes[from + step + direction * shift] = moved[step];
          }
          y += shift * pitch + (to - from) * 0.414 * pitch;
          jogged = true;
        }
      }

      if (jogged) {
        /* Nothing else at this height. */
      } else if (choice < 0.84 && busy.length > 2) {
        /* A trace ends on a via. */
        var ending = busy[Math.floor(random() * busy.length)];
        lanes[ending].pts.push([x(ending), y]);
        lanes[ending].endVia = true;
        lanes[ending] = null;
      } else if (free.length) {
        /* A new trace starts from a via, more often near the edge of the screen. */
        begin(free[Math.floor(random() * random() * free.length)], y, true);
      }
      y += 26 + random() * 64;
    }

    for (lane = 0; lane < count; lane++) {
      if (lanes[lane]) {
        var points = lanes[lane].pts;
        points.push([points[points.length - 1][0], field.h + 12]);
      }
    }

    return traces.filter(function (trace) {
      trace.pts.forEach(function (point) {
        point[0] = region.x + (region.mirror ? region.w - point[0] : point[0]);
      });
      return measure(trace).length > 36;
    });
  }

  /* ---------- routing: the board on the home page ---------- */

  /* One chip and the traces that leave it. "limits" says how far the traces may run on
     each side; a side that cannot reach the edge of the drawing ends on vias. */
  function placeChip(field, chip, limits, traces) {
    var pitch = 12;
    var spread = 26;
    var stub = 6;
    var half = chip.size / 2;
    var middle = (chip.pins - 1) / 2;
    chip.pitch = pitch;
    chip.stub = stub;
    chip.glow = 0;
    field.chips.push(chip);

    /* "along" is the direction the traces leave in, "across" the direction the pins are
       lined up in. Outer pins bend first, so the fan opens without any trace crossing. */
    function side(ax, ay, bx, by, reach, viaEnds) {
      for (var pin = 0; pin < chip.pins; pin++) {
        var offset = pin - middle;
        var fan = Math.abs(offset) * (spread - pitch);
        var straight = 14 + (middle - Math.abs(offset)) * pitch * 0.9;
        var sign = offset < 0 ? -1 : 1;
        var used = half + stub + straight + fan;
        var tail = viaEnds ? Math.max(6, (reach - used) * (0.3 + ((pin * 37 + chip.pins) % 7) / 10)) : Math.max(4, reach - used);
        var start = [chip.x + ax * (half + stub) + bx * offset * pitch, chip.y + ay * (half + stub) + by * offset * pitch];
        var bend = [start[0] + ax * straight, start[1] + ay * straight];
        var fanned = [bend[0] + ax * fan + bx * sign * fan, bend[1] + ay * fan + by * sign * fan];
        var end = [fanned[0] + ax * tail, fanned[1] + ay * tail];
        var points = offset === 0 ? [start, end] : [start, bend, fanned, end];
        traces.push(measure({ pts: points, startVia: false, endVia: viaEnds, chip: chip }));
      }
    }

    side(1, 0, 0, 1, limits.right - chip.x, limits.rightVias);
    side(-1, 0, 0, 1, chip.x - limits.left, limits.leftVias);
    side(0, -1, 1, 0, chip.y + 12, false);
    side(0, 1, 1, 0, field.h - chip.y + 12, false);

    /* Small two-pad parts in the corners, where no trace passes. */
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (corner, index) {
      var reach = half + 20 + (index % 2) * 9;
      field.parts.push({ x: chip.x + corner[0] * reach, y: chip.y + corner[1] * reach, upright: index % 2 === 0 });
    });
  }

  /* The whole board: the drawing is cut into columns, one chip per column, with a
     bundle of traces running down between two columns. */
  function routeBoard(field, random) {
    var traces = [];
    var columns = field.w >= 1500 ? 4 : field.w >= 900 ? 3 : field.w >= 560 ? 2 : 1;
    var width = field.w / columns;
    var gutter = 46;
    /* Where the chips sit depends on how the board is shown (see .board-... in the
       stylesheet): low in the picture when it rises from the bottom of the hero, with
       the last one higher up, beside the text. */
    var rising = field.canvas.classList.contains('board-rise');
    var tall = field.h > 420;

    for (var column = 0; column < columns; column++) {
      var size = [96, 72, 84, 60][Math.floor(random() * 4)];
      var y;
      if (rising) {
        y = field.h - 104 - random() * 26;
        if (tall && columns > 1 && column === columns - 1) { y = field.h * 0.46; size = 96; }
      } else {
        y = field.h * (tall ? 0.34 + random() * 0.42 : 0.52 + random() * 0.08);
      }
      placeChip(field, {
        x: Math.round(width * (column + 0.5) + (random() - 0.5) * width * 0.16),
        y: Math.round(y),
        size: size,
        pins: Math.round(size / 12) - 2
      }, {
        left: column === 0 ? -12 : width * column + gutter,
        right: column === columns - 1 ? field.w + 12 : width * (column + 1) - gutter,
        leftVias: column > 0,
        rightVias: column < columns - 1
      }, traces);

      if (column > 0) {
        traces = traces.concat(routeLanes({ x: width * column - 38, w: 92, h: field.h, mirror: column % 2 === 1, most: 5 }, random));
      }
    }
    return traces;
  }

  /* ---------- drawing ---------- */

  function via(ctx, point, radius, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  function roundedSquare(ctx, cx, cy, size, radius) {
    var x = cx - size / 2;
    var y = cy - size / 2;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
  }

  /* The part that never changes: traces, vias and the chip. Drawn once and kept. */
  function drawBoard(field) {
    var ctx = field.board.getContext('2d');
    var line = rgba(field.trace, 1);
    ctx.setTransform(field.scale, 0, 0, field.scale, 0, 0);
    ctx.clearRect(0, 0, field.w, field.h);
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = line;

    field.traces.forEach(function (trace) {
      ctx.beginPath();
      trace.pts.forEach(function (point, index) {
        if (index) { ctx.lineTo(point[0], point[1]); } else { ctx.moveTo(point[0], point[1]); }
      });
      ctx.stroke();
    });
    field.traces.forEach(function (trace) {
      if (trace.startVia) { via(ctx, trace.pts[0], 3, line); }
      if (trace.endVia) { via(ctx, trace.pts[trace.pts.length - 1], 3, line); }
    });

    ctx.strokeStyle = line;
    field.parts.forEach(function (part) {
      var w = part.upright ? 5 : 8;
      var h = part.upright ? 8 : 5;
      var gap = 3;
      ctx.strokeRect(part.x - (part.upright ? w / 2 : w + gap / 2), part.y - (part.upright ? h + gap / 2 : h / 2), w, h);
      ctx.strokeRect(part.x + (part.upright ? -w / 2 : gap / 2), part.y + (part.upright ? gap / 2 : -h / 2), w, h);
    });

    field.chips.forEach(function (chip) {
      var half = chip.size / 2;
      var middle = (chip.pins - 1) / 2;
      ctx.strokeStyle = rgba(field.pulse, 0.9);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (var pin = 0; pin < chip.pins; pin++) {
        var offset = (pin - middle) * chip.pitch;
        ctx.moveTo(chip.x + half, chip.y + offset); ctx.lineTo(chip.x + half + chip.stub, chip.y + offset);
        ctx.moveTo(chip.x - half, chip.y + offset); ctx.lineTo(chip.x - half - chip.stub, chip.y + offset);
        ctx.moveTo(chip.x + offset, chip.y - half); ctx.lineTo(chip.x + offset, chip.y - half - chip.stub);
        ctx.moveTo(chip.x + offset, chip.y + half); ctx.lineTo(chip.x + offset, chip.y + half + chip.stub);
      }
      ctx.stroke();
      roundedSquare(ctx, chip.x, chip.y, chip.size, chip.size * 0.14);
      ctx.fillStyle = rgba(field.pulse, 0.07);
      ctx.fill();
      ctx.stroke();
      roundedSquare(ctx, chip.x, chip.y, chip.size * 0.44, chip.size * 0.05);
      ctx.stroke();
    });
  }

  /* One frame: the kept board, then the signals on top. */
  function draw(field) {
    var ctx = field.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, field.canvas.width, field.canvas.height);
    ctx.drawImage(field.board, 0, 0);
    ctx.setTransform(field.scale, 0, 0, field.scale, 0, 0);

    field.chips.forEach(function (chip) {
      if (chip.glow > 0.01) {
        roundedSquare(ctx, chip.x, chip.y, chip.size * 0.44, chip.size * 0.05);
        ctx.fillStyle = rgba(field.pulse, 0.55 * chip.glow);
        ctx.fill();
      }
    });

    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    field.pulses.forEach(function (pulse) {
      var trace = pulse.trace;
      var head = pulse.forward ? pulse.d : trace.length - pulse.d;
      var tail = pulse.forward ? head - pulse.tail : head + pulse.tail;
      var lo = Math.max(0, Math.min(head, tail));
      var hi = Math.min(trace.length, Math.max(head, tail));
      if (hi <= lo) { return; }
      var a = pointAt(trace, pulse.forward ? lo : hi);   /* faint end */
      var b = pointAt(trace, pulse.forward ? hi : lo);   /* bright end */
      var gradient = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
      gradient.addColorStop(0, rgba(field.pulse, 0));
      gradient.addColorStop(1, rgba(field.pulse, 0.95));
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      var start = pointAt(trace, lo);
      ctx.moveTo(start[0], start[1]);
      for (var i = 1; i < trace.at.length - 1; i++) {
        if (trace.at[i] > lo && trace.at[i] < hi) { ctx.lineTo(trace.pts[i][0], trace.pts[i][1]); }
      }
      var finish = pointAt(trace, hi);
      ctx.lineTo(finish[0], finish[1]);
      ctx.stroke();

      if (head >= 0 && head <= trace.length) {
        ctx.save();
        ctx.shadowColor = rgba(field.pulse, 0.9);
        ctx.shadowBlur = 7;
        ctx.fillStyle = rgba(field.pulse, 1);
        ctx.beginPath();
        ctx.arc(b[0], b[1], 1.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    });
  }

  /* ---------- set-up and the loop ---------- */

  function colors(field) {
    var style = window.getComputedStyle(field.canvas);
    field.trace = channels(style.color);
    field.pulse = channels(style.stroke);
  }

  function build(field) {
    /* The size the canvas is laid out at, before any tilt applied by the stylesheet. */
    field.w = field.canvas.clientWidth;
    field.h = field.canvas.clientHeight;
    field.pulses = [];
    field.chips = [];
    field.parts = [];
    field.ready = field.w >= 44 && field.h >= 80;
    if (!field.ready) { return; }

    field.scale = Math.min(2, window.devicePixelRatio || 1);
    field.canvas.width = field.board.width = Math.round(field.w * field.scale);
    field.canvas.height = field.board.height = Math.round(field.h * field.scale);
    var random = seeded(field.kind + window.location.pathname);
    field.traces = field.kind === 'board'
      ? routeBoard(field, random)
      : routeLanes({ x: 0, w: field.w, h: field.h, mirror: field.kind === 'right' }, random);
    colors(field);
    drawBoard(field);
    draw(field);
    plan(field);
  }

  /* Sends the next signal after a short, irregular wait. */
  function plan(field) {
    window.clearTimeout(field.timer);
    field.canvas.dataset.state = reducedMotion.matches ? 'still' : 'live';
    if (reducedMotion.matches || !field.ready) { return; }
    var wait = field.kind === 'board' ? 180 + Math.random() * 520 : 500 + Math.random() * 1300;
    field.timer = window.setTimeout(function () {
      var limit = field.kind === 'board' ? 9 : 4;
      if (!document.hidden && field.visible && field.traces.length && field.pulses.length < limit) {
        var trace = field.traces[Math.floor(Math.random() * field.traces.length)];
        field.pulses.push({
          trace: trace,
          /* At a chip, more signals arrive than leave. */
          forward: trace.chip ? Math.random() < 0.4 : Math.random() < 0.7,
          d: 0,
          tail: 44 + Math.random() * 30,
          speed: 110 + Math.random() * 110
        });
        if (!raf) { last = 0; raf = window.requestAnimationFrame(frame); }
      }
      plan(field);
    }, wait);
  }

  function frame(now) {
    var elapsed = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    var moving = false;
    last = now;
    fields.forEach(function (field) {
      if (!field.ready) { return; }
      var glowing = field.chips.some(function (chip) { return chip.glow > 0.01; });
      var before = field.pulses.length + (glowing ? 1 : 0);
      field.pulses = field.pulses.filter(function (pulse) {
        pulse.d += pulse.speed * elapsed;
        /* A signal that reaches a chip lights its core for a moment. */
        if (pulse.trace.chip && !pulse.forward && !pulse.arrived && pulse.d >= pulse.trace.length) {
          pulse.arrived = true;
          pulse.trace.chip.glow = 1;
        }
        return pulse.d < pulse.trace.length + pulse.tail;
      });
      glowing = false;
      field.chips.forEach(function (chip) {
        chip.glow = Math.max(0, chip.glow - elapsed * 2.2);
        if (chip.glow > 0.01) { glowing = true; }
      });
      if (before) { draw(field); }
      if (field.pulses.length || glowing) { moving = true; }
    });
    raf = moving ? window.requestAnimationFrame(frame) : 0;
  }

  var resizing = new window.ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      fields.forEach(function (field) {
        if (field.canvas === entry.target) { build(field); }
      });
    });
  });

  var watching = 'IntersectionObserver' in window ? new window.IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      fields.forEach(function (field) {
        if (field.canvas === entry.target) { field.visible = entry.isIntersecting; }
      });
    });
  }) : null;

  Array.prototype.forEach.call(canvases, function (canvas) {
    var field = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      board: document.createElement('canvas'),
      kind: canvas.getAttribute('data-traces'),
      pulses: [],
      traces: [],
      chips: [],
      parts: [],
      visible: true
    };
    if (!field.ctx) { return; }
    fields.push(field);
    resizing.observe(canvas);
    if (watching) { watching.observe(canvas); }
  });

  /* The colours follow the theme switch and the system's light or dark setting. */
  function recolor() {
    fields.forEach(function (field) {
      if (field.ready) { colors(field); drawBoard(field); draw(field); }
    });
  }
  new window.MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  if (dark.addEventListener) { dark.addEventListener('change', recolor); }

  /* Reduced motion can be switched while the page is open. */
  function motionChanged() {
    fields.forEach(function (field) {
      field.pulses = [];
      field.chips.forEach(function (chip) { chip.glow = 0; });
      if (field.ready) { draw(field); }
      plan(field);
    });
  }
  if (reducedMotion.addEventListener) { reducedMotion.addEventListener('change', motionChanged); }
})();
