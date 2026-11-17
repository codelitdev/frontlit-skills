// Loads FrontLit's own parser (@frontlit/text-editor, the code FrontLit's checks run) for
// check.mjs and openapi.mjs: from --parser=<dir>, else the latest published version,
// installed with npm into a cache refreshed at most daily (FRONTLIT_PARSER_CACHE
// overrides its location). Resolves to { docs, yaml, version } or { reason } when it
// can't be loaded (offline, no npm).
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

export const PACKAGE = "@frontlit/text-editor";

async function importFrom(dir) {
  const require = createRequire(join(dir, "noop.js"));
  const entry = require.resolve(`${PACKAGE}/docs`);
  let version = "unknown";
  let root = null;
  for (let d = dirname(entry); d !== dirname(d); d = dirname(d)) {
    const manifest = join(d, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    if (pkg.name === PACKAGE) {
      version = pkg.version;
      root = d;
      break;
    }
  }
  // The parser's own YAML dependency: the same library FrontLit reads specs with.
  let yaml = null;
  try {
    const fromPackage = createRequire(join(root ?? dir, "package.json"));
    yaml = await import(pathToFileURL(fromPackage.resolve("yaml")).href);
  } catch {}
  return { docs: await import(pathToFileURL(entry).href), yaml, version };
}

export async function loadFrontlitParser({ noParser = false, parserDir } = {}) {
  if (noParser) return { reason: "--no-parser" };
  if (parserDir) {
    try {
      return await importFrom(parserDir);
    } catch (error) {
      console.error(`Can't load ${PACKAGE} from ${parserDir}: ${error.message}`);
      process.exit(2);
    }
  }
  const cache =
    process.env.FRONTLIT_PARSER_CACHE ??
    join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "frontlit-docs-check");
  const stamp = join(cache, ".updated");
  const fresh = existsSync(stamp) && Date.now() - statSync(stamp).mtimeMs < 24 * 3600 * 1000;
  let installError;
  if (!fresh) {
    try {
      mkdirSync(cache, { recursive: true });
      if (!existsSync(join(cache, "package.json")))
        writeFileSync(join(cache, "package.json"), '{ "private": true }\n');
      console.error(`Updating FrontLit's parser (${PACKAGE}) in ${cache}…`);
      execFileSync(
        "npm",
        ["install", "--no-audit", "--no-fund", "--loglevel=error", `${PACKAGE}@latest`],
        { cwd: cache, stdio: ["ignore", "ignore", "pipe"], timeout: 300_000, shell: process.platform === "win32" },
      );
      writeFileSync(stamp, new Date().toISOString());
    } catch (error) {
      installError = String(error.stderr || error.message).trim().split("\n")[0];
    }
  }
  try {
    return await importFrom(cache);
  } catch (error) {
    return { reason: installError ?? error.message };
  }
}
