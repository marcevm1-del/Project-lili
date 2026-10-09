// Does Settings function — and does it keep the promise the setup flow made?
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const srv=createServer((q,r)=>{let p=join("dist",decodeURIComponent(q.url.split("?")[0]));if(!existsSync(p)||p.endsWith("/"))p=join("dist","index.html");r.writeHead(200,{"Content-Type":M[extname(p)]||"text/plain"});r.end(readFileSync(p));});
await new Promise(r=>srv.listen(4330,r));
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:393,height:852}});
await offline(ctx);   // see testnet.mjs
const pg=await ctx.newPage();
let pass=0,fail=0;
const c=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"\x1b[32m✓":"\x1b[31m✗"}\x1b[0m ${l}${!ok&&x?`\n      \x1b[2m${x}\x1b[0m`:""}`);};
const sec=t=>console.log(`\n\x1b[1m${t}\x1b[0m`);
const t=async x=>{const e=pg.locator(`button:has-text("${x}")`).first();if(await e.count()){await e.scrollIntoViewIfNeeded({timeout:800}).catch(()=>{});await e.click({timeout:1800}).catch(()=>{});await pg.waitForTimeout(260);return true;}return false;};
const lbl=async l=>{const e=pg.locator(`button[aria-label="${l}"]`).first();if(await e.count()){await e.click({timeout:1800});await pg.waitForTimeout(320);return true;}return false;};
const txt=()=>pg.evaluate(()=>document.body.innerText);
const boot=async()=>{await t("look around anyway");const y=pg.locator("input").first();if(await y.count())await y.fill("1994").catch(()=>{});await t("I agree to lili's Terms of Use");await t("I agree to Privacy Notice");await t("Agree and continue");await t("Save choices");await t("Shop Now");await t("Skip");await pg.waitForTimeout(400);};

console.log("\n\x1b[1mSETTINGS\x1b[0m");
await pg.goto("http://localhost:4330/",{waitUntil:"networkidle"}); await pg.waitForTimeout(350); await boot();

sec("Dead rows no longer pretend");
await lbl("Profile");
// v2.9.2: this used to find the profile rows by the "·" in their labels — the
// bilingual separator. Splitting the labels so one language renders at a time
// removed every "·" from the interface, and the selector found nothing, so the
// assertion failed while the behaviour it tests was untouched. A test that
// identifies a control by a typographic accident of its copy will break the
// next time the copy changes; the rows are found by being rows now.
const rows = await pg.evaluate(()=>[...document.querySelectorAll("button")]
  .filter(b=>b.textContent.trim().length>0&&b.textContent.length<60&&
             (b.disabled||/Soon/.test(b.textContent)))
  .map(b=>({t:b.textContent.trim().slice(0,26),disabled:b.disabled,tab:b.tabIndex})));
const dead = rows.filter(r=>r.disabled);
c("unbuilt rows are disabled, not silently dead", dead.length>0, JSON.stringify(rows.slice(0,4)));
c("they are out of the keyboard tab order", dead.every(r=>r.tab===-1));
c("they are labelled Soon", /Soon/.test(await txt()));

sec("Settings opens");
const opened = await t("Settings");
c("the Settings row responds", opened && /Settings/.test(await txt()));
c("it explains itself before a shop exists", /Once you open a shop/.test(await txt()), (await txt()).slice(0,110));
await t("←");

sec("The promise the setup flow made");
await lbl("Sell");
await pg.locator('input[placeholder*="Desert Rose"]').fill("Sahara Closet");
c("setup still promises Settings", /bio and colour are all in Settings/.test(await txt()));
await t("Selling from my own wardrobe"); await t("Continue");
const {sellerClausesFor}=await import("./src/compliance/agreements.js");
for (const cl of sellerClausesFor("listing")) await t(cl.title);
await t("Agree and open my shop"); await t("Not now"); await pg.waitForTimeout(500);

await lbl("Profile");
for (let i=0;i<3;i++){
  await t("Settings");
  if (await pg.locator('input[placeholder*="خزانة"]').count()) break;
  await pg.waitForTimeout(300);
}
await pg.waitForTimeout(300);
const st = await txt();
// Assert on the fields themselves, and on where the screen actually sits —
// an overlay rendered below the page it opened from is "present" in the DOM
// and useless to the person looking at the screen.
const view = await pg.evaluate(() => {
  const inp = document.querySelector('input[placeholder*="خزانة"]');
  if (!inp) return null;
  const shell = inp.closest("div[class*='full-height']") || inp.parentElement;
  const r = shell.getBoundingClientRect();
  return { top: Math.round(r.top), inViewport: r.top < innerHeight && r.bottom > 0 };
});
c("Settings offers the deferred fields", view !== null, "no Arabic field found");
c("the screen is actually in view when opened", view && view.inViewport,
  JSON.stringify(view));

const arabic = pg.locator('input[placeholder*="خزانة"]').first();
c("the Arabic name field is there", await arabic.count()>0);
if (await arabic.count()) {
  await arabic.fill("خزانة الصحراء");
  const bio = pg.locator("textarea").first();
  if (await bio.count()) await bio.fill("Pre-loved pieces from my own wardrobe.");
  await pg.waitForTimeout(200);
  c("the preview updates live", /خزانة الصحراء/.test(await txt()));
  c("saving is possible", await t("Save changes"));
  await pg.waitForTimeout(400);
  c("it confirms the save", /Saved/.test(await txt()));

  await pg.reload({waitUntil:"networkidle"}); await pg.waitForTimeout(600); await boot();
  await lbl("Profile"); await t("Settings"); await pg.waitForTimeout(400);
  const after = await pg.evaluate(()=>[...document.querySelectorAll("input,textarea")].map(e=>e.value));
  c("edits survive a restart", after.some(v=>/خزانة الصحراء/.test(v)) && after.some(v=>/Pre-loved/.test(v)),
    JSON.stringify(after));
}
console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await b.close(); srv.close(); process.exit(fail?1:0);
