# Launch runbook — private beta

For the launch shape chosen on 29 Aug 2026: **AE stays on `waitlist`, browsing
is open to everyone, and selling and messaging are invite-only.** No payments.

Everything here is a copy-paste step with a way to check it worked. Do them in
order — later steps assume earlier ones.

Project: `yjsmkjwvoolsszsedony` · region `eu-north-1` (Stockholm).

---

## 0 · Before anything else: the Play Store clock

This is the only step with a deadline you cannot move, so check it today.

New **personal** Google Play developer accounts must run closed testing with
**12 testers opted in for 14 continuous days** before they can apply for
production access. That is longer than the whole launch window. **Organization**
accounts (which need a D-U-N-S number) are reported to be exempt.

- Play Console → **Setup → Account details**: is the account type *Personal* or
  *Organization*?
- Personal → either convert to Organization now, or accept that day 10 is a
  direct-APK or web launch and the Play listing follows later.
- Either way, get the closed-testing track running **today**. The clock only
  counts days where 12 testers are actually opted in.

Do not take my word for the exemption — the rule has changed twice. Read what
your own console says on the Production page before planning around it.

---

## 1 · Supabase configuration (about an hour, all in the dashboard)

### 1.1 Google redirect
Authentication → URL Configuration → Redirect URLs, add:

```
com.loveitorleaveit.lili://auth-callback
```

Without it the Google round trip completes and then stalls with nowhere to land.
The scheme is already registered in both native projects.

**Check:** sign in with Google on a device build and land back inside the app.

### 1.2 Real SMTP
Authentication → Settings → SMTP. The built-in sender does about **3 emails an
hour**, shared across sign-ups, magic links and password resets. Resend or
SendGrid, about an hour including domain verification.

**Check:** request a magic link four times in five minutes. All four arrive.

### 1.3 Leaked-password protection
Authentication → Policies → enable it.

The app already runs a k-anonymity check at sign-up, so users are protected
today. That check is a courtesy to honest users; anyone can bypass it by calling
the API directly. Only the server toggle is a control.

### 1.4 Make yourself a moderator
Without this, reports arrive in a queue **no human can open**.

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb)
                        || '{"moderator": true}'::jsonb
 where email = 'you@example.com';
```

Sign out and back in — the claim is read from the token.

**Check:**

```sql
select lili_is_moderator();      -- from a signed-in moderator session: true
select * from lili_moderation_list(null);
```

---

## 2 · The private beta

The gate is a row-level policy, not an app setting. `lili_is_beta_member()`
guards `shops_create`, `items_create` and `conv_create`. Browsing is untouched.

### 2.1 Write the invite codes

One per woman. Keep the label — it is how you know who is who later.

```sql
insert into lili_invites (code, label) values
  ('LILI-AMNA',  'Amna — Marina, abayas'),
  ('LILI-NOOR',  'Noor — Jumeirah, bags'),
  ('LILI-SARA',  'Sara — Downtown, RTW');
```

Codes are matched case-insensitively and trimmed, because they will be typed
from a WhatsApp message on a phone. Keep them short, unambiguous, and avoid
`0/O` and `1/I`.

**She enters it on the first screen** — the "Not open here yet" gate, under
*I have an invite*.

### 2.2 Watch redemption

```sql
select code, label, redeemed_at,
       case when redeemed_by is null then 'not used yet' else 'in' end as state
  from lili_invites order by created_at;
```

### 2.3 If someone loses her place (reinstall, new phone)

A code is bound to the account that redeemed it. To let her redeem again:

```sql
update lili_invites set redeemed_by = null, redeemed_at = null
 where code = 'LILI-AMNA';
```

To take someone out of the beta:

```sql
delete from lili_beta_members where uid = '<her uid>';
update lili_invites set revoked = true where code = 'LILI-AMNA';
```

### 2.4 Opening the doors to everyone

When the licence is in place and AE flips to `live`, **one row** opens
everything — no migration, no deploy:

```sql
update lili_settings
   set value = '{"enabled": false}'::jsonb, updated_at = now()
 where key = 'beta_gate';
```

Then set `MARKETS.AE.status = "live"` in `src/compliance/markets.js` and ship a
build. The order matters: the database opens first, the app second, so nobody
meets a sell button that the server still refuses.

---

## 3 · Prove a listing actually reaches the database

Do this before you invite anyone. Until v2.8 it did not work at all — the client
sent columns that did not exist, PostgREST refused every insert, and the app
quietly saved to the phone. `lili_items` sat at zero rows while the app looked
healthy.

1. Install the build on a real phone.
2. Redeem an invite.
3. Open a shop, list one piece with two photographs.
4. Then, from SQL:

```sql
select id, title, brand, price, status,
       screening->>'rules'  as rules,
       screening->>'score'  as score,
       screening->'findings' as findings,
       array_length(photos,1) as photos
  from lili_items order by created_at desc limit 5;
```

You are looking for: a row exists, `rules` is `v2.8`, `status` is `live`, and
`photos` is not null.

If the row is missing, the app will now **tell you** — the seller sees "Not
published" rather than a listing that was never there. Check the device console
for `addItem was REFUSED by the server`.

**Also check storage:**

```sql
select name, created_at from storage.objects
 where bucket_id = 'lili-photos' order by created_at desc limit 10;
```

---

## 4 · Prove a message reaches the other woman

Messaging was a puppet show until v2.8 — the replies were a hard-coded array on
a timer. It is real now, so verify it with two devices, or one device and one
browser signed in as a different account.

1. Device A (buyer) opens a listing from Device B's shop and sends a message.
2. Device B should receive it **without reloading** — the thread is live.
3. Reply from B. A sees it, and A's message shows `· read`.

```sql
select c.id, c.buyer_uid, c.seller_uid, count(m.*) as messages, max(m.created_at) as last
  from lili_conversations c left join lili_messages m on m.conversation_id = c.id
 group by c.id order by last desc nulls last limit 10;
```

If the count stays at zero while the app shows a conversation, realtime is not
enabled for `lili_messages`, or the seller's uid is wrong.

---

## 5 · Harassment reports — what is built, and what is still yours to decide

Moderators **still cannot open a private thread on demand.** That has not
changed and should not: `anon` holds no grant, and only the two participants
have a policy.

What has changed is that a harassment report is no longer unreviewable. The
option that gives nobody a new power is built:

**The reporter may attach a copy of her own conversation to her own report.**

She can already read that thread. She chooses, at the moment she asks for help,
whether to hand a copy over. Off by default. If she declines, nothing is
disclosed and the case is judged on what she wrote.

How it behaves:

- The transcript is captured **at report time and frozen** — `lili_case_evidence`
  has no RLS policy at all, so it is unreadable from any client, and an UPDATE
  trigger refuses any edit. Neither party can rewrite it afterwards.
- DELETE is allowed, deliberately: a PDPL or GDPR erasure request must not
  require a schema migration under time pressure. The audit row recording that
  a transcript existed survives regardless.
- A moderator opens it only through `lili_case_transcript(case_id)`, which
  checks `lili_is_moderator()` and **writes an audit row on every read**.
- The reported party is **not** told a report exists. Telling someone they have
  been reported for harassment, before any decision, is how reporting gets
  people hurt. Both parties are still told the outcome through the existing
  statement-of-reasons path.

Reading a case as a moderator:

```sql
select lili_case_transcript('<case id>');
-- then confirm your own read was recorded:
select at, actor_uid, subject, meta
  from lili_audit where kind = 'case.transcript.read' order by at desc limit 5;
```

**What is still yours to decide** is whether that is enough. It covers the case
where the woman being harassed wants help. It does not cover a report from a
third party, or a case where she is too frightened to attach anything. The
remaining option — a moderator able to open a reported thread she did not
consent to disclose — is a real power, and if you ever want it, it should
arrive as a deliberate decision with a bounded window and both parties told,
never quietly as a convenience.

## 6 · Two irreversible things, while there is still no data

**Region.** Stockholm, ~120 ms from Dubai; Mumbai is ~40 ms with a weaker
adequacy argument under PDPL. **Region cannot be changed after a project is
created** — moving means a new project and a fresh URL and keys. `lili_items` is
empty today. It will not be empty next week.

**The co-tenant.** `public` also holds a journalling/forum app with real users
and seven `SECURITY DEFINER` functions any signed-in user can call, including
`admin_suspend_user`, `admin_resolve_report` and `admin_user_diagnostics`. Every
woman you invite becomes a signed-in user of that project.

```sql
select p.proname, p.prosecdef
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname like 'admin%';
```

Either fix those functions, or move lili to its own project. Both get harder
once there are thirty sellers and real threads.

---

## 7 · Before you open the door

```bash
npm run verify          # every suite
npm run bundle          # signed AAB
```

Expected: `smoke` 198, `research` 111, `walk` 71, `visual` 55, `devices` 66,
`security` 202, `a11y` 15 screens clean, `functional` 21, `settings` 13,
`loading` 17, `keyboard` 13, `oldwebview` 6, `integration` 15.

`npm run audit` reports 2 failures until you have built the release artifacts —
that is what it is telling you to do, not a fault.

**`integration` is green for the first time.** It used to report one failure,
and the cause was in the test: `tap()` returned `false` on a miss and nobody
checked, so after a reload the run was sitting on the market gate while its
language assertion "passed" against a screen it had never left. It now walks the
real gate sequence, and a new check fails the suite if any required interaction
was silently missed.

**And the keystore.** `android/lili-release.jks` is the app's identity on Play.
Lose control of it and someone else can ship an update to your users; lose it
entirely and you can never ship again. Keep an offline copy somewhere you would
keep a passport.
