// ─────────────────────────────────────────────────────────────────────────────
//  SIZE SYSTEMS
//
//  A listing stores ONE size: a letter for clothing (XS–XL) and an EU number
//  for shoes (35–42). That never changes, whoever lists it and wherever she
//  is from. What changes is how it is SHOWN: a woman who shops in UK sizes
//  sees "UK 8", one who shops in US sizes sees "US 4", and the stored "S"
//  underneath is the same piece.
//
//  The choice is hers, kept on this phone (like My preferences), and every
//  place the app prints a size reads it: tiles, the item page, filters, the
//  sell form, My preferences and the "For me" chip.
//
//  The tables are the common women's conversions. Brands differ, so the app
//  says "approximate" wherever a converted size could decide a purchase.
// ─────────────────────────────────────────────────────────────────────────────

import { getJSON, setJSON } from "../compliance/store.js";

export const SIZE_SYSTEM_KEY = "lili.sizesystem.v1";

/** "INTL" keeps the labels as listed: S, M, L for clothing, EU for shoes. */
export const SYSTEMS = [
  { key: "INTL", label: "S M L", name: "As listed (S, M, L · EU shoes)" },
  { key: "EU",   label: "EU",    name: "European" },
  { key: "UK",   label: "UK",    name: "United Kingdom" },
  { key: "US",   label: "US",    name: "United States" },
  { key: "IT",   label: "IT",    name: "Italy" },
  { key: "FR",   label: "FR",    name: "France" },
  { key: "AU",   label: "AU",    name: "Australia" },
  { key: "JP",   label: "JP",    name: "Japan" },
];
export const DEFAULT_SYSTEM = "INTL";

/** Women's clothing, by letter. */
const CLOTHING = {
  XS: { EU: "34", UK: "6",  US: "2",  IT: "38", FR: "34", AU: "6",  JP: "5"  },
  S:  { EU: "36", UK: "8",  US: "4",  IT: "40", FR: "36", AU: "8",  JP: "7"  },
  M:  { EU: "38", UK: "10", US: "6",  IT: "42", FR: "38", AU: "10", JP: "9"  },
  L:  { EU: "40", UK: "12", US: "8",  IT: "44", FR: "40", AU: "12", JP: "11" },
  XL: { EU: "42", UK: "14", US: "10", IT: "46", FR: "42", AU: "14", JP: "13" },
};

/** Women's shoes, by EU size. JP is foot length in centimetres. */
const SHOES = {
  35: { UK: "2.5", US: "5",    AU: "4",    JP: "22"   },
  36: { UK: "3.5", US: "6",    AU: "5",    JP: "22.5" },
  37: { UK: "4",   US: "6.5",  AU: "5.5",  JP: "23.5" },
  38: { UK: "5",   US: "7.5",  AU: "6.5",  JP: "24"   },
  39: { UK: "6",   US: "8.5",  AU: "7.5",  JP: "25"   },
  40: { UK: "6.5", US: "9",    AU: "8",    JP: "25.5" },
  41: { UK: "7.5", US: "10",   AU: "9",    JP: "26"   },
  42: { UK: "8",   US: "10.5", AU: "9.5",  JP: "26.5" },
};

export const APPROXIMATE_NOTE = "Converted sizes are approximate and vary by brand.";

/** "clothing" | "shoes" | null (one size, or a label we don't know). */
export function kindOf(size) {
  const s = String(size || "").trim().toUpperCase();
  if (!s || s === "OS") return null;
  if (CLOTHING[s]) return "clothing";
  if (SHOES[s]) return "shoes";
  return null;
}

/**
 * The size as she reads it. `opts.prefix` (default true) puts the system in
 * front ("UK 8"); `opts.both` adds the stored size when it differs ("UK 8 (S)").
 */
export function sizeLabel(size, system = current, { prefix = true, both = false } = {}) {
  const raw = String(size || "").trim();
  if (!raw) return "";
  if (raw.toUpperCase() === "OS") return "One size";
  const kind = kindOf(raw);
  const sys = SYSTEMS.some((x) => x.key === system) ? system : DEFAULT_SYSTEM;
  let out;
  if (kind === "clothing") {
    out = sys === "INTL" ? raw.toUpperCase() : CLOTHING[raw.toUpperCase()][sys];
  } else if (kind === "shoes") {
    out = sys === "INTL" || sys === "EU" || sys === "IT" || sys === "FR" ? raw : SHOES[raw][sys];
  } else {
    return raw;                       // a label we can't convert is shown as listed
  }
  const shownSys = kind === "shoes" && (sys === "INTL" || sys === "IT" || sys === "FR") ? "EU"
                 : sys === "INTL" ? "" : sys;
  const label = prefix && shownSys ? `${shownSys} ${out}` : out;
  return both && label !== raw.toUpperCase() && label !== raw ? `${label} (${raw})` : label;
}

// ── the chosen system: one value, persisted, with listeners ────────────────
let current = DEFAULT_SYSTEM;
const listeners = new Set();

export const getSizeSystem = () => current;

export async function loadSizeSystem() {
  try {
    const v = await getJSON(SIZE_SYSTEM_KEY, null);
    if (v && SYSTEMS.some((x) => x.key === v)) { current = v; listeners.forEach((f) => f(v)); }
  } catch { /* the default stands */ }
  return current;
}

export async function setSizeSystem(key) {
  if (!SYSTEMS.some((x) => x.key === key) || key === current) return current;
  current = key;
  listeners.forEach((f) => f(key));
  try { await setJSON(SIZE_SYSTEM_KEY, key); } catch { /* shown for this session anyway */ }
  return current;
}

export function onSizeSystemChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
