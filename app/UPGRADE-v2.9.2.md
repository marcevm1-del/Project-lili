# v2.9.2 — four bugs, the bundle, the photographs, and Arabic

Four passes, in the order you chose them. The first pass fixed things that would
have surfaced within hours of switching anonymous sign-in on.

**355 research · 223 security · 199 smoke · 71 walkthrough · 66 device · 55
visual · 26 image-quality · 21 functional · 17 loading · 15 a11y screens · 13
integration · 13 keyboard · 13 settings · 6 old-WebView · contrast clean.**

---

## 1 · The catalogue never loaded from the server

The worst thing in the codebase, and it would have shown itself on day one.

`repo.bootstrap()` reads device storage and nothing else. `repo.getItems()` and
`repo.getShops()` — the functions that fetch from the backend — **had no callers
anywhere in the app**. `activateBackend()` even carries the comment *"pull the
shared catalogue down"* and then calls `bootstrap`, which reads the phone.

So the moment sign-in went on: a new user saw ten demo listings from six
fictional shops *as the marketplace*; real listings arrived only through the
realtime subscription, which fires only when somebody else writes a row; and
**real shops never arrived at all**, so every real listing's seller name, avatar
and trust chip resolved to `undefined`.

Now: `refreshCatalogue()` fetches both at boot and again on sign-in, the demo
catalogue retires permanently once a device has seen the real one, a listing
written offline survives the next live update instead of being silently wiped,
and a seller that genuinely cannot be resolved is **stated** rather than hidden —
because every listing is required to say whether she sells privately or as a
business.

## 2 · "Delete my account" deleted nothing, and said it had

It wrote a line to a device-local audit log, cleared three local keys, and
rendered *"Your deletion request is recorded. Local data on this device has been
cleared."* Both halves were false — `repo.reset()` existed and was never called.
**One of sixteen tables** was touched.

`lili_erase_me` runs in the database now and returns a receipt. Verified end to
end against a throwaway account with rows in every table: listings, shops,
saves, cart, follows, notifications, offers and analytics events gone; the
account gone.

Two things deliberately survive, and she is told how many of each:

- **Messages are redacted, not removed.** A thread belongs to both people in it;
  deleting half leaves the other woman a record she cannot read.
- **Moderation cases are kept**, with a stated legal basis and a 24-month period
  and a route to object — because a report is evidence in someone else's
  complaint.

"Get a copy of my data" returned five local keys and omitted everything on the
server; it now asks `lili_export_me` as well.

And **"My reports" was showing a moderator every case in the marketplace** —
other people's report text — under a heading that says *My reports*. It has its
own RPC now, which also fixes the other half: an ordinary user could not see a
report she filed from a different phone.

## 3 · Invite codes could be brute-forced in about four minutes

`LILI-XXXX` over 28 symbols is ~614,000 combinations; with thirty live that was
about **1 in 20,000**, with no attempt counter, no lockout and no delay — and the
client was never the attack surface, since the publishable key ships and
anonymous sign-in hands an attacker a session to POST the RPC in a loop.

Codes are now `LILI-XXXX-XXXX` — ~3.8 × 10¹¹, six orders of magnitude, for two
extra syllables read aloud. The thirty unused codes were reissued at the new
length. And there is a **server-side attempt counter**: ten an hour, cleared on
success so a valid code is never punished by a housemate's typos.

There was no rate limiting anywhere in the system. There is now: messages 60/h,
listings 40/day (deliberately generous — "Several at once" exists so a woman can
clear a wardrobe in one sitting), conversations 30/h, offers 60/day, reports
20/day **and never the same target twice while a case is open**. That last one
matters most: unlimited reports against one seller with automatic strike
accumulation behind them was a working denial-of-service against a competitor,
and it needed no volume at all, just persistence.

Verified live, including the failure direction — the first version denied when
`auth.uid()` was null and blocked the service role's own writes.

## 4 · An offer against a real listing threw, and none ever expired

`OfferModal` did `[...i.offers, …]`. `offers` is a seed-only field, not a column,
never rebuilt in `fromRow` — so on any real listing it was `undefined` and this
was a `TypeError` inside the state updater, at the moment an offer succeeded. It
also wrote `status:"accepted"` on the client, deciding the seller's answer for
her. Nothing read the field.

`EXPIRY_HOURS = 48` was display-only, computed from the handset clock, and
**failed open** — a row without a timestamp read as "made just now", forever. No
stored state changed, nobody was notified, and `acceptOffer` had no guard at all.

The clock still decides the countdown, because what she sees should not depend
on a job running. The database now decides what can be *done*: `expires_at`, a
trigger that refuses to accept, decline or counter a lapsed offer, an hourly
sweep that moves the state and tells the buyer, and a device path that refuses
the same way so one tap does not mean two different things depending on the
network.

---

## 5 + 6 · Leaks and first load

**740 KB of JavaScript with zero code splitting** — no `React.lazy`, no
`Suspense`, no `manualChunks`. The compliance barrel meant importing
`useCompliance` pulled in `LegalCenter`, which statically imports
`ModerationQueue` and `InviteRoster`: two **moderator-only screens shipped to
every shopper's handset**, in the main chunk, before the first tile painted.

| | before | after |
|---|---|---|
| app code | 510 KB | **281 KB** |
| React | in the app chunk | 142 KB, cached across releases |
| moderator screens | every handset | on the tap |

Sixteen surfaces are lazy now. A weekly beta release is a ~281 KB update rather
than a 510 KB one, on the mobile data this app is used over. Two Suspense
boundaries rather than thirty, so a sheet loading can never blank the feed
behind it.

---

## 7 · Photographs that measure themselves

`PhotoCoach` gave advice and had never looked at a picture — a seller who had
just uploaded something dark and blurred was told, in the abstract, to use
natural light, next to the photograph proving she hadn't.

`data/imageQuality.js` measures focus (variance of the Laplacian), exposure
(mean luminance plus clipping at both ends) and framing (subject against the
border's median), on the phone, from **the same canvas that already strips the
EXIF** — so it costs one `getImageData` and nothing leaves the device.

Everything is a pure function over a pixel array, which is what let the
thresholds be **calibrated rather than guessed**. `npm run imagequality`
generates a sharp pattern, the same pattern blurred, underexposed, blown out,
lost in the frame and sideways, and asserts the separation holds. It found three
real faults in my first cut:

- the fill metric didn't work at all — it compared centre detail to edge detail,
  which is high either way for a garment on a plain ground;
- sharpness **aliased on high-resolution phones**: nearest-neighbour
  downsampling destroyed fine fabric texture, so the same scene scored 100×
  lower at 1800px than at 600px. A perfectly sharp photograph of linen would
  have been called blurred on a modern camera. Fixed by averaging each block and
  measuring at two scales — the ratio went from 0.01 to 0.99;
- and one assertion matched its own advice, tripping on the words *"out of
  focus"*.

At most two findings per photograph, each naming the fix — *"too dark to see the
colour — move next to a window and turn the ceiling light off"* — never a score.
Shown in both sell flows; in the batch flow it matters most, because fifteen
photographs go past too fast to look at and the one dark one is the one that
won't sell.

---

## 8 · Arabic

The audit's verdict: *the app can understand Arabic perfectly and cannot speak
it.* The excellent Arabic work in this codebase is all in the **input and
matching** layers. The **output** layer had none of it.

`applyLanguage` set `dir="rtl"` and nothing else — over 87 physical left/right
properties and exactly one logical one. That single line did not make the app
Arabic; it flipped the text and left the chrome, which is worse than not
offering it. And nothing re-rendered anyway: the function wrote to the DOM and
published nothing, and `LanguagePicker`'s own `onChange` was never passed. **The
language picker was a control that could not control anything.**

Fixed, in order of what actually broke:

- **The chat bubble** aligned by `marginLeft`/`marginRight`, so in Arabic you
  could not tell your own messages from hers.
- **Every consent toggle read inverted** — the knob moved with
  `translateX(18px)`, so with the track mirrored "on" sat at the reading start.
  Whether a woman believes she turned analytics off is not cosmetic.
- **Every back arrow** was a literal `←`, including the one in the shared Shell —
  so the screen where she *chooses* Arabic had an arrow pointing the wrong way
  the moment she chose it.
- **The tab-bar badge** was centred with `right:50%` and a negative
  `marginRight`, which doesn't mirror — it drifts off the icon.

Logical CSS properties are the correct answer and cannot be used: the manifest
declares minSdkVersion 23 and the build targets chrome58 for that reason, while
`inset-inline-start` landed in Chrome 87. So `i18n/direction.js` emits physical
properties for the direction in force — works on every WebView, explicit at the
call site.

Three data bugs, one of which was quietly corrupting the search index:

- **`titleAr: form.titleAr || form.title`** wrote the *English* title into
  `title_ar` whenever she skipped the field. Search weights `titleAr` equal to
  `title`, so the bilingual index was filling with duplicate English under an
  Arabic field name — Arabic recall getting worse as the catalogue grew, and no
  way afterwards to tell a real Arabic title from a copy.
- **The Arabic title input had no `dir="rtl"`**, so what she typed was
  bidi-rendered in a left-to-right box and punctuation jumped to the wrong end —
  in the one field the flow specifically asks her to fill in. Settings had solved
  this privately in v2.7 and the fix never reached the shared primitive.
- **The bulk flow had no Arabic field at all**, which meant Arabic coverage would
  degrade exactly as sellers scaled up.

And the one that was actively unfair: **`listingQuality.js` penalised
Arabic-writing sellers.** The provenance, flaw and measurement checks were
English-only regexes anchored with `\b`, which is meaningless against Arabic. A
seller who wrote an honest Arabic description — the receipt she has, the scuff on
the corner, the measurements — scored zero on all three and was told her listing
was incomplete. The same listing in both languages now scores **58 and 58**.

Prices go through one formatter that knows Arabic puts the currency after the
number (`formatPrice` has known since v2.7 and was never called from anywhere).
The funnel now carries `lang` and `dir` on every event, with a
`lili_funnel_by_language` view — so *"do Arabic users drop off where English
users don't"* becomes answerable, which it was not and would not have been after
launch week either.

**Arabic is marked `partial`, not `ready`.** This file's own scheme defines
"ready" as *real strings exist*; an audit counted ~150 bilingual labels against
600+ English strings, all of them headings, with no body copy anywhere — not the
Legal Centre, not the Help Centre answers, not the reasons a woman picks from to
report a counterfeit. The picker says *"partly translated"* on the row she is
about to tap. Claiming otherwise would be the fabricated claim this project has
spent three releases removing, in the language of the market it is launching
into.

An Arabic phone still gets the Arabic interface — reclassifying it initially sent
those users to English, which would have thrown away the mirrored layout and
Arabic search to protect them from untranslated copy they'd meet anyway.

---

## Still open

- **Anonymous sign-in is switched off.** Still yours, still the one blocker
  `npm run preflight` reports.
- **Arabic body copy** — Legal Centre, Help Centre answers, report reasons,
  error messages and empty states. Professional translation; this codebase's own
  note rules out machine translation for terms and refund policy, correctly.
- **A translation layer.** ~150 `"English · عربي"` concatenations render *both*
  languages to every user. Splitting them needs a dictionary and a provider,
  which is the structural half of this job.
- Payments, escrow, shipping, third-party authentication, iOS, push — unchanged,
  and every screen says so.
