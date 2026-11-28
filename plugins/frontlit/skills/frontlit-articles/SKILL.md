---
name: frontlit-articles
description: Write, edit, publish or update blog posts (articles) on a FrontLit website through the FrontLit MCP connection. Use when the user wants to draft a new blog post or article, revise or republish an existing one, set its excerpt, slug or featured image, or improve a post's SEO and social cards. Not for docs (use frontlit-docs) or landing pages, including the /blog page itself (use frontlit-pages).
---

# FrontLit Articles

FrontLit blog posts ("articles") live in FrontLit itself, not in Git: you create and edit them through the FrontLit MCP tools, and they render at `/blog/<slug>` and in the `/blog` feed. Every article has a **draft** and a **published** version. `create_article` and `update_article` change only the draft; nothing reaches readers until `publish_article`. Your job is to write a post worth reading, give it a clean slug and complete SEO, and publish only when the user says so.

Read these as needed:

- `references/mcp.md`: each article and media tool, its arguments, and what it returns. Read before the first tool call.
- `references/markdown.md`: what the `markdown` body supports, rich blocks, and how to edit a post without losing changes. Read before writing a body.
- `references/featured-image.md`: making and uploading a 1200×630 featured image (TUS upload, `register_media`, `update_article`). Read when the post needs a featured image.

## Connect first

These tools come from the FrontLit MCP connection. The Claude Code and Codex plugins bundle it (sign in with `/mcp` or `codex mcp login frontlit`); otherwise see `references/mcp.md`. Tool names may carry a host prefix; discover them and read their schemas rather than guessing. Without the connection, you can still draft the post as a local Markdown file and tell the user it isn't in FrontLit yet.

## Workflow

1. **Pick the team.** Call `list_teams` and use the team the user named. If there are several and it's unclear which, ask. Never guess. Pass its `teamId` to every call after this.
2. **Read what exists.** `list_articles` (use `q` to search) shows titles, slugs and status. Open one or two recent published posts with `get_article` to match tone, length and structure, and to make sure the topic isn't already covered. `get_article` output can be large; see "Reading articles" in `references/mcp.md`.
3. **Agree on the angle** if the request is vague: reader, the one thing they should take away, and the call to action.
4. **Write the body locally** as Markdown (`references/markdown.md`) and keep that file: it's your source for later edits.
5. **Create the draft with a slug-shaped title** (see "Slug" below): `create_article({ teamId, title: "<slug words>", markdown })`. Check the returned `slug`.
6. **Set the real headline, excerpt and image** with `update_article({ teamId, documentId, title, excerpt, featuredImage })`. This writes the draft only.
7. **Review.** Read back the fields you set (`get_article`, filtered), run the checklist below, and show the user the title, slug, excerpt and a summary or the full text. If the result has `publishable: false`, fix what `diagnostics` reports.
8. **Publish only when asked:** `publish_article({ teamId, documentId })`. "Write a post" means a draft; "publish it" or "make it live" means publish. After publishing, report the URL (`https://<site>/blog/<slug>`).

To fix a published post, `update_article` then `publish_article` again (with the user's go-ahead). `discard_article_draft` drops unpublished draft changes and returns to the live version; `delete_article` removes the post permanently. Both are destructive, so confirm first.

## Slug

<!-- Update this section when the MCP article tools gain a slug field. -->
**Current behavior:** FrontLit derives the slug from the title when `create_article` runs and never regenerates it. Changing the title later doesn't change the slug, and the MCP tools have no slug field yet. (The user can change the slug in the FrontLit editor.)

So:

- Create the article with a **short keyword title** that yields the slug you want: 3–5 lowercase words, the post's main search term, e.g. `title: "postgres connection pooling"` → `postgres-connection-pooling`. Leave out apostrophes and other punctuation (`don't` becomes `don-t`), dates and filler words.
- Then set the real headline with `update_article({ title })`.
- If a draft already has a long or awkward slug, ask the user to fix it in the FrontLit editor, or recreate the draft (and delete the old one, with their consent) before publishing.
- **Never publish with a bad slug.** Changing a slug after publishing breaks every link already shared.

## SEO and social cards

- **Title:** the published page's `<title>` is the article title plus ` | <Site name>`. Keep the whole thing within about 60 characters, so the headline itself is usually 40–50. Put the main keyword near the start.
- **Excerpt:** used as the meta description and the social card text. Aim for 140–160 characters: what the reader gets, in plain words. `create_article` has no excerpt field; set it with `update_article`. Don't leave it empty.
- **Featured image:** upload a 1200×630 PNG or JPG (FrontLit stores it as WebP at the same size), used for Open Graph and X large cards. Without one, cards fall back to the site logo. See `references/featured-image.md`.
- **Indexing:** published posts are indexable and appear in the sitemap. Drafts are not public.
- **Headings:** the title is the H1. Use `##` for sections and `###` under them; never skip a level, including inside Steps and Tabs blocks. No `#` in the body.
- **Long-tail questions:** an FAQ section near the end, as `<Accordions>` with one `<Accordion title="…">` per real question, helps search and AI answers.
- **Links:** link to related posts, docs and product pages with descriptive anchor text. Check that each one resolves.

## Known issues

- Links in the Markdown body currently render with `target="_blank"` and `rel="noopener noreferrer nofollow"`, including internal links. This is a FrontLit server issue being fixed. Write normal Markdown links; don't work around it.
- Passing `featuredImage.mediaId` to `update_article` is currently stored incorrectly. Send only `url`, `thumbnail` and `alt` (see `references/featured-image.md`).

## Before publishing

- [ ] The slug is short, readable and final.
- [ ] The title plus ` | <Site name>` is about 60 characters or less.
- [ ] The excerpt is set, 140–160 characters, and reads well on its own.
- [ ] A 1200×630 featured image with alt text is set (or the user is fine with the logo card).
- [ ] Headings go `##` → `###` without skipping; no `#` in the body.
- [ ] Every link resolves; the call to action points to a real page.
- [ ] No placeholder text, invented facts, prices or quotes.
- [ ] `publishable` is not `false`.
- [ ] The user approved publishing.
