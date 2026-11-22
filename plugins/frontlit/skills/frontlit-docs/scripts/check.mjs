#!/usr/bin/env node
// Pre-check a FrontLit docs folder:
//   node check.mjs [docs-folder] [--api-mount=api-reference] [--tree] [--redirects=<map.json>]
//                  [--no-parser] [--parser=<dir>]
// --api-mount: URL path of the generated API reference; links under /docs/<mount>/ are not checked.
// --tree:      print the sidebar FrontLit will build (sections, order, labels, drafts).
// --redirects: a JSON map of old URL → new path (port-redirects.json); every /docs/ target
//              must be a public page in this folder, and its #anchor a heading on it.
// --no-parser: skip FrontLit's parser and use only the built-in rules (offline).
// --parser:    a directory whose node_modules has @frontlit/text-editor (e.g. a local build).
//
// Each page is parsed with FrontLit's own Markdown parser (@frontlit/text-editor/docs,
// the code the pull request check runs), installed once into a cache with npm. When it
// can't be loaded, built-in rules that mirror the common failures run instead. Cross-page
// checks (routes, sections, links, anchors) always run here. FrontLit's pull request
// check stays authoritative.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { loadFrontlitParser, PACKAGE } from "./frontlit-parser.mjs";

const problems = [];
const warnings = [];
let buffer = null; // per-page built-in findings while FrontLit's parser is the authority
const report = (file, line, code, message) =>
  (buffer ?? problems).push({ file, line, code, message });
const warn = (file, line, code, message) => warnings.push({ file, line, code, message });
const format = (p) => `${p.file}${p.line ? `:${p.line}` : ""}  ${p.code}  ${p.message}`;

function findDocsFolder(root) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) stack.push(path);
      else if (name === "_sections.json" && readFileSync(path, "utf8").includes('"version"'))
        return dir;
    }
  }
  return null;
}

const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const apiMount = (option("api-mount") ?? "").replace(/^\/?(docs\/)?|\/$/g, "");
const showTree = args.includes("--tree");
const folder = args.find((a) => !a.startsWith("--")) ?? findDocsFolder(process.cwd());
if (!folder || !existsSync(folder)) {
  console.error("Docs folder not found. Pass it: node check.mjs <docs-folder> [--api-mount=api-reference] [--tree] [--redirects=<map.json>]");
  process.exit(2);
}

const parser = await loadFrontlitParser({ noParser: args.includes("--no-parser"), parserDir: option("parser") });
if (parser.docs) console.log(`Parsing with FrontLit's parser (${PACKAGE} ${parser.version}).`);
else
  console.log(
    `FrontLit's parser is unavailable (${parser.reason}); using the built-in rules, which catch the common failures only.`,
  );
const { docs } = parser;

const SLUG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

// Rich blocks FrontLit supports: allowed props, and the container each child must sit in.
// Mirrors FrontLit's content format (packages/text-editor/schema/content.v1.json).
const COMPONENTS = {
  Callout: ["type", "title"],
  Tabs: ["items"],
  Tab: ["value"],
  Steps: [],
  Step: [],
  Cards: [],
  Card: ["title", "href", "icon"],
  Accordions: ["type"],
  Accordion: ["title"],
  CodeGroup: [],
  TypeTable: ["type"],
  Button: ["label", "href", "variant"],
  WebPreview: ["url", "title", "description", "image"],
  H5P: ["src", "title", "height"],
};
const NAMES = Object.keys(COMPONENTS);
const PARENT = { Tab: "Tabs", Step: "Steps", Card: "Cards", Accordion: "Accordions" };
const ATOMS = ["TypeTable", "Button", "WebPreview", "H5P"]; // no children
// Props a block needs before it can be published. A missing one renders nothing, and
// FrontLit refuses the page (INCOMPLETE_BLOCK).
const REQUIRED = { Card: ["title"], Accordion: ["title"], Button: ["label", "href"], WebPreview: ["url"], H5P: ["src"] };
// Props without which the page doesn't parse at all.
const PARSE_REQUIRED = { Card: "title", Accordion: "title", Button: "label" };
const CALLOUT_TYPES = ["note", "tip", "info", "success", "warning", "danger"];
const BUTTON_VARIANTS = ["primary", "secondary"];
const H5P_HOSTS = ["h5p.org", "*.h5p.com"];

// FrontLit's URL rules (core/urls.ts isSafeUrl, docs/urls.ts isPublicDocsUrl): links may be
// https, http, mailto or relative; images https only; never private attachment paths or
// expiring signed links.
function isSafeUrl(value, image = false) {
  if (typeof value !== "string" || !value || value !== value.trim()) return false;
  if (/[\u0000- \u007f\\]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return false;
  if (value.startsWith("//")) return false;
  if (/^(?:https?:|mailto:)/i.test(value)) {
    try {
      const url = new URL(value);
      if (image && url.protocol !== "https:") return false;
      if (url.username || url.password) return false;
      if (url.protocol === "mailto:") return !image && Boolean(url.pathname);
      decodeURIComponent(url.pathname);
      return Boolean(url.hostname);
    } catch {
      return false;
    }
  }
  if (image || /^[^/?#]*:/.test(value) || /%(?:2f|3a)/i.test(value)) return false;
  try {
    decodeURIComponent(new URL(value, "https://relative.invalid/").pathname);
    return true;
  } catch {
    return false;
  }
}
function isPublicUrl(value) {
  if (/^mailto:/i.test(value)) return true;
  try {
    const url = new URL(value, "https://docs.invalid/");
    return (
      !/\/(?:attachments|private|ticket-attachments|conversation-attachments)(?:\/|$)/i.test(decodeURIComponent(url.pathname)) &&
      ![...url.searchParams.keys()].some((key) => /^(?:x-amz-.+|x-goog-.+|signature|sig|token|access_token|expires)$/i.test(key))
    );
  } catch {
    return false;
  }
}
const isAllowedHost = (value, hosts) =>
  isSafeUrl(value, true) &&
  hosts.some((rule) => {
    const host = new URL(value).hostname.toLowerCase();
    return rule.startsWith("*.") ? host.endsWith(rule.slice(1)) : host === rule;
  });
// A literal string prop: "text", 'text' or {"text"}. Anything else is undefined.
const text = (raw) => raw?.match(/^(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)')\s*\})$/)?.slice(1).find((v) => v !== undefined);
// items={["a", "b"]}: the strings, or null when it isn't a list of string literals.
function stringList(raw) {
  const body = raw?.match(/^\{\s*\[([\s\S]*)\]\s*\}$/)?.[1];
  if (body === undefined) return null;
  const items = [...body.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);
  return body.replace(/"[^"]*"|'[^']*'/g, "").replace(/[\s,]/g, "") ? null : items;
}
const FENCE_META = /^title=(?:"[^"\n]+"|'[^'\n]+')$/;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".md")) files.push(path);
    else if (name.endsWith(".mdx"))
      report(relative(folder, path), 0, "UNSUPPORTED_FILE", "Rename to .md; only the supported rich blocks may remain.");
  }
})(folder);

// _sections.json
const sectionsPath = join(folder, "_sections.json");
let configuredSections = [];
if (existsSync(sectionsPath)) {
  try {
    const data = JSON.parse(readFileSync(sectionsPath, "utf8"));
    const keys = Object.keys(data).sort().join(",");
    if (data.version !== 1 || keys !== "sections,version" || !Array.isArray(data.sections))
      throw new Error('Use exactly { "version": 1, "sections": [...] }.');
    const seen = new Set();
    for (const s of data.sections) {
      if (Object.keys(s).sort().join(",") !== "folder,name,order")
        throw new Error("Each section needs exactly folder, name and order.");
      if (!/^[a-z0-9-]+$/.test(s.folder)) throw new Error(`Invalid folder "${s.folder}".`);
      if (seen.has(s.folder)) throw new Error(`Duplicate folder "${s.folder}".`);
      if (!String(s.name).trim()) throw new Error(`Empty name for "${s.folder}".`);
      if (!Number.isInteger(s.order)) throw new Error(`Order for "${s.folder}" must be an integer.`);
      seen.add(s.folder);
    }
    configuredSections = data.sections;
  } catch (error) {
    report("_sections.json", 0, "INVALID_SECTIONS", error.message);
  }
}

function headingId(used, text) {
  const base =
    text
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-") || "section";
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}
const plain = (text) =>
  text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~]/g, "");

// Minimal frontmatter reader: top-level `key: value` scalars only.
function frontmatter(raw, file) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    report(file, 1, "INVALID_FRONTMATTER", "Missing frontmatter with a title.");
    return { meta: {}, body: raw, offset: 0 };
  }
  const meta = {};
  const seen = new Set();
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    if (seen.has(m[1])) report(file, 0, "INVALID_FRONTMATTER", `Duplicate key "${m[1]}".`);
    seen.add(m[1]);
    let value = m[2].trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else if (value === "true" || value === "false") value = value === "true";
    else if (/^-?\d+$/.test(value)) value = Number(value);
    else if (value === "") value = undefined;
    meta[m[1]] = value;
  }
  return {
    meta,
    body: raw.slice(match[0].length),
    offset: match[0].split("\n").length - 1,
  };
}

const pages = [];
const routes = new Map();
const sectionFolders = new Map(); // section slug → folder name, as FrontLit derives sections
for (const path of files) {
  const file = relative(folder, path).split(sep).join("/");
  const raw = readFileSync(path, "utf8");
  if (docs) buffer = [];
  if (Buffer.byteLength(raw) > 1024 * 1024) report(file, 0, "CANDIDATE_LIMIT", "Page exceeds 1 MB.");
  const { meta, body, offset } = frontmatter(raw, file);
  if (typeof meta.title !== "string" || !meta.title.trim())
    report(file, 1, "INVALID_FRONTMATTER", "title is required.");
  for (const key of ["description", "slug", "nav_title"])
    if (meta[key] !== undefined && typeof meta[key] !== "string")
      report(file, 1, "INVALID_FRONTMATTER", `${key} must be a string.`);
  if (meta.nav_order !== undefined && !Number.isInteger(meta.nav_order))
    report(file, 1, "INVALID_FRONTMATTER", "nav_order must be an integer.");
  for (const key of ["published", "indexable"])
    if (meta[key] !== undefined && typeof meta[key] !== "boolean")
      report(file, 1, "INVALID_FRONTMATTER", `${key} must be true or false.`);
  const segments = file.split("/");
  const section = segments.length > 1 ? segments[0].toLowerCase() : null;
  if (section && !/^[a-z0-9-]+$/.test(section))
    report(file, 0, "INVALID_SECTION", `Folder "${segments[0]}" must use letters, digits and hyphens.`);
  let slug = String(meta.slug ?? file.slice(0, -3).replace(/\/index$/, ""))
    .toLowerCase()
    .replace(/\/$/, "");
  if (!SLUG.test(slug))
    report(file, 1, "INVALID_SLUG", `"${slug}" must be lowercase letters, digits and hyphens in /-separated segments (set slug: or rename the file).`);
  else if (["collections", "search"].includes(slug.split("/")[0]))
    report(file, 1, "RESERVED_ROUTE", `/docs/${slug} is reserved.`);

  let ids = new Set();
  const links = [];
  const stack = []; // open tags: { name, items }
  let fence = null;
  let pending = null; // an opening tag whose props continue on later lines
  const tag = (line, closing, name, rawProps, selfClosing) => {
    if (!Object.hasOwn(COMPONENTS, name)) {
      report(file, line, "UNSUPPORTED_NODE", `<${name}> is not a supported component (${NAMES.join(", ")}). Use Markdown, or wrap literal text in backticks.`);
      return;
    }
    if (closing) {
      const top = stack.pop()?.name;
      if (top !== name) report(file, line, "UNSUPPORTED_NODE", `</${name}> does not match ${top ? `<${top}>` : "an open tag"}.`);
      return;
    }
    const open = stack[stack.length - 1];
    const parent = open?.name;
    if (PARENT[name] && parent !== PARENT[name])
      report(file, line, "UNSUPPORTED_NODE", `<${name}> must be directly inside <${PARENT[name]}>.`);
    const container = Object.entries(PARENT).find(([, p]) => p === parent)?.[0];
    if (container && name !== container)
      report(file, line, "UNSUPPORTED_NODE", `<${parent}> can only contain <${container}>.`);
    const props = {};
    for (const m of rawProps.matchAll(/([A-Za-z_][\w-]*)(?:=("[^"]*"|'[^']*'|\{[\s\S]*?\}(?=\s+[A-Za-z_][\w-]*=|\s*$)))?/g)) {
      if (!COMPONENTS[name].includes(m[1])) report(file, line, "UNSUPPORTED_ATTRIBUTE", `<${name}> does not accept the prop "${m[1]}".`);
      props[m[1]] = m[2];
    }
    const value = (prop) => text(props[prop]);
    const url = (prop, ok, message) => {
      const v = value(prop);
      if (v) {
        if (!ok(v)) report(file, line, "UNSAFE_URL", message);
        else if (!isPublicUrl(v)) report(file, line, "UNSAFE_URL", `${name} ${prop} is a private or expiring link.`);
      }
    };
    if (name === "Callout" && props.type && !CALLOUT_TYPES.includes(value("type")))
      report(file, line, "UNSUPPORTED_ATTRIBUTE", `Callout type must be one of ${CALLOUT_TYPES.join(", ")}.`);
    const needed = PARSE_REQUIRED[name];
    if (needed && props[needed] === undefined) report(file, line, "INVALID_DOCUMENT", `<${name}> needs a ${needed}.`);
    for (const prop of REQUIRED[name] ?? [])
      if (props[prop] === undefined ? prop !== needed : value(prop) === "")
        report(file, line, "INCOMPLETE_BLOCK", `<${name}> needs ${prop} before it can be published.`);
    if (name === "TypeTable" && !props.type) report(file, line, "INVALID_DOCUMENT", "<TypeTable> needs a type={{ … }} prop.");
    if (name === "Accordions" && props.type && !/^["'](single|multiple)["']$/.test(props.type))
      report(file, line, "UNSUPPORTED_ATTRIBUTE", 'Accordions type must be "single" or "multiple".');
    let items;
    if (name === "Tabs" && props.items !== undefined) {
      items = stringList(props.items);
      if (!items) report(file, line, "UNSUPPORTED_ATTRIBUTE", "<Tabs> items must be a list of strings.");
    }
    if (name === "Tab" && open?.items && props.value !== undefined && !open.items.includes(value("value")))
      report(file, line, "INVALID_DOCUMENT", `Tab value "${value("value")}" is not listed in items.`);
    if (name === "Card" || name === "Button") url("href", (v) => isSafeUrl(v), `${name} link URL is unsafe.`);
    if (name === "Button" && props.variant && !BUTTON_VARIANTS.includes(value("variant")))
      report(file, line, "UNSUPPORTED_ATTRIBUTE", `Button variant must be one of ${BUTTON_VARIANTS.join(", ")}.`);
    if (name === "WebPreview") {
      url("url", (v) => isSafeUrl(v) && /^https?:\/\//i.test(v), "WebPreview url must be an http or https link.");
      url("image", (v) => isSafeUrl(v, true), "WebPreview image must be an https URL.");
    }
    if (name === "H5P") {
      url("src", (v) => isAllowedHost(v, H5P_HOSTS), `H5P src must use https and one of these hosts: ${H5P_HOSTS.join(", ")}.`);
      const height = props.height?.match(/^\{\s*(\d+)\s*\}$/)?.[1];
      if (props.height !== undefined && !(height && +height >= 100 && +height <= 4000))
        report(file, line, "UNSUPPORTED_ATTRIBUTE", "H5P height must be a whole number from 100 to 4000, written height={480}.");
    }
    if (ATOMS.includes(name)) {
      if (!selfClosing) report(file, line, "UNSUPPORTED_NODE", `<${name}> cannot have children; close it with />.`);
    } else if (!selfClosing) stack.push({ name, items });
  };
  // A page with rich blocks is parsed with MDX rules: indentation is layout, never an
  // indented code block. A plain Markdown page follows CommonMark: four spaces past the
  // enclosing list item's content (or the margin) start indented code, not a fence.
  const mdx = new RegExp(`^\\s*<(${NAMES.join("|")})\\b`, "m").test(body);
  const lists = []; // content columns of the open list items, innermost last
  let prevBlank = true;
  let indentedCode = false;
  body.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1 + offset;
    const indent = text.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
    const blank = !text.trim();
    if (!fence && !blank && prevBlank) while (lists.length && lists[lists.length - 1] > indent) lists.pop();
    const container = [...lists].reverse().find((col) => col <= indent) ?? 0;
    const relative = indent - container;
    // A closing fence may be indented at most 3 spaces more than the opening one;
    // deeper lines are fence content.
    const open = text.match(/^(\s*)(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (open && open[2][0] === fence.marker[0] && open[2].length >= fence.marker.length && indent <= fence.indent + 3 && !open[3].trim()) fence = null;
      prevBlank = false;
      return;
    }
    if (!mdx && !blank && relative >= 4 && (prevBlank || indentedCode)) {
      indentedCode = true; // literal, like a fence
      prevBlank = false;
      return;
    }
    if (!blank) indentedCode = false;
    prevBlank = blank;
    if (open && (mdx || relative <= 3)) {
      fence = { marker: open[2], indent };
      const info = open[3].trim();
      const [lang, ...rest] = info.startsWith("title=") ? ["", info] : info.split(/\s+/);
      const meta = rest.join(" ");
      if (lang && !/^[\w+-]+$/.test(lang))
        report(file, line, "UNSUPPORTED_ATTRIBUTE", `Code fence language "${lang}" must use letters, digits, "_", "+" or "-".`);
      if (meta && !FENCE_META.test(meta))
        report(file, line, "UNSUPPORTED_ATTRIBUTE", 'Code fence metadata other than title="…" is unsupported.');
      return;
    }
    const item = text.match(/^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)/);
    if (item) {
      while (lists.length && lists[lists.length - 1] > indent) lists.pop();
      const gap = item[3].replace(/\t/g, "    ").length;
      lists.push(indent + item[2].length + (gap >= 1 && gap <= 4 ? gap : 1));
    }
    let prose = text.replace(/(`+)[\s\S]*?\1/g, "``");
    if (pending) {
      pending.text += ` ${text.trim()}`;
      if (!(pending.name === "TypeTable" ? /\/>\s*$/.test(text) : />\s*$/.test(text))) return;
      prose = pending.text;
      pending = null;
    } else {
      const start = prose.match(/^\s*<([A-Z][\w.]*)\b/);
      const terminated = start && (start[1] === "TypeTable" ? /\/>\s*$/ : />\s*$/).test(prose);
      if (start && !terminated) {
        pending = { name: start[1], text: prose.trim(), line };
        return;
      }
    }
    if (/^\s*<TypeTable\b/.test(prose))
      prose = `<TypeTable${/\btype=\{\{/.test(prose) ? " type={{}}" : ""} />`; // rows hold arbitrary text
    if (/^\s*(import|export)\s/.test(prose))
      report(file, line, "UNSUPPORTED_NODE", "MDX import/export lines are unsupported.");
    prose = prose
      .replace(/<(?:https?:|mailto:)[^>]*>/g, "")
      .replace(/icon=\{\s*<([A-Za-z][\w-]*)\s*\/>\s*\}/g, 'icon="$1"');
    for (const m of prose.matchAll(/(?<!\\)<(\/?)([A-Za-z][\w.]*)((?:\s[^<>]*?)?)(\/?)>/g)) {
      if (m[2][0] === m[2][0].toLowerCase())
        report(file, line, "UNSUPPORTED_NODE", `HTML "${m[0].slice(0, 40)}" is unsupported; use Markdown or wrap literal text in backticks.`);
      else {
        if (prose.slice(0, m.index).replace(/(?<!\\)<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g, "").trim())
          report(file, line, "UNSUPPORTED_NODE", `Inline <${m[2]}> is unsupported. Put the component on its own lines.`);
        tag(line, m[1] === "/", m[2], m[3], m[4] === "/");
      }
    }
    const stray = prose.replace(/(?<!\\)<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g, "").match(/(?<!\\)<\/?[A-Za-z][^>]*>?/);
    if (stray)
      report(file, line, "UNSUPPORTED_NODE", `"${stray[0].slice(0, 40)}" looks like HTML/JSX; wrap literal text in backticks or escape the "<".`);
    if (stack[stack.length - 1]?.name === "CodeGroup" && prose.trim() && !/^\s*<\/?CodeGroup/.test(prose))
      report(file, line, "UNSUPPORTED_NODE", "<CodeGroup> can only contain code blocks.");
    if (/^\s*(?:[-*+]|\d+[.)])[ \t]+(?:[-*+]|\d+[.)])(?:[ \t]|$)/.test(text))
      report(file, line, "INVALID_DOCUMENT", 'A list item that starts with another list marker ("- 1. text", "- - text", "1. - text") is rejected; use one marker per line, e.g. "1. text", or start the item with text such as "- **(1) Name**".');
    if (/(?<!\\)\[[^\]]*\]\(\s*\)/.test(prose))
      report(file, line, "UNSAFE_URL", "A link has an empty destination: give it a URL or remove the link.");
    if (/\[\s*!\[[^\]]*\]\([^)]*\)\s*\]\(/.test(prose))
      report(file, line, "UNSUPPORTED_NODE", "An image inside a link (such as a badge) is unsupported; link the text or put the image on its own line.");
    if (/^\s*([-*+]|\d+[.)])\s+\[[ xX]\]\s/.test(text))
      report(file, line, "UNSUPPORTED_NODE", "Task lists are unsupported.");
    if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(text) && text.includes(":"))
      report(file, line, "UNSUPPORTED_ATTRIBUTE", "Table column alignment is unsupported.");
    if (/(\*\*|__|(?<![*\w])\*|(?<![_\w])_)`[^`]+`\1/.test(text))
      report(file, line, "UNSUPPORTED_NODE", "Inline code cannot be bold or italic.");
    if (/\[\^[^\]]+\]/.test(prose)) report(file, line, "UNSUPPORTED_NODE", "Footnotes are unsupported.");
    const heading = text.match(/^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) headingId(ids, plain(heading[1]));
    for (const m of prose.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g)) {
      const [, image, href] = m;
      if (!isPublicUrl(href)) report(file, line, "UNSAFE_URL", `"${href}" is a private or expiring link.`);
      if (image) {
        if (!/^https:\/\//i.test(href))
          report(file, line, "UNMANAGED_BINARY", `Image "${href}" must be an absolute https:// URL.`);
      } else links.push({ href, line });
    }
  });
  if (pending) report(file, pending.line, "UNSUPPORTED_NODE", `<${pending.name}> tag is never closed.`);
  for (const { name } of stack) report(file, 0, "UNSUPPORTED_NODE", `<${name}> is never closed.`);
  if (fence) report(file, 0, "UNSUPPORTED_NODE", "A code fence is never closed.");

  // FrontLit's parser decides whether the page itself is valid; the built-in findings
  // only serve as hints when its diagnostic has no line.
  let fm = meta;
  if (docs) {
    const hints = buffer.filter((h) => h.line);
    buffer = null;
    try {
      const parsed = docs.parseDocsMarkdown(raw, { file });
      fm = parsed.frontmatter ?? {};
      ids = new Set(docs.extractDocsHeadings(parsed.content).map((h) => h.id));
      slug = docs.resolveDocsSourcePath(`docs/${file}`, "docs", fm.slug).slug;
      // Blocks missing a prop they need to render (a Button without href): FrontLit
      // refuses to publish them. Older parser versions don't have this check.
      const lines = hints.filter((h) => h.code === "INCOMPLETE_BLOCK").map((h) => h.line);
      for (const d of docs.incompleteDocsBlocks?.(parsed.content) ?? [])
        report(file, lines.shift() ?? 0, "INCOMPLETE_BLOCK", d.message);
    } catch (error) {
      if (!(error instanceof docs.DocsContentError)) report(file, 0, "PARSER_ERROR", error.message);
      else {
        let hinted = false;
        for (const d of error.diagnostics) {
          const onSlug = d.fieldPath === "slug";
          report(file, d.line ?? (onSlug ? 1 : 0), d.code, `${d.message}${!d.line && d.fieldPath && !onSlug ? ` (at ${d.fieldPath})` : ""}`);
          if (!d.line && !onSlug && !hinted) {
            hinted = true;
            for (const h of hints) report(file, h.line, h.code, `Possible cause: ${h.message}`);
          }
        }
      }
    }
  }
  const published = fm.published !== false;
  if (published) {
    if (routes.has(slug))
      report(file, 0, "DUPLICATE_ROUTE", `/docs/${slug} is also used by ${routes.get(slug)}.`);
    else routes.set(slug, file);
  }
  if (section) {
    const previous = sectionFolders.get(section);
    if (previous && previous !== segments[0])
      report(file, 0, "SECTION_COLLISION", `Folders "${previous}" and "${segments[0]}" resolve to the same section.`);
    else sectionFolders.set(section, segments[0]);
  }
  pages.push({
    file,
    slug,
    ids,
    links,
    section,
    published,
    label: String(fm.nav_title ?? fm.title ?? file),
    order: Number.isInteger(fm.nav_order) ? fm.nav_order : 0,
  });
}

const bySlug = new Map(pages.map((p) => [p.slug, p]));
for (const page of pages)
  for (const { href, line } of page.links) {
    if (/^(https?:|mailto:)/i.test(href)) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      report(page.file, line, "UNSAFE_URL", `Link "${href}" uses an unsupported protocol.`);
      continue;
    }
    if (/\.mdx?(#|$)/.test(href)) {
      report(page.file, line, "BROKEN_LINK", `Link to "${href}": use /docs/<slug>, not a file path.`);
      continue;
    }
    const target = new URL(href, `https://docs.invalid/docs/${page.slug}`);
    if (!target.pathname.startsWith("/docs/")) continue;
    const slug = decodeURIComponent(target.pathname.slice(6)).replace(/\/$/, "");
    if (apiMount && (slug === apiMount || slug.startsWith(`${apiMount}/`))) continue; // generated from the OpenAPI spec
    const dest = slug === "" ? null : bySlug.get(slug);
    if (!dest) {
      report(page.file, line, "BROKEN_LINK", `No page at /docs/${slug} in this folder (fine only if it is already published).`);
      continue;
    }
    const anchor = decodeURIComponent(target.hash.slice(1));
    if (anchor && !dest.ids.has(anchor))
      report(page.file, line, "BROKEN_ANCHOR", `No heading "#${anchor}" on /docs/${slug}.`);
  }

// Redirect targets: a redirect to a missing or draft page is a 404 for every old link.
const redirectMap = option("redirects");
if (redirectMap) {
  let map;
  try {
    map = JSON.parse(readFileSync(redirectMap, "utf8"));
  } catch (error) {
    console.error(`Can't read --redirects=${redirectMap}: ${error.message}`);
    process.exit(2);
  }
  const name = redirectMap.split(/[\\/]/).pop();
  for (const [from, to] of Object.entries(map)) {
    if (typeof to !== "string" || !/^\/docs(\/|#|$)/.test(to)) continue; // other site paths and URLs
    const target = new URL(to, "https://docs.invalid");
    const slug = decodeURIComponent(target.pathname.slice(6)).replace(/\/$/, "");
    if (slug === "" || (apiMount && (slug === apiMount || slug.startsWith(`${apiMount}/`)))) continue;
    const dest = routes.has(slug) ? bySlug.get(slug) : null;
    if (!dest) {
      report(name, 0, "REDIRECT_TARGET_MISSING", `${from} → ${to}: ${bySlug.has(slug) ? "that page is a draft" : "no page has that route"}.`);
      continue;
    }
    const anchor = decodeURIComponent(target.hash.slice(1));
    if (anchor && !dest.ids.has(anchor))
      report(name, 0, "BROKEN_ANCHOR", `${from} → ${to}: no heading "#${anchor}" on /docs/${slug}.`);
  }
}

// The sidebar as FrontLit builds it: sections come from first-level folders in path
// order, then _sections.json renames and reorders them; pages sort by nav_order, then
// path. Deeper folders don't nest, so every page of a section is one flat list.
const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sections = [...sectionFolders].map(([slug, name], order) => ({ slug, name, order }));
for (const s of configuredSections) {
  const entry = { slug: s.folder, name: s.name, order: s.order, configured: true };
  const index = sections.findIndex((x) => x.slug === s.folder);
  if (index < 0) sections.push(entry);
  else sections[index] = entry;
}
sections.sort((a, b) => a.order - b.order || byName(a.slug, b.slug));
const groups = [{ slug: null, name: "(top level)" }, ...sections].map((s) => ({
  ...s,
  pages: pages.filter((p) => p.section === s.slug).sort((a, b) => a.order - b.order || byName(a.file, b.file)),
}));
for (const group of groups) {
  const shown = group.pages.filter((p) => p.published);
  const seen = new Map();
  for (const page of shown) {
    if (seen.has(page.label))
      warn(page.file, 0, "DUPLICATE_NAV_LABEL", `"${page.label}" also labels ${seen.get(page.label)} in the same sidebar section; set a distinct nav_title.`);
    else seen.set(page.label, page.file);
  }
  if (group.configured && !shown.length)
    warn("_sections.json", 0, "EMPTY_SECTION", `Section "${group.slug}" has no public pages.`);
}

if (showTree) {
  const drafts = pages.length - routes.size;
  console.log(`\nSidebar: ${routes.size} public doc(s)${drafts ? `, ${drafts} draft(s) hidden` : ""}`);
  for (const group of groups) {
    if (!group.pages.length && group.slug === null) continue;
    console.log(group.slug === null ? "\n(top level)" : `\n${group.name}  [${group.slug}, order ${group.order}${group.configured ? "" : ", not in _sections.json"}]`);
    for (const page of group.pages)
      console.log(`  ${String(page.order).padStart(6)}  ${page.published ? "" : "(draft) "}${page.label}  →  /docs/${page.slug}`);
  }
  console.log("");
}

if (warnings.length) console.log(`${warnings.map(format).join("\n")}\n${warnings.length} warning(s).\n`);
if (problems.length) {
  console.log(problems.map(format).join("\n"));
  console.log(`\n${problems.length} problem(s) in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`OK: ${files.length} file(s), ${routes.size} public doc(s).`);
