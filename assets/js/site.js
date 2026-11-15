/* Small behaviours for the site: the light/dark switch, the print button, the bar above
   code blocks, the video play button and the glossary filter.
   The site works without this file. */
(function () {
  var root = document.documentElement;

  /* Light and dark theme */
  function currentTheme() {
    var set = root.getAttribute('data-theme');
    if (set === 'light' || set === 'dark') { return set; }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    var sync = function () {
      toggle.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    };
    sync();
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable: the choice lasts for this page only */ }
      sync();
    });
  }

  /* Marks an element (data-seen) the first time it scrolls into view, so that a
     one-time effect can play: the chain on the Freelance page lights up. */
  var unseen = document.querySelectorAll('[data-seen]');
  if (unseen.length && 'IntersectionObserver' in window) {
    var watcher = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-seen');
          watcher.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    Array.prototype.forEach.call(unseen, function (element) { watcher.observe(element); });
  }

  /* Print button on the cheat sheet */
  var printButton = document.querySelector('[data-print]');
  if (printButton) {
    printButton.addEventListener('click', function () { window.print(); });
  }

  /* Code blocks: a bar with the language and a Copy button */
  document.querySelectorAll('.prose pre').forEach(function (pre) {
    var code = pre.querySelector('code');
    var lang = '';
    if (code) {
      lang = code.getAttribute('data-lang') || '';
      if (!lang) {
        var match = /(?:^|\s)language-([\w+#-]+)/.exec(code.className);
        if (match) { lang = match[1]; }
      }
    }
    /* "text" marks plain output, which needs no label. */
    if (lang === 'text' || lang === 'plaintext' || lang === 'fallback') { lang = ''; }
    var canCopy = navigator.clipboard && navigator.clipboard.writeText;
    if (!lang && !canCopy) { return; }

    /* Hugo wraps highlighted code in <div class="highlight">; keep that wrapper inside. */
    var block = pre.parentNode.classList.contains('highlight') ? pre.parentNode : pre;
    var wrap = document.createElement('div');
    wrap.className = 'codeblock';
    block.parentNode.insertBefore(wrap, block);

    var bar = document.createElement('div');
    bar.className = 'codeblock-bar';
    var label = document.createElement('span');
    label.textContent = lang;
    bar.appendChild(label);

    if (canCopy) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'copy';
      button.textContent = 'Copy';
      button.addEventListener('click', function () {
        navigator.clipboard.writeText(pre.innerText).then(function () {
          button.textContent = 'Copied';
          setTimeout(function () { button.textContent = 'Copy'; }, 1500);
        }, function () {
          button.textContent = 'Copy failed';
        });
      });
      bar.appendChild(button);
    }
    wrap.appendChild(bar);
    wrap.appendChild(block);
  });

  /* Videos: the YouTube player is loaded only after the play button is pressed */
  document.querySelectorAll('[data-video]').forEach(function (box) {
    var link = box.querySelector('a');
    var id = box.getAttribute('data-video');
    if (!link || !/^[\w-]{6,20}$/.test(id)) { return; }
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var frame = document.createElement('iframe');
      frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1';
      frame.title = 'Video: ' + (box.getAttribute('data-video-title') || '');
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      box.textContent = '';
      box.appendChild(frame);
      frame.focus();
    });
  });

  /* Glossary: filter the terms, and jump to a group */
  var tools = document.querySelector('[data-glossary]');
  var article = tools ? tools.closest('article') : null;
  var prose = article ? article.querySelector('.prose') : null;
  if (tools && prose) {
    var input = tools.querySelector('input');
    var count = tools.querySelector('[data-glossary-count]');
    var groups = tools.querySelector('[data-glossary-groups]');

    /* Each term is a heading followed by its definition, up to the next heading. */
    var groupList = [];
    var terms = [];
    var group = null;
    var term = null;
    Array.prototype.forEach.call(prose.children, function (node) {
      if (node.tagName === 'H2') {
        group = { heading: node, terms: [] };
        groupList.push(group);
        term = null;
      } else if (node.tagName === 'H3') {
        term = { nodes: [node], text: node.textContent.toLowerCase() };
        terms.push(term);
        if (group) { group.terms.push(term); }
      } else if (term) {
        term.nodes.push(node);
        term.text += ' ' + node.textContent.toLowerCase();
      }
    });

    groupList.forEach(function (g) {
      if (!g.heading.id) { return; }
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.href = '#' + g.heading.id;
      link.textContent = g.heading.textContent;
      item.appendChild(link);
      groups.appendChild(item);
    });

    var filter = function () {
      var query = input.value.trim().toLowerCase();
      var shown = 0;
      terms.forEach(function (t) {
        t.visible = query === '' || t.text.indexOf(query) !== -1;
        if (t.visible) { shown += 1; }
        t.nodes.forEach(function (node) { node.hidden = !t.visible; });
      });
      groupList.forEach(function (g) {
        g.heading.hidden = !g.terms.some(function (t) { return t.visible; });
      });
      groups.hidden = query !== '';
      if (query === '') {
        count.textContent = terms.length + ' terms';
      } else if (shown === 0) {
        count.textContent = 'No term matches "' + input.value.trim() + '".';
      } else {
        count.textContent = shown + ' of ' + terms.length + ' terms';
      }
    };

    input.addEventListener('input', filter);
    filter();
    tools.hidden = false;
  }
})();
