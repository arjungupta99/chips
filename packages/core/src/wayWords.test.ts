import { describe, expect, it } from "vitest";
import {
  askTripWords,
  beforeWords,
  goDirectWords,
  guestGuideSteps,
  guideSteps,
  middleOf,
  onlyDirectFoot,
  onlyDirectLostWords,
  overWhat,
  sharedWords,
  shareWarning,
  sinceWords,
  tailnetOf,
  tripWords,
  wayOf,
  wayTitle,
  wayWords,
  wentDirectWords,
} from "./wayWords.js";

const TAILNET = "https://adas-mac-mini.tail2f9c1e.ts.net";
const LAN = "http://192.168.1.20:4431";

describe("which way a device reaches its server, in words (ADR 0211)", () => {
  it("names the way from the connection and the way the socket went", () => {
    expect(wayOf("open", "relay")).toBe("relay");
    expect(wayOf("open", "tunnel")).toBe("direct");
    expect(wayOf("open", "direct")).toBe("direct");
    expect(wayOf("connecting", "relay")).toBe("connecting");
    expect(wayOf("closed", "tunnel")).toBe("lost");
    expect(wayOf("asleep", undefined)).toBe("lost");
  });

  it("reads the tailnet off a server's address, and says Tailscale only for one", () => {
    expect(tailnetOf(TAILNET)).toBe("tail2f9c1e");
    expect(tailnetOf(LAN)).toBeUndefined();
    expect(tailnetOf(undefined)).toBeUndefined();
    expect(tailnetOf("not a url")).toBeUndefined();
    expect(overWhat(TAILNET)).toBe("over Tailscale");
    expect(overWhat(LAN)).toBe("on its network");
  });

  it("says what each way means, naming the machine", () => {
    expect(wayTitle("lost", "Arjun's Mac mini")).toBe("Can't reach Arjun's Mac mini");
    expect(wayWords("relay", "Arjun's Mac mini", TAILNET)).toMatch(/never what's said\.$/);
    expect(wayWords("direct", "Arjun's Mac mini", TAILNET)).toBe(
      "Straight to Arjun's Mac mini over Tailscale, encrypted end to end. Nothing else is in the path.",
    );
    expect(wayWords("direct", "Arjun's Mac mini", LAN)).toMatch(/on its own network/);
  });

  it("names no relay where there is none to go through", () => {
    expect(wayWords("lost", "x", LAN)).toMatch(/^Neither its network nor the relay answered\./);
    expect(wayWords("lost", "x", LAN, false)).toMatch(/^Its network did not answer\./);
    expect(wayWords("connecting", "x", LAN, false)).toBe("Finding x on its own network.");
  });

  it("measures by the middle of a few round trips, so one slow read does not move it", () => {
    expect(middleOf([])).toBeUndefined();
    expect(middleOf([400, 2000, 410])).toBe(410);
    expect(tripWords(undefined)).toBe("…");
    expect(tripWords(37.6)).toBe("38 ms");
  });

  it("says since when, and how long the way before lasted", () => {
    const now = Date.parse("2026-10-20T10:00:00.000Z");
    expect(sinceWords("2026-10-20T09:43:00.000Z", now)).toMatch(/^\d{1,2}:43\s(AM|PM)$/);
    expect(sinceWords("2026-10-18T09:43:00.000Z", now)).toBe("Oct 18");
    expect(
      beforeWords(
        { kind: "relay", since: "2026-10-20T07:40:00.000Z", until: "2026-10-20T09:43:00.000Z" },
        TAILNET,
      ),
    ).toBe("Relay, 2 h");
    expect(
      beforeWords(
        { kind: "tunnel", since: "2026-10-20T09:00:00.000Z", until: "2026-10-20T09:14:00.000Z" },
        TAILNET,
      ),
    ).toBe("Tailscale, 14 min");
    expect(
      beforeWords(
        { kind: "relay", since: "2026-10-20T09:43:00.000Z", until: "2026-10-20T09:43:20.000Z" },
        TAILNET,
      ),
    ).toBe("Relay, briefly");
  });

  it("says the device just went direct, with the time now and before", () => {
    expect(wentDirectWords(38, 410)).toBe("Direct now · 38 ms, was 410 ms");
    expect(wentDirectWords(38, undefined)).toBe("Direct now · 38 ms");
    expect(wentDirectWords(undefined, 410)).toBe("Direct now");
  });

  it("guides the owner off the relay in three steps, the last waiting on the server (Phase 2)", () => {
    expect(goDirectWords("phone")).toMatch(/Needs Tailscale on this phone\.$/);
    const waiting = guideSteps("Arjun's Mac mini", "tail2f9c1e", "phone", false);
    expect(waiting.map((step) => step.title)).toEqual([
      "Get Tailscale",
      "Sign in with your server's account",
      "Turn Tailscale on",
    ]);
    expect(waiting[1]?.words).toBe("Arjun's Mac mini is in tail2f9c1e. Sign in to the same one.");
    expect(waiting[2]?.words).toBe("Waiting for Arjun's Mac mini to answer directly…");
    expect(guideSteps("x", "t", "computer", true)[2]?.words).toBe(
      "x answered directly. Moving over…",
    );
    expect(guideSteps("x", "t", "computer", true)[0]?.words).toMatch(/tailscale\.com/);
  });

  it("says what Only direct does, and why it is not connected while on", () => {
    expect(onlyDirectFoot(false, "phone", TAILNET)).toBe("Connect directly once to turn this on.");
    expect(onlyDirectFoot(true, "phone", TAILNET)).toBe(
      "When it's on, this phone never uses the relay. Away from Tailscale, Chips won't connect.",
    );
    expect(onlyDirectFoot(true, "computer", LAN)).toMatch(/Away from its network,/);
    expect(onlyDirectLostWords("Arjun's Mac mini", "phone", TAILNET)).toMatch(
      /didn't answer at its own address\. Turn Tailscale on, or turn Only direct off\.$/,
    );
    expect(onlyDirectLostWords("x", "computer", LAN)).toMatch(/Join its network, or/);
  });

  it("guides a guest through the ask, the invite and Tailscale (Phase 3)", () => {
    const now = Date.parse("2026-10-20T16:20:00.000Z");
    const states = (steps: readonly { state: string }[]) => steps.map((step) => step.state);
    const before = guestGuideSteps("Arjun's Mac mini", undefined, "phone", false, now);
    expect(before[0]?.words).toBe("Chips asks the owners to share Arjun's Mac mini with you.");
    expect(states(before)).toEqual(["said", "said", "said"]);
    const asked = guestGuideSteps(
      "x",
      { state: "asked", askedAt: "2026-10-20T16:12:00.000Z" },
      "phone",
      false,
      now,
    );
    expect(asked[0]?.words).toMatch(/^Asked at .+\. You'll hear when it's shared\.$/);
    expect(states(asked)).toEqual(["waiting", "said", "said"]);
    const shared = guestGuideSteps(
      "x",
      { state: "shared", askedAt: "2026-10-20T16:12:00.000Z", sharer: "Arjun" },
      "computer",
      false,
      now,
    );
    expect(shared.map((step) => step.words)).toEqual([
      "Arjun shared it.",
      "Open the invite, then sign in to Tailscale or make an account.",
      "Waiting for x to answer directly…",
    ]);
    expect(states(shared)).toEqual(["done", "said", "waiting"]);
    const there = guestGuideSteps(
      "x",
      { state: "shared", askedAt: "2026-10-20T16:12:00.000Z" },
      "phone",
      true,
      now,
    );
    expect(states(there)).toEqual(["done", "done", "done"]);
    expect(there[0]?.words).toBe("An owner shared it.");
  });

  it("tells an owner what an ask is, what sharing gives, and how it went (Phase 3)", () => {
    expect(askTripWords(432)).toBe("They go through the relay now, 432 ms a round trip.");
    expect(askTripWords(undefined)).toBe("They go through the relay now.");
    expect(shareWarning("Arjun's Mac mini")).toMatch(/nothing else on your tailnet, but all of it/);
    expect(sharedWords("Dana", undefined, true).title).toBe("Sent to Dana");
    expect(sharedWords("Dana", "Natalie", false).line).toBe("Natalie shared it with Dana.");
  });
});
