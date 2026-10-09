# The first ten

What each of the first ten invitations is for, what she is asked to do, and
what counts as it having worked.

This is not a marketing plan. It is a list of ten specific jobs, because the
roster in the app already tracks four states — invited → redeemed → opened a
shop → **actually listed** — and the last one is the only number that means
anything. `Legal Centre → Beta roster` shows it.

---

## The rule that shapes all of this

**Nothing in lili works with one person in it.** A shop with no buyer is a
photo album; a buyer with no shops is an empty screen. Ten women who each
invite nobody is ten single-player games, and it will look exactly like a
working app while being nothing of the kind.

So the ten are not ten of the same person. They are **four sellers, three
buyers, two who are both, and one who is trying to break it.**

---

## Before you send a single invitation

Three things, in this order. The first is the only true blocker.

1. **Switch on anonymous sign-in** in the Supabase dashboard
   (Authentication → Providers → Anonymous). Until this is on, every install
   is a single-player game: she can browse the demo catalogue and nothing she
   does reaches anybody. `npm run preflight` reports this as the one blocker
   and will stop reporting it the moment you flip it.
2. **Run `npm run preflight`** and read the whole thing. It talks to the live
   database with the same key the app ships, so what it can do is what a real
   install can do.
3. **Open the app yourself, on a phone you do not develop on, and list one
   real thing you own.** Not a test listing — something you would actually
   sell. Everything below assumes you have felt the flow once.

---

## The ten

### Sellers — four

The hardest thing to get is a catalogue. A woman will not come back to an empty
shopping app twice.

**1. The friend with the fullest wardrobe.**
Ask for: **fifteen pieces, in one sitting, using "Several at once".**
Not five. Fifteen is the number that makes the feed look like a place rather
than a demo, and the bulk flow was built for exactly this.
Worked if: fifteen pieces are live and she says which part of it was annoying.

**2. The one who sells on Instagram already.**
She has photographs, prices and a following. She is the only one of the ten who
can bring her own buyers.
Ask for: **her ten best pieces, and her honest answer to "would you move here
from Instagram, and what would have to be true first?"**
Worked if: the pieces are up. The answer to the second question is worth more
than the listings.

**3. The abaya and modest-wear seller.**
This is the category lili is meant to be first-class at, and it is the one that
will expose whether the Arabic actually works — search, titles, the listing
screen.
Ask for: **eight pieces, listed with Arabic titles, using the app in Arabic.**
Worked if: she can complete a listing without switching to English. If she
switches, find out where and why — that is the highest-value bug report you
will get all month.

**4. The one who is not sure she has anything worth selling.**
Every seller you eventually want is this woman. If the app cannot get her from
"I don't know" to one listing, it does not scale past your friends.
Ask for: **one piece. Just one.**
Worked if: she lists it without you in the room. Watch the roster: if she
redeems and opens a shop but never lists, that gap is the single most important
thing to fix, and the roster is built to show you exactly that.

### Buyers — three

**5, 6, 7. Three women who would actually buy second-hand at these prices.**
Do not invite people to "have a look". Invite them to shop.
Ask for: **find something you would genuinely buy, add it to your list, and
message the seller about it.**
Worked if: a real conversation happens between two women who did not arrange it
beforehand. That is the product. Everything else is support for that moment.

One of the three should be asked to **go as far as meeting and buying**, if a
piece and a price suit her. The first completed exchange tells you more than
the next fifty listings.

### Both — two

**8 and 9. Two who will sell something and buy something.**
They are the only ones who will see the app from both ends, and they are the
ones who will notice if the two halves contradict each other — the fee she is
shown as a seller against the price he is shown as a buyer, the same piece
described two ways.
Ask for: **list two, buy one.**
Worked if: they report a contradiction. If they report none, ask harder.

### The one who is trying to break it — one

**10. Someone technical, or just contrary, told explicitly to be a nuisance.**
Ask for: **try to see something you shouldn't. Try to list something that
shouldn't be allowed. Report a listing and see what happens. Delete your
account and check whether it is really gone.**
Worked if: she finds something. She will.

---

## What to send

Keep it short and say what you actually want. A suggested shape — change the
words, keep the four parts:

> lili is a small marketplace for buying and selling clothes between women in
> Dubai. It is early: no payments, no delivery. You agree a price in the app,
> meet somewhere public, and she pays you in person.
>
> I'd like you to [**the one specific ask above**].
>
> Two things you should know before you start: lili takes 9% when a piece sells
> — though there is no payout system yet, so nothing is being taken from anyone
> at the moment — and lili never holds your money. That is between you and her.
>
> Your code is XXXX-XXXX. Tell me what annoyed you.

The last line matters. "What did you think?" gets you "nice!". "What annoyed
you?" gets you the thing to fix.

---

## What to watch, and in what order

Open `Legal Centre → Beta roster`. Four columns, and the gaps between them are
the whole story:

| Gap | What it means | What to do |
|---|---|---|
| invited → **redeemed** | She did not install, or the code failed | Ask one person directly. A broken code is a five-minute fix; "I'll do it later" is a different problem |
| redeemed → **opened a shop** | She got in and did not start | The shop screen asks for a seller type and a name before anything. Watch someone do it |
| opened a shop → **listed** | The worst gap, and the most fixable | Sit next to her while she tries. Do not help. Write down where she stops |
| listed → **someone messaged her** | The catalogue works, the market does not | You need more buyers, not more sellers |

`npm run stranger` walks the same path automatically and reports every dead
end, silent refusal and unexplained requirement it hits. It is not a substitute
for watching a person, but run it before each invitation goes out.

---

## What honestly is not ready, and say so up front

Say these before she asks, not after she finds out:

- **No payments.** She pays in person. lili holds nothing and can refund
  nothing.
- **No delivery.** They meet. The app suggests what makes a good meeting place
  and deliberately names no addresses — there is no police-endorsed exchange
  scheme in Dubai, whatever anybody tells you.
- **No authentication.** Listings are screened for counterfeit signals. That is
  not the same as anyone verifying a bag, and it must never be described as if
  it were.
- **Arabic is about an eighth done.** The mechanism works; most of the wording
  is still English. `npm run i18n` prints the real figure and will not let it be
  rounded up.
- **Android only.** iOS is a project skeleton, not an app.

A woman who was told all five and came anyway is worth ten who were not.
