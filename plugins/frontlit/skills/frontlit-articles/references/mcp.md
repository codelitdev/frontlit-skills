# FrontLit MCP tools for articles

Discover the tools available in the current client; their names may have a host/plugin prefix. Inspect the exposed input schemas rather than inventing tool names or arguments. The deployed schema is authoritative over this page.

Every team-scoped tool takes a `teamId` from `list_teams`. It's optional only when the user belongs to a single team. Use only a team the user named, and ask when it's ambiguous.

## Article tools

| Tool | Arguments | Notes |
| --- | --- | --- |
| `list_articles` | `q?`, paging | Summaries only: `documentId`, `title` (draft), `slug`, `status` (`draft`, `published`, `published_with_changes`), `publishedAt`, `updatedAt`. No bodies. |
| `get_article` | `documentId` | Draft metadata (`draftTitle`, `draftExcerpt`, `draftFeaturedImage`, `draftMeta`, `draftVersion`), published metadata, `status`, `publishable` and `diagnostics`, plus `draftMarkdown`: the draft body as editable Markdown, also returned verbatim as its own text block. No published body. |
| `create_article` | `title` (required), `markdown` or `content`, `featuredImage?`, `meta?` | Creates a draft. The slug is derived from `title` here and not regenerated later. No `excerpt` field. |
| `edit_article` | `documentId`, `edits: [{ old_str, new_str }]` | Changes part of the draft body with exact replacements on `draftMarkdown`, without resending it. Applied in order, all or nothing; each `old_str` must match exactly once. Replies with `status`, `draftVersion` and `diagnostics` only. See "Editing a body" below. |
| `update_article` | `documentId`, any of `title`, `markdown` or `content`, `excerpt`, `featuredImage` (object or `null`), `meta`, `expectedDraftVersion?` | Writes the draft only. A body you send replaces the whole draft body: use it for metadata and full rewrites, `edit_article` for changes. Pass `expectedDraftVersion` (from `get_article`) to refuse the write if someone saved since. |
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

`get_article` returns the draft body as Markdown (`draftMarkdown`), in the same format you write (`markdown.md`). A block Markdown can't express exactly, such as an image resized in the editor or a table with merged cells, appears as a fenced `tiptap` block holding its JSON:

````markdown
```tiptap
{"attrs":{"alt":"Team","src":"https://…/team.png","width":320},"type":"image"}
```
````

Leave those blocks as they are unless you mean to change them; you can edit text inside the JSON with `edit_article` too. Don't send them back through `update_article`'s `markdown` field, which doesn't accept them.

To check a post's tone, `list_articles` plus one `get_article` is usually enough.

## Editing a body

Read with `get_article`, then send only what changes:

```json
{"documentId": "doc_…", "edits": [
  {"old_str": "we recomend", "new_str": "we recommend"},
  {"old_str": "## Pricing\n\nPlans start", "new_str": "## Pricing\n\nAll plans include SSO. Plans start"}
]}
```

- Copy each `old_str` exactly from `draftMarkdown`, with enough surrounding text to match once. To insert, repeat nearby text in `old_str` and `new_str`.
- `EDIT_NOT_FOUND`: the text isn't there (typo, different whitespace, or someone changed it). Read again.
- `EDIT_AMBIGUOUS` (with `matches`): include more surrounding text.
- Diagnostics with line numbers: the edited Markdown is invalid; nothing was saved.
- `STALE_DRAFT`: someone saved at the same moment. Read again and retry.

Someone with the post open in the FrontLit editor sees your change when they return to the tab, or gets a "changed elsewhere" prompt if they had unsaved edits, so you won't silently overwrite each other.

## When the tools are unavailable

Draft the post as a local Markdown file with its proposed title, slug words and excerpt, and tell the user it isn't in FrontLit yet. To connect:

- **Claude Code / Codex plugin:** the plugin bundles the connection; sign in with `/mcp` or `codex mcp login frontlit`.
- **Standalone skill in Claude Code:** `claude mcp add --transport http frontlit https://api.frontlit.app/mcp`, then `/mcp`.
- **Standalone skill in Codex:** `codex mcp add frontlit --url https://api.frontlit.app/mcp`, then `codex mcp login frontlit`.

Article work needs the `articles:read` / `articles:write` scopes, and image upload `media:write`. Respect a denied scope and report what's pending.

Source contract: FrontLit `apps/api/src/mcp/tools/documents.ts` (the shared create/list/get/edit/update/publish/discard/delete tools) and `media.ts`, plus `packages/api-contract/src/schemas/media.ts`. Recheck these when the MCP contract changes.
