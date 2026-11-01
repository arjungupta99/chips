/**
 * Who hears what of a direct ask (ADR 0211, Phase 3): the owners when a guest asks, the guest
 * when an owner shares, the owner who shared when the guest arrives other than through the relay.
 * Two fixed sentences and an id each, nothing about who (ADR 0045), one phone per person.
 */

import { createLogger, manualClock } from "@chipschat/platform";
import { describe, expect, it } from "vitest";
import type { DirectAsk, DirectAskRegistry } from "../ports/direct-asks.js";
import type { Principal } from "../ports/identity.js";
import type { PushMessage, PushToken } from "../ports/push.js";
import type { PersonView } from "../ports/read-models.js";
import { createDirectAsks, DIRECT_PUSH_WORDS } from "./direct-asks.js";

const WS = "ws_1";
const person = (participant_id: string, role: PersonView["role"]): PersonView => ({
  participant_id,
  display_name: participant_id,
  role,
  joined_at: "2026-09-01T00:00:00.000Z",
  invited_by: null,
});
const phone = (participantId: string): PushToken => ({
  deviceId: `dev_${participantId}`,
  participantId,
  token: `ExponentPushToken[${participantId}]`,
  platform: "ios",
  timeZone: "America/Los_Angeles",
});
const principal = (participantId: string, role: PersonView["role"]): Principal => ({
  kind: "person",
  participantId,
  workspaceId: WS,
  displayName: participantId,
  role,
  via: "device_key",
});

/** The registry in memory, as the Kysely one behaves. */
function memory(): DirectAskRegistry {
  const asks = new Map<string, DirectAsk>();
  let kept: string | undefined;
  const set = (id: string, change: Partial<DirectAsk>) => {
    const ask = asks.get(id) as DirectAsk;
    asks.set(id, { ...ask, ...change });
    return asks.get(id);
  };
  return {
    create: async (ask) => {
      asks.set(ask.id, ask);
    },
    latestFor: async (_ws, who) =>
      [...asks.values()].filter((ask) => ask.participantId === who).at(-1),
    waiting: async () => [...asks.values()].filter((ask) => ask.state === "asked"),
    get: async (_ws, id) => asks.get(id),
    share: async (_ws, id, change) =>
      asks.get(id)?.state === "asked"
        ? set(id, { state: "shared", link: change.link, sharedBy: change.by, sharedAt: change.at })
        : undefined,
    direct: async (_ws, id, at) =>
      asks.get(id)?.state === "shared" ? set(id, { state: "direct", directAt: at }) : undefined,
    keptLink: async () => kept,
    keep: async (_ws, link) => {
      kept = link?.link;
    },
  };
}

function harness() {
  const sent: PushMessage[] = [];
  let n = 0;
  const asks = createDirectAsks({
    registry: memory(),
    readModels: {
      peopleIn: async () => [
        person("usr_owner", "owner"),
        person("usr_admin", "admin"),
        person("usr_guest", "guest"),
      ],
    },
    notifications: { claim: async (request) => [...request.keys] },
    push: {
      forPeople: async (_ws, ids) =>
        ["usr_owner", "usr_admin", "usr_guest"].filter((id) => ids.includes(id)).map(phone),
    },
    sender: {
      send: async (messages) => {
        sent.push(...messages);
        return messages.map(() => ({ ok: true }));
      },
      readiness: () => "ready",
    },
    clock: manualClock(Date.parse("2026-10-20T16:00:00.000Z")),
    ids: {
      next: (kind: string) => {
        n += 1;
        return `${kind === "direct" ? "dra" : kind}_${n}`;
      },
    } as never,
    logger: createLogger({ level: "silent" }),
  });
  return { asks, sent };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a direct ask's pushes", () => {
  it("reach the owners on an ask, the guest on a share, and the sharer on arrival", async () => {
    const { asks, sent } = harness();
    const asked = await asks.ask(principal("usr_guest", "guest"), 430);
    if (!asked.ok) throw new Error("refused");
    await settle();
    expect(sent.map((push) => push.to)).toEqual(["ExponentPushToken[usr_owner]"]);
    expect(sent[0]).toMatchObject({
      ...DIRECT_PUSH_WORDS.asked,
      data: { direct_ask_id: asked.value.id },
    });

    const shared = await asks.share(principal("usr_owner", "owner"), {
      id: asked.value.id,
      link: "https://login.tailscale.com/admin/invite/x",
      keep: true,
    });
    expect(shared.ok).toBe(true);
    await settle();
    expect(sent[1]).toMatchObject({
      to: "ExponentPushToken[usr_guest]",
      ...DIRECT_PUSH_WORDS.shared,
      data: { direct_shared: asked.value.id },
    });

    await asks.arrived(principal("usr_guest", "guest"), "relay");
    await settle();
    expect(sent).toHaveLength(2);
    await asks.arrived(principal("usr_guest", "guest"), "socket");
    await settle();
    expect(sent[2]).toMatchObject({
      to: "ExponentPushToken[usr_owner]",
      ...DIRECT_PUSH_WORDS.direct,
    });
    // Nothing a push carries names anybody.
    for (const push of sent) expect(`${push.title} ${push.body}`).not.toMatch(/usr_|guest_/);
  });

  it("lets an admin ask but not answer, since the machine is an owner's", async () => {
    const { asks } = harness();
    const asked = await asks.ask(principal("usr_admin", "admin"), undefined);
    if (!asked.ok) throw new Error("refused");
    const answered = await asks.share(principal("usr_admin", "admin"), {
      id: asked.value.id,
      link: "https://login.tailscale.com/x",
      keep: false,
    });
    expect(answered).toMatchObject({ ok: false, error: { kind: "not_allowed" } });
  });
});
