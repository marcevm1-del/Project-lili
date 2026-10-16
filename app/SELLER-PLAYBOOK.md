# The first thirty sellers

The app is not the constraint any more. This is.

Your own handover put it second on the list: *"Thirty real sellers with good
photographs beat any amount of engineering."* Every preflight check passes
except the ones only you can do, and `live listings` reads **zero**. Every
buyer's first screen is the empty state until that changes.

This is the part that does not scale, and the literature is unusually blunt
about it. Sharetribe's marketplace guide: meet your first 50–100 providers **in
person**, spend an hour with each, help them build their profile and list their
first items yourself. *"Better to have 10 excellent providers than 100 lousy
ones"* — early sellers set what every buyer thinks lili is. And the failure mode
it names is trying to grow both sides at once. Do not market to buyers yet.

---

## What the app now does for you

| Thing | Where |
|---|---|
| Mint invitation codes, 5 / 10 / 30 at a time | Privacy & Safety → **Beta roster** |
| See who redeemed, opened a shop, and **actually listed** | same screen |
| Withdraw an unused code | same screen |
| List a whole wardrobe in one pass | Sell → **Several at once** |
| Enter a code without leaving the app | the invite-only screen |
| Check the project is actually configured | `npm run preflight` |

The roster's four numbers are **invited → redeemed → opened a shop → actually
listed**. The distance between the second and the fourth is your entire job.
The screen says so out loud, because a redemption counted as a seller is how a
private beta convinces itself it is working while the catalogue stays empty.

---

## The week

### Before you invite anybody

Run `npm run preflight`. If anonymous sign-in is still off, stop — two phones
cannot see each other and every seller you onboard is listing into a private
copy of the app on her own handset. That is the one blocker you must clear
yourself, in the Supabase dashboard: **Authentication → Sign In / Providers →
Anonymous sign-ins**.

Then list four or five of your own pieces. Not as a demo — as real listings you
would actually sell. A seller who opens the app to an empty grid has no idea
what a good listing looks like here, and the first thing she does is copy what
she sees.

### Who to ask, in order

1. **Women you already know who have already resold something** — Instagram,
   Dubizzle, a WhatsApp group, a bazaar. They have photographs, they have
   priced things before, and they have already decided they are the kind of
   person who sells.
2. **Women with a wardrobe and no channel.** Higher effort, and the ones who
   most need the "several at once" flow.
3. **Small existing resale accounts.** Highest supply per conversation, and the
   most likely to want terms. Note the app already distinguishes private from
   business sellers on every listing, because it changes what the buyer is owed
   — do not blur that to win a seller.

Thirty codes are already minted. Hand them over **one at a time, to a named
person, in a conversation**. A code dropped into a group chat is a code nobody
feels responsible for, and the roster will show you exactly that: redeemed,
never listed.

### The hour with each one

Sit next to her. Do not send a link.

1. She installs, she enters her own code, she opens her own shop. Watch where
   she hesitates — that is the funnel, in the only resolution that matters at
   thirty people.
2. Open **Several at once** and go through her camera roll together. Aim for
   **eight to twelve pieces**, not three. Below about eight a shop reads as
   abandoned; above about fifteen the first session gets tiring.
3. Photographs: natural light, plain wall or bed, the piece filling the frame,
   one close-up of any flaw. The app strips GPS from every picture before it is
   stored, so photographing at home is safe — tell her, because women ask.
4. Prices: the app shows a reference band next to each price from published
   resale data. Let her price above it if she wants. Do not price for her — a
   price she did not choose is a price she will not defend when an offer comes.
5. Before you leave: make sure she has seen the offers screen and the messages
   screen, and that she knows **lili holds no money** and the piece changes
   hands in person. She will be asked this by her first buyer.

### After

- **Day 2** — did she list more on her own? If not, that is the answer to
  whether the flow works, and it is worth more than any survey.
- **Day 7** — anything sold, anything saved, any messages? The roster shows
  listings; the funnel dashboard (`npm run funnel`) shows the rest.
- Anyone at zero listings after seven days: ask once, plainly, what stopped
  them. Then withdraw the code. An unused code in someone's phone is a slot you
  could have given to a woman who would use it.

---

## What good looks like, at thirty

- **~250 live listings.** Eight to twelve each. Below about 100 the categories
  read "none yet" and search feels broken to a buyer who has done nothing wrong.
- **Every category with something in it.** Category tiles now show their count
  and are disabled at zero, so gaps are visible rather than dead ends — but a
  disabled tile is still a gap.
- **Abayas and modest pieces genuinely represented.** It is the category that
  makes lili not-a-Depop-clone, and it will not fill itself if every seller you
  meet is clearing designer bags.
- **Arabic titles on most listings.** The search now genuinely matches Arabic
  — عباية finds "Linen Abaya" through the garment vocabulary — but a piece with
  an Arabic title is found on its own words rather than through a translation.
  Ask for it while you are sitting next to her; nobody adds it later.

---

## What to say when she asks

**"Does it cost anything?"** Listing is free. Between 6% and 10% when a piece
sells, higher on small items, lower on expensive ones, minimum AED 15. She sees
her exact payout before she publishes. Nothing is being deducted yet, because
there is no payment rail — so for now she keeps everything.

**"How do I get paid?"** The buyer pays her directly when they meet. lili is not
in the middle. Say this clearly and early; it is the single most important thing
a seller and a buyer both need to understand, and the app now says it on every
screen that used to claim otherwise.

**"Is it safe?"** Meet somewhere public and busy. Check the piece before money
changes hands. Both sides can report and block, and a report reaches a person —
you — within a day. Do not oversell this: there is no escrow and no refund, and
the app says so.

**"When does it open properly?"** When there is enough to browse. Honest, true,
and it makes her supply the reason it opens rather than a favour she is doing.

---

## What not to do

- **Do not seed fake listings.** Not one. This codebase has had invented ratings
  and review counts deleted from it twice, on principle, and a fabricated
  listing is the same lie with a photograph.
- **Do not market to buyers yet.** Growing both sides at once is the named
  failure mode. A buyer who arrives at eleven listings does not come back.
- **Do not lower the bar to hit thirty.** Twenty good shops beat thirty where
  ten are empty — and the roster will show you which you have.
