/**
 * Component tests, on `jest-expo`'s iOS preset — one platform, because a component that renders
 * on iOS and not on Android is not a thing this app has yet, and three passes is three times the
 * wall clock.
 *
 * `moduleNameMapper` undoes the NodeNext `.js` in the shared packages' relative imports, which
 * is the same thing Metro's resolver does at bundle time.
 */
const preset = require("jest-expo/ios/jest-preset");

module.exports = {
  preset: "jest-expo/ios",
  testMatch: ["**/*.test.tsx"],
  setupFiles: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  // `decode-uri-component`, under expo-router, is held at 0.5.0 by a dependency override (SEC-18),
  // and 0.5.0 is ESM only. Metro reads it as it reads everything; Jest has to be told to transform
  // it as it does Expo's own packages, or a test that imports expo-router stops at its `export`.
  transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
    pattern.replace("|standard-navigation))", "|standard-navigation|decode-uri-component))"),
  ),
  // A screen test presses a few times and waits for an upload to come back; beside a native
  // build on the same machine the first test in a file has been seen to take more than Jest's
  // five seconds, which is a slow machine and not a wrong screen. Every wait is still for a
  // state, never a sleep, so a test that has really broken fails as fast as it ever did.
  testTimeout: 20_000,
};
