/* TrustZone-M and TF-M timing explorer: a small scheduling simulator, comparison bars,
   a security lens and a finder. No dependencies. Used by the project page and by
   /tfm/explorer/. Every number that is not computed comes from the project's own
   measurements and names the experiment it came from. */
(function (root) {
  "use strict";

  var BASE = "/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/";

  /* ---- the pages of the project: id -> [path, title, lab] ---- */
  var PAGES = {
    f01: ["fundamentals/f01-trustzone-and-psa-calls", "Two worlds on one core: TrustZone-M, veneers and PSA calls", 0],
    f02: ["fundamentals/f02-response-time-analysis", "Response-time analysis in ten minutes", 0],
    m01: ["measuring/m01-hardware-timestamps", "Why the kernel clock is not trusted", 1],
    m02: ["measuring/m02-two-boards-one-method", "Two boards, one method", 2],
    c01: ["call-costs/c01-anatomy-of-a-call", "Anatomy of a Secure call", 3],
    c02: ["call-costs/c02-tfm-over-bare-trustzone", "What TF-M costs over bare TrustZone-M", 4],
    c03: ["call-costs/c03-service-catalogue", "The price list of Secure services", 5],
    b01: ["blocking-and-scheduling/b01-mutex-blocking", "One mutex, one blocking term", 6],
    b02: ["blocking-and-scheduling/b02-chunking-shapes-blocking", "Chunking: how long may a Secure call be", 7],
    b03: ["blocking-and-scheduling/b03-secure-interrupts-and-the-tick", "Secure interrupts and the kernel clock", 8],
    b04: ["blocking-and-scheduling/b04-random-task-sets", "Random task sets: does the bound hold?", 9],
    s01: ["flash-and-cache/s01-what-a-storage-write-does", "What a Secure storage write does to other code", 10],
    s02: ["flash-and-cache/s02-open-and-closed-window", "The closed window and the open window", 11],
    s03: ["flash-and-cache/s03-fixing-the-freeze", "Removing the freeze and the slowdown", 12],
    s04: ["flash-and-cache/s04-cache-related-preemption-delay", "Cache-related preemption delay", 13],
    a01: ["containment-and-availability/a01-secure-side-budget-and-identity", "A runaway client: cap, budget and identity", 14],
    a02: ["containment-and-availability/a02-faults-and-recovery", "What a fault costs", 15],
    a03: ["containment-and-availability/a03-update-downtime", "Updating a running device", 16],
    a04: ["containment-and-availability/a04-connection-pool", "The connection pool", 17],
    ai01: ["secure-ai-inference/ai01-toolchain-not-trustzone", "The slowdown that was the build, not TrustZone", 18],
    ai02: ["secure-ai-inference/ai02-granularity-decides-misses", "One call or many: who misses", 19],
    ai03: ["secure-ai-inference/ai03-floor-and-cap", "The floor of the blocking term, and a cap", 20],
    ai04: ["secure-ai-inference/ai04-terms-of-the-analysis", "The terms of the analysis", 21],
    x01: ["validation/x01-validation-report", "The validation report", 0],
    x02: ["validation/x02-limits-and-open-questions", "Limits and open questions", 0]
  };

  function pageLink(id) {
    var p = PAGES[id];
    var lab = p[2] ? "Lab 0x" + (p[2] < 16 ? "0" : "") + p[2].toString(16).toUpperCase() + " · " : "";
    return '<a href="' + BASE + p[0] + '/"><span class="tfm-labid">' + lab + "</span>" + esc(p[1]) + "</a>";
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---- units ---- */
  function trim(x) { return x.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
  function fmt(us) {
    if (us < 1) return trim(us.toFixed(3)) + " µs";
    if (us < 100) return trim(us.toFixed(2)) + " µs";
    if (us < 1000) return Math.round(us) + " µs";
    if (us < 1e6) {
      var ms = us / 1000;
      return trim((ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : String(Math.round(ms)))) + " ms";
    }
    return trim((us / 1e6).toFixed(2)) + " s";
  }

  /* ---- the services the low-priority task can call (longest single call, exp9l / exp9ai) ---- */
  var SERVICES = [
    { id: "rng", name: "Random number (32 B)", d: 38, exp: "exp9l" },
    { id: "sha", name: "SHA-256 of 4 KB", d: 1250, exp: "exp9l" },
    { id: "gcm", name: "AES-256-GCM, 256 B", d: 1650, exp: "exp9l" },
    { id: "its", name: "Protected-storage write (ITS), 512 B", d: 6400, exp: "exp9l" },
    { id: "ai", name: "Secure neural network, one inference", d: 8400, exp: "exp9ai" },
    { id: "ps", name: "Protected-storage write (PS), 512 B", d: 81000, exp: "exp9l" },
    { id: "sign", name: "ECDSA P-256 sign, in software", d: 103000, exp: "exp9l" },
    { id: "verify", name: "ECDSA P-256 verify, in software", d: 299000, exp: "exp9l" }
  ];

  /* ---- the simulator ----
     Fixed-priority preemptive scheduling with one mutex around every Secure call, as
     Zephyr's PSA wrapper does. Task set shaped like exp9g: TH 2 ms, TM 5 ms, TL one long
     call. Execution times are simplified, and splitting a call costs 30 us per extra call
     (the per-call overhead measured in exp9p). It is an illustration of the mechanism,
     not a replay of a recorded run. */
  function simulate(o) {
    var D = o.D, n = Math.max(1, o.n | 0), inherit = o.inherit !== false, OH = 30;
    var piece = n > 1 ? D / n + OH : D;
    var tlSegs = [["ns", 200]];
    for (var i = 0; i < n; i++) tlSegs.push(["sec", piece]);
    tlSegs.push(["ns", 200]);
    var T = [
      { id: "TH", prio: 3, per: 2000, segs: [["ns", 300], ["sec", 36]], next: 0 },
      { id: "TM", prio: 2, per: 5000, segs: [["ns", 1200]], next: 0 },
      { id: "TL", prio: 1, per: 0, segs: tlSegs, next: 3000 }
    ];
    var lanes = { TH: [], TM: [], TL: [], MX: [] };
    var jobs = [], mutex = null, t = 0, stopAt = Infinity, guard = 0, tlJob = null;

    function rec(l, a, b, k) {
      var arr = lanes[l], last = arr[arr.length - 1];
      if (last && last.kind === k && Math.abs(last.b - a) < 1e-6) last.b = b;
      else arr.push({ a: a, b: b, kind: k });
    }
    function inSec(j) { return j.task.segs[j.i][0] === "sec"; }
    // blocked: in a Secure call that someone else holds, or already queued for it
    function wants(j) { return inSec(j) && mutex !== j && (mutex !== null || j.queued); }

    while (guard++ < 600000 && t < 8e6) {
      T.forEach(function (k) {
        while (k.next <= t + 1e-9) {
          var j = { task: k, id: k.id, prio: k.prio, rel: k.next, i: 0, rem: k.segs[0][1], done: false, fin: null, wait: 0 };
          jobs.push(j);
          if (k.id === "TL") tlJob = j;
          k.next = k.per ? k.next + k.per : Infinity;
        }
      });
      if (tlJob && stopAt === Infinity && tlJob.i >= tlSegs.length - 1) stopAt = tlJob.secEnd + 5000;
      var act = jobs.filter(function (j) { return !j.done; });

      // a job that tried the mutex and was refused is queued; on release the mutex goes to the best of them
      act.forEach(function (j) { if (inSec(j) && mutex !== null && mutex !== j) j.queued = true; });
      if (mutex === null) {
        var best = null;
        act.forEach(function (j) {
          if (j.queued && inSec(j) && (!best || j.prio > best.prio || (j.prio === best.prio && j.rel < best.rel))) best = j;
        });
        if (best) { mutex = best; best.queued = false; }
      }
      act.forEach(function (j) { j.eff = j.prio; });
      if (inherit && mutex) {
        act.forEach(function (j) { if (wants(j) && j.prio > mutex.eff) mutex.eff = j.prio; });
      }
      var run = null;
      act.forEach(function (j) {
        if (wants(j)) return;
        if (!run || j.eff > run.eff || (j.eff === run.eff && j.rel < run.rel)) run = j;
      });
      if (run && mutex === null && inSec(run)) mutex = run;
      var nextRel = Infinity;
      T.forEach(function (k) { if (k.next < nextRel) nextRel = k.next; });
      var h;
      if (run) h = Math.min(run.rem, nextRel - t);
      else { if (!isFinite(nextRel)) break; h = nextRel - t; }
      if (!(h > 1e-9)) h = 1e-3;
      var te = t + h;
      if (stopAt !== Infinity && te > stopAt) { te = stopAt; h = te - t; }

      act.forEach(function (j) {
        if (j === run) rec(j.id, t, te, j.task.segs[j.i][0]);
        else if (wants(j)) { rec(j.id, t, te, "wait"); j.wait += h; }
        else rec(j.id, t, te, "ready");
      });
      if (mutex) rec("MX", t, te, mutex.id);
      if (run) {
        run.rem -= h;
        if (run.rem <= 1e-9) {
          if (run.task.segs[run.i][0] === "sec" && mutex === run) mutex = null;
          if (run.id === "TL" && run.i === tlSegs.length - 2) run.secEnd = te;
          run.i++;
          if (run.i >= run.task.segs.length) { run.done = true; run.fin = te; }
          else run.rem = run.task.segs[run.i][1];
        }
      }
      t = te;
      if (stopAt !== Infinity && t >= stopAt - 1e-9) break;
    }
    var end = t;
    function stats(id) {
      var tot = 0, miss = 0, worst = 0, wmax = 0;
      jobs.forEach(function (j) {
        if (j.id !== id) return;
        var dl = j.rel + j.task.per;
        if (dl > end + 1e-6) return;
        tot++;
        j.miss = !j.done || j.fin > dl + 1e-6;
        if (j.miss) miss++;
        worst = Math.max(worst, (j.done ? j.fin : end) - j.rel);
        wmax = Math.max(wmax, j.wait);
      });
      return { tot: tot, miss: miss, worst: worst, wmax: wmax };
    }
    return {
      lanes: lanes, jobs: jobs, end: end, piece: piece, n: n, D: D, inherit: inherit,
      TH: stats("TH"), TM: stats("TM"), overhead: n > 1 ? (n * piece) / D - 1 : 0
    };
  }

  /* ---- drawing the schedule ---- */
  var uid = 0;
  var W = 960, LEFT = 96, RIGHT = 14, LANE_H = 30, TOP = 24;
  var LANES = [
    { id: "TH", label: "High task", sub: "2 ms" },
    { id: "TM", label: "Medium task", sub: "5 ms" },
    { id: "TL", label: "Low task", sub: "long call" },
    { id: "MX", label: "Secure mutex", sub: "held by" }
  ];
  function laneY(i) { return TOP + i * (LANE_H + 12); }
  var HEIGHT = TOP + 4 * (LANE_H + 12) + 26;

  function niceStep(total) {
    var c = [50, 100, 200, 500, 1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6];
    for (var i = 0; i < c.length; i++) if (total / c[i] <= 9) return c[i];
    return 1e6;
  }
  function tickLabel(us, step) {
    if (step >= 1e6) return trim((us / 1e6).toFixed(1)) + " s";
    if (step >= 1000) return trim((us / 1000).toFixed(step >= 1e3 && step % 1000 ? 1 : 0)) + " ms";
    return Math.round(us) + " µs";
  }

  function drawStatic(sim, id) {
    var x = function (t) { return LEFT + (t / sim.end) * (W - LEFT - RIGHT); };
    var s = "";
    s += '<defs><pattern id="hatch' + id + '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" class="tfm-wait-bg"/><line x1="0" y1="0" x2="0" y2="6" class="tfm-wait-line"/></pattern>' +
      '<clipPath id="clip' + id + '"><rect class="tfm-clip" x="0" y="0" width="0" height="' + HEIGHT + '"/></clipPath></defs>';
    var step = niceStep(sim.end), ax = laneY(3) + LANE_H + 14;
    for (var tk = 0; tk <= sim.end + 1e-6; tk += step) {
      s += '<line class="tfm-grid" x1="' + x(tk).toFixed(1) + '" y1="' + (TOP - 8) + '" x2="' + x(tk).toFixed(1) + '" y2="' + (ax - 8) + '"/>';
      s += '<text class="tfm-tick" x="' + x(tk).toFixed(1) + '" y="' + (ax + 8) + '" text-anchor="middle">' + tickLabel(tk, step) + "</text>";
    }
    LANES.forEach(function (ln, i) {
      var y = laneY(i);
      s += '<rect class="tfm-lane" x="' + LEFT + '" y="' + y + '" width="' + (W - LEFT - RIGHT) + '" height="' + LANE_H + '"/>';
      s += '<text class="tfm-lane-name" x="' + (LEFT - 8) + '" y="' + (y + 13) + '" text-anchor="end">' + ln.label + "</text>";
      s += '<text class="tfm-lane-sub" x="' + (LEFT - 8) + '" y="' + (y + 25) + '" text-anchor="end">' + ln.sub + "</text>";
    });
    s += '<g clip-path="url(#clip' + id + ')">';
    LANES.forEach(function (ln, i) {
      var y = laneY(i);
      sim.lanes[ln.id].forEach(function (g) {
        var x1 = x(g.a), w = Math.max(0.6, x(g.b) - x1), cls, fill = "";
        if (ln.id === "MX") { cls = "tfm-mx-" + g.kind; }
        else if (g.kind === "wait") { cls = "tfm-wait"; fill = ' fill="url(#hatch' + id + ')"'; }
        else cls = "tfm-" + g.kind;
        var hh = g.kind === "ready" ? 8 : LANE_H;
        var yy = g.kind === "ready" ? y + LANE_H - 8 : y;
        s += '<rect class="' + cls + '"' + fill + ' x="' + x1.toFixed(2) + '" y="' + yy + '" width="' + w.toFixed(2) + '" height="' + hh + '"/>';
      });
    });
    sim.jobs.forEach(function (j) {
      if (j.id === "TL") return;
      var i = j.id === "TH" ? 0 : 1, y = laneY(i), dl = j.rel + j.task.per;
      if (j.rel <= sim.end) s += '<path class="tfm-rel" d="M' + x(j.rel).toFixed(1) + " " + (y - 6) + "v5\"/>";
      if (j.miss && dl <= sim.end) {
        var cx = x(dl);
        s += '<path class="tfm-miss" d="M' + (cx - 3.5).toFixed(1) + " " + (y + 3) + "l7 7m0 -7l-7 7\"/>";
      }
    });
    s += "</g>";
    s += '<line class="tfm-playhead" x1="' + LEFT + '" y1="' + (TOP - 10) + '" x2="' + LEFT + '" y2="' + (ax - 8) + '"/>';
    return s;
  }

  function stateAt(sim, t) {
    function at(l) {
      var a = sim.lanes[l];
      for (var i = 0; i < a.length; i++) if (t >= a[i].a && t < a[i].b) return a[i].kind;
      return "idle";
    }
    return { TH: at("TH"), TM: at("TM"), TL: at("TL"), MX: at("MX") };
  }
  function narrate(sim, t) {
    var s = stateAt(sim, t);
    if (s.TH === "wait" && (s.TM === "ns")) return "The medium task is running while the high task waits: a priority inversion, because the low task cannot finish its call.";
    if (s.TH === "wait" && s.TM === "ready") return "The high task needs the Secure world and has to wait for the low task’s call. The medium task never calls it, yet it is held back too.";
    if (s.TH === "wait") return "The high task needs the Secure world, which the low task is using. It waits until that call returns.";
    if (s.TL === "sec" && s.TH === "ns") return "The high task preempts the low task’s call at once; the Secure call carries on only when the high task is done.";
    if (s.TL === "sec") return "The low task is inside a Secure call. Other tasks can preempt it, but only if they do not need the Secure world.";
    if (s.TH === "sec") return "The high task makes its own short Secure call.";
    if (s.TH === "ns" || s.TM === "ns" || s.TL === "ns") return "Ordinary Non-Secure work: the highest priority task runs.";
    return "Idle until the next release.";
  }

  /* ---- mounting the simulator ---- */
  var reduce = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mountSim(el, opt) {
    opt = opt || {};
    var id = ++uid, compact = !!opt.compact;
    var st = { service: opt.service || "ai", n: opt.n || 1, inherit: true, speed: 1, t: 0, playing: false, sim: null, raf: 0, last: 0, holdUntil: 0, visible: false };
    var svc = function () { return SERVICES.filter(function (x) { return x.id === st.service; })[0]; };
    var pieces = [1, 2, 4, 8, 16, 32, 64];

    el.classList.add("tfm-sim");
    el.innerHTML =
      '<div class="tfm-controls">' +
      '<label>The low task calls <select data-k="service">' + SERVICES.map(function (x) {
        return '<option value="' + x.id + '"' + (x.id === st.service ? " selected" : "") + ">" + esc(x.name) + " · " + fmt(x.d) + "</option>";
      }).join("") + "</select></label>" +
      '<label>in <select data-k="n">' + pieces.map(function (p) {
        return '<option value="' + p + '"' + (p === st.n ? " selected" : "") + ">" + (p === 1 ? "one call" : p + " pieces") + "</option>";
      }).join("") + "</select></label>" +
      (compact ? "" : '<label class="tfm-check"><input type="checkbox" data-k="inherit" checked> priority inheritance</label>') +
      '<span class="tfm-btns"><button type="button" class="tfm-btn" data-a="play" aria-label="Pause">Pause</button>' +
      '<button type="button" class="tfm-btn" data-a="restart">Replay</button></span>' +
      (compact ? "" : '<label>speed <select data-k="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>') +
      "</div>" +
      '<ul class="tfm-legend" aria-hidden="true"><li><i class="tfm-k tfm-ns"></i>Non-Secure code</li><li><i class="tfm-k tfm-sec"></i>Inside a Secure call</li>' +
      '<li><i class="tfm-k tfm-wait-k"></i>Waiting for the Secure world</li><li><i class="tfm-k tfm-ready"></i>Ready, preempted</li><li><i class="tfm-k tfm-x">×</i>Missed deadline</li></ul>' +
      '<div class="tfm-scroll"><svg class="tfm-svg" viewBox="0 0 ' + W + " " + HEIGHT + '" role="img" aria-label="Timeline of three tasks and the Secure mutex"></svg></div>' +
      '<p class="tfm-now" aria-live="polite"></p>' +
      '<div class="tfm-stats"></div>' +
      '<p class="tfm-note">An illustration of the mechanism: a task set shaped like the one in exp9g, execution times simplified, and 30 µs for every extra call (exp9p). Pieces are equal slices of the call; in the neural-network labs they are convolution rows. It is not a replay of a recorded run.</p>';

    var svg = el.querySelector(".tfm-svg"), now = el.querySelector(".tfm-now"),
        statsEl = el.querySelector(".tfm-stats"), playBtn = el.querySelector('[data-a="play"]');

    function build() {
      st.sim = simulate({ D: svc().d, n: st.n, inherit: st.inherit });
      svg.innerHTML = drawStatic(st.sim, id);
      var S = st.sim, th = S.TH, tm = S.TM;
      function card(label, value, bad, sub) {
        return '<div class="tfm-stat' + (bad ? " tfm-bad" : "") + '"><span class="tfm-stat-l">' + label + '</span><b>' + value + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>";
      }
      statsEl.innerHTML =
        card("Longest single Secure call", fmt(S.piece), false, "the blocking term B") +
        card("High task: longest wait", fmt(th.wmax), th.wmax > 1500, "for the Secure world") +
        card("High task: deadlines missed", th.miss + " of " + th.tot, th.miss > 0, "deadline = next release") +
        card("Medium task: deadlines missed", tm.miss + " of " + tm.tot, tm.miss > 0, "it never calls Secure") +
        card("Cost of splitting", S.n > 1 ? "+" + Math.round(S.overhead * 1000) / 10 + " %" : "none", false, "extra Secure time");
      setT(compact || reduce ? (reduce ? S.end : 0) : 0);
    }
    function setT(t) {
      st.t = t;
      var clip = svg.querySelector(".tfm-clip"), head = svg.querySelector(".tfm-playhead");
      var S = st.sim, px = LEFT + (t / S.end) * (W - LEFT - RIGHT);
      if (clip) clip.setAttribute("width", Math.max(0, px));
      if (head) { head.setAttribute("x1", px); head.setAttribute("x2", px); }
      now.textContent = narrate(S, Math.min(t, S.end - 1e-3));
    }
    function frame(ts) {
      if (!st.playing) return;
      if (!st.last) st.last = ts;
      var dt = ts - st.last; st.last = ts;
      if (st.holdUntil) {
        if (ts >= st.holdUntil) { st.holdUntil = 0; st.t = 0; setT(0); }
        st.raf = requestAnimationFrame(frame); return;
      }
      var rate = st.sim.end / 9000 * st.speed;
      var nt = st.t + dt * rate;
      if (nt >= st.sim.end) {
        setT(st.sim.end);
        if (compact) { st.holdUntil = ts + 2200; st.raf = requestAnimationFrame(frame); }
        else { st.playing = false; playBtn.textContent = "Play"; playBtn.setAttribute("aria-label", "Play"); }
        return;
      }
      setT(nt);
      st.raf = requestAnimationFrame(frame);
    }
    function play() {
      if (reduce) { setT(st.sim.end); return; }
      if (st.t >= st.sim.end) setT(0);
      st.playing = true; st.last = 0; playBtn.textContent = "Pause"; playBtn.setAttribute("aria-label", "Pause");
      cancelAnimationFrame(st.raf); st.raf = requestAnimationFrame(frame);
    }
    function pause() {
      st.playing = false; cancelAnimationFrame(st.raf);
      playBtn.textContent = "Play"; playBtn.setAttribute("aria-label", "Play");
    }
    el.addEventListener("change", function (e) {
      var k = e.target.getAttribute("data-k");
      if (!k) return;
      if (k === "service") st.service = e.target.value;
      else if (k === "n") st.n = parseInt(e.target.value, 10);
      else if (k === "inherit") st.inherit = e.target.checked;
      else if (k === "speed") { st.speed = parseFloat(e.target.value); return; }
      build(); if (st.visible || !compact) play();
    });
    el.addEventListener("click", function (e) {
      var a = e.target.getAttribute && e.target.getAttribute("data-a");
      if (a === "play") { st.playing ? pause() : play(); }
      if (a === "restart") { setT(0); play(); }
    });
    build();
    if (reduce) { setT(st.sim.end); playBtn.style.display = "none"; el.querySelector('[data-a="restart"]').style.display = "none"; }
    else if (opt.autoplay === false) { setT(0); pause(); }
    else if ("IntersectionObserver" in root) {
      new IntersectionObserver(function (es) {
        st.visible = es[0].isIntersecting;
        if (st.visible) { if (!st.playing && !st.userPaused) play(); } else if (st.playing) pause();
      }, { threshold: 0.35 }).observe(el);
      playBtn.addEventListener("click", function () { st.userPaused = !st.playing; });
    } else play();
    el.tfm = { set: function (service, n) { st.service = service; st.n = n; el.querySelector('[data-k="service"]').value = service; el.querySelector('[data-k="n"]').value = String(n); build(); play(); } };
    return st;
  }

  /* ---- comparison bars ---- */
  var COMPARE = [
    { id: "call", title: "What one Secure call costs", q: "Where does the time of a call go?", scale: "log", link: "c02",
      bars: [
        { l: "Bare TrustZone-M call, through a veneer", v: 0.117, tone: "a", note: "28 cycles (exp9y)" },
        { l: "One psa_call() through TF-M", v: 14.02, tone: "b", note: "exp9y" },
        { l: "Whole transaction: connect, call, close", v: 37.45, tone: "c", note: "36.2 µs in the reference build" }
      ], cap: "More than 99 % of the cost is the PSA framework, not the TrustZone transition." },
    { id: "same", title: "Is Secure code itself slower?", q: "Same operation, run in each world", scale: "lin", link: "c01",
      bars: [
        { l: "Non-Secure state", v: 58.812, tone: "a", note: "includes 0.233 µs of clock read" },
        { l: "Secure state", v: 58.570, tone: "b", note: "" }
      ], cap: "Less than 0.5 % apart. The cost is in crossing, not in running." },
    { id: "chunk", title: "One long call or many short ones", q: "SHA-256 of 4 KB (exp9p)", scale: "log", link: "b02",
      bars: [
        { l: "Longest call, one call", v: 1250, tone: "c", note: "" },
        { l: "Longest call, 16 pieces", v: 111, tone: "a", note: "11× shorter" },
        { l: "Total time, one call", v: 1250, tone: "c", note: "" },
        { l: "Total time, 16 pieces", v: 1774, tone: "b", note: "+42 %" }
      ], cap: "Splitting shrinks what others wait for, and costs a little more in total." },
    { id: "ai", title: "A Secure neural network", q: "How long does it block a 2 ms task? (exp9ai, exp9ak)", scale: "log", link: "ai03",
      bars: [
        { l: "One call", v: 8400, tone: "c", note: "39 % of the 2 ms task's deadlines missed" },
        { l: "Chunked to the floor", v: 200, tone: "a", note: "one row plus the call path; no misses; +2.5 % Secure time" }
      ], cap: "The blocking term is a property of how the service is called, not of the network." },
    { id: "build", title: "Same network, two builds", q: "How much slower is the Secure copy?", scale: "lin", link: "ai01", unit: "×",
      bars: [
        { l: "First build (−fno-builtin), STM32H5, up to", v: 5.4, tone: "c", note: "2.8 to 5.4×" },
        { l: "First build, FPB-RA4E1, up to", v: 4.67, tone: "c", note: "2.43 to 4.67×" },
        { l: "Builtins restored, STM32H5, up to", v: 1.15, tone: "a", note: "1.03 to 1.15×" }
      ], cap: "The slowdown was the compiler flag, not TrustZone." },
    { id: "flash", title: "Code speed during a Secure storage write", q: "Relative to normal speed (exp9h)", scale: "lin", link: "s01", unit: "×",
      bars: [
        { l: "Code running from flash, up to", v: 2.5, tone: "c", note: "2.0 to 2.5× slower" },
        { l: "Code running from SRAM", v: 1, tone: "a", note: "not slowed" }
      ], cap: "The flash driver turns the instruction cache off for the whole write." },
    { id: "erase", title: "Longest delay of an interrupt during an erase", q: "exp9i, exp9j", scale: "log", link: "s03",
      bars: [
        { l: "Default port, up to", v: 2900, tone: "c", note: "core stops 1.3 to 2.9 ms, no exception" },
        { l: "Erase sequence run from SRAM", v: 1, tone: "a", note: "1 µs or less" }
      ], cap: "A port fix, not a design change." },
    { id: "update", title: "Updating a running device", q: "432 KB image, device down (exp9aa)", scale: "lin", link: "a03",
      bars: [
        { l: "MCUboot swap", v: 5.50e6, tone: "c", note: "" },
        { l: "Overwrite-only", v: 2.91e6, tone: "a", note: "" }
      ], cap: "Overwrite-only trades the rollback for half the downtime." },
    { id: "price", title: "The price list of Secure services", q: "Longest single call, which is the blocking term (exp9l)", scale: "log", link: "c03",
      bars: SERVICES.map(function (x, i) { return { l: x.name, v: x.d, tone: i < 3 ? "a" : i < 6 ? "b" : "c", note: "" }; }),
      cap: "Four orders of magnitude. Whoever calls the longest one sets the blocking for everyone above." }
  ];

  function fmtVal(v, unit) {
    return unit === "×" ? trim(v.toFixed(v < 10 ? 2 : 1)) + "×" : fmt(v);
  }
  function mountCompare(el) {
    el.classList.add("tfm-compare");
    var html = '<div class="tfm-tabs-row" role="tablist" aria-label="Comparisons">' + COMPARE.map(function (c, i) {
      return '<button type="button" role="tab" class="tfm-chip" aria-selected="' + (i === 0) + '" data-i="' + i + '">' + esc(c.title) + "</button>";
    }).join("") + '</div><div class="tfm-cmp-body" role="tabpanel"></div>';
    el.innerHTML = html;
    var body = el.querySelector(".tfm-cmp-body");
    function show(i) {
      var c = COMPARE[i], vals = c.bars.map(function (b) { return b.v; });
      var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      function width(v) {
        if (c.scale === "lin") return Math.max(2, (v / (mx * 1.05)) * 100);
        var lo = Math.log10(mn / 4), hi = Math.log10(mx * 1.3);
        return Math.max(3, ((Math.log10(v) - lo) / (hi - lo)) * 100);
      }
      body.innerHTML = '<h3>' + esc(c.title) + '</h3><p class="tfm-q">' + esc(c.q) + "</p>" +
        '<ul class="tfm-bars">' + c.bars.map(function (b, k) {
          return '<li><span class="tfm-bar-l">' + esc(b.l) + '</span><span class="tfm-bar-t"><span class="tfm-bar tfm-tone-' + b.tone + '" style="--w:' + width(b.v).toFixed(1) + '%;--d:' + (k * 90) + 'ms"></span></span>' +
            '<span class="tfm-bar-v">' + fmtVal(b.v, c.unit) + (b.note ? "<small>" + esc(b.note) + "</small>" : "") + "</span></li>";
        }).join("") + "</ul>" +
        '<p class="tfm-cap">' + esc(c.cap) + (c.scale === "log" ? " <span class=\"tfm-scale\">Bars are on a logarithmic scale.</span>" : "") + "</p>" +
        '<p class="tfm-more">Read: ' + pageLink(c.link) + "</p>";
      if (reduce) body.classList.add("in");
      else { body.classList.remove("in"); void body.offsetWidth; requestAnimationFrame(function () { body.classList.add("in"); }); }
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-i]");
      if (!b) return;
      el.querySelectorAll("[data-i]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      show(parseInt(b.getAttribute("data-i"), 10));
    });
    show(0);
  }

  /* ---- the security lens ---- */
  var LENS = [
    { id: "conf", name: "Confidentiality", short: "Keys, secrets and model weights stay out of the application's reach.",
      price: [
        ["Every Secure call", "36 to 39 µs per transaction; the framework is 99 % of it", "exp6a, exp9y"],
        ["Crypto in the Secure world", "SHA-256 of 4 KB up to 1.25 ms, AES-GCM 1.65 ms, ECDSA sign 103 ms, verify 299 ms: each is a blocking term", "exp9l"],
        ["A neural network behind the boundary, one call", "blocks a 2 ms task for 8.4 ms; 39 % of its deadlines missed", "exp9ai"],
        ["Writing a key to storage", "about 6 ms; flash code runs 2.0 to 2.5× slower during the write; a sector erase stops the core 1.3 to 2.9 ms", "exp9h, exp9i"]
      ],
      keep: ["Split long services: a 4 KB SHA-256 in 16 pieces has an 11× shorter longest call for 42 % more total time.",
        "Chunk the network by rows: no misses, blocking floor of 200 µs for 2.5 % more Secure time.",
        "Check the build before blaming TrustZone: the 2.8 to 5.4× slowdown was a compiler flag.",
        "Run the flash erase from SRAM or keep storage in the second bank."],
      read: ["c03", "ai01", "ai02", "ai03", "s01", "s03", "b02"] },
    { id: "int", name: "Integrity", short: "What runs, what is stored and what is installed can be checked.",
      price: [
        ["Installing a signed update", "432 KB image: 5.5 s down with MCUboot swap, 2.9 s with overwrite-only", "exp9aa"],
        ["Measuring the system from the Secure side", "bounds hold in nine of ten cases (0.94 to 0.997); one 16 KB check at a 10 ms period exceeds its bound", "exp9ag"],
        ["Signature verification in software", "299 ms per ECDSA P-256 verify", "exp9l"],
        ["Attestation token", "not measured here; about 0.1 s estimated from its parts, and labelled as an estimate", "exp9s"]
      ],
      keep: ["Run the check in short pieces and give it a lower priority than the control loop.",
        "Plan the update window: downtime depends on the image slot scheme, not only on the size.",
        "Treat verify and sign as services with a known blocking term, and place them below tasks that can afford it."],
      read: ["a02", "a03", "c03", "b02", "x02"] },
    { id: "iso", name: "Isolation and containment", short: "A fault or a greedy client in one place does not take the rest down.",
      price: [
        ["Isolation between callers", "a psa_call() is 14.0 µs; a bare veneer is 0.117 µs. The difference buys isolation, scheduling and a message model", "exp9y"],
        ["A fault in either world", "a full reset of about 1.5 s; with a one-line fatal-error policy all 11 injected fault kinds recovered", "exp9ad"],
        ["A client that makes long calls", "a 2.96 ms call below a 2 ms TF-M user caused 30 % deadline misses", "exp9z"],
        ["Knowing who is calling", "0.6 µs per context switch to carry the client identity", "exp9af"],
        ["Shared resources", "eight persistent connections starve every stateless call of every task", "exp9ac"]
      ],
      keep: ["Put a cap on the work of one call inside the Secure partition: the cap alone brought the misses to zero.",
        "Add a per-client budget: it cut the offender's accepted calls 3.5× and left a well-behaved client untouched.",
        "Do not hold persistent connections you do not need."],
      read: ["c02", "a01", "a02", "a04", "f01"] },
    { id: "avail", name: "Availability and real time", short: "Deadlines are still met while the Secure world is busy.",
      price: [
        ["A call of a lower task", "blocks everyone above it that uses TF-M, and delays the tasks in between: 38 µs to 0.3 s by service", "exp9a, exp9l"],
        ["A task released into a Secure call", "starts only 1.06 to 1.21 µs later than in a Non-Secure baseline", "exp7a to exp7c"],
        ["A Secure storage write", "flash code 2.0 to 2.5× slower; each erase stops the core 1.3 to 2.9 ms", "exp9h, exp9i"],
        ["A Secure interrupt", "preempts every Non-Secure task and interrupt; the kernel clock can lose time", "exp9n, exp9o"]
      ],
      keep: ["Choose the service for the task: its longest call is everyone's blocking term.",
        "Use the bound: on 96 random task sets it covered all 288 observed worst cases, median 0.98.",
        "Move the flash driver and hot handlers to SRAM, or store in the second bank."],
      read: ["b01", "b02", "b03", "b04", "s01", "s02", "f02"] }
  ];

  function mountLens(el) {
    el.classList.add("tfm-lens");
    el.innerHTML = '<div class="tfm-tabs-row" role="tablist" aria-label="Security properties">' + LENS.map(function (l, i) {
      return '<button type="button" role="tab" class="tfm-chip" aria-selected="' + (i === 0) + '" data-i="' + i + '">' + l.name + "</button>";
    }).join("") + '</div><div class="tfm-lens-body" role="tabpanel"></div>';
    var body = el.querySelector(".tfm-lens-body");
    function show(i) {
      var l = LENS[i];
      body.innerHTML = '<p class="tfm-lens-short">' + esc(l.short) + "</p>" +
        '<div class="tfm-lens-cols"><div><h4>What it costs in timing</h4><ul class="tfm-prices">' + l.price.map(function (p) {
          return "<li><b>" + esc(p[0]) + "</b><span>" + esc(p[1]) + '</span><code>' + esc(p[2]) + "</code></li>";
        }).join("") + '</ul></div><div><h4>How to keep it affordable</h4><ul class="tfm-keep">' + l.keep.map(function (k) {
          return "<li>" + esc(k) + "</li>";
        }).join("") + '</ul><h4>Read next</h4><ul class="tfm-read">' + l.read.map(function (r) { return "<li>" + pageLink(r) + "</li>"; }).join("") + "</ul></div></div>";
      body.classList.remove("in"); void body.offsetWidth; body.classList.add("in");
    }
    el.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-i]");
      if (!b) return;
      el.querySelectorAll("[data-i]").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      show(parseInt(b.getAttribute("data-i"), 10));
    });
    show(0);
  }

  /* ---- the finder ---- */
  var FIND = [
    ["I am new to TrustZone-M", ["f01", "f02", "c01"]],
    ["I am choosing a Secure service for my product", ["c03", "b01", "b02"]],
    ["My high-priority task misses deadlines when the Secure side is busy", ["b01", "b02", "s01"]],
    ["I write keys or settings to flash", ["s01", "s02", "s03"]],
    ["I want to keep a key or a model secret", ["c03", "ai01", "ai02", "ai03"]],
    ["I need numbers for a schedulability analysis", ["f02", "b04", "ai04", "x01"]],
    ["I am comparing TF-M with plain TrustZone-M", ["c02", "m02"]],
    ["I want to know what can go wrong", ["a02", "a04", "a01", "x02"]],
    ["How was this measured, and can I trust it?", ["m01", "m02", "x01", "x02"]]
  ];
  function mountFind(el) {
    el.classList.add("tfm-find");
    el.innerHTML = '<ul class="tfm-find-list">' + FIND.map(function (f) {
      return '<li><details><summary>' + esc(f[0]) + '</summary><ul>' + f[1].map(function (r) { return "<li>" + pageLink(r) + "</li>"; }).join("") + "</ul></details></li>";
    }).join("") + "</ul>";
  }

  /* ---- headline numbers ---- */
  var TILES = [
    { n: 99, suf: " %", t: "of a Secure call is the PSA framework. The TrustZone transition itself takes 0.117 µs.", link: "c02" },
    { n: 11, suf: "×", t: "shorter longest call when a 4 KB SHA-256 is split in 16 pieces, for 42 % more total time.", link: "b02" },
    { text: "8.4 ms → 200 µs", t: "blocking of a 2 ms task by a Secure neural network: one call against chunks.", link: "ai03" },
    { text: "2.0 to 2.5×", t: "slower code from flash while a Secure storage write runs.", link: "s01" },
    { n: 288, suf: " of 288", t: "observed worst cases inside the bounds, on 96 random task sets.", link: "b04" },
    { n: 11, suf: " of 11", t: "injected faults recovered, in about 1.5 s each, with a one-line policy.", link: "a02" }
  ];
  function mountStats(el) {
    el.classList.add("tfm-tiles");
    el.innerHTML = TILES.map(function (x, i) {
      var big = x.n != null ? '<b class="tfm-num" data-n="' + x.n + '" data-suf="' + esc(x.suf) + '">' + x.n + esc(x.suf) + "</b>" : "<b>" + esc(x.text) + "</b>";
      return '<a class="tfm-tile" href="' + BASE + PAGES[x.link][0] + '/" style="--d:' + (i * 70) + 'ms">' + big + "<span>" + esc(x.t) + "</span></a>";
    }).join("");
    var nums = el.querySelectorAll(".tfm-num");
    function run() {
      nums.forEach(function (n) {
        var to = +n.getAttribute("data-n"), suf = n.getAttribute("data-suf"), t0 = null;
        if (reduce) return;
        function step(ts) {
          if (t0 === null) t0 = ts;
          var p = Math.min(1, (ts - t0) / 900);
          n.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))) + suf;
          if (p < 1) requestAnimationFrame(step);
        }
        n.textContent = "0" + suf; requestAnimationFrame(step);
      });
      el.classList.add("in");
    }
    if (reduce || !("IntersectionObserver" in root)) { el.classList.add("in"); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); run(); } }, { threshold: 0.3 });
    io.observe(el);
  }

  function mountAll() {
    document.querySelectorAll("[data-tfm]").forEach(function (el) {
      if (el.getAttribute("data-mounted")) return;
      el.setAttribute("data-mounted", "1");
      var k = el.getAttribute("data-tfm");
      if (k === "sim") mountSim(el, { compact: el.hasAttribute("data-compact"), service: el.getAttribute("data-service") || "ai", n: parseInt(el.getAttribute("data-n") || "1", 10), autoplay: el.getAttribute("data-autoplay") !== "false" });
      else if (k === "compare") mountCompare(el);
      else if (k === "lens") mountLens(el);
      else if (k === "find") mountFind(el);
      else if (k === "stats") mountStats(el);
    });
  }

  root.TFM = { simulate: simulate, SERVICES: SERVICES, fmt: fmt, mountAll: mountAll, mountSim: mountSim };
  if (typeof module !== "undefined" && module.exports) module.exports = root.TFM;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
    else mountAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
