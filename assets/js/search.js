/* Site search. The Search page contains a list of every page (title, description, text),
   written by Hugo when the site is built. This script searches that list in the
   visitor's browser, so nothing is sent anywhere and no outside service is used. */
(function () {
  var data = document.querySelector('[data-search-index]');
  var form = document.querySelector('[data-search-form]');
  var status = document.querySelector('[data-search-status]');
  var list = document.querySelector('[data-search-results]');
  if (!data || !form || !status || !list) { return; }

  var input = form.querySelector('input');
  var HINT = 'Type a word, for example TrustZone, fuzzing or HardFault.';
  var MAX_RESULTS = 20;

  /* Lower case, without accents, so "Zéro" and "zero" match. */
  function plain(text) {
    var out = String(text || '').toLowerCase();
    return out.normalize ? out.normalize('NFD').replace(/[̀-ͯ]/g, '') : out;
  }

  var pages;
  try {
    pages = JSON.parse(data.textContent);
  } catch (e) {
    status.textContent = 'Search is unavailable on this page.';
    return;
  }
  pages.forEach(function (page) {
    page.text = String(page.text || '').replace(/\s+/g, ' ').trim();
    page.t = plain(page.title);
    page.d = plain(page.description);
    page.x = plain(page.text);
    page.k = plain(page.kind + ' ' + page.where);
  });

  function count(haystack, needle) {
    var n = 0;
    var at = haystack.indexOf(needle);
    while (at !== -1 && n < 3) {
      n += 1;
      at = haystack.indexOf(needle, at + needle.length);
    }
    return n;
  }

  /* Every word must appear somewhere on the page. A word in the title counts most. */
  function score(page, words, phrase) {
    var total = 0;
    for (var i = 0; i < words.length; i++) {
      var word = words[i];
      var points = 0;
      if (page.t.indexOf(word) !== -1) {
        points += 10;
        if ((' ' + page.t).indexOf(' ' + word) !== -1) { points += 5; }
      }
      if (page.d.indexOf(word) !== -1) { points += 4; }
      if (page.k.indexOf(word) !== -1) { points += 2; }
      points += count(page.x, word);
      if (points === 0) { return 0; }
      total += points;
    }
    if (words.length > 1 && (page.t.indexOf(phrase) !== -1 || page.x.indexOf(phrase) !== -1)) { total += 6; }
    return total;
  }

  /* Appends text to a node, with the matching words marked. */
  function mark(node, text, words) {
    var lower = plain(text);
    /* Marking relies on positions, so skip it if removing accents changed the length. */
    var safe = lower.length === text.length;
    var at = 0;
    while (safe && at < text.length) {
      var next = -1;
      var size = 0;
      for (var i = 0; i < words.length; i++) {
        var found = lower.indexOf(words[i], at);
        if (found !== -1 && (next === -1 || found < next)) { next = found; size = words[i].length; }
      }
      if (next === -1) { break; }
      if (next > at) { node.appendChild(document.createTextNode(text.slice(at, next))); }
      var hit = document.createElement('mark');
      hit.textContent = text.slice(next, next + size);
      node.appendChild(hit);
      at = next + size;
    }
    node.appendChild(document.createTextNode(text.slice(at)));
  }

  /* A short piece of the page's text around the first match. */
  function snippet(page, words) {
    var first = -1;
    for (var i = 0; i < words.length; i++) {
      var found = page.x.indexOf(words[i]);
      if (found !== -1 && (first === -1 || found < first)) { first = found; }
    }
    if (first === -1 || page.x.length !== page.text.length) { return ''; }
    var start = Math.max(0, first - 70);
    var end = Math.min(page.text.length, first + 150);
    if (start > 0) { start = page.text.indexOf(' ', start) + 1; }
    if (end < page.text.length) { end = page.text.lastIndexOf(' ', end); }
    return (start > 0 ? '… ' : '') + page.text.slice(start, end) + (end < page.text.length ? ' …' : '');
  }

  function render(query) {
    list.textContent = '';
    var phrase = plain(query).replace(/\s+/g, ' ').trim();
    if (phrase.length < 2) {
      status.textContent = HINT;
      return;
    }
    var words = phrase.split(' ').filter(function (word, i, all) { return word && all.indexOf(word) === i; });

    var hits = [];
    pages.forEach(function (page) {
      var points = score(page, words, phrase);
      if (points > 0) { hits.push({ page: page, points: points }); }
    });
    hits.sort(function (a, b) { return b.points - a.points || a.page.title.localeCompare(b.page.title); });

    if (!hits.length) {
      status.textContent = 'No result for "' + query.trim() + '". Try a shorter word, or browse the topics.';
      return;
    }
    status.textContent = (hits.length === 1 ? '1 result' : hits.length + ' results') + ' for "' + query.trim() + '"' +
      (hits.length > MAX_RESULTS ? ', showing the first ' + MAX_RESULTS : '');

    hits.slice(0, MAX_RESULTS).forEach(function (hit) {
      var page = hit.page;
      var item = document.createElement('li');
      item.className = 'search-result';

      var kind = document.createElement('p');
      kind.className = 'search-kind';
      kind.textContent = page.kind + (page.where ? ' in ' + page.where : '');
      item.appendChild(kind);

      var title = document.createElement('h3');
      var link = document.createElement('a');
      /* When the words are only in the page's text, ask the browser to scroll to them. */
      var inText = page.t.indexOf(phrase) === -1 && page.x.indexOf(phrase) !== -1;
      link.href = page.url + (inText && page.url.indexOf('#') === -1 ? '#:~:text=' + encodeURIComponent(phrase) : '');
      mark(link, page.title, words);
      title.appendChild(link);
      item.appendChild(title);

      if (page.description) {
        var description = document.createElement('p');
        mark(description, page.description, words);
        item.appendChild(description);
      }
      var piece = snippet(page, words);
      if (piece && page.d.indexOf(phrase) === -1) {
        var extract = document.createElement('p');
        extract.className = 'search-snippet';
        mark(extract, piece, words);
        item.appendChild(extract);
      }
      list.appendChild(item);
    });
  }

  /* The words can arrive in the address (?q=...), from the search box on another page. */
  function fromAddress() {
    var match = /[?&]q=([^&#]*)/.exec(window.location.search);
    if (!match) { return ''; }
    try { return decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch (e) { return ''; }
  }

  var timer = null;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { render(input.value); }, 120);
  });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    clearTimeout(timer);
    render(input.value);
  });

  var initial = fromAddress();
  if (initial) { input.value = initial; }
  render(input.value);
})();
