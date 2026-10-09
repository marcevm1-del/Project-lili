// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import Icon from "../icons/Icon.jsx";
import * as offers from "../data/offers.js";
import { t } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { C, Lili, TopBar } from "../market/shared.jsx";


// ── profile ────────────────────────────────────────────────────────────────
export function ProfilePage({myShop,items,setTab,onOpenLegal,onOpenLanguage,onOpenTheme,onOpenHelp,onOpenSettings,onOpenAuth,session,onSignOut}) {
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
      {label:t("saved"),icon:"heart",action:()=>setTab("saved")},
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
              <div style={{fontSize:11,color:C.inkLt,marginTop:2}}>{l}</div>
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
              <div style={{fontSize:11,fontWeight:700,letterSpacing:0.8,
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
                      : <span style={{marginLeft:"auto",fontSize:11,fontWeight:700,
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
              <span key={t} style={{fontSize:11,color:C.inkLt,display:"inline-flex",
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
