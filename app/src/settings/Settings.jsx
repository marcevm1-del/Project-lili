import { useEffect, useState } from "react";
import { C, Shell, Btn, Note } from "../compliance/ui.js";
import * as repo from "../data/repo.js";
import { normaliseText } from "../ux/input.js";
import { t } from "../i18n/t.js";
import { isAway, backOn, MAX_AWAY_DAYS, untilEndOf } from "../shops/away.js";

// ─────────────────────────────────────────────────────────────────────────────
//  SETTINGS
//
//  This screen exists because the app already promised it. When the shop setup
//  was trimmed to a single field, the flow told the seller:
//
//    "Arabic name, bio and colour are all in Settings whenever you fancy"
//
//  …and the Settings row did nothing. A promise the interface makes and does
//  not keep is worse than the friction it removed, so here is the other half.
//
//  Everything writes through repo.updateShop, the same seam the rest of the
//  app uses, so these edits persist and will move to the server untouched.
// ─────────────────────────────────────────────────────────────────────────────

const BANNERS = ["#C4856A", "#D4B898", "#E8C4B8", "#C9A96E", "#B08D6E", "#9E6050"];

export default function Settings({ myShop, onShopUpdated, onBack }) {
  const [form, setForm] = useState({ name: "", nameAr: "", bio: "", banner: BANNERS[0] });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (myShop) {
      setForm({
        name: myShop.name || "",
        nameAr: myShop.nameAr || "",
        bio: myShop.bio || "",
        banner: myShop.banner || BANNERS[0],
      });
    }
  }, [myShop]);

  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };

  const save = async () => {
    if (!myShop) return;
    setBusy(true);
    try {
      const patch = {
        name: normaliseText(form.name, 60) || myShop.name,
        nameAr: normaliseText(form.nameAr, 60),
        bio: normaliseText(form.bio, 300),
        banner: form.banner,
      };
      const updated = await repo.updateShop(myShop.id, patch);
      onShopUpdated && onShopUpdated(updated);
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  if (!myShop) {
    return (
      <Shell title="Settings" subtitle="الإعدادات" onBack={onBack}>
        <p style={p}>
          Once you open a shop, this is where you'll set its Arabic name, write a
          bio and choose its colour.
        </p>
        <Note>
          Nothing here applies until you're selling — your appearance, language
          and privacy choices live on their own screens.
        </Note>
      </Shell>
    );
  }

  return (
    <Shell title="Settings" subtitle="الإعدادات" onBack={onBack}>
      <p style={p}>
        The details we didn't ask for when you opened your shop, because none of
        them should have stood between you and your first piece.
      </p>

      {/* live preview, so a colour choice is visible rather than described */}
      <div style={{ background: C.white, borderRadius: 14, overflow: "hidden",
                    border: `1px solid ${C.border}`, marginBottom: 18 }}>
        <div style={{ background: form.banner, height: 52 }} />
        <div style={{ padding: "10px 14px 14px" }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 16, color: C.ink }}>
            {form.name || "Your shop"}
          </div>
          {form.nameAr && (
            <div style={{ fontSize: 12, color: C.terraTx, marginTop: 2, direction: "rtl" }}>
              {form.nameAr}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.inkLt, marginTop: 4, lineHeight: 1.5 }}>
            {form.bio || "Add a bio so buyers know who they're buying from."}
          </div>
        </div>
      </div>

      <Field label={t("shop_name_2")} value={form.name}
             onChange={set("name")} placeholder="e.g. Desert Rose Closet" />
      <Field label={t("arabic_name")} value={form.nameAr}
             onChange={set("nameAr")} placeholder="خزانة الوردة" rtl />
      <Field label={t("bio")} value={form.bio} onChange={set("bio")}
             placeholder="Describe your style, what you sell, how you pack…" multiline />

      <div style={label}>{t("shop_colour")}</div>
      <div style={{ display: "flex", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        {BANNERS.map((b) => (
          <button key={b} onClick={() => set("banner")(b)}
            aria-label={`Shop colour ${b}`}
            className="tap-round"
            style={{
              width: 34, height: 34, borderRadius: "50%", background: b,
              border: form.banner === b ? `3px solid ${C.ink}` : `1px solid ${C.border}`,
              cursor: "pointer",
            }} />
        ))}
      </div>

      <Btn disabled={busy || !form.name.trim()} onClick={save}>
        {busy ? "Saving…" : saved ? "Saved" : t("save_changes")}
      </Btn>

      <Note>
        Saved to your shop straight away. Your appearance, language and privacy
        choices each have their own screen.
      </Note>

      <HolidayMode myShop={myShop} onShopUpdated={onShopUpdated} />
    </Shell>
  );
}

// Holiday mode (migration 37): away until a date she picks, up to 90 days.
function HolidayMode({ myShop, onShopUpdated }) {
  const away = isAway(myShop);
  const day = (d) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" });   // yyyy-mm-dd
  const tomorrow = day(Date.now() + 86400e3);
  const latest = day(Date.now() + MAX_AWAY_DAYS * 86400e3);
  const [date, setDate] = useState(away ? day(myShop.awayUntil) : "");
  const [note, setNote] = useState((away && myShop.awayNote) || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const apply = async (until) => {
    setBusy(true); setMsg(null);
    try {
      const saved = await repo.setAway(myShop.id, until, until ? normaliseText(note, 140) : null);
      const shop = { ...myShop, awayUntil: saved ? saved.awayUntil : until,
                     awayNote: saved ? saved.awayNote : (until ? normaliseText(note, 140) || null : null) };
      onShopUpdated && onShopUpdated(shop);
      setMsg(until ? t("youre_away_until", { date: backOn(shop) }) : t("youre_back"));
      if (!until) { setDate(""); setNote(""); }
    } catch (e) {
      setMsg((e && e.message) || t("didnt_save"));
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="holiday-h" style={{ marginTop: 26 }}>
      <h3 id="holiday-h" style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: "0 0 4px" }}>{t("holiday_mode")}</h3>
      <p style={p}>{t("holiday_hint_1")} {t("holiday_hint_2")}</p>
      {away && (
        <div role="status" style={{ background: C.sand, borderRadius: 12, padding: "10px 12px", fontSize: 13,
          color: C.ink, marginBottom: 12 }}>
          <b>{t("away_until_date", { date: backOn(myShop) })}</b>{myShop.awayNote ? ` · “${myShop.awayNote}”` : ""}
        </div>
      )}
      <div style={label}>{t("back_on")}</div>
      <input type="date" value={date} min={tomorrow} max={latest} onChange={(e) => setDate(e.target.value)}
        aria-label={t("back_on")} data-field="back-on" style={{ ...fieldStyle, marginBottom: 12 }} />
      <div style={label}>{t("note_for_buyers")}</div>
      <input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)}
        placeholder={t("note_for_buyers_example")} aria-label={t("note_for_buyers")} data-field="away-note"
        style={{ ...fieldStyle, marginBottom: 12 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn disabled={busy || !date} onClick={() => apply(untilEndOf(date))}>
          {busy ? t("saving") : away ? t("change_the_date") : t("go_away_until_then")}
        </Btn>
        {away && <Btn tone="outline" disabled={busy} onClick={() => apply(null)}>{t("im_back_now")}</Btn>}
      </div>
      {msg && <p role="status" style={{ ...p, marginTop: 10 }}>{msg}</p>}
    </section>
  );
}

const fieldStyle = {
  width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 16,
  background: C.white, border: `1px solid ${C.border}`, color: C.ink,
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

function Field({ label: l, value, onChange, placeholder, multiline, rtl }) {
  const style = {
    width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 16,
    background: C.white, border: `1px solid ${C.border}`, color: C.ink,
    outline: "none", marginBottom: 14, fontFamily: "inherit",
    direction: rtl ? "rtl" : "ltr",
  };
  return (
    <>
      <div style={label}>{l}</div>
      {multiline
        ? <textarea value={value} placeholder={placeholder} rows={3}
            onChange={(e) => onChange(e.target.value)}
            style={{ ...style, resize: "vertical", lineHeight: 1.5 }} />
        : <input value={value} placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)} style={style} />}
    </>
  );
}

const p = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
const label = { fontSize: 11, fontWeight: 700, color: C.terraTx, letterSpacing: 0.5,
                textTransform: "uppercase", marginBottom: 7 };
