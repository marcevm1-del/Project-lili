// lili-payments: held payment through Stripe Connect (migration 33).
//
// The buyer pays Stripe on Stripe's own checkout page; Stripe holds the money on
// lili's platform account; when the order completes (the buyer taps "Item
// received", 14 days pass after sending with no problem, or a moderator
// releases it) the amount is transferred to the seller's connected account and
// Stripe pays it out to her bank. Refunds go back to the buyer's card. lili's
// code never sees a card number.
//
// Routes (POST unless noted; ?action=… or JSON {action}):
//   checkout  {order_id}   buyer   → { url } of a Stripe Checkout page
//   onboard                seller  → { url } to connect a bank (Stripe Express)
//   settle                 either  → pays out / refunds this person's due orders
//   webhook                Stripe  → signature-checked; marks orders paid, accounts ready
//   return    (GET)        browser → "Back to lili" page after paying or onboarding
//
// Environment: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (set in Supabase →
// Edge Functions → Secrets), plus SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
// which Supabase provides. Without the Stripe secrets every route except
// `return` answers 503 payments_not_configured and changes nothing.

const STRIPE = "https://api.stripe.com/v1";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
// Two endpoints point here — one for lili's own account (checkout), one for
// connected accounts (account.updated) — each with its own signing secret,
// so this may hold both, separated by a comma.
const WEBHOOK_SECRETS = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const APP_SCHEME = Deno.env.get("APP_SCHEME") ?? "com.loveitorleaveit.lili";
const SELF = `${SUPABASE_URL}/functions/v1/lili-payments`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ── Stripe, by hand: form-encoded REST, no SDK ─────────────────────────────
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === "object"
      ? form(x as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x)));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(path: string, body?: Record<string, unknown>, idem?: string) {
  const res = await fetch(`${STRIPE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idem ? { "Idempotency-Key": idem } : {}),
    },
    body: body ? form(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe ${res.status}`);
  return data;
}

// ── Supabase as the service role (bypasses RLS; used only for checked work) ─
async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
               "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`db ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const rpc = (fn: string, args: Record<string, unknown>) =>
  rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

async function userFrom(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: auth } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ?? null;
}

const fils = (aed: number) => Math.round(Number(aed) * 100);

// ── webhook signature (Stripe-Signature: t=…,v1=…) ──────────────────────────
async function verify(raw: string, header: string | null) {
  if (!header || !WEBHOOK_SECRETS.length) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2)));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const given = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  for (const secret of WEBHOOK_SECRETS) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (given.some((g) => safeEqual(g, hex))) return true;
  }
  return false;
}

// compares every character whatever it finds, so timing says nothing about the secret
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── routes ──────────────────────────────────────────────────────────────────
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checkout(uid: string, orderId: string) {
  // the id goes into a query string: only a real UUID gets that far
  if (!UUID.test(orderId)) return json({ error: "bad_order_id" }, 400);
  const [o] = await rest(`lili_orders?id=eq.${orderId}&select=*`);
  if (!o || o.buyer_uid !== uid) return json({ error: "not_your_order" }, 403);
  if (o.state !== "awaiting_payment") return json({ error: "not_awaiting_payment", state: o.state }, 409);
  const items = await rest(`lili_order_items?order_id=eq.${orderId}&select=title,price`);
  const line_items = items.map((it: { title: string; price: number }) => ({
    quantity: 1, price_data: { currency: "aed", unit_amount: fils(it.price), product_data: { name: it.title || "lili piece" } },
  }));
  if (Number(o.delivery_fee) > 0) line_items.push({
    quantity: 1, price_data: { currency: "aed", unit_amount: fils(o.delivery_fee), product_data: { name: "Delivery" } },
  });
  const session = await stripe("/checkout/sessions", {
    mode: "payment", line_items, client_reference_id: orderId,
    metadata: { order_id: orderId },
    payment_intent_data: { transfer_group: orderId, metadata: { order_id: orderId } },
    success_url: `${SELF}?action=return&what=paid&order=${orderId}`,
    cancel_url: `${SELF}?action=return&what=cancelled&order=${orderId}`,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  }, `checkout-${orderId}`);
  await rpc("lili_payment_set_ref", { p_order: orderId, p_ref: session.id });
  return json({ url: session.url });
}

async function onboard(uid: string) {
  const [acct] = await rest(`lili_payout_accounts?uid=eq.${uid}&select=account_ref`);
  let ref = acct?.account_ref;
  if (!ref) {
    const a = await stripe("/accounts", {
      type: "express", country: "AE", capabilities: { transfers: { requested: true } },
      metadata: { uid },
    }, `account-${uid}`);
    ref = a.id;
    await rpc("lili_set_payout_account", { p_uid: uid, p_ref: ref, p_ready: false });
  }
  const link = await stripe("/account_links", {
    account: ref, type: "account_onboarding",
    refresh_url: `${SELF}?action=return&what=onboarding`,
    return_url: `${SELF}?action=return&what=onboarded`,
  });
  return json({ url: link.url });
}

async function settle(uid: string) {
  const due = await rest(
    `lili_orders?or=(seller_uid.eq.${uid},buyer_uid.eq.${uid})&money_state=in.(payout_due,refund_due)&select=*`);
  const done: unknown[] = [];
  for (const o of due) {
    try {
      if (o.money_state === "refund_due") {
        const pi = await paymentIntentFor(o);
        const r = await stripe("/refunds", { payment_intent: pi }, `refund-${o.id}`);
        await rpc("lili_money_done", { p_order: o.id, p_state: "refunded", p_ref: r.id });
        done.push({ id: o.id, refunded: true });
      } else {
        const [acct] = await rest(`lili_payout_accounts?uid=eq.${o.seller_uid}&select=account_ref,ready`);
        if (!acct?.ready) { done.push({ id: o.id, waiting: "seller_bank_not_connected" }); continue; }
        const pi = await stripe(`/payment_intents/${await paymentIntentFor(o)}`);
        const t = await stripe("/transfers", {
          amount: fils(Number(o.items_total) + Number(o.delivery_fee)), currency: "aed",
          destination: acct.account_ref, transfer_group: o.id, source_transaction: pi.latest_charge,
          metadata: { order_id: o.id },
        }, `transfer-${o.id}`);
        await rpc("lili_money_done", { p_order: o.id, p_state: "paid_out", p_ref: t.id });
        done.push({ id: o.id, paid_out: true });
      }
    } catch (e) {
      done.push({ id: o.id, error: String((e as Error).message).slice(0, 120) });
    }
  }
  return json({ settled: done });
}

// payment_ref holds the Checkout Session until paid, then the PaymentIntent
async function paymentIntentFor(o: { payment_ref: string }) {
  if (o.payment_ref?.startsWith("pi_")) return o.payment_ref;
  const s = await stripe(`/checkout/sessions/${o.payment_ref}`);
  return s.payment_intent;
}

async function webhook(req: Request) {
  const raw = await req.text();
  if (!(await verify(raw, req.headers.get("Stripe-Signature")))) return json({ error: "bad_signature" }, 400);
  const ev = JSON.parse(raw);
  if (ev.type === "checkout.session.completed" && ev.data.object.payment_status === "paid") {
    const s = ev.data.object;
    await rpc("lili_order_paid", { p_order: s.metadata.order_id, p_ref: s.payment_intent });
  } else if (ev.type === "account.updated") {
    const a = ev.data.object;
    if (a.metadata?.uid) await rpc("lili_set_payout_account",
      { p_uid: a.metadata.uid, p_ref: a.id, p_ready: !!a.payouts_enabled });
  }
  return json({ received: true });
}

function returnPage(what: string) {
  const msg = what === "paid" ? "Payment received. Stripe holds it until you confirm you have the piece."
    : what === "cancelled" ? "Payment cancelled. Nothing was charged."
    : what === "onboarded" ? "Bank details sent to Stripe. You'll be paid out once Stripe has checked them."
    : "Back to lili to carry on.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>lili</title>
<style>body{margin:0;font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;background:#FFF8F2;color:#3b2a24;
display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
main{max-width:420px;text-align:center}a{display:inline-block;margin-top:18px;background:#A0614A;color:#fff;
padding:14px 28px;border-radius:30px;text-decoration:none;font-weight:700}</style></head>
<body><main><p>${msg}</p><a href="${APP_SCHEME}://orders${what.startsWith("onboard") ? "/wallet" : ""}">Back to lili</a></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  let action = url.searchParams.get("action") ?? "";
  if (req.method === "GET" && action === "return") return returnPage(url.searchParams.get("what") ?? "");
  if (!STRIPE_KEY) return json({ error: "payments_not_configured" }, 503);
  if (req.headers.get("Stripe-Signature")) return webhook(req);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  action = action || String(body.action ?? "");
  const uid = await userFrom(req);
  if (!uid) return json({ error: "sign_in_required" }, 401);
  try {
    if (action === "checkout") return await checkout(uid, String(body.order_id ?? ""));
    if (action === "onboard") return await onboard(uid);
    if (action === "settle") return await settle(uid);
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message).slice(0, 200) }, 502);
  }
});
