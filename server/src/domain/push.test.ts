/**
 * Who hears a decision on their phone (M4.3, ADR 0045). The rules, and the two properties that
 * matter: nobody who may not answer is ever told, and a person who turned the tier off is
 * never told whatever else is true.
 */

import type { NotificationSettings } from "@chipschat/protocol";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decisionKey,
  inQuietHours,
  localMinutes,
  mayBeTold,
  messageKey,
  messageRecipients,
  type Phone,
  type PushAsk,
  pushRecipients,
  type RoomMember,
  roomLevel,
  wantsMentions,
  wantsTelling,
} from "./push.js";

const ARJUN = "usr_01K4ZQPX000000000000000001";
const DANA = "usr_01K4ZQPX000000000000000002";
const GUEST = "usr_01K4ZQPX000000000000000003";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
const LEDGER = "hrn_01K4ZQPX000000000000000005";
const ASK = "apr_01K4ZQPX000000000000000006";

const ROOM: RoomMember[] = [
  { id: ARJUN, kind: "person", role: "owner" },
  { id: DANA, kind: "person", role: "member" },
  { id: GUEST, kind: "person", role: "guest" },
  { id: SCOUT, kind: "harness", role: undefined },
];

function ask(over: Partial<PushAsk> = {}): PushAsk {
  return { approvalId: ASK, harnessId: SCOUT, approvers: [], ...over };
}

function phone(participantId: string, over: Partial<Phone> = {}): Phone {
  return {
    deviceId: `dev_${participantId.slice(-2)}`,
    participantId,
    token: `ExponentPushToken[${participantId.slice(-2)}]`,
    timeZone: "UTC",
    ...over,
  };
}

function settings(over: Partial<NotificationSettings> = {}): NotificationSettings {
  return { decide: "now", review: "hourly", fyi: "daily", harnesses: {}, ...over };
}

/** Noon UTC: nobody's quiet hours, unless a test puts them there. */
const NOON = new Date("2026-09-08T12:00:00.000Z");

describe("who may be told", () => {
  it("is the room, minus its guests and its harnesses, when the ask named nobody", () => {
    expect(mayBeTold(ask(), ROOM)).toEqual([ARJUN, DANA]);
  });

  it("is exactly who the ask named, guest or not", () => {
    expect(mayBeTold(ask({ approvers: [GUEST] }), ROOM)).toEqual([GUEST]);
  });

  it("drops a harness the ask named: a harness has no phone", () => {
    expect(mayBeTold(ask({ approvers: [DANA, LEDGER] }), ROOM)).toEqual([DANA]);
  });

  it("names nobody twice", () => {
    expect(mayBeTold(ask({ approvers: [DANA, DANA] }), ROOM)).toEqual([DANA]);
  });

  it("reaches somebody the ask named who is not in the room (ADR 0042)", () => {
    const outsider = "usr_01K4ZQPX00000000000000000A";
    expect(mayBeTold(ask({ approvers: [outsider] }), ROOM)).toEqual([outsider]);
  });
});

describe("what a person asked to hear", () => {
  it("hears a decision by default: somebody who never opened the settings", () => {
    expect(wantsTelling(undefined, SCOUT)).toBe(true);
  });

  it("hears nothing when the Decide tier is off", () => {
    expect(wantsTelling(settings({ decide: "off" }), SCOUT)).toBe(false);
  });

  it("hears nothing from a harness they silenced", () => {
    expect(wantsTelling(settings({ harnesses: { [SCOUT]: "none" } }), SCOUT)).toBe(false);
  });

  it("hears a decision from a harness set to decisions only — that is what this is", () => {
    expect(wantsTelling(settings({ harnesses: { [SCOUT]: "decide" } }), SCOUT)).toBe(true);
  });

  it("is not silenced by a word about some other harness", () => {
    expect(wantsTelling(settings({ harnesses: { [LEDGER]: "none" } }), SCOUT)).toBe(true);
  });
});

describe("quiet hours, where the phone is", () => {
  const quiet = settings({ quiet: { from: "22:00", to: "07:00", breakthrough: "decide" } });

  it("reads the time of day in the phone's own zone", () => {
    // 18:30 UTC is 00:00 in Kolkata (+5:30) and 11:30 in Los Angeles.
    const at = new Date("2026-09-08T18:30:00.000Z");
    expect(localMinutes(at, "Asia/Kolkata")).toBe(0);
    expect(localMinutes(at, "America/Los_Angeles")).toBe(11 * 60 + 30);
  });

  it("falls back to UTC for a zone the runtime does not know", () => {
    expect(localMinutes(NOON, "Mars/Olympus")).toBe(12 * 60);
  });

  it("is in force across midnight, and not either side of it", () => {
    const at = new Date("2026-09-08T18:30:00.000Z");
    expect(inQuietHours(quiet, at, "Asia/Kolkata")).toBe(true);
    expect(inQuietHours(quiet, at, "America/Los_Angeles")).toBe(false);
  });

  it("is nothing at all when the window has no width", () => {
    const none = settings({ quiet: { from: "08:00", to: "08:00", breakthrough: "none" } });
    expect(inQuietHours(none, NOON, "UTC")).toBe(false);
  });

  it("is nothing at all when the person set none", () => {
    expect(inQuietHours(settings(), NOON, "UTC")).toBe(false);
  });
});

describe("the phones to push to", () => {
  function recipients(input: {
    ask?: PushAsk;
    phones: Phone[];
    settings?: [string, NotificationSettings | undefined][];
    at?: Date;
  }) {
    return pushRecipients({
      ask: input.ask ?? ask(),
      members: ROOM,
      settings: new Map(input.settings ?? []),
      phones: input.phones,
      at: input.at ?? NOON,
    });
  }

  it("is every phone of everyone who may answer, keyed as the browser keys it", () => {
    const found = recipients({ phones: [phone(ARJUN), phone(DANA)] });
    expect(found.map((r) => r.participantId)).toEqual([ARJUN, DANA]);
    expect(new Set(found.map((r) => r.key))).toEqual(new Set([decisionKey(ASK)]));
  });

  it("is both phones of a person who registered two — the ledger picks one, later", () => {
    const found = recipients({
      phones: [phone(ARJUN, { deviceId: "dev_a" }), phone(ARJUN, { deviceId: "dev_b" })],
    });
    expect(found.map((r) => r.deviceId)).toEqual(["dev_a", "dev_b"]);
  });

  it("is nobody when the ask named a harness and nobody else", () => {
    expect(recipients({ ask: ask({ approvers: [LEDGER] }), phones: [phone(ARJUN)] })).toEqual([]);
  });

  it("skips a guest's phone when the ask named the room", () => {
    expect(recipients({ phones: [phone(GUEST)] })).toEqual([]);
  });

  it("skips a phone whose person turned the tier off", () => {
    const found = recipients({
      phones: [phone(ARJUN), phone(DANA)],
      settings: [[ARJUN, settings({ decide: "off" })]],
    });
    expect(found.map((r) => r.participantId)).toEqual([DANA]);
  });

  it("holds a phone in quiet hours when nothing breaks through", () => {
    const night = new Date("2026-09-08T18:30:00.000Z");
    const held = settings({ quiet: { from: "22:00", to: "07:00", breakthrough: "none" } });
    const through = settings({ quiet: { from: "22:00", to: "07:00", breakthrough: "decide" } });
    const kolkata = { timeZone: "Asia/Kolkata" };
    expect(
      recipients({
        phones: [phone(ARJUN, kolkata)],
        settings: [[ARJUN, held]],
        at: night,
      }),
    ).toEqual([]);
    expect(
      recipients({
        phones: [phone(ARJUN, kolkata)],
        settings: [[ARJUN, through]],
        at: night,
      }),
    ).toHaveLength(1);
  });

  it("pushes to the same person's other phone, where it is not night", () => {
    const night = new Date("2026-09-08T18:30:00.000Z");
    const held = settings({ quiet: { from: "22:00", to: "07:00", breakthrough: "none" } });
    const found = recipients({
      phones: [
        phone(ARJUN, { deviceId: "in_kolkata", timeZone: "Asia/Kolkata" }),
        phone(ARJUN, { deviceId: "in_california", timeZone: "America/Los_Angeles" }),
      ],
      settings: [[ARJUN, held]],
      at: night,
    });
    expect(found.map((r) => r.deviceId)).toEqual(["in_california"]);
  });

  it("is nobody when nobody registered a phone", () => {
    expect(recipients({ phones: [] })).toEqual([]);
  });
});

describe("whatever the input", () => {
  const person = fc.constantFrom(ARJUN, DANA, GUEST);
  // Unique by the number, so each generated phone is a different device and a failure replays.
  const anyPhones = fc
    .uniqueArray(fc.tuple(person, fc.nat({ max: 50 })), {
      selector: ([, n]) => n,
      maxLength: 6,
    })
    .map((pairs) => pairs.map(([id, n]) => phone(id, { deviceId: `dev_${n}` })));
  const anySettings = fc.record({
    decide: fc.constantFrom("now" as const, "off" as const),
    review: fc.constant("hourly" as const),
    fyi: fc.constant("daily" as const),
    harnesses: fc.constantFrom({}, { [SCOUT]: "none" as const }, { [SCOUT]: "all" as const }),
  });
  const anyAsk = fc
    .subarray([ARJUN, DANA, GUEST, SCOUT, LEDGER])
    .map((approvers) => ask({ approvers }));

  it("tells nobody who may not answer", () => {
    fc.assert(
      fc.property(anyAsk, anyPhones, (a, phones) => {
        const allowed = new Set(mayBeTold(a, ROOM));
        const found = pushRecipients({
          ask: a,
          members: ROOM,
          settings: new Map(),
          phones,
          at: NOON,
        });
        return found.every((r) => allowed.has(r.participantId));
      }),
    );
  });

  it("tells nobody who turned the Decide tier off, whatever else is true", () => {
    fc.assert(
      fc.property(anyAsk, anyPhones, anySettings, (a, phones, s) => {
        const found = pushRecipients({
          ask: a,
          members: ROOM,
          settings: new Map([ARJUN, DANA, GUEST].map((id) => [id, s])),
          phones,
          at: NOON,
        });
        return s.decide === "now" ? true : found.length === 0;
      }),
    );
  });

  it("gives every recipient the one key, and never a phone twice", () => {
    fc.assert(
      fc.property(anyAsk, anyPhones, (a, phones) => {
        const found = pushRecipients({
          ask: a,
          members: ROOM,
          settings: new Map(),
          phones,
          at: NOON,
        });
        const devices = found.map((r) => r.deviceId);
        return (
          found.every((r) => r.key === decisionKey(a.approvalId)) &&
          new Set(devices).size === devices.length
        );
      }),
    );
  });
});

describe("the phones a message goes to (ADRs 0158, 0198, 0216)", () => {
  const MESSAGE = "msg_01K4ZQPX000000000000000007";
  const ROOM_ID = "spc_01K4ZQPX000000000000000008";
  const PEOPLE = [ARJUN, DANA, GUEST];

  function told(input: {
    speakerId?: string;
    harnessId?: string | undefined;
    mentioned?: string[];
    people?: string[];
    phones?: Phone[];
    settings?: [string, NotificationSettings | undefined][];
    hidden?: string[];
    at?: Date;
  }) {
    return messageRecipients({
      messageId: MESSAGE,
      spaceId: ROOM_ID,
      speakerId: input.speakerId ?? SCOUT,
      harnessId: "harnessId" in input ? input.harnessId : SCOUT,
      people: input.people ?? PEOPLE,
      mentioned: input.mentioned ?? [ARJUN],
      hidden: input.hidden,
      settings: new Map(input.settings ?? []),
      phones: input.phones ?? [phone(ARJUN), phone(DANA), phone(GUEST)],
      at: input.at ?? NOON,
    }).map((recipient) => recipient.participantId);
  }
  const hearsAll = (spaceId = ROOM_ID) => settings({ spaces: { [spaceId]: "all" } });
  const onlyAts = settings({ spaces: { [ROOM_ID]: "mentions" } });

  it("is the phones of the people it @s, keyed by the message, each with its seal key", () => {
    const found = messageRecipients({
      messageId: MESSAGE,
      spaceId: ROOM_ID,
      speakerId: SCOUT,
      harnessId: SCOUT,
      people: PEOPLE,
      mentioned: [ARJUN],
      settings: new Map(),
      phones: [phone(ARJUN, { sealKey: "k" }), phone(DANA)],
      at: NOON,
    });
    expect(found).toEqual([
      {
        participantId: ARJUN,
        deviceId: phone(ARJUN).deviceId,
        token: phone(ARJUN).token,
        key: messageKey(MESSAGE),
        sealKey: "k",
      },
    ]);
  });

  it("pushes an agent's words to nobody they do not @, until they hear everything in that room", () => {
    expect(told({ mentioned: [] })).toEqual([]);
    expect(roomLevel(undefined, ROOM_ID)).toBe("people");
    expect(told({ mentioned: [], settings: [[GUEST, hearsAll()]] })).toEqual([GUEST]);
    // A word about another room is not a word about this one.
    expect(told({ mentioned: [], settings: [[GUEST, hearsAll("spc_other")]] })).toEqual([]);
  });

  it("reaches everyone else in the room when a person writes, whoever it was for (ADR 0216)", () => {
    // Foodie, 20 October 2026: Arjun's message to the agent @'d nobody and reached nobody.
    const person = { speakerId: DANA, harnessId: undefined };
    expect(told({ ...person, mentioned: [] })).toEqual([ARJUN, GUEST]);
    expect(told({ ...person, mentioned: [ARJUN] })).toEqual([ARJUN, GUEST]);
    // Never the person who wrote it, whatever they hear.
    expect(told({ ...person, mentioned: [DANA], settings: [[DANA, hearsAll()]] })).toEqual([
      ARJUN,
      GUEST,
    ]);
  });

  it("holds a person's words back from whoever chose Only @ you, but for an @", () => {
    const person = { speakerId: DANA, harnessId: undefined };
    expect(told({ ...person, mentioned: [], settings: [[ARJUN, onlyAts]] })).toEqual([GUEST]);
    expect(told({ ...person, mentioned: [ARJUN], settings: [[ARJUN, onlyAts]] })).toEqual([
      ARJUN,
      GUEST,
    ]);
  });

  it("is nobody who silenced the room, @ or not", () => {
    const silent = settings({ spaces: { [ROOM_ID]: "none" } });
    expect(told({ settings: [[ARJUN, silent]] })).toEqual([]);
  });

  it("is nobody who hid the room, @ or everything, and their word for it stays (ADR 0205)", () => {
    expect(told({ hidden: [ARJUN] })).toEqual([]);
    expect(
      told({ mentioned: [ARJUN, GUEST], hidden: [ARJUN], settings: [[ARJUN, hearsAll()]] }),
    ).toEqual([GUEST]);
    // Unhidden, the room is heard as it was set.
    expect(told({ mentioned: [], settings: [[ARJUN, hearsAll()]] })).toEqual([ARJUN]);
  });

  it("is nobody outside the room, whatever the message says", () => {
    expect(told({ people: [DANA], mentioned: [ARJUN] })).toEqual([]);
  });

  it("is nobody who hears only decisions, or nothing, from an agent's harness", () => {
    for (const word of ["decide", "none"] as const) {
      const quiet = settings({ harnesses: { [SCOUT]: word } });
      expect(told({ settings: [[ARJUN, quiet]] }), word).toEqual([]);
    }
    const other = settings({ harnesses: { [LEDGER]: "none" } });
    expect(told({ settings: [[ARJUN, other]] })).toEqual([ARJUN]);
    expect(wantsMentions(undefined, SCOUT)).toBe(true);
    // A person's words are not a harness's.
    const silenced = settings({ harnesses: { [SCOUT]: "none" } });
    expect(told({ speakerId: DANA, harnessId: undefined, settings: [[ARJUN, silenced]] })).toEqual([
      ARJUN,
      GUEST,
    ]);
  });

  it("waits out quiet hours, which a message never breaks through", () => {
    const night = new Date("2026-09-08T18:30:00.000Z");
    const through = settings({ quiet: { from: "22:00", to: "07:00", breakthrough: "decide" } });
    const kolkata = [phone(ARJUN, { timeZone: "Asia/Kolkata" })];
    expect(told({ phones: kolkata, settings: [[ARJUN, through]], at: night })).toEqual([]);
    expect(told({ phones: kolkata, settings: [[ARJUN, through]] })).toEqual([ARJUN]);
  });
});
