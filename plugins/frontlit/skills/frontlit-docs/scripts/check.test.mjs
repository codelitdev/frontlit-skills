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
};
for (const [name, body] of Object.entries(bad)) {
  r = run({ "a.md": body });
  assert.ok(!r.ok, `${name} should fail`);
}

// Links under the API mount are generated, so they are not checked.
r = run({ "a.md": "[Upload](/docs/api-reference/upload)" });
assert.ok(!r.ok);
r = run({ "a.md": "[Upload](/docs/api-reference/upload)" }, ["--api-mount=api-reference"]);
assert.ok(r.ok, r.text);

console.log("check.mjs behaves as documented.");
