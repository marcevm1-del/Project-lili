import { C } from "../compliance/ui.js";
import { sizeLabel } from "../sizes/sizeSystem.js";
import { useSizeSystem } from "../sizes/SizeSystemPicker.jsx";
import { t } from "../i18n/t.js";

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
// The buyer's side reads these through the dictionary, so the panel on the
// piece follows her language. The English is the same as the labels above.
export const FIT_KEY = { small: "runs_small", true: "true_to_size", large: "runs_large" };
const flawWord = (f) => (FLAW_LABEL[f] ? t(`f_${f}`) : f);
const measureWord = (k) => t(k === "chest" ? "m_chest_pit" : `m_${k}`);

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
          <span style={lbl}>{t("how_does_it_fit")}</span>
          <div role="radiogroup" aria-label={t("how_does_it_fit")} style={{display:"flex",gap:7,flexWrap:"wrap"}}>
            {FITS.map(([k])=>(
              <button key={k} type="button" role="radio" aria-checked={form.fit===k} className="tap-target"
                onClick={()=>setForm({...form,fit:form.fit===k?null:k})} style={chip(form.fit===k)}>{t(FIT_KEY[k])}</button>
            ))}
          </div>
        </div>
      )}
      {keys.length>0 && (
        <div>
          <span style={lbl}>{t("measurements_laid_flat")} <span style={{textTransform:"none",fontWeight:400}}>· {t("optional")}</span></span>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {keys.map(k=>(
              <label key={k} style={{display:"flex",flexDirection:"column",gap:4,fontSize:11,color:C.inkLt}}>
                {measureWord(k)}
                <input inputMode="decimal" value={(form.measurements||{})[k] ?? ""} onChange={e=>setM(k,e.target.value)}
                  placeholder={t("cm")} aria-label={t("in_centimetres", { what: measureWord(k) })}
                  style={{padding:"10px 12px",borderRadius:10,border:`1px solid ${C.border}`,fontSize:14,
                    outline:"none",color:C.ink,background:C.white,boxSizing:"border-box",width:"100%"}}/>
              </label>
            ))}
          </div>
          <div style={{fontSize:11,color:C.inkLt,marginTop:6,lineHeight:1.5}}>
            {t("two_numbers_hint")}
          </div>
        </div>
      )}
      <div>
        <span style={lbl}>{t("anything_to_point_out")}</span>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          <button type="button" aria-pressed={Array.isArray(flaws)&&flaws.length===0} className="tap-target"
            onClick={()=>setForm({...form,flaws:[]})} style={chip(Array.isArray(flaws)&&flaws.length===0)}>{t("nothing_no_flaws")}</button>
          {flawOpts.map(([k])=>(
            <button key={k} type="button" aria-pressed={Array.isArray(flaws)&&flaws.includes(k)} className="tap-target"
              onClick={()=>toggleFlaw(k)} style={chip(Array.isArray(flaws)&&flaws.includes(k))}>{flawWord(k)}</button>
          ))}
        </div>
        <div style={{fontSize:11,color:C.inkLt,marginTop:6,lineHeight:1.5}}>
          {t("saying_up_front")}
        </div>
      </div>
    </div>
  );
}

// On the piece: size and how it runs, the measurements, and what the seller
// disclosed — together, because "will it fit" and "what's it like" are read
// as one question.
export function FitPanel({item}) {
  useSizeSystem();
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
            {t("size_n", { size: sizeLabel(item.size, undefined, { both: true }) })}{fit ? ` · ${t(FIT_KEY[fit[0]])}` : ""}
            {fit && fit[0]!=="true" && <span style={{fontWeight:400,color:C.inkLt}}>
              {` — ${t(fit[0]==="small" ? "consider_size_up" : "consider_size_down")}`}</span>}
          </div>
          {mk.length>0 && (
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px 14px"}}>
              {mk.map(k=>(
                <span key={k} style={{fontSize:12,color:C.inkLt}}>
                  {t(`m_${k}`)} <b style={{color:C.ink}}>{m[k]} {t("cm")}</b>
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
          {flaws.length===0 ? ` · ${t("no_flaws_noted")}`
            : ` · ${t("seller_points_out", { flaws: flaws.map(flawWord).join(", ").toLowerCase() })}`}
        </div>
      )}
    </div>
  );
}
