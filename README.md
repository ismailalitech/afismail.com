# afismail.com

A Hugo site: selected work, areas of expertise with notes and labs, free tools, and a
freelance page. It has no external theme, so everything you see
comes from the files in this folder.

Needs Hugo 0.146 or newer (the standard edition is enough).

## How the site is organised

```
content/
  _index.md              home page: role, introduction, picture, the three areas
  work/                  the Work tab: one file per case study
  topics/                the Expertise tab (its address stays /topics/)
    security/            a topic
      trustzone/         a sub-topic: put articles, labs and videos here
      secure-boot/
      ...
    software-security/
    fpga/
    microcontrollers/
  resources/             the Resources tab: decoder, cheat sheet, roadmap, glossary
  freelance.md           the Freelance tab
  about.md               the About tab
  search.md              the Search page (magnifier in the header)
  privacy.md, legal.md   linked in the footer
```

Every folder with an `_index.md` becomes a page that lists what is inside it. The
home page shows your name, role and two buttons beside a picture, then the three areas
of expertise, the first case study, the tools, and an invitation to work together.

On the Expertise page, an area with published pieces comes first and lists its
sub-topics in full; sub-topics with nothing in them yet are gathered on one "Planned"
line. An empty sub-topic says so on its own page and is kept out of search results
until its first piece is published. The folder is still called `topics`, so every
existing address keeps working.

## Add a case study (Work)

```
hugo new content --kind work work/polarfire-soc-bring-up.md
```

Fill in `problem`, `role` and `result` (one sentence each: they appear at the top of
the page, on the Work page and on the home page), then write the sections: Problem,
Hardware and constraints, My contribution, Architecture, Verification, Results and
limits. Add a real picture with `image`, `image_alt`, `image_size` and
`figure_caption`. While the work is not finished, say so with
`status = "In progress"`. Remove `draft = true` to publish.

`weight` sets the order; the case study with the lowest weight is the one featured on
the home page. Publish only what you are allowed to show: no employer material, no
unpublished measurements, nothing from a private repository.

## The home page background

The home page has a moving background: a circuit board drawn in fine lines, with
signals travelling along its traces. Choose how it is shown with `background` in
`content/_index.md`:

- `"rise"`: the board rises from the bottom of the first screen and, on a wide screen,
  up the empty right-hand side. No line passes under the text.
- `"tilt"`: the same board seen at an angle, under the text.
- `"full"`: a faint board behind the whole page.
- `"none"`: no background.

You can also show a photo or a capture on the right of the text: put the file in
`static/images/` and fill in the `hero_image` lines in `content/_index.md` (remove the
`# ` in front of them). Save photos as JPEG or WebP, about 1600 pixels wide and under
300 KB, and give the real width and height of the file.

## Preview on your computer

```
hugo server -D
```

Then open the address it prints (usually http://localhost:1313/). The `-D` also
shows pages marked `draft = true`, which are never published.

## Publish a change

```
git add . && git commit -m "Describe the change" && git push
```

The site rebuilds itself about a minute after the push. If the build fails, the
live site stays on the previous version; the reason is shown in the repository's
Actions tab.

## Add an article, a lab or a video

1. Choose the sub-topic folder, for example `content/topics/fpga/uvm/`.
2. Run `hugo new topics/fpga/uvm/my-title.md`
3. Fill in the top of the new file:
   - an **article** needs only a title and a description
   - a **lab** also has `lab = 1` (its number) and the board, core, level and time
   - a **video** has `youtube = "VIDEO_ID"`, the part after `v=` in its address
   - a page can be a lab with a video
4. Write the text under the headings, set `draft = false`, then publish.

Each page gets an "On this page" list from its `##` and `###` headings, a bar on
every code block with its language and a Copy button, and links to the other pages
of the same sub-topic. A lab shows its board, core, level and time in a table under
the title. A video shows a play button; the YouTube player loads only when the
visitor presses it. The newest pieces also appear under "Latest" on the home page,
which stays hidden until there is one.

`content/topics/security/trustzone/example-lab.md` is a placeholder that shows the
layout. It is a draft, so it is never published. Delete it when you no longer need it.

## Add a topic or a sub-topic

Create a folder with an `_index.md` in it:

```
+++
title = "Name shown on the site"
description = "One sentence shown on its card."
weight = 50
+++
```

`weight` sets the order: lower numbers come first. A folder directly under
`content/topics/` is a topic; a folder inside a topic is a sub-topic.

## What to edit

| To change                         | Edit                                        |
| --------------------------------- | ------------------------------------------- |
| Name, role, email, links, YouTube | `hugo.toml`                                 |
| Academic background, fields of work, languages (About page) | `params.highlights` in `hugo.toml` |
| Home page: role, introduction, picture, the three areas | `content/_index.md`   |
| Home page "Work with me" text     | `home_text` in `content/freelance.md`       |
| Freelance page: every section (disciplines, requests, ways to work, steps, assurances, training) | `content/freelance.md` |
| A case study                      | its file in `content/work/`                 |
| Planned subjects with no page yet (Expertise page) | `planned` in `content/topics/_index.md` |
| The three steps on the Expertise page | `params.steps` in `content/_index.md`   |
| The title shown in the browser tab for a page | `head_title` in its front matter |
| A topic's or sub-topic's name and description | its `_index.md`                 |
| The diagram on the security page  | `layouts/_partials/hero-visual.html`        |
| Freelance page                    | `content/freelance.md` (`contact_title` and `contact_text` set its contact block) |
| About page                        | `content/about.md`                          |
| Your photo                        | `photo` line in `content/about.md`          |
| Resources (tool, cheat sheet, roadmap, glossary) | files in `content/resources/` |
| Email sign-up block               | `subscribe_url` in `hugo.toml`              |
| Colours and fonts                 | top of `assets/css/main.css`                |
| Tabs in the header                | `[menus]` in `hugo.toml`                    |
| Share image (LinkedIn preview)    | `static/images/og.png`                      |

## Resources

The Resources tab lists every page in `content/resources/`, in the order of their
`weight`.

- **Fault decoder.** The page is `content/resources/fault-decoder.md`; the tool
  itself is `layouts/_partials/tool-fault-decoder.html` and
  `assets/js/fault-decoder.js`. It runs in the visitor's browser only.
- **Cheat sheet.** A normal page with tables. `print = true` in its front matter
  adds the "Print or save as PDF" button.
- **Roadmap and glossary.** Plain text pages: edit them like any other. In the
  glossary, a `##` heading is a group and a `###` heading is a term; the filter box
  and the group links are built from those headings.

Optional lines under `[params]` in a page's front matter change how it is laid out:

| Line                 | Effect                                                    |
| -------------------- | --------------------------------------------------------- |
| `toc = true`         | shows the "On this page" list (always shown inside Topics) |
| `view = "glossary"`  | term and definition side by side, with a filter box       |
| `view = "roadmap"`   | draws the stages along a line                             |
| `view = "about"`     | shows the background from `hugo.toml` beside the text     |
| `contact = true`     | shows the contact block (beside the text on wide screens) |

## Search

The magnifier in the header opens a search line on the current page; results appear
under it as the visitor types. When the site is built, Hugo writes a list of every
published page into the Search page (`content/search.md`,
`layouts/_partials/tool-search.html`), and `assets/js/search.js` searches that list
in the visitor's browser. Nothing is sent to a server and no outside service is
used. New articles, labs and videos become searchable as soon as they are published;
there is nothing to maintain. Without JavaScript, the magnifier leads to the Search
page instead.

## Privacy and legal pages

`content/privacy.md` and `content/legal.md` are published, with links in the footer.
Keep them true: update the privacy page whenever you add analytics, a form or an
email list. To take a page offline, set `draft = true` in it.

## Motion and smooth scrolling

- **Moving background.** The home page has a circuit board with signals travelling on
  it (see "The home page background"). Every other page has circuit traces in its
  empty margins, only as wide as the margin, so they appear on screens about 1220
  pixels wide or more and never sit behind text. Everything is drawn by
  `assets/js/traces.js`, with the colours and sizes in `assets/css/main.css`
  (`.board`, `.traces`). Each page gets its own routing. To remove the margin traces,
  delete the two `<canvas class="traces ...">` lines in `layouts/baseof.html`.
- **Signal under the header, on every page.** A short signal runs along the line under
  the header every few seconds (`.site-header::after` in the stylesheet).
- **Roadmap route.** On the roadmap page the stages are joined by a route that lights
  up to the reading position (`assets/js/roadmap.js`, loaded on that page only). Any
  page with `view = "roadmap"` gets it; start each stage heading with its number.
- **Smooth scrolling, on the home page on a desktop only.** The mouse wheel is
  smoothed by the Lenis library (MIT licence). Hugo downloads the file once when it
  builds the site, checks it against the fingerprint in `hugo.toml`
  (`params.smoothScroll`), and serves it from the site itself, so visitors contact no
  other server. `assets/js/smooth-scroll.js` fetches and starts it only on a wide
  screen with a mouse or trackpad. Phones, tablets and every other page (case studies,
  notes, labs, resources) scroll natively and never download the library. Set
  `enabled = false` to turn it off everywhere. If the download fails during a build,
  Hugo prints a warning and the site is built without it.

Visitors who ask their system for reduced motion get the traces without the signals,
no header signal and no smooth scrolling. Without JavaScript the pages are complete;
only the decoration is missing.

## Visitor statistics

The site counts visits with Cloudflare Web Analytics, which uses no cookies. The
numbers are in the Cloudflare dashboard, under Analytics & Logs, Web Analytics.
The site token is `cloudflareAnalyticsToken` in `hugo.toml`; empty it to turn the
statistics off, and then remove the "Visitor statistics" line from the Privacy page.
Previews with `hugo server` are not counted.

## Light and dark theme

The site follows the visitor's system setting. The button in the header switches
between light and dark and remembers the choice in the visitor's browser.

## Fonts

By default the site loads two families from Google Fonts: Instrument Sans for text
and IBM Plex Mono for code, signal names and figure captions. Set `googleFonts = false` in `hugo.toml` to use system
fonts and make no third-party request.

## Search engines

`layouts/_partials/schema.html` describes the site to search engines (who it
belongs to, where each page sits, what an article is), and `layouts/robots.txt`
points them to the sitemap that Hugo writes.
