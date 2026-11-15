/* Smooth scrolling on the home page, using the Lenis library. It runs only on a desktop:
   a wide screen with a mouse or trackpad. The library is fetched from this site only
   when it is going to be used, so a phone or a tablet never downloads it and keeps its
   native scrolling. Every other page scrolls natively too, because this file is loaded
   on the home page only.

   Nothing is fetched or started for visitors who ask their system for reduced motion,
   and the page scrolls normally if the library cannot be loaded. */
(function () {
  var self = document.currentScript;
  if (!self || !self.dataset.lenisSrc || !window.matchMedia) { return; }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var desktop = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 64rem)');
  var requested = false;
  var lenis = null;

  function wanted() {
    return desktop.matches && !reducedMotion.matches;
  }

  function start() {
    if (lenis || !wanted() || typeof window.Lenis !== 'function') { return; }
    lenis = new window.Lenis({
      autoRaf: true,
      /* How quickly the page catches up with the wheel: higher is snappier. */
      lerp: 0.14,
      /* Links to a place on the same page still work. */
      anchors: true,
      /* Lists that scroll on their own (the search results) keep doing so. */
      allowNestedScroll: true,
      stopInertiaOnNavigate: true
    });
  }

  function stop() {
    if (!lenis) { return; }
    lenis.destroy();
    lenis = null;
  }

  /* Fetches the library once, checked against the fingerprint written at build time. */
  function fetchLibrary() {
    if (requested) { return; }
    requested = true;
    var script = document.createElement('script');
    script.src = self.dataset.lenisSrc;
    if (self.dataset.lenisIntegrity) {
      script.integrity = self.dataset.lenisIntegrity;
      script.crossOrigin = 'anonymous';
    }
    script.onload = start;
    document.head.appendChild(script);
  }

  function apply() {
    if (!wanted()) { stop(); return; }
    if (typeof window.Lenis === 'function') { start(); } else { fetchLibrary(); }
  }

  apply();
  /* The visitor can change the setting, or resize the window, while the page is open. */
  [reducedMotion, desktop].forEach(function (query) {
    if (query.addEventListener) {
      query.addEventListener('change', apply);
    } else if (query.addListener) {
      query.addListener(apply);
    }
  });
})();
