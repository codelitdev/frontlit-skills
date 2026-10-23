#!/usr/bin/env node
// Pre-check a FrontLit docs folder: node check.mjs [docs-folder]
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

const folder = process.argv[2] ?? findDocsFolder(process.cwd());
if (!folder || !existsSync(folder)) {
  console.error("Docs folder not found. Pass it: node check.mjs <docs-folder>");
  process.exit(2);
}

const SLUG = /^[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith(".md")) files.push(path);
    else if (name.endsWith(".mdx"))
      report(relative(folder, path), 0, "UNSUPPORTED_FILE", "Rename to .md and remove MDX syntax.");
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
  let fence = null;
  body.split(/\r?\n/).forEach((text, i) => {
    const line = i + 1 + offset;
    const open = text.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !open[2].trim()) fence = null;
      return;
    }
    if (open) {
      fence = open[1];
      if (open[2].trim().split(/\s+/).length > 1)
        report(file, line, "UNSUPPORTED_ATTRIBUTE", "Code fence metadata is unsupported; keep only the language.");
      return;
    }
    const prose = text.replace(/(`+)[\s\S]*?\1/g, "``");
    if (/^\s*(import|export)\s/.test(prose))
      report(file, line, "UNSUPPORTED_NODE", "MDX import/export lines are unsupported.");
    const tag = prose
      .replace(/<(?:https?:|mailto:)[^>]*>/g, "")
      .match(/(?<!\\)<\/?[A-Za-z][^>]*>?/);
    if (tag)
      report(file, line, "UNSUPPORTED_NODE", `HTML/JSX "${tag[0].slice(0, 40)}" is unsupported; use Markdown or wrap literal text in backticks.`);
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
