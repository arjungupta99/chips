/** A browser names itself by what it is and where (ADR 0085), so You can tell five of them apart. */

import { deviceKind } from "@chipschat/core";
import { describe, expect, it } from "vitest";
import { browserDeviceName } from "./browserName.ts";

const AGENTS = {
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0",
  safariIPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
  chromeIPhone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  operaMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/122.0.0.0",
  headlessChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36",
  chromebook:
    "Mozilla/5.0 (X11; CrOS x86_64 16181.61.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
} as const;

describe("browserDeviceName", () => {
  it.each([
    ["safariMac", "Safari on Mac"],
    ["chromeMac", "Chrome on Mac"],
    ["chromeWindows", "Chrome on Windows"],
    ["edgeWindows", "Edge on Windows"],
    ["firefoxLinux", "Firefox on Linux"],
    ["safariIPhone", "Safari on iPhone"],
    ["chromeIPhone", "Chrome on iPhone"],
    ["chromeAndroid", "Chrome on Android"],
    ["operaMac", "Opera on Mac"],
    ["chromebook", "Chrome on ChromeOS"],
    ["headlessChrome", "Chrome on Mac"],
  ] as const)("%s is %s", (agent, name) => {
    expect(browserDeviceName(AGENTS[agent])).toBe(name);
  });

  it("says what it can of a browser it does not know, and never 'This browser'", () => {
    expect(browserDeviceName("Mozilla/5.0 (Macintosh) SomethingNew/1.0")).toBe("Browser on Mac");
    expect(browserDeviceName("Firefox/143.0")).toBe("Firefox");
    expect(browserDeviceName("")).toBe("Browser");
  });

  it("is always read back as a browser, whatever it is on", () => {
    for (const agent of Object.values(AGENTS)) {
      expect(deviceKind(browserDeviceName(agent))).toBe("browser");
    }
    expect(deviceKind(browserDeviceName(""))).toBe("browser");
  });
});
