/* Small behaviours for the site: the light/dark switch, the print button and Copy
   buttons on code blocks.
   The site works without this file. */
(function () {
  var root = document.documentElement;

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

  var printButton = document.querySelector('[data-print]');
  if (printButton) {
    printButton.addEventListener('click', function () { window.print(); });
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    document.querySelectorAll('.prose pre').forEach(function (pre) {
      var wrap = document.createElement('div');
      wrap.className = 'codeblock';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);

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
      wrap.appendChild(button);
    });
  }
})();
