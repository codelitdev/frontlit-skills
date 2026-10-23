# FrontLit MCP routing and connection

Read this for website branding, builder-owned page tools, or live Git status. Discover the tools available in the current client; their names may have a host/plugin prefix. Inspect the exposed input schemas rather than inventing tool names or arguments.

## Website branding versus page titles

The dashboard's **Website → Branding → Site title** is the website-wide branding title (sometimes described as `website.branding.title`). FrontLit's current MCP exposes it as the flat `title` field on team settings, not a nested `website` or `branding` object. It is separate from a page's SEO `title`, its internal `name`, and the hero heading. Changing one does not rename the others.

For “Set the site title to John's Piping Pizza”:

1. Confirm the connection targets the intended FrontLit team. OAuth chooses/binds the team during authorization; do not infer it from a repository name or send an invented team override.
2. Call `get_team_settings({})` to read the current branding.
3. Call `update_team_settings({"title": "John's Piping Pizza"})`. Send only requested fields; `subtitle` and `logo` are also supported branding fields. Preserve omitted settings and do not include code-injection fields in a branding edit.
4. Read `get_team_settings({})` again and confirm the saved `title`. Report website branding as updated only after a successful write and readback.

Branding saves directly to team settings, outside page drafts and Git releases. Do not call `publish_page` for branding. If the user asked only for a draft or proposed change, prepare the intended branding patch without executing that live settings write. A Git commit or PR cannot complete a branding update.

## Page and Git operations

| Goal | Tools and constraints |
| --- | --- |
| Discover publishing ownership | `get_documentation_github({})`; `binding.root` is the site folder and `binding.pagesDirectory` identifies Git-managed landing pages. `binding.docsEnabled` is independent. |
| Branding for the local preview | `get_team_settings({})` only (read-only); copy `title`, `subtitle` and `logo.url` into the gitignored `preview.context.json` (see `SKILL.md` step 3). Never call `update_team_settings` for this. |
| Read a builder-owned page | `list_pages` to find its ID, then `get_page({"pageId": "…"})`. Read the existing full layout before changing it. |
| Change a builder-owned page's SEO | `update_page` accepts `title`, `description` and `robotsAllowed` and saves the page draft. It does not accept `socialImage`; use the builder for that field. `name` is the internal page name, not website branding. See `seo.md`. |
| Change builder-owned page blocks | `update_page` with the page ID and revised layout. Rich text uses TipTap JSON here; Git page JSON uses Markdown. |
| Publish a page | `publish_page({"pageId": "…"})` only when the user asked to publish. For Git-managed pages, use the repository/PR workflow instead. |
| Inspect docs Git failures | `list_documentation_github_checks` / `get_documentation_github_check`; these reports concern docs and may redact diagnostic prose. Use available GitHub annotations for missing details. |
| Verify docs Git publication | `get_documentation_github`; compare `binding.observedSha`, `validatedSha` and `liveSha`. A validated commit is not necessarily live. These fields describe docs sync; use pages preview/release status for landing pages. |

A Git-ownership error means switch to the owning files. Do not disconnect sync to make a tool write succeed. Team branding still uses settings tools independently of Git ownership. A failed write, missing permission or unavailable tool is not a reason to modify a different setting.

## When the tools are unavailable

For a Git page edit, continue with the files and bundled checker. For a branding edit, explain the specific missing capability: “The website name lives in FrontLit branding. Connect FrontLit so I can change it, or set it under Website → Branding → Site title.” Do not prompt to install MCP for unrelated file work.

Remote endpoint: **`https://api.frontlit.app/mcp`**, using Streamable HTTP. OAuth-capable clients discover authentication from the endpoint; the user signs in and selects the team. Read/write scopes are separate: branding needs `settings:read` and `settings:write`, while page work needs the appropriate `pages:read` / `pages:write` scopes. Respect a denied connection or insufficient scope and report the pending operation.

- **Claude Code plugin installation:** the plugin bundles `.mcp.json`. Check `/mcp` and authenticate the bundled FrontLit connection; do not add another one manually.
- **Standalone skill in Claude Code:** offer `claude mcp add --transport http frontlit https://api.frontlit.app/mcp`, then `/mcp` to authenticate.
- **Standalone skill in Codex:** offer `codex mcp add frontlit --url https://api.frontlit.app/mcp`, then `codex mcp login frontlit`. If the client asks for scopes, select those needed for the task.
- **Other clients:** add the same HTTPS endpoint in their remote MCP connection settings and complete OAuth.

Connection configuration does not authenticate a user or prove tools are callable. Re-discover the needed tools after connecting. Do not store API keys or OAuth tokens in skills, plugin manifests or repository files; use the client's credential configuration for API-key clients.

Source contract: FrontLit `apps/api/src/mcp/tools/settings.ts`, `pages.ts`, `documentation-github.ts`, `mcp/policy.ts`, and `packages/api-contract/src/schemas/settings.ts`. Recheck these when the MCP contract changes.
