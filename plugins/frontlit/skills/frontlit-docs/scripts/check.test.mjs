import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const check = join(dirname(fileURLToPath(import.meta.url)), "check.mjs");

function run(pages, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "frontlit-docs-check-"));
  mkdirSync(join(dir, "docs"));
  for (const [name, body] of Object.entries(pages))
    writeFileSync(join(dir, "docs", name), `---\ntitle: T\n---\n\n${body}\n`);
  const r = spawnSync("node", [check, join(dir, "docs"), ...extra], { encoding: "utf8" });
  return { ok: r.status === 0, text: r.stdout + r.stderr };
}

// Rich blocks FrontLit supports are accepted, including multi-line TypeTable rows holding `<` and `>`.
const valid = `<Callout type="warning" title="Heads up">

A **callout** with \`Array<string>\`.

</Callout>

<Tabs items={["npm", "pnpm"]}>

<Tab value="npm">

\`\`\`bash
npm install x
\`\`\`

</Tab>

<Tab value="pnpm">

Use pnpm.

</Tab>

</Tabs>

<Steps>

<Step>

### Install

Run it.

</Step>

</Steps>

<Cards>

<Card title="Quick start" href="/docs/b" icon={<Rocket />}>

Go.

</Card>

<Card title="No body" />

</Cards>

<Accordions type="single">

<Accordion title="Why?">

Because.

</Accordion>

</Accordions>

<CodeGroup>

\`\`\`bash title="npm"
npm i x
\`\`\`

\`\`\`bash title="pnpm"
pnpm add x
\`\`\`

</CodeGroup>

<TypeTable
  type={{
    labels: { type: "Partial<Labels>", description: "Replace <any> text.", required: true },
  }}
/>

\`\`\`ts title="app.ts"
const a = <Foo bar />;
\`\`\``;
let r = run({ "a.md": valid, "b.md": "Target." });
assert.ok(r.ok, r.text);

// A code fence may be indented inside a list item; its content (here `<name>`) stays literal.
r = run({ "a.md": "1. Run the command:\n\n    ```bash\n    deploy --region <name>\n    ```\n\n2. Done." });
assert.ok(r.ok, r.text);

// A deeper-indented fence line inside a fence is content, so the fence stays open until its real close.
r = run({ "a.md": "```markdown\n1. Run:\n\n    ```bash\n    deploy\n    ```\n```\n\nAfter <the fence>." });
assert.ok(!r.ok && r.text.includes("<the fence>"), r.text);
r = run({ "a.md": "```markdown\n1. Run:\n\n    ```bash\n    deploy <name>\n    ```\n```" });
assert.ok(r.ok, r.text);

// In a plain Markdown page, four spaces outside a list start indented code: a fence-like line
// there is literal and does not hide the following prose, and Markdown examples in it are not checked.
r = run({ "a.md": "Example:\n\n    ```\n\n<div>outside</div>\n\n```\nx\n```" });
assert.ok(!r.ok && r.text.includes("<div>"), r.text);
r = run({ "a.md": "Write lists like this:\n\n    - 1. text\n    <Foo>\n\nDone." });
assert.ok(r.ok, r.text);
// Inside a list item the same indentation is a fence, so its content is literal.
r = run({ "a.md": "- Run:\n\n    ```bash\n    deploy <name>\n    ```" });
assert.ok(r.ok, r.text);
// A page with rich blocks uses MDX rules: indentation is layout, so an indented fence is still a fence
// and indented prose is still checked.
r = run({ "a.md": '<Callout type="note">\n\n    ```bash\n    deploy <name>\n    ```\n\n</Callout>' });
assert.ok(r.ok, r.text);
r = run({ "a.md": '<Callout type="note">\n\n    - 1. text\n\n</Callout>' });
assert.ok(!r.ok && r.text.includes("INVALID_DOCUMENT"), r.text);

// Bold labels that carry a number, and dashes inside text, are not list markers.
r = run({ "a.md": "- **(1) Name**: one\n- **Range**: 1 - 3\n- -1 is negative" });
assert.ok(r.ok, r.text);

// An image on its own line, a link on its own, and a plain ordered list with a nested bullet list are fine.
r = run({ "a.md": "[Guide](https://example.com)\n\n![Screenshot](https://example.com/a.png)\n\n1. One\n   - nested\n2. Two" });
assert.ok(r.ok, r.text);

// Each of these must be reported.
const bad = {
  "unknown component": '<EmailBlockDemo block="x" />',
  "generic in prose": "Use Array<string> here.",
  "raw html": "<div>x</div>",
  "bad callout type": '<Callout type="warn">\n\nx\n\n</Callout>',
  "orphan step": "<Step>\n\nx\n\n</Step>",
  "wrong child": "<Tabs>\n\n<Step>\n\nx\n\n</Step>\n\n</Tabs>",
  "prose in code group": "<CodeGroup>\n\nhello\n\n</CodeGroup>",
  "unclosed": "<Callout>\n\nx",
  "extra prop": '<Card title="x" img="y" />',
  "fence meta": "```ts {1,3}\nx\n```",
  "local image": "![x](/img.png)",
  "task list": "- [ ] one",
  "import": 'import X from "x"',
  "empty link": "See [the guide]().",
  "image inside a link": "[![Build status](https://example.com/badge.svg)](https://example.com/ci)",
  "bullet starting with an ordered marker": "- 1. **First**: one\n- 2. **Second**: two",
  "bullet starting with a bullet marker": "- - one",
  "ordered item starting with a bullet marker": "1. - one",
  "ordered item starting with an ordered marker": "1. 1. one",
};
for (const [name, body] of Object.entries(bad)) {
  r = run({ "a.md": body });
  assert.ok(!r.ok, `${name} should fail`);
}

// Heading IDs collapse each run of spaces into one hyphen, unlike Fumadocs/GitHub's "--".
const heading = "## Upload flow (drafts + sealing)";
r = run({ "a.md": "[Flow](/docs/b#upload-flow-drafts-sealing)", "b.md": heading });
assert.ok(r.ok, r.text);
r = run({ "a.md": "[Flow](/docs/b#upload-flow-drafts--sealing)", "b.md": heading });
assert.ok(!r.ok && r.text.includes("BROKEN_ANCHOR"), r.text);

// Links under the API mount are generated, so they are not checked.
r = run({ "a.md": "[Upload](/docs/api-reference/upload)" });
assert.ok(!r.ok);
r = run({ "a.md": "[Upload](/docs/api-reference/upload)" }, ["--api-mount=api-reference"]);
assert.ok(r.ok, r.text);

console.log("check.mjs behaves as documented.");
