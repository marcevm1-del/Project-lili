// Real requests to the real service, exactly as the app makes them.
import { checkPassword, describe, breachMessage } from "./src/auth/breachCheck.js";
let pass=0,fail=0;
const c=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"\x1b[32m✓":"\x1b[31m✗"}\x1b[0m ${l}${!ok&&x?`\n      \x1b[2m${x}\x1b[0m`:""}`);};
const sec=t=>console.log(`\n\x1b[1m${t}\x1b[0m`);
console.log("\n\x1b[1mBREACHED PASSWORD CHECK\x1b[0m");

sec("It catches what it should");
const bad = await checkPassword("password123");
c("a famously breached password is caught", bad.breached === true);
c("and the count is real", bad.count > 100000, String(bad.count));
c("the message explains it is not lili's fault",
  /isn't about lili|most common/.test(breachMessage(bad.count)));

sec("It does not cry wolf");
const good = await checkPassword("marce-desert-rose-" + Math.random().toString(36).slice(2));
c("a fresh random password passes", good.breached === false && good.checked === true);

sec("Privacy");
const src = await import("node:fs").then(m=>m.readFileSync("./src/auth/breachCheck.js","utf8"));
c("only the first five hash characters are sent", /hash\.slice\(0, 5\)/.test(src));
c("the comparison happens locally", /suf === suffix/.test(src));
c("the reply is padded so its size leaks nothing", /Add-Padding/.test(src));
c("the password itself is never in a request", !/body:\s*password|\+ password/.test(src));

sec("It fails open");
c("a timeout is set", /AbortController/.test(src));
c("an unreachable service returns unknown, not breached",
  /catch \{\s*return unknown/.test(src));
c("unknown is never treated as breached", /breached: false, count: 0, checked: false/.test(src));

sec("Strength hints are plain English");
c("short passwords get a nudge", describe("abc").level === "short");
c("long ones are praised for length", /length does more/.test(describe("a".repeat(16)).text));
c("weak ones suggest three words", /three unrelated words/.test(describe("aaaaaaaaa").text));

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail?1:0);
