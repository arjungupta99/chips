import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "conformance",
    // `tests/parity/` runs each scenario against the real server and the fake (agents review,
    // finding 37). It reads the server's own test workspace, so it lives outside `src`, which is
    // what is built and shipped.
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    // A scenario is a real server on a real port with a real socket into it, played to its end.
    testTimeout: 30_000,
  },
});
