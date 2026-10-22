---
name: frontlit-pages
description: Write, design or edit FrontLit landing pages: as JSON files in a Git repository (`frontlit/pages/*.json` plus `frontlit/site.json` for the header, footer and theme) or in FrontLit's visual page builder. Covers block choice, copy, SEO, high-end section design and backgrounds, themes from a product's design system, and custom Embed snippets. Use when the user wants a new or improved marketing page (home, pricing, features, launch, about), wants to change the site header, footer, redirects or theme, or wants to move builder pages into the repository. Not for docs (use frontlit-docs).
---

# FrontLit Pages

FrontLit can publish a site's landing pages from a folder of JSON files in the team's GitHub repository (GitHub only; GitLab and others aren't supported). Each file is one page built from FrontLit's blocks (hero, grid, pricing, FAQ…); `site.json` beside the folder holds the header, footer, theme and redirects. Every push to the publishing branch is validated and, if everything passes, published as one release. Your job is to write pages that pass on the first try, look designed rather than templated, and convert. Sites that edit pages in FrontLit's visual builder instead of Git use the same blocks and guidance; see `references/builder.md`.

Read these as needed:

- `references/format.md`: files, page and `site.json` keys, Markdown, media, links, validation codes and canonical form. **Read before writing any file.**
- `references/blocks.md`: every block, its settings and what it's good for. **Read before choosing blocks.**
- `references/writing.md`: page structure, headings, SEO, copy and section recipes.
- `references/design.md`: page styles, section variations, page skeletons, hierarchy, rhythm, hero legibility, backgrounds (with `background-presets.json`), logo strips, diagrams and tables. **Read before planning a page**: pick a style first.
- `references/embeds.md`: how `script` embeds run (inline, shadow root), the rules and a template. **Read before writing a snippet**; test it with `scripts/test-embed.mjs`.
- `references/theme-from-design-system.md`: map a product's design tokens to `theme` (`scripts/oklch-to-hex.mjs`).
- `references/builder.md`: working in the visual builder instead of Git: ground rules, workflow, editor quirks, automation. **Read before your first builder edit.**
- `examples/frontlit/`: a valid site folder (home, pricing, a full launch page, `site.json`). Copy from it.

## 1. Find the site folder

1. Look for `site.json` or `pages/*.json` files whose `$schema` is `https://frontlit.app/schema/page.v1.json`. The folder holding `site.json`, `pages/` (and `docs/` if docs are synced) is the **site folder**, `frontlit/` by default. It can also be the repository root.
2. If the FrontLit MCP server is connected, `get_documentation_github` returns the connected repository, branch and site folder; prefer it.
3. If neither exists, ask the user. Pages only publish once the repository is connected in FrontLit (**Settings → Integrations → GitHub**, with **Landing pages** ticked). For a site that already has pages in the builder, tell the user to use **Export pages** in that dialog: it opens a pull request with every current page, the header, footer and theme in canonical form, which is a better starting point than writing them from scratch.

## 2. Write or edit pages

1. **Read what's there first:** every file in `pages/`, and `site.json`. Match the existing voice, block choices, section rhythm and anchor ids (`cssId`). The folder owns *every* page on the site: a page whose file you delete goes offline, including `blog.json`, `docs.json`, `changelog.json` and `help.json`.
2. **Plan the page** before writing JSON: the visitor, the one action you want, and a section list (see `references/writing.md`). Pick blocks from `references/blocks.md`.
3. **Write the file** following `references/format.md`:
   - Start with `"$schema": "https://frontlit.app/schema/page.v1.json"`, then `title`, `description`, `layout`.
   - **Set every content setting a block shows** (titles, descriptions, buttons, items, tiers). Unset settings fall back to FrontLit's demo copy ("Run your whole business from one front office"). Use `""` or `[]` to hide something.
   - One H1 per page: the hero. Everything else uses the default H2.
   - Never put a header or footer block in a page; edit `site.json` instead.
4. Header and footer links must point at pages that exist (or the release fails). Adding a page the visitor should find? Add it to `site.json` too.

## 3. Validate and format, then commit

Run the checker bundled with this skill (Node 18+, no dependencies). It is `scripts/check.mjs` in the folder that contains this `SKILL.md`; run it from the repository root with the site folder (or its `pages/` folder):

```bash
node <path-to-this-skill>/scripts/check.mjs frontlit --fix
```

It validates every page and `site.json` against the bundled `page.v1` / `site.v1` schemas and FrontLit's import rules (file names, reserved routes, content feeds, header/footer links, repository images), and warns about demo content, unknown icons, placeholders, heading levels, SEO fields and links. With `--fix`, and only when there are no errors, it then rewrites pages and `site.json` in canonical form (key order, settings equal to a block default dropped, 2-space indent, trailing newline: the form FrontLit writes). One run does both; repeat it until it reports no errors, then commit.

- **Fix every error, and every warning in files you changed** unless the user decided otherwise. Warnings in files you didn't touch: leave them, and list them in the pull request.
- `DEMO_CONTENT` means a visible setting is unset and the block's demo copy would show. Set it, or `""` / `[]` to hide it.

It is a pre-check, not the authority, and there's no local preview. On the pull request, the **FrontLit / pages preview** check links to a private preview of the result: open it, look at the page on desktop and mobile, light and dark, and push fixes to the same branch. If you can't open a pull request (no remote, no access), say in your summary that the page hasn't been seen rendered. After merge, problems (file, JSON pointer, message) show in FrontLit's repository dialog; nothing changes on the live site until they're fixed.

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
- Change `theme` in `site.json` only when asked: it restyles every page.
