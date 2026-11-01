import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui",
    include: ["src/**/*.test.{ts,tsx}"],
    // Components are tested in a DOM: a composer that sends on Enter, a dial that changes on
    // arrow keys. jsdom is enough for that; what a browser actually paints is the Playwright
    // suite's job (`apps/web/visual`).
    environment: "jsdom",
    setupFiles: ["./src/testing/setup.ts"],
  },
});
