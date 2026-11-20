#!/usr/bin/env node
// Move docs images into the FrontLit media library and point the pages at them:
//   node images.mjs <docs-folder> [--assets=<dir>]... [--from-host=<host>]... [--upload]
//                   [--api=https://api.frontlit.app] [--map=<file>] [--json]
//
// FrontLit docs only accept absolute https image URLs. This finds every image a page
// uses that isn't one yet: relative or root-relative paths (resolved against the page's
// folder, then each --assets directory, e.g. the old site's static/ or public/), http://
// URLs, and https URLs on a host being retired (--from-host=docs.example.com).
//
// Without --upload it only prints the plan. With --upload it needs a FrontLit API key for
// the team (FRONTLIT_API_KEY) and, per image: gets a one-time upload signature, uploads the
// file to the media library, registers it and rewrites every reference to its URL.
// Uploads are recorded in a map file (default: .frontlit-images.json beside the docs
// folder) keyed by content hash, so a rerun never uploads the same file twice. Commit it.
// Node 18+, no dependencies.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve, extname, basename, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
};

/** Image references in Markdown, outside code: `![alt](src "title")`, including `<src>`. */
export function findImages(markdown) {
  const found = [];
  let fence = null;
  markdown.split(/\r?\n/).forEach((text, i) => {
    const open = text.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return;
    }
    if (open) {
      fence = open[1];
      return;
    }
    const prose = text.replace(/(`+)[\s\S]*?\1/g, (m) => " ".repeat(m.length));
    for (const m of prose.matchAll(/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(\s+["'][^"']*["'])?\s*\)/g))
      found.push({ line: i + 1, alt: m[1], src: m[2].replace(/^<|>$/g, "") });
  });
  return found;
}

/** Where an image comes from, or null when it is already fine. */
export function classify(src, { page, assets = [], fromHosts = [] }) {
  if (/^https:\/\//i.test(src)) {
    const host = new URL(src).host.toLowerCase();
    return fromHosts.includes(host) ? { kind: "remote", url: src } : null;
  }
  if (/^http:\/\//i.test(src)) return { kind: "remote", url: src };
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//")) return { kind: "unsupported" };
  const clean = decodeURIComponent(src.replace(/[?#].*$/, ""));
  const candidates = clean.startsWith("/")
    ? assets.map((dir) => join(dir, clean))
    : [join(dirname(page), clean), ...assets.map((dir) => join(dir, clean))];
  const path = candidates.find((p) => existsSync(p) && statSync(p).isFile());
  return path ? { kind: "local", path } : { kind: "missing", tried: candidates };
}

const metadata = (fields) =>
  Object.entries(fields)
    .map(([k, v]) => `${k} ${Buffer.from(v).toString("base64")}`)
    .join(",");

/** TUS upload straight to the media store; resolves to the uploaded file's id. */
export async function tusUpload({ endpoint, signature, bytes, fileName, mimeType }) {
  const base = { "Tus-Resumable": "1.0.0", "x-medialit-signature": signature };
  let res = await fetch(`${endpoint.replace(/\/$/, "")}/media/create/resumable`, {
    method: "POST",
    headers: {
      ...base,
      "Upload-Length": String(bytes.length),
      "Upload-Metadata": metadata({ fileName, mimeType, access: "public" }),
    },
  });
  if (res.status !== 201 || !res.headers.get("location"))
    throw new Error(`Upload was refused (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const location = new URL(res.headers.get("location"), endpoint).href;
  const CHUNK = 8 * 1024 * 1024;
  let offset = 0;
  while (offset < bytes.length) {
    res = await fetch(location, {
      method: "PATCH",
      headers: {
        ...base,
        "Content-Type": "application/offset+octet-stream",
        "Upload-Offset": String(offset),
      },
      body: bytes.subarray(offset, offset + CHUNK),
    });
    if (res.status !== 204 && res.status !== 200)
      throw new Error(`Upload failed at byte ${offset} (${res.status}): ${(await res.text()).slice(0, 200)}`);
    offset = Number(res.headers.get("upload-offset") ?? offset + CHUNK);
  }
  const media = JSON.parse(res.headers.get("media") ?? "null");
  const id = media?.mediaId ?? media?.id;
  if (!id) throw new Error("The upload finished without returning a media id.");
  return id;
}

/** Signature → upload → register; resolves to the media library item (with its url). */
export async function uploadImage({ api, apiKey, bytes, fileName, mimeType, alt }) {
  const call = async (path, body) => {
    const res = await fetch(`${api.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "x-frontlit-apikey": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} failed (${res.status}): ${text.slice(0, 200)}`);
    return JSON.parse(text);
  };
  const { signature, endpoint } = await call("/media/presigned");
  const mediaLitId = await tusUpload({ endpoint, signature, bytes, fileName, mimeType });
  return call("/media", { mediaLitId, ...(alt ? { alt } : {}) });
}

function markdownFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) markdownFiles(path, out);
    else if (name.endsWith(".md")) out.push(path);
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const many = (name) => args.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3));
  const folder = args.find((a) => !a.startsWith("--"));
  if (!folder || !existsSync(folder)) {
    console.error("Usage: node images.mjs <docs-folder> [--assets=<dir>]... [--from-host=<host>]... [--upload] [--api=<url>] [--map=<file>] [--json]");
    process.exit(2);
  }
  const assets = many("assets").map((d) => resolve(d));
  const fromHosts = many("from-host").map((h) => h.toLowerCase().replace(/^https?:\/\/|\/.*$/g, ""));
  const upload = args.includes("--upload");
  const api = many("api")[0] ?? process.env.FRONTLIT_API_URL ?? "https://api.frontlit.app";
  const mapPath = many("map")[0] ?? join(folder, "..", ".frontlit-images.json");
  const map = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, "utf8")) : {};

  // Group references by source, so each file is uploaded once.
  const sources = new Map();
  const problems = [];
  const pages = markdownFiles(folder);
  for (const page of pages) {
    const file = relative(folder, page).split(sep).join("/");
    for (const ref of findImages(readFileSync(page, "utf8"))) {
      const source = classify(ref.src, { page, assets, fromHosts });
      if (!source) continue;
      if (source.kind === "missing" || source.kind === "unsupported") {
        problems.push({ file, line: ref.line, src: ref.src, problem: source.kind === "missing" ? `not found (tried ${source.tried.map((p) => relative(process.cwd(), p)).join(", ") || "no --assets directory"})` : "unsupported URL scheme" });
        continue;
      }
      const key = source.path ?? source.url;
      if (!sources.has(key)) sources.set(key, { ...source, alt: ref.alt, refs: [] });
      sources.get(key).refs.push({ page, file, line: ref.line, src: ref.src });
    }
  }

  const results = [];
  const apiKey = process.env.FRONTLIT_API_KEY;
  if (upload && sources.size && !apiKey) {
    console.error("--upload needs FRONTLIT_API_KEY: an API key for the FrontLit team (Settings → API keys).");
    process.exit(2);
  }
  for (const [key, source] of sources) {
    const result = { source: source.path ? relative(process.cwd(), source.path) : source.url, refs: source.refs.length, url: null, error: null };
    results.push(result);
    if (!upload) continue;
    try {
      let bytes;
      let mimeType;
      if (source.path) {
        bytes = readFileSync(source.path);
        mimeType = MIME[extname(source.path).toLowerCase()];
      } else {
        const res = await fetch(source.url);
        if (!res.ok) throw new Error(`download failed (${res.status})`);
        bytes = Buffer.from(await res.arrayBuffer());
        mimeType = res.headers.get("content-type")?.split(";")[0] ?? MIME[extname(new URL(source.url).pathname).toLowerCase()];
      }
      if (!mimeType?.startsWith("image/")) throw new Error(`not an image (${mimeType ?? "unknown type"})`);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (!map[hash]) {
        const name = basename(source.path ?? new URL(source.url).pathname) || "image";
        const item = await uploadImage({ api, apiKey, bytes, fileName: name, mimeType, alt: source.alt });
        map[hash] = { url: item.url, mediaId: item.mediaId, source: result.source };
        writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
      }
      result.url = map[hash].url;
      // Rewrite only the lines the references were found on, so code examples stay as written.
      for (const ref of source.refs) {
        const lines = readFileSync(ref.page, "utf8").split("\n");
        const escaped = ref.src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(`(!\\[[^\\]]*\\]\\(\\s*<?)${escaped}(?=[\\s>)])`, "g");
        lines[ref.line - 1] = lines[ref.line - 1].replace(pattern, (_, start) => `${start}${result.url}`);
        writeFileSync(ref.page, lines.join("\n"));
      }
    } catch (error) {
      result.error = error.message;
    }
  }

  if (args.includes("--json")) console.log(JSON.stringify({ images: results, problems }, null, 2));
  else {
    for (const r of results)
      console.log(`${r.error ? "FAILED  " : r.url ? "moved   " : "to move "}${r.source}  (${r.refs} reference(s))${r.url ? `  →  ${r.url}` : ""}${r.error ? `  ${r.error}` : ""}`);
    for (const p of problems) console.log(`PROBLEM ${p.file}:${p.line}  ${p.src}  ${p.problem}`);
    const failed = results.filter((r) => r.error).length;
    console.log(
      `\n${results.length} image(s) to move${upload ? `, ${results.length - failed} moved, ${failed} failed` : " (dry run; add --upload to move them)"}, ${problems.length} problem(s).`,
    );
  }
  if (problems.length || results.some((r) => r.error)) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();