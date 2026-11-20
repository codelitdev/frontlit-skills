# Writing docs from the code

Use this when pages don't exist yet and the product's source code is the only complete description of it: a new product, a rewrite, or features that shipped without docs. Formatting rules stay in `format.md` and style in `writing.md`; this covers finding what to write and making sure it is true.

## 1. Inventory what the product does

Build the list from the code, not from memory or marketing copy:

- **What users see:** the app's navigation and routes, settings screens, onboarding, emails it sends.
- **What developers call:** the public API (contract or OpenAPI spec), SDKs, CLI commands, webhooks and their payloads, embed snippets.
- **What changes behavior:** plans or entitlements, roles and permissions, feature flags, limits and defaults, environment variables for self-hosting.

Group the list into product areas (the app's own navigation is usually the right split). Compare it with the existing docs and mark each area **missing**, **outdated** or **fine**. Show the user this gap list, with the sections and page titles you propose, before writing more than a few pages: it is the plan they approve.

Skip what users can't reach: internal admin tools, code behind a disabled feature flag, deprecated paths kept only for migration. Ask when unsure.

## 2. Split the work by product area

Each area is one sidebar section (one folder) and can be written independently. When several agents or people write in parallel, give each one area, the approved page list for it, the docs folder's existing pages as the model for tone and structure, and this file. Each returns its pages plus a findings list (step 4). Merge the results into one pull request, or one per area if the user prefers.

Agree up front on what is shared: section names and order (`_sections.json`), terms for the product's core objects, and which page owns each concept so others link to it instead of repeating it.

## 3. Check every claim against the code

A docs page is a set of promises. Before writing one down, find the code that makes it true:

- **Names:** copy UI labels, button text, menu paths, field names, CLI flags and error messages exactly from the source (UI strings, translation files, the API contract).
- **Numbers:** limits, defaults, timeouts, prices and plan quotas come from the code or configuration, never from an estimate. Quote the unit.
- **Who can do it:** check the permission or role check on the route or mutation, and any plan gating, and say so on the page ("Owners and admins can…").
- **What happens:** follow the action to its side effects (emails sent, webhooks fired, data deleted, what's reversible) and describe the ones the reader cares about.
- **Examples:** build request and response examples from the real schema; run them against a local or test instance when one is available.

Keep a private note of the file behind each claim while you work, so a reviewer (or you, on a second pass) can re-check it. Don't put source paths on the page.

If the code doesn't settle a question (two code paths disagree, behavior depends on configuration you can't see), don't guess: leave it out and ask.

## 4. Report bugs instead of documenting them

Writing docs from code finds bugs: a label that says one thing while the code does another, a limit enforced in the UI but not the API, a documented option that does nothing. Don't describe the broken behavior as intended, and don't write around it with a workaround the team hasn't chosen.

Keep a findings list as you go, one entry per issue: where it is (file and line, or the screen), what the code does, what it presumably should do, and how it affects the docs. Put the list in the pull request description and in your report to the user. Document the intended behavior only once the user confirms it; until then, leave that detail out. Fix the code only when asked, in a separate pull request.

## 5. Screenshots

If you can run the app and drive a browser, take screenshots of the screens the page walks through, at a consistent window size and with realistic but fictional data. Move them into the media library with `scripts/images.mjs` (`porting.md`, "Images"). Without a browser, write the steps precisely enough to follow without images and list the screenshots worth adding.

## 6. Review and keep current

- Run `scripts/check.mjs <docs-folder> --tree` and read the sidebar as a newcomer would: does the order follow the order people learn the product?
- Re-read each page against the code once, ideally by someone (or an agent) who didn't write it, checking the claims from step 3.
- Docs drift when code changes without them. Offer to add a short rule to the repository's agent instructions (`AGENTS.md`, `CLAUDE.md` or similar) so future changes carry their docs; adapt the folder path:

```markdown
## Documentation

- Product docs live in `frontlit/docs` as Markdown published by FrontLit (see the `frontlit-docs` skill).
- When you add a feature or change one significantly, update or add its docs page in the same pull request. Bug fixes and refactors don't need docs changes.
- Check what a page states (labels, limits, defaults, permissions) against the code. If the code looks wrong, report it instead of documenting it.
- Run the skill's `scripts/check.mjs` on the docs folder before pushing.
```
