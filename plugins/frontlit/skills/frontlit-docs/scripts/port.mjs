#!/usr/bin/env node
// Convert an existing docs site into a FrontLit docs folder. No dependencies, Node 18+.
// It reads the source as data only: navigation configs written in JS/TS are read statically
// (never imported or evaluated), and anything it cannot read is reported instead.
// See references/porting.md, "Automated conversion", for what to review afterwards.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, relative, sep, posix } from "node:path";

const USAGE = `Usage: node port.mjs <source-content-dir> <target-docs-dir>
  [--from=auto|docusaurus|mintlify|nextra|fumadocs|vitepress|gitbook|markdown]
  [--prefix=<path>]        put every page under /docs/<path>/ and <target>/<path>/
  [--assets-base=<https-url>] turn relative image paths into URLs on the old site
  [--old-base=<path>]      URL path the old site served the docs under (Docusaurus: "docs")
  [--dry-run] [--json]`;
const FRAMEWORKS = ["auto", "docusaurus", "mintlify", "nextra", "fumadocs", "vitepress", "gitbook", "markdown"];

// ---------------------------------------------------------------- mapping tables
const SUPPORTED = ["Callout", "Tabs", "Tab", "Steps", "Step", "Cards", "Card", "Accordions", "Accordion", "CodeGroup", "TypeTable"];
// Admonition/callout type → FrontLit Callout type.
const CALLOUT_TYPE = {
  note: "note", tip: "tip", info: "info", warning: "warning", danger: "danger",
  warn: "warning", caution: "warning", important: "info", success: "success", check: "success",
  idea: "tip", error: "danger", secondary: "note", default: "info",
};
// Mintlify/Nextra/Fumadocs callout components → Callout type.
const CALLOUT_TAGS = {
  Note: "note", Tip: "tip", Info: "info", Warning: "warning", Danger: "danger", Check: "success",
  Success: "success", Caution: "warning", Important: "info", Error: "danger",
};
const GENERIC_CALLOUTS = ["Callout", "Admonition", "Aside"]; // take a type="…" prop
const CONTAINER_ALIASES = { CardGroup: "Cards", Columns: "Cards", "Cards.Card": "Card", AccordionGroup: "Accordions", TabItem: "Tab", "Tabs.Tab": "Tab", RequestExample: "CodeGroup", ResponseExample: "CodeGroup" };
const UNWRAP_BLOCK = ["div", "p", "section", "article", "main", "center", "figure", "figcaption", "Frame", "Bleed", "Fragment"];
const UNWRAP_INLINE = ["span", "small", "u", "mark", "font", "sup", "sub", "abbr", "label", "Tooltip"];
const INLINE_MARK = { b: "**", strong: "**", i: "*", em: "*", s: "~~", del: "~~", strike: "~~" };
const EMBEDS = ["iframe", "video", "Video", "YouTube", "Embed", "Loom", "audio"];
const VOID = new Set(["br", "img", "hr", "input", "source", "wbr", "col", "meta", "link"]);
const HTML_TAGS = new Set("a abbr article aside audio b blockquote br button caption center code col dd del details div dl dt em embed figcaption figure font footer h1 h2 h3 h4 h5 h6 header hr i iframe img input kbd label li link main mark meta nav object ol p path picture pre s script section small source span strike strong style sub summary sup svg table tbody td th thead tr u ul video wbr".split(" "));
// Code fence flags with no FrontLit equivalent; dropped from the info string.
const FENCE_FLAGS = /^(showLineNumbers|live|twoslash|wrap|lines|expandable|noCopy|copy|line-numbers|npm2yarn|\w[\w-]*=.*)$/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|csv|txt|json|ya?ml|mp4|webm|mov|mp3)$/i;

// ---------------------------------------------------------------- arguments
function usage(message, code = 2) {
  (code ? console.error : console.log)(`${message}\n\n${USAGE}`);
  process.exit(code);
}
const opts = { from: "auto", prefix: "", assetsBase: "", oldBase: undefined, dryRun: false, json: false };
const positional = [];
for (const arg of process.argv.slice(2)) {
  const [flag, value] = arg.split(/=(.*)/s);
  if (arg === "--help" || arg === "-h") usage("Convert a docs site into a FrontLit docs folder.", 0);
  else if (!arg.startsWith("--")) positional.push(arg);
  else if (flag === "--from") opts.from = value;
  else if (flag === "--prefix") opts.prefix = (value ?? "").replace(/^\/+|\/+$/g, "");
  else if (flag === "--assets-base") opts.assetsBase = value ?? "";
  else if (flag === "--old-base") opts.oldBase = (value ?? "").replace(/^\/+|\/+$/g, "");
  else if (arg === "--dry-run") opts.dryRun = true;
  else if (arg === "--json") opts.json = true;
  else usage(`Unknown option ${arg}.`);
}
if (positional.length !== 2) usage("Pass the source content folder and the target docs folder.");
const sourceDir = resolve(positional[0]);
const targetDir = resolve(positional[1]);
if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) usage(`Source folder ${positional[0]} not found.`);
if (!FRAMEWORKS.includes(opts.from)) usage(`--from must be one of ${FRAMEWORKS.join(", ")}.`);
if (opts.prefix && !/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(opts.prefix)) usage("--prefix must be lowercase letters, digits and hyphens, e.g. --prefix=legacy.");
if (["collections", "search"].includes(opts.prefix.split("/")[0])) usage(`--prefix=${opts.prefix} is a reserved route.`);
if (opts.assetsBase) {
  if (!/^https:\/\/[^/]+/i.test(opts.assetsBase)) usage("--assets-base must be an absolute https:// URL.");
  if (!opts.assetsBase.endsWith("/")) opts.assetsBase += "/";
}

// ---------------------------------------------------------------- report
// redirects: old URL → new route for the pages whose URL changes. port-redirects.json holds
// every page (unchanged ones too), so redirects.mjs can choose a path prefix for the old host.
const report = { framework: "", navigation: "", pages: [], sections: [], redirects: {}, review: [], notes: [] };
const review = (file, kind, detail) => {
  if (!report.review.some((r) => r.file === file && r.kind === kind && r.detail === detail)) report.review.push({ file, kind, detail });
};

// ---------------------------------------------------------------- small helpers
const readText = (path) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const readJson = (path) => { try { return JSON.parse(readText(path)); } catch { return undefined; } };
const stripNumber = (seg) => seg.replace(/^\d+[-_.](?=.)/, ""); // Docusaurus number prefixes: 01-intro → intro
const slugSeg = (s) => String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const slugPath = (p) => p.split("/").map(slugSeg).filter(Boolean).join("/");
const titleCase = (s) => String(s).replace(/[-_]+/g, " ").trim().replace(/^\w/, (c) => c.toUpperCase());
const trimSlashes = (s) => s.replace(/^\/+|\/+$/g, "");
const isIndexName = (name) => /^(index|readme)$/i.test(name);
const quoteProp = (v) => (!v.includes('"') ? `"${v}"` : !v.includes("'") ? `'${v}'` : `"${v.replace(/"/g, "&quot;")}"`);
const yamlString = (s) =>
  /^[A-Za-z0-9(][^:#\n"'\\]*$/.test(s) && !/\s$/.test(s) && !/^(true|false|yes|no|null|on|off|~|[-+]?[\d.][\d._]*)$/i.test(s) ? s : JSON.stringify(s);

// Top-level `key: value` YAML pairs (frontmatter, _category_.yml); block scalars are joined, nested data skipped.
function parseYamlish(text) {
  const out = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/);
    if (!m) continue;
    const v = (m[2] ?? "").trim();
    if (/^[>|][-+]?$/.test(v)) {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) block.push(lines[++i].trim());
      out[m[1]] = v[0] === ">" ? block.filter(Boolean).join(" ") : block.join("\n").trim();
    } else if (/^"(.*)"$/.test(v)) {
      try { out[m[1]] = JSON.parse(v); } catch { out[m[1]] = v.slice(1, -1); }
    } else if (/^'(.*)'$/.test(v)) out[m[1]] = v.slice(1, -1).replace(/''/g, "'");
    else if (/^(true|false)$/i.test(v)) out[m[1]] = v.toLowerCase() === "true";
    else if (/^-?\d+(\.\d+)?$/.test(v)) out[m[1]] = Number(v);
    else if (v && v !== "~" && v !== "null") out[m[1]] = v.replace(/\s+#.*$/, "");
  }
  return out;
}

// Reads a JS/TS object or array literal starting at `start` as data, without running it.
// Returns undefined when the literal uses anything other than strings, numbers, booleans,
// null, arrays and objects (variables, function calls, spreads, template expressions).
function readLiteral(src, start) {
  let i = start;
  let out = "";
  const depth = [];
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (src.startsWith("//", i)) { i = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i); continue; }
    if (src.startsWith("/*", i)) { i = src.indexOf("*/", i) < 0 ? src.length : src.indexOf("*/", i) + 2; continue; }
    if (c === "{" || c === "[") { depth.push(c); out += c; i++; continue; }
    if (c === "}" || c === "]") {
      out = out.replace(/,\s*$/, "") + c;
      depth.pop();
      i++;
      if (!depth.length) { try { return JSON.parse(out); } catch { return undefined; } }
      continue;
    }
    if (!depth.length) return undefined;
    if (c === "," || c === ":") { out += c; i++; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let value = "";
      for (i++; i < src.length && src[i] !== c; i++) {
        if (src[i] === "\\") { i++; value += { n: "\n", t: "\t" }[src[i]] ?? src[i]; }
        else value += src[i];
      }
      if (c === "`" && value.includes("${")) return undefined;
      out += JSON.stringify(value);
      i++;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(src.slice(i, i + 32));
    if (num) { out += num[0]; i += num[0].length; continue; }
    const ident = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 200));
    if (!ident) return undefined;
    i += ident[0].length;
    if (/^\s*:/.test(src.slice(i, i + 50)) && /[{,]\s*$/.test(out)) out += JSON.stringify(ident[0]);
    else if (["true", "false", "null"].includes(ident[0])) out += ident[0];
    else if (ident[0] === "undefined") out += "null";
    else return undefined;
  }
  return undefined;
}
// The first literal assigned or exported in a JS/TS module, or after `key:`.
function readLiteralAfter(src, pattern) {
  for (const m of src.matchAll(pattern)) {
    const at = m.index + m[0].length;
    const skip = /^\s*/.exec(src.slice(at))[0].length;
    if (!"{[".includes(src[at + skip])) continue;
    const value = readLiteral(src, at + skip);
    if (value !== undefined) return value;
  }
  return undefined;
}
const MODULE_EXPORT = /(?:module\.exports\s*=|export\s+default|(?:const|let|var)\s+\w+(?:\s*:\s*[\w.<>[\]]+)?\s*=)\s*(?:\w+\s*\(\s*)?/g;

// ---------------------------------------------------------------- source pages
const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (name.startsWith(".") || name === "node_modules" || resolve(path) === targetDir) continue;
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!/\.(mdx?|markdown)$/i.test(name)) continue;
    const src = relative(sourceDir, path).split(sep).join("/");
    if (name.startsWith("_")) { report.notes.push(`Skipped partial ${src} (files starting with "_" are not pages); inline it where it is imported.`); continue; }
    if (name === "SUMMARY.md" && dir === sourceDir) continue;
    pages.push({ src, abs: path, key: src.replace(/\.(mdx?|markdown)$/i, "") });
  }
})(sourceDir);
if (!pages.length) usage(`No .md or .mdx files under ${positional[0]}.`);

function findUp(names, levels = 2) {
  let dir = sourceDir;
  for (let n = 0; n <= levels; n++) {
    for (const name of names) if (existsSync(join(dir, name))) return join(dir, name);
    if (dirname(dir) === dir) break;
    dir = dirname(dir);
  }
  return null;
}
const anyFile = (re) => (function scan(dir) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".") || name === "node_modules") continue;
    const path = join(dir, name);
    if (re.test(name)) return true;
    if (statSync(path).isDirectory() && scan(path)) return true;
  }
  return false;
})(sourceDir);
const DOCUSAURUS_FILES = ["docusaurus.config.js", "docusaurus.config.ts", "docusaurus.config.mjs", "sidebars.js", "sidebars.ts", "sidebars.json", "sidebars.mjs", "sidebars.cjs"];
function detect() {
  const has = (name) => existsSync(join(sourceDir, name));
  if (findUp(DOCUSAURUS_FILES) || anyFile(/^_category_\.(json|ya?ml)$/)) return "docusaurus";
  if (has("mint.json") || (has("docs.json") && readJson(join(sourceDir, "docs.json"))?.navigation)) return "mintlify";
  if (has(".vitepress")) return "vitepress";
  if (has("SUMMARY.md") || has(".gitbook.yaml")) return "gitbook";
  if (anyFile(/^_meta\.(json|[jt]sx?|mjs)$/)) return "nextra";
  if (anyFile(/^meta\.json$/)) return "fumadocs";
  return "markdown";
}
const framework = opts.from === "auto" ? detect() : opts.from;
report.framework = framework;
let oldBase = opts.oldBase;
if (oldBase === undefined) {
  oldBase = "";
  if (framework === "docusaurus") {
    const config = findUp(DOCUSAURUS_FILES.slice(0, 3));
    const base = config && readText(config).match(/routeBasePath\s*:\s*['"]([^'"]*)['"]/);
    oldBase = trimSlashes(base ? base[1] : "docs");
  }
}

for (const p of pages) {
  const raw = readText(p.abs).replace(/^\uFEFF/, "");
  const m = raw.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  p.data = m ? parseYamlish(m[1]) : {};
  p.body = m ? raw.slice(m[0].length) : raw;
  p.oldPath = oldPathOf(p);
}
function oldPathOf(p) {
  const segs = p.key.split("/");
  let name = segs.pop();
  const slug = typeof p.data.slug === "string" ? p.data.slug : typeof p.data.permalink === "string" ? p.data.permalink : null;
  if (framework === "docusaurus") {
    const dirs = segs.map(stripNumber);
    name = stripNumber(name);
    const base = typeof p.data.id === "string" ? p.data.id : name;
    p.docId = [...dirs, base].join("/");
    if (slug) return trimSlashes(slug.startsWith("/") ? slug : [...dirs, slug].join("/"));
    if (isIndexName(name) || name === dirs.at(-1)) return dirs.join("/");
    return [...dirs, base].join("/");
  }
  if (slug && framework === "markdown") return trimSlashes(slug.replace(/\.html$/, ""));
  return isIndexName(name) ? segs.join("/") : [...segs, name].join("/");
}

const byOld = new Map(), byKey = new Map(), byDocId = new Map(), byLower = new Map();
for (const p of pages) {
  byOld.set(p.oldPath, p);
  byKey.set(p.key, p);
  if (p.docId) byDocId.set(p.docId, p);
  byLower.set(p.key.toLowerCase(), p);
}
// A page referenced by navigation or a link: old URL path, file path, or Docusaurus doc id.
function findPage(ref) {
  let r;
  try { r = decodeURI(ref); } catch { r = ref; }
  r = trimSlashes(r.replace(/^\.\//, "")).replace(/\.(mdx?|markdown|html)$/i, "");
  const options = [r, r.replace(/\/(index|readme)$/i, ""), `${r}/index`, `${r}/README`, r.split("/").map(stripNumber).join("/")];
  if (r === "index" || r === "README") options.push("");
  for (const o of options) {
    const hit = byOld.get(o) ?? byKey.get(o) ?? byDocId.get(o) ?? byLower.get(o.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------- navigation
const pagePosition = (p) => [p.data.sidebar_position, p.data.position, p.data.order, p.data.weight].find(Number.isFinite);
function dirMeta(dirKey) {
  const abs = join(sourceDir, dirKey);
  const meta = { labels: {} };
  if (framework === "docusaurus") {
    const json = readJson(join(abs, "_category_.json"));
    const yml = ["_category_.yml", "_category_.yaml"].map((n) => join(abs, n)).find(existsSync);
    const category = json ?? (yml ? parseYamlish(readText(yml)) : null);
    if (category) Object.assign(meta, { label: category.label, position: category.position });
  } else if (framework === "nextra") {
    let data = readJson(join(abs, "_meta.json"));
    const js = ["_meta.js", "_meta.ts", "_meta.tsx", "_meta.jsx", "_meta.mjs"].map((n) => join(abs, n)).find(existsSync);
    if (!data && js) {
      data = readLiteralAfter(readText(js), MODULE_EXPORT);
      if (!data) report.notes.push(`Could not read ${relative(sourceDir, js)} statically; used file names for its order.`);
    }
    if (data && typeof data === "object")
      meta.order = Object.entries(data).map(([name, v]) =>
        v?.type === "separator" ? { sep: typeof v.title === "string" ? v.title : "" } : { name, label: typeof v === "string" ? v : typeof v?.title === "string" ? v.title : undefined });
  } else if (framework === "fumadocs") {
    const data = readJson(join(abs, "meta.json"));
    if (data) {
      meta.label = data.title;
      meta.exclude = new Set();
      if (Array.isArray(data.pages))
        meta.order = data.pages.flatMap((item) => {
          const sepMatch = /^---(.*)---$/.exec(item);
          if (sepMatch) return [{ sep: sepMatch[1].trim() }];
          if (item === "...") return [{ rest: true }];
          if (item.startsWith("!")) { meta.exclude.add(item.slice(1)); return []; }
          if (/^\[|^https?:/.test(item)) return [];
          return [{ name: item.replace(/^\.\.\./, "") }];
        });
    }
  }
  return meta;
}
function orderedEntries(dirKey) {
  const inDir = (key) => (dirKey ? key.startsWith(`${dirKey}/`) : true);
  const restOf = (key) => (dirKey ? key.slice(dirKey.length + 1) : key);
  const entries = pages
    .filter((p) => inDir(p.key) && !restOf(p.key).includes("/"))
    .map((page) => ({ type: "page", page, name: restOf(page.key), position: pagePosition(page) }));
  const dirs = [...new Set(pages.filter((p) => inDir(p.key) && restOf(p.key).includes("/")).map((p) => restOf(p.key).split("/")[0]))];
  for (const name of dirs) {
    const key = dirKey ? `${dirKey}/${name}` : name;
    const sub = dirMeta(key);
    const index = pages.find((p) => p.key === `${key}/index` || p.key === `${key}/README`);
    entries.push({ type: "dir", key, name, label: sub.label, position: sub.position ?? (index && pagePosition(index)) });
  }
  const sorted = (list) =>
    list.sort((a, b) =>
      (b.type === "page" && isIndexName(b.name)) - (a.type === "page" && isIndexName(a.name)) ||
      (a.position ?? Infinity) - (b.position ?? Infinity) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }));
  const meta = dirMeta(dirKey);
  if (!meta.order) return sorted(entries);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const out = [];
  let restAt = -1;
  for (const item of meta.order) {
    if (item.sep !== undefined) { if (item.sep) out.push({ type: "sep", label: item.sep }); }
    else if (item.rest) restAt = out.length;
    else if (byName.has(item.name)) {
      const e = byName.get(item.name);
      byName.delete(item.name);
      if (item.label) e.label = item.label;
      out.push(e);
    }
  }
  const rest = sorted([...byName.values()].filter((e) => !meta.exclude?.has(e.name)));
  out.splice(restAt < 0 ? out.length : restAt, 0, ...rest);
  return out;
}
const flatten = (e) => (e.type === "page" ? [{ page: e.page, label: e.label }] : e.type === "dir" ? orderedEntries(e.key).flatMap(flatten) : []);
// Groups from the folder tree: top-level folders (or separators) become groups; root pages form unnamed runs.
function directoryGroups(dirKey = "") {
  const groups = [];
  let current = null, run = null;
  for (const e of orderedEntries(dirKey)) {
    if (e.type === "sep") { current = { label: e.label, folder: slugSeg(e.label), items: [] }; groups.push(current); continue; }
    if (current) { current.items.push(...flatten(e)); continue; }
    if (e.type === "dir") {
      groups.push({ label: e.label ?? titleCase(stripNumber(e.name)), folder: slugSeg(stripNumber(e.name)), dir: e.key, items: flatten(e) });
      run = null;
    } else {
      if (!run) groups.push((run = { label: null, folder: null, items: [] }));
      run.items.push(...flatten(e));
    }
  }
  return groups;
}
function refItem(ref, label, origin) {
  const page = findPage(ref);
  if (!page) review(origin, "navigation", `Entry "${ref}" does not match a page; skipped.`);
  return page ? [{ page, label }] : [];
}
function pushRun(groups, items) {
  if (!items.length) return;
  const last = groups.at(-1);
  if (last && last.label === null) last.items.push(...items);
  else groups.push({ label: null, folder: null, items });
}

function docusaurusNav() {
  const file = findUp(["sidebars.json", "sidebars.js", "sidebars.ts", "sidebars.mjs", "sidebars.cjs"]);
  if (!file) return null;
  const name = relative(sourceDir, file).split(sep).join("/");
  const data = file.endsWith(".json") ? readJson(file) : readLiteralAfter(readText(file), MODULE_EXPORT);
  if (!data || typeof data !== "object") {
    review(name, "navigation", "Could not read the sidebar statically; ordered pages by folders, _category_ files and sidebar_position instead.");
    return null;
  }
  const asCategory = (item) =>
    item?.type === "category" ? item
      : item && typeof item === "object" && !item.type && Object.keys(item).length === 1 && Array.isArray(Object.values(item)[0])
        ? { label: Object.keys(item)[0], items: Object.values(item)[0] } : null;
  const autogenDir = (dirName) => {
    const want = trimSlashes(dirName ?? ".").replace(/^\.$/, "");
    const key = [...new Set(pages.map((p) => posix.dirname(p.key)))].find((d) => d === want || d.split("/").map(stripNumber).join("/") === want);
    return want === "" ? "" : key ?? want;
  };
  const items = (list) =>
    (Array.isArray(list) ? list : []).flatMap((item) => {
      if (typeof item === "string") return refItem(item, undefined, name);
      const cat = asCategory(item);
      if (cat) return [...(cat.link?.type === "doc" ? refItem(cat.link.id, undefined, name) : []), ...items(cat.items)];
      if (item?.type === "doc" || item?.type === "ref") return refItem(item.id, item.label, name);
      if (item?.type === "autogenerated") return orderedEntries(autogenDir(item.dirName)).flatMap(flatten);
      if (item?.type === "link" || item?.type === "html") report.notes.push(`Sidebar ${item.type} item "${item.label ?? item.value ?? ""}" is not a page; add it to a page or the site navigation by hand.`);
      return [];
    });
  const groups = [];
  for (const sidebar of Object.values(data)) {
    const list = Array.isArray(sidebar) ? sidebar : Object.entries(sidebar ?? {}).map(([label, its]) => ({ type: "category", label, items: its }));
    for (const item of list) {
      const cat = asCategory(item);
      if (cat) groups.push({ label: cat.label, folder: slugSeg(cat.label), items: items([item]) });
      else if (item?.type === "autogenerated") groups.push(...directoryGroups(autogenDir(item.dirName)));
      else pushRun(groups, items([item]));
    }
  }
  report.navigation = `${name} (read statically)`;
  return groups;
}
function mintlifyNav() {
  const file = ["docs.json", "mint.json"].map((n) => join(sourceDir, n)).find(existsSync);
  const data = file && readJson(file);
  if (!data?.navigation) {
    if (file) review(relative(sourceDir, file), "navigation", "No navigation found; ordered pages by folder.");
    return null;
  }
  const name = relative(sourceDir, file);
  const groups = [];
  const visit = (node, group) => {
    if (typeof node === "string") {
      const its = refItem(node, undefined, name);
      return group ? group.items.push(...its) : pushRun(groups, its);
    }
    if (Array.isArray(node)) return node.forEach((n) => visit(n, group));
    if (!node || typeof node !== "object") return;
    if (typeof node.group === "string") {
      if (group) return visit(node.pages ?? [], group); // nested group: flattened into its top group
      const g = { label: node.group, folder: slugSeg(node.group), items: [] };
      groups.push(g);
      return visit(node.pages ?? [], g);
    }
    for (const key of ["tabs", "anchors", "dropdowns", "products", "versions", "languages", "menu", "groups", "pages"]) if (node[key]) visit(node[key], group);
  };
  visit(data.navigation, null);
  report.navigation = name;
  return groups;
}
function vitepressNav() {
  const file = [".vitepress/config.mts", ".vitepress/config.ts", ".vitepress/config.js", ".vitepress/config.mjs"].map((n) => join(sourceDir, n)).find(existsSync);
  if (!file) return null;
  const name = relative(sourceDir, file).split(sep).join("/");
  const data = readLiteralAfter(readText(file), /\bsidebar\s*:\s*/g);
  if (!data) {
    review(name, "navigation", "Could not read the sidebar statically (it is built by code); ordered pages by folder instead.");
    return null;
  }
  const items = (list) => (list ?? []).flatMap((i) => [...(i.link ? refItem(i.link, i.text, name) : []), ...items(i.items)]);
  const groups = [];
  for (const list of Array.isArray(data) ? [data] : Object.values(data))
    for (const item of Array.isArray(list) ? list : list?.items ?? [])
      if (item.items) groups.push({ label: item.text, folder: slugSeg(item.text ?? "group"), items: items([item]) });
      else pushRun(groups, items([item]));
  report.navigation = `${name} (read statically)`;
  return groups;
}
function gitbookNav() {
  const file = join(sourceDir, "SUMMARY.md");
  if (!existsSync(file)) return null;
  const groups = [];
  let group = null;
  for (const line of readText(file).split("\n")) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (heading) { groups.push((group = { label: heading[1], folder: slugSeg(heading[1]), items: [] })); continue; }
    const link = line.match(/^\s*[-*+]\s+\[([^\]]*)\]\(<?([^)>\s]+)>?\)/);
    if (!link) continue;
    const its = refItem(link[2], link[1], "SUMMARY.md");
    if (group) group.items.push(...its);
    else pushRun(groups, its);
  }
  report.navigation = "SUMMARY.md";
  return groups;
}
const NAV = { docusaurus: docusaurusNav, mintlify: mintlifyNav, vitepress: vitepressNav, gitbook: gitbookNav };
let groups = NAV[framework]?.() ?? null;
if (!groups) {
  groups = directoryGroups("");
  report.navigation ||= { nextra: "_meta files", fumadocs: "meta.json files", docusaurus: "folders, _category_ files and sidebar_position" }[framework] ?? "folder structure";
}
// Each page once, in the first place navigation lists it; unlisted pages follow, grouped by folder.
const placed = new Set();
for (const g of groups) g.items = g.items.filter(({ page }) => !placed.has(page) && placed.add(page));
const unlisted = pages.filter((p) => !placed.has(p));
if (unlisted.length) {
  for (const g of directoryGroups("")) {
    g.items = g.items.filter(({ page }) => unlisted.includes(page));
    const same = groups.find((x) => x.folder === g.folder && (x.folder || x === groups.at(-1)));
    if (same) same.items.push(...g.items);
    else groups.push(g);
  }
  for (const p of unlisted) review(p.src, "navigation", "Not in the source navigation; placed by folder. Check whether it should be published.");
}
groups = groups.filter((g) => g.items.length);
const usedFolders = new Set();
for (const g of groups) {
  if (!g.folder) continue;
  let folder = g.folder;
  for (let n = 2; usedFolders.has(folder); n++) folder = `${g.folder}-${n}`;
  usedFolders.add((g.folder = folder));
}

// ---------------------------------------------------------------- layout: files, slugs, nav_order
const prefix = opts.prefix;
const targets = new Set();
const slugs = new Map();
groups.forEach((g, gi) => {
  g.section = prefix ? prefix.split("/")[0] : g.folder ?? "";
  const indexInSection = groups.slice(0, gi).filter((x) => (prefix ? true : (x.folder ?? "") === (g.folder ?? ""))).length;
  g.items.forEach(({ page: p, label }, pos) => {
    p.group = g;
    p.navLabel = label;
    p.navOrder = indexInSection * 1000 + (pos + 1) * 10;
    const rest = p.key.split("/").map((s) => slugSeg(stripNumber(s)) || "page");
    if (isIndexName(rest.at(-1))) rest[rest.length - 1] = "index";
    if (g.folder && rest.length > 1 && rest[0] === g.folder) rest.shift();
    const base = [prefix, g.folder, ...rest].filter(Boolean).join("/");
    let target = base;
    for (let n = 2; targets.has(target); n++) target = `${base}-${n}`;
    targets.add(target);
    p.target = `${target}.md`;
    const route = target.replace(/(^|\/)index$/, "") || "index";
    p.slug = slugPath([prefix, p.oldPath].filter(Boolean).join("/")) || "index";
    p.writeSlug = p.slug !== route;
    if (slugPath(p.oldPath) !== p.oldPath) review(p.src, "url-changed", `/${p.oldPath} is not a valid FrontLit path; it becomes /docs/${p.slug}.`);
    if (["collections", "search"].includes(p.slug.split("/")[0])) review(p.src, "reserved-route", `/docs/${p.slug} is reserved; set another slug (or use --prefix).`);
    if (slugs.has(p.slug)) review(p.src, "duplicate-route", `/docs/${p.slug} is also used by ${slugs.get(p.slug)}.`);
    slugs.set(p.slug, p.src);
  });
});

// ---------------------------------------------------------------- body conversion
function convertPage(p) {
  const fences = [];
  const codes = [];
  const flag = (kind, detail) => review(p.src, kind, detail);
  const code = (text) => `\u0001${codes.push(text) - 1}\u0001`;
  const HANDLERS = handlerTable(); // element name → converter; closes over this page's state

  // Protect fenced code (one placeholder line each) and inline code from every rewrite below.
  let text = [];
  {
    const lines = p.body.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const open = lines[i].match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
      if (!open) { text.push(lines[i]); continue; }
      const fence = { indent: open[1], marker: open[2], info: open[3].trim(), lines: [] };
      for (i++; i < lines.length; i++) {
        const close = lines[i].match(/^[ \t]*(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fence.marker[0] && close[1].length >= fence.marker.length) break;
        fence.lines.push(lines[i]);
      }
      text.push(`${open[1]}\u0000${fences.push(fence) - 1}\u0000`);
    }
    text = text.join("\n").replace(/(?<!`)(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (m) => code(m));
  }

  // MDX comments, JSX whitespace, import/export statements.
  text = text.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\{\s*(['"]) \1\s*\}/g, " ");
  {
    const lines = text.split("\n");
    const out = [];
    const balance = (s) => (s.match(/[{([]/g) ?? []).length - (s.match(/[})\]]/g) ?? []).length;
    for (let i = 0; i < lines.length; i++) {
      const isImport = /^import\s+(['"]|.*\bfrom\s*['"]|[\w$]*\s*,?\s*\{[^}]*$|\*\s+as\s)/.test(lines[i]);
      const isExport = /^export\s+(?:default|const|let|var|function|async|class|type|interface|\{|\*)/.test(lines[i]);
      if (!isImport && !isExport) { out.push(lines[i]); continue; }
      let stmt = lines[i];
      const done = (s) => balance(s) <= 0 && (!isImport || /(?:from\s*|^import\s*)['"][^'"]*['"]\s*;?\s*$/.test(s));
      while (!done(stmt) && i + 1 < lines.length && lines[i + 1].trim()) stmt += `\n${lines[++i]}`;
    }
    text = out.join("\n");
  }

  // GitBook liquid tags.
  text = text
    .replace(/\{%\s*hint\s+style="(\w+)"\s*%\}/g, (_, t) => `\n<Callout type="${CALLOUT_TYPE[t] ?? "info"}">\n`)
    .replace(/\{%\s*endhint\s*%\}/g, "\n</Callout>\n")
    .replace(/\{%\s*tabs\s*%\}/g, "\n<Tabs>\n").replace(/\{%\s*endtabs\s*%\}/g, "\n</Tabs>\n")
    .replace(/\{%\s*tab\s+title="([^"]*)"\s*%\}/g, (_, t) => `\n<Tab title=${quoteProp(t)}>\n`).replace(/\{%\s*endtab\s*%\}/g, "\n</Tab>\n")
    .replace(/\{%\s*stepper\s*%\}/g, "\n<Steps>\n").replace(/\{%\s*endstepper\s*%\}/g, "\n</Steps>\n")
    .replace(/\{%\s*step\s*%\}/g, "\n<Step>\n").replace(/\{%\s*endstep\s*%\}/g, "\n</Step>\n")
    .replace(/\{%\s*embed\s+url="([^"]+)"(?:\s+caption="([^"]*)")?\s*%\}/g, (_, url, caption) => `\n[${caption || url}](${url})\n`)
    .replace(/\{%\s*endembed\s*%\}/g, "")
    .replace(/\{%\s*(?:end)?content-ref(?:\s+url="[^"]*")?\s*%\}/g, "")
    .replace(/\{%\s*code\s+([^%]*?)%\}\s*\n([ \t]*\u0000(\d+)\u0000)\s*\n\{%\s*endcode\s*%\}/g, (_, attrs, line, n) => {
      const title = attrs.match(/title="([^"]*)"/);
      if (title) fences[n].title = title[1];
      return line;
    });

  // ::: containers (Docusaurus, VitePress) → Callout, Accordion, CodeGroup.
  {
    const out = [];
    const stack = [];
    for (const line of text.split("\n")) {
      const open = line.match(/^(\s*):{3,}\s*([A-Za-z][\w-]*)(?:\[([^\]]*)\])?\s*(.*?)\s*(?:\{[^}]*\})?\s*$/);
      const close = /^\s*:{3,}\s*$/.test(line);
      if (open) {
        const [, indent, name, bracketTitle, rest] = open;
        const title = bracketTitle ?? rest;
        const type = CALLOUT_TYPE[name.toLowerCase()];
        if (type) { out.push(`${indent}<Callout type="${type}"${title ? ` title=${quoteProp(title)}` : ""}>`); stack.push(`${indent}</Callout>`); }
        else if (name === "details") { out.push(`${indent}<Accordion title=${quoteProp(title || "Details")}>`); stack.push(`${indent}</Accordion>`); }
        else if (name === "code-group") { out.push(`${indent}<CodeGroup>`); stack.push(`${indent}</CodeGroup>`); }
        else { out.push(line); stack.push(null); flag("unknown-container", `":::${name}" left in place.`); }
      } else if (close && stack.length) {
        const end = stack.pop();
        out.push(end ?? line);
      } else out.push(line);
    }
    text = out.join("\n");
  }

  // GitHub/Obsidian alerts: > [!NOTE] → Callout.
  text = text.replace(/^([ \t]*)>[ \t]*\[!(\w+)\][ \t]*(.*)\n((?:\1>.*(?:\n|$))*)/gm, (all, indent, kind, title, rest) => {
    const type = CALLOUT_TYPE[kind.toLowerCase()];
    if (!type) return all;
    const inner = rest.split("\n").map((l) => l.replace(new RegExp(`^${indent}>[ \\t]?`), "")).join("\n");
    return `${indent}<Callout type="${type}"${title ? ` title=${quoteProp(title)}` : ""}>\n\n${inner}\n\n${indent}</Callout>\n`;
  });

  text = elements(text, { parent: null });

  // Markdown the FrontLit validator rejects.
  text = text
    .split("\n")
    .map((line) => {
      let l = line;
      while (/^(\s*)(?:[-*+]|\d+[.)])[ \t]+((?:[-*+]|\d+[.)])(?:[ \t]|$))/.test(l)) l = l.replace(/^(\s*)(?:[-*+]|\d+[.)])[ \t]+/, "$1");
      l = l.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[[ xX]\]\s+/, "$1");
      if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(l)) l = l.replace(/:/g, "");
      l = l.replace(/(\*\*|__)(\u0001\d+\u0001)\1/g, "$2").replace(/(?<![*\w])([*_])(\u0001\d+\u0001)\1(?![*\w])/g, "$2");
      l = l.replace(/\[\s*!\[([^\]\n]*)\]\([^)\n]*\)\s*\]\(\s*<?([^)\s>]+)>?[^)\n]*\)/g, (_, alt, href) => `[${alt || href}](${href})`);
      l = l.replace(/(!?)\[((?:[^[\]\n]|\[[^[\]\n]*\])*)\]\(\s*(<[^>\n]*>|[^)\s]*)((?:\s+(?:"[^"\n]*"|'[^'\n]*'))?)\s*\)/g, (all, bang, label, dest, title) => {
        dest = dest.replace(/^<|>$/g, "");
        if (!dest) {
          flag(bang ? "empty-image" : "empty-link", `"${all.slice(0, 60)}" had no destination; kept the text.`);
          return label;
        }
        return bang ? `![${label}](${imageUrl(dest)}${title})` : `[${label}](${linkUrl(dest)}${title})`;
      });
      l = l.replace(/^(\s{0,3}\[[^\]\n]+\]:\s*)<?([^\s>]+)>?/, (_, lead, dest) => lead + (ASSET_EXT.test(dest) && !/^[a-z]+:/i.test(dest) ? imageUrl(dest) : linkUrl(dest)));
      return l;
    })
    .join("\n");

  // Title: frontmatter, else the leading H1 (which FrontLit renders, so it is removed).
  let title = typeof p.data.title === "string" || typeof p.data.title === "number" ? String(p.data.title) : "";
  let navFallback;
  const h1 = text.match(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/);
  if (h1) {
    const h1Text = restore(h1[1]).replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim();
    if (!title || framework === "docusaurus" || h1Text === title) {
      if (title && title !== h1Text) navFallback = title;
      title = h1Text;
      text = text.slice(h1[0].length);
    }
  }
  if (!title) {
    title = titleCase(p.key.split("/").at(-1));
    flag("title", `No title or leading H1; used "${title}".`);
  }

  // Blank lines around rich-block tags and standalone images; collapse runs of blank lines.
  {
    const tagLine = new RegExp(`^\\s*</?(${SUPPORTED.join("|")})\\b.*>\\s*$`);
    const imageLine = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
    const out = [];
    let blankAfter = false;
    for (const raw of text.split("\n")) {
      const line = raw.trim() ? raw.replace(/\s+$/, (m) => (m === "  " ? m : "")) : "";
      const special = tagLine.test(line) || imageLine.test(line);
      if (line && (special || blankAfter) && out.length && out.at(-1) !== "") out.push("");
      out.push(line);
      blankAfter = special;
    }
    text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Report what is left for a person (and the checker) to look at.
  {
    const scan = text.replace(/<TypeTable[\s\S]*?\/>/g, "").replace(/icon=\{\s*<\w+\s*\/>\s*\}/g, "");
    for (const m of scan.matchAll(/<\/?([A-Za-z][\w.-]*)(?=[\s/>])/g))
      if (!SUPPORTED.includes(m[1])) flag("unknown-component", `<${m[1]}> left in place; convert or remove it.`);
    for (const m of scan.matchAll(/(?<![\\\w])\{(?!\{)[A-Za-z_$][\w$.]*\}|\{\{[^}]*\}\}/g)) flag("expression", `"${m[0]}" is an MDX/Vue expression; write out its value.`);
    for (const m of scan.matchAll(/\{%\s*(\w+)/g)) flag("unknown-liquid", `"{% ${m[1]} %}" left in place.`);
    if (/\[\^[^\]]+\]/.test(scan)) flag("footnote", "Footnotes are unsupported; inline them in parentheses.");
  }

  p.title = title;
  p.navFallback = navFallback;
  return restore(text);

  function restore(s) {
    return s
      .replace(/^([ \t]*)\u0000(\d+)\u0000$/gm, (_, indent, n) => renderFence(fences[n], indent))
      .replace(/\u0001(\d+)\u0001/g, (_, n) => codes[n])
      .replace(/\u0001(\d+)\u0001/g, (_, n) => codes[n]);
  }
  function renderFence(f, indent) {
    let info = f.info;
    let title = f.title ?? info.match(/\btitle=(?:"([^"]*)"|'([^']*)')/)?.slice(1).find((v) => v !== undefined);
    const bracket = info.match(/\[([^\]]+)\]/)?.[1];
    info = info.replace(/\btitle=(?:"[^"]*"|'[^']*')/, " ").replace(/\[[^\]]*\]/, " ").replace(/\{[^}]*\}/g, " ");
    let [lang = "", ...rest] = info.trim().split(/\s+/).filter(Boolean);
    lang = lang.split(":")[0].replace(/[^\w+-]/g, "");
    if (/^npm2yarn$/i.test(rest.join(" "))) flag("code", "npm2yarn fence: add yarn/pnpm/bun variants in a CodeGroup by hand.");
    rest = rest.filter((w) => !FENCE_FLAGS.test(w));
    title ??= bracket ?? (rest.length && (framework === "mintlify" || f.inGroup) ? rest.join(" ") : undefined);
    if (f.inGroup && !title) title = lang || "Code";
    const body = f.lines
      .filter((l) => !/^\s*(\/\/|#|<!--|\/\*)\s*highlight-(next-line|start|end)\s*(-->|\*\/)?\s*$/.test(l))
      .map((l) => l.replace(/\s*(?:\/\/|#|<!--|\/\*)\s*\[!code [^\]]*\]\s*(?:-->|\*\/)?\s*$/, ""))
      .map((l) => (l.trim() ? indent + l.slice(Math.min(f.indent.length, l.match(/^[ \t]*/)[0].length)) : l));
    const head = `${indent}${f.marker}${lang}${title ? `${lang ? " " : ""}title=${quoteProp(title)}` : ""}`;
    return [head, ...body, `${indent}${f.marker}`].join("\n");
  }

  // ------------------------------------------------ JSX/HTML elements
  function elements(src, ctx) {
    let out = "";
    let i = 0;
    while (i < src.length) {
      const lt = src.indexOf("<", i);
      if (lt < 0) { out += src.slice(i); break; }
      out += src.slice(i, lt);
      i = lt + 1;
      const tag = readTag(src, lt);
      const known = tag && (HANDLERS[tag.name] || HTML_TAGS.has(tag.name.toLowerCase()));
      // Prose generics such as Array<string> or Promise<T>: wrap the whole type in backticks.
      if (/[\w\])]$/.test(out) && /[A-Za-z]/.test(src[lt + 1] ?? "") && !known) {
        const end = genericEnd(src, lt);
        if (end) {
          const ident = out.match(/[\w.]+$/)?.[0] ?? "";
          out = out.slice(0, out.length - ident.length) + code(`\`${ident}${src.slice(lt, end)}\``);
          i = end;
          continue;
        }
      }
      if (!tag || tag.closing) { out += "<"; continue; }
      const lower = tag.name.toLowerCase();
      let inner = null;
      let end = tag.end;
      if (!tag.selfClosing && !VOID.has(lower)) {
        const close = findClose(src, tag.end, tag.name);
        if (close) { inner = src.slice(tag.end, close.start); end = close.end; }
      }
      const handler = HANDLERS[tag.name];
      if (!handler) {
        // An unclosed, unknown tag in prose is a placeholder like <your-key>: make it inline code.
        if (inner === null && !tag.selfClosing && !HTML_TAGS.has(lower) && !tag.raw.includes("\n")) out += code(`\`${tag.raw}\``);
        else out += tag.raw + (inner !== null ? `${elements(inner, ctx)}</${tag.name}>` : "");
        i = end;
        continue;
      }
      const lineStart = out.slice(out.lastIndexOf("\n") + 1);
      const indent = /^[ \t]*$/.test(lineStart) ? lineStart : "";
      const lineText = src.slice(src.lastIndexOf("\n", lt) + 1, src.indexOf("\n", lt) < 0 ? src.length : src.indexOf("\n", lt));
      out += handler({ tag, inner: inner ?? "", hasInner: inner !== null, ctx, indent, lineText, after: src.slice(end, end + 200) });
      i = end;
    }
    return out;
  }
  function block(indent, open, inner, close) {
    const body = dedent(inner).split("\n").map((l) => (l.trim() ? indent + l : ""));
    return ["", "", indent + open, "", ...body, "", `${indent}</${close}>`, "", ""].join("\n");
  }
  function attr(tag, ...names) {
    for (const name of names) {
      const v = tag.attrs[name];
      if (typeof v !== "string") continue;
      if (/^(["'])[\s\S]*\1$/.test(v)) return v.slice(1, -1).replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const m = v.match(/^\{\s*(["'`])([\s\S]*)\1\s*\}$/);
      if (m && !m[2].includes("${")) return m[2];
      if (!/^[{"']/.test(v)) return v;
    }
    return undefined;
  }
  function callout(type, { tag, inner, ctx, indent }) {
    const title = attr(tag, "title");
    return block(indent, `<Callout type="${type}"${title ? ` title=${quoteProp(title)}` : ""}>`, elements(inner, { ...ctx, parent: "Callout" }), "Callout");
  }
  function wrapIn(container, args, render) {
    if (args.ctx.parent === container) return render(args.ctx);
    return block(args.indent, `<${container}>`, render({ ...args.ctx, parent: container }), container);
  }

  function handlerTable() {
    const h = {};
    for (const [name, type] of Object.entries(CALLOUT_TAGS)) h[name] = (a) => callout(type, a);
    for (const name of GENERIC_CALLOUTS)
      h[name] = (a) => {
        const raw = attr(a.tag, "type") ?? "info";
        const type = CALLOUT_TYPE[raw.toLowerCase()];
        if (!type) flag("callout-type", `<${name} type="${raw}"> mapped to info.`);
        return callout(type ?? "info", a);
      };
    h.Tabs = ({ tag, inner, ctx, indent }) => {
      const items = /^\{/.test(tag.attrs.items ?? "") ? readLiteral(tag.attrs.items.slice(1, -1), 0) : undefined;
      const values = /^\{/.test(tag.attrs.values ?? "") ? readLiteral(tag.attrs.values.slice(1, -1), 0) : undefined;
      const tabs = { labels: [], preset: Array.isArray(items) ? items.map(String) : [], values: {} };
      if (Array.isArray(values)) for (const v of values) if (v?.value !== undefined) tabs.values[v.value] = v.label ?? v.value;
      const body = elements(inner, { ...ctx, parent: "Tabs", tabs });
      return block(indent, `<Tabs items={${JSON.stringify(tabs.labels)}}>`, body, "Tabs");
    };
    h.Tab = ({ tag, inner, ctx, indent }) => {
      const body = elements(inner, { ...ctx, parent: "Tab" });
      if (!ctx.tabs) { flag("tabs", `<${tag.name}> outside <Tabs>; kept its content.`); return `\n\n${dedent(body)}\n\n`; }
      const value = attr(tag, "value");
      const label = attr(tag, "title", "label") ?? ctx.tabs.values[value] ?? value ?? ctx.tabs.preset[ctx.tabs.labels.length] ?? `Tab ${ctx.tabs.labels.length + 1}`;
      ctx.tabs.labels.push(label);
      return block(indent, `<Tab value=${quoteProp(label)}>`, body, "Tab");
    };
    h.Steps = ({ inner, ctx, indent }) => {
      let body = elements(inner, { ...ctx, parent: "Steps" });
      if (!/<Step>/.test(body)) {
        // Nextra: steps are the ### headings inside <Steps>.
        const parts = dedent(body).split(/\n(?=#{2,4} )/).filter((s) => s.trim());
        body = parts.map((s) => block("", "<Step>", s.replace(/^#{2,4} /, "### "), "Step")).join("");
      }
      return block(indent, "<Steps>", body, "Steps");
    };
    h.Step = (a) =>
      wrapIn("Steps", a, (ctx) => {
        const title = attr(a.tag, "title");
        const body = elements(a.inner, { ...ctx, parent: "Step" });
        return block(a.indent, "<Step>", title ? `### ${title}\n\n${dedent(body)}` : body, "Step");
      });
    h.Cards = ({ inner, ctx, indent }) => block(indent, "<Cards>", elements(inner, { ...ctx, parent: "Cards" }), "Cards");
    h.Card = (a) =>
      wrapIn("Cards", a, (ctx) => {
        const title = attr(a.tag, "title");
        const href = attr(a.tag, "href");
        const rawIcon = a.tag.attrs.icon;
        const icon = /^\{\s*<[A-Z]\w*\s*\/>\s*\}$/.test(rawIcon ?? "") ? `icon=${rawIcon}` : /^[A-Z][A-Za-z0-9]*$/.test(attr(a.tag, "icon") ?? "") ? `icon="${attr(a.tag, "icon")}"` : "";
        if (!title) flag("card", "A <Card> has no title; add one.");
        const props = [title ? `title=${quoteProp(title)}` : "", href ? `href=${quoteProp(linkUrl(href))}` : "", icon].filter(Boolean).join(" ");
        const body = elements(a.inner, { ...ctx, parent: "Card" });
        if (!body.trim()) return `\n\n${a.indent}<Card ${props} />\n\n`;
        return block(a.indent, `<Card ${props}>`, body, "Card");
      });
    h.Accordions = ({ tag, inner, ctx, indent }) => {
      const type = attr(tag, "type");
      return block(indent, `<Accordions${/^(single|multiple)$/.test(type ?? "") ? ` type="${type}"` : ""}>`, elements(inner, { ...ctx, parent: "Accordions" }), "Accordions");
    };
    h.Accordion = (a) =>
      wrapIn("Accordions", a, (ctx) => block(a.indent, `<Accordion title=${quoteProp(attr(a.tag, "title") ?? "Details")}>`, elements(a.inner, { ...ctx, parent: "Accordion" }), "Accordion"));
    h.details = (a) =>
      wrapIn("Accordions", a, (ctx) => {
        const summary = a.inner.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
        const title = summary ? restore(elements(summary[1], ctx)).replace(/[`*_]/g, "").replace(/\s+/g, " ").trim() : "Details";
        const body = summary ? a.inner.replace(summary[0], "") : a.inner;
        return block(a.indent, `<Accordion title=${quoteProp(title || "Details")}>`, elements(body, { ...ctx, parent: "Accordion" }), "Accordion");
      });
    h.CodeGroup = ({ inner, ctx, indent }) => {
      for (const m of inner.matchAll(/\u0000(\d+)\u0000/g)) fences[m[1]].inGroup = true;
      return block(indent, "<CodeGroup>", elements(inner, { ...ctx, parent: "CodeGroup" }), "CodeGroup");
    };
    h.TypeTable = ({ tag, inner, hasInner }) => tag.raw + (hasInner ? `${inner}</TypeTable>` : "");
    for (const [from, to] of Object.entries(CONTAINER_ALIASES)) h[from] = (a) => h[to]({ ...a, tag: { ...a.tag, name: to } });
    for (const name of UNWRAP_BLOCK)
      h[name] = ({ tag, inner, ctx }) => {
        const caption = attr(tag, "caption");
        return `\n\n${dedent(elements(inner, ctx))}${caption ? `\n\n${caption}` : ""}\n\n`;
      };
    for (const name of UNWRAP_INLINE) h[name] = ({ inner, ctx }) => elements(inner, ctx);
    for (const [name, mark] of Object.entries(INLINE_MARK)) h[name] = ({ inner, ctx }) => (inner.trim() ? `${mark}${elements(inner, ctx).trim()}${mark}` : "");
    h.code = h.kbd = h.Kbd = ({ inner }) => code(`\`${inner.replace(/<[^>]+>/g, "")}\``);
    h.Badge = ({ tag, inner, ctx }) => attr(tag, "text") ?? elements(inner, ctx);
    for (let n = 1; n <= 6; n++) h[`h${n}`] = ({ inner, ctx }) => `\n\n${"#".repeat(n)} ${elements(inner, ctx).replace(/\s+/g, " ").trim()}\n\n`;
    // A space in a table cell; nothing on a line of its own; a hard break (backslash) before more text.
    h.br = ({ lineText, after }) =>
      /^\s*\|/.test(lineText) ? " "
        : /^\s*<br\s*\/?>\s*$/i.test(lineText) ? ""
          : /^[ \t]*\n[ \t]*[^\s<]/.test(after) ? "\\"
            : /^[ \t]*(\n|$)/.test(after) ? "" : "\\\n";
    h.hr = () => "\n\n---\n\n";
    h.img = h.Image = ({ tag }) => {
      let src = attr(tag, "src");
      const required = tag.attrs.src?.match(/require\(\s*['"]([^'"]+)['"]\s*\)/) ?? tag.attrs.src?.match(/useBaseUrl\(\s*['"]([^'"]+)['"]\s*\)/);
      if (!src && required) src = required[1].replace(/^@site\/static/, "");
      if (!src) { flag("image", `${tag.raw.slice(0, 60)}: image source is an expression; write the URL by hand.`); return tag.raw; }
      return `![${attr(tag, "alt") ?? ""}](${src})`;
    };
    h.a = ({ tag, inner, ctx }) => {
      const href = attr(tag, "href");
      const body = elements(inner, ctx).trim();
      if (!href) return body;
      const image = body.match(/^!\[([^\]]*)\]\([^)]*\)$/);
      return `[${image ? image[1] || href : body}](${href})`;
    };
    for (const name of EMBEDS)
      h[name] = ({ tag, inner }) => {
        const id = attr(tag, "id", "videoId");
        const src = attr(tag, "src") ?? inner.match(/src="([^"]+)"/)?.[1] ?? (id && name === "YouTube" ? `https://www.youtube.com/watch?v=${id}` : null);
        if (!src) { flag("embed", `<${name}> has no source URL; replace it by hand.`); return tag.raw + (inner ? `${inner}</${name}>` : ""); }
        flag("embed", `<${name}> replaced with a link to ${src}.`);
        return `\n\n[${attr(tag, "title") ?? src}](${src})\n\n`;
      };
    h.Icon = () => "";
    return h;
  }
}
function readTag(src, i) {
  const m = /^<(\/?)([A-Za-z][\w.-]*)/.exec(src.slice(i, i + 80));
  if (!m) return null;
  let j = i + m[0].length;
  if (!/[\s/>]/.test(src[j] ?? "")) return null;
  const attrs = {};
  const done = (selfClosing, end) => ({ closing: !!m[1], name: m[2], attrs, selfClosing, end, raw: src.slice(i, end) });
  for (;;) {
    const ws = /^\s*/.exec(src.slice(j, j + 400))[0];
    if (/\n[ \t]*\n/.test(ws)) return null;
    j += ws.length;
    if (j >= src.length || j - i > 4000) return null;
    if (src[j] === ">") return done(false, j + 1);
    if (src[j] === "/" && src[j + 1] === ">") return done(true, j + 2);
    const name = /^[^\s=/>"'{}<]+/.exec(src.slice(j, j + 100));
    if (!name) return null;
    j += name[0].length;
    const eq = /^\s*=\s*/.exec(src.slice(j, j + 50));
    if (!eq) { attrs[name[0]] = true; continue; }
    j += eq[0].length;
    const start = j;
    if (src[j] === '"' || src[j] === "'") {
      const close = src.indexOf(src[j], j + 1);
      if (close < 0) return null;
      j = close + 1;
    } else if (src[j] === "{") {
      let depth = 0;
      for (; j < src.length; j++) {
        const c = src[j];
        if (c === '"' || c === "'" || c === "`") { const close = src.indexOf(c, j + 1); if (close < 0) return null; j = close; }
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) break;
      }
      if (j >= src.length) return null;
      j++;
    } else j += /^[^\s>]*/.exec(src.slice(j, j + 400))[0].replace(/\/$/, "").length;
    attrs[name[0]] = src.slice(start, j);
  }
}
function findClose(src, from, name) {
  const re = new RegExp(`<(/?)${name.replace(/\./g, "\\.")}(?=[\\s/>])`, "g");
  let depth = 1;
  re.lastIndex = from;
  for (let m; (m = re.exec(src)); ) {
    const tag = readTag(src, m.index);
    if (!tag) continue;
    if (tag.closing) { if (--depth === 0) return { start: m.index, end: tag.end }; }
    else if (!tag.selfClosing) depth++;
    re.lastIndex = tag.end;
  }
  return null;
}
function genericEnd(src, lt) {
  let depth = 0;
  for (let k = lt; k < src.length && k - lt < 200; k++) {
    const c = src[k];
    if (c === "<") depth++;
    else if (c === ">") { if (--depth === 0) return k + 1; }
    else if (!/[\w\s,.|[\]'"?:&*]/.test(c) || c === "\n") return null;
  }
  return null;
}
function dedent(s) {
  let lines = s.split("\n");
  // Text right after the opening tag (`<Note>Text`) is the first line; the rest is dedented.
  const first = /^[ \t]*\S/.test(lines[0]) ? lines.shift().trim() : null;
  while (first === null && lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const min = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^[ \t]*/)[0].length));
  lines = lines.map((l) => (l.trim() ? l.slice(min) : ""));
  if (first) lines.unshift(first);
  return lines.join("\n");
}

// ---------------------------------------------------------------- links and images
let current; // the page being converted
function imageUrl(src) {
  if (/^https:\/\//i.test(src)) return src;
  if (src.startsWith("//")) return `https:${src}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) { review(current.src, "image", `${src} is not an https:// URL; host it over https.`); return src; }
  const path = src.startsWith("/") ? src.slice(1) : posix.normalize(posix.join(posix.dirname(current.src), src));
  if (!opts.assetsBase) { review(current.src, "image-upload", `${src} is a repository file; upload it and use its https:// URL.`); return src; }
  const url = new URL(path.replace(/^(\.\.\/)+/, ""), opts.assetsBase).href;
  if (!src.startsWith("/")) review(current.src, "image-check", `${src} → ${url}: relative to the page, so check that the old site serves it there.`);
  return url;
}
function linkUrl(href) {
  if (/^#/.test(href)) return href.replace(/-{2,}/g, "-");
  if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href;
  const [pathAndQuery, hash] = href.split(/#(.*)/s);
  const path = pathAndQuery.replace(/\?.*$/, "");
  const anchor = hash ? `#${hash.replace(/-{2,}/g, "-")}` : "";
  const candidates = [];
  if (path.startsWith("/")) {
    const p = trimSlashes(path);
    if (oldBase && (p === oldBase || p.startsWith(`${oldBase}/`))) candidates.push(trimSlashes(p.slice(oldBase.length)));
    candidates.push(p);
    if (p.startsWith("docs/")) candidates.push(p.slice(5));
  } else if (path) {
    candidates.push(posix.join(posix.dirname(current.src), path), posix.join(posix.dirname(current.oldPath || "."), path), posix.join(current.oldPath || ".", path));
  } else return href;
  for (const c of candidates) {
    if (c.startsWith("..")) continue;
    const hit = c === "" || c === "." ? byOld.get("") : findPage(c);
    if (hit) return `/docs/${hit.slug}${anchor}`;
  }
  if (ASSET_EXT.test(path)) {
    if (opts.assetsBase) return new URL(path.startsWith("/") ? path.slice(1) : posix.normalize(posix.join(posix.dirname(current.src), path)).replace(/^(\.\.\/)+/, ""), opts.assetsBase).href;
    review(current.src, "file-upload", `Link to the repository file ${href}; upload it and link its https:// URL.`);
    return href;
  }
  const docsLike = !path.startsWith("/") || /\.mdx?$/i.test(path) || (oldBase && path.startsWith(`/${oldBase}/`)) || path.startsWith("/docs/");
  if (docsLike) review(current.src, "broken-link", `Link "${href}" does not match a ported page; fix or remove it.`);
  return href;
}

// ---------------------------------------------------------------- convert, label, write
for (const p of pages) {
  current = p;
  p.output = convertPage(p);
}
// Labels that repeat across groups in one FrontLit section get the group name.
const labelOf = (p) => {
  const explicit = [p.data.sidebar_label, p.data.sidebarTitle, p.data.nav_title, p.data.navTitle, p.navLabel, p.navFallback].find((v) => typeof v === "string" && v.trim());
  return explicit ?? p.title;
};
const seen = new Map();
for (const p of pages) {
  const key = `${p.group.section}\u0000${labelOf(p)}`;
  if (!seen.has(key)) seen.set(key, new Set());
  seen.get(key).add(p.group);
}
for (const p of pages) {
  const label = labelOf(p);
  const shared = seen.get(`${p.group.section}\u0000${label}`).size > 1;
  p.navTitle = shared && p.group.label ? `${p.group.label}: ${label}` : label !== p.title ? label : undefined;
}

// Sections.
const sectionsPath = join(targetDir, "_sections.json");
const existing = existsSync(sectionsPath) ? readJson(sectionsPath) : undefined;
if (existsSync(sectionsPath) && existing?.version !== 1) review("_sections.json", "sections", "Existing _sections.json is not valid; it was replaced.");
const sections = existing?.version === 1 && Array.isArray(existing.sections) ? existing.sections.map((s) => ({ ...s })) : [];
const upsert = (entry) => {
  const at = sections.findIndex((s) => s.folder === entry.folder);
  if (at < 0) sections.push(entry);
  else sections[at] = entry;
};
if (prefix) {
  const folder = prefix.split("/")[0];
  if (!sections.some((s) => s.folder === folder)) {
    const max = Math.max(0, ...sections.map((s) => s.order).filter(Number.isInteger));
    upsert({ folder, name: titleCase(folder), order: sections.length ? max + 1000 : 10 });
  }
} else {
  groups.filter((g) => g.folder).forEach((g, k) => upsert({ folder: g.folder, name: g.label ?? titleCase(g.folder), order: (k + 1) * 10 }));
}
report.sections = sections;

pages.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.navOrder - b.navOrder);
for (const p of pages) {
  const fm = {
    title: p.title,
    description: typeof p.data.description === "string" ? p.data.description : undefined,
    slug: p.writeSlug ? p.slug : undefined,
    nav_title: p.navTitle,
    nav_order: p.navOrder,
    published: p.data.draft === true || p.data.hidden === true ? false : undefined,
    indexable: p.data.unlisted === true || p.data.noindex === true || p.data.searchable === false ? false : undefined,
  };
  const head = Object.entries(fm)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? yamlString(v) : v}`);
  p.content = `---\n${head.join("\n")}\n---\n\n${p.output}\n`;
  const oldUrl = `/${[oldBase, p.oldPath].filter(Boolean).join("/")}`;
  const route = `/docs/${p.slug}`;
  if (oldUrl !== route) report.redirects[oldUrl] = route;
  report.pages.push({ source: p.src, target: p.target, oldUrl, route });
}

const redirectsPath = join(dirname(targetDir), "port-redirects.json");
if (!opts.dryRun) {
  for (const p of pages) {
    const out = join(targetDir, p.target);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, p.content);
  }
  if (sections.length) writeFileSync(sectionsPath, `${JSON.stringify({ version: 1, sections }, null, 2)}\n`);
  const urlMap = Object.fromEntries(report.pages.map((r) => [r.oldUrl, r.route]));
  if (report.pages.length) writeFileSync(redirectsPath, `${JSON.stringify(urlMap, null, 2)}\n`);
}

if (opts.json) console.log(JSON.stringify(report, null, 2));
else {
  const lines = [`Framework: ${framework}; navigation from ${report.navigation}.${opts.dryRun ? " Dry run: nothing written." : ""}`, "", `Pages (${report.pages.length}):`];
  for (const r of report.pages) lines.push(`  ${r.source} → ${r.target}   ${r.oldUrl} → ${r.route}`);
  lines.push("", `Sections: ${sections.map((s) => `${s.folder} (${s.name}, ${s.order})`).join(", ") || "none"}`);
  const redirects = Object.entries(report.redirects);
  lines.push("", `Changed URLs (${redirects.length})${report.pages.length && !opts.dryRun ? `; every old URL → new route is in ${redirectsPath} (plan redirects with redirects.mjs)` : ""}:`);
  for (const [from, to] of redirects) lines.push(`  ${from} → ${to}`);
  if (report.notes.length) lines.push("", "Notes:", ...report.notes.map((n) => `  ${n}`));
  lines.push("", `Needs review (${report.review.length}):`);
  for (const r of report.review) lines.push(`  ${r.file}  ${r.kind}  ${r.detail}`);
  lines.push("", "Next: run check.mjs on the target folder and read every converted page.");
  console.log(lines.join("\n"));
}
