import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "subtle",
    include: ["src/**/*.test.ts"],
    // Node has a real WebCrypto, which is what the shim is compared against.

    environment: "node",
  },
});
