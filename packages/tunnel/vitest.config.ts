import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "tunnel",
    include: ["src/**/*.test.ts"],
    // Everything here runs under Node's own WebCrypto, which is the same API a browser has; the
    // relay's real sockets are the relay package's and the server's tests to drive.
    environment: "node",
  },
});
