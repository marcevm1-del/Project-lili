import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "fs";

const src = readFileSync("src/icons/Icon.jsx", "utf8");
const body = src.slice(src.indexOf("const P = {"), src.indexOf("\n};", src.indexOf("const P = {")));
const P = {};
for (const m of body.matchAll(/^\s{2}([a-zA-Z_]+):\s*"([^"]+)"/gm)) P[m[1]] = m[2];

const cell = (n, d, size, stroke) => `
<div class="c">
  <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#5C4A3A"
       stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>
  <span>${n}</span>
</div>`;

const html = `<style>
 body{background:#FDEBD8;font:11px -apple-system,sans-serif;color:#756358;margin:0;padding:18px}
 h3{font:italic 15px Georgia;color:#8D604C;margin:18px 0 8px}
 .g{display:grid;grid-template-columns:repeat(10,1fr);gap:14px}
 .c{display:flex;flex-direction:column;align-items:center;gap:5px;background:#FFF8F2;
    border:1px solid #F0DDD0;border-radius:10px;padding:10px 4px}
 .c span{font-size:8.5px;text-align:center;line-height:1.2}
</style>
<h3>at 34px — how they read on the placeholder tiles</h3>
<div class="g">${Object.entries(P).map(([n,d])=>cell(n,d,34,1.6)).join("")}</div>
<h3>at 14px — how they read in the interface</h3>
<div class="g">${Object.entries(P).map(([n,d])=>cell(n,d,14,1.6)).join("")}</div>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 100 }, deviceScaleFactor: 2 });
await p.setContent(html);
await p.screenshot({ path: process.argv[2] || "/tmp/icons.png", fullPage: true });
await b.close();
