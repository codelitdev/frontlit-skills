#!/usr/bin/env node
// Lint and render a FrontLit embed snippet (Embed block, Type "Script / iframe snippet")
// the way FrontLit does, without the editor. Node 18+, no dependencies, needs Google
// Chrome or Chromium (set CHROME=/path/to/chrome if it isn't found).
//
//   node test-embed.mjs snippet.html                 # lint + 8 screenshots
//   node test-embed.mjs snippet.html --prefix mlc-   # expected class/id/keyframes prefix
//   node test-embed.mjs snippet.html --lint-only
//   node test-embed.mjs snippet.html --out shots --widths 1280,390 --vars theme.css
//
// It mounts the snippet twice:
//   inline  plain light DOM, as a standalone page would run it.
//   shadow  as FrontLit renders it: prepareEmbed() rewrites, a declarative shadow
//           root in the server HTML (the parser runs each inline script once, with
//           document.currentScript null), the host mirroring `.dark` from the page.
// Each mount is captured at every width in light and dark, on top of stub page
// variables (FrontLit's default theme, or --vars <css> with `.pb-theme {…}` and
// `.pb-theme.dark {…}` blocks). Exit code 1 when the linter finds errors or a
// render throws.
//
// Keep prepareEmbed()/runScripts() in sync with FrontLit's
// packages/page-builder/src/components/inline-embed.tsx.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);
const file = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && !["--lint-only", "--json"].includes(argv[i - 1])));
if (!file || flag("help")) {
  console.log("Usage: test-embed.mjs <snippet.html> [--prefix mlx-] [--out dir] [--widths 1280,390] [--vars theme.css] [--lint-only] [--json]");
  process.exit(file ? 0 : 1);
}
const content = readFileSync(file, "utf8");
const outDir = resolve(opt("out", `embed-test-${basename(file).replace(/\.[^.]+$/, "")}`));
const widths = opt("widths", "1280,390").split(",").map(Number);

// ---------------------------------------------------------------- lint
const findings = [];
const lineOf = (idx) => content.slice(0, idx).split("\n").length;
const add = (level, code, message, idx) => findings.push({ level, code, line: idx == null ? undefined : lineOf(idx), message });

const styleBlocks = [...content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => ({ css: m[1], at: m.index + m[0].indexOf(m[1]) }));
const scriptBlocks = [...content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m) => ({ attrs: m[1], js: m[2], at: m.index }));
const markup = content.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, (s) => " ".repeat(s.length));

// Wrapper and prefix: the first element's first class, e.g. "mlc-wrap" -> "mlc-".
const firstClass = /<[a-z][\w-]*\b[^>]*\bclass=["']([^"'\s]+)/i.exec(markup)?.[1];
const wrapper = firstClass;
const prefix = opt("prefix", firstClass && firstClass.includes("-") ? firstClass.slice(0, firstClass.indexOf("-") + 1) : null);
if (!prefix) add("warn", "NO_PREFIX", "Couldn't infer a prefix from the first element's class; pass --prefix abc- (every class, id and @keyframes name should start with it).");

// "dark" is the page/host colour-mode class (`.dark …`, `:host(.dark) …`), not the snippet's own.
const prefixed = (name) => !prefix || name.startsWith(prefix) || name === "dark";

// Markup ids and classes.
for (const m of markup.matchAll(/\b(class|id)=["']([^"']*)["']/gi)) {
  for (const name of m[2].split(/\s+/).filter(Boolean)) {
    if (!prefixed(name)) add("warn", "UNPREFIXED", `${m[1]} "${name}" doesn't start with "${prefix}". The page's own CSS can't reach a shadow root, but unprefixed names collide when two snippets or a non-shadow host share a page.`, m.index);
  }
}

// CSS.
function splitTopLevel(s) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}
function walkCss(css, base) {
  // Strip comments but keep offsets.
  css = css.replace(/\/\*[\s\S]*?\*\//g, (s) => " ".repeat(s.length));
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    const prelude = css.slice(i, open).replace(/^[\s;}]+/, "").trim();
    const preludeAt = base + i + css.slice(i, open).search(/\S/);
    // matching brace
    let depth = 1, j = open + 1;
    while (j < css.length && depth) { if (css[j] === "{") depth++; else if (css[j] === "}") depth--; j++; }
    const body = css.slice(open + 1, j - 1);
    if (/^@(media|container|supports|layer)\b/i.test(prelude)) {
      walkCss(body, base + open + 1);
    } else if (/^@(-webkit-)?keyframes\b/i.test(prelude)) {
      const name = prelude.split(/\s+/)[1];
      if (!prefixed(name)) add("error", "UNPREFIXED_KEYFRAMES", `@keyframes ${name} isn't prefixed with "${prefix}"; keyframe names are global to the page in a non-shadow mount and easy to collide.`, preludeAt);
    } else if (/^@font-face/i.test(prelude)) {
      add("error", "FONT_FACE", "@font-face doesn't work inside a shadow root. Inherit the page's fonts (font: inherit) instead.", preludeAt);
    } else if (prelude.startsWith("@")) {
      // @property, @page… ignore
    } else {
      for (const sel of splitTopLevel(prelude)) {
        if (/(^|[\s,>+~(])(:root|html|body)\b/.test(sel)) {
          add("warn", "DOCUMENT_SELECTOR", `"${sel}": FrontLit rewrites :root/html/body to :host/[data-embed-body] in a shadow root, but on any other host it styles the whole page. Scope everything under .${wrapper ?? prefix + "wrap"}.`, preludeAt);
          continue;
        }
        const names = [...sel.matchAll(/[.#](-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);
        const isHost = /^:host\b/.test(sel);
        if (!isHost && !names.some(prefixed)) {
          add("error", "GLOBAL_SELECTOR", `"${sel}" has no prefixed class or id, so it styles everything it matches. Scope it under .${wrapper ?? prefix + "wrap"}.`, preludeAt);
          continue;
        }
        for (const n of names) if (!prefixed(n)) add("warn", "UNPREFIXED", `Selector "${sel}" uses "${n}" without the "${prefix}" prefix.`, preludeAt);
        if (wrapper && !isHost && !names.includes(wrapper) && !sel.startsWith("." + wrapper)) add("warn", "NOT_SCOPED", `"${sel}" isn't under .${wrapper}. Scope every rule under the one wrapper element.`, preludeAt);
      }
    }
    i = j;
  }
}
for (const b of styleBlocks) walkCss(b.css, b.at);

const allCss = styleBlocks.map((b) => b.css).join("\n");
for (const m of content.matchAll(/@import\b/gi)) add("error", "CSS_IMPORT", "@import loads an external stylesheet; inline the CSS.", m.index);
for (const m of content.matchAll(/<link\b[^>]*>/gi)) add("warn", "LINK_TAG", `${m[0].slice(0, 80)}: FrontLit hoists font, preconnect and preload links to the page head, so they work, but they load on every visit and cost PageSpeed. Prefer the theme's fonts (font: inherit). Stylesheet links stay inside the snippet.`, m.index);
for (const m of content.matchAll(/fonts\.(googleapis|gstatic)\.com|use\.typekit\.net|fonts\.bunny\.net/gi)) add("warn", "WEB_FONTS", "Web fonts from a font service work (FrontLit hoists the link to the page) but slow every page that shows the snippet. Prefer the theme's fonts; if you need a face, set it in the theme instead.", m.index);
for (const m of content.matchAll(/min-height\s*:\s*100d?vh/gi)) add("warn", "VIEWPORT_HEIGHT", "FrontLit drops min-height:100vh inside embeds; size to content instead.", m.index);
for (const m of allCss.matchAll(/position\s*:\s*fixed/gi)) add("warn", "POSITION_FIXED", "position:fixed escapes the section and covers the page; avoid it in embeds.");
if (/@keyframes|animation\s*:|<animate\b/i.test(content) && !/prefers-reduced-motion/i.test(content)) add("warn", "REDUCED_MOTION", "The snippet animates but has no @media (prefers-reduced-motion: reduce) fallback.");
if (!/var\(--(foreground|background|card|border|muted)/.test(allCss)) add("warn", "THEME_VARS", "No page variables used (var(--foreground, …), var(--card, …), var(--border, …)); the embed won't follow the site's colours or dark mode.");
for (const m of allCss.matchAll(/var\(--(foreground|background|card|card-foreground|border|muted|muted-foreground|primary|accent|ring|input)\s*\)/g)) add("warn", "VAR_NO_FALLBACK", `var(--${m[1]}) has no fallback; give one (var(--${m[1]}, #hex)) so the snippet renders outside FrontLit and in the editor.`);
if (/var\(--primary\b/.test(allCss)) add("warn", "THEME_PRIMARY", "var(--primary) can differ between the editor preview and the live site; hardcode the brand accent for anything brand-critical.");

// Scripts.
for (const s of scriptBlocks) {
  if (/\bsrc\s*=/.test(s.attrs)) { add("error", "EXTERNAL_SCRIPT", "External <script src>: no third-party scripts; inline what you need.", s.at); continue; }
  const js = s.js;
  for (const m of js.matchAll(/document\s*\.\s*(getElementById|querySelector(All)?|getElementsBy\w+)\s*\(/g)) add("error", "DOCUMENT_QUERY", `document.${m[1]}() can't see inside the embed's shadow root. Find your root first (see references/embeds.md), then query it.`, s.at);
  if (/window\.parent|parent\.document|top\.document/.test(js)) add("error", "WINDOW_PARENT", "FrontLit deletes any <script> that mentions window.parent (an iframe-era dark-mode sync). Use :host(.dark) / .dark in CSS instead.", s.at);
  if (/currentScript/.test(js) && !/shadowRoot/.test(js)) add("warn", "CURRENT_SCRIPT_ONLY", "document.currentScript is null for scripts inside a shadow root; add the shadow-root search fallback.", s.at);
  if (js.trim() && !/data-[\w-]*ready|dataset\.\w+|__\w+(Ready|Init|Done)/i.test(js)) add("warn", "NO_RUN_GUARD", "No run-once guard found. Mark the root (data-xyz-ready) and return if it's set, so the snippet stays correct if a page renders it again (older FrontLit versions ran snippet scripts twice on live pages).", s.at);
}
if (content.length > 200_000) add("warn", "SIZE", `${content.length} characters; large snippets paste fine, but consider trimming.`);

// ---------------------------------------------------------------- FrontLit's transforms
// Copied from packages/page-builder/src/components/inline-embed.tsx (FrontLit).
const HOISTED_LINK = /<link\b[^>]*(?:rel=["']?(?:preconnect|dns-prefetch|preload)|href=["'][^"']*fonts?\.)[^>]*>/gi;
function prepareEmbed(c) {
  const links = c.match(HOISTED_LINK)?.join("") ?? "";
  const markup = c
    .replace(HOISTED_LINK, "")
    .replace(/<!doctype[^>]*>|<\/?(?:html|head|body)\b[^>]*>/gi, "")
    .replace(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*window\.parent[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_, attrs, css) => {
      const scoped = css
        .replace(/:root\b/g, ":host")
        .replace(/(^|[\s,{}])html\.dark\b/g, "$1:host(.dark)")
        .replace(/(^|[\s,{}])html(?=[\s,{:.[>~+])/g, "$1:host")
        .replace(/(^|[\s,{}])body(?=[\s,{:.[>~+])/g, "$1[data-embed-body]")
        .replace(/min-height\s*:\s*100d?vh/gi, "min-height:0")
        .replace(/(\d*\.?\d+)vw\b/gi, "$1cqw")
        .replace(/@media\s+(?:only\s+)?(?:screen\s+and\s+)?(\([^{]*\bwidth\b[^{]*)\{/gi, "@container $1{");
      return `<style${attrs}>${scoped}</style>`;
    });
  const body = `<style>:host{display:block;container-type:inline-size;overflow-x:clip}</style><div data-embed-body>${markup}</div>`;
  return { links, body };
}

// FrontLit's default theme (packages/page-builder/src/theme.css), used unless --vars is given.
const DEFAULT_VARS = `
.pb-theme{--background:hsl(0 0% 100%);--foreground:hsl(222.2 84% 4.9%);--card:hsl(0 0% 100%);--card-foreground:hsl(222.2 84% 4.9%);--primary:hsl(222.2 47.4% 11.2%);--primary-foreground:hsl(210 40% 98%);--secondary:hsl(210 40% 96.1%);--muted:hsl(210 40% 96.1%);--muted-foreground:hsl(215.4 16.3% 46.9%);--accent:hsl(210 40% 96.1%);--border:hsl(214.3 31.8% 91.4%);--input:hsl(214.3 31.8% 91.4%);--ring:hsl(222.2 84% 4.9%);--radius:.5rem}
.pb-theme.dark{--background:hsl(222.2 84% 4.9%);--foreground:hsl(210 40% 98%);--card:hsl(222.2 84% 4.9%);--card-foreground:hsl(210 40% 98%);--primary:hsl(210 40% 98%);--primary-foreground:hsl(222.2 47.4% 11.2%);--secondary:hsl(217.2 32.6% 17.5%);--muted:hsl(217.2 32.6% 17.5%);--muted-foreground:hsl(215 20.2% 65.1%);--accent:hsl(217.2 32.6% 17.5%);--border:hsl(217.2 32.6% 17.5%);--input:hsl(217.2 32.6% 17.5%);--ring:hsl(212.7 26.8% 83.9%)}`;
const vars = opt("vars") ? readFileSync(opt("vars"), "utf8") : DEFAULT_VARS;

const esc = (s) => s.replace(/<\/script/gi, "<\\/script");
const COUNTER = "window.__embedRuns=(window.__embedRuns||0)+1;";

function harness(mount, dark) {
  let host;
  if (mount === "inline") {
    host = `<div id="__host">${content.replace(/<script\b([^>]*)>/gi, (m, a) => (/\bsrc\s*=/.test(a) ? m : `${m}${COUNTER}`))}</div>`;
  } else {
    const { links, body } = prepareEmbed(content);
    const counted = body.replace(/<script\b([^>]*)>/gi, (m, a) => (/\bsrc\s*=/.test(a) ? m : `${m}${COUNTER}`));
    host = `<div id="__host">${links}<template shadowrootmode="open">${counted}</template></div>`;
  }
  return `<!doctype html><html class="${dark ? "dark" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script>window.__errors=[];addEventListener("error",function(e){var t=e.target;__errors.push(t&&t!==window&&(t.src||t.href)?"failed to load "+(t.src||t.href):String(e.message||e.type))},true);</script>
<style>${vars}
html,body{margin:0}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:16px;line-height:1.5}
.pb-theme{background:var(--background);color:var(--foreground)}
.__section{max-width:1152px;margin:0 auto;padding:64px 24px}</style></head>
<body><div class="pb-theme${dark ? " dark" : ""}"><section class="__section">${host}</section></div>
<pre id="__report" style="display:none"></pre>
<script>(function(){var host=document.getElementById("__host");
${mount === "shadow" ? `var root=host.shadowRoot||host.attachShadow({mode:"open"});
// The HTML parser already ran the scripts; FrontLit's hydration effect leaves them alone.
host.classList.toggle("dark", !!host.parentElement.closest(".dark") || document.documentElement.classList.contains("dark"));` : ""}
setTimeout(function(){var r={mount:${JSON.stringify(mount)},errors:__errors,runs:window.__embedRuns||0,height:Math.ceil(document.documentElement.scrollHeight),hostHeight:Math.ceil(host.getBoundingClientRect().height),overflowX:document.documentElement.scrollWidth>window.innerWidth,shadow:!!host.shadowRoot};
document.getElementById("__report").textContent=JSON.stringify(r);},1500);})();</script></body></html>`;
}

// ---------------------------------------------------------------- Chrome
function findChrome() {
  const c = [process.env.CHROME, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"];
  return c.find((p) => p && existsSync(p));
}
function chrome(bin, args) {
  const profile = mkdtempSync(join(tmpdir(), "embed-chrome-"));
  const base = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--force-device-scale-factor=1", `--user-data-dir=${profile}`, "--virtual-time-budget=4000"];
  if (process.getuid?.() === 0) base.push("--no-sandbox");
  return new Promise((res, rej) =>
    execFile(bin, [...base, ...args], { maxBuffer: 64 * 1024 * 1024, timeout: 90_000 }, (err, stdout) => {
      rmSync(profile, { recursive: true, force: true });
      err ? rej(err) : res(stdout);
    }),
  );
}

async function render(bin, mount, mode, width) {
  const page = join(outDir, `.harness-${mount}-${mode}.html`);
  writeFileSync(page, harness(mount, mode === "dark"));
  const url = pathToFileURL(page).href;
  const dom = await chrome(bin, [`--window-size=${width},900`, "--dump-dom", url]);
  const m = /<pre id="__report"[^>]*>([^<]*)<\/pre>/.exec(dom);
  const report = m ? JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")) : { errors: ["harness report missing"] };
  const height = Math.min(Math.max(report.height || 900, 400), 12000);
  const png = join(outDir, `${mount}-${width}-${mode}.png`);
  await chrome(bin, [`--window-size=${width},${height}`, `--screenshot=${png}`, url]);
  return { mount, mode, width, ...report, png };
}

// ---------------------------------------------------------------- run
const order = { error: 0, warn: 1 };
findings.sort((a, b) => order[a.level] - order[b.level] || (a.line ?? 0) - (b.line ?? 0));
const errors = findings.filter((f) => f.level === "error").length;
const results = [];

if (!flag("lint-only")) {
  const bin = findChrome();
  if (!bin) { console.error("Chrome not found; set CHROME=/path/to/chrome or use --lint-only."); process.exit(1); }
  mkdirSync(outDir, { recursive: true });
  const jobs = [];
  for (const mount of ["inline", "shadow"]) for (const mode of ["light", "dark"]) for (const w of widths) jobs.push([mount, mode, w]);
  // Harness files are per mount+mode; render widths of one harness sequentially.
  const groups = {};
  for (const j of jobs) (groups[j[0] + j[1]] ??= []).push(j);
  await Promise.all(Object.values(groups).map(async (g) => { for (const [mt, md, w] of g) results.push(await render(bin, mt, md, w)); }));
  results.sort((a, b) => a.mount.localeCompare(b.mount) || a.width - b.width || a.mode.localeCompare(b.mode));
  for (const f of new Set(Object.values(groups).map((g) => join(outDir, `.harness-${g[0][0]}-${g[0][1]}.html`)))) rmSync(f, { force: true });
}

const renderErrors = results.filter((r) => r.errors?.length || (r.mount === "shadow" && !r.shadow)).length;
if (flag("json")) {
  console.log(JSON.stringify({ file, prefix, wrapper, findings, results }, null, 2));
} else {
  console.log(`${file}: ${content.length} chars, wrapper .${wrapper ?? "?"}, prefix ${prefix ?? "?"}`);
  console.log(`\nLint: ${errors} error(s), ${findings.length - errors} warning(s)`);
  for (const f of findings) console.log(`  ${f.level.toUpperCase().padEnd(5)} ${f.code}${f.line ? ` (line ${f.line})` : ""}: ${f.message}`);
  if (results.length) {
    console.log(`\nRenders (${outDir}):`);
    for (const r of results) {
      const notes = [];
      if (r.errors?.length) notes.push(`JS errors: ${r.errors.join(" | ")}`);
      if (r.overflowX) notes.push("horizontal overflow");
      if (!r.hostHeight) notes.push("embed has zero height");
      const inl = results.find((x) => x.mount === "inline" && x.width === r.width && x.mode === r.mode);
      if (r.mount === "shadow" && inl?.runs > 0 && r.runs === 0) notes.push("FrontLit removed or didn't run the scripts (window.parent?)");
      console.log(`  ${r.mount.padEnd(6)} ${String(r.width).padStart(4)} ${r.mode.padEnd(5)} embed ${r.hostHeight}px, script runs ${r.runs}${notes.length ? "  !! " + notes.join("; ") : "  ok"}  ${basename(r.png)}`);
    }
    if (results.some((r) => r.mount === "shadow" && r.runs > 1)) console.log("  note: a shadow mount ran a script more than once; check the snippet doesn't re-insert its own scripts.");
  }
  console.log("\nLook at every screenshot: hero/heading legibility, dark-mode contrast, nothing cut off at 390px.");
}
process.exit(errors || renderErrors ? 1 : 0);
