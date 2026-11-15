# afismail.com: notes for Claude Code

A Hugo site (v0.170.0, standard edition; the deploy workflow in `.github/workflows/hugo.yaml` pins it). Plain CSS and a little
JavaScript; no Node build in CI.

## Structure
- Navigation: Projects, Labs, References, Freelance, About (`hugo.toml`, menus).
- `content/projects/<field>/<platform>/<project>/`: a project is a folder with `project = true`; its sub-folders are its parts.
  The pfdaq project (`content/projects/fpga-soc/microchip-polarfire-soc/pfdaq/`) and `static/pfdaq/` are **generated** by
  `tools/export_site.py` in the pfdaq repository. Do not edit them here; change the source there and re-export.
- Layouts are in `layouts/` (new Hugo template names: `baseof.html`, `home.html`, `page.html`, `section.html`, `_partials/`).

## Animation and motion
- Libraries are fetched at build time, checked against the fingerprints in `hugo.toml` (`params.libs`, `params.smoothScroll`)
  and served from this site. To update one: change the address, then the fingerprint
  (`openssl dgst -sha256 -binary FILE | openssl base64 -A`). A file that does not match is left out; the page still works.
- GSAP + ScrollTrigger on every page (`assets/js/motion.js`); Lenis on desktop only (`assets/js/smooth-scroll.js`);
  React Bits components (SplitText, SpotlightCard) as islands marked `data-rb="Name"`, compiled from
  `assets/js/reactbits/islands.jsx` with `js.Build` (React and GSAP come from the global files, see `_partials/motion-scripts.html`).
- Page transitions (`@view-transition`) and the reading bar are CSS only.
- Everything honours `prefers-reduced-motion`, and every page must be complete with scripts off.
- One animation engine: do not add Motion or another tween library next to GSAP.

## Checks before a pull request
- `hugo --minify` prints no warning.
- Look at the result in a real browser (Playwright MCP or Chrome DevTools MCP): home, `/projects/`, a project page, a lab page,
  light and dark theme, and a narrow window. A headless screenshot with virtual time does not run animations; use a live page.
- Chrome DevTools MCP: run a Lighthouse audit and a performance trace on the home page and a lab page after adding anything heavy.

## Rules
- Nothing goes to `main` (which deploys) without the owner's go-ahead: open a pull request.
- Only content that was built and tested in the project is published; no filler.
- Never name the training provider whose course material was used as a topic source.

## Design direction (from an unslop audit, November 2026)
The site passed the audit as lightly sloppy: palette, type and layout are deliberate and stay. Rules that came out of it:
- **Product:** the engineering projects and labs of one person, written so that others can rebuild them.
- **Character:** exact, plain, bench-like. **World:** a circuit board and an instrument bench. **Moments:** the chip drawing on the home page, the animated diagrams and the waveforms taken from real simulations. **Signature:** a signal that travels along a trace.
- Chrome stays quiet: neutral surfaces, one accent, no glows, no looping shine on text, no gradient text. Motion explains something or happens once.
- Copy: no exclamation marks, no hype words, short labels without a final period.
- The audit uses the `unslop` skill by Damir Sokolovsky (https://github.com/heydamir/unslop, CC BY 4.0): run `/unslop` on a page before a redesign.
