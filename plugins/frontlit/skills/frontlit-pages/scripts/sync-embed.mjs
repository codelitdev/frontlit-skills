#!/usr/bin/env node
// Copy a readable HTML source into one script embed in a page JSON file.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const usage = "Usage: node sync-embed.mjs <page.json> <snippet.html> [--index N] [--check]";
try {
  const args = process.argv.slice(2);
  const positional = [];
  let index, check = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--check") check = true;
    else if (args[i] === "--index") {
      const value = args[++i];
      if (value === undefined || !/^\d+$/.test(value)) throw new Error("--index requires a non-negative layout index.");
      index = Number(value);
    } else if (args[i].startsWith("--")) throw new Error(`Unknown option: ${args[i]}`);
    else positional.push(args[i]);
  }
  if (positional.length !== 2) throw new Error(usage);
  const [pagePath, sourcePath] = positional.map(p => resolve(p));
  if (pagePath === sourcePath) throw new Error("Page JSON and snippet source must be different files.");
  const page = JSON.parse(readFileSync(pagePath, "utf8"));
  if (!Array.isArray(page.layout)) throw new Error("Page must contain a layout array.");
  const isScript = b => b?.name === "embed" && b.settings?.contentType === "script";
  if (index === undefined) {
    const indices = page.layout.flatMap((b, i) => isScript(b) ? [i] : []);
    if (indices.length !== 1) throw new Error(`Found ${indices.length} script embeds; specify --index N for an existing script embed.`);
    index = indices[0];
  }
  const block = page.layout[index];
  if (!isScript(block)) throw new Error(`layout[${index}] is not a script embed.`);
  const source = readFileSync(sourcePath, "utf8");
  if (block.settings.content === source) {
    console.log(`In sync: layout[${index}]`);
  } else if (check) {
    console.error(`Out of sync: layout[${index}] in ${pagePath}`);
    process.exitCode = 1;
  } else {
    block.settings.content = source;
    writeFileSync(pagePath, JSON.stringify(page, null, 2) + "\n");
    console.log(`Updated layout[${index}] in ${pagePath}`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
