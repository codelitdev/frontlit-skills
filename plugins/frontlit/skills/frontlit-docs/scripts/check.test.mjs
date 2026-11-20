import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const self = fileURLToPath(import.meta.url);
const check = join(dirname(self), "check.mjs");
// The suite runs twice: with the built-in rules (--no-parser), then with FrontLit's parser.
// Every page must get the same verdict from both; message wording is only checked for the
// built-in rules.
const withParser = process.env.CHECK_WITH_PARSER === "1";
const builtin = !withParser;
// FRONTLIT_PARSER_DIR runs the parser half against a local @frontlit/text-editor build
// (e.g. packages/text-editor in a FrontLit checkout) instead of the published one.
const parserMode = () =>
  withParser ? (process.env.FRONTLIT_PARSER_DIR ? [`--parser=${process.env.FRONTLIT_PARSER_DIR}`] : []) : ["--no-parser"];

function run(pages, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "frontlit-docs-check-"));
  mkdirSync(join(dir, "docs"));
  for (const [name, body] of Object.entries(pages))
    writeFileSync(join(dir, "docs", name), `---\ntitle: T\n---\n\n${body}\n`);
  const mode = parserMode();
  const r = spawnSync("node", [check, join(dir, "docs"), ...mode, ...extra], { encoding: "utf8" });
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
let r = run({ "a.md": "x" });
if (withParser && r.text.includes("parser is unavailable")) {
  console.log(`Skipped the FrontLit parser run: ${r.text.split("\n")[0]}`);
  process.exit(0);
}
r = run({ "a.md": valid, "b.md": "Target." });
assert.ok(r.ok, r.text);

// A code fence may be indented inside a list item; its content (here `<name>`) stays literal.
r = run({ "a.md": "1. Run the command:\n\n    ```bash\n    deploy --region <name>\n    ```\n\n2. Done." });
assert.ok(r.ok, r.text);

// A deeper-indented fence line inside a fence is content, so the fence stays open until its real close.
r = run({ "a.md": "```markdown\n1. Run:\n\n    ```bash\n    deploy\n    ```\n```\n\nAfter <the fence>." });
assert.ok(!r.ok && (!builtin || r.text.includes("<the fence>")), r.text);
r = run({ "a.md": "```markdown\n1. Run:\n\n    ```bash\n    deploy <name>\n    ```\n```" });
assert.ok(r.ok, r.text);

// In a plain Markdown page, four spaces outside a list start indented code: a fence-like line
// there is literal and does not hide the following prose, and Markdown examples in it are not checked.
r = run({ "a.md": "Example:\n\n    ```\n\n<div>outside</div>\n\n```\nx\n```" });
assert.ok(!r.ok && (!builtin || r.text.includes("<div>")), r.text);
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

// Whole files at nested paths, for section, route and sidebar behaviour.
function runFiles(files, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), "frontlit-docs-check-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, "docs", name)), { recursive: true });
    writeFileSync(join(dir, "docs", name), text);
  }
  const mode = parserMode();
  const r = spawnSync("node", [check, join(dir, "docs"), ...mode, ...extra], { encoding: "utf8" });
  return { ok: r.status === 0, text: r.stdout + r.stderr };
}
const page = (title, extra = "") => `---\ntitle: ${title}\n${extra}---\n\nBody.\n`;

// The sidebar: _sections.json orders sections, nav_order orders pages, nested folders stay
// in their first-level section, drafts are listed but hidden, and repeated labels in one
// section are a warning (not a failure).
r = runFiles(
  {
    "_sections.json": '{ "version": 1, "sections": [{ "folder": "guides", "name": "Guides", "order": 2 }, { "folder": "old", "name": "Old docs", "order": 9 }] }',
    "index.md": page("Home"),
    "guides/b.md": page("Second", "nav_order: 20\n"),
    "guides/a.md": page("First", "nav_order: 10\n"),
    "guides/hidden.md": page("Hidden", "published: false\n"),
    "old/x/intro.md": page("Introduction", "nav_order: 1\n"),
    "old/y/intro.md": page("Introduction", "nav_order: 2\n"),
  },
  ["--tree"],
);
assert.ok(r.ok, r.text);
assert.match(r.text, /Sidebar: 5 public doc\(s\), 1 draft\(s\) hidden/);
assert.ok(r.text.indexOf("Guides  [guides") < r.text.indexOf("Old docs  [old"), r.text);
assert.ok(r.text.indexOf("First  →") < r.text.indexOf("Second  →"), r.text);
assert.match(r.text, /\(draft\) Hidden/);
assert.match(r.text, /DUPLICATE_NAV_LABEL/);
assert.match(r.text, /\/docs\/old\/y\/intro/);
assert.match(r.text, /OK: 6 file\(s\), 5 public doc\(s\)/);

// Only published pages compete for a route; folders differing only in case collide.
r = runFiles({ "a.md": page("A", "slug: same\n"), "b.md": page("B", "slug: same\npublished: false\n") });
assert.ok(r.ok, r.text);
r = runFiles({ "a.md": page("A", "slug: same\n"), "b.md": page("B", "slug: same\n") });
assert.ok(!r.ok && r.text.includes("DUPLICATE_ROUTE"), r.text);
r = runFiles({ "Guides/a.md": page("A"), "guides/b.md": page("B") });
assert.ok(!r.ok && r.text.includes("SECTION_COLLISION"), r.text);

// --redirects: every /docs/ target must be a public page with the heading it names.
{
  const mapDir = mkdtempSync(join(tmpdir(), "frontlit-docs-map-"));
  const map = join(mapDir, "port-redirects.json");
  const files = { "a.md": page("A"), "b.md": page("B", "published: false\n"), "c.md": "---\ntitle: C\n---\n\n## Setup\n" };
  writeFileSync(map, JSON.stringify({ "/a": "/docs/a", "/c": "/docs/c#setup", "/home": "/", "/api/x": "/docs/api/x" }));
  r = runFiles(files, [`--redirects=${map}`, "--api-mount=api"]);
  assert.ok(r.ok, r.text);
  writeFileSync(map, JSON.stringify({ "/b": "/docs/b", "/gone": "/docs/missing", "/c": "/docs/c#install" }));
  r = runFiles(files, [`--redirects=${map}`]);
  assert.ok(!r.ok, r.text);
  assert.match(r.text, /REDIRECT_TARGET_MISSING {2}\/b → \/docs\/b: that page is a draft/);
  assert.match(r.text, /REDIRECT_TARGET_MISSING {2}\/gone → \/docs\/missing: no page has that route/);
  assert.match(r.text, /BROKEN_ANCHOR {2}\/c → \/docs\/c#install/);
}

// Blocks added in FrontLit #211: Button, WebPreview, H5P, success callouts, Tabs items
// checks, and props a block needs before it can be published (INCOMPLETE_BLOCK). A
// published parser older than that rejects them all, so its run skips this part.
r = run({ "a.md": '<Button label="Go" href="/docs/a" />' });
if (withParser && !r.ok) console.log("Skipped the #211 block checks: the installed FrontLit parser predates them.");
else {
  const blocks = {
    'Button': '<Button label="Start the course" href="/courses/intro" />',
    'Button variant, mailto and anchor links': '<Button label="Mail" href="mailto:hi@example.com" variant="secondary" />\n\n<Button label="Down" href="#setup" variant="primary" />',
    'Button label as a literal expression': '<Button label={"Go"} href="https://example.com" />',
    'WebPreview': '<WebPreview url="https://example.com/guide" title="The guide" description="Everything in one place." image="https://example.com/a.png" />',
    'WebPreview with only a url': '<WebPreview url="http://example.com" />',
    'H5P on h5p.org': '<H5P src="https://h5p.org/h5p/embed/712" title="Drag the words" height={600} />',
    'H5P on a *.h5p.com subdomain': '<H5P src="https://acme.h5p.com/content/1/embed" />',
    'success callout': '<Callout type="success" title="Done">\n\nIt worked.\n\n</Callout>',
    'link blocks inside a callout': '<Callout>\n\n<Button label="Go" href="/docs/a" />\n\n</Callout>',
    'Tab values listed in items': '<Tabs items={["npm", "bun"]}>\n\n<Tab value="npm">\n\nx\n\n</Tab>\n\n<Tab>\n\ny\n\n</Tab>\n\n</Tabs>',
  };
  for (const [name, body] of Object.entries(blocks)) {
    r = run({ "a.md": body });
    assert.ok(r.ok, `${name} should pass\n${r.text}`);
  }
  const broken = {
    'Button without label': ['<Button href="/x" />', "INVALID_DOCUMENT"],
    'Button without href': ['<Button label="Go" />', "INCOMPLETE_BLOCK"],
    'Button with an empty label': ['<Button label="" href="/x" />', "INCOMPLETE_BLOCK"],
    'Button variant': ['<Button label="Go" href="/x" variant="ghost" />', "UNSUPPORTED_ATTRIBUTE"],
    'Button unsafe href': ['<Button label="Go" href="javascript:alert(1)" />', "UNSAFE_URL"],
    'Button expiring href': ['<Button label="Go" href="https://example.com/a?token=1" />', "UNSAFE_URL"],
    'Button with children': ['<Button label="Go" href="/x">\n\nbody\n\n</Button>', "UNSUPPORTED_NODE"],
    'Button unknown prop': ['<Button label="Go" href="/x" size="lg" />', "UNSUPPORTED_ATTRIBUTE"],
    'inline Button': ['Click <Button label="Go" href="/x" /> here.', "UNSUPPORTED_NODE"],
    'Button inside Steps': ['<Steps>\n\n<Button label="Go" href="/x" />\n\n</Steps>', "UNSUPPORTED_NODE"],
    'WebPreview without url': ['<WebPreview title="x" />', "INCOMPLETE_BLOCK"],
    'WebPreview relative url': ['<WebPreview url="/docs/a" />', "UNSAFE_URL"],
    'WebPreview http image': ['<WebPreview url="https://example.com" image="http://example.com/a.png" />', "UNSAFE_URL"],
    'H5P without src': ['<H5P />', "INCOMPLETE_BLOCK"],
    'H5P on another host': ['<H5P src="https://example.com/h5p/1" />', "UNSAFE_URL"],
    'H5P on bare h5p.com': ['<H5P src="https://h5p.com/x" />', "UNSAFE_URL"],
    'H5P over http': ['<H5P src="http://h5p.org/h5p/embed/1" />', "UNSAFE_URL"],
    'H5P height too small': ['<H5P src="https://h5p.org/h5p/embed/1" height={50} />', "UNSUPPORTED_ATTRIBUTE"],
    'H5P height as a string': ['<H5P src="https://h5p.org/h5p/embed/1" height="600" />', "UNSUPPORTED_ATTRIBUTE"],
    'H5P fractional height': ['<H5P src="https://h5p.org/h5p/embed/1" height={600.5} />', "UNSUPPORTED_ATTRIBUTE"],
    'Tab value not in items': ['<Tabs items={["a", "b"]}>\n\n<Tab value="c">\n\nx\n\n</Tab>\n\n</Tabs>', "INVALID_DOCUMENT"],
    'Tabs items not a list': ['<Tabs items="a">\n\n<Tab value="a">\n\nx\n\n</Tab>\n\n</Tabs>', "UNSUPPORTED_ATTRIBUTE"],
    'Tabs items with a number': ['<Tabs items={["a", 1]}>\n\n<Tab value="a">\n\nx\n\n</Tab>\n\n</Tabs>', "UNSUPPORTED_ATTRIBUTE"],
    'Card with an empty title': ['<Cards>\n\n<Card title="" />\n\n</Cards>', "INCOMPLETE_BLOCK"],
    'Card unsafe href': ['<Cards>\n\n<Card title="x" href="javascript:x" />\n\n</Cards>', "UNSAFE_URL"],
    'Accordion with an empty title': ['<Accordions>\n\n<Accordion title="">\n\nx\n\n</Accordion>\n\n</Accordions>', "INCOMPLETE_BLOCK"],
    'signed image URL': ["![x](https://example.com/a.png?X-Amz-Signature=1)", "UNSAFE_URL"],
    'private attachment link': ["[x](https://example.com/attachments/a)", "UNSAFE_URL"],
  };
  for (const [name, [body, code]] of Object.entries(broken)) {
    r = run({ "a.md": body });
    assert.ok(!r.ok && r.text.includes(code), `${name} should fail with ${code}\n${r.text}`);
  }
}

console.log(`check.mjs behaves as documented (${withParser ? "FrontLit's parser" : "built-in rules"}).`);
if (builtin) {
  const again = spawnSync("node", [self], { encoding: "utf8", env: { ...process.env, CHECK_WITH_PARSER: "1" } });
  process.stdout.write(again.stdout + again.stderr);
  process.exit(again.status ?? 1);
}
