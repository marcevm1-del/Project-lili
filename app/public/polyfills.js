/* ─────────────────────────────────────────────────────────────────────────────
   WHAT AN OLD WEBVIEW DOES NOT HAVE

   Loaded as a classic script, before the module bundle. Classic scripts run
   ahead of deferred module scripts, so everything below exists by the time any
   application code does.

   Its own file rather than an inline <script> because the page's
   Content-Security-Policy is script-src 'self' with no 'unsafe-inline' — the
   whole point of which is that nothing can inject script here. A same-origin
   file is allowed; weakening the policy to ship five polyfills would be a bad
   trade.

   ── why these, and not others

   Not because the app calls them all. Because VITE'S OWN module-preload helper
   does: `__vitePreload` uses Promise.allSettled and globalThis, and it runs on
   every dynamic import. Without them, every lazy() boundary in the app — the
   Legal Centre, the listing screens, the offer sheet, the moderation queue —
   throws on an Android 9 or 10 WebView that has never updated. The app would
   start, look right, and break the first time somebody tapped anything. That
   is worse than not starting at all.

   Each is installed only if missing, so on a current WebView this file costs a
   few hundred bytes and does nothing.

   ── keep this in step with android-compat.mjs

   `npm run android-compat` reads THIS FILE to decide which features are
   polyfilled rather than required. Adding a polyfill here lowers the floor it
   reports; removing one raises it. Until v2.10 the scanner only looked inside
   index.html, found no inline polyfill, and reported three high-severity
   runtime errors that had been fixed here all along.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  /* globalThis — Chrome 71 */
  if (typeof globalThis === "undefined") {
    if (typeof window !== "undefined") window.globalThis = window;
    else if (typeof self !== "undefined") self.globalThis = self;
  }

  /* Object.entries — Chrome 54 */
  if (!Object.entries) {
    Object.entries = function (o) {
      return Object.keys(Object(o)).map(function (k) { return [k, o[k]]; });
    };
  }

  /* Object.values — Chrome 54, same vintage and used by the same code */
  if (!Object.values) {
    Object.values = function (o) {
      return Object.keys(Object(o)).map(function (k) { return o[k]; });
    };
  }

  /* Promise.allSettled — Chrome 76
     The contract that matters: it never rejects, and results come back in
     INPUT order regardless of which settled first. An implementation that
     pushes as things resolve gets the order wrong, and a caller matching
     results back to photographs by index then blames one upload's failure on
     a different picture. */
  if (typeof Promise !== "undefined" && !Promise.allSettled) {
    Promise.allSettled = function (ps) {
      return Promise.all(Array.prototype.map.call(ps, function (p) {
        return Promise.resolve(p).then(
          function (value) { return { status: "fulfilled", value: value }; },
          function (reason) { return { status: "rejected", reason: reason }; }
        );
      }));
    };
  }

  /* Array.prototype.flat — Chrome 69. Depth 1 is all anything here uses. */
  if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, "flat", {
      configurable: true, writable: true,
      value: function (depth) {
        var d = depth === undefined ? 1 : Number(depth) || 0;
        var out = [];
        for (var i = 0; i < this.length; i++) {
          var v = this[i];
          if (Array.isArray(v) && d > 0) out.push.apply(out, v.flat(d - 1));
          else out.push(v);
        }
        return out;
      },
    });
  }

  /* String.prototype.matchAll — Chrome 73.
     The search and analytics code walks matches this way. The real method
     requires the /g flag and throws without it; this does the same, because a
     polyfill that is quietly more permissive than the thing it replaces hides
     a bug on new phones that only appears on old ones. */
  if (!String.prototype.matchAll) {
    Object.defineProperty(String.prototype, "matchAll", {
      configurable: true, writable: true,
      value: function (re) {
        if (!(re instanceof RegExp) || re.flags.indexOf("g") < 0)
          throw new TypeError("matchAll must be called with a global RegExp");
        var s = String(this);
        var copy = new RegExp(re.source, re.flags);
        var out = [], m;
        while ((m = copy.exec(s)) !== null) {
          out.push(m);
          if (m[0] === "") copy.lastIndex++;      // never loop on an empty match
        }
        return out[Symbol.iterator] ? out[Symbol.iterator]() : out;
      },
    });
  }
})();
