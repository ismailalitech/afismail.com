# afismail.com

A Hugo site with a tab bar: Labs, Courses, Consulting and About, plus the home page.
It has no external theme, so everything you see comes from the files in this folder.

Needs Hugo 0.146 or newer (the standard edition is enough).

## Preview on your computer

In this folder, run:

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

## What to edit

| To change                         | Edit                                        |
| --------------------------------- | ------------------------------------------- |
| Name, role, email, footer links   | `hugo.toml`                                 |
| Credentials under the headline    | `params.highlights` in `hugo.toml`          |
| Home page text                    | `content/_index.md`                         |
| "How the labs work" steps         | `params.steps` in `content/_index.md`       |
| About page and home page About    | `content/about.md` (`teaser` is the home text) |
| Your photo                        | `photo` line in `content/about.md`          |
| Labs page                         | `content/labs/_index.md`                    |
| Resources (tool, cheat sheet, roadmap, glossary) | files in `content/resources/` |
| Diagram on the home page          | `layouts/_partials/hero-visual.html`        |
| Email sign-up block               | `subscribe_url` in `hugo.toml`              |
| Courses page                      | `content/courses/_index.md`                 |
| Consulting page                   | `content/consulting.md`                     |
| "In preparation" labels           | `status` line in those two files            |
| Home page cards                   | `description` in each page above            |
| Colours and fonts                 | top of `assets/css/main.css`                |
| Tabs in the header                | `[menus]` in `hugo.toml`                    |
| Share image (LinkedIn preview)    | `static/images/og.png`                      |

## Add a lab

1. Run `hugo new labs/my-lab-name.md`
2. Fill in the fields at the top of the new file (number, board, core, level, time, topics).
3. Write the lab under the headings provided.
4. Set `draft = false` when it is ready, then publish.

Each lab page gets an "On this page" list from its `##` and `###` headings, a Copy
button on every code block, and links to the neighbouring labs.

`content/labs/example-lab.md` is a placeholder that shows the layout. It is a
draft, so it is never published. Delete it when you no longer need it.

To announce a lab before it is written, use the commented example in
`content/labs/_index.md`.

## Resources

The Resources tab lists every page in `content/resources/`, in the order of their
`weight`. To add one, create a new `.md` file there with a title, a description
and a weight.

- **Fault decoder.** The page is `content/resources/fault-decoder.md`; the tool
  itself is `layouts/_partials/tool-fault-decoder.html` and
  `assets/js/fault-decoder.js`. It runs in the visitor's browser only.
- **Cheat sheet.** A normal page with tables. `print = true` in its front matter
  adds the "Print or save as PDF" button.
- **Roadmap and glossary.** Plain text pages: edit them like any other.

## Add a course

Run `hugo new courses/my-course-name.md`, write the page, set `draft = false`.
It appears on the Courses tab. Remove the `status` line in
`content/courses/_index.md` when courses are open.

## Add another tab later

For Notes or Talks: create `content/notes/_index.md` with a title, add a menu entry
in `hugo.toml`, and add pages under `content/notes/`. The existing list and page
layouts are used automatically.

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
