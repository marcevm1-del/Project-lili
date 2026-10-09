// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState } from "react";
import ShopReviews from "../trust/ShopReviews.jsx";
import Icon from "../icons/Icon.jsx";
import { searchLocal } from "../discovery/search.js";
import { tokens, fuzzyIncludes } from "../discovery/text.js";
import { t } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { backArrow, money } from "../i18n/direction.js";
import { C, T, ICON_FOR_CAT, Avatar, Stars, earnedFollowers, TopBar, SearchBar, Placeholder, ItemTile } from "../market/shared.jsx";


// ── my shop ────────────────────────────────────────────────────────────────
export function MyShopPage({shop,items,setTab,justListed,onDismissListed,onMarkSold,onTakeDown}) {
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
              <span style={{fontSize:11,color:C.inkLt,marginLeft:4}}>{l}</span></div>
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
                  <div style={{fontSize:11,fontWeight:700,color:C.inkLt,marginTop:3,
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
export function SellersPage({shops,items,setTab,setViewShop,onFollow,isFollowing}) {
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
                  <span style={{fontSize:11,color:C.inkLt}}>{earnedFollowers(shop) !== null ? `· ${earnedFollowers(shop)} · ${count} items` : `· ${count} items`}</span>
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


export function ShopViewPage({shop,items,onSave,setModal,onBack,onReport,onFollow,following}) {
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
        <button className="tap-round" onClick={onBack} aria-label="Back" style={{position:"absolute",top:14,left:14,background:C.scrimCC,
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
