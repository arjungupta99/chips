/**
 * Invites over HTTP (ADR 0034): an owner makes a link, the link says where it goes, whoever
 * opens it joins with a role and a paired device that signs from the first request, and the
 * doors with no credential behind them are rate limited like pairing is.
 */

import { generateKeyPairSync, sign } from "node:crypto";
import { inviteFromLink } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signingPayload } from "../../../infrastructure/auth/credentials.js";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";
import { linkBase } from "./invites.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function call(
  method: string,
  path: string,
  options: { body?: unknown; as?: TestPerson; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const raw = options.body === undefined ? "" : JSON.stringify(options.body);
  const response = await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.as === undefined ? {} : options.as.sign(method, path, raw)),
        ...options.headers,
      },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/** A fresh device key, and a signer for it, the way a browser that just joined would sign. */
function newDevice() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const signer = (deviceId: string) => (method: string, target: string, body: string) => {
    const timestamp = Date.now();
    const payload = signingPayload({ method, target, timestamp, body });
    return {
      "x-chips-device": deviceId,
      "x-chips-timestamp": String(timestamp),
      "x-chips-signature": sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64"),
    };
  };
  return { spki, signer };
}

describe("POST /v1/invites", () => {
  it("makes a link for an owner, and lists it without the token", async () => {
    const made = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "member" },
      headers: { origin: "http://127.0.0.1:5173" },
    });
    expect(made.status).toBe(201);
    expect(made.body["invite_id"]).toMatch(/^inv_/);
    expect(made.body["token"]).toMatch(/^chips_inv_/);
    // The server's key rides beside the token with no relay to name (ADR 0191).
    const link = inviteFromLink(made.body["url"] as string);
    expect(link).toMatchObject({ token: made.body["token"], lan: "http://127.0.0.1:5173" });
    expect(link?.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(link?.relay).toBeUndefined();
    expect(made.body["url"]).not.toContain("relay=");
    expect(made.body).toMatchObject({ role: "member", single_use: true });

    const listed = await call("GET", "/v1/invites", { as: ws.arjun });
    expect(listed.status).toBe(200);
    expect(listed.body["invites"]).toEqual([
      expect.objectContaining({
        invite_id: made.body["invite_id"],
        role: "member",
        single_use: true,
        uses: 0,
        created_by: ws.arjun.participantId,
        revoked_at: null,
      }),
    ]);
    expect(JSON.stringify(listed.body)).not.toContain("chips_inv_");
  });

  it("opens at the relay's page, carrying the relay and the server's key, when the server has a relay", async () => {
    const withRelay = await createTestWorkspace({
      config: {
        relay: {
          url: "wss://relay.example",
          host: "127.0.0.1",
          port: 4440,
          maxSessionsPerServer: 32,
        },
      },
    });
    try {
      const raw = JSON.stringify({ role: "member" });
      const response = await withRelay.gateway.app.fetch(
        new Request(`${BASE}/v1/invites`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "http://127.0.0.1:5173",
            ...withRelay.arjun.sign("POST", "/v1/invites", raw),
          },
          body: raw,
        }),
      );
      const made = (await response.json()) as Record<string, string>;
      // The relay's page, which opens from anywhere, with this server in it (ADR 0207).
      expect(made["url"]).toMatch(/^https:\/\/relay\.example\/join#invite=chips_inv_/);
      const link = inviteFromLink(made["url"] ?? "");
      expect(link).toMatchObject({ token: made["token"], lan: "http://127.0.0.1:5173" });
      expect(link?.relay).toBe("wss://relay.example");
      expect(link?.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
      // When it runs out rides along, in seconds, for the page to say.
      const until = new URLSearchParams(made["url"]?.split("#")[1]).get("until");
      expect(Number(until)).toBe(Math.floor(Date.parse(made["expires_at"] ?? "") / 1000));
    } finally {
      await withRelay.close();
    }
  });

  it("is refused to a member, and to a harness", async () => {
    const dana = await call("POST", "/v1/invites", { as: ws.dana, body: { role: "guest" } });
    expect(dana.status).toBe(403);
    const scout = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/invites`, {
        method: "POST",
        headers: { "content-type": "application/json", ...ws.scout.headers },
        body: JSON.stringify({ role: "guest" }),
      }),
    );
    expect(scout.status).toBe(403);
    expect((await call("GET", "/v1/invites", { as: ws.dana })).status).toBe(403);
  });

  it("refuses a role that is not one, and a duration out of range", async () => {
    expect(
      (await call("POST", "/v1/invites", { as: ws.arjun, body: { role: "root" } })).status,
    ).toBe(422);
    expect(
      (
        await call("POST", "/v1/invites", {
          as: ws.arjun,
          body: { role: "member", expires_in_seconds: 5 },
        })
      ).status,
    ).toBe(422);
  });
});

describe("where a link points", () => {
  /** A server as the rule sees it: its public address if one is set, and where it is reached. */
  const server = (publicUrl: string | undefined, reachable: string) => ({
    config: { server: { host: "0.0.0.0", port: 4431, publicUrl } } as never,
    reachableUrl: () => reachable,
  });

  it("is the server's public address when one is set, whatever page made it", () => {
    const tailnet = server("https://mini.tailnet.ts.net", "https://mini.tailnet.ts.net");
    expect(linkBase("http://127.0.0.1:5173", tailnet)).toBe("https://mini.tailnet.ts.net");
    expect(linkBase("http://10.0.0.96:5173", tailnet)).toBe("https://mini.tailnet.ts.net");
    expect(linkBase("tauri://localhost", tailnet)).toBe("https://mini.tailnet.ts.net");
  });

  it("is the page it was made from when that is somewhere another machine can reach", () => {
    expect(linkBase("http://mini.local:5173/", server(undefined, "http://10.0.0.96:4431"))).toBe(
      "http://mini.local:5173",
    );
  });

  it("is where the server is reached, not a loopback page, when the server is on a network", () => {
    const lan = server(undefined, "http://10.0.0.96:4431");
    expect(linkBase("http://127.0.0.1:5173", lan)).toBe("http://10.0.0.96:4431");
    expect(linkBase("http://localhost:5173", lan)).toBe("http://10.0.0.96:4431");
  });

  it("keeps a loopback page when the server is on loopback too, and nobody else can open it", () => {
    expect(linkBase("http://127.0.0.1:5173", server(undefined, "http://127.0.0.1:4431"))).toBe(
      "http://127.0.0.1:5173",
    );
  });

  it("is where the server is reached from the desktop app, whose page is no address", () => {
    const lan = server(undefined, "http://10.0.0.96:4431");
    expect(linkBase("tauri://localhost", lan)).toBe("http://10.0.0.96:4431");
    expect(linkBase(undefined, lan)).toBe("http://10.0.0.96:4431");
  });
});

describe("a link, redeemed", () => {
  it("says where it goes, joins the person with the role, and pairs the device that asked", async () => {
    const made = await call("POST", "/v1/invites", { as: ws.arjun, body: { role: "admin" } });
    const token = String(made.body["token"]);

    const peeked = await call("POST", "/v1/invites/peek", { body: { token } });
    expect(peeked.status).toBe(200);
    expect(peeked.body).toMatchObject({ workspace_name: "Solo", role: "admin", single_use: true });

    const device = newDevice();
    const redeemed = await call("POST", "/v1/invites/redeem", {
      body: {
        token,
        display_name: "Priya",
        public_key: device.spki,
        device_name: "Priya's laptop",
      },
    });
    expect(redeemed.status).toBe(201);
    expect(redeemed.body).toMatchObject({
      workspace_id: ws.workspaceId,
      workspace_name: "Solo",
      display_name: "Priya",
      role: "admin",
    });
    const priyaId = String(redeemed.body["participant_id"]);
    const deviceId = String(redeemed.body["device_id"]);

    // The device signs from the first request, and the workspace knows her role.
    const sign = device.signer(deviceId);
    const who = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, { headers: sign("GET", "/v1/participants", "") }),
    );
    expect(who.status).toBe(200);
    const { participants } = (await who.json()) as { participants: Record<string, unknown>[] };
    expect(participants).toContainEqual(
      expect.objectContaining({ id: priyaId, display_name: "Priya", role: "admin" }),
    );
    expect(await ws.gateway.deps.readModels.workspaceRole(ws.workspaceId, priyaId)).toBe("admin");

    // The log says she came by this invite, from Arjun.
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    const joined = page.events.find((event) => event.payload["participant_id"] === priyaId);
    expect(joined?.type).toBe("person.joined");
    expect(joined?.payload).toMatchObject({
      role: "admin",
      invite_id: made.body["invite_id"],
      invited_by: ws.arjun.participantId,
    });

    // Single use: the second person to open the link is turned away, and the list says so.
    const again = await call("POST", "/v1/invites/redeem", {
      body: { token, display_name: "Sam", public_key: newDevice().spki },
    });
    expect(again.status).toBe(401);
    const listed = await call("GET", "/v1/invites", { as: ws.arjun });
    expect((listed.body["invites"] as Record<string, unknown>[])[0]?.["uses"]).toBe(1);
  });

  it("is turned away once withdrawn, and a wrong token six times in a minute is told to wait", async () => {
    const made = await call("POST", "/v1/invites", { as: ws.arjun, body: { role: "guest" } });
    const revoked = await call("DELETE", `/v1/invites/${String(made.body["invite_id"])}`, {
      as: ws.arjun,
    });
    expect(revoked.status).toBe(200);
    expect(
      (await call("POST", "/v1/invites/peek", { body: { token: made.body["token"] } })).status,
    ).toBe(401);
    expect(
      (await call("DELETE", `/v1/invites/${String(made.body["invite_id"])}`, { as: ws.arjun }))
        .status,
    ).toBe(404);
    expect(
      (await call("DELETE", `/v1/invites/${String(made.body["invite_id"])}`, { as: ws.dana }))
        .status,
    ).toBe(403);

    for (let i = 0; i < 4; i += 1) {
      expect(
        (await call("POST", "/v1/invites/peek", { body: { token: `chips_inv_wrong${i}` } })).status,
      ).toBe(401);
    }
    const sixth = await call("POST", "/v1/invites/peek", { body: { token: "chips_inv_wrong5" } });
    expect(sixth.status).toBe(429);
  });

  it("says a name somebody here goes by, and counts it against the address like a wrong token (SEC-24)", async () => {
    const made = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "member", single_use: false },
    });
    const token = String(made.body["token"]);
    for (let i = 0; i < 5; i += 1) {
      const clash = await call("POST", "/v1/invites/redeem", {
        body: { token, display_name: "Dana", public_key: newDevice().spki },
      });
      expect(clash.status).toBe(422);
      // Named as a refusal of its own, so the joiner is asked for another name (ADR 0197).
      expect(clash.body["error"]).toMatchObject({
        message:
          "Somebody here goes by Dana already. If that's you on a new phone, ask Arjun to choose Pair a new phone on your page in People.",
        refusal: "name_taken",
      });
    }
    // The sixth guess at a name is told to wait, as the sixth wrong token is: a link holder
    // cannot list everyone here by name.
    const sixth = await call("POST", "/v1/invites/redeem", {
      body: { token, display_name: "Dana", public_key: newDevice().spki },
    });
    expect(sixth.status).toBe(429);
  });

  it("lets somebody whose name is taken join on the same one-use link under another (ADR 0197)", async () => {
    const made = await call("POST", "/v1/invites", { as: ws.arjun, body: { role: "member" } });
    const token = String(made.body["token"]);
    const device = newDevice();
    const clash = await call("POST", "/v1/invites/redeem", {
      body: { token, display_name: "dana", public_key: device.spki },
    });
    expect(clash.status).toBe(422);
    expect(clash.body["error"]).toMatchObject({ refusal: "name_taken" });
    // Anything else wrong with the answer is no name refusal: the client asks for no name.
    const blank = await call("POST", "/v1/invites/redeem", {
      body: { token, display_name: "  ", public_key: device.spki },
    });
    expect(blank.status).toBe(422);
    expect(blank.body["error"]).not.toHaveProperty("refusal");

    const joined = await call("POST", "/v1/invites/redeem", {
      body: { token, display_name: "Dana Shah", public_key: device.spki },
    });
    expect(joined.status).toBe(201);
    expect(joined.body["display_name"]).toBe("Dana Shah");
  });

  it("seats a guest who joined by an open link in one room only", async () => {
    const made = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "guest", single_use: false },
    });
    const device = newDevice();
    const redeemed = await call("POST", "/v1/invites/redeem", {
      body: { token: made.body["token"], display_name: "Vendor", public_key: device.spki },
    });
    const vendorId = String(redeemed.body["participant_id"]);
    // The owner's directory says which space a guest is in, so no list offers them a second.
    const rowOf = async (id: string) => {
      const listed = await call("GET", "/v1/participants", { as: ws.arjun });
      const rows = listed.body["participants"] as Record<string, unknown>[];
      return rows.find((row) => row["id"] === id);
    };
    expect((await rowOf(vendorId))?.["guest_of"]).toBeNull();
    expect(await rowOf(ws.dana.participantId)).not.toHaveProperty("guest_of");
    const seat = (spaceId: string, key: string) =>
      ws.gateway.deps.submitEvent({
        event: {
          type: "membership.added",
          space_id: spaceId,
          participant_id: vendorId,
          participant_kind: "person",
          role: "member",
          idempotency_key: key,
        },
        principal: {
          kind: "person",
          participantId: ws.arjun.participantId,
          workspaceId: ws.workspaceId,
          displayName: "Arjun",
          via: "device_key",
          role: "owner",
        },
      });
    const first = await seat(ws.spaceId, "seat-1");
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (first.ok) expect(first.value.event.payload["role"]).toBe("guest");
    expect((await rowOf(vendorId))?.["guest_of"]).toBe(ws.spaceId);

    // A second room: Arjun opens one, and cannot seat the guest in it too.
    const other = ws.ids.next("space");
    await ws.gateway.deps.store.append({
      v: 1,
      type: "space.created",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: other,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "other-room",
      kind: "group",
      title: "Elsewhere",
    } as Parameters<typeof ws.gateway.deps.store.append>[0]);
    const second = await seat(other, "seat-2");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.kind).toBe("guest_elsewhere");

    // And the guest sees only whom they share the one room with: Arjun, Dana and Scout.
    const sign = device.signer(String(redeemed.body["device_id"]));
    const who = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, { headers: sign("GET", "/v1/participants", "") }),
    );
    const { participants } = (await who.json()) as { participants: { id: string }[] };
    expect(participants.map((p) => p.id).sort()).toEqual(
      [ws.arjun.participantId, ws.dana.participantId, ws.scout.participantId, vendorId].sort(),
    );
  });

  it("puts a guest whose one room was archived in another, and unarchives it only once they're out (JR-24)", async () => {
    const made = await call("POST", "/v1/invites", { as: ws.arjun, body: { role: "guest" } });
    const redeemed = await call("POST", "/v1/invites/redeem", {
      body: { token: made.body["token"], display_name: "Vendor", public_key: newDevice().spki },
    });
    const vendorId = String(redeemed.body["participant_id"]);
    const guestOf = async () => {
      const listed = await call("GET", "/v1/participants", { as: ws.arjun });
      const rows = listed.body["participants"] as Record<string, unknown>[];
      return rows.find((row) => row["id"] === vendorId)?.["guest_of"];
    };
    const asArjun = (event: Record<string, unknown>) =>
      ws.gateway.deps.submitEvent({
        event: { ...event, idempotency_key: ws.ids.next("event") },
        principal: {
          kind: "person",
          participantId: ws.arjun.participantId,
          workspaceId: ws.workspaceId,
          displayName: "Arjun",
          via: "device_key",
          role: "owner",
        },
      });
    const seat = (spaceId: string) =>
      asArjun({
        type: "membership.added",
        space_id: spaceId,
        participant_id: vendorId,
        participant_kind: "person",
        role: "guest",
      });
    const state = (spaceId: string, to: "open" | "closed") =>
      asArjun({ type: "space.updated", space_id: spaceId, state: to });
    expect((await seat(ws.spaceId)).ok).toBe(true);
    // The trip ends: archived, the guest is in no open room, and the directory says so.
    expect((await state(ws.spaceId, "closed")).ok).toBe(true);
    expect(await guestOf()).toBeNull();
    const other = ws.ids.next("space");
    await ws.gateway.deps.store.append({
      v: 1,
      type: "space.created",
      id: ws.ids.next("event"),
      ts: new Date().toISOString(),
      workspace_id: ws.workspaceId,
      space_id: other,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: "jr24-other",
      kind: "group",
      title: "Foodie",
    } as Parameters<typeof ws.gateway.deps.store.append>[0]);
    const seated = await seat(other);
    expect(seated.ok, JSON.stringify(seated)).toBe(true);
    expect(await guestOf()).toBe(other);
    // Unarchived, the old room would make them a guest of two: refused, naming them.
    const reopened = await state(ws.spaceId, "open");
    expect(reopened).toMatchObject({
      ok: false,
      error: {
        kind: "guest_elsewhere",
        message:
          "Vendor is a guest in another space now, and a guest is in one at a time: take them out of one first, or make them a member",
      },
    });
    // Out of Foodie, the old room opens again, theirs again.
    const out = await asArjun({
      type: "membership.removed",
      space_id: other,
      participant_id: vendorId,
      reason: "removed",
    });
    expect(out.ok, JSON.stringify(out)).toBe(true);
    const again = await state(ws.spaceId, "open");
    expect(again.ok, JSON.stringify(again)).toBe(true);
    expect(await guestOf()).toBe(ws.spaceId);
  });
});

describe("a link to a space (ADR 0168)", () => {
  /** Arjun's link into PO-4471, the room he, Dana and Scout are in. */
  async function spaceLink(role: "guest" | "member", singleUse = true) {
    const made = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role, single_use: singleUse, space_id: ws.spaceId },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body["space_id"]).toBe(ws.spaceId);
    return { token: String(made.body["token"]), inviteId: String(made.body["invite_id"]) };
  }
  const inRoom = (id: string) =>
    ws.gateway.deps.readModels.isMember(ws.workspaceId, ws.spaceId, id);

  it("says the space, and joining by it puts the person there as Arjun put them", async () => {
    const { token, inviteId } = await spaceLink("guest");
    const peeked = await call("POST", "/v1/invites/peek", { body: { token } });
    expect(peeked.body).toMatchObject({
      space_id: ws.spaceId,
      space_name: "PO-4471",
      role: "guest",
    });

    const redeemed = await call("POST", "/v1/invites/redeem", {
      body: { token, display_name: "Priya", public_key: newDevice().spki },
    });
    expect(redeemed.status).toBe(201);
    expect(redeemed.body["space_id"]).toBe(ws.spaceId);
    const priyaId = String(redeemed.body["participant_id"]);
    expect(await inRoom(priyaId)).toBe(true);

    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 200);
    const added = page.events.find(
      (event) => event.type === "membership.added" && event.payload["participant_id"] === priyaId,
    );
    expect(added?.actor).toMatchObject({ kind: "person", id: ws.arjun.participantId });
    expect(added?.payload).toMatchObject({ invite_id: inviteId, role: "guest" });
  });

  it("is made for a room of one agent too, and never for a thread", async () => {
    // Arjun's room with Scout alone, as the + opens one (direct), and a thread under PO-4471.
    const open = async (kind: "direct" | "thread"): Promise<string> => {
      const spaceId = ws.ids.next("space");
      const at = new Date().toISOString();
      const actor = { kind: "person" as const, id: ws.arjun.participantId };
      await ws.gateway.deps.store.append({
        v: 1,
        type: "space.created",
        id: ws.ids.next("event"),
        ts: at,
        workspace_id: ws.workspaceId,
        space_id: spaceId,
        actor,
        idempotency_key: `open-${kind}`,
        kind,
        ...(kind === "thread"
          ? { parent_space_id: ws.spaceId, root_message_id: ws.ids.next("message") }
          : {}),
      } as Parameters<typeof ws.gateway.deps.store.append>[0]);
      if (kind === "thread") return spaceId;
      for (const [participant, participantKind, role] of [
        [ws.arjun.participantId, "person", "owner"],
        [ws.scout.participantId, "harness", "member"],
      ] as const) {
        await ws.gateway.deps.store.append({
          v: 1,
          type: "membership.added",
          id: ws.ids.next("event"),
          ts: at,
          workspace_id: ws.workspaceId,
          space_id: spaceId,
          actor,
          idempotency_key: `seat-${kind}-${participant}`,
          participant_id: participant,
          participant_kind: participantKind,
          role,
        } as Parameters<typeof ws.gateway.deps.store.append>[0]);
      }
      return spaceId;
    };

    const solo = await open("direct");
    const made = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "guest", space_id: solo },
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const redeemed = await call("POST", "/v1/invites/redeem", {
      body: { token: made.body["token"], display_name: "Priya", public_key: newDevice().spki },
    });
    expect(redeemed.status, JSON.stringify(redeemed.body)).toBe(201);
    expect(redeemed.body["space_id"]).toBe(solo);
    const priyaId = String(redeemed.body["participant_id"]);
    expect(await ws.gateway.deps.readModels.isMember(ws.workspaceId, solo, priyaId)).toBe(true);

    const thread = await open("thread");
    const refused = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "guest", space_id: thread },
    });
    expect(refused.status).toBe(422);
  });

  it("lets somebody already here into the space, and is not spent", async () => {
    const ravi = await ws.addPerson("Ravi", "member");
    const { token } = await spaceLink("guest");
    const entered = await call("POST", "/v1/invites/enter", { as: ravi, body: { token } });
    expect(entered.status, JSON.stringify(entered.body)).toBe(200);
    expect(entered.body).toEqual({
      space_id: ws.spaceId,
      workspace_id: ws.workspaceId,
      already: false,
    });
    expect(await inRoom(ravi.participantId)).toBe(true);
    const again = await call("POST", "/v1/invites/enter", { as: ravi, body: { token } });
    expect(again.body["already"]).toBe(true);
    // Still good for the somebody new it was made for.
    const listed = await call("GET", "/v1/invites", { as: ws.arjun });
    expect((listed.body["invites"] as Record<string, unknown>[])[0]).toMatchObject({
      uses: 0,
      revoked_at: null,
      space_id: ws.spaceId,
    });
    // A link that is no good is not found here, whoever asks.
    const wrong = await call("POST", "/v1/invites/enter", {
      as: ravi,
      body: { token: "chips_inv_nope" },
    });
    expect(wrong.status).toBe(404);
  });

  it("is withdrawn once Arjun has left the space", async () => {
    const { token } = await spaceLink("member", false);
    const left = await ws.gateway.deps.submitEvent({
      event: {
        type: "membership.removed",
        space_id: ws.spaceId,
        participant_id: ws.arjun.participantId,
        idempotency_key: "arjun-leaves",
      },
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
        role: "owner",
      },
    });
    expect(left.ok, JSON.stringify(left)).toBe(true);
    expect((await call("POST", "/v1/invites/peek", { body: { token } })).status).toBe(401);
    const listed = await call("GET", "/v1/invites", { as: ws.arjun });
    expect((listed.body["invites"] as Record<string, unknown>[])[0]?.["revoked_at"]).not.toBeNull();
  });

  it("is not made for a space Arjun isn't in, nor to make an admin", async () => {
    const elsewhere = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "guest", space_id: "spc_01K4ZQPX00000000000000000Z" },
    });
    expect(elsewhere.status).toBe(422);
    const admin = await call("POST", "/v1/invites", {
      as: ws.arjun,
      body: { role: "admin", space_id: ws.spaceId },
    });
    expect(admin.status).toBe(422);
  });
});
