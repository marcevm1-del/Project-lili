import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  PER-ITEM LOADING
//
//  One state machine per item, held inside the item's own component. That is
//  what makes the loading independent: React already isolates state per
//  instance, so a tile that has finished stays finished — and stays clickable —
//  while its neighbours are still working. No shared "isLoading" flag, no
//  global spinner, no re-render of the whole grid when one photo arrives.
//
//  The machine is deliberately driven by a real event, not a timer. A photo
//  reports `loaded` when the browser has actually decoded it and `error` when
//  it genuinely failed. Items with no photo resolve immediately — inventing a
//  delay to show off a skeleton would be a lie told to the user.
//
//    idle → loading → loaded
//                   ↘ error → (retry) → loading …
// ─────────────────────────────────────────────────────────────────────────────

export const STATE = { LOADING: "loading", LOADED: "loaded", ERROR: "error" };

/**
 * @param {string|null} src   image source, or null when the item has no photo
 * @returns {{state, retry, attempts, srcKey, onLoad, onError}}
 */
export function useItemLoad(src) {
  // No photo means nothing to wait for — the placeholder art IS the final
  // state, so we must not show a skeleton that will never resolve.
  const [state, setState] = useState(src ? STATE.LOADING : STATE.LOADED);
  const [attempts, setAttempts] = useState(0);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    setState(src ? STATE.LOADING : STATE.LOADED);
  }, [src]);

  const onLoad = useCallback(() => {
    if (mounted.current) setState(STATE.LOADED);
  }, []);

  const onError = useCallback(() => {
    if (mounted.current) setState(STATE.ERROR);
  }, []);

  const retry = useCallback(() => {
    if (!mounted.current) return;
    setAttempts((n) => n + 1);
    setState(STATE.LOADING);
  }, []);

  // Bumping the key forces the browser to re-request rather than serve the
  // failed response from cache. Data URLs are unaffected, which is correct —
  // there is nothing to re-fetch.
  const srcKey = attempts === 0 || !src || src.startsWith("data:")
    ? src
    : `${src}${src.includes("?") ? "&" : "?"}_retry=${attempts}`;

  return { state, retry, attempts, srcKey, onLoad, onError };
}
