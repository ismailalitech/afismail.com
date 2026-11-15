/* Site search. The Search page contains a list of every page (title, description, text),
   written by Hugo when the site is built. This script searches that list in the
   visitor's browser, so nothing is sent anywhere and no outside service is used.

   It runs in two places:
   - the search line that opens under the header when the magnifier is pressed
     (the list is fetched from the Search page the first time it is needed);
   - the Search page itself, which also works as the fallback without JavaScript. */
(function () {
  var opener = document.querySelector('[data-search-open]');
  var panel = document.querySelector('[data-search-panel]');
  var pageForm = document.querySelector('[data-search-form]');
  if (!panel && !pageForm) { return; }

  var HINT = 'Type a word, for example TrustZone, fuzzing or HardFault.';
  var pages = null;
  var pending = null;

  /* Lower case, without accents, so "Zéro" and "zero" match. */
  function plain(text) {
    var out = String(text || '').toLowerCase();
    return out.normalize ? out.normalize('NFD').replace(/[̀-ͯ]/g, '') : out;
  }

  function prepare(list) {
    list.forEach(function (page) {
      page.text = String(page.text || '').replace(/\s+/g, ' ').trim();
      page.t = plain(page.title);
      page.d = plain(page.description);
      page.x = plain(page.text);
      page.k = plain(page.kind + ' ' + page.where);
    });
    return list;
  }

  /* Gets the list of pages: from this page if it is the Search page, otherwise from
     the Search page's address. Fetched once, then kept. */
  function load() {
    if (pages) { return Promise.resolve(pages); }
    if (pending) { return pending; }
    var here = document.querySelector('[data-search-index]');
    if (here) {
      try {
        pages = prepare(JSON.parse(here.textContent));
        return Promise.resolve(pages);
      } catch (e) {
        return Promise.reject(e);
      }
    }
    var address = opener ? opener.getAttribute('href') : '';
    if (!address || address.charAt(0) === '#' || !window.fetch || !window.DOMParser) {
      return Promise.reject(new Error('no search list'));
    }
    pending = fetch(address, { credentials: 'same-origin' }).then(function (response) {
      if (!response.ok) { throw new Error('search page: ' + response.status); }
      return response.text();
    }).then(function (html) {
      var node = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-search-index]');
      pages = prepare(JSON.parse(node.textContent));
      return pages;
    });
    pending.catch(function () { pending = null; });
    return pending;
  }

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

  function resultItem(page, words, phrase) {
    var item = document.createElement('li');
    item.className = 'search-result';

    var kind = document.createElement('p');
    kind.className = 'search-kind';
    /* "Topic in Topics" says nothing more than "Topic". */
    var where = page.where && plain(page.where) !== plain(page.kind) + 's' ? ' in ' + page.where : '';
    kind.textContent = page.kind + where;
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
    return item;
  }

  /* Connects one search box to its status line and its list of results.
     "max" is how many results are listed; "more" gives the address of the full list. */
  function connect(input, status, list, max, more) {
    var turn = 0;
    var timer = null;

    function draw(query) {
      var mine = ++turn;
      list.textContent = '';
      var phrase = plain(query).replace(/\s+/g, ' ').trim();
      if (phrase.length < 2) {
        status.textContent = HINT;
        return;
      }
      var words = phrase.split(' ').filter(function (word, i, all) { return word && all.indexOf(word) === i; });

      load().then(function (all) {
        if (mine !== turn) { return; }
        var hits = [];
        all.forEach(function (page) {
          var points = score(page, words, phrase);
          if (points > 0) { hits.push({ page: page, points: points }); }
        });
        hits.sort(function (a, b) { return b.points - a.points || a.page.title.localeCompare(b.page.title); });

        if (!hits.length) {
          status.textContent = 'No result for "' + query.trim() + '". Try a shorter word, or browse the topics.';
          return;
        }
        status.textContent = (hits.length === 1 ? '1 result' : hits.length + ' results') + ' for "' + query.trim() + '"' +
          (hits.length > max ? ', showing the first ' + max + '. ' : '');
        if (hits.length > max && more) {
          var all_link = document.createElement('a');
          all_link.href = more(query.trim());
          all_link.textContent = 'See all results';
          status.appendChild(all_link);
        }
        hits.slice(0, max).forEach(function (hit) {
          list.appendChild(resultItem(hit.page, words, phrase));
        });
      }, function () {
        if (mine !== turn) { return; }
        status.textContent = 'Search could not be loaded. Check the connection and try again.';
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { draw(input.value); }, 120);
    });
    return function () {
      clearTimeout(timer);
      draw(input.value);
    };
  }

  /* The Search page */
  var pageInput = pageForm ? pageForm.querySelector('input') : null;
  if (pageForm) {
    var section = pageForm.parentNode;
    var runPage = connect(pageInput, section.querySelector('[data-search-status]'), section.querySelector('[data-search-results]'), 20, null);
    pageForm.addEventListener('submit', function (event) {
      event.preventDefault();
      runPage();
    });
    /* The words can arrive in the address: /search/?q=words */
    var match = /[?&]q=([^&#]*)/.exec(window.location.search);
    if (match) {
      try { pageInput.value = decodeURIComponent(match[1].replace(/\+/g, ' ')); } catch (e) { /* malformed address: start empty */ }
    }
    runPage();
  }

  /* The search line under the header */
  if (opener && panel) {
    var quick = panel.querySelector('input');
    var form = panel.querySelector('form');
    var base = opener.getAttribute('href');
    var runQuick = connect(quick, panel.querySelector('[data-search-status]'), panel.querySelector('[data-search-results]'), 6, function (query) {
      return base.charAt(0) === '#' ? base : base + '?q=' + encodeURIComponent(query);
    });

    var close = function (returnFocus) {
      panel.hidden = true;
      opener.setAttribute('aria-expanded', 'false');
      /* Give the focus back without making the page jump. */
      if (returnFocus) { opener.focus({ preventScroll: true }); }
    };
    var open = function () {
      panel.hidden = false;
      opener.setAttribute('aria-expanded', 'true');
      quick.focus();
      runQuick();
    };
    var toggle = function () {
      /* On the Search page the box is already there: go to it. */
      if (pageInput && pageInput.offsetParent !== null) {
        pageInput.focus();
        return;
      }
      if (panel.hidden) { open(); } else { close(true); }
    };

    opener.setAttribute('role', 'button');
    opener.setAttribute('aria-expanded', 'false');
    opener.addEventListener('click', function (event) {
      event.preventDefault();
      toggle();
    });
    opener.addEventListener('keydown', function (event) {
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        toggle();
      }
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      runQuick();
    });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { close(true); }
    });
    panel.querySelector('[data-search-close]').addEventListener('click', function () { close(true); });
    /* Following a result closes the line, also when the result is on the current page. */
    panel.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('.search-result a, .search-status a')) { close(false); }
    });
  }
})();
