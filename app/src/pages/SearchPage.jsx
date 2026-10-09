// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState, useEffect, useCallback, useMemo } from "react";
import * as repo from "../data/repo.js";
import { SaveSearchButton, SavedSearches } from "../discovery/SavedSearches.jsx";
import Icon from "../icons/Icon.jsx";
import { searchLocal, diagnose, suggestions } from "../discovery/search.js";
import { matchesFilters } from "../discovery/filters.js";
import { applySort } from "../discovery/ranking.js";
import * as funnel from "../analytics/funnel.js";
import { t } from "../i18n/t.js";
import { C, SearchBar, withHeart, ItemTile } from "../market/shared.jsx";
import { FiltersPanel } from "../market/FiltersPanel.jsx";




export function SearchPage({items,shops,onSave,setModal,filters,setFilters,savedIds=[]}) {
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
