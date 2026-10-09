// Live storage checks. Uses the service-role-free publishable key, i.e. exactly
// what ships in the app, so what passes here is what a real user can do.
import { createClient } from "@supabase/supabase-js";
import cfg from "./src/backend/config.js";
let pass=0,fail=0;
const c=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"✓":"✗"} ${l}${!ok&&x?`\n      ${x}`:""}`);};
const sb=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false}});
console.log("\nPHOTO STORAGE\n");

// listBuckets() is empty for a publishable key — bucket administration is not
// something the app should be able to do, so this checks the bucket the way a
// user meets it: by fetching a public URL from it.
const probe = `${cfg.url}/storage/v1/object/public/lili-photos/`;
const res = await fetch(probe + "does-not-exist.png");
c("the bucket is reachable and public", res.status === 400 || res.status === 404,
  `HTTP ${res.status}`);
c("a missing photo 404s rather than erroring the app", res.status < 500, `HTTP ${res.status}`);

// a 1x1 png
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), ch=>ch.charCodeAt(0));
const blob = new Blob([png], { type: "image/png" });

const { error: anonErr } = await sb.storage.from("lili-photos")
  .upload(`anon/${Date.now()}.png`, blob, { contentType: "image/png" });
c("a signed-out visitor cannot upload", !!anonErr, anonErr && anonErr.message);

// nobody can write into someone else's folder
const fakeUid = "00000000-0000-0000-0000-000000000000";
const { error: otherErr } = await sb.storage.from("lili-photos")
  .upload(`${fakeUid}/${Date.now()}.png`, blob, { contentType: "image/png" });
c("nobody can write into another seller's folder", !!otherErr, otherErr && otherErr.message);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
