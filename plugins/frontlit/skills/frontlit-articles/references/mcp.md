# FrontLit MCP tools for articles

Discover the tools available in the current client; their names may have a host/plugin prefix. Inspect the exposed input schemas rather than inventing tool names or arguments. The deployed schema is authoritative over this page.

Every team-scoped tool takes a `teamId` from `list_teams`. It's optional only when the user belongs to a single team. Use only a team the user named, and ask when it's ambiguous.

## Article tools

| Tool | Arguments | Notes |
| --- | --- | --- |
| `list_articles` | `q?`, paging | Summaries only: `documentId`, `title` (draft), `slug`, `status` (`draft`, `published`, `published_with_changes`), `publishedAt`, `updatedAt`. No bodies. |
| `get_article` | `documentId` | The full article: draft fields (`draftTitle`, `draftContent`, `draftExcerpt`, `draftFeaturedImage`) and published fields (`title`, `content`, `excerpt`, `featuredImage`), plus `publishable` and `diagnostics`. Bodies are TipTap JSON. |
| `create_article` | `title` (required), `markdown` or `content`, `featuredImage?`, `meta?` | Creates a draft. The slug is derived from `title` here and not regenerated later. No `excerpt` field. |
| `update_article` | `documentId`, any of `title`, `markdown` or `content`, `excerpt`, `featuredImage` (object or `null`), `meta` | Writes the draft only. A body you send replaces the whole draft body; there is no patch. |
| `publish_article` | `documentId` | Copies the draft into the published fields. Live immediately. Only when the user asked. |
| `discard_article_draft` | `documentId` | Resets the draft to the published version. Destructive: confirm first. |
| `delete_article` | `documentId` | Permanent. Confirm first. |

Send `markdown` or `content` (TipTap JSON), never both. Prefer `markdown`. Invalid Markdown returns structured diagnostics with line numbers; fix the lines it names and resend.

## Media tools

| Tool | Use |
| --- | --- |
| `get_media_upload_signature` | Returns `{ signature, endpoint }` for a direct upload to MediaLit. Short-lived: get a new one per upload. |
| `register_media` | `mediaLitId` (from the upload), `alt?`, `caption?`. Makes the upload permanent and adds it to the team's media library. Returns `{ mediaId: "med_…", url, thumbnailUrl, … }`. |
| `list_media`, `get_media`, `update_media`, `delete_media` | Browse, read, change alt/caption, or delete library items. Reuse an existing image before uploading a duplicate. |

The full upload flow is in `featured-image.md`.

## Reading articles

`get_article` returns both draft and published TipTap JSON, which can exceed the client's tool output limit. When the client saves a large result to a file, read only the fields you need with `jq` instead of opening the whole file:

```bash
jq '{draftTitle, slug, status, draftExcerpt, draftFeaturedImage, publishable, diagnostics}' result.json
jq -r '.draftContent | .. | .text? // empty' result.json | head -50   # draft text, roughly
```

To check a post's tone, `list_articles` plus one `get_article` is usually enough.

## When the tools are unavailable

Draft the post as a local Markdown file with its proposed title, slug words and excerpt, and tell the user it isn't in FrontLit yet. To connect:

- **Claude Code / Codex plugin:** the plugin bundles the connection; sign in with `/mcp` or `codex mcp login frontlit`.
- **Standalone skill in Claude Code:** `claude mcp add --transport http frontlit https://api.frontlit.app/mcp`, then `/mcp`.
- **Standalone skill in Codex:** `codex mcp add frontlit --url https://api.frontlit.app/mcp`, then `codex mcp login frontlit`.

Article work needs the `articles:read` / `articles:write` scopes, and image upload `media:write`. Respect a denied scope and report what's pending.

Source contract: FrontLit `apps/api/src/mcp/tools/documents.ts` (the shared create/list/get/update/publish/discard/delete tools) and `media.ts`, plus `packages/api-contract/src/schemas/media.ts`. Recheck these when the MCP contract changes.
