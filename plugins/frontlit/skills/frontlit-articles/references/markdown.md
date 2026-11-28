# Article body: Markdown and editing

## What `markdown` supports

The `markdown` field of `create_article` and `update_article` takes CommonMark plus GFM tables, and JSX-style rich blocks: `Callout`, `Steps`/`Step`, `Tabs`/`Tab`, `Cards`/`Card`, `Accordions`/`Accordion`, `CodeGroup`, `Button`, `WebPreview`, `TypeTable`, `H5P` and images. The full list, with every block's props, is in FrontLit's content schema: **https://frontlit.app/schema/content.v1.json**. Read it when you use a block you haven't used before; the tool's own `markdown` description also summarizes the format.

Rules that trip people up:

- Put each opening and closing tag on its own line, with a blank line around the Markdown inside it:

  ```mdx
  <Steps>

  <Step>

  ### Create the key

  Open **Settings → API keys** and click **New key**.

  </Step>

  </Steps>
  ```

- Only the listed blocks. Prop values are literals (`"text"`, `{42}`, `{["a", "b"]}`); raw HTML, other tags, expressions and `import`/`export` lines are refused.
- No `#` heading in the body: the article title is the H1. Start at `##`, then `###`. Headings inside `Step`, `Tab` and `Accordion` follow the same order.
- Images: `![Alt text](https://…)`, always with alt text. Upload with the flow in `featured-image.md` and use the returned `url`.
- Code: fenced blocks with a language and, optionally, a file title (` ```ts title="client.ts" `). Use `CodeGroup` for the same example in several languages.
- A `Button` needs its link (`href`); without one, publishing is refused (`publishable: false`).

## A good post shape

1. An opening paragraph that states the problem and what the reader will get.
2. `##` sections in the order the reader needs them; short paragraphs, lists and code where they help.
3. Optionally an FAQ: `## Frequently asked questions` with `<Accordions>` and one `<Accordion title="Question?">` per real question.
4. A closing call to action that links to a real page (a doc, signup, or product page).

## Editing without losing changes

Change an existing body with `edit_article` (exact replacements on the `draftMarkdown` from `get_article`; see "Editing a body" in `mcp.md`), not by resending it with `update_article`.

- Read `get_article` right before editing, so your `old_str` values match the current draft, including any edits someone made in the FrontLit editor.
- A failed edit changes nothing. Read again and retry with text copied exactly.
- For a metadata-only change (title, excerpt, featured image), send just those fields with `update_article` and leave the body out.
- Resend the whole body with `update_article` only for a full rewrite. Pass `expectedDraftVersion` from your last read so the write is refused if someone saved since.
- `status: "published_with_changes"` means the draft differs from the live post. Publishing ships every draft change, including any the user made.
