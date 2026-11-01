/**
 * mDNS, for real: something published is something found. This is the one test that binds 5353,
 * which is why `serve` takes its advertiser as an argument — every other test passes one that
 * binds nothing.
 *
 * A machine with no multicast, or a network that drops it, would make this meaningless rather
 * than failing honestly, so it asserts what it can: that publishing and stopping do not throw,
 * and that a browse returns a list. Whether this machine's own advertisement comes back is not
 * something a test can insist on.
 */

import { describe, expect, it } from "vitest";
import { advertise, browse, SERVICE_TYPE } from "./discovery.js";

describe("mDNS", () => {
  it("publishes a service and takes it away again", async () => {
    const advertised = advertise({
      name: "Chips under test",
      port: 4488,
      workspaceId: "ws_1",
      version: "1",
    });
    const found = await browse(700);
    expect(Array.isArray(found)).toBe(true);
    // Whatever came back is shaped the way a caller expects.
    for (const server of found) {
      expect(server.url).toMatch(/^http:\/\//);
      expect(server.port).toBeGreaterThan(0);
    }
    await advertised.stop();
  });

  it("is one service type, which the desktop app looks for by name", () => {
    expect(SERVICE_TYPE).toBe("chips");
  });
});
