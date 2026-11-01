/**
 * Android's theme, in the app's own colours: its accent and its window.
 *
 * What the app draws itself takes its colours from the palette (`src/ui/tokens.ts`). What Android
 * draws for it takes them from the app's theme, which nobody had given any (the emulator, 16
 * October 2026):
 *
 * - **The accent** was AppCompat's teal: the buttons of every alert (Sign out, Delete), the time
 *   picker under Quiet hours, every switch, and the caret and handles in every field. It is the
 *   amber the tab bar already chooses with.
 * - **The window** was black. It is what shows wherever the app has drawn nothing yet: the launch
 *   picture held until the store has read what it kept, at most four seconds (`app/_layout.tsx`),
 *   and the slower the phone, the more often that limit is met. The launch went picture, black,
 *   app. It is the page's own colour now, as the launch picture's ground already is.
 *
 * `android/` is generated, so the colours are set here at each prebuild, each with its dark
 * value, as the palette has. They are the palette's `amber` and `bg`; `src/ui/androidTheme.vitest.ts`
 * holds them to it.
 */

const {
  AndroidConfig,
  withAndroidColors,
  withAndroidColorsNight,
  withAndroidStyles,
} = require("expo/config-plugins");

const COLORS = {
  colorAccent: { light: "#d76c00", dark: "#f38b00" },
  pageBackground: { light: "#fbfbf8", dark: "#0f1013" },
};

/** Each theme item and the colour it takes. */
const ITEMS = {
  colorAccent: "colorAccent",
  "android:windowBackground": "pageBackground",
};

function withColors(config, withMod, scheme) {
  return withMod(config, (mod) => {
    for (const [name, value] of Object.entries(COLORS)) {
      mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, {
        name,
        value: value[scheme],
      });
    }
    return mod;
  });
}

function withAndroidTheme(config) {
  config = withColors(config, withAndroidColors, "light");
  config = withColors(config, withAndroidColorsNight, "dark");
  return withAndroidStyles(config, (mod) => {
    for (const [name, color] of Object.entries(ITEMS)) {
      mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
        add: true,
        parent: AndroidConfig.Styles.getAppThemeGroup(),
        name,
        value: `@color/${color}`,
      });
    }
    return mod;
  });
}

module.exports = withAndroidTheme;
module.exports.COLORS = COLORS;
