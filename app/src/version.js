// One place the app states its own version.
//
// It was scattered before: package.json said 1.0.0, the handover documents said
// 2.7, and the Capacitor config said something else again. A funnel event
// stamped with the wrong version is worse than one with none — it attributes a
// bug to a build that never had it.
//
// Bump here, and in package.json and android/app/build.gradle, in the same
// commit.
export const APP_VERSION = "2.11.7";

/** The CI build this APK came from ("2.11.7-b42"), or "" in a local build. */
// eslint-disable-next-line no-undef
export const BUILD = typeof __BUILD__ !== "undefined" ? __BUILD__ : "";
const n = /-b(\d+)$/.exec(BUILD);
/** "Version 2.11.7 · build 42", shown at the bottom of Profile. */
export const VERSION_LABEL = `Version ${APP_VERSION}${n ? ` · build ${n[1]}` : ""}`;
export default APP_VERSION;
