# FrontLit blocks

A page's `layout` is a list of blocks. `scripts/schema/page.v1.json` is the exact contract (every enum, number range and default); this file says what each block is for and how to use it well.

**The one rule that matters most:** FrontLit renders a block's settings on top of its defaults, and the defaults are FrontLit's own demo copy. A hero with no `title` says "Run your whole business from one front office"; a grid with no `items` shows three demo cards. **Set every text, button and list setting the block shows.** To hide one, set it to `""` (strings) or `[]` (lists). Buttons render only when both caption and action are set. The checker warns (`DEMO_CONTENT`) for each unset content setting.

## Settings every block takes

| Setting | Values | Use |
| --- | --- | --- |
| `cssId` | string | Anchor id, so `/#pricing` scrolls to the block. Give every section the header or a button links to an id. |
| `verticalPadding` | `py-0` … `py-64` | Section spacing. Leave unset to follow the theme; use `py-8`/`py-10` to tighten a band, `py-24`+ for a big hero. |
| `maxWidth` | `max-w-2xl` … `max-w-6xl` | Content width. Narrow (`max-w-3xl`) for prose and FAQs. |
| `background` | object | Section background: `{ "type": "color", "backgroundColor": "#0f172a", "backgroundColorDark": "#020617" }`, `{ "type": "gradient", "backgroundImage": "linear-gradient(…)" }` or `{ "type": "image", "media": { "url": "…" }, "overlay": { "color": "#000", "blendMode": "normal", "opacity": 5 } }`. Always give a dark-mode value (`backgroundColorDark`, `backgroundImageDark`, `overlay.colorDark`) when you set a color. |

Blocks with a title also take `titleLevel` (`h1` | `h2` | `h3`; the hero defaults to `h1`, every other block to `h2`) and `titleSize` (`{ "mobile": 32, "tablet": 40, "desktop": 56 }` in px; unset breakpoints keep the theme size; prefer leaving it unset).

## hero

The page's opening: who it's for, what they get, one primary action. Its title is the page's H1.

| Setting | Notes |
| --- | --- |
| `layout` | `normal` (text beside media), `centered`, `card`, `media-below`. Default `normal`. |
| `preTitle` | Short eyebrow above the title ("New: Git sync"). Optional. |
| `title` | Outcome, under ~10 words. Highlight one phrase with `*asterisks*`. |
| `description` | Markdown, 1–2 sentences: how, for whom. |
| `buttonCaption` + `buttonAction` | Primary CTA (verb + object: "Start free"). Default demo values; always set or blank both. |
| `secondaryButtonCaption` + `secondaryButtonAction` | Lower-commitment action ("See how it works", "Read the docs"). |
| `command` | A copyable shell command ("npx create-acme"), great for developer tools. |
| `smallPrint` | Reassurance under the buttons ("No credit card. Free for 3 users."). |
| `media` / `youtubeLink` | Product screenshot or video. `mediaRadius` 0–8 rounds it. |
| `alignment`, `contentAlignment` | Media side and text alignment; `centered` layout ignores media position. |

Anti-patterns: a title that names the product but not the benefit; three equal buttons; no media in `normal` layout (use `centered` instead).

## featured

A list of benefits or capabilities with icons. No media, lightweight.

`layout`: `grid` (default), `list`, `compact`, `numbered` (good for "how it works" steps). `title`, `description` (Markdown), `headerAlignment`, `items: [{ "title", "description", "icon" }]`. 3, 4 or 6 items read best.

## grid

Cards in 2 or 3 `columns`, each with an optional image and button. Use for features that need a screenshot, use cases, integrations, or "choose your path" cards.

`title`, `description`, `headerAlignment`, `buttonCaption`/`buttonAction` (one button under the grid), `columns` (2 | 3), `items: [{ "title", "description", "icon", "media", "mediaAlignment": "top"|"bottom"|"overlay", "buttonCaption", "buttonAction" }]`. Card titles render as H4 under the section's H2. An item count that fills the rows (3, 6; 2, 4) looks intentional; a lone card on the last row doesn't.

## content

Text with media: one feature explained in depth. Alternate `alignment` (`left` | `right`) between consecutive content blocks for a zig-zag.

`layout`: `side` (default), `stacked`, `overlay` (text over the image). `title`, `body` (Markdown, can have lists and links), `media`, `headerAlignment`, `mediaRadius`. Without `media` it renders as a titled text section at full width, which is the right block for a story or explanation that needs a heading.

## rich-text

A run of prose without a block title: legal text, a long explanation with several parts. `text` (Markdown, `##`/`###` headings allowed, never `#`), `alignment`. A `##` inside it is a real H2. For one titled section, prefer `content` without media, so the title follows the theme's heading style. For legal pages (terms, privacy) a hero with a short title plus one rich-text block is right.

## media

A single image or video, full width. `media` or `youtubeLink`, `aspectRatio` (`"16/9"`, `"4/3"`, `"1/1"`), `objectFit`, `mediaRadius`, `hasBorder`, `playVideoInModal`.

## marquee

A scrolling row of text/icon chips: integrations, customer names, tech stack. Items are text + optional icon + optional link (no logo images; for real logos use an `embed` of fixed-width inline SVG pills, see `references/design.md`). `items: [{ "text", "icon", "href" }]`, `direction`, `speed` (px/s), `pauseOnHover`, item colors and borders. Keep it to one per page; motion is decoration, not content.

## pricing

Plan cards. `layout`: `grid` (default), `stacked`, `highlight`. `title`, `description`, `headerAlignment`, `tiers: [{ "name", "price", "description", "features": [""], "buttonCaption", "buttonAction", "highlighted" }]`.

- `price` is a display string: `"$29/mo"`, `"Free"`, `"Custom"`. There is no monthly/yearly switch; state the billing period in `price` or `description` ("$290/yr, 2 months free").
- Highlight at most one tier (the one you want most people on). 2–4 tiers.
- Features: concrete limits ("10,000 contacts") over adjectives ("Generous limits"). Put the differentiators first; "Everything in Pro, plus:" is fine as the first line.

## faq

Questions and answers. `layout`: `list` (accordion, default), `cards`, `columns`. `title`, `headerAlignment`, `items: [{ "question", "answer" }]`. Answers are plain text, 1–3 sentences. Use it for real objections: pricing limits, data and privacy, migration, "how is this different from X". Give it `"cssId": "faq"`.

## banner

A call-to-action band: closing CTA or a mid-page nudge. `layout`: `stacked`, `split`, `boxed`. `title`, `description`, primary and secondary buttons, `contentAlignment`. Pair with a contrasting `background`. One near the end of every marketing page.

## email-form

Newsletter / waitlist signup; submissions become contacts in FrontLit. `layout`: `stacked`, `split`, `inline`. `title`, `description`, `buttonCaption`, `successMessage`, `alignment`.

## support-form

A contact / support form that opens a ticket in FrontLit's help desk. Usually on `help.json` or a contact page. `title`, `description`, `buttonCaption`, `successMessage`, `alignment`.

## code-snippet

A copyable code block for developer audiences: install command, API call. `code`, `showPrompt` (shows `$`), `caption`, `contentAlignment`.

## embed

Content FrontLit's blocks can't express. Two kinds, which run very differently:

- `"contentType": "url"`: an iframe of `content` (a video player, a booking widget). Set `aspectRatio` (`16:9`, `4:3`, `1:1`) or keep `default` with `height` in px.
- `"contentType": "script"` (builder: **Script / iframe snippet**): `content` is HTML (with `<style>` and inline `<script>`) rendered **inline in the page inside a shadow root**, not in an iframe. It's server-rendered, so search engines index it, and it sizes to its content with `aspectRatio: "default"`. Inherited values cross the boundary: the page's CSS variables (`--foreground`, `--card`, `--border`, `--muted`…), colour and fonts. The site's CSS doesn't. Scripts run once, with `document.currentScript` set to `null`.

Good for animated diagrams, data tables, tabbed code samples and logo strips with images. **Read `references/embeds.md` before writing a snippet** (prefixes, scoping, finding the root, dark mode, template), and test it with `scripts/test-embed.mjs`. Guardrails:
- No external `<script src>` or stylesheets. Prefer the theme's fonts to a font service (a font link works but slows every page).
- Use theme variables with fallbacks, plus a hardcoded brand accent.
- Honour `prefers-reduced-motion`.
- Don't rebuild with an embed what a block already does: blocks follow the theme and stay editable in the builder.

## content-feed

`{ "name": "content-feed" }`, no settings. Only on `blog.json`, `docs.json` and `changelog.json`, exactly once each: it's where FrontLit renders the article list, docs or updates. Add a hero above it and, optionally, an email-form below.

## header and footer

Not page blocks: they live in `site.json` (`references/format.md`) and show on every page.

- **header**: `layout` (`fixed`, `floating`, `centered`), `links: [{ "label", "href", "isButton" }]` (4–6 links), `ctaLabel` + `ctaHref` (the primary action, same as the homepage hero's), `linkAlignment`, `backdropBlur`, `logoCorners`. The logo and site name come from FrontLit's **Branding** settings, not from the file.
- **footer**: `layout` (`columns`, `centered`, `minimal`), `tagline`, `columns: [{ "title", "links": [{ "label", "href" }] }]`, `copyrightText`, `showThemeSwitcher`.
