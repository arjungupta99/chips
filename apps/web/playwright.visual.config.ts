import { defineConfig, devices } from "@playwright/test";

/**
 * The visual regression suite: every component on `/kitchen-sink`, in both themes, compared
 * pixel for pixel with the snapshots in `visual/__snapshots__`, plus axe over the page.
 *
 * Only the web app runs — no `chipsd`, no data directory — because the kitchen sink is the
 * design system on a page, with nothing live on it. The snapshots are rendered by one
 * Chromium on one operating system with one set of fonts: the Playwright container image CI
 * uses, which `tools/visual/run.sh` runs locally. A snapshot from a laptop's own browser
 * would differ by a few anti-aliased pixels and fail forever, so this suite is not run from
 * the host directly.
 */

const WEB_PORT = process.env["CHIPS_VISUAL_PORT"] ?? "5175";

export default defineConfig({
  testDir: "./visual",
  outputDir: "./test-results-visual",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter:
    process.env["CI"] === undefined
      ? "list"
      : [["list"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]],
  // One file per component and theme, with no platform suffix: there is only ever one platform.
  snapshotPathTemplate: "{testDir}/__snapshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      // A change to a token or a layout flips far more than a fifth of a percent of a
      // component's pixels; a different CPU's anti-aliasing flips far fewer.
      maxDiffPixelRatio: 0.002,
    },
  },
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    colorScheme: "light",
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1360, height: 900 },
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: false,
  },
});
