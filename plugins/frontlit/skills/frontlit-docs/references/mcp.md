# FrontLit MCP for Git documentation

Discover available tools and inspect their current schemas; clients may prefix their names. MCP assists the Git workflow with live state and validation. It does not replace the repository source or authorize publication by itself.

## Source and publishing state

- `get_documentation_github({})` returns the source connection. Read `binding.owner`, `repository`, `branch`, `root` (site folder), `directory` (docs folder), `docsEnabled` and `pagesDirectory`. A configured pages-only connection is not a docs Git connection.
- `get_documentation_settings({})` returns docs `source` (`editor` or `git`), draft version and active publication ID. If docs are editor-owned, do not describe a file edit as synced or live. Configure the requested Git workflow through the dashboard; connecting MCP alone does not enable Git sync.
- `get_documentation_github` exposes `binding.observedSha`, `validatedSha` and `liveSha`. A push, a validation pass and a live publication are different outcomes; report only the state confirmed by the result.

Do not change ownership, pause sync, grant capabilities or connect/disconnect a repository just to bypass a write failure. Some setup/activation tools require the original account's interactive browser consent and cannot finalize through MCP; follow their returned action instead of repeatedly retrying.

## Validate unsaved content

The current tool is `validate_documentation`. Its argument is an `input` object. To validate a proposed document without saving it:

```json
{
  "input": {
    "mode": "document",
    "draft": {
      "title": "Stretch pizza dough",
      "excerpt": "Shape an airy pizza crust by hand.",
      "slug": "pizza-making/stretching",
      "markdown": "Start with rested dough.\n\n## Stretch gently\n\nSupport the dough as you turn it."
    }
  }
}
```

Map frontmatter `description` to `draft.excerpt`; pass the actual Markdown body separately from YAML. Use the resolved slug, not the `.md` filename. The tool validates content against the team's current publication, so new sibling documents or anchors may be absent there. Per-document diagnostics are not a whole-PR manifest verdict. Do not delete correct links merely because unpublished siblings are missing from current live state.

Check `publishable` and diagnostics including `blocksSave` / `blocksPublish`. A successful transport response alone is not a validation pass. Run the bundled file checker for frontmatter and cross-file links; the Git check on the candidate commit remains authoritative. `validate_documentation` publication mode uses saved document IDs and expected versions; do not save drafts just to validate repository files.

`validate_documentation_github_source` can preflight an immutable Git snapshot during an existing authorized GitHub setup workflow. It requires real `setupId`, `installationId`, `repositoryId`, `branch` and site `root`; inspect the schema and use returned setup values. Do not invent IDs or start/reconfigure an integration merely to replace a PR check.

## Diagnose a failed Git check

1. Resolve the PR's current head SHA; a newer user commit may have replaced the head previously checked.
2. Use `list_documentation_github_checks` and `get_documentation_github_check` for FrontLit's docs check status. Diagnostic text may be redacted; retrieve available GitHub check annotations for file/line details when needed.
3. Fix the reported cause and check the rest of the changed files for the same issue. The importer may stop at its first error.
4. After pushing, wait for the new head's docs validation result. If it has not appeared or completed, say it is pending; a passing pages preview is not a passing docs check.

## Connect only when needed

Git authoring and the local checker work without MCP. For a requested live-state operation that needs missing tools, offer to connect FrontLit or use the equivalent dashboard view. Discover existing connections first so a plugin-provided server is not duplicated.

Endpoint: **`https://api.frontlit.app/mcp`**, Streamable HTTP with OAuth discovery. Sign in and select the intended FrontLit team. Documentation reads and validation require `documentation:read`; Git setup/preflight may require additional management permissions exposed by the server. Do not request unrelated write scopes for read-only checks.

- **Claude Code plugin installation:** the plugin bundles `.mcp.json`. Use `/mcp` to authenticate it.
- **Standalone skill in Claude Code:** offer `claude mcp add --transport http frontlit https://api.frontlit.app/mcp`, then `/mcp` to authenticate.
- **Standalone skill in Codex:** offer `codex mcp add frontlit --url https://api.frontlit.app/mcp`, then `codex mcp login frontlit` with the required scopes when requested.
- **Other clients:** add the endpoint in remote MCP settings and complete OAuth.

The user still needs to authenticate and approve access. No secrets belong in the skill or plugin. A missing scope or denied connection leaves the affected live operation pending; continue independent repository work.

Source contract: FrontLit `apps/api/src/mcp/tools/documentation.ts`, `documentation-github.ts`, `mcp/policy.ts`, and `packages/api-contract/src/schemas/documentation.ts` / `documentation-github.ts`. Recheck these when the MCP contract changes.
