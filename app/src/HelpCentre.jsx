import { useState } from "react";
import { C, Shell, Note } from "./compliance/ui.js";
import Icon from "./icons/Icon.jsx";

// ─────────────────────────────────────────────────────────────────────────────
//  HELP
//
//  This row sat in the menu doing nothing. Everything a buyer or seller
//  actually asks in the first week is answerable today, without a backend or a
//  support team — so it may as well answer.
//
//  Deliberately not a search box over an empty knowledge base, and not a
//  contact form that posts nowhere. Real answers, and one honest route out.
// ─────────────────────────────────────────────────────────────────────────────

const FAQ = [
  // v2.9. Four of these answers described a marketplace that does not exist
  // yet: escrow, refunds, shipping, a flat 10% fee, and authentication as a
  // precondition of listing. Each is now what is actually true, and each says
  // what is planned where the plan matters. See the note above HOW_MONEY_WORKS
  // in compliance/sellerRules.js for how this was found.
  { q: "Who am I actually buying from?", qAr: "من أشتري؟",
    a: "The woman who listed it. lili is the marketplace, not the shop — she owns " +
       "the piece, sets the price and posts it. We introduce you and we enforce " +
       "the rules. We don't take your money and we don't own anything here." },
  { q: "Does lili hold my money?", qAr: "هل تحتفظ lili بأموالي؟",
    a: "No. Not yet, and it matters that you know it. You and the seller agree a " +
       "price here, you meet somewhere public, and you pay her directly. Nothing " +
       "passes through lili, so there is no payment for us to hold back or return. " +
       "A licensed processor holding the money until the piece is in your hands is " +
       "the plan, and it needs a trade licence and a regulated payment provider " +
       "before it can be real." },
  { q: "What if it turns up fake, or not as described?", qAr: "إذا كانت مقلدة؟",
    a: "Check it before you hand anything over — that is the moment, and right now " +
       "it is the only one. Serial, stitching, hardware, the flaws you saw in the " +
       "photos. If it's wrong, walk away. Afterwards we cannot get your money back, " +
       "because we never had it. What we can do is act on her: report the listing " +
       "and we read it, and your conversation too if you attach it, and we can take " +
       "the piece down and close the shop." },
  { q: "What does 'Authenticated' mean?", qAr: "ما معنى موثّقة؟",
    a: "That the seller has told us she holds proof — a receipt, a card, the papers " +
       "— and said so on the record. It is not a lili inspection: we do not yet " +
       "have anyone examining pieces, and a badge that implies we did would be " +
       "worth less than nothing. Third-party authentication is being arranged and " +
       "is marked 'not yet available' in the listing flow until it is." },
  { q: "What does it cost to sell?", qAr: "كم تكلفة البيع؟",
    a: "Between 6% and 10% of the sale price when your piece sells, higher on small " +
       "items and lower on expensive ones, with a minimum of AED 15. Listing is " +
       "free. You see the exact figure you'd receive before you publish. Nothing is " +
       "being deducted today — with no payment rail there is nothing to deduct it " +
       "from — so the schedule is what you'll be charged when there is one." },
  { q: "When do I get paid?", qAr: "متى أستلم المبلغ؟",
    a: "The buyer pays you directly when you meet, so it's in your hands the same " +
       "moment the piece leaves them. Count it before she goes. lili is not in the " +
       "middle of that, which also means we cannot help if it goes wrong afterwards." },
  { q: "Can I sell if I'm not a business?", qAr: "هل أبيع كشخص عادي؟",
    a: "Yes — most sellers here are clearing their own wardrobes. You tell us which " +
       "you are when you open your shop, and buyers see it on every listing, because " +
       "it changes what you owe them." },
  { q: "Something's wrong with a listing", qAr: "الإبلاغ عن قطعة",
    a: "Tap Report on the listing itself. Counterfeits and prohibited items go to a " +
       "person within 24 hours. You'll be told the outcome and the reason for it." },
];

export default function HelpCentre({ onBack }) {
  const [open, setOpen] = useState(null);

  return (
    <Shell title="Help" subtitle="المساعدة" onBack={onBack}>
      <p style={{ fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" }}>
        The questions we're asked most. If yours isn't here, message us — a person
        reads it.
      </p>

      {FAQ.map((f, i) => {
        const isOpen = open === i;
        return (
          <button key={f.q} onClick={() => setOpen(isOpen ? null : i)} style={{
            width: "100%", textAlign: "left", background: C.white,
            border: `1px solid ${isOpen ? C.terra : C.border}`, borderRadius: 14,
            padding: "12px 16px", marginBottom: 8, cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, lineHeight: 1.35 }}>
                  {f.q}
                </div>
                <div style={{ fontSize: 11, color: C.terraTx, marginTop: 2 }}>{f.qAr}</div>
              </div>
              <span style={{ color: C.inkLt, fontSize: 13 }}>{isOpen ? "−" : "+"}</span>
            </div>
            {isOpen && (
              <div style={{ fontSize: 13, color: C.inkLt, lineHeight: 1.65, marginTop: 10,
                            paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                {f.a}
              </div>
            )}
          </button>
        );
      })}

      <div style={{ background: C.sand, border: `1px solid ${C.border}`, borderRadius: 14,
                    padding: "14px 16px", marginTop: 14, display: "flex", gap: 12,
                    alignItems: "flex-start" }}>
        <Icon name="chat" size={19} style={{ color: C.terraTx, marginTop: 1 }} />
        <div style={{ fontSize: 13, color: C.inkLt, lineHeight: 1.6 }}>
          Still stuck? Email{" "}
          <b style={{ color: C.ink }}>help@loveitorleaveit.ae</b> and tell us the
          piece and what happened. We answer within a day.
        </div>
      </div>

      <Note>
        Your rights don't depend on us. Whatever we decide, you can still take a
        dispute to the consumer authority in your market — see Privacy &amp;
        Safety → If something goes wrong.
      </Note>
    </Shell>
  );
}
