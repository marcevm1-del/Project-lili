// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState, useEffect } from "react";
import { parsePrice } from "../ux/input.js";
import Icon from "../icons/Icon.jsx";
import { useFocusTrap, dialogProps } from "../a11y/useFocusTrap.js";
import * as offers from "../data/offers.js";
import * as fees from "../data/fees.js";
import { t } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { money } from "../i18n/direction.js";
import { C, Placeholder } from "./shared.jsx";


// ── payout ─────────────────────────────────────────────────────────────────
//
//  What she takes home, led by the number she cares about.
//
//  Leading with the deduction is how a fee reads as a penalty; leading with the
//  payout is how it reads as a price. Same arithmetic, and the second one is
//  the honest emphasis because the payout is the thing she is deciding about.
//
//  It also refuses to imply money is moving. `fees.COLLECTION_LIVE` is false
//  until there is a processor, so today this says what the fee WILL be and that
//  nothing is being taken yet — rather than showing a deduction from a sale
//  lili cannot process.
export function PayoutBox({price}) {
  const b = fees.breakdown(price);
  if (!b) {
    return (
      <div style={{background:C.sand,borderRadius:12,padding:"12px 14px"}}>
        <div style={{fontSize:12,color:C.inkLt,lineHeight:1.6}}>
          Put a price in and we'll show you exactly what you take home.
        </div>
      </div>
    );
  }
  return (
    <div style={{background:C.sand,borderRadius:12,padding:"12px 14px"}}>
      <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:8}}>
        <span style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,
          textTransform:"uppercase"}}>You receive</span>
        <span style={{marginLeft:"auto",fontFamily:"Georgia,serif",fontWeight:700,
          fontSize:20,color:C.ink}}>{fees.money(b.payout)}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,
        color:C.inkLt,lineHeight:1.7}}>
        <span>Your price</span><span>{fees.money(b.price)}</span>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:12,
        color:C.inkLt,lineHeight:1.7}}>
        <span>
          lili's fee · {b.ratePercent}%
          {b.minimumApplied && <span style={{fontSize:11}}> (minimum {fees.money(fees.MINIMUM_FEE)})</span>}
        </span>
        <span>− {fees.money(b.commission)}</span>
      </div>
      <div style={{fontSize:11,color:C.inkLt,marginTop:8,lineHeight:1.6,
        borderTop:`1px solid ${C.border}`,paddingTop:8}}>
        Includes {Math.round(fees.VAT.rate*100)}% VAT. The rate falls as the price
        rises — {b.band.label} is {b.ratePercent}%.
        {!fees.COLLECTION_LIVE && (
          <> <b style={{color:C.ink}}>Nothing is deducted yet</b> — until payments
          are live you and your buyer settle between yourselves, and lili takes
          nothing at all.</>
        )}
      </div>
    </div>
  );
}

// ── offer modal ────────────────────────────────────────────────────────────
//
//  v2.8 — this was a slot machine.
//
//  Two seconds after you sent an offer, `setTimeout` drew the seller's reply
//  from ["accept","counter","counter"] and invented a counter at 96% of
//  whatever you had typed. The buyer watched a little animation and believed a
//  real woman had answered her in two seconds. The seller was never told an
//  offer existed at all.
//
//  The database has had the real thing throughout: seller read from the
//  listing, amount immutable once made, one open offer per buyer per piece,
//  48-hour expiry read from the clock rather than a cron. It is wired now.
//
//  The pricing hint was invented too — "similar items accept offers around"
//  88–95% of the asking price, which is not a fact about similar items, it is
//  arithmetic on this one. It now uses the published resale band, and says
//  nothing at all when there is no basis for an opinion.
export function OfferModal({item,shop,onClose,onSubmit}) {
  const [amount,setAmount] = useState("");
  const [note,setNote] = useState("");
  const [sending,setSending] = useState(false);
  const [sent,setSent] = useState(null);
  const [error,setError] = useState(null);
  // The published resale band, fetched with the module that computes it. Null
  // until it arrives, which is the same thing the screen shows when there is no
  // basis for an opinion — so a slow load looks like "no opinion yet" rather
  // than a wrong one.
  const [band,setBand] = useState(null);

  useEffect(() => {
    if (!item) return;
    let alive = true;
    import("../data/resaleValue.js").then(({ referenceBand }) => {
      if (!alive) return;
      setBand(referenceBand({ brand:item.brand, title:item.title,
                              subtitle:item.subtitle, category:item.category,
                              condition:item.condition }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [item && item.id]);

  const trap = useFocusTrap(onClose, {active: !!item});
  if(!item) return null;

  const value = parsePrice(amount);
  const tooLow = band && value != null && value < band.low * 0.5;

  const send = async () => {
    if(value === null || value <= 0 || sending) return;
    setSending(true); setError(null);
    try {
      const offer = await offers.makeOffer({
        itemId:item.id, shopId:item.shopId,
        sellerUid:item.owner_uid || item.ownerUid || (shop && shop.owner_uid),
        amount:value, message:note,
      });
      setSent(offer);
      onSubmit && onSubmit(value);
    } catch (e) {
      setError(e && e.message ? e.message : "That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={trap} {...dialogProps("Make an offer")}
      style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:300,background:"#000a",
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.cream,borderRadius:"20px 20px 0 0",padding:"20px 16px 40px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontFamily:"Georgia,serif",fontSize:18,color:C.ink,fontStyle:"italic"}}>Make an Offer</div>
            <div style={{fontSize:11,color:C.inkLt}}>
              قدم عرضاً · Expires in {offers.EXPIRY_HOURS} hours
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="tap-target" style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,fontSize:22,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={14} stroke={2}/></button>
        </div>

        {/* item preview */}
        <div style={{display:"flex",gap:12,padding:"10px 12px",background:C.white,
          borderRadius:12,marginBottom:16,border:`1px solid ${C.border}`}}>
          <div style={{width:52,height:52,borderRadius:8,overflow:"hidden",flexShrink:0,
            background:`linear-gradient(145deg,${item.color},${item.color}99)`,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>
            {item.photo?<img src={item.photo} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Placeholder item={item} size={40}/>}
          </div>
          <div>
            <div style={{fontWeight:600,fontSize:13,color:C.ink}}>{item.title}</div>
            <div style={{fontSize:11,color:C.inkLt}}>{item.condition} · {money(item.price)}</div>
            {shop && <div style={{fontSize:11,color:C.inkLt,marginTop:2}}>{shop.name}</div>}
          </div>
        </div>

        {!sent ? (
          <>
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,
                textTransform:"uppercase",marginBottom:6}}>{t("your_offer")}</div>
              <div style={{display:"flex",alignItems:"center",gap:10,background:C.white,
                border:`2px solid ${C.terra}`,borderRadius:12,padding:"12px 14px"}}>
                <span style={{fontWeight:700,color:C.inkLt,fontSize:14}}>AED</span>
                <input value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal"
                  aria-label="Offer amount"
                  placeholder="Enter amount..."
                  style={{flex:1,background:"none",border:"none",outline:"none",
                    fontSize:18,fontWeight:700,color:C.ink,fontFamily:"inherit"}}/>
              </div>
            </div>

            {/* One tap to a sensible offer, as Vinted and Poshmark do: most
                offers land 10–20% under, and typing a number on a phone is the
                step where people give up. Rounded to AED 10 — "AED 1,147" reads
                like a calculator, not a person. */}
            {item.price >= 50 && (
              <div role="group" aria-label="Quick offers" style={{display:"flex",gap:7,marginBottom:12,flexWrap:"wrap"}}>
                {[10,15,20].map(pct=>{
                  const v = Math.max(10, Math.round(item.price*(1-pct/100)/10)*10);
                  const on = value === v;
                  return (
                    <button key={pct} type="button" onClick={()=>setAmount(String(v))} aria-pressed={on}
                      style={{flex:"1 1 90px",background:on?C.btn:C.white,color:on?C.onBtn:C.ink,
                        border:`1.5px solid ${on?C.btn:C.border}`,borderRadius:12,padding:"8px 6px",
                        cursor:"pointer",fontFamily:"inherit",lineHeight:1.3}}>
                      <div style={{fontSize:14,fontWeight:700}}>{money(v)}</div>
                      <div style={{fontSize:11,opacity:on?1:0.8}}>{pct}% under</div>
                    </button>
                  );
                })}
              </div>
            )}

            <input value={note} onChange={e=>setNote(e.target.value)} maxLength={500}
              aria-label="Message with your offer"
              placeholder={t("say_why_if_you_like_it_helps")}
              style={{width:"100%",padding:"10px 12px",borderRadius:10,
                border:`1px solid ${C.border}`,fontSize:13,outline:"none",
                marginBottom:12,boxSizing:"border-box",fontFamily:"inherit"}}/>

            {/* Only shown when there IS a basis. No band, no opinion. */}
            {band && (
              <div style={{background:C.sand,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
                <div style={{fontSize:11,color:C.inkLt,lineHeight:1.55}}>
                  Comparable {band.tierBrand} pieces in {band.condition} condition
                  resell from about <b style={{color:C.ink}}>{money(band.low)}</b>.
                  A guide from published resale data, not a valuation of this piece.
                </div>
              </div>
            )}
            {tooLow && (
              <div style={{background:C.sand,border:`1px solid ${C.gold}`,borderRadius:10,
                padding:"10px 14px",marginBottom:12,fontSize:11,color:C.ink,lineHeight:1.55}}>
                That is a long way under the range. Low offers are usually
                declined without a reply — she may not even see it as serious.
              </div>
            )}
            {error && (
              <div role="alert" style={{background:"#FBF0EE",border:`1px solid ${C.red}`,
                borderRadius:10,padding:"10px 14px",marginBottom:12,fontSize:12,
                color:C.ink,lineHeight:1.55}}>{error}</div>
            )}

            <button onClick={send} disabled={value===null||value<=0||sending}
              style={{width:"100%",background:(value!==null&&value>0&&!sending)?C.btn:C.sand,
              color:(value!==null&&value>0&&!sending)?C.onBtn:C.inkLt,border:"none",borderRadius:30,padding:"14px 0",
              fontWeight:700,fontSize:14,cursor:sending?"default":"pointer"}}>
              {sending ? t("sending") : t("send_offer")}
            </button>
            <div style={{fontSize:11,color:C.inkLt,textAlign:"center",marginTop:10,lineHeight:1.55}}>
              She has {offers.EXPIRY_HOURS} hours to answer. The amount can't be
              changed once sent — by either of you.
            </div>
          </>
        ) : (
          <div style={{textAlign:"center",padding:"14px 0 4px"}}>
            <div style={{marginBottom:10,display:"flex",justifyContent:"center",color:C.green}}>
              <Icon name="check" size={32} stroke={2}/>
            </div>
            <div style={{fontSize:15,fontWeight:700,color:C.ink}}>
              {t("offer_sent")}
            </div>
            <div style={{fontSize:13,color:C.inkLt,marginTop:8,lineHeight:1.6,padding:"0 10px"}}>
              {sent.delivered === false
                ? "It's saved on this phone and will go the moment you have signal."
                : <>She's been told. You'll hear back here, and you can withdraw it
                   any time before she answers.</>}
            </div>
            <button onClick={onClose} style={{width:"100%",background:C.btn,color:C.onBtn,
              border:"none",borderRadius:30,padding:"12px 0",fontWeight:700,fontSize:14,
              cursor:"pointer",marginTop:18}}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}
