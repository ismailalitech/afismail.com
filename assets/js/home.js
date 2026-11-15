/* Home page only: a soft highlight that follows the pointer over the topic cards.
   The headline reveal needs no script; it is plain CSS (see "Home page effects" in
   assets/css/main.css). Skipped on touch screens and for visitors who ask for reduced motion. */
(function () {
  var grid = document.querySelector('[data-spotlight]');
  if (!grid || !window.matchMedia) { return; }
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) { return; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }

  grid.addEventListener('pointermove', function (event) {
    var cell = event.target.closest ? event.target.closest('.cell') : null;
    if (!cell || !grid.contains(cell)) { return; }
    var box = cell.getBoundingClientRect();
    cell.style.setProperty('--spot-x', (event.clientX - box.left) + 'px');
    cell.style.setProperty('--spot-y', (event.clientY - box.top) + 'px');
  });
})();
