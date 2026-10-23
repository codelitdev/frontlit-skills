#!/usr/bin/env node
// Convert oklch() colours to sRGB hex for a FrontLit theme. Node 18+, no dependencies.
//
//   node oklch-to-hex.mjs "oklch(0.6 0.14 300)" "oklch(98% 0.01 80 / 0.5)"
//   node oklch-to-hex.mjs --css tokens.css      # every --token: oklch(...) in a stylesheet
//   node oklch-to-hex.mjs --json tokens.css     # same, as JSON
//
// Out-of-gamut colours are mapped into sRGB by lowering chroma (hue and
// lightness kept), not by clipping channels, and are marked "(gamut-mapped)".

import { readFileSync } from "node:fs";

const OKLCH = /oklch\(\s*([-+.\d]+%?)\s+([-+.\d]+%?)\s+([-+.\d]+)(?:deg)?\s*(?:\/\s*([-+.\d]+%?))?\s*\)/i;

function num(v, percentScale) {
  return v.endsWith("%") ? (parseFloat(v) / 100) * percentScale : parseFloat(v);
}

export function parseOklch(str) {
  const m = OKLCH.exec(str);
  if (!m) return null;
  return {
    l: num(m[1], 1),
    c: num(m[2], 0.4), // CSS: 100% chroma = 0.4
    h: parseFloat(m[3]),
    a: m[4] === undefined ? 1 : num(m[4], 1),
  };
}

function oklchToLinearSrgb({ l, c, h }) {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const EPS = 1e-3; // ~0.25 of one 8-bit step
const inGamut = (rgb) => rgb.every((v) => v >= -EPS && v <= 1 + EPS);
const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
const hex2 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0");

export function oklchToHex(input) {
  const color = typeof input === "string" ? parseOklch(input) : input;
  if (!color) throw new Error(`Not an oklch() colour: ${input}`);
  let { l, c, h, a } = color;
  l = Math.min(1, Math.max(0, l));
  let rgb = oklchToLinearSrgb({ l, c, h });
  let mapped = false;
  if (!inGamut(rgb)) {
    mapped = true;
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinearSrgb({ l, c: mid, h }))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinearSrgb({ l, c: lo, h });
  }
  let hex = "#" + rgb.map((v) => hex2(gamma(Math.max(0, v)))).join("");
  if (a < 1) hex += hex2(a);
  return { hex, mapped };
}

function fromCss(path) {
  const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let selector = "";
  const re = /([^{};]+)\{|(--[\w-]+)\s*:\s*([^;}]+)/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1] !== undefined) selector = m[1].trim().replace(/\s+/g, " ");
    else if (parseOklch(m[3])) {
      const { hex, mapped } = oklchToHex(m[3]);
      out.push({ selector, token: m[2], oklch: m[3].trim(), hex, mapped });
    }
  }
  return out;
}

const args = process.argv.slice(2);
if (!args.length || args.includes("-h") || args.includes("--help")) {
  console.log('Usage: oklch-to-hex.mjs "oklch(L C H [/ A])" ... | --css <file> | --json <file>');
  process.exit(args.length ? 0 : 1);
}
if (args[0] === "--css" || args[0] === "--json") {
  const rows = fromCss(args[1]);
  if (args[0] === "--json") console.log(JSON.stringify(rows, null, 2));
  else {
    let last = null;
    for (const r of rows) {
      if (r.selector !== last) console.log(`\n${r.selector}`);
      last = r.selector;
      console.log(`  ${r.token}: ${r.hex}   /* ${r.oklch}${r.mapped ? ", gamut-mapped" : ""} */`);
    }
  }
} else {
  for (const v of args) {
    const { hex, mapped } = oklchToHex(v);
    console.log(`${v} -> ${hex}${mapped ? " (gamut-mapped)" : ""}`);
  }
}
