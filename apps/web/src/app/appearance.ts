/**
 * Light, dark, or the system's, chosen in You and kept by this computer alone (ADR 0085). The
 * stylesheet already follows the system unless `data-theme` says otherwise (`applyTheme` in
 * `@chipschat/ui`); what this adds is remembering the choice, and applying it before the first
 * render, so a page chosen dark never opens light and then turns.
 *
 * It lives in `localStorage`, not on the server: an appearance is the machine's, like the
 * brightness of its screen, and the phone has one of its own. Storage can be missing or refuse
 * (a private window, a blocked site), and then the choice lasts as long as the page does.
 *
 * The colours the faces wear, Soothing or Bright (ADR 0176), are kept the same way beside it.
 */

import {
  applyFaces,
  applyTheme,
  type FaceTheme,
  isFaceTheme,
  isTheme,
  type Theme,
} from "@chipschat/ui";

/** The key the choice is kept under. */
export const THEME_KEY = "chips.theme";

/** The page's storage, or nothing where reaching it throws. */
function pageStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** The appearance chosen on this computer; the system's when none was, or it cannot be read. */
export function storedTheme(storage: Storage | undefined = pageStorage()): Theme {
  try {
    const kept = storage?.getItem(THEME_KEY);
    return isTheme(kept) ? kept : "system";
  } catch {
    return "system";
  }
}

/** Apply an appearance to the page now, and keep it for the next time it opens. */
export function chooseTheme(theme: Theme, storage: Storage | undefined = pageStorage()): void {
  applyTheme(theme);
  try {
    if (theme === "system") storage?.removeItem(THEME_KEY);
    else storage?.setItem(THEME_KEY, theme);
  } catch {
    // Kept for this page only: the choice still holds until it is closed.
  }
}

/** On arrival, before anything is drawn: the appearance this computer chose last. */
export function applyStoredTheme(storage: Storage | undefined = pageStorage()): void {
  applyTheme(storedTheme(storage));
}

/** The key the faces' colours are kept under (ADR 0176). */
export const FACES_KEY = "chips.faces";

/** The colours this computer chose for the faces; Soothing when none was, or it cannot be read. */
export function storedFaces(storage: Storage | undefined = pageStorage()): FaceTheme {
  try {
    const kept = storage?.getItem(FACES_KEY);
    return isFaceTheme(kept) ? kept : "soothing";
  } catch {
    return "soothing";
  }
}

/** Repaint every face now, and keep the choice for the next time the page opens. */
export function chooseFaces(theme: FaceTheme, storage: Storage | undefined = pageStorage()): void {
  applyFaces(theme);
  try {
    if (theme === "soothing") storage?.removeItem(FACES_KEY);
    else storage?.setItem(FACES_KEY, theme);
  } catch {
    // Kept for this page only, as the appearance is.
  }
}

/** On arrival, before anything is drawn: the faces' colours this computer chose last. */
export function applyStoredFaces(storage: Storage | undefined = pageStorage()): void {
  applyFaces(storedFaces(storage));
}
