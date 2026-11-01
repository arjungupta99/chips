/**
 * A join request reaches the phones of the people who may decide it (ADR 0122): owners and admins,
 * one phone each, with two fixed sentences and the request's id, and nothing about who asks.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { ClaimRequest } from "../ports/notifications.js";
import type { PushMessage, PushToken } from "../ports/push.js";
import type { PersonView } from "../ports/read-models.js";
import { createNotifyJoin, JOIN_PUSH_WORDS } from "./notify-join.js";

const WS = "ws_1";
const person = (participant_id: string, role: PersonView["role"]): PersonView => ({
  participant_id,
  display_name: participant_id,
  role,
  joined_at: "2026-09-01T00:00:00.000Z",
  invited_by: null,
});
const phone = (participantId: string, deviceId: string): PushToken => ({
  deviceId,
  participantId,
  token: `ExponentPushToken[${deviceId}]`,
  platform: "ios",
  timeZone: "America/Los_Angeles",
});

function harness(phones: PushToken[]) {
  const sent: PushMessage[] = [];
  const asked: string[][] = [];
  const claimed = new Set<string>();
  const notify = createNotifyJoin({
    readModels: {
      peopleIn: async () => [
        person("usr_owner", "owner"),
        person("usr_admin", "admin"),
        person("usr_member", "member"),
        person("usr_guest", "guest"),
      ],
    },
    notifications: {
      // The first device of each person to ask is granted the key, as the ledger does.
      claim: async (request: ClaimRequest) => {
        const key = `${request.participantId}:${request.keys[0]}`;
        if (claimed.has(key)) return [];
        claimed.add(key);
        return [...request.keys];
      },
    },
    push: {
      forPeople: async (_ws, ids) => {
        asked.push([...ids]);
        return phones.filter((each) => ids.includes(each.participantId));
      },
    },
    sender: {
      send: async (messages) => {
        sent.push(...messages);
        return messages.map(() => ({ ok: true }));
      },
      readiness: () => "ready",
    },
    clock: manualClock(Date.parse("2026-10-05T21:00:00.000Z")),
    logger: createLogger({ level: "silent" }),
  });
  return { notify, sent, asked };
}

describe("a join request's push", () => {
  it("goes to owners and admins, one phone each, with the id and nothing about who asks", async () => {
    const { notify, sent, asked } = harness([
      phone("usr_owner", "dev_1"),
      phone("usr_owner", "dev_2"),
      phone("usr_admin", "dev_3"),
      phone("usr_member", "dev_4"),
    ]);
    await notify.waiting(WS, "jrq_1");
    expect(asked).toEqual([["usr_owner", "usr_admin"]]);
    expect(sent.map((each) => each.to)).toEqual([
      "ExponentPushToken[dev_1]",
      "ExponentPushToken[dev_3]",
    ]);
    for (const message of sent) {
      expect(message).toMatchObject({ ...JOIN_PUSH_WORDS, data: { join_request_id: "jrq_1" } });
      // The request's id, and which of the phone's workspaces it is in (ADR 0197).
      expect(Object.keys(message.data)).toEqual(["device_id", "join_request_id"]);
    }
  });

  it("sends nothing when nobody who decides has a phone, and never throws", async () => {
    const { notify, sent } = harness([phone("usr_member", "dev_4")]);
    await expect(notify.waiting(WS, "jrq_2")).resolves.toBeUndefined();
    expect(sent).toEqual([]);
  });
});
