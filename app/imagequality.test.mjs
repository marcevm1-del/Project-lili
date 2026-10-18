// ─────────────────────────────────────────────────────────────────────────────
//  CALIBRATING THE PHOTO CHECK
//
//  Run: npm run imagequality
//
//  Every threshold in src/data/imageQuality.js is a claim that a number
//  separates a good photograph from a bad one. A claim like that is worth
//  nothing asserted; this generates the cases and checks the separation holds.
//
//  The images are synthetic on purpose. A fixture folder of real photographs
//  would be better evidence and worse engineering — it cannot be reviewed in a
//  diff, it drifts, and nobody can tell from the test why a threshold is where
//  it is. Generated images make the shape of each case explicit: this one is
//  the same pattern with a box blur over it, that one is the same pattern at a
//  fifth of the brightness.
//
//  What this cannot tell you is whether the thresholds match real Dubai
//  bedrooms at 9pm. That needs photographs from the first thirty sellers, and
//  the funnel now records which findings were shown, so it will be answerable.
// ─────────────────────────────────────────────────────────────────────────────
import { measure, assess, T, sharpness, grey } from "./src/data/imageQuality.js";

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? `  ${detail}` : ""}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// ── image generators ────────────────────────────────────────────────────────

function blank(w, h, v = 128) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

/**
 * A garment-ish subject: a textured rectangle on a plain ground.
 *
 * The weave period SCALES with the image, and that detail is the whole point of
 * the resolution test. Photograph the same dress at 600px and at 1800px and the
 * weave is three times as many pixels across in the second — it does not stay
 * three pixels wide. Fixing the period made the two cases different scenes, not
 * the same scene at two sizes, and the test was then measuring the sampling
 * limit rather than the thing it claims to measure.
 *
 * It matters beyond the test: a weave finer than the working scale genuinely is
 * lost, and no downsampling measure can see it. That is a stated limitation of
 * this approach, not something to tune away.
 */
function garment(w, h, { fill = 0.7, subjectLum = 90, groundLum = 205, texture = 55 } = {}) {
  const img = blank(w, h, groundLum);
  const sw = Math.round(w * fill), sh = Math.round(h * fill);
  const x0 = Math.round((w - sw) / 2), y0 = Math.round((h - sh) / 2);
  const period = Math.max(3, Math.round(w / 300));   // ~3px at 900px wide
  for (let y = y0; y < y0 + sh; y++) {
    for (let x = x0; x < x0 + sw; x++) {
      const t = ((Math.floor(x / period) % 2 === 0) !== (Math.floor(y / period) % 2 === 0))
        ? texture : -texture;
      const v = Math.max(0, Math.min(255, subjectLum + t));
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
  }
  return img;
}

/** Box blur — the thing a shaky hand or a missed focus actually does. */
function blur(img, radius) {
  const { data, width: w, height: h } = img;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || yy >= h || xx < 0 || xx >= w) continue;
          s += data[(yy * w + xx) * 4]; n++;
        }
      }
      const v = s / n, i = (y * w + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}

/** Scale every pixel — under- or over-exposure, as a phone produces it. */
function expose(img, k, lift = 0) {
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, img.data[i] * k + lift));
    out[i] = out[i + 1] = out[i + 2] = v; out[i + 3] = 255;
  }
  return { data: out, width: img.width, height: img.height };
}

// ── the cases ───────────────────────────────────────────────────────────────

const W = 900, H = 1200;                 // a phone photograph, portrait
const good      = garment(W, H);
const soft      = blur(good, 2);
const veryBlurry= blur(good, 6);
const dark      = expose(good, 0.16);
const blown     = expose(good, 1.9, 60);
const small     = garment(W, H, { fill: 0.22 });
const landscape = garment(H, W);

const m = {
  good: measure(good), soft: measure(soft), veryBlurry: measure(veryBlurry),
  dark: measure(dark), blown: measure(blown), small: measure(small),
  landscape: measure(landscape),
};

section("1. The measures separate the cases at all");

check("a sharp photograph scores far above a blurred one",
  m.good.sharpness > m.soft.sharpness * 3,
  `sharp ${m.good.sharpness.toFixed(0)} vs soft ${m.soft.sharpness.toFixed(0)}`);
check("more blur scores lower than less",
  m.soft.sharpness > m.veryBlurry.sharpness,
  `soft ${m.soft.sharpness.toFixed(0)} vs very ${m.veryBlurry.sharpness.toFixed(0)}`);
check("brightness tracks exposure",
  m.dark.mean < m.good.mean && m.good.mean < m.blown.mean,
  `${m.dark.mean.toFixed(0)} < ${m.good.mean.toFixed(0)} < ${m.blown.mean.toFixed(0)}`);
check("a piece filling the frame reads differently from one lost in it",
  m.good.fill > m.small.fill * 2,
  `full ${(m.good.fill * 100).toFixed(0)}% vs small ${(m.small.fill * 100).toFixed(0)}%`);
check("orientation is detected",
  m.good.portrait === true && m.landscape.portrait === false);

section("2. The thresholds sit between the cases, not on top of one");

check("a good photograph is above the blur threshold",
  m.good.sharpness > T.blurry,
  `${m.good.sharpness.toFixed(0)} > ${T.blurry}`);
check("a badly blurred one is below the hard threshold",
  m.veryBlurry.sharpness < T.veryBlurry,
  `${m.veryBlurry.sharpness.toFixed(0)} < ${T.veryBlurry}`);
check("a dark frame is below the dark threshold",
  m.dark.mean < T.dark, `${m.dark.mean.toFixed(0)} < ${T.dark}`);
check("a good frame is not",
  m.good.mean > T.dark && m.good.mean < T.bright, `${m.good.mean.toFixed(0)}`);
check("a blown frame trips either mean or clipping",
  m.blown.mean > T.bright || m.blown.blownPct > T.blownPct,
  `mean ${m.blown.mean.toFixed(0)} clipped ${(m.blown.blownPct * 100).toFixed(0)}%`);

section("3. What a seller is actually told");

check("a good photograph is left alone", assess(m.good).length === 0,
  JSON.stringify(assess(m.good).map((f) => f.code)));
check("a badly blurred one says it is out of focus",
  assess(m.veryBlurry).some((f) => f.code === "blur.bad"));
check("a dark one says to move to the window",
  assess(m.dark).some((f) => f.code === "exposure.dark" && /window/i.test(f.fix)));
check("a washed-out one is told something different from a dark one",
  assess(m.blown).some((f) => f.code === "exposure.blown"));
check("a piece lost in the frame is told to move closer",
  assess(m.small).some((f) => f.code === "framing.small"));
check("a sideways photograph is told the tiles are tall",
  assess(m.landscape).some((f) => f.code === "framing.landscape"));

section("4. It never buries her");

check("at most two findings for one photograph",
  [m.good, m.soft, m.veryBlurry, m.dark, m.blown, m.small, m.landscape]
    .every((x) => assess(x).length <= 2));
check("every finding names a fix, not just a fault",
  [m.veryBlurry, m.dark, m.blown, m.small, m.landscape]
    .flatMap(assess).every((f) => f.fix && f.fix.length > 12 && /\w/.test(f.fix)));
// This check used to match /out of/ and therefore matched its own advice,
// "out of focus" — an honesty grep tripping over the honest text, the same
// mistake research.test.mjs made once and now guards with stripComments.
check("nothing scores her out of ten",
  [m.dark, m.veryBlurry, m.small].flatMap(assess).every((f) =>
    !/\bscore\b|\brating\b|\d\s*\/\s*10|out of (ten|10)/i.test(f.title + " " + f.fix)));

section("5. It does not fall over");

check("an empty image is not a crash", Array.isArray(assess(measure(blank(4, 4)))));
check("a one-pixel image is not a crash", Array.isArray(assess(measure(blank(1, 1)))));
check("no measurement is NaN",
  Object.values(m).every((x) =>
    Object.values(x).every((v) => typeof v !== "number" || Number.isFinite(v))));
check("a flat grey frame is not called blurry AND dark AND small at once",
  assess(measure(blank(400, 600, 128))).length <= 2);

// A photograph is measured on a downscaled copy so one threshold means the same
// thing on every phone. If that stopped being true the numbers above would be
// meaningless on a 4000px camera and fine on a 900px one.
section("6. The measure does not depend on the phone");

const bigSharp = garment(1800, 2400);
const smallSharp = garment(600, 800);
const ratio = measure(bigSharp).sharpness / measure(smallSharp).sharpness;
check("the same scene at two resolutions scores within 3x",
  ratio > 0.33 && ratio < 3, `ratio ${ratio.toFixed(2)}`);
check("greyscale always downsamples to a fixed working width",
  grey(garment(4000, 3000)).w <= 340 && grey(garment(600, 800)).w <= 340);
// The limitation, stated rather than tuned away: texture finer than the working
// scale is averaged out and cannot be seen. A real weave at 1600px is many
// pixels across; a one-pixel pattern is not something any downsampled measure
// can recover, and pretending otherwise would be tuning to the test.
const hairline = blank(1800, 2400, 205);
for (let y = 0; y < 2400; y++) for (let x = 0; x < 1800; x++)
  if ((x + y) % 2 === 0) { const i = (y * 1800 + x) * 4; hairline.data[i] = hairline.data[i+1] = hairline.data[i+2] = 60; }
check("texture finer than the working scale is knowingly invisible",
  measure(hairline).sharpness < T.blurry,
  `${measure(hairline).sharpness.toFixed(0)} — a 1px pattern, correctly unseen`);

console.log(`\n\x1b[1m${pass}/${pass + fail} passed\x1b[0m`);
if (fail) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
console.log(`\n\x1b[2mSynthetic images calibrate the separation, not the real world. The`);
console.log(`thresholds meet Dubai bedrooms for the first time during the beta, and`);
console.log(`the funnel records which findings were shown so that is answerable.\x1b[0m\n`);
