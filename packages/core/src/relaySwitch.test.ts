/**
 * The owner's relay switch on the client (ADR 0211, Phase 4): the wire read, the page's lists,
 * who would be cut off, and the words for each.
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import {
  askedWords,
  deviceLabel,
  directSince,
  inviteOpensAnywhere,
  inviteRelayOffWords,
  lastWay,
  relayFactsOf,
  relayFoot,
  relayFootWords,
  relayLists,
  relayNotConnectedWords,
  relayOffWords,
  turnedBy,
  turnOffLead,
  turnOffNote,
  wouldLose,
} from "./relaySwitch.js";

const TAILNET = "https://adas-mac-mini.tail2f9c1e.ts.net";
const NOW = Date.parse("2026-10-21T10:00:00.000Z");
const device = (
  id: string,
  now: string | null,
  lastVia: string | null,
  directAt: string | null,
) => ({
  device_id: `dev_${id}`,
  participant_id: `usr_${id}`,
  name: `${id}'s iPhone`,
  now,
  last_via: lastVia,
  last_via_at: "2026-10-21T08:00:00.000Z",
  direct_at: directAt,
});

const facts = relayFactsOf({
  configured: true,
  on: true,
  set_by: null,
  set_at: null,
  devices: [
    device("natalie", "relay", "relay", null),
    device("arjun", "lan", "lan", "2026-10-21T09:59:00.000Z"),
    device("mac", null, "relay", "2026-10-14T10:00:00.000Z"),
    device("old", null, null, null),
  ] as never,
  kept_link: null,
});

describe("the relay switch on the client", () => {
  it("knows which relay from the server, and nothing from an older one (ADR 0245)", () => {
    const view = { configured: true, on: false, set_by: null, set_at: null, devices: [] };
    const chips = relayFactsOf({ ...view, url: "wss://relay.chipschat.ai", kept_link: null });
    expect(chips.url).toBe("wss://relay.chipschat.ai");
    expect(relayFactsOf({ ...view, kept_link: null }).url).toBeUndefined();
  });

  it("says why it isn't connected while it is on, as the server kept it", () => {
    const view = { configured: true, set_by: null, set_at: null, devices: [], kept_link: null };
    const busy = relayFactsOf({ ...view, on: true, status: "connecting", why: "busy" });
    expect(busy).toMatchObject({ status: "connecting", why: "busy" });
    expect(relayNotConnectedWords(busy)).toBe(
      "On, but not connected: the relay already lists as many servers from your internet address as it takes.",
    );
    expect(
      relayNotConnectedWords(
        relayFactsOf({ ...view, on: true, status: "connecting", why: "unreachable" }),
      ),
    ).toBe("On, but not connected: the server can't reach the relay.");
    expect(
      relayNotConnectedWords(
        relayFactsOf({ ...view, on: true, status: "connecting", why: "not_allowed" }),
      ),
    ).toBe("On, but not connected: the relay serves a list of servers, and this one isn't on it.");
    // Nothing while it is connected, off, still making its first try, or from an older server.
    const connected = relayFactsOf({ ...view, on: true, status: "connected", why: null });
    expect(connected.why).toBeUndefined();
    expect(relayNotConnectedWords(connected)).toBeUndefined();
    expect(relayNotConnectedWords({ on: false, status: "off", why: "busy" })).toBeUndefined();
    expect(relayNotConnectedWords({ on: true, status: "connecting" })).toBeUndefined();
    expect(relayNotConnectedWords(relayFactsOf({ ...view, on: true }))).toBeUndefined();
  });

  it("lists no terminal, which never keeps a connection to list (the onboarding audit, item 34)", () => {
    const cli = {
      deviceId: "dev_cli",
      participantId: "usr_arjun",
      name: "chips CLI",
      now: undefined,
      lastVia: undefined,
      lastViaAt: undefined,
      directAt: undefined,
    };
    const lists = relayLists([...facts.devices, cli]);
    expect(lists.away.map((each) => each.deviceId)).toEqual(["dev_mac", "dev_old"]);
  });

  it("lists devices by the way they go now, and who would be cut off", () => {
    const lists = relayLists(facts.devices);
    expect(lists.relayed.map((each) => each.deviceId)).toEqual(["dev_natalie"]);
    expect(lists.direct.map((each) => each.deviceId)).toEqual(["dev_arjun"]);
    expect(lists.away.map((each) => each.deviceId)).toEqual(["dev_mac", "dev_old"]);
    expect(wouldLose(facts.devices).map((each) => each.deviceId)).toEqual([
      "dev_natalie",
      "dev_mac",
    ]);
  });

  it("says when each was last direct, and the way an away one came last", () => {
    const [natalie, , mac, old] = facts.devices;
    expect(directSince(natalie as never, NOW)).toBe("never direct");
    expect(directSince(mac as never, NOW)).toBe("direct 7 d ago");
    expect(lastWay(mac as never, NOW)).toBe("relay, 2 h ago");
    expect(lastWay(old as never, NOW)).toBe("not seen yet");
    const directory = { usr_natalie: { displayName: "Natalie" } } as unknown as Directory;
    expect(deviceLabel(natalie as never, directory, "usr_arjun")).toBe(
      "natalie's iPhone · Natalie",
    );
    expect(deviceLabel(natalie as never, directory, "usr_natalie")).toBe("natalie's iPhone");
    // The device reading the list is itself.
    const here = { deviceId: (natalie as { deviceId: string }).deviceId, word: "This phone" };
    expect(deviceLabel(natalie as never, directory, "usr_natalie", here)).toBe("This phone");
    expect(deviceLabel(mac as never, directory, "usr_arjun", here)).not.toBe("This phone");
  });

  it("says who turned it as the reader would: You, a name, or An owner while unnamed", () => {
    const directory = {
      usr_natalie: { displayName: "Natalie" },
      usr_new: { displayName: "You" },
    } as unknown as Directory;
    expect(turnedBy("usr_arjun", directory, "usr_arjun")).toBe("You");
    expect(turnedBy("usr_natalie", directory, "usr_arjun")).toBe("Natalie");
    expect(turnedBy("usr_new", directory, "usr_arjun")).toBe("An owner");
  });

  it("words the switch, the sheet before it goes, and a device left off it", () => {
    expect(relayFoot("relay.chipschat.ai", "Arjun's Mac mini", TAILNET)).toBe(
      "relay.chipschat.ai carries sealed traffic for devices that can't reach Arjun's Mac mini directly. With it off, Chips is reachable only over Tailscale.",
    );
    // Chips's own relay says it counts each day (ADR 0208); a relay someone else runs says nothing of it.
    expect(relayFootWords("relay.chipschat.ai", "Arjun's Mac mini", TAILNET)).toEqual({
      before:
        "relay.chipschat.ai carries sealed traffic for devices that can't reach Arjun's Mac mini directly. With it off, Chips is reachable only over Tailscale. Each day the relay writes down how many servers and connections it carried. ",
      link: "What Chips counts ›",
    });
    expect(relayFootWords("relay.example.com", "Arjun's Mac mini", TAILNET)).toEqual({
      before: relayFoot("relay.example.com", "Arjun's Mac mini", TAILNET),
    });
    expect(turnOffLead(1)).toMatch(/^One device last reached Chips through the relay\./);
    expect(turnOffLead(2)).toMatch(/^2 devices/);
    expect(turnOffLead(0)).toMatch(/None would lose it/);
    expect(turnOffNote(TAILNET)).toMatch(
      /^New invite and pairing links will open only on your tailnet\./,
    );
    expect(turnOffNote("http://192.168.1.20:4431")).toMatch(/only on the server's own network/);
    expect(askedWords(1)).toBe("Asked 1 person to go direct");
    expect(
      relayOffWords("Arjun", "2026-10-21T10:05:00.000Z", "Arjun's Mac mini", TAILNET, NOW),
    ).toMatch(
      /^Arjun turned the relay off at .+, so Chips reaches Arjun's Mac mini only over Tailscale now\./,
    );
    expect(inviteRelayOffWords(TAILNET)).toBe(
      "The relay is off, so this link opens only on your tailnet.",
    );
    expect(inviteRelayOffWords("http://127.0.0.1:4431/#invite=chips_inv_1")).toBe(
      "The relay is off, so this link opens only on the computer Chips runs on.",
    );
    // The link says whether it opens anywhere: the relay's page carries the relay (ADR 0207).
    expect(inviteOpensAnywhere("http://192.168.1.20:4431/#invite=chips_inv_1&key=k")).toBe(false);
    expect(
      inviteOpensAnywhere(
        "https://relay.chipschat.ai/join#invite=chips_inv_1&lan=http%3A%2F%2F192.168.1.20%3A4431&relay=wss%3A%2F%2Frelay.chipschat.ai&key=k",
      ),
    ).toBe(true);
  });
});
