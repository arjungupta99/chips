/**
 * `pnpm phone`'s word on whether the iPhone can be reached, without one (`tools/phone/devices.mjs`):
 * CoreDevice's own list, as it said it on 16 October 2026 with the phone away on 5G, and at home.
 */

import { describe, expect, it } from "vitest";
import { coreDeviceRowOf, deviceMeant, shipRoute } from "../phone/devices.mjs";

const list = (
  state: string,
) => `Name                  Hostname                             Identifier                             State                Model
-------------------   ----------------------------------   ------------------------------------   ------------------   -------------------------------
My iPhone 17          My-iPhone-17.coredevice.local        11111111-2222-3333-4444-555555555555   ${state}   iPhone 17 (iPhone18,3)
Ada?s Apple Watch     Adas-AppleWatch.coredevice.local     66666666-7777-8888-9999-AAAAAAAAAAAA   ${state}   Apple Watch Series 9 (Watch7,2)
`;

/** A row of Xcode 27's list, each cell padded to its column. */
const row = (cells: string[]) =>
  cells.map((cell, index) => cell.padEnd([22, 11, 45, 21, 27, 9][index] ?? 0)).join("");
const HEAD = [
  row(["Name", "Hostname", "Identifier", "State", "Model", "Reality"]),
  row([
    "-".repeat(19),
    "-".repeat(8),
    "-".repeat(42),
    "-".repeat(18),
    "-".repeat(24),
    "-".repeat(9),
  ]),
];

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

  it("reads Xcode 27's list, where a phone has no hostname and its id says (UDID)", () => {
    // As `devicectl list devices` printed it on 2 November 2026, with Xcode 27.2: the empty
    // hostname left the identifier where the hostname was, and the state was taken for the id.
    const xcode27 = [
      ...HEAD,
      row([
        "My iPhone 17",
        "",
        "11111111-2222333344445555 (UDID)",
        "connected",
        "iPhone 17 (iPhone18,3)",
        "physical",
      ]),
      row([
        "Ada?s Apple Watch",
        "",
        "66666666-7777888899990000 (UDID)",
        "available (paired)",
        "Watch7,2",
        "",
      ]),
    ].join("\n");
    expect(coreDeviceRowOf(xcode27, "My iPhone 17")).toEqual({
      identifier: "11111111-2222333344445555",
      state: "connected",
      reachable: true,
    });
    expect(coreDeviceRowOf(xcode27.replace("connected", "unavailable"), "My iPhone 17")).toEqual({
      identifier: "11111111-2222333344445555",
      state: "unavailable",
      reachable: false,
    });
  });

  it("is not refused when CoreDevice does not list it, and has no identifier then", () => {
    expect(coreDeviceRowOf("", "My iPhone 17")).toEqual({
      identifier: undefined,
      state: "",
      reachable: true,
    });
  });
});

describe("the device a command means", () => {
  // As Xcode listed them on 3 November 2026, once Arjun's iPad was paired: the iPad first.
  const iPad = { name: "AG iPad Pro 2", os: "26.6", udid: "00008132-000805E93C29001C" };
  const iPhone = { name: "AG iPhone 17", os: "27.0.1", udid: "00008150-000168E13410C01C" };
  const both = [
    ...HEAD,
    row([
      "AG iPad Pro 2",
      "",
      `${iPad.udid} (UDID)`,
      "available (paired)",
      "iPad Pro 13-inch (M4) (iPad16,5)",
      "physical",
    ]),
    row([
      "AG iPhone 17",
      "",
      `${iPhone.udid} (UDID)`,
      "available (paired)",
      "iPhone 17 (iPhone18,3)",
      "physical",
    ]),
  ].join("\n");

  it("is the iPhone when none is named, though Xcode lists the iPad first", () => {
    expect(deviceMeant([iPad, iPhone], undefined, both)).toBe(iPhone);
  });

  it("is the one named, by its name or its id", () => {
    expect(deviceMeant([iPad, iPhone], "AG iPad Pro 2", both)).toBe(iPad);
    expect(deviceMeant([iPad, iPhone], iPad.udid, both)).toBe(iPad);
    expect(deviceMeant([iPad, iPhone], "Someone else's iPhone", both)).toBeUndefined();
  });

  it("is the first listed when no iPhone is, or CoreDevice says nothing", () => {
    expect(deviceMeant([iPad], undefined, both)).toBe(iPad);
    expect(deviceMeant([iPad, iPhone], undefined, "")).toBe(iPad);
    expect(deviceMeant([], undefined, both)).toBeUndefined();
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
