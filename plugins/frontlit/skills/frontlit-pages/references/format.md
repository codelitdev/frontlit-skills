# FrontLit page file format

These rules mirror FrontLit's page importer. Any error in any file blocks the whole push from going live; warnings don't.

## Site folder

Everything FrontLit syncs lives in one site folder (`frontlit/` by default, or the repository root):

```text
frontlit/
├─ site.json          # header, footer, theme, redirects (optional)
├─ docs/              # Markdown docs (frontlit-docs skill)
└─ pages/
   ├─ index.json      # /
   ├─ pricing.json    # /pricing
   └─ blog.json       # /blog
```

- **File name = URL.** `pricing.json` → `/pricing`, `index.json` → `/`. Lowercase letters, digits and single hyphens only (`about-us.json`). No nested folders yet: `pages/solutions/x.json` is an error.
- Only `.json` files become pages; other files in `pages/` are ignored. The folder can hold at most 200 entries (every file and folder counts, not only `.json`), and each page file must be under 2 MB.
- **Reserved routes** can't be pages: `api`, `embed`, `opengraph-image`, `sitemap.xml`, `robots.txt`, `favicon.ico`, `openapi.json`, `_preview`, `release-preview`, `schema`.
- **The folder is the whole site.** Every live page needs a file. A page that has no file goes offline when the folder syncs.
- **Content feeds:** `blog.json`, `docs.json` and `changelog.json` must each contain exactly one `{ "name": "content-feed" }` block (where the article list, docs or updates render). No other page may have one. Article, doc and changelog entries themselves are not page files.

## Page file

```json
{
  "$schema": "https://frontlit.app/schema/page.v1.json",
  "title": "Pricing that scales with your team",
  "description": "Start free, upgrade when you need custom domains and SSO. No per-seat surprises.",
  "socialImage": { "url": "../assets/og-pricing.png", "alt": "Acme pricing" },
  "robotsAllowed": true,
  "published": true,
  "layout": [
    { "name": "hero", "settings": { "title": "Pricing that *scales*" } },
    { "name": "pricing", "settings": { "tiers": [] } }
  ]
}
```

| Key | Type | Notes |
| --- | --- | --- |
| `$schema` | string | Always `https://frontlit.app/schema/page.v1.json`. Editors use it for completion and validation. |
| `title` | string | This page's browser tab and search result title, not the website branding title. ~50–60 characters; don't append the site name (FrontLit adds branding where needed). |
| `description` | string | Search snippet and link preview. ~120–160 characters. Warning if missing or over 160. |
| `socialImage` | media | Open Graph image, 1200×630 PNG/JPG. |
| `robotsAllowed` | boolean | `false` adds noindex. Default `true`. |
| `published` | boolean | `false` imports the page as a draft (not served, links to it fail). Default `true`. |
| `layout` | array | Blocks, top to bottom: `{ "name": "<block>", "settings": { … } }`. `settings` is optional. |

No other keys are allowed (unknown keys are errors). Block names and settings are in `references/blocks.md`; the full schema with every enum and default is `scripts/schema/page.v1.json`.

## `site.json`

Website branding (site title, subtitle and logo) is not part of this file. Use FrontLit settings via `get_team_settings` / `update_team_settings`; see `mcp.md`. Do not add a top-level `title`, `website` or `branding` key here.

```json
{
  "$schema": "https://frontlit.app/schema/site.v1.json",
  "header": {
    "links": [
      { "label": "Features", "href": "/#features" },
      { "label": "Pricing", "href": "/pricing" }
    ],
    "ctaLabel": "Start free",
    "ctaHref": "https://app.example.com/signup"
  },
  "footer": {
    "layout": "columns",
    "tagline": "Ship docs and pages from your repo.",
    "columns": [
      { "title": "Product", "links": [{ "label": "Pricing", "href": "/pricing" }] }
    ],
    "copyrightText": "© 2026 Acme Inc."
  },
  "redirects": [{ "from": "/plans", "to": "/pricing" }]
}
```

- Optional. Without it, the header, footer and theme that are live stay as they are. With it, it replaces them on every page.
- `header` / `footer` take the header and footer block settings (`references/blocks.md`). **Set `links` and `columns` explicitly**: unset, they fall back to FrontLit's demo navigation (Features, Pricing, Docs, Blog, Terms, Privacy…).
- **Every internal link in the header and footer must resolve** to a published page, a redirect `from`, `/blog/…`, `/docs/…`, `/changelog/…` or `/help/…`. Otherwise the release fails (`LINK_TARGET_MISSING`). In pages, a broken link is only a warning.
- `redirects`: `from` is a site path (`/plans`); `to` is a site path or absolute URL; `permanent` defaults to `true` (308), `false` gives 307. Use them when you rename or remove a page.
- `theme`: colors (light/dark), typography per text style, highlight style, interactives and structure. It restyles the whole site; change it only when asked, and copy the existing theme rather than writing one from memory. See `scripts/schema/site.v1.json`.

## Values

- **Links** (`href`, `buttonAction`, `secondaryButtonAction`, `ctaHref`): a site path (`/pricing`), an anchor on a page (`/#faq`, which needs a block with `"cssId": "faq"` on `/`), or an absolute `https://` URL.
- **Rich text** (settings described as Markdown: hero/grid/banner `description`, content `body`, rich-text `text`, …): CommonMark + GFM. No HTML, MDX or JSX. Don't use `#` headings inside it; the block title is already the section heading. Links inside rich text are checked like other links.
- **Titles:** wrap words in `*asterisks*` to highlight them in the theme's highlight style: `"Docs your users *actually* read"`.
- **Media** (`media`, `socialImage`): `{ "url": "…", "alt": "…" }`. `url` is an absolute `https://` URL (`http://` and other schemes are rejected), or a path to an image inside the repository: relative to the page file (`../assets/hero.png`) or to the repository root when it starts with `/` (`/public/hero.png`). PNG, JPG, GIF, WebP, SVG or AVIF, under 10 MB; FrontLit uploads repository images on sync. Always write `alt` for images that carry meaning.
- **Icons:** a Lucide icon name in PascalCase (`"Zap"`, `"ShieldCheck"`, `"GitPullRequest"`); brand icons such as `"Github"`, `"Gitlab"` and `"Slack"` exist too. The names FrontLit renders are in `scripts/schema/lucide-icons.json`; an unknown name shows Sparkles in `featured` and no icon in `grid` and `marquee`.
- **Plain strings** (item descriptions, FAQ answers, small print) render as text; Markdown there shows literally.

## Canonical form

FrontLit writes page files one way, so diffs stay small: `$schema` first, keys in schema order, settings equal to a block default left out, unset values left out, `true` defaults for `robotsAllowed`/`published` left out, 2-space indent, trailing newline. Hand-written files don't have to match, but run the checker with `--fix` before committing so they do. `--fix` leaves Markdown as written; FrontLit's own serializer writes lists with a blank line between items, so a builder-made pull request may reformat a Markdown field. Note that "left out because it equals the default" is not the same as "left out by you": unset content settings render the default.

## Validation

Errors (nothing goes live until fixed):

| Code | Meaning |
| --- | --- |
| `INVALID_JSON` | Not strict JSON: no comments, no trailing commas. |
| `INVALID_PAGE` / `INVALID_SITE` | Schema violation at a JSON pointer, e.g. `/layout/2/settings/columns: Must be 2 or 3`. Unknown keys and unknown block names are errors. |
| `INVALID_PAGE_PATH` | File name isn't lowercase letters, digits and hyphens. |
| `NESTED_PAGES` | A folder inside `pages/`. |
| `RESERVED_ROUTE` | The file name is a reserved route. |
| `CONTENT_FEED_REQUIRED` / `CONTENT_FEED_NOT_ALLOWED` | See content feeds above. |
| `LINK_TARGET_MISSING` (site.json) | A header or footer link points nowhere. |
| `ASSET_URL` | An image URL that isn't `https://` or a repository path. |
| `ASSET_MISSING` / `ASSET_TOO_LARGE` | A repository image path that doesn't exist, isn't an image, or is over 10 MB. |
| `PAGE_TOO_LARGE`, `PAGES_LIMIT` | A page file over 2 MB, or over 200 entries in `pages/`. |

Warnings: `SEO_DESCRIPTION_MISSING`, `SEO_TITLE_LONG`, `SEO_DESCRIPTION_LONG`, `LINK_TARGET_MISSING` (in pages). The bundled checker adds `DEMO_CONTENT` (an unset setting renders demo copy), `ANCHOR_MISSING` (a `/page#id` link with no block `cssId` to scroll to), `UNKNOWN_ICON`, `PLACEHOLDER`, `HEADING_LEVEL`, `ALT_MISSING` and `SCHEMA_URL`.

## Publishing

- Each push to the publishing branch that touches `pages/` or `site.json` becomes one release: every page plus the header, footer and theme (and, if docs sync from the same repository, that commit's docs). All or nothing.
- The pull request gets a **FrontLit / pages preview** check with a private, unindexed preview.
- **Website → Releases** in FrontLit lists releases; activating an older one rolls back.
- While pages sync from the repository, the FrontLit builder can still edit drafts, but **Publish** becomes **Create pull request**; those PRs change these same files in canonical form.
