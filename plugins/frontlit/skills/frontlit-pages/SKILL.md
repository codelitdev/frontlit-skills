---
name: frontlit-pages
description: >-
  Write, design or edit FrontLit landing pages: as JSON files in a Git repository (`frontlit/pages/*.json` plus `frontlit/site.json` for the header, footer and theme) or in FrontLit's visual page builder. Covers block choice, copy, SEO, high-end section design and backgrounds, site-wide theme creation, and custom Embed snippets. Use when the user wants a new or improved website page across business domains (home, pricing, features, launch, about), wants to change the website name, branding, header, footer, redirects or theme, or wants to move builder pages into the repository. Not for docs (use frontlit-docs).
---

# FrontLit Pages

FrontLit can publish a site's landing pages from a folder of JSON files in the team's GitHub repository (GitHub only; GitLab and others aren't supported). Each file is one page built from FrontLit's blocks (hero, grid, pricing, FAQ…); `site.json` beside the folder holds the header, footer, theme and redirects. Every push to the publishing branch is validated and, if everything passes, published as one release. Your job is to write pages that pass on the first try, look designed rather than templated, and serve the website visitor’s actual purpose. Sites that edit pages in FrontLit's visual builder instead of Git use the same blocks and guidance; see `references/builder.md`.

## Choose the setting and source first

| Request | Setting and source |
| --- | --- |
| Website name, site title, or branding across the website | FrontLit branding; use `get_team_settings` → `update_team_settings` → `get_team_settings`, even when pages are Git-managed. See `references/mcp.md`. |
| One page's search or social metadata | Page JSON SEO fields in Git; builder **Edit SEO settings** or supported MCP `update_page` fields for builder-owned pages. See `references/seo.md`. |
| The heading visitors read on a page | Hero block `settings.title`; this is separate from SEO and branding. |
| Shared navigation, footer, theme or redirects | `site.json` for Git-managed pages; follow builder guidance for builder-owned pages. Branding is stored separately. |

Interpret “site title” or “website name” as branding unless the user identifies a particular page or its SEO. Resolve remaining ambiguity from context, then ask only if the target is still unclear. A branding request must not be substituted with a homepage SEO edit. `site.json` has no branding/title field.

Discover relevant FrontLit tools before declaring MCP unavailable; clients may prefix their names. Installing this skill alone does not connect MCP. For an MCP-only task, read `references/mcp.md`; if the needed tools are unavailable, offer the FrontLit connection or the exact dashboard setting. Continue independent Git work without making MCP a prerequisite for file edits. Report which setting changed and whether it is saved live, a draft, or awaiting Git publication.

Read these as needed:

- `references/format.md`: files, page and `site.json` keys, Markdown, media, links, validation codes and canonical form. **Read before writing any file.**
- `references/blocks.md`: every block, its settings and what it's good for. **Read before choosing blocks.**
- `references/writing.md`: page structure, headings, copy and section recipes.
- `references/seo.md`: page-level title, description, search visibility and social card image; builder, Git and MCP routes. **Read before creating a page or editing page SEO.**
- `references/design.md`: page styles, section variations, page skeletons, hierarchy, rhythm, hero legibility, backgrounds (with `background-presets.json`), logo strips, diagrams and tables. **Read before planning a page**: pick a style first.
- `references/embeds.md`: how `script` embeds run (inline, shadow root), the rules and a template. **Read before writing a snippet**; test it with `scripts/test-embed.mjs`.
- `references/theme.md`: create a coherent, functional site-wide theme in the page builder or `site.json`. **Read before designing or changing a theme; for theme JSON, also read `scripts/schema/site.v1.json` → `properties.theme` before editing.**
- `references/mcp.md`: tool routing, website branding, remote connection and missing-tool handling. **Read for branding or MCP work.**
- `references/builder.md`: working in the visual builder instead of Git: ground rules, workflow, editor quirks, automation. **Read before your first builder edit.**
- `examples/frontlit/`: a valid site folder (home, pricing, a full launch page, `site.json`). Copy from it.

## 1. Find the site folder

1. Look for `site.json` or `pages/*.json` files whose `$schema` is `https://frontlit.app/schema/page.v1.json`. The folder holding `site.json`, `pages/` (and `docs/` if docs are synced) is the **site folder**, `frontlit/` by default. It can also be the repository root.
2. If FrontLit MCP is connected, prefer `get_documentation_github`: inspect `binding.owner`, `repository`, `branch`, `root` and `pagesDirectory`. A docs Git connection does not imply landing pages are Git-managed; a null `pagesDirectory` means pages remain builder-owned.
3. If neither exists, ask the user. Pages only publish once the repository is connected in FrontLit (**Settings → Integrations → GitHub**, with **Landing pages** ticked). For a site that already has pages in the builder, tell the user to use **Export pages** in that dialog: it opens a pull request with every current page, the header, footer and theme in canonical form, which is a better starting point than writing them from scratch.

## 2. Write or edit pages

FrontLit's ICP is SaaS founders; the websites they create can serve any domain. Establish the site's business, visitor intent and visual references before choosing a layout. Use the existing brand and user-supplied competitors as evidence; when the direction is unclear, ask for one or two references while continuing source/content discovery. Domain alone does not determine the style: a restaurant, food publication and cooking course need different treatments. See `references/design.md` for direction and `references/writing.md` for content structure.

1. **Read what's there first:** every file in `pages/`, and `site.json`. Preserve useful content and anchor ids (`cssId`); match the existing visual direction unless the user asks to change it. The folder owns *every* page on the site: a page whose file you delete goes offline, including `blog.json`, `docs.json`, `changelog.json` and `help.json`.
2. **Plan the page** before writing JSON: the domain, visitor purpose, visual direction, available content and section list (see `references/writing.md`). Choose blocks after the composition; use a scoped embed when a distinctive layout cannot reasonably be expressed by native blocks (see `references/embeds.md`).
3. **Write the file** following `references/format.md`:
   - Start with `"$schema": "https://frontlit.app/schema/page.v1.json"`, then `title`, `description`, `layout`.
   - **Set every content setting a block shows** (titles, descriptions, buttons, items, tiers). Unset settings fall back to FrontLit's demo copy ("Run your whole business from one front office"). Use `""` or `[]` to hide something.
   - One H1 per page, normally the hero. A custom composition can own the H1; do not add a redundant hero merely to satisfy the checker. Verify the rendered heading hierarchy when embeds contain headings.
   - Never put a header or footer block in a page; edit `site.json` instead.
4. Header and footer links must point at pages that exist (or the release fails). Adding a page the visitor should find? Add it to `site.json` too.

## 3. Validate and format, then commit

Run the checker bundled with this skill (Node 18+, no dependencies). It is `scripts/check.mjs` in the folder that contains this `SKILL.md`; run it from the repository root with the site folder (or its `pages/` folder):

```bash
node <path-to-this-skill>/scripts/check.mjs frontlit --fix
```

It validates every page and `site.json` against the bundled `page.v1` / `site.v1` schemas and FrontLit's import rules (file names, reserved routes, content feeds, header/footer links, repository images), and warns about demo content, unknown icons, placeholders, heading levels, SEO fields and links. With `--fix`, and only when there are no errors, it then rewrites pages and `site.json` in canonical form (key order, settings equal to a block default dropped, 2-space indent, trailing newline: the form FrontLit writes). One run does both; fix the reported errors, rerun after changes, then commit. For existing sites, add `--changed` to expand warnings only for working-tree changes relative to HEAD, including staged and untracked files; the whole site is still validated and errors are always reported.

- **Fix every error and actionable warning in files you changed.** Verify suspected false positives against the rendered page and document them rather than distorting the design to satisfy a checker limitation. Warnings in files you didn't touch: leave them, and list them in the pull request.
- `DEMO_CONTENT` means a visible setting is unset and the block's demo copy would show. Set it, or `""` / `[]` to hide it.

Schema checks establish import validity, not visual quality. Look at the pages while you edit with FrontLit's local preview (Node 20.19+ or 22.12+; no FrontLit login or backend), run from the repository root:

```bash
npx @frontlit/preview@alpha frontlit
```

It serves every `pages/*.json` at http://127.0.0.1:4310 (`--port` to change) with the real page-builder renderer, fonts, theme and `site.json` chrome, and reloads the browser on every save; invalid files show diagnostics until the next edit fixes them. Use the toolbar to switch pages and light/dark mode, and browser device emulation for 390 px. Branding (site title, subtitle, logo) isn't in the Git site format, so the header shows a placeholder until you add a gitignored `preview.context.json` in the site folder; it can also hold `feeds` fixtures for content-feed routes:

```json
{
  "branding": { "title": "Acme", "subtitle": "Tagline", "logo": { "url": "assets/logo.svg", "alt": "Acme" } },
  "feeds": { "/blog": [{ "title": "First post", "href": "/", "description": "Fixture" }] }
}
```

If the FrontLit MCP server is connected, get the real branding from it instead of asking or guessing: call `get_team_settings({})` (read-only) and copy `title` → `branding.title`, `subtitle` → `branding.subtitle` and `logo.url` → `branding.logo.url` (an `https://` URL the preview loads as is; use the title as `alt`). Skip fields that are null. Without MCP, ask the user for the site name or leave the placeholder; the pages still render. Never commit the file. The local preview renders on the client and doesn't implement article/doc detail routes, redirects, search, chat or production image optimization, and forms only show a local success state. Use it for rapid iteration, `scripts/test-embed.mjs` for isolated embeds, and the FrontLit PR preview as the final whole-site check. On the pull request, the **FrontLit / pages preview** check links to a private preview of the result: open it, look at the page on desktop and mobile, light and dark, and push fixes to the same branch. If you can't open a pull request (no remote, no access), say in your summary that the page hasn't been seen rendered. After merge, problems (file, JSON pointer, message) show in FrontLit's repository dialog; nothing changes on the live site until they're fixed.

## 4. Pull request

- Branch: `pages/<short-topic>`; target the connected publishing branch. Commit message: the same as the PR title.
- Open it with `gh pr create` if the GitHub CLI is available; otherwise push the branch and give the user the GitHub compare link.
- Title: what changed, e.g. `Add pricing page` or `Rework homepage hero and FAQ`.
- Description: pages added or changed with their URLs, `site.json` changes (navigation, footer, redirects), images added, and any checker warnings you left on purpose.
- Remind the user that merging publishes every page in the folder as one release, that `"published": false` pages are merged but stay drafts, and that **Website → Releases** in FrontLit rolls back.

## Pages not in Git

If the repository isn't connected for pages, work in the visual builder and follow `references/builder.md`; blocks, writing, design and embeds guidance is the same. If the FrontLit MCP server is connected, the same applies through its tools: `list_pages`, `get_page`, `create_page`, `update_page` (writes the draft only), `publish_page`. Differences: rich text there is TipTap JSON instead of Markdown, and media are uploaded MediaLit objects. Only call `publish_page` or `delete_page` when the user asks. If a tool answers that the page is managed in GitHub, switch to the files.

## Rules

- Never publish or merge yourself, and never edit pages in the FrontLit builder while the repository owns them: builder edits become pull requests.
- Don't invent facts: prices, customer names, logos, metrics, testimonials, integrations. Use what the repository, existing pages or user give you. When a section can't be written without them, either drop the section or write `[TODO: what's needed]` and set the page `"published": false` (placeholders go live on merge otherwise); list every TODO in the pull request. Short, true copy beats long, padded copy.
- A theme change restyles every page. A request for a site-wide redesign authorizes theme work within that scope; a narrow section edit does not. State the site-wide effect and inspect representative pages.
