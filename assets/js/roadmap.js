/* The roadmap page: the stages are joined by a route drawn like a trace on a circuit
   board. It runs down the page from one stage to the next, changes lane at 45 degrees,
   and has a via (a ring) at each stage. Stage 1 is a square pad, as pin 1 is on a board.

   As the visitor reads down the page, a signal follows: the route lights up to the
   reading position and each via switches on as it is passed. The stage being read is
   also marked in the "On this page" list.

   Without JavaScript the page keeps its plain line and rings (see main.css). */
(function () {
  var prose = document.querySelector('.view-roadmap .prose');
  if (!prose || !window.ResizeObserver || !document.createElementNS) { return; }

  var stages = Array.prototype.filter.call(prose.children, function (element) {
    return element.tagName === 'H2';
  });
  if (stages.length < 2) { return; }

  var SVG = 'http://www.w3.org/2000/svg';
  /* Which of the two lanes each stage sits on (0 = left, 1 = right). */
  var LANES = [0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1];

  /* "3. Real-time operating systems" becomes a small "03" and the title. */
  stages.forEach(function (heading) {
    var text = heading.firstChild;
    var match = text && text.nodeType === 3 ? /^(\d+)\.\s+/.exec(text.nodeValue) : null;
    if (!match) { return; }
    var number = document.createElement('span');
    number.className = 'stage-no';
    number.textContent = (match[1].length < 2 ? '0' : '') + match[1];
    text.nodeValue = text.nodeValue.slice(match[0].length);
    heading.insertBefore(number, text);
  });

  function make(name, className) {
    var element = document.createElementNS(SVG, name);
    if (className) { element.setAttribute('class', className); }
    return element;
  }

  var svg = make('svg', 'route');
  svg.setAttribute('aria-hidden', 'true');
  var track = make('path', 'route-track');
  var live = make('path', 'route-live');
  var head = make('circle', 'route-head');
  head.setAttribute('r', 3);
  svg.appendChild(track);
  svg.appendChild(live);

  var vias = stages.map(function (heading, index) {
    var group = make('g', 'route-via');
    var ping = make('circle', 'route-ping');
    ping.setAttribute('r', 5);
    /* Stage 1 is a square pad; the others are round. */
    var pad = make(index === 0 ? 'rect' : 'circle', 'route-pad');
    var hole = make('circle', 'route-hole');
    hole.setAttribute('r', 1.8);
    if (index === 0) {
      pad.setAttribute('width', 11); pad.setAttribute('height', 11); pad.setAttribute('rx', 1.5);
    } else {
      pad.setAttribute('r', 5.5);
    }
    group.appendChild(ping);
    group.appendChild(pad);
    group.appendChild(hole);
    svg.appendChild(group);
    return { group: group, pad: pad, ping: ping, hole: hole, heading: heading, square: index === 0 };
  });
  var terminal = make('circle', 'route-end');
  terminal.setAttribute('r', 7);
  svg.appendChild(terminal);
  svg.appendChild(head);
  prose.insertBefore(svg, prose.firstChild);
  prose.classList.add('has-route');

  var contents = Array.prototype.slice.call(document.querySelectorAll('.view-roadmap .toc a'));
  var points = [];      /* the corners of the route */
  var lengths = [];     /* the length reached at each corner */
  var height = 0;
  var current = -1;
  var queued = false;
  var settling = 0;
  var settled = false;

  /* Works out where the stages are and draws the route through them. */
  function layout() {
    var box = prose.getBoundingClientRect();
    height = Math.round(box.height);
    if (!height) { return; }
    var rail = parseFloat(window.getComputedStyle(prose).paddingLeft) || 36;
    var lane = [Math.round(rail * 0.2), Math.round(rail * 0.62)];
    var jog = lane[1] - lane[0];

    svg.setAttribute('width', rail);
    svg.setAttribute('height', height);
    points = [];
    vias.forEach(function (via, index) {
      var style = window.getComputedStyle(via.heading);
      var line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.25;
      var x = lane[LANES[index % LANES.length]];
      var y = Math.round(via.heading.getBoundingClientRect().top - box.top + line / 2);
      via.y = y;
      if (via.square) {
        via.pad.setAttribute('x', x - 5.5); via.pad.setAttribute('y', y - 5.5);
      } else {
        via.pad.setAttribute('cx', x); via.pad.setAttribute('cy', y);
      }
      via.ping.setAttribute('cx', x); via.ping.setAttribute('cy', y);
      via.hole.setAttribute('cx', x); via.hole.setAttribute('cy', y);

      var previous = points[points.length - 1];
      if (previous && previous[0] !== x) {
        /* Change lane at 45 degrees, a little before the next stage. */
        var turn = Math.max(previous[1] + 14, y - 30 - jog);
        points.push([previous[0], turn]);
        points.push([x, turn + jog]);
      }
      points.push([x, y]);
    });
    var end = [points[points.length - 1][0], height - 9];
    points.push(end);
    terminal.setAttribute('cx', end[0]);
    terminal.setAttribute('cy', end[1]);

    var total = 0;
    lengths = [0];
    var path = 'M' + points[0][0] + ' ' + points[0][1];
    for (var i = 1; i < points.length; i++) {
      total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      lengths.push(total);
      path += 'L' + points[i][0] + ' ' + points[i][1];
    }
    track.setAttribute('d', path);
    live.setAttribute('d', path);
    live.style.strokeDasharray = total + ' ' + total;
    update();
  }

  /* Lights the route down to the reading position. */
  function update() {
    queued = false;
    if (!height || !points.length) { return; }
    var box = prose.getBoundingClientRect();
    var room = document.documentElement.scrollHeight - window.innerHeight;
    var progress = room > 0 ? Math.min(1, Math.max(0, window.scrollY / room)) : 1;
    /* The reading line moves from the upper third of the screen at the top of the page
       to its bottom edge at the end, so the last stage can always be reached. */
    var reading = window.innerHeight * (0.35 + 0.65 * progress) - box.top;
    var first = points[0][1];
    var y = Math.max(first, Math.min(points[points.length - 1][1], reading));

    var i = 1;
    while (i < points.length - 1 && points[i][1] < y) { i++; }
    var a = points[i - 1];
    var b = points[i];
    var k = b[1] === a[1] ? 1 : (y - a[1]) / (b[1] - a[1]);
    var reached = lengths[i - 1] + (lengths[i] - lengths[i - 1]) * k;
    live.style.strokeDashoffset = lengths[lengths.length - 1] - reached;
    head.setAttribute('cx', a[0] + (b[0] - a[0]) * k);
    head.setAttribute('cy', y);
    terminal.classList.toggle('is-on', y >= points[points.length - 1][1] - 1);

    var now = -1;
    vias.forEach(function (via, index) {
      var on = via.y <= y + 0.5;
      via.group.classList.toggle('is-on', on);
      /* A via gives a short ring when the signal reaches it while reading. */
      if (!on) {
        via.group.classList.remove('is-reached');
      } else if (!via.on && settled) {
        via.group.classList.add('is-reached');
      }
      via.on = on;
      if (on) { now = index; }
    });
    if (now !== current) {
      current = now;
      vias.forEach(function (via, index) {
        via.heading.classList.toggle('is-current', index === now);
      });
      var id = now >= 0 ? vias[now].heading.id : '';
      contents.forEach(function (link) {
        link.classList.toggle('is-current', !!id && link.getAttribute('href') === '#' + id);
      });
    }
    /* The rings start only once the page has settled, so opening it half-way down
       does not set several off at once. */
    if (!settling) {
      settling = window.setTimeout(function () { settled = true; }, 400);
    }
  }

  function request() {
    if (queued) { return; }
    queued = true;
    window.requestAnimationFrame(update);
  }

  new window.ResizeObserver(layout).observe(prose);
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(layout); }
})();
