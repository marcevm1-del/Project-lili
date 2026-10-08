# iOS — what exists, and what needs a Mac

Written after v2.10 went through the iOS project properly. The short version:
the project is real and correctly configured, and **nothing about it has ever
been compiled**, because compiling it needs Xcode on macOS and this repository
has only ever been built on Linux.

That distinction matters more than it sounds. "Configured" and "builds" are
different claims, and the second one has not been earned.

---

## What is actually there

`ios/App` is a genuine Capacitor project, not a placeholder:

- `App.xcodeproj` with the workspace, `Podfile`, and the Cordova plugin bridge
- App icon and splash assets at the sizes Apple requires
- `AppDelegate.swift`, `Main.storyboard`, `LaunchScreen.storyboard`
- `Info.plist` with the URL scheme, and the three permission strings iOS
  refuses a build without: camera, photo library, photo library add

## What v2.10 fixed in it

Four things, each of which would have surfaced as a confusing rejection or a
bad first impression rather than a clean error:

**`UIRequiredDeviceCapabilities` said `armv7`.** That is the 32-bit instruction
set. The last 32-bit iPhone was the 5c and iOS has not run 32-bit apps since
iOS 11, so this asked the App Store for a set of devices that no longer exists.
It is a Capacitor template leftover, and it is now `arm64`.

**Landscape was declared supported.** It is not. Every screen is a single
narrow column with a fixed bottom bar, there is no landscape layout, and a
reviewer who rotates the phone sees a stretched feed with the navigation
halfway up the screen. Portrait only now, on iPhone and iPad.

**Arabic was not declared.** `CFBundleLocalizations` listed nothing, so iOS
reported the app as English-only in Settings → lili → Language and an
Arabic-first phone was never offered the switch the app has had since v2.9.3.
Both languages are declared now.

**Export compliance was unanswered.** `ITSAppUsesNonExemptEncryption` is now
`false` in the plist, which is the correct answer — the app uses HTTPS and the
platform's own crypto and nothing else — and answering it once here is better
than answering it by hand, possibly differently, on every upload.

An `ios` section was also added to `capacitor.config.json`: the cream
background so the WebView does not flash white before the splash, and
`contentInset: "always"` so content clears the notch and the home indicator.

**Deliberately not set:** `limitsNavigationsToAppBoundDomains`. It is the right
setting in principle and it interacts with `WKAppBoundDomains` in ways that can
silently break the Supabase connection. Turning on a security setting nobody
can test is how you ship an app that cannot reach its own database. It goes in
on the first Mac, with the network tab open.

---

## What still needs a Mac, in order

Nothing below can be done from Linux. None of it is hard; all of it is
unverified.

1. **`npm run sync:ios`** — builds the web app and copies it into
   `ios/App/App/public`. The copy currently in the repository is from an older
   build and is stale by several releases.
2. **`cd ios/App && pod install`** — CocoaPods is required and is not installed
   here.
3. **Open `App.xcworkspace`** (the workspace, never the project) and set the
   team and signing identity.
4. **Build to a simulator.** This is the first moment anybody will know whether
   the app runs on WebKit at all. Expect work here — it is the same web app,
   but WebKit is not Chromium:
   - safe areas behave differently, and every `env(safe-area-inset-*)` in
     `index.css` wants checking against a notched device
   - `position: sticky` inside a scrolling container is more fragile
   - the keyboard resizes the viewport differently; `Keyboard.resize: "native"`
     is set for Android and may want a different value here
   - `100dvh` is supported but settles differently as the toolbar hides
5. **Build to a real device**, and photograph something. The camera and photo
   library are the only native capabilities this app uses, and the permission
   strings above are the only thing standing between it and a rejection.
6. **Then, and only then**, turn on `limitsNavigationsToAppBoundDomains` and
   confirm the Supabase calls still work.

---

## What is not built for iOS, and is not iOS's fault

Push notifications, payments, delivery and third-party sign-in are unbuilt on
both platforms. iOS adds nothing to that list and removes nothing from it. See
`AUTH-AND-IOS.md` for the sign-in side.

---

## The honest status line

If someone asks whether lili runs on iPhone: **it has never been run on an
iPhone.** The project is configured, the mistakes a template leaves behind have
been taken out, and the first build is a morning's work for whoever has a Mac.
Saying anything stronger than that would be the kind of claim this project
spends most of its releases removing.
