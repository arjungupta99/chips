/**
 * `pnpm phone doctor`'s tailnet check, without Tailscale (`tools/phone/tailnet.mjs`): the machine's
 * name as the tailnet gives it, and Serve answering at a name the machine no longer has — the
 * rename that left every paired phone reaching nothing on 14 September 2026.
 */

import { describe, expect, it } from "vitest";
import { machineDnsName, staleServeName } from "../phone/tailnet.mjs";

describe("the Mac's name on the tailnet", () => {
  it("is Self.DNSName, without its trailing dot", () => {
    const status = JSON.stringify({
      Self: { HostName: "AG Mac mini", DNSName: "ada-mac-mini.tail2f9c1e.ts.net." },
    });
    expect(machineDnsName(status)).toBe("ada-mac-mini.tail2f9c1e.ts.net");
  });

  it("is unknown when Tailscale says nothing, or nothing it can read", () => {
    expect(machineDnsName("")).toBeUndefined();
    expect(machineDnsName("{}")).toBeUndefined();
    expect(machineDnsName(JSON.stringify({ Self: { DNSName: "" } }))).toBeUndefined();
  });
});

describe("Serve at a name the machine no longer has", () => {
  it("is found when the machine was renamed, with the old name to take back", () => {
    expect(
      staleServeName("https://adas-mac-mini.tail2f9c1e.ts.net", "ada-mac-mini.tail2f9c1e.ts.net"),
    ).toEqual({
      served: "adas-mac-mini.tail2f9c1e.ts.net",
      current: "ada-mac-mini.tail2f9c1e.ts.net",
      oldHost: "adas-mac-mini",
    });
  });

  it("is nothing when the names agree, or when there is no Serve or no Tailscale to ask", () => {
    expect(
      staleServeName("https://ada-mac-mini.tail2f9c1e.ts.net", "ada-mac-mini.tail2f9c1e.ts.net"),
    ).toBeUndefined();
    expect(staleServeName(undefined, "ada-mac-mini.tail2f9c1e.ts.net")).toBeUndefined();
    expect(staleServeName("https://ada-mac-mini.tail2f9c1e.ts.net", undefined)).toBeUndefined();
  });
});
