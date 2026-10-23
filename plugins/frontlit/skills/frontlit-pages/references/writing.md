# Writing FrontLit pages that work

Start with the site's domain and the visitor's purpose. A founder's software landing page, a restaurant promotion, an article index and a portfolio need different information and voices.

## Plan from the content

Before choosing blocks, identify the visitor, what they came to find or do, the available content, and the agreed visual direction. Use existing branding and relevant references (`design.md`). Ask for a reference when choosing between materially different directions; continue independent content discovery while waiting.

Choose sections that support that purpose. The following are examples, not mandatory sequences:

| Site / visitor purpose | Useful content and flow |
| --- | --- |
| SaaS / evaluate a product | Product demonstration, capabilities, relevant proof, pricing and questions that affect a buying decision. |
| Restaurant / choose food or visit | Food-led promotion, real menu or specials, ordering/reservation links, locations and hours when supplied. |
| Publication / find something to read | Lead story, article collections, topic navigation and readable summaries; a subscription prompt only if relevant. |
| Commerce / choose a product | Product imagery, categories, useful details and actual purchase links. |
| Portfolio / evaluate someone's work | Selected projects, case studies, relevant background and contact. |
| Local service / assess and contact | Services, service area, relevant evidence and booking/contact details. |

Other domains follow the same principle: derive the structure from the content and purpose rather than forcing the closest example. Use multiple reading or browsing paths when useful. A benefit grid, pricing section, FAQ or closing CTA belongs only when it helps this visitor. Do not add one to fill a template.

Pull facts from the repository, existing site or user. Never invent prices, menu items, ordering links, locations, hours, customers, metrics or testimonials to imitate a reference. Give a section a `cssId` when something links to it.

## Headings

- **One meaningful H1 per page, normally the hero title.** It's the page's main headline for readers, screen readers and search.
- Every other block title is an H2 (the default). Grid and featured item titles render below that automatically.
- Don't set `titleLevel` unless a page truly needs it (e.g. a second hero-style band should be `h2`). Choose the H1 for this page’s actual subject; avoid repeating the brand or adding an extra hero above a custom opening just to pass a lint rule.
- Inside Markdown, start at `##` (or `###` under a block title), never `#`.

## Copy

- **Headlines match the domain and content:** a product benefit, a food promotion, a story title or a project name. Use the brand’s voice; highlighting with `*asterisks*` is optional.
- **Sub-copy adds useful context** rather than repeating the headline or a generic promise.
- **Buttons are verb + object:** "Start free", "Book a demo", "Read the docs". Never "Submit", "Learn more" twice on a page, or "Click here".
- **Be specific:** numbers, names, limits, time saved. Cut adjectives that any competitor could use ("powerful", "seamless", "next-generation").
- Keep each card description to one or two lines; similar lengths across items so cards line up.
- Write for scanning: someone reading only the headings should understand the page.
- Match the tone, terminology and capitalization of the product and existing pages (sentence case headings unless the site uses title case).
- **Place evidence where it helps a decision.** Product proof may belong near a SaaS demonstration; article indexes and restaurant promotions do not automatically need a proof strip.
- **Frame developer-only sections by situation** ("Adding uploads to your app? Skip the plumbing"), after the section everyone understands, and explain product jargon the first time it appears.
- **Verify claims against the product's code or docs.** Hosted and self-hosted capabilities often differ.

## SEO

Page SEO lives outside the block list. Follow `seo.md` for the builder's SEO panel, Git fields, search visibility and social card image. File name = URL: choose a short, lowercase, hyphenated, descriptive slug (`pricing.json`, `vs-notion.json`). When renaming a live page, add a `redirects` entry in `site.json` from the old path. Link related pages and docs where useful to visitors.

## Media

- Choose imagery for the domain: product UI for software, appetizing food for restaurants, work samples for portfolios and story photography for publications. Choose photos, illustrations or cutouts to support the composition; do not use generic icons as a substitute for meaningful imagery.
- Keep repository images in one place, e.g. `frontlit/assets/`, and reference them relative to the page (`../assets/hero.png`).
- Export at 2× the displayed size, under ~500 KB where possible (WebP/AVIF), and always set `alt` describing what the image shows.
- For video, prefer `youtubeLink` (hero or media block) over embeds.

## Responsive and theme

- FrontLit blocks are responsive and follow the theme's type scale, colors and dark mode. Don't fight them: leave `titleSize` unset, and use `verticalPadding` / `maxWidth` enums instead of one-off sizes.
- If you set `titleSize`, set all three breakpoints and check real line breaks at 390 px. Use 32–40 px as a starting point for ordinary mobile headings; larger campaign type needs enough room and a short title.
- Every color you set (`background.backgroundColor`, overlays, marquee item colors) needs a dark-mode value or must work on both. Check the preview in both modes.
- Alternate section backgrounds sparingly (e.g. one tinted band for proof, a contrasting closing banner). A page where every section has a different background reads as noise. Tested texture and glow recipes (grain, mesh, eclipse arc, light beam) are in `references/design.md`.
- Purposeful motion is welcome (a diagram that shows the flow, a logo strip, a slow glow). Every animation needs a `prefers-reduced-motion` fallback. Nothing essential may depend on motion, and text people are reading never moves. Usually no more than two moving things should be in view at once.
- Keep hero text clearly legible over any background, especially at 390 px wide: contrast ≥ 4.5:1 for body and ≥ 3:1 for large headings, and texture masked away from text.
- For layout, hierarchy and a visual QA checklist, see `references/design.md`; for site-wide theme creation, see `references/theme.md`.

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

- A new page visitors should find needs a link: in `site.json`'s header (main sections only, a small set of relevant links) or footer (everything else). Add it to the existing footer column it belongs to (Product, Resources, Company, Legal); add a column only for a new group.
- A campaign page usually stays out of the header; link it from the footer or from related pages.
- Renaming or removing a page: add a `redirects` entry for the old path and update every link to it.

## Recipes

These are optional software-marketing examples. Use only the recipes that fit the site; replace every string with real content. Other domains can use the same blocks with different compositions and copy.

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
