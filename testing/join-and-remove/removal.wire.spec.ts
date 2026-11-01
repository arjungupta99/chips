/**
 * Removed from the workspace, at its edges, on the wire (ADR 0160): every socket of hers closes
 * with 4003 on every device, and what each device asks after is told `person_removed`; a code made
 * for her pairs nothing, an invite she made as an owner is withdrawn, a device an admin of the
 * workspace allowed is let in by nobody; her harness and the ask only she could answer go to
 * whoever removed her; every room she was in says she went; removing her again changes nothing.
 * Who may remove whom: an owner or an admin, never themselves, never an admin an owner.
 * `remove.spec.ts` shows her screens and the owner's dialog.
 */

import {
  type Frame,
  Harness,
  newApprovalId,
  newRunId,
  registerSpecialist,
} from "../../apps/web/e2e/support.ts";
import { aName, expect, test } from "./support.ts";
import {
  added,
  newKey,
  plain,
  refusal,
  roomOf,
  type Socket,
  SocketRefused,
  said,
  Wire,
} from "./wire.ts";

/** Somebody joined by a fresh invite of the owner's, with this role. */
async function joined(owner: Wire, role: "admin" | "member" | "guest", first: string) {
  const { token } = await owner.invite(role);
  const answer = await Wire.redeem(token, aName(first));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.wire as Wire;
}

test("removed, every device of hers is shut and told why, every way back is closed, and every room says she went", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const sockets: Socket[] = [ownerSocket];
  try {
    const natalie = await joined(owner, "member", "Natalie");
    // A second device of hers, by the owner's code for a new phone (ADR 0206).
    const forHer = await owner.ok("POST", "/v1/pairing-codes", { for: natalie.id });
    const phone = await Wire.pair(String(forHer.code));
    // Two rooms she is in, and her words in one.
    const foodie = await roomOf(ownerSocket, `Foodie ${Date.now()}`);
    const books = await roomOf(ownerSocket, `Books ${Date.now()}`);
    for (const room of [foodie, books]) {
      expect((await ownerSocket.send(added(room, natalie)))["frame"]).toBe("ack");
    }
    const laptopSocket = await natalie.socket();
    const phoneSocket = await phone.socket();
    sockets.push(laptopSocket, phoneSocket);
    const words = `My last words here ${Date.now()}`;
    expect((await phoneSocket.send(said(foodie, words)))["frame"]).toBe("ack");
    // Made an owner, she makes an invite: an owner's links go with her.
    expect(
      (await ownerSocket.send({ type: "role.changed", participant_id: natalie.id, role: "owner" }))[
        "frame"
      ],
    ).toBe("ack");
    await laptopSocket.whenClosed();
    await phoneSocket.whenClosed();
    const laptopAgain = await natalie.socket();
    const phoneAgain = await phone.socket();
    sockets.push(laptopAgain, phoneAgain);
    const herLink = await natalie.invite("member");
    // And a code for yet another device of hers, not yet used.
    const unused = await owner.ok("POST", "/v1/pairing-codes", { for: natalie.id });

    const out = await owner.ok("DELETE", `/v1/people/${natalie.id}`);
    expect(out).toMatchObject({
      participant_id: natalie.id,
      already_removed: false,
      devices_withdrawn: 2,
      invites_withdrawn: 1,
    });
    expect([...out.spaces].sort()).toEqual([foodie, books].sort());
    expect(out.sockets_closed).toBeGreaterThanOrEqual(2);

    // Both devices: shut with the removal's own close, then told why at every door.
    for (const [socket, device] of [
      [laptopAgain, natalie],
      [phoneAgain, phone],
    ] as const) {
      expect(await socket.whenClosed()).toEqual({ code: 4003, reason: "person_removed" });
      const asked = await device.call("GET", "/v1/participants");
      expect([asked.status, refusal(asked)]).toEqual([401, "person_removed"]);
      const ticket = await device.socket().catch((error: unknown) => error);
      expect(ticket).toBeInstanceOf(SocketRefused);
      expect(refusal((ticket as SocketRefused).answer)).toBe("person_removed");
    }
    // Every way back closed: the code made for her, her own invite.
    expect((await Wire.tryPair(String(unused.code))).status).toBe(401);
    expect((await Wire.redeem(herLink.token, aName("Friend"))).status).toBe(401);

    // Each room says she was removed from the workspace, by whom; her words stay under her name.
    for (const room of [foodie, books]) {
      const line = await ownerSocket.event(
        (event) =>
          event["type"] === "membership.removed" &&
          event["space_id"] === room &&
          event["participant_id"] === natalie.id,
        `her going from ${room}`,
      );
      expect(line).toMatchObject({ reason: "person_removed", removed_by: owner.id });
    }
    const removedLine = await ownerSocket.event(
      (event) => event["type"] === "person.removed" && event["participant_id"] === natalie.id,
      "person.removed",
    );
    expect(removedLine).toMatchObject({ display_name: natalie.name, removed_by: owner.id });
    const history = await owner.ok("GET", `/v1/events?space_id=${foodie}`);
    const hers = (history.events as Frame[]).find((event) => event["text"] === words);
    expect((hers?.["actor"] as Frame | undefined)?.["id"]).toBe(natalie.id);

    // Removed again: nothing new is written.
    const again = await owner.ok("DELETE", `/v1/people/${natalie.id}`);
    expect(again).toMatchObject({ already_removed: true, spaces: [], devices_withdrawn: 0 });
  } finally {
    for (const socket of sockets) socket.close();
  }
});

test("her harness, and the ask only she could answer, go to whoever removed her", async () => {
  const owner = await Wire.owner();
  const natalie = await joined(owner, "member", "Natalie");
  const herHarness = await registerSpecialist(aName("Recipes"), natalie.id);
  const harness = await Harness.connect(newRunId(), {
    token: herHarness.token,
    space: herHarness.space,
  });
  try {
    expect(await harness.send("run.started", { goal: "Plan the week's dinners." })).toMatchObject({
      frame: "ack",
    });
    const approvalId = newApprovalId();
    const asked = await harness.send("approval.request", {
      approval_id: approvalId,
      action: { kind: "email.send", input: { to: "grocer@example.com" }, external: true },
      preview: { format: "markdown", body: "Ordering the week's vegetables." },
      risk: ["external_communication"],
      expires_in: 3600,
    });
    expect(asked).toMatchObject({ frame: "ack" });

    const out = await owner.ok("DELETE", `/v1/people/${natalie.id}`);
    expect(out.harnesses).toEqual([herHarness.id]);
    expect(out.approvals).toEqual([approvalId]);
    const everyone = await owner.participants();
    expect(everyone.find((each) => each["id"] === herHarness.id)).toMatchObject({
      owner_id: owner.id,
    });
    // The harness is told whose it is now, and that its ask goes to them.
    await harness.waitFor(
      (frame) =>
        (frame["event"] as Frame | undefined)?.["type"] === "harness.transferred" ||
        (frame["event"] as Frame | undefined)?.["type"] === "approval.routed",
      "the harness told",
    );
    // Its token still works: a harness keeps working for its new owner.
    expect(await harness.send("message.post", { text: "Still planning dinners." })).toMatchObject({
      frame: "ack",
    });
  } finally {
    harness.close();
  }
});

test("a phone an admin allowed is let in by nobody once she is removed before it collects", async () => {
  const owner = await Wire.owner();
  const admin = await joined(owner, "admin", "Divya");
  const key = newKey();
  const from = `10.88.${Math.floor(Math.random() * 200)}.${1 + Math.floor(Math.random() * 200)}`;
  const asked = await plain(
    "POST",
    "/v1/join",
    { kind: "device", name: "Divya's phone", public_key: key.publicKey },
    from,
  );
  expect(asked.status).toBe(201);
  const allowed = await admin.call("POST", `/v1/join/${asked.body.request_id}/allow`, {
    code: asked.body.code,
  });
  expect(allowed.status).toBe(200);
  await owner.ok("DELETE", `/v1/people/${admin.id}`);
  const collected = await plain(
    "POST",
    `/v1/join/${asked.body.request_id}/redeem`,
    { secret: asked.body.secret },
    from,
  );
  expect([collected.status, refusal(collected)]).toEqual([403, "denied"]);
});

test("Remove is an owner's or an admin's: never yourself, never an admin on an owner, never a member or a guest", async () => {
  const owner = await Wire.owner();
  const admin = await joined(owner, "admin", "Esha");
  const member = await joined(owner, "member", "Faiz");
  const guest = await joined(owner, "guest", "Gul");
  const target = await joined(owner, "member", "Hema");

  for (const who of [member, guest]) {
    const tried = await who.call("DELETE", `/v1/people/${target.id}`);
    expect([tried.status, refusal(tried)]).toEqual([403, "forbidden"]);
  }
  const onOwner = await admin.call("DELETE", `/v1/people/${owner.id}`);
  expect(onOwner.status).toBe(403);
  expect(onOwner.body.error.message).toBe("An admin does not remove an owner.");
  const self = await owner.call("DELETE", `/v1/people/${owner.id}`);
  expect(self.status).toBe(403);
  expect(self.body.error.message).toBe("You can't remove yourself. Hand the workspace on first.");
  const adminSelf = await admin.call("DELETE", `/v1/people/${admin.id}`);
  expect(adminSelf.status).toBe(403);
  // Nobody by that id, and a harness, are not people to remove.
  const harness = (await owner.participants()).find((each) => each["kind"] === "harness");
  for (const id of ["usr_01K4ZQPX0000000000000000", String(harness?.["id"])]) {
    expect((await owner.call("DELETE", `/v1/people/${id}`)).status).toBe(404);
  }
  // An admin removes a member.
  expect((await admin.call("DELETE", `/v1/people/${target.id}`)).status).toBe(200);
});
