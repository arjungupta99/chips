/**
 * The address handed to another device. These were `chips serve`'s tests when only the terminal
 * QR needed an answer; the browser's QR needs the same one, so the rule moved here.
 */

import { describe, expect, it } from "vitest";
import { networkUrl, reachableUrl } from "./reachable.js";

/** `os.networkInterfaces()` as the two cases that matter, without asking the machine. */
const loopbackOnly = { lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true } as never] };
const home = {
  lo0: [{ family: "IPv4", address: "127.0.0.1", internal: true } as never],
  en0: [{ family: "IPv4", address: "192.168.1.20", internal: false } as never],
};
const homeAndTailnet = {
  utun4: [{ family: "IPv4", address: "100.64.0.7", internal: false } as never],
  en0: [{ family: "IPv4", address: "192.168.1.20", internal: false } as never],
};
const tailnetOnly = {
  utun4: [{ family: "IPv4", address: "100.64.0.7", internal: false } as never],
};

describe("networkUrl", () => {
  it("puts an address another device could reach in the QR, not loopback", () => {
    expect(networkUrl(4431, home)).toBe("http://192.168.1.20:4431");
  });

  it("prefers the home network's address to a VPN's, whichever comes first", () => {
    expect(networkUrl(4431, homeAndTailnet)).toBe("http://192.168.1.20:4431");
  });

  it("takes the VPN's when it is the only network there is", () => {
    expect(networkUrl(4431, tailnetOnly)).toBe("http://100.64.0.7:4431");
  });

  it("says nothing about a network it cannot see", () => {
    expect(networkUrl(4431, loopbackOnly)).toBeUndefined();
  });

  it("steps over an interface the system listed with no addresses at all", () => {
    expect(networkUrl(4431, { awdl0: undefined, ...home })).toBe("http://192.168.1.20:4431");
  });

  it("steps over the bridges containers and VMs make, which no phone is on", () => {
    const vps = {
      eth0: [{ family: "IPv4", address: "203.0.113.5", internal: false } as never],
      docker0: [{ family: "IPv4", address: "172.17.0.1", internal: false } as never],
      virbr0: [{ family: "IPv4", address: "192.168.122.1", internal: false } as never],
    };
    expect(networkUrl(4431, vps)).toBe("http://203.0.113.5:4431");
    expect(networkUrl(4431, { "br-1a2b3c": vps.docker0, ...home })).toBe(
      "http://192.168.1.20:4431",
    );
  });
});

describe("reachableUrl", () => {
  it("takes what the person configured over anything it could work out", () => {
    const url = reachableUrl(
      { publicUrl: "http://100.64.0.7:4431", host: "0.0.0.0", port: 4431 },
      homeAndTailnet,
    );
    expect(url).toBe("http://100.64.0.7:4431");
  });

  it("drops a trailing slash, so the fragment is appended to an origin", () => {
    const url = reachableUrl({ publicUrl: "https://chips.example/", host: "0.0.0.0", port: 4431 });
    expect(url).toBe("https://chips.example");
  });

  it("says loopback when the server is bound to loopback, because that is the truth", () => {
    expect(reachableUrl({ host: "127.0.0.1", port: 4431 }, home)).toBe("http://127.0.0.1:4431");
    expect(reachableUrl({ host: "localhost", port: 4431 }, home)).toBe("http://127.0.0.1:4431");
  });

  it("names the one address the server bound, when it bound one", () => {
    expect(reachableUrl({ host: "10.0.0.96", port: 4431 }, home)).toBe("http://10.0.0.96:4431");
  });

  it("looks at the networks when the server bound every address", () => {
    expect(reachableUrl({ host: "0.0.0.0", port: 4431 }, home)).toBe("http://192.168.1.20:4431");
    expect(reachableUrl({ host: "::", port: 4431 }, homeAndTailnet)).toBe(
      "http://192.168.1.20:4431",
    );
  });

  it("falls back to loopback when it is bound to everything and there is no network", () => {
    expect(reachableUrl({ host: "0.0.0.0", port: 4431 }, loopbackOnly)).toBe(
      "http://127.0.0.1:4431",
    );
  });

  it("ignores an empty public URL, which is how an unset variable arrives", () => {
    expect(reachableUrl({ publicUrl: "", host: "0.0.0.0", port: 4431 }, home)).toBe(
      "http://192.168.1.20:4431",
    );
  });
});
