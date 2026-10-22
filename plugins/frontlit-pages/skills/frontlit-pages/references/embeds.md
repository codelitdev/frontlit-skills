# Embeds: custom HTML, diagrams, tables and widgets

The Embed block has two types. Which one you pick changes how the content runs.

| Type (builder) | `contentType` (JSON) | How FrontLit renders it |
| --- | --- | --- |
| **URL** | `"url"` | An `<iframe src>` with a fixed height (`height`, default 500 px) or an aspect ratio. Use it for third-party players and booking widgets. |
| **Script / iframe snippet** | `"script"` | **Inline in the page, inside an open shadow root.** Not an iframe. Sizes to its content unless you pick an aspect ratio. |

Everything below is about the **snippet** type. It's the way to build what blocks can't express: animated diagrams, data tables, tabbed code samples, logo strips with images.

## How a snippet is rendered

This follows FrontLit's `InlineEmbed` (`packages/page-builder/src/components/inline-embed.tsx`):

- **The markup is server-rendered** into a declarative shadow root (`<template shadowrootmode="open">`), so search engines index it. In the editor and after client navigation, the shadow root is attached with `attachShadow({ mode: "open" })` instead.
- **Styles are isolated both ways.** The site's CSS can't style the snippet, and the snippet's `<style>` can't leak out. **Inherited values still cross the boundary:** the page's CSS variables (`--foreground`, `--card`, `--border`, `--muted`, `--muted-foreground`, `--background`, `--primary`…), `color` and the `font-family` all come through. Those variables are set on the `.pb-theme` ancestor and switch automatically in dark mode.
- **FrontLit rewrites a snippet written as a standalone document:**
  - `<!doctype>`, `<html>`, `<head>` and `<body>` tags are dropped.
  - In CSS, `:root` becomes `:host`, `html.dark` becomes `:host(.dark)`, `html` becomes `:host`, and `body` becomes `[data-embed-body]`.
  - `min-height: 100vh` becomes `0`, `vw` becomes `cqw`, and `@media (…width…)` becomes `@container (…)`. Width queries therefore measure the embed, not the window.
- **Dark mode:** the host gets a `dark` class whenever the page is dark, so `:host(.dark) .x { … }` works.
- **Scripts run, but differently from a normal page:**
  - On a server-rendered (live) page the HTML parser runs each inline script once, in order, as it builds the shadow root. In the editor and after client-side navigation, FrontLit inserts the markup and re-creates each `<script>` so it runs once.
  - **`document.currentScript` is `null`**, because the script's root is a shadow root, not the document.
  - In the editor a script runs again every time the snippet changes, on a fresh DOM. (Older FrontLit versions also ran scripts a second time on live pages; the run-once guard below keeps snippets correct either way.)
- **Any `<script>` that mentions `window.parent` is deleted.** That pattern was an iframe-era dark-mode sync; use `:host(.dark)` instead.
- **`<link>` tags for fonts, `preconnect`, `dns-prefetch` and `preload` are hoisted out of the shadow root into the page,** so a font service link works (it loads for the whole page). An `@font-face` rule inside the snippet's own `<style>` doesn't: shadow roots ignore it.
- **In the editor a transparent overlay covers every embed** (`blocks/embed/widget.tsx`), so a click selects the block. You can't click tabs or buttons inside a snippet in the builder (FrontLit issue #110). Test interactivity locally (below).

## Rules for snippets

1. **One wrapper, one prefix.** Put everything in one element: `<div class="acme-wrap" id="acme-demo">…</div>`. Choose a short product prefix (`acme-`) and start **every class, id, `@keyframes` name and custom property** with it.
2. **Scope every CSS rule under the wrapper:** `.acme-wrap .acme-tab { … }`. Never use bare element or global selectors (`a`, `button`, `*`, `body`, `:root`). Shadow isolation protects the page today, but the same snippet must stay safe when it's previewed locally or pasted somewhere without a shadow root.
3. **Keep it self-contained:**
   - no `<script src>`, no `<link rel="stylesheet">`, no `@import`, no trackers: inline what you need
   - **prefer the theme's fonts to a font service.** A Google Fonts (or similar) link works, because FrontLit hoists it to the page, but it adds a request and a font download to every visit and costs PageSpeed. If the site needs another face, set it in the theme so every block uses it.

   For text, `font: inherit` on the wrapper picks up the theme's text font. For code, name a face the theme already uses, with fallbacks, e.g. `font-family: "Spline Sans Mono", ui-monospace, monospace`. FrontLit self-hosts its theme fonts with page-level `@font-face` rules, and page-level faces work inside the shadow root.
4. **Follow the page's colours with fallbacks.** Map page variables to your own on the wrapper, with a fallback for each, so the snippet still renders outside FrontLit:

   ```css
   .acme-wrap {
     --acme-fg: var(--foreground, #1f1a16);
     --acme-muted-fg: var(--muted-foreground, #6a6258);
     --acme-card: var(--card, #ffffff);
     --acme-border: var(--border, #e2ddd5);
     --acme-muted: var(--muted, #eeebe5);
     --acme-accent: #7c5cc4; /* brand accent, hardcoded */
     color: var(--acme-fg);
     font: inherit;
     container-type: inline-size;
   }
   :host(.dark) .acme-wrap, .dark .acme-wrap { --acme-accent: #b191ea; }
   ```

   **Hardcode the brand accent.** The editor preview can show a different `--primary` from the live site, so don't let brand-critical colour depend on `var(--primary)`. Keep the accent within the brand's own palette, and check contrast in both modes.
5. **Find your own root; never `document.getElementById`.** Your elements are inside a shadow root, so `document.getElementById` and `document.querySelector` return `null`. `document.currentScript` is `null` there too. Use both strategies, plus a run-once guard (see the template).
6. **Make scripts idempotent.** Mark the root (`data-acme-ready`) and skip it if it's already marked. Listen on the root, not on `document`, unless you need global events (`hashchange`).
7. **Responsive by container, not viewport.**
   - Use `@container (max-width: 640px)` on the wrapper (`container-type: inline-size`). FrontLit converts `@media` width queries for you, but a local test page doesn't, so write container queries directly.
   - Stack side-by-side layouts below ~640 px, and let wide tables scroll horizontally inside their own box.
8. **Motion:** honour `@media (prefers-reduced-motion: reduce)` and stop or shorten animations there. Nothing essential should depend on motion.
9. **Accessibility:**
   - Real buttons with `role="tab"`, `aria-selected` and `aria-controls` for tabs, plus arrow-key support.
   - Text, not images of text.
   - `aria-hidden="true"` on decorative SVG.
10. **No `position: fixed`, and no `100vh` heights.** The snippet lives inside a section.
11. **Size is not a problem.** Snippets of 70k+ characters paste and render fine; there's no character limit in the builder. Keep the source file in the repository or project folder so it can be diffed and re-pasted.

## Template

```html
<div class="acme-wrap" id="acme-demo">
<style>
.acme-wrap{--acme-fg:var(--foreground,#1f1a16);--acme-card:var(--card,#fff);--acme-border:var(--border,#e2ddd5);--acme-muted-fg:var(--muted-foreground,#6a6258);--acme-accent:#7c5cc4;color:var(--acme-fg);font:inherit;container-type:inline-size}
:host(.dark) .acme-wrap,.dark .acme-wrap{--acme-accent:#b191ea}
.acme-wrap *,.acme-wrap *::before,.acme-wrap *::after{box-sizing:border-box}
.acme-wrap .acme-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.acme-wrap .acme-card{background:var(--acme-card);border:1px solid var(--acme-border);border-radius:10px;padding:20px}
.acme-wrap .acme-pulse{animation:acme-pulse 3s ease-in-out infinite}
@keyframes acme-pulse{50%{opacity:.4}}
@container (max-width:640px){.acme-wrap .acme-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.acme-wrap .acme-pulse{animation:none}}
</style>
<div class="acme-grid">
  <div class="acme-card"><span class="acme-pulse" aria-hidden="true">●</span> Upload</div>
  <div class="acme-card">Serve</div>
</div>
<script>
(function () {
  var ID = "acme-demo", READY = "data-acme-ready";
  // 1. Where the script itself lives (works when the snippet is not in a shadow root).
  var cs = document.currentScript;
  var rootNode = cs && cs.getRootNode ? cs.getRootNode() : null;
  var el = rootNode && rootNode.getElementById ? rootNode.getElementById(ID) : null;
  if (el && el.hasAttribute(READY)) el = null;
  // 2. currentScript is null inside a shadow root: search every open shadow root.
  function search(root) {
    var x = root.getElementById ? root.getElementById(ID) : root.querySelector("#" + ID);
    if (x && !x.hasAttribute(READY)) return x;
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) { x = search(all[i].shadowRoot); if (x) return x; }
    }
    return null;
  }
  if (!el) el = search(document);
  if (!el) return;            // already initialised (the snippet was rendered twice)
  el.setAttribute(READY, "");
  // … your code: query inside `el` only, e.g. el.querySelectorAll(".acme-tab")
})();
</script>
</div>
```

The search skips roots already marked ready, so two copies of the same snippet on one page each initialise once.

## Test before pasting

The editor can't show interactivity (overlay), and there's no shareable draft preview yet (FrontLit #103). Test every snippet locally first:

```bash
node <path-to-this-skill>/scripts/test-embed.mjs snippet.html --prefix acme-
```

The script, `scripts/test-embed.mjs`:
- **Lints** for unprefixed names, global selectors, `document.getElementById` and `document.querySelector`, external `<script src>`, `window.parent`, in-snippet `@font-face`, missing reduced-motion or variable fallbacks, and missing run-once guards, and warns about font links that slow the page.
- **Renders** with headless Chrome both normally and the way FrontLit does: its rewrites and a declarative shadow root.
- **Screenshots** 1280 px and 390 px in light and dark.

Open every screenshot and check: headings legible, contrast fine in dark, nothing cut off or overflowing at 390 px, and the default tab or state correct. Then paste the snippet. After publishing, click through the interactive parts on the live page once.

## When not to use an embed

If a block can do it (hero, featured, grid, FAQ, pricing, banner), use the block: it follows the theme and stays editable by people who don't read HTML. Embeds are for what blocks can't express.
