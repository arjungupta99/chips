/**
 * Telling a room's people that its agents need them (ADR 0097), against fakes: the first held
 * message and the first warning of a stretch each push once per person, with fixed words and the
 * room's id; nothing for a quiet stretch or a person's message; quiet hours kept.
 */

import { createLogger } from "@chipschat/platform";
import type { ExchangeMessage, NotificationSettings } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../ports/event-store.js";
import type { PushMessage, PushToken } from "../ports/push.js";
import type { ExchangeView, MemberView } from "../ports/read-models.js";
import { createNotifyExchange } from "./notify-exchange.js";

const WS = "ws_01K4ZQPX00000000000000000W";
const SPACE = "spc_01K4ZQPX000000000000000001";
const ARJUN = "usr_01K4ZQPX000000000000000004";
const SCOUT = "agt_01K4ZQPX000000000000000007";
const LEDGER = "agt_01K4ZQPX000000000000000008";
const NOW = "2026-10-02T12:00:00.000Z";

const member = (id: string, kind: MemberView["kind"]): MemberView => ({
  participant_id: id,
  kind,
  display_name: id,
  role: "member",
  owner_id: null,
  workspace_role: kind === "person" ? "owner" : null,
});

const said = (by: string, n: number): ExchangeMessage => ({
  message_id: `msg_${n}`,
  by,
  text: `step ${n} of a plan with words that differ each time ${n}`,
  filesSeen: [],
});

function stretch(count: number, messages: ExchangeMessage[] = []): ExchangeView {
  return {
    count,
    since: { kind: "person", seq: 40, at: "2026-10-02T11:40:00.000Z", by: ARJUN },
    messages,
    paused: false,
    personLooking: null,
    person: ARJUN,
    personSeq: 40,
  };
}

function posted(over: { held?: boolean; actor?: StoredEvent["actor"] } = {}): StoredEvent {
  return {
    seq: 90,
    workspace_id: WS,
    id: "evt_01K4ZQPX000000000000000009",
    type: "message.post",
    ts: NOW,
    space_id: SPACE,
    run_id: null,
    actor: over.actor ?? { kind: "agent", id: SCOUT },
    idempotency_key: null,
    payload: { text: "@Ledger again", ...(over.held === true ? { held: true } : {}) },
  };
}

function rig(view: ExchangeView, settings?: NotificationSettings) {
  const sent: PushMessage[][] = [];
  const taken = new Set<string>();
  const phones: PushToken[] = [
    {
      deviceId: "dev_1",
      participantId: ARJUN,
      token: "ExponentPushToken[1]",
      platform: "ios",
      timeZone: "UTC",
    },
  ];
  const notify = createNotifyExchange({
    readModels: {
      exchangeOf: async () => view,
      membersOf: async () => [
        member(ARJUN, "person"),
        member(SCOUT, "agent"),
        member(LEDGER, "agent"),
      ],
    },
    notifications: {
      settings: async () => settings,
      claim: async (ask) => {
        const granted = ask.keys.filter((key) => !taken.has(`${ask.participantId}:${key}`));
        for (const key of granted) taken.add(`${ask.participantId}:${key}`);
        return granted;
      },
    },
    push: { forPeople: async () => phones },
    sender: {
      send: async (messages) => {
        sent.push([...messages]);
        return messages.map(() => ({ ok: true }));
      },
      readiness: () => "ready",
    },
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW), now: () => new Date(NOW) },
    logger: createLogger({ level: "silent" }),
  });
  return { notify, sent };
}

describe("telling the people their agents need them", () => {
  it("pushes the first held message once, with fixed words and the room's id", async () => {
    const { notify, sent } = rig(stretch(49));
    await notify.after(posted({ held: true }));
    await notify.after(posted({ held: true }));
    expect(sent).toEqual([
      [
        {
          to: "ExponentPushToken[1]",
          title: "Chips paused the agents",
          body: "Open the space to let them carry on.",
          priority: "default",
          ttl: 1800,
          // The phone's device in this workspace, for a phone holding several (ADR 0197).
          data: { device_id: "dev_1", space_id: SPACE },
        },
      ],
    ]);
  });

  it("pushes the first warning of a stretch once, and nothing below it", async () => {
    const quiet = rig(stretch(5));
    await quiet.notify.after(posted());
    expect(quiet.sent).toEqual([]);
    const warned = rig(stretch(16, [said(SCOUT, 1), said(LEDGER, 2)]));
    await warned.notify.after(posted());
    await warned.notify.after(posted());
    expect(warned.sent.map((batch) => batch.map((message) => message.title))).toEqual([
      ["The agents need a look"],
    ]);
  });

  it("says nothing of a person's message, nor in the person's quiet hours", async () => {
    const person = rig(stretch(49));
    await person.notify.after(posted({ held: true, actor: { kind: "person", id: ARJUN } }));
    expect(person.sent).toEqual([]);
    const asleep = rig(stretch(49), {
      decide: "now",
      everything: "digest",
      harnesses: {},
      quiet: { from: "11:00", to: "13:00", breakthrough: "none" },
    } as unknown as NotificationSettings);
    await asleep.notify.after(posted({ held: true }));
    expect(asleep.sent).toEqual([]);
  });
});
