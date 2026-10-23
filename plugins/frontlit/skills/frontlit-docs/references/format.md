# FrontLit Docs file format

These rules mirror FrontLit's importer and validator. A file that breaks any of them blocks the whole pull request from going live.

## Files and folders

- Only `.md` files inside the docs folder are read. `.mdx` files are reported as unsupported. Other files are ignored.
- Paths: lowercase ASCII letters, digits and hyphens (`getting-started.md`), unless the page sets an explicit `slug`. No spaces, underscores or uppercase in a path that becomes a URL.
- **Sections:** the first folder under the docs folder is the page's section (`docs/guides/upload.md` is in section `guides`). Pages directly in the docs folder have no section and appear under a fallback group. Deeper folders are allowed; they become part of the URL, not extra sections.
- Folder names: lowercase letters, digits and hyphens.
- `index.md` inside a folder is an ordinary page at the folder's URL (`guides/index.md` → `/docs/guides`). A root `index.md` is the page `/docs/index`; it does not replace the docs home page.
- Images and other binaries cannot live in the repository for docs. Use absolute `https://` image URLs.

## `_sections.json` (optional, in the docs folder root)

Names and orders sections. Without it, folder names are used as labels.

```json
{
  "version": 1,
  "sections": [
    { "folder": "getting-started", "name": "Getting started", "order": 10 },
    { "folder": "guides", "name": "Guides", "order": 20 }
  ]
}
```

- Exactly these keys. `folder`: one segment, `[a-z0-9-]+`, unique. `name`: non-empty. `order`: integer, lower first.
- A listed section with no pages is kept as an empty section.

## Frontmatter

YAML between `---` lines at the top of every file.

| Field | Rule |
| --- | --- |
| `title` | **Required**, non-empty string |
| `description` | Optional string; used for search results and link previews |
| `slug` | Optional; URL path relative to `/docs`, lowercase `[a-z0-9-]` segments separated by `/`. Defaults to the file path without `.md`. First segment cannot be `collections` or `search` |
| `nav_title` | Optional shorter sidebar label |
| `nav_order` | Optional integer; lower appears first within the section, then by path |
| `published` | Optional boolean, default `true`. `false` keeps the page as a private draft |
| `indexable` | Optional boolean, default `true`. `false` keeps the page public but out of search and AI answers |
| `featured_image` | Optional `{ url, alt }` with an `https://` URL |

- Every route (`/docs/<slug>`) must be unique across all files.
- Plain data only. No duplicate keys, YAML tags or anchors. Unknown keys are kept but ignored; do not add framework keys like `icon` or `sidebar_position`.

```markdown
---
title: Upload a file
description: Send your first file to MediaLit from the CLI, cURL or Node.js.
slug: quick-start
nav_order: 20
---
```

## Markdown

Supported: paragraphs, headings `#`–`######`, **bold**, *italic*, ~~strike~~, `inline code`, links, images, block quotes, ordered and bulleted lists (nested), fenced code blocks with a language, tables, horizontal rules, hard line breaks.

Not supported (each one fails validation):

| Construct | Use instead |
| --- | --- |
| MDX/JSX components, `import`/`export` lines | See `porting.md` |
| Raw HTML (`<details>`, `<br>`, `<img>`, `<div>`…) | Markdown equivalent, or remove |
| `<` followed by a letter in prose, e.g. `Array<string>`, `<your-key>` | Put it in backticks: `` `Array<string>` ``, or escape `\<` |
| Code fence metadata: ```` ```ts title="app.ts" ````, ```` ```js {1,3} ```` | Language only (```` ```ts ````); put the filename in the sentence above |
| Task lists `- [ ]` / `- [x]` | Plain list items |
| Table column alignment (`:---`, `:---:`, `---:`) | Plain `---` |
| Bold/italic around inline code (`` **`code`** ``) | Inline code alone |
| Footnotes, math, definition lists, emoji shortcodes | Plain text |
| `data:`, `blob:` or signed/expiring URLs | Stable `https://` URLs |

Code fence language: any identifier (`bash`, `ts`, `json`). Use `bash` for shell; framework-specific labels like `npm` are not special.

## Links

- To another docs page: `/docs/<slug>`, e.g. `[Concepts](/docs/concepts)`. Relative links resolve against the current page's URL, so prefer the absolute `/docs/...` form. Do not link to `.md` files.
- Anchors: `/docs/<slug>#<heading-id>`. Heading IDs are the heading text lowercased, punctuation removed, spaces turned into hyphens; repeated headings get `-2`, `-3`.
- Every internal link and anchor must resolve to a page in this pull request or already published. Broken links block publication.
- External links: `https://`, `http://`, `mailto:`.

## Size limits

1 MB per page, 32 KB of frontmatter, 20,000 Markdown nodes.
