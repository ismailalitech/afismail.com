# Personal site

A Hugo site with a tab bar: Labs, Courses, Consulting and About, plus the home page.
It has no external theme, so everything you see comes from the files in this folder.

Needs Hugo 0.146 or newer (the standard edition is enough).

## Preview on your computer

1. Install Hugo: https://gohugo.io/installation/
2. In this folder, run `hugo server`
3. Open the address it prints (usually http://localhost:1313/)

## Put it online with GitHub Pages

1. Create a new repository on GitHub and push this folder to its `main` branch.
2. In the repository, open Settings > Pages and set Source to "GitHub Actions".
3. Push again, or run the "Build and deploy" workflow from the Actions tab.
4. When the workflow turns green, the site address is shown in the deploy step.

The workflow in `.github/workflows/hugo.yaml` builds the site and publishes it on
every push to `main`.

## Use your own domain

1. Buy the domain from a registrar.
2. In the repository, open Settings > Pages > Custom domain and enter it.
3. Add the DNS records GitHub asks for. Their guide:
   https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site
4. Set `baseURL` in `hugo.toml` to the new address.

## What to edit

| To change                     | Edit                               |
| ----------------------------- | ---------------------------------- |
| Name, role, footer links      | `hugo.toml`                        |
| Home page text                | `content/_index.md`                |
| About page                    | `content/about.md`                 |
| Labs page intro               | `content/labs/_index.md`           |
| Courses page intro            | `content/courses/_index.md`        |
| Consulting page               | `content/consulting.md`            |
| "In preparation" labels       | `status` line in those two files   |
| Home page cards               | `description` in each page above   |
| Colours and fonts             | top of `assets/css/main.css`       |
| Tabs in the header            | `[menus]` in `hugo.toml`           |

Add your GitHub and LinkedIn addresses in `hugo.toml` to show them in the footer.

## Add a lab

1. Run `hugo new labs/my-lab-name.md`
2. Fill in the fields at the top of the new file (number, board, core, level, time).
3. Write the lab under the headings provided.
4. Set `draft = false` when it is ready, then push.

To announce a lab before it is written, use the commented example in
`content/labs/_index.md`.

## Add a course

Run `hugo new courses/my-course-name.md`, write the page, set `draft = false`.
It appears on the Courses tab. Remove the `status` line in
`content/courses/_index.md` when courses are open.

## Add another tab later

For Notes or Talks: create `content/notes/_index.md` with a title, add a menu entry
in `hugo.toml`, and add pages under `content/notes/`. The existing list and page
layouts are used automatically.

## Fonts and privacy

By default the site loads IBM Plex from Google Fonts. Set `googleFonts = false` in
`hugo.toml` to use system fonts and make no third-party request.
