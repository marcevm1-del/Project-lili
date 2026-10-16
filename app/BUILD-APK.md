# Building the install file

There was no APK until v2.10.0 because there was no Android SDK in the
environment this repository is built in. There is now, and the debug APK is
built. These are the exact steps, because the container that built it is
temporary and the next one will not have any of this.

## Debug APK — what you have

```
android/app/build/outputs/apk/debug/app-debug.apk     7.5 MB
```

Installable on any Android phone. Your phone will ask you to allow installing
from an unknown source, because it is signed with Android's shared debug key
rather than yours — that is what "debug" means here, not that it is a partial
build. The app itself is the full v2.10.0.

## From nothing to that file

```bash
# 1. SDK (about 700 MB, once)
export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk
mkdir -p $ANDROID_HOME/cmdline-tools
curl -sL -o /tmp/cmdtools.zip \
  https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q /tmp/cmdtools.zip -d /tmp/cmdt
mv /tmp/cmdt/cmdline-tools $ANDROID_HOME/cmdline-tools/latest
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# 2. Point Gradle at it
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# 3. Build
npm run apk        # web build + cap sync + gradlew assembleDebug
```

`android/local.properties` is machine-specific and is not committed. Java 21 and
Gradle are the only other requirements; both were already present.

## Release APK — what is still needed, and why it is not here

A release build needs a **signing keystore**, and that keystore is yours in a
way nothing else in this repository is: it is the identity Google Play uses to
decide that an update is really from you. Generate it once, keep it somewhere
you will still have it in five years, and never put it in the repository — an
app signed with a lost key cannot be updated, ever, by anyone.

```bash
keytool -genkeypair -v -keystore lili-release.jks -alias lili \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then in `android/keystore.properties` (also not committed):

```
storeFile=/absolute/path/to/lili-release.jks
storePassword=…
keyAlias=lili
keyPassword=…
```

and `npm run bundle` produces the `.aab` that Play wants.

`npm run audit` reports "Release APK built ✗" and "Play bundle ✗" until then.
That is correct: neither exists, and both need a decision only you can make.

## What you will actually see when you install it

Worth knowing before you tap it, so nothing here reads as a bug:

- **Every install is a single-player game.** Anonymous sign-in is still switched
  off on the Supabase project, so the app runs device-only: what you list is on
  your phone, and no second phone can see it. `npm run preflight` reports this
  as the one blocker. It is thirty seconds in the dashboard.
- The catalogue you see on first run is the **demo** catalogue — six shops
  marked `demo: true`. Real shops appear when the backend is reachable.
- No payments, no delivery, no authentication, no push. Every screen that
  touches those says so rather than implying otherwise.
