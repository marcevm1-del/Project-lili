// ─────────────────────────────────────────────────────────────────────────────
//  LOOKING AT THE PHOTOGRAPH
//
//  `PhotoCoach` gives advice — natural light, plain background, show the flaws.
//  All true, all generic, and it has never looked at a single picture. A seller
//  who has just uploaded something dark and blurry is told, in the abstract, to
//  use natural light, next to the photograph that proves she didn't.
//
//  Photographs are the largest single determinant of whether a piece sells, and
//  the moment to fix one is while she is still holding the item. Ten seconds
//  later she has put it away.
//
//  ── how this is built, and why
//
//  Everything here is a pure function over a pixel array. No canvas, no DOM, no
//  model. That is not minimalism for its own sake: it means the thresholds can
//  be calibrated against generated images in a test rather than guessed, and it
//  means nothing about her photograph leaves the phone to be assessed.
//
//  ── what it will not say
//
//  It reports what it can measure and nothing else. It does not guess what the
//  piece is, does not judge composition, and does not score her out of ten. A
//  number a seller cannot act on is a number that only makes her feel watched.
//  Every finding below names the specific thing to change.
// ─────────────────────────────────────────────────────────────────────────────

/** Rec. 709 luminance, the one that matches how a person sees brightness. */
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Greyscale, downsampled to a fixed working width — by AVERAGING.
 *
 * Sharpness has to be measured at a known scale or the threshold means nothing:
 * the same photograph at 1600px and at 400px produces wildly different
 * Laplacian variance, so a fixed working copy is what makes one number
 * comparable across every phone.
 *
 * The averaging is the part that took a failing test to find. The first version
 * sampled every Nth pixel, and fine fabric texture is exactly the frequency
 * that nearest-neighbour sampling destroys: the same scene scored 100x lower at
 * 1800px than at 600px, because at the higher resolution the weave fell between
 * the samples. On a modern phone camera that reads a perfectly sharp photograph
 * of linen as blurred. Averaging each block keeps the energy of the texture,
 * and the two resolutions now agree.
 */
export function grey({ data, width, height }, target = 320) {
  const step = Math.max(1, Math.round(width / target));
  const w = Math.max(1, Math.floor(width / step));
  const h = Math.max(1, Math.floor(height / step));
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = 0; dy < step; dy++) {
        const sy = y * step + dy;
        if (sy >= height) break;
        for (let dx = 0; dx < step; dx++) {
          const sx = x * step + dx;
          if (sx >= width) break;
          const i = (sy * width + sx) * 4;
          sum += lum(data[i], data[i + 1], data[i + 2]); n++;
        }
      }
      out[y * w + x] = n ? sum / n : 0;
    }
  }
  return { g: out, w, h };
}

/**
 * Blur, as the variance of the Laplacian.
 *
 * A sharp photograph has strong second derivatives at every edge; a blurred one
 * has almost none, because blurring is what removes them. Variance over the
 * whole frame is the standard measure and it needs no reference image, which is
 * the property that makes it usable here.
 *
 * It has one known weakness worth writing down: a deliberately soft photograph
 * of a plain, texture-less object scores low without being badly taken. So the
 * finding it produces is a suggestion, never a block.
 */
export function sharpness({ g, w, h }) {
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = -4 * g[i] + g[i - 1] + g[i + 1] + g[i - w] + g[i + w];
      sum += v; sumSq += v * v; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Mean brightness, and how much of the frame has been pushed off either end. */
export function exposure({ g }) {
  let sum = 0, dark = 0, blown = 0;
  for (let i = 0; i < g.length; i++) {
    const v = g[i];
    sum += v;
    if (v < 12) dark++;
    if (v > 246) blown++;
  }
  const n = g.length || 1;
  return { mean: sum / n, darkPct: dark / n, blownPct: blown / n };
}

/**
 * How much of the frame the piece occupies.
 *
 * Not object detection. The background is taken as the median luminance of the
 * border — in a listing photograph the edge of the frame is nearly always the
 * bed, the wall or the floor — and the subject is everything far enough from
 * it. The fraction of such pixels is the fill.
 *
 * The first version compared detail in the middle against detail at the edges,
 * and it did not work at all: a garment on a plain ground has all the detail in
 * the middle whether it fills the frame or sits lost in it, so the measure was
 * high in both cases. The test caught it, which is the whole reason the test
 * generates a small-in-frame case rather than asserting the formula.
 *
 * It is still crude — a busy background defeats it — so it only ever produces
 * the gentlest of the findings, and only when nothing more useful was found.
 */
export function framing({ g, w, h }) {
  const border = [];
  for (let x = 0; x < w; x++) { border.push(g[x], g[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { border.push(g[y * w], g[y * w + w - 1]); }
  if (!border.length) return { fill: 1, background: 0 };
  border.sort((a, b) => a - b);
  const bg = border[Math.floor(border.length / 2)];

  // Far enough from the background to be the piece. 18 levels out of 255 is
  // about the point where a person would say "that is not the same colour".
  let subject = 0;
  for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - bg) > 18) subject++;
  return { fill: g.length ? subject / g.length : 1, background: bg };
}

/**
 * Sharpness at more than one working scale, taking the best.
 *
 * Downsampling by an integer block is quantised, so whether a given weave lands
 * in phase with the blocks depends on the exact resolution — the same scene at
 * 600px and 1800px measured four times apart, purely from that alignment.
 * Measuring at two scales and keeping the higher removes most of it, and errs
 * in the right direction: a photograph is called sharp if it looks sharp at
 * either scale, so the failure mode is missing a soft photograph rather than
 * telling a seller her good one is blurred.
 */
function bestSharpness(imageData) {
  return Math.max(sharpness(grey(imageData, 320)), sharpness(grey(imageData, 200)));
}

export function measure(imageData) {
  const gm = grey(imageData);
  const e = exposure(gm);
  const f = framing(gm);
  return {
    sharpness: bestSharpness(imageData),
    ...e,
    fill: f.fill,
    width: imageData.width,
    height: imageData.height,
    portrait: imageData.height >= imageData.width,
  };
}

// ── thresholds ──────────────────────────────────────────────────────────────
//
// Calibrated in imagequality.test.mjs against generated images rather than
// chosen by eye: a sharp synthetic pattern, the same pattern blurred, an
// underexposed frame, a blown-out one. Every number below has a test that
// fails if it stops separating them.
//
// They are deliberately loose. A false "this is blurry" on a photograph that is
// fine teaches a seller to ignore the whole feature, and the feature is only
// worth having if she believes it.
export const T = {
  blurry:      120,    // Laplacian variance below this reads as soft
  veryBlurry:   40,
  dark:         62,    // mean luminance
  bright:      212,
  darkPct:    0.42,    // proportion of the frame crushed to black
  blownPct:   0.22,
  smallInFrame: 0.14,  // less than this much of the frame is the piece
};

/**
 * What to change, in the order worth changing it.
 *
 * Each finding names the fix, because "this photo is dark" is an observation
 * and "move to the window" is help. At most two are returned: a list of five
 * problems with one photograph is a reason to give up.
 */
export function assess(m) {
  if (!m) return [];
  const found = [];

  if (m.sharpness < T.veryBlurry) {
    found.push({ code: "blur.bad", severity: "high",
      title: "This one is out of focus",
      fix: "Tap the piece on your screen before you shoot, hold still, and take it again." });
  } else if (m.sharpness < T.blurry) {
    found.push({ code: "blur.soft", severity: "medium",
      title: "A little soft",
      fix: "Tap to focus on the fabric and retake it — buyers zoom in on stitching." });
  }

  if (m.mean < T.dark || m.darkPct > T.darkPct) {
    found.push({ code: "exposure.dark", severity: "high",
      title: "Too dark to see the colour",
      fix: "Move next to a window and turn the ceiling light off. Daylight, no flash." });
  } else if (m.mean > T.bright || m.blownPct > T.blownPct) {
    found.push({ code: "exposure.blown", severity: "medium",
      title: "The light has washed it out",
      fix: "Step out of direct sun, or turn so the light is behind you rather than behind the piece." });
  }

  if (found.length < 2 && m.fill < T.smallInFrame) {
    found.push({ code: "framing.small", severity: "low",
      title: "The piece is small in the frame",
      fix: "Move closer, or crop in, so it fills most of the picture." });
  }

  if (found.length < 2 && !m.portrait) {
    found.push({ code: "framing.landscape", severity: "low",
      title: "Sideways photograph",
      fix: "The feed shows tall tiles, so a wide photo gets cropped. Turn the phone upright." });
  }

  return found.slice(0, 2);
}

/** True when nothing measurable is wrong — used to say so, once, and stop. */
export const looksGood = (m) => assess(m).length === 0;
