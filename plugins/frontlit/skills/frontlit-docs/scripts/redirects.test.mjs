// node redirects.test.mjs — planning, site.json merging and live verification.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { plan, target, mergeSiteRedirects, verify, MAX_RULES } from "./redirects.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "redirects.mjs");

// The prefix that covers most pages wins; the rest become rules; the home page maps by prefix.
const map = {
  "/": "/docs",
  "/guides/install": "/docs/guides/install",
  "/guides/deploy": "/docs/guides/deploy",
  "/api/uploadMedia": "/docs/api/upload-media",
  "/faq": "/docs/help/faq#billing",
};
let p = plan(Object.entries(map));
assert.equal(p.pathPrefix, "/docs");
assert.deepEqual(p.rules, [
  { from: "/api/uploadMedia", to: "/docs/api/upload-media" },
  { from: "/faq", to: "/docs/help/faq#billing" },
]);
assert.equal(p.covered, 3);
assert.deepEqual(p.problems, []);
// Every entry lands where the map says, the way FrontLit applies a redirect domain.
for (const [from, to] of Object.entries(map)) assert.equal(target(p, from), to, from);
assert.equal(target(p, "/faq/"), "/docs/help/faq#billing", "rules ignore a trailing slash");

// Paths kept as they were need no prefix; a forced prefix is respected.
p = plan([["/docs/a", "/docs/a"], ["/docs/b", "/docs/b"], ["/docs/old", "/docs/new"]]);
assert.equal(p.pathPrefix, "");
assert.deepEqual(p.rules, [{ from: "/docs/old", to: "/docs/new" }]);
p = plan([["/a", "/docs/a"]], "/docs/v1");
assert.deepEqual(p.rules, [{ from: "/a", to: "/docs/a" }]);

// Problems: absolute URL targets, too many rules.
p = plan([["/a", "https://elsewhere.example/a"]]);
assert.match(p.problems[0], /only send paths to this site/);
p = plan(Array.from({ length: MAX_RULES + 2 }, (_, i) => [`/p${i}`, `/docs/q${i}`]));
assert.ok(p.problems.some((m) => /at most 500/.test(m)));

// site.json: changed paths are added, unchanged and existing ones are left alone.
const merged = mergeSiteRedirects(
  { header: {}, redirects: [{ from: "/guides/deploy", to: "/docs/deploying" }] },
  Object.entries({ "/guides/deploy": "/docs/guides/deploy", "/docs/a": "/docs/a", "/old": "/docs/new" }),
);
assert.deepEqual(merged.added, [{ from: "/old", to: "/docs/new" }]);
assert.equal(merged.site.redirects.length, 2);
assert.match(merged.skipped[0], /already redirects/);

// CLI: --json prints what add_redirect_domain / update_redirect_domain take.
const dir = mkdtempSync(join(tmpdir(), "frontlit-redirects-"));
const mapFile = join(dir, "port-redirects.json");
writeFileSync(mapFile, JSON.stringify(map));
let r = spawnSync("node", [script, mapFile, "--host=docs.example.com", "--json"], { encoding: "utf8" });
assert.equal(r.status, 0, r.stderr);
const out = JSON.parse(r.stdout);
assert.equal(out.hostname, "docs.example.com");
assert.equal(out.pathPrefix, "/docs");
assert.equal(out.rules.length, 2);
r = spawnSync("node", [script, mapFile], { encoding: "utf8" });
assert.match(r.stdout, /\/api\/uploadMedia \/docs\/api\/upload-media/);

const siteFile = join(dir, "site.json");
writeFileSync(siteFile, JSON.stringify({ redirects: [] }));
r = spawnSync("node", [script, mapFile, `--site-json=${siteFile}`], { encoding: "utf8" });
assert.equal(r.status, 0, r.stderr);
assert.equal(JSON.parse(readFileSync(siteFile, "utf8")).redirects.length, 5);

// Verify: an old host that redirects like FrontLit, plus a site with one missing page.
const site = createServer((req, res) => {
  const path = req.url.split("?")[0];
  res.writeHead(["/docs", "/docs/guides/install", "/docs/guides/deploy", "/docs/help/faq"].includes(path) ? 200 : 404);
  res.end("ok");
});
await new Promise((done) => site.listen(0, "127.0.0.1", done));
const siteOrigin = `http://127.0.0.1:${site.address().port}`;
const old = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  res.writeHead(301, { location: `${siteOrigin}${target(plan(Object.entries(map)), url.pathname)}${url.search}` });
  res.end();
});
await new Promise((done) => old.listen(0, "127.0.0.1", done));
const results = await verify(`http://127.0.0.1:${old.address().port}`, Object.entries(map));
assert.deepEqual(results.filter((x) => !x.ok).map((x) => [x.from, x.status]), [["/api/uploadMedia", 404]]);
r = await runAsync([script, mapFile, `--verify=http://127.0.0.1:${old.address().port}`]);
assert.equal(r.status, 1);
assert.match(r.stdout, /FAIL \/api\/uploadMedia {2}expected \/docs\/api\/upload-media, got 404/);
assert.match(r.stdout, /4 of 5 old URL\(s\) land on their new page/);
site.close();
old.close();

// spawnSync would block the servers above, so run the CLI asynchronously.
function runAsync(argv) {
  return new Promise((done) => {
    const child = spawn("node", argv);
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("close", (status) => done({ status, stdout }));
  });
}

console.log("redirects.mjs behaves as documented.");
