#!/usr/bin/env node
// Check an OpenAPI spec before promising an API reference on FrontLit:
//   node openapi.mjs <spec.json|spec.yaml> [--mount=api-reference] [--routes]
//                    [--cors-origin=https://docs-origin] [--json] [--no-parser] [--parser=<dir>]
//
// Errors are what FrontLit's import refuses (so the reference would not publish); they
// mirror apps/api/src/documentation/openapi/import.ts. Warnings are what it publishes in a
// reduced form. Notes are gaps worth fixing before anyone relies on the reference: missing
// operationIds (page URLs then change when a summary changes), authentication the "Try it"
// panel can't send, no security declared, and what becomes public.
//
// --routes       list the page each operation publishes at (/docs/<mount>/<slug>).
// --cors-origin  send a CORS preflight (OPTIONS only, never the request itself) for each
//                operation to the spec's first absolute server, as the "Try it" panel on
//                that docs origin would, and report the ones the API would refuse.
//
// YAML specs and description checks use FrontLit's parser package (the same cache as
// check.mjs). Node 18+.
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFrontlitParser } from "./frontlit-parser.mjs";

export const LIMITS = { bytes: 5 * 1024 * 1024, operations: 500 };
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v) => (typeof v === "string" ? v.trim() : "");
const escape = (s) => String(s).replace(/~/g, "~0").replace(/\//g, "~1");
export const pointer = (path) => (path.length ? `/${path.map(escape).join("/")}` : "");

// Same as FrontLit's importer.
export function slugify(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
export const normalizeMount = (value) => slugify(value ?? "") || "api-reference";

function resolvePointer(root, ref) {
  if (!ref.startsWith("#")) return undefined;
  let node = root;
  for (const raw of ref.slice(1).split("/").slice(1)) {
    const key = decodeURIComponent(raw).replace(/~1/g, "/").replace(/~0/g, "~");
    if (node === null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}
const deref = (root, value, depth = 0) =>
  value && typeof value === "object" && typeof value.$ref === "string" && depth < 20
    ? deref(root, resolvePointer(root, value.$ref), depth + 1)
    : value;
const safeUrl = (v) => (typeof v === "string" && /^(https?:|mailto:|\/|\{)/i.test(v.trim()) ? v.trim() : undefined);
const resolveServer = (server) =>
  server.url.replace(/\{([^}]+)\}/g, (m, name) => String(server.variables?.[name]?.default ?? m));
const absoluteServers = (list) =>
  (Array.isArray(list) ? list : [])
    .filter((s) => safeUrl(s?.url))
    .map((s) => resolveServer(s))
    .filter((url) => /^https?:\/\//i.test(url));

/**
 * Checks a parsed spec. `parseMarkdown(text)` (optional) throws when FrontLit can't render
 * a description as Markdown. Returns { errors, warnings, notes, operations }, each finding
 * { code, message, fieldPath }.
 */
export function checkSpec(root, { mount = "api-reference", parseMarkdown } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];
  const operations = [];
  const add = (list, code, message, fieldPath) => list.push({ code, message, fieldPath });
  mount = normalizeMount(mount);

  if (!isObject(root)) {
    add(errors, "OPENAPI_INVALID", "The spec must be a JSON or YAML object.");
    return { errors, warnings, notes, operations };
  }
  if (typeof root.swagger === "string") {
    add(errors, "OPENAPI_UNSUPPORTED", "OpenAPI 2.0 (Swagger) isn't supported. Convert the spec to OpenAPI 3.0 or 3.1.", "/swagger");
    return { errors, warnings, notes, operations };
  }
  if (typeof root.openapi !== "string" || !/^3\.[01]\./.test(root.openapi))
    add(errors, "OPENAPI_UNSUPPORTED", "Only OpenAPI 3.0 and 3.1 specs are supported (the `openapi` field).", "/openapi");
  if (!text(root.info?.title)) add(errors, "OPENAPI_INVALID", "`info.title` is required.", "/info/title");
  if (root.paths !== undefined && !isObject(root.paths)) add(errors, "OPENAPI_INVALID", "`paths` must be an object.", "/paths");
  (function walk(node, at) {
    if (Array.isArray(node)) return node.forEach((child, i) => walk(child, [...at, i]));
    if (!isObject(node)) return;
    if (typeof node.$ref === "string") {
      if (!node.$ref.startsWith("#"))
        add(errors, "OPENAPI_UNSUPPORTED", "References to other files aren't supported. Bundle the spec into a single file.", pointer([...at, "$ref"]));
      else if (resolvePointer(root, node.$ref) === undefined)
        add(errors, "OPENAPI_INVALID", `\`${node.$ref}\` doesn't point to anything in the spec.`, pointer([...at, "$ref"]));
    }
    for (const [key, child] of Object.entries(node)) walk(child, [...at, key]);
  })(root, []);
  if (errors.length) return { errors, warnings, notes, operations };

  const describe = (value, fieldPath) => {
    if (!parseMarkdown || !text(value)) return;
    try {
      parseMarkdown(text(value));
    } catch {
      add(warnings, "OPENAPI_DESCRIPTION_TEXT", "This description uses Markdown or HTML that docs don't support, so it is shown as plain text.", fieldPath);
    }
  };
  describe(root.info.description, "/info/description");

  const schemes = isObject(root.components?.securitySchemes) ? root.components.securitySchemes : {};
  const ids = new Map();
  const routes = new Map();
  let hidden = 0;
  let withoutId = [];
  let undeclaredAuth = 0;
  const unsupportedAuth = new Map();
  for (const [path, rawItem] of Object.entries(isObject(root.paths) ? root.paths : {})) {
    const item = deref(root, rawItem);
    if (!isObject(item)) continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!isObject(operation)) continue;
      const at = ["paths", path, method];
      if (operation["x-internal"] === true || operation["x-excluded"] === true) {
        hidden++;
        continue;
      }
      const operationId = text(operation.operationId) || undefined;
      if (operationId) {
        if (ids.has(operationId))
          add(errors, "OPENAPI_DUPLICATE_OPERATION", `\`operationId\` "${operationId}" is used twice (also at ${ids.get(operationId)}).`, pointer([...at, "operationId"]));
        ids.set(operationId, pointer(at));
      } else withoutId.push(`${method.toUpperCase()} ${path}`);
      const summary = text(operation.summary) || text(item.summary);
      const slug = slugify(operationId ?? "") || slugify(summary) || slugify(`${method} ${path}`);
      const route = `${mount}/${slug}`;
      if (routes.has(route))
        add(errors, "ROUTE_COLLISION", `Two operations would be published at /docs/${route} (also ${routes.get(route)}). Give one a distinct \`operationId\` or summary.`, pointer(at));
      routes.set(route, pointer(at));
      describe(operation.description, pointer([...at, "description"]));

      const declared = Array.isArray(operation.security) || Array.isArray(root.security);
      if (!declared) undeclaredAuth++;
      const requirements = (Array.isArray(operation.security) ? operation.security : Array.isArray(root.security) ? root.security : []).filter(isObject);
      for (const key of requirements.flatMap((r) => Object.keys(r))) {
        const scheme = deref(root, schemes[key]);
        const reason = !isObject(scheme)
          ? "is not defined in components.securitySchemes"
          : scheme.type === "apiKey" && scheme.in === "cookie"
            ? "is a cookie, which a browser can't send to another site"
            : scheme.type === "apiKey" || scheme.type === "oauth2" || scheme.type === "openIdConnect" || (scheme.type === "http" && /^(bearer|basic)$/i.test(scheme.scheme ?? ""))
              ? null
              : `has type "${scheme.type}${scheme.scheme ? ` ${scheme.scheme}` : ""}", which "Try it" can't send`;
        if (reason) unsupportedAuth.set(key, reason);
      }
      const servers = absoluteServers(operation.servers).length
        ? absoluteServers(operation.servers)
        : absoluteServers(item.servers).length
          ? absoluteServers(item.servers)
          : absoluteServers(root.servers);
      operations.push({ route: `/docs/${route}`, method, path, operationId, server: servers[0] ?? null, requirements, schemes });
    }
  }
  if (operations.length > LIMITS.operations)
    add(errors, "OPENAPI_LIMIT", `The spec has ${operations.length} operations; at most ${LIMITS.operations} are supported.`);
  if (!operations.length) add(warnings, "OPENAPI_EMPTY", "The spec has no public operations to publish.");
  if (!absoluteServers(root.servers).length)
    add(warnings, "OPENAPI_NO_SERVER", "The spec has no absolute server URL (like https://api.example.com), so “Try it” is turned off and code samples use {baseUrl}.", "/servers");

  if (withoutId.length)
    add(notes, "NO_OPERATION_ID", `${withoutId.length} of ${operations.length} operation(s) have no operationId, so their page URL comes from the summary (or method and path) and changes whenever that does. Add stable operationIds before publishing links. ${withoutId.slice(0, 5).join(", ")}${withoutId.length > 5 ? ", …" : ""}`);
  if (undeclaredAuth)
    add(notes, "NO_SECURITY", `${undeclaredAuth} operation(s) declare no \`security\` (neither on the operation nor at the root), so their pages can't say whether they need authentication. Use \`security: []\` for public routes.`);
  for (const [key, reason] of unsupportedAuth) add(notes, "TRY_IT_AUTH", `Security scheme "${key}" ${reason}.`, pointer(["components", "securitySchemes", key]));
  add(notes, "PUBLIC_SPEC", `Publishing makes the whole spec public at /openapi.json, even from a private repository${hidden ? `; ${hidden} operation(s) marked x-internal/x-excluded are left out` : "; mark internal operations with x-internal: true"}. Components (schemas, examples) are published as written.`);
  return { errors, warnings, notes, operations };
}

/** OPTIONS preflights like the "Try it" panel's; resolves to the operations that fail. */
export async function checkCors(operations, origin, { concurrency = 6, limit = 100 } = {}) {
  const queue = operations.filter((o) => o.server).slice(0, limit);
  const failures = [];
  let checked = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const op = queue.shift();
        const headers = new Set(["content-type"]);
        for (const key of op.requirements.flatMap((r) => Object.keys(r))) {
          const s = op.schemes[key];
          if (s?.type === "apiKey" && s.in === "header" && s.name) headers.add(s.name.toLowerCase());
          else if (s?.type === "http" || s?.type === "oauth2" || s?.type === "openIdConnect") headers.add("authorization");
        }
        const url = `${op.server.replace(/\/+$/, "")}${op.path.replace(/\{[^}]+\}/g, "example")}`;
        const method = op.method.toUpperCase();
        checked++;
        try {
          const res = await fetch(url, {
            method: "OPTIONS",
            headers: { Origin: origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": [...headers].join(",") },
          });
          await res.arrayBuffer().catch(() => {});
          const allowOrigin = res.headers.get("access-control-allow-origin");
          const allowMethods = (res.headers.get("access-control-allow-methods") ?? "").toUpperCase().split(/\s*,\s*/);
          const allowHeaders = (res.headers.get("access-control-allow-headers") ?? "").toLowerCase().split(/\s*,\s*/);
          const problems = [];
          if (allowOrigin !== "*" && allowOrigin !== origin) problems.push(`origin not allowed (Access-Control-Allow-Origin: ${allowOrigin ?? "missing"})`);
          // GET/HEAD/POST are allowed without being listed; others must be.
          if (!["GET", "HEAD", "POST"].includes(method) && !allowMethods.includes(method) && !allowMethods.includes("*")) problems.push(`${method} not in Access-Control-Allow-Methods`);
          const missing = [...headers].filter((h) => !allowHeaders.includes(h) && !allowHeaders.includes("*"));
          if (missing.length) problems.push(`header(s) ${missing.join(", ")} not in Access-Control-Allow-Headers`);
          if (problems.length) failures.push({ ...op, status: res.status, problems });
        } catch (error) {
          failures.push({ ...op, status: 0, problems: [`request failed (${error.cause?.code ?? error.message})`] });
        }
      }
    }),
  );
  return { checked, failures };
}

/** Line and column for a JSON pointer, using the yaml library's positions. */
function locator(yaml, source) {
  if (!yaml) return () => null;
  let doc;
  let counter;
  return (fieldPath) => {
    if (!fieldPath) return null;
    if (!doc) {
      counter = new yaml.LineCounter();
      doc = yaml.parseDocument(source, { lineCounter: counter, keepSourceTokens: false });
    }
    let node = doc.contents;
    let found = null;
    for (const segment of fieldPath.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))) {
      if (yaml.isMap(node)) {
        const pair = node.items.find((e) => String(e.key?.value ?? e.key) === segment);
        if (!pair) break;
        found = pair.key ?? found;
        node = pair.value;
      } else if (yaml.isSeq(node)) {
        const child = node.items[Number(segment)];
        if (!child) break;
        found = child;
        node = child;
      } else break;
    }
    const offset = found?.range?.[0];
    return offset === undefined ? null : counter.linePos(offset).line;
  };
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file || !existsSync(file)) {
    console.error("Usage: node openapi.mjs <spec> [--mount=api-reference] [--routes] [--cors-origin=<https://docs-origin>] [--json] [--no-parser] [--parser=<dir>]");
    process.exit(2);
  }
  const json = args.includes("--json");
  const say = (line) => !json && console.log(line);
  const source = readFileSync(file, "utf8");
  const isJson = /\.json$/i.test(file);
  const parser = await loadFrontlitParser({ noParser: args.includes("--no-parser"), parserDir: option("parser") });
  if (!parser.docs) say(`FrontLit's parser is unavailable (${parser.reason}); descriptions are not checked${isJson ? "" : " and YAML can't be read"}.`);

  const result = { file, errors: [], warnings: [], notes: [], operations: [] };
  const finish = () => {
    const line = locator(parser.yaml, source);
    for (const list of [result.errors, result.warnings, result.notes]) for (const f of list) f.line = line(f.fieldPath) ?? undefined;
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      const print = (label, list) => list.forEach((f) => console.log(`${label} ${file}${f.line ? `:${f.line}` : ""}  ${f.code}  ${f.message}${!f.line && f.fieldPath ? ` (at ${f.fieldPath})` : ""}`));
      print("ERROR", result.errors);
      print("WARN ", result.warnings);
      print("NOTE ", result.notes);
      console.log(`\n${result.errors.length ? `${result.errors.length} error(s): FrontLit would refuse this spec.` : `OK: ${result.operations.length} operation page(s) would publish.`} ${result.warnings.length} warning(s), ${result.notes.length} note(s).`);
    }
    process.exit(result.errors.length ? 1 : 0);
  };

  if (statSync(file).size > LIMITS.bytes) {
    result.errors.push({ code: "OPENAPI_LIMIT", message: "The spec is larger than 5 MiB." });
    finish();
  }
  let root;
  try {
    if (isJson) root = JSON.parse(source);
    else if (parser.yaml) root = parser.yaml.parse(source, { maxAliasCount: 0, uniqueKeys: true });
    else {
      console.error("Reading a YAML spec needs FrontLit's parser package (npm); convert it to JSON or run online.");
      process.exit(2);
    }
  } catch (error) {
    result.errors.push({ code: "OPENAPI_PARSE", message: `The spec could not be parsed: ${error.message.split("\n")[0]}`, line: error.linePos?.[0]?.line });
    finish();
  }
  const parseMarkdown = parser.docs ? (md) => parser.docs.parseDocsMarkdown(md, { file, frontmatter: false }) : undefined;
  const checked = checkSpec(root, { mount: option("mount"), parseMarkdown });
  Object.assign(result, checked, { operations: checked.operations.map(({ route, method, path, operationId }) => ({ route, method: method.toUpperCase(), path, operationId })) });

  if (args.includes("--routes") && !json)
    for (const op of result.operations) console.log(`${op.route}  ${op.method} ${op.path}`);

  const origin = option("cors-origin");
  if (origin && !result.errors.length) {
    const { checked: count, failures } = await checkCors(checked.operations, origin.replace(/\/+$/, ""));
    if (!count) result.notes.push({ code: "CORS_SKIPPED", message: "No operation has an absolute server URL, so CORS was not checked." });
    for (const f of failures)
      result.notes.push({ code: "CORS", message: `${f.method.toUpperCase()} ${f.path} from ${origin}: ${f.problems.join("; ")}. "Try it" can't call it until the API allows this origin.` });
    if (count && !failures.length) result.notes.push({ code: "CORS_OK", message: `All ${count} preflight(s) from ${origin} were allowed.` });
  }
  finish();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
