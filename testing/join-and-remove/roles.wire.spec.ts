/**
 * What each role may do, at its edges, on the wire (ADRs 0034, 0196; JR-9). A guest opens no room,
 * adds nobody, and sets neither what a job may spend nor who leads; a member opens no room but a
 * thread, and sets no spend either; an admin opens rooms, but only the workspace's owner sets what
 * a job may spend. A role changed while somebody is connected closes their socket, and the next one
 * has the role as it is now. Somebody in two rooms is not made a guest; the last owner stays one;
 * an admin changes no owner's role. The screens' halves are in `rooms.spec.ts` (no Add for a guest)
 * and the web's own `the-spend-per-job.spec.ts`.
 */

import { demo, registerAgent } from "../../apps/web/e2e/support.ts";
import { aName, expect, test } from "./support.ts";
import { added, newId, refusal, roomOf, type Socket, said, Wire } from "./wire.ts";

/** Somebody joined by a fresh invite of the owner's, with this role. */
async function joined(owner: Wire, role: "admin" | "member" | "guest", first: string) {
  const { token } = await owner.invite(role);
  const answer = await Wire.redeem(token, aName(first));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.wire as Wire;
}

/** A room of the owner's with an agent of the demo harness's in it, and whoever else is named. */
async function roomWithAgent(ownerSocket: Socket, title: string) {
  const room = await roomOf(ownerSocket, `${title} ${Date.now()}`);
  const agent = await registerAgent(demo().harness, `${title.toLowerCase()}-${Date.now()}`, title);
  const seated = await ownerSocket.send({
    type: "membership.added",
    space_id: room,
    participant_id: agent,
    participant_kind: "agent",
    role: "member",
  });
  expect(seated["frame"]).toBe("ack");
  return { room, agent };
}

/** A room asked for as the + asks: an empty group of one's own. */
function opening(title: string) {
  const spaceId = newId("spc");
  return {
    type: "space.created",
    space_id: spaceId,
    kind: "group",
    title,
    idempotency_key: `space-${spaceId}`,
  };
}

test("a guest opens no room, adds nobody, and sets neither a job's spend nor the lead, but talks in their room", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const sockets: Socket[] = [ownerSocket];
  try {
    const { room, agent } = await roomWithAgent(ownerSocket, "Porch");
    const guest = await joined(owner, "guest", "Gauri");
    expect((await ownerSocket.send(added(room, guest, "guest")))["frame"]).toBe("ack");
    const socket = await guest.socket();
    sockets.push(socket);

    expect((await socket.send(said(room, "Hello from the porch")))["frame"]).toBe("ack");
    const opened = await socket.send(opening("A guest's own room"));
    expect(opened["frame"]).toBe("error");
    const friend = await joined(owner, "member", "Farid");
    expect((await socket.send(added(room, friend)))["frame"]).toBe("error");
    const spend = await guest.call("POST", `/v1/spaces/${room}/spend-ceiling`, { usd: 5 });
    expect([spend.status, refusal(spend)]).toEqual([403, "forbidden"]);
    const lead = await guest.call("POST", `/v1/spaces/${room}/lead`, { agent_id: agent });
    expect([lead.status, refusal(lead)]).toEqual([403, "forbidden"]);
    // No harness is a guest's to add, nor anybody else's join to decide: the list shows a person only
    // what asks them (ADR 0232), and nothing asks a guest.
    const asks = await guest.call("GET", "/v1/join");
    expect([asks.status, asks.body.requests]).toEqual([200, []]);
    expect((await guest.call("POST", "/v1/invites", { role: "guest" })).status).toBe(403);
  } finally {
    for (const socket of sockets) socket.close();
  }
});

test("a member opens no room but a thread, sets no spend, and may choose the lead; an admin opens rooms, and only the owner sets spend", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const sockets: Socket[] = [ownerSocket];
  try {
    const { room, agent } = await roomWithAgent(ownerSocket, "Pantry");
    const member = await joined(owner, "member", "Madhu");
    const admin = await joined(owner, "admin", "Amar");
    for (const who of [member, admin]) {
      expect((await ownerSocket.send(added(room, who)))["frame"]).toBe("ack");
    }
    const memberSocket = await member.socket();
    const adminSocket = await admin.socket();
    sockets.push(memberSocket, adminSocket);

    // A member: no room of their own (ADR 0196), but a thread on a message in their room.
    expect((await memberSocket.send(opening("A member's own room")))["frame"]).toBe("error");
    const words = `Thread on this ${Date.now()}`;
    expect((await memberSocket.send(said(room, words)))["frame"]).toBe("ack");
    const posted = await memberSocket.event((event) => event["text"] === words, "her words");
    const threadId = newId("spc");
    const thread = await memberSocket.send({
      type: "space.created",
      space_id: threadId,
      kind: "thread",
      parent_space_id: room,
      root_message_id: `msg_${String(posted["id"]).slice(4)}`,
      idempotency_key: `space-${threadId}`,
    });
    expect(thread["frame"], JSON.stringify(thread)).toBe("ack");
    const memberSpend = await member.call("POST", `/v1/spaces/${room}/spend-ceiling`, { usd: 5 });
    expect(memberSpend.status).toBe(403);
    expect(memberSpend.body.error.message).toBe(
      "Only the workspace's owner sets what a job may spend.",
    );
    const memberLead = await member.call("POST", `/v1/spaces/${room}/lead`, { agent_id: agent });
    expect(memberLead.status).toBe(200);

    // An admin: a room of their own, but a job's spend is still the owner's alone.
    expect((await adminSocket.send(opening("An admin's own room")))["frame"]).toBe("ack");
    const adminSpend = await admin.call("POST", `/v1/spaces/${room}/spend-ceiling`, { usd: 5 });
    expect(adminSpend.status).toBe(403);
    expect(adminSpend.body.error.message).toBe(
      "Only the workspace's owner sets what a job may spend.",
    );
    const ownerSpend = await owner.call("POST", `/v1/spaces/${room}/spend-ceiling`, { usd: 5 });
    expect([ownerSpend.status, ownerSpend.body.usd]).toEqual([200, 5]);
  } finally {
    for (const socket of sockets) socket.close();
  }
});

test("a role changed while she is connected closes her socket, and the next one has the role as it is now (JR-9)", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const sockets: Socket[] = [ownerSocket];
  try {
    const room = await roomOf(ownerSocket, `Studio ${Date.now()}`);
    const natalie = await joined(owner, "member", "Natalie");
    expect((await ownerSocket.send(added(room, natalie)))["frame"]).toBe("ack");
    const before = await natalie.socket();
    sockets.push(before);
    const friend = await joined(owner, "member", "Kabir");
    // As a member she may add somebody to her room.
    expect((await before.send(added(room, friend)))["frame"]).toBe("ack");

    // Made a guest: the socket she holds is closed, saying why.
    const demoted = await ownerSocket.send({
      type: "role.changed",
      participant_id: natalie.id,
      role: "guest",
    });
    expect(demoted["frame"]).toBe("ack");
    expect(await before.whenClosed()).toMatchObject({ code: 4005 });
    // The next opens as a guest: she may talk, and add nobody.
    const after = await natalie.socket();
    sockets.push(after);
    expect((await after.send(said(room, "Still here, as a guest")))["frame"]).toBe("ack");
    const another = await joined(owner, "member", "Lalit");
    expect((await after.send(added(room, another)))["frame"]).toBe("error");

    // Made an admin: she opens a room of her own on the next socket.
    expect(
      (await ownerSocket.send({ type: "role.changed", participant_id: natalie.id, role: "admin" }))[
        "frame"
      ],
    ).toBe("ack");
    await after.whenClosed();
    const promoted = await natalie.socket();
    sockets.push(promoted);
    expect((await promoted.send(opening("Natalie's own")))["frame"]).toBe("ack");
  } finally {
    for (const socket of sockets) socket.close();
  }
});

test("somebody in two rooms is not made a guest, an admin changes no owner's role, and the last owner stays one", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const sockets: Socket[] = [ownerSocket];
  try {
    const one = await roomOf(ownerSocket, `One ${Date.now()}`);
    const two = await roomOf(ownerSocket, `Two ${Date.now()}`);
    const member = await joined(owner, "member", "Rhea");
    for (const room of [one, two]) {
      expect((await ownerSocket.send(added(room, member)))["frame"]).toBe("ack");
    }
    const toGuest = await ownerSocket.send({
      type: "role.changed",
      participant_id: member.id,
      role: "guest",
    });
    expect(toGuest["frame"]).toBe("error");

    const admin = await joined(owner, "admin", "Sahil");
    const adminSocket = await admin.socket();
    sockets.push(adminSocket);
    for (const role of ["member", "guest", "admin"] as const) {
      const tried = await adminSocket.send({
        type: "role.changed",
        participant_id: owner.id,
        role,
      });
      expect(tried["frame"], role).toBe("error");
    }
    // An admin makes nobody an owner.
    const crown = await adminSocket.send({
      type: "role.changed",
      participant_id: member.id,
      role: "owner",
    });
    expect(crown["frame"]).toBe("error");
    // The owner, alone as owner, does not step down.
    const down = await ownerSocket.send({
      type: "role.changed",
      participant_id: owner.id,
      role: "admin",
    });
    expect(down["frame"]).toBe("error");
  } finally {
    for (const socket of sockets) socket.close();
  }
});
