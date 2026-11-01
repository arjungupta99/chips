/**
 * A message reaching the phones of the people who want it (ADRs 0158, 0198), against fakes: an @
 * from a person or an agent, everything in a room for whoever asked, never the speaker, once per
 * person per message, fixed words with the speaker's sealed to a phone that has a key, and nothing
 * to whoever hid the room (ADR 0205).
 */

import { createDecipheriv, randomBytes } from "node:crypto";
import { createLogger } from "@chipschat/platform";
import type { NotificationSettings } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { StoredEvent } from "../ports/event-store.js";
import type { PushMessage, PushToken } from "../ports/push.js";
import type { MemberView } from "../ports/read-models.js";
import { createNotifyMessage } from "./notify-message.js";

const WS = "ws_01K4ZQPX00000000000000000W";
const SPACE = "spc_01K4ZQPX000000000000000001";
const ARJUN = "usr_01K4ZQPX000000000000000004";
const MEERA = "usr_01K4ZQPX000000000000000005";
const PRIYA = "usr_01K4ZQPX000000000000000006";
const SCOUT = "agt_01K4ZQPX000000000000000007";
const NOW = "2026-10-18T12:00:00.000Z";

const member = (id: string, kind: MemberView["kind"], name = id): MemberView => ({
  participant_id: id,
  kind,
  display_name: name,
  role: "member",
  owner_id: null,
  workspace_role: kind === "person" ? "member" : null,
});

/** Meera's phone registered a key to seal words to (ADR 0158). */
const MEERAS_KEY = randomBytes(32).toString("base64");

const phoneOf = (participantId: string, n: number, sealKey?: string): PushToken => ({
  deviceId: `dev_${n}`,
  participantId,
  token: `ExponentPushToken[${n}]`,
  platform: "ios",
  timeZone: "UTC",
  ...(sealKey === undefined ? {} : { sealKey }),
});

/** What the phone's extension does with sealed words, in Node's. */
function open(keyBase64: string, sealed: string): unknown {
  const bytes = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(keyBase64, "base64"),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  const words = Buffer.concat([
    decipher.update(bytes.subarray(12, bytes.length - 16)),
    decipher.final(),
  ]);
  return JSON.parse(words.toString("utf8"));
}

function said(by: StoredEvent["actor"], mentions: string[] = [], n = 1): StoredEvent {
  return {
    seq: 90 + n,
    workspace_id: WS,
    id: `evt_01K4ZQPX00000000000000000${n}`,
    type: "message.post",
    ts: NOW,
    space_id: SPACE,
    run_id: null,
    actor: by,
    idempotency_key: null,
    payload: { text: "Can we fit a day in Nara?", mentions },
  };
}

const ALL: NotificationSettings = {
  decide: "now",
  review: "hourly",
  fyi: "daily",
  harnesses: {},
  spaces: { [SPACE]: "all" },
};

/** Only @ you (ADR 0198): a person's words reach them only when they name them. */
const ONLY_ATS: NotificationSettings = { ...ALL, spaces: { [SPACE]: "mentions" } };

function rig(
  settings: Record<string, NotificationSettings | undefined> = {},
  hiders: readonly string[] = [],
) {
  const sent: PushMessage[][] = [];
  const taken = new Set<string>();
  const asked: string[][] = [];
  const notify = createNotifyMessage({
    readModels: {
      membersOf: async () => [
        member(ARJUN, "person", "Arjun"),
        member(MEERA, "person", "Meera"),
        member(PRIYA, "person", "Priya"),
        member(SCOUT, "agent", "Scout"),
      ],
      space: async () => ({ title: "Japan trip" }) as never,
    },
    hidden: { hidersOf: async () => hiders },
    notifications: {
      settings: async (_ws, id) => settings[id],
      claim: async (ask) => {
        const granted = ask.keys.filter((key) => !taken.has(`${ask.participantId}:${key}`));
        for (const key of granted) taken.add(`${ask.participantId}:${key}`);
        return granted;
      },
    },
    push: {
      forPeople: async (_ws, people) => {
        asked.push([...people]);
        return [phoneOf(ARJUN, 1), phoneOf(MEERA, 2, MEERAS_KEY), phoneOf(PRIYA, 3)].filter(
          (phone) => people.includes(phone.participantId),
        );
      },
      remove: async () => undefined,
    },
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
  const to = () => sent.flat().map((message) => message.to);
  return { notify, sent, asked, to };
}

describe("a message reaching the phones that want it", () => {
  it("pushes a person's @ to the person it names, with fixed words and the room's ids", async () => {
    const { notify, sent } = rig({ [ARJUN]: ONLY_ATS });
    await notify.after(said({ kind: "person", id: PRIYA }, [MEERA]));
    expect(sent).toEqual([
      [
        {
          to: "ExponentPushToken[2]",
          title: "A message for you",
          body: "Open Chips to read it.",
          priority: "high",
          ttl: 6 * 60 * 60,
          sound: "default",
          mutableContent: true,
          data: {
            device_id: "dev_2",
            space_id: SPACE,
            message_id: expect.any(String),
            sealed: expect.any(String),
          },
        },
      ],
    ]);
  });

  it("pushes a person picked in the field's list as an @ would, and only them (ADR 0204)", async () => {
    // Foodie, 19 October 2026: a message for Arjun had no way to say so, and reached nobody.
    const { notify, sent, to } = rig({ [ARJUN]: ONLY_ATS });
    const picked = said({ kind: "person", id: PRIYA });
    await notify.after({ ...picked, payload: { ...picked.payload, addressed_people: [MEERA] } });
    expect(to()).toEqual(["ExponentPushToken[2]"]);
    expect(sent.flat()[0]?.title).toBe("A message for you");
  });

  it("pushes a person's message to everyone else in the room, though it was for an agent (ADR 0216)", async () => {
    // Foodie, 20 October 2026: Arjun asked the agent, and Natalie's phone heard nothing.
    const { notify, sent, to } = rig();
    const asked = said({ kind: "person", id: PRIYA });
    await notify.after({ ...asked, payload: { ...asked.payload, addressed_to: [SCOUT] } });
    expect(to()).toEqual(["ExponentPushToken[1]", "ExponentPushToken[2]"]);
    expect(sent.flat().map((message) => message.title)).toEqual(["A new message", "A new message"]);

    // Only @ you holds it back; Every message does not.
    const held = rig({ [ARJUN]: ONLY_ATS, [MEERA]: ALL });
    await held.notify.after(said({ kind: "person", id: PRIYA }));
    expect(held.to()).toEqual(["ExponentPushToken[2]"]);
  });

  it("pushes an agent's words to nobody they do not @, until someone hears everything there", async () => {
    const agent = { kind: "agent" as const, id: SCOUT, harness_id: "hrn_scout" };
    const quiet = rig();
    await quiet.notify.after(said(agent));
    expect(quiet.sent).toEqual([]);

    const meera = rig({ [MEERA]: ALL });
    await meera.notify.after(said(agent));
    expect(meera.to()).toEqual(["ExponentPushToken[2]"]);
    expect(meera.sent.flat()[0]?.title).toBe("A new message");
  });

  it("never asks after the speaker's own phones", async () => {
    const { notify, asked, to } = rig({ [PRIYA]: ALL });
    await notify.after(said({ kind: "person", id: PRIYA }, [PRIYA]));
    expect(asked).toEqual([[ARJUN, MEERA]]);
    expect(to()).not.toContain("ExponentPushToken[3]");
  });

  it("pushes an agent's @ as before, and once per person however often it is told", async () => {
    const { notify, to } = rig();
    const agent = { kind: "agent" as const, id: SCOUT, harness_id: "hrn_scout" };
    await notify.after(said(agent, [ARJUN]));
    await notify.after(said(agent, [ARJUN]));
    expect(to()).toEqual(["ExponentPushToken[1]"]);
  });

  it("pushes nothing to whoever hid the room, an @, a pick or everything (ADR 0205)", async () => {
    // Arjun hid Foodie: Priya's @ of him and a pick of him stay in the room; Meera, who did not
    // hide it, still hears both of Priya's, and not the agent's @ of Arjun.
    const { notify, to } = rig({ [ARJUN]: ALL }, [ARJUN]);
    await notify.after(said({ kind: "person", id: PRIYA }, [ARJUN, MEERA]));
    const picked = said({ kind: "person", id: PRIYA }, [], 2);
    await notify.after({ ...picked, payload: { ...picked.payload, addressed_people: [ARJUN] } });
    await notify.after(said({ kind: "agent", id: SCOUT, harness_id: "hrn_scout" }, [ARJUN], 3));
    expect(to()).toEqual(["ExponentPushToken[2]", "ExponentPushToken[2]"]);
  });

  it("seals who said it, where, and the words, to a phone with a key, and only there", async () => {
    const { notify, sent } = rig();
    await notify.after(said({ kind: "person", id: PRIYA }, [MEERA, ARJUN]));
    const [toArjun, toMeera] = sent.flat();
    expect(open(MEERAS_KEY, String(toMeera?.data?.["sealed"]))).toEqual({
      title: "Priya · Japan trip",
      body: "Can we fit a day in Nara?",
    });
    // Arjun's phone has no key: the fixed words, and nothing of the message.
    expect(toArjun?.data?.["sealed"]).toBeUndefined();
    expect(JSON.stringify(toArjun)).not.toContain("Nara");
  });
});
