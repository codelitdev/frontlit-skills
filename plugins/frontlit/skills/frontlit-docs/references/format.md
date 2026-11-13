# FrontLit Docs file format

These rules mirror FrontLit's importer and validator. A file that breaks any of them blocks the whole pull request from going live.

## Files and folders

- Only `.md` files inside the docs folder are read, **including pages that use rich blocks**. `.mdx` files are reported as unsupported: rename them to `.md`. Other files are ignored.
- Paths: lowercase ASCII letters, digits and hyphens (`getting-started.md`), unless the page sets an explicit `slug`. No spaces, underscores or uppercase in a path that becomes a URL.
- **Sections:** the first folder under the docs folder is the page's section (`docs/guides/upload.md` is in section `guides`). Pages directly in the docs folder have no section and appear under a fallback group. Deeper folders are allowed; they become part of the URL, not extra sections.
- Folder names: lowercase letters, digits and hyphens.
- `index.md` inside a folder is an ordinary page at the folder's URL (`guides/index.md` → `/docs/guides`). A root `index.md` is the page `/docs/index`; it does not replace the docs home page.
- Images and other binaries cannot live in the repository for docs. Use absolute `https://` image URLs, each on its own line with blank lines around it; an image directly after a line of text renders inline in that paragraph.

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

Supported: paragraphs, headings `#`–`######`, **bold**, *italic*, ~~strike~~, `inline code`, links, images, block quotes, ordered and bulleted lists (nested), fenced code blocks with a language and an optional `title="…"`, tables, horizontal rules, hard line breaks, and the rich blocks below.

Not supported (each one fails validation):

| Construct | Use instead |
| --- | --- |
| Components other than the rich blocks below, `import`/`export` lines, `{expressions}` in props | See `porting.md` |
| Raw HTML (`<details>`, `<br>`, `<img>`, `<div>`…) | Markdown equivalent, or remove |
| `<` followed by a letter in prose, e.g. `Array<string>`, `<your-key>`, `<TSettings>` | Put it in backticks: `` `Array<string>` ``, or escape `\<` |
| Code fence metadata other than `title="…"`: ```` ```js {1,3} ````, `showLineNumbers`, `twoslash` | Language and optional `title` only |
| Task lists `- [ ]` / `- [x]` | Plain list items |
| A link with an empty destination, `[text]()` | Give it a URL, or remove the link and keep the text |
| An image inside a link, `[![alt](https://…/badge.svg)](https://…)` (badges, button images) | A text link, or the image on its own line |
| A list item that starts with another list marker: `- 1. text`, `- - text`, `1. - text`, `1. 1. text` (rejected as `INVALID_DOCUMENT`, without a file or line) | One marker per line, e.g. `1. text`. If the number only labels part of a screenshot, make it text: `- **(1) Name**: …` |
| Table column alignment (`:---`, `:---:`, `---:`) | Plain `---` |
| Bold/italic around inline code (`` **`code`** ``) | Inline code alone |
| Footnotes, math, definition lists, emoji shortcodes | Plain text |
| `data:`, `blob:` or signed/expiring URLs | Stable `https://` URLs |

Code fence language: `[A-Za-z0-9_+-]` only (`bash`, `ts`, `json`). Use `bash` for shell; framework-specific labels like `npm` are not special. Inside a code fence everything is literal, including `<` and JSX. A fence may be indented to sit inside a list item (`1. Run:` followed by an indented fence); it is still a fence.

## Rich blocks

Eleven MDX-style tags are supported. Props must be string literals or literal values (`items={["npm", "pnpm"]}`); a page that uses any of them is parsed with MDX rules.

- Put every tag on its own line, with a **blank line** after each opening tag and before each closing tag, so Markdown inside is parsed as Markdown. Indentation inside a component is layout only, not an indented code block.
- Any other capitalised tag is an error (`Unknown component <Foo>`), as are spread props and non-literal expressions.

| Component | Props | Children |
| --- | --- | --- |
| `<Callout>` | `type`: `note`, `tip`, `info`, `warning`, `danger` (default info); `title` | Any blocks |
| `<Tabs>` | `items`: list of strings (optional) | One or more `<Tab>` |
| `<Tab>` | `value`: label. Must be in `items` when `items` is set; without `value`, the Nth `items` entry is used | Any blocks |
| `<Steps>` | none | One or more `<Step>` |
| `<Step>` | none | Any blocks, usually starting with a `###` heading |
| `<Cards>` | none | One or more `<Card>` |
| `<Card>` | `title` (required); `href` (safe URL, e.g. `/docs/slug`); `icon`: a Lucide icon name, as `icon="Rocket"` or Fumadocs-style `icon={<Rocket />}` | Optional body; self-closing is allowed |
| `<Accordions>` | `type`: `single` or `multiple` | One or more `<Accordion>` |
| `<Accordion>` | `title` (required) | Any blocks |
| `<CodeGroup>` | none | **Only** fenced code blocks; each fence's `title` is its tab label |
| `<TypeTable>` | `type={{ name: { type: "string", default: "x", description: "…", required: true } }}`; self-closing, no children | none |

`<TypeTable>` fields: `type` is required and a string; `default` and `description` are strings; `required` is a boolean. Anything else (numbers or objects for `default`, other keys) fails. Write non-string defaults as strings (`default: "10"`).

````markdown
<Callout type="warning" title="Heads up">

Callouts hold **any** blocks, including [links](/docs/setup).

</Callout>

<CodeGroup>

```bash title="npm"
npm install medialit
```

```bash title="pnpm"
pnpm add medialit
```

</CodeGroup>

<TypeTable
  type={{
    apiKey: { type: "string", default: "MEDIALIT_API_KEY", description: "Your app's key." },
    access: { type: '"public" | "private"', required: true },
  }}
/>
````

Rich blocks can't be nested inside inline text, and a block quote starting `> **Warning:**` is still valid plain Markdown if a simpler form is preferred.

## Links

- To another docs page: `/docs/<slug>`, e.g. `[Concepts](/docs/concepts)`. Relative links resolve against the current page's URL, so prefer the absolute `/docs/...` form. Do not link to `.md` files.
- Anchors: `/docs/<slug>#<heading-id>`. A heading ID is the heading text lowercased, with everything except letters, digits, spaces, `_` and `-` removed, and each run of spaces turned into one hyphen: `Upload flow (drafts + sealing)` → `upload-flow-drafts-sealing`. Repeated headings get `-2`, `-3`.
- Every internal link and anchor must resolve to a page in this pull request or already published. Broken links block publication.
- External links: `https://`, `http://`, `mailto:`.

## Size limits

1 MB per page, 32 KB of frontmatter, 20,000 Markdown nodes.

## API reference (not a Markdown folder)

An API reference is generated from an OpenAPI 3.x spec, not written as pages. The spec path and URL path are set in the GitHub integration settings (or with the MCP API-reference tools; see `mcp.md`), not in `_sections.json`. See `porting.md`. The URL path (default `api-reference`) is reserved: no Markdown page or `slug` may resolve under `/docs/<mount>/`.
