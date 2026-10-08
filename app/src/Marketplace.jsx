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
function Lazy({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
const ReportDialog   = lazy(() => import("./compliance/ReportDialog.jsx"));
const ListingScreen  = lazy(() => import("./compliance/ListingScreen.jsx"));
const AgreementSheet = lazy(() => import("./compliance/AgreementSheet.jsx"));
import { sellerClausesFor } from "./compliance/agreements.js";
import * as repo from "./data/repo.js";
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
import { tokens, fuzzyIncludes } from "./discovery/text.js";
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

// ── tokens ─────────────────────────────────────────────────────────────────
// Every value points at a CSS custom property defined in theme/palette.css,
// so all ~500 references below re-resolve the moment the theme changes. No
// component needs to know a theme exists.
//
// Naming debt, stated openly: `white` is a card SURFACE and is dark in dark
// mode. Renaming it to `surface` everywhere is correct and mechanical, but
// bundling that with the theming change would make both unreviewable.
const C = {
  peach:"var(--c-peach)", cream:"var(--c-cream)",
  terra:"var(--c-terra)", terraDk:"var(--c-terra-dk)",
  ink:"var(--c-ink)",     inkLt:"var(--c-ink-lt)",
  sand:"var(--c-sand)",   gold:"var(--c-gold)",
  rose:"var(--c-rose)",   white:"var(--c-white)",
  border:"var(--c-border)", bg:"var(--c-bg)",
  green:"var(--c-green)", red:"var(--c-red)",

  // translucent variants — previously built by concatenating hex alpha onto
  // C.white, which cannot work once the value is a var() reference
  scrim88:"var(--c-scrim-88)", scrimCC:"var(--c-scrim-cc)",
  scrimDD:"var(--c-scrim-dd)", scrimEE:"var(--c-scrim-ee)",
  shadow:"var(--c-shadow)",

  // ── v2.8 fix: three tokens used everywhere and defined nowhere ────────────
  // C.terraTx (103 references across src/), C.btn (25) and C.onBtn (21) were
  // read all over the app and were absent from this object. React received
  // `color: undefined` and `background: undefined` and dropped the declaration
  // silently — so every primary button rendered with no background of its own
  // and every terracotta label inherited whatever colour sat above it.
  //
  // The CSS variables existed the whole time. --c-terra-tx even carries the
  // note "terracotta as TEXT — 4.6:1 on peach", so the contrast work was done
  // and then never reached the screen. Nothing in the suite caught it: jsdom
  // has no computed styles, and an undefined style property throws no error.
  terraTx:"var(--c-terra-tx)",
  btn:"var(--c-accent-btn)", onBtn:"var(--c-on-accent)",
  goldTx:"var(--c-gold-tx)", greenTx:"var(--c-green-tx)", redTx:"var(--c-red-tx)",
};

// ── palm bg ────────────────────────────────────────────────────────────────
function PalmBg() {
  return (
    <div style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:0,pointerEvents:"none",overflow:"hidden"}}>
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="p" x="0" y="0" width="110" height="150" patternUnits="userSpaceOnUse">
            <g opacity="0.07" stroke={C.terra} fill="none" strokeLinecap="round">
              <path d="M55 150 C54 132 52 115 53 98 C54 85 55 70 55 52" strokeWidth="1.4"/>
              <path d="M55 52 C46 42 33 35 18 37" strokeWidth="1"/>
              <path d="M55 52 C44 46 30 43 14 47" strokeWidth="1"/>
              <path d="M55 52 C48 39 42 28 38 16" strokeWidth="1"/>
              <path d="M55 52 C64 42 77 35 92 37" strokeWidth="1"/>
              <path d="M55 52 C66 46 80 43 96 47" strokeWidth="1"/>
              <path d="M55 52 C62 39 68 28 72 16" strokeWidth="1"/>
              <path d="M55 52 C55 38 55 25 55 12" strokeWidth="1"/>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#p)"/>
      </svg>
    </div>
  );
}

// ── lili wordmark ──────────────────────────────────────────────────────────
function Lili({ size=28, color=C.ink }) {
  return (
    <span style={{fontFamily:"Georgia,serif",fontWeight:700,fontSize:size,color,
      letterSpacing:-1,display:"inline-flex",alignItems:"flex-end",lineHeight:1,userSelect:"none",
      paddingTop: space(size*0.5)}}>
      {["l","i","l","i"].map((ch,idx)=>(
        <span key={idx} style={{position:"relative",display:"inline-block"}}>
          {ch==="i" ? (
            <span style={{position:"relative",display:"inline-block"}}>
              <span>ı</span>
              <span style={{
                position:"absolute",
                left:"50%",
                transform:"translateX(-50%)",
                top: `-${size*0.45}px`,
                fontSize:typeScale(size*0.38),
                color:C.terraTx,
                lineHeight:1,
                display:"block",
              }}><Icon name="heart" size={size*0.38} filled/></span>
            </span>
          ) : ch}
        </span>
      ))}
    </span>
  );
}

// ── full wordmark for home screen ──────────────────────────────────────────
function LiliWordmark({ size=16 }) {
  const HeartI = () => (
    <span style={{position:"relative",display:"inline-block"}}>
      <span>ı</span>
      <span style={{position:"absolute",left:"50%",transform:"translateX(-50%)",
        top:`-${size*0.48}px`,color:C.terraTx,lineHeight:1,display:"block"}}>
        <Icon name="heart" size={size*0.4} filled/></span>
    </span>
  );
  return (
    <span style={{fontFamily:"Georgia,serif",fontSize:size,color:C.ink,
      fontStyle:"italic",letterSpacing:0.3,userSelect:"none",
      display:"inline-flex",alignItems:"flex-end",paddingTop:space(size*0.55),lineHeight:1}}>
      {/* Non-breaking spaces, deliberately.
          This container is `display:inline-flex`, which makes each run of text
          an anonymous flex item — and a flex item has its leading and trailing
          whitespace stripped. So `love <HeartI/>t` rendered as "loveıt", and
          the wordmark read "loveit or leaveit" on every screen in the app.
          A non-breaking space is not collapsible whitespace, so it survives. */}
      {"love\u00A0"}<HeartI/>{"t or leave\u00A0"}<HeartI/>{"t"}
    </span>
  );
}

// ── bilingual label helper ─────────────────────────────────────────────────
const T = {
  shop:["Shop","تسوق"], newIn:["New In","جديد"], sellers:["Sellers","البائعون"],
  saved:["Saved","المحفوظ"], sell:["Sell","بيع"], profile:["Profile","حسابي"],
  categories:["Categories","الفئات"], search:["Search for items, brands, sellers...","ابحثي عن قطع، ماركات، بائعين..."],
  messageSelller:["Message Seller","تواصل مع البائع"], makeOffer:["Make an Offer","قدم عرضاً"],
  follow:["Follow","تابع"], following:["Following","تتابعينها"], listItem:["List Item","أضف قطعة"], addPhotos:["Add Photos","أضف صوراً"],
  newInTitle:["New In","وصل حديثاً"], stories:["Stories","ستوريز"],
  forYou:["For You","لكِ"], save:["Save","احفظ"],
};
function bi([en, ar]) { return <span>{en} <span style={{fontSize:"0.8em",opacity:0.6,fontFamily:"inherit"}}>· {ar}</span></span>; }
function biStr([en, ar]) { return `${en} · ${ar}`; }

// ── seed data ──────────────────────────────────────────────────────────────
//
//  v2.8: the ratings are gone from here.
//
//  Every seed shop carried a rating between 4.6 and 4.9 with 31 to 138
//  reviews — all comfortably above the five-review threshold in `Stars`, so
//  every one of them displayed. The app was shipping the precise thing
//  trust/TrustSignals.jsx exists to forbid, in that file's own words: "A
//  brand-new seller does not get a 4.9 and 138 reviews because the seed data
//  had one." The seed data had one. Six of them.
//
//  A demonstration catalogue, so the feed is not empty on a cold start, is
//  reasonable and stays. A fabricated quality score is not a catalogue — it is
//  a claim about a person, and there is no version of it that is true before
//  her first sale. `demo:true` marks these for what they are so nothing
//  downstream can mistake them for earned history.
const SHOPS = [
  {id:1,name:"Leen's Closet",nameAr:"خزانة لين",handle:"@leenscloset",followers:532,items:128,banner:C.terra,bio:"Luxury pieces curated with love in Dubai Marina",demo:true},
  {id:2,name:"The Vintage Edit",nameAr:"ذا فينتاج إيديت",handle:"@thevintageedit",followers:1240,items:243,banner:"#7B6FA0",bio:"Designer finds & timeless vintage gems",demo:true},
  {id:3,name:"Haya's Collection",nameAr:"مجموعة هيا",handle:"@hayascollection",followers:987,items:156,banner:"#4A7B6F",bio:"Elevated everyday — from Dubai with love",demo:true},
  {id:4,name:"Minimal by Mia",nameAr:"مينيمال باي ميا",handle:"@minimalbymia",followers:341,items:89,banner:C.gold,bio:"Clean lines. Quiet luxury. Always.",demo:true},
  {id:5,name:"Dubai Finds",nameAr:"دبي فايندز",handle:"@dubaifinds",followers:912,items:179,banner:"#B55A3A",bio:"The best pre-loved pieces in the UAE",demo:true},
  {id:6,name:"Second Shelf",nameAr:"ثاني رف",handle:"@secondshelf",followers:276,items:64,banner:"#5C4A3A",bio:"Carefully loved, ready for a second life",demo:true},
];

const ITEMS = [
  {id:1,shopId:1,title:"Chanel Classic Flap Bag",titleAr:"شنطة شانيل كلاسيك فلاب",subtitle:"Medium · Beige Lambskin",price:12900,brand:"Chanel",category:"Luxury",condition:"Excellent",era:"Modern",size:"OS",color:"#D4B898",icon:"bag",photo:null,saved:true,desc:"Timeless Chanel Classic Flap in beige lambskin with gold hardware. Gently used, excellent condition. Comes with dust bag and authenticity card.",offers:[]},
  {id:2,shopId:1,title:"Zimmermann Floral Dress",titleAr:"فستان زيمرمان الزهري",subtitle:"Ruffle Mini",price:1250,brand:"Zimmermann",category:"Dresses",condition:"Like New",era:"Modern",size:"S",color:"#E8C4B8",icon:"dress",photo:null,saved:false,desc:"Beautiful Zimmermann ruffle mini dress with floral print. Worn once to a brunch. Perfect condition.",offers:[]},
  {id:3,shopId:2,title:"Gianvito Rossi Heels",titleAr:"كعب جيانفيتو روسي",subtitle:"Nude Pumps 38",price:1500,brand:"Gianvito Rossi",category:"Shoes",condition:"Good",era:"Modern",size:"38",color:"#C4A882",icon:"heel",photo:null,saved:false,desc:"Gianvito Rossi Gianvito 105 pumps in nude PVC. Minor sole wear. Stunning on.",offers:[]},
  {id:4,shopId:2,title:"Van Cleef Vintage Alhambra",titleAr:"فان كليف فينتاج الحمبرا",subtitle:"Yellow Gold · Malachite",price:8200,brand:"Van Cleef & Arpels",category:"Luxury",condition:"Excellent",era:"Vintage",size:"OS",color:"#C9A96E",icon:"jewellery",photo:null,saved:true,desc:"Iconic Van Cleef & Arpels Vintage Alhambra necklace. Yellow gold with malachite. Comes with original pouch.",offers:[]},
  {id:5,shopId:3,title:"Chloé Woody Tote",titleAr:"شنطة كلوي وودي",subtitle:"Tan & White Canvas",price:1650,brand:"Chloé",category:"Bags",condition:"Like New",era:"Modern",size:"OS",color:"#D4B898",icon:"bag",photo:null,saved:false,desc:"Chloé Woody tote in tan and white. Barely used. Perfect summer bag.",offers:[]},
  {id:6,shopId:4,title:"Linen Abaya",titleAr:"عباية كتان",subtitle:"Dubai Design · Cream",price:260,brand:"Local Designer",category:"Abayas",condition:"Like New",era:"Modern",size:"M",color:"#EDE0D0",icon:"abaya",photo:null,saved:false,desc:"Beautifully crafted linen abaya in warm white. Worn once to a family gathering.",offers:[]},
  {id:7,shopId:5,title:"Celine Sunglasses",titleAr:"نظارة سيلين",subtitle:"Cat Eye · Tortoiseshell",price:800,brand:"Celine",category:"Luxury",condition:"Excellent",era:"Modern",size:"OS",color:"#5C4A3A",icon:"sunglass",photo:null,saved:true,desc:"Celine cat-eye sunglasses in tortoiseshell. Come with original case and cleaning cloth.",offers:[]},
  {id:8,shopId:6,title:"Reformation Midi Dress",titleAr:"فستان ريفورميشن",subtitle:"Terracotta · Fitted",price:480,brand:"Reformation",category:"Dresses",condition:"Like New",era:"Y2K",size:"XS",color:"#C4856A",icon:"dress",photo:null,saved:false,desc:"Reformation fitted midi in warm terracotta. Worn once to a brunch. Stunning silhouette.",offers:[]},
  {id:9,shopId:1,title:"Bottega Veneta Pouch",titleAr:"حقيبة بوتيغا فينيتا",subtitle:"Intrecciato · Nude",price:3200,brand:"Bottega Veneta",category:"Bags",condition:"Like New",era:"Modern",size:"OS",color:"#C4A882",icon:"bag",photo:null,saved:false,desc:"The iconic Bottega Veneta pouch in nude intrecciato leather. Like new, barely carried.",offers:[]},
  {id:10,shopId:3,title:"Jacquemus Le Chiquito",titleAr:"جاكيموس لو شيكيتو",subtitle:"Mini Bag · Caramel",price:1800,brand:"Jacquemus",category:"Bags",condition:"Excellent",era:"Modern",size:"OS",color:"#C9A96E",icon:"bag",photo:null,saved:false,desc:"Jacquemus Le Chiquito in caramel leather. Absolutely perfect condition with dustbag.",offers:[]},
];

const CATS = ["All","Luxury","Bags","Dresses","Shoes","Abayas","Tops","Jackets","Skirts"];
/**
 * A category in Arabic.
 *
 * v2.11 — these were rendered as "Dresses · فساتين" in one label, on the
 * category chips and in the filter dropdown. That is exactly the pattern
 * v2.9.3 removed from 118 other places, and it survived here because the
 * i18n regression check looks for the separator in JSX text and in string
 * literals, and this was built in a template expression. The check now covers
 * that shape too.
 */
export const categoryLabel = (c) => (getLang() === "ar" ? (CATS_AR[c] || c) : c);

const CATS_AR = {All:"الكل",Luxury:"فاخر",Bags:"حقائب",Dresses:"فساتين",Shoes:"أحذية",Abayas:"عبايات",Tops:"توبات",Jackets:"جاكيتات",Skirts:"تنانير"};
const CONDITIONS = ["Like New","Excellent","Good","Fair"];
const SIZES = ["XS","S","M","L","XL","OS","36","37","38","39","40"];
const ITEM_CATS = ["Luxury","Bags","Dresses","Shoes","Tops","Bottoms","Abayas","Accessories"];
// The placeholder a piece gets when it has no photograph yet. Every listing
// used to be published with icon:"dress" regardless of what it was.
const ICON_FOR_CAT = {
  Luxury:"gem", Bags:"bag", Dresses:"dress", Shoes:"heel", Tops:"dress",
  Bottoms:"dress", Abayas:"abaya", Accessories:"sunglass",
};
// ── approved brands & calibre rules ──────────────────────────────────────
const APPROVED_BRANDS = [
  "Chanel","Louis Vuitton","Hermès","Gucci","Bottega Veneta","Celine","Prada",
  "Dior","Saint Laurent","Balenciaga","Loewe","Fendi","Valentino","Burberry",
  "Zimmermann","Reformation","Jacquemus","Rixo","Rotate","Ganni","Self Portrait",
  "Chloé","Isabel Marant","Nanushka","Toteme","The Frankie Shop",
  "Gianvito Rossi","Manolo Blahnik","Jimmy Choo","Aquazzura","Christian Louboutin",
  "Van Cleef & Arpels","Cartier","Bulgari","Tiffany & Co","David Yurman",
  "Emirati / Local Designer","Dubai Modest Fashion","Abaya Couture",
];
const MIN_PRICE = 200; // AED minimum listing price — see markets.AE.minListingPrice
const BRANDS = APPROVED_BRANDS; // alias for dropdowns

// v2.8: `isCaliberOK` and `isBrandApproved` were deleted, not fixed.
//
// They were the prototype's price-plausibility check, written and then never
// called — the handover flagged them, and the honest resolution is that the
// idea has a proper home now. Brand tiering, category bands, condition
// adjustment and the model-level floors live in data/resaleValue.js; the
// screening decision that uses them lives in compliance/listingRules.js and is
// mirrored server-side. Two definitions of "is this price plausible" is one
// too many, and the one that is not enforced is the one that rots.
const ERAS = ["Modern","Vintage","Y2K","90s","Minimal","Resort"];

// ── stories data ───────────────────────────────────────────────────────────
const STORIES = [
  {id:1,shopId:1,icon:"bag",color:"#D4B898",caption:"New drop",duration:4000},
  {id:2,shopId:2,icon:"sparkle",color:"#C9A96E",caption:"Summer edit",duration:4000},
  {id:3,shopId:3,icon:"dress",color:"#E8C4B8",caption:"Just listed",duration:4000},
  {id:4,shopId:5,icon:"sunglass",color:"#5C4A3A",caption:"Luxury finds",duration:4000},
  {id:5,shopId:6,emoji:"",color:"#C4856A",caption:"Weekend picks ",duration:4000},
];

// ── shared ui ──────────────────────────────────────────────────────────────
function Avatar({shop,size=36}) {
  // A shop that cannot be resolved is not hypothetical: a listing outlives a
  // paused shop, and the shops list is capped. `shop.banner` on undefined threw.
  shop = shop || {};
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:shop.banner||C.sand,
      display:"flex",alignItems:"center",justifyContent:"center",
      flexShrink:0,border:`2px solid ${C.border}`,position:"relative",
      fontFamily:"Georgia,serif",fontWeight:700,fontSize:typeScale(size*0.4),color:C.white,
      letterSpacing:0.5}}>
      {(shop.name||"?").trim().charAt(0).toUpperCase()}
      {/* v2.10 — the green "online" dot is gone. There is no presence system:
          it was a hard-coded boolean on the six demo shops, so half of them
          were permanently "online" and every real seller was permanently not.
          A buyer waits differently for a reply from someone she has been told
          is there right now. Nothing was measuring that, so nothing should
          have been claiming it. */}
    </div>
  );
}

function Stars({rating,reviews,shop}) {
  // A rating is only shown once enough people have actually left one. Below
  // that we show what the shop has genuinely done instead — a fabricated 4.9
  // on a shop with no sales is the thing that makes buyers stop believing
  // every rating on the platform.
  //
  // v2.8 adds the second half of that rule: a demo shop never shows a rating,
  // whatever it claims to hold. The threshold was doing its job; the seed data
  // was simply walking straight over it with 138 reviews.
  if (shop && shop.demo) return <TrustSignals shop={shop} compact/>;
  if (shop && (!reviews || reviews < 5)) return <TrustSignals shop={shop} compact/>;
  if (!rating || !reviews) return null;
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3}}>
      <span style={{color:C.terraTx,display:"inline-flex",gap:1}}>{[0,1,2,3,4].map(i=><Icon key={i} name="star" size={10} filled={i<Math.floor(rating)}/>)}</span>
      <span style={{fontSize:10,fontWeight:600,color:C.ink}}>{rating}</span>
      {reviews && <span style={{fontSize:9,color:C.inkLt}}>({reviews})</span>}
    </span>
  );
}

// v2.11.3 — the same rule Stars has enforced since v2.8, applied to the figure
// printed immediately beside it.
//
// Stars refuses to show a rating for a demo shop, because the seed catalogue
// walked straight over the review threshold with fabricated numbers. The
// follower count sitting next to it was never given the same treatment: every
// demo shop carries an invented one — 532, 1240, 987, 341, 912, 276 — rendered
// unconditionally on the listing detail, the shop header and the story rows.
// v2.11.1 removed exactly this from the user's own profile ("156 followers and
// 78 following, on an app where nobody has followed anybody") and left the six
// demo shops printing theirs.
//
// A demo shop has no followers because it is not a person. Returns null there,
// and the real count everywhere else — including zero, which is a fact.
const earnedFollowers = (shop) => (!shop || shop.demo ? null : (shop.followers ?? 0));

function Pill({text,bg=C.sand,color=C.inkLt,fs=9}) {
  return <span style={{background:bg,color,fontSize:fs,fontWeight:500,padding:"2px 8px",borderRadius:20,whiteSpace:"nowrap"}}>{text}</span>;
}

// v2.10 — VerifiedBadge is gone, and this note is here so nobody puts it back.
//
// It rendered a tick and the word VERIFIED on EVERY listing detail and on the
// profile screen, with no argument and no condition. Nothing in this app
// verifies anything: there is no authenticator, no partner, and the listing
// flow says so on its own authentication step in as many words.
//
// It is the most expensive kind of false claim in a resale marketplace,
// because it is the exact thing a buyer is afraid of being wrong about. A
// woman paying AED 12,900 for a bag because a badge said VERIFIED has been
// told something by lili that lili has no basis for.
//
// A badge may come back the day trust/authentication.js has a real
// authenticator registered — and then it says WHO decided and WHEN, because
// "verified" without an author is the same claim in a smaller font.

// Every item's media passes through here, so this is where each one gets its
// own loading state. The hook lives per instance, which is what keeps the
// states independent — a tile that has loaded is unaffected by one that hasn't.
function ItemPhoto({item, size=56, compact, full}) {
  // A 180px tile has no business downloading a 1600px photograph. `full` is
  // set only where the picture is actually the point — the item detail.
  const source = full ? (item.photo || item.thumb) : (item.thumb || item.photo);
  const { state, retry, srcKey, onLoad, onError } = useItemLoad(source || null);

  // No photo: the placeholder art is the finished state, not a waiting state.
  if (!source) {
    return (
      <div className="lili-fill" style={{width:"100%",height:"100%",background:`linear-gradient(145deg,${item.color},${item.color}99)`,
        display:"flex",alignItems:"center",justifyContent:"center"}}><Placeholder item={item} size={size}/></div>
    );
  }

  if (state === STATE.ERROR) return <ItemError onRetry={retry} compact={compact}/>;

  return (
    <>
      {state === STATE.LOADING && <MediaSkeleton/>}
      <img src={srcKey} alt={item.title} onLoad={onLoad} onError={onError}
        style={{width:"100%",height:"100%",objectFit:"cover",display:"block",
          // fades in over the skeleton rather than snapping, and is never
          // display:none — a hidden img in some engines never fires onLoad
          opacity: state === STATE.LOADED ? 1 : 0,
          transition:"opacity .25s ease-out"}}/>
    </>
  );
}

// ── top bar ────────────────────────────────────────────────────────────────
function TopBar({left,center,right,noBorder}) {
  return (
    <div style={{position:"sticky",top:0,zIndex:90,background:C.cream,
      borderBottom:noBorder?"none":`1px solid ${C.border}`,
      display:"flex",alignItems:"center",height:52,padding:"0 14px",gap:8,
      boxSizing:"content-box"}} className="safe-top">
      <div style={{width:44,display:"flex",alignItems:"center"}}>{left}</div>
      <div style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center"}}>{center}</div>
      <div style={{width:44,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{right}</div>
    </div>
  );
}

function BackBtn({onBack}) {
  return <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",
    fontSize:20,color:C.ink,padding:4,lineHeight:1,display:"flex",alignItems:"center"}}>{backArrow()}</button>;
}

// ── search bar (Jacob's Law: Instagram/Depop style — grey pill, tap to focus) ──
function SearchBar({value,onChange,autoFocus=false,placeholder="Search..."}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,background:"#F2EAE4",
      borderRadius:12,padding:"10px 14px",margin:"0 14px 10px"}}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.inkLt} strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <input value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{flex:1,background:"none",border:"none",outline:"none",
          fontSize:14,color:C.ink,fontFamily:"inherit"}}/>
      {value && <button onClick={()=>onChange("")} style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,fontSize:14,lineHeight:1}}><Icon name="close" size={14} stroke={2}/></button>}
    </div>
  );
}

/**
 * The one place the heart is decided.
 *
 * Every screen reads `item.saved`. It is derived here, from this person's own
 * set of ids, and nowhere else — the v2.8 bug was a save written onto the
 * listing, which either failed (you cannot update a listing you do not own) or,
 * had it worked, would have marked the piece saved for everybody.
 *
 * v2.9: it became a function rather than an expression inside the root
 * component because search results can now arrive straight from the server,
 * for listings this device has never held. Those were rendering with an empty
 * heart however many times she had saved them. Two call sites, one definition —
 * a second copy of this logic is the same bug in a new place.
 */
function withHeart(items, savedIds) {
  const ids = savedIds || [];
  return (items || []).map(i =>
    ids.includes(i.id) === !!i.saved ? i : { ...i, saved: ids.includes(i.id) });
}

// ── search page (Jacob's Law: dedicated search tab like Depop/TikTok) ─────
// "Tell me when it's listed": the search she just ran, kept on the server so the
// database can tell her the moment a matching piece goes live. Vinted, Depop
// and Vestiaire all have it; for a catalogue this young, where most searches
// come back short, it is the difference between a dead end and a reason to
// come back.
function SaveSearchButton({q, filters, prominent}) {
  const [state,setState] = useState("idle");   // idle | busy | saved | error
  const [problem,setProblem] = useState(null);
  useEffect(()=>{ setState("idle"); setProblem(null); },[q, filters.maxPrice, filters.category]);
  if (!repo.canSaveSearches()) return null;
  const maxPrice = filters.maxPrice != null && filters.maxPrice !== 999999 ? filters.maxPrice : null;
  const category = filters.category && filters.category !== "All" ? filters.category : null;
  const save = async () => {
    setState("busy"); setProblem(null);
    try { await repo.saveSearch(q.trim(), { maxPrice, category }); setState("saved"); }
    catch (e) { setState("error"); setProblem((e && e.message) || "That didn't save."); }
  };
  const what = `“${q.trim()}”${category?` in ${category}`:""}${maxPrice?` under ${money(maxPrice)}`:""}`;
  if (state === "saved") return (
    <div role="status" style={{fontSize:12,color:C.inkLt,lineHeight:1.5,padding:prominent?"10px 0 0":"0 4px 10px"}}>
      <Icon name="check" size={13} style={{color:C.greenTx,verticalAlign:"-2px"}}/> Saved. We'll tell you when something new matches {what}.
    </div>
  );
  return (
    <div style={{padding:prominent?"14px 0 0":"0 4px 10px"}}>
      <button onClick={save} disabled={state==="busy"}
        style={prominent
          ? {background:C.btn,color:C.onBtn,border:"none",borderRadius:20,padding:"10px 20px",
             fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}
          : {background:C.white,color:C.terraTx,border:`1.5px solid ${C.terra}`,borderRadius:20,
             padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
             display:"inline-flex",alignItems:"center",gap:6}}>
        {!prominent && <Icon name="bell" size={13}/>}
        {state==="busy" ? "Saving…" : prominent ? "Tell me when it's listed" : "Save this search"}
      </button>
      {problem && <div role="alert" style={{fontSize:12,color:C.redTx,marginTop:6}}>{problem}</div>}
    </div>
  );
}

// Her saved searches, on the search landing, each with what has gone live
// since she last looked.
function SavedSearches({onPick}) {
  const [list,setList] = useState([]);
  const load = useCallback(()=>{ repo.getSavedSearches().then(r=>setList(r||[])); },[]);
  useEffect(()=>{ load(); },[load]);
  if (list.length===0) return null;
  return (
    <div style={{marginBottom:24}}>
      <div style={{fontWeight:700,fontSize:14,color:C.ink,marginBottom:10}}>Your saved searches</div>
      {list.map(s=>(
        <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,background:C.white,
          border:`1px solid ${C.border}`,borderRadius:12,padding:"4px 4px 4px 12px",marginBottom:7}}>
          <button onClick={()=>{ repo.sawSearch(s.id); onPick(s); }}
            style={{flex:1,minWidth:0,background:"none",border:"none",textAlign:"start",cursor:"pointer",
              padding:"8px 0",fontFamily:"inherit",color:C.ink,fontSize:13}}>
            <span style={{fontWeight:600}}>{s.query}</span>
            <span style={{color:C.inkLt,fontSize:11}}>
              {s.category?` · ${s.category}`:""}{s.max_price?` · under ${money(Number(s.max_price))}`:""}
            </span>
          </button>
          {s.new_count>0 && <span style={{background:C.btn,color:C.onBtn,fontSize:10,fontWeight:700,
            borderRadius:10,padding:"2px 8px",whiteSpace:"nowrap"}}>{s.new_count} new</span>}
          <button className="tap-round" aria-label={`Stop saving “${s.query}”`}
            onClick={async()=>{ await repo.forgetSearch(s.id).catch(()=>{}); load(); }}
            style={{background:"none",border:"none",color:C.inkLt,cursor:"pointer",width:36,height:36,
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="close" size={14}/>
          </button>
        </div>
      ))}
    </div>
  );
}

function SearchPage({items,shops,onSave,setModal,filters,setFilters,savedIds=[]}) {
  const [q,setQ] = useState("");
  const [showFilters,setShowFilters] = useState(false);

  const shopFor = useCallback((i)=>{
    const sh = shops.find(s=>s.id===i.shopId);
    return sh ? `${sh.name||""} ${sh.nameAr||""}` : "";
  },[shops]);

  // v2.9. This was `String.includes` over title, brand, category and shop name.
  // It searched neither `titleAr` nor the description, so عباية found nothing
  // in an app whose sell flow tells sellers the Arabic title is what makes a
  // piece findable in Arabic; "Hermes" never found "Hermès"; and a two-word
  // query only matched if those words were adjacent, in that order.
  //
  // A server RPC that does all three properly — bilingual, unaccented,
  // typo-tolerant — has existed since v2.8 and had no callers anywhere in the
  // app. Local results appear as she types; the server's answer merges in when
  // it arrives, and can only add.
  const active = q.trim().length > 0;
  const local = useMemo(
    () => (active ? searchLocal(items,q,{shopFor,limit:120}) : []),
    [items,q,active,shopFor]);
  const [serverHits,setServerHits] = useState([]);

  useEffect(()=>{
    if (!active) { setServerHits([]); return; }
    let alive = true;
    const t = setTimeout(()=>{
      repo.searchItems(q, 60).then(rows=>{ if(alive) setServerHits(rows||[]); })
        .catch(()=>{ if(alive) setServerHits([]); });
    }, 280);   // she is still typing; do not ask on every keystroke
    return ()=>{ alive=false; clearTimeout(t); };
  },[q,active]);

  // The Search tab mounts FiltersPanel and then ignored every one of its
  // controls — `results` applied the query alone. Opening filters from here,
  // setting a price ceiling and tapping "Show N Results" changed nothing on the
  // screen you were looking at.
  const results = useMemo(() => {
    if (!active) return [];
    const seen = new Set(local.map(i=>i.id));
    // A listing the server returned that this device has never held arrives
    // with no heart derived for it, so it rendered as unsaved however many
    // times she had saved it. Through the same `withHeart` the feed uses.
    const extra = withHeart(serverHits.filter(i=>!seen.has(i.id)), savedIds);
    return applySort([...local, ...extra].filter(i=>matchesFilters(i,filters)),
                     filters.sort, { relevance:true });
  }, [active,local,serverHits,filters,savedIds]);

  // Reported once she has stopped typing, not per keystroke — otherwise the
  // funnel records "chan", "chane", "chanel" as three failed searches.
  useEffect(()=>{
    if (!active) return;
    const t = setTimeout(()=>funnel.search(q, results.length), 900);
    return ()=>clearTimeout(t);
  },[q,active,results.length]);

  // Both walk the catalogue; neither is worth doing on a render that found
  // something, and neither is worth redoing when nothing that feeds them moved.
  const empty = active && results.length===0;
  const rescue = useMemo(() => (empty ? diagnose(items,q,{shopFor}) : null), [empty,items,q,shopFor]);
  const alternatives = useMemo(() => (empty ? suggestions(items,q) : []), [empty,items,q]);

  // The trending row was seven hardcoded strings. Four of them — "Y2K",
  // "Bottega", "Summer Dresses", "Heels" — are not brands or categories in this
  // catalogue, so tapping them produced the empty state. A suggestion that
  // leads nowhere is a dead end with a nice chip around it.
  const trending = useMemo(() => suggestions(items,"",7), [items]);

  return (
    <div style={{paddingBottom:72}}>
      {/* sticky search header */}
      <div style={{background:C.cream,padding:"12px 0 0",position:"sticky",top:0,zIndex:90,borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:6,padding:"0 14px 10px"}}>
          <div style={{flex:1}}>
            <SearchBar value={q} onChange={setQ} autoFocus placeholder="Search items, brands, sellers..." />
          </div>
          <button onClick={()=>setShowFilters(true)} className="tap-round" aria-label="Filters" style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,padding:"0 4px"}}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="18" x2="20" y2="18"/>
              <circle cx="8" cy="6" r="2" fill={C.cream}/><circle cx="16" cy="12" r="2" fill={C.cream}/><circle cx="10" cy="18" r="2" fill={C.cream}/>
            </svg>
          </button>
        </div>
      </div>

      {/* v2.9: this was `q.length < 2`, so a one-character query silently
          showed the browse landing instead of results — typing "Y" while
          looking for Y2K looked as though nothing had been typed at all. */}
      {!active ? (
        <div style={{padding:"20px 14px"}}>
          <SavedSearches onPick={(ss)=>{
            setFilters(f=>({...f,
              category: ss.category || "All",
              maxPrice: ss.max_price != null ? Number(ss.max_price) : f.maxPrice}));
            setQ(ss.query);
          }}/>
          {trending.length>0 && <>
          <div style={{fontWeight:700,fontSize:14,color:C.ink,marginBottom:12}}>{t("in_stock_now")}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:24}}>
            {trending.map(t=>(
              <button key={t} onClick={()=>setQ(t)} style={{background:C.white,border:`1px solid ${C.border}`,
                borderRadius:20,padding:"7px 14px",fontSize:13,color:C.ink,cursor:"pointer",
                display:"flex",alignItems:"center",gap:6}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.terra} strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                {t}
              </button>
            ))}
          </div>
          </>}
          {/* browse by category */}
          <div style={{fontWeight:700,fontSize:14,color:C.ink,marginBottom:12}}>{t("browse_by_category")}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
            {[["gem","Luxury","فاخر","#C9A96E"],["bag","Bags","حقائب","#D4B898"],
              ["dress","Dresses","فساتين","#E8C4B8"],["abaya","Abayas","عبايات","#EDE0D0"],
              ["heel","Shoes","أحذية","#C4A882"],["sparkle","Vintage","فينتاج","#C4856A"]].map(([ic,cat,ar,bg])=>(
              <button key={cat} onClick={()=>{setFilters(f=>({...f,category:cat}));setQ(cat);}}
                style={{background:`linear-gradient(135deg,${bg}44,${bg}22)`,
                  border:`1px solid ${bg}66`,borderRadius:14,padding:"16px 14px",
                  cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}>
                <Icon name={ic} size={24} stroke={1.4} style={{color:C.ink,opacity:0.75}}/>
                <div>
                  <div style={{fontWeight:600,fontSize:13,color:C.ink}}>{cat}</div>
                  <div style={{fontSize:11,color:C.inkLt}}>{ar}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{padding:"12px 10px"}}>
          {results.length > 0 ? (
            <>
              <div style={{padding:"0 4px 10px",fontSize:12,color:C.inkLt}}>
                {results.length} {results.length===1?"piece":"pieces"} for "{q}"
                {/* Every result says how it was found — her word, the other
                    language, or a spelling near enough. The server has returned
                    this on every row since v2.8 and nothing displayed it. A
                    woman should know why a result is in front of her. */}
                {results.some(r=>r.matchKind && r.matchKind!=="exact") && (
                  <span> · some matched through Arabic or a near spelling</span>
                )}
              </div>
              <SaveSearchButton q={q} filters={filters}/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
                {results.map(item=>(
                  <ItemTile key={item.id} item={item} onSave={onSave} onClick={()=>setModal(item)}/>
                ))}
              </div>
            </>
          ) : (
            /* v2.9. This was a wall: an icon, "No results for X", and "Try a
               brand name, category or style" — advice, with nothing to tap.
               Baymard's 2026 benchmark (170+ sites, 10,000+ ratings) puts 64%
               of app search experiences at mediocre or worse, and the dead end
               is most of what it measures.

               Now it says which of her own words killed the search, and every
               alternative offered is drawn from what is actually in stock. */
            <div style={{textAlign:"center",padding:"48px 20px",color:C.inkLt}}>
              <div style={{marginBottom:12,display:"flex",justifyContent:"center",opacity:0.5}}><Icon name="search" size={38} stroke={1.3}/></div>
              <div style={{fontSize:15,color:C.ink,marginBottom:6}}>Nothing for "{q}"</div>
              {rescue ? (
                <>
                  <div style={{fontSize:13,lineHeight:1.6,maxWidth:290,margin:"0 auto"}}>
                    Nothing is <b style={{color:C.ink}}>{rescue.drop}</b>. There
                    {rescue.count===1?" is 1 piece":` are ${rescue.count} pieces`} for “{rescue.keep}”.
                  </div>
                  <button onClick={()=>{setQ(rescue.keep);funnel.track(funnel.EVENTS.SEARCH_RECOVER,{kind:"drop_word"});}}
                    style={{marginTop:14,background:C.btn,color:C.onBtn,border:"none",borderRadius:20,
                      padding:"10px 20px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                    Search “{rescue.keep}”
                  </button>
                </>
              ) : (
                <div style={{fontSize:12,lineHeight:1.6}}>
                  Try a brand name, a category, or the Arabic word — both work.
                </div>
              )}
              <SaveSearchButton q={q} filters={filters} prominent/>
              {alternatives.length>0 && (
                <div style={{marginTop:22}}>
                  <div style={{fontSize:11,color:C.inkLt,marginBottom:10}}>In stock right now</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"center"}}>
                    {alternatives.map(a=>(
                      <button key={a} onClick={()=>{setQ(a);funnel.track(funnel.EVENTS.SEARCH_RECOVER,{kind:"suggestion"});}}
                        style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:20,
                          padding:"6px 12px",fontSize:12,color:C.ink,cursor:"pointer",fontFamily:"inherit"}}>{a}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {showFilters && <FiltersPanel filters={filters} setFilters={setFilters} onClose={()=>setShowFilters(false)} items={items}/>}
    </div>
  );
}

// Placeholder art for a piece with no photo yet: the category icon, drawn in
// the piece's own colour. Replaces the emoji that rendered differently on every
// handset and belonged to nobody's brand.
function Placeholder({item, size=48}) {
  // The icon sits on the piece's own colour, which ranges from cream to near
  // black. Drawing it in ink regardless made it invisible on the dark ones —
  // "Dubai Finds" rendered as an empty circle. Pick the tone by luminance.
  const hex = (item && item.color) || "#E8D5C6";
  const rgb = [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)||0);
  const lum = (0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]) / 255;
  const onDark = lum < 0.5;
  return <Icon name={item.icon || "bag"} size={size} stroke={1.3}
                style={{color: onDark ? "#FFFFFF" : C.ink, opacity: onDark ? 0.85 : 0.55}}/>;
}

// Shop identity without emoji: her initial, set in the serif the brand already
// uses. Reads as a boutique rather than a sticker.
function Monogram({shop, size=44}) {
  const letter = (shop?.name || "?").trim().charAt(0).toUpperCase();
  return (
    <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,
      background:shop?.banner||C.sand, color:C.white,
      display:"flex",alignItems:"center",justifyContent:"center",
      fontFamily:"Georgia,serif",fontWeight:700,fontSize:typeScale(size*0.42),
      letterSpacing:0.5}}>
      {letter}
    </div>
  );
}

// ── bottom tab bar (Jacob's Law: match Instagram + Depop + Noon conventions) ──
function TabBar({tab,setTab,savedCount,myShop,cartCount}) {
  const tabs = [
    { key:"home",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill={tab==="home"?C.terra:"none"} stroke={tab==="home"?C.terra:C.inkLt} strokeWidth="1.8"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/></svg>,
      label:"Home" },
    { key:"search",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tab==="search"?C.terra:C.inkLt} strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>,
      label:"Search" },
    { key: myShop ? "myshop" : "sell", icon: null, label:"Sell", plus:true },
    { key:"saved",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill={tab==="saved"?C.terra:"none"} stroke={tab==="saved"?C.terra:C.inkLt} strokeWidth="1.8"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
      label:`Saved`, badge: savedCount||null },
    { key:"profile",
      icon: <svg width="22" height="22" viewBox="0 0 24 24" fill={tab==="profile"?C.terra:"none"} stroke={tab==="profile"?C.terra:C.inkLt} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
      label:"Profile" },
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
            background:C.btn,color:C.onBtn,fontSize:9,fontWeight:700,
            borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center",lineHeight:"14px"}}>{t.badge}</div>}
          {!t.plus && <span style={{fontSize:9,fontWeight:tab===t.key?700:400,color:tab===t.key?C.terraTx:C.inkLt}}>{t.label}</span>}
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
            <span style={{fontSize:10,color:C.ink,fontWeight:500,
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

// ── item tile ──────────────────────────────────────────────────────────────
// ── fit, measurements, flaws ───────────────────────────────────────────────
// A size label says what the tag says. Whether it fits is the question buyers
// message about before buying and the reason they regret it after, and a
// "Good" condition hides as much as it tells. These three answer both, in the
// seller's words, in a form a buyer can compare across listings.
const GARMENT_CATS = ["Dresses","Tops","Bottoms","Abayas"];
const FIT_CATS = [...GARMENT_CATS, "Shoes"];
const MEASURE_KEYS = {
  Dresses: ["chest","waist","length"],
  Tops:    ["chest","shoulders","sleeve","length"],
  Bottoms: ["waist","hips","inseam","length"],
  Abayas:  ["chest","sleeve","length"],
};
const MEASURE_LABEL = { chest:"Chest (pit to pit)", waist:"Waist", hips:"Hips", length:"Length",
  shoulders:"Shoulders", sleeve:"Sleeve", inseam:"Inseam" };
const FITS = [["small","Runs small"],["true","True to size"],["large","Runs large"]];
const FLAWS_GARMENT = [["stain","Stain"],["pilling","Pilling"],["fading","Fading"],["hole","Small hole"],
  ["missing_button","Missing button"],["altered","Altered"],["loose_thread","Loose thread"],["odour","Odour"]];
const FLAWS_OTHER = [["scuff","Scuffs"],["wear","Visible wear"],["stain","Stain"],["loose_thread","Loose thread"],["odour","Odour"]];
const FLAW_LABEL = Object.fromEntries([...FLAWS_GARMENT, ...FLAWS_OTHER]);

function FitAndFlaws({form, setForm}) {
  const cat = form.category;
  const keys = MEASURE_KEYS[cat] || [];
  const flawOpts = GARMENT_CATS.includes(cat) ? FLAWS_GARMENT : FLAWS_OTHER;
  const flaws = form.flaws;            // null = not answered, [] = none
  const lbl = {fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6};
  const chip = (on) => ({background:on?C.terra:C.white,color:on?C.white:C.ink,
    border:`1.5px solid ${on?C.terra:C.border}`,borderRadius:20,padding:"7px 12px",
    fontSize:12,cursor:"pointer",fontFamily:"inherit"});
  const setM = (k, v) => {
    const n = Number(String(v).replace(",", "."));
    const m = { ...(form.measurements||{}) };
    if (v === "" || !(n > 0)) delete m[k]; else m[k] = Math.min(300, Math.round(n * 10) / 10);
    setForm({ ...form, measurements: m });
  };
  const toggleFlaw = (k) => {
    const cur = Array.isArray(flaws) ? flaws : [];
    setForm({ ...form, flaws: cur.includes(k) ? cur.filter(x=>x!==k) : [...cur, k] });
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {FIT_CATS.includes(cat) && (
        <div>
          <span style={lbl}>How does it fit?</span>
          <div role="radiogroup" aria-label="How does it fit" style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {FITS.map(([k,l])=>(
              <button key={k} type="button" role="radio" aria-checked={form.fit===k} className="tap-target"
                onClick={()=>setForm({...form,fit:form.fit===k?null:k})} style={chip(form.fit===k)}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {keys.length>0 && (
        <div>
          <span style={lbl}>Measurements, laid flat (cm) <span style={{textTransform:"none",fontWeight:400}}>· optional</span></span>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {keys.map(k=>(
              <label key={k} style={{display:"flex",flexDirection:"column",gap:4,fontSize:11,color:C.inkLt}}>
                {MEASURE_LABEL[k]}
                <input inputMode="decimal" value={(form.measurements||{})[k] ?? ""} onChange={e=>setM(k,e.target.value)}
                  placeholder="cm" aria-label={`${MEASURE_LABEL[k]} in centimetres`}
                  style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:14,
                    outline:"none",color:C.ink,background:C.white,boxSizing:"border-box",width:"100%"}}/>
              </label>
            ))}
          </div>
          <div style={{fontSize:11,color:C.inkLt,marginTop:6,lineHeight:1.5}}>
            Two numbers save a dozen messages: buyers compare them with something they already own.
          </div>
        </div>
      )}
      <div>
        <span style={lbl}>Anything to point out?</span>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          <button type="button" aria-pressed={Array.isArray(flaws)&&flaws.length===0} className="tap-target"
            onClick={()=>setForm({...form,flaws:[]})} style={chip(Array.isArray(flaws)&&flaws.length===0)}>Nothing — no flaws</button>
          {flawOpts.map(([k,l])=>(
            <button key={k} type="button" aria-pressed={Array.isArray(flaws)&&flaws.includes(k)} className="tap-target"
              onClick={()=>toggleFlaw(k)} style={chip(Array.isArray(flaws)&&flaws.includes(k))}>{l}</button>
          ))}
        </div>
        <div style={{fontSize:11,color:C.inkLt,marginTop:6,lineHeight:1.5}}>
          Saying so up front is what buyers trust — and a flaw she was told about is not a reason to back out at the meet.
        </div>
      </div>
    </div>
  );
}

// On the piece: size and how it runs, the measurements, and what the seller
// disclosed — together, because "will it fit" and "what's it like" are read
// as one question.
function FitPanel({item}) {
  const m = item.measurements && typeof item.measurements === "object" ? item.measurements : {};
  const mk = Object.keys(m).filter(k => MEASURE_LABEL[k]);
  const fit = FITS.find(([k]) => k === item.fit);
  const flaws = Array.isArray(item.flaws) ? item.flaws : null;
  if (!fit && mk.length === 0 && flaws === null) return null;
  return (
    <div style={{border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",marginBottom:14,background:C.white}}>
      {(fit || mk.length>0) && (
        <div style={{marginBottom:flaws!==null?10:0}}>
          <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:mk.length?6:0}}>
            Size {item.size}{fit ? ` · ${fit[1]}` : ""}
            {fit && fit[0]!=="true" && <span style={{fontWeight:400,color:C.inkLt}}>
              {fit[0]==="small" ? " — consider a size up" : " — consider a size down"}</span>}
          </div>
          {mk.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px 14px"}}>
              {mk.map(k=>(
                <span key={k} style={{fontSize:12,color:C.inkLt}}>
                  {MEASURE_LABEL[k].replace(" (pit to pit)","")} <b style={{color:C.ink}}>{m[k]} cm</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {flaws !== null && (
        <div style={{fontSize:12,color:C.inkLt,lineHeight:1.5,
          borderTop:(fit||mk.length)?`1px solid ${C.border}`:"none",paddingTop:(fit||mk.length)?10:0}}>
          <b style={{color:C.ink}}>{item.condition}</b>
          {flaws.length===0 ? " · no flaws noted by the seller"
            : <> · the seller points out: {flaws.map(f=>FLAW_LABEL[f]||f).join(", ").toLowerCase()}</>}
        </div>
      )}
    </div>
  );
}

// The price, and — when she has lowered it — what it was. The database keeps
// `previous_price` for the price-drop alert; showing it on the piece itself is
// how every resale app tells a buyer the seller is ready to move.
function PriceTag({item, size=14}) {
  const was = Number(item.previousPrice);
  const dropped = was > 0 && was > Number(item.price);
  return (
    <span style={{display:"inline-flex",alignItems:"baseline",gap:5,flexWrap:"wrap",minWidth:0}}>
      <span style={{color:C.terraTx,fontWeight:800,fontSize:size,whiteSpace:"nowrap"}}>{money(item.price)}</span>
      {dropped && <s aria-label={`was ${money(was)}`} style={{color:C.inkLt,fontSize:Math.round(size*0.72),whiteSpace:"nowrap"}}>{money(was)}</s>}
    </span>
  );
}

function ItemTile({item,onSave,onClick,loading}) {
  // A tile waiting on its own data renders the skeleton at the same size,
  // so its neighbours never move when it resolves.
  if (loading || (item && item.pending)) return <ItemSkeleton/>;
  return (
    <div onClick={onClick} style={{cursor:"pointer",borderRadius:14,overflow:"hidden",
      background:C.white,border:`1px solid ${C.border}`,boxShadow:"0 1px 6px #0000000a",
      transition:"transform 0.15s"}}
      onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
      onMouseLeave={e=>e.currentTarget.style.transform=""}>
      <div className="lili-ratio-tile">
        <ItemPhoto item={item}/>
        <button className="tap-round" aria-label="Save" onClick={e=>{e.stopPropagation();onSave(item.id)}} style={{
          position:"absolute",top:8,right:8,width:30,height:30,borderRadius:"50%",
          background:item.saved?C.btn:C.scrimDD,
          border:`1.5px solid ${item.saved?C.terra:C.border}`,
          display:"flex",alignItems:"center",justifyContent:"center",
          cursor:"pointer",fontSize:14,color:item.saved?C.white:C.inkLt,
          backdropFilter:"blur(4px)"}}>
          <Icon name="heart" size={17} filled={!!item.saved}/>
        </button>
        {/* Same derivation as the New In strip — the badge and the strip
            disagreeing about what "new" means would be worse than either. */}
        {isNewArrival(item) && (
          <div style={{position:"absolute",top:8,left:8,
            background:C.btn,color:C.onBtn,fontSize:9,fontWeight:700,
            padding:"2px 7px",borderRadius:10}}>{t("new")}</div>
        )}
      </div>
      <div style={{padding:"10px 10px 12px"}}>
        {/* Brand first, as luxury resale reads: it is what she scans the grid for. */}
        {item.brand && <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:C.inkLt,
          textTransform:"uppercase",marginBottom:2,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.brand}</div>}
        <div style={{fontSize:13,fontWeight:600,color:C.ink,lineHeight:1.3,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
        <div style={{fontSize:10,color:C.inkLt,marginBottom:4,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.titleAr}</div>
        <PriceTag item={item} size={14}/>
        {/* Size and condition read together, as one line, under the price —
            the two things she filters on in her head before she taps. */}
        <div style={{fontSize:11,color:C.inkLt,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {[item.size && item.size!=="OS" ? `Size ${item.size}` : null, item.condition].filter(Boolean).join(" · ")}
        </div>
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
              {item.brand && <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:C.inkLt,
                textTransform:"uppercase",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.brand}</div>}
              <div style={{fontSize:12,fontWeight:600,color:C.ink,lineHeight:1.3,
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
              <div style={{marginTop:3}}><PriceTag item={item} size={13}/></div>
              <div style={{fontSize:10,color:C.inkLt,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {[item.size && item.size!=="OS" ? `Size ${item.size}` : null, item.condition].filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
function PriceContext({ item }) {
  const [band, setBand] = useState(null);
  useEffect(() => {
    if (!item) return;
    let alive = true;
    import("./data/resaleValue.js").then(({ referenceBand }) => {
      if (!alive) return;
      setBand(referenceBand({ brand:item.brand, title:item.title,
                              subtitle:item.subtitle, category:item.category,
                              condition:item.condition }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [item && item.id]);

  if (!band) return null;
  const price = Number(item.price) || 0;
  const range = `AED ${band.low.toLocaleString()}–${band.high.toLocaleString()}`;
  const where = price <= 0 ? null
    : price < band.low ? "This one is under that range."
    : price > band.high ? "This one is above that range."
    : "This one sits inside that range.";

  return (
    <div style={{background:C.sand,border:`1px solid ${C.border}`,borderRadius:12,
      padding:"10px 12px",marginBottom:14}}>
      <div style={{fontSize:11,color:C.ink,lineHeight:1.5}}>
        Pieces of this kind usually resell here for <b>{range}</b>.{where ? ` ${where}` : ""}
      </div>
      <div style={{fontSize:10,color:C.inkLt,lineHeight:1.5,marginTop:4}}>
        A guide from published resale data, not an appraisal of this piece.
      </div>
    </div>
  );
}

// ── item detail modal ──────────────────────────────────────────────────────
function ItemModal({item,shop,onSave,onClose,onOffer,setTab,onAddToCart,onReport,onFollow,following,onMessageSeller}) {
  const trap = useFocusTrap(onClose, {active: !!item});
  if(!item) return null;
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
              <div style={{fontSize:10,color:C.inkLt,marginTop:1}}>the price she's asking</div>
            </div>
          </div>

          <PriceContext item={item}/>

          {/* tags */}
          <div style={{display:"flex",gap:7,marginBottom:14,flexWrap:"wrap"}}>
            {[["Brand",item.brand],["Condition",item.condition],["Size",item.size],["Era",item.era]].map(([l,v])=>(
              <div key={l} style={{background:C.sand,borderRadius:8,padding:"5px 10px"}}>
                <div style={{fontSize:9,color:C.inkLt,fontWeight:700,letterSpacing:0.5}}>{l.toUpperCase()}</div>
                <div style={{fontSize:11,color:C.ink,fontWeight:600}}>{v}</div>
              </div>
            ))}
          </div>

          <FitPanel item={item}/>

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
              We can't load this seller's shop right now, so we can't tell you
              whether she sells privately or as a business — and that changes
              your rights. Open the piece again in a moment before you commit to
              anything.
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
                  {earnedFollowers(shop) !== null && <span style={{fontSize:10,color:C.inkLt}}>· {earnedFollowers(shop)} followers</span>}
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
          <div style={{fontSize:11,color:C.inkLt,lineHeight:1.6,marginBottom:18,
            paddingTop:12,borderTop:`1px solid ${C.border}`}}>
            lili doesn't take payment or handle delivery. You and the seller agree
            how to pay and where to meet.
          </div>

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
              <Icon name="cart" size={22} stroke={1.6}/><span className="sr-only">{t("add_to_cart")}</span>
            </button>
            <button onClick={()=>onOffer(item)} style={{flex:1,background:C.white,color:C.terraTx,
              border:`1.5px solid ${C.terra}`,borderRadius:24,padding:"8px 0",
              fontWeight:700,cursor:"pointer",fontSize:13,lineHeight:1.25}}>
              {T.makeOffer[0]}<br/><span style={{fontSize:11,fontWeight:600}}>{T.makeOffer[1]}</span>
            </button>
            <button onClick={()=>{ onMessageSeller && onMessageSeller(item); onClose(); }}
              style={{flex:1.2,background:C.btn,color:C.onBtn,border:"none",borderRadius:24,
                padding:"8px 0",fontWeight:700,cursor:"pointer",fontSize:13,lineHeight:1.25}}>
              {T.messageSelller[0]}<br/><span style={{fontSize:11,fontWeight:600}}>{T.messageSelller[1]}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Every photo she uploaded, swiped like any gallery. The screen used to show
// the first photo under three dots that never moved — whatever the listing
// held — so a buyer had no way to see the other angles she was promised.
function ItemGallery({item, onClose, onSave}) {
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
function PayoutBox({price}) {
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
          {b.minimumApplied && <span style={{fontSize:10}}> (minimum {fees.money(fees.MINIMUM_FEE)})</span>}
        </span>
        <span>− {fees.money(b.commission)}</span>
      </div>
      <div style={{fontSize:10,color:C.inkLt,marginTop:8,lineHeight:1.6,
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
function OfferModal({item,shop,onClose,onSubmit}) {
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
    import("./data/resaleValue.js").then(({ referenceBand }) => {
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
            <div style={{fontSize:10,color:C.inkLt,textAlign:"center",marginTop:10,lineHeight:1.55}}>
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

// ── filters panel ──────────────────────────────────────────────────────────
function FiltersPanel({filters,setFilters,onClose,items}) {
  const trap = useFocusTrap(onClose);
  const [local,setLocal] = useState({...filters});
  // Same predicate the grid uses — see discovery/filters.js for why there used
  // to be two, and why the number on the button could disagree with the screen
  // behind it.
  const count = items.filter(i=>matchesFilters(i,local)).length;
  // "Most Saved" needs a total the device does not have offline. Offering it
  // then sorting by zero would be the fourth dead control in this sheet.
  const sorts = availableSorts(items);
  // Only offer sizes that something in the catalogue actually is. A size chip
  // that can only ever produce an empty grid is a dead end with styling.
  const sizesInStock = SIZES.filter(s=>items.some(i=>String(i.size||"")===s));

  return (
    <div ref={trap} {...dialogProps("Filters")}
      style={{position:"fixed",top:0,right:0,bottom:0,left:0,zIndex:300,background:"#0008",display:"flex",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:C.cream,width:"88%",maxWidth:360,
        height:"100%",overflowY:"auto",display:"flex",flexDirection:"column"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
          padding:"16px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.cream,zIndex:1}}>
          <div>
            <div style={{fontFamily:"Georgia,serif",fontSize:18,color:C.ink,fontStyle:"italic"}}>{t("filters")}</div>
          </div>
          <button onClick={()=>setLocal({...EMPTY_FILTERS})}
            style={{background:"none",border:"none",cursor:"pointer",color:C.terraTx,fontSize:12,fontWeight:700}}>{t("reset")}</button>
        </div>

        <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:20,flex:1}}>
          {/* Sort */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>{t("sort_by")}</div>
            {sorts.map(o=>(
              <button key={o} onClick={()=>setLocal({...local,sort:o})} style={{
                display:"flex",justifyContent:"space-between",width:"100%",textAlign:"left",
                background:"none",border:"none",cursor:"pointer",padding:"10px 0",
                fontSize:13,color:local.sort===o?C.terraTx:C.ink,fontWeight:local.sort===o?700:400,
                borderBottom:`1px solid ${C.border}`}}>
                {o} {local.sort===o&&<Icon name="check" size={13} stroke={2.2} style={{display:"inline-block",verticalAlign:"-2px"}}/>}
              </button>
            ))}
          </div>

          {/* Category */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>{t("category")}</div>
            <select value={local.category||"All"} onChange={e=>setLocal({...local,category:e.target.value})}
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,
                fontSize:13,outline:"none",background:C.white,color:C.ink}}>
              {CATS.map(c=><option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </div>

          {/* Brand */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>{t("brand_2")}</div>
            <select value={local.brand||""} onChange={e=>setLocal({...local,brand:e.target.value})}
              style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,
                fontSize:13,outline:"none",background:C.white,color:C.ink}}>
              <option value="">{t("any_brand")}</option>
              {BRANDS.map(b=><option key={b}>{b}</option>)}
            </select>
          </div>

          {/* Condition */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>{t("condition")}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {CONDITIONS.map(c=>(
                <button key={c} onClick={()=>setLocal({...local,condition:local.condition===c?"":c})} style={{
                  background:local.condition===c?C.terra:C.white,
                  color:local.condition===c?C.white:C.ink,
                  border:`1px solid ${local.condition===c?C.terra:C.border}`,
                  borderRadius:20,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>{c}</button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>{t("price_range")}</div>
            <div style={{display:"flex",gap:10}}>
              <input inputMode="decimal" value={local.minPrice||""} onChange={e=>setLocal({...local,minPrice:parsePrice(e.target.value) ?? 0})}
                placeholder="Min" style={{flex:1,padding:"10px 10px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:13,outline:"none"}}/>
              <input inputMode="decimal" value={local.maxPrice===999999?"":local.maxPrice} onChange={e=>setLocal({...local,maxPrice:parsePrice(e.target.value) || 999999})}
                placeholder="Max" style={{flex:1,padding:"10px 10px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:13,outline:"none"}}/>
            </div>
          </div>

          {/* Size — wired in v2.9; it was stored and never read. Only sizes
              something in the catalogue actually is are offered. */}
          {sizesInStock.length>0 && (
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>{t("size")}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {sizesInStock.map(s=>(
                  <button key={s} onClick={()=>setLocal({...local,size:local.size===s?"":s})} style={{
                    background:local.size===s?C.terra:C.white,color:local.size===s?C.white:C.ink,
                    border:`1px solid ${local.size===s?C.terra:C.border}`,
                    borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer"}}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {/* The Colour swatch row was removed here, not disabled — see the
              note in discovery/filters.js. It filtered on a field the sell flow
              never asks for, so on a real catalogue it returned nothing. */}
        </div>

        <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,background:C.cream}}>
          <button onClick={()=>{
              setFilters(local);
              funnel.track(funnel.EVENTS.FILTER_APPLIED, { active: activeCount(local), results: count });
              if (local.sort && local.sort!==filters.sort) funnel.track(funnel.EVENTS.SORT_APPLIED, { sort: local.sort });
              onClose();
            }} style={{width:"100%",background:C.btn,
            color:C.onBtn,border:"none",borderRadius:30,padding:"14px 0",
            fontWeight:700,fontSize:14,cursor:"pointer"}}>
            Show {count} Results · عرض {count} نتيجة
          </button>
        </div>
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
  const toggle = (c) => setPicked(p => p.includes(c) ? p.filter(x=>x!==c) : [...p,c]);
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
        <button onClick={()=>{onSave(picked);onClose();}}
          style={{width:"100%",background:C.btn,color:C.onBtn,border:"none",borderRadius:30,
            padding:"14px 0",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
          {picked.length ? t("save") : t("show_me_everything")}
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
              <div style={{fontSize:10,color:C.inkLt,lineHeight:1.35}}>{lb}</div>
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
            <span style={{fontSize:10,color:C.inkLt}}>{s.labelAr}</span>
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
function HomePage({items,shops,onSave,setModal,filters,setFilters,stories,setActiveStory,cartCount,setTab,hydrated,onOpenNotifications,unreadCount=0,taste,personalise,onEditTaste}) {
  const [q,setQ] = useState("");
  const [showFilters,setShowFilters] = useState(false);
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
            <button className="tap-round" aria-label="Filters" onClick={()=>setShowFilters(true)} style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,padding:2}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8">
                <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
                <circle cx="8" cy="6" r="2" fill={C.cream}/><circle cx="16" cy="12" r="2" fill={C.cream}/><circle cx="10" cy="18" r="2" fill={C.cream}/>
              </svg>
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
                  fontSize:9,fontWeight:700,borderRadius:10,padding:"1px 5px",minWidth:16,
                  textAlign:"center",lineHeight:"14px"}}>{unreadCount > 9 ? "9+" : unreadCount}</div>
              )}
            </button>
            <button className="tap-round" aria-label="Cart" onClick={()=>setTab("cart")} style={{background:"none",border:"none",cursor:"pointer",padding:2,position:"relative"}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
              {cartCount > 0 && <div style={{position:"absolute",top:-2,right:-4,
                background:C.btn,color:C.onBtn,fontSize:9,fontWeight:700,
                borderRadius:10,padding:"1px 5px",minWidth:16,textAlign:"center",lineHeight:"14px"}}>{cartCount}</div>}
            </button>
          </div>
        </div>
        <SearchBar value={q} onChange={setQ}/>
        {/* cat chips */}
        <div style={{display:"flex",gap:8,overflowX:"auto",padding:"0 14px 10px"}}>
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

      {/* stories */}
      <StoriesBar stories={stories} shops={shops} onStoryTap={(s,sh)=>setActiveStory({story:s,shop:sh})}/>

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
              <span style={{fontSize:10,color:C.inkLt}}>{cat.ar}</span>
              {/* The count is the point: a category with nothing in it is a
                  door that opens onto an empty room, and this is cheaper than
                  letting her find that out by walking through it. */}
              <span style={{fontSize:10,color:C.inkLt}}>
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
function InviteBox() {
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
    already_used:       "That code has already been used.",
    unknown:            "We don't recognise that code. Check it against the message it came in.",
    empty:              "Type the code first.",
    sign_in_required:   "Sign in first — an invitation is attached to an account.",
    needs_real_account: "You're browsing without an account. Create one first, then enter the code.",
    too_many_tries:     "Too many attempts. Wait an hour and try again — and check you have the right code.",
    offline:            "We couldn't reach lili just now. Your code is fine; try again in a moment.",
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
          placeholder="Invitation code" aria-label="Invitation code"
          autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          style={{flex:1,minWidth:0,padding:"10px 12px",borderRadius:10,fontSize:13,
            border:`1px solid ${state==="bad"?C.red:C.border}`,outline:"none",
            background:C.cream,color:C.ink,fontFamily:"inherit"}}/>
        <button onClick={go} disabled={!code.trim()||state==="trying"} className="tap-target"
          style={{background:code.trim()?C.btn:C.sand,color:code.trim()?C.onBtn:C.inkLt,
            border:"none",borderRadius:10,padding:"0 16px",fontWeight:700,fontSize:13,
            cursor:code.trim()?"pointer":"default",flexShrink:0,fontFamily:"inherit"}}>
          {state==="trying"?"Checking…":"Enter"}
        </button>
      </div>
      {state==="bad" && (
        <div role="alert" style={{fontSize:12,color:C.redTx,marginTop:8,lineHeight:1.55}}>
          {REASON[reason]||REASON.unknown}
        </div>
      )}
    </div>
  );
}

function SellPage({myShop,onCreateShop,onAddItem,setTab,onListed}) {
  const { m: market, canSell } = useCompliance();
  const [screen,setScreen] = useState({verdict:"ok",findings:[]});
  const [mode,setMode] = useState("choose");
  const [photos,setPhotos] = useState([]);
  const [thumbs,setThumbs] = useState([]);
  const [step,setStep] = useState(1);
  const [auth,setAuth] = useState(null);   // v2.8: the authentication tier she actually chose
  const [publishing,setPublishing] = useState(false);
  const [publishError,setPublishError] = useState(null);
  const [stepError,setStepError] = useState(null);
  const [form,setForm] = useState({title:"",titleAr:"",category:"Dresses",size:"S",condition:"Like New",era:"Modern",brand:"",price:"",desc:"",fit:null,measurements:{},flaws:null});
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
          r.onerror = () => rej(new Error("Couldn't read that photo"));
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
        const { assess } = await import("./data/imageQuality.js");
        const found = assess(clean.quality);
        setPhotoFindings(found);
        if (found.length) funnel.track(funnel.EVENTS.PHOTO_ADVICE, { code: found[0].code });
      } catch (err) {
        setPhotoError(err.message || "Couldn't add that photo");
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
        setStepError({ message: "Picked up where you left off.", skippable: false });
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
      return { at: 1, message: "No photograph yet — a piece without one rarely sells." };
    if (step === 2 && !form.title.trim())
      return { at: 2, message: "No title yet. You'll need one to publish." };
    if (step === 2 && !form.brand)
      return { at: 2, message: "Which brand? It's the first thing a buyer searches for." };
    if (step === 3 && parsePrice(form.price) === null)
      return { at: 3, message: "No price yet. You'll need one to publish." };
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
    !form.title.trim() && { label: "a title", step: 2 },
    parsePrice(form.price) === null && { label: "a price", step: 3 },
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
        id:Date.now(),shopId:myShop?.id||99,
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
        brand:form.brand||"Other",category:form.category,
        condition:form.condition,era:form.era,size:form.size,
        // what a size label cannot say: how it runs, flat measurements, and
        // what she disclosed. Empty measurements are not sent as {}.
        fit:form.fit||null,
        measurements:Object.keys(form.measurements||{}).length ? form.measurements : null,
        flaws:Array.isArray(form.flaws) ? form.flaws : null,
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
        : "Your listing didn't reach lili — nothing was published. Please try again.");
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
    setForm({title:"",titleAr:"",category:"Dresses",size:"S",condition:"Like New",era:"Modern",brand:"",price:"",desc:"",fit:null,measurements:{},flaws:null});
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
        <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:22,color:C.ink,marginBottom:4}}>List an item</div>
        <div style={{fontSize:13,color:C.inkLt,marginBottom:28}}>{getLang()==="ar" ? "كيف تريدين إضافة قطعتك؟" : "How would you like to list?"}</div>
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
              <div style={{fontSize:12,opacity:0.85,marginTop:3}}>One piece. Photograph, a few details, price.</div>
            </div>
          </button>
          <button onClick={()=>{setMode("guided");setStep(1);}} style={{background:C.white,color:C.ink,
            border:`1.5px solid ${C.border}`,borderRadius:16,padding:"20px 18px",cursor:"pointer",
            textAlign:"left",display:"flex",alignItems:"center",gap:14}}>
            <Icon name="sparkle" size={34} style={{color:C.terraTx}}/>
            <div>
              <div style={{fontWeight:700,fontSize:16,color:C.ink}}>Guided Luxury List</div>
              <div style={{fontSize:12,color:C.inkLt,marginTop:3}}>Full details, provenance, maximum price. For your best pieces.</div>
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
              <div style={{fontSize:12,color:C.inkLt,marginTop:3}}>Clearing a wardrobe? Pick every photograph, name and price each one, list them together.</div>
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
          {step===1?(isGuided?"Add Photos":t("add_photos")):
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
        <div role="alert" style={{background:"#FBF0EE",borderBottom:`1px solid ${C.red}`,
          padding:"10px 14px",fontSize:12,color:C.ink,lineHeight:1.5,
          display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <span>{stepError.message}</span>
          {stepError.skippable && (
            <button onClick={()=>{setStepError(null);setStep(s=>s+1);}}
              style={{background:"none",border:"none",cursor:"pointer",flexShrink:0,
                color:C.terraTx,fontSize:12,fontWeight:700,fontFamily:"inherit",
                textDecoration:"underline"}}>
              Continue anyway
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
          <span style={{fontSize:11,color:C.inkLt}}>Step {step} of {totalSteps}</span>
          <span style={{fontSize:11,color:step===totalSteps?C.terraTx:C.inkLt,
            fontWeight:step===totalSteps?700:400}}>
            {step===totalSteps ? "Last step — then you're live"
              : `${totalSteps-step} to go`}
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
              Add up to {LIMITS.maxPerListing} photos · أضيفي حتى {LIMITS.maxPerListing} صور
            </p>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
              {photos.map((p,i)=>(
                <div key={i} className="lili-ratio-1" style={{borderRadius:10,overflow:"hidden",position:"relative"}}>
                  <img src={p} alt={i===0?"Cover photo":`Photo ${i+1}`} style={{objectFit:"cover"}}/>
                  <button onClick={()=>setPhotos(ph=>ph.filter((_,j)=>j!==i))} style={{
                    position:"absolute",top:4,right:4,background:C.btn,border:"none",
                    borderRadius:"50%",width:22,height:22,color:C.onBtn,cursor:"pointer",fontSize:12,
                    display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="close" size={14} stroke={2}/></button>
                  {i===0 && <div style={{position:"absolute",bottom:4,left:4,background:"#000a",
                    color:C.white,fontSize:9,padding:"2px 6px",borderRadius:8}}>Cover</div>}
                </div>
              ))}
              {photos.length<LIMITS.maxPerListing && (
                <label className="lili-ratio-1" style={{borderRadius:10,border:`2px dashed ${C.border}`,
                  background:C.white,cursor:"pointer"}}>
                  <input type="file" accept="image/*" multiple onChange={handlePhotos} style={{display:"none"}}/>
                  <span className="lili-fill" style={{display:"flex",flexDirection:"column",
                    alignItems:"center",justifyContent:"center",gap:5}}>
                    <Icon name="plus" size={26}/>
                    <span style={{fontSize:11,color:C.terraTx,fontWeight:600}}>Add Photo</span>
                    <span style={{fontSize:10,color:C.inkLt}}>Photos ({photos.length}/{LIMITS.maxPerListing})</span>
                  </span>
                </label>
              )}
            </div>
            {photoError && (
              <div style={{fontSize:12,color:C.red,marginTop:8,lineHeight:1.5}}>{photoError}</div>
            )}
            <div style={{fontSize:11,color:C.inkLt,marginTop:8,lineHeight:1.55}}>
              Location data is removed from every photo before it's saved — a
              picture taken at home won't share where that is.
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
            {[[t("title"),"title","e.g. Chanel Classic Flap Bag"],
              [t("arabic_title"),"titleAr","مثل: شانيل كلاسيك فلاب"],
              [t("brand"),"brand","e.g. Chanel"],
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
                  style={{width:"100%",padding:"12px 12px",borderRadius:10,border:`1px solid ${C.border}`,
                    fontSize:14,outline:"none",color:C.ink,boxSizing:"border-box",
                    textAlign:key==="titleAr" ? "right" : alignStart()}}/>
              </div>
            ))}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {[["Category","category",ITEM_CATS],["Size","size",SIZES],
                ["Condition","condition",CONDITIONS],["Era","era",ERAS]].map(([lbl,key,opts])=>(
                <div key={key}>
                  <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{lbl}</label>
                  <select value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}
                    style={{width:"100%",padding:"10px 10px",borderRadius:10,border:`1px solid ${C.border}`,
                      fontSize:13,outline:"none",background:C.white,color:C.ink}}>
                    {opts.map(o=><option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <FitAndFlaws form={form} setForm={setForm}/>
            <div>
              <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{t("description")}</label>
              <textarea value={form.desc} onChange={e=>setForm({...form,desc:e.target.value})}
                placeholder="Describe your piece — condition details, why you loved it, any wear... وصف القطعة"
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
                  <div style={{fontWeight:600,fontSize:13,color:C.ink}}>{form.title||"Your Item"}</div>
                  <div style={{fontSize:11,color:C.inkLt}}>{form.condition} · Size {form.size}</div>
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
              <div style={{background:C.white,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.ink,marginBottom:6}}> Offers</div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:13,color:C.inkLt}}>Accept offers from buyers</span>
                  <div style={{width:44,height:24,borderRadius:12,background:C.terra,position:"relative",cursor:"pointer"}}>
                    <div style={{position:"absolute",right:2,top:2,width:20,height:20,borderRadius:"50%",background:C.white}}/>
                  </div>
                </div>
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
              <div role="alert" style={{background:"#FBF0EE",border:`1.5px solid ${C.red}`,
                borderRadius:12,padding:"12px 14px",fontSize:12,lineHeight:1.55,color:C.ink}}>
                <b style={{color:C.redTx}}>Not published.</b> {publishError}
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
                Still needed: {missing.map((mm,ix)=>(
                  <span key={mm.label}>
                    {ix>0 && " and "}
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
                Independent verification is not live yet — it needs an
                authentication partner, and we would rather say so than imply
                a check nobody performs. Until it is, provenance photographs do
                this work: the serial or date code, the card, the receipt.
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[["own","I have the receipt, card or serial","I'll photograph what came with it.",t("free"),true],
                  ["expert","Expert verification","Third-party authentication partner.","Not yet available",false],
                  ["inperson","In-person verification","Physical inspection in Dubai.","Not yet available",false],
                ].map(([id,t,d,p,available])=>(
                  <label key={id} style={{background:C.sand,borderRadius:10,padding:"12px 14px",
                    display:"flex",alignItems:"center",gap:12,opacity:available?1:0.55,
                    cursor:available?"pointer":"default"}}>
                    <input type="radio" name="auth" value={id} checked={auth===id} disabled={!available}
                      onChange={()=>setAuth(id)} style={{accentColor:C.terra}}/>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,color:C.ink}}>{t}</div>
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
              <div role="alert" style={{background:"#FBF0EE",border:`1.5px solid ${C.red}`,
                borderRadius:12,padding:"12px 14px",fontSize:12,lineHeight:1.55,color:C.ink}}>
                <b style={{color:C.redTx}}>Not published.</b> {publishError}
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
                Still needed: {missing.map((mm,ix)=>(
                  <span key={mm.label}>
                    {ix>0 && " and "}
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

function CreateShopForm({onCreateShop}) {
  const [form,setForm] = useState({name:"",nameAr:"",bio:"",bioAr:"",banner:C.terra,sellerType:""});
  const [showAgreement,setShowAgreement] = useState(false);

  // The seller agreement is asked for HERE, not at signup — a buyer must
  // never be made to accept seller obligations they'll never take on.
  if (showAgreement) return (
    <AgreementSheet clauses={sellerClausesFor("listing")} surface="seller"
      title="Before your first piece goes up" subtitle="قبل أول قطعة"
      intro="Five things you're promising your buyers. Tap any line to read it in full — English or العربية. The rest, about getting paid, we'll ask when you're actually being paid."
      ctaLabel="Agree and open my shop"
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
            width:"100%",textAlign:"left",display:"flex",gap:12,alignItems:"flex-start",
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
          <div style={{fontSize:12,color:C.inkLt,marginTop:3}}>{form.bio||"Add a bio later in Settings"}</div>
        </div>
      </div>
      ) : null}
      {[[t("shop_name"),"name","e.g. Desert Rose Closet"]].map(([lbl,key,ph])=>(
        <div key={key}>
          <label style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:6}}>{lbl}</label>
          <input value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})} placeholder={ph}
            style={{width:"100%",padding:"12px 12px",borderRadius:10,border:`1px solid ${C.border}`,
              fontSize:13,outline:"none",color:C.ink,boxSizing:"border-box"}}/>
        </div>
      ))}
      <div style={{fontSize:12,color:C.inkLt,lineHeight:1.55,marginTop:-2}}>
        Arabic name, bio and colour are all in Settings whenever you fancy —
        none of them should stand between you and your first piece.
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
        {!form.sellerType ? "Tell us how you're selling"
          : !form.name.trim() ? "Give your shop a name"
          : t("continue")}
      </button>
    </div>
  );
}

// ── my shop ────────────────────────────────────────────────────────────────
function MyShopPage({shop,items,setTab,justListed,onDismissListed,onMarkSold,onTakeDown}) {
  const myItems = items.filter(i=>i.shopId===shop.id && i.status!=="removed");
  const sold = myItems.filter(i=>i.status==="sold").length;
  const [busy,setBusy] = useState(null);
  const [err,setErr] = useState(null);
  const act = async (id, fn) => {
    setBusy(id); setErr(null);
    try { await fn(); } catch(e) { setErr((e && e.message) || "That didn't go through."); }
    finally { setBusy(null); }
  };
  const badge = (st) => st==="sold" ? t("status_sold")
                     : st==="in_review" ? t("held_for_review")
                     : st==="removed" ? t("status_removed") : null;
  return (
    <div style={{paddingBottom:72}}>
      {/* Peak-end. The one flow this marketplace depends on used to finish by
          simply disappearing — no acknowledgement, no sight of the thing she
          made. Everything in this card is true: her piece, at her price, and
          whichever of the two states the screening step actually returned. */}
      {justListed && (
        <div style={{margin:"12px 14px 0",padding:"12px 14px",background:C.white,
          border:`1px solid ${C.border}`,borderRadius:14,display:"flex",gap:12,
          alignItems:"center"}}>
          <div style={{width:44,height:56,borderRadius:8,overflow:"hidden",flexShrink:0,
            background:C.sand,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {justListed.thumb
              ? <img src={justListed.thumb} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
              : <Icon name={ICON_FOR_CAT[justListed.category]||"dress"} size={20} style={{color:C.inkLt}}/>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:C.ink}}>
              {justListed.heldForReview ? t("held_for_review") : t("its_live")}
            </div>
            <div style={{fontSize:12,color:C.inkLt,whiteSpace:"nowrap",overflow:"hidden",
              textOverflow:"ellipsis",marginTop:2}}>
              {justListed.title}{justListed.price ? ` · ${money(justListed.price)}` : ""}
            </div>
          </div>
          <button onClick={onDismissListed} aria-label={t("dismiss")} className="tap-round"
            style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,flexShrink:0}}>
            <Icon name="close" size={13} stroke={2}/>
          </button>
        </div>
      )}
      <div style={{background:shop.banner||C.terra,height:82,position:"relative"}}/>
      <div style={{padding:"0 14px 20px"}}>
        <div style={{marginTop:-26,marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:C.white,
            border:`3px solid ${C.white}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,
            boxShadow:"0 2px 8px #0001"}}>
            <span style={{fontFamily:"Georgia,serif",fontWeight:700,fontSize:24,color:C.terraTx}}>{(shop.name||"?").trim().charAt(0).toUpperCase()}</span>
          </div>
          <button onClick={()=>setTab("sell")} style={{background:C.btn,color:C.onBtn,border:"none",
            borderRadius:20,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer"}}>
            {t("list_item")}
          </button>
        </div>
        <div style={{fontWeight:700,fontSize:18,color:C.ink}}>{shop.name}</div>
        {shop.nameAr && <div style={{fontSize:13,color:C.inkLt,marginTop:1}}>{shop.nameAr}</div>}
        <div style={{fontSize:12,color:C.inkLt,marginTop:4}}>{shop.bio}</div>
        <div style={{display:"flex",gap:20,marginTop:12,paddingBottom:14,borderBottom:`1px solid ${C.border}`}}>
          {[[myItems.length,t("listings")],[shop.followers||0,t("followers")],[sold,t("sales")]].map(([n,l])=>(
            <div key={l}><span style={{fontWeight:800,color:C.terraTx,fontSize:16}}>{n}</span>
              <span style={{fontSize:10,color:C.inkLt,marginLeft:4}}>{l}</span></div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginTop:14}}>
          {myItems.map(item=>(
            <div key={item.id} style={{background:C.white,borderRadius:12,overflow:"hidden",border:`1px solid ${C.border}`}}>
              <div className="lili-ratio-tile" style={{overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",
                background:`linear-gradient(145deg,${item.color},${item.color}99)`,fontSize:44}}>
                {item.photo?<img src={item.photo} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Placeholder item={item} size={40}/>}
              </div>
              <div style={{padding:"10px 10px"}}>
                <div style={{fontSize:12,fontWeight:600,color:C.ink,lineHeight:1.3,
                  whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.title}</div>
                <div style={{color:C.terraTx,fontWeight:700,fontSize:13,marginTop:3}}>{money(item.price)}</div>
                {badge(item.status) && (
                  <div style={{fontSize:10,fontWeight:700,color:C.inkLt,marginTop:3,
                    textTransform:"uppercase",letterSpacing:0.5}}>{badge(item.status)}</div>
                )}
                {/* A seller could list a piece and never touch it again: no
                    way to say it had sold, and no way to take it down. */}
                {(onMarkSold || onTakeDown) && !item.pending && (
                  <div style={{display:"flex",gap:6,marginTop:8}}>
                    {onMarkSold && (item.status==="live" || item.status==="sold") && (
                      <button disabled={busy===item.id}
                        onClick={()=>act(item.id,()=>onMarkSold(item.id, item.status!=="sold"))}
                        style={{flex:1,padding:"6px 4px",borderRadius:8,fontSize:11,fontWeight:700,
                          cursor:"pointer",background:"none",color:C.terraTx,border:`1px solid ${C.terra}`}}>
                        {item.status==="sold" ? t("relist") : t("mark_sold")}
                      </button>
                    )}
                    {onTakeDown && (
                      <button disabled={busy===item.id}
                        onClick={()=>{ if (window.confirm(t("take_down_confirm"))) act(item.id,()=>onTakeDown(item.id)); }}
                        style={{flex:1,padding:"6px 4px",borderRadius:8,fontSize:11,fontWeight:600,
                          cursor:"pointer",background:"none",color:C.inkLt,border:`1px solid ${C.border}`}}>
                        {t("take_down")}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {err && <div role="alert" style={{fontSize:12,color:C.terraTx,marginTop:10}}>{err}</div>}
        {myItems.length===0 && (
          <div style={{textAlign:"center",padding:"60px 20px",color:C.inkLt}}>
            <div style={{fontSize:36,marginBottom:10}}></div>
            <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:15,color:C.terraTx}}>{t("your_shop_is_empty")}</div>
            <div style={{fontSize:12,color:C.inkLt,marginTop:6,lineHeight:1.6,maxWidth:250,margin:"6px auto 0"}}>
              Photo, details, price — about a minute. Your first piece is the hardest;
              after that it's muscle memory.
            </div>
            <div style={{fontSize:12,marginTop:6}}>Tap "+ List Item" to add your first piece</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── sellers ────────────────────────────────────────────────────────────────
function SellersPage({shops,items,setTab,setViewShop,onFollow,isFollowing}) {
  const [q,setQ] = useState("");
  // Folded, so "Nadia's" finds "Nadias" and an Arabic name matches however it
  // was typed. Was `includes` on the raw strings.
  const filtered = q.trim()
    ? shops.filter(s=>{
        const hay = tokens(`${s.name||""} ${s.nameAr||""} ${s.handle||""}`);
        return tokens(q).every(w=>!!fuzzyIncludes(hay,w));
      })
    : shops;
  return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.terraTx}}>{t("sellers")}</span>}/>
      <div style={{padding:"10px 14px",background:C.cream,borderBottom:`1px solid ${C.border}`}}>
        <SearchBar value={q} onChange={setQ}/>
      </div>
      <div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(shop=>{
          const count = items.filter(i=>i.shopId===shop.id).length;
          return (
            <div key={shop.id} onClick={()=>{setViewShop(shop);setTab("shopview");}}
              style={{background:C.white,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.border}`,
                cursor:"pointer",display:"flex",alignItems:"center",gap:12,boxShadow:"0 1px 4px #0000000a"}}>
              <Avatar shop={shop} size={46}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:14,color:C.ink}}>{shop.name}</div>
                <div style={{fontSize:11,color:C.inkLt}}>{shop.nameAr} · {shop.handle}</div>
                <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                  <Stars rating={shop.rating} reviews={shop.reviews} shop={shop}/>
                  <span style={{fontSize:10,color:C.inkLt}}>{earnedFollowers(shop) !== null ? `· ${earnedFollowers(shop)} · ${count} items` : `· ${count} items`}</span>
                </div>
              </div>
              {/* v2.9: also had no onClick. */}
              <button onClick={e=>{e.stopPropagation();onFollow&&onFollow(shop.id);}}
                style={{background:isFollowing&&isFollowing(shop.id)?C.terra:"none",
                  border:`1.5px solid ${C.terra}`,color:isFollowing&&isFollowing(shop.id)?C.white:C.terraTx,
                  borderRadius:20,padding:"5px 14px",fontSize:12,fontWeight:600,cursor:"pointer",
                  flexShrink:0,fontFamily:"inherit"}}>
                {isFollowing&&isFollowing(shop.id)?T.following?.[0]||"Following":T.follow[0]}
              </button>
            </div>
          );
        })}
        {/* v2.9: `filtered.map` had no length guard, so zero shops — or a
            seller search that matched none — rendered a blank page under the
            search bar with nothing to explain it. */}
        {filtered.length===0 && (
          <div style={{textAlign:"center",padding:"46px 20px",color:C.inkLt}}>
            <Icon name="shops" size={28} stroke={1.4} style={{color:C.terra,marginBottom:10,opacity:0.8}}/>
            <div style={{fontSize:14,color:C.ink}}>
              {q.trim() ? `No seller called "${q}"` : t("no_shops_open_yet")}
            </div>
            <div style={{fontSize:12,marginTop:6,lineHeight:1.6,maxWidth:270,margin:"6px auto 0"}}>
              {q.trim()
                ? "Try part of her name, in either language."
                : "lili is opening with a small group of sellers in Dubai. Their shops appear here as they open them."}
            </div>
            {q.trim() && (
              <button onClick={()=>setQ("")} style={{marginTop:14,background:"none",
                border:`1.5px solid ${C.terra}`,color:C.terraTx,borderRadius:20,padding:"8px 18px",
                fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Show all sellers</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// What buyers who met her said. Each review comes from a meet the two of them
// agreed on lili, shown without the reviewer's name, and only once both sides
// have reviewed (or 14 days have passed) — the server decides all three. The
// average waits for five, as Stars does; the words are worth showing from one.
function ShopReviews({shopId}) {
  const [list,setList] = useState(null);
  const [all,setAll] = useState(false);
  useEffect(()=>{
    let live = true;
    repo.getShopReviews(shopId).then(r=>{ if(live) setList(r||[]); });
    return ()=>{ live = false; };
  },[shopId]);
  if(!list || list.length===0) return null;
  const shown = all ? list : list.slice(0,3);
  return (
    <section aria-label="Reviews" style={{marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:C.ink,marginBottom:8}}>
        {list.length} review{list.length>1?"s":""} <span style={{fontWeight:400,color:C.inkLt,fontSize:11}}>· from meets arranged on lili</span>
      </div>
      {shown.map((r,i)=>(
        <div key={i} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:12,
          padding:"10px 12px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:r.body?4:0}}>
            <span aria-label={`${r.stars} out of 5`} style={{color:C.terraTx,display:"inline-flex",gap:1}}>
              {[1,2,3,4,5].map(n=><Icon key={n} name="star" size={12} filled={n<=r.stars}/>)}
            </span>
            <span style={{fontSize:11,color:C.inkLt}}>
              a buyer · {new Date(r.created_at).toLocaleDateString(undefined,{month:"short",year:"numeric"})}
            </span>
          </div>
          {r.body && <div style={{fontSize:13,color:C.ink,lineHeight:1.5}}>{r.body}</div>}
        </div>
      ))}
      {list.length>3 && !all && (
        <button onClick={()=>setAll(true)} style={{background:"none",border:"none",padding:0,
          color:C.terraTx,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
          Show all {list.length}
        </button>
      )}
    </section>
  );
}

function ShopViewPage({shop,items,onSave,setModal,onBack,onReport,onFollow,following}) {
  const [q,setQ] = useState("");
  if(!shop) return null;
  // Was a substring match on `title` alone — not the brand, not the Arabic
  // title, not the description. Inside one shop, of all places, where a buyer
  // is most likely to type a brand.
  const mine = items.filter(i=>i.shopId===shop.id);
  const shopItems = q.trim() ? searchLocal(mine,q,{limit:200}) : mine;
  return (
    <div style={{paddingBottom:72}}>
      <div style={{background:shop.banner||C.terra,height:76,position:"relative"}}>
        <button className="tap-round" onClick={onBack} style={{position:"absolute",top:14,left:14,background:C.scrimCC,
          border:"none",borderRadius:"50%",width:44,height:44,cursor:"pointer",fontSize:16,
          backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center"}}>{backArrow()}</button>
      </div>
      <div style={{padding:"0 14px 16px"}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:12,marginTop:-24,marginBottom:12}}>
          <Avatar shop={shop} size={52}/>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:18,color:C.ink}}>{shop.name}</div>
            <div style={{fontSize:12,color:C.inkLt}}>{shop.nameAr} · {shop.handle}</div>
          </div>
          {/* v2.9: a Follow button with no onClick. The third one in the app —
              the only wired one was inside the item modal. */}
          <button onClick={()=>onFollow&&onFollow(shop.id)}
            style={{background:following?C.terra:"none",border:`1.5px solid ${C.terra}`,
              color:following?C.white:C.terraTx,borderRadius:20,padding:"6px 16px",
              fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
            {following?"Following":"Follow"}
          </button>
        </div>
        <div style={{display:"flex",gap:20,marginBottom:12,paddingBottom:12,borderBottom:`1px solid ${C.border}`}}>
          {/* v2.8: "rating" left this row. With no reviews behind it the cell
              rendered an empty number under a label promising one, which reads
              worse than an absent stat. Counts that come from real rows stay;
              the earned signals below come from the server. */}
          {/* `shopItems` is the searched subset, so this cell used to say
              "1 items" the moment a buyer typed in the shop's own search box.
              The count is of the shop, not of the query. */}
          {[...(earnedFollowers(shop) !== null ? [[earnedFollowers(shop),"followers"]] : []),[mine.length,"items"]].map(([n,l])=>(
            <div key={l}><span style={{fontWeight:700,color:C.terraTx,fontSize:14}}>{n}</span>
              <span style={{fontSize:11,color:C.inkLt,marginLeft:3}}>{l}</span></div>
          ))}
        </div>
        <Stars rating={shop.rating} reviews={shop.reviews} shop={shop}/>
        <div style={{fontSize:12,color:C.inkLt,marginTop:6,marginBottom:14}}>{shop.bio}</div>
        <ShopReviews shopId={shop.id}/>
        {mine.length>0 && <SearchBar value={q} onChange={setQ}/>}
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginTop:8}}>
          {shopItems.map(item=><ItemTile key={item.id} item={item} onSave={onSave} onClick={()=>setModal(item)}/>)}
        </div>
        {/* v2.9: `shopItems.map` had no length guard. A shop with nothing
            listed — which every shop is on its first day — rendered a bare
            grid under the bio, and a shop search that missed rendered the same
            thing, so a buyer could not tell which had happened. */}
        {shopItems.length===0 && (
          <div style={{textAlign:"center",padding:"40px 18px",color:C.inkLt}}>
            <Icon name="bag" size={26} stroke={1.4} style={{color:C.terra,marginBottom:10,opacity:0.8}}/>
            <div style={{fontSize:13,color:C.ink}}>
              {mine.length===0 ? `${shop.name} hasn't listed anything yet` : `Nothing in this shop for "${q}"`}
            </div>
            <div style={{fontSize:12,marginTop:6,lineHeight:1.6}}>
              {mine.length===0
                ? "Follow her and you'll see the first piece when it goes up."
                : "Clear the search to see everything she has."}
            </div>
            {mine.length>0 && (
              <button onClick={()=>setQ("")} style={{marginTop:12,background:"none",
                border:`1.5px solid ${C.terra}`,color:C.terraTx,borderRadius:20,padding:"7px 16px",
                fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>Show everything</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── messages ───────────────────────────────────────────────────────────────
// ── messages ───────────────────────────────────────────────────────────────
//
//  v2.8 — this screen used to be a puppet show.
//
//  Threads lived in React state and the other woman was a `setTimeout`: 1.2
//  seconds after you sent anything, a reply was drawn at random from
//  ["Thanks for reaching out!", "Yes, still available!", "Can you share your
//  size?"]. A buyer had a warm exchange with an array. The seller was never
//  told anybody had written to her.
//
//  The database has had real threads all along — one per piece, readable only
//  by the two participants, `anon` holding no grant at all, messages immutable
//  after sending, live delivery over a realtime channel. `backend/remote.js`
//  implements every call. Nothing in the interface used any of it.
//
//  It does now, through data/conversations.js, with the same local-first rule
//  as the rest of the app. With no backend configured a message is stored on
//  the device and plainly marked as not sent — because the one thing this
//  screen must never do again is answer on a seller's behalf.
function MessagesPage({shops,items,onReport,openThreadId,onOpened,error}) {
  const [active,setActive] = useState(null);
  const [newMsg,setNewMsg] = useState("");
  const [threads,setThreads] = useState([]);
  const [thread,setThread] = useState([]);       // messages of the open thread
  const [sending,setSending] = useState(false);
  const [sendError,setSendError] = useState(null);
  const [safetyOpen,setSafetyOpen] = useState(true);
  const scrollRef = useRef();
  const liveThreads = convo.isRemote();   // named to avoid shadowing the `remote` module

  // ── normalising ──────────────────────────────────────────────────────────
  // v2.10 — there is now one shape, because there is one source. Threads used
  // to come from two places: the database on the remote path, and a `messages`
  // prop held in the root component's React state on the device path. The prop
  // is gone; conversations.js owns both paths and returns the same shape from
  // either, so this screen no longer has a branch that can disagree with
  // itself. A thread held on the device carries `local: true`, and that is the
  // only thing the screen needs to know.
  const asThread = (t, i) => ({
    key: t.id, id: t.id, shopId: t.shop_id, itemId: t.item_id,
    index: i, remote: !t.local,
  });

  // `delivered` is the honest field: false means it is sitting on this phone
  // and no one else has seen it. It is never assumed true for a message the
  // server has not acknowledged.
  const asMessage = (m, i) => ({
    key: m.id || i,
    mine: liveThreads ? m.sender_uid === myUid.current : m.sender_uid === "me",
    text: m.body, at: m.created_at,
    delivered: m.delivered !== false,
    read: !!m.read_at,
  });

  const myUid = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (liveThreads) myUid.current = await remote.currentUid();
        const list = await convo.getConversations();
        if (alive) setThreads(list || []);
      } catch (e) {
        console.warn("couldn't load conversations:", e && e.message);
      }
    })();
    return () => { alive = false; };
    // openThreadId is a dependency because a thread that was just created is
    // not in the list that was fetched before it existed. Without this the
    // buyer is sent to a screen that does not yet contain her conversation.
  }, [liveThreads, openThreadId]);

  // ── arriving from "Ask about these" ──────────────────────────────────────
  // The buyer tapped a button about one specific piece. Landing her on a list
  // of threads and asking her to find it again is the kind of small rudeness
  // that reads as the app not knowing what she just did. Once the thread she
  // asked for is in the list, open it.
  useEffect(() => {
    if (!openThreadId || !threads.length) return;
    const i = threads.findIndex((t) => String(t.id) === String(openThreadId));
    if (i >= 0) { setActive(i); onOpened && onOpened(); }
  }, [openThreadId, threads]);

  // ── open thread: load, mark read, and listen ─────────────────────────────
  const openThread = threads[active] ? asThread(threads[active], active) : null;

  useEffect(() => {
    let alive = true, unsubscribe = null;
    setSendError(null);
    if (!openThread) { setThread([]); return; }
    (async () => {
      // One call for both paths — conversations.js reads the device store when
      // there is no backend, so the screen no longer reaches into a raw thread
      // object to find messages by two possible property names.
      const msgs = await convo.getMessages(openThread.id);
      if (!alive) return;
      setThread(msgs);
      if (openThread.remote) {
        convo.markRead(openThread.id);
        unsubscribe = await convo.watchMessages(openThread.id, (m) => {
          setThread((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
          convo.markRead(openThread.id);
        });
      }
    })();
    return () => { alive = false; if (unsubscribe) unsubscribe(); };
  }, [openThread && openThread.key]);

  const send = async () => {
    const text = newMsg.trim();
    if (!text || sending || !openThread) return;
    setSending(true); setSendError(null);
    try {
      const saved = await convo.sendMessage(openThread.id, text);
      setNewMsg("");
      // The realtime channel echoes our own insert back; adding it here too
      // would double it, so on the remote path we let the channel deliver.
      if (!openThread.remote) setThread((prev) => [...prev, saved]);
    } catch (e) {
      if (e && e.code === "HELD_OFFLINE") {
        setNewMsg("");
        if (e.held) setThread((prev) => [...prev, e.held]);
      }
      setSendError(e && e.message ? e.message : "That didn't send. Try again.");
    } finally {
      setSending(false);
    }
  };

  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;},[thread,active]);

  const timeLabel = (at) => {
    if (!at) return "";
    if (typeof at === "string" && !/^\d{4}-/.test(at)) return at;   // device demo threads
    const d = new Date(at);
    if (isNaN(d)) return "";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.round(mins / 60)}h`;
    return d.toLocaleDateString();
  };

  if(active!==null && openThread) {
    const shop = shops.find(s=>s.id===openThread.shopId);
    const item = items.find(i=>i.id===openThread.itemId);
    const view = thread.map(asMessage);
    return (
      <div style={{display:"flex",flexDirection:"column",height:"100vh",paddingBottom:0}}>
        <TopBar left={<BackBtn onBack={()=>setActive(null)}/>}
          center={<div style={{textAlign:"center"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.ink}}>{shop?.name||"Seller"}</div>
            {/* Was "Online"/"Offline" against a boolean nothing maintained.
                The piece the two of you are talking about is both true and
                more useful at the top of a thread. */}
            <div style={{fontSize:10,color:C.inkLt,maxWidth:170,whiteSpace:"nowrap",
              overflow:"hidden",textOverflow:"ellipsis"}}>{item?.title||shop?.handle||""}</div>
          </div>}
          right={
            /* v2.8 — reporting from inside the thread. Harassment happens in
               the conversation, and asking someone to leave it, find the shop
               and report from there is asking most people not to bother. */
            <button
              onClick={()=>onReport && onReport({kind:"conversation",
                id:openThread.id, title:shop?.name||"this conversation",
                shopId:openThread.shopId, shopName:shop?.name})}
              aria-label="Report this conversation"
              className="tap-target"
              style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,
                display:"flex",alignItems:"center",padding:4}}>
              <Icon name="warning" size={16} stroke={2}/>
            </button>}/>
        {item && (
          <div style={{display:"flex",gap:10,padding:"10px 14px",background:C.white,borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:44,height:44,borderRadius:8,overflow:"hidden",flexShrink:0,
              background:`linear-gradient(145deg,${item.color},${item.color}99)`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
              {item.photo?<img src={item.photo} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Placeholder item={item} size={40}/>}
            </div>
            <div>
              <div style={{fontSize:13,fontWeight:600,color:C.ink}}>{item.title}</div>
              <div style={{fontSize:11,color:C.terraTx,fontWeight:700}}>{money(item.price)}</div>
            </div>
          </div>
        )}
        {safetyOpen && <MeetSafely onDismiss={()=>setSafetyOpen(false)}/>}
        {/* v2.9. MeetSafely says the right three things on a sheet she has to
            open, which makes it a disclaimer rather than a safety feature. The
            meet is now a thing in the thread that both of them agree to — see
            meet/MeetPlan.jsx, and meet/places.js for why nothing here claims a
            location is verified. */}
        <div style={{padding:"10px 14px 0"}}>
          <MeetPlan conversationId={openThread.id} itemId={item&&item.id}
            onReport={()=>onReport && onReport({kind:"conversation",
              id:openThread.id, title:shop?.name||"this conversation",
              shopId:openThread.shopId, shopName:shop?.name})}/>
        </div>
        <div ref={scrollRef} style={{flex:1,overflowY:"auto",padding:"14px",display:"flex",flexDirection:"column",gap:10}}>
          {view.length===0 && (
            <div style={{textAlign:"center",color:C.inkLt,fontSize:12,padding:"24px 12px",lineHeight:1.6}}>
              Nothing here yet. Say hello — sellers reply faster to a real
              question than to "is this available".
            </div>
          )}
          {view.map((m)=>(
            <div key={m.key} style={{display:"flex",justifyContent:m.mine?"flex-end":"flex-start"}}>
              {!m.mine && <Avatar shop={shop||{}} size={28}/>}
              {/* v2.9.1. This was marginLeft/marginRight, so under dir="rtl"
                  every message aligned to the wrong side and your own became
                  indistinguishable from hers. Of all the RTL faults in the app
                  this was the one that stopped a screen meaning anything. */}
              <div style={{maxWidth:"72%",
                ...(m.mine ? marginEnd(0) : marginStart(8)),
                ...(m.mine ? marginStart(0) : marginEnd(8)),
                background:m.mine?C.terra:C.white,
                color:m.mine?C.white:C.ink,
                borderRadius:m.mine?"18px 18px 4px 18px":"18px 18px 18px 4px",
                padding:"10px 14px",fontSize:13,lineHeight:1.45,
                border:m.mine?"none":`1px solid ${C.border}`}}>
                {m.text}
                <div style={{fontSize:10,opacity:0.6,marginTop:4,textAlign:alignEnd()}}>
                  {timeLabel(m.at)}
                  {m.mine && m.delivered === false && " · not sent"}
                  {m.mine && m.delivered !== false && m.read && " · read"}
                </div>
              </div>
            </div>
          ))}
        </div>
        {sendError && (
          <div role="alert" style={{padding:"8px 14px",background:"#FBF0EE",
            borderTop:`1px solid ${C.red}`,fontSize:12,color:C.ink,lineHeight:1.5}}>
            {sendError}
          </div>
        )}
        <div style={{padding:"10px 14px 14px",background:C.white,borderTop:`1px solid ${C.border}`,display:"flex",gap:10}}>
          <input value={newMsg} onChange={e=>setNewMsg(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&send()}
            maxLength={2000}
            aria-label="Type a message"
            placeholder={t("type_a_message")}
            style={{flex:1,padding:"10px 14px",borderRadius:24,border:`1px solid ${C.border}`,
              fontSize:13,outline:"none",fontFamily:"inherit"}}/>
          <button className="tap-round" onClick={send} disabled={sending||!newMsg.trim()}
            aria-label="Send message"
            style={{background:(sending||!newMsg.trim())?C.sand:C.btn,
              color:(sending||!newMsg.trim())?C.inkLt:C.onBtn,border:"none",
              borderRadius:"50%",width:44,height:44,cursor:sending?"default":"pointer",
              display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="send" size={17} stroke={2}/>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<span style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:18,color:C.terraTx}}>{t("messages")}</span>}/>
      {/* A conversation that could not be opened — a seller who has blocked
          you, a beta gate you are not part of — is said out loud. The old
          local-state path could not fail, so it never had to say anything;
          a real one can, and silence would leave her tapping a button that
          appears to do nothing. */}
      {error && <div style={{margin:"12px 14px",padding:"12px 12px",background:C.white,
        border:`1.5px solid ${C.red}`,borderRadius:12,fontSize:13,color:C.ink,
        lineHeight:1.55}}>{error}</div>}
      {threads.length===0
        ? <div style={{textAlign:"center",padding:"80px 20px",color:C.inkLt}}>
            <Icon name="chat" size={38} stroke={1.6} style={{color:C.terra,marginBottom:14}}/>
            <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:16,color:C.terraTx}}>No messages yet</div>
            <div style={{fontSize:12,marginTop:6}}>{getLang()==="ar" ? "راسلي أي بائعة من صفحة القطعة" : "Message a seller from any listing"}</div>
          </div>
        : <div>
            {threads.map((raw,i)=>{
              const t=asThread(raw,i);
              const shop=shops.find(s=>s.id===t.shopId);
              const item=items.find(it=>it.id===t.itemId);
              // v2.10 — this read `raw.last_body`. The column is `last_message`,
              // written by the touch_conversation trigger, so every preview on
              // the server path was an empty string and every thread in the
              // list looked like it had nothing in it. One source now, one
              // shape, and the device fallback fills the same two fields.
              const last = (raw.msgs||[])[(raw.msgs||[]).length-1];
              const preview = raw.last_message || (last && last.body) || "";
              const when = raw.last_at || (last && last.created_at) || "";
              return (
                <div key={t.key} onClick={()=>setActive(i)}
                  style={{display:"flex",gap:12,padding:"14px",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                  <Avatar shop={shop||{}} size={48}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontWeight:700,fontSize:13,color:C.ink}}>{shop?.name||"Seller"}</span>
                      <span style={{fontSize:10,color:C.inkLt}}>{timeLabel(when)}</span>
                    </div>
                    <div style={{fontSize:12,color:C.inkLt,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{preview}</div>
                    {item&&<div style={{fontSize:11,color:C.terraTx,marginTop:3,fontWeight:500}}>{item.title}</div>}
                  </div>
                </div>
              );
            })}
          </div>}
    </div>
  );
}

// ── profile ────────────────────────────────────────────────────────────────
function ProfilePage({myShop,items,setTab,onOpenLegal,onOpenLanguage,onOpenTheme,onOpenHelp,onOpenSettings,onOpenAuth,session,onSignOut}) {
  const saved=items.filter(i=>i.saved).length;
  const myItems=myShop?items.filter(i=>i.shopId===myShop.id).length:0;
  // v2.11 — the same thirteen rows, in three groups.
  //
  // `npm run uxlaws` counts the distinct decisions a screen asks for, and this
  // one asked for thirteen: a flat list where "Language" and "Purchases" and
  // "Delete my account" all look equally likely to be the thing you came for.
  // Hick's Law says the time to find one grows with the length of the list —
  // but it grows with the length of the list you have to SEARCH, and grouping
  // turns one list of thirteen into three of four or five.
  //
  // Nothing is removed, renamed or reordered within its group. The rows look
  // exactly as they did; there is a small label above each run, and the runs
  // are separated by the same gap that already sat around the block. Proximity
  // and common region, doing the work that reading thirteen labels was doing.
  const groups = [
    { title: t("your_shop_group"), rows: [
      {label:t("my_listings"),icon:"dress",action:()=>setTab(myShop?"myshop":"sell")},
      {label:t("offers"),icon:"handshake",action:()=>setTab("offers")},
      {label:t("messages"),icon:"chat",action:()=>setTab("messages")},
      {label:t("purchases"),icon:"cart",action:null,soon:true},
    ]},
    { title: t("your_account_group"), rows: [
      {label: session ? `Signed in as ${(session.user&&session.user.email)||"your account"}` : t("sign_in"),
       icon:"user", action: session ? onSignOut : onOpenAuth,
       trailing: session ? "Sign out" : null},
      {label:t("payment_methods"),icon:"card",action:null,soon:true},
      {label:t("addresses"),icon:"truck",action:null,soon:true},
      {label:t("privacy_safety"),icon:"shield",action:onOpenLegal},
    ]},
    { title: t("app_group"), rows: [
      {label:t("settings"),icon:"filter",action:onOpenSettings},
      {label:t("language"),icon:"globe",action:onOpenLanguage},
      {label:t("appearance"),icon:"theme",action:onOpenTheme},
      {label:t("help_support"),icon:"help",action:onOpenHelp},
    ]},
  ];
  return (
    <div style={{paddingBottom:72}}>
      <TopBar center={<Lili size={24}/>}
        right={<button aria-label="Appearance" className="tap-target" onClick={onOpenTheme}
          style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,
            display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Icon name="filter" size={19}/></button>}/>
      <div style={{padding:"20px 14px"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:C.sand,
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,
            border:`2.5px solid ${C.border}`,position:"relative"}}>
            <Icon name="user" size={34} stroke={1.3} style={{color:C.inkLt}}/>
          </div>
          {/* v2.10 — every one of these was invented, and the person reading
              them is the person they are about.
                · "Aisha Al Mansoori" and @aishaalmanoori — a name that is not
                  hers, on her own account.
                · a VERIFIED badge. Nothing verifies anybody. The badge means
                  something to a buyer looking at a seller, so minting one for
                  free on every install is the most expensive of these.
                · 156 followers and 78 following, on an app where nobody has
                  followed her.
                · a green presence dot, of the same kind removed from Avatar.
              What is left is what is true: the account she is signed in with,
              and how many pieces she has actually listed. */}
          <div style={{minWidth:0}}>
            <div style={{fontWeight:700,fontSize:18,color:C.ink}}>
              {(session && session.user && (session.user.email || (session.user.is_anonymous ? t("browsing_without_an_account") : null)))
                || t("your_account")}
            </div>
            <div style={{fontSize:12,color:C.inkLt}}>
              {myShop ? `@${myShop.handle || myShop.name}` : t("no_shop_open_yet")}
            </div>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"space-around",padding:"16px 0",
          background:C.white,borderRadius:14,border:`1px solid ${C.border}`,marginBottom:16}}>
          {/* Followers and following were hard-coded numbers. A count is shown
              once there is something counting it; until then the row carries
              the one figure that is real. */}
          {[[myItems,t("listings")],[myShop ? (myShop.followers || 0) : 0,t("followers")]].map(([n,l])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{fontWeight:800,fontSize:22,color:C.terraTx}}>{n}</div>
              <div style={{fontSize:10,color:C.inkLt,marginTop:2}}>{l}</div>
            </div>
          ))}
        </div>

        {myShop
          ? <div onClick={()=>setTab("myshop")} style={{background:myShop.banner||C.terra,borderRadius:14,
              padding:"14px 18px",cursor:"pointer",marginBottom:16,
              display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:C.white}}>{myShop.name}</div>
                <div style={{fontSize:12,color:C.white,opacity:0.8}}>{t("view_your_shop")}</div>
              </div>
              <span style={{fontSize:30}}></span>
            </div>
          : <button onClick={()=>setTab("sell")} style={{width:"100%",background:C.btn,color:C.onBtn,
              border:"none",borderRadius:14,padding:"16px 0",fontWeight:700,fontSize:14,cursor:"pointer",marginBottom:16}}>
              {t("open_your_shop")} 
            </button>}

        {/* The single bordered card that used to hold all thirteen rows is
            gone: each group carries its own, which is what makes them read as
            three regions rather than one list with headings in it. */}
        {groups.map((group, gi) => (
            <div key={group.title} style={{marginBottom: gi < groups.length - 1 ? 16 : 0}}>
              {/* Common region: one label, one run of rows, one border. The eye
                  resolves three groups faster than it reads thirteen labels. */}
              <div style={{fontSize:10,fontWeight:700,letterSpacing:0.8,
                textTransform:"uppercase",color:C.inkLt,padding:"0 4px 8px"}}>
                {group.title}
              </div>
              <div style={{background:C.white,borderRadius:14,border:`1px solid ${C.border}`,
                overflow:"hidden"}}>
                {group.rows.map((item,i)=>(
                  /* Six of these rows had action:null — they looked live, took
                     a tap and did nothing, which reads as a broken app rather
                     than an unfinished one. A row we cannot honour is visibly
                     not a button: dimmed, marked "Soon", out of the tab order. */
                  <button key={item.label} onClick={item.action||undefined}
                    disabled={!item.action}
                    aria-disabled={!item.action}
                    tabIndex={item.action?0:-1}
                    style={{width:"100%",textAlign:"left",padding:"14px 16px",background:"none",
                      border:"none",cursor:item.action?"pointer":"default",
                      opacity:item.action?1:0.55,
                      borderBottom:i<group.rows.length-1?`1px solid ${C.border}`:"none",
                      display:"flex",alignItems:"center",gap:12,fontSize:14,color:C.ink}}>
                    <Icon name={item.icon} size={19} style={{color:C.terraTx}}/>
                    {item.label}
                    {item.trailing
                      ? <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,color:C.terraTx,
                          border:`1px solid ${C.border}`,borderRadius:20,padding:"3px 10px"}}>{item.trailing}</span>
                      : item.action
                      ? <span style={{marginLeft:"auto",color:C.inkLt}}>›</span>
                      : <span style={{marginLeft:"auto",fontSize:10,fontWeight:700,
                          color:C.inkLt,border:`1px solid ${C.border}`,borderRadius:20,
                          padding:"2px 8px",whiteSpace:"nowrap"}}>Soon</span>}
                  </button>
                ))}
            </div>
          </div>
        ))}

        {/* v2.8: this panel used to read "Trusted by 10,000+ women in Dubai"
            over five filled stars, a 4.9 and "from 2,000+ reviews". None of
            those women existed. It is the same fabrication the trust rules
            forbid on a seller's shop, printed larger and about ourselves — and
            in this market it is also exposure: Federal Law No. 15 of 2020
            requires advertising that does not mislead, and the E-Commerce Law
            (Federal Decree-Law No. 14 of 2023) applies it to platforms.

            What replaces it is what is actually true today, which is a better
            story than the invented one: this is early, and being early is the
            offer. */}
        <div style={{textAlign:"center",marginTop:24,padding:"16px",
          background:C.white,borderRadius:14,border:`1px solid ${C.border}`}}>
          <div style={{fontFamily:"Georgia,serif",fontStyle:"italic",fontSize:15,
            color:C.ink,marginBottom:6}}>Early days, on purpose</div>
          <div style={{fontSize:12,color:C.inkLt,lineHeight:1.6}}>
            No inflated numbers here. Shops show what they have actually sold,
            and nothing before that. Ratings arrive when real buyers leave them.
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:18,marginTop:12,flexWrap:"wrap"}}>
            {[["tag","Every listing screened"],["lock","Messages stay private"],["scales","Reasons on every decision"]].map(([icon,t])=>(
              <span key={t} style={{fontSize:10,color:C.inkLt,display:"inline-flex",
                alignItems:"center",gap:4}}>
                <Icon name={icon} size={10} stroke={2}/>{t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── root ───────────────────────────────────────────────────────────────────
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
function CartPage({cart, shops, removeFromCart, setTab, onMessageSeller}) {
  const bySeller = cart.reduce((acc, i) => {
    (acc[i.shopId] = acc[i.shopId] || []).push(i);
    return acc;
  }, {});
  const sellerIds = Object.keys(bySeller);

  return (
    <div style={{paddingBottom:72}}>
      <div style={{background:C.cream, padding:"14px 16px", borderBottom:`1px solid ${C.border}`,
        display:"flex", alignItems:"center", gap:10}}>
        <button onClick={()=>setTab("home")} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:C.ink}}>{backArrow()}</button>
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
          <Icon name="cart" size={30} stroke={1.4} style={{color:C.terra, marginBottom:12, opacity:0.85}}/>
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
  const saveTaste = (picked) => {
    const value = (Array.isArray(picked) && picked.length)
      ? { categories: picked, at: new Date().toISOString() } : null;
    setTaste(value);
    store.setJSON(TASTE_KEY, value);
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
    repo.watchItems((fresh) => {
      if (!alive || !Array.isArray(fresh)) return;
      repo.mergeLive(fresh).then((merged) => { if (alive) setItems(merged); }).catch(() => {});
    })
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

  const effectiveTab = tab==="shopview"?"sellers":tab==="messages"?"profile"
                     :tab==="offers"?"profile":tab==="cart"?"home":tab;

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
        {tab==="home"       && <HomePage hydrated={hydrated} items={visibleItems} shops={visibleShops} onSave={onSave} setModal={setModal} filters={filters} setFilters={setFilters} stories={STORIES} setActiveStory={setActiveStory} cartCount={cartCount} setTab={setTab} onOpenNotifications={()=>setNotifOpen(true)} unreadCount={unread}
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
        {tab==="messages"   && <MessagesPage shops={shops} items={items} onReport={s=>setReporting(s)}
                              openThreadId={openThreadId} onOpened={()=>setOpenThreadId(null)}
                              error={messageError}/>}
        {tab==="offers"     && <OffersPage items={items} shops={shops} onBack={()=>setTab("profile")}/>}
        {tab==="cart"       && <CartPage cart={cart} shops={visibleShops} removeFromCart={removeFromCart} setTab={goTab}
                              onMessageSeller={messageSellerAbout}/>}
        </Suspense>

        <TabBar tab={effectiveTab} setTab={goTab} savedCount={savedCount} myShop={myShop} cartCount={cartCount}/>

        {/* Every lazily-loaded overlay lives under this one boundary rather
            than one each. They are mutually exclusive — only one sheet is ever
            open — so a shared boundary suspends exactly the thing that is
            loading, and the feed behind it stays where she left it.

            The fallback is nothing on purpose: these chunks are a few kilobytes
            and a spinner that flashes for forty milliseconds reads worse than a
            beat of quiet. */}
        <Suspense fallback={null}>
        {modal && <ItemModal item={modal} shop={shops.find(s=>s.id===modal.shopId)} onSave={onSave} onClose={()=>setModal(null)} onOffer={item=>{setOfferModal(item);setModal(null);}} setTab={setTab} onAddToCart={addToCart} onMessageSeller={messageSellerAbout}
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
