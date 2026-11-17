// Run: node port.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const port = join(here, "port.mjs");
const check = join(here, "check.mjs");
const fixtures = join(here, "fixtures", "port");

function run(source, extra = []) {
  const out = mkdtempSync(join(tmpdir(), "frontlit-docs-port-"));
  const target = join(out, "docs");
  const r = spawnSync("node", [port, source, target, ...extra], { encoding: "utf8" });
  const read = (file) => readFileSync(join(target, file), "utf8");
  return { status: r.status, text: r.stdout + r.stderr, out, target, read };
}
// The converted folder must pass the bundled checker.
function checks(target) {
  const r = spawnSync("node", [check, target, "--no-parser"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}
function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), "frontlit-docs-port-src-"));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  return dir;
}

// ---- Docusaurus, kept under /docs/legacy beside existing docs.
{
  const r0 = run(join(fixtures, "docusaurus", "docs"), ["--prefix=legacy", "--assets-base=https://acme.example/"]);
  // An existing _sections.json in the target is merged, and the legacy section sorts after it.
  writeFileSync(join(r0.target, "_sections.json"), JSON.stringify({ version: 1, sections: [{ folder: "guides", name: "Guides", order: 10 }] }));
  const r = { ...r0, ...spawnSync("node", [port, join(fixtures, "docusaurus", "docs"), r0.target, "--prefix=legacy", "--assets-base=https://acme.example/"], { encoding: "utf8" }) };
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Framework: docusaurus; navigation from .*sidebars\.js \(read statically\)/);

  const install = r.read("legacy/getting-started/install.md");
  // Numbered file name → clean path; nav_order = group index * 1000 + position; sidebar_label → nav_title.
  assert.match(install, /^---\ntitle: Install Acme\nnav_title: Install\nnav_order: 1020\n---\n/);
  assert.ok(!/keywords|hide_title|sidebar_position|^import /m.test(install), install);
  assert.match(install, /<Callout type="tip" title="Fast path">\n\nUse the installer\.\n\n<\/Callout>/);
  assert.match(install, /<Tabs items=\{\["macOS","Linux"\]\}>\n\n<Tab value="macOS">\n\n```bash\nbrew install acme\n```\n\n<\/Tab>/);
  assert.match(install, /```bash\ncurl/, "line highlights and showLineNumbers are dropped");
  assert.match(install, /```js title="acme\.config\.js"\n/, "title= is kept");
  assert.match(install, /\[configure it\]\(\/docs\/legacy\/getting-started\/configure#set-the-api-key-region\)/);
  assert.match(install, /<Accordions>\n\n<Accordion title="Troubleshooting">\n\nRun `acme doctor`\.\\\nIt prints a report\./);
  assert.match(install, /\n\n!\[Diagram\]\(https:\/\/acme\.example\/img\/diagram\.png\)\n\n/);

  const configure = r.read("legacy/getting-started/configure.md");
  assert.match(configure, /^---\ntitle: Configure Acme\nnav_order: 1030\n---\n\n## Set the API key/, "H1 becomes the title and is removed");
  assert.match(configure, /\n1\. \*\*Key\*\*: copy it\.\n2\. \*\*Region\*\*/, "nested list markers collapse to one");
  assert.match(configure, /See the old link and \[Build\]\(https:\/\/acme\.example\/ci\)\./, "empty link and badge");
  assert.match(configure, /\| --- \| --- \|/);
  assert.match(configure, /Values are `strings` like `Promise<string>` or `Array<string>`\./);
  assert.match(configure, /<Callout type="warning">/, "caution → warning");

  // Repeated labels across groups in the single legacy section get the group name.
  assert.match(r.read("legacy/getting-started/introduction.md"), /nav_title: "Getting Started: Introduction"\nnav_order: 1010/);
  assert.match(r.read("legacy/guides/introduction.md"), /nav_title: "Guides: Introduction"\nnav_order: 2010/);
  assert.match(r.read("legacy/guides/introduction.md"), /\[Welcome\]\(\/docs\/legacy\/welcome\)/);
  // Docusaurus slug: and id: keep the old URL under the prefix; draft → published: false.
  const deploy = r.read("legacy/guides/deploy.md");
  assert.match(deploy, /slug: legacy\/deploying\n/);
  assert.match(deploy, /published: false/);
  assert.match(deploy, /<Callout type="danger" title="Production">\n\nDeploys are permanent\./);
  assert.match(deploy, /\[install steps\]\(\/docs\/legacy\/getting-started\/install\)/);
  assert.match(r.read("legacy/intro.md"), /title: Welcome to Acme\nslug: legacy\/welcome\nnav_title: Welcome\nnav_order: 10\n/);

  assert.deepEqual(JSON.parse(r.read("_sections.json")).sections, [
    { folder: "guides", name: "Guides", order: 10 },
    { folder: "legacy", name: "Legacy", order: 1010 },
  ]);
  const redirects = JSON.parse(readFileSync(join(r.out, "port-redirects.json"), "utf8"));
  assert.equal(redirects["/docs/getting-started/install"], "/docs/legacy/getting-started/install");
  assert.equal(redirects["/docs/deploying"], "/docs/legacy/deploying");
  checks(r.target);
}

// ---- Mintlify: navigation groups become sections and old URLs are kept with slug.
{
  const r = run(join(fixtures, "mintlify"), ["--assets-base=https://acme.example/"]);
  assert.equal(r.status, 0, r.text);
  assert.deepEqual(JSON.parse(r.read("_sections.json")).sections, [
    { folder: "get-started", name: "Get Started", order: 10 },
    { folder: "essentials", name: "Essentials", order: 20 },
  ]);
  const intro = r.read("get-started/introduction.md");
  assert.match(intro, /^---\ntitle: Introduction\ndescription: Welcome to Acme\.\nslug: introduction\nnav_order: 10\n---/);
  assert.ok(!intro.includes("icon: rocket"), "unknown frontmatter is dropped");
  assert.match(intro, /<Callout type="note">\n\nAcme is in beta\.\n\n<\/Callout>/);
  assert.match(intro, /<Cards>\n\n<Card title="Quickstart" href="\/docs\/quickstart">\n\nShip your first file\.\n\n<\/Card>/, "non-Lucide icon dropped");
  assert.match(intro, /<Card title="Code blocks" href="\/docs\/essentials\/code" icon=\{<BookOpen \/>\} \/>/);
  const quick = r.read("get-started/quickstart.md");
  assert.match(quick, /nav_title: Start here/);
  assert.match(quick, /<Steps>\n\n<Step>\n\n### Install\n\nRun the installer\.\n\n<\/Step>/);
  assert.match(quick, /\[images\]\(\/docs\/essentials\/images#add-a-frame\)/);
  assert.match(quick, /<Accordions>\n\n<Accordion title="Is it free\?">/);
  const code = r.read("essentials/code.md");
  assert.ok(!/^slug:/m.test(code), "slug is omitted when the file path already gives the old URL");
  assert.match(code, /<CodeGroup>\n\n```bash title="npm"\nnpm install acme\n```\n\n```bash title="pnpm"/);
  assert.match(code, /<Tabs items=\{\["Node\.js","cURL"\]\}>\n\n<Tab value="Node\.js">\n\nUse the SDK\./);
  assert.match(code, /<Callout type="tip">\n\nAll set\./, "Check → tip");
  assert.match(code, /<Callout type="danger" title="Limits">/, "Callout type error → danger");
  // The nested "Media" group is flattened into Essentials.
  const images = r.read("essentials/images.md");
  assert.match(images, /nav_order: 20/);
  assert.match(images, /\n\n!\[Dashboard\]\(https:\/\/acme\.example\/images\/dashboard\.png\)\n\nThe dashboard/);
  checks(r.target);
}

// ---- Plain GitHub-style Markdown: dry run with --json reports, writes nothing.
{
  const r = run(join(fixtures, "markdown"), ["--dry-run", "--json"]);
  assert.equal(r.status, 0, r.text);
  const report = JSON.parse(r.text);
  assert.equal(report.framework, "markdown");
  assert.ok(!existsSync(r.target) && !existsSync(join(r.out, "port-redirects.json")));
  const kinds = report.review.map((i) => `${i.file} ${i.kind}`);
  assert.ok(kinds.includes("docs/setup.md image-upload"), kinds.join("\n"));
  assert.ok(kinds.includes("docs/Advanced_Usage.md empty-link"));
  assert.ok(kinds.includes("docs/Advanced_Usage.md url-changed"));
  assert.deepEqual(report.pages.find((p) => p.source === "docs/Advanced_Usage.md"), {
    source: "docs/Advanced_Usage.md", target: "docs/advanced-usage.md", oldUrl: "/docs/Advanced_Usage", route: "/docs/docs/advanced-usage",
  });
}
{
  const r = run(join(fixtures, "markdown"), ["--prefix=v1", "--assets-base=https://acme.example/"]);
  assert.equal(r.status, 0, r.text);
  const index = r.read("v1/index.md");
  assert.match(index, /^---\ntitle: Acme\nnav_order: 10\n---/);
  assert.match(index, /\[CI\]\(https:\/\/acme\.example\/actions\) \[npm\]\(https:\/\/www\.npmjs\.com\/package\/acme\)/);
  assert.match(index, /<Callout type="note">\n\nAcme needs Node 18\.\nIt runs anywhere\.\n\n<\/Callout>/);
  assert.match(index, /\[setup guide\]\(\/docs\/v1\/docs\/setup\)/);
  assert.match(index, /\[advanced usage\]\(\/docs\/v1\/docs\/advanced-usage#tips\)/);
  assert.match(index, /\n- Write docs\n- Nested marker\n- Ordered then bullet$/m);
  const setup = r.read("v1/docs/setup.md");
  assert.match(setup, /!\[Screenshot\]\(https:\/\/acme\.example\/docs\/img\/shot\.png\)/);
  assert.match(setup, /Use `<your-key>` or `<your-key>` in the config\./);
  assert.match(setup, /\[README\]\(\/docs\/v1\)/);
  checks(r.target);
}

// ---- Fumadocs: meta.json separators become groups.
{
  const src = tree({
    "meta.json": JSON.stringify({ pages: ["index", "---Guides---", "upload", "deploy"] }),
    "index.mdx": "---\ntitle: Acme\n---\n\n<Callout type=\"warn\">Beta.</Callout>\n",
    "upload.mdx": "---\ntitle: Upload\nicon: Upload\n---\n\n<Tabs items={['npm', 'pnpm']} groupId=\"pm\" persist>\n<Tab value=\"npm\">\n\nUse npm.\n\n</Tab>\n<Tab value=\"pnpm\">\n\nUse pnpm.\n\n</Tab>\n</Tabs>\n",
    "deploy.mdx": "---\ntitle: Deploy\n---\n\nSee [upload](./upload).\n",
  });
  const r = run(src);
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /Framework: fumadocs/);
  assert.match(r.read("index.md"), /<Callout type="warning">\n\nBeta\.\n\n<\/Callout>/);
  assert.match(r.read("guides/upload.md"), /slug: upload\nnav_order: 10/);
  assert.match(r.read("guides/upload.md"), /<Tabs items=\{\["npm","pnpm"\]\}>/);
  assert.match(r.read("guides/deploy.md"), /\[upload\]\(\/docs\/upload\)/);
  assert.deepEqual(JSON.parse(r.read("_sections.json")).sections, [{ folder: "guides", name: "Guides", order: 10 }]);
  checks(r.target);
}

// ---- Nextra: _meta.json order and labels; Steps made of ### headings.
{
  const src = tree({
    "_meta.json": JSON.stringify({ index: "Home", guide: "The Guide" }),
    "index.mdx": "# Acme\n\nHello.\n",
    "guide/_meta.json": JSON.stringify({ second: "Second", first: "First" }),
    "guide/first.mdx": "# First\n\n<Steps>\n### Install\n\nRun it.\n\n### Use\n\nUse it.\n</Steps>\n",
    "guide/second.mdx": "# Second\n\nText.\n",
  });
  const r = run(src);
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /Framework: nextra/);
  assert.match(r.read("index.md"), /title: Acme\nnav_title: Home/);
  assert.match(r.read("guide/second.md"), /nav_order: 10/);
  assert.match(r.read("guide/first.md"), /nav_order: 20/);
  assert.match(r.read("guide/first.md"), /<Steps>\n\n<Step>\n\n### Install\n\nRun it\.\n\n<\/Step>\n\n<Step>\n\n### Use/);
  assert.deepEqual(JSON.parse(r.read("_sections.json")).sections, [{ folder: "guide", name: "The Guide", order: 10 }]);
  checks(r.target);
}

// ---- VitePress: config sidebar read statically; ::: containers.
{
  const src = tree({
    ".vitepress/config.mts": `import { defineConfig } from "vitepress";\nexport default defineConfig({\n  themeConfig: {\n    sidebar: [\n      { text: "Basics", items: [ { text: "Start", link: "/start" }, { text: "Use", link: "/use" } ] }, // groups\n    ],\n  },\n});\n`,
    "start.md": "# Start\n\n::: warning Careful\nSlow.\n:::\n\n::: details More\nHidden text.\n:::\n",
    "use.md": "# Use\n\n::: code-group\n\n```sh [npm]\nnpm i acme\n```\n\n```sh [pnpm]\npnpm add acme\n```\n\n:::\n",
  });
  const r = run(src);
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /navigation from \.vitepress\/config\.mts \(read statically\)/);
  assert.match(r.read("basics/start.md"), /^---\ntitle: Start\nslug: start\nnav_order: 10\n---/);
  assert.match(r.read("basics/use.md"), /nav_order: 20/);
  assert.match(r.read("basics/start.md"), /<Callout type="warning" title="Careful">\n\nSlow\./);
  assert.match(r.read("basics/start.md"), /<Accordions>\n\n<Accordion title="More">\n\nHidden text\./);
  assert.match(r.read("basics/use.md"), /<CodeGroup>\n\n```sh title="npm"\nnpm i acme\n```/);
  checks(r.target);
}

// ---- GitBook: SUMMARY.md groups, hints, tabs, embeds.
{
  const src = tree({
    "SUMMARY.md": "# Table of contents\n\n* [Welcome](README.md)\n\n## Basics\n\n* [Setup](basics/setup.md)\n",
    "README.md": "# Welcome\n\n{% embed url=\"https://video.example/v/1\" %}\n",
    "basics/setup.md": '# Setup\n\n{% hint style="success" %}\nDone.\n{% endhint %}\n\n{% tabs %}\n{% tab title="macOS" %}\nUse brew.\n{% endtab %}\n{% tab title="Linux" %}\nUse apt.\n{% endtab %}\n{% endtabs %}\n',
  });
  const r = run(src);
  assert.equal(r.status, 0, r.text);
  assert.match(r.text, /Framework: gitbook; navigation from SUMMARY\.md/);
  assert.match(r.read("index.md"), /\[https:\/\/video\.example\/v\/1\]\(https:\/\/video\.example\/v\/1\)/);
  const setup = r.read("basics/setup.md");
  assert.match(setup, /<Callout type="tip">\n\nDone\./);
  assert.match(setup, /<Tabs items=\{\["macOS","Linux"\]\}>\n\n<Tab value="macOS">\n\nUse brew\./);
  checks(r.target);
}

// ---- Unrecognised components stay in place and are reported; a sidebar built by code falls back.
{
  const src = tree({
    "sidebars.js": "module.exports = { docs: buildSidebar() };\n",
    "a.mdx": '---\ntitle: A\n---\n\n<ParamField path="id" type="string">The ID.</ParamField>\n\n<DocCardList />\n\nSee [missing](./nope.md).\n',
  });
  const r = run(src, ["--json"]);
  assert.equal(r.status, 0, "review items do not fail the run");
  const report = JSON.parse(r.text);
  const details = report.review.map((i) => `${i.kind}: ${i.detail}`).join("\n");
  assert.match(details, /unknown-component: <ParamField>/);
  assert.match(details, /unknown-component: <DocCardList>/);
  assert.match(details, /broken-link: Link "\.\/nope\.md"/);
  assert.match(details, /navigation: Could not read the sidebar statically/);
  assert.match(r.read("a.md"), /<ParamField path="id" type="string">The ID\.<\/ParamField>/);
}

// ---- Usage errors exit 2.
for (const args of [[], [fixtures], [join(fixtures, "markdown"), "/tmp/x", "--from=hugo"], [join(fixtures, "markdown"), "/tmp/x", "--prefix=Old Docs"], [join(fixtures, "markdown"), "/tmp/x", "--assets-base=http://x"], [join(fixtures, "markdown"), "/tmp/x", "--bogus"]]) {
  const r = spawnSync("node", [port, ...args], { encoding: "utf8" });
  assert.equal(r.status, 2, `${args.join(" ")}: ${r.stdout}${r.stderr}`);
}

console.log("port.mjs behaves as documented.");
