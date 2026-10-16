// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState, useEffect, useRef, lazy } from "react";
import { useCompliance, SELLER_TYPES } from "../compliance";
import { sellerClausesFor } from "../compliance/agreements.js";
import * as repo from "../data/repo.js";
import DeliverySettings from "../delivery/DeliverySettings.jsx";
import { DEFAULT_DELIVERY, deliveryWays } from "../delivery/carriers.js";
import { FitAndFlaws } from "../listing/FitAndFlaws.jsx";
import { processImage, validateFile, LIMITS } from "../data/images.js";
import { parsePrice } from "../ux/input.js";
import { withTimeout, BUDGET } from "../ux/timeout.js";
import Icon from "../icons/Icon.jsx";
import * as offers from "../data/offers.js";
import * as fees from "../data/fees.js";
import { canonicalBrand } from "../discovery/text.js";
import * as funnel from "../analytics/funnel.js";
import { HOW_MONEY_WORKS } from "../compliance/sellerRules.js";
import { t, getLang } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { alignStart } from "../i18n/direction.js";
import { C, Lili, CONDITIONS, SIZES, ITEM_CATS, ICON_FOR_CAT, APPROVED_BRANDS, BRANDS, ERAS, TopBar } from "../market/shared.jsx";
import { PayoutBox } from "../market/OfferModal.jsx";
import { sizeLabel } from "../sizes/sizeSystem.js";
import { useSizeSystem, SizeSystemPicker } from "../sizes/SizeSystemPicker.jsx";
import { localError } from "../i18n/errors.js";
const Settings = lazy(() => import("../settings/Settings.jsx"));
const BulkList = lazy(() => import("../sell/BulkList.jsx"));
const PhotoCoach = lazy(() => import("../sell/PhotoCoach.jsx"));
const ListingQuality = lazy(() => import("../sell/ListingQuality.jsx"));
const ListingScreen = lazy(() => import("../compliance/ListingScreen.jsx"));
const AgreementSheet = lazy(() => import("../compliance/AgreementSheet.jsx"));


// ── sell / quick list ──────────────────────────────────────────────────────
/**
 * Enter an invitation, here, where she is standing.
 *
 * The invite-only screen used to end with "Close the app and reopen it — the
 * invitation is entered on the first screen." A woman holding a valid code was
 * told to force-quit the only place she could use it. The redemption call was
 * already in the compliance context and already server-decided; nothing was
 * missing except a box.
 *
 * The database is still the control — `lili_redeem_invite` decides, the row
 * policies refuse a listing from a non-member whatever this component believes.
 */
export function InviteBox() {
  const { redeemInvite } = useCompliance();
  const [code,setCode] = useState("");
  const [state,setState] = useState("idle");   // idle | trying | bad | offline
  const [reason,setReason] = useState("");

  // These are the strings lili_redeem_invite actually returns. The first
  // version of this map invented three of them — `used`, `expired`,
  // `needs_account` — none of which the function has ever produced, so every
  // refusal fell through to "We don't recognise that code", including the one
  // that means "you are signed in anonymously and need a real account".
  const REASON = {
    already_used:       "inv_already_used",
    unknown:            "inv_unknown",
    empty:              "inv_empty",
    sign_in_required:   "inv_sign_in_required",
    needs_real_account: "inv_needs_real_account",
    too_many_tries:     "inv_too_many_tries",
    offline:            "inv_offline",
  };

  const go = async () => {
    const c = code.trim();
    if (!c || state==="trying") return;
    setState("trying");
    const res = await withTimeout(redeemInvite(c), BUDGET.interactive)
      .catch(() => ({ ok:false, reason:"offline" }));
    if (res && res.ok) return;                 // canSell flips; this screen unmounts
    setReason((res && res.reason) || "unknown");
    setState("bad");
  };

  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:14,
      padding:"14px 16px"}}>
      <div style={{fontSize:13,color:C.ink,fontWeight:600,marginBottom:8}}>
        {t("have_a_code")}
      </div>
      <div style={{display:"flex",gap:8}}>
        <input value={code} onChange={e=>{setCode(e.target.value);setState("idle");}}
          onKeyDown={e=>{if(e.key==="Enter")go();}}
          placeholder={t("invitation_code")} aria-label={t("invitation_code")}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          style={{flex:1,minWidth:0,padding:"10px 12px",borderRadius:10,fontSize:13,
            border:`1px solid ${state==="bad"?C.red:C.border}`,outline:"none",
            background:C.cream,color:C.ink,fontFamily:"inherit"}}/>
        <button onClick={go} disabled={!code.trim()||state==="trying"} className="tap-target"
          style={{background:code.trim()?C.btn:C.sand,color:code.trim()?C.onBtn:C.inkLt,
            border:"none",borderRadius:10,padding:"0 16px",fontWeight:700,fontSize:13,
            cursor:code.trim()?"pointer":"default",flexShrink:0,fontFamily:"inherit"}}>
          {state==="trying"?t("checking"):t("enter")}
        </button>
      </div>
      {state==="bad" && (
        <div role="alert" style={{fontSize:12,color:C.redTx,marginTop:8,lineHeight:1.55}}>
          {t(REASON[reason]||REASON.unknown)}
        </div>
      )}
    </div>
  );
}

export function SellPage({myShop,onCreateShop,onAddItem,setTab,onListed}) {
  const { m: market, canSell } = useCompliance();
  useSizeSystem();
  const [screen,setScreen] = useState({verdict:"ok",findings:[]});
  const [mode,setMode] = useState("choose");
  const [photos,setPhotos] = useState([]);
  const [thumbs,setThumbs] = useState([]);
  const [step,setStep] = useState(1);
  const [auth,setAuth] = useState(null);   // v2.8: the authentication tier she actually chose
  const [publishing,setPublishing] = useState(false);
  const [publishError,setPublishError] = useState(null);
  const [stepError,setStepError] = useState(null);
  const [form,setForm] = useState({title:"",titleAr:"",category:"Dresses",size:"S",condition:"Like New",era:"Modern",brand:"",price:"",desc:"",fit:null,measurements:{},flaws:null,delivery:DEFAULT_DELIVERY,parcelSize:"S",bundling:false});
  const [restored,setRestored] = useState(false);

  // must be before any early return
  const isGuided = mode==="guided";
  const totalSteps = isGuided?4:3;
  const inputRef = useRef();

  const [photoError,setPhotoError] = useState(null);
  const [photoFindings,setPhotoFindings] = useState([]);

  // Every photo is redrawn through a canvas before it is stored. That resizes
  // it AND discards EXIF — including the GPS coordinates a phone writes into
  // every picture. Without this, a seller photographing a bag at home publishes
  // her address to anyone who downloads the image.
  const handlePhotos = async e => {
    setPhotoError(null);
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const check = validateFile(f);
      if (!check.ok) { setPhotoError(check.problems[0].message); continue; }
      try {
        const raw = await new Promise((res,rej)=>{
          const r = new FileReader();
          r.onload = ev => res(ev.target.result);
          r.onerror = () => rej(new Error(t("couldnt_read_photo")));
          r.readAsDataURL(f);
        });
        // Make both sizes at capture time. The small one is what the feed
        // shows; generating it later would mean re-downloading the big one.
        const clean = await processImage(raw);
        const small = await processImage(raw, LIMITS.thumbDimension);
        setPhotos(p => [...p, clean.dataUrl].slice(0, LIMITS.maxPerListing));
        setThumbs(p => [...p, small.dataUrl].slice(0, LIMITS.maxPerListing));
        // What is actually wrong with THIS photograph, measured on the phone.
        // See data/imageQuality.js — PhotoCoach gave generic advice for two
        // releases without ever looking at a picture.
        const { assess } = await import("../data/imageQuality.js");
        const found = assess(clean.quality);
        setPhotoFindings(found);
        if (found.length) funnel.track(funnel.EVENTS.PHOTO_ADVICE, { code: found[0].code });
      } catch (err) {
        setPhotoError(err.message || t("couldnt_add_photo"));
      }
    }
    e.target.value = "";
  };

  // ── the unfinished listing ────────────────────────────────────────────────
  //
  // `form`, `photos` and `thumbs` were component state and nothing else. The
  // tab bar unmounts SellPage without a word, so tapping Home in the middle of
  // a listing destroyed the title, the description, the price and — worst —
  // the processed photographs, which cost her a re-shoot or a re-import.
  //
  // Everything a seller types is now kept on her own device as she goes, and
  // offered back when she returns. Photographs are already stripped of EXIF by
  // the time they get here, so nothing that was not already stored is stored.
  useEffect(() => {
    if (restored) return;
    let alive = true;
    (async () => {
      try {
        const d = await repo.getDraft();
        if (!alive || !d) { setRestored(true); return; }
        const empty = !d.form || (!d.form.title && !d.form.price && !(d.photos||[]).length);
        if (empty) { setRestored(true); return; }
        setForm({ ...d.form });
        setPhotos(d.photos || []); setThumbs(d.thumbs || []);
        setMode(d.mode || "quick"); setStep(d.step || 1);
        setStepError({ message: t("picked_up_where_left"), skippable: false });
      } catch { /* a lost draft is a small loss; never a broken screen */ }
      if (alive) setRestored(true);
    })();
    return () => { alive = false; };
  }, [restored]);

  // Debounced. Written straight through, this fired on every keystroke of the
  // title and the description, and each write serialised the photographs with
  // it — a megabyte or two of base64 re-encoded and re-stored per character
  // typed, on a mid-range Android. A second of quiet is the right trade: the
  // only thing at risk in that second is the last word she typed.
  useEffect(() => {
    if (!restored || mode === "choose") return;
    const t = setTimeout(() => {
      repo.saveDraft({ form, photos, thumbs, mode, step }).catch(() => {});
    }, 1000);
    return () => clearTimeout(t);
  }, [restored, form, photos, thumbs, mode, step]);

  /**
   * What each step needs before it is worth moving on.
   *
   * Returns null when the step is fine, otherwise a message and whether she may
   * override it. Nothing here blocks her outright: the only hard stop in the
   * flow is a prohibited listing, which is a rule, not a nudge.
   */
  const stepProblem = () => {
    if (step === 1 && !photos.length)
      return { at: 1, message: t("step_no_photo") };
    if (step === 2 && !form.title.trim())
      return { at: 2, message: t("step_no_title") };
    if (step === 2 && !form.brand)
      return { at: 2, message: t("step_no_brand") };
    if (step === 3 && parsePrice(form.price) === null)
      return { at: 3, message: t("step_no_price") };
    return null;
  };

  /**
   * Say what is missing. Refuse nothing.
   *
   * `Next` used to be `setStep(s => s + 1)` with no conditions, so a seller
   * could walk to the last screen with no photograph, no title and no price,
   * and the only thing that told her was a publish button that quietly did
   * nothing. The fix is not to bar the door — she may reasonably want to set a
   * price before she has settled on a title — it is to say what is missing at
   * the moment it is missing, and again, specifically, at the end.
   *
   * The one exception is the photograph, and only for a single tap. It is the
   * largest single determinant of whether a piece sells, it is the easiest
   * thing to forget on the screen that asks for it, and the way back is one
   * more tap on the same button. Everything else warns and lets her past in
   * the same tap.
   */
  const next = () => {
    const problem = stepProblem();
    const holdOnce = problem && problem.at === 1 && !(stepError && stepError.at === 1);
    setStepError(problem ? { ...problem, skippable: holdOnce } : null);
    if (problem) funnel.track(funnel.EVENTS.SELL_BLOCKED, { step, mode, held: !!holdOnce });
    if (holdOnce) return;
    funnel.sellStep(step + 1, mode);
    setStep(s => s + 1);
  };

  /** What still stands between this listing and being published. */
  const missing = [
    !form.title.trim() && { label: t("a_title"), step: 2 },
    parsePrice(form.price) === null && { label: t("a_price"), step: 3 },
  ].filter(Boolean);

  // v2.8: publishing is awaited, and the form is only cleared once the listing
  // actually exists.
  //
  // This used to call the async onAddItem without awaiting it, then reset the
  // form and navigate to the shop in the same tick. So a rejected publish was
  // doubly invisible: the error had nowhere to surface, and the seller was
  // already looking at a screen that implied success. `publishing` also closes
  // a second hole — two taps on List previously created two listings.
  const submit = async () => {
    if(!form.title||parsePrice(form.price)===null||publishing) return;
    setPublishing(true); setPublishError(null);
    try {
      const created = await onAddItem({
        // her shop's id; the form is only reachable once a shop exists
        id:Date.now(),shopId:myShop && myShop.id,
        title:form.title,
        // v2.9.1: this was `form.titleAr || form.title`.
        //
        // Skip the Arabic field and the ENGLISH title was written into
        // `title_ar`. discovery/search.js weights titleAr at 6, the same as
        // title, so the bilingual index filled with duplicate English under an
        // Arabic field name — Arabic recall got worse as the catalogue grew,
        // and afterwards there is no way to tell a real Arabic title from a
        // copied English one. Empty means empty; listingQuality already scores
        // its absence, honestly, at weight 10.
        titleAr:(form.titleAr||"").trim()||null,
        subtitle:"",price:parsePrice(form.price) ?? 0,
        brand:canonicalBrand(form.brand, APPROVED_BRANDS)||"Other",category:form.category,
        condition:form.condition,era:form.era,size:form.size,
        // what a size label cannot say: how it runs, flat measurements, and
        // what she disclosed. Empty measurements are not sent as {}.
        fit:form.fit||null,
        measurements:Object.keys(form.measurements||{}).length ? form.measurements : null,
        flaws:Array.isArray(form.flaws) ? form.flaws : null,
        // how it reaches a buyer, and the parcel it travels in (migration 33)
        delivery:deliveryWays(form),
        parcelSize:form.parcelSize||"S", bundling:!!form.bundling,
        // v2.9: three fields here were inventions.
        //
        //   color:"#E8C4B8" — every listing published by every seller was the
        //     same pink, because nothing asks her. It fed a colour filter that
        //     has now been removed for the same reason.
        //   icon:"dress" — a Bottega pouch with no photograph drew a dress.
        //     Derived from her category instead.
        //   isNew:true — never cleared, so a piece was "Just arrived" forever,
        //     and the field is not a column so it vanished the moment the
        //     backend went live. New arrivals are derived from created_at now
        //     (discovery/ranking.js).
        icon:ICON_FOR_CAT[form.category]||"dress",
        // Her provenance answer reached the on-screen check and stopped there;
        // it was never sent. So the server re-screened the listing as if she
        // had no receipt, and could flag her price as a counterfeit signal
        // after telling her on the previous screen that it was fine.
        authenticated: auth==="own",
        // every photo, plus the small versions the feed will actually load
        photo:photos[0]||null, photos, thumb:thumbs[0]||null, thumbs,
        saved:false,desc:form.desc,offers:[],
      });
    } catch (err) {
      setPublishing(false);
      setPublishError(err && err.message
        ? err.message
        : t("listing_didnt_reach"));
      return;                        // form and photos are kept, so she can retry
    }
    // Handed up before the form is cleared, so the shop screen can show her
    // what she just made rather than dropping her into a grid.
    onListed && onListed({
      title: form.title, price: parsePrice(form.price), brand: form.brand,
      category: form.category, thumb: thumbs[0] || photos[0] || null,
      heldForReview: screen && screen.verdict === "review",
    });
    funnel.track(funnel.EVENTS.LISTING_LIVE, { mode, photos: photos.length });
    repo.clearDraft().catch(() => {});
    setPublishing(false);
    setMode("choose");setPhotos([]);setThumbs([]);setStep(1);setAuth(null);setStepError(null);
    setForm({title:"",titleAr:"",category:"Dresses",size:"S",condition:"Like New",era:"Modern",brand:"",price:"",desc:"",fit:null,measurements:{},flaws:null,delivery:DEFAULT_DELIVERY,parcelSize:"S",bundling:false});
    setTab("myshop");
  };

  // v2.8 — say it before she does the work, not after.
  //
  // During the private beta the database refuses a shop, a listing or a message
  // from anyone without an invite. That refusal is the real control and it
  // stays. But meeting it at the end — after six photographs, a description and
  // a price — is a cruel way to learn you were never able to publish. So the
  // interface tells her here, at the door.
  if(!canSell) return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.terraTx}}>{t("selling")}</span>}/>
      <div style={{padding:"28px 20px"}}>
        <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:22,color:C.ink,marginBottom:6}}>
          Invite only, for now
        </div>
        <div style={{fontSize:13,color:C.terraTx,marginBottom:18}}>بالدعوة فقط حالياً</div>
        <p style={{fontSize:13,color:C.inkLt,lineHeight:1.7,marginBottom:16}}>
          lili is opening in {market.name} with a small group of sellers first —
          few enough that we can look after every one of them properly, and
          answer the phone when something goes wrong.
        </p>
        <p style={{fontSize:13,color:C.inkLt,lineHeight:1.7,marginBottom:16}}>
          Browsing, saving and searching are open to you today. Opening a shop
          and listing a piece need an invitation.
        </p>
        {/* v2.9: this told her to force-quit the app. A woman holding a valid
            invitation was sent to close the only place she could use it, and
            the instruction is the sort a person reads twice and then abandons.
            The code is entered here now. */}
        <InviteBox/>
      </div>
    </div>
  );

  if(!myShop) return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.terraTx}}>{t("open_your_shop")}</span>}/>
      <div style={{padding:20}}><CreateShopForm onCreateShop={onCreateShop}/></div>
    </div>
  );

  if(mode==="bulk") return (
    <BulkList categories={ITEM_CATS} conditions={CONDITIONS} brands={BRANDS} sizes={SIZES}
      onPublish={onAddItem} onBack={()=>setMode("choose")} onDone={()=>{setMode("choose");setTab("myshop");}}/>
  );

  if(mode==="choose") return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<Lili size={24}/>}/>
      <div style={{padding:"24px 16px"}}>
        <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:22,color:C.ink,marginBottom:4}}>{t("list_an_item")}</div>
        <div style={{fontSize:13,color:C.inkLt,marginBottom:28}}>{t("how_would_you_like_to_list")}</div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <button onClick={()=>{setMode("quick");setStep(1);}} style={{background:C.btn,color:C.onBtn,
            border:"none",borderRadius:16,padding:"20px 18px",cursor:"pointer",textAlign:"left",
            display:"flex",alignItems:"center",gap:14,boxShadow:`0 3px 12px ${C.shadow}`}}>
            {/* An empty <span style={{fontSize:36}}/> sat here — a stripped
                emoji leaving a 36px hole where the other two rows have an
                icon. Same residue as the feed's old empty state. */}
            <Icon name="camera" size={34} style={{color:C.onBtn}}/>
            <div>
              <div style={{fontWeight:700,fontSize:16}}>{t("quick_list")}</div>
              {/* "3 taps ... under 60 seconds" was never true — the flow is
                  three screens plus a mode choice plus the fields. It says what
                  it is. */}
              <div style={{fontSize:12,opacity:0.85,marginTop:3}}>{t("quick_list_hint")}</div>
            </div>
          </button>
          <button onClick={()=>{setMode("guided");setStep(1);}} style={{background:C.white,color:C.ink,
            border:`1.5px solid ${C.border}`,borderRadius:16,padding:"20px 18px",cursor:"pointer",
            textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <Icon name="sparkle" size={34} style={{color:C.terraTx}}/>
            <div>
              <div style={{fontWeight:700,fontSize:16,color:C.ink}}>{t("guided_luxury_list")}</div>
              <div style={{fontSize:12,color:C.inkLt,marginTop:3}}>{t("guided_hint")}</div>
            </div>
          </button>
          {/* v2.9. The whole flow assumed one piece at a time — mode screen,
              three or four steps, shop screen, start again. A woman clearing
              her wardrobe has fifteen pieces photographed and gives up at four.
              This is the same publish path, batched. See sell/BulkList.jsx. */}
          <button onClick={()=>setMode("bulk")} style={{background:C.white,color:C.ink,
            border:`1.5px solid ${C.border}`,borderRadius:16,padding:"20px 18px",cursor:"pointer",
            textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <Icon name="shops" size={34} style={{color:C.terraTx}}/>
            <div>
              <div style={{fontWeight:700,fontSize:16,color:C.ink}}>{t("several_at_once")}</div>
              <div style={{fontSize:12,color:C.inkLt,marginTop:3}}>{t("bulk_hint")}</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{paddingBottom:72}}>
      {/* header */}
      <div style={{background:C.cream,padding:"12px 14px",borderBottom:`1px solid ${C.border}`,
        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={()=>setMode("choose")} style={{background:"none",border:"none",cursor:"pointer",color:C.terraTx,fontSize:13,fontWeight:600}}>{t("cancel")}</button>
        <span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:15,color:C.ink}}>
          {step===1?t("add_photos"):
           step===2?t("list_your_item"):
           step===3?t("set_your_price"):
           t("authentication")}
        </span>
        {/* v2.9: Next used to be `setStep(s=>s+1)` with no conditions.
            A seller could walk from photos to the last screen with no
            photograph, no title and no price, and the only thing that told her
            was a publish button that quietly did nothing — `submit` returns
            early when title or price is missing, with no message. She had no
            way to learn which of the four screens behind her was the problem.

            The gate is deliberately weaker than the publish rule: a photo is
            asked for, and skippable, because a piece with no picture is a
            listing nobody will buy but is not an invalid one; title and price
            are required, because publishing genuinely refuses without them. */}
        {step<totalSteps
          ? <button onClick={next} className="tap-target"
              style={{background:"none",border:"none",cursor:"pointer",color:C.terraTx,fontSize:13,fontWeight:700}}>{t("next")}</button>
          : <button onClick={submit} style={{background:"none",border:"none",cursor:"pointer",color:C.terraTx,fontSize:13,fontWeight:700}}>{t("list")}</button>}
      </div>
      {stepError && (
        <div role="alert" style={{background:"var(--c-alert-bg)",borderBottom:`1px solid ${C.red}`,
          padding:"10px 14px",fontSize:12,color:C.ink,lineHeight:1.5,
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <span>{stepError.message}</span>
          {stepError.skippable && (
            <button onClick={()=>{setStepError(null);setStep(s=>s+1);}}
              style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,
                color:C.terraTx,fontSize:12,fontWeight:700,fontFamily:"inherit",
                textDecoration:"underline"}}>
              {t("continue_anyway")}
            </button>
          )}
        </div>
      )}
      {/* progress — GOAL-GRADIENT EFFECT
          Effort rises as a goal comes into view, so the remaining distance is
          named rather than left to be inferred from four small bars. It reports
          real progress: no head start is invented, because a progress bar that
          lies is a dark pattern, not a nudge. */}
      <div style={{padding:"10px 14px 12px",background:C.cream}}>
        <div style={{display:"flex",gap:4}}>
          {Array.from({length:totalSteps},(_,i)=>(
            <div key={i} style={{flex:1,height:3,borderRadius:3,background:i<step?C.terra:C.border,transition:"background 0.3s"}}/>
          ))}
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:7}}>
          <span style={{fontSize:11,color:C.inkLt}}>{t("step_n_of_m", { n: step, m: totalSteps })}</span>
          <span style={{fontSize:11,color:step===totalSteps?C.terraTx:C.inkLt,
            fontWeight:step===totalSteps?700:400}}>
            {step===totalSteps ? t("last_step_live")
              : t("n_to_go", { n: totalSteps-step })}
          </span>
        </div>
      </div>

      <div style={{padding:"4px 14px 24px"}}>
        {/* Step 1: Photos */}
        {step===1 && (
          <>
            {/* v2.8: this said "up to 6" while LIMITS.maxPerListing was 8 and
                the counter below it said 8. The number now comes from the
                limit, so the sentence cannot drift away from the rule again. */}
            <p style={{fontSize:12,color:C.inkLt,marginBottom:14}}>
              {t("add_up_to_photos", { n: LIMITS.maxPerListing })}
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {photos.map((p,i)=>(
                <div key={i} className="lili-ratio-1" style={{borderRadius:10,overflow:"hidden",position:"relative"}}>
                  <img src={p} alt={i===0?t("cover_photo"):t("photo_n", { n: i+1 })} style={{objectFit:"cover"}}/>
                  <button onClick={()=>setPhotos(ph=>ph.filter((_,j)=>j!==i))} style={{
                    position:"absolute",top:4,right:4,background:C.btn,border:"none",
                    borderRadius:"50%",width:22,height:22,color:C.onBtn,cursor:"pointer",fontSize:12,
                    display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={14} stroke={2}/></button>
                  {i===0 && <div style={{position:"absolute",bottom:4,left:4,background:"#000a",
                    color:C.white,fontSize:11,padding:"2px 6px",borderRadius:8}}>{t("cover")}</div>}
                </div>
              ))}
              {photos.length<LIMITS.maxPerListing && (
                <label className="lili-ratio-1" style={{borderRadius:10,border:`2px dashed ${C.border}`,
                  background:C.white,cursor:"pointer"}}>
                  <input type="file" accept="image/*" multiple onChange={handlePhotos} style={{display:"none"}}/>
                  <span className="lili-fill" style={{display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:5}}>
                    <Icon name="plus" size={26}/>
                    <span style={{fontSize:11,color:C.terraTx,fontWeight:600}}>{t("add_photo")}</span>
                    <span style={{fontSize:11,color:C.inkLt}}>{t("photos_count", { n: photos.length, max: LIMITS.maxPerListing })}</span>
                  </span>
                </label>
              )}
            </div>
            {photoError && (
              <div style={{fontSize:12,color:C.red,marginTop:8,lineHeight:1.5}}>{localError(photoError)}</div>
            )}
            <div style={{fontSize:11,color:C.inkLt,marginTop:8,lineHeight:1.55}}>
              {t("location_removed")}
            </div>
            {/* v2.8: replaces a one-line "AI Tip" that appeared only in the
                guided flow — so the advice reached the sellers who already
                knew, and never the ones taking the 60-second route. It is also
                not an AI tip: no model is running here, and borrowing the
                authority of one for a list of six sensible instructions is the
                kind of small lie that makes the honest parts harder to
                believe. */}
            <PhotoCoach count={photos.length} findings={photoFindings}/>
          </>
        )}

        {/* Step 2: Details */}
        {step===2 && (
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* v2.8: brand and the Arabic title moved out of the guided flow
                and into both.

                Brand is not decoration — it is what the price band, and
                therefore the counterfeit screen, reads. Hiding the field on
                Quick List meant the faster and more popular route published
                with brand:"" and the price check silently never ran. A rule
                that cannot see the brand is not a rule.

                The Arabic title is the product's own differentiator: without
                one, a piece is invisible to every woman searching in Arabic.
                Two optional fields is a fair price for that; "quick" was
                always about steps, not about withholding the inputs that
                decide whether the listing works. */}
            {[[t("title"),"title",t("title_example")],
              [t("arabic_title"),"titleAr","مثل: شانيل كلاسيك فلاب"],
              [t("brand"),"brand",t("brand_example")],
            ].map(([lbl,key,ph])=>(
              <div key={key}>
                <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{lbl}</label>
                {/* The Arabic title field is FOR Arabic whatever the interface
                    language is. Without dir="rtl" what she types is
                    bidi-rendered inside a left-to-right box, so punctuation and
                    any Latin brand name jump to the wrong end — in the one
                    field the sell flow specifically asks her to fill in, and
                    tells her makes her piece findable. */}
                <input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={ph}
                  dir={key==="titleAr" ? "rtl" : undefined} aria-label={lbl}
                  {...(key==="brand" ? {
                    list:"lili-brands", autoComplete:"off",
                    // "hermes" becomes "Hermès" when she leaves the field, so
                    // one brand is one brand in search and in the price check
                    onBlur:e=>setForm(f=>({...f,brand:canonicalBrand(e.target.value, APPROVED_BRANDS)})),
                  } : {})}
                  style={{width:"100%",padding:"12px 12px",borderRadius:10,border:`1px solid ${C.border}`,
                    fontSize:14,outline:"none",color:C.ink,boxSizing:"border-box",
                    textAlign:key==="titleAr" ? "right" : alignStart()}}/>
              </div>
            ))}
            <datalist id="lili-brands">{APPROVED_BRANDS.map(b=><option key={b} value={b}/>)}</datalist>
            {/* She picks the size in the system she knows; the listing stores
                the one canonical size, so every buyer sees it in theirs. */}
            <SizeSystemPicker label={t("size_system_you_know")} compact/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[[t("category"),"category",ITEM_CATS],[t("size"),"size",SIZES],
                [t("condition"),"condition",CONDITIONS],[t("era"),"era",ERAS]].map(([lbl,key,opts])=>(
                <div key={key}>
                  <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{lbl}</label>
                  <select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}
                    style={{width:"100%",padding:"10px 10px",borderRadius:10,border:`1px solid ${C.border}`,
                      fontSize:13,outline:"none",background:C.white,color:C.ink}}>
                    {opts.map(o=><option key={o} value={o}>{key==="size" ? sizeLabel(o) : o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <FitAndFlaws form={form} setForm={setForm}/>
            <DeliverySettings form={form} setForm={setForm}/>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{t("description")}</label>
              <textarea value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}
                placeholder={t("describe_piece_placeholder")}
                rows={3} style={{width:"100%",padding:"12px 12px",borderRadius:10,border:`1px solid ${C.border}`,
                  fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}/>
            </div>
            <ListingQuality form={form} photos={photos}/>
          </div>
        )}

        {/* Step 3: Price */}
        {step===3 && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {photos[0] && (
              <div style={{display:"flex",gap:12,background:C.white,borderRadius:12,padding:12,border:`1px solid ${C.border}`}}>
                <img src={photos[0]} style={{width:60,height:60,borderRadius:8,objectFit:"cover"}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:13,color:C.ink}}>{form.title||t("your_item")}</div>
                  <div style={{fontSize:11,color:C.inkLt}}>{form.condition} · {t("size_n", { size: sizeLabel(form.size) })}</div>
                </div>
              </div>
            )}
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{t("price")}</label>
              <div style={{display:"flex",alignItems:"center",gap:8,background:C.white,
                border:`2px solid ${C.terra}`,borderRadius:12,padding:"12px 14px"}}>
                <span style={{fontWeight:700,color:C.inkLt,fontSize:15}}>AED</span>
                <input value={form.price} onChange={e=>setForm({...form,price:e.target.value})} inputMode="decimal" placeholder="0"
                  style={{flex:1,background:"none",border:"none",outline:"none",
                    fontSize:22,fontWeight:700,color:C.ink,fontFamily:"inherit"}}/>
              </div>
            </div>
            {/* v2.8 — the real fee, from data/fees.js.
                It was a flat 10% typed into the copy. Commission is tiered now,
                the way every luxury resale platform tiers it and for the same
                arithmetic reason: a flat rate barely clears card processing on
                a AED 260 abaya and drives a AED 40,000 seller elsewhere.
                It also says plainly that nothing is being deducted yet. */}
            <PayoutBox price={parsePrice(form.price)}/>
            {isGuided && (
              /* This was a switch drawn in divs: no handler, always on, and nothing
                 behind it to store. Every listing takes offers, so it says so. */
              <div style={{background:C.white,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:6}}>{t("offers")}</div>
                <div style={{fontSize:13,color:C.inkLt,lineHeight:1.5}}>{t("offers_always_on")}</div>
              </div>
            )}
            {/* Screening belongs on BOTH publishing paths. It was only wired
                into the guided flow, so Quick List — the faster and more
                popular route — published anything, including a listing that
                described itself as a replica. */}
            <ListingScreen title={form.title} description={form.desc} brand={form.brand}
              price={parsePrice(form.price) ?? 0} sellerType={(myShop&&myShop.sellerType)||"private"}
              category={form.category} condition={form.condition}
              hasAuthentication={false} onVerdict={setScreen}/>

            <ListingQuality form={form} photos={photos}/>

            {publishError && (
              <div role="alert" style={{background:"var(--c-alert-bg)",border:`1.5px solid ${C.red}`,
                borderRadius:12,padding:"12px 14px",fontSize:12,lineHeight:1.55,color:C.ink}}>
                <b style={{color:C.redTx}}>{t("not_published")}</b> {localError(publishError)}
              </div>
            )}
            {/* v2.9. `submit` returns early when the title or the price is
                missing, and said nothing when it did. The button looked
                greyed but was not disabled, so a seller tapped it, watched
                nothing happen, and had no way to learn which of the screens
                behind her was the problem. It says what it wants now, and the
                tap takes her to the field. */}
            {missing.length>0 && (
              <div style={{background:C.sand,border:`1px solid ${C.border}`,borderRadius:12,
                padding:"12px 14px",fontSize:12,color:C.ink,lineHeight:1.6}}>
                {t("still_needed")} {missing.map((mm,ix)=>(
                  <span key={mm.label}>
                    {ix>0 && ` ${t("and")} `}
                    <button onClick={()=>{setStepError(null);setStep(mm.step);}}
                      style={{background:"none",border:"none",padding:0,cursor:"pointer",
                        color:C.terraTx,fontWeight:700,fontSize:12,fontFamily:"inherit",
                        textDecoration:"underline"}}>{mm.label}</button>
                  </span>
                ))}.
              </div>
            )}
            <button onClick={submit} disabled={screen.verdict==="block"||publishing||missing.length>0}
              style={{background:(form.title&&form.price&&screen.verdict!=="block"&&!publishing)?C.btn:C.sand,
              color:(form.title&&form.price&&screen.verdict!=="block")?C.onBtn:C.inkLt,border:"none",borderRadius:30,
              padding:"16px 0",fontWeight:700,fontSize:15,
              cursor:screen.verdict==="block"?"default":"pointer"}}>
              {publishing ? t("publishing")
                : screen.verdict==="block" ? t("cant_be_listed")
                : screen.verdict==="review" ? t("submit_for_review")
                : t("list_your_item_2")}
            </button>
          </div>
        )}

        {/* Step 4 (Guided only): Authentication */}
        {step===4 && isGuided && (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* ── v2.8: two things were wrong on this screen ────────────────
                First, `hasAuthentication` was hard-coded true. It is the flag
                that switches OFF the price signal in screening — so choosing
                the guided flow and then tapping "Skip authentication for now",
                a button two rows below, published an unauthenticated listing
                with the counterfeit price check disabled. The safer-looking
                path was the weaker one. It now reflects what the seller
                actually selected.

                Second, the radios had no state at all: `name="auth"` and
                nothing reading them. Selecting a tier did nothing, and the
                screen promised a service — "AI scans your photos for
                authenticity signals" — that no code performs and no partner
                has been engaged to perform. Both paid tiers are now marked
                for what they are: not available yet. Saying "soon" costs
                nothing. Charging AED 150 for a verification nobody performs
                would end the business. */}
            <div style={{background:C.white,borderRadius:14,padding:18,border:`1px solid ${C.border}`}}>
              <div style={{fontWeight:700,fontSize:15,color:C.ink,marginBottom:4}}>{t("authentication_2")}</div>
              <div style={{fontSize:13,color:C.inkLt,lineHeight:1.6,marginBottom:14}}>
                {t("auth_not_live_a")} {t("auth_not_live_b")}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[["own",t("auth_own"),t("auth_own_hint"),t("free"),true],
                  ["expert",t("auth_expert"),t("auth_expert_hint"),t("not_yet_available"),false],
                  ["inperson",t("auth_inperson"),t("auth_inperson_hint"),t("not_yet_available"),false],
                ].map(([id,ttl,d,p,available])=>(
                  <label key={id} style={{background:C.sand,borderRadius:10,padding:"12px 14px",
                    display:"flex",alignItems:"center",gap:12,opacity:available?1:0.55,
                    cursor:available?"pointer":"default"}}>
                    <input type="radio" name="auth" value={id} checked={auth===id} disabled={!available}
                      onChange={()=>setAuth(id)} style={{accentColor:C.terra}}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,color:C.ink}}>{ttl}</div>
                      <div style={{fontSize:11,color:C.inkLt,marginTop:2}}>{d}</div>
                    </div>
                    <span style={{fontWeight:700,fontSize:12,color:C.terraTx}}>{p}</span>
                  </label>
                ))}
              </div>
            </div>
            {/* Screened live against this market's rules. A "block" verdict
                disables publishing entirely — a prohibited item must not be
                one accidental tap from going live. */}
            <ListingScreen title={form.title} description={form.desc} brand={form.brand}
              price={parsePrice(form.price) ?? 0} sellerType={(myShop&&myShop.sellerType)||"private"}
              category={form.category} condition={form.condition}
              hasAuthentication={auth==="own"} onVerdict={setScreen}/>

            <ListingQuality form={form} photos={photos}/>

            {publishError && (
              <div role="alert" style={{background:"var(--c-alert-bg)",border:`1.5px solid ${C.red}`,
                borderRadius:12,padding:"12px 14px",fontSize:12,lineHeight:1.55,color:C.ink}}>
                <b style={{color:C.redTx}}>{t("not_published")}</b> {localError(publishError)}
              </div>
            )}
            {/* v2.9. `submit` returns early when the title or the price is
                missing, and said nothing when it did. The button looked
                greyed but was not disabled, so a seller tapped it, watched
                nothing happen, and had no way to learn which of the screens
                behind her was the problem. It says what it wants now, and the
                tap takes her to the field. */}
            {missing.length>0 && (
              <div style={{background:C.sand,border:`1px solid ${C.border}`,borderRadius:12,
                padding:"12px 14px",fontSize:12,color:C.ink,lineHeight:1.6}}>
                {t("still_needed")} {missing.map((mm,ix)=>(
                  <span key={mm.label}>
                    {ix>0 && ` ${t("and")} `}
                    <button onClick={()=>{setStepError(null);setStep(mm.step);}}
                      style={{background:"none",border:"none",padding:0,cursor:"pointer",
                        color:C.terraTx,fontWeight:700,fontSize:12,fontFamily:"inherit",
                        textDecoration:"underline"}}>{mm.label}</button>
                  </span>
                ))}.
              </div>
            )}
            <button onClick={submit} disabled={screen.verdict==="block"||publishing||missing.length>0}
              style={{background:(screen.verdict==="block"||publishing)?C.sand:C.terra,
                color:screen.verdict==="block"?C.inkLt:C.white,border:"none",
                borderRadius:30,padding:"16px 0",fontWeight:700,fontSize:15,
                cursor:screen.verdict==="block"?"default":"pointer"}}>
              {publishing ? t("publishing")
                : screen.verdict==="block" ? t("cant_be_listed")
                : screen.verdict==="review" ? t("submit_for_review")
                : t("list_with_what_came_with_it")}
            </button>
            {/* v2.9: this called the same `submit` as the button above it, so
                a seller who ticked "I have the receipt" and then tapped Skip
                still published the listing claiming provenance. It clears the
                claim now, which is what the word "skip" means. */}
            {screen.verdict!=="block" && (
              <button onClick={()=>{setAuth(null);submit();}} style={{background:"none",color:C.inkLt,border:"none",
                fontSize:13,cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}}>
                {t("skip_authentication_for_now")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CreateShopForm({onCreateShop}) {
  const [form,setForm] = useState({name:"",nameAr:"",bio:"",bioAr:"",banner:C.terra,sellerType:""});
  const [showAgreement,setShowAgreement] = useState(false);

  // The seller agreement is asked for HERE, not at signup — a buyer must
  // never be made to accept seller obligations they'll never take on.
  if (showAgreement) return (
    <AgreementSheet clauses={sellerClausesFor("listing")} surface="seller"
      title={t("before_first_piece")} subtitle={getLang() === "ar" ? undefined : "قبل أول قطعة"}
      intro={`${t("agreement_intro_a")} ${t("agreement_intro_b")}`}
      ctaLabel={t("agree_and_open_shop")}
      onBack={()=>setShowAgreement(false)}
      onAgree={acc=>onCreateShop({...form,sellerAgreement:acc})}/>
  );

  const BANNERS = [C.terra,"#7B6FA0","#4A7B6F",C.gold,"#B55A3A","#5C4A3A"];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* v2.10 — the two things a woman wants to know before she opens a shop
          are what it costs and how she gets the money. Neither was anywhere on
          this screen. Both were in the agreement sheet on the NEXT one, which
          is after she has chosen a seller type and typed a name: a stranger
          found out what she was signing up to only once she was most of the
          way in. Reads from the fee schedule and HOW_MONEY_WORKS, so it cannot
          drift from what she is later charged and told. */}
      <div style={{background:C.sand,border:`1px solid ${C.border}`,borderRadius:12,
        padding:"12px 14px",fontSize:12,color:C.ink,lineHeight:1.6}}>
        <div style={{fontWeight:700,marginBottom:4}}>{t("before_you_open_a_shop")}</div>
        {/* A worked example rather than a rate: "9%" means nothing until you
            see what lands in your hand. The figure comes from the same
            function the price step uses. */}
        <div style={{color:C.inkLt}}>
          {(() => { const l = fees.payoutLine(1000); return l ? (getLang() === "ar" ? l.ar : l.en) : ""; })()}
        </div>
        <div style={{color:C.inkLt,marginTop:5}}>{HOW_MONEY_WORKS.short}</div>
      </div>

      {/* Asked first, because it decides what the buyer is owed. Getting this
          wrong is the seller's exposure and ours. */}
      <div>
        <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,
          textTransform:"uppercase",display:"block",marginBottom:8}}>
          {t("how_are_you_selling")}
        </label>
        {Object.values(SELLER_TYPES).map(t=>(
          <button key={t.key} onClick={()=>setForm({...form,sellerType:t.key})} style={{
            width:"100%",textAlign:"start",display:"flex",gap:12,alignItems:"flex-start",
            padding:"12px 14px",marginBottom:8,borderRadius:12,cursor:"pointer",
            background:C.white,border:`1.5px solid ${form.sellerType===t.key?C.terra:C.border}`}}>
            <div style={{width:16,height:16,borderRadius:"50%",marginTop:2,flexShrink:0,
              border:`1.5px solid ${form.sellerType===t.key?C.terra:C.border}`,
              background:form.sellerType===t.key?C.terra:"transparent"}}/>
            <div>
              <div style={{fontSize:13,color:C.ink,fontWeight:form.sellerType===t.key?600:400}}>
                {/* Was "{t.label} · {t.labelAr}" — the same one-label-two-languages
                    shape v2.9.3 removed from 118 places, surviving here because the
                    listing flow needs an account and the measured walk never reaches
                    it. `t` is the seller type in this scope, not the translator. */}
                {getLang()==="ar" ? t.labelAr : t.label}
              </div>
              <div style={{fontSize:11,color:C.inkLt,marginTop:3,lineHeight:1.5}}>{t.note}</div>
            </div>
          </button>
        ))}
      </div>

      {/* The preview was a large empty colour block above an empty name —
          dead space at the top of the very first screen. It now appears only
          once there is something to preview. */}
      {form.name ? (
      <div style={{background:C.white,borderRadius:14,overflow:"hidden",border:`1px solid ${C.border}`,marginBottom:4}}>
        <div style={{background:form.banner,height:form.name?52:0,transition:"height .2s"}}/>
        <div style={{padding:"10px 14px"}}>
          <div style={{fontWeight:700,fontSize:15,color:C.ink}}>{form.name||t("your_shop_name")}</div>
          <div style={{fontSize:12,color:C.inkLt,marginTop:3}}>{form.bio||t("add_bio_later")}</div>
        </div>
      </div>
      ) : null}
      {[[t("shop_name"),"name",t("shop_name_example")]].map(([lbl,key,ph])=>(
        <div key={key}>
          <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{lbl}</label>
          <input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={ph}
            style={{width:"100%",padding:"12px 12px",borderRadius:10,border:`1px solid ${C.border}`,
              fontSize:13,outline:"none",color:C.ink,boxSizing:"border-box"}}/>
        </div>
      ))}
      <div style={{fontSize:12,color:C.inkLt,lineHeight:1.55,marginTop:-2}}>
        {t("shop_extras_later")}
      </div>
      {/* v2.10 — this was an ENABLED button whose onClick was guarded by the
          same condition that greyed it. With a seller type chosen and the name
          still empty it read "Continue", took the tap, and did nothing at all:
          no movement, no message, nothing to tell her which of the two things
          on the screen she had missed. It reads as a broken app.

          It is now genuinely disabled — out of the tab order, announced as
          disabled — and the label says which piece is missing rather than
          leaving her to guess between them. */}
      <button onClick={()=>setShowAgreement(true)}
        disabled={!(form.name.trim()&&form.sellerType)}
        aria-disabled={!(form.name.trim()&&form.sellerType)}
        style={{
        background:(form.name.trim()&&form.sellerType)?C.terra:C.sand,
        color:(form.name.trim()&&form.sellerType)?C.white:C.inkLt,
        border:"none",borderRadius:30,padding:"16px 0",fontWeight:700,fontSize:14,
        fontFamily:"inherit",
        cursor:(form.name.trim()&&form.sellerType)?"pointer":"default"}}>
        {!form.sellerType ? t("tell_us_how_selling")
          : !form.name.trim() ? t("give_shop_a_name")
          : t("continue")}
      </button>
    </div>
  );
}
