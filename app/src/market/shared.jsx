// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { lazy, Suspense } from "react";
import PriceTag from "../listing/PriceTag.jsx";
import Icon from "../icons/Icon.jsx";
import TrustSignals from "../trust/TrustSignals.jsx";
import { useItemLoad, STATE } from "../loading/useItemLoad.js";
import { ItemSkeleton, MediaSkeleton, ItemError } from "../loading/Skeleton.jsx";
import * as offers from "../data/offers.js";
import { isNewArrival } from "../discovery/ranking.js";
import { t, getLang } from "../i18n/t.js";
import { type as typeScale, space } from "../theme/scale.js";
import { backArrow } from "../i18n/direction.js";


// ── tokens ─────────────────────────────────────────────────────────────────
// Every value points at a CSS custom property defined in theme/palette.css,
// so all ~500 references below re-resolve the moment the theme changes. No
// component needs to know a theme exists.
//
// Naming debt, stated openly: `white` is a card SURFACE and is dark in dark
// mode. Renaming it to `surface` everywhere is correct and mechanical, but
// bundling that with the theming change would make both unreviewable.
export const C = {
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
export function PalmBg() {
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
export function Lili({ size=28, color=C.ink }) {
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
export function LiliWordmark({ size=16 }) {
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
export const T = {
  shop:["Shop","تسوق"], newIn:["New In","جديد"], sellers:["Sellers","البائعون"],
  saved:["Saved","المحفوظ"], sell:["Sell","بيع"], profile:["Profile","حسابي"],
  categories:["Categories","الفئات"], search:["Search for items, brands, sellers...","ابحثي عن قطع، ماركات، بائعين..."],
  messageSelller:["Message Seller","تواصل مع البائع"], makeOffer:["Make an Offer","قدم عرضاً"],
  follow:["Follow","تابع"], following:["Following","تتابعينها"], listItem:["List Item","أضف قطعة"], addPhotos:["Add Photos","أضف صوراً"],
  newInTitle:["New In","وصل حديثاً"], stories:["Stories","ستوريز"],
  forYou:["For You","لكِ"], save:["Save","احفظ"],
};
export function bi([en, ar]) { return <span>{en} <span style={{fontSize:"0.8em",opacity:0.6,fontFamily:"inherit"}}>· {ar}</span></span>; }
export function biStr([en, ar]) { return `${en} · ${ar}`; }

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
export const SHOPS = [
  {id:1,name:"Leen's Closet",nameAr:"خزانة لين",handle:"@leenscloset",followers:532,items:128,banner:C.terra,bio:"Luxury pieces curated with love in Dubai Marina",demo:true},
  {id:2,name:"The Vintage Edit",nameAr:"ذا فينتاج إيديت",handle:"@thevintageedit",followers:1240,items:243,banner:"#7B6FA0",bio:"Designer finds & timeless vintage gems",demo:true},
  {id:3,name:"Haya's Collection",nameAr:"مجموعة هيا",handle:"@hayascollection",followers:987,items:156,banner:"#4A7B6F",bio:"Elevated everyday — from Dubai with love",demo:true},
  {id:4,name:"Minimal by Mia",nameAr:"مينيمال باي ميا",handle:"@minimalbymia",followers:341,items:89,banner:C.gold,bio:"Clean lines. Quiet luxury. Always.",demo:true},
  {id:5,name:"Dubai Finds",nameAr:"دبي فايندز",handle:"@dubaifinds",followers:912,items:179,banner:"#B55A3A",bio:"The best pre-loved pieces in the UAE",demo:true},
  {id:6,name:"Second Shelf",nameAr:"ثاني رف",handle:"@secondshelf",followers:276,items:64,banner:"#5C4A3A",bio:"Carefully loved, ready for a second life",demo:true},
];

export const ITEMS = [
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

export const CATS = ["All","Luxury","Bags","Dresses","Shoes","Abayas","Tops","Jackets","Skirts"];
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

export const CATS_AR = {All:"الكل",Luxury:"فاخر",Bags:"حقائب",Dresses:"فساتين",Shoes:"أحذية",Abayas:"عبايات",Tops:"توبات",Jackets:"جاكيتات",Skirts:"تنانير"};
export const CONDITIONS = ["Like New","Excellent","Good","Fair"];
export const SIZES = ["XS","S","M","L","XL","OS","36","37","38","39","40"];
export const ITEM_CATS = ["Luxury","Bags","Dresses","Shoes","Tops","Bottoms","Abayas","Accessories"];
// The placeholder a piece gets when it has no photograph yet. Every listing
// used to be published with icon:"dress" regardless of what it was.
export const ICON_FOR_CAT = {
  Luxury:"gem", Bags:"bag", Dresses:"dress", Shoes:"heel", Tops:"dress",
  Bottoms:"dress", Abayas:"abaya", Accessories:"sunglass",
};
// ── approved brands & calibre rules ──────────────────────────────────────
export const APPROVED_BRANDS = [
  "Chanel","Louis Vuitton","Hermès","Gucci","Bottega Veneta","Celine","Prada",
  "Dior","Saint Laurent","Balenciaga","Loewe","Fendi","Valentino","Burberry",
  "Zimmermann","Reformation","Jacquemus","Rixo","Rotate","Ganni","Self Portrait",
  "Chloé","Isabel Marant","Nanushka","Toteme","The Frankie Shop",
  "Gianvito Rossi","Manolo Blahnik","Jimmy Choo","Aquazzura","Christian Louboutin",
  "Van Cleef & Arpels","Cartier","Bulgari","Tiffany & Co","David Yurman",
  "Emirati / Local Designer","Dubai Modest Fashion","Abaya Couture",
];
export const MIN_PRICE = 200; // AED minimum listing price — see markets.AE.minListingPrice
export const BRANDS = APPROVED_BRANDS; // alias for dropdowns

// v2.8: `isCaliberOK` and `isBrandApproved` were deleted, not fixed.
//
// They were the prototype's price-plausibility check, written and then never
// called — the handover flagged them, and the honest resolution is that the
// idea has a proper home now. Brand tiering, category bands, condition
// adjustment and the model-level floors live in data/resaleValue.js; the
// screening decision that uses them lives in compliance/listingRules.js and is
// mirrored server-side. Two definitions of "is this price plausible" is one
// too many, and the one that is not enforced is the one that rots.
export const ERAS = ["Modern","Vintage","Y2K","90s","Minimal","Resort"];

// ── stories data ───────────────────────────────────────────────────────────
export const STORIES = [
  {id:1,shopId:1,icon:"bag",color:"#D4B898",caption:"New drop",duration:4000},
  {id:2,shopId:2,icon:"sparkle",color:"#C9A96E",caption:"Summer edit",duration:4000},
  {id:3,shopId:3,icon:"dress",color:"#E8C4B8",caption:"Just listed",duration:4000},
  {id:4,shopId:5,icon:"sunglass",color:"#5C4A3A",caption:"Luxury finds",duration:4000},
  {id:5,shopId:6,emoji:"",color:"#C4856A",caption:"Weekend picks ",duration:4000},
];

// ── shared ui ──────────────────────────────────────────────────────────────
export function Avatar({shop,size=36}) {
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

export function Stars({rating,reviews,shop}) {
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
      <span style={{fontSize:11,fontWeight:600,color:C.ink}}>{rating}</span>
      {reviews && <span style={{fontSize:11,color:C.inkLt}}>({reviews})</span>}
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
export const earnedFollowers = (shop) => (!shop || shop.demo ? null : (shop.followers ?? 0));

export function Pill({text,bg=C.sand,color=C.inkLt,fs=10}) {
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
export function ItemPhoto({item, size=56, compact, full}) {
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
        loading={full ? "eager" : "lazy"} decoding="async"
        style={{width:"100%",height:"100%",objectFit:"cover",display:"block",
          // fades in over the skeleton rather than snapping, and is never
          // display:none — a hidden img in some engines never fires onLoad
          opacity: state === STATE.LOADED ? 1 : 0,
          transition:"opacity .25s ease-out"}}/>
    </>
  );
}

// ── top bar ────────────────────────────────────────────────────────────────
export function TopBar({left,center,right,noBorder}) {
  return (
    <div style={{position:"sticky",top:0,zIndex:90,background:C.cream,
      borderBottom:noBorder?"none":`1px solid ${C.border}`,
      display:"flex",alignItems:"center",height:52,padding:"0 14px",gap:8,
      boxSizing:"content-box"}} className="safe-top">
      <div style={{width:44,display:"flex",alignItems:"center"}}>{left}</div>
      <div style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center"}}>{center}</div>
      <div style={{minWidth:44,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>{right}</div>
    </div>
  );
}

export function BackBtn({onBack}) {
  return <button onClick={onBack} aria-label="Back" style={{background:"none",border:"none",cursor:"pointer",
    fontSize:20,color:C.ink,padding:4,lineHeight:1,display:"flex",alignItems:"center",
    justifyContent:"center",minWidth:44,minHeight:44}}>{backArrow()}</button>;
}

// ── search bar (Jacob's Law: Instagram/Depop style — grey pill, tap to focus) ──
// Filters live at the end of the search field, where people look for them in
// every resale app, rather than as a fourth icon in the header. The count says
// how many are on, so a narrowed feed never looks like an empty marketplace.
export function SearchBar({value,onChange,autoFocus=false,placeholder="Search...",onFilters,filterCount=0}) {
  return (
    <div style={{display:"flex",alignItems:"center",gap:8,background:"#F2EAE4",
      borderRadius:12,padding:onFilters?"4px 4px 4px 14px":"10px 14px",margin:"0 14px 10px"}}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.inkLt} strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
      <input value={value} onChange={e=>onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        autoFocus={autoFocus}
        style={{flex:1,minWidth:0,background:"none",border:"none",outline:"none",
          fontSize:14,color:C.ink,fontFamily:"inherit"}}/>
      {value && <button aria-label="Clear search" onClick={()=>onChange("")} style={{background:"none",border:"none",cursor:"pointer",color:C.inkLt,fontSize:14,lineHeight:1}}><Icon name="close" size={14} stroke={2}/></button>}
      {onFilters && (
        <button className="tap-round" aria-label={filterCount ? `Filters, ${filterCount} on` : "Filters"} onClick={onFilters}
          style={{background:filterCount?C.btn:"none",border:"none",cursor:"pointer",borderRadius:10,
            minWidth:44,minHeight:40,display:"flex",alignItems:"center",justifyContent:"center",gap:4,
            color:filterCount?C.onBtn:C.ink,padding:"0 8px"}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
            <circle cx="8" cy="6" r="2" fill={filterCount?C.btn:"#F2EAE4"}/><circle cx="16" cy="12" r="2" fill={filterCount?C.btn:"#F2EAE4"}/><circle cx="10" cy="18" r="2" fill={filterCount?C.btn:"#F2EAE4"}/>
          </svg>
          {filterCount > 0 && <span style={{fontSize:12,fontWeight:700}}>{filterCount}</span>}
        </button>
      )}
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
export function withHeart(items, savedIds) {
  const ids = savedIds || [];
  return (items || []).map(i =>
    ids.includes(i.id) === !!i.saved ? i : { ...i, saved: ids.includes(i.id) });
}

// Placeholder art for a piece with no photo yet: the category icon, drawn in
// the piece's own colour. Replaces the emoji that rendered differently on every
// handset and belonged to nobody's brand.
export function Placeholder({item, size=48}) {
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
export function Monogram({shop, size=44}) {
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

// ── item tile ──────────────────────────────────────────────────────────────




export function ItemTile({item,onSave,onClick,loading}) {
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
        {item.reserved ? (
          <div style={{position:"absolute",top:8,left:8,
            background:C.ink,color:C.cream,fontSize:11,fontWeight:700,
            padding:"2px 7px",borderRadius:10}}>Reserved</div>
        ) : isNewArrival(item) && (
          <div style={{position:"absolute",top:8,left:8,
            background:C.btn,color:C.onBtn,fontSize:11,fontWeight:700,
            padding:"2px 7px",borderRadius:10}}>{t("new")}</div>
        )}
      </div>
      <div style={{padding:"10px 10px 12px"}}>
        {/* Brand first, as luxury resale reads: it is what she scans the grid for. */}
        {item.brand && <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.inkLt,
          textTransform:"uppercase",marginBottom:2,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{item.brand}</div>}
        {/* One title, in her language. Both on every card doubled the text in
            the grid and halved the room for the garment; the Arabic title is
            still searched, and shown in full on the piece itself. */}
        <div dir="auto" style={{fontSize:13,fontWeight:600,color:C.ink,lineHeight:1.3,marginBottom:4,
          whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
          {getLang()==="ar" && item.titleAr ? item.titleAr : item.title}</div>
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
export function Lazy({ children }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}
