#!/usr/bin/env node
// Pre-check FrontLit page files: node check.mjs [site-folder | pages-folder] [--fix] [--changed]
// Validates <site folder>/pages/*.json and <site folder>/site.json against the
// bundled page.v1 / site.v1 JSON Schemas plus FrontLit's import rules. Run it
// from the repository root. --fix also rewrites valid pages and site.json in
// canonical form (after validating; nothing is written if there are errors).
// FrontLit's own sync is authoritative; this catches problems before pushing.
// No dependencies.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const PAGE_SCHEMA = JSON.parse(readFileSync(join(here, "schema/page.v1.json"), "utf8"));
const SITE_SCHEMA = JSON.parse(readFileSync(join(here, "schema/site.v1.json"), "utf8"));
const PAGE_URL = PAGE_SCHEMA.$id;
const SITE_URL = SITE_SCHEMA.$id;
// The plugin version these rules belong to (absent when installed as a bare skill).
const PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(here, "../../../.claude-plugin/plugin.json"), "utf8")).version;
  } catch {
    return null;
  }
})();
const BY = PLUGIN_VERSION ? ` (FrontLit plugin ${PLUGIN_VERSION})` : "";
const OUTDATED_HINT = "If this looks wrong, your FrontLit plugin may be outdated: run `claude plugin update frontlit@frontlit` (Codex: `codex plugin marketplace upgrade frontlit`).";
// Errors that come from bundled schemas or rules, which an old install can get wrong.
const RULE_ERROR = /^(INVALID_(?!JSON)|UNSUPPORTED_)/;
const ICONS = JSON.parse(readFileSync(join(here, "schema/lucide-icons.json"), "utf8"));
const ICON_NAMES = new Set(ICONS.icons);

const RESERVED = ["api", "embed", "opengraph-image", "sitemap.xml", "robots.txt", "favicon.ico", "openapi.json", "_preview", "release-preview", "schema"];
const FEED_PAGES = ["blog", "docs", "changelog"];
const DYNAMIC_PREFIXES = ["/blog/", "/docs/", "/changelog/", "/help/"];
const IMAGE_TYPES = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"];
const LINK_KEYS = new Set(["href", "buttonAction", "secondaryButtonAction", "ctaHref"]);
const LIMITS = { files: 200, bytes: 2 * 1024 * 1024, assetBytes: 10 * 1024 * 1024 };

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node check.mjs [site-folder | pages-folder] [--fix] [--changed]

Checks <site>/pages/*.json and <site>/site.json against FrontLit's page.v1 / site.v1
schemas and import rules. Run it from the repository root. With no folder, it looks
for frontlit/pages or a pages folder whose files use the page.v1 schema.

  --fix      after a clean check, rewrite pages and site.json in canonical form
  --changed  show warnings in detail only for files changed since HEAD (or untracked);
             errors are always shown
  -h, --help show this help

Exit codes: 0 OK, 1 errors found, 2 folder not found or --changed outside Git.`);
  process.exit(0);
}
const fix = args.includes("--fix");
const root = process.cwd();
// Reporting filter only: never skip validation or hide blocking errors.
let changedFiles = null;
if (args.includes("--changed")) {
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    const names = [
      execFileSync("git", ["diff", "--name-only", "-z", "HEAD"], { cwd: gitRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: gitRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    ].flatMap(s => s.split("\0").filter(Boolean));
    changedFiles = new Set(names.map(name => normalize(join(gitRoot, name))));
  } catch {
    console.error("--changed requires a Git repository with a HEAD commit. Run without --changed to show all warnings.");
    process.exit(2);
  }
}
let folder = args.find((a) => !a.startsWith("--")) ?? findPagesFolder(root);
// Accept the site folder too: <site>/pages holds the pages.
if (folder && existsSync(join(folder, "pages")) && statSync(join(folder, "pages")).isDirectory())
  folder = join(folder, "pages");
if (!folder || !existsSync(folder) || !statSync(folder).isDirectory()) {
  console.error("Pages folder not found. Pass the site folder or its pages folder: node check.mjs frontlit");
  process.exit(2);
}
const siteFile = join(dirname(folder), "site.json");

const errors = [];
const warnings = [];
const otherWarnings = [];
const at = (file, pointer) => `${relative(root, file)}${pointer ? `#${pointer}` : ""}`;
let ruleErrors = 0;
const error = (file, pointer, code, message) => {
  if (RULE_ERROR.test(code)) ruleErrors++;
  errors.push(`${at(file, pointer)}  ${code}  ${message}`);
};
const warn = (file, pointer, code, message) => {
  const line = `${at(file, pointer)}  ${code}  ${message}`;
  warnings.push(line);
  if (changedFiles && !changedFiles.has(normalize(isAbsolute(file) ? file : join(root, file)))) otherWarnings.push({ line, code });
};

function findPagesFolder(start) {
  if (existsSync(join(start, "frontlit/pages"))) return join(start, "frontlit/pages");
  const stack = [start];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (!statSync(path).isDirectory()) continue;
      if (name === "pages" && readdirSync(path).some((f) => f.endsWith(".json") && readFileSync(join(path, f), "utf8").includes(PAGE_URL)))
        return path;
      stack.push(path);
    }
  }
  return null;
}

// --- JSON ---------------------------------------------------------------

function parseJson(file, text) {
  try {
    return { value: JSON.parse(text) };
  } catch (e) {
    const offset = Number(/position (\d+)/.exec(e.message)?.[1]);
    const where = Number.isFinite(offset)
      ? (() => {
          const before = text.slice(0, offset).split("\n");
          return `:${before.length}:${before.at(-1).length + 1}`;
        })()
      : "";
    errors.push(`${relative(root, file)}${where}  INVALID_JSON  ${e.message.split("\n")[0]} (no comments or trailing commas)`);
    return null;
  }
}

// --- JSON Schema (the subset page.v1/site.v1 use) ------------------------

const ptr = (path) => path.map((p) => `/${String(p).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const fits = (type, v) => type === typeOf(v) || (type === "number" && typeOf(v) === "integer");

function validate(schema, value, path, out) {
  if (schema.anyOf) {
    // Blocks are told apart by `name`; report against the matching block.
    const named = typeOf(value) === "object" && typeof value.name === "string"
      ? schema.anyOf.find((s) => s.properties?.name?.const === value.name)
      : null;
    if (named) return validate(named, value, path, out);
    for (const option of schema.anyOf) {
      const trial = [];
      validate(option, value, path, trial);
      if (!trial.length) return;
    }
    const names = schema.anyOf.map((s) => s.properties?.name?.const).filter(Boolean);
    const chrome = ["header", "footer"].includes(value?.name);
    out.push({
      path: names.length ? [...path, "name"] : path,
      message: chrome
        ? `The site ${value.name} lives in site.json, not in pages.`
        : names.length
          ? `Unknown block "${value?.name}". Use one of: ${names.join(", ")}.`
          : "Doesn't match any allowed shape.",
    });
    return;
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => fits(t, value))) {
      out.push({ path, message: `Expected ${types.join(" or ")}, got ${typeOf(value)}.` });
      return;
    }
  }
  if ("const" in schema && value !== schema.const) out.push({ path, message: `Must be ${JSON.stringify(schema.const)}.` });
  if (schema.enum && !schema.enum.includes(value)) out.push({ path, message: `Must be one of: ${schema.enum.join(", ")}.` });
  if (typeof value === "string") {
    if (schema.minLength && value.length < schema.minLength) out.push({ path, message: "Can't be empty." });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push({ path, message: `Doesn't match ${schema.pattern}.` });
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) out.push({ path, message: `Must be ≥ ${schema.minimum}.` });
    if (schema.maximum !== undefined && value > schema.maximum) out.push({ path, message: `Must be ≤ ${schema.maximum}.` });
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) out.push({ path, message: `Must be > ${schema.exclusiveMinimum}.` });
  }
  if (typeOf(value) === "object") {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) if (!(key in value)) out.push({ path: [...path, key], message: "Required." });
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) validate(props[key], v, [...path, key], out);
      else if (schema.additionalProperties === false)
        out.push({ path: [...path, key], message: `Unknown setting "${key}".` });
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => validate(schema.items, v, [...path, i], out));
}

// Walks value alongside its schema, calling visit(schema, value, path).
function walk(schema, value, path, visit) {
  if (!schema) return;
  if (schema.anyOf) {
    const option = schema.anyOf.find((s) => s.properties?.name?.const === value?.name) ?? schema.anyOf[0];
    return walk(option, value, path, visit);
  }
  visit(schema, value, path);
  if (typeOf(value) === "object")
    for (const [k, v] of Object.entries(value)) walk(schema.properties?.[k], v, [...path, k], visit);
  if (Array.isArray(value)) value.forEach((v, i) => walk(schema.items, v, [...path, i], visit));
}

const isMarkdown = (s) => typeof s?.description === "string" && s.description.startsWith("Markdown");
// Block rich text (FrontLit's page text format): basic formatting only.
const isPageText = (s) => typeof s?.description === "string" && s.description.startsWith("Markdown: paragraphs");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Canonical form ------------------------------------------------------

function ordered(schema, value) {
  if (schema?.anyOf) {
    const option = schema.anyOf.find((s) => s.properties?.name?.const === value?.name) ?? schema.anyOf[0];
    return ordered(option, value);
  }
  if (Array.isArray(value)) return value.map((v) => ordered(schema?.items, v));
  if (typeOf(value) !== "object") return value;
  const keys = Object.keys(schema?.properties ?? {});
  const out = {};
  for (const key of [...keys, ...Object.keys(value).filter((k) => !keys.includes(k))])
    if (key in value) out[key] = ordered(schema?.properties?.[key], value[key]);
  return out;
}

/** Settings equal to the block default are left out, like FrontLit's serializer. */
function stripDefaults(settingsSchema, settings) {
  const out = {};
  for (const [key, value] of Object.entries(settings ?? {}))
    if (!("default" in (settingsSchema?.properties?.[key] ?? {})) || !same(value, settingsSchema.properties[key].default))
      out[key] = value;
  return out;
}

function canonicalPage(page) {
  const blocks = PAGE_SCHEMA.properties.layout.items.anyOf;
  const layout = page.layout.map((block) => {
    const schema = blocks.find((s) => s.properties.name.const === block.name)?.properties.settings;
    const settings = ordered(schema, stripDefaults(schema, block.settings));
    return Object.keys(settings ?? {}).length ? { name: block.name, settings } : { name: block.name };
  });
  const out = { $schema: PAGE_URL };
  for (const key of ["title", "description", "socialImage", "robotsAllowed", "published"])
    if (page[key] !== undefined && page[key] !== "") out[key] = key === "socialImage" ? ordered(PAGE_SCHEMA.properties.socialImage, page[key]) : page[key];
  if (out.robotsAllowed === true) delete out.robotsAllowed;
  if (out.published === true) delete out.published;
  out.layout = layout;
  return `${JSON.stringify(out, null, 2)}\n`;
}

function canonicalSite(site) {
  const out = { $schema: SITE_URL };
  // Every key the schema knows, in schema order, so new site settings
  // (such as agentInstructions) survive --fix instead of being dropped.
  for (const key of Object.keys(SITE_SCHEMA.properties).filter((k) => k !== "$schema")) {
    if (site[key] === undefined || site[key] === "") continue;
    let value = key === "header" || key === "footer" ? stripDefaults(SITE_SCHEMA.properties[key], site[key]) : site[key];
    if (key === "redirects") value = value.map(({ from, to, permanent }) => ({ from, to, ...(permanent === false ? { permanent } : {}) }));
    value = ordered(SITE_SCHEMA.properties[key], value);
    if (typeOf(value) === "object" && !Object.keys(value).length) continue;
    if (Array.isArray(value) && !value.length) continue;
    out[key] = value;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

// --- Shared checks -------------------------------------------------------

function internalLinks(value, path, out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => internalLinks(v, [...path, i], out));
  else if (typeOf(value) === "object")
    for (const [key, v] of Object.entries(value)) {
      if (LINK_KEYS.has(key) && typeof v === "string") out.push({ href: v, path: [...path, key] });
      else internalLinks(v, [...path, key], out);
    }
  else if (typeof value === "string")
    for (const m of value.matchAll(/\]\((\/[^)\s]*)\)/g)) out.push({ href: m[1], path });
  return out.filter(({ href }) => href.startsWith("/") && !href.startsWith("//"));
}

function checkMedia(file, schema, value) {
  walk(schema, value, [], (s, v, path) => {
    const key = path.at(-1);
    if ((key !== "media" && key !== "socialImage") || typeof v?.url !== "string") return;
    if (/^[a-z][a-z0-9+.-]*:/i.test(v.url) || v.url.startsWith("//")) {
      if (!/^https:/i.test(v.url)) error(file, ptr([...path, "url"]), "ASSET_URL", "Images must be an https:// URL or a path in the repository.");
      return;
    }
    const repoPath = v.url.startsWith("/") ? normalize(v.url.slice(1)) : normalize(join(relative(root, dirname(file)), v.url));
    const full = join(root, repoPath);
    // FrontLit only looks inside the repository.
    if (repoPath === ".." || repoPath.startsWith("../") || isAbsolute(repoPath) || !existsSync(full) || !statSync(full).isFile() || !IMAGE_TYPES.includes(extname(full).toLowerCase()))
      error(file, ptr([...path, "url"]), "ASSET_MISSING", `${v.url} isn't an image in the repository (${IMAGE_TYPES.join(" ")}).`);
    else if (statSync(full).size > LIMITS.assetBytes) error(file, ptr([...path, "url"]), "ASSET_TOO_LARGE", "Images must be under 10 MB.");
    if (!v.alt && key === "media") warn(file, ptr([...path, "alt"]), "ALT_MISSING", "Describe the image for screen readers and search.");
  });
}

// The constructs FrontLit's Markdown parser rejects (same parser as docs).
function markdownProblems(text) {
  const out = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const open = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !open[2].trim()) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      if (open[2].trim().split(/\s+/).length > 1) out.push("Code fence metadata is unsupported; keep only the language.");
      continue;
    }
    const prose = line.replace(/(`+)[\s\S]*?\1/g, "``");
    const tag = prose.replace(/<(?:https?:|mailto:)[^>]*>/g, "").match(/(?<!\\)<\/?[A-Za-z][^>]*>?/);
    if (tag) out.push(`HTML/JSX "${tag[0].slice(0, 40)}" is unsupported; use Markdown.`);
    if (/^\s*(import|export)\s/.test(prose)) out.push("MDX import/export lines are unsupported.");
    if (/^\s*([-*+]|\d+[.)])\s+\[[ xX]\]\s/.test(line)) out.push("Task lists are unsupported.");
    if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line) && line.includes(":")) out.push("Table column alignment is unsupported.");
    if (/\[\^[^\]]+\]/.test(prose)) out.push("Footnotes are unsupported.");
  }
  return out;
}

// What page block rich text also refuses: it has no tables, images or
// headings outside ## to ####. Media and embeds are page blocks.
function pageTextProblems(text) {
  const out = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    const prose = line.replace(/(`+)[\s\S]*?\1/g, "``");
    if (
      /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(line) ||
      /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(line)
    )
      out.push("Tables are unsupported in block rich text.");
    if (/(?<!\\)!\[[^\]]*\]\(/.test(prose))
      out.push("Images are unsupported in block rich text; use a Media block.");
    const heading = line.match(/^\s{0,3}(#{1,6})\s/);
    if (heading && (heading[1].length === 1 || heading[1].length > 4))
      out.push(`Heading level ${heading[1].length} is unsupported in block rich text; use ## to ####.`);
  }
  return out;
}

const PLACEHOLDER = /\bTODO\b|\bTBD\b|lorem ipsum|\[placeholder/i;
function checkStrings(file, schema, value) {
  walk(schema, value, [], (s, v, path) => {
    if (typeof v !== "string") return;
    if (path.at(-1) === "icon" && v && !ICON_NAMES.has(v))
      warn(file, ptr(path), "UNKNOWN_ICON", `"${v}" isn't a Lucide ${ICONS.version} icon (featured shows Sparkles instead; grid and marquee show none). Use a PascalCase name from lucide.dev/icons.`);
    if (PLACEHOLDER.test(v)) warn(file, ptr(path), "PLACEHOLDER", "Placeholder text goes live on merge. Replace it, or keep the page \"published\": false.");
  });
}

function checkMarkdown(file, schema, value) {
  walk(schema, value, [], (s, v, path) => {
    if (!isMarkdown(s) || typeof v !== "string") return;
    const problems = [...markdownProblems(v), ...(isPageText(s) ? pageTextProblems(v) : [])];
    for (const message of new Set(problems)) error(file, ptr(path), "UNSUPPORTED_MARKDOWN", message);
    if (path[0] === "agentInstructions") {
      // FrontLit publishes it in /llms.txt under its own # title and ## Agent instructions heading.
      if (/^#{1,2}\s/m.test(v)) warn(file, ptr(path), "HEADING_LEVEL", "FrontLit adds the # title and a ## Agent instructions heading in /llms.txt; start sections at ###.");
    } else if (!isPageText(s) && /^#\s/m.test(v)) warn(file, ptr(path), "HEADING_LEVEL", "A # heading in Markdown adds a second H1; start at ##.");
  });
}

// --- Pages -----------------------------------------------------------------

const entries = readdirSync(folder).sort();
// FrontLit counts every entry under the pages folder, nested ones included.
const countEntries = (dir) =>
  readdirSync(dir).reduce((n, name) => n + 1 + (statSync(join(dir, name)).isDirectory() ? countEntries(join(dir, name)) : 0), 0);
if (countEntries(folder) > LIMITS.files) error(folder, "", "PAGES_LIMIT", `More than ${LIMITS.files} entries in the pages folder (every file and folder counts, not only .json).`);
const pages = [];
for (const name of entries) {
  const file = join(folder, name);
  if (statSync(file).isDirectory()) {
    error(file, "", "NESTED_PAGES", "Pages must sit directly in the pages folder; nested folders aren't supported yet.");
    continue;
  }
  if (!name.endsWith(".json")) continue;
  const slug = name === "index.json" ? "" : name.slice(0, -5);
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    error(file, "", "INVALID_PAGE_PATH", "Page file names are lowercase letters, numbers and hyphens, e.g. pricing.json.");
    continue;
  }
  if (RESERVED.includes(slug)) {
    error(file, "", "RESERVED_ROUTE", `/${slug} is reserved by the site.`);
    continue;
  }
  const text = readFileSync(file, "utf8");
  if (Buffer.byteLength(text) > LIMITS.bytes) {
    error(file, "", "PAGE_TOO_LARGE", "Page files must be under 2 MB.");
    continue;
  }
  const route = slug ? `/${slug}` : "/";
  const parsed = parseJson(file, text);
  if (!parsed) {
    pages.push({ file, route, published: true });
    continue;
  }
  const page = parsed.value;
  const problems = [];
  validate(PAGE_SCHEMA, page, [], problems);
  for (const p of problems) error(file, ptr(p.path), "INVALID_PAGE", p.message);
  pages.push({ file, route, published: page?.published !== false, page: problems.length ? null : page, text });
  if (typeOf(page) === "object") {
    checkMarkdown(file, PAGE_SCHEMA, page);
    checkMedia(file, PAGE_SCHEMA, page);
    checkStrings(file, PAGE_SCHEMA, page);
  }
  if (problems.length) continue;

  if (page.$schema !== PAGE_URL) warn(file, "/$schema", "SCHEMA_URL", `Set "$schema": "${PAGE_URL}".`);
  const feeds = page.layout.filter((b) => b.name === "content-feed").length;
  if (FEED_PAGES.includes(slug) && feeds !== 1)
    error(file, "/layout", "CONTENT_FEED_REQUIRED", `${route} needs exactly one { "name": "content-feed" } block.`);
  if (!FEED_PAGES.includes(slug) && feeds)
    error(file, "/layout", "CONTENT_FEED_NOT_ALLOWED", "Only the blog, docs and changelog pages can have a content-feed block.");
  if (!page.title) warn(file, "/title", "SEO_TITLE_MISSING", "Add a title for search results and the browser tab.");
  if ((page.title?.length ?? 0) > 60) warn(file, "/title", "SEO_TITLE_LONG", "Titles over 60 characters get cut off in search results.");
  if (!page.description) warn(file, "/description", "SEO_DESCRIPTION_MISSING", "Add a description for search results and link previews.");
  if ((page.description?.length ?? 0) > 160) warn(file, "/description", "SEO_DESCRIPTION_LONG", "Descriptions over 160 characters get cut off in search results.");

  const blocks = PAGE_SCHEMA.properties.layout.items.anyOf;
  let h1 = 0;
  page.layout.forEach((block, i) => {
    const schema = blocks.find((s) => s.properties.name.const === block.name)?.properties.settings;
    const settings = block.settings ?? {};
    const level = settings.titleLevel ?? (block.name === "hero" ? "h1" : "h2");
    if (level === "h1" && ("title" in (schema?.properties ?? {}))) h1++;
    // Unset settings fall back to block defaults, which are FrontLit demo copy.
    // Link targets aren't copy: canonical form drops one equal to its default,
    // so an unset target is checked as a link instead (below).
    for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
      if (key in settings || !("default" in prop) || prop.enum || LINK_KEYS.has(key)) continue;
      const d = prop.default;
      if ((typeof d === "string" && d) || (Array.isArray(d) && d.length) || (typeOf(d) === "object" && Object.keys(d).length))
        warn(file, ptr(["layout", i, "settings", key]), "DEMO_CONTENT", `Unset, so it renders the block default ${JSON.stringify(d).slice(0, 60)}. Set it, or "" / [] to hide it (fine if that default is exactly what you want).`);
    }
  });
  // FrontLit's content feed always renders the page's H1 itself
  // ("<Site title> Blog", "Help Center" or "Changelog").
  if (feeds) {
    if (h1) warn(file, "/layout", "HEADING_LEVEL", `The content feed renders this page's H1; set "titleLevel": "h2" on the other ${h1} H1 title(s) (a hero defaults to h1).`);
  } else if (h1 !== 1) warn(file, "/layout", "HEADING_LEVEL", `${h1} H1 titles; use exactly one (the hero's).`);
}

// --- site.json -----------------------------------------------------------

let site = null;
let siteText = null;
if (existsSync(siteFile)) {
  siteText = readFileSync(siteFile, "utf8");
  const parsed = parseJson(siteFile, siteText);
  if (parsed) {
    const problems = [];
    validate(SITE_SCHEMA, parsed.value, [], problems);
    for (const p of problems) error(siteFile, ptr(p.path), "INVALID_SITE", p.message);
    if (!problems.length) {
      site = parsed.value;
      if (site.$schema !== SITE_URL) warn(siteFile, "/$schema", "SCHEMA_URL", `Set "$schema": "${SITE_URL}".`);
      checkMarkdown(siteFile, SITE_SCHEMA, site);
      checkMedia(siteFile, SITE_SCHEMA, site);
      checkStrings(siteFile, SITE_SCHEMA, site);
    }
  }
}

// --- Links -----------------------------------------------------------------

const routes = new Set(pages.filter((p) => p.published).map((p) => p.route));
for (const r of site?.redirects ?? []) routes.add(r.from.replace(/\/+$/, "") || "/");
const exists = (href) => {
  const target = href.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return routes.has(target) || DYNAMIC_PREFIXES.some((p) => target.startsWith(p)) || RESERVED.includes(target.slice(1));
};
// In-page anchors: FrontLit ignores the #fragment, so a missing cssId is a warning.
const anchors = new Map(
  pages.filter((p) => p.page).map((p) => [p.route, new Set(p.page.layout.map((b) => b.settings?.cssId).filter(Boolean))]),
);
const checkAnchor = (file, link) => {
  const [rest, fragment] = link.href.split("#", 2);
  if (!fragment) return;
  const route = rest.split("?")[0].replace(/\/+$/, "") || "/";
  const ids = anchors.get(route);
  if (ids && !ids.has(decodeURIComponent(fragment)))
    warn(file, ptr(link.path), "ANCHOR_MISSING", `No block on ${route} has "cssId": "${fragment}", so ${link.href} won't scroll anywhere.`);
};
for (const part of ["header", "footer"])
  for (const link of internalLinks(site?.[part], [part])) {
    if (!exists(link.href)) error(siteFile, ptr(link.path), "LINK_TARGET_MISSING", `${link.href} isn't a published page; the release would fail.`);
    else checkAnchor(siteFile, link);
  }
const blockSchemas = PAGE_SCHEMA.properties.layout.items.anyOf;
for (const p of pages)
  if (p.page) {
    for (const link of internalLinks(p.page.layout, ["layout"])) {
      if (!exists(link.href)) warn(p.file, ptr(link.path), "LINK_TARGET_MISSING", `${link.href} isn't a published page in this folder.`);
      else checkAnchor(p.file, link);
    }
    // A button with a caption but no action links to the block's default target.
    p.page.layout.forEach((block, i) => {
      const props = blockSchemas.find((s) => s.properties.name.const === block.name)?.properties.settings?.properties ?? {};
      const settings = block.settings ?? {};
      for (const key of Object.keys(props).filter((k) => LINK_KEYS.has(k) && !(k in settings))) {
        const target = props[key].default;
        const caption = key.replace(/Action$|Href$/, "Caption").replace(/^cta$/, "ctaLabel");
        const shown = caption in settings ? settings[caption] : props[caption]?.default;
        if (typeof target === "string" && shown && target.startsWith("/") && !exists(target))
          warn(p.file, ptr(["layout", i, "settings", key]), "LINK_TARGET_MISSING", `Unset, so the button links to the block default ${target}, which isn't a published page.`);
      }
    });
  }

// --- Report ------------------------------------------------------------------

if (fix && !errors.length) {
  let changed = 0;
  for (const p of pages) {
    if (!p.page) continue;
    const next = canonicalPage(p.page);
    if (next !== p.text) writeFileSync(p.file, next), changed++;
  }
  if (site) {
    const next = canonicalSite(site);
    if (next !== siteText) writeFileSync(siteFile, next), changed++;
  }
  console.log(`Formatted ${changed} file(s).`);
}
const otherLines = new Set(otherWarnings.map(w => w.line));
const detailedWarnings = warnings.filter(w => !otherLines.has(w));
if (detailedWarnings.length) console.log(`Warnings${changedFiles ? " in changed files" : ""}:\n${detailedWarnings.join("\n")}\n`);
if (otherWarnings.length) {
  const counts = new Map();
  for (const { code } of otherWarnings) counts.set(code, (counts.get(code) ?? 0) + 1);
  console.log(`Other files: ${otherWarnings.length} warning(s) (${[...counts].map(([code, n]) => `${code}: ${n}`).join(", ")}). Run without --changed for details.\n`);
}
if (errors.length) {
  console.log(`Errors:\n${errors.join("\n")}\n`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s) in ${pages.length} page(s)${BY}. Nothing will go live until the errors are fixed.`);
  if (ruleErrors) console.log(OUTDATED_HINT);
  process.exit(1);
}
console.log(`OK: ${pages.length} page(s)${site ? " and site.json" : ""}, ${warnings.length} warning(s)${BY}.`);
