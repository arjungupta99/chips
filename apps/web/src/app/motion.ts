/**
 * Whether what moves on screen moves at all: not with Reduce Motion, nor with no screen to ask (a
 * test's), where a change is simply drawn.
 */
export function moving(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
