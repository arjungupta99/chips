/**
 * `pnpm phone`'s word on whether the iPhone can be reached, without one (`tools/phone/devices.mjs`):
 * CoreDevice's own list, as it said it on 16 October 2026 with the phone away on 5G, and at home.
 */

import { describe, expect, it } from "vitest";
import { coreDeviceRowOf, shipRoute } from "../phone/devices.mjs";

const list = (
  state: string,
) => `Name                  Hostname                             Identifier                             State                Model
-------------------   ----------------------------------   ------------------------------------   ------------------   -------------------------------
My iPhone 17          My-iPhone-17.coredevice.local        11111111-2222-3333-4444-555555555555   ${state}   iPhone 17 (iPhone18,3)
Ada?s Apple Watch     Adas-AppleWatch.coredevice.local     66666666-7777-8888-9999-AAAAAAAAAAAA   ${state}   Apple Watch Series 9 (Watch7,2)
`;

describe("the iPhone as CoreDevice lists it", () => {
  it("is out of reach while it is away", () => {
    expect(coreDeviceRowOf(list("unavailable"), "My iPhone 17")).toEqual({
      identifier: "11111111-2222-3333-4444-555555555555",
      state: "unavailable",
      reachable: false,
    });
  });

  it("is in reach at home, and with Developer Mode still to turn on", () => {
    expect(coreDeviceRowOf(list("available (paired)"), "My iPhone 17").reachable).toBe(true);
    expect(coreDeviceRowOf(list("available (no DDI)"), "My iPhone 17").reachable).toBe(true);
  });

  it("is not refused when CoreDevice does not list it, and has no identifier then", () => {
    expect(coreDeviceRowOf("", "My iPhone 17")).toEqual({
      identifier: undefined,
      state: "",
      reachable: true,
    });
  });
});

/** `devicectl device info details`, the part that says how the phone is reached (18 October 2026). */
const details = (transport: string) => `? connectionProperties:
    ? authenticationType: manualPairing
    ? pairingState: paired
    ? transportType: ${transport}
    ? tunnelState: connected
`;

describe("pnpm phone ship's way onto the phone", () => {
  const home = coreDeviceRowOf(list("available (paired)"), "My iPhone 17");

  it("installs from this Mac when the phone is on the Wi-Fi or plugged in", () => {
    expect(shipRoute(home, details("localNetwork"))).toEqual({
      direct: true,
      via: "on this Mac's Wi-Fi",
    });
    expect(shipRoute(home, details("wired"))).toEqual({ direct: true, via: "plugged in" });
    expect(shipRoute(home)).toEqual({ direct: true, via: "in reach" });
  });

  it("goes through TestFlight when the phone is away, or CoreDevice does not list it", () => {
    expect(shipRoute(coreDeviceRowOf(list("unavailable"), "My iPhone 17"))).toEqual({
      direct: false,
    });
    expect(shipRoute(coreDeviceRowOf("", "My iPhone 17"))).toEqual({ direct: false });
  });
});
