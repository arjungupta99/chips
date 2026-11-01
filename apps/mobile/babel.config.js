/**
 * Expo's preset and nothing else: it adds the worklets plugin itself when Reanimated is a
 * dependency, and adding it here as well is a duplicate Babel refuses.
 */
module.exports = (api) => {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
