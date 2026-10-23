# Page SEO in FrontLit

The builder's **SEO** panel controls one page's search result and social sharing metadata. It is page level, not a block, and it does not change the visible hero heading or the website-wide branding title. Read this before creating a page or editing its SEO.

## Identify the right fields

| SEO panel | Git page JSON | Purpose |
| --- | --- | --- |
| Search results → **Title** | `title` | Browser tab and search result title for this page. |
| Search results → **Description** | `description` | Summary for search results and link previews. |
| **Search engine visibility** | `robotsAllowed` | On by default; `false` asks search engines not to index the published page. |
| **Social card image** | `socialImage` | Image shown when the page is shared. |

These are top-level page fields in `scripts/schema/page.v1.json`, beside `layout`; they do not belong in a hero or other block's `settings`. The internal page `name`, the hero `settings.title`, the page SEO `title`, and **Website → Branding → Site title** are separate values. FrontLit appends the site name to non-homepage browser titles; the homepage title stands alone. Do not add a manual `| Brand` suffix.

## Write metadata for the actual page

- **Title:** Lead with the page's specific topic or offer. Make it distinct from other pages and understandable out of context. Roughly 50–60 characters is a useful editing target, not a guarantee of how search engines display it; the bundled checker warns above 60.
- **Description:** In one natural sentence, say what the visitor will find or accomplish. Use the page's real terms and claims, not generic sales language. Aim for roughly 120–160 characters; the checker warns when it is missing or above 160. Search engines may generate their own snippet.
- **Visibility:** Keep it on for a public page meant to be found. Turn it off only when the published page should stay out of search, such as a thank-you page. It is an indexing request, not access control. For a Git page that should remain unpublished, use `published: false` instead.
- **Social image:** Use an image that represents this page, with a simple focal point and text that remains legible in a small preview. FrontLit recommends 1200×630. In Git use `socialImage: { "url": "../assets/og-page.png", "alt": "..." }` or an `https://` URL; follow `format.md` for allowed media paths and formats. In the builder, choose or upload an image, or paste an image URL. Check the preview crop.

Never invent prices, metrics, customer names or capabilities in metadata. Keep the title and description faithful to the visible page. When updating an existing page, preserve unrelated SEO fields unless the request or page content calls for changing them.

## Apply through the correct route

- **Builder-owned page:** Open the top bar's **Edit SEO settings** (the SEO panel shown in the editor). Edit Title, Description, Search engine visibility and Social card image. Confirm the draft saves; review the values after reopening the panel. They reach the live page when that page is published.
- **Git-managed page:** Edit the top-level fields in its `pages/<slug>.json`. Read `format.md`, validate the site folder with `scripts/check.mjs`, and inspect the FrontLit pull-request preview. The Git release publishes the page and its metadata together.
- **FrontLit MCP:** For a builder-owned page, `get_page` and `update_page` can read and update `title`, `description` and `robotsAllowed` in the draft. The current `update_page` tool does **not** accept `socialImage`; use the builder for that field. Check the tool's actual input schema before calling it. If the page is Git-managed, edit the file instead.

After publishing, inspect the page's rendered title, description, robots setting and social image. Sharing platforms and search engines can cache earlier metadata, so a correct live page may take time to appear updated elsewhere.
