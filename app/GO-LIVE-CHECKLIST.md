# Go-live checklist

Everything below is on your side — none of it can be done from code.

## Before anyone signs up (10 minutes)

**1. Google redirect**
Supabase → Authentication → URL Configuration → Redirect URLs, add:
`com.loveitorleaveit.lili://auth-callback`
The app registers that scheme on Android and iOS already. Without this the
Google round trip completes and then stalls with nowhere to land.

**2. Leaked password protection** — *partly handled already*
Authentication → Policies → enable *leaked password protection*.

The app now runs this check itself at sign-up, so users are protected today
rather than whenever the toggle gets flipped. It uses k-anonymity: only the
first five characters of the password's SHA-1 are sent, around 800 suffixes
come back, and the comparison happens on the phone. The password never leaves
the device and neither does its full hash.

**Still turn the server toggle on.** A client-side check protects people who
are not attacking themselves — which is the real threat here, a password reused
from a shop breached in 2019 — but anyone determined can bypass it by calling
the API directly. Only the server-side check is a control.

**3. Real SMTP**
Authentication → Settings → SMTP. The built-in sender does about **3 emails an
hour**. Sign-ups, magic links and password resets all use it, so a busy
Saturday would silently stop working. Resend or SendGrid, about an hour.

## Before real money (weeks, not minutes)

Trade licence → corporate bank account → CBUAE-licensed processor. See
`lili-costs-and-plan.pdf`. Nothing in the code shortens this.

## Two decisions still open

**Region.** The database is in **Stockholm**. Supabase has no Gulf region — the
nearest is Mumbai, ~40 ms from Dubai against Stockholm's ~120 ms, but a weaker
adequacy argument under PDPL than the EU. Region cannot be changed after a
project is created, so if you want Mumbai, say so before there is real data.

**The other application in this project.** `public` also holds a journalling /
forum app with two real user profiles. lili is prefixed `lili_*` so nothing
collides. Separately, the security linter flags seven `SECURITY DEFINER`
functions belonging to that app which any signed-in user can call —
`admin_suspend_user`, `admin_resolve_report`, `admin_user_diagnostics` among
them. I have not touched them. If that app is live, someone should look.

## What is already done

- 9 tables, row-level security, server-side screening, follower counts kept by
  the database, append-only audit trail no client can read
- Photo storage: public read, each seller confined to her own folder, 5 MB cap,
  SVG refused because it can carry script
- Sign-in: Google, email + password, magic link. Browsing needs none of them
- Google is already enabled on the project and returns a valid auth URL
- iOS project created and configured; building it needs a Mac

## Making yourself a moderator

Reports now reach a queue that someone can actually act on. Moderator rights
come from a claim only the service role can write, so nobody can grant it to
themselves:

```sql
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data,'{}'::jsonb) || '{"moderator": true}'::jsonb
 where email = 'you@example.com';
```

Sign out and back in afterwards — the claim is read from the token, so it takes
effect on the next sign-in.

Then, from a signed-in moderator session:

- `lili_moderation_list(null)` — the queue, overdue cases first
- `lili_moderation_claim(case_id)` — take a case
- `lili_moderation_decide(case_id, decision, reason)` — one of `dismiss`,
  `remove_listing`, `remove_and_warn`, `suspend_seller`, `close_shop`

**A reason of at least ten characters is required**, because it is sent to both
the person who reported and the person reported on. That is the part most
marketplaces skip, and it is the part that makes an appeal possible.

**Decisions are immutable.** A wrong call is corrected by recording a new case,
never by editing the old one. An audit trail you can rewrite is not a trail.

## Messaging

Private threads between a buyer and a seller are live: one thread per piece,
real-time delivery, read receipts.

The rules on this table are stricter than anywhere else in the schema, because
it holds the most sensitive data in the app — two named women arranging where
and when to meet:

- A thread is visible **only** to its two participants. Not to the shop owner,
  not to a moderator through the API, not to anyone holding the publishable key.
- `anon` has no grant at all — not filtered to zero rows, simply no access.
- You can only send **as yourself**, into a thread you are **already in**.
  Both were tested by trying to forge them.
- A sent message **cannot be edited**. Only `read_at` may change. In a dispute
  the thread is the evidence, and evidence you can rewrite is not evidence.
- A seller who has blocked someone cannot have a thread opened with her.

**One thing to decide before launch:** moderators currently cannot read a
reported conversation, because nothing can. If you want harassment reports to
be reviewable, that needs a deliberate, narrow, audited path — a moderator
being able to read any thread on demand is exactly the power that should not
exist quietly. Worth an explicit decision rather than a default.

## Offers

Haggling is backed by the database now — it was in the interface and nowhere
else, so a buyer made an offer and the seller never learned of it.

What the database decides, rather than trusting the app:

- The **seller is taken from the item**, not from the request. You cannot make
  an offer that claims someone else is selling.
- **One open offer per buyer per piece.** Haggling, not spamming.
- A buyer may **only withdraw**; a seller may accept, decline or counter.
  A buyer cannot accept her own offer.
- The **amount is fixed once made**. Neither side can rewrite what was offered
  after the fact — in a dispute that number is the whole argument.
- A decided offer **cannot be flipped** to a different outcome.
- **Expiry is a fact about the clock, not a job that must run.** An offer past
  48 hours reads as expired whether or not a cron ever fires, and cannot be
  acted on. Nothing silently stays open because a scheduler died.

Both sides are told: the seller when an offer arrives, the buyer when it is
answered.

**Not yet built:** accepting an offer does not reserve the piece or hold funds.
Until payments exist, an accepted offer is a promise between two people, and the
app should not imply more than that.

## Offers

Haggling is how this market buys, and it was in the interface and nowhere else:
a buyer made an offer and the seller never learned of it. Now backed, with the
rules in the database rather than trusted from a phone:

- The **seller is read from the listing**, not from the request — you cannot
  address an offer to someone who is not selling the piece.
- **One open offer per buyer per piece.** Haggling, not spamming.
- The **amount cannot be edited** once made. Neither can the parties or the
  timing.
- A seller may accept, decline or counter. A buyer may only **withdraw her
  own**. Neither can act as the other, and an outsider can do nothing at all.
- A decided offer **cannot be re-decided**.
- Offers **expire after 48 hours**, and expiry is read from the clock rather
  than a scheduled job — nothing silently stays open because a cron did not run.
- Both sides are notified: the seller when an offer arrives, the buyer when it
  is answered.
