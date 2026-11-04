# Porting from other docs frameworks

Goal: same content, same order, same URLs, valid FrontLit Markdown. Change syntax, not wording. FrontLit supports Fumadocs-style rich blocks natively (see `format.md`), so a Fumadocs port keeps most components as they are; MediaLit's port is the reference.

## Navigation → sections

| Source | Where navigation lives | FrontLit |
| --- | --- | --- |
| Fumadocs | `meta.json` (`pages`, `---Group---` separators, `title`). Either a flat folder with separators, or one folder per group with its own `meta.json` | Flat with separators: each group → a folder + `_sections.json` entry. Folder per group: each top-level folder is already a section; its `meta.json` `title` → section `name`, and the root `meta.json` `pages` order → section `order`. Array order → `nav_order`. Folders deeper than one level stay in the URL |
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

Delete all `import`/`export` lines first. Then convert per component. **Keep a supported rich block as a rich block** (it renders better than a flattened substitute); rewrite only what the table says.

| Source | FrontLit |
| --- | --- |
| `<Callout type="warn">` (Fumadocs), `<Warning>`, `<Note>`, `<Tip>`, `:::warning`, `> [!NOTE]` | `<Callout type="warning">`. Map types to `note`, `tip`, `info`, `warning`, `danger`: Fumadocs `warn` → `warning`, `error` → `danger`, `idea` → `tip`; Mintlify/Docusaurus `Check`/`success` → `tip`, `caution` → `warning`. Keep `title`. Drop a Callout `icon` prop |
| `<Tabs items>`/`<Tab value>` (Fumadocs) | Unchanged. Drop `groupId`, `persist`, `updateAnchor`, `defaultIndex` props, which are not accepted. Docusaurus/Mintlify `<TabItem label>` → `<Tab value>` |
| `<Steps>`/`<Step>` | Unchanged. Mintlify `<Steps><Step title="X">` → `<Step>` with `### X` as its first line |
| `<Cards>`/`<Card title href icon>` | Unchanged. `icon` must be a Lucide name: `icon={<BookOpen />}` is accepted as is; other icon expressions or image props (`img`, `horizontal`) → drop. External `href` must be a safe URL |
| `<Accordions>`/`<Accordion title>`, Mintlify `<AccordionGroup>`/`<Accordion>`, `<details><summary>` | `<Accordions>` containing `<Accordion title="…">`; a lone `<details>` is wrapped in `<Accordions>` too |
| `<CodeGroup>`, Fumadocs `<Tabs groupId>` of code-only tabs | `<CodeGroup>` holding fences with `title="…"` (one per tab). It may contain **only** code blocks, so tabs with prose stay `<Tabs>` |
| Package-manager fences (```` ```package-install ````, `npm2yarn`, Docusaurus `<Tabs groupId="npm2yarn">`) | `<CodeGroup>` with `bash title="npm"`, `pnpm`, `yarn`, `bun` fences, each with the right command |
| `<TypeTable type={{…}}>` (Fumadocs), `<ParamField>`, `<ResponseField>` | `<TypeTable>` with literal rows. Convert non-string `default` values to strings, drop other keys (`typeDescription`, `deprecated`, `id`, `link`), and use `required: true` for required rows. For rich descriptions or more than a handful of columns, use a Markdown table (no alignment) |
| `<Frame>`, `<img>`, `<Image>`, `![](…)` | `![alt](https://…)` |
| `<Video>`, `<iframe>`, embeds | A link: `[Watch the demo](https://…)` |
| Live/interactive widgets (uploaders, playgrounds, editors, sandboxes, `<…Demo />`) | Not supported (unknown component). Remove; add a sentence linking to where the reader can try it, and list each in the PR |
| `<Badge>`, `<Kbd>`, icons, emoji components | Plain or inline-code text |
| Code fence meta (`{1-3}`, `showLineNumbers`, `twoslash`) and inline highlight markers (`// [!code highlight]`, `// [!code ++]`) | Language, plus `title="…"` if the source had one; delete the markers (they would otherwise stay as literal comments) |
| Fumadocs `<include>`, `<auto-type-table>`, `<Mermaid>` | Inline the included text; type tables → `<TypeTable>`/table; mermaid → ```` ```mermaid ```` block (shown as code), list it in the PR |
| Admonition variables, `{props.x}`, JSX expressions | Write out the value |
| Footnotes | Inline parentheses |
| Task lists `- [ ]` | Plain list items |

Prose that merely contains `<` and a letter (`Array<string>`, `<your-key>`, `<TSettings>` in a sentence) is not a component: wrap it in backticks.

After converting, put a blank line after every opening tag and before every closing tag, and keep tags on their own lines. Components may not appear inside a sentence.

## API reference

FrontLit generates the API reference from an OpenAPI spec; do not port generated pages or `<APIPage>` files.

- **Fumadocs-OpenAPI** (`openapiSource`, `createOpenAPI`, `<APIPage>`, a folder holding only `meta.json`): the folder is the mount. Find the spec (a committed `.json`/`.yaml` file, or a URL such as `https://api.example.com/openapi.json`).
- FrontLit needs a **committed** OpenAPI 3.0/3.1 single-file spec (≤ 5 MiB, ≤ 500 operations, no external `$ref`s, JSON or YAML) at a repository path. A spec that is only generated at build time or served from a URL must be committed first (usually a CI step or a one-off export).
- Set the **spec path** and **URL path** in the integration settings (Settings → Integrations → GitHub) or with the MCP API-reference tools (`mcp.md`). Use the old mount name as the URL path (default `api-reference`) to keep `/docs/api-reference/…`. Operation slugs come from `operationId`, else `summary`, else method + path, so URLs may differ from fumadocs-openapi's; list old → new in the PR.
- The URL path is reserved: no Markdown page may sit under it, so do not port that folder's pages.
- **The whole spec becomes public**, including `/openapi.json`, even in a private repository; say so in the PR. Hide operations with `x-internal: true` (or `x-excluded: true`).
- The playground calls the API from the browser, so the API must allow the docs origin through CORS; report it if unsure.
- Links in docs to an operation use `/docs/<mount>/<operation-slug>`; the checker cannot verify them, so confirm each against the generated page.

## Redirects and domains

Old docs on another host (e.g. `docs.example.com`) can be redirected to the FrontLit docs by the team in FrontLit, or per path with `redirects` in `site.json` (`frontlit-pages` skill). Do not change DNS or retire the old site yourself; list the redirects the user needs.

## Links and assets

- Rewrite internal links to `/docs/<new-slug>` (with `#anchor` where present) and confirm each target exists in the port.
- Links to generated pages you skipped (e.g. API reference): point to their current live URL as an absolute `https://` link.
- Images in the repo (`/images/x.png`, `./img.png`, `/screenshots/x.png`): FrontLit cannot publish repo binaries (a local image path fails with `UNMANAGED_BINARY`). Use the image's current public `https://` URL from the live site. If none exists, upload it to the team's FrontLit media library (MediaLit) when asked and you have access, else keep the alt text as a sentence and list the image in the PR description for the user to upload. Prefer stable, unsigned URLs.

## Things to report in the pull request

- Generated pages and how they were handled (API reference spec path and URL path, or skipped), with their current URLs.
- Widgets removed, and tabs or components that could not be kept, per page.
- URLs that could not be kept, old → new.
- Images that need uploading.
