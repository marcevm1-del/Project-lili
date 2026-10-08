# Android support

## The short version

| Android | WebView shipped | lili |
|---|---|---|
| 14 (API 34) | Chrome 120 | ✅ Full |
| 13 (API 33) | Chrome 108 | ✅ Full |
| 12 (API 31) | Chrome 94 | ✅ Full |
| 11 (API 30) | Chrome 83 | ✅ Full |
| 10 (API 29) | Chrome 74 | ✅ Full |
| 9 Pie (API 28) | Chrome 66 | ✅ Full |
| 8 Oreo (API 26) | Chrome 58 | ⚠️ Needs a WebView update |
| 7 Nougat (API 24) | Chrome 51 | ⚠️ Needs a WebView update |
| 6 Marshmallow (API 23) | Chrome 44 | ⚠️ Needs a WebView update |

Run `npm run android-compat` to regenerate this from the actual built bundle.

## Why Android version isn't really the question

The whole app renders inside **Android System WebView**, which updates through
the Play Store independently of the OS. An Android 8 phone that has kept up with
updates is running a recent Chrome and works perfectly. An Android 13 phone with
Play Services stripped out could be years behind.

So the table above is the **worst case**: a device whose WebView has never been
updated since the day it shipped. In practice the overwhelming majority of
active devices are fine.

The three rows marked ⚠️ can start the app the moment WebView is updated, which
is a free two-minute action from the Play Store — and the app tells the user
exactly that rather than failing silently.

## What the app requires

**Chrome 61** to start, **Chrome 61** to render correctly. It began this work
requiring Chrome 111.

| Was | Now | How |
|---|---|---|
| Chrome 111 | — | `color-mix()` replaced with plain `rgba()` |
| Chrome 108 | enhancement | `100vh` declared before `100dvh` |
| Chrome 87 | — | `inset: 0` written as top/right/bottom/left |
| Chrome 86 | enhancement | `:focus-visible` is additive |
| Chrome 76 | polyfilled | `Promise.allSettled` |
| Chrome 71 | polyfilled | `globalThis` |
| Chrome 69 | enhancement | plain padding declared before `env()` calc |
| Chrome 54 | polyfilled | `Object.entries` |

The pattern throughout is **declare the fallback first, the modern value
second**. An old engine drops the line it cannot parse and keeps the fallback; a
new engine overrides it. No feature detection, no branching, no bundle bloat.

The one thing that cannot be faked away is **ES modules (Chrome 61)**. Below
that the browser will not execute the bundle at all.

## What a user on an unsupported device sees

Not a white screen. `index.html` carries a fallback inside `#root` that React
replaces on mount. If the bundle never parses, that fallback stays on screen:
lili's peach background, the wordmark, and instructions in English and Arabic to
update Android System WebView.

`npm run oldwebview` proves this by blocking the bundle and asserting the
message renders — six checks, because a fallback nobody has tested is a fallback
that doesn't exist.

## Should minSdkVersion change?

Currently **23**. Three options:

**Keep 23.** Widest reach. Devices on Android 6–8 with stale WebViews get a
clear instruction rather than a broken app. Recommended — the fallback makes
this safe, and excluding devices in a price-sensitive market has a cost.

**Raise to 26 (Android 8).** Drops the two oldest rows. Barely changes real
reach — Android 6 and 7 are a fraction of a percent of active devices — and
removes two rows from this table.

**Raise to 28 (Android 9).** Every supported device renders fully even with an
original WebView. Cleanest guarantee, smallest reach.

The commercial question is whether anyone in your market is shopping for a
Chanel bag on a nine-year-old phone. Probably not — but the fallback costs
nothing and covers it either way.

## Things this cannot tell you

This is static analysis of the bundle plus rendering in desktop Chromium. It
does not catch WebView-specific bugs, differences in Samsung's or Huawei's
WebView builds, or how the app behaves on a device under memory pressure. Those
need the APK on real handsets, which remains the one test I cannot run for you.
