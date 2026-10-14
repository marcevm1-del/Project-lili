// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState, useEffect, lazy, Suspense } from "react";
import { SoldBy } from "../compliance";
import PriceTag from "../listing/PriceTag.jsx";
import { FitPanel } from "../listing/FitAndFlaws.jsx";
import Icon from "../icons/Icon.jsx";
import { useFocusTrap, dialogProps } from "../a11y/useFocusTrap.js";
import * as offers from "../data/offers.js";
import { t, getLang } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { alignEnd, backArrow, money } from "../i18n/direction.js";
import { C, T, Avatar, Stars, earnedFollowers, ItemPhoto } from "./shared.jsx";
import { sizeLabel, kindOf, APPROXIMATE_NOTE } from "../sizes/sizeSystem.js";
import { useSizeSystem } from "../sizes/SizeSystemPicker.jsx";
import * as remote from "../backend/remote.js";
import { carrier, inLang } from "../delivery/carriers.js";
import { loadRates } from "../delivery/rates.js";
import { PAYMENTS_LIVE } from "../compliance/sellerRules.js";
import { isAway, backOn } from "../shops/away.js";
const CheckoutSheet = lazy(() => import("../delivery/CheckoutSheet.jsx"));


// ── what a piece like this usually goes for ────────────────────────────────
//
// v2.11.4. The band from data/resaleValue.js has been on the OFFER sheet since
// v2.9, where it helps a woman pick a number. It was never shown to the person
// who most needs it: the buyer looking at the price and wondering whether it is
// fair, on the screen where she decides whether to meet a stranger with three
// thousand dirhams in her bag.
//
// This is anchoring, and it is the honest form of it. The anchor is a published
// range with a stated basis and named sources, not a struck-through number lili
// invented — and `referenceBand` returns null for any brand it has no opinion
// about, so the component renders nothing rather than reaching for something to
// say. Silence is a legitimate answer here and is most of the answers.
//
// It deliberately does not editorialise. No "great deal", no "below market",
// no colour that reads as a verdict: the range and where this price sits in it.
// A buyer who is told the number is good has been sold to. A buyer who is shown
// the range has been informed, and she converts better and complains less.
export function PriceContext({ item }) {
  const [band, setBand] = useState(null);
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

  // Audit A2-1: the band's `low` is the floor of genuine (it exists to flag
  // fakes) and `high` was that floor times a fixed spread, so "AED 12,000–
  // 144,000" was noise, and "above that range" told a fairly priced seller she
  // was over the market on no data. Now: only a named model, which has a real
  // floor, and only that floor, worded the same as on the offer sheet.
  if (!band || !band.model) return null;
  return (
    <div style={{background:C.sand,border:`1px solid ${C.border}`,borderRadius:12,
      padding:"8px 12px",marginBottom:14}}>
      <div style={{fontSize:12,color:C.ink,lineHeight:1.5}}>
        Genuine {band.tierBrand} pieces like this in {band.condition} condition resell from about <b>AED {band.low.toLocaleString("en-US")}</b>
      </div>
      <details style={{marginTop:2}}>
        <summary style={{fontSize:11,color:C.inkLt,cursor:"pointer",minHeight:24,
          display:"flex",alignItems:"center"}}>How this works</summary>
        <div style={{fontSize:11,color:C.inkLt,lineHeight:1.5,marginTop:2}}>
          The lowest prices genuine pieces of this model reach second-hand, from published resale
          data. Far below it is a reason to ask for proof of purchase. A guide, not an appraisal of this piece.
        </div>
      </details>
    </div>
  );
}

// ── item detail modal ──────────────────────────────────────────────────────
// Whether paying in the app is switched on. Two switches, both required: the
// build's PAYMENTS_LIVE (so every policy and screen describing money was
// shipped saying the same thing) and the server's lili_settings.payments (so
// lili can switch it off again without a release). Asked once per launch.
let paymentsAnswer = null;
function usePaymentsOn() {
  const [on, setOn] = useState(PAYMENTS_LIVE && paymentsAnswer === true);
  useEffect(() => {
    if (!PAYMENTS_LIVE || paymentsAnswer !== null || !remote.isConfigured()) return;
    remote.paymentsEnabled().then(v => { paymentsAnswer = !!v; setOn(!!v); }).catch(() => {});
  }, []);
  return on;
}

// How this piece can reach a buyer, after Yaga's listing page: every option
// the seller switched on, with the fee for its parcel size in the UAE.
export function DeliveryInfo({item, onSeeTotal}) {
  const [rates, setRates] = useState([]);
  const ways = Array.isArray(item.delivery) && item.delivery.length ? item.delivery : ["meet"];
  useEffect(() => {
    if (!ways.some(k => k !== "meet")) return;
    loadRates().then(setRates);
  }, [item.id]);
  const size = item.parcelSize || "S";
  const fee = (k, region) => rates.find(r => r.carrier === k && r.size === size && r.region === region);
  return (
    <section aria-label={t("delivery")} data-section="delivery" style={{margin:"0 0 16px"}}>
      <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:6}}>{t("delivery")}</div>
      <div style={{display:"grid",gap:4}}>
        {ways.map(k => { const c = carrier(k); if (!c) return null;
          const uae = fee(k, "UAE"), gcc = fee(k, "GCC");
          return (
            <div key={k} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.ink,minHeight:28}}>
              <Icon name={k === "meet" ? "handshake" : "truck"} size={16} style={{color:C.terraTx,flexShrink:0}}/>
              <span style={{flex:1}}>{inLang(c, "name", getLang())}</span>
              <span style={{color:C.inkLt,whiteSpace:"nowrap"}}>
                {k === "meet" ? t("free_uae") :
                  uae || gcc ? <>{uae ? `${t("region_uae")} ${money(uae.fee)}` : ""}{uae && gcc ? " · " : ""}{gcc ? `${t("region_gcc")} ${money(gcc.fee)}` : ""}
                    {!(uae||gcc).confirmed ? ` (${t("est_short")})` : ""}</> : ""}
              </span>
            </div>
          );
        })}
      </div>
      {item.bundling && <div style={{fontSize:11,color:C.inkLt,marginTop:4}}>{t("bundle_note")}</div>}
      {onSeeTotal && (
        <button onClick={onSeeTotal} style={{marginTop:8,width:"100%",minHeight:44,borderRadius:22,cursor:"pointer",
          background:C.white,border:`1.5px solid ${C.terra}`,color:C.terraTx,fontWeight:700,fontSize:13,fontFamily:"inherit"}}>
          {t("delivery_options_total")}
        </button>
      )}
    </section>
  );
}

export function ItemModal({item,shop,items=[],onOpenItem,onSave,onClose,onOffer,setTab,onAddToCart,onReport,onFollow,following,onMessageSeller,onBought,onSignIn}) {
  const trap = useFocusTrap(onClose, {active: !!item});
  const sizeSys = useSizeSystem();
  const payOn = usePaymentsOn();
  const [buying, setBuying] = useState(false);
  if(!item) return null;
  const away = isAway(shop);
  const canBuy = payOn && !away && !item.reserved && (!item.status || item.status === "live");
  return (
    <div ref={trap} {...dialogProps(item.title || "Item details")}
      style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:200,background:"#000a",
      display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:C.cream,borderRadius:"20px 20px 0 0",maxHeight:"92vh",overflowY:"auto"}}>
        <ItemGallery item={item} onClose={onClose} onSave={onSave}/>

        <div style={{padding:"18px 16px 0"}}>
          {/* price + title */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
            <div style={{flex:1,paddingRight:10}}>
              <h2 style={{margin:"0 0 2px",fontSize:18,fontFamily:"Georgia,serif",color:C.ink,lineHeight:1.2}}>{item.title}</h2>
              <div style={{fontSize:12,color:C.inkLt}}>{item.titleAr}</div>
              {item.subtitle && <div style={{fontSize:12,color:C.inkLt,marginTop:2}}>{item.subtitle}</div>}
            </div>
            <div style={{textAlign:alignEnd()}}>
              <PriceTag item={item} size={20}/>
              {/* v2.8: this said "+ 8-10% LILI fee", charged to the BUYER on
                  top, while the sell flow said "lili takes 10%" off the
                  seller. Read together the two screens described a take rate
                  near 20% that nobody had decided and neither screen knew the
                  other was claiming.

                  One fee, one place, one direction: the seller pays a
                  commission, the buyer pays the price on the tag. */}
              <div style={{fontSize:11,color:C.inkLt,marginTop:1}}>the price she's asking</div>
            </div>
          </div>

          <PriceContext item={item}/>

          {/* tags */}
          <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
            {[["Brand",item.brand],["Condition",item.condition],["Size",item.size ? sizeLabel(item.size, sizeSys, { both: true }) : ""],["Era",item.era]].map(([l,v])=>(
              <div key={l} style={{background:C.sand,borderRadius:8,padding:"5px 10px"}}>
                <div style={{fontSize:11,color:C.inkLt,fontWeight:700,letterSpacing:0.5}}>{l.toUpperCase()}</div>
                <div style={{fontSize:11,color:C.ink,fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>
          {sizeSys !== "INTL" && kindOf(item.size) && (
            <div style={{fontSize:11,color:C.inkLt,margin:"-8px 0 14px"}}>
              Listed as {item.size}. {APPROXIMATE_NOTE}
            </div>
          )}

          <FitPanel item={item}/>

          {/* Holiday mode: say it before the buttons below go quiet. */}
          {away && (
            <div role="note" style={{background:C.sand,border:`1px solid ${C.border}`,borderRadius:12,
              padding:"10px 12px",marginBottom:14,fontSize:12,color:C.ink,lineHeight:1.5}}>
              <b>{t("away_until_name", { shop: shop.name, date: backOn(shop) })}</b>{shop.awayNote ? ` “${shop.awayNote}”` : ""}{" "}
              {t("away_reopen_note")}
            </div>
          )}

          {/* seller */}
          {/* v2.9.1: when the shop could not be resolved this block simply
              vanished, so a listing appeared with no seller at all — and every
              listing is required to say whether she is a private or a business
              seller, because it changes what the buyer is owed. Saying we
              cannot show her is the honest version of not showing her. */}
          {!shop && (
            <div style={{padding:"12px 0",borderTop:`1px solid ${C.border}`,
              borderBottom:`1px solid ${C.border}`,marginBottom:14,
              fontSize:12,color:C.inkLt,lineHeight:1.6}}>
              Seller details didn't load, so we can't say whether this is a
              private or a business sale — it changes your rights. Try again
              before you commit.
            </div>
          )}
          {shop && (
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 0",
              borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`,marginBottom:14}}>
              <Avatar shop={shop} size={42}/>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:C.ink}}>{shop.name}</div>
                <div style={{fontSize:11,color:C.inkLt}}>{shop.nameAr} · {shop.handle}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                  <Stars rating={shop.rating} reviews={shop.reviews} shop={shop}/>
                  {earnedFollowers(shop) !== null && <span style={{fontSize:11,color:C.inkLt}}>· {earnedFollowers(shop)} followers</span>}
                </div>
              </div>
              <button style={{background:"none",border:`1.5px solid ${C.terra}`,
                color:C.terraTx,borderRadius:20,padding:"5px 14px",
                fontSize:12,fontWeight:600,cursor:"pointer"}}
                onClick={e=>{e.stopPropagation(); onFollow && onFollow(shop.id);}}>
                {following ? t("following") : `${T.follow[0]} · ${T.follow[1]}`}</button>
            </div>
          )}

          {/* description */}
          <p style={{fontSize:13,color:C.inkLt,lineHeight:1.6,margin:"0 0 18px"}}>{item.desc}</p>

          {/* v2.11.3 — this row was three pills reading "Buyer Protection",
              "Secure Payment" and "Verified Seller", on the screen where a buyer
              decides, two lines above the SoldBy notice that says lili is not the
              merchant. They are the same three promises v2.9 removed from the
              splash ("Authentic & Verified", "Secure Payments", "Fast Delivery")
              and each is false in the same way: there is no protection scheme, no
              payment of any kind, and nothing in this app verifies a seller —
              `trust/authentication.js` refuses to issue a badge while no
              authenticator is registered, and this row was issuing one anyway.

              It is not replaced with three weaker true pills. Three reassurance
              chips in a row IS the reassurance, and manufacturing that feeling
              where the facts do not support it is what persuasion.js refuses.
              What a buyer needs here is the one thing that is true and that
              nothing else on this screen tells her. */}
          <DeliveryInfo item={item} onSeeTotal={item.reserved || away ? null : ()=>setBuying(true)}/>

          <div style={{fontSize:11,color:C.inkLt,lineHeight:1.6,marginBottom:18,
            paddingTop:12,borderTop:`1px solid ${C.border}`}}>
            {payOn
              ? "Pay with Buy and the money is held by Stripe until you confirm the piece arrived. Agree to pay any other way and lili can't help if it goes wrong."
              : t("no_payment_yet_note")}
          </div>

          <MoreFromShop item={item} shop={shop} items={items} onOpen={onOpenItem}/>
          <SimilarPieces item={item} items={items} onOpen={onOpenItem}/>

          {/* Play requires a reporting route on user-listed content. */}
          <button onClick={()=>onReport&&onReport({kind:"listing",id:item.id,
            title:item.title,shopId:item.shopId,shopName:shop&&shop.name})}
            style={{width:"100%",background:"none",border:"none",
              cursor:"pointer",fontSize:12,color:C.inkLt,padding:"6px 0 14px",
              textDecoration:"underline",textUnderlineOffset:3}}>
            {t("report_this_listing")}
          </button>
        </div>

        {/* actions — pinned to the bottom of the sheet, as on every resale app
            a buyer already knows, so the next step is never a scroll away.
            "Sold by … not by lili" rides in the same bar: it has to be read
            before the buttons, and now it can never be scrolled past them. */}
        <div style={{position:"sticky",bottom:0,zIndex:2,background:C.cream,
          borderTop:`1px solid ${C.border}`,boxShadow:"0 -6px 18px #0000000f",
          padding:"10px 16px calc(12px + env(safe-area-inset-bottom))",
          display:"flex",flexDirection:"column",gap:9}}>
          <SoldBy shopName={shop&&shop.name} sellerType={(shop&&shop.sellerType)||"private"} compact/>
          <div style={{display:"flex",gap:8,alignItems:"stretch"}}>
            <button onClick={()=>{onAddToCart(item); onClose();}} aria-label={t("add_to_cart")}
              className="tap-round" style={{flex:"0 0 48px",minHeight:48,borderRadius:24,
                background:C.white,border:`1.5px solid ${C.terra}`,color:C.terraTx,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center"}}>
              <Icon name="bag" size={22} stroke={1.6}/><span className="sr-only">{t("add_to_cart")}</span>
            </button>
            <button onClick={()=>!item.reserved && !away && onOffer(item)} disabled={!!item.reserved || away}
              aria-label={item.reserved ? "Reserved for another buyer — offers are closed"
                        : away ? `The seller is away until ${backOn(shop)} — offers reopen then` : undefined}
              style={{flex:1,background:C.white,color:C.terraTx,opacity:item.reserved||away?0.55:1,
              border:`1.5px solid ${C.terra}`,borderRadius:24,padding:"8px 0",
              fontWeight:700,cursor:"pointer",fontSize:13,lineHeight:1.25}}>
              {item.reserved
                ? <>Reserved<br/><span style={{fontSize:11,fontWeight:600}}>محجوزة</span></>
                : <>{T.makeOffer[0]}<br/><span style={{fontSize:11,fontWeight:600}}>{T.makeOffer[1]}</span></>}
            </button>
            {canBuy ? <>
              <button onClick={()=>{ onMessageSeller && onMessageSeller(item); onClose(); }}
                aria-label={T.messageSelller[0]} className="tap-round"
                style={{flex:"0 0 48px",minHeight:48,borderRadius:24,background:C.white,border:`1.5px solid ${C.terra}`,
                  color:C.terraTx,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Icon name="chat" size={20} stroke={1.6}/>
              </button>
              <button onClick={()=>setBuying(true)}
                style={{flex:1.2,background:C.btn,color:C.onBtn,border:"none",borderRadius:24,
                  padding:"8px 0",fontWeight:700,cursor:"pointer",fontSize:13,lineHeight:1.25}}>
                Buy<br/><span style={{fontSize:11,fontWeight:600}}>اشترِ</span>
              </button>
            </> : (
              <button onClick={()=>{ onMessageSeller && onMessageSeller(item); onClose(); }}
                style={{flex:1.2,background:C.btn,color:C.onBtn,border:"none",borderRadius:24,
                  padding:"8px 0",fontWeight:700,cursor:"pointer",fontSize:13,lineHeight:1.25}}>
                {T.messageSelller[0]}<br/><span style={{fontSize:11,fontWeight:600}}>{T.messageSelller[1]}</span>
              </button>
            )}
          </div>
        </div>
        {buying && (
          <Suspense fallback={null}>
            <CheckoutSheet items={[item]} shopName={shop && shop.name} onClose={()=>setBuying(false)}
              onDone={()=>{ onClose(); onBought && onBought(); }} onSignIn={onSignIn}
              onOffer={(it)=>onOffer(it)}/>
          </Suspense>
        )}
      </div>
    </div>
  );
}

// Her other pieces, under this one. A buyer who likes one piece from a
// wardrobe is the likeliest buyer of the next, and a single meet can cover
// several — the one place a meet-and-pay marketplace has a basket.
export function MoreFromShop({item, shop, items, onOpen}) {
  const more = (items||[]).filter(i=>i.shopId===item.shopId && i.id!==item.id
    && (!i.status || i.status==="live")).slice(0,8);
  if (!shop || more.length===0 || !onOpen) return null;
  return <PieceStrip label={t("more_from_shop", { shop: shop.name })} pieces={more} onOpen={onOpen}/>;
}

// Other sellers' pieces of the same kind (discovery/similar.js): somewhere to
// go when this one is the wrong size, price or seller. Ranked only on what the
// listings say; drawn only when something matches.
export function SimilarPieces({item, items, onOpen}) {
  const sizeSys = useSizeSystem();
  const [similar, setSimilar] = useState([]);
  useEffect(() => {
    let alive = true;
    import("../discovery/similar.js").then(({ similarPieces }) => {
      if (alive) setSimilar(similarPieces(item, items, 8));
    }).catch(() => {});
    return () => { alive = false; };
  }, [item && item.id, items && items.length]);
  if (!onOpen || similar.length === 0) return null;
  return <PieceStrip label={t("similar_pieces")} pieces={similar} onOpen={onOpen} sizeSys={sizeSys}/>;
}

function PieceStrip({label, pieces, onOpen, sizeSys}) {
  return (
    <section aria-label={label} style={{margin:"4px 0 16px"}}>
      <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:8}}>{label}</div>
      <div style={{display:"flex",gap:10,overflowX:"auto",paddingBottom:4}}>
        {pieces.map(i=>(
          <button key={i.id} onClick={()=>onOpen(i)} aria-label={`${i.brand||""} ${i.title}, ${money(i.price)}`}
            style={{flex:"0 0 112px",background:"none",border:"none",padding:0,textAlign:"start",cursor:"pointer",fontFamily:"inherit"}}>
            <div className="lili-ratio-tile" style={{borderRadius:10}}><ItemPhoto item={i} size={30}/></div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.inkLt,textTransform:"uppercase",marginTop:6,
              whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{i.brand}</div>
            <PriceTag item={i} size={13}/>
            {sizeSys && i.size && i.size !== "OS" && (
              <div style={{fontSize:11,color:C.inkLt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {t("size_n", { size: sizeLabel(i.size, sizeSys) })}</div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// Every photo she uploaded, swiped like any gallery. The screen used to show
// the first photo under three dots that never moved — whatever the listing
// held — so a buyer had no way to see the other angles she was promised.
export function ItemGallery({item, onClose, onSave}) {
  const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
  const [index, setIndex] = useState(0);
  const onScroll = (e) => {
    const el = e.currentTarget;
    const i = Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth));
    if (i !== index) setIndex(i);
  };
  const roundBtn = {position:"absolute",top:14,zIndex:2,border:"none",borderRadius:"50%",
    width:40,height:40,cursor:"pointer",backdropFilter:"blur(4px)",
    display:"flex",alignItems:"center",justifyContent:"center"};
  return (
    <div className="lili-ratio-105" style={{overflow:"hidden",
      background:`linear-gradient(145deg,${item.color},${item.color}99)`}}>
      {photos.length > 1 ? (
        <div className="lili-fill" onScroll={onScroll} aria-label={`${photos.length} photos`}
          style={{display:"flex",overflowX:"auto",scrollSnapType:"x mandatory",scrollbarWidth:"none"}}>
          {photos.map((src, i) => (
            <img key={src + i} src={src} alt={`${item.title} — photo ${i + 1} of ${photos.length}`}
              loading={i === 0 ? "eager" : "lazy"}
              style={{flex:"0 0 100%",width:"100%",height:"100%",objectFit:"cover",scrollSnapAlign:"center"}}/>
          ))}
        </div>
      ) : (
        <ItemPhoto item={item} full/>
      )}
      <button className="tap-round" onClick={onClose} aria-label="Back"
        style={{...roundBtn,left:14,background:C.scrimCC,color:C.ink,fontSize:18}}>{backArrow()}</button>
      <button onClick={()=>onSave(item.id)} className="tap-round" aria-label="Save"
        style={{...roundBtn,right:14,background:item.saved?C.btn:C.scrimCC,
          color:item.saved?C.white:C.inkLt}}>
        <Icon name="heart" size={18} filled={!!item.saved}/>
      </button>
      {photos.length > 1 && (
        <div aria-hidden="true" style={{position:"absolute",bottom:12,left:"50%",transform:"translateX(-50%)",
          display:"flex",gap:5,padding:"4px 8px",borderRadius:10,background:"#0003"}}>
          {photos.map((_, i) => <div key={i} style={{width:6,height:6,borderRadius:"50%",
            background:i===index?C.white:"#fff8"}}/>)}
        </div>
      )}
    </div>
  );
}
