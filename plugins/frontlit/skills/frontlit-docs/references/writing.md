# Writing FrontLit docs that work

FrontLit pages are read by people, found through search, and split into chunks by heading to answer questions in the site's AI assistant. The same habits serve all three.

## Pages

- **One task or concept per page.** "Upload a file" and "Configure storage" are two pages, not one.
- **Title says what the page does,** in sentence case: "Upload files from React", not "React Integration Guide".
- **Description:** one sentence on who it's for and what they'll be able to do. It's the search snippet.
- **First paragraph answers the question** the title raises. Prerequisites go right after, as a short list.

## Headings

- Use `##` for main parts and `###` below them. Don't skip levels.
- Make each heading meaningful on its own ("Set the API key", not "Step 2" or "Next"). Answers cite sections by heading, and headings become link anchors.
- Keep each section self-contained: restate the subject instead of "it" or "as above", because a section may be shown without the rest of the page.

## Content

- Lead with the action, then explain. Short paragraphs, one idea each.
- Every code block should run as written. Show expected output when it helps.
- Name things exactly as they appear in the product UI, CLI and API.
- Put warnings right before the step they apply to, as `> **Warning:** …`.
- Prefer tables for options and parameters; lists for sequences.
- Link to the page that explains a concept instead of re-explaining it.

## Before opening the pull request

- Titles, descriptions and slugs are set; slugs match existing URLs when replacing pages.
- Every internal link and anchor resolves.
- No placeholder text, TODOs or invented API details.
- New pages have a `nav_order` that places them sensibly in their section.
