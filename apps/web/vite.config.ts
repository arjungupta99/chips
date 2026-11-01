import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The web app talks to `chipsd` on 4431. Proxying `/v1` in development means the browser sees
 * one origin, which keeps the device signature — which covers the path — honest and avoids
 * needing CORS at all.
 */
/** The end-to-end test runs chipsd on another port, so the target is a variable. */
const target = process.env["CHIPS_TARGET"] ?? "http://127.0.0.1:4431";

/**
 * What the foot of You names (ADR 0085): this package's version and the commit it was built
 * from, so a person can say which build is on the desk. Read when the build or the dev server
 * starts; a checkout without git, or a tarball, says `dev`. `vitest.config.ts` takes the same.
 */
export function buildDefines(): Record<string, string> {
  const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  let commit = "dev";
  try {
    commit =
      execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        cwd: new URL(".", import.meta.url),
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || "dev";
  } catch {
    // Not a git checkout: the version alone.
  }
  return {
    __CHIPS_VERSION__: JSON.stringify(String(version)),
    __CHIPS_COMMIT__: JSON.stringify(commit),
    // Send feedback drawn before its switch is on (ADR 0237): the e2e suite's, never a release's.
    __CHIPS_FEEDBACK__: JSON.stringify(process.env["CHIPS_FEEDBACK"] === "1"),
  };
}

export default defineConfig({
  plugins: [react()],
  define: buildDefines(),
  server: {
    // Bound explicitly: Vite's default resolves to ::1 on this machine, and anything polling
    // 127.0.0.1 — a health check, Playwright — then waits forever for a server that is up.
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/v1": { target, changeOrigin: false, ws: true },
    },
  },
  build: { outDir: "dist", sourcemap: true },
});
