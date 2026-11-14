# afismail.com

A Hugo site organised by topic. It has no external theme, so everything you see
comes from the files in this folder.

Needs Hugo 0.146 or newer (the standard edition is enough).

## How the site is organised

```
content/
  _index.md              home page text
  topics/                the Topics tab
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
home page shows the headline, a search box and your background, then one cell per
topic, with its sub-topics as links. A sub-topic with
nothing in it yet says so on its page, shows "In preparation" in the lists, and is
kept out of search results until its first piece is published.

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
| Academic background, fields of work, languages (home page and About) | `params.highlights` in `hugo.toml` |
| Home page text                    | `content/_index.md`                         |
| The three steps on the Topics page | `params.steps` in `content/_index.md`      |
| A topic's or sub-topic's name and description | its `_index.md`                 |
| The diagram on the security page  | `layouts/_partials/hero-visual.html`        |
| Freelance page                    | `content/freelance.md` (`contact_title` and `contact_text` set its contact block) |
| About page and home page About    | `content/about.md` (`teaser` is the home text) |
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

The search box on the home page and the magnifier in the header lead to the Search
page (`content/search.md`). When the site is built, Hugo writes a list of every
published page into that page (`layouts/_partials/tool-search.html`), and
`assets/js/search.js` searches the list in the visitor's browser. Nothing is sent to
a server and no outside service is used. New articles, labs and videos become
searchable as soon as they are published; there is nothing to maintain.

## Privacy and legal pages

`content/privacy.md` and `content/legal.md` are published, with links in the footer.
Keep them true: update the privacy page whenever you add analytics, a form or an
email list. To take a page offline, set `draft = true` in it.

## Light and dark theme

The site follows the visitor's system setting. The button in the header switches
between light and dark and remembers the choice in the visitor's browser.

## Fonts

By default the site loads two IBM Plex families from Google Fonts: Plex Sans for
text and Plex Mono for code. Set `googleFonts = false` in `hugo.toml` to use system
fonts and make no third-party request.

## Search engines

`layouts/_partials/schema.html` describes the site to search engines (who it
belongs to, where each page sits, what an article is), and `layouts/robots.txt`
points them to the sitemap that Hugo writes.
