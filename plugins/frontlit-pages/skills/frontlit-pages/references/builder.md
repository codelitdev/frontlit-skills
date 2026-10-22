# Pages in the visual builder

Use this when the site's pages are edited in FrontLit's browser builder (the repository isn't connected for pages). The blocks, writing and design guidance in `blocks.md`, `writing.md` and `design.md` apply unchanged; this file covers what's different about working in the editor.

## Ground rules

- **Everything stays a draft. Never publish, unpublish or delete a published page unless the user explicitly asks.** SEO settings and theme drafts also go live on Publish.
- **Never click a media "Remove" button** (it permanently deletes the file, even if a live page uses it). **Never apply a theme (✓ / "Use") unless asked** (it restyles the whole site).
- **Switch to the right team first** (below, FrontLit #104).
- **Only true content.** Don't invent customers, logos, numbers, quotes, prices or legal text.
- **Fonts:** prefer the theme's fonts. A font service link in an embed works, but it slows every page (PageSpeed); if the site needs another face, set it in the theme. No third-party scripts in embeds.
- **Review before publishing:** send desktop and mobile screenshots (light and dark) plus a change list, and wait. Report builder quirks to whoever maintains FrontLit.

## Workflow

1. **Orient.** Open the right team and site; list the existing pages, header, footer and theme. Ask which page to work on, its slug, and the one action it should drive.
2. **Theme.** If the product has a design system and the user wants the site to match it, map its tokens (`theme-from-design-system.md`). Don't invent per-section colours.
3. **Plan** the page (`writing.md`), then pick a style and section rhythm (`design.md`).
4. **Build with blocks first** (`blocks.md`): set every visible text (unset fields show demo copy), one H1 (the hero), a CSS id on linked sections.
5. **Embeds** only for what blocks can't do. Follow `embeds.md`, run `scripts/test-embed.mjs`, look at every screenshot, then paste.
6. **SEO** under **Edit SEO settings**: title 50–60 characters, description 120–160, search engine visibility on unless private, social card 1200×630. For articles, the Excerpt is the description.
7. **Review** with the visual QA in `design.md`, send screenshots and wait.
8. **Publish only when told,** then check the live page at 1280 and 390 px in both modes, including interactive embeds.

Labels below are FrontLit's at the time of writing. If a label differs, look for the nearest equivalent, and report the change (see "Reporting quirks").

## Before you start

- **Check the team.** The dashboard often opens on another team the user belongs to. A page URL under the wrong team shows "Page not found" instead of offering to switch (FrontLit #104). Switch to the site's team first (the team switcher in the dashboard), then open the site's pages.
- Note which pages already exist and what's published. Everything you change stays a **draft** until someone clicks **Publish**.

## Pages

- **New pages automatically get the site Header and Footer.** These are shared blocks: editing them changes every page. The Footer has **Link Columns**, **Copyright** and a **color-mode toggle**.
- The **top bar** has:
  - **Preview device** (Mobile / Tablet / Desktop)
  - **Edit theme**
  - **Edit SEO settings**:
    - Search results: **Title**, **Description**, **Search engine visibility**
    - **Social card image**: 1200×630; choose one or paste a URL
  - **Add a new block to the page**
- **Blocks:** click a block's outer area to open its settings. Clicking inside rich text or an embed may not open them. The block toolbar has **Move up**, **Move down** and **Delete**. Delete asks for confirmation ("Delete <block>?") and removes the block from the draft only.
- **Section background:** block settings → **Background**: Color / Image / Pattern.
  - Pattern has **Presets** (Tiles, Glows), **Custom CSS** (Light mode / Dark mode) and **Advanced** (size, position, repeat, mask).
  - Every block also has padding, width and a CSS id (anchor).
- **Embed block:** **Type** is **URL** or **Script / iframe snippet**, the content goes in **Snippet**, and **Aspect ratio** should usually stay **Default (fit content)**.
  - In the editor a transparent overlay covers the embed, so its tabs and buttons can't be clicked there (#110). Test them locally; see `embeds.md`.

## Rich text and articles

- **Pasting raw Markdown produces a code block,** not formatted text. Convert Markdown to HTML first (any Markdown converter), then paste it as HTML. From a script, dispatch a `paste` `ClipboardEvent` whose `clipboardData` has `text/html`. By hand, copy the rendered HTML from a browser tab.
- **Links:** select the text and use the toolbar's **Insert link** button. **Ctrl/Cmd+K doesn't open the link dialog.**
- **Articles (blog posts) have Title and Excerpt only. There's no SEO field;** the excerpt is the search and social description, so write it like a meta description (120–160 characters). Pages have **Edit SEO settings** instead.
- **Legal pages (terms, privacy):** see the Legal row in `writing.md`. Publish terms and privacy together so they never contradict each other.

## Big snippets and copying

- **There's no character limit:** snippets of ~71k characters paste and save fine.
- Copy reliably from a **local helper page** with a Copy button, rather than from a terminal or an editor that might wrap or alter the text:

  ```html
  <!doctype html><meta charset="utf-8"><title>Copy snippet</title>
  <button id="c">Copy</button> <span id="s"></span>
  <textarea id="t" style="width:100%;height:80vh">PASTE OR LOAD SNIPPET HERE</textarea>
  <script>
  c.onclick = async () => { await navigator.clipboard.writeText(t.value); s.textContent = t.value.length + " characters copied"; };
  </script>
  ```

  Generate it with the snippet inlined (escape `</textarea>`). Open it via `file://` or `localhost`, click **Copy**, and paste into **Snippet**. Compare the character count with the source file.

## Driving the UI from automation (until there's an API)

Prefer the FrontLit MCP tools (`list_pages`, `get_page`, `update_page`…) or Git sync (the rest of this skill) when available. When you must drive the builder:

- **Inputs** are React-controlled. Set the value with the native setter, then fire events:

  ```js
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  ```

  Use real clicks for Save, Done and Publish-adjacent buttons.
- **Rich text (TipTap):**
  - To replace content, select an explicit DOM range over the editor's content, then paste a `ClipboardEvent` with `text/html`. "Select all" may not select everything.
  - To change one phrase, select just that text node and use `insertText`, so the surrounding formatting survives.
  - Wait ~2 s after an edit before clicking **Done**, or the change can be lost.
- **Reloads drop helper functions you injected;** reinstall them. After any reload, check that each change persisted.
- **Never click the media library's "Remove".** It deletes the file permanently, even if a published page uses it.
- **Never click the header logo in the canvas.** It can navigate away from the editor.
- **Never click a theme's ✓ / "Use" unless asked.** It applies the theme to the whole site; see `theme-from-design-system.md`.

## Review without a draft preview link

There's no shareable draft preview URL yet (FrontLit #103), and the editor canvas isn't the live render: embeds are overlaid, and theme colours such as `--primary` can differ in the preview. So:

1. Test every embed locally with `scripts/test-embed.mjs` (1280 / 390, light / dark, shadow root).
2. Take screenshots of the page in the builder at desktop and mobile (Preview device), in light and dark where possible.
3. Send them to the user with the list of changes, and wait for approval.
4. **Publish only when told.** Then open the live URL at 1280 and 390 in both modes, click through tabs and links, and confirm.

## Reporting quirks

Keep a short log of anything surprising: wrong team, paste behaviour, an overlay, missing settings, labels that changed. Report it to whoever maintains FrontLit, with steps and screenshots.

Known so far:
- **#104:** a page URL under the wrong team shows "Page not found" instead of offering to switch.
- **#103:** there's no draft preview link.
- **#110:** embed snippets can't be interacted with in the editor.
- Ctrl+K doesn't open the link dialog.
- Pasted Markdown becomes a code block.
- The editor preview's `--primary` differs from the live theme.
