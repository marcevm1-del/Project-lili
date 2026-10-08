import { Capacitor } from "@capacitor/core";
import { setJSON, getJSON } from "../compliance/store.js";
// imageQuality.js is imported inside processImage rather than here. It is 10 kB
// of pixel analysis and this module is reachable from the first paint (the
// listing screen reads LIMITS in render), so a static import shipped the blur
// and exposure maths to everybody who opens the app. processImage is already
// async and already awaiting a decode; one more await costs nothing.

// ─────────────────────────────────────────────────────────────────────────────
//  IMAGES
//
//  Listings are currently emoji. This is the path to real photos.
//
//  The privacy point, which is easy to miss and expensive to get wrong: a photo
//  taken on a phone carries EXIF metadata, and that routinely includes GPS
//  coordinates. A seller photographing a handbag on her bed publishes her home
//  address to every buyer who downloads the image. That is a reportable data
//  incident under the PDPL and GDPR, and it is entirely preventable.
//
//  Redrawing the image through a canvas discards EXIF as a side effect — the
//  canvas holds pixels, not metadata. So resizing and stripping are the same
//  operation, which is why they happen together and unconditionally here.
// ─────────────────────────────────────────────────────────────────────────────

export const LIMITS = {
  maxBytes: 8 * 1024 * 1024,      // before processing
  maxDimension: 1600,             // long edge after processing
  thumbDimension: 400,
  quality: 0.82,                  // JPEG, visually lossless for fashion detail
  maxPerListing: 8,
  minPerListing: 1,
  accepted: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
};

export function validateFile({ type, size }) {
  const problems = [];
  if (!LIMITS.accepted.includes((type || "").toLowerCase())) {
    problems.push({ code: "type", message: "That file type isn't supported. Use a photo." });
  }
  if (size > LIMITS.maxBytes) {
    problems.push({
      code: "size",
      message: `Photo is ${(size / 1048576).toFixed(1)}MB — the limit is ${LIMITS.maxBytes / 1048576}MB.`,
    });
  }
  return { ok: problems.length === 0, problems };
}

/** Long edge capped, aspect ratio kept, never upscaled. */
export function targetSize(width, height, max = LIMITS.maxDimension) {
  if (width <= 0 || height <= 0) return { width: 0, height: 0, scaled: false };
  const longEdge = Math.max(width, height);
  if (longEdge <= max) return { width, height, scaled: false };
  const ratio = max / longEdge;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
    scaled: true,
  };
}

export function countProblems(count) {
  if (count < LIMITS.minPerListing) {
    return { ok: false, message: "Add at least one photo — listings without one rarely sell." };
  }
  if (count > LIMITS.maxPerListing) {
    return { ok: false, message: `That's ${count} photos. The limit is ${LIMITS.maxPerListing}.` };
  }
  return { ok: true };
}

/**
 * Redraw through a canvas: resizes and drops all metadata in one pass.
 * Browser/WebView only — needs a real canvas, so it is exercised on device
 * rather than in the jsdom suite.
 */
export async function processImage(dataUrl, max = LIMITS.maxDimension) {
  const img = await loadImage(dataUrl);
  const { width, height } = targetSize(img.width, img.height, max);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);

  // v2.9.1 — look at it while the pixels are already here.
  //
  // PhotoCoach has given generic advice since v2.8 and has never looked at a
  // photograph. The canvas needed to strip EXIF is the same canvas that can be
  // read back, so measuring costs one getImageData and no extra decode, and it
  // happens on the phone: nothing about her picture is sent anywhere to be
  // judged.
  //
  // Only on the full-size pass. The 400px thumbnail is a different scale and
  // measuring it would produce a second, disagreeing answer about the same
  // photograph.
  let quality = null;
  if (max === LIMITS.maxDimension && width > 8 && height > 8) {
    try {
      const { measure } = await import("./imageQuality.js");
      quality = measure(ctx.getImageData(0, 0, width, height));
    } catch {
      // A tainted or oversized canvas throws on read. A photograph that cannot
      // be measured is not a photograph that cannot be listed.
      quality = null;
    }
  }

  // Output is built from pixels alone. No EXIF, no GPS, no capture device.
  return {
    dataUrl: canvas.toDataURL("image/jpeg", LIMITS.quality),
    width, height,
    originalWidth: img.width, originalHeight: img.height,
    metadataStripped: true,
    quality,
  };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image"));
    img.src = src;
  });
}

/**
 * Capture from camera or gallery. Uses @capacitor/camera on device and falls
 * back to a file input in a browser, so `npm run dev` still works.
 */
export async function pickImage({ source = "prompt" } = {}) {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const shot = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: source === "camera" ? CameraSource.Camera
            : source === "gallery" ? CameraSource.Photos
            : CameraSource.Prompt,
    });
    return shot.dataUrl;
  }
  return pickViaInput();
}

function pickViaInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = LIMITS.accepted.join(",");
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return reject(new Error("No file chosen"));
      const check = validateFile(file);
      if (!check.ok) return reject(new Error(check.problems[0].message));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Couldn't read that file"));
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

// ── storage ────────────────────────────────────────────────────────────────
// Data URLs on device for now. On the server these become Storage paths, and
// only the path travels with the listing — see BACKEND-CONTRACT.md.
const KEY = "lili.images.v1";

export async function store(id, processed) {
  const all = await getJSON(KEY, {});
  all[id] = processed;
  await setJSON(KEY, all);
  return id;
}

export async function load(id) {
  return (await getJSON(KEY, {}))[id] || null;
}

export async function addPhoto(dataUrl) {
  const full = await processImage(dataUrl, LIMITS.maxDimension);
  const thumb = await processImage(dataUrl, LIMITS.thumbDimension);
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  await store(id, { ...full, thumb: thumb.dataUrl });
  return { id, ...full, thumb: thumb.dataUrl };
}
