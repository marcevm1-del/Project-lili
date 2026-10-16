import { createElement as h } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  ICONS
//
//  Replacing the emoji. Three reasons that matter beyond taste:
//
//  1. Emoji are rendered by the OS, so 👗 is a different picture on a Samsung,
//     a Pixel and an iPhone — and none of them are lili's. A brand built on
//     "peach tones and soft luxe" cannot outsource its visual vocabulary to
//     whoever made the handset.
//  2. Some of them carry meaning we did not choose. 🕌 is a mosque, used here
//     for abayas — conflating a garment with a place of worship, in a market
//     where that distinction is not a small thing.
//  3. They do not theme. An emoji stays the same in dark mode; these use
//     currentColor and follow the text they sit beside.
//
//  Drawn on a 24 grid, 1.6 stroke, round caps and joins. Rounded and soft
//  rather than geometric, because the brand is golden hour, not a spreadsheet.
//
//  ── v2.11.5: the garments are lili's, and the rest deliberately are not
//
//  The first version of this set was drawn to the Feather recipe — 24 grid,
//  uniform stroke, symmetric silhouettes — which is a good recipe and is why
//  every icon in it looked like every other app's. Rendered at the size the
//  placeholder tiles actually use, the clothes were the worst of it: the dress
//  read as a keyhole, the abaya as a lantern, the jacket as an open book, and
//  the heel as a lightbulb. Those four are the pictures on almost every tile in
//  a shopping app that sells clothes.
//
//  So the set is now split by a rule, and the rule is the point.
//
//  GARMENTS AND OBJECTS are lili's own, drawn to three constraints:
//
//    1. Hanging, not laid flat. Stock garment icons are symmetric silhouettes
//       stamped flat; real clothes hang, and second-hand clothes have hung in
//       somebody's wardrobe. Every garment here has a shoulder line, a drape,
//       and weight falling downward.
//    2. A croquis proportion — taller than wide — rather than filling the
//       square. A fashion figure is drawn tall; a spreadsheet icon is drawn
//       square.
//    3. Open hems. Terminals are left open at the bottom edge, which is both
//       what a hem is and what keeps the counters from filling in at 14px.
//
//  SYSTEM GLYPHS are deliberately conventional — search is a magnifier, the
//  cart is a cart, back is a chevron. Jakob's Law is measured in this project
//  (`npm run uxlaws`), and a search icon nobody recognises is not a signature,
//  it is a bug. The distinctiveness belongs on the subject matter, which for a
//  fashion marketplace is the clothes.
//
//  Every garment path below was drawn by rendering it at 46, 30 and 14px and
//  looking — see `npm run iconsheet`. Three of them are on their third pass;
//  the abaya went round twice more because the first two read as a t-shirt,
//  and an abaya reading as a t-shirt is not a small thing in this market.
// ─────────────────────────────────────────────────────────────────────────────

const P = {
  // ── navigation ───────────────────────────────────────────────────────────
  home:      "M3.5 10.2 12 3.5l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6h-4A1.5 1.5 0 0 1 3.5 19z",
  search:    "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14M16.2 16.2 20.5 20.5",
  plus:      "M12 5.5v13M5.5 12h13",
  shops:     "M4.2 9.6h15.6M4.2 9.6 5.9 4.8h12.2l1.7 4.8M5.7 9.6v9.9a1.4 1.4 0 0 0 1.4 1.4h9.8a1.4 1.4 0 0 0 1.4-1.4V9.6M10 20.9v-5.2a2 2 0 0 1 4 0v5.2",
  user:      "M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5M4.5 20.5c0-3.6 3.4-5.75 7.5-5.75s7.5 2.15 7.5 5.75",
  cart:      "M3.5 4.5h2.2l2.3 10.4a1.5 1.5 0 0 0 1.5 1.2h7.7a1.5 1.5 0 0 0 1.45-1.1L20.5 8H6.4M9.5 20a1 1 0 1 0 0-.01M17 20a1 1 0 1 0 0-.01",
  chat:      "M20.5 11.6c0 3.9-3.8 7-8.5 7a10 10 0 0 1-2.4-.3L4.5 20l1.2-3.4A6.6 6.6 0 0 1 3.5 11.6c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z",

  // ── actions ──────────────────────────────────────────────────────────────
  heart:     "M12 20.2 4.9 13.3a4.4 4.4 0 0 1 0-6.4 4.7 4.7 0 0 1 6.5 0l.6.6.6-.6a4.7 4.7 0 0 1 6.5 0 4.4 4.4 0 0 1 0 6.4z",
  star:      "M12 3.8l2.5 5.2 5.6.8-4 4 .9 5.7-5-2.7-5 2.7.9-5.7-4-4 5.6-.8z",
  close:     "M6 6l12 12M18 6 6 18",
  back:      "M14.5 5 7.5 12l7 7",
  forward:   "M9.5 5l7 7-7 7",
  down:      "M5 9.5l7 7 7-7",
  check:     "M4.5 12.5 9.5 17.5 19.5 6.5",
  filter:    "M3.5 6.5h17M6.5 12h11M10 17.5h4",
  camera:    "M3.5 8.5h3.2l1.4-2.3h7.8l1.4 2.3h3.2v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
  sparkle:   "M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8-4.8-1.7 4.8-1.7zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  send:      "M20.5 3.5 3.5 10.2l6.4 2.9 2.9 6.4z",

  // ── categories ───────────────────────────────────────────────────────────
  dress:     "M8.6 4.1 12 6.2l3.4-2.1 1.6 4.3-1.9 1.6.5 2.6L18.6 20a17 17 0 0 1-13.2 0l3-7.4.5-2.6-1.9-1.6z",
  bag:       "M6.2 9.2h11.6l1 10.6a1.4 1.4 0 0 1-1.4 1.5H6.6a1.4 1.4 0 0 1-1.4-1.5zM9 9.2V7a3 3 0 0 1 6 0v2.2M6.6 13.4h10.8",
  heel:      "M4.4 18.3c3.8-.5 6.7-2.5 8.7-5.9l2-3.4 3.1 1.6-1.9 3.6c1.6.5 2.7 1.4 3.1 2.8.3 1 .3 2 0 3.1H4.4zM16.3 19.5l1.5-3.4",
  abaya:     "M12 4.3 9.3 5 6.3 7.1 4.9 13.3l2.1.6.4-2.4-1.1 8.8a26 26 0 0 0 11.4 0l-1.1-8.8.4 2.4 2.1-.6-1.4-6.2-3-2.1zM12 4.3v15.9",
  jacket:    "M8.2 4.6 4.9 6.5l.9 4.4-.7 9.1h5.4M15.8 4.6l3.3 1.9-.9 4.4.7 9.1h-5.4M8.2 4.6l1.9 3.4L12 6.7l1.9 1.3 1.9-3.4M12 6.7v13.3",
  top:       "M8.9 4.2 12 6l3.1-1.8 3.4 2.3-1.5 3.7-1.4-.8.6 9.2a19 19 0 0 1-8.4 0l.6-9.2-1.4.8-1.5-3.7z",
  skirt:     "M7.9 4.6h8.2l.5 2.6-.5 1.2 2.5 11.4a20 20 0 0 1-13.2 0L7.9 8.4l-.5-1.2zM7.4 7.2h9.2",
  jewellery: "M6.6 4.6v1.3a5.4 5.4 0 0 0 10.8 0V4.6M12 11.3l-1.6 2.7a1.9 1.9 0 1 0 3.2 0z",
  sunglass:  "M3.2 8.4c2.4-.9 5-1 6.7-.3.9.4 1.4 1 1.5 1.7h1.2c.1-.7.6-1.3 1.5-1.7 1.7-.7 4.3-.6 6.7.3M3.6 8.6c-.3 2.6.6 4.6 2.4 5.3 2 .8 4-.3 4.7-2.5.2-.6.3-1.2.3-1.6M20.4 8.6c.3 2.6-.6 4.6-2.4 5.3-2 .8-4-.3-4.7-2.5a5 5 0 0 1-.3-1.6",

  // ── system ───────────────────────────────────────────────────────────────
  globe:     "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5",
  theme:     "M20.5 14.8A8.6 8.6 0 0 1 9.2 3.5a8.6 8.6 0 1 0 11.3 11.3",
  shield:    "M12 3.5 19.5 6v6c0 4-3.2 7.2-7.5 8.5C7.7 19.2 4.5 16 4.5 12V6z",
  help:      "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M9.6 9.4A2.5 2.5 0 0 1 14.5 10c0 1.7-2.5 2-2.5 3.6M12 16.8v.1",
  tag:       "M11 3.5H20.5V13l-9 9-9-9zM16.2 8.2v.1",
  receipt:   "M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4zM9 8.5h6M9 12.5h6",
  id:        "M3.5 5.5h17v13h-17zM8.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4M5.5 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14.5 10h4M14.5 14h4",
  chart:     "M4 20V4M4 20h16M8 17V11M12.5 17V7.5M17 17v-4",
  ban:       "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M6 6l12 12",
  warning:   "M12 4 21 19.5H3zM12 10v4.5M12 17.2v.1",
  truck:     "M2.5 6.5h11v10h-11zM13.5 10h3.8l3.2 3.3v3.2h-7zM7 19.5a1.6 1.6 0 1 0 0-.01M17 19.5a1.6 1.6 0 1 0 0-.01",
  lock:      "M5.5 10.5h13v10h-13zM8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7",
  card:      "M2.5 5.5h19v13h-19zM2.5 10h19M5.5 14.5h3",
  scales:    "M12 4v16M7 20h10M4 8.5h16M4 8.5 1.8 14h4.4zM20 8.5 17.8 14h4.4zM8 4.5h8",
  bank:      "M2.5 9.5 12 4l9.5 5.5zM5 9.5v8M9.5 9.5v8M14.5 9.5v8M19 9.5v8M3 20.5h18",
  palm:      "M12 20.5c0-4.5.4-7.6 1.2-9.6M12.6 10.4c-1.6-2.2-4-3-6.6-2.2 1.4-2.4 4-3.2 6.6-1.9-.4-2.6 1-4.6 3.6-5-1.2 2.2-1 4 .4 5.4 2.2-1.4 4.6-1 6.2 1-2.6-.2-4.6.6-5.8 2.4",
  gem:       "M12 20.5 3.5 9.5 6.5 4.5h11l3 5zM3.5 9.5h17M8.5 4.5 12 9.5 15.5 4.5M9 9.5l3 11 3-11",
  handshake: "M8.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2.5 20c0-3 2.7-4.5 6-4.5s6 1.5 6 4.5M15.5 9.6a2.6 2.6 0 1 0 0-5.2M17 15.9c2.7.4 4.5 1.9 4.5 4.1",
  bell:      "M12 3.5a5.5 5.5 0 0 1 5.5 5.5c0 4 1.5 5.5 2 6.5H4.5c.5-1 2-2.5 2-6.5A5.5 5.5 0 0 1 12 3.5M10 18.5a2 2 0 0 0 4 0",
  eye:       "M2.5 12S5.8 6.5 12 6.5 21.5 12 21.5 12 18.2 17.5 12 17.5 2.5 12 2.5 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  clock:     "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17M12 7.5V12l3 2",
};

// Shapes that read better filled than stroked.
const FILLED = new Set(["heartFilled", "starFilled", "send", "theme"]);
const ALIAS = { heartFilled: "heart", starFilled: "star" };

export default function Icon({ name, size = 22, stroke = 1.6, filled = false, style, ...rest }) {
  const key = ALIAS[name] || name;
  const d = P[key];
  if (!d) return null;
  const solid = filled || FILLED.has(name);
  return h("svg", {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: solid ? "currentColor" : "none",
    stroke: "currentColor",
    strokeWidth: solid ? 0 : stroke,
    strokeLinecap: "round", strokeLinejoin: "round",
    "aria-hidden": true, focusable: false,
    style: { display: "block", flexShrink: 0, ...style },
    ...rest,
  }, h("path", { d }));
}

export const ICON_NAMES = Object.keys(P);
