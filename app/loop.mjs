import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const s=createServer((q,r)=>{let p=join("dist",decodeURIComponent(q.url.split("?")[0]));if(!existsSync(p)||p.endsWith("/"))p=join("dist","index.html");r.writeHead(200,{"Content-Type":M[extname(p)]||"text/plain"});r.end(readFileSync(p));});
await new Promise(r=>s.listen(4406,r));
const b=await chromium.launch();
const pg=await (await b.newContext({viewport:{width:393,height:852}})).newPage();
const t=async x=>{const e=pg.locator(`button:has-text("${x}")`).first();
  if(await e.count()){await e.click({timeout:1000}).catch(()=>{});await pg.waitForTimeout(180);return true;}return false;};
await pg.goto("http://localhost:4406/",{waitUntil:"domcontentloaded"});
await pg.waitForTimeout(500);
await t("look around anyway");
const y=pg.locator("input").first(); if(await y.count()) await y.fill("1994").catch(()=>{});
await t("I agree to lili's Terms of Use"); await t("I agree to Privacy Notice");
await t("Agree and continue"); await t("Save choices"); await t("Shop Now"); await t("Skip");
await pg.locator('button[aria-label="Sell"]').click({timeout:3000}); await pg.waitForTimeout(300);
await pg.locator('input[placeholder*="Desert Rose"]').fill("T");
await t("Selling from my own wardrobe"); await t("Continue");
const {sellerClausesFor}=await import("./src/compliance/agreements.js");
for (const c of sellerClausesFor("listing")) await t(c.title);
await t("Agree and open my shop"); await pg.waitForTimeout(400);
await t("List Item"); await t("Quick"); await t("Next");
const title=pg.locator('input[placeholder*="Chanel Classic"]');
if (await title.count()) { await title.fill("Silk Dress"); await t("Next"); }
await pg.waitForTimeout(300);
const n = await pg.locator('input[placeholder="0"]').count();
console.log("price field present:", n);
if (n) {
  // count DOM mutations for 2s BEFORE typing (baseline)
  const base = await pg.evaluate(()=>new Promise(res=>{
    let c=0; const o=new MutationObserver(m=>c+=m.length);
    o.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
    setTimeout(()=>{o.disconnect();res(c);},2000);
  }));
  console.log("idle mutations / 2s:", base);
  await pg.evaluate(()=>{const el=document.querySelector('input[placeholder="0"]');
    const st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
    st.call(el,"1000"); el.dispatchEvent(new Event("input",{bubbles:true}));});
  const after = await pg.evaluate(()=>new Promise(res=>{
    let c=0; const o=new MutationObserver(m=>c+=m.length);
    o.observe(document.body,{subtree:true,childList:true,attributes:true,characterData:true});
    setTimeout(()=>{o.disconnect();res(c);},2000);
  }));
  console.log("mutations / 2s AFTER typing a price:", after);
  const t1=Date.now();
  const txt=await pg.evaluate(()=>document.body.innerText);
  console.log("page responded in", Date.now()-t1, "ms");
  console.log("payout:", (txt.match(/You receive[^\n]*/)||["<none>"])[0].slice(0,60));
  console.log("VERDICT:", after > base*10+50 ? "RENDER LOOP" : "no loop — harness was just slow");
}
await b.close(); s.close(); process.exit(0);
