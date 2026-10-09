import { useState, useCallback, useMemo } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { processImage, validateFile, LIMITS } from "../data/images.js";
import { assess } from "../data/imageQuality.js";
import { parsePrice } from "../ux/input.js";
import * as fees from "../data/fees.js";
import { priceGuidance } from "../data/resaleValue.js";
import { screenListing } from "../compliance/listingRules.js";
import * as funnel from "../analytics/funnel.js";
import { t } from "../i18n/t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  LISTING A WARDROBE, NOT A PIECE
//
//  The sell flow is built around one item: choose a mode, add photographs, fill
//  a form, set a price, publish, land on your shop, start again. Twelve to
//  fifteen interactions, and the mode screen and the shop screen between every
//  one of them.
//
//  The handover's own second priority is "thirty real sellers with good
//  photographs". A woman clearing her wardrobe has fifteen pieces on her bed
//  and photographs of all of them in her camera roll. Asking her to walk that
//  flow fifteen times is asking her to stop at four — which is what the funnel
//  will show, and what "she lost interest" will be blamed on.
//
//  This is the same publish path, batched. She picks every photograph at once,
//  gets one row per piece, and fills in the two fields that are genuinely
//  required — a title and a price — with everything else defaulted and
//  editable. The screening runs per row before anything is sent, so a piece
//  that cannot be listed is shown as such here rather than failing at the end.
//
//  ── what this deliberately does not do
//
//  It does not guess. No inferred titles, no "we think this is a Chanel", no
//  auto-pricing. Every one of those is a claim about her property made by
//  software that has looked at a JPEG, and the whole project's position is that
//  an unearned claim is worse than an absent one. The price band guidance that
//  already exists is offered as guidance, next to the field, and she types the
//  number.
//
//  It also does not publish in one silent batch. Each row reports its own
//  outcome, because the v2.8 lesson was that a publish which fails quietly is
//  the most expensive bug in the product: `lili_items` held zero rows for weeks
//  while sellers watched their pieces appear in their own shops.
// ─────────────────────────────────────────────────────────────────────────────

const BLANK = {
  // titleAr is here, and is asked for, because bulk is the seller-VOLUME path.
  // Shipping it Arabic-blind means the catalogue's Arabic coverage gets worse
  // exactly as sellers scale up — the opposite of what the single-item flow's
  // "without one, a piece is invisible to every woman searching in Arabic"
  // is trying to achieve.
  title: "", titleAr: "", brand: "", price: "", category: "Dresses",
  condition: "Like New", size: "M",
};

const STATE = {
  draft:      { label: "",            colour: null },
  publishing: { label: "Sending…",    colour: "inkLt" },
  live:       { label: "Listed",      colour: "greenTx" },
  review:     { label: "In review",   colour: "goldTx" },
  blocked:    { label: "Can't list",  colour: "redTx" },
  failed:     { label: "Didn't send", colour: "redTx" },
};

export default function BulkList({ categories, conditions, brands, sizes,
                                   onPublish, onDone, onBack }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState(null);
  const [open, setOpen] = useState(null);

  const addPhotos = useCallback(async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setReadError(null);
    setBusy(true);
    const made = [];
    const rejected = [];
    for (const file of files) {
      const check = validateFile(file);
      if (!check.ok) { rejected.push(`${file.name}: ${check.problems[0].message}`); continue; }
      try {
        const raw = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = (ev) => res(ev.target.result);
          r.onerror = () => rej(new Error("couldn't be read"));
          r.readAsDataURL(file);
        });
        // Exactly the single-item pipeline: redrawn through a canvas, which
        // resizes it and discards EXIF — including the GPS coordinates a phone
        // writes into every picture taken at home. Both sizes made at capture,
        // because generating the small one later means re-downloading the big.
        const clean = await processImage(raw);
        const small = await processImage(raw, LIMITS.thumbDimension);
        made.push({ id: `${Date.now()}-${made.length}`,
                    photo: clean.dataUrl, thumb: small.dataUrl,
                    // Measured on the phone as it is processed. In a batch this
                    // matters more than anywhere else: fifteen photographs go
                    // past too fast to look at, and the one dark one is the one
                    // that will not sell.
                    photoNote: (assess(clean.quality)[0] || null),
                    ...BLANK, state: "draft", note: null });
      } catch (err) {
        rejected.push(`${file.name}: ${(err && err.message) || "couldn't be read"}`);
      }
    }
    setRows((r) => [...r, ...made]);
    setBusy(false);
    if (rejected.length) setReadError(rejected);
    if (made.length) funnel.track(funnel.EVENTS.SELL_STARTED, { bulk: made.length });
  }, []);

  const patch = (id, next) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...next, state: "draft", note: null } : x)));
  const drop = (id) => setRows((r) => r.filter((x) => x.id !== id));

  const ready = useMemo(
    () => rows.filter((r) => r.state === "draft" && r.title.trim() && parsePrice(r.price) !== null),
    [rows]);
  const incomplete = rows.filter((r) => r.state === "draft" && !(r.title.trim() && parsePrice(r.price) !== null));
  const done = rows.filter((r) => r.state === "live" || r.state === "review");

  /**
   * Publish what is ready, one at a time, reporting each.
   *
   * Sequential rather than parallel on purpose: every one of these uploads a
   * photograph over a phone connection, and eight simultaneous uploads on
   * Dubai mobile data is how you turn a slow batch into a failed one.
   */
  const publishAll = async () => {
    if (busy || !ready.length) return;
    setBusy(true);
    for (const row of ready) {
      setRows((r) => r.map((x) => (x.id === row.id ? { ...x, state: "publishing" } : x)));
      const price = parsePrice(row.price) ?? 0;
      const screen = screenListing({
        title: row.title, description: "", brand: row.brand || "Other",
        price, category: row.category, condition: row.condition,
      });
      if (screen.verdict === "block") {
        const why = (screen.findings || []).find((f) => f.level === "block");
        setRows((r) => r.map((x) => (x.id === row.id
          ? { ...x, state: "blocked",
              note: (why && why.reason) || "This can't be listed on lili." } : x)));
        continue;
      }
      try {
        await onPublish({
          title: row.title.trim(), titleAr: (row.titleAr || "").trim() || null, subtitle: "",
          price, brand: row.brand || "Other", category: row.category,
          condition: row.condition, size: row.size, era: "Modern",
          photo: row.photo, photos: [row.photo], thumb: row.thumb, thumbs: [row.thumb],
          desc: "", saved: false, offers: [], authenticated: false,
        });
        setRows((r) => r.map((x) => (x.id === row.id
          ? { ...x, state: screen.verdict === "review" ? "review" : "live" } : x)));
      } catch (err) {
        setRows((r) => r.map((x) => (x.id === row.id
          ? { ...x, state: "failed",
              note: (err && err.message) || "It didn't reach lili. Nothing was published." } : x)));
      }
    }
    setBusy(false);
    funnel.track(funnel.EVENTS.LISTING_LIVE, { bulk: ready.length });
  };

  const label = { fontSize: 11, fontWeight: 700, color: C.inkLt, letterSpacing: 0.4,
                  textTransform: "uppercase", display: "block", marginBottom: 4 };
  const field = { width: "100%", padding: "8px 10px", borderRadius: 9, fontSize: 13,
                  border: `1px solid ${C.border}`, outline: "none", background: C.white,
                  color: C.ink, fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div style={{ paddingBottom: 96 }}>
      <div style={{ background: C.cream, padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer",
          color: C.terraTx, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>{t("back")}</button>
        <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 15, color: C.ink }}>
          {t("several_at_once")}
        </span>
        <span style={{ fontSize: 12, color: C.inkLt, minWidth: 40, textAlign: "right" }}>
          {rows.length || ""}
        </span>
      </div>

      <div style={{ padding: "16px 14px" }}>
        {rows.length === 0 && (
          <div style={{ textAlign: "center", padding: "26px 10px 30px" }}>
            <Icon name="camera" size={32} stroke={1.4} style={{ color: C.terra, marginBottom: 12 }} />
            <div style={{ fontSize: 15, color: C.ink, marginBottom: 6 }}>
              Pick every piece at once
            </div>
            <p style={{ fontSize: 13, color: C.inkLt, lineHeight: 1.65, maxWidth: 300,
                        margin: "0 auto 4px" }}>
              Choose all the photographs from your camera roll and you'll get one
              row per piece. A name and a price each — everything else you can
              change later, and nothing goes up until you say so.
            </p>
            <p style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6, maxWidth: 300,
                        margin: "10px auto 0" }}>
              One photograph per piece here. Add the rest — the label, the
              serial, the wear — from the piece's own page afterwards.
            </p>
          </div>
        )}

        <label style={{ display: "block", background: rows.length ? C.white : C.btn,
          color: rows.length ? C.ink : C.onBtn, border: rows.length ? `1.5px solid ${C.border}` : "none",
          borderRadius: 30, padding: "12px 0", textAlign: "center", fontWeight: 700,
          fontSize: 14, cursor: "pointer", marginBottom: 16 }}>
          {rows.length ? "Add more photographs" : t("choose_photographs")}
          <input type="file" accept="image/*" multiple onChange={addPhotos}
                 style={{ display: "none" }} disabled={busy} />
        </label>

        {readError && (
          <div role="alert" style={{ background: "#FBF0EE", border: `1px solid ${C.red}`,
            borderRadius: 10, padding: "10px 12px", fontSize: 12, color: C.ink,
            lineHeight: 1.55, marginBottom: 14 }}>
            <b style={{ color: C.redTx }}>Some photographs weren't added.</b>
            <div style={{ marginTop: 4 }}>{readError.join(" · ")}</div>
            <div style={{ marginTop: 4, color: C.inkLt }}>
              Up to {Math.round(LIMITS.maxBytes / 1048576)} MB each, and JPEG, PNG or WebP.
            </div>
          </div>
        )}

        {rows.map((row) => {
          const price = parsePrice(row.price);
          const g = price !== null && row.brand
            ? priceGuidance({ brand: row.brand, title: row.title, category: row.category,
                              condition: row.condition, price })
            : null;
          const net = price !== null ? fees.breakdown(price) : null;
          const st = STATE[row.state] || STATE.draft;
          const expanded = open === row.id;
          return (
            <div key={row.id} style={{ background: C.white, border: `1px solid ${
              row.state === "blocked" || row.state === "failed" ? C.red : C.border}`,
              borderRadius: 14, padding: 12, marginBottom: 10,
              opacity: row.state === "live" || row.state === "review" ? 0.72 : 1 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 62, height: 78, borderRadius: 9, overflow: "hidden",
                              flexShrink: 0, background: C.sand }}>
                  <img src={row.thumb || row.photo} alt=""
                       style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  <input value={row.title} placeholder="What is it? e.g. Zimmermann floral dress"
                    onChange={(e) => patch(row.id, { title: e.target.value })}
                    maxLength={90} aria-label="Title" style={field} />
                  <div style={{ display: "flex", gap: 7 }}>
                    <input value={row.price} inputMode="decimal" placeholder="Price (AED)"
                      onChange={(e) => patch(row.id, { price: e.target.value })}
                      aria-label="Price" style={{ ...field, flex: 1 }} />
                    <select value={row.brand} aria-label="Brand"
                      onChange={(e) => patch(row.id, { brand: e.target.value })}
                      style={{ ...field, flex: 1.2 }}>
                      <option value="">Brand…</option>
                      {(brands || []).map((b) => <option key={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {(net || g || st.label || row.note) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                              marginTop: 8, fontSize: 11, color: C.inkLt }}>
                  {net && <span>You receive <b style={{ color: C.ink }}>AED {Math.round(net.payout).toLocaleString()}</b></span>}
                  {g && g.headline && <span style={{ color: C.goldTx }}>· {g.headline}</span>}
                  {st.label && <span style={{ marginLeft: "auto", fontWeight: 700,
                    color: st.colour ? C[st.colour] : C.inkLt }}>{st.label}</span>}
                </div>
              )}
              {row.photoNote && row.state === "draft" && (
                <div style={{ fontSize: 11, color: C.inkLt, marginTop: 7, lineHeight: 1.5,
                              display: "flex", gap: 7, alignItems: "flex-start" }}>
                  <Icon name={row.photoNote.severity === "high" ? "warning" : "eye"} size={12}
                        stroke={2} style={{ marginTop: 2, flexShrink: 0,
                          color: row.photoNote.severity === "high" ? C.redTx : C.terraTx }} />
                  <span><b style={{ color: C.ink }}>{row.photoNote.title}.</b> {row.photoNote.fix}</span>
                </div>
              )}
              {row.note && (
                <div role="alert" style={{ fontSize: 12, color: C.redTx, marginTop: 6, lineHeight: 1.5 }}>
                  {row.note}
                </div>
              )}

              {row.state === "draft" && (
                <>
                  <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
                    <button onClick={() => setOpen(expanded ? null : row.id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                        color: C.terraTx, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                      {expanded ? "Fewer details" : "Category, condition, size"}
                    </button>
                    <button onClick={() => drop(row.id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                        color: C.inkLt, fontSize: 12, fontFamily: "inherit", marginLeft: "auto" }}>
                      Remove
                    </button>
                  </div>
                  {expanded && (
                    <>
                    <div style={{ marginTop: 10 }}>
                      <label style={label}>{t("arabic_title_2")}</label>
                      <input value={row.titleAr} dir="rtl" aria-label="Arabic title"
                        placeholder="مثل: عباية كتان"
                        onChange={(e) => patch(row.id, { titleAr: e.target.value })}
                        maxLength={90} style={{ ...field, textAlign: "right" }} />
                      <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.5, marginTop: -2, marginBottom: 8 }}>
                        Without one, this piece is invisible to a woman searching in Arabic.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      {[["Category", "category", categories], ["Condition", "condition", conditions],
                        ["Size", "size", sizes]].map(([lbl, key, opts]) => (
                        <div key={key} style={{ flex: 1, minWidth: 0 }}>
                          <label style={label}>{lbl}</label>
                          <select value={row[key]} aria-label={lbl}
                            onChange={(e) => patch(row.id, { [key]: e.target.value })} style={field}>
                            {(opts || []).map((o) => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {rows.length > 0 && (
        <div className="safe-sheet" style={{ position: "fixed", left: 0, right: 0, bottom: 0,
          background: C.cream, borderTop: `1px solid ${C.border}`, padding: "10px 14px 16px", zIndex: 60 }}>
          {incomplete.length > 0 && (
            <div style={{ fontSize: 12, color: C.inkLt, marginBottom: 7, textAlign: "center" }}>
              {incomplete.length} still {incomplete.length === 1 ? "needs" : "need"} a name and a price
            </div>
          )}
          {done.length > 0 && (
            <div style={{ fontSize: 12, color: C.greenTx, marginBottom: 7, textAlign: "center" }}>
              {done.length} listed. {ready.length ? "The rest are below." : "You can close this."}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            {done.length > 0 && (
              <button onClick={onDone} style={{ flex: 1, background: "none", color: C.terraTx,
                border: `1.5px solid ${C.terra}`, borderRadius: 30, padding: "12px 0",
                fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                See my shop
              </button>
            )}
            <button onClick={publishAll} disabled={busy || !ready.length}
              style={{ flex: 2, background: ready.length && !busy ? C.btn : C.sand,
                color: ready.length && !busy ? C.onBtn : C.inkLt, border: "none", borderRadius: 30,
                padding: "12px 0", fontWeight: 700, fontSize: 14, fontFamily: "inherit",
                cursor: ready.length && !busy ? "pointer" : "default" }}>
              {busy ? "Listing…"
                : ready.length ? `List ${ready.length} ${ready.length === 1 ? "piece" : "pieces"} · انشري`
                : "Nothing ready yet"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
