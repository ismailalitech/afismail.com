/* Scroll reveals with GSAP and ScrollTrigger. Cards, figures and headings that start below the
   fold fade up the first time they scroll into view. Elements already in view at load are left
   alone, so nothing is hidden at the top of the page, and nothing is hidden at all for visitors
   who ask for reduced motion or when GSAP could not be loaded.

   When smooth scrolling (Lenis) is running, ScrollTrigger is told about every scroll step so
   the two agree on where the page is. */
(function () {
  var gsap = window.gsap;
  var trigger = window.ScrollTrigger;
  if (!gsap || !trigger) { return; }
  gsap.registerPlugin(trigger);

  function follow(lenis) {
    if (lenis && typeof lenis.on === 'function') { lenis.on('scroll', trigger.update); }
  }
  follow(window.__lenis);
  window.addEventListener('lenis:ready', function (event) { follow(event.detail); });

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) { return; }

  var selectors = [
    '.project-card', '.part', '.entry', '.work-item', '.block-head', '.glance', '.invite',
    '.prose figure', '.prose p > a > img', '.prose p > img', '.view-project .case-summary'
  ].join(',');
  var items = Array.prototype.slice.call(document.querySelectorAll(selectors)).filter(function (el) {
    return !el.closest('.toc, .site-header, .search-panel, [data-no-reveal]');
  });
  var later = items.filter(function (el) {
    return el.getBoundingClientRect().top > window.innerHeight * 0.92;
  });
  if (!later.length) { return; }

  gsap.set(later, { autoAlpha: 0, y: 28 });
  trigger.batch(later, {
    start: 'top 92%',
    once: true,
    onEnter: function (batch) {
      gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out', stagger: 0.09, overwrite: true });
    }
  });
})();
