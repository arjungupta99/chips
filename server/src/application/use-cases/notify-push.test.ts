/**
 * Pushing a decision to the phones that may answer it (M4.3, ADR 0045), against fakes.
 *
 * The cases are the ones the milestone names: one person with two phones hears once; a desktop
 * that claimed first leaves the phone quiet; quiet hours are read where each phone is; a
 * harness set to `none` is silent; a guest is never told; a harness named as an approver is
 * dropped; a policy auto-decision tells nobody. And, throughout: what is sent carries ids and
 * no words.
 */

import { createLogger } from "@chipschat/platform";
import type { NotificationSettings } from "@chipschat/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoredEvent } from "../ports/event-store.js";
import type { ClaimRequest } from "../ports/notifications.js";
import type {
  PushMessage,
  PushReadiness,
  PushRegistry,
  PushTicket,
  PushToken,
} from "../ports/push.js";
import type { ApprovalView, MemberView, RunView } from "../ports/read-models.js";
import { createNotifyPush, type NotifyPushDeps } from "./notify-push.js";

const WS = "ws_01K4ZQPX00000000000000000W";
const SPACE = "spc_01K4ZQPX000000000000000001";
const RUN = "run_01K4ZQPX000000000000000002";
const ASK = "apr_01K4ZQPX000000000000000003";
const ARJUN = "usr_01K4ZQPX000000000000000004";
const DANA = "usr_01K4ZQPX000000000000000005";
const GUEST = "usr_01K4ZQPX000000000000000006";
const SCOUT = "hrn_01K4ZQPX000000000000000007";
const LEDGER = "hrn_01K4ZQPX000000000000000008";

const NOW = "2026-09-08T12:00:00.000Z";

function member(id: string, over: Partial<MemberView> = {}): MemberView {
  return {
    participant_id: id,
    kind: "person",
    display_name: id,
    role: "member",
    owner_id: null,
    workspace_role: "member",
    ...over,
  };
}

const ROOM: MemberView[] = [
  member(ARJUN, { workspace_role: "owner" }),
  member(DANA),
  member(GUEST, { workspace_role: "guest" }),
  member(SCOUT, { kind: "harness", workspace_role: null }),
];

function approval(over: Partial<ApprovalView> = {}): ApprovalView {
  return {
    approval_id: ASK,
    run_id: RUN,
    space_id: SPACE,
    action: { kind: "payment.transfer", money_usd: 400 },
    state: "pending",
    decision: null,
    scope: null,
    reason: null,
    resolved_by: null,
    resolved_at: null,
    updated_input: null,
    expires_at: "2026-09-08T12:30:00.000Z",
    fallback: "deny",
    executed_outcome: null,
    approvers: [],
    ...over,
  };
}

function request(over: Partial<StoredEvent> = {}): StoredEvent {
  return {
    seq: 1,
    workspace_id: WS,
    id: "evt_01K4ZQPX000000000000000009",
    type: "approval.request",
    ts: NOW,
    space_id: SPACE,
    run_id: RUN,
    actor: { kind: "harness", id: SCOUT },
    idempotency_key: null,
    payload: { approval_id: ASK, action: { kind: "payment.transfer" }, preview: "Pay Northwind" },
    ...over,
  };
}

function phone(participantId: string, over: Partial<PushToken> = {}): PushToken {
  return {
    deviceId: `dev_${participantId.slice(-2)}`,
    participantId,
    token: `ExponentPushToken[${participantId.slice(-2)}]`,
    platform: "ios",
    timeZone: "Europe/London",
    ...over,
  };
}

interface Rig {
  readonly deps: NotifyPushDeps;
  readonly sent: PushMessage[][];
  readonly claims: ClaimRequest[];
  readonly removed: string[];
  /** Keys already held by somebody: a desktop that got there first. */
  readonly taken: Set<string>;
}

function rig(
  over: {
    /** `null` stands for an ask the read model cannot find; absent is the ordinary one. */
    approval?: ApprovalView | null | undefined;
    members?: MemberView[];
    phones?: PushToken[];
    settings?: Record<string, NotificationSettings>;
    tickets?: PushTicket[];
    taken?: string[];
    /** Made to fail, for the case where the push service falls over mid-call. */
    send?: () => never;
    readiness?: PushReadiness;
  } = {},
): Rig {
  const sent: PushMessage[][] = [];
  const claims: ClaimRequest[] = [];
  const removed: string[] = [];
  const taken = new Set(over.taken ?? []);
  const phones = over.phones ?? [];

  const push: PushRegistry = {
    register: async () => undefined,
    remove: async (deviceId) => {
      removed.push(deviceId);
    },
    pruneRevoked: async () => 0,
    forPeople: async (_workspaceId, ids) => phones.filter((one) => ids.includes(one.participantId)),
    zonesOf: async () => new Map(),
  };

  const deps: NotifyPushDeps = {
    readModels: {
      approval: async () => (over.approval === null ? undefined : (over.approval ?? approval())),
      membersOf: async () => over.members ?? ROOM,
      run: async () => ({ run_id: RUN, space_id: SPACE, harness_id: SCOUT }) as unknown as RunView,
    },
    notifications: {
      settings: async (_workspaceId, participantId) => over.settings?.[participantId],
      claim: async (request_) => {
        claims.push(request_);
        const granted = request_.keys.filter(
          (key) => !taken.has(`${request_.participantId}:${key}`),
        );
        for (const key of granted) taken.add(`${request_.participantId}:${key}`);
        return granted;
      },
    },
    push,
    sender: {
      send: async (messages) => {
        over.send?.();
        sent.push([...messages]);
        return over.tickets ?? messages.map(() => ({ ok: true }));
      },
      readiness: () => over.readiness ?? "ready",
    },
    clock: { nowIso: () => NOW, nowMs: () => Date.parse(NOW), now: () => new Date(NOW) },
    logger: createLogger({ level: "silent" }),
  };
  return { deps, sent, claims, removed, taken };
}

let harness: Rig;

beforeEach(() => {
  harness = rig();
});

describe("what a push carries", () => {
  it("is the ask's ids, the phone's device and two fixed words, and nothing about the ask", async () => {
    const test = rig({ phones: [phone(ARJUN)] });
    await createNotifyPush(test.deps).after(request(), undefined);

    expect(test.sent).toHaveLength(1);
    const [message] = test.sent[0] ?? [];
    expect(message).toEqual({
      to: "ExponentPushToken[04]",
      title: "A decision is waiting",
      body: "Approve or deny from here.",
      categoryId: "decision",
      priority: "high",
      ttl: 1800,
      // The device: which of the phone's workspaces answers it (ADR 0197).
      data: { device_id: "dev_04", approval_id: ASK, space_id: SPACE, run_id: RUN },
    });

    // The words of the ask are nowhere in what left the building.
    const wire = JSON.stringify(test.sent);
    for (const word of ["payment.transfer", "Northwind", SCOUT, "Scout", "preview"]) {
      expect(wire).not.toContain(word);
    }
  });

  it("lives no longer than the ask does, and at least a minute", async () => {
    const soon = rig({
      phones: [phone(ARJUN)],
      approval: approval({ expires_at: "2026-09-08T12:00:10.000Z" }),
    });
    await createNotifyPush(soon.deps).after(request(), undefined);
    expect(soon.sent[0]?.[0]?.ttl).toBe(60);

    const far = rig({ phones: [phone(ARJUN)], approval: approval({ expires_at: null }) });
    await createNotifyPush(far.deps).after(request(), undefined);
    expect(far.sent[0]?.[0]?.ttl).toBe(3600);
  });
});

describe("who is pushed to", () => {
  it("tells one person on one phone, even with two registered", async () => {
    const two = rig({
      phones: [
        phone(ARJUN, { deviceId: "dev_a", token: "one" }),
        phone(ARJUN, { deviceId: "dev_b", token: "two" }),
      ],
    });
    await createNotifyPush(two.deps).after(request(), undefined);

    expect(two.claims).toHaveLength(2);
    expect(two.sent[0]?.map((message) => message.to)).toEqual(["one"]);
  });

  it("tells nobody when a desktop claimed the key first", async () => {
    const claimed = rig({
      phones: [phone(ARJUN)],
      taken: [`${ARJUN}:decision:${ASK}`],
    });
    await createNotifyPush(claimed.deps).after(request(), undefined);
    expect(claimed.sent).toEqual([]);
  });

  it("tells everyone who may answer, in one batch", async () => {
    const both = rig({ phones: [phone(ARJUN), phone(DANA)] });
    await createNotifyPush(both.deps).after(request(), undefined);
    expect(both.sent).toHaveLength(1);
    expect(both.sent[0]).toHaveLength(2);
  });

  it("never tells a guest of the room when the ask named the room", async () => {
    const guest = rig({ phones: [phone(GUEST)] });
    await createNotifyPush(guest.deps).after(request(), undefined);
    expect(guest.sent).toEqual([]);
  });

  it("tells a guest the ask named outright", async () => {
    const named = rig({
      phones: [phone(GUEST)],
      approval: approval({ approvers: [GUEST] }),
    });
    await createNotifyPush(named.deps).after(request(), undefined);
    expect(named.sent[0]).toHaveLength(1);
  });

  it("drops a harness the ask named: there is no phone to tell", async () => {
    const withHarness = rig({
      phones: [phone(ARJUN)],
      approval: approval({ approvers: [LEDGER] }),
    });
    await createNotifyPush(withHarness.deps).after(request(), undefined);
    expect(withHarness.sent).toEqual([]);
  });

  it("says nothing at all when nobody registered a phone", async () => {
    await createNotifyPush(harness.deps).after(request(), undefined);
    expect(harness.sent).toEqual([]);
    expect(harness.claims).toEqual([]);
  });
});

describe("what a person asked for", () => {
  const quiet = (breakthrough: "decide" | "none"): NotificationSettings => ({
    decide: "now",
    review: "hourly",
    fyi: "daily",
    quiet: { from: "22:00", to: "07:00", breakthrough },
    harnesses: {},
  });

  it("holds a phone where it is the middle of the night, and tells the one where it is not", async () => {
    // Noon UTC: 17:30 in Kolkata, 05:00 in Los Angeles — inside 22:00–07:00 for the second.
    const night = rig({
      phones: [
        phone(ARJUN, { deviceId: "kolkata", token: "kolkata", timeZone: "Asia/Kolkata" }),
        phone(DANA, { deviceId: "la", token: "la", timeZone: "America/Los_Angeles" }),
      ],
      settings: { [ARJUN]: quiet("none"), [DANA]: quiet("none") },
    });
    await createNotifyPush(night.deps).after(request(), undefined);
    expect(night.sent[0]?.map((message) => message.to)).toEqual(["kolkata"]);
  });

  it("lets a decision through quiet hours when the person said it may", async () => {
    const through = rig({
      phones: [phone(DANA, { token: "la", timeZone: "America/Los_Angeles" })],
      settings: { [DANA]: quiet("decide") },
    });
    await createNotifyPush(through.deps).after(request(), undefined);
    expect(through.sent[0]?.map((message) => message.to)).toEqual(["la"]);
  });

  it("says nothing to somebody who silenced this harness", async () => {
    const silenced = rig({
      phones: [phone(ARJUN)],
      settings: {
        [ARJUN]: { decide: "now", review: "hourly", fyi: "daily", harnesses: { [SCOUT]: "none" } },
      },
    });
    await createNotifyPush(silenced.deps).after(request(), undefined);
    expect(silenced.sent).toEqual([]);
  });
});

describe("when there is nothing to say", () => {
  it("says nothing about an event that is not an ask", async () => {
    const other = rig({ phones: [phone(ARJUN)] });
    await createNotifyPush(other.deps).after(request({ type: "message.new" }), undefined);
    expect(other.sent).toEqual([]);
  });

  it("says nothing when a policy rule already answered it", async () => {
    const decided = rig({ phones: [phone(ARJUN)] });
    const resolution = request({ type: "approval.resolved" });
    await createNotifyPush(decided.deps).after(request(), resolution);
    expect(decided.sent).toEqual([]);
  });

  it("says nothing about an ask that is already resolved", async () => {
    const done = rig({ phones: [phone(ARJUN)], approval: approval({ state: "resolved" }) });
    await createNotifyPush(done.deps).after(request(), undefined);
    expect(done.sent).toEqual([]);
  });

  it("says nothing about an ask it cannot find", async () => {
    const missing = rig({ phones: [phone(ARJUN)], approval: null });
    await createNotifyPush(missing.deps).after(request(), undefined);
    expect(missing.sent).toEqual([]);
  });
});

describe("when a push cannot go (ADR 0244)", () => {
  it.each(["no_access_token", "refused"] as const)(
    "claims nothing, so the computer raises the banner, and sends nothing: %s",
    async (readiness) => {
      const test = rig({ phones: [phone(ARJUN)], readiness });
      await createNotifyPush(test.deps).after(request(), undefined);
      expect(test.claims).toEqual([]);
      expect(test.sent).toEqual([]);
    },
  );
});

describe("afterwards", () => {
  it("forgets a token the push service says is dead", async () => {
    const dead = rig({
      phones: [phone(ARJUN, { deviceId: "gone" }), phone(DANA, { deviceId: "alive" })],
      tickets: [{ ok: false, error: "DeviceNotRegistered" }, { ok: true }],
    });
    await createNotifyPush(dead.deps).after(request(), undefined);
    expect(dead.removed).toEqual(["gone"]);
  });

  it("swallows whatever goes wrong: an append does not fail over a push", async () => {
    const broken = rig({
      phones: [phone(ARJUN)],
      send: () => {
        throw new Error("the push service fell over");
      },
    });
    await expect(
      createNotifyPush(broken.deps).after(request(), undefined),
    ).resolves.toBeUndefined();
  });
});
