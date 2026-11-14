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
  privacy.md, legal.md   linked in the footer
```

Every folder with an `_index.md` becomes a page that lists what is inside it. The
home page shows one card per topic, with its sub-topics.

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

Each page gets an "On this page" list from its `##` and `###` headings, a Copy
button on every code block, and links to the other pages of the same sub-topic.
The newest pieces also appear under "Latest" on the home page.

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
| Credentials under the headline    | `params.highlights` in `hugo.toml`          |
| Home page text                    | `content/_index.md`                         |
| "How it works" steps              | `params.steps` in `content/_index.md`       |
| A topic's or sub-topic's name and description | its `_index.md`                 |
| The diagram on the security page  | `layouts/_partials/hero-visual.html`        |
| Freelance page                    | `content/freelance.md`                      |
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
- **Roadmap and glossary.** Plain text pages: edit them like any other.

## Privacy and legal pages

`content/privacy.md` and `content/legal.md` are published, with links in the footer.
Keep them true: update the privacy page whenever you add analytics, a form or an
email list. To take a page offline, set `draft = true` in it.

## Light and dark theme

The site follows the visitor's system setting. The button in the header switches
between light and dark and remembers the choice in the visitor's browser.

## Fonts

By default the site loads IBM Plex from Google Fonts. Set `googleFonts = false` in
`hugo.toml` to use system fonts and make no third-party request.
