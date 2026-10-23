# Writing FrontLit pages that work

A landing page has one visitor in mind and one action it wants from them. Decide both before choosing blocks.

## Plan first

Write this down (in your head or the PR description) before any JSON:

1. **Visitor:** who lands here and from where (search, an ad, the docs, a launch post).
2. **Action:** the one thing they should do (start a trial, book a demo, install, join the waitlist). It's the hero's primary button, the header CTA and the closing banner.
3. **Objections:** the three questions that stop them (price, effort to switch, trust, "is this just X?"). They become sections and FAQ items.
4. **Sections:** a list of blocks top to bottom, each with one job.

Pull facts from the repository: README, docs, pricing config, changelog, existing pages. Never invent customers, numbers, quotes, logos, integrations or prices.

## Page structure

A typical marketing page, in order. Drop what you can't fill with real content.

1. **hero:** outcome-led headline, one-sentence how, primary + secondary action, product image.
2. **Proof** (optional): a `marquee` of integrations or customer names, or a `featured` row of numbers, only if real.
3. **What it does:** `featured` (3–6 benefits) or `grid` (cards with screenshots).
4. **How it works / depth:** 2–3 `content` blocks alternating left/right, or `featured` with `"layout": "numbered"` for steps.
5. **Pricing** (or a link to `/pricing`).
6. **faq:** real objections, 4–8 items.
7. **banner:** the closing CTA, same action as the hero.

Give every section a `cssId` that the header, hero buttons or other pages link to (`features`, `pricing`, `faq`).

## Headings

- **One H1 per page: the hero's title.** It's the page's main headline for readers, screen readers and search.
- Every other block title is an H2 (the default). Grid and featured item titles render below that automatically.
- Don't set `titleLevel` unless a page truly needs it (e.g. a second hero-style band should be `h2`). Never make the logo or a pre-title a heading.
- Inside Markdown, start at `##` (or `###` under a block title), never `#`.

## Copy

- **Headlines state outcomes**, not features or product names: "Ship docs from your repo" over "Introducing Acme Docs". Under ~10 words; highlight one phrase with `*asterisks*`.
- **Sub-copy says how and for whom** in one or two sentences.
- **Buttons are verb + object:** "Start free", "Book a demo", "Read the docs". Never "Submit", "Learn more" twice on a page, or "Click here".
- **Be specific:** numbers, names, limits, time saved. Cut adjectives that any competitor could use ("powerful", "seamless", "next-generation").
- Keep each card description to one or two lines; similar lengths across items so cards line up.
- Write for scanning: someone reading only the headings should understand the page.
- Match the tone, terminology and capitalization of the product and existing pages (sentence case headings unless the site uses title case).
- **Show proof high on the page** (who uses it, real numbers), right after the hero.
- **Frame developer-only sections by situation** ("Adding uploads to your app? Skip the plumbing"), after the section everyone understands, and explain product jargon the first time it appears.
- **Verify claims against the product's code or docs.** Hosted and self-hosted capabilities often differ.

## SEO

- `title`: 50–60 characters, the page's main promise or keyword first. Don't add "| Brand"; FrontLit appends the site name.
- `description`: 120–160 characters, outcome-focused, includes what the page is about in plain words. Every page needs one.
- `socialImage`: 1200×630, readable when small. Put it in the repository (e.g. `frontlit/assets/og-pricing.png`) or use an `https://` URL.
- File name = URL: short, lowercase, hyphenated, descriptive (`pricing.json`, `vs-notion.json`). Renaming a live page? Add a `redirects` entry in `site.json` from the old path.
- `robotsAllowed: false` only for pages that shouldn't be found (thank-you pages, private landing pages for a campaign). Drafts use `published: false` instead.
- Internal links between pages help both visitors and search; link to docs and related pages from content blocks.

## Media

- Real product screenshots beat illustrations. Crop to the part that proves the headline.
- Keep repository images in one place, e.g. `frontlit/assets/`, and reference them relative to the page (`../assets/hero.png`).
- Export at 2× the displayed size, under ~500 KB where possible (WebP/AVIF), and always set `alt` describing what the image shows.
- For video, prefer `youtubeLink` (hero or media block) over embeds.

## Responsive and theme

- FrontLit blocks are responsive and follow the theme's type scale, colors and dark mode. Don't fight them: leave `titleSize` unset, and use `verticalPadding` / `maxWidth` enums instead of one-off sizes.
- If you set `titleSize`, set all three breakpoints and keep mobile ≤ 40px.
- Every color you set (`background.backgroundColor`, overlays, marquee item colors) needs a dark-mode value or must work on both. Check the preview in both modes.
- Alternate section backgrounds sparingly (e.g. one tinted band for proof, a contrasting closing banner). A page where every section has a different background reads as noise. Tested texture and glow recipes (grain, mesh, eclipse arc, light beam) are in `references/design.md`.
- Purposeful motion is welcome (a diagram that shows the flow, a logo strip, a slow glow). Every animation needs a `prefers-reduced-motion` fallback. Nothing essential may depend on motion, and text people are reading never moves. Usually no more than two moving things should be in view at once.
- Keep hero text clearly legible over any background, especially at 390 px wide: contrast ≥ 4.5:1 for body and ≥ 3:1 for large headings, and texture masked away from text.
- For layout, hierarchy and a visual QA checklist, see `references/design.md`; to match a product's design system in `theme`, see `references/theme-from-design-system.md`.

## Other kinds of pages

Not every page sells. Keep one clear next step, but let the page do its own job.

| Page | Blocks | Notes |
| --- | --- | --- |
| **About / company** | centered `hero` (title + one-line mission, buttons blanked), `content` without media for the story, `featured` for values or facts, `banner` with a soft next step ("See the product", "We're hiring") | Facts only: founding year, place, people, mission. Short is fine. |
| **Contact / help** | centered `hero`, `support-form` (or `email-form` for sales enquiries), optional `faq` | Link to docs first so people self-serve. |
| **Legal** (terms, privacy) | `hero` with the title and a "Last updated" `smallPrint`, one `rich-text` with `##` sections | `robotsAllowed` can stay true. Copy the product's real, existing terms and privacy text verbatim (current site, repository or user); never write, summarise or invent legal text. Publish terms and privacy together. |
| **Waitlist / launch teaser** | centered `hero`, `featured`, `email-form` | `robotsAllowed: false` until launch if it shouldn't be found yet. |
| **Thank-you / confirmation** | centered `hero` with one button | `robotsAllowed: false`. |

## Navigation

- A new page visitors should find needs a link: in `site.json`'s header (main sections only, 4–6 links) or footer (everything else). Add it to the existing footer column it belongs to (Product, Resources, Company, Legal); add a column only for a new group.
- A campaign page usually stays out of the header; link it from the footer or from related pages.
- Renaming or removing a page: add a `redirects` entry for the old path and update every link to it.

## Recipes

Copy these into `layout`; replace every string with real content.

**Hero (product)**

```json
{
  "name": "hero",
  "settings": {
    "preTitle": "Now with Git sync",
    "title": "Docs and landing pages that *ship with your code*",
    "description": "Write in Markdown and JSON, review in pull requests, and publish on merge.",
    "buttonCaption": "Start free",
    "buttonAction": "https://app.example.com/signup",
    "secondaryButtonCaption": "See how it works",
    "secondaryButtonAction": "/#how-it-works",
    "smallPrint": "Free for small teams. No credit card.",
    "media": { "url": "../assets/hero.png", "alt": "The FrontLit editor next to a pull request" }
  }
}
```

**Hero (developer tool, centered, with a command)**

```json
{
  "name": "hero",
  "settings": {
    "layout": "centered",
    "title": "Test your API in *one command*",
    "description": "Point it at an OpenAPI file. Get a report in seconds.",
    "command": "npx acme-check openapi.yaml",
    "buttonCaption": "Read the docs",
    "buttonAction": "/docs",
    "secondaryButtonCaption": "",
    "secondaryButtonAction": ""
  }
}
```

**Features**

```json
{
  "name": "featured",
  "settings": {
    "cssId": "features",
    "title": "Everything your docs need",
    "items": [
      { "title": "Write in Markdown", "description": "Plain files in your repo, reviewed like code.", "icon": "FileText" },
      { "title": "Publish on merge", "description": "Every merge to main goes live after validation.", "icon": "GitMerge" },
      { "title": "AI answers", "description": "Readers ask questions; answers cite your pages.", "icon": "Sparkles" }
    ]
  }
}
```

**Steps**

```json
{
  "name": "featured",
  "settings": {
    "layout": "numbered",
    "cssId": "how-it-works",
    "title": "Live in three steps",
    "items": [
      { "title": "Connect GitHub", "description": "Pick the repository and branch." },
      { "title": "Merge a pull request", "description": "FrontLit validates every page." },
      { "title": "Share the link", "description": "Your site updates on every merge." }
    ]
  }
}
```

**Pricing**

```json
{
  "name": "pricing",
  "settings": {
    "cssId": "pricing",
    "title": "Simple pricing",
    "description": "Billed monthly. Save 20% yearly.",
    "tiers": [
      { "name": "Free", "price": "$0", "description": "For side projects.", "features": ["1 site", "Community support"], "buttonCaption": "Start free", "buttonAction": "https://app.example.com/signup" },
      { "name": "Pro", "price": "$29/mo", "description": "For growing teams.", "features": ["Custom domain", "Git sync", "Email support"], "buttonCaption": "Start trial", "buttonAction": "https://app.example.com/signup?plan=pro", "highlighted": true }
    ]
  }
}
```

**FAQ**

```json
{
  "name": "faq",
  "settings": {
    "cssId": "faq",
    "title": "Questions, answered",
    "items": [
      { "question": "Can I move my existing site?", "answer": "Yes. Export your pages to the repository in one pull request; nothing changes until you merge." },
      { "question": "Who owns my content?", "answer": "You do. Pages are JSON files in your repository; take them with you any time." }
    ]
  }
}
```

**Closing CTA**

```json
{
  "name": "banner",
  "settings": {
    "layout": "boxed",
    "title": "Ready to ship your site from Git?",
    "description": "Connect a repository in two minutes.",
    "buttonCaption": "Start free",
    "buttonAction": "https://app.example.com/signup",
    "secondaryButtonCaption": "Talk to us",
    "secondaryButtonAction": "/help"
  }
}
```

## Before opening the pull request

- The checker passes with no errors, and every warning left is deliberate.
- No demo copy, placeholder text, lorem ipsum or invented facts. Placeholders the user must fill are listed in the PR.
- One H1; title and description set and within length; social image set for pages that get shared.
- Every button and header/footer link goes somewhere real; anchors have matching `cssId`s.
- You looked at the **FrontLit / pages preview** on desktop and mobile, in light and dark.
