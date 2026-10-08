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
export default APP_VERSION;
