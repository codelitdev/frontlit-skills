# Theme from a product's design system

When the product already has a design system (a tokens package, a `globals.css`, a Figma library), the site theme should use **its exact tokens**: same colours, fonts and radius. Don't eyeball colours from screenshots, and don't add ad-hoc colours per section.

The theme is site-wide; it restyles every page. Change it only when the user asks.

## 1. Find the tokens

- Look for the package or CSS the product's app uses: `@company/design-system`, `tokens.css`, `globals.css`, Tailwind `@theme` blocks.
- Use the version that's in production, and note it.
- Tokens are usually scoped:
  - light values on `:root` (or `[data-product="x"]` for multi-product systems)
  - dark values on `.dark` (or `[data-product="x"].dark`)
- Collect, for light and dark: `background`, `foreground`, `card`, `card-foreground`, `popover`, `primary`, `primary-foreground`, `secondary`, `muted`, `muted-foreground`, `accent`, `destructive`, `border`, `input`, `ring`; the font families (sans, mono); and the base radius.

## 2. Convert colours

FrontLit stores theme colours as hex. Its renderer passes `oklch()` values through, but the builder's colour fields expect hex. Convert with the bundled script, which gamut-maps instead of clipping:

```bash
node <path-to-this-skill>/scripts/oklch-to-hex.mjs "oklch(0.6 0.14 300)"
# oklch(0.6 0.14 300) -> #8e6ac7
node <path-to-this-skill>/scripts/oklch-to-hex.mjs --css node_modules/@company/design-system/tokens.css
```

`--css` lists every `--token: oklch(…)` under its selector, so light and dark come out separately. `--json` gives the same as JSON.

## 3. Map to theme fields

| Theme field (light and dark) | Token |
| --- | --- |
| background / foreground | `--background` / `--foreground` |
| card / cardForeground, popover / popoverForeground | `--card…`, `--popover…` (popover = card if missing) |
| primary / primaryForeground | `--primary` / `--primary-foreground` |
| secondary, muted, accent (+ foregrounds) | same names |
| destructive, border, input, ring | same names |

- **Fonts:** pick the product's fonts in Theme → Typography (JSON: `theme.typography.<style>.fontFamily`). FrontLit self-hosts a set of faces: Inter, Hanken Grotesk, Work Sans, Open Sans, Roboto, Spline Sans Mono, JetBrains Mono, Merriweather, Playfair Display and more. Use those values (e.g. `font-hanken-grotesk`, `font-spline-sans-mono`) for headings, body and code. If the product's font isn't offered, pick the closest one and ask FrontLit to add it. **Never add a Google Fonts `<link>`**; it costs PageSpeed on every page, and embeds should inherit the page fonts anyway.
- **Radius:** the theme takes Tailwind steps for buttons, cards and inputs: `rounded-md` = 6 px, `rounded-lg` = 8 px, `rounded-xl` = 12 px. A 10 px system sits between `rounded-lg` and `rounded-xl`; compare with the product's app and pick one consistently. Use the exact px inside embeds.
- **Type scale:** extra-bold or bold H1 with tight tracking, sentence-case eyebrows, body line height ≈ 1.5. Map to the nearest Tailwind steps.

## 4. Apply safely

- In the builder, open **Theme** (top bar). **Edit a custom copy** of a theme rather than the active one.
- **Treat "Use <theme>" (the ✓ on a theme card) as going live everywhere.** It applies the theme to the whole site. In some editors, applying a theme publishes it immediately, so apply only when the user asks.
- In JSON (`site.json` → `theme`), copy the existing theme and change only the mapped fields.
- Check a page with every block type in light and dark.
- Embeds don't get theme colours automatically beyond the CSS variables. Use `var(--foreground, …)` and friends, plus the hardcoded brand accent (`embeds.md`).

## Worked example (MediaLit)

MediaLit uses `@codelitdev/design-system` 0.4.1 with `data-product="medialit"`:
- **Light:** warm neutral base, violet primary `oklch(0.6 0.14 300)` → `#8e6ac7`.
- **Dark:** background `#1b1510`, violet `#b191ea`.
- **Fonts:** Hanken Grotesk (text) and Spline Sans Mono (code), both in FrontLit's font list.
- **Radius:** 10 px.

In embeds MediaLit hardcodes its violet accent (`#9b78d6`) and never uses gold or amber.
