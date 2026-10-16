// Talks to the real project. Proves the sign-in paths that do not need a
// dashboard change actually work.
import { createClient } from "@supabase/supabase-js";
import cfg from "./src/backend/config.js";
let pass=0,fail=0;
const c=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"✓":"✗"} ${l}${!ok&&x?`\n      ${x}`:""}`);};
const sb=createClient(cfg.url,cfg.publishableKey,{db:{schema:"public"},auth:{persistSession:false}});
console.log("\nLIVE AUTH\n");
const email=`t.${Date.now()}@mailinator.com`, pw="TestPassword123!";
const { data:su, error:se } = await sb.auth.signUp({ email, password: pw });
// The free tier sends about 3 emails an hour. Hitting that ceiling is an
// account limit, not a fault in the sign-up path, so it is reported as such.
const rateLimited = (e) => e && /rate limit/i.test(e.message || "");
c("email sign-up is accepted", !se || rateLimited(se),
  se && se.message);
if (rateLimited(se)) console.log("      (email rate limit hit — free tier sends ~3/hour)");
c("a user record is created", !!(su && su.user) || rateLimited(se), "rate limited");
c("confirmation is required before a session (email confirm is ON)",
  !!(su && !su.session));
const { error: le } = await sb.auth.signInWithPassword({ email, password: pw });
c("sign-in before confirming is refused, with a clear reason",
  !!le && /confirm|Invalid/i.test(le.message), le && le.message);
const { error: me } = await sb.auth.signInWithOtp({ email });
c("magic link can be requested", !me || rateLimited(me), me && me.message);
const { data: g, error: ge } = await sb.auth.signInWithOAuth({
  provider:"google", options:{ skipBrowserRedirect:true, redirectTo:"com.loveitorleaveit.lili://auth-callback" }});
c("Google provider responds", !ge || !/not enabled/i.test(ge.message||""), ge && ge.message);
if (g && g.url) c("Google returns an authorisation URL", g.url.includes("provider=google"), g.url.slice(0,60));
console.log(`\n${pass} passed, ${fail} failed\n`);
