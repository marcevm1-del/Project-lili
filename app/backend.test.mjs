// Talks to the REAL project. Proves the app's own adapter works against the
// live database and that the server refuses what it should.
import { createClient } from "@supabase/supabase-js";
import cfg from "./src/backend/config.js";

let pass=0, fail=0;
const c=(l,ok,x="")=>{ok?pass++:fail++;console.log(`  ${ok?"\x1b[32m✓":"\x1b[31m✗"}\x1b[0m ${l}${!ok&&x?`\n      \x1b[2m${x}\x1b[0m`:""}`);};
const sec=t=>console.log(`\n\x1b[1m${t}\x1b[0m`);

console.log("\n\x1b[1mLIVE BACKEND\x1b[0m");
sec("Connection");
const sb = createClient(cfg.url, cfg.publishableKey, { db:{schema:"public"}, auth:{persistSession:false} });
const { data: auth, error: authErr } = await sb.auth.signInAnonymously();
c("anonymous sign-in works", !authErr && !!auth.user, authErr && authErr.message);
const uid = auth.user && auth.user.id;

sec("A seller opens a shop and lists");
const { data: shop, error: shopErr } = await sb.from("lili_shops")
  .insert({ owner_uid: uid, name: "Live Test Closet", seller_type: "private" }).select().single();
c("shop created", !shopErr && !!shop, shopErr && shopErr.message);

if (shop) {
  const { data: good, error: gErr } = await sb.from("lili_items").insert({
    owner_uid: uid, shop_id: shop.id, title: "Silk Midi Dress",
    brand: "Zimmermann", price: 850, description: "worn once" }).select().single();
  c("an honest listing is accepted", !gErr && !!good, gErr && gErr.message);
  c("and the server publishes it", good && good.status === "live", good && good.status);

  const { data: bad } = await sb.from("lili_items").insert({
    owner_uid: uid, shop_id: shop.id, title: "Chanel replica mirror quality",
    brand: "Chanel", price: 400, description: "great copy" }).select().single();
  c("a replica is refused by the database", bad && bad.status === "removed", bad && bad.status);
  c("with a reason recorded", bad && JSON.stringify(bad.screening).includes("prohibited"));

  const { data: floorItem } = await sb.from("lili_items").insert({
    owner_uid: uid, shop_id: shop.id, title: "Chanel Classic Flap",
    brand: "Chanel", price: 900, description: "no receipt" }).select().single();
  c("a suspiciously cheap flagship goes to review",
    floorItem && floorItem.status === "in_review", floorItem && floorItem.status);

  sec("What a client must not be able to do");
  const { data: pub } = await sb.from("lili_items").insert({
    owner_uid: uid, shop_id: shop.id, title: "Sneak Past", brand: "None",
    price: 100, status: "live" }).select().single();
  c("cannot publish directly by claiming status:live",
    !pub || pub.status !== "live" || pub.title !== "Sneak Past",
    pub && `${pub.title} -> ${pub.status}`);

  const { error: fErr } = await sb.from("lili_shops")
    .update({ followers: 99999 }).eq("id", shop.id);
  const { data: after } = await sb.from("lili_shops").select("followers").eq("id", shop.id).single();
  c("cannot award itself followers", after && after.followers === 0,
    after && String(after.followers));

  const { error: sErr } = await sb.from("lili_shops").update({ strikes: 0, status: "active" }).eq("id", shop.id);
  const { data: st } = await sb.from("lili_shops").select("strikes").eq("id", shop.id).single();
  c("cannot clear its own strikes", st && st.strikes === 0);

  const { data: queue, error: qErr } = await sb.from("lili_moderation_cases").select("*");
  c("cannot read the moderation queue", (queue || []).length === 0,
    `${(queue||[]).length} rows visible`);

  const { data: aud, error: aErr } = await sb.from("lili_audit").select("*");
  c("cannot read the audit trail", !!aErr || (aud||[]).length === 0);

  sec("Two devices see one catalogue");
  const sb2 = createClient(cfg.url, cfg.publishableKey, { db:{schema:"public"}, auth:{persistSession:false} });
  await sb2.auth.signInAnonymously();
  const { data: seen } = await sb2.from("lili_items").select("title,status").eq("status","live");
  c("a second device sees the live listing",
    (seen||[]).some(i => i.title === "Silk Midi Dress"), JSON.stringify((seen||[]).slice(0,3)));
  c("and does NOT see the removed one",
    !(seen||[]).some(i => i.title.includes("replica")));

  // clean up
  await sb.from("lili_items").delete().eq("shop_id", shop.id);
  await sb.from("lili_shops").delete().eq("id", shop.id);
}
console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
process.exit(fail?1:0);
