// ─────────────────────────────────────────────────────────────────────────────
//  PUSH — the seam, and why it is switched off
//
//  Nothing here sends a notification. There are no Firebase credentials, no
//  APNs key, no sender, and the `@capacitor/push-notifications` plugin is not
//  installed. Every method refuses.
//
//  ── what already works, and is not this
//
//  IN-APP notifications are real: `lili_notifications` is a table, a trigger
//  writes a row when somebody messages you, and since v2.10 the table is in the
//  realtime publication so the badge moves while the app is open.
//
//  PUSH is the other thing: reaching a woman whose phone is in her bag. It is
//  the difference between a marketplace that works and one where a seller finds
//  out about a buyer three days later, so it matters — and that is exactly why
//  it must not be faked.
//
//  ── the specific lie this file exists to prevent
//
//  A permission prompt with nothing behind it. The sequence is easy to build
//  and completely hollow: ask for notification permission, she taps Allow, a
//  settings screen shows a toggle that is on, and no notification is ever sent
//  by anyone. She has granted a real permission to a system that does not
//  exist, and she now believes she will be told when somebody messages her —
//  so she stops opening the app.
//
//  So `requestPermission()` refuses while there is no sender. Not "asks and
//  discards" — refuses, and says why. The OS prompt is a promise, and this app
//  does not make promises it cannot keep.
//
//  ── what turning it on involves
//
//  READINESS below, and none of it is code this file can write:
//  a Firebase project, google-services.json in android/app, an APNs key, an
//  Edge Function that holds the server key and sends, and a decision about
//  what a notification is allowed to SAY on a lock screen — which is a privacy
//  question, not a plumbing one. A message preview on a lock screen is that
//  message readable by anyone holding the phone.
// ─────────────────────────────────────────────────────────────────────────────

import * as remote from "../backend/remote.js";
import { APP_VERSION } from "../version.js";

export const READINESS = [
  { id: "plugin",
    what: "@capacitor/push-notifications installed and synced into both platforms",
    why: "Not a dependency of this project today. Nothing can receive a token without it." },
  { id: "firebase",
    what: "A Firebase project, with google-services.json in android/app",
    why: "Android delivery goes through FCM. Without the file the app builds and never registers." },
  { id: "apns",
    what: "An APNs key and the push capability enabled in Xcode",
    why: "iOS has never been built at all — see IOS.md. This is downstream of that." },
  { id: "sender",
    what: "A server-side sender holding the FCM key — an Edge Function, not the app",
    why: "A server key in the client is a key anybody can send notifications with, " +
         "to every device that ever registered." },
  { id: "lock-screen",
    what: "A decision about what a notification may say on a locked screen",
    why: "\"Leen: is the abaya still available?\" on a lock screen is that message " +
         "readable by whoever is holding the phone. This is a privacy decision " +
         "and it belongs to the person who owns the product, not to a default." },
  { id: "consent",
    what: "Which notifications she gets, chosen by her, stored with her consent record",
    why: "Permission to notify is not consent to notify about everything. " +
         "ComplianceProvider already holds per-purpose consent; this joins it." },
  { id: "unsubscribe",
    what: "Turning them off inside lili, not only in the OS settings",
    why: "A toggle she cannot find is not a choice she has." },
];

let sender = null;

/**
 * Register whatever actually delivers. Refuses a partial implementation for the
 * same reason the payment seam does: a `send()` that quietly does nothing is
 * indistinguishable from a working one until somebody is waiting for a message.
 */
export function registerSender(impl) {
  const required = ["name", "register", "onToken", "send"];
  const missing = required.filter((k) => impl == null || impl[k] == null);
  if (missing.length) throw new Error(`Push sender is missing: ${missing.join(", ")}`);
  sender = impl;
  return sender;
}

export const getSender = () => sender;
export const pushAvailable = () => !!sender;

const refuse = (what) => {
  const err = new Error(
    `push.${what}() — nothing sends notifications. There is no Firebase project, ` +
    `no APNs key and no sender registered. See READINESS in this file.`
  );
  err.code = "PUSH_NOT_AVAILABLE";
  return err;
};

/**
 * Ask the phone for permission.
 *
 * Refuses while there is no sender, and this is the whole point of the file. An
 * OS permission prompt is a promise to the person tapping Allow. Asking for it
 * and then never sending anything is worse than not asking: she believes she
 * will be told, and stops checking.
 */
export async function requestPermission() {
  if (!sender) throw refuse("requestPermission");
  return sender.register();
}

/**
 * Store this phone's token against her account.
 *
 * The table exists and its policies are owner-only, so a token is readable by
 * one account and no other — a device token is an identifier that follows a
 * phone across reinstalls, and a marketplace whose token table is readable is a
 * marketplace that can be used to work out who is who.
 */
export async function registerDevice(token, platform) {
  if (!sender) throw refuse("registerDevice");
  if (!token || !platform) throw new Error("A registration needs a token and a platform");
  return remote.registerPushToken(token, platform, APP_VERSION);
}

/** Stop. Removes the row rather than setting a flag — an unused token is a liability. */
export async function unregisterDevice(token) {
  if (!sender) throw refuse("unregisterDevice");
  return remote.removePushToken(token);
}

/**
 * What the app is honestly able to tell her about notifications today.
 *
 * A settings screen calls this rather than rendering a toggle. It returns a
 * sentence, because "off" invites her to turn it on and there is nothing to
 * turn on.
 */
export function status() {
  if (sender) return { available: true, sender: sender.name };
  return {
    available: false,
    say: "lili can't send notifications to your phone yet. You'll see new " +
         "messages and offers when you open the app.",
    // Deliberately not "coming soon". Every screen in this app that has said
    // "soon" about something unstarted has had to be walked back.
    why: "There is no notification service connected. Nothing is being sent to anybody.",
  };
}

export default {
  READINESS, registerSender, getSender, pushAvailable,
  requestPermission, registerDevice, unregisterDevice, status,
};
