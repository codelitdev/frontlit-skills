# Porting from other docs frameworks

Goal: same content, same order, same URLs, valid FrontLit Markdown. Change syntax, not wording.

## Navigation → sections

| Source | Where navigation lives | FrontLit |
| --- | --- | --- |
| Fumadocs | `meta.json` (`pages`, `---Group---` separators, `title`) | Each separator group → a folder + `_sections.json` entry; array order → `nav_order` |
| Docusaurus | `sidebars.js`, `_category_.json`, `sidebar_position` | Categories → sections; `sidebar_position` → `nav_order` |
| Mintlify | `mint.json` / `docs.json` `navigation` groups | Groups → sections |
| Nextra | `_meta.json` / `_meta.ts` | Keys order → `nav_order`; folders → sections |
| GitBook | `SUMMARY.md` | Headings → sections; list order → `nav_order` |
| VitePress | `.vitepress/config` `sidebar` | Groups → sections |

- Space `nav_order` and section `order` by 10 so pages can be inserted later.
- Nested navigation deeper than one level: keep pages in a subfolder of the section (the subfolder appears in the URL) and order with `nav_order`.

## Frontmatter

| Source key | FrontLit |
| --- | --- |
| `title`, `sidebar_label` | `title`; a shorter label goes in `nav_title` |
| `description` | `description` |
| `slug`, permalink, file path | `slug` (relative to `/docs`, lowercase, hyphens) |
| `sidebar_position`, order | `nav_order` |
| `draft: true`, `hidden` | `published: false` |
| `icon`, `full`, `tags`, `keywords`, `hide_title`, `toc`… | Drop |

If the page has no title in frontmatter, use its first `#` heading and remove that heading from the body (FrontLit renders the title).

## Components and syntax

Delete all `import`/`export` lines first.

| Source | FrontLit Markdown |
| --- | --- |
| `<Steps>`/`<Step>`, Docusaurus/Mintlify steps | Numbered `###` headings (`### 1. Create an app`), or an ordered list when steps are one paragraph each |
| `<Tabs>`/`<Tab value="X">`, `<CodeGroup>` | One subsection per tab: `#### X` followed by its content. For code-only tabs, consecutive fenced blocks each preceded by a one-line label (`**npm**`). Keep tab order |
| `<Callout type="warning">`, `:::warning`, `<Warning>`, `<Note>`, `<Tip>`, `> [!NOTE]` | Block quote starting with the kind in bold: `> **Warning:** …` (Note, Tip, Info, Warning, Danger) |
| `<Cards>`/`<Card title href>`, `<CardGroup>` | Bulleted list: `- [Title](/docs/slug): description` |
| `<Accordion>`, `<details><summary>` | `###`/`####` heading with the summary text, then the content |
| `<TypeTable type={{…}}>`, `<ParamField>`, `<ResponseField>` | Table: Name, Type, Required, Default, Description (no column alignment) |
| `<Frame>`, `<img>`, `<Image>` | `![alt](https://…)` |
| `<Video>`, `<iframe>`, embeds | A link: `[Watch the demo](https://…)` |
| Live/interactive widgets (uploaders, playgrounds, sandboxes) | Remove; add a sentence with a link to where the reader can try it |
| `<Badge>`, `<Kbd>`, icons, emoji components | Plain or inline-code text |
| Code fence titles/highlights (`title="x"`, `{1-3}`, `showLineNumbers`) | Language only; filename goes in the sentence before the block |
| ```` ```npm ```` (package-manager tabs) | ```` ```bash ```` with the `npm` command |
| Admonition variables, `{props.x}`, JSX expressions | Write out the value |
| Mermaid diagrams | Keep as a ```` ```mermaid ```` code block (shown as code, not a diagram) and list it in the PR |
| Footnotes | Inline parentheses |
| Task lists `- [ ]` | Plain list items |

## Links and assets

- Rewrite internal links to `/docs/<new-slug>` (with `#anchor` where present) and confirm each target exists in the port.
- Links to generated pages you skipped (e.g. API reference): point to their current live URL as an absolute `https://` link.
- Images in the repo (`/images/x.png`, `./img.png`): FrontLit cannot publish repo binaries. Use the image's current public `https://` URL from the live site. If none exists, keep the alt text as a sentence and list the image in the PR description for the user to upload.

## Things to report in the pull request

- Generated or skipped pages, with their current URLs.
- Widgets removed and tabs flattened, per page.
- URLs that could not be kept, old → new.
- Images that need uploading.
