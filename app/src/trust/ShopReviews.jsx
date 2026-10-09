import { useState, useEffect } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as repo from "../data/repo.js";

// What buyers who met her said. Each review comes from a meet the two of them
// agreed on lili, shown without the reviewer's name, and only once both sides
// have reviewed (or 14 days have passed) — the server decides all three. The
// average waits for five, as Stars does; the words are worth showing from one.
export default function ShopReviews({shopId}) {
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
