# Designing a FrontLit theme

A theme is the visual foundation for every page on a FrontLit site. Create one that suits the audience and content, makes the main action obvious, and works across the builder's blocks in light and dark mode. A product's existing colors or design tokens can be useful input, but they are not a prerequisite or a substitute for designing the site.

The theme is site-wide. Inspect the current theme and pages before changing it, and change it only when the user asks for a theme or a site-wide redesign.

## The schema is the contract

**Read `scripts/schema/site.v1.json` → `properties.theme` before creating or editing theme JSON.** This is the bundled, definitive schema for `site.json` themes. It lists the required fields, allowed enum values and nested shapes; do not infer them from this design guide or from a screenshot. The theme in `site.json` is a `ThemeStyle` object, not the builder's `{ id, name, theme }` theme-card wrapper.

| Theme path | Required shape |
| --- | --- |
| `theme.colors` | Both `light` and `dark`. Each mode requires the full color set, including foreground pairs, charts, sidebar colors and shadow tokens. A palette with only background and primary colors is invalid. |
| `theme.typography` | `preheader`, `header1`–`header4`, `subheader1`–`subheader2`, `text1`, `text2`, `link`, `button`, `input` and `caption`. Each style requires `fontFamily`, `fontSize` and `fontWeight`. `display` and `code` are optional styles. |
| `theme.interactives` | `button`, `link`, `card` and `input` objects. Menu, dialog, popover and tooltip styles are optional. Nested padding, border, radius and shadow values use the schema's enums. |
| `theme.structure` | `page.width` and `section.padding.x` / `section.padding.y`. Section dividers are optional. |
| `theme.highlight` | Optional: `color` or `marker`. |

Every object rejects unknown fields. Start from the current or exported full theme, or from a complete FrontLit preset, then change the values the design calls for. Check the schema again when adding an optional field or writing a value by hand. Run `scripts/check.mjs` against the site folder after editing `site.json`; a visually good theme that fails schema validation cannot publish.

## 1. Establish a direction

- Look at the product, audience, page content, logo and available imagery. If there is an existing site, identify what people already recognize and what is failing visually or functionally. If there is no brand system, choose a coherent direction rather than inventing a detailed one.
- Write a brief visual direction: the mood, a primary accent, a neutral surface family, a heading and body font pairing, and the intended density. For example, a calm editorial site might use warm paper surfaces, restrained blue actions, a serif display face and generous spacing.
- Use the logo or existing brand palette when supplied. Existing app tokens are a starting point when the site should match the app; adapt values that fail on marketing pages. Do not copy an unrelated product's palette, fonts or radius.
- Decide what should be distinctive. One strong choice, such as expressive type, a confident accent, or a recognizable surface treatment, carries more weight than several competing effects.

## 2. Build the palette as relationships

Use **Theme → Colors** in the visual builder, or `theme.colors.light` and `theme.colors.dark` in `site.json`. Consult the schema for the complete color set and accepted values.

| Role | What to check |
| --- | --- |
| `background` / `foreground` | Comfortable reading on the main page surface. |
| `card` / `cardForeground`, `popover` / `popoverForeground` | Distinct enough from the page to show grouping, without turning every section into a card. |
| `primary` / `primaryForeground` | Clear primary buttons and active states; the text on the button must remain legible. |
| `secondary`, `muted`, `accent` and their foregrounds | A restrained hierarchy for secondary actions, quiet panels and emphasis. These are roles, not a request for three extra brand colors. |
| `border`, `input`, `ring`, `destructive` | Visible edges, editable fields, keyboard focus and error states. |

Choose light and dark palettes deliberately. Dark mode needs its own surface steps, borders and action contrast; simply inverting light colors often makes cards disappear and accents glow too hard. Check text against each surface it actually appears on. Aim for at least 4.5:1 contrast for normal text and 3:1 for large text and essential interface boundaries. A focus ring must be visible against adjacent surfaces. Keep shadows subtle and consistent with the surface treatment.

If source colors are in `oklch()`, the bundled `scripts/oklch-to-hex.mjs` converts them to hex for the builder's color fields. Use it only when needed; there is no required source palette.

## 3. Set the type hierarchy

In **Theme → Typography**, choose available FrontLit fonts for `display`, headings, body, buttons and code. In JSON these are `theme.typography` styles such as `display`, `header1`, `header2`, `text1`, `button` and `code`. Keep a small font family set, usually one for headings and one for body; a monospace face is useful when the content actually contains code.

- Give the hero a clear lead over section titles, and section titles a clear lead over body copy. Tune weight, line height and tracking with size; bigger alone does not create hierarchy.
- Read several real headlines in the chosen face. Check short and long titles at mobile width; avoid broken words, single-word lines and a hero that consumes the whole first screen.
- Keep body text easy to scan, with enough size and line height for longer sections. Use emphasis sparingly. Choose `theme.highlight` (`color` or `marker`) to support highlighted title phrases, not to decorate every heading.
- Theme font keys are not CSS face names. For embeds, inspect the native element and loaded font declarations; see `embeds.md` for the `font-*` versus `fl-*` distinction. Inheritance alone may pick up the host body font rather than a chosen theme heading.
- Use FrontLit's theme fonts instead of adding a font-service link in each page or embed. This keeps blocks and embeds visually aligned and avoids extra page loads.

## 4. Shape controls and spacing

Use `theme.interactives` for button, link, card, input, menu and overlay treatment: padding, borders, corner radius and shadows. Use `theme.structure.page.width` and `theme.structure.section.padding` for the site's default width and rhythm. Match controls to the chosen direction: a restrained editorial site may use subtle borders and modest radii; a playful one can use fuller corners and softer surfaces. Keep related controls consistent.

Check that buttons look clickable, secondary actions are distinguishable, inputs and disabled states are understandable, and focus remains visible. Give the page enough width for grids and media without making paragraphs too wide. Set strong defaults in the theme; use per-block width and padding overrides only when a section has a reason to differ.

## 5. Apply and review in the page builder

Open **Edit theme** from the builder top bar. Make a custom copy when exploring a new direction, then edit its colors, typography, interactives and structure. The theme affects the header, footer and every page. The **Use** action on a theme card applies it site-wide and may make it live immediately, so use it only when the user has asked to apply the theme.

For Git-managed pages, edit the `theme` object in `site.json`. Start from the current, exported or complete preset theme so required fields and existing intentional choices survive. Follow `references/format.md`, validate with `scripts/check.mjs`, and use the FrontLit pull-request preview to see the rendered result. Do not invent a partial theme object from memory.

Review real pages, not only swatches or an empty canvas. Include a hero, cards or grids, long text, navigation, buttons, a form, FAQ, and any code or embeds the site uses. Check desktop and mobile, light and dark. Look for:

- Legible text and controls on every background, including image and pattern sections.
- A clear primary action without every link competing for attention.
- Readable heading wraps, body measure and section spacing at about 390 px and a desktop width.
- Consistent radii, borders, shadows and icon treatment across blocks and embeds.
- Visible hover, focus, disabled and error states where applicable.

Adjust the theme first when a problem repeats across pages; change a single block only for a genuine local exception. For section composition and backgrounds, use `design.md`. For builder draft and publishing behavior, use `builder.md`.
