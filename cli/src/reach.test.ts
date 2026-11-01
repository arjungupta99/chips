import { describe, expect, it } from "vitest";
import {
  chosenReach,
  hereUrl,
  isReach,
  lanAddress,
  reachChoices,
  tailnetAddress,
} from "./reach.js";

const v4 = (address: string, internal = false) => ({
  address,
  family: "IPv4" as const,
  internal,
  netmask: "255.255.255.0",
  mac: "00:00:00:00:00:00",
  cidr: `${address}/24`,
});

describe("this machine's networks", () => {
  it("finds the tailnet address in what `tailscale ip -4` printed", () => {
    expect(tailnetAddress("100.64.0.7\n")).toBe("100.64.0.7");
    expect(tailnetAddress("fd7a::1\n100.64.0.7\n")).toBe("100.64.0.7");
  });

  it("finds none in an error, an empty answer, or an address outside Tailscale's range", () => {
    expect(tailnetAddress("")).toBeUndefined();
    expect(tailnetAddress("failed to connect to local tailscaled")).toBeUndefined();
    expect(tailnetAddress("100.200.0.1")).toBeUndefined();
    expect(tailnetAddress("10.0.0.96")).toBeUndefined();
  });

  it("takes a home-network address, never loopback or the tailnet's", () => {
    expect(
      lanAddress({
        lo0: [v4("127.0.0.1", true)],
        utun4: [v4("100.64.0.7")],
        en0: [v4("10.0.0.96")],
      }),
    ).toBe("10.0.0.96");
    expect(lanAddress({ lo0: [v4("127.0.0.1", true)], utun4: [v4("100.64.0.7")] })).toBeUndefined();
  });

  it("never takes a container's or a VM's bridge for this Wi-Fi", () => {
    // A VPS: a public eth0, and Docker's, libvirt's and a compose network's bridges.
    const vps = {
      lo: [v4("127.0.0.1", true)],
      eth0: [v4("203.0.113.5")],
      docker0: [v4("172.17.0.1")],
      "br-1a2b3c4d5e6f": [v4("172.18.0.1")],
      virbr0: [v4("192.168.122.1")],
      lxdbr0: [v4("10.10.10.1")],
      veth12ab: [v4("169.254.1.1")],
      cni0: [v4("10.88.0.1")],
      "flannel.1": [v4("10.244.0.0")],
    };
    expect(lanAddress(vps)).toBeUndefined();
    // A bridge a person made for their own network, br0, holds its address and is taken.
    expect(lanAddress({ ...vps, br0: [v4("192.168.1.20")] })).toBe("192.168.1.20");
  });

  it("reaches a server here at loopback, unless it is bound to one other address", () => {
    expect(hereUrl("0.0.0.0", 4431)).toBe("http://127.0.0.1:4431");
    expect(hereUrl("127.0.0.1", 4800)).toBe("http://127.0.0.1:4800");
    expect(hereUrl("100.64.0.7", 4431)).toBe("http://100.64.0.7:4431");
  });
});

describe("who can reach Chips", () => {
  it("offers Tailscale first, then the Wi-Fi, then the Chips relay, then this machine only", () => {
    const choices = reachChoices({ tailnet: "100.64.0.7", lan: "10.0.0.96" }, 4431);
    expect(choices.map((each) => each.reach)).toEqual(["tailnet", "lan", "relay", "local"]);
    expect(choices[0]).toMatchObject({ host: "0.0.0.0", publicUrl: "http://100.64.0.7:4431" });
    // Binding every address puts it on the Wi-Fi too, and the line says so.
    expect(choices[0]?.done).toContain("and on this Wi-Fi");
    expect(choices[3]).toMatchObject({ host: "127.0.0.1", publicUrl: undefined });
    // The Wi-Fi's answer binds every address and names none, since the Wi-Fi's address changes:
    // the server says the one it has now (the new-person sweep's finding 4).
    expect(choices[1]).toMatchObject({ reach: "lan", host: "0.0.0.0", publicUrl: undefined });
    expect(choices[1]?.done).toBe("Reachable on this Wi-Fi at http://10.0.0.96:4431");
  });

  it("offers the Chips relay first with no tailnet, and on this Wi-Fi too (ADR 0245)", () => {
    const choices = reachChoices({ tailnet: undefined, lan: "10.0.0.96" }, 4431);
    expect(choices.map((each) => each.reach)).toEqual(["relay", "lan", "local"]);
    expect(choices[0]).toEqual({
      reach: "relay",
      host: "0.0.0.0",
      publicUrl: undefined,
      relay: "wss://relay.chipschat.ai",
      label: "Your devices, anywhere, through the Chips relay (encrypted end to end)",
      done: "Reachable from anywhere through relay.chipschat.ai, and on this Wi-Fi at http://10.0.0.96:4431",
    });
    // With no home network it binds this machine alone, and phones come through the relay.
    const alone = reachChoices({ tailnet: undefined, lan: undefined }, 4431);
    expect(alone[0]).toMatchObject({ reach: "relay", host: "127.0.0.1", publicUrl: undefined });
  });

  it("says only this machine reaches it directly when a phone can come through the relay", () => {
    const choices = reachChoices(
      { tailnet: undefined, lan: undefined },
      4431,
      "wss://relay.example",
    );
    expect(choices).toEqual([
      expect.objectContaining({
        reach: "local",
        label: "Only this machine, and phones through the relay",
        done: "Reachable directly from this machine only",
      }),
    ]);
  });

  it("binds the tailnet address alone with no home network, so a VPS isn't public over HTTP", () => {
    const [tailnet] = reachChoices({ tailnet: "100.64.0.7", lan: undefined }, 4431);
    expect(tailnet).toMatchObject({
      reach: "tailnet",
      host: "100.64.0.7",
      publicUrl: "http://100.64.0.7:4431",
      done: "Reachable over Tailscale at http://100.64.0.7:4431",
    });
  });

  it("offers only what this machine has", () => {
    expect(reachChoices({ tailnet: undefined, lan: undefined }, 4431).map((c) => c.reach)).toEqual([
      "relay",
      "local",
    ]);
  });

  it("is this machine only when nobody is asked and no flag says otherwise", () => {
    const choices = reachChoices({ tailnet: "100.64.0.7", lan: "10.0.0.96" }, 4431);
    expect(chosenReach(choices, undefined)).toMatchObject({ reach: "local" });
    expect(chosenReach(choices, "lan")).toMatchObject({ reach: "lan" });
  });

  it("says when a flag names an answer this machine cannot give", () => {
    const choices = reachChoices({ tailnet: undefined, lan: "10.0.0.96" }, 4431);
    expect(chosenReach(choices, "tailnet")).toEqual({ missing: "tailnet" });
  });

  it("reads the flag's four words and nothing else", () => {
    expect(["tailnet", "lan", "relay", "local"].every(isReach)).toBe(true);
    expect(isReach("wifi")).toBe(false);
    expect(isReach(undefined)).toBe(false);
  });
});
