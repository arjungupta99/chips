import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  askingName,
  askingTitle,
  capabilityWords,
  codeWords,
  decidedWords,
  JOIN_STEPS,
  type JoinRequest,
  joinCardState,
  joinShareText,
  LINK_DEFAULTS,
  linkAskWords,
  linkStarts,
  linkWaitingWords,
  nextJoinAsk,
  OFFERED,
  SILENT_AFTER_MS,
  saidHello,
  stallWords,
  switchesFor,
  unreachableFrom,
} from "./join.js";

const NOW = Date.parse("2026-10-05T21:05:00.000Z");

const request = (over: Partial<JoinRequest> = {}): JoinRequest => ({
  requestId: "jrq_1",
  kind: "harness",
  state: "allowed",
  startedBy: "person",
  wants: [],
  capabilities: ["autonomy"],
  url: "http://100.64.0.7:4431",
  createdAt: "2026-10-05T21:00:00.000Z",
  expiresAt: "2026-10-05T21:15:00.000Z",
  ...over,
});

const redeemed = request({
  state: "redeemed",
  name: "Kit",
  fromAddr: "100.88.4.12",
  harnessId: "hrn_1",
  spaceId: "spc_1",
});

describe("the card that follows a link", () => {
  it("waits for the harness, then shows it asked and allowed together, then connected, then hello", () => {
    const at = (over: Partial<Parameters<typeof joinCardState>[0]>) =>
      joinCardState({ request: request(), hello: false, nowMs: NOW, ...over });
    expect(at({})).toEqual({ done: 0 });
    expect(at({ request: redeemed })).toEqual({ done: 3 });
    expect(
      at({ request: redeemed, state: { connected: true, since: "2026-10-05T21:04:30.000Z" } }),
    ).toEqual({ done: 4 });
    expect(at({ request: redeemed, hello: true })).toEqual({ done: 5 });
  });

  it("is not connected by the server's first seconds, when it takes every harness as connected", () => {
    // Since the server started, which was before the link was made: not this harness's socket.
    const grace = { connected: true, since: "2026-10-05T20:59:00.000Z" };
    expect(joinCardState({ request: redeemed, state: grace, hello: false, nowMs: NOW })).toEqual({
      done: 3,
    });
  });

  it("says why it stopped: expired, refused, unreachable, removed, silent", () => {
    const base = { hello: false, nowMs: NOW };
    expect(
      joinCardState({ ...base, request: request({ expiresAt: "2026-10-05T21:04:59.000Z" }) }).stall,
    ).toEqual({ kind: "expired" });
    expect(joinCardState({ ...base, request: request({ state: "denied" }) }).stall?.kind).toBe(
      "denied",
    );
    const local = { ...redeemed, url: "http://127.0.0.1:4431" };
    expect(joinCardState({ ...base, request: local }).stall).toEqual({
      kind: "unreachable",
      from: "100.88.4.12",
      url: "http://127.0.0.1:4431",
    });
    expect(joinCardState({ ...base, request: redeemed, removed: true }).stall).toEqual({
      kind: "revoked",
    });
    const quiet = { connected: true, since: new Date(NOW - SILENT_AFTER_MS).toISOString() };
    expect(joinCardState({ ...base, request: redeemed, state: quiet })).toEqual({
      done: 4,
      stall: { kind: "silent" },
    });
    expect(stallWords({ kind: "silent" }, "Kit").says).toContain("Kit");
    // Nothing to open from there (the onboarding audit, item 32): what to check, said plainly.
    expect(stallWords({ kind: "silent" }, "Kit").doing).not.toContain("checklist");
    // A running server is asked nothing by `chips up`: `--reach` is what lets the network in.
    expect(
      stallWords({ kind: "unreachable", from: "100.88.4.12", url: "http://127.0.0.1:4431" }).doing,
    ).toContain("chips up --reach lan");
  });

  it("says when it took its key and nothing of it has connected since (the onboarding audit, Part 2, item 9)", () => {
    const base = { request: redeemed, hello: false, nowMs: NOW };
    const gone = { connected: false, since: new Date(NOW - SILENT_AFTER_MS).toISOString() };
    expect(joinCardState({ ...base, state: gone })).toEqual({
      done: 3,
      stall: { kind: "unstarted" },
    });
    const justNow = { connected: false, since: new Date(NOW - 5000).toISOString() };
    expect(joinCardState({ ...base, state: justNow })).toEqual({ done: 3 });
    expect(stallWords({ kind: "unstarted" }, "Kit").says).toBe(
      "Kit took its key but isn't connected.",
    );
  });

  it("is a request a harness started: asked as it arrives, allowed when a person allows it", () => {
    const asked = request({ state: "waiting", startedBy: "requester", code: "KQ7-M4P" });
    expect(joinCardState({ request: asked, hello: false, nowMs: NOW })).toEqual({ done: 2 });
    expect(
      joinCardState({ request: { ...asked, state: "allowed" }, hello: false, nowMs: NOW }),
    ).toEqual({ done: 3 });
  });

  it("never counts beyond five, and never moves on once a stall is said", () => {
    const states = fc.constantFrom(
      "waiting",
      "allowed",
      "denied",
      "expired",
      "redeemed",
    ) as fc.Arbitrary<JoinRequest["state"]>;
    fc.assert(
      fc.property(
        states,
        fc.constantFrom("requester", "person") as fc.Arbitrary<JoinRequest["startedBy"]>,
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: -3_600_000, max: 3_600_000 }),
        (state, startedBy, hello, connected, offset) => {
          const card = joinCardState({
            request: { ...redeemed, state, startedBy, url: "http://100.64.0.7:4431" },
            state: { connected, since: new Date(NOW - 1000).toISOString() },
            hello,
            nowMs: NOW + offset,
          });
          expect(card.done).toBeGreaterThanOrEqual(0);
          expect(card.done).toBeLessThanOrEqual(JOIN_STEPS.length);
          if (card.stall !== undefined) expect(card.done).toBeLessThan(JOIN_STEPS.length);
          if (card.done === JOIN_STEPS.length) expect(state).toBe("redeemed");
        },
      ),
    );
  });
});

describe("whether it can be reached from where it asked", () => {
  it.each([
    ["127.0.0.1", "http://127.0.0.1:4431", false],
    ["100.88.4.12", "http://127.0.0.1:4431", true],
    ["192.168.1.41", "http://192.168.1.20:4431", false],
    ["100.88.4.12", "http://192.168.1.20:4431", true],
    ["100.88.4.12", "http://100.64.0.7:4431", false],
    ["8.8.8.8", "https://chips.example.org", false],
  ])("from %s to %s: %s", (from, url, expected) => {
    expect(unreachableFrom(from, url)).toBe(expected);
  });
});

describe("a harness's hello", () => {
  it("is a message by it or one of its agents in its direct room", () => {
    const line = (authorId: string, kind = "text") => ({ id: authorId, seq: 1, kind, authorId });
    const model = (lines: unknown[]) =>
      ({ spaces: [{ id: "spc_1", lines }] }) as unknown as Parameters<typeof saidHello>[0];
    const directory = { agt_1: { id: "agt_1", kind: "agent", harnessId: "hrn_1" } } as never;
    expect(saidHello(model([line("usr_1")]), directory, redeemed)).toBe(false);
    expect(saidHello(model([line("hrn_1", "system")]), directory, redeemed)).toBe(false);
    expect(saidHello(model([line("agt_1")]), directory, redeemed)).toBe(true);
    expect(saidHello(model([line("hrn_1")]), directory, { harnessId: "hrn_1" })).toBe(false);
  });
});

describe("the switches a person sees", () => {
  it("are what it asked for, in a person's order, and none for a device", () => {
    const asked = switchesFor({
      kind: "harness",
      wants: [HARNESS_CAPABILITIES.restarts, HARNESS_CAPABILITIES.newSpaces],
    });
    expect(asked.map((each) => each.label)).toEqual([
      "Start new spaces",
      "Be restarted from Chips",
    ]);
    expect(switchesFor({ kind: "device", wants: ["autonomy"] })).toEqual([]);
  });

  it("offer every capability Chips draws something for, each with words of its own", () => {
    expect([...OFFERED].sort()).toEqual(Object.values(HARNESS_CAPABILITIES).sort());
    for (const name of OFFERED) expect(capabilityWords(name).label).not.toBe(name);
  });

  it("give every switch a short sentence for its hover, and an unknown one none (ADR 0257)", () => {
    for (const name of OFFERED) {
      const hint = capabilityWords(name).hint ?? "";
      // A whole sentence, short enough for one or two lines of a small bubble.
      expect(hint).toMatch(/^[A-Z].*\.$/);
      expect(hint.length).toBeLessThanOrEqual(70);
    }
    expect(capabilityWords(HARNESS_CAPABILITIES.followsRooms).hint).toBe(
      "When you archive or delete a space, it does too.",
    );
    expect(capabilityWords("email.send")).toEqual({ name: "email.send", label: "email.send" });
  });
});

describe("the next request a person is asked about", () => {
  it("is the oldest a requester started that waits and was not shown, and none to one who may not decide", () => {
    const ask = (id: string, createdAt: string, over: Partial<JoinRequest> = {}) =>
      request({ requestId: id, state: "waiting", startedBy: "requester", createdAt, ...over });
    const joins = new Map(
      [
        ask("jrq_2", "2026-10-05T21:02:00.000Z"),
        ask("jrq_1", "2026-10-05T21:01:00.000Z"),
        ask("jrq_0", "2026-10-05T21:00:00.000Z", { state: "denied" }),
        request({ requestId: "jrq_l", state: "allowed" }),
      ].map((each) => [each.requestId, each]),
    );
    expect(nextJoinAsk(joins, new Set(), true)?.requestId).toBe("jrq_1");
    expect(nextJoinAsk(joins, new Set(["jrq_1"]), true)?.requestId).toBe("jrq_2");
    expect(nextJoinAsk(joins, new Set(), false)).toBeUndefined();
  });

  it("is a link's for the person who sent it, whatever their role (ADR 0232)", () => {
    const joins = new Map([
      [
        "jrq_p",
        request({
          requestId: "jrq_p",
          kind: "pairing",
          state: "waiting",
          startedBy: "requester",
          wants: [],
        }),
      ],
    ]);
    // The server tells only the person it is asked of: a member who made the code is asked.
    expect(nextJoinAsk(joins, new Set(), false)?.requestId).toBe("jrq_p");
  });
});

describe("a link's request, in words (ADR 0232)", () => {
  const spaces = [{ id: "spc_japan", title: "Japan trip" }];

  it("says who asks to join which room, as what, and the six digits to compare", () => {
    const invite = request({
      kind: "invite",
      name: "Priya",
      code: "742913",
      role: "guest",
      spaceId: "spc_japan",
    });
    expect(linkAskWords(invite, { spaces, workspaceName: "Primal" })).toEqual({
      title: "Priya is asking to join Japan trip",
      line: "As a guest · from your invite",
      shows: "Priya's screen shows",
      code: "742 913",
      check: "Ask Priya what code they see. Allow only if it's this one.",
    });
    const intoNoRoom = request({ kind: "invite", name: "Priya", code: "742913", role: "member" });
    expect(linkAskWords(intoNoRoom, { spaces, workspaceName: "Primal" }).title).toBe(
      "Priya is asking to join Primal",
    );
  });

  it("says a device asks to pair as you, or as whom the code was made for", () => {
    const pairing = request({ kind: "pairing", name: "Studio", code: "018004" });
    expect(linkAskWords(pairing, {})).toMatchObject({
      title: "Studio is asking to pair as you",
      code: "018 004",
      check: "Allow only if Studio shows this code.",
    });
    expect(linkAskWords(pairing, { pairAsName: "Natalie" }).title).toBe(
      "Studio is asking to pair as Natalie",
    );
  });

  it("says, on the joining screen, whom it waits for and how long", () => {
    expect(
      linkWaitingWords({
        kind: "invite",
        code: "742913",
        minutes: 10,
        inviter: "Arjun",
        place: "Japan trip",
      }),
    ).toEqual({
      title: "Waiting for Arjun",
      line: "Arjun lets you into Japan trip. Their screen shows this code too:",
      code: "742 913",
      foot: "It comes from the key this device just made. Japan trip opens here once Arjun allows it. Chips waits 10 minutes.",
    });
    expect(linkWaitingWords({ kind: "pairing", code: "742913", minutes: 1 })).toMatchObject({
      title: "Waiting for your other device",
      foot: "Allow it there only if the codes match. Chips waits 1 minute.",
    });
  });
});

describe("a link sent from the phone", () => {
  it("carries the link, how long it lasts, and the two ways to use it", () => {
    const text = joinShareText("http://100.64.0.7:4431/j/chips_j_abc");
    expect(text).toContain("\nhttp://100.64.0.7:4431/j/chips_j_abc\n");
    expect(text).toContain("15 minutes");
    expect(text).toContain("join({ link })");
  });
});

describe("a link made from a gallery card (ADR 0171)", () => {
  it("starts with what the card's connector needs, in the switches' order", () => {
    expect(linkStarts({ capabilities: ["agents", "restarts", "new_spaces"] })).toEqual([
      "new_spaces",
      "restarts",
      "agents",
    ]);
  });

  it("starts with the dial alone for a card that names nothing, or only what Chips doesn't offer", () => {
    expect(linkStarts()).toEqual(LINK_DEFAULTS);
    expect(linkStarts({})).toEqual(LINK_DEFAULTS);
    expect(linkStarts({ capabilities: ["teleport"] })).toEqual(LINK_DEFAULTS);
  });
});

describe("what a request says once decided, as the phone's sheet (ADR 0271)", () => {
  const asked = {
    requestId: "jrq_1",
    kind: "harness",
    state: "redeemed",
    startedBy: "requester",
    wants: [],
    capabilities: [],
    url: "http://127.0.0.1:4431",
    createdAt: "2026-11-03T16:00:00.000Z",
    expiresAt: "2026-11-03T16:15:00.000Z",
  } as const satisfies JoinRequest;

  it("says who joined, and where to find them", () => {
    expect(decidedWords(asked, "Tide")).toEqual({
      ok: true,
      title: "Tide joined",
      line: "Its space is on your Spaces.",
    });
    expect(decidedWords({ ...asked, kind: "invite" }, "Priya").line).toBe("They're in People now.");
    expect(decidedWords({ ...asked, kind: "device" }, "iPad", "Noor")).toEqual({
      ok: true,
      title: "iPad is paired",
      line: "It opens on Noor's Spaces.",
    });
  });

  it("says it is on its way once allowed, and why it stopped otherwise", () => {
    expect(decidedWords({ ...asked, state: "allowed" }, "Tide").line).toBe(
      "Tide is collecting its key.",
    );
    expect(decidedWords({ ...asked, state: "denied" }, "Tide")).toEqual({
      ok: false,
      title: "Not allowed",
      line: "Somebody said no.",
    });
    expect(decidedWords({ ...asked, state: "expired" }, "Tide").title).toBe("It expired");
  });
});

describe("what the allow sheet says around a request, on both clients (ADR 0271)", () => {
  it("names it, says what it wants, and how to check its code", () => {
    const harness = request({ name: undefined });
    expect(askingName(harness)).toBe("A harness");
    expect(askingName(request({ kind: "device", name: undefined }))).toBe("A device");
    expect(askingTitle(request({ name: "Tide" }), "Tide")).toBe("Tide wants to join");
    expect(askingTitle(request({ kind: "device" }), "iPad")).toBe("iPad wants to pair");
    expect(codeWords("iPad", true)).toBe("Type the code iPad shows.");
    expect(codeWords("Tide", false)).toBe("Check it matches the code Tide printed.");
  });
});
