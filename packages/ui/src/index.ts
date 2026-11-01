/**
 * `@chipschat/ui` is the design system: the blueprint's tokens, primitives and cards, in plain CSS
 * and React (ADR 0009). A page imports `@chipschat/ui/styles.css` once for the faces, the tokens
 * and the base; each component brings its own stylesheet with it.
 */

export * from "./components/index.js";
export {
  formatBytes,
  formatCost,
  formatDuration,
  formatRemaining,
  formatTokens,
  initials,
} from "./format.js";
export type { Theme } from "./theme.js";
export {
  applyFaces,
  applyTheme,
  currentTheme,
  FACE_THEMES,
  FACES_ATTRIBUTE,
  type FaceTheme,
  isFaceTheme,
  isTheme,
  THEME_ATTRIBUTE,
  THEMES,
} from "./theme.js";
export * from "./vocabulary/index.js";
