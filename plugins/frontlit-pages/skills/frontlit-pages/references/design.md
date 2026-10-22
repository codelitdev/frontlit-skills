# Designing pages that look high-end

Polish comes from restraint and rhythm, not decoration: one clear focal point per section, consistent spacing, real content and one accent colour. Use this with the page structure and copy rules (`writing.md` in frontlit-pages, or the checklist in this skill's `SKILL.md`).

## Start from the product's own design system

Match the product's real tokens (colours, fonts, radius) in the site theme before touching any section (`theme-from-design-system.md`). Never invent ad-hoc colours per section; every colour on the page should trace back to a token, or to the single brand accent.

## Pick a page style

Choose one style per site, from the product's design system and audience, and apply it everywhere: hero, bands, cards, embeds. Each style below is a starting point that FrontLit's blocks and theme can express; adjust colours to the product's tokens.

| Style | Fits | Theme | Hero | Sections | Backgrounds |
| --- | --- | --- | --- | --- | --- |
| **Clean product** | Most B2B SaaS | Neutral greys, one saturated accent, `rounded-lg`/`rounded-xl`, `highlight: "color"` | `normal` with a product screenshot, `mediaRadius` 3–4 | `featured` grid, 2 zig-zag `content`, `pricing` grid, `faq` list, `banner` boxed | Hero: **Spotlight** or **Soft mesh** (light); one **Dots** band for proof; plain elsewhere |
| **Developer tool** | APIs, CLIs, infra | Dark-friendly neutrals, mono accent font for code, `rounded-md`, `highlight: "marker"` | `centered` with `command` and a docs link | `code-snippet`, `featured` numbered (steps), `grid` 3 columns with icons, `faq` columns | Hero: **Grid fade** or **Circuit** masked to the edges; **Film grain + glows** on the closing band |
| **Bold launch** | New product, Product Hunt, waitlist | Vivid accent plus a second hue, large display type, `rounded-2xl`, `highlight: "marker"` | `centered` or `card`, big `preTitle`, short punchy title | `marquee` proof strip, `featured` compact, `content` overlay, `email-form` split, `banner` split | Hero: **Aurora** or **Mesh blobs**; **Holographic band** behind one feature; **Eclipse arc** into the CTA |
| **Editorial** | Founder-led, content, agencies | Warm paper background, serif or high-contrast display face, `rounded-sm`, few colours | `centered`, long-form title, no media | `rich-text` narrative at `max-w-3xl`, `content` stacked with large images, `faq` list | Mostly plain; **Ruled lines** or **Fine dots** at low contrast on one band |
| **Friendly SMB** | Local business, consumer, education | Soft tinted surfaces, rounded everything (`rounded-2xl`/`rounded-full` buttons) | `normal` with a real photo, smallPrint reassurance | `grid` 3 cards with photos, `featured` list, `faq` cards, `support-form` or `email-form` | Tinted `color` bands alternating with plain; **Waves** or **Scales** once |
| **Enterprise / trust** | Security, finance, large customers | Deep navy or charcoal accent, restrained type, `rounded-md` | `media-below` with a wide product shot | Logo strip embed, `grid` 3 columns, `content` side, `pricing` highlight, `faq` columns, `banner` stacked | Plain bands with one subtle **Graph paper** or **Horizon fade**; no motion |

Rules that hold for every style:

- **One accent** carries buttons, highlights and the hero glow; a second hue only in the Bold launch style.
- **One signature background** (the hero's) plus at most one textured band and a contrasting closing band.
- **Same radius, border weight and icon set** in blocks, cards and embeds.
- Pick the style **before** writing sections, and state it in your summary or pull request ("Style: developer tool, accent #7c5cc4").

## Section variations

Every block has layouts; vary them down the page so it doesn't read as a template, but keep one rhythm.

| Need | Options (block, `layout`) | Pick when |
| --- | --- | --- |
| Hero | `hero`: `normal` (text + media side by side), `centered` (no or small media), `card` (text in a raised card over a background), `media-below` (wide screenshot under centered text) | `normal` for product UIs, `centered` for developer tools and launches, `card` over a photo or strong background, `media-below` for wide dashboards |
| Benefits | `featured`: `grid`, `list`, `compact`, `numbered` | `grid` for 3–6 benefits, `compact` for 6–9 short ones, `list` beside nothing (narrow), `numbered` for steps |
| Cards with media or links | `grid`: 2 or 3 `columns`, item `mediaAlignment` `top`/`bottom`/`overlay` | 3 columns for use cases, 2 for big screenshots, `overlay` for photo cards |
| Deep feature | `content`: `side` (alternate `alignment`), `stacked`, `overlay` | `side` zig-zag for 2–3 features, `stacked` for a wide image, `overlay` for one dramatic visual |
| Proof | `marquee` (text + icons), logo strip embed, `featured` with numbers as titles | Marquee for integrations, embed for real logos, numbers only when true |
| Pricing | `pricing`: `grid`, `stacked`, `highlight` | `grid` for 2–4 tiers, `highlight` to push one plan, `stacked` on narrow pages |
| FAQ | `faq`: `list`, `cards`, `columns` | `list` (accordion) by default, `columns` for many short answers, `cards` in friendly styles |
| Call to action | `banner`: `stacked`, `split`, `boxed`; `email-form`: `stacked`, `split`, `inline` | `boxed` with a contrasting background to close a page, `split` mid-page, `email-form` `inline` for waitlists |

## Page skeletons

Proven orders; replace sections you can't fill with real content.

- **Product homepage:** hero (`normal`) → proof strip (`marquee`, `py-8`) → benefits (`featured` grid) → 2–3 deep features (`content` zig-zag) → use cases (`grid` 3) → pricing teaser (`pricing` or a `banner` to `/pricing`) → `faq` → closing `banner` (boxed, contrasting background).
- **Developer tool:** hero (`centered`, `command`) → `code-snippet` or code embed → steps (`featured` numbered) → capabilities (`grid` 3 with icons) → diagram embed → `faq` columns → `banner`.
- **Launch / waitlist:** hero (`centered`, `preTitle` "New") → `featured` compact → one `content` overlay → `email-form` split → short `faq`.
- **Pricing page:** hero (`centered`, no buttons) → `pricing` → data table embed (limits per plan, optional) → `faq` (billing questions) → `banner`.
- **About:** hero (`centered`) → `content` without media (story) → `featured` (values or facts) → `grid` (team, if real) → `banner` (soft next step).

## Hierarchy

- **One H1 (the hero title) and one focal point per section.** Each section answers one question; its title is the answer in under ~10 words.
- **Type ladder:** H1 ≫ H2 > card titles > body. Leave the theme's sizes alone unless the hero needs to be bigger. On mobile, keep H1 ≤ 40 px (2–3 lines at 390 px) and body ≥ 16 px.
- **Eyebrow + title + one-line lead** is the standard section header. Eyebrows are short, sentence case or small caps, in the accent or muted colour.
- **Highlight one phrase per title at most** (`*asterisks*`), and not on every section.
- **Measure:** prose and leads at 60–75 characters per line. Use a narrow `maxWidth` (`max-w-3xl`) for text-heavy sections, and the page width for grids and tables.

## Rhythm and layout

- **A sequence that breathes:** hero (big, `py-24`+), proof strip (tight, `py-8`/`py-10`), 2–4 content sections (theme default), one contrasting band, FAQ (narrow), closing CTA band.
- **Alternate density:** a dense grid, then an airy content block, then a table. Don't stack three card grids in a row.
- **Zig-zag** consecutive `content` blocks (media left, then right).
- **Fill rows:** card counts that fill rows (3 or 6 in three columns; 2 or 4 in two). Keep card copy similar in length so cards line up.
- **Backgrounds:** one tinted or textured band in the middle and a contrasting closing band are enough. A different background on every section reads as noise.
- **Consistent corner radius, border weight and icon style** across blocks and embeds (use the theme radius in embeds too).

## Hero legibility (non-negotiable)

- **Contrast:** text contrast ≥ 4.5:1 (body) and ≥ 3:1 (large headings) against the *actual* pixels behind them, in light and dark.
- **Texture behind text:** keep texture and glows behind text low-contrast. Push them to the edges with a mask (`gradientMaskImage`: `radial-gradient(ellipse at center, transparent 30%, black 75%)`). For **Image** backgrounds, add an overlay as well (Background → Image → overlay colour, opacity 2–5; Pattern backgrounds have no overlay).
- **No busy image behind a headline** without an overlay. Prefer the image beside the text (`normal` layout) or below it (`media-below`).
- **Check 390 px first.** Glows positioned for desktop often land behind the headline on mobile. The title shouldn't wrap one word per line, and buttons should be full-width or side by side, never overflowing.
- **Motion:** never animate the hero text itself.

## Section backgrounds

**Start from FrontLit's presets.** `background-presets.json` holds the 31 presets of the builder's **Background → Pattern** picker as ready `background` objects, each with a dark-mode twin:

- **Tiles** (`category: "tile"`): Dots, Fine dots, Scatter, Grid, Graph paper, Dashed grid, Diagonal lines, Crosshatch, Plus marks, Pinstripe, Ruled lines, Zigzag, Chevron, Diamonds, Triangles, Hexagons, Isometric, Waves, Contour, Ripples, Scales, Brick, Circuit. Quiet textures for one band, or masked behind a hero.
- **Glows** (`category: "glow"`): Soft mesh, Aurora, Spotlight, Bottom glow, Corner glow, Horizon fade, Diagonal fade, Fading grid. Full-bleed light for heroes and closing bands.

In a page file, copy a preset's `background` object into the block's `settings.background` (then tune `gradientMaskImage`, size or alpha). In the builder, pick it by name under **Pattern → Presets**. Swap preset colours (`rgba(99,102,241,…)` and friends) for the product's accent so the page stays on one palette.

Combine for depth: a glow plus a tile in one `backgroundImage` list (comma-separated, glow first), with matching comma lists for size and position (`100% 100%, 24px 24px`), `gradientBackgroundRepeat: "repeat"` (one value covers every layer, and a `100% 100%` glow repeats invisibly), and a mask so the tile fades out under the text.

### Custom recipes

In the builder: select the block, then **Background → Pattern**. Pick a preset (Tiles or Glows), or paste your own into **Custom CSS**, which has separate **Light mode** and **Dark mode** values. Under **Advanced** you can set size, position, repeat and a mask.

In JSON: `"background": { "type": "gradient", "backgroundImage": "…", "backgroundImageDark": "…", "gradientBackgroundSize": "…", "gradientBackgroundRepeat": "…", "gradientMaskImage": "…" }`. Escape inner double quotes as `\"`.

**How layers work:**
- Layers are a comma-separated CSS `background-image` list; the first layer is on top.
- Size and position accept comma lists, one entry per layer. Repeat is a single value for all layers.
- The value can use page variables (`var(--background)`), because the layer sits inside the themed page.
- Pasting into the builder field works with quotes as-is.

Tested recipes (swap the violet `155,120,214` / `177,145,234` for your accent):

- **Film grain plus soft glows.** Repeat: `repeat`. Size: `160px 160px, 100% 100%, 100% 100%`.
  ```css
  url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)' opacity='.14'/%3E%3C/svg%3E"), radial-gradient(60% 50% at 20% 0%, rgba(155,120,214,.30), transparent 70%), radial-gradient(50% 45% at 90% 20%, rgba(214,170,120,.22), transparent 70%)
  ```
- **Mesh blobs.** Size `100% 100%`, no-repeat.
  ```css
  radial-gradient(40% 50% at 15% 20%, rgba(155,120,214,.28), transparent 70%), radial-gradient(35% 45% at 85% 15%, rgba(120,170,214,.22), transparent 70%), radial-gradient(45% 55% at 60% 100%, rgba(214,150,190,.20), transparent 70%)
  ```
- **Eclipse arc.** A glowing horizon that leaves through the sides; the inside matches the page, so the next section continues it.
  ```css
  radial-gradient(ellipse 127% 99% at 50% 152%, var(--background) 0 69%, rgba(177,145,234,.9) 70%, rgba(177,145,234,.25) 72%, transparent 78%)
  ```
  Put it in the layer list *above* any grain, so the inside is clean.
- **Light beam.** Mask: `linear-gradient(black 40%, transparent)`.
  ```css
  conic-gradient(from 160deg at 50% -15%, transparent 0deg, rgba(177,145,234,.22) 16deg, rgba(255,255,255,.28) 20deg, rgba(177,145,234,.22) 24deg, transparent 40deg)
  ```
- **Holographic band.** Mask: `linear-gradient(transparent, black 30%, black 70%, transparent)`.
  ```css
  linear-gradient(100deg, transparent 15%, rgba(255,120,220,.16) 32%, rgba(120,210,255,.18) 50%, rgba(255,230,140,.16) 68%, transparent 85%)
  ```
- **Slowly drifting glow (SVG + SMIL).** Size `100% 100%`.
  ```css
  url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3CradialGradient id='d' r='.5'%3E%3Cstop offset='0' stop-color='%239b78d6' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%239b78d6' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='30' cy='40' r='45' fill='url(%23d)'%3E%3Canimate attributeName='cx' values='30;70;30' dur='40s' repeatCount='indefinite'/%3E%3C/circle%3E%3C/svg%3E")
  ```
- **Floating file-type tiles (SVG + SMIL).** Size `360px 240px`, repeat. Use `animateTransform` translate values like `0 0;0 -8;0 0` over 9–11 s per tile; see the drifting glow for the encoding.

**Encoding:** in a data URI, write `#` as `%23` and `%` as `%25`, and use single quotes inside the SVG. A background's SMIL animation ignores `prefers-reduced-motion`, so keep it slow (≥ 20 s), small in amplitude and low in contrast. For anything more, use an Embed with CSS animation and a reduced-motion fallback.

**Always set the Dark mode value too.** Typically you raise the glow alpha a little and lower the grain opacity.

## Proof, diagrams and tables

- **Logo and tool strips:** the Marquee block shows text and Lucide icons only, with no images. For real logos, use an Embed: a row (or CSS-animated track) of inline SVG pills with a **fixed width** each (e.g. 160 px), so gaps are even. Colour them with `currentColor` from a page variable, and add `:host(.dark)` rules. Duplicate the track for a seamless loop, pause on hover, and stop under `prefers-reduced-motion`. Only use logos you're allowed to show.
- **Animated diagrams** (e.g. "file → API → CDN → app"): an Embed with inline SVG or HTML boxes, animated with CSS keyframes. Stack vertically below ~640 px container width. Make it clear without the animation (labels on every node).
- **Data tables** (plans, limits, specs): an Embed with a real `<table>`.
  - The first column is the feature; your product's column is lightly tinted with the accent.
  - Use ✓ / – / text, not colour alone. Let the table scroll inside its own box on mobile, or turn rows into cards there.
- **Code samples:** monospace from the theme, the same font size across samples, line counts measured not guessed. Show side by side on desktop, stacked on mobile.
- Follow `embeds.md` for every snippet, and run `scripts/test-embed.mjs` before pasting.

## Motion

Purposeful motion is welcome: a diagram that shows the flow, a slowly drifting glow, a logo strip. Rules:
- Respect `prefers-reduced-motion`.
- Nothing essential should depend on motion.
- No motion on text people are reading.
- Usually no more than two moving things in view at once.

## Final visual QA

Screenshot every page at 1280 and 390 px in light and dark. Check:
- Is the headline legible in every combination?
- Is anything clipped or overflowing horizontally?
- Is spacing between sections consistent?
- Does every colour come from the theme or the one accent (no stray gold or amber, for example, when the brand is violet)?
- Is there any demo copy or placeholder left?
- Do images have alt text?
- Do header and footer links work?
