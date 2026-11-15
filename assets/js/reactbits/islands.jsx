/* React Bits islands. A page marks an element with data-rb="Name" (and optional data-rb-props as
   JSON); this file replaces it with the React Bits component of that name once React is loaded.
   The server-rendered HTML stays in place until then and is what a visitor sees without
   JavaScript, so nothing depends on this file to be readable.

   React, ReactDOM and GSAP are loaded as separate, fingerprinted files before this one; the
   imports below are mapped to them by the build (see layouts/_partials/scripts.html). */
import React from 'react';
import { createRoot } from 'react-dom';
import SplitText from './SplitText.jsx';
import SpotlightCard from './SpotlightCard.jsx';
import ShinyText from './ShinyText.jsx';

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

function currentTheme() {
  const set = root.getAttribute('data-theme');
  if (set) return set;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* Follows the site's light/dark choice, both the button and the system setting. */
function useTheme() {
  const [theme, setTheme] = React.useState(currentTheme);
  React.useEffect(() => {
    const update = () => setTheme(currentTheme());
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    if (query.addEventListener) query.addEventListener('change', update);
    return () => {
      observer.disconnect();
      if (query.removeEventListener) query.removeEventListener('change', update);
    };
  }, []);
  return theme;
}

const CARD_STYLE = {
  '--spotlight-card-surface': 'var(--surface)',
  '--spotlight-card-border': 'var(--rule)',
  '--spotlight-card-shadow': 'none'
};

const components = {
  /* The card keeps its own HTML; the component adds the light that follows the pointer. */
  SpotlightCard(el, props) {
    const html = el.innerHTML;
    function Card() {
      const theme = useTheme();
      return (
        <SpotlightCard theme={theme} className="rb-card" style={CARD_STYLE} intensity={0.16} spotlightSize={260} borderGlow={0.7} {...props}>
          <div className="rb-inner" dangerouslySetInnerHTML={{ __html: html }} />
        </SpotlightCard>
      );
    }
    return <Card />;
  },
  /* The text of the element, split into characters that rise into place. */
  SplitText(el, props) {
    return <SplitText text={el.textContent.trim()} tag="span" textAlign="left" splitType="chars" delay={30} duration={0.9} threshold={0} rootMargin="0px" {...props} />;
  },
  /* A soft shine that passes over the text now and then. */
  ShinyText(el, props) {
    function Shiny() {
      const theme = useTheme();
      const dark = theme === 'dark';
      return <ShinyText text={el.textContent.trim()} color={dark ? '#a5a49e' : '#5a5a55'} shineColor={dark ? '#ffffff' : '#1d43b5'} speed={3.2} delay={1.5} {...props} />;
    }
    return <Shiny />;
  }
};

function mount(el) {
  const name = el.getAttribute('data-rb');
  const make = components[name];
  if (!make || el.dataset.rbMounted) return;
  let props = {};
  try { props = JSON.parse(el.getAttribute('data-rb-props') || '{}'); } catch (e) { props = {}; }
  const node = make(el, props);
  el.dataset.rbMounted = 'true';
  el.classList.add('rb-on');
  createRoot(el).render(node);
}

function start() {
  if (reduced()) { root.classList.remove('rb-pending'); return; }
  document.querySelectorAll('[data-rb]').forEach(mount);
  root.classList.remove('rb-pending');
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(start);
} else {
  start();
}
