// node images.test.mjs — runs images.mjs against a local stand-in for FrontLit's media API.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { findImages, classify } from "./images.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "images.mjs");

// Parsing: images in prose are found, code is skipped, <…> destinations are unwrapped.
assert.deepEqual(
  findImages('![A](a.png "t")\n\n`![no](x.png)`\n\n```\n![no](y.png)\n```\n\n![B](<b c.png>)').map((i) => [i.line, i.alt, i.src]),
  [[1, "A", "a.png"], [9, "B", "b c.png"]],
);

// Classification: https stays unless its host is retired; http and local files move.
const root = mkdtempSync(join(tmpdir(), "frontlit-images-"));
const docs = join(root, "site", "docs");
mkdirSync(join(docs, "guides", "img"), { recursive: true });
mkdirSync(join(root, "static", "img"), { recursive: true });
const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c40000000049454e44ae426082", "hex");
writeFileSync(join(docs, "guides", "img", "local.png"), png);
writeFileSync(join(root, "static", "img", "shared.png"), png); // same bytes: uploaded once
const page = join(docs, "guides", "a.md");
const ctx = { page, assets: [join(root, "static")], fromHosts: ["old.example.com"] };
assert.equal(classify("https://cdn.example.com/x.png", ctx), null);
assert.equal(classify("https://old.example.com/x.png", ctx).kind, "remote");
assert.equal(classify("http://cdn.example.com/x.png", ctx).kind, "remote");
assert.equal(classify("img/local.png", ctx).kind, "local");
assert.equal(classify("/img/shared.png", ctx).kind, "local");
assert.equal(classify("/img/none.png", ctx).kind, "missing");

writeFileSync(
  page,
  "---\ntitle: A\n---\n\n![Local](img/local.png)\n\n![Shared](/img/shared.png)\n\n![Kept](https://cdn.example.com/k.png)\n\n```\n![code](img/local.png)\n```\n",
);
writeFileSync(join(docs, "b.md"), "---\ntitle: B\n---\n\n![Again](/img/shared.png)\n");

// A stand-in for the API: signatures are single-use, uploads use TUS, registering returns a URL.
const issued = new Set();
let uploads = 0;
let registered = 0;
const server = createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const url = new URL(req.url, "http://x");
    if (req.method === "POST" && url.pathname === "/media/presigned") {
      assert.equal(req.headers["x-frontlit-apikey"], "test-key");
      const signature = `sig-${issued.size}`;
      issued.add(signature);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ signature, endpoint: `http://127.0.0.1:${server.address().port}/store` }));
    }
    if (req.method === "POST" && url.pathname === "/store/media/create/resumable") {
      const signature = req.headers["x-medialit-signature"];
      assert.ok(issued.delete(signature), "each signature is used once");
      assert.equal(req.headers["tus-resumable"], "1.0.0");
      assert.match(req.headers["upload-metadata"], /^fileName \S+,mimeType \S+,access \S+$/);
      res.writeHead(201, { location: `/store/media/create/resumable/u${++uploads}` });
      return res.end();
    }
    if (req.method === "PATCH" && url.pathname.startsWith("/store/media/create/resumable/")) {
      const body = Buffer.concat(chunks);
      assert.equal(req.headers["upload-offset"], "0");
      assert.deepEqual(body, png);
      res.writeHead(204, { "upload-offset": String(body.length), media: JSON.stringify({ mediaId: `ml-${uploads}` }) });
      return res.end();
    }
    if (req.method === "POST" && url.pathname === "/media") {
      const { mediaLitId } = JSON.parse(Buffer.concat(chunks).toString());
      registered++;
      res.writeHead(201, { "content-type": "application/json" });
      return res.end(JSON.stringify({ mediaId: `m-${mediaLitId}`, mediaLitId, url: `https://media.example.com/${mediaLitId}.png` }));
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const api = `http://127.0.0.1:${server.address().port}`;

const run = (extra, env = {}) =>
  new Promise((done) => {
    const child = spawn("node", [script, docs, `--assets=${join(root, "static")}`, ...extra], {
      env: { ...process.env, ...env },
    });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    child.on("close", (code) => done({ code, text }));
  });

// Dry run: plans two sources (the shared file is referenced twice) and changes nothing.
let r = await run([]);
assert.equal(r.code, 0, r.text);
assert.match(r.text, /2 image\(s\) to move \(dry run/);
assert.equal(uploads, 0);

// Upload: identical bytes upload once; every reference outside code is rewritten.
r = await run(["--upload", `--api=${api}`], { FRONTLIT_API_KEY: "test-key" });
assert.equal(r.code, 0, r.text);
assert.equal(uploads, 1, r.text);
assert.equal(registered, 1);
const a = readFileSync(page, "utf8");
assert.match(a, /!\[Local\]\(https:\/\/media\.example\.com\/ml-1\.png\)/);
assert.match(a, /!\[Shared\]\(https:\/\/media\.example\.com\/ml-1\.png\)/);
assert.match(a, /!\[Kept\]\(https:\/\/cdn\.example\.com\/k\.png\)/);
assert.match(a, /!\[code\]\(img\/local\.png\)/);
assert.match(readFileSync(join(docs, "b.md"), "utf8"), /!\[Again\]\(https:\/\/media\.example\.com\/ml-1\.png\)/);
assert.ok(existsSync(join(root, "site", ".frontlit-images.json")));

// A rerun has nothing left to move.
r = await run(["--upload", `--api=${api}`], { FRONTLIT_API_KEY: "test-key" });
assert.match(r.text, /0 image\(s\) to move/, r.text);

// Without an API key, --upload refuses before touching anything.
writeFileSync(join(docs, "c.md"), "---\ntitle: C\n---\n\n![C](/img/shared.png)\n");
r = await run(["--upload", `--api=${api}`], { FRONTLIT_API_KEY: "" });
assert.equal(r.code, 2, r.text);
assert.match(readFileSync(join(docs, "c.md"), "utf8"), /\/img\/shared\.png/);

// A missing file is a problem (exit 1).
writeFileSync(join(docs, "d.md"), "---\ntitle: D\n---\n\n![D](/img/none.png)\n");
r = await run([]);
assert.equal(r.code, 1);
assert.match(r.text, /PROBLEM d\.md:5 {2}\/img\/none\.png {2}not found/);

server.close();
console.log("images.mjs behaves as documented.");
