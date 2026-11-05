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

import os from "node:os";
import { Bonjour, type Service } from "bonjour-service";
import { describe, expect, it, vi } from "vitest";
import { advertise, browse, hostFor, SERVICE_TYPE } from "./discovery.js";

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

  it("answers under the workspace's name, never the machine's, so the system keeps its own", async () => {
    const publish = vi.spyOn(Bonjour.prototype, "publish");
    const advertised = advertise({
      name: "Chips under test",
      port: 4488,
      workspaceId: "ws_01TEST",
      version: "1",
    });
    const service = publish.mock.results[0]?.value as Service;
    publish.mockRestore();

    const records = service.records();
    const target = records.find((record) => record.type === "SRV")?.data.target;
    expect(target).toBe("chips-ws-01test.local");
    expect(target).not.toBe(os.hostname());
    for (const record of records.filter((each) => each.type === "A" || each.type === "AAAA")) {
      expect(record.name).toBe("chips-ws-01test.local");
    }
    await advertised.stop();
  });

  it("makes a name a network can carry out of any workspace id", () => {
    expect(hostFor("ws_01M1QS7VXYY26ADKHEF7TNZ7WY")).toBe(
      "chips-ws-01m1qs7vxyy26adkhef7tnz7wy.local",
    );
    expect(hostFor("x".repeat(80))).toMatch(/^[a-z0-9-]{1,63}\.local$/);
  });

  it("is one service type, which the desktop app looks for by name", () => {
    expect(SERVICE_TYPE).toBe("chips");
  });
});
