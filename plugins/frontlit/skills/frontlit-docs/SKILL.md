---
name: frontlit-docs
description: Write, edit, or port documentation for FrontLit Docs in a Git repository. Use when the user wants to create or improve FrontLit docs pages, or migrate an existing docs site (Fumadocs, Docusaurus, Mintlify, Nextra, GitBook, VitePress, plain Markdown/MDX) into a FrontLit-connected docs folder and open a pull request.
---

# FrontLit Docs

FrontLit publishes docs from a folder of plain Markdown files in a GitHub repository. A merged pull request goes live automatically after FrontLit validates it. Your job is to produce files that pass that validation on the first try and read well.

Read these as needed:

- `references/format.md`: the exact file, frontmatter, Markdown, link and section rules. **Read before writing any file.**
- `references/mcp.md`: current tools for source ownership, unsaved-document validation, Git check reports, connection and scopes. Read when using MCP or diagnosing a remote validation failure.
- `references/porting.md`: the conversion table for other docs frameworks. Read when porting.
- `references/writing.md`: how to write pages that work for readers, search and AI answers.

## Choose Git or MCP

Use repository files for Git-managed docs and `_sections.json`. Prefer connected FrontLit MCP for source discovery, live publication/check status and server validation; discover the actual tool names/schemas first. Installing a skill alone does not connect MCP.

`get_documentation_github` identifies the configured source; `get_documentation_settings` reports docs ownership. A pages-only Git connection does not make docs Git-managed. `validate_documentation` validates unsaved document content; it does not parse a repository YAML frontmatter block or validate the whole Git manifest. Read `references/mcp.md` for the input shape and diagnostics workflow.

MCP is optional for ordinary repository edits: use the bundled checker and PR validation when it is unavailable. Offer a FrontLit connection only when a requested live operation needs it. Website name/logo changes use `get_team_settings` / `update_team_settings` and the `frontlit-pages` branding guidance; changing a docs frontmatter title does not rename the website.

## 1. Find the docs folder

1. FrontLit syncs everything from one site folder (`frontlit/` by default, or the repository root); docs live in its `docs/` subfolder, e.g. `frontlit/docs/`, next to `pages/` and `site.json` (those are the frontlit-pages skill's). Look for that folder, or for `_sections.json` containing `"version": 1`; its folder is the docs folder.
2. If FrontLit MCP is connected, prefer `get_documentation_github`: inspect `binding.owner`, `repository`, `branch`, `root`, `directory` and `docsEnabled`. Use the docs folder only when docs sync is enabled; pages can be Git-managed independently.
3. If neither exists, ask the user which folder FrontLit is connected to. Do not guess, because only that folder is published.

## 2a. Writing or editing docs

1. Read the existing pages in the folder and `_sections.json` to match structure, tone and section names.
2. Write or edit `.md` files following `references/format.md` and `references/writing.md`.
3. Validate (step 3), then commit on a new branch and open a pull request against the connected branch.

## 2b. Porting an existing docs site

1. **Inventory.** Find the source docs (content folder, navigation config such as `meta.json`, `sidebars.js`, `mint.json`, `docs.json`, `_meta.json`, `SUMMARY.md`). Record every page with its current URL, title, description and nav position. Identify the framework and every custom component in use (`grep -ho "<[A-Z][A-Za-z]*" -r <content>` lists them).
2. **Plan.** Map navigation groups to sections (folders + `_sections.json`), and map each page to a target path and `slug`. Keep current URLs where possible: set `slug` to the old path relative to `/docs`. Note generated pages (API references from OpenAPI, changelogs built from code) that have no source file; skip them and report them.
3. **Convert** each page using `references/porting.md`. Change syntax only; keep the author's wording, examples and order. Never invent content to replace a widget; link to it or state what was removed.
4. **Do not modify or delete the old docs site.** The user retires it after checking the result.
5. Validate (step 3), then open one pull request containing all pages and `_sections.json`.

## 3. Validate before opening the pull request

- If connected FrontLit MCP exposes `validate_documentation`, use its unsaved-document mode for changed document bodies and fix the returned diagnostics; see `references/mcp.md`. This complements the file checker; it does not validate Git YAML frontmatter or the complete candidate manifest.
- Run the checker bundled with this skill (Node 18+) for file/frontmatter, route and cross-file checks. It is `scripts/check.mjs` in the folder that contains this `SKILL.md`; run it from the repository root:

  ```bash
  node <path-to-this-skill>/scripts/check.mjs <docs-folder>
  ```

  It catches the common failures (MDX/HTML, unsupported Markdown, bad frontmatter, invalid slugs, duplicate routes, broken internal links and anchors). It is a pre-check, not the authority: the `FrontLit / docs validation` check on the pull request is final. If it fails, read its annotations (and available MCP check reports), fix every reported issue and push to the same branch. Recheck the current PR head after the new remote result completes; a local pass alone does not establish remote success.

## 4. Pull request

- Branch name: `docs/<short-topic>`; target the connected publishing branch.
- Open it with `gh pr create` if the GitHub CLI is available; otherwise push the branch and give the user the GitHub compare link to open it.
- Title: what changed, e.g. `Port docs from Fumadocs to FrontLit` or `Add webhooks guide`.
- Description: pages added/changed, sections, anything skipped or simplified (generated pages, removed widgets, flattened tabs), and URLs that changed.
- Remind the user that merging publishes the pages, and that `published: false` pages are merged but stay private drafts.
