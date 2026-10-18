import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";

// ─────────────────────────────────────────────────────────────────────────────
//  SKELETONS
//
//  Built from the same tokens as everything else, so they theme with the app
//  and stay warm in dark mode rather than turning into the grey bars every
//  other app uses.
//
//  The shimmer is slow (1.6s) and low-contrast on purpose. A fast, bright
//  pulse reads as "something is wrong"; a slow sweep reads as "this is
//  coming", which is what a luxury resale app should feel like while it waits.
//  It respects prefers-reduced-motion — the CSS drops the animation entirely
//  for anyone who has asked for that.
// ─────────────────────────────────────────────────────────────────────────────

/** A single shimmering block. Width/height accept any CSS value. */
export function Skeleton({ w = "100%", h = 12, r = 6, style }) {
  return (
    <div className="lili-shimmer" aria-hidden="true"
      style={{ width: w, height: h, borderRadius: r, ...style }} />
  );
}

/**
 * Placeholder for one item, laid out to the same measurements as ItemTile so
 * nothing moves when the real thing arrives: the same 0.85 media box, the same
 * two lines of text, the same price row.
 */
export function ItemSkeleton() {
  return (
    <div aria-hidden="true" style={{
      borderRadius: 14, overflow: "hidden", background: C.white,
      border: `1px solid ${C.border}`, boxShadow: "0 1px 6px #0000000a",
    }}>
      <div className="lili-ratio-tile"><Skeleton w="100%" h="100%" r={0} /></div>
      <div style={{ padding: "10px 10px 12px" }}>
        <Skeleton w="82%" h={11} />
        <div style={{ height: 6 }} />
        <Skeleton w="54%" h={8} />
        <div style={{ height: 9 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Skeleton w={64} h={12} />
          <Skeleton w={30} h={8} />
        </div>
      </div>
    </div>
  );
}

/** Media-only skeleton, for use inside a box that already reserves its space. */
export function MediaSkeleton() {
  return <div className="lili-shimmer" aria-hidden="true"
    // `inset: 0` is Chrome 87. Below that the whole declaration is dropped and
    // the shimmer collapses into the top-left corner of the tile instead of
    // covering it. The four physical properties have worked since Chrome 4 and
    // say exactly the same thing.
    style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
             width: "100%", height: "100%" }} />;
}

/**
 * What a buyer sees when one photo fails. Deliberately calm: a failed image is
 * not an error the user caused, and the piece is still worth looking at. The
 * retry affects only this item — everything else on screen keeps its state.
 */
export function ItemError({ onRetry, compact }) {
  return (
    <div className="lili-fill" style={{
      position: "absolute", top: 0, right: 0, bottom: 0, left: 0, background: C.sand,
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: compact ? 5 : 8, padding: 10, textAlign: "center",
    }}>
      <Icon name="eye" size={compact ? 18 : 22} stroke={1.4} style={{ color: C.inkLt, opacity: 0.7 }} />
      {!compact && (
        <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.4 }}>
          Photo didn't load
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRetry(); }}
        aria-label="Retry loading this photo"
        style={{
          background: C.white, border: `1px solid ${C.border}`, borderRadius: 20,
          padding: compact ? "4px 10px" : "5px 13px", cursor: "pointer",
          fontSize: compact ? 9.5 : 10.5, fontWeight: 700, color: C.terraTx,
          fontFamily: "inherit", minHeight: 0,
        }}>
        Try again
      </button>
    </div>
  );
}
