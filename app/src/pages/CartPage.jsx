// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import Icon from "../icons/Icon.jsx";
import { HOW_MONEY_WORKS } from "../compliance/sellerRules.js";
import { t } from "../i18n/t.js";
import { backArrow, money } from "../i18n/direction.js";
import { C, Avatar, Placeholder } from "../market/shared.jsx";


// ── cart page ──────────────────────────────────────────────────────────────
/**
 * The basket, which could not be a checkout.
 *
 * v2.9.4, and this was the last fiction in the app — the worst of them, because
 * a buyer COMPLETED it. What this screen said and did:
 *
 *   · "We hold your payment until it arrives, and if it's fake, not as
 *     described, or never turns up, you get your money back."
 *   · "Pieces marked Authenticated have been checked by us."
 *   · "lili runs the marketplace and holds the payment until the item arrives."
 *   · a "LILI Service Fee (9%)" added to HER total — the fee is the seller's,
 *     it is tiered 6–10%, and fees.COLLECTION_LIVE is false, so it was a
 *     charge that does not exist, computed at a rate that is not the rate.
 *   · Card / Bank Transfer / Cash on Delivery, none of which exist.
 *   · "Proceed to Checkout", which set a boolean.
 *   · then: "Order placed! Your seller has been notified. They'll confirm and
 *     arrange delivery within 24 hours." Nothing was written anywhere. The
 *     seller was never told. A woman would have waited a day for a message
 *     that was never going to come, having believed she had bought something.
 *
 * The v2.9 sweep for escrow claims missed this screen because it says "hold
 * YOUR payment" rather than "hold the payment" — which is the argument for the
 * flag rather than the grep, and the reason everything below reads from
 * HOW_MONEY_WORKS.
 *
 * ── what it is instead
 *
 * The useful behaviour is real: she collects pieces she means to buy. What
 * cannot be real is paying for them here. So it is a shortlist that opens the
 * conversation with each seller — the thing that actually works, and the thing
 * that has to happen anyway before anyone meets. Grouped by seller, because one
 * basket is several separate arrangements with several different women, and
 * that is true whether or not there is a checkout.
 *
 * It becomes a checkout the day COLLECTION_LIVE flips, and not a day earlier.
 */
export function CartPage({cart, shops, removeFromCart, setTab, onMessageSeller}) {
  const bySeller = cart.reduce((acc, i) => {
    (acc[i.shopId] = acc[i.shopId] || []).push(i);
    return acc;
  }, {});
  const sellerIds = Object.keys(bySeller);

  return (
    <div style={{paddingBottom:72}}>
      <div style={{background:C.cream, padding:"14px 16px", borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", gap:10}}>
        <button onClick={()=>setTab("home")} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.ink,
          minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center"}}>{backArrow()}</button>
        <div style={{flex:1}}>
          <div style={{fontFamily:"Georgia,serif", fontStyle:"italic", fontSize:18, color:C.terraTx}}>{t("your_list")}</div>
          <div style={{fontSize:11, color:C.inkLt}}>
            {cart.length} {cart.length === 1 ? t("piece") : t("pieces")}
            {sellerIds.length > 1 ? ` · ${t("from_n_sellers", { n: sellerIds.length })}` : ""}
          </div>
        </div>
      </div>

      {cart.length === 0 ? (
        <div style={{textAlign:"center", padding:"70px 24px", color:C.inkLt}}>
          <Icon name="bag" size={30} stroke={1.4} style={{color:C.terra, marginBottom:12, opacity:0.85}}/>
          <div style={{fontSize:14, color:C.ink}}>{t("nothing_on_your_list_yet")}</div>
          <div style={{fontSize:12, marginTop:7, lineHeight:1.65, maxWidth:280, margin:"7px auto 0"}}>
            {t("add_pieces_you_mean_to_ask_about")}
          </div>
          <button onClick={()=>setTab("home")} style={{marginTop:16, background:C.btn, color:C.onBtn,
            border:"none", borderRadius:24, padding:"12px 24px", fontWeight:700, fontSize:13,
            cursor:"pointer", fontFamily:"inherit"}}>
            {t("start_shopping")}
          </button>
        </div>
      ) : (
        <div style={{padding:"14px 14px 20px"}}>
          {/* Said once, at the top, before she reads a single price. It is the
              one thing she must know on this screen and the one thing the
              screen used to deny. */}
          <div style={{background:C.sand, border:`1px solid ${C.border}`, borderRadius:12,
            padding:"12px 14px", fontSize:12, color:C.ink, lineHeight:1.6, marginBottom:16}}>
            <b>{t("this_is_a_list_not_a_basket")}</b>{" "}
            <span style={{color:C.inkLt}}>{HOW_MONEY_WORKS.short}</span>
          </div>

          {sellerIds.map((sid) => {
            const shop = shops.find((sh) => String(sh.id) === String(sid));
            const items = bySeller[sid];
            const subtotal = items.reduce((n, i) => n + (i.price || 0), 0);
            return (
              <div key={sid} style={{background:C.white, border:`1px solid ${C.border}`,
                borderRadius:14, padding:"12px 12px", marginBottom:12}}>
                <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:10}}>
                  <Avatar shop={shop} size={30}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:13, fontWeight:700, color:C.ink}}>
                      {shop ? shop.name : t("this_seller")}
                    </div>
                    <div style={{fontSize:11, color:C.inkLt}}>
                      {items.length} {items.length === 1 ? t("piece") : t("pieces")} · {money(subtotal)}
                    </div>
                  </div>
                </div>

                {items.map((i) => (
                  <div key={i.id} style={{display:"flex", alignItems:"center", gap:10, padding:"7px 0"}}>
                    <div style={{width:40, height:50, borderRadius:7, overflow:"hidden",
                      flexShrink:0, background:C.sand}}>
                      {i.thumb || i.photo
                        ? <img src={i.thumb || i.photo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                        : <Placeholder item={i} size={26}/>}
                    </div>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{fontSize:13, color:C.ink, whiteSpace:"nowrap",
                        overflow:"hidden", textOverflow:"ellipsis"}}>{i.title}</div>
                      <div style={{fontSize:12, color:C.terraTx, fontWeight:700}}>{money(i.price)}</div>
                    </div>
                    {/* Quantity is gone with the checkout. A resale listing is
                        one specific second-hand piece; "2 of that dress" was
                        never a thing anyone could buy. */}
                    <button onClick={()=>removeFromCart(i.id)} aria-label={t("remove")}
                      style={{background:"none", border:"none", cursor:"pointer", color:C.inkLt,
                        padding:6, flexShrink:0}}>
                      <Icon name="close" size={13} stroke={2}/>
                    </button>
                  </div>
                ))}

                <button onClick={()=>onMessageSeller && onMessageSeller(items[0])}
                  style={{width:"100%", marginTop:10, background:C.btn, color:C.onBtn,
                    border:"none", borderRadius:24, padding:"12px 0", fontWeight:700,
                    fontSize:13, cursor:"pointer", fontFamily:"inherit"}}>
                  {t("ask_about_these")}
                </button>
              </div>
            );
          })}

          <div style={{fontSize:11, color:C.inkLt, lineHeight:1.65, padding:"4px 2px"}}>
            {t("each_seller_is_a_separate_arrangement")}
          </div>
        </div>
      )}
    </div>
  );
}
