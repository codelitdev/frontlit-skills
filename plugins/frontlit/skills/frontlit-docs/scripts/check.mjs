#!/usr/bin/env node
// Pre-check a FrontLit docs folder: node check.mjs [docs-folder] [--api-mount=api-reference]
// --api-mount: URL path of the generated API reference; links under /docs/<mount>/ are not checked.
// Mirrors the common FrontLit validation failures. FrontLit's own pull request
// check is authoritative; this catches problems before pushing. No dependencies.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const problems = [];
const report = (file, line, code, message) =>
  problems.push(`${file}${line ? `:${line}` : ""}  ${code}  ${message}`);

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
const apiMount = (args.find((a) => a.startsWith("--api-mount="))?.split("=")[1] ?? "").replace(/^\/?(docs\/)?|\/$/g, "");
const folder = args.find((a) => !a.startsWith("--")) ?? findDocsFolder(process.cwd());
if (!folder || !existsSync(folder)) {
  console.error("Docs folder not found. Pass it: node check.mjs <docs-folder> [--api-mount=api-reference]");
  process.exit(2);
}

const SLUG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;

// Rich blocks FrontLit supports: allowed props, and the container each child must sit in.
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
};
const PARENT = { Tab: "Tabs", Step: "Steps", Card: "Cards", Accordion: "Accordions" };
const CALLOUT_TYPES = ["note", "tip", "info", "warning", "danger"];
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
for (const path of files) {
  const file = relative(folder, path).split(sep).join("/");
  const raw = readFileSync(path, "utf8");
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
  if (segments.length > 1 && !/^[a-z0-9-]+$/.test(segments[0]))
    report(file, 0, "INVALID_SECTION", `Folder "${segments[0]}" must use lowercase letters, digits and hyphens.`);
  const slug = String(meta.slug ?? file.slice(0, -3).replace(/\/index$/, ""))
    .toLowerCase()
    .replace(/\/$/, "");
  if (!SLUG.test(slug))
    report(file, 1, "INVALID_SLUG", `"${slug}" must be lowercase letters, digits and hyphens in /-separated segments (set slug: or rename the file).`);
  else if (["collections", "search"].includes(slug.split("/")[0]))
    report(file, 1, "RESERVED_ROUTE", `/docs/${slug} is reserved.`);
  if (routes.has(slug))
    report(file, 0, "DUPLICATE_ROUTE", `/docs/${slug} is also used by ${routes.get(slug)}.`);
  routes.set(slug, file);

  const ids = new Set();
  const links = [];
  const stack = [];
  let fence = null;
  let pending = null; // an opening tag whose props continue on later lines
  const tag = (line, closing, name, rawProps, selfClosing) => {
    if (!Object.hasOwn(COMPONENTS, name)) {
      report(file, line, "UNSUPPORTED_NODE", `<${name}> is not a supported component (Callout, Tabs, Tab, Steps, Step, Cards, Card, Accordions, Accordion, CodeGroup, TypeTable). Use Markdown, or wrap literal text in backticks.`);
      return;
    }
    if (closing) {
      const top = stack.pop();
      if (top !== name) report(file, line, "UNSUPPORTED_NODE", `</${name}> does not match ${top ? `<${top}>` : "an open tag"}.`);
      return;
    }
    const parent = stack[stack.length - 1];
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
    if (name === "Callout" && props.type && !CALLOUT_TYPES.includes(props.type.slice(1, -1)))
      report(file, line, "UNSUPPORTED_ATTRIBUTE", `Callout type must be one of ${CALLOUT_TYPES.join(", ")}.`);
    if (name === "Card" && !props.title) report(file, line, "INVALID_DOCUMENT", "<Card> needs a title.");
    if (name === "Accordion" && !props.title) report(file, line, "INVALID_DOCUMENT", "<Accordion> needs a title.");
    if (name === "TypeTable" && !props.type) report(file, line, "INVALID_DOCUMENT", "<TypeTable> needs a type={{ … }} prop.");
    if (name === "Accordions" && props.type && !/^["'](single|multiple)["']$/.test(props.type))
      report(file, line, "UNSUPPORTED_ATTRIBUTE", 'Accordions type must be "single" or "multiple".');
    if (!selfClosing && name !== "TypeTable") stack.push(name);
  };
  body.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1 + offset;
    // A fence may be indented, e.g. inside a list item; its content is literal like any other fence.
    const open = text.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !open[2].trim()) fence = null;
      return;
    }
    if (open) {
      fence = open[1];
      const info = open[2].trim();
      const [lang, ...rest] = info.startsWith("title=") ? ["", info] : info.split(/\s+/);
      const meta = rest.join(" ");
      if (lang && !/^[\w+-]+$/.test(lang))
        report(file, line, "UNSUPPORTED_ATTRIBUTE", `Code fence language "${lang}" must use letters, digits, "_", "+" or "-".`);
      if (meta && !FENCE_META.test(meta))
        report(file, line, "UNSUPPORTED_ATTRIBUTE", 'Code fence metadata other than title="…" is unsupported.');
      return;
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
      else tag(line, m[1] === "/", m[2], m[3], m[4] === "/");
    }
    const stray = prose.replace(/(?<!\\)<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g, "").match(/(?<!\\)<\/?[A-Za-z][^>]*>?/);
    if (stray)
      report(file, line, "UNSUPPORTED_NODE", `"${stray[0].slice(0, 40)}" looks like HTML/JSX; wrap literal text in backticks or escape the "<".`);
    if (stack[stack.length - 1] === "CodeGroup" && prose.trim() && !/^\s*<\/?CodeGroup/.test(prose))
      report(file, line, "UNSUPPORTED_NODE", "<CodeGroup> can only contain code blocks.");
    if (/^\s*[-*+]\s+\d+[.)]\s/.test(text))
      report(file, line, "INVALID_DOCUMENT", 'A bullet that starts with an ordered marker ("- 1. text") is rejected; use an ordered list ("1. text").');
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
      if (image) {
        if (!/^https:\/\//i.test(href))
          report(file, line, "UNMANAGED_BINARY", `Image "${href}" must be an absolute https:// URL.`);
      } else links.push({ href, line });
    }
  });
  if (pending) report(file, pending.line, "UNSUPPORTED_NODE", `<${pending.name}> tag is never closed.`);
  for (const name of stack) report(file, 0, "UNSUPPORTED_NODE", `<${name}> is never closed.`);
  if (fence) report(file, 0, "UNSUPPORTED_NODE", "A code fence is never closed.");
  pages.push({ file, slug, ids, links });
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

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n${problems.length} problem(s) in ${files.length} file(s).`);
  process.exit(1);
}
console.log(`OK: ${files.length} file(s), ${routes.size} route(s).`);
