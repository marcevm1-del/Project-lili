import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useAndroidBack } from "./native";
// v2.9.1 — code splitting.
//
// There was none. No React.lazy, no Suspense, no manualChunks: 510 KB in one
// chunk plus 235 KB of Supabase fetched before the feed renders, for a shopper
// who may never sign in. The target is Android 6 WebViews on Dubai mobile data.
//
// The worst of it came through this one line. `./compliance` is a barrel, so
// importing `useCompliance` from it pulled in LegalCenter (555 lines), which
// statically imports ModerationQueue (318) and InviteRoster (234) — two
// moderator-only screens shipped to every shopper's handset, in the main chunk,
// before the first tile paints.
//
// The rule applied below: anything a person reaches by tapping is lazy;
// anything the first paint needs is not.
// `screenListing` was imported here and never called — the publish path runs
// it through the sell flow's own modules. One unused name in an import list
// kept listingRules.js and, behind it, the 23 kB resale-value model in the
// bundle of every woman who opens the app to look at dresses.
import { useCompliance, SoldBy, SELLER_TYPES } from "./compliance";
import { lazy, Suspense } from "react";

const Settings = lazy(() => import("./settings/Settings.jsx"));
const AuthScreen = lazy(() => import("./auth/AuthScreen.jsx"));
const HelpCentre = lazy(() => import("./HelpCentre.jsx"));
const BulkList = lazy(() => import("./sell/BulkList.jsx"));
const OffersPage = lazy(() => import("./offers/OffersPage.jsx"));
const NotificationsSheet = lazy(() => import("./notifications/NotificationsSheet.jsx"));
const MeetSafely = lazy(() => import("./messages/MeetSafely.jsx"));
const MeetPlan = lazy(() => import("./meet/MeetPlan.jsx"));
const LanguagePicker = lazy(() => import("./i18n/LanguagePicker.jsx"));
const ThemePicker = lazy(() => import("./theme/ThemePicker.jsx"));
const PhotoCoach = lazy(() => import("./sell/PhotoCoach.jsx"));
const ListingQuality = lazy(() => import("./sell/ListingQuality.jsx"));
const LegalCenter    = lazy(() => import("./compliance/LegalCenter.jsx"));

/**
 * One boundary per overlay, not one around the app.
 *
 * A single Suspense at the root would blank the entire screen while a sheet's
 * chunk downloads — on a slow connection that reads as a crash. Each surface
 * gets its own, so the feed behind it stays exactly where she left it.
 *
 * The fallback is deliberately almost nothing: these chunks are a few
 * kilobytes over a warm connection, and a spinner that flashes for 40ms is
 * worse than a beat of quiet.
 */
const ReportDialog   = lazy(() => import("./compliance/ReportDialog.jsx"));
const ListingScreen  = lazy(() => import("./compliance/ListingScreen.jsx"));
const AgreementSheet = lazy(() => import("./compliance/AgreementSheet.jsx"));
import { sellerClausesFor } from "./compliance/agreements.js";
import * as repo from "./data/repo.js";
import { C, PalmBg, Lili, LiliWordmark, T, SHOPS, ITEMS, CATS, categoryLabel, SIZES, ITEM_CATS, STORIES, Avatar, ItemPhoto, TopBar, SearchBar, withHeart, Placeholder, ItemTile } from "./market/shared.jsx";
import { FiltersPanel } from "./market/FiltersPanel.jsx";
import { ItemModal } from "./market/ItemModal.jsx";
import { OfferModal } from "./market/OfferModal.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { SellPage } from "./pages/SellPage.jsx";
import { MyShopPage, SellersPage, ShopViewPage } from "./pages/ShopPages.jsx";
import { MessagesPage } from "./pages/MessagesPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
import { CartPage } from "./pages/CartPage.jsx";
export { categoryLabel } from "./market/shared.jsx";
import PriceTag from "./listing/PriceTag.jsx";
import { FitAndFlaws, FitPanel, FITS } from "./listing/FitAndFlaws.jsx";
import { SaveSearchButton, SavedSearches } from "./discovery/SavedSearches.jsx";
import ShopReviews from "./trust/ShopReviews.jsx";
import * as store from "./compliance/store.js";
import { processImage, validateFile, LIMITS } from "./data/images.js";
// imageQuality.js measures blur, exposure and framing pixel by pixel. It is
// called from one async handler — the moment a photograph is chosen — so it is
// fetched then, not shipped to everyone who opens the app.
import { parsePrice } from "./ux/input.js";
import { withTimeout, BUDGET } from "./ux/timeout.js";
import * as remote from "./backend/remote.js";
import Icon from "./icons/Icon.jsx";
import TrustSignals from "./trust/TrustSignals.jsx";
import { useFocusTrap, dialogProps } from "./a11y/useFocusTrap.js";
import { useItemLoad, STATE } from "./loading/useItemLoad.js";
import { ItemSkeleton, MediaSkeleton, ItemError } from "./loading/Skeleton.jsx";
import * as convo from "./data/conversations.js";
import * as offers from "./data/offers.js";
// resaleValue.js is 23 kB of brand tiers and condition factors, and exactly one
// screen uses it — the offer sheet, which most people never open. Loaded when
// that sheet appears rather than on the first paint of the feed.
import * as fees from "./data/fees.js";
import { searchLocal, diagnose, suggestions } from "./discovery/search.js";
import { tokens, fuzzyIncludes, canonicalBrand } from "./discovery/text.js";
import { matchesFilters, activeCount, EMPTY_FILTERS } from "./discovery/filters.js";
import { applySort, availableSorts, isNewArrival, affinityOrder, tasteLabel,
         DEFAULT_SORT, TASTE_KEY } from "./discovery/ranking.js";
import * as funnel from "./analytics/funnel.js";
import { HOW_MONEY_WORKS } from "./compliance/sellerRules.js";
import { t, getLang } from "./i18n/t.js";
// A letter sized from the circle it sits in produced type sizes nothing else
// used — 13.6px from a 34px avatar. Snapped to the scale; the drift is under
// half a pixel and the monogram looks identical.
import { type as typeScale, space } from "./theme/scale.js";
import { marginStart, marginEnd, insetStart, insetEnd, alignStart, alignEnd,
         backArrow, chevron, money, isRTL, onDirChange, getDir } from "./i18n/direction.js";

// ── bottom tab bar (Jacob's Law: match Instagram + Depop + Noon conventions) ──
function TabBar({tab,setTab,myShop}) {
  const tabs = [
    { key:"home",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill={tab==="home"?C.terra:"none"} stroke={tab==="home"?C.terra:C.inkLt} strokeWidth="1.8"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
      label:t("tab_home") },
    { key:"search",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tab==="search"?C.terra:C.inkLt} strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>,
      label:t("tab_search") },
    { key: myShop ? "myshop" : "sell", icon: null, label:t("tab_sell"), plus:true },
    // The inbox, not Saved, earns the fourth tab. lili takes no payment, so a
    // sale happens in a conversation: the message, the offer, the meet plan.
    // Those sat two taps deep under Profile while a list of hearts had a tab.
    // Saved is a heart in the Home header now, and a row in Profile.
    { key:"messages",
      icon: <Icon name="chat" size={22} stroke={1.8} filled={tab==="messages"} style={{color:tab==="messages"?C.terra:C.inkLt}}/>,
      label:t("tab_inbox") },
    { key:"profile",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill={tab==="profile"?C.terra:"none"} stroke={tab==="profile"?C.terra:C.inkLt} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      label:t("tab_profile") },
  ];
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:100,
      background:C.white,borderTop:`1px solid ${C.border}`,
      display:"flex",height:62,boxSizing:"content-box"}} className="safe-bottom">
      {tabs.map(t=>(
        <button key={t.key} onClick={()=>setTab(t.key)} aria-label={t.label} style={{
          flex:1,display:"flex",flexDirection:"column",alignItems:"center",
          justifyContent:"center",gap:2,background:"none",border:"none",cursor:"pointer",
          color:tab===t.key?C.terraTx:C.inkLt,position:"relative"}}>
          {t.plus
            ? <div style={{width:48,height:48,borderRadius:"50%",background:C.terra,
                display:"flex",alignItems:"center",justifyContent:"center",
                marginBottom:-10,marginTop:-14,
                boxShadow:`0 4px 14px ${C.shadow}`}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>
              </div>
            : t.icon}
          {t.badge>0 && <div style={{position:"absolute",top:6,left:"50%",marginLeft:-20,
            background:C.btn,color:C.onBtn,fontSize:11,fontWeight:700,
            borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center",lineHeight:"14px"}}>{t.badge}</div>}
          {!t.plus && <span style={{fontSize:11,fontWeight:tab===t.key?700:400,color:tab===t.key?C.terraTx:C.inkLt}}>{t.label}</span>}
        </button>
      ))}
    </div>
  );
}

// ── stories bar ────────────────────────────────────────────────────────────
function StoriesBar({stories,shops,onStoryTap}) {
  // v2.9: STORIES is a hardcoded five-element constant pointing at seed shop
  // ids. On a real catalogue those shops do not exist, `shops.find` returned
  // undefined and the label fell back to the word "Shop" — a row of stories
  // belonging to nobody. Only stories whose shop is actually here are shown,
  // and with none the bar does not render at all.
  const live = (stories||[]).map(s=>({ s, shop: shops.find(sh=>sh.id===s.shopId) }))
                            .filter(x=>!!x.shop);
  if (!live.length) return null;
  return (
    <div style={{display:"flex",gap:10,padding:"10px 14px",overflowX:"auto",
      background:C.cream,borderBottom:`1px solid ${C.border}`}}>
      {live.map(({s,shop})=>{
        return (
          <div key={s.id} onClick={()=>onStoryTap(s,shop)}
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"pointer",flexShrink:0}}>
            <div style={{width:58,height:58,borderRadius:"50%",
              background:`linear-gradient(135deg,${C.terra},${C.gold})`,
              padding:2.5,boxSizing:"border-box"}}>
              <div style={{width:"100%",height:"100%",borderRadius:"50%",
                background:s.color,border:`2px solid ${C.white}`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>
                <Placeholder item={s} size={26}/>
              </div>
            </div>
            {/* Her shop's name, as she wrote it.
                This was `shop.name.split("'")[0]`, which cut a name at its
                apostrophe: "Leen's Closet" showed as "Leen" and "Haya's
                Collection" as "Haya" — a person's first name invented out of a
                shop's name, and not a name either woman chose. Meanwhile a name
                with no apostrophe hit the one-line clamp instead and rendered
                as "The Vintage …", so the two rules disagreed with each other
                as well as with her.
                Two lines, and an ellipsis only if it genuinely does not fit. */}
            <span style={{fontSize:11,color:C.ink,fontWeight:500,
              maxWidth:66,textAlign:"center",lineHeight:1.3,
              display:"-webkit-box",WebkitBoxOrient:"vertical",WebkitLineClamp:2,
              overflow:"hidden",overflowWrap:"anywhere"}}>
              {shop.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── story viewer ───────────────────────────────────────────────────────────
function StoryViewer({story,shop,onClose}) {
  const trap = useFocusTrap(onClose);
  const [progress,setProgress] = useState(0);
  useEffect(()=>{
    const start = Date.now();
    const tick = ()=>{
      const p = Math.min(100,(Date.now()-start)/story.duration*100);
      setProgress(p);
      if(p<100) requestAnimationFrame(tick);
      else onClose();
    };
    requestAnimationFrame(tick);
  },[]);
  return (
    <div ref={trap} {...dialogProps("Story")}
      style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:400,background:"#000",overflowY:"auto",display:"flex",flexDirection:"column"}}>
      {/* progress */}
      <div style={{padding:"12px 14px 0",background:"transparent"}}>
        <div style={{height:2.5,background:"#ffffff44",borderRadius:2}}>
          <div style={{height:"100%",background:C.white,borderRadius:2,width:`${progress}%`,transition:"width 0.1s linear"}}/>
        </div>
      </div>
      {/* header */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px"}}>
        {shop && <Avatar shop={shop} size={36}/>}
        <div style={{flex:1}}>
          <div style={{color:C.white,fontWeight:700,fontSize:13}}>{shop?.name}</div>
          <div style={{color:"#ffffff99",fontSize:11}}>{shop?.handle}</div>
        </div>
        <button onClick={onClose} aria-label="Close" className="tap-target" style={{background:"none",border:"none",cursor:"pointer",color:C.white,fontSize:22,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={14} stroke={2}/></button>
      </div>
      {/* content */}
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
        background:`linear-gradient(135deg,${story.color||C.terra},${story.color||C.terra}88)`,fontSize:100}}>
        <Placeholder item={story} size={64}/>
      </div>
      {/* caption */}
      <div style={{padding:"16px 20px 40px",background:"linear-gradient(transparent,#000a)"}}>
        <div style={{color:C.white,fontSize:15,fontWeight:500}}>{story.caption}</div>
        <div style={{color:"#ffffff88",fontSize:12,marginTop:4}}>{shop?.name}</div>
      </div>
    </div>
  );
}

// ── new in strip ───────────────────────────────────────────────────────────
function NewInStrip({items,onSave,setModal,onSeeAll}) {
  // v2.9. Two bugs met here and produced an empty row with a heading over it.
  //
  //   `isNew` was a client-set boolean, true on every publish, never cleared,
  //   so a piece listed in March was "Just arrived" in August. And it is not a
  //   column in lili_items and is not rebuilt in fromRow, so the day the
  //   backend went live every item came back with isNew === undefined and this
  //   strip rendered its heading, its "See all ←" and nothing else — for every
  //   user, on the home screen, from launch.
  //
  // Derived from created_at now, which the database writes and a seller cannot
  // (migration lili_items_server_owned_columns). And if there is nothing new,
  // there is no heading: an empty strip is worse than no strip.
  const newItems = items.filter(i=>isNewArrival(i));
  if (!newItems.length) return null;
  return (
    <div style={{padding:"14px 0 6px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px",marginBottom:10}}>
        <div>
          <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.ink}}>{T.newInTitle[0]}</div>
          {/* v2.11.1 — one language. This printed "وصل حديثاً · Just arrived"
              in a single line, and bidi reordering put the Arabic first, so an
              English reader met an Arabic phrase before her own subtitle. Same
              rule as the category chips and the theme picker: the app decided
              in v2.9.3 that a label speaks one language, and these three were
              the last places still hedging. */}
          <div style={{fontSize:11,color:C.inkLt}}>
            {getLang() === "ar" ? T.newInTitle[1] : "Just arrived"}
          </div>
        </div>
        {/* "See all ←" was a <span> with no onClick. It sorts the feed by
            newest and clears the filters, which is what it always looked like
            it would do. */}
        {/* The arrow used to be a literal "←" in the label. Harmless to read
            and quietly wrong twice: it points the wrong way in a left-to-right
            layout, and it is the same character the item modal's back button
            uses, so anything looking for "the ← button" found this one first.
            An icon says the same thing and belongs to one control only. */}
        <button onClick={onSeeAll} className="tap-target"
          style={{background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",
            fontSize:11,color:C.terraTx,fontWeight:600,display:"flex",alignItems:"center",gap:3}}>
          See all <Icon name="forward" size={11} stroke={2.4}/>
        </button>
      </div>
      <div style={{display:"flex",gap:10,overflowX:"auto",padding:"0 14px",paddingBottom:4}}>
        {newItems.map(item=>(
          <div key={item.id} onClick={()=>setModal(item)}
            style={{flexShrink:0,width:140,borderRadius:12,overflow:"hidden",
              background:C.white,border:`1px solid ${C.border}`,cursor:"pointer"}}>
            <div style={{position:"relative",height:160,overflow:"hidden"}}>
              <ItemPhoto item={item}/>
              <button className="tap-round" aria-label="Save" onClick={e=>{e.stopPropagation();onSave(item.id)}} style={{
                position:"absolute",top:7,right:7,width:26,height:26,borderRadius:"50%",
                background:item.saved?C.btn:C.scrimDD,border:"none",
                display:"flex",alignItems:"center",justifyContent:"center",
                cursor:"pointer",fontSize:12,color:item.saved?C.white:C.inkLt}}>
                <Icon name="heart" size={17} filled={!!item.saved}/>
              </button>
            </div>
            <div style={{padding:"8px 10px 10px"}}>
              {item.brand && <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.inkLt,
                textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.brand}</div>}
              <div dir="auto" style={{fontSize:12,fontWeight:600,color:C.ink,lineHeight:1.3,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{getLang()==="ar" && item.titleAr ? item.titleAr : item.title}</div>
              <div style={{marginTop:3}}><PriceTag item={item} size={13}/></div>
              <div style={{fontSize:11,color:C.inkLt,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {[item.size && item.size!=="OS" ? `Size ${item.size}` : null, item.condition].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Change what "For You" means, from where she sees its effect.
 *
 * The splash questionnaire is asked once, ten seconds into her first launch,
 * and a preference collected then and never editable is not a preference, it is
 * a trap. Settings is shop-configuration; this belongs next to the feed it
 * reorders.
 */
function TasteSheet({ taste, onSave, onClose }) {
  const trap = useFocusTrap(onClose);
  const OPTIONS = ["Luxury","Dresses","Bags","Abayas","Shoes","Vintage"];
  const [picked,setPicked] = useState((taste && taste.categories) || []);
  const [sizes,setSizes] = useState((taste && taste.sizes) || []);
  const toggle = (c) => setPicked(p => p.includes(c) ? p.filter(x=>x!==c) : [...p,c]);
  const toggleSize = (z) => setSizes(p => p.includes(z) ? p.filter(x=>x!==z) : [...p,z]);
  return (
    <div onClick={onClose} style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:420,
      background:"#000a",display:"flex",flexDirection:"column",justifyContent:"flex-end"}}>
      <div ref={trap} {...dialogProps("What you like")} onClick={e=>e.stopPropagation()}
        className="safe-sheet"
        style={{background:C.cream,borderRadius:"20px 20px 0 0",padding:"18px 16px 30px",
          fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
        <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:20,color:C.ink}}>What you like</div>
        <div style={{fontSize:11,color:C.terraTx,marginBottom:4}}>ما يعجبكِ</div>
        <p style={{fontSize:12,color:C.inkLt,lineHeight:1.6,margin:"8px 0 16px"}}>
          These move to the top of your feed. Nothing is hidden from you — the
          rest is still underneath, in the same order it would have been.
        </p>
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:18}}>
          {OPTIONS.map(c=>(
            <button key={c} onClick={()=>toggle(c)} className="tap-target"
              style={{background:picked.includes(c)?C.terra:C.white,
                color:picked.includes(c)?C.white:C.ink,
                border:`1.5px solid ${picked.includes(c)?C.terra:C.border}`,
                borderRadius:20,padding:"8px 16px",fontSize:13,cursor:"pointer",
                fontFamily:"inherit"}}>{c}</button>
          ))}
        </div>
        {/* The sizes she wears. Kept on this phone only, like the rest of her
            taste; used for the "My sizes" switch on the feed and in search. */}
        <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:8}}>Your sizes</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:18}}>
          {SIZES.filter(z=>z!=="OS").map(z=>(
            <button key={z} onClick={()=>toggleSize(z)} className="tap-target" aria-pressed={sizes.includes(z)}
              style={{background:sizes.includes(z)?C.terra:C.white,color:sizes.includes(z)?C.white:C.ink,
                border:`1.5px solid ${sizes.includes(z)?C.terra:C.border}`,borderRadius:10,
                padding:"7px 12px",fontSize:13,cursor:"pointer",fontFamily:"inherit",minWidth:44}}>{z}</button>
          ))}
        </div>
        <button onClick={()=>{onSave(picked,sizes);onClose();}}
          style={{width:"100%",background:C.btn,color:C.onBtn,border:"none",borderRadius:30,
            padding:"14px 0",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
          {picked.length || sizes.length ? t("save") : t("show_me_everything")}
        </button>
      </div>
    </div>
  );
}

// ── splash / personalised onboarding ──────────────────────────────────────
function SplashScreen({onDone}) {
  const [step,setStep] = useState(0);
  const styles_list = [
    {icon:"gem",label:"Luxury",labelAr:"فاخر"},
    {icon:"dress",label:"Dresses",labelAr:"فساتين"},
    {icon:"bag",label:"Bags",labelAr:"حقائب"},
    {icon:"abaya",label:"Abayas",labelAr:"عبايات"},
    {icon:"heel",label:"Shoes",labelAr:"أحذية"},
    {icon:"sparkle",label:"Vintage",labelAr:"فينتاج"},
  ];
  const [picked,setPicked] = useState([]);
  const toggle = s => setPicked(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);

  if(step===0) return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:500,background:C.peach,overflowY:"auto",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:32,textAlign:"center"}}>
      <PalmBg/>
      <div style={{position:"relative",zIndex:1}}>
        <Lili size={56}/>
        <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:14,color:C.inkLt,marginTop:6,marginBottom:32}}>{t("love_it_or_leave_it")}</div>
        <p style={{fontSize:20,fontWeight:700,color:C.ink,lineHeight:1.3,marginBottom:8}}>Second hand.<br/><span style={{color:C.terraTx,fontStyle:"italic"}}>First class.</span></p>
        <p style={{fontSize:13,color:C.inkLt,lineHeight:1.6,marginBottom:36}}>Luxury pieces. Loved again.<br/>By Dubai. For Dubai.<br/>{/* dir="rtl" — this is an RTL sentence inside an LTR paragraph, and a full
            stop is a direction-neutral character: it inherits the PARAGRAPH's
            direction, not the sentence's. So the tagline rendered with its
            final stop on the left, as ".قطع فاخرة … لدبي" — the punctuation at
            the beginning of the line. Marking the run as RTL puts it where the
            sentence ends. */}
        <span dir="rtl" style={{fontSize:11,display:"block"}}>قطع فاخرة. محبوبة مجدداً. من دبي. لدبي.</span></p>
        <button onClick={()=>setStep(1)} style={{background:C.btn,color:C.onBtn,border:"none",
          borderRadius:30,padding:"14px 48px",fontWeight:700,fontSize:15,cursor:"pointer",
          boxShadow:"0 4px 16px #C4856A44"}}>
          {t("shop_now")}
        </button>
        <div style={{marginTop:14}}>
          <button onClick={()=>onDone(null)} style={{background:"none",border:`1.5px solid ${C.border}`,
            color:C.inkLt,borderRadius:30,padding:"12px 36px",fontSize:13,cursor:"pointer"}}>
            {t("sell_your_pieces")}
          </button>
        </div>
        {/* v2.9. This row said "Authentic & Verified", "Secure Payments" and
            "Fast Delivery" — on the first screen of the app, before anything
            else. None of the three is true: nobody authenticates a piece, lili
            holds no money and there is no shipping at all. Three promises, on
            the screen with the most attention in the product.

            What replaced them is the same shape and is each enforced somewhere
            in this codebase: screening runs on every listing (lili.screen_listing),
            the catalogue is Dubai-only (markets.js), and every listing states
            whether she is a private seller or a business, because that changes
            what she owes you (compliance/intermediary.js). */}
        <div style={{display:"flex",gap:24,marginTop:32,justifyContent:"center"}}>
          {[["shield","Every listing screened"],["palm","Dubai only, for now"],["scales","You're told who you're buying from"]].map(([ic,lb])=>(
            <div key={lb} style={{textAlign:"center",maxWidth:92}}>
              <div style={{marginBottom:4,display:"flex",justifyContent:"center"}}><Icon name={ic} size={22} stroke={1.4}/></div>
              <div style={{fontSize:11,color:C.inkLt,lineHeight:1.35}}>{lb}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:500,background:C.cream,overflowY:"auto",
      display:"flex",flexDirection:"column",padding:24}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <Lili size={28}/>
        {/* This subtitle read "ما هو ستايلك؟ · Pick all that apply", and the two
            halves are not a translation pair: the Arabic is the heading above it,
            the English is the instruction. A reader of either language got half a
            sentence and half of something else. Stacked now, in the shape the
            splash above and the cards below already use — the line, then its
            Arabic — which is also why this screen's other labels pass. */}
        <p style={{fontSize:18,fontWeight:700,color:C.ink,marginTop:14,marginBottom:2}}>What's your style?</p>
        <p dir="rtl" style={{fontSize:13,color:C.inkLt,marginBottom:4}}>ما هو ستايلك؟</p>
        <p style={{fontSize:12,color:C.inkLt}}>{getLang()==="ar" ? "اختاري كل ما يعجبك" : "Pick all that apply"}</p>
      </div>
      {/* alignContent:"start" — the grid keeps `flex:1` so the Skip button
          stays at the bottom of the screen, but its ROWS were stretching to
          fill that space: each card grew to about 450px with the icon and the
          label stranded at the top of an empty box. Rows size to their content
          now; the grid still occupies the column. */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,
        flex:1,alignContent:"center"}}>
        {styles_list.map(s=>(
          <button key={s.label} onClick={()=>toggle(s.label)} style={{
            background:picked.includes(s.label)?C.terra:C.white,
            color:picked.includes(s.label)?C.white:C.ink,
            border:`1.5px solid ${picked.includes(s.label)?C.terra:C.border}`,
            borderRadius:16,padding:"20px 8px",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:8,
            transition:"all 0.2s"}}>
            <Placeholder item={s} size={30}/>
            <span style={{fontSize:12,fontWeight:600}}>{s.label}</span>
            <span style={{fontSize:11,color:C.inkLt}}>{s.labelAr}</span>
          </button>
        ))}
      </div>
      {/* v2.9: `picked` was never read. `onDone` took no arguments, so the
          button that says "Show My Feed" discarded the answer that would have
          made it one. It is handed up now, and the home header says plainly
          what it did with it. */}
      <button onClick={()=>onDone(picked)} style={{background:picked.length?C.terra:C.sand,
        color:picked.length?C.white:C.inkLt,border:"none",borderRadius:30,
        padding:"16px 0",fontWeight:700,fontSize:15,cursor:"pointer",marginTop:20}}>
        {picked.length ? t("show_my_feed") : t("skip")}
      </button>
      {picked.length>0 && (
        <div style={{fontSize:11,color:C.inkLt,textAlign:"center",marginTop:10,lineHeight:1.55}}>
          These move to the top of your feed. Nothing is hidden, and you can
          change it in Settings.
        </div>
      )}
    </div>
  );
}

// ── home page ──────────────────────────────────────────────────────────────
function HomePage({items,shops,onSave,setModal,filters,setFilters,stories,setActiveStory,cartCount,savedCount=0,onLoadMore,setTab,hydrated,onOpenNotifications,unreadCount=0,taste,personalise,onEditTaste}) {
  const [q,setQ] = useState("");
  const [showFilters,setShowFilters] = useState(false);
  const [loadingMore,setLoadingMore] = useState(false);
  const shopFor = useCallback((i)=>{
    const sh = shops.find(s=>s.id===i.shopId);
    return sh ? `${sh.name||""} ${sh.nameAr||""}` : "";
  },[shops]);

  // v2.9. This expression used to be the whole of ordering in the app.
  //
  //   · the search matched a raw substring of `title` and `brand` only, so
  //     "chanel bag" matched nothing and عباية matched nothing ever;
  //   · `filters.size` and `filters.sort` were not read at all;
  //   · and there was no sort anywhere — the grid was array order.
  //
  // Now: one shared matcher, one shared filter predicate, one sort, and taste
  // applied last and only with her consent.
  // Memoised because the fuzzy matcher tokenises every field of every listing,
  // and this ran on every render — every keystroke, and every unrelated state
  // change on the busiest screen in the app.
  const shown = useMemo(() => {
    const matched = q.trim() ? searchLocal(items,q,{shopFor,limit:200}) : items;
    const filtered = matched.filter(i=>matchesFilters(i,filters));
    const sorted = applySort(filtered, filters.sort, { relevance: !!q.trim() });
    return affinityOrder(sorted, taste, {
      enabled: !!personalise && !q.trim(), sort: filters.sort });
  }, [items,q,filters,taste,personalise,shopFor]);
  const tasteLine = tasteLabel(taste, { enabled: !!personalise });
  const narrowed = activeCount(filters);
  const showingSkeletons = !hydrated && shown.length===0;

  return (
    <div style={{paddingBottom:72}}>
      {/* header */}
      <div style={{background:C.cream,borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px 8px"}}>
          <LiliWordmark size={15}/>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <button className="tap-round" aria-label="Saved" onClick={()=>setTab("saved")}
              style={{background:"none",border:"none",cursor:"pointer",padding:2,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",color:C.ink}}>
              <Icon name="heart" size={22} stroke={1.8}/>
              {savedCount > 0 && <div style={{position:"absolute",top:-2,right:-4,background:C.btn,color:C.onBtn,
                fontSize:11,fontWeight:700,borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center",lineHeight:"14px"}}>{savedCount}</div>}
            </button>
            {/* v2.8: the bell opens something now, and the dot is earned.
                It used to be a button with no onClick and a red dot that was
                permanently lit — every user, forever, told they had something
                waiting, with nowhere to go and look. */}
            <button aria-label="Notifications" className="tap-target" onClick={onOpenNotifications}
              style={{background:"none",border:"none",cursor:"pointer",padding:2,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
              {unreadCount > 0 && (
                <div style={{position:"absolute",top:-2,right:-4,background:C.btn,color:C.onBtn,
                  fontSize:11,fontWeight:700,borderRadius:10,padding:"1px 5px",minWidth:16,
                  textAlign:"center",lineHeight:"14px"}}>{unreadCount > 9 ? "9+" : unreadCount}</div>
              )}
            </button>
            <button className="tap-round" aria-label="Shortlist" onClick={()=>setTab("cart")} style={{background:"none",border:"none",cursor:"pointer",padding:2,position:"relative"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              {cartCount > 0 && <div style={{position:"absolute",top:-2,right:-4,
                background:C.btn,color:C.onBtn,fontSize:11,fontWeight:700,
                borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center",lineHeight:"14px"}}>{cartCount}</div>}
            </button>
          </div>
        </div>
        <SearchBar value={q} onChange={setQ} onFilters={()=>setShowFilters(true)} filterCount={narrowed}/>
        {/* cat chips */}
        <div style={{display:"flex",gap:8,overflowX:"auto",padding:"0 14px 10px"}}>
          {/* "My sizes" leads the row: the filter clothing buyers apply in
              their heads before anything else. With no sizes saved it asks
              for them instead of filtering on nothing. */}
          {(()=>{
            const mine = (taste && taste.sizes) || [];
            const on = Array.isArray(filters.sizes) && filters.sizes.length > 0;
            return (
              <button aria-pressed={on}
                onClick={()=> mine.length
                  ? setFilters(f=>({...f, sizes: on ? [] : mine}))
                  : onEditTaste && onEditTaste()}
                style={{background:on?C.btn:C.white,color:on?C.onBtn:C.terraTx,
                  border:`1.5px solid ${on?C.btn:C.terra}`,borderRadius:20,padding:"5px 12px",
                  fontSize:12,fontWeight:700,flexShrink:0,cursor:"pointer",whiteSpace:"nowrap",minWidth:44}}>
                {mine.length ? `My sizes · ${mine.join(", ")}` : "Set my sizes"}
              </button>
            );
          })()}
          {CATS.map(c=>(
            <button key={c} onClick={()=>setFilters(f=>({...f,category:c}))} style={{
              background:(filters.category||"All")===c?C.btn:C.white,
              color:(filters.category||"All")===c?C.onBtn:C.ink,
              border:`1px solid ${(filters.category||"All")===c?C.btn:C.border}`,
              borderRadius:20,padding:"5px 12px",fontSize:12,minWidth:44,
              fontWeight:(filters.category||"All")===c?600:400,
              // flexShrink:0 — without it the strip compresses every chip to
              // fit the screen instead of scrolling, and `whiteSpace:nowrap`
              // then pushes the text straight out through the pill: "Dresses"
              // rendered as "Dresse" with the S sitting on the next chip's
              // border. The strip is `overflowX:auto`; it is meant to scroll.
              flexShrink:0,
              cursor:"pointer",whiteSpace:"nowrap"}}>
              {categoryLabel(c)}
            </button>
          ))}
        </div>
      </div>


      {/* v2.9. This said "For You · \u0644\u0643\u0650 / Curated to your style" over the same
          global, unsorted array every user saw. Underneath it, the splash
          screen asked "What's your style?", stored the answer in a `picked`
          array, and called an `onDone()` that takes no arguments — the taste
          she gave was discarded on the next line. The consent sheet asked
          permission for personalisation that no code path consumed.

          A taste questionnaire, a consent toggle and a "curated" label over an
          unsorted feed, in an app that deletes invented review counts on
          principle. The feature exists now, so the header may say so — and
          when it is off, or she never picked, it says what is actually true. */}
      {/* New In strip */}
      <NewInStrip items={items} onSave={onSave} setModal={setModal}
        onSeeAll={()=>{setQ("");setFilters({...EMPTY_FILTERS,sort:DEFAULT_SORT});}}/>
      {/* Shops come after the first pieces, not before them: a row of shop
          circles above the feed pushed the first garment half a screen down. */}
      <StoriesBar stories={stories} shops={shops} onStoryTap={(s,sh)=>setActiveStory({story:s,shop:sh})}/>
      <div style={{height:1,background:C.border,margin:"4px 14px 14px"}}/>

      {/* v2.11.1 — this heading sat ABOVE the New In strip while describing
          the grid BELOW it, so "Everything · 10 pieces, newest first" read
          as a section header with nothing under it and the carousel read as
          if it were the thing being counted. Moved to the content it is
          about. Nothing else changed. */}
      <div style={{padding:"14px 14px 6px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.ink}}>
            {tasteLine ? t("for_you_2") : t("everything")}
          </div>
          <div style={{fontSize:11,color:C.inkLt,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            {tasteLine
              ? `${tasteLine} first — everything else is still below`
              : `${items.length} ${items.length===1?"piece":"pieces"}, newest first`}
          </div>
        </div>
        {tasteLine && (
          <button onClick={onEditTaste} className="tap-target"
            style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,
              color:C.terraTx,fontSize:12,fontWeight:600,fontFamily:"inherit"}}>
            Change
          </button>
        )}
      </div>

      {/* main grid */}
      <div style={{padding:"0 10px",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
        {/* Placeholders only when the catalogue genuinely has not arrived —
            on a fresh install, or once repo.js is fetching from the server.
            When items are already in hand this renders nothing, because a
            skeleton shown over data we hold is a fake delay. */}
        {showingSkeletons
          ? Array.from({length:6},(_,i)=><ItemSkeleton key={`sk-${i}`}/>)
          : shown.map(item=>(
              <ItemTile key={item.id} item={item} onSave={onSave} onClick={()=>setModal(item)}/>
            ))}
      </div>
      {/* The feed comes 60 at a time. It used to stop at 60 with no way on,
          so every older piece simply vanished from browsing. */}
      {!showingSkeletons && shown.length>0 && onLoadMore && (
        <div style={{textAlign:"center",padding:"18px 0 6px"}}>
          <button onClick={async()=>{ if(loadingMore) return; setLoadingMore(true);
              try { await onLoadMore(); } finally { setLoadingMore(false); } }}
            disabled={loadingMore}
            style={{background:"none",border:`1.5px solid ${C.terra}`,color:C.terraTx,borderRadius:20,
              padding:"10px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              opacity:loadingMore?0.6:1}}>
            {loadingMore ? "Loading…" : "Show more pieces"}
          </button>
        </div>
      )}
      {/* v2.9: this used to render alongside the skeletons — six loading tiles
          and "Nothing found" on the screen at the same time on every cold
          start — and it could not tell an empty catalogue from filters set too
          tight. It says which, and offers the way out of the one that has one. */}
      {!showingSkeletons && shown.length===0 && (
        <div style={{textAlign:"center",padding:"52px 26px",color:C.inkLt}}>
          <Icon name={q.trim()?"search":"bag"} size={30} stroke={1.4}
                style={{color:C.terra,marginBottom:12,opacity:0.8}}/>
          {q.trim() ? (
            <>
              <div style={{fontSize:14,color:C.ink}}>No pieces match "{q}"</div>
              <div style={{fontSize:12,marginTop:6,lineHeight:1.6}}>Try a brand, a category, or the Arabic word.</div>
              <button onClick={()=>setQ("")} style={{marginTop:14,background:"none",
                border:`1.5px solid ${C.terra}`,color:C.terraTx,borderRadius:20,
                padding:"8px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                Clear the search
              </button>
            </>
          ) : narrowed>0 ? (
            <>
              <div style={{fontSize:14,color:C.ink}}>Nothing matches those filters</div>
              <div style={{fontSize:12,marginTop:6,lineHeight:1.6}}>
                {narrowed} {narrowed===1?"filter is":"filters are"} narrowing {items.length} {items.length===1?"piece":"pieces"} down to none.
              </div>
              <button onClick={()=>setFilters({...EMPTY_FILTERS})} style={{marginTop:14,background:C.btn,
                color:C.onBtn,border:"none",borderRadius:20,padding:"10px 20px",
                fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                {t("clear_filters")}
              </button>
            </>
          ) : (
            <>
              <div style={{fontSize:14,color:C.ink}}>{t("nothing_here_yet")}</div>
              <div style={{fontSize:12,marginTop:6,lineHeight:1.6,maxWidth:280,margin:"6px auto 0"}}>
                lili is opening with a small group of sellers in Dubai. The first
                pieces land here as they list them.
              </div>
              <button onClick={()=>setTab("sell")} style={{marginTop:14,background:"none",
                border:`1.5px solid ${C.terra}`,color:C.terraTx,borderRadius:20,
                padding:"8px 18px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                Sell something yourself
              </button>
            </>
          )}
        </div>
      )}

      {showFilters && <FiltersPanel filters={filters} setFilters={setFilters} onClose={()=>setShowFilters(false)} items={items}/>}
    </div>
  );
}

// ── categories page ────────────────────────────────────────────────────────
function CategoriesPage({setFilters,setTab,items,onSave,setModal}) {
  // v2.9. Twelve tiles were rendered unconditionally, and four of them —
  // Lifestyle, Pants, More and Skirts — are not values ITEM_CATS can produce,
  // so a seller could never list into them and they were guaranteed to land on
  // an empty feed. Tapping a category and finding nothing, four times out of
  // twelve, on the browse screen.
  //
  // The list is now the categories a seller can actually choose, each carrying
  // the number of pieces in it, and one that has none is shown as empty rather
  // than left to look like a door.
  const AR = {Luxury:"فاخر",Bags:"حقائب",Dresses:"فساتين",Shoes:"أحذية",
              Tops:"توبات",Bottoms:"بناطيل",Abayas:"عبايات",Accessories:"إكسسوارات"};
  const ICONS = {Luxury:"gem",Bags:"bag",Dresses:"dress",Shoes:"heel",
                 Tops:"top",Bottoms:"skirt",Abayas:"abaya",Accessories:"jewellery"};
  const cats = ITEM_CATS.map(name=>({
    name, ar:AR[name]||"", icon:ICONS[name]||"sparkle",
    count: items.filter(i=>i.category===name).length,
  }));
  return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<Lili size={24}/>}/>
      <div style={{padding:"16px 14px"}}>
        <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:20,color:C.ink,marginBottom:2}}>Categories</div>
        <div style={{fontSize:12,color:C.inkLt,marginBottom:16}}>{getLang()==="ar" ? "تسوقي حسب الفئة" : "Shop by your favourite categories"}</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {cats.map(cat=>(
            <button key={cat.name} disabled={cat.count===0}
              onClick={()=>{setFilters(f=>({...f,category:cat.name}));setTab("home");}}
              style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:16,
                padding:"18px 8px",cursor:cat.count?"pointer":"default",display:"flex",
                flexDirection:"column",alignItems:"center",gap:6,boxShadow:"0 1px 4px #0000000a",
                opacity:cat.count?1:0.5,transition:"transform 0.15s"}}
              onMouseEnter={e=>{if(cat.count)e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>e.currentTarget.style.transform=""}>
              <Icon name={cat.icon} size={30} stroke={1.4} style={{color:C.terraTx}}/>
              <span style={{fontSize:12,fontWeight:600,color:C.ink}}>{cat.name}</span>
              <span style={{fontSize:11,color:C.inkLt}}>{cat.ar}</span>
              {/* The count is the point: a category with nothing in it is a
                  door that opens onto an empty room, and this is cheaper than
                  letting her find that out by walking through it. */}
              <span style={{fontSize:11,color:C.inkLt}}>
                {cat.count===0 ? "none yet" : `${cat.count} ${cat.count===1?"piece":"pieces"}`}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── saved page ─────────────────────────────────────────────────────────────
function SavedPage({items,onSave,setModal}) {
  const [tab,setTab] = useState("all");
  const saved = items.filter(i=>i.saved);
  // v2.8: this filtered on `i.priceDrop`, which nothing ever set — a tab that
  // could only ever be empty, filtering for a thing the app did not record.
  // `previous_price` is written by the same trigger that sends the alert, and
  // is server-owned so a seller cannot invent a discount.
  const display = tab==="all" ? saved
    : saved.filter(i => (i.previous_price ?? i.previousPrice) > i.price);
  return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.terraTx}}>{t("saved")}</span>}
        right={<span style={{fontSize:12,color:C.inkLt}}>{saved.length}</span>}/>
      <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,background:C.cream}}>
        {[["all",t("all_items")],["drops",t("price_drops")]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,background:"none",border:"none",
            cursor:"pointer",padding:"12px 0",fontSize:13,
            color:tab===k?C.terraTx:C.inkLt,fontWeight:tab===k?700:400,
            borderBottom:tab===k?`2px solid ${C.terra}`:"2px solid transparent"}}>{l}</button>
        ))}
      </div>
      {display.length===0
        ? <div style={{textAlign:"center",padding:"80px 20px",color:C.inkLt}}>
            <div style={{marginBottom:14,display:"flex",justifyContent:"center",opacity:0.45}}><Icon name="heart" size={44} stroke={1.3}/></div>
            <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:16,color:C.terraTx}}>Nothing saved yet</div>
            <div style={{fontSize:12,marginTop:6}}>لم تحفظي أي قطعة بعد</div>
          </div>
        : <div style={{padding:"12px 10px",display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
            {display.map(item=><ItemTile key={item.id} item={item} onSave={onSave} onClick={()=>setModal(item)}/>)}
          </div>}
    </div>
  );
}

// ── root app ───────────────────────────────────────────────────────────────
export default function Marketplace() {
  const [showSplash,setShowSplash] = useState(true);
  const [tab,setTab] = useState("home");
  const [items,setItems] = useState(ITEMS);
  const [shops,setShops] = useState(SHOPS);
  const [hydrated,setHydrated] = useState(false);
  const [modal,setModalRaw] = useState(null);
  // Wrapped so "she opened a listing" is recorded once, at the one place a
  // listing opens, rather than at each of the six screens that can open one.
  const setModal = useCallback((item) => {
    if (item) funnel.track(funnel.EVENTS.ITEM_OPENED, { hasPhoto: !!(item.thumb||item.photo) });
    setModalRaw(item);
  }, []);
  const [offerModal,setOfferModal] = useState(null);
  const [viewShop,setViewShop] = useState(null);
  const [myShop,setMyShop] = useState(null);
  // v2.10 — the `messages` array that used to live here is gone. It was the
  // last of the v2.7 puppet show: threads in React state, one participant, a
  // seller who was never told. Conversations are database rows now, and
  // data/conversations.js owns both the server path and the device fallback,
  // so there is nothing left for the root component to hold.
  //
  // Which thread to open when the messages screen appears, and what to say if
  // opening one failed. Both are set by messageSellerAbout; a refusal — a
  // block, a beta gate — is shown rather than swallowed.
  const [justListed,setJustListed] = useState(null);
  const [openThreadId,setOpenThreadId] = useState(null);
  const [messageError,setMessageError] = useState(null);
  const [filters,setFilters] = useState({...EMPTY_FILTERS});
  // What she picked on the splash screen — kept, at last. See the note in
  // discovery/ranking.js: the questionnaire has existed since v2.5 and its
  // answer was discarded on the next line.
  const [taste,setTaste] = useState(null);
  const [tasteOpen,setTasteOpen] = useState(false);
  // Nothing in the tree re-rendered when the language changed: applyLanguage
  // wrote to the DOM and published nothing, there was no context, and
  // LanguagePicker's own onChange was never passed by this component. So the
  // picker was a control that could not control anything. `setDir` publishes
  // now, and this is what listens.
  const [, setDirTick] = useState(getDir());
  useEffect(() => onDirChange(setDirTick), []);
  const saveTaste = (picked, sizes) => {
    const cats = Array.isArray(picked) ? picked : [];
    // Sizes are kept when only the categories are being saved (the splash
    // asks for categories alone) — an answer is not erased by a question that
    // didn't ask for it.
    const sz = Array.isArray(sizes) ? sizes : ((taste && taste.sizes) || []);
    const value = (cats.length || sz.length)
      ? { categories: cats, sizes: sz, at: new Date().toISOString() } : null;
    setTaste(value);
    store.setJSON(TASTE_KEY, value);
    // a switched-on "My sizes" follows her new answer
    setFilters(f => (Array.isArray(f.sizes) && f.sizes.length ? { ...f, sizes: sz } : f));
  };
  const [activeStory,setActiveStory] = useState(null);
  const [cart, setCart] = useState([]);
  // v2.8 — saves are a set of item ids belonging to THIS person, not a flag on
  // the listing. See the note in repo.js: written onto the item, a save either
  // failed (you cannot update a listing you do not own) or, had it worked,
  // would have marked the piece saved for everybody.
  const [savedIds, setSavedIds] = useState([]);
  // Why this phone cannot write, if it cannot. Set when the backend has
  // answered, and shown to her rather than left in a console line nobody sees.
  const [writeBlock, setWriteBlock] = useState(null);

  // Load from storage once, then keep storage in step. Until this resolves
  // the seed catalogue is shown, so the feed is never blank on a cold start.
  useEffect(() => {
    (async () => {
      // v2.10.1 — connect FIRST, and do not make it conditional on having an
      // account. initBackend() was only ever called from activateBackend(),
      // which only runs once a session exists, so a woman with no account
      // never reached the server at all: the app showed her the six demo shops
      // and nothing anybody had actually listed. Browsing needs no account and
      // never did — the read policies on lili_items and lili_shops allow it.
      // Not awaited into the first paint; the refresh below picks it up.
      // Deliberately NOT awaited anywhere in this function. The first version
      // of this change awaited it before reading her saves, which put a
      // network round trip in front of hydration — the saved badge arrived
      // late and the functional suite caught it counting wrong. Connecting is
      // a background job; the catalogue refresh hangs off it.
      repo.initBackend()
        .catch(() => false)
        .then(() => repo.refreshCatalogue())
        .then((c) => { if (c) { setItems(c.items); setShops(c.shops); } })
        .then(() => setWriteBlock(repo.writeBlocked()))
        .catch(() => {});

      const d = await repo.bootstrap(ITEMS, SHOPS);
      setItems(d.items); setShops(d.shops);
      setMyShop(d.myShop); setCart(d.cart);
      // The set is seeded from the demo catalogue's own flags by bootstrap, so
      // there is exactly one source of truth and the first tap moves the count
      // in the direction she pressed.
      setSavedIds(await repo.getSaved().catch(() => []));
      setTaste(await store.getJSON(TASTE_KEY, null).catch(() => null));
      setHydrated(true);
    })();
  }, []);

  useEffect(() => { if (hydrated) repo.saveCart(cart); }, [cart, hydrated]);

  const [reporting, setReporting] = useState(null);
  // v2.8 — notifications. The count is asked of the server, never guessed; with
  // no backend it stays 0 and the dot simply does not appear, which is the
  // honest answer for a device-only build.
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [following, setFollowing] = useState([]);

  // Follow was a button that changed nothing. It now toggles, updates the
  // seller's follower count and survives a restart like everything else.
  useEffect(()=>{ repo.getFollowing().then(setFollowing); },[]);
  const isFollowing = id => following.includes(id);
  const toggleFollow = async (shopId) => {
    const next = await repo.toggleFollow(shopId);
    setFollowing(next);
    const delta = next.includes(shopId) ? 1 : -1;
    setShops(sh=>sh.map(x=>x.id===shopId?{...x,followers:Math.max(0,(x.followers||0)+delta)}:x));
    await repo.updateShop(shopId, {followers: Math.max(0,
      ((shops.find(x=>x.id===shopId)||{}).followers||0) + delta)});
  };
  const [legalOpen, setLegalOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authReason, setAuthReason] = useState(null);
  const askToSignIn = (why) => { setAuthReason(why); setAuthOpen(true); };
  const [pendingShop, setPendingShop] = useState(null);
  const [session, setSession] = useState(null);

  // Browsing needs no account. This only tracks whether one exists, so the
  // profile can say who you are and selling can ask you to sign in.
  // initBackend() only enters remote mode if it can obtain a session, and at
  // boot there usually isn't one. So signing in has to re-run it and pull the
  // shared catalogue down — otherwise the account works and the app stays
  // stubbornly local, which is exactly what it did before this.
  const activateBackend = useCallback(async () => {
    const live = await repo.initBackend();
    // A failure here means writes are not available — not that reads are not.
    // Returning early skipped the catalogue pull, so an install that could
    // read perfectly well still showed the demo shops.
    if (!live && !repo.canRead()) return false;
    const d = await repo.bootstrap(ITEMS, SHOPS);
    setItems(d.items); setShops(d.shops);
    setMyShop(d.myShop); setCart(d.cart);
    // v2.9.1 — and this line is the whole bug. The comment above says "pull the
    // shared catalogue down"; `bootstrap` reads device storage, so nothing was
    // ever pulled. `repo.getItems` and `repo.getShops` had no callers anywhere
    // in the app. See the note above refreshCatalogue in repo.js.
    repo.refreshCatalogue().then((c) => {
      if (c) { setItems(c.items); setShops(c.shops); }
    }).catch(() => {});
    // Her saves and follows are hers, and they live on the server now — so they
    // follow her to a new phone instead of staying on the old one.
    repo.getSaved().then(setSavedIds).catch(() => {});
    setWriteBlock(repo.writeBlocked());
    return live;
  }, []);

  // v2.8 — the live feed. `remote.watchItems` existed and had no callers, so a
  // piece listed by one woman never appeared for another until the app was
  // reopened. In a beta of thirty sellers all listing on the same evening, that
  // is the difference between a marketplace and a slideshow.
  useEffect(() => {
    let off = null, alive = true;
    // `setItems(fresh)` wholesale used to wipe a listing she had written offline
    // seconds earlier. mergeLive keeps anything still marked pending.
    // Each change is applied to what is already on screen (repo.watchItems);
    // her offline pieces are kept, exactly as mergeLive did.
    repo.watchItems((merged) => { if (alive && Array.isArray(merged)) setItems(merged); })
      .then((fn) => { if (alive) off = fn; else fn && fn(); })
      .catch(() => {});
    return () => { alive = false; if (off) off(); };
  }, [hydrated]);

  useEffect(()=>{
    let off;
    remote.getSession().then(s=>{ setSession(s); if (s) activateBackend(); }).catch(()=>{});
    remote.onAuthChange(s=>{
      setSession(s);
      if (s) activateBackend();          // signed in — go live
    }).then(fn=>{off=fn;}).catch(()=>{});
    return ()=>{ if(off) off(); };
  },[activateBackend]);
  const [helpOpen, setHelpOpen] = useState(false);
  const { blocked, consent } = useCompliance();

  // A blocked seller disappears everywhere — feed, search, shops. Hiding them
  // in one place only is the bug that makes a block button feel like a lie.
  const visibleItems = useMemo(
    // The feed is for pieces on sale. Her own held, sold or removed pieces are
    // loaded too (for My Shop) and must not appear in it.
    () => withHeart(items.filter(i => !blocked.includes(i.shopId)
                                   && (!i.status || i.status === "live")), savedIds),
    [items, blocked, savedIds]);
  const visibleShops = shops.filter(s => !blocked.includes(s.id));

  // ── Android hardware / gesture back button ────────────────────────────────
  // Return true if we consumed the press; false lets Android minimise the app.
  useAndroidBack(() => {
    if (helpOpen)           { setHelpOpen(false);    return true; }
    if (authOpen)           { setAuthOpen(false);    return true; }
    if (settingsOpen)       { setSettingsOpen(false);return true; }
    if (themeOpen)          { setThemeOpen(false);   return true; }
    if (langOpen)           { setLangOpen(false);    return true; }
    if (legalOpen)          { setLegalOpen(false);   return true; }
    if (notifOpen)          { setNotifOpen(false);    return true; }
    if (reporting)          { setReporting(null);    return true; }
    if (activeStory)        { setActiveStory(null);  return true; }
    if (offerModal)         { setOfferModal(null);   return true; }
    if (modal)              { setModal(null);        return true; }
    if (tab === "shopview") { setTab("sellers");     return true; }
    if (tab === "cart")     { setTab("home");        return true; }
    if (tab !== "home")     { setTab("home");        return true; }
    return false;
  }, [authOpen, settingsOpen, helpOpen, themeOpen, langOpen, legalOpen, reporting, activeStory, offerModal, modal, tab]);

  // Quantity was removed with the checkout in v2.9.4 — `i.qty` no longer
  // exists, so this was summing undefined and painting NaN on the tab badge.
  // One listing is one piece; the count is the number of pieces.
  const cartCount = cart.length;

  /**
   * Start talking to a seller about a piece.
   *
   * v2.10 — this is now the real thing.
   *
   * Until this release it pushed a thread onto local React state with a canned
   * opening line. The messages SCREEN was rewired to real database threads in
   * v2.8; this entry point, the one every "Ask about these" and "Message
   * seller" button goes through, was not. So the exchange looked identical to a
   * real one and the seller was never told anybody had written to her — the
   * same failure the puppet-show replies were removed for, moved one step
   * upstream.
   *
   * It now opens (or re-opens) the one thread per piece in the database and
   * sends the opening line through it. Three things it deliberately does not
   * do:
   *
   *   · invent a seller. Without an owner uid there is nobody to write to, so
   *     it falls through to conversations.js's device path, which marks the
   *     message undelivered and says so on screen rather than pretending.
   *   · swallow a refusal. A block on either side, or a beta gate she is not
   *     part of, surfaces as an error she can read.
   *   · send twice. Re-opening an existing thread does not add a second
   *     "is this still available?" on top of a conversation already underway.
   */
  const messageSellerAbout = useCallback(async (item) => {
    if (!item) return;
    const shop = shops.find((s) => String(s.id) === String(item.shopId));
    const sellerUid = item.owner_uid || item.ownerUid || (shop && shop.owner_uid);
    setMessageError(null);
    goTab("messages");
    try {
      const thread = await convo.openConversation({
        sellerUid, shopId: item.shopId, itemId: item.id,
      });
      const existing = await convo.getMessages(thread.id);
      if (!existing.length) await convo.sendMessage(thread.id, t("hi_is_this_still_available"));
      setOpenThreadId(thread.id);
    } catch (e) {
      // HELD_OFFLINE is not a failure to report as one — the message is saved
      // and the thread screen already says it has not been sent.
      if (e && e.code === "HELD_OFFLINE") return;
      setMessageError(e && e.message ? e.message : "Couldn't open that conversation.");
    }
  }, [shops]);

  const addToCart = (item) => setCart(c => {
    // One listing is one specific second-hand piece. "2 of that dress" was
    // never something anyone could buy, so adding it twice does nothing.
    if (c.find(ci => ci.id === item.id)) return c;
    return [...c, item];
  });
  const removeFromCart = (id) => setCart(c => c.filter(ci => ci.id !== id));
  const onSave = async id => {
    // Optimistic, then corrected by what the server actually holds. If the
    // write is refused the heart goes back rather than lying about it.
    const before = savedIds;
    setSavedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    try {
      const next = await repo.toggleSaved(id);
      setSavedIds(next);
      funnel.track(funnel.EVENTS.ITEM_SAVED, { on: next.includes(id) });
    }
    catch (e) { console.warn("save refused:", e && e.message); setSavedIds(before); }
  };
  const savedCount = savedIds.length;
  // Older pieces, a page at a time. Offered only when the server sent a full
  // page — a shorter one means there is nothing older to fetch.
  const [noMore,setNoMore] = useState(false);
  const canLoadMore = repo.canRead() && !noMore
    && items.filter(i=>i.created_at && !i.pending).length >= repo.PAGE_SIZE;
  const loadMore = async () => {
    try {
      const r = await repo.loadMoreItems();
      setItems(r.items); if (!r.more) setNoMore(true);
    } catch (e) { console.warn("could not load more:", e && e.message); }
  };
  // Tapping a tab while a settings screen is open changed the tab underneath
  // and left the overlay covering it — the app looked frozen. Navigation should
  // always win: choosing a destination closes whatever was on top of it.
  const goTab = (t) => {
    setHelpOpen(false); setThemeOpen(false); setLangOpen(false);
    setLegalOpen(false); setReporting(null); setActiveStory(null);
    setModal(null); setOfferModal(null);
    // The funnel is one line, here, because every screen change passes through
    // this function. Screens are enum-shaped strings and nothing else is sent.
    funnel.screen(t);
    if (t === "sell") funnel.track(funnel.EVENTS.SELL_STARTED, {});
    setTab(t);
  };

  const onCreateShop = async form=>{
    const s = await repo.createShop(form);
    funnel.track(funnel.EVENTS.SIGNUP_DONE, { sellerType: form.sellerType || "unknown" });
    setMyShop(s); setShops(sh=>[...sh,s]); setTab("myshop");
  };
  // Poll on a slow cadence and subscribe when the backend supports it. A badge
  // that lies about waiting work is worse than no badge — see the bell.
  useEffect(() => {
    let alive = true, off = null;
    const refresh = async () => {
      // Bounded: a background poll that never settles leaks a pending promise
      // every minute for as long as the app is open.
      try {
        const n = await withTimeout(remote.unreadCount(), BUDGET.background);
        if (alive) setUnread(n || 0);
      } catch { if (alive) setUnread(0); }
    };
    (async () => {
      if (!remote.isConfigured()) return;
      await refresh();
      try { off = await remote.watchNotifications(() => refresh()); } catch { /* no realtime */ }
    })();
    const t = setInterval(refresh, 60000);
    return () => { alive = false; clearInterval(t); if (off) off(); };
  }, []);

  const onAddItem = async item => {
    const saved = await repo.addItem(item);
    setItems(its => [saved, ...its]);
    return saved;
  };

  const onMarkSold = async (id, sold) => {
    const saved = await repo.markSold(id, sold);
    const status = (saved && saved.status) || (sold ? "sold" : "live");
    setItems(its => its.map(i => i.id === id ? { ...i, status } : i));
  };

  const onTakeDown = async (id) => {
    await repo.removeItem(id);
    setItems(its => its.filter(i => i.id !== id));
  };

  // Peak-end. The end of listing a piece was: the form vanishes, and she is
  // somewhere else. Nothing said it worked, nothing showed her what she made.
  // The end of an experience is disproportionately what is remembered of it,
  // and the end of the one flow this marketplace depends on was an absence.
  //
  // What goes here is only what is true: the piece, as a buyer will see it,
  // and its real state — live, or held for review, which the screening step
  // already decided and already explained.

  const effectiveTab = tab==="shopview"?"sellers":tab==="saved"?"home"
                     :tab==="offers"?"messages":tab==="cart"?"home":tab;

  if(showSplash) return <SplashScreen onDone={(picked)=>{
    if (Array.isArray(picked) && picked.length) {
      const value = { categories: picked, at: new Date().toISOString() };
      setTaste(value);
      store.setJSON(TASTE_KEY, value);
    }
    funnel.track(funnel.EVENTS.APP_OPEN, { taste: Array.isArray(picked)?picked.length:0 });
    setShowSplash(false);
  }}/>;

  return (
    <div className="full-height" style={{background:C.bg,position:"relative",
      maxWidth:430,margin:"0 auto",fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"}}>
      <PalmBg/>
      <div style={{position:"relative",zIndex:1}}>
        {/* v2.10.1 — said out loud, once, at the top.
            Until now this state was a console line: the app looked completely
            normal while nothing a woman did reached anybody. She could list a
            piece, save things, write a message, and none of it existed outside
            her own phone. An app that quietly does nothing is worse than one
            that says it cannot — she finds out days later, from silence.
            Browsing is live either way; this is only about writing. */}
        {writeBlock && tab === "home" && (
          <div style={{margin:"10px 12px 0",padding:"12px 12px",background:C.white,
            border:`1px solid ${C.border}`,borderRadius:12,fontSize:12,
            color:C.ink,lineHeight:1.55,display:"flex",gap:10,alignItems:"flex-start"}}>
            <Icon name="shield" size={16} stroke={1.6} style={{color:C.terraTx,flexShrink:0,marginTop:1}}/>
            <div style={{flex:1,minWidth:0}}>
              <b>{t("browsing_only_for_now")}</b>{" "}
              <span style={{color:C.inkLt}}>
                {writeBlock === "NO_BACKEND"
                  ? t("this_phone_is_not_connected")
                  : t("sign_in_to_list_or_message")}
              </span>
            </div>
            {writeBlock !== "NO_BACKEND" && (
              <button onClick={()=>askToSignIn(t("sign_in_to_list_or_message"))}
                style={{background:C.btn,color:C.onBtn,border:"none",borderRadius:20,
                  padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer",
                  fontFamily:"inherit",flexShrink:0}}>
                {t("sign_in")}
              </button>
            )}
          </div>
        )}
        <Suspense fallback={null}>
        {tab==="home"       && <HomePage hydrated={hydrated} items={visibleItems} shops={visibleShops} onSave={onSave} setModal={setModal} filters={filters} setFilters={setFilters} stories={STORIES} setActiveStory={setActiveStory} cartCount={cartCount} savedCount={savedCount} setTab={setTab}
                              onLoadMore={canLoadMore ? loadMore : null} onOpenNotifications={()=>setNotifOpen(true)} unreadCount={unread}
                              taste={taste} personalise={!!(consent && consent.personalisation)}
                              onEditTaste={()=>setTasteOpen(true)}/>}
        {tab==="search"     && <SearchPage items={visibleItems} shops={visibleShops} onSave={onSave} setModal={setModal} filters={filters} setFilters={setFilters} savedIds={savedIds}/>}
        {tab==="categories" && <CategoriesPage setFilters={setFilters} setTab={setTab} items={visibleItems} onSave={onSave} setModal={setModal}/>}
        {tab==="sellers"    && <SellersPage shops={visibleShops} items={visibleItems} setTab={setTab} setViewShop={setViewShop}
                              onFollow={toggleFollow} isFollowing={isFollowing}/>}
        {tab==="shopview"   && <ShopViewPage shop={viewShop} items={visibleItems} onSave={onSave} setModal={setModal} onBack={()=>setTab("sellers")}
                              onFollow={toggleFollow} following={viewShop?isFollowing(viewShop.id):false}
                        onReport={()=>setReporting({kind:"seller",id:viewShop&&viewShop.id,title:viewShop&&viewShop.name,shopId:viewShop&&viewShop.id,shopName:viewShop&&viewShop.name})}/>}
        {tab==="saved"      && <SavedPage items={visibleItems} onSave={onSave} setModal={setModal}/>}
        {tab==="sell"       && <SellPage myShop={myShop} onAddItem={onAddItem} setTab={setTab} onListed={setJustListed}
                             onCreateShop={form=>{
                               // A shop is a commitment to buyers and a payout
                               // destination, so it needs an account. Browsing
                               // never does.
                               if (repo.isRemote() || session) return onCreateShop(form);
                               setPendingShop(form);
                               askToSignIn("Opening a shop needs an account — it's how your buyers reach you and how you get paid.");
                             }}/>}
        {tab==="myshop"     && myShop && <MyShopPage shop={myShop} items={items} setTab={setTab}
                              justListed={justListed} onDismissListed={()=>setJustListed(null)}
                              onMarkSold={onMarkSold} onTakeDown={onTakeDown}/>}
        {tab==="profile"    && <ProfilePage myShop={myShop} items={visibleItems} setTab={setTab} onOpenLegal={()=>setLegalOpen(true)} onOpenLanguage={()=>setLangOpen(true)} onOpenTheme={()=>setThemeOpen(true)}
                        onOpenHelp={()=>setHelpOpen(true)}
                        onOpenSettings={()=>setSettingsOpen(true)}
                        onOpenAuth={()=>askToSignIn(null)} session={session}
                        onSignOut={async()=>{ await remote.signOut().catch(()=>{}); setSession(null); }}/>}
        {tab==="messages"   && <MessagesPage shops={shops} items={items} onReport={s=>setReporting(s)} onOpenOffers={()=>goTab("offers")}
                              openThreadId={openThreadId} onOpened={()=>setOpenThreadId(null)}
                              error={messageError}/>}
        {tab==="offers"     && <OffersPage items={items} shops={shops} onBack={()=>setTab("profile")}/>}
        {tab==="cart"       && <CartPage cart={cart} shops={visibleShops} removeFromCart={removeFromCart} setTab={goTab}
                              onMessageSeller={messageSellerAbout}/>}
        </Suspense>

        <TabBar tab={effectiveTab} setTab={goTab} myShop={myShop}/>

        {/* Every lazily-loaded overlay lives under this one boundary rather
            than one each. They are mutually exclusive — only one sheet is ever
            open — so a shared boundary suspends exactly the thing that is
            loading, and the feed behind it stays where she left it.

            The fallback is nothing on purpose: these chunks are a few kilobytes
            and a spinner that flashes for forty milliseconds reads worse than a
            beat of quiet. */}
        <Suspense fallback={null}>
        {modal && <ItemModal item={modal} shop={shops.find(s=>s.id===modal.shopId)} items={visibleItems} onOpenItem={setModal} onSave={onSave} onClose={()=>setModal(null)} onOffer={item=>{setOfferModal(item);setModal(null);}} setTab={setTab} onAddToCart={addToCart} onMessageSeller={messageSellerAbout}
          onReport={s=>{setReporting(s); setModal(null);}}
          onFollow={toggleFollow} following={modal&&isFollowing(modal.shopId)}/>}
        {offerModal && <OfferModal item={offerModal} shop={shops.find(s=>s.id===offerModal.shopId)} onClose={()=>setOfferModal(null)} onSubmit={()=>{
          /* v2.9.1: this used to be
               setItems(its => its.map(i => i.id === offerModal.id
                 ? {...i, offers:[...i.offers, {amount, status:"accepted"}]} : i))
             `offers` is a seed-only field. It is not in ROW_COLUMNS.lili_items
             and fromRow never rebuilds it, so on any listing that came from the
             server it is undefined and the spread throws a TypeError inside the
             state updater — the moment an offer actually succeeds.

             It was also a residue of the fake: it wrote status:"accepted" on
             the client, deciding the seller's answer for her. Nothing reads the
             field. Real offers live in lili_offers and are shown by
             offers/OffersPage.jsx, which is where this now sends her. */
          setTab("offers");
        }}/>}
        {activeStory && <StoryViewer story={activeStory.story} shop={activeStory.shop} onClose={()=>setActiveStory(null)}/>}
        {tasteOpen && <TasteSheet taste={taste} onSave={saveTaste} onClose={()=>setTasteOpen(false)}/>}
        {notifOpen && <NotificationsSheet onClose={()=>{setNotifOpen(false);
          remote.unreadCount().then(n=>setUnread(n||0)).catch(()=>{});}}
          onOpenLink={(n)=>{
            setNotifOpen(false);
            // link_kind comes from the trigger that wrote the row. An offer
            // now says "offer" and lands where she can answer it, rather than
            // on a listing she can only look at.
            if (n.link_kind === "conversation") setTab("messages");
            else if (n.link_kind === "offer") setTab("offers");
            else if (n.link_kind === "item" && n.kind === "saved_search") {
              // the piece itself, which is what the alert was about
              const hit = items.find(i => i.id === n.link_id);
              if (hit) setModal(hit); else setTab("search");
            }
            else if (n.link_kind === "item") setTab(n.kind === "price_drop" ? "saved" : "myshop");
          }}/>}
        {reporting && <ReportDialog subject={reporting} onClose={()=>setReporting(null)}/>}
        {legalOpen && <LegalCenter onClose={()=>setLegalOpen(false)}/>}
        {langOpen && <LanguagePicker onBack={()=>setLangOpen(false)}/>}
        {themeOpen && <ThemePicker onBack={()=>setThemeOpen(false)}/>}
        {authOpen && <AuthScreen onBack={()=>setAuthOpen(false)}
          onSignedIn={async s=>{
            setSession(s); setAuthOpen(false);
            await activateBackend();
            if (pendingShop) { const f = pendingShop; setPendingShop(null); onCreateShop(f); }
          }}
          reason={authReason}
          onSkip={pendingShop ? ()=>{ const f=pendingShop; setPendingShop(null);
                                      setAuthOpen(false); onCreateShop(f); } : null}/>}
        {settingsOpen && <Settings myShop={myShop} onBack={()=>setSettingsOpen(false)}
          onShopUpdated={u=>{setMyShop(u); setShops(sh=>sh.map(x=>x.id===u.id?u:x));}}/>}
        {helpOpen && <HelpCentre onBack={()=>setHelpOpen(false)}/>}
        </Suspense>
      </div>
    </div>
  );
}
