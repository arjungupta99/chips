/**
 * A new phone for somebody already here, at its edges, on the wire (ADR 0206): an owner's code for
 * another person pairs a device as them, with their name and their rooms; their old device keeps
 * working, both hear the room, and the one signed out is shut at once while the other carries on.
 * A code for somebody else is an owner's alone, only for a person still here, good once, and a
 * code made before they were removed pairs nothing. `a-new-phone.spec.ts` N1 shows the owner's
 * People page and a browser pairing with the code.
 */

import { demo, SERVER } from "../../apps/web/e2e/support.ts";
import { aName, expect, test } from "./support.ts";
import { added, plain, refusal, roomOf, type Socket, said, Wire } from "./wire.ts";

/** Somebody joined by a fresh invite of the owner's, with this role. */
async function joined(owner: Wire, role: "admin" | "member" | "guest", first: string) {
  const { token } = await owner.invite(role);
  const answer = await Wire.redeem(token, aName(first));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.wire as Wire;
}

/** An owner's code that pairs a device as `who`. */
async function codeFor(owner: Wire, who: Wire): Promise<string> {
  const made = await owner.call("POST", "/v1/pairing-codes", { for: who.id });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  expect(made.body.code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
  return String(made.body.code);
}

test("an owner's code pairs a new phone as her: same person, her rooms, and both her devices hear the room until one is signed out", async () => {
  const owner = await Wire.owner();
  const natalie = await joined(owner, "member", "Natalie");
  const sockets: Socket[] = [];
  try {
    const ownerSocket = await owner.socket();
    sockets.push(ownerSocket);
    const foodie = await roomOf(ownerSocket, `Foodie ${Date.now()}`);
    expect((await ownerSocket.send(added(foodie, natalie)))["frame"]).toBe("ack");

    const phone = await Wire.pair(await codeFor(owner, natalie), "Natalie's new iPhone");
    expect(phone.device).toMatchObject({
      participantId: natalie.id,
      displayName: natalie.name,
      workspaceId: natalie.device.workspaceId,
    });
    expect(phone.device.deviceId).not.toBe(natalie.device.deviceId);
    // Her rooms are there from the first hello: it is her, not somebody new.
    const newSocket = await phone.socket();
    sockets.push(newSocket);
    const hello = await newSocket.event((event) => event["type"] === "hello", "hello");
    expect(hello["spaces"]).toContain(foodie);
    // Her devices list both, the new one current.
    const devices = (await phone.ok("GET", "/v1/devices")).devices as {
      device_id: string;
      current: boolean;
      revoked_at: string | null;
    }[];
    expect(devices.map((each) => each.device_id).sort()).toEqual(
      [natalie.device.deviceId, phone.device.deviceId].sort(),
    );
    expect(devices.find((each) => each.current)?.device_id).toBe(phone.device.deviceId);

    // The old one still speaks for her, and both hear the owner in the room.
    const oldSocket = await natalie.socket();
    sockets.push(oldSocket);
    const words = `Both phones, ${Date.now()}`;
    expect((await ownerSocket.send(said(foodie, words)))["frame"]).toBe("ack");
    for (const socket of [oldSocket, newSocket]) {
      await socket.event((event) => event["text"] === words, "the owner's words on her phone");
    }

    // She signs the old one out from the new: it is shut now, and refused after.
    const out = await phone.ok("DELETE", `/v1/devices/${natalie.device.deviceId}`);
    expect(out.sockets_closed).toBeGreaterThanOrEqual(1);
    expect((await oldSocket.whenClosed()).code).toBe(4001);
    const refused = await natalie.call("GET", "/v1/participants");
    expect(refused.status).toBe(401);
    // The new one carries on, and still hears the room.
    const later = `Only the new one, ${Date.now()}`;
    expect((await ownerSocket.send(said(foodie, later)))["frame"]).toBe("ack");
    await newSocket.event((event) => event["text"] === later, "the owner's words after");
    expect(newSocket.closed).toBeUndefined();
  } finally {
    for (const socket of sockets) socket.close();
  }
});

test("a code for somebody else is an owner's alone; anybody makes one for themselves", async () => {
  const owner = await Wire.owner();
  const member = await joined(owner, "member", "Esha");
  for (const role of ["admin", "member", "guest"] as const) {
    const somebody = await joined(owner, role, "Farah");
    const forHer = await somebody.call("POST", "/v1/pairing-codes", { for: member.id });
    expect([forHer.status, refusal(forHer)], role).toEqual([403, "forbidden"]);
    expect(forHer.body.error.message).toBe("Only an owner pairs a device for somebody else.");
    // An admin is not let pair a phone as the owner either.
    const forOwner = await somebody.call("POST", "/v1/pairing-codes", { for: owner.id });
    expect(forOwner.status).toBe(403);
    // Their own code, by naming nobody or themselves, pairs a device as them.
    for (const body of [undefined, { for: somebody.id }]) {
      const own = await somebody.call("POST", "/v1/pairing-codes", body);
      expect(own.status, role).toBe(201);
      const second = await Wire.pair(String(own.body.code));
      expect(second.id).toBe(somebody.id);
    }
  }
});

test("a code is for a person still here: not somebody removed, an agent, nobody, or a body that is not one", async () => {
  const owner = await Wire.owner();
  const gone = await joined(owner, "member", "Gopal");
  await owner.ok("DELETE", `/v1/people/${gone.id}`);
  const agent = (await owner.participants()).find((each) => each["kind"] === "agent");
  for (const id of [gone.id, String(agent?.["id"]), "usr_01K4ZQPX0000000000000000"]) {
    const made = await owner.call("POST", "/v1/pairing-codes", { for: id });
    expect([made.status, refusal(made)], id).toEqual([404, "not_found"]);
  }
  for (const body of [{ for: 5 }, { for: "" }, ["for"]]) {
    const made = await owner.call("POST", "/v1/pairing-codes", body);
    expect(made.status, JSON.stringify(body)).toBe(422);
  }
});

test("a code for her pairs one phone; a second is refused, and one made before she was removed pairs none", async () => {
  const owner = await Wire.owner();
  const natalie = await joined(owner, "member", "Natalie");
  const code = await codeFor(owner, natalie);
  expect((await Wire.pair(code)).id).toBe(natalie.id);
  const again = await Wire.tryPair(code);
  expect([again.status, refusal(again)]).toEqual([401, "unauthorized"]);

  // A code made for her, then she is removed before anyone uses it.
  const late = await codeFor(owner, natalie);
  await owner.ok("DELETE", `/v1/people/${natalie.id}`);
  const after = await Wire.tryPair(late);
  expect(after.status).toBe(401);
  expect(after.wire).toBeUndefined();
});

test("a harness can't make a pairing code, for anybody, and nobody unsigned can", async () => {
  const owner = await Wire.owner();
  const response = await fetch(`${SERVER}/v1/pairing-codes`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${demo().harness.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ for: owner.id }),
  });
  expect(response.status).toBe(403);
  expect((await plain("POST", "/v1/pairing-codes", { for: owner.id })).status).toBe(401);
});
