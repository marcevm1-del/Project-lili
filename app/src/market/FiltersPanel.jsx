// Moved out of Marketplace.jsx unchanged; see that file's history for the
// reasoning in the comments below.
import { useState } from "react";
import { FITS } from "../listing/FitAndFlaws.jsx";
import { parsePrice } from "../ux/input.js";
import Icon from "../icons/Icon.jsx";
import { useFocusTrap, dialogProps } from "../a11y/useFocusTrap.js";
import { matchesFilters, activeCount, EMPTY_FILTERS } from "../discovery/filters.js";
import { availableSorts } from "../discovery/ranking.js";
import * as funnel from "../analytics/funnel.js";
import { t } from "../i18n/t.js";
import { space } from "../theme/scale.js";
import { C, CATS, categoryLabel, CONDITIONS, SIZES, BRANDS } from "./shared.jsx";


// ── filters panel ──────────────────────────────────────────────────────────
export function FiltersPanel({filters,setFilters,onClose,items}) {
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
          {/* Fit and flaws — what the listing form asks since v2.12. */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.inkLt,letterSpacing:0.8,textTransform:"uppercase",marginBottom:8}}>Fit</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {FITS.map(([k,l])=>(
                <button key={k} onClick={()=>setLocal({...local,fit:local.fit===k?"":k})} aria-pressed={local.fit===k} style={{
                  background:local.fit===k?C.terra:C.white,color:local.fit===k?C.white:C.ink,
                  border:`1px solid ${local.fit===k?C.terra:C.border}`,
                  borderRadius:20,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
            <label style={{display:"flex",alignItems:"center",gap:10,marginTop:12,fontSize:13,color:C.ink,cursor:"pointer"}}>
              <input type="checkbox" checked={!!local.noFlaws} onChange={e=>setLocal({...local,noFlaws:e.target.checked})}
                style={{width:20,height:20,minHeight:0,accentColor:"var(--c-accent-btn)"}}/>
              Only pieces with no flaws noted
            </label>
          </div>
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
