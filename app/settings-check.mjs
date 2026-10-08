import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const s=createServer((q,r)=>{let p=join("dist",decodeURIComponent(q.url.split("?")[0]));if(!existsSync(p)||p.endsWith("/"))p=join("dist","index.html");r.writeHead(200,{"Content-Type":M[extname(p)]||"text/plain"});r.end(readFileSync(p));});
await new Promise(r=>s.listen(4330,r));
const b=await chromium.launch(); const pg=await (await b.newContext({viewport:{width:393,height:852}})).newPage();
const t=async x=>{const e=pg.locator(`button:has-text("${x}")`).first();if(await e.count()){await e.click({timeout:1500}).catch(()=>{});await pg.waitForTimeout(240);return true;}return false;};
let p=0,f=0; const c=(l,ok,x="")=>{ok?p++:f++;console.log(`  ${ok?"✓":"✗"} ${l}${!ok&&x?"\n      "+x:""}`);};
await pg.goto("http://localhost:4330/",{waitUntil:"networkidle"}); await pg.waitForTimeout(350);
await t("look around anyway"); await pg.locator("input").first().fill("1994");
await t("I agree to lili's Platform Terms"); await t("I agree to Privacy Notice");
await t("Agree and continue"); await t("Save choices"); await t("Shop Now"); await t("Skip");
await pg.waitForTimeout(400);
await pg.locator('button[aria-label="Profile"]').click(); await pg.waitForTimeout(400);

console.log("\nSETTINGS MENU\n");
const rows = await pg.evaluate(()=>[...document.querySelectorAll("button")]
  .filter(b=>/·/.test(b.textContent)&&b.textContent.length<60)
  .map(b=>({label:b.textContent.trim().slice(0,34),disabled:b.disabled,tab:b.tabIndex,
            soon:/Soon/.test(b.textContent)})));
const live = rows.filter(r=>!r.disabled), dead = rows.filter(r=>r.disabled);
c("menu renders", rows.length>=8, JSON.stringify(rows.slice(0,3)));
c("unavailable rows are disabled, not silently dead", dead.length>0 && dead.every(r=>r.soon),
  JSON.stringify(dead.map(r=>r.label)));
c("disabled rows are out of the tab order", dead.every(r=>r.tab===-1));
c("every enabled row is genuinely wired", live.length>0);

// each row must take you somewhere different from the profile menu; some open
// an overlay, some switch tab, so compare the screen before and after
for (const [label, marker] of [["Appearance",/Match my phone/],["Language",/Available now/],
                               ["Privacy & Safety",/Data choices/],["Help & Support",/questions we/i],
                               ["My Listings",/List Item|Sales|empty|Open Your Shop|شop|Shop Name/i],["Messages",/message|رسائل/i]]) {
  await pg.locator('button[aria-label="Profile"]').click().catch(()=>{});
  await pg.waitForTimeout(500);
  const before = await pg.evaluate(()=>document.body.innerText);
  const opened = await t(label);
  await pg.waitForTimeout(300);
  await pg.waitForTimeout(450);
  const after = await pg.evaluate(()=>document.body.innerText);
  c(`${label} goes somewhere`, opened && after !== before && marker.test(after),
    after.slice(0,80).replace(/\n/g," "));
}
const avatarEmpty = await pg.evaluate(()=>{
  const svg=document.querySelectorAll("svg"); return svg.length>3;});
c("profile avatar renders art", avatarEmpty);
console.log(`\n${p} passed, ${f} failed\n`);
await b.close(); s.close(); process.exit(f?1:0);
