import { useState, useEffect, useCallback } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as repo from "../data/repo.js";
import { money } from "../i18n/direction.js";

// ── search page (Jacob's Law: dedicated search tab like Depop/TikTok) ─────
// "Tell me when it's listed": the search she just ran, kept on the server so the
// database can tell her the moment a matching piece goes live. Vinted, Depop
// and Vestiaire all have it; for a catalogue this young, where most searches
// come back short, it is the difference between a dead end and a reason to
// come back.
export function SaveSearchButton({q, filters, prominent}) {
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
export function SavedSearches({onPick}) {
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
