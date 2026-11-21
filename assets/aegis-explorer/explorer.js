/* Aegis architecture explorer. Draws the views from the data that Hugo embedded from
   static/aegis/architecture.yaml, and runs selection, walks and the fleet replay. No library. */
(function () {
  'use strict';
  const DATA = JSON.parse(document.getElementById('data').textContent);
  const A = DATA.arch, PAGES = DATA.pages, REPO = A.baseline.repo;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const NODES = {}, EDGES = {}, WALKS = {};
  A.nodes.forEach(n => { NODES[n.id] = n; });
  A.edges.forEach(e => { EDGES[e.id] = e; });
  A.walks.forEach(w => { WALKS[w.id] = w; });
  const VIEWS = A.views;

  const panel = $('#panel'), diagrams = $('#diagrams'), mapEl = $('#map'), replayEl = $('#replay');
  const tabs = $$('.tabs button'), walkBar = $('.walk');
  let view = VIEWS[0].id, sel = null, selKind = null, walk = null, stepI = 0, playTimer = null, anim = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function srcUrl(p) {
    return REPO + (p.endsWith('/') ? '/tree/main/' + p.slice(0, -1) : '/blob/main/' + p);
  }

  /* ---------------------------------------------------------------- drawing */
  function wrap(text, maxPx, pxPerChar) {
    const max = Math.max(4, Math.floor(maxPx / pxPerChar));
    if (text.length <= max) return [text];
    const words = text.split(' '), lines = [];
    let cur = '';
    words.forEach(w => {
      if (cur && (cur + ' ' + w).length > max) { lines.push(cur); cur = w; } else { cur = cur ? cur + ' ' + w : w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function center(r) { return [r[0] + r[2] / 2, r[1] + r[3] / 2]; }
  function clip(r, p, q) {
    // where the segment from p (inside rectangle r) towards q leaves r
    const dx = q[0] - p[0], dy = q[1] - p[1];
    let t = Infinity;
    if (dx > 0) t = Math.min(t, (r[0] + r[2] - p[0]) / dx); else if (dx < 0) t = Math.min(t, (r[0] - p[0]) / dx);
    if (dy > 0) t = Math.min(t, (r[1] + r[3] - p[1]) / dy); else if (dy < 0) t = Math.min(t, (r[1] - p[1]) / dy);
    if (!isFinite(t)) t = 0;
    return [p[0] + dx * t, p[1] + dy * t];
  }
  function edgePoints(v, e) {
    const ra = v.nodes[e.from], rb = v.nodes[e.to], opt = (v.edges || {})[e.id] || {};
    let a = center(ra), b = center(rb);
    const via = opt.via || [];
    if (opt.off && !via.length) {
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const ox = -dy / len * opt.off, oy = dx / len * opt.off;
      a = [a[0] + ox, a[1] + oy]; b = [b[0] + ox, b[1] + oy];
    }
    const pts = [a].concat(via, [b]);
    const start = clip(ra, pts[0], pts[1]);
    const end = clip(rb, pts[pts.length - 1], pts[pts.length - 2]);
    // stop the arrow a little short of the box
    const lx = pts[pts.length - 2], dx = end[0] - lx[0], dy = end[1] - lx[1], len = Math.hypot(dx, dy) || 1;
    const endIn = [end[0] - dx / len * 3, end[1] - dy / len * 3];
    return [start].concat(via, [endIn]);
  }
  function edgeTitle(e) {
    return A.edge_kinds[e.kind] + ': ' + NODES[e.from].title + ' to ' + NODES[e.to].title + '. ' + e.label;
  }

  function drawView(v) {
    const wrapEl = el('div', 'diagram-wrap');
    wrapEl.dataset.view = v.id;
    const svg = sv('svg', { class: 'diagram', viewBox: '0 0 ' + v.width + ' ' + v.height, role: 'group', 'aria-label': v.title, 'data-view': v.id });
    wrapEl.appendChild(svg);
    const defs = sv('defs', {}, svg);
    Object.keys(A.edge_kinds).forEach(k => {
      const m = sv('marker', { id: 'a-' + v.id + '-' + k, class: 'mk mk-' + k, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6.5', markerHeight: '6.5', orient: 'auto-start-reverse' }, defs);
      sv('path', { d: 'M0 0L10 5L0 10z' }, m);
    });
    (v.bands || []).forEach(b => {
      const g = sv('g', { class: 'band' + (b.title === 'Secure world' ? ' b-secure' : b.title === 'Non-secure world' ? ' b-ns' : '') }, svg);
      sv('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 }, g);
      sv('text', { x: b.x + 12, y: b.y + 16 }, g).textContent = b.title;
    });
    const ids = Object.keys(v.nodes);
    const lanes = v.lanes || [];
    const groups = ids.filter(id => NODES[id].kind === 'group');
    groups.forEach(id => drawGroupBox(svg, v, id, lanes.indexOf(id) >= 0));
    A.edges.forEach(e => { if (edgeIn(v, e)) drawEdge(svg, v, e); });
    ids.filter(id => NODES[id].kind !== 'group').forEach(id => drawNode(svg, v, id));
    groups.forEach(id => drawGroupLabel(svg, v, id));
    (v.notes || []).forEach(n => {
      const t = sv('text', { class: 'note-text', x: n.x, y: n.y, 'text-anchor': 'middle' }, svg);
      n.lines.forEach((ln, i) => { sv('tspan', { x: n.x, dy: i ? 14 : 0 }, t).textContent = ln; });
    });
    return wrapEl;
  }
  function drawGroupBox(svg, v, id, lane) {
    const n = NODES[id], r = v.nodes[id];
    const g = sv('g', { class: 'node n-group' + (lane ? ' lane' : ''), 'data-id': id, 'aria-hidden': 'true' }, svg);
    if (n.stack && !lane) sv('rect', { class: 'shadow', x: r[0] + 6, y: r[1] + 6, width: r[2], height: r[3], rx: 7 }, g);
    sv('rect', { class: 'box', x: r[0], y: r[1], width: r[2], height: r[3], rx: 7 }, g);
  }
  function drawGroupLabel(svg, v, id) {
    const n = NODES[id], r = v.nodes[id], text = n.label || n.title;
    const g = sv('g', { class: 'node n-group glabel', 'data-id': id, tabindex: '0', role: 'button', 'aria-label': n.title + '. ' + n.summary }, svg);
    sv('title', {}, g).textContent = n.title;
    sv('rect', { class: 'tab', x: r[0] + 4, y: r[1] + 4, width: Math.min(r[2] - 8, text.length * 6.9 + 14), height: 20, rx: 4 }, g);
    sv('text', { class: 't', x: r[0] + 11, y: r[1] + 18 }, g).textContent = text;
  }
  function drawNode(svg, v, id) {
    const n = NODES[id], r = v.nodes[id];
    const g = sv('g', { class: 'node n-' + n.kind, 'data-id': id, tabindex: '0', role: 'button', 'aria-label': n.title + '. ' + n.summary }, svg);
    sv('title', {}, g).textContent = n.title;
    sv('rect', { class: 'box', x: r[0], y: r[1], width: r[2], height: r[3], rx: 5 }, g);
    const tl = wrap(n.label || n.title, r[2] - 16, 7.4);
    const sl = n.sub ? wrap(n.sub, r[2] - 14, 5.9) : [];
    const lines = tl.map(t => ['t', t]).concat(sl.map(t => ['s', t]));
    const lh = { t: 16, s: 14 };
    const total = lines.reduce((s, l) => s + lh[l[0]], 0);
    let y = r[1] + (r[3] - total) / 2 + 12;
    const cx = r[0] + r[2] / 2;
    lines.forEach(l => {
      sv('text', { class: l[0], x: cx, y: y, 'text-anchor': 'middle' }, g).textContent = l[1];
      y += lh[l[0]];
    });
  }
  function drawEdge(svg, v, e) {
    const pts = edgePoints(v, e);
    const d = 'M' + pts.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L');
    const g = sv('g', { class: 'edge k-' + e.kind, 'data-id': e.id, tabindex: '0', role: 'button', 'aria-label': edgeTitle(e) }, svg);
    sv('title', {}, g).textContent = edgeTitle(e);
    sv('path', { class: 'hit', d: d }, g);
    sv('path', { class: 'line', d: d, 'marker-end': 'url(#a-' + v.id + '-' + e.kind + ')' }, g);
  }
  function drawLegend() {
    const lg = $('#legend');
    const kinds = {};
    VIEWS.forEach(v => A.edges.forEach(e => { if (edgeIn(v, e)) kinds[e.kind] = 1; }));
    Object.keys(A.edge_kinds).forEach(k => {
      if (!kinds[k]) return;
      const s = el('span');
      s.dataset.kind = k;
      const svg = sv('svg', { viewBox: '0 0 34 10', 'aria-hidden': 'true', class: 'k-' + k }, s);
      sv('path', { class: 'line', d: 'M1 5L33 5' }, svg);
      s.appendChild(document.createTextNode(A.edge_kinds[k]));
      lg.appendChild(s);
    });
  }

  /* ---------------------------------------------------------------- selection */
  function inView(id, isEdge, v) {
    const vv = VIEWS.find(x => x.id === v);
    if (!vv) return false;
    if (!isEdge) return !!vv.nodes[id];
    return edgeIn(vv, EDGES[id]);
  }
  /* An edge is drawn in a view that holds both its ends, unless it names the views it belongs to. */
  function edgeIn(v, e) {
    return !!(v.nodes[e.from] && v.nodes[e.to]) && (!e.views || e.views.indexOf(v.id) >= 0);
  }
  function viewFor(id, isEdge) {
    if (inView(id, isEdge, view)) return view;
    const v = VIEWS.find(x => inView(id, isEdge, x.id));
    return v ? v.id : null;
  }
  function showView(v) {
    view = v;
    tabs.forEach(b => b.setAttribute('aria-pressed', b.dataset.view === v ? 'true' : 'false'));
    const isReplay = v === 'replay';
    mapEl.hidden = isReplay; replayEl.hidden = !isReplay; walkBar.hidden = isReplay;
    $$('.diagram-wrap', diagrams).forEach(w => { w.hidden = w.dataset.view !== v; });
    if (!isReplay) apply();
  }
  function apply() {
    const svgs = $$('svg.diagram', diagrams);
    let on = { ids: {}, eds: {} }, stepE = null;
    if (walk) {
      const s = walk.steps[stepI];
      if (s.edge) { const e = EDGES[s.edge]; stepE = e.id; on.ids[e.from] = on.ids[e.to] = 1; on.eds[e.id] = 1; }
      else on.ids[s.node] = 1;
    } else if (sel && selKind === 'node') {
      on.ids[sel] = 1;
      A.edges.forEach(e => { if (e.from === sel || e.to === sel) { on.eds[e.id] = 1; on.ids[e.from] = on.ids[e.to] = 1; } });
    } else if (sel && selKind === 'edge') {
      const e = EDGES[sel]; on.ids[e.from] = on.ids[e.to] = 1; on.eds[sel] = 1;
    }
    const any = !!(walk || sel);
    svgs.forEach(s => {
      s.classList.toggle('has-sel', any);
      $$('.node', s).forEach(n => {
        const id = n.dataset.id;
        n.classList.toggle('on', !!on.ids[id]);
        n.classList.toggle('sel', (sel === id && selKind === 'node' && !walk) || (walk && walk.steps[stepI].node === id));
      });
      $$('.edge', s).forEach(n => {
        const id = n.dataset.id;
        n.classList.toggle('on', !!on.eds[id]);
        n.classList.toggle('sel', sel === id && selKind === 'edge' && !walk);
        n.classList.toggle('step', stepE === id);
      });
    });
  }
  function link(text, fn) {
    const b = el('button', 'link', text);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function setHash(h) {
    try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { /* file: or sandboxed */ }
  }
  function selectNode(id, jump) {
    stopWalk(true);
    sel = id; selKind = 'node';
    const v = viewFor(id, false);
    if (jump && v && v !== view) showView(v);
    apply(); renderNode(id); setHash(id);
  }
  function selectEdge(id) {
    stopWalk(true);
    sel = id; selKind = 'edge';
    const v = viewFor(id, true);
    if (v && v !== view) showView(v);
    apply(); renderEdge(id); setHash(id);
  }
  function clearSel() {
    stopWalk(true);
    sel = null; selKind = null;
    apply(); renderHome(); setHash('');
  }
  function heading(text) { panel.appendChild(el('h3', null, text)); }
  function learnList(keys) {
    if (!keys || !keys.length) return;
    heading('Learn how this works');
    const ul = el('ul');
    keys.forEach(k => {
      const p = PAGES[k], li = el('li'), a = el('a', null, (p.lab ? 'Lab ' + p.lab + ': ' : '') + p.title);
      a.href = p.url; li.appendChild(a); ul.appendChild(li);
    });
    panel.appendChild(ul);
  }
  function sourceList(list) {
    if (!list || !list.length) return;
    heading('In the repository');
    const ul = el('ul');
    list.forEach(s => {
      const li = el('li'), a = el('a', 'mono', s);
      a.href = srcUrl(s); li.appendChild(a); ul.appendChild(li);
    });
    panel.appendChild(ul);
  }
  function renderHome() {
    panel.textContent = '';
    panel.appendChild(el('h2', null, 'Pick a component'));
    panel.appendChild(el('p', null, 'Select a box to see what it does, what it talks to and which labs explain it. Select a line to see what it carries. Or choose a walk and step through the protocol.'));
    const counts = VIEWS.map(v => v.title + ': ' + Object.keys(v.nodes).length + ' components').join(' · ');
    panel.appendChild(el('p', 'kind', counts));
    panel.appendChild(el('p', 'kind', A.baseline.state));
  }
  function renderNode(id) {
    const n = NODES[id];
    panel.textContent = '';
    panel.appendChild(el('h2', null, n.title));
    panel.appendChild(el('p', 'kind', A.node_kinds[n.kind]));
    panel.appendChild(el('p', null, n.summary));
    const f = n.facts ? Object.keys(n.facts) : [];
    if (f.length) {
      heading('Facts');
      const dl = el('dl');
      f.forEach(k => { dl.appendChild(el('dt', null, k.replace(/_/g, ' '))); dl.appendChild(el('dd', null, String(n.facts[k]))); });
      panel.appendChild(dl);
    }
    if (n.parent) {
      heading('Part of');
      const ul = el('ul'), li = el('li');
      li.appendChild(link(NODES[n.parent].title, () => selectNode(n.parent, true)));
      ul.appendChild(li); panel.appendChild(ul);
    }
    const kids = A.nodes.filter(k => k.parent === id);
    if (kids.length) {
      heading('Contains');
      const ul = el('ul');
      kids.forEach(k => { const li = el('li'); li.appendChild(link(k.title, () => selectNode(k.id, true))); ul.appendChild(li); });
      panel.appendChild(ul);
    }
    const out = A.edges.filter(e => e.from === id), inn = A.edges.filter(e => e.to === id);
    [['Sends to', out, 'to'], ['Receives from', inn, 'from']].forEach(grp => {
      if (!grp[1].length) return;
      heading(grp[0]);
      const ul = el('ul');
      grp[1].forEach(e => {
        const li = el('li');
        li.appendChild(link(NODES[e[grp[2]]].title, () => selectEdge(e.id)));
        li.appendChild(document.createTextNode(': ' + e.label));
        li.appendChild(el('span', 'tag', A.edge_kinds[e.kind]));
        ul.appendChild(li);
      });
      panel.appendChild(ul);
    });
    learnList(n.learn);
    sourceList(n.sources);
    const c = link('Clear selection', clearSel); c.classList.add('clear'); panel.appendChild(c);
  }
  function renderEdge(id) {
    const e = EDGES[id];
    panel.textContent = '';
    panel.appendChild(el('h2', null, e.label));
    panel.appendChild(el('p', 'kind', A.edge_kinds[e.kind]));
    if (e.detail) panel.appendChild(el('p', null, e.detail));
    const ul = el('ul');
    [['From', e.from], ['To', e.to]].forEach(p => {
      const li = el('li');
      li.appendChild(document.createTextNode(p[0] + ': '));
      li.appendChild(link(NODES[p[1]].title, () => selectNode(p[1], true)));
      ul.appendChild(li);
    });
    panel.appendChild(ul);
    const ws = A.walks.filter(w => w.steps.some(s => s.edge === id));
    if (ws.length) {
      heading('Used in walks');
      const u2 = el('ul');
      ws.forEach(w => { const li = el('li'); li.appendChild(link(w.title, () => startWalk(w.id))); u2.appendChild(li); });
      panel.appendChild(u2);
    }
    learnList(e.learn);
    const c = link('Clear selection', clearSel); c.classList.add('clear'); panel.appendChild(c);
  }

  /* ---------------------------------------------------------------- walks */
  const wsel = $('#walk-select'), wprev = $('#walk-prev'), wnext = $('#walk-next'), wplay = $('#walk-play'), wstop = $('#walk-stop');
  function walkButtons() {
    const active = !!walk;
    wprev.disabled = !active || stepI === 0;
    wnext.disabled = !active || stepI === walk.steps.length - 1;
    wplay.disabled = !active; wstop.disabled = !active;
    wplay.setAttribute('aria-pressed', playTimer ? 'true' : 'false');
    wplay.textContent = playTimer ? 'Pause' : 'Play';
    wsel.value = active ? walk.id : '';
  }
  function stopWalk(quiet) {
    if (playTimer) { clearTimeout(playTimer); playTimer = null; }
    cancelPulse();
    walk = null;
    walkButtons();
    if (!quiet) { apply(); renderHome(); setHash(''); }
  }
  function startWalk(id) {
    const w = WALKS[id];
    if (!w) { stopWalk(); return; }
    stopWalk(true);
    sel = null; selKind = null;
    walk = w; stepI = 0;
    showStep();
    setHash(id);
  }
  function stepTarget(s) { return s.edge ? viewFor(s.edge, true) : viewFor(s.node, false); }
  function showStep() {
    const s = walk.steps[stepI];
    const v = stepTarget(s);
    if (v && v !== view) showView(v); else apply();
    panel.textContent = '';
    panel.appendChild(el('h2', null, walk.title));
    panel.appendChild(el('p', 'kind', 'Step ' + (stepI + 1) + ' of ' + walk.steps.length + (s.back ? ', the reply' : '')));
    const box = el('div', 'step-box');
    box.appendChild(el('p', null, s.say));
    panel.appendChild(box);
    const p = el('p');
    if (s.edge) {
      const e = EDGES[s.edge];
      const a = s.back ? e.to : e.from, b = s.back ? e.from : e.to;
      p.appendChild(link(NODES[a].title, () => selectNode(a, true)));
      p.appendChild(document.createTextNode(' to '));
      p.appendChild(link(NODES[b].title, () => selectNode(b, true)));
      p.appendChild(el('span', 'tag', A.edge_kinds[e.kind]));
    } else {
      p.appendChild(link(NODES[s.node].title, () => selectNode(s.node, true)));
    }
    panel.appendChild(p);
    walkButtons();
    pulse(s);
    if (playTimer) schedule();
  }
  function schedule() {
    if (playTimer) clearTimeout(playTimer);
    if (!walk || stepI >= walk.steps.length - 1) { playTimer = null; walkButtons(); return; }
    const s = walk.steps[stepI];
    playTimer = setTimeout(() => { stepI++; showStep(); }, Math.max(3500, s.say.length * 48));
    walkButtons();
  }
  function cancelPulse() {
    if (anim) { cancelAnimationFrame(anim.raf); if (anim.dot) anim.dot.remove(); anim = null; }
  }
  function pulse(s) {
    cancelPulse();
    if (!s.edge || reduceMotion.matches) return;
    const svg = $('svg.diagram[data-view="' + view + '"]', diagrams);
    const path = svg && $('.edge[data-id="' + s.edge + '"] .line', svg);
    if (!path) return;
    const len = path.getTotalLength();
    const dot = sv('circle', { class: 'pulse', r: 6 }, svg);
    const dur = 900, t0 = performance.now();
    anim = { dot: dot, raf: 0 };
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur), ease = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const pt = path.getPointAtLength((s.back ? 1 - ease : ease) * len);
      dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
      if (k < 1) anim.raf = requestAnimationFrame(tick);
      else { dot.remove(); anim = null; }
    };
    anim.raf = requestAnimationFrame(tick);
  }
  wsel.addEventListener('change', () => { if (wsel.value) startWalk(wsel.value); else stopWalk(); });
  wprev.addEventListener('click', () => { if (walk && stepI > 0) { stepI--; showStep(); } });
  wnext.addEventListener('click', () => { if (walk && stepI < walk.steps.length - 1) { stepI++; showStep(); } });
  wplay.addEventListener('click', () => {
    if (!walk) return;
    if (playTimer) { clearTimeout(playTimer); playTimer = null; walkButtons(); return; }
    if (stepI >= walk.steps.length - 1) { stepI = 0; playTimer = -1; showStep(); return; }
    playTimer = -1; schedule();
  });
  wstop.addEventListener('click', () => stopWalk());

  /* ---------------------------------------------------------------- fleet replay */
  const RE = /^(?:(\d\d:\d\d:\d\d) )?(\S+) (ADMITTED|QUARANTINED)(?: \(([^)]+) trust\))?\s*(.*)$/;
  const recSel = $('#rec-select'), recPrev = $('#rec-prev'), recNext = $('#rec-next'), recPlay = $('#rec-play'), recReset = $('#rec-reset');
  const recPos = $('#rec-pos'), recCount = $('#rec-count'), tbody = $('#fleet-table tbody'), lineBox = $('#line-box');
  let rec = null, recLines = [], pos = 1, recTimer = null;

  function parseLine(text) {
    const m = RE.exec(text);
    if (!m) return null;
    const out = { time: m[1] || '', name: m[2], verdict: m[3], trust: m[4] || '', rest: m[5], cred: '', reason: '', hb: null, status: {}, endorsed: '' };
    const en = /\s*\[endorsed by ([^\]]*)\]\s*$/.exec(out.rest);
    if (en) { out.endorsed = en[1]; out.rest = out.rest.slice(0, en.index); }
    const c = /\[credential: ([^\]]*)\]\s*$/.exec(out.rest);
    out.reason = (c ? out.rest.slice(0, c.index) : out.rest).trim();
    if (c) {
      out.cred = c[1];
      const h = /^valid, heartbeat (\d+) \((.*)\)$/.exec(c[1]);
      if (h) {
        out.hb = +h[1];
        h[2].split(';').forEach(kv => { const i = kv.indexOf('='); if (i > 0) out.status[kv.slice(0, i)] = kv.slice(i + 1); });
      }
    }
    return out;
  }
  function loadRecording(id) {
    rec = A.replay.recordings.find(r => r.id === id) || A.replay.recordings[0];
    recLines = [];
    rec.parts.forEach(part => part.lines.forEach(l => {
      const text = typeof l === 'string' ? l : l.line;
      recLines.push({ text: text, note: typeof l === 'string' ? '' : l.note, source: part.source, date: part.date, kinds: part.kinds || {}, p: parseLine(text) });
    }));
    recSel.value = rec.id;
    recPos.max = String(recLines.length);
    recPos.min = '1';
    setPos(1);
  }
  function stateAt(n) {
    const order = [], st = {};
    recLines.forEach(l => { if (l.p && order.indexOf(l.p.name) < 0) order.push(l.p.name); });
    order.forEach(name => { st[name] = { seen: false }; });
    for (let i = 0; i < n; i++) {
      const l = recLines[i], p = l.p;
      if (!p) continue;
      const dev = A.replay.devices[p.name] || {};
      const s = st[p.name];
      s.seen = true;
      s.kind = l.kinds[p.name] || dev.kind || '';
      s.trust = p.trust;
      s.verdict = p.verdict;
      if (p.verdict === 'QUARANTINED') {
        s.why = p.reason.replace(/^no attestation: /, 'no attestation, ') + (p.cred ? '; credential ' + p.cred : '');
        s.hb = s.stack = s.ttl = null;
      } else if (p.hb != null) {
        s.why = 'credential valid' + (p.status.fw ? ', firmware ' + p.status.fw : '') + (p.endorsed ? ', endorsed by ' + p.endorsed : '');
        s.hb = p.hb; s.stack = p.status.sstack || p.status.stack || null; s.ttl = p.status.ttl || null;
      } else {
        s.why = p.cred ? 'credential ' + p.cred : p.reason;
        s.hb = s.stack = s.ttl = null;
      }
    }
    return { order: order, st: st };
  }
  function cell(tr, label, cls, content) {
    const td = el('td', cls);
    td.dataset.label = label;
    if (typeof content === 'string') td.textContent = content; else td.appendChild(content);
    tr.appendChild(td);
    return td;
  }
  function setPos(n) {
    pos = Math.max(1, Math.min(recLines.length, n));
    recPos.value = String(pos);
    recCount.textContent = pos + ' of ' + recLines.length;
    recPrev.disabled = pos <= 1;
    recNext.disabled = pos >= recLines.length;
    const cur = recLines[pos - 1];
    const s = stateAt(pos);
    tbody.textContent = '';
    s.order.forEach(name => {
      const d = s.st[name], dev = A.replay.devices[name] || {};
      const tr = el('tr', (cur.p && cur.p.name === name ? 'changed' : '') + (d.seen ? '' : ' idle'));
      const devCell = el('span', 'dev');
      if (dev.node) devCell.appendChild(link(name, () => { showView(VIEWS[0].id); selectNode(dev.node, true); }));
      else devCell.appendChild(document.createTextNode(name));
      devCell.appendChild(el('small', null, dev.board || ''));
      cell(tr, 'Device', null, devCell);
      if (!d.seen) {
        cell(tr, 'Kind', null, dev.kind || '');
        cell(tr, 'Trust', null, '');
        cell(tr, 'Last verdict', null, 'no line yet');
        cell(tr, 'Heartbeat', 'num', '');
        cell(tr, 'Stack', 'num', '');
        cell(tr, 'ttl', 'num', '');
      } else {
        cell(tr, 'Kind', null, d.kind);
        cell(tr, 'Trust', null, d.trust || 'none printed');
        const v = el('span');
        v.appendChild(el('span', d.verdict === 'ADMITTED' ? 'v-admitted' : 'v-quarantined', d.verdict));
        v.appendChild(el('span', 'why', d.why));
        cell(tr, 'Last verdict', null, v);
        cell(tr, 'Heartbeat', 'num', d.hb != null ? String(d.hb) : '–');
        cell(tr, 'Stack', 'num', d.stack || '–');
        cell(tr, 'ttl', 'num', d.ttl != null ? d.ttl + ' s' : '–');
      }
      tbody.appendChild(tr);
    });
    lineBox.textContent = '';
    lineBox.appendChild(el('p', 'when', (cur.p && cur.p.time ? cur.p.time + ', ' : '') + cur.date));
    lineBox.appendChild(el('pre', null, cur.text));
    if (cur.note) lineBox.appendChild(el('p', null, cur.note));
    const src = el('p', 'when');
    src.appendChild(document.createTextNode('From '));
    const a = el('a', 'mono', cur.source);
    a.href = srcUrl(cur.source);
    src.appendChild(a);
    lineBox.appendChild(src);
    recButtons();
  }
  function recButtons() {
    recPlay.setAttribute('aria-pressed', recTimer ? 'true' : 'false');
    recPlay.textContent = recTimer ? 'Pause' : 'Play';
  }
  function recStop() { if (recTimer) { clearInterval(recTimer); recTimer = null; } recButtons(); }
  recSel.addEventListener('change', () => { recStop(); loadRecording(recSel.value); setHash('replay-' + recSel.value); });
  recPrev.addEventListener('click', () => { recStop(); setPos(pos - 1); });
  recNext.addEventListener('click', () => { recStop(); setPos(pos + 1); });
  recReset.addEventListener('click', () => { recStop(); setPos(1); });
  recPos.addEventListener('input', () => { recStop(); setPos(+recPos.value); });
  recPlay.addEventListener('click', () => {
    if (recTimer) { recStop(); return; }
    if (pos >= recLines.length) setPos(1);
    recTimer = setInterval(() => { if (pos >= recLines.length) recStop(); else setPos(pos + 1); }, 1600);
    recButtons();
  });

  /* ---------------------------------------------------------------- events and start */
  tabs.forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'replay') { stopWalk(true); recStop(); showView('replay'); setHash('replay-' + rec.id); return; }
    recStop();
    if (sel && !inView(sel, selKind === 'edge', v)) { sel = null; selKind = null; renderHome(); }
    showView(v);
    if (!walk && !sel) setHash('');
  }));
  diagrams.addEventListener('click', ev => {
    const t = ev.target.closest('.node,.edge');
    if (!t) { if (ev.target.closest('svg.diagram')) clearSel(); return; }
    if (t.classList.contains('node')) selectNode(t.dataset.id, false); else selectEdge(t.dataset.id);
  });
  diagrams.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target.closest('.node,.edge');
    if (!t) return;
    ev.preventDefault();
    if (t.classList.contains('node')) selectNode(t.dataset.id, false); else selectEdge(t.dataset.id);
  });
  document.addEventListener('keydown', ev => {
    const tag = (ev.target.tagName || '').toLowerCase();
    if (ev.key === 'Escape' && view !== 'replay') { clearSel(); return; }
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (walk && view !== 'replay' && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) {
      ev.preventDefault();
      (ev.key === 'ArrowRight' ? wnext : wprev).click();
    }
  });
  function fromHash() {
    const h = decodeURIComponent(location.hash.replace('#', ''));
    if (h.indexOf('replay') === 0) {
      const id = h.slice(7);
      if (id) loadRecording(id);
      showView('replay');
      return;
    }
    if (h && NODES[h]) selectNode(h, true);
    else if (h && EDGES[h]) selectEdge(h);
    else if (h && WALKS[h]) startWalk(h);
    else { showView(view === 'replay' ? VIEWS[0].id : view); renderHome(); }
  }

  VIEWS.forEach(v => diagrams.appendChild(drawView(v)));
  drawLegend();
  loadRecording(A.replay.recordings[0].id);
  $$('.js-only').forEach(x => { x.hidden = false; });
  const asText = $('#as-text');
  if (asText) asText.open = false;
  walkButtons();
  showView(view);
  window.addEventListener('hashchange', fromHash);
  fromHash();

  /* theme */
  const btn = $('#theme-toggle'), root = document.documentElement;
  const isDark = () => { const a = root.getAttribute('data-theme'); return a ? a === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; };
  const label = () => btn.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
  btn.addEventListener('click', () => {
    const t = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', t);
    try { localStorage.setItem('theme', t); } catch (e) { /* storage blocked */ }
    label();
  });
  label();
})();
