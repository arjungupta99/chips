/**
 * Invites (ADR 0034), against fakes: who may make one and for which role, what a link says
 * before anyone has a name here, and what redeeming it does — a person with the invite's role,
 * a paired device, and a single-use invite spent once and only once.
 */

import { manualClock } from "@chipschat/platform";
import { createIdGenerator } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import type { Principal } from "../ports/identity.js";
import type { ParticipantView, ReadModels } from "../ports/index.js";
import type { InviteRegistry, InviteView, NewInvite } from "../ports/invites.js";
import { createInvites, DEFAULT_INVITE_TTL_SECONDS } from "./invites.js";
import type { JoinWorkspaceInput } from "./join-workspace.js";

const WS = "ws_01K4ZQPX000000000000000001";
const ARJUN: Principal = {
  kind: "person",
  participantId: "usr_01K4ZQPX000000000000000003",
  workspaceId: WS,
  displayName: "Arjun",
  via: "device_key",
  role: "owner",
};
const KEY = "MCowBQYDK2VwAyEAr3z7c4a2j8mPqZ0y1xW9n4kL2vB6dF8hJ0sT5uY7wE0=";

/** Somebody already here, as the directory lists them. */
function here(id: string, name: string, extra: Partial<ParticipantView> = {}): ParticipantView {
  return {
    id,
    kind: "person",
    display_name: name,
    role: "member",
    removed_at: null,
    ...extra,
  } as ParticipantView;
}

const PEOPLE = [here(ARJUN.participantId, "Arjun", { role: "owner" })];

/** A room, as the read models would have it. */
interface Room {
  title: string;
  state: "open" | "closed";
  kind?: string;
  parent?: string | null;
}

/** What a link that asks hands the join requests (ADR 0232), kept to be looked at. */
type Waited = Parameters<NonNullable<Parameters<typeof createInvites>[0]["wait"]>>[0];

function harness(people: readonly ParticipantView[] = PEOPLE) {
  const waited: Waited[] = [];
  const invites: (NewInvite & { uses: number; revokedAt: string | null })[] = [];
  const devices: Record<string, unknown>[] = [];
  const appended: Record<string, unknown>[] = [];
  const rooms = new Map<string, Room>();
  /** `space participant` pairs. */
  const members = new Set<string>();
  const joined: JoinWorkspaceInput[] = [];
  const clock = manualClock(1_757_100_000_000);
  const view = (row: (typeof invites)[number]): InviteView => ({
    id: row.id,
    workspaceId: row.workspaceId,
    role: row.role,
    singleUse: row.singleUse,
    uses: row.uses,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    spaceId: row.spaceId ?? null,
    asks: row.asks,
  });
  const registry: InviteRegistry = {
    async addInvite(invite) {
      invites.push({ ...invite, uses: 0, revokedAt: null });
    },
    async inviteByHash(hash) {
      const row = invites.find((each) => each.tokenHash === hash);
      return row === undefined ? undefined : view(row);
    },
    async invite(workspaceId, inviteId) {
      const row = invites.find((each) => each.workspaceId === workspaceId && each.id === inviteId);
      return row === undefined ? undefined : view(row);
    },
    async invitesIn(workspaceId) {
      return invites.filter((each) => each.workspaceId === workspaceId).map(view);
    },
    async revokeInvite({ inviteId, at }) {
      const row = invites.find((each) => each.id === inviteId && each.revokedAt === null);
      if (row === undefined) return false;
      row.revokedAt = at;
      return true;
    },
    async noteUse({ inviteId, singleUse }) {
      const row = invites.find((each) => each.id === inviteId && each.revokedAt === null);
      if (row === undefined || (singleUse && row.uses > 0)) return false;
      row.uses += 1;
      return true;
    },
  };
  let minted = 0;
  const ids = createIdGenerator({ now: () => clock.nowMs(), randomFill: (b) => b.fill(3) });
  const use = createInvites({
    registry,
    devices: {
      participant: async () => undefined,
      deviceByPublicKey: async (_ws, key) =>
        devices.some((each) => each["publicKey"] === key)
          ? { deviceId: "dev_x", participantId: "usr_x" }
          : undefined,
      addDevice: async (device) => {
        devices.push(device);
      },
      device: async () => undefined,
      devicesOf: async () => [],
      revokeDevice: async () => false,
    },
    join: async (input) => {
      joined.push(input);
      return {
        ok: true,
        value: {
          participantId: `usr_01K4ZQPX00000000000000000${joined.length}`,
          displayName: input.displayName.trim(),
          role: input.role ?? "member",
          joinedAt: clock.nowIso(),
        },
      };
    },
    readModels: {
      workspace: async () => ({ workspace_id: WS, name: "Northwind" }),
      participant: async (_ws, id) => people.find((each) => each.id === id),
      participantsIn: async () => [...people],
      space: async (_ws, spaceId) => {
        const room = rooms.get(spaceId);
        if (room === undefined) return undefined;
        return {
          space_id: spaceId,
          kind: room.kind ?? "group",
          title: room.title,
          state: room.state,
          parent_space_id: room.parent ?? null,
        } as Awaited<ReturnType<ReadModels["space"]>>;
      },
      isMember: async (_ws, spaceId, who) => members.has(`${spaceId} ${who}`),
      spaceCountFor: async (_ws, who) =>
        [...members].filter(
          (each) =>
            each.endsWith(` ${who}`) &&
            rooms.get(each.slice(0, each.indexOf(" ")))?.state !== "closed",
        ).length,
    },
    store: {
      append: async (event) => {
        appended.push(event);
        const id = String(event["participant_id"]);
        members.add(`${String(event["space_id"])} ${id}`);
        return { event: { ...event, seq: appended.length }, duplicate: false } as never;
      },
    },
    clock,
    ids,
    mint: () => {
      minted += 1;
      return { token: `chips_inv_${minted}`, hash: `hash-${minted}` };
    },
    hash: (token) => token.replace("chips_inv_", "hash-"),
    wait: async (ask) => {
      waited.push(ask);
      return {
        ok: true,
        value: { requestId: "join_1", secret: "s", code: "742913", interval: 3, expiresIn: 600 },
      };
    },
  });
  return { use, invites, devices, joined, clock, appended, rooms, members, waited };
}

describe("making an invite", () => {
  it("is an owner's, for 30 minutes and once unless said otherwise, and the token is shown once", async () => {
    const { use, invites, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "member" });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.value).toMatchObject({
      workspaceId: WS,
      role: "member",
      singleUse: true,
      uses: 0,
      createdBy: ARJUN.participantId,
      token: "chips_inv_1",
      expiresAt: new Date(clock.nowMs() + DEFAULT_INVITE_TTL_SECONDS * 1000).toISOString(),
    });
    expect(issued.value.id).toMatch(/^inv_/);
    // The registry holds the digest, never the token.
    expect(invites[0]?.tokenHash).toBe("hash-1");
    expect(JSON.stringify(invites)).not.toContain("chips_inv_1");

    expect(DEFAULT_INVITE_TTL_SECONDS).toBe(1800);

    const open = await use.create({
      principal: ARJUN,
      role: "guest",
      singleUse: false,
      expiresInSeconds: 600,
    });
    expect(open.ok && open.value.singleUse).toBe(false);
    expect(open.ok && open.value.expiresAt).toBe(new Date(clock.nowMs() + 600_000).toISOString());
  });

  it("is an owner's alone, for any role: an admin invites nobody", async () => {
    const { use } = harness();
    expect((await use.create({ principal: ARJUN, role: "owner" })).ok).toBe(true);
    const admin: Principal = { ...ARJUN, role: "admin" };
    const byAdmin = await use.create({ principal: admin, role: "member" });
    expect(byAdmin.ok).toBe(false);
    if (!byAdmin.ok) {
      expect(byAdmin.error).toEqual({
        kind: "not_allowed",
        message: "Only an owner of the workspace invites people.",
      });
    }
    expect((await use.list(admin)).ok).toBe(false);
    for (const role of ["member", "guest"] as const) {
      const refused = await use.create({ principal: { ...ARJUN, role }, role: "guest" });
      expect(refused.ok).toBe(false);
    }
    const harnessCall: Principal = {
      ...ARJUN,
      kind: "harness",
      role: undefined,
      via: "harness_token",
    };
    expect((await use.create({ principal: harnessCall, role: "guest" })).ok).toBe(false);
  });

  it("lasts between a minute and 30 minutes (ADR 0232)", async () => {
    const { use } = harness();
    for (const ttl of [0, 59, 1801, 7 * 24 * 3600, 1.5]) {
      const refused = await use.create({ principal: ARJUN, role: "member", expiresInSeconds: ttl });
      expect(refused.ok, String(ttl)).toBe(false);
    }
  });
});

describe("a link's 30 minutes (ADR 0232)", () => {
  it("is refused once 30 minutes have gone", async () => {
    const { use, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest" });
    if (!issued.ok) throw new Error("not issued");
    clock.advance(29 * 60_000);
    expect((await use.peek(issued.value.token)).ok).toBe(true);
    clock.advance(60_000);
    const late = await use.peek(issued.value.token);
    expect(late.ok === false && late.error.kind).toBe("expired");
  });

  it("stops a link made to last a week before the limit, counted from when it was made", async () => {
    const { use, invites, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest" });
    if (!issued.ok) throw new Error("not issued");
    // As a link made before this build was kept: good for a week.
    const kept = invites[0];
    if (kept === undefined) throw new Error("not kept");
    invites[0] = { ...kept, expiresAt: new Date(clock.nowMs() + 7 * 24 * 3_600_000).toISOString() };
    clock.advance(31 * 60_000);
    const redeemed = await use.redeem({
      token: issued.value.token,
      displayName: "Priya",
      publicKey: KEY,
      deviceName: "Priya's iPhone",
    });
    expect(redeemed.ok === false && redeemed.error.kind).toBe("expired");
  });
});

describe("a link that asks (ADR 0232)", () => {
  it("waits for its maker, with nobody made, no device paired and the link not spent", async () => {
    const { use, invites, devices, joined, waited, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest", asks: true });
    if (!issued.ok) throw new Error("not issued");
    const answer = { displayName: " Priya ", publicKey: KEY, deviceName: "Priya's iPhone" };
    const redeemed = await use.redeem({ token: issued.value.token, ...answer });
    expect(redeemed.ok && redeemed.value).toEqual({
      waiting: { requestId: "join_1", secret: "s", code: "742913", interval: 3, expiresIn: 600 },
    });
    expect(waited).toEqual([
      {
        workspaceId: WS,
        askedOf: ARJUN.participantId,
        name: "Priya",
        machine: "Priya's iPhone",
        publicKey: KEY,
        inviteId: issued.value.id,
        role: "guest",
        spaceId: null,
      },
    ]);
    expect(joined).toEqual([]);
    expect(devices).toEqual([]);
    expect(invites[0]?.uses).toBe(0);

    // Collected once allowed: what redeeming did, done now, and the link spent.
    const askedAt = new Date(clock.nowMs()).toISOString();
    const collect = () =>
      use.collect({ workspaceId: WS, inviteId: issued.value.id, answer, askedAt });
    const collected = await collect();
    expect(collected.ok && collected.value).toMatchObject({ displayName: "Priya", role: "guest" });
    expect(invites[0]?.uses).toBe(1);
    const again = await collect();
    expect(again.ok === false && again.error.kind).toBe("spent");
  });

  it("lets in one its maker allowed after the link's 30 minutes, opened before them", async () => {
    const { use, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest", asks: true });
    if (!issued.ok) throw new Error("not issued");
    const answer = { displayName: "Priya", publicKey: KEY, deviceName: "Priya's iPhone" };
    // Opened at its 25th minute, and allowed at its 31st.
    clock.advance(25 * 60 * 1000);
    expect((await use.redeem({ token: issued.value.token, ...answer })).ok).toBe(true);
    const askedAt = new Date(clock.nowMs()).toISOString();
    clock.advance(6 * 60 * 1000);
    const collected = await use.collect({
      workspaceId: WS,
      inviteId: issued.value.id,
      answer,
      askedAt,
    });
    expect(collected.ok).toBe(true);
    // Opened after them, it is out, however its request came to be.
    const issuedAgain = await use.create({ principal: ARJUN, role: "guest", asks: true });
    if (!issuedAgain.ok) throw new Error("not issued");
    clock.advance(31 * 60 * 1000);
    const tooLate = await use.collect({
      workspaceId: WS,
      inviteId: issuedAgain.value.id,
      answer,
      askedAt: new Date(clock.nowMs()).toISOString(),
    });
    expect(tooLate.ok === false && tooLate.error.kind).toBe("expired");
  });

  it("judges its life no later than now, whatever time the request says it was asked", async () => {
    const { use, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest", asks: true });
    if (!issued.ok) throw new Error("not issued");
    const answer = { displayName: "Priya", publicKey: KEY, deviceName: "Priya's iPhone" };
    expect((await use.redeem({ token: issued.value.token, ...answer })).ok).toBe(true);
    // A dev server's join clock run ahead by a test of request expiry: the invite is judged as
    // it is now, not at the forty minutes on that its request's time says.
    const ahead = await use.collect({
      workspaceId: WS,
      inviteId: issued.value.id,
      answer,
      askedAt: new Date(clock.nowMs() + 40 * 60 * 1000).toISOString(),
    });
    expect(ahead.ok).toBe(true);
  });

  it("refuses a wrong answer before anything waits", async () => {
    const { use, waited } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest", asks: true });
    if (!issued.ok) throw new Error("not issued");
    const refused = await use.redeem({
      token: issued.value.token,
      displayName: "Arjun",
      publicKey: KEY,
      deviceName: "A phone",
    });
    expect(refused.ok === false && refused.error.kind).toBe("taken");
    expect(waited).toEqual([]);
  });
});

describe("a link, before anyone has a name here", () => {
  it("says which workspace and which role, and nothing for a token that is not one", async () => {
    const { use } = harness();
    const issued = await use.create({ principal: ARJUN, role: "guest" });
    if (!issued.ok) throw new Error("not issued");
    const peeked = await use.peek(issued.value.token);
    expect(peeked.ok && peeked.value).toEqual({
      inviteId: issued.value.id,
      workspaceId: WS,
      workspaceName: "Northwind",
      role: "guest",
      singleUse: true,
      expiresAt: issued.value.expiresAt,
      // Who sent it, so the card can say so (JR-13).
      invitedByName: "Arjun",
      // A link to the workspace alone (ADR 0168).
      spaceId: null,
      spaceName: null,
    });
    const wrong = await use.peek("chips_inv_nope");
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.error.kind).toBe("unknown_invite");
  });

  it("names nobody for a maker still called what the server first called them (JR-17)", async () => {
    const { use } = harness([here(ARJUN.participantId, "You", { role: "owner" })]);
    const issued = await use.create({ principal: ARJUN, role: "member" });
    if (!issued.ok) throw new Error("not issued");
    const peeked = await use.peek(issued.value.token);
    expect(peeked.ok && peeked.value.invitedByName).toBeNull();
  });

  it("is no good once expired or withdrawn", async () => {
    const { use, clock } = harness();
    const issued = await use.create({ principal: ARJUN, role: "member", expiresInSeconds: 60 });
    if (!issued.ok) throw new Error("not issued");
    clock.advance(61_000);
    const late = await use.peek(issued.value.token);
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.kind).toBe("expired");

    const again = await use.create({ principal: ARJUN, role: "member" });
    if (!again.ok) throw new Error("not issued");
    expect((await use.revoke({ principal: ARJUN, inviteId: again.value.id })).ok).toBe(true);
    const gone = await use.peek(again.value.token);
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.kind).toBe("revoked");
    // Withdrawing it twice, or something that is not an invite here, changes nothing.
    expect((await use.revoke({ principal: ARJUN, inviteId: again.value.id })).ok).toBe(false);
  });

  it("is withdrawn once its maker is an owner no longer, as when they are removed", async () => {
    const people = [here(ARJUN.participantId, "Arjun", { role: "owner" })];
    const { use, invites } = harness(people);
    const issued = await use.create({ principal: ARJUN, role: "member" });
    if (!issued.ok) throw new Error("not issued");
    expect((await use.peek(issued.value.token)).ok).toBe(true);

    // Another owner makes Arjun a member: the link Arjun handed out stops.
    people[0] = here(ARJUN.participantId, "Arjun", { role: "member" });
    expect(await use.peek(issued.value.token)).toMatchObject({
      ok: false,
      error: { kind: "revoked", message: "That invite was withdrawn." },
    });
    expect(
      await use.redeem({
        token: issued.value.token,
        displayName: "Sam",
        publicKey: KEY,
        deviceName: "a",
      }),
    ).toMatchObject({ ok: false, error: { kind: "revoked" } });
    // Withdrawn for good, so making Arjun an owner again does not bring it back.
    expect(invites[0]?.revokedAt).not.toBeNull();
    people[0] = here(ARJUN.participantId, "Arjun", { role: "owner" });
    expect((await use.peek(issued.value.token)).ok).toBe(false);
  });
});

describe("redeeming", () => {
  it("joins the person with the invite's role, naming the invite, and pairs the device", async () => {
    const { use, joined, devices } = harness();
    const issued = await use.create({ principal: ARJUN, role: "admin" });
    if (!issued.ok) throw new Error("not issued");

    const redeemed = await use.redeem({
      token: issued.value.token,
      displayName: "Dana",
      publicKey: KEY,
      deviceName: "Dana's phone",
    });
    expect(redeemed.ok, JSON.stringify(redeemed)).toBe(true);
    if (!redeemed.ok || "waiting" in redeemed.value) return;
    expect(redeemed.value).toMatchObject({
      workspaceId: WS,
      workspaceName: "Northwind",
      displayName: "Dana",
      role: "admin",
    });
    expect(redeemed.value.deviceId).toMatch(/^dev_/);
    expect(joined).toEqual([
      {
        workspaceId: WS,
        displayName: "Dana",
        role: "admin",
        invite: { inviteId: issued.value.id, invitedBy: ARJUN.participantId },
      },
    ]);
    expect(devices).toEqual([
      expect.objectContaining({
        deviceId: redeemed.value.deviceId,
        participantId: redeemed.value.participantId,
        publicKey: KEY,
        name: "Dana's phone",
      }),
    ]);
  });

  it("lets exactly one of two people who open a single-use link at once in", async () => {
    const { use, joined } = harness();
    const once = await use.create({ principal: ARJUN, role: "member" });
    if (!once.ok) throw new Error("not issued");
    const answers = await Promise.all([
      use.redeem({ token: once.value.token, displayName: "Dana", publicKey: KEY, deviceName: "a" }),
      use.redeem({
        token: once.value.token,
        displayName: "Priya",
        publicKey: KEY.replace("r3z7", "s4a8"),
        deviceName: "b",
      }),
    ]);
    expect(answers.filter((each) => each.ok)).toHaveLength(1);
    const lost = answers.find((each) => !each.ok);
    expect(lost?.ok === false && lost.error.kind).toBe("spent");
    expect(joined).toHaveLength(1);
  });

  it("joins nobody by a link once it is withdrawn or expired", async () => {
    const { use, clock, joined } = harness();
    const withdrawn = await use.create({ principal: ARJUN, role: "member" });
    if (!withdrawn.ok) throw new Error("not issued");
    await use.revoke({ principal: ARJUN, inviteId: withdrawn.value.id });
    const tooLate = await use.create({ principal: ARJUN, role: "member", expiresInSeconds: 60 });
    if (!tooLate.ok) throw new Error("not issued");
    clock.advance(61_000);
    for (const [token, kind] of [
      [withdrawn.value.token, "revoked"],
      [tooLate.value.token, "expired"],
    ] as const) {
      const redeemed = await use.redeem({
        token,
        displayName: "Dana",
        publicKey: KEY,
        deviceName: "a",
      });
      expect(redeemed.ok === false && redeemed.error.kind).toBe(kind);
    }
    expect(joined).toEqual([]);
  });

  it("spends a single-use invite once, and an open one never", async () => {
    const { use } = harness();
    const once = await use.create({ principal: ARJUN, role: "member" });
    if (!once.ok) throw new Error("not issued");
    const first = await use.redeem({
      token: once.value.token,
      displayName: "Dana",
      publicKey: KEY,
      deviceName: "a",
    });
    expect(first.ok).toBe(true);
    const second = await use.redeem({
      token: once.value.token,
      displayName: "Priya",
      publicKey: KEY.replace("r3z7", "s4a8"),
      deviceName: "b",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe("spent");
    const listed = await use.list(ARJUN);
    expect(listed.ok && listed.value[0]?.uses).toBe(1);

    const open = await use.create({ principal: ARJUN, role: "guest", singleUse: false });
    if (!open.ok) throw new Error("not issued");
    for (const [name, key] of [
      ["Vendor one", KEY.replace("r3z7", "t5b9")],
      ["Vendor two", KEY.replace("r3z7", "u6c0")],
    ]) {
      const each = await use.redeem({
        token: open.value.token,
        displayName: name ?? "",
        publicKey: key ?? "",
        deviceName: "c",
      });
      expect(each.ok, name).toBe(true);
    }
  });

  it("refuses a name that is nothing before a single-use invite is spent (Gate 5)", async () => {
    const { use, joined } = harness();
    const issued = await use.create({ principal: ARJUN, role: "member" });
    if (!issued.ok) throw new Error("not issued");
    const blank = await use.redeem({
      token: issued.value.token,
      displayName: "   ",
      publicKey: KEY,
      deviceName: "a",
    });
    expect(blank).toMatchObject({ ok: false, error: { kind: "invalid" } });
    expect(joined).toHaveLength(0);
    const named = await use.redeem({
      token: issued.value.token,
      displayName: "Sam",
      publicKey: KEY,
      deviceName: "a",
    });
    expect(named.ok, JSON.stringify(named)).toBe(true);
    expect(joined.map((each) => each.displayName)).toEqual(["Sam"]);
  });

  it("refuses a name somebody here has, in any case, before the link is spent (JR-1)", async () => {
    const { use, joined, invites } = harness([
      ...PEOPLE,
      here("usr_01K4ZQPX000000000000000009", "Priya Nair"),
      here("usr_01K4ZQPX000000000000000008", "Gone Person", { removed_at: "2026-10-01T00:00:00Z" }),
      here("hrn_01K4ZQPX000000000000000007", "Scout", { kind: "harness" }),
    ]);
    const issued = await use.create({ principal: ARJUN, role: "member" });
    if (!issued.ok) throw new Error("not issued");
    const answer = (displayName: string) =>
      use.redeem({ token: issued.value.token, displayName, publicKey: KEY, deviceName: "a" });

    expect(await answer("  priya   NAIR ")).toEqual({
      ok: false,
      error: {
        kind: "taken",
        // A person's name says the way back for somebody whose phone is new (ADR 0206).
        message:
          "Somebody here goes by Priya Nair already. If that's you on a new phone, ask Arjun to choose Pair a new phone on your page in People.",
      },
    });
    // A harness's name too: a person called Scout would take the @ that reaches Scout.
    expect(await answer("scout")).toMatchObject({
      ok: false,
      error: { message: "An agent here goes by Scout already." },
    });
    expect(joined).toHaveLength(0);
    expect(invites[0]?.uses).toBe(0);
    // Somebody removed holds their name no longer.
    expect((await answer("Gone Person")).ok).toBe(true);
    expect(joined.map((each) => each.displayName)).toEqual(["Gone Person"]);
  });

  it("refuses a name that passes for another before the link is spent (SEC-33)", async () => {
    const { use, joined, invites } = harness([
      ...PEOPLE,
      here("usr_01K4ZQPX000000000000000009", "Priya Nair"),
    ]);
    const issued = await use.create({ principal: ARJUN, role: "member" });
    if (!issued.ok) throw new Error("not issued");
    const answer = (displayName: string) =>
      use.redeem({ token: issued.value.token, displayName, publicKey: KEY, deviceName: "a" });
    expect(await answer("Priya\u200b Nair")).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: expect.stringMatching(/^A name can't have hidden/) },
    });
    expect(await answer("\u0420riya Nair")).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: expect.stringMatching(/^A name can't mix/) },
    });
    // Priya Nair in full-width letters reads as Priya Nair.
    expect(await answer("\uff30riya Nair")).toMatchObject({ ok: false, error: { kind: "taken" } });
    expect(joined).toHaveLength(0);
    expect(invites[0]?.uses).toBe(0);
  });

  it("refuses a key that is not one, a device paired already, and a name that is nothing", async () => {
    const { use } = harness();
    const issued = await use.create({ principal: ARJUN, role: "member", singleUse: false });
    if (!issued.ok) throw new Error("not issued");
    const badKey = await use.redeem({
      token: issued.value.token,
      displayName: "Dana",
      publicKey: "nope",
      deviceName: "a",
    });
    expect(badKey.ok).toBe(false);
    if (!badKey.ok) expect(badKey.error.kind).toBe("invalid");

    expect(
      (
        await use.redeem({
          token: issued.value.token,
          displayName: "Dana",
          publicKey: KEY,
          deviceName: "a",
        })
      ).ok,
    ).toBe(true);
    const twice = await use.redeem({
      token: issued.value.token,
      displayName: "Dana",
      publicKey: KEY,
      deviceName: "a",
    });
    expect(twice.ok).toBe(false);
  });
});

describe("a link to a space (ADR 0168)", () => {
  const BAKERY = "spc_01K4ZQPX0000000000000000B1";
  const STUDIO = "spc_01K4ZQPX0000000000000000S1";
  const RAVI: Principal = {
    kind: "person",
    participantId: "usr_01K4ZQPX0000000000000000R1",
    workspaceId: WS,
    displayName: "Ravi",
    via: "device_key",
    role: "member",
  };

  function bakery() {
    const world = harness();
    world.rooms.set(BAKERY, { title: "Bakery", state: "open" });
    world.rooms.set(STUDIO, { title: "Studio", state: "open" });
    world.members.add(`${BAKERY} ${ARJUN.participantId}`);
    return world;
  }

  it("is made for an open space its maker is in, as a guest or a member", async () => {
    const { use } = bakery();
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    expect(made.ok && made.value.spaceId).toBe(BAKERY);
    expect(await use.create({ principal: ARJUN, role: "admin", spaceId: BAKERY })).toMatchObject({
      ok: false,
      error: { kind: "invalid", message: "A space's link makes a guest or a member." },
    });
    expect(await use.create({ principal: ARJUN, role: "member", spaceId: STUDIO })).toMatchObject({
      ok: false,
      error: { message: "A link brings people into a space you're in." },
    });
  });

  it("is not made for an archived space, a thread or one that isn't there", async () => {
    const { use, rooms, members } = bakery();
    rooms.set("spc_archived", { title: "Old", state: "closed" });
    rooms.set("spc_thread", { title: "Side", state: "open", parent: BAKERY });
    members.add(`spc_archived ${ARJUN.participantId}`);
    members.add(`spc_thread ${ARJUN.participantId}`);
    for (const spaceId of ["spc_archived", "spc_thread", "spc_nowhere"]) {
      const made = await use.create({ principal: ARJUN, role: "guest", spaceId });
      expect(made.ok).toBe(false);
    }
  });

  it("says the space on the card, and joining puts them in it, by the maker, naming the link", async () => {
    const { use, appended } = bakery();
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    if (!made.ok) throw new Error("not made");
    const peeked = await use.peek(made.value.token);
    expect(peeked.ok && peeked.value).toMatchObject({ spaceId: BAKERY, spaceName: "Bakery" });

    const redeemed = await use.redeem({
      token: made.value.token,
      displayName: "Priya Nair",
      publicKey: KEY,
      deviceName: "Priya's iPhone",
    });
    if (!redeemed.ok || "waiting" in redeemed.value) throw new Error("not let in");
    expect(redeemed.value.spaceId).toBe(BAKERY);
    expect(appended).toEqual([
      expect.objectContaining({
        type: "membership.added",
        space_id: BAKERY,
        actor: { kind: "person", id: ARJUN.participantId },
        participant_id: redeemed.value.participantId,
        participant_kind: "person",
        invite_id: made.value.id,
      }),
    ]);
  });

  it("a workspace's link puts nobody in a space", async () => {
    const { use, appended } = bakery();
    const made = await use.create({ principal: ARJUN, role: "member" });
    if (!made.ok) throw new Error("not made");
    const peeked = await use.peek(made.value.token);
    expect(peeked.ok && peeked.value).toMatchObject({ spaceId: null, spaceName: null });
    await use.redeem({
      token: made.value.token,
      displayName: "Priya",
      publicKey: KEY,
      deviceName: "x",
    });
    expect(appended).toEqual([]);
  });

  it("is withdrawn once its maker has left the space, and the list says so", async () => {
    const { use, members, invites } = bakery();
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    if (!made.ok) throw new Error("not made");
    members.delete(`${BAKERY} ${ARJUN.participantId}`);
    expect(await use.peek(made.value.token)).toMatchObject({
      ok: false,
      error: { kind: "revoked" },
    });
    expect(invites[0]?.revokedAt).not.toBeNull();
    const listed = await use.list(ARJUN);
    expect(listed.ok && listed.value[0]?.revokedAt).not.toBeNull();
  });

  it("is withdrawn once its space is archived", async () => {
    const { use, rooms } = bakery();
    const made = await use.create({ principal: ARJUN, role: "member", spaceId: BAKERY });
    if (!made.ok) throw new Error("not made");
    rooms.set(BAKERY, { title: "Bakery", state: "closed" });
    const listed = await use.list(ARJUN);
    expect(listed.ok && listed.value[0]?.revokedAt).not.toBeNull();
    expect((await use.peek(made.value.token)).ok).toBe(false);
  });

  it("lets somebody already here into the space, and the link is not spent", async () => {
    const { use, appended, invites } = bakery();
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    if (!made.ok) throw new Error("not made");
    const entered = await use.enter({ principal: RAVI, token: made.value.token });
    expect(entered).toEqual({
      ok: true,
      value: { spaceId: BAKERY, workspaceId: WS, already: false },
    });
    expect(appended).toEqual([
      expect.objectContaining({
        participant_id: RAVI.participantId,
        actor: { kind: "person", id: ARJUN.participantId },
        invite_id: made.value.id,
      }),
    ]);
    expect(invites[0]?.uses).toBe(0);
    // Again: they are in, and nothing more is written.
    const again = await use.enter({ principal: RAVI, token: made.value.token });
    expect(again.ok && again.value.already).toBe(true);
    expect(appended).toHaveLength(1);
  });

  it("tells a guest who is in a space already that a guest is in one", async () => {
    const { use, members } = bakery();
    const guest: Principal = { ...RAVI, role: "guest" };
    members.add(`${STUDIO} ${guest.participantId}`);
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    if (!made.ok) throw new Error("not made");
    expect(await use.enter({ principal: guest, token: made.value.token })).toMatchObject({
      ok: false,
      error: { kind: "guest_elsewhere", message: "A guest is in one space at most." },
    });
  });

  it("lets in a guest whose one room was archived: only open rooms count (JR-24)", async () => {
    const { use, members, rooms } = bakery();
    const guest: Principal = { ...RAVI, role: "guest" };
    rooms.set(STUDIO, { title: "Studio", state: "closed" });
    members.add(`${STUDIO} ${guest.participantId}`);
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    if (!made.ok) throw new Error("not made");
    expect(await use.enter({ principal: guest, token: made.value.token })).toEqual({
      ok: true,
      value: { spaceId: BAKERY, workspaceId: WS, already: false },
    });
  });

  it("says nothing of another workspace's link, and a workspace's link lets nobody into a space", async () => {
    const { use } = bakery();
    const made = await use.create({ principal: ARJUN, role: "guest", spaceId: BAKERY });
    const plain = await use.create({ principal: ARJUN, role: "member" });
    if (!made.ok || !plain.ok) throw new Error("not made");
    const elsewhere: Principal = { ...RAVI, workspaceId: "ws_01K4ZQPX000000000000000009" };
    expect(await use.enter({ principal: elsewhere, token: made.value.token })).toMatchObject({
      ok: false,
      error: { kind: "unknown_invite" },
    });
    expect(await use.enter({ principal: RAVI, token: plain.value.token })).toMatchObject({
      ok: false,
      error: { kind: "invalid" },
    });
  });
});
