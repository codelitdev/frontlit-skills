#!/usr/bin/env node
// Check that the bundled page/site schemas match the ones FrontLit publishes:
//   node check-schema-sync.mjs [--base=https://frontlit.app/schema]
// Compares parsed JSON (formatting doesn't matter). Exits 1 when a bundled copy
// has drifted, 2 when a published schema can't be fetched. Node 18+, no dependencies.
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const USAGE = "Usage: node check-schema-sync.mjs [--base=https://frontlit.app/schema]";
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`${USAGE}\nFails when scripts/schema/page.v1.json or site.v1.json differs from the published schema.`);
  process.exit(0);
}
const base = (args.find((a) => a.startsWith("--base="))?.slice(7) ?? "https://frontlit.app/schema").replace(/\/+$/, "");
const here = dirname(fileURLToPath(import.meta.url));
const FILES = ["page.v1.json", "site.v1.json"];

let drifted = 0;
let failed = 0;
for (const name of FILES) {
  const path = join(here, "schema", name);
  const shown = relative(process.cwd(), path) || path;
  const url = `${base}/${name}`;
  let live;
  try {
    const res = await fetch(url, { headers: { accept: "application/schema+json, application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    live = await res.json();
  } catch (e) {
    console.error(`FETCH_FAILED  ${url}: ${e.message}`);
    failed++;
    continue;
  }
  const bundled = JSON.parse(readFileSync(path, "utf8"));
  if (isDeepStrictEqual(bundled, live)) console.log(`OK  ${shown} matches ${url}`);
  else {
    console.error(`DRIFT  ${shown} differs from ${url}`);
    drifted++;
  }
}
if (drifted)
  console.error(
    "\nRefresh the bundled copies from FrontLit's packages/page-builder/schema/ (or the URLs above), " +
      "then follow CONTRIBUTING.md \"Keeping in sync\" → frontlit-pages: run `node ../scripts/check.mjs frontlit/pages --fix` " +
      "from plugins/frontlit/skills/frontlit-pages/examples, update references/blocks.md and bump the plugin version.",
  );
process.exit(drifted ? 1 : failed ? 2 : 0);
