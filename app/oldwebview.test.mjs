// Simulates a WebView too old to run the bundle — either it cannot parse ES
// modules (Chrome < 61) or the script fails outright. The only acceptable
// outcome is a readable message, never a white screen.
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
const M={".html":"text/html",".js":"text/javascript",".css":"text/css",".png":"image/png"};
const srv=createServer((q,r)=>{let p=join("dist",decodeURIComponent(q.url.split("?")[0]));
  if(!existsSync(p)||p.endsWith("/"))p=join("dist","index.html");
  r.writeHead(200,{"Content-Type":M[extname(p)]||"text/plain"});r.end(readFileSync(p));});
await new Promise(r=>srv.listen(4192,r));

const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:360,height:740}});
await offline(ctx);   // see testnet.mjs
const pg=await ctx.newPage();
// an engine that cannot execute the module behaves exactly like this
await pg.route("**/assets/index-*.js", route => route.abort());
await pg.goto("http://localhost:4192/",{waitUntil:"domcontentloaded"});
await pg.waitForTimeout(700);

let pass=0,fail=0;
const check=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"\x1b[32m✓":"\x1b[31m✗"}\x1b[0m ${l}${!ok&&x?"  "+x:""}`);};

const txt = await pg.evaluate(()=>document.body.innerText);
const painted = await pg.evaluate(()=>{
  const el=document.getElementById("boot-fallback");
  if(!el) return {shown:false};
  const r=el.getBoundingClientRect();
  return {shown:r.height>100, bg:getComputedStyle(el).backgroundColor};
});

console.log("\n\x1b[1mOLD WEBVIEW FALLBACK\x1b[0m\n");
check("the screen is not blank", txt.trim().length > 20, `got ${txt.trim().length} chars`);
check("the fallback is actually painted", painted.shown);
check("it explains what to do", /Android System WebView/.test(txt));
check("it says where to do it", /Play Store/i.test(txt));
check("it speaks Arabic too", /Play|متجر/.test(txt));
check("it carries lili's colour", painted.bg === "rgb(253, 235, 216)", painted.bg);
await pg.screenshot({path:"screenshots/old-webview-fallback.png"});

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await b.close(); srv.close();
process.exit(fail?1:0);
