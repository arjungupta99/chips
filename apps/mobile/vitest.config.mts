import { defineConfig } from "vitest/config";

/**
 * The pure modules of the phone app, under Node.
 *
 * Component tests are Jest's — Vitest cannot host React Native, and `jest-expo` is the preset
 * that knows how — so the two suites are told apart by their names: `*.vitest.ts` here,
 * `*.test.tsx` under Jest. Nothing in this project may import an `expo-*` module.
 */
export default defineConfig({
  test: {
    name: "@chipschat/mobile",
    include: ["src/**/*.vitest.ts"],
    environment: "node",
  },
});
