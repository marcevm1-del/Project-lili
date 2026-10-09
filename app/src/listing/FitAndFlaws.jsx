import { C } from "../compliance/ui.js";

// ── fit, measurements, flaws ───────────────────────────────────────────────
// A size label says what the tag says. Whether it fits is the question buyers
// message about before buying and the reason they regret it after, and a
// "Good" condition hides as much as it tells. These three answer both, in the
// seller's words, in a form a buyer can compare across listings.
export const GARMENT_CATS = ["Dresses","Tops","Bottoms","Abayas"];
export const FIT_CATS = [...GARMENT_CATS, "Shoes"];
export const MEASURE_KEYS = {
  Dresses: ["chest","waist","length"],
  Tops:    ["chest","shoulders","sleeve","length"],
  Bottoms: ["waist","hips","inseam","length"],
  Abayas:  ["chest","sleeve","length"],
};
export const MEASURE_LABEL = { chest:"Chest (pit to pit)", waist:"Waist", hips:"Hips", length:"Length",
  shoulders:"Shoulders", sleeve:"Sleeve", inseam:"Inseam" };
export const FITS = [["small","Runs small"],["true","True to size"],["large","Runs large"]];
export const FLAWS_GARMENT = [["stain","Stain"],["pilling","Pilling"],["fading","Fading"],["hole","Small hole"],
  ["missing_button","Missing button"],["altered","Altered"],["loose_thread","Loose thread"],["odour","Odour"]];
export const FLAWS_OTHER = [["scuff","Scuffs"],["wear","Visible wear"],["stain","Stain"],["loose_thread","Loose thread"],["odour","Odour"]];
export const FLAW_LABEL = Object.fromEntries([...FLAWS_GARMENT, ...FLAWS_OTHER]);

export function FitAndFlaws({form, setForm}) {
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
export function FitPanel({item}) {
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
