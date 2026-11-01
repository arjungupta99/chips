import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@chipschat/platform";
import { readConnectors } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  checkoutDefaults,
  devModeRefusal,
  logFile,
  releaseDefaults,
  thisRelease,
  versionLine,
} from "./release.js";

const REPO = fileURLToPath(new URL("../../", import.meta.url));

const mac = { platform: "darwin", home: "/Users/ada", environment: {} };
const linux = { platform: "linux", home: "/home/ada", environment: {} };
const release = { version: "0.2.0", root: "/Users/ada/.local/lib/chips/0.2.0" };

describe("a checkout", () => {
  it("is not a release: tests run the source, never the bundle", () => {
    expect(thisRelease()).toBeUndefined();
  });

  it("says so beside its version", () => {
    expect(versionLine(undefined)).toBe("chips 0.0.0 (from a checkout)");
    expect(versionLine(undefined, "0.2.0")).toBe("chips 0.2.0 (from a checkout)");
  });

  it("reads, from a checkout, the cards the docs publish unless CHIPS_CONNECTORS says otherwise", () => {
    const file = checkoutDefaults();
    expect(file.server.connectors).toBe(join(REPO, "apps", "docs", "public", "connectors.json"));
    const cards = readConnectors(JSON.parse(readFileSync(file.server.connectors, "utf8")));
    expect(cards.some((card) => card.package !== undefined)).toBe(true);
    const told = loadConfig({ file, environment: { CHIPS_CONNECTORS: "/srv/connectors.json" } });
    expect(told).toMatchObject({ value: { server: { connectors: "/srv/connectors.json" } } });
  });
});

describe("a release", () => {
  it("says only its version", () => {
    expect(versionLine(release)).toBe("chips 0.2.0");
  });

  it("keeps its workspace in the platform's place and serves the pages and cards beside it", () => {
    expect(releaseDefaults(release, mac)).toEqual({
      data: { dir: "/Users/ada/Library/Application Support/Chips" },
      server: {
        webDir: "/Users/ada/.local/lib/chips/0.2.0/web",
        connectors: "/Users/ada/.local/lib/chips/0.2.0/connectors/connectors.json",
      },
    });
    expect(releaseDefaults(release, linux).data.dir).toBe("/home/ada/.local/share/chips");
  });

  it("reads the cards it carries unless CHIPS_CONNECTORS says otherwise (HS-1)", () => {
    const file = releaseDefaults(release, mac);
    expect(loadConfig({ file, environment: {} })).toMatchObject({
      value: {
        server: { connectors: "/Users/ada/.local/lib/chips/0.2.0/connectors/connectors.json" },
      },
    });
    const told = loadConfig({ file, environment: { CHIPS_CONNECTORS: "/srv/connectors.json" } });
    expect(told).toMatchObject({ value: { server: { connectors: "/srv/connectors.json" } } });
  });

  it("logs where the platform keeps logs", () => {
    expect(logFile(mac)).toBe("/Users/ada/Library/Logs/Chips/chips.log");
    expect(logFile(linux)).toBe("/home/ada/.local/state/chips/chips.log");
  });
});

describe("dev mode (SEC-4)", () => {
  it("is a checkout's convenience: a release refuses to run in it", () => {
    expect(devModeRefusal(undefined, { devMode: true })).toBeUndefined();
    expect(devModeRefusal(release, { devMode: false })).toBeUndefined();
    expect(devModeRefusal(release, { devMode: true })).toBe(
      "chips 0.2.0 is a release, and a release does not run in dev mode. Unset CHIPS_DEV_MODE.",
    );
  });
});
