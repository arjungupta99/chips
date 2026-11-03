import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Directory, Participant } from "./events.js";
import type { Line, Space } from "./model/types.js";
import {
  awayHow,
  firstHello,
  RELAY_SETTLE_MS,
  relaySettleLeft,
  type SetupFacts,
  setupDoneCount,
  setupSteps,
  showsSetupCard,
  showsWelcome,
} from "./setup.js";
import type { PairedDeviceRecord, ServerFacts } from "./store.js";

const OWNER: Participant = { id: "per_a", kind: "person", displayName: "Arjun", role: "owner" };
const MEMBER: Participant = { id: "per_d", kind: "person", displayName: "Dana", role: "member" };
const CLAW: Participant = {
  id: "agt_c",
  kind: "agent",
  displayName: "OpenClaw",
  harnessId: "hrn_c",
};
const directory: Directory = { per_a: OWNER, per_d: MEMBER, agt_c: CLAW };

const server: ServerFacts = {
  machine: "Arjun's Mac mini",
  version: "0.2.0",
  publicUrl: "http://192.168.1.20:4431",
  relay: { url: "wss://relay.chipschat.ai", status: "connected" },
};

const device = (name: string, more: Partial<PairedDeviceRecord> = {}): PairedDeviceRecord => ({
  deviceId: `dev_${name}`,
  name,
  pairedAt: "2026-10-15T09:00:00Z",
  lastSeenAt: undefined,
  revokedAt: undefined,
  current: false,
  ...more,
});

const line = (authorId: string, ts: string, more: Partial<Line> = {}): Line =>
  ({
    id: `l_${authorId}_${ts}`,
    seq: 1,
    kind: "text",
    authorId,
    authorKind: authorId.startsWith("per_") ? "person" : "harness",
    text: "Hi",
    ts,
    ...more,
  }) as Line;

const room = (lines: Line[]): Space => ({ id: `spc_${lines.length}`, lines }) as unknown as Space;

function facts(more: Partial<SetupFacts> = {}): SetupFacts {
  return {
    server,
    here: "mac",
    devices: [device("Chips for Mac", { current: true }), device("chips CLI on mini")],
    model: { spaces: [] },
    directory,
    notifications: false,
    ...more,
  };
}

describe("setupSteps", () => {
  it("is the mock's card on the Mac after the first hello: running, this Mac, the hello, away", () => {
    const steps = setupSteps(
      facts({ model: { spaces: [room([line("agt_c", "2026-10-15T09:42:00Z")])] } }),
    );
    expect(steps.map((step) => [step.id, step.title, step.detail, step.done])).toEqual([
      ["running", "Chips is running", "on Arjun's Mac mini", true],
      ["computer", "This Mac", undefined, true],
      ["hello", "An agent said hello", "OpenClaw", true],
      ["phone", "Your phone", undefined, false],
      ["notify", "Notifications", undefined, false],
      ["away", "Away from home", "through your relay", true],
    ]);
    expect(setupDoneCount(steps)).toBe(4);
  });

  it("on a phone, leaves Notifications undone when the server can't push, and says so (ADR 0244)", () => {
    const cannot = { ...server, pushes: "no_access_token" as const };
    const phone = setupSteps(facts({ here: "phone", server: cannot, notifications: true }));
    expect(phone.find((step) => step.id === "notify")).toEqual({
      id: "notify",
      title: "Notifications",
      detail: "your server can't send them yet",
      done: false,
      blocked: true,
    });
    // A computer's banners are its own, and a server that can push is as before.
    const mac = setupSteps(facts({ server: cannot, notifications: true }));
    expect(mac.find((step) => step.id === "notify")?.done).toBe(true);
    const ready = { ...server, pushes: "ready" as const };
    const fine = setupSteps(facts({ here: "phone", server: ready, notifications: true }));
    expect(fine.find((step) => step.id === "notify")).toEqual({
      id: "notify",
      title: "Notifications",
      done: true,
    });
  });

  it("on the phone, names the computer it found and itself", () => {
    const steps = setupSteps(
      facts({
        here: "phone",
        devices: [device("iPhone 17 Pro", { current: true }), device("Chips for Mac")],
        notifications: true,
      }),
    );
    expect(steps.find((step) => step.id === "computer")).toMatchObject({
      title: "A computer",
      detail: "Chips for Mac",
      done: true,
    });
    expect(steps.find((step) => step.id === "phone")).toMatchObject({
      title: "This iPhone",
      done: true,
    });
    expect(steps.find((step) => step.id === "notify")?.done).toBe(true);
  });

  it("on an iPad, names itself as one, and counts as Chips in a hand (ADR 0177)", () => {
    const steps = setupSteps(
      facts({ here: "ipad", devices: [device("Arjun's iPad", { current: true })] }),
    );
    expect(steps.find((step) => step.id === "phone")).toMatchObject({
      title: "This iPad",
      done: true,
    });
    expect(steps.find((step) => step.id === "computer")).toMatchObject({
      title: "A computer",
      done: false,
    });
  });

  it("on an Android phone, says This phone, not This iPhone", () => {
    const steps = setupSteps(
      facts({ here: "android", devices: [device("Pixel 9", { current: true })] }),
    );
    expect(steps.find((step) => step.id === "phone")).toMatchObject({
      title: "This phone",
      done: true,
    });
    expect(steps.find((step) => step.id === "computer")).toMatchObject({
      title: "A computer",
      done: false,
    });
  });

  it("on the Mac, counts an iPad paired as the phone's step", () => {
    const steps = setupSteps(
      facts({ devices: [device("Chips for Mac", { current: true }), device("Arjun's iPad")] }),
    );
    expect(steps.find((step) => step.id === "phone")).toMatchObject({
      title: "Your phone",
      detail: "Arjun's iPad",
      done: true,
    });
  });

  it("doesn't count the CLI or a withdrawn device", () => {
    const steps = setupSteps(
      facts({
        here: "phone",
        devices: [
          device("iPhone", { current: true }),
          device("chips CLI on mini"),
          device("Safari on Mac", { revokedAt: "2026-10-15T10:00:00Z" }),
        ],
      }),
    );
    expect(steps.find((step) => step.id === "computer")?.done).toBe(false);
  });

  it("waits on what it hasn't read", () => {
    const steps = setupSteps(facts({ server: undefined, devices: undefined, here: "browser" }));
    expect(steps.find((step) => step.id === "running")).toMatchObject({
      done: false,
      detail: undefined,
    });
    expect(steps.find((step) => step.id === "away")?.done).toBe(false);
    expect(steps.find((step) => step.id === "phone")?.done).toBe(false);
  });
});

describe("firstHello", () => {
  it("is the agent whose line came first, in any room, never a person's", () => {
    const later: Participant = { id: "agt_h", kind: "agent", displayName: "Hermes" };
    const spaces = [
      room([line("per_a", "2026-10-15T08:00:00Z"), line("agt_h", "2026-10-15T09:50:00Z")]),
      room([line("agt_c", "2026-10-15T09:42:00Z"), line("agt_h", "2026-10-15T09:00:00Z")]),
    ];
    expect(firstHello({ spaces }, { ...directory, agt_h: later })).toBe("OpenClaw");
    expect(
      firstHello({ spaces: [room([line("per_a", "2026-10-15T08:00:00Z")])] }, directory),
    ).toBeUndefined();
  });
});

describe("Away from home and the relay's switch (ADR 0245)", () => {
  const off = { on: false, by: "per_a", at: "2026-11-01T21:00:00.000Z" };
  const on = { ...off, on: true };

  it("doesn't count the relay once an owner has switched it off, though the last read says up", () => {
    expect(awayHow(server, off)).toBeUndefined();
    expect(awayHow(server, on)).toBe("through your relay");
    // A tailnet still reaches it with the relay off.
    expect(awayHow({ ...server, publicUrl: "http://100.64.0.7:4431" }, off)).toBe("over Tailscale");
    const away = setupSteps(facts({ model: { spaces: [], relay: off } })).find(
      (step) => step.id === "away",
    );
    expect(away).toMatchObject({ done: false });
  });

  it("waits what is left of three seconds since the switch, and no more, before reading again", () => {
    const at = Date.parse(off.at);
    expect(RELAY_SETTLE_MS).toBe(3000);
    expect(relaySettleLeft(undefined, at)).toBe(0);
    expect(relaySettleLeft(off.at, at + 1000)).toBe(2000);
    expect(relaySettleLeft(off.at, at + 5000)).toBe(0);
    // A clock behind the server's waits no longer than the three seconds.
    expect(relaySettleLeft(off.at, at - 60_000)).toBe(3000);
    expect(relaySettleLeft("not a time", at)).toBe(0);
  });
});

describe("awayHow", () => {
  const at = (publicUrl: string, relay = { url: undefined as string | undefined, status: "off" }) =>
    awayHow({ ...server, publicUrl, relay });
  it("is the relay first, then a tailnet, then a public https address", () => {
    expect(awayHow(server)).toBe("through your relay");
    expect(at("http://100.64.0.7:4431")).toBe("over Tailscale");
    expect(at("https://mini.tail1234.ts.net")).toBe("over Tailscale");
    expect(at("https://chips.example.com")).toBe("at chips.example.com");
  });
  it("is nothing on the home network, on this machine, or with the relay not up", () => {
    expect(at("http://192.168.1.20:4431")).toBeUndefined();
    expect(at("http://127.0.0.1:4431")).toBeUndefined();
    expect(at("https://192.168.1.20")).toBeUndefined();
    expect(at("http://chips.example.com")).toBeUndefined();
    expect(
      at("http://192.168.1.20:4431", { url: "wss://relay.chipschat.ai", status: "connecting" }),
    ).toBeUndefined();
  });
});

describe("who sees what", () => {
  it("welcomes the owner of a workspace no agent has joined, once per device", () => {
    const people: Directory = { per_a: OWNER, per_d: MEMBER };
    expect(showsWelcome(people, "per_a", false)).toBe(true);
    expect(showsWelcome(people, "per_a", true)).toBe(false);
    expect(showsWelcome(people, "per_d", false)).toBe(false);
    expect(showsWelcome(directory, "per_a", false)).toBe(false);
  });

  it("shows the card to the owner until it is done or hidden, and not while it is loading", () => {
    const steps = setupSteps(facts());
    expect(showsSetupCard(facts(), "per_a", steps, false)).toBe(true);
    expect(showsSetupCard(facts(), "per_a", steps, true)).toBe(false);
    expect(showsSetupCard(facts(), "per_d", steps, false)).toBe(false);
    expect(showsSetupCard(facts({ devices: undefined }), "per_a", steps, false)).toBe(false);
    const all = steps.map((step) => ({ ...step, done: true }));
    expect(showsSetupCard(facts(), "per_a", all, false)).toBe(false);
  });

  it("never counts more than six, whatever arrives", () => {
    const anyFacts = fc.record({
      here: fc.constantFrom("phone" as const, "mac" as const, "browser" as const),
      notifications: fc.boolean(),
      served: fc.boolean(),
      names: fc.array(
        fc.constantFrom("iPhone", "Chips for Mac", "chips CLI", "Safari on Mac", "Pixel"),
        {
          maxLength: 6,
        },
      ),
    });
    fc.assert(
      fc.property(anyFacts, ({ here, notifications, served, names }) => {
        const steps = setupSteps(
          facts({
            here,
            notifications,
            server: served ? server : undefined,
            devices: names.map((name) => device(name)),
          }),
        );
        expect(steps).toHaveLength(6);
        const done = setupDoneCount(steps);
        // The device holding the card is always one of its own steps.
        expect(done).toBeGreaterThanOrEqual(1);
        expect(done).toBeLessThanOrEqual(6);
      }),
    );
  });
});
