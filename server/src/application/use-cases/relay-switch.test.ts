/**
 * The owner's relay switch (ADR 0211, Phase 4): an owner's alone; off, the change is written
 * before the link goes, so the devices on the relay hear it; the same again writes nothing; and
 * the people the switch would cut off are asked to go direct, by a push that names nobody.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { Principal } from "../ports/identity.js";
import type { PushMessage, PushToken } from "../ports/push.js";
import type { DeviceWay, RelaySwitch, RelaySwitchRegistry } from "../ports/relay-switch.js";
import { createRelaySwitch, cutOff, RELAY_ASK_WORDS, TELL_MS } from "./relay-switch.js";

const WS = "ws_1";
const principal = (participantId: string, role: "owner" | "admin" | "member"): Principal => ({
  kind: "person",
  participantId,
  workspaceId: WS,
  displayName: participantId,
  role,
  via: "device_key",
  deviceId: `dev_${participantId}`,
});
const device = (participantId: string, lastVia: DeviceWay["lastVia"], directAt: string | null) => ({
  deviceId: `dev_${participantId}`,
  participantId,
  name: `${participantId}'s phone`,
  lastVia,
  lastViaAt: "2026-10-21T09:00:00.000Z",
  directAt,
});

/** The moment before the relay goes: at once, or held until a test lets it pass. */
function harness(configured = true, moment: () => Promise<void> = async () => undefined) {
  let current: RelaySwitch = { on: true, setBy: null, workspaceId: null, setAt: null };
  const noted: string[] = [];
  const log: string[] = [];
  const sent: PushMessage[] = [];
  const registry: RelaySwitchRegistry = {
    current: async () => current,
    set: async (next) => {
      current = { on: next.on, setBy: next.by, workspaceId: next.workspaceId, setAt: next.at };
    },
    noteWay: async (deviceId, via) => {
      noted.push(`${deviceId} ${via}`);
    },
    ways: async () => [
      device("usr_owner", "relay", null),
      device("usr_dana", "relay", null),
      device("usr_eve", "lan", "2026-10-21T08:00:00.000Z"),
    ],
  };
  const relay = createRelaySwitch({
    registry,
    directAsks: { keptLink: async () => "https://login.tailscale.com/admin/invite/k" },
    store: {
      append: async (event) => {
        log.push(`append ${event.type} ${String((event as { on?: unknown }).on)}`);
        return { seq: 1, duplicate: false } as never;
      },
    },
    link: {
      configured,
      url: "wss://relay.example",
      apply: async (on) => {
        log.push(`apply ${on}`);
      },
      // Turned away for a ninth server from its address (the new-person sweep's finding 12).
      status: () => "connecting",
      trouble: () => "busy",
    },
    liveWays: () => new Map([["dev_usr_eve", "lan" as const]]),
    notifications: { claim: async (request) => [...request.keys] },
    push: {
      forPeople: async (_ws, ids) =>
        ids.map(
          (id): PushToken => ({
            deviceId: `dev_${id}`,
            participantId: id,
            token: `ExponentPushToken[${id}]`,
            platform: "ios",
            timeZone: "UTC",
          }),
        ),
    },
    sender: {
      send: async (messages) => {
        sent.push(...messages);
        return messages.map(() => ({ ok: true }));
      },
      readiness: () => "ready",
    },
    clock: manualClock(Date.parse("2026-10-21T10:05:00.000Z")),
    ids: { next: () => "evt_1" } as never,
    logger: createLogger({ level: "silent" }),
    wait: async (ms) => {
      log.push(`wait ${ms}`);
      await moment();
    },
  });
  return { relay, noted, log, sent };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the owner's relay switch", () => {
  it("tells every device before the relay goes, and dials at once when it comes back", async () => {
    const { relay, log } = harness();
    const off = await relay.set(principal("usr_owner", "owner"), false);
    expect(off).toMatchObject({ ok: true, value: { on: false, setBy: "usr_owner" } });
    // The link goes after the moment the devices have to hear it, which the owner does not wait on.
    await settle();
    expect(log).toEqual(["append relay.set false", `wait ${TELL_MS}`, "apply false"]);
    // The same again changes nothing.
    await relay.set(principal("usr_owner", "owner"), false);
    await settle();
    expect(log).toHaveLength(3);
    await relay.set(principal("usr_owner", "owner"), true);
    // On, it dials first, so a device that asks for the relay the moment it hears is told it.
    expect(log.slice(3)).toEqual(["apply true", "append relay.set true"]);
  });

  it("lets nothing go when the relay is turned on again within the moment", async () => {
    let pass: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      pass = resolve;
    });
    const { relay, log } = harness(true, () => held);
    await relay.set(principal("usr_owner", "owner"), false);
    await relay.set(principal("usr_owner", "owner"), true);
    pass();
    await settle();
    expect(log).not.toContain("apply false");
    expect(log).toContain("apply true");
  });

  it("shows an owner every device with its way now, and refuses anybody else", async () => {
    const { relay } = harness();
    const seen = await relay.view(principal("usr_owner", "owner"));
    if (!seen.ok) throw new Error("refused");
    // On, and not connected, with why: what the switch shows beside it.
    expect(seen.value).toMatchObject({ on: true, status: "connecting", why: "busy" });
    expect(seen.value.devices.map((each) => [each.participantId, each.now])).toEqual([
      ["usr_owner", null],
      ["usr_dana", null],
      ["usr_eve", "lan"],
    ]);
    expect(seen.value.keptLink).toMatch(/tailscale/);
    for (const role of ["admin", "member"] as const) {
      expect(await relay.view(principal("usr_x", role))).toMatchObject({
        ok: false,
        error: { kind: "not_allowed" },
      });
      expect(await relay.set(principal("usr_x", role), false)).toMatchObject({ ok: false });
    }
  });

  it("refuses to turn a relay this server does not have", async () => {
    const { relay, log } = harness(false);
    expect(await relay.set(principal("usr_owner", "owner"), false)).toMatchObject({
      ok: false,
      error: { kind: "invalid" },
    });
    expect(log).toEqual([]);
  });

  it("asks the people it would cut off to go direct, not the owner asking", async () => {
    const { relay, sent } = harness();
    expect(await relay.ask(principal("usr_owner", "owner"))).toEqual({
      ok: true,
      value: { asked: 1 },
    });
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "ExponentPushToken[usr_dana]",
      ...RELAY_ASK_WORDS,
      data: { relay_ask: "connection" },
    });
    expect(cutOff([device("a", "relay", null), device("a", "relay", null)], "b")).toEqual(["a"]);
  });

  it("keeps each device's way in, a person's only", async () => {
    const { relay, noted } = harness();
    await relay.noteWay(principal("usr_dana", "member"), "relay");
    await relay.noteWay(
      { kind: "harness", participantId: "har_1", workspaceId: WS, via: "harness_token" } as never,
      "socket",
    );
    expect(noted).toEqual(["dev_usr_dana relay"]);
  });
});
