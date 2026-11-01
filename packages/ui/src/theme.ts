/**
 * Light, dark, or whatever the system says. The stylesheet does the work: `tokens.css` follows
 * `prefers-color-scheme` unless `data-theme` on the root says otherwise. This is the one place
 * that attribute is written.
 */

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** The attribute `tokens.css` reads. Exported so a test, or the kitchen sink, can say its name. */
export const THEME_ATTRIBUTE = "data-theme";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/**
 * Apply a theme to an element — the document root for the page, or any element for a subtree.
 * `system` removes the attribute rather than writing it, so the media query decides.
 */
export function applyTheme(theme: Theme, element: Element = document.documentElement): void {
  if (theme === "system") element.removeAttribute(THEME_ATTRIBUTE);
  else element.setAttribute(THEME_ATTRIBUTE, theme);
}

/** What is applied to an element right now; `system` when nothing is. */
export function currentTheme(element: Element = document.documentElement): Theme {
  const applied = element.getAttribute(THEME_ATTRIBUTE);
  return isTheme(applied) && applied !== "system" ? applied : "system";
}

/**
 * Which colours the faces wear (ADR 0176): Soothing, the deep grounds, or Bright, their lighter
 * sisters with dark letters. `tokens.css` reads `data-faces`; Soothing is also what no attribute
 * means, so a page that never chose shows the faces as they always were.
 */
export const FACE_THEMES = ["soothing", "bright"] as const;
export type FaceTheme = (typeof FACE_THEMES)[number];

/** The attribute `tokens.css` reads for the faces' colours. */
export const FACES_ATTRIBUTE = "data-faces";

export function isFaceTheme(value: unknown): value is FaceTheme {
  return typeof value === "string" && (FACE_THEMES as readonly string[]).includes(value);
}

/**
 * Apply a face theme to an element: the root for the page, or an element to hold what is inside
 * it in a theme whatever the page's is (You's previews). On the root, Soothing removes the
 * attribute rather than writing it.
 */
export function applyFaces(theme: FaceTheme, element: Element = document.documentElement): void {
  if (theme === "soothing" && element === document.documentElement)
    element.removeAttribute(FACES_ATTRIBUTE);
  else element.setAttribute(FACES_ATTRIBUTE, theme);
}
