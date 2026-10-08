// Does signing in actually change anything? The screen existed before this and
// unlocked nothing — the backend stayed local no matter who you were.
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const s=createServer((q,r)=>{let p=join("dist",decodeURIComponent(q.url.split("?")[0]));
  if(!existsSync(p)||p.endsWith("/"))p=join("dist","index.html");
  r.writeHead(200,{"Content-Type":M[extname(p)]||"text/plain"});r.end(readFileSync(p));});
await new Promise(r=>s.listen(4420,r));
const b=await chromium.launch({args:["--no-sandbox","--disable-dev-shm-usage"]});
const authCtx=await b.newContext({viewport:{width:393,height:852}});
// authflow checks the SCREENS, not the provider — preflight is what talks to
// the live project. See testnet.mjs.
await offline(authCtx);
const pg=await authCtx.newPage();
let pass=0,fail=0;
const c=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"\x1b[32m✓":"\x1b[31m✗"}\x1b[0m ${l}${!ok&&x?`\n      \x1b[2m${x}\x1b[0m`:""}`);};
const sec=t=>console.log(`\n\x1b[1m${t}\x1b[0m`);
const t=async x=>{const e=pg.locator(`button:has-text("${x}")`).first();
  if(await e.count()){await e.scrollIntoViewIfNeeded({timeout:700}).catch(()=>{});
  await e.click({timeout:1500}).catch(()=>{});await pg.waitForTimeout(240);return true;}return false;};
const txt=()=>pg.evaluate(()=>document.body.innerText);
await pg.goto("http://localhost:4420/",{waitUntil:"networkidle"}); await pg.waitForTimeout(400);
await t("look around anyway");
const y=pg.locator("input").first(); if(await y.count()) await y.fill("1994").catch(()=>{});
await t("I agree to lili's Platform Terms"); await t("I agree to Privacy Notice");
await t("Agree and continue"); await t("Save choices"); await t("Shop Now"); await t("Skip");
await pg.waitForTimeout(400);

console.log("\n\x1b[1mAUTH FLOW\x1b[0m");
sec("Browsing needs no account");
c("the feed is reachable without signing in", /AED/.test(await txt()));

sec("Identity is asked for where it binds");
await pg.locator('button[aria-label="Sell"]').first().click({timeout:3000});
await pg.waitForTimeout(400);
await pg.locator('input[placeholder*="Desert Rose"]').fill("Gate Test");
await t("Selling from my own wardrobe"); await t("Continue");
const {sellerClausesFor}=await import("./src/compliance/agreements.js");
for (const cl of sellerClausesFor("listing")) await t(cl.title);
await t("Agree and open my shop"); await pg.waitForTimeout(600);
const after = await txt();
c("opening a shop asks for an account", /Sign in to lili|Continue with Google/.test(after),
  after.slice(0,110).replace(/\n/g," | "));
c("and says why, in lili's voice", /how you get paid|needs an account/i.test(after));

sec("The sign-in screen offers all three routes");
c("Google", /Continue with Google/.test(after));
c("email and password", /Continue with email/.test(after));
c("a magic link", /Send me a link|link instead/i.test(after));

sec("It can be deferred, not forced");
c("a 'not now' route exists", /Not now/i.test(after));
c("and it is honest about the cost", /before you can be paid|visible to anyone else/i.test(after));
await t("Not now");
await pg.waitForTimeout(600);
const done = await txt();
c("declining still opens the shop locally", /Gate Test|List Item/i.test(done),
  done.slice(0,110).replace(/\n/g," | "));
c("the app is not left on a dead end", !/Continue with Google/.test(done));
console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await b.close(); s.close(); process.exit(fail?1:0);
