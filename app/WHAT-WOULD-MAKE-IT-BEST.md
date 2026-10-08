# What would make lili the best of its kind

An honest read, not a sales pitch.

## Where you are already ahead

**Abayas as a first-class category, with real Arabic.** Not a translation layer
bolted on — feminine-conjugated imperatives throughout, RTL that actually
flips, and now bilingual search. Vinted and Depop treat this market as an
afterthought. Sellers here do not.

**Bilingual, typo-tolerant search.** A woman typing عباية finds a listing
written as "Black Abaya". "dress" finds فستان. "chanl" finds Chanel. Three
layers: full-text stemming, a curated Arabic↔English garment vocabulary, then
word-level fuzzy matching. Results say *how* they were found — exact,
translated, or close — because a shopper should know why something is in front
of her. **Nobody in Gulf resale does this well.** This is the single clearest
product advantage you have.

**Counterfeit screening the database enforces.** Not a client check that a
second code path can bypass — a trigger. A listing cannot be created live; it
arrives pending and the database decides.

**Statement of reasons on every moderation decision**, to both the reporter and
the seller, with decisions immutable. Most marketplaces skip this entirely.
It is also what makes an appeal meaningful rather than theatre.

**Messages that cannot be edited after sending.** In a dispute the thread is
the evidence.

## What would actually make it best

**1. Payments and escrow.** The checkout button is the product. Everything else
is a beautifully built catalogue until money moves. Blocked on the trade licence
— nothing in the code shortens it.

**2. Trust that is earned, not decorative.** — *now built.*
Sales, live listings, how long she has been here, and how fast she replies, all
computed by the database from what actually happened. There is no column a
seller can write to, so none of it can be inflated.

Two deliberate limits. **Strikes are never published** — a moderation record on
a public profile is close to publishing an accusation, and a dismissed report
would still leave a mark. And **reply time is withheld below a sample of three**,
because a "median" over one exchange is not a statistic, it is the timing of a
specific private conversation.

A shop with nothing earned says **"New shop"** and, if she has no sales,
"No sales yet — you'd be her first." It does not get a 4.9. A fabricated
rating is worse than none: it is what makes buyers stop believing every rating
on a platform.

What still needs building here: **buyer reviews after a completed sale.** That
needs payments first, because a review with no transaction behind it is the
easiest thing on a marketplace to fake.

**3. Solve the empty room.** A resale app with no listings is dead on arrival,
and no feature fixes it. Thirty real sellers with good photographs beat any
amount of engineering. Seed it by hand before you open it.

**4. Notifications.** — *the in-app half is now built.*

This was fixing something already broken rather than adding a feature.
Moderation composed a statement of reasons for the reporter **and** the seller,
returned it to the moderator's own API call, and threw it away. Nobody it was
written for ever read it. A right of reply that never arrives is not a right of
reply.

Now delivered: the seller learns the outcome, the reason, and that she can
appeal; the reporter learns what came of her report; a seller whose listing is
screened out is told why. Messages notify the recipient — and a twenty-message
thread produces **one** badge, not twenty.

Nothing can be created from a client. A notifications table anyone can insert
into is a channel for pushing strangers arbitrary text inside the app, so rows
are written by database triggers only and the sole change a person can make is
marking one read.

**Still needed:** push delivery (FCM/APNs) so it reaches a closed phone. That
needs your Firebase credentials — about a day once you have them. The record of
what someone is owed should not wait on a Firebase key, which is why this half
went in first.

**5. Photo quality.** The single biggest driver of resale conversion.

*Half of this is now fixed, and it was a bug rather than a feature.* The
pipeline already made a 400px thumbnail at capture and then discarded it — only
the 1600px original was ever uploaded. So a feed of 180px tiles was pulling
full-size photographs.

**A 20-item feed went from roughly 5.8 MB to 0.36 MB — about 16× fewer pixels
per tile.** On Dubai mobile data that is the difference between a feed that
loads and one a woman closes. The item detail still gets the full image, where
the photograph is actually the point.

Still worth doing: on-device background cleanup and a lighting hint at capture.
Those lift every listing on the platform more than any algorithm will.

## What I would NOT build

**A recommendation algorithm.** With a few hundred listings, curation by a
human with taste beats a cold-start model, and it is on-brand: lili is a group
chat, not a feed.

**Stories, video, live selling.** Depop has them. They are expensive and they
are not why anyone would choose you.

## The honest risk

Your differentiator is cultural, not technical — abayas, Arabic, and a
community tone. Everything I have built protects that: the compliance posture,
the screening, the moderation trail, the privacy of the messages. None of it
creates it. That comes from who you invite in first, and what you refuse to
list. Those are decisions no code will make for you.
