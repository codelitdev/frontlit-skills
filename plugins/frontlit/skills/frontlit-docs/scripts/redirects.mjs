#!/usr/bin/env node
// Keep the old docs URLs working after a port. Reads a JSON map of old path → new path
// (port-redirects.json from port.mjs, or one you write) and either:
//
//   node redirects.mjs <map.json> [--host=docs.example.com] [--prefix=<path>] [--json]
//     plans a FrontLit redirect domain for the old host: the path prefix that covers the
//     most pages, plus a rule for each page the prefix doesn't cover;
//
//   node redirects.mjs <map.json> --site-json=<frontlit/site.json>
//     adds `redirects` to site.json instead, for docs that moved on the site's own domain;
//
//   node redirects.mjs <map.json> --verify=<https://old-host> [--json]
//     requests every old URL once the redirects are live and reports each one that doesn't
//     end with a 200 on its new path.
//
// Node 18+, no dependencies. It never changes DNS or FrontLit settings.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// FrontLit's limits for a redirect domain (packages/api-contract, schemas/domains.ts).
export const MAX_RULES = 500;
const SITE_PATH = /^\/\S*$/;
const PREFIX = /^(\/[A-Za-z0-9._~-]+)*$/;

const trim = (path) => path.replace(/\/+$/, "") || "/";

/** Where a redirect domain sends a path: the exact rule, else prefix + path. */
export function target({ pathPrefix, rules }, path) {
  const rule = rules.find((r) => trim(r.from) === trim(path));
  if (rule) return rule.to;
  return path === "/" ? pathPrefix || "/" : `${pathPrefix}${path}`;
}

/** The prefix that covers the most entries, then one rule per entry it misses. */
export function plan(entries, prefix) {
  const problems = [];
  const usable = [];
  for (const [from, to] of entries) {
    if (!SITE_PATH.test(from) || from.length > 500) problems.push(`${from}: the old path must start with "/" and have no spaces.`);
    else if (!SITE_PATH.test(to) || to.length > 500) problems.push(`${from} → ${to}: a redirect domain can only send paths to this site (start with "/").`);
    else usable.push([trim(from), to]);
  }
  let pathPrefix = prefix;
  if (pathPrefix === undefined) {
    const votes = new Map([["", 0]]);
    for (const [from, to] of usable) {
      const path = trim(to.split("#")[0]);
      const candidate = from === "/" ? (path === "/" ? "" : path) : path.endsWith(from) ? path.slice(0, -from.length) : null;
      if (candidate !== null && PREFIX.test(candidate)) votes.set(candidate, (votes.get(candidate) ?? 0) + 1);
    }
    // Most pages covered; on a tie, the shorter prefix.
    pathPrefix = [...votes].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
  }
  if (!PREFIX.test(pathPrefix)) problems.push(`Prefix "${pathPrefix}" must be empty or a path like "/docs" with no trailing slash.`);
  const rules = [];
  const seen = new Set();
  for (const [from, to] of usable) {
    if (seen.has(from)) {
      problems.push(`${from} is mapped twice; keep one.`);
      continue;
    }
    seen.add(from);
    if (target({ pathPrefix, rules: [] }, from) !== to) rules.push({ from, to });
  }
  if (rules.length > MAX_RULES)
    problems.push(`${rules.length} rules needed; a redirect domain takes at most ${MAX_RULES}. Keep more of the old paths (slug:) so the prefix covers them.`);
  return { pathPrefix, rules, covered: usable.length - rules.length, total: usable.length, problems };
}

/** site.json redirects for every changed path, keeping the ones already there. */
export function mergeSiteRedirects(site, entries) {
  const existing = Array.isArray(site.redirects) ? site.redirects : [];
  const taken = new Set(existing.map((r) => trim(r.from)));
  const added = [];
  const skipped = [];
  for (const [from, to] of entries) {
    if (trim(from) === trim(to.split("#")[0])) continue; // unchanged
    if (!SITE_PATH.test(from)) skipped.push(`${from}: not a site path`);
    else if (taken.has(trim(from))) skipped.push(`${from}: site.json already redirects it`);
    else {
      taken.add(trim(from));
      added.push({ from, to });
    }
  }
  return { site: { ...site, redirects: [...existing, ...added] }, added, skipped };
}

/** Follow redirects by hand (up to 10 hops); resolves to { status, url, hops }. */
async function follow(url) {
  let current = url;
  for (let hops = 0; hops <= 10; hops++) {
    const res = await fetch(current, { redirect: "manual", headers: { "user-agent": "frontlit-docs-redirect-check" } });
    await res.arrayBuffer().catch(() => {});
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) current = new URL(location, current).href;
    else return { status: res.status, url: current, hops };
  }
  return { status: 0, url: current, hops: 11 };
}

export async function verify(origin, entries, concurrency = 6) {
  const queue = [...entries];
  const results = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const [from, to] = queue.shift();
        const expected = trim(to.split("#")[0].split("?")[0]);
        try {
          const r = await follow(new URL(from, origin).href);
          const landed = new URL(r.url);
          const ok = r.status === 200 && (/^https?:/.test(to) ? trim(r.url) === trim(to.split("#")[0]) : trim(landed.pathname) === expected);
          results.push({ from, to, ok, status: r.status, landed: r.url, hops: r.hops });
        } catch (error) {
          results.push({ from, to, ok: false, status: 0, landed: null, error: error.cause?.code ?? error.message });
        }
      }
    }),
  );
  return results.sort((a, b) => (a.from < b.from ? -1 : 1));
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const help = args.includes("--help") || args.includes("-h");
  const file = args.find((a) => !a.startsWith("--"));
  if (help || !file || !existsSync(file)) {
    (help ? console.log : console.error)(
      "Usage: node redirects.mjs <map.json> [--host=<old-host>] [--prefix=<path>] [--json]\n" +
        "       node redirects.mjs <map.json> --site-json=<site.json>\n" +
        "       node redirects.mjs <map.json> --verify=<https://old-host> [--json]",
    );
    process.exit(help ? 0 : 2);
  }
  const map = JSON.parse(readFileSync(file, "utf8"));
  const entries = Object.entries(map).filter(([, to]) => typeof to === "string");
  const json = args.includes("--json");

  const origin = option("verify");
  if (origin) {
    const results = await verify(origin, entries);
    const failed = results.filter((r) => !r.ok);
    if (json) console.log(JSON.stringify({ checked: results.length, failed }, null, 2));
    else {
      for (const r of failed)
        console.log(`FAIL ${r.from}  expected ${r.to}, got ${r.error ?? `${r.status} at ${r.landed}`}`);
      console.log(`\n${results.length - failed.length} of ${results.length} old URL(s) land on their new page.`);
    }
    process.exit(failed.length ? 1 : 0);
  }

  const siteJson = option("site-json");
  if (siteJson) {
    const site = JSON.parse(readFileSync(siteJson, "utf8"));
    const { site: next, added, skipped } = mergeSiteRedirects(site, entries);
    if (added.length) writeFileSync(siteJson, `${JSON.stringify(next, null, 2)}\n`);
    for (const r of added) console.log(`added    ${r.from} → ${r.to}`);
    for (const s of skipped) console.log(`skipped  ${s}`);
    console.log(`\n${added.length} redirect(s) added to ${siteJson}. Validate it with the frontlit-pages checker.`);
    return;
  }

  const prefixOption = option("prefix");
  const result = plan(entries, prefixOption === undefined ? undefined : prefixOption.replace(/\/+$/, ""));
  const host = option("host") ?? "<old-host>";
  if (json) {
    console.log(JSON.stringify({ hostname: host, pathPrefix: result.pathPrefix, rules: result.rules, covered: result.covered, total: result.total, problems: result.problems }, null, 2));
  } else {
    console.log(`Redirect domain ${host}`);
    console.log(`  Path prefix: ${result.pathPrefix || "(empty: paths stay the same)"}`);
    console.log(`  The prefix covers ${result.covered} of ${result.total} old path(s); ${result.rules.length} need a renamed-path rule.`);
    if (result.rules.length) {
      console.log("\nRenamed paths (one per line, as the Redirect domains form takes them):");
      for (const r of result.rules) console.log(`${r.from} ${r.to}`);
    }
    console.log(
      `\nSet it up in FrontLit under Website → Domain → Redirect domains, or over MCP: add_redirect_domain` +
        ` { hostname, pathPrefix }, then update_redirect_domain { rules } (--json prints both).` +
        ` The team then creates the DNS records FrontLit shows.`,
    );
    for (const p of result.problems) console.log(`PROBLEM ${p}`);
  }
  process.exit(result.problems.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
