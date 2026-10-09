#!/usr/bin/env node
// Reads the actual theme tokens and measures every text/background pairing
// against WCAG. Design intent is not evidence; a ratio is.
//
//   AA  — 4.5:1 body text, 3.0:1 large text (>=24px, or >=18.6px bold) and UI
//   AAA — 7.0:1 body text
//
// Usage: npm run contrast
import { readFileSync } from "node:fs";

const css = readFileSync("src/theme/palette.css", "utf8");

function tokensFor(selector) {
  const block = css.split(selector)[1]?.split("}")[0] || "";
  const out = {};
  for (const [, name, value] of block.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[name] = value;
  }
  return out;
}

const themes = {
  light: tokensFor('[data-theme="light"]'),
  dark: tokensFor('[data-theme="dark"]'),
};

const lum = (hex) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// [foreground, background, minimum, description]
const PAIRS = [
  ["ink", "bg", 4.5, "body text on the page"],
  ["ink", "white", 4.5, "body text on a card"],
  ["ink", "cream", 4.5, "body text on a bar"],
  ["ink-lt", "bg", 4.5, "secondary text on the page"],
  ["ink-lt", "white", 4.5, "secondary text on a card"],
  ["ink-lt", "sand", 4.5, "secondary text on a fill"],
  ["terra-tx", "bg", 4.5, "accent text on the page"],
  ["terra-tx", "white", 4.5, "accent text on a card"],
  ["red-tx", "white", 4.5, "error text"],
  ["green-tx", "white", 4.5, "success text"],
  ["gold-tx", "white", 4.5, "highlight text"],
  ["terra", "white", 3.0, "accent fills and borders"],
  ["border", "white", 1.2, "hairline separators"],
];

let fails = 0, warns = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n\x1b[1m${name.toUpperCase()}\x1b[0m`);
  for (const [fg, bg, min, desc] of PAIRS) {
    if (!t[fg] || !t[bg]) { console.log(`  \x1b[2m? ${fg} / ${bg} — token missing\x1b[0m`); continue; }
    const r = ratio(t[fg], t[bg]);
    const good = r >= min;
    if (!good) fails++;
    const aaa = r >= 7 ? " AAA" : "";
    console.log(`  ${good ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${desc.padEnd(30)} ${r.toFixed(2).padStart(6)}:1  (needs ${min})${aaa}`);
  }
}

// The one that is a brand decision rather than a bug.
console.log(`\n\x1b[1mPRIMARY BUTTON\x1b[0m`);
for (const [name, t] of Object.entries(themes)) {
  // Measures what the button ACTUALLY uses, not what it used to.
  const r = ratio(t["on-accent"], t["accent-btn"]);
  const old = ratio("#FFFFFF", t.terra);
  const good = r >= 4.5;
  if (!good) { warns++; fails++; }
  console.log(`  ${good ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${name}: --c-on-accent on --c-accent-btn  ${r.toFixed(2)}:1` +
              `  \x1b[2m(was ${old.toFixed(2)}:1 with white on --c-terra)\x1b[0m`);
}

console.log(`\n${fails === 0 ? "\x1b[32mAll text pairings meet WCAG AA\x1b[0m" : `\x1b[31m${fails} pairing(s) below AA\x1b[0m`}` +
            (warns ? `, \x1b[33m${warns} brand decision(s) flagged\x1b[0m` : ""));
console.log();
process.exit(fails ? 1 : 0);
