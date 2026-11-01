import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "film",
    include: ["*.test.ts"],
    environment: "node",
  },
});
