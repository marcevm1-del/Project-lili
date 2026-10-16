# love it or leave it — Android app

Dubai's luxury resale community. **Second hand. First class.**

Your `dubai-marketplace.jsx` prototype, packaged as a real, signed, installable
Android app. Package ID `com.loveitorleaveit.lili`, targeting API 35 (Android 15),
minimum API 23 (Android 6.0) — that covers roughly 99% of active devices.

---

## What's in the box

```
lili-app/
├─ src/
│  ├─ Marketplace.jsx     your 1,922-line app, patched for mobile (see below)
│  ├─ Disclaimers.jsx     your shop agreement / listing disclaimer components
│  ├─ App.jsx             root shell — boots the native status bar & splash
│  ├─ native.js           thin Capacitor bridge (no-ops in a browser)
│  ├─ main.jsx            React entry point
│  └─ index.css           mobile reset — kills overscroll, tap flash, zoom-on-focus
├─ android/               native Android project (Gradle, manifest, resources)
│  ├─ lili-release.jks    ⚠ upload signing key — read the warning below
│  └─ keystore.properties ⚠ its passwords — git-ignored, keep it off shared drives
├─ resources/             1024px icon + 2732px splash sources
├─ store/                 Play listing icon (512) and feature graphic (1024×500)
├─ capacitor.config.json
└─ vite.config.js
```

## Prerequisites

- **Node.js 20+**
- **Android Studio** (bundles the JDK and SDK) — or a standalone JDK 17+ and
  Android SDK with platform 35 and build-tools 34 + 35

## Commands

```bash
npm install

npm run dev        # live preview in a browser at localhost:5173
npm run build      # compile the web bundle to dist/
npm run sync       # build + copy into the Android project
npm run android    # sync + open in Android Studio (press ▶ to run on a device)

npm run apk        # sync + build a debug APK for sideloading
npm run bundle     # sync + build the signed .aab for Google Play
```

Artifacts land in:

| File | Path |
|---|---|
| Play upload bundle | `android/app/build/outputs/bundle/release/app-release.aab` |
| Sideload APK (release) | `android/app/build/outputs/apk/release/app-release.apk` |
| Debug APK | `android/app/build/outputs/apk/debug/app-debug.apk` |

## Install it on a phone right now

Copy `app-release.apk` to an Android device, tap it, and allow "install from
unknown sources" when prompted. That's the real thing — same binary Play would
serve, just self-distributed.

---

## Changes made to your source

`Marketplace.jsx` is your file. Seven surgical edits, nothing else touched:

1. **Homoglyph bug fixed.** `isCalibреOK` used Cyrillic "ре". Renamed to
   `isCaliberOK`. It is still dead code — nothing calls it. If it was meant to
   gate listings by brand-versus-price, wire it into the listing form.
2. **Import** of the `useAndroidBack` hook.
3. **Tab bar** now pads by `env(safe-area-inset-bottom)` so it clears the Android
   gesture bar instead of sitting under it.
4. **Top bar** pads by `env(safe-area-inset-top)` for notches and punch-holes.
5. **`export default function App`** renamed to `Marketplace` so the native shell
   can wrap it.
6. **Hardware back button wired** to your existing navigation state — closes the
   story viewer, then the offer modal, then the item modal, then walks
   shopview → sellers and any tab → home, and only then minimises the app.
   Without this, one back press would kill the app from any screen, which is an
   instant one-star review.
7. **`100vh` → `100dvh`** so the layout doesn't jump when the browser chrome
   collapses.

---

## ⚠ About the signing key

`android/lili-release.jks` is a 4096-bit upload key I generated so you'd have a
bundle you can actually upload today. Its password is in
`android/keystore.properties` in plain text — which is fine for a key nobody has
seen but me and you, and not fine once this repo touches a shared drive.

Two sane options:

- **Keep it.** Move `keystore.properties` out of any synced folder, back up the
  `.jks` somewhere you will still have in five years. Both are already in
  `.gitignore`.
- **Replace it** (recommended before first upload):
  ```bash
  cd android
  keytool -genkeypair -v -keystore lili-release.jks -alias lili \
    -keyalg RSA -keysize 4096 -validity 10000
  ```
  then update `keystore.properties` with your own passwords.

Because Play App Signing is mandatory for new apps, this is only your *upload*
key — if you lose it, Google can reset it. Google holds the real distribution
key. Still: back it up.

Current key fingerprint (SHA-256):
`3F:38:EE:21:B5:58:11:10:C5:68:B4:E7:0A:72:0B:13:9E:16:F1:1C:EF:22:79:AD:CD:FF:00:67:25:01:8B:C3`

---

## Read `PLAY-STORE-CHECKLIST.md` before you upload

The app builds and runs. It is not yet a shippable product — all data is
hardcoded and resets when the app closes, and there are four Play policies a
luxury resale marketplace has to satisfy that this build doesn't yet. The
checklist covers all of it.
