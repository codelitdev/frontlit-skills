// node openapi.test.mjs — the preflight's verdicts, routes, notes and CORS check.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { checkSpec, checkCors, slugify } from "./openapi.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "openapi.mjs");
const codes = (list) => list.map((f) => f.code);

const spec = (extra = {}) => ({
  openapi: "3.1.0",
  info: { title: "Acme API", version: "1" },
  servers: [{ url: "https://api.example.com" }],
  components: {
    securitySchemes: {
      key: { type: "apiKey", in: "header", name: "X-Api-Key" },
      session: { type: "apiKey", in: "cookie", name: "sid" },
    },
    schemas: { File: { type: "object" } },
  },
  security: [{ key: [] }],
  paths: {
    "/files": {
      get: { operationId: "listFiles", summary: "List files" },
      post: { summary: "Upload a file", requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/File" } } } } },
    },
    "/files/{id}": {
      delete: { operationId: "deleteFile", security: [{ session: [] }] },
      patch: { operationId: "internalPatch", "x-internal": true },
    },
  },
  ...extra,
});

// Slugs and routes match FrontLit's importer.
assert.equal(slugify("listFiles"), "list-files");
let r = checkSpec(spec(), { mount: "api" });
assert.deepEqual(r.errors, []);
assert.deepEqual(r.operations.map((o) => o.route), ["/docs/api/list-files", "/docs/api/upload-a-file", "/docs/api/delete-file"]);
assert.deepEqual(codes(r.notes), ["NO_OPERATION_ID", "TRY_IT_AUTH", "PUBLIC_SPEC"]);
assert.match(r.notes[0].message, /1 of 3 operation\(s\) have no operationId.*POST \/files/);
assert.match(r.notes[1].message, /"session" is a cookie/);
assert.match(r.notes[2].message, /1 operation\(s\) marked x-internal/);

// What FrontLit refuses.
const refused = {
  swagger: { swagger: "2.0", info: { title: "x" }, paths: {} },
  version: spec({ openapi: "3.2.0" }),
  title: spec({ info: { version: "1" } }),
  external: spec({ paths: { "/a": { get: { operationId: "a", responses: { 200: { $ref: "other.yaml#/R" } } } } } }),
  dangling: spec({ paths: { "/a": { get: { operationId: "a", responses: { 200: { $ref: "#/components/responses/Nope" } } } } } }),
  duplicate: spec({ paths: { "/a": { get: { operationId: "same" } }, "/b": { get: { operationId: "same" } } } }),
  collision: spec({ paths: { "/a": { get: { summary: "Get it" } }, "/b": { get: { summary: "Get it!" } } } }),
};
for (const [name, value] of Object.entries(refused)) assert.ok(checkSpec(value).errors.length, `${name} should be refused`);
assert.deepEqual(codes(checkSpec(refused.duplicate).errors), ["OPENAPI_DUPLICATE_OPERATION", "ROUTE_COLLISION"]);
const many = spec({ paths: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`/p${i}`, { get: { operationId: `op${i}` } }])) });
assert.deepEqual(codes(checkSpec(many).errors), ["OPENAPI_LIMIT"]);

// Published in a reduced form: no absolute server, no operations, no security declared.
r = checkSpec(spec({ servers: [{ url: "/v1" }], security: undefined, paths: { "/a": { get: { operationId: "a" } } } }));
assert.deepEqual(codes(r.warnings), ["OPENAPI_NO_SERVER"]);
assert.ok(codes(r.notes).includes("NO_SECURITY"));
assert.deepEqual(codes(checkSpec(spec({ paths: {} })).warnings), ["OPENAPI_EMPTY"]);
// Server variables resolve to their defaults.
r = checkSpec(spec({ servers: [{ url: "{scheme}://{host}", variables: { scheme: { default: "https" }, host: { default: "api.example.com" } } }] }));
assert.deepEqual(r.warnings, []);
assert.equal(r.operations[0].server, "https://api.example.com");

// Descriptions FrontLit can't render as Markdown are a warning.
r = checkSpec(spec({ info: { title: "x", description: "bad" } }), { parseMarkdown: () => { throw new Error("no"); } });
assert.deepEqual(codes(r.warnings), ["OPENAPI_DESCRIPTION_TEXT"]);

// CORS: preflights only; a route allowing the origin passes, one without the auth header fails.
const seen = [];
const api = createServer((req, res) => {
  seen.push(`${req.method} ${req.url}`);
  const allowHeaders = req.url === "/files" ? "content-type, x-api-key" : "content-type";
  res.writeHead(204, {
    "access-control-allow-origin": req.headers.origin,
    "access-control-allow-methods": "GET, POST, DELETE",
    "access-control-allow-headers": allowHeaders,
  });
  res.end();
});
await new Promise((done) => api.listen(0, "127.0.0.1", done));
const local = `http://127.0.0.1:${api.address().port}`;
r = checkSpec(spec({ servers: [{ url: local }], security: [{ key: [] }], paths: { "/files": { get: { operationId: "a" } }, "/files/{id}": { delete: { operationId: "b" } } } }));
const cors = await checkCors(r.operations, "https://docs.example.com");
assert.equal(cors.checked, 2);
assert.deepEqual(cors.failures.map((f) => [f.path, f.problems]), [["/files/{id}", ["header(s) x-api-key not in Access-Control-Allow-Headers"]]]);
assert.ok(seen.every((s) => s.startsWith("OPTIONS ")), "only preflights are sent");
assert.ok(seen.includes("OPTIONS /files/example"), "path parameters are filled in");
api.close();

// CLI: JSON spec, exit codes, --routes.
const dir = mkdtempSync(join(tmpdir(), "frontlit-openapi-"));
const run = (argv) =>
  new Promise((done) => {
    const child = spawn("node", [script, ...argv]);
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (status) => done({ status, out }));
  });
writeFileSync(join(dir, "good.json"), JSON.stringify(spec(), null, 2));
let cli = await run([join(dir, "good.json"), "--mount=api", "--routes", "--no-parser"]);
assert.equal(cli.status, 0, cli.out);
assert.match(cli.out, /\/docs\/api\/list-files {2}GET \/files/);
assert.match(cli.out, /OK: 3 operation page\(s\) would publish/);
writeFileSync(join(dir, "bad.json"), JSON.stringify(refused.duplicate));
cli = await run([join(dir, "bad.json"), "--no-parser", "--json"]);
assert.equal(cli.status, 1);
assert.deepEqual(codes(JSON.parse(cli.out).errors), ["OPENAPI_DUPLICATE_OPERATION", "ROUTE_COLLISION"]);
writeFileSync(join(dir, "broken.json"), "{ nope");
cli = await run([join(dir, "broken.json"), "--no-parser"]);
assert.equal(cli.status, 1);
assert.match(cli.out, /OPENAPI_PARSE/);

// YAML (and line numbers) need FrontLit's parser package; skipped when it can't be installed.
writeFileSync(
  join(dir, "spec.yaml"),
  "openapi: 3.0.3\ninfo:\n  title: Acme\nservers:\n  - url: https://api.example.com\npaths:\n  /a:\n    get:\n      operationId: same\n  /b:\n    get:\n      operationId: same\n",
);
cli = await run([join(dir, "spec.yaml")]);
if (/parser is unavailable/.test(cli.out)) console.log("Skipped the YAML run: FrontLit's parser is unavailable.");
else {
  assert.equal(cli.status, 1, cli.out);
  assert.match(cli.out, /spec\.yaml:12 {2}OPENAPI_DUPLICATE_OPERATION/);
}

console.log("openapi.mjs behaves as documented.");
