/* Smooth scrolling for the whole site, using the Lenis library (window.Lenis, loaded
   just before this file). Only the mouse wheel is smoothed; touch, keyboard and the
   scrollbar keep their normal behaviour.

   Nothing is started for visitors who ask their system for reduced motion, and the
   site scrolls normally if the library is missing. */
(function () {
  if (typeof window.Lenis !== 'function' || !window.matchMedia) { return; }

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lenis = null;

  function start() {
    if (lenis) { return; }
    lenis = new window.Lenis({
      autoRaf: true,
      /* How quickly the page catches up with the wheel: higher is snappier. */
      lerp: 0.14,
      /* Links to a place on the same page (table of contents, "get in touch") still work. */
      anchors: true,
      /* Lists that scroll on their own (search results, long tables of contents) keep doing so. */
      allowNestedScroll: true,
      stopInertiaOnNavigate: true
    });
  }

  function stop() {
    if (!lenis) { return; }
    lenis.destroy();
    lenis = null;
  }

  function apply() {
    if (reducedMotion.matches) { stop(); } else { start(); }
  }

  apply();
  /* The visitor can change the setting while the page is open. */
  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener('change', apply);
  } else if (reducedMotion.addListener) {
    reducedMotion.addListener(apply);
  }
})();
