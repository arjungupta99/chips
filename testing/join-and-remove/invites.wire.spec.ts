/**
 * Invites at their edges, on the wire (ADRs 0034, 0168, 0196, 0206): what each role's link makes,
 * that only an owner makes one, a link spent once and only once even when two people race for it,
 * a withdrawn one, a name somebody here has and one somebody removed had, and a room's link: a
 * guest in one room at most, a room archived or left by its maker taking its links with it. The
 * owner and everyone invited are devices the test plays (`wire.ts`), each from an address of its
 * own, so these run in a second each; `join.spec.ts` and `room-links.spec.ts` show the same to a
 * person in a browser.
 */

import { aName, expect, test } from "./support.ts";
import { added, plain, refusal, roomOf, type Socket, Wire } from "./wire.ts";

/** Somebody joined by a fresh invite of the owner's, with this role. */
async function joined(owner: Wire, role: "admin" | "member" | "guest", first: string) {
  const { token } = await owner.invite(role);
  const answer = await Wire.redeem(token, aName(first));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.wire as Wire;
}

test("each role's link makes that role, and nobody but an owner makes, lists or withdraws one", async () => {
  const owner = await Wire.owner();
  for (const role of ["admin", "member", "guest"] as const) {
    const { token } = await owner.invite(role);
    // What the link says before anybody names themselves: the workspace, the role, who sent it.
    const peeked = await plain("POST", "/v1/invites/peek", { token });
    expect(peeked.status).toBe(200);
    expect(peeked.body).toMatchObject({ role, single_use: true, space_id: null });
    const name = aName(role === "admin" ? "Asha" : role === "member" ? "Meera" : "Gita");
    const answer = await Wire.redeem(token, name);
    expect(answer.status, JSON.stringify(answer.body)).toBe(200);
    // A workspace's link is for no space: collected, the answer leaves `space_id` out (ADR 0232).
    expect(answer.body).toMatchObject({ role, display_name: name });
    expect(answer.body.space_id ?? null).toBeNull();
    // The owner's directory has them, with that role.
    const listed = (await owner.participants()).find((each) => each["id"] === answer.wire?.id);
    expect(listed).toMatchObject({ kind: "person", role, display_name: name });
  }

  // Only an owner invites (ADR 0034's addendum): an admin, a member and a guest are each refused
  // making one, listing them and withdrawing the owner's.
  const { id: ownersLink } = await owner.invite("member");
  for (const role of ["admin", "member", "guest"] as const) {
    const somebody = await joined(owner, role, "Ravi");
    const made = await somebody.call("POST", "/v1/invites", { role: "member" });
    expect([made.status, refusal(made)]).toEqual([403, "forbidden"]);
    const asGuest = await somebody.call("POST", "/v1/invites", { role: "guest" });
    expect(asGuest.status).toBe(403);
    const listed = await somebody.call("GET", "/v1/invites");
    expect(listed.status).toBe(403);
    const withdrawn = await somebody.call("DELETE", `/v1/invites/${ownersLink}`);
    expect(withdrawn.status).toBe(403);
  }
  // The owner's link outlived all of that.
  const still = (await owner.ok("GET", "/v1/invites")).invites.find(
    (each: { invite_id: string }) => each.invite_id === ownersLink,
  );
  expect(still).toMatchObject({ revoked_at: null, uses: 0 });
});

test("a single-use link lets in exactly one of two people who race for it, and nobody after", async () => {
  const owner = await Wire.owner();
  const { token, id } = await owner.invite("member");
  const [first, second] = await Promise.all([
    Wire.redeem(token, aName("Kiran")),
    Wire.redeem(token, aName("Tara")),
  ]);
  // Both ask while the link is good, and wait for the owner, who allows both (ADR 0232): the first
  // to collect is let in, and the other is told the link was used by then.
  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([200, 403]);
  const loser = first.status === 403 ? first : second;
  expect(loser.body.error).toMatchObject({
    code: "forbidden",
    message: "The invite was used already. Ask for a new one.",
  });

  // A third, later, asks with a spent link: one answer for spent, withdrawn, expired and never
  // was, so the wire learns nothing (ADR 0034); and the link reads spent in the owner's list.
  const third = await Wire.redeem(token, aName("Uma"));
  expect(third.status).toBe(401);
  expect((await plain("POST", "/v1/invites/peek", { token })).status).toBe(401);
  const row = (await owner.ok("GET", "/v1/invites")).invites.find(
    (each: { invite_id: string }) => each.invite_id === id,
  );
  expect(row).toMatchObject({ uses: 1, single_use: true });
});

test("an open link lets in everyone until it is withdrawn, then nobody, and withdrawing twice finds nothing", async () => {
  const owner = await Wire.owner();
  const { token, id } = await owner.invite("member", { single_use: false });
  for (const first of ["Lata", "Mohan", "Nisha"]) {
    expect((await Wire.redeem(token, aName(first))).status).toBe(200);
  }
  expect(await owner.ok("DELETE", `/v1/invites/${id}`)).toMatchObject({ invite_id: id });
  const after = await Wire.redeem(token, aName("Omar"));
  expect(after.status).toBe(401);
  expect((await plain("POST", "/v1/invites/peek", { token })).status).toBe(401);
  const again = await owner.call("DELETE", `/v1/invites/${id}`);
  expect([again.status, refusal(again)]).toEqual([404, "not_found"]);
});

test("a name somebody here goes by is refused however it is written, says the way back, and leaves the link unspent", async () => {
  const owner = await Wire.owner();
  const natalie = await joined(owner, "member", "Natalie");
  const { token } = await owner.invite("member");
  // Her own name, shouted and spaced out: still hers (JR-1).
  for (const written of [
    natalie.name,
    natalie.name.toUpperCase(),
    `  ${natalie.name.replace(" ", "   ")} `,
  ]) {
    const answer = await Wire.redeem(token, written);
    expect([answer.status, refusal(answer)], written).toEqual([422, "name_taken"]);
    // The way back for a person whose phone is new (ADR 0206), naming who sent the link.
    expect(answer.body.error.message).toContain(`Somebody here goes by ${natalie.name} already.`);
    expect(answer.body.error.message).toContain(
      "to choose Pair a new phone on your page in People.",
    );
  }
  // A blank name is refused too, and also spends nothing.
  expect((await Wire.redeem(token, "   ")).status).toBe(422);
  // The single-use link still lets somebody in under a name of their own.
  const other = await Wire.redeem(token, aName("Pooja"));
  expect(other.status).toBe(200);
});

test("an agent's name is refused for a person, without the new-phone words", async () => {
  const owner = await Wire.owner();
  const { token } = await owner.invite("member");
  // The demo's harness is Scout's (ADR 0087): a person called that would take its @.
  const scout = (await owner.participants()).find(
    (each) => each["kind"] === "agent" || each["kind"] === "harness",
  );
  const agentName = String(scout?.["display_name"]);
  const answer = await Wire.redeem(token, agentName);
  expect([answer.status, refusal(answer)]).toEqual([422, "name_taken"]);
  expect(answer.body.error.message).toBe(`An agent here goes by ${agentName} already.`);
});

test("a removed person's name is free: a new link makes a new person who starts in no room", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  try {
    const first = await joined(owner, "member", "Isha");
    const room = await roomOf(ownerSocket, `Isha's room ${Date.now()}`);
    expect((await ownerSocket.send(added(room, first)))["frame"]).toBe("ack");
    const out = await owner.ok("DELETE", `/v1/people/${first.id}`);
    expect(out).toMatchObject({ already_removed: false, spaces: [room] });

    const { token } = await owner.invite("guest");
    const again = await Wire.redeem(token, first.name);
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const back = again.wire as Wire;
    expect(back.id).not.toBe(first.id);
    expect(again.body).toMatchObject({ display_name: first.name, role: "guest" });
    // In no room: the old one is the old person's.
    const socket = await back.socket();
    try {
      const hello = await socket.event((event) => event["type"] === "hello", "hello");
      expect(hello["spaces"]).toEqual([]);
    } finally {
      socket.close();
    }
    // The old one is still removed, and the directory tells the two apart.
    const everyone = await owner.participants();
    expect(everyone.find((each) => each["id"] === first.id)?.["removed_at"]).not.toBeNull();
    expect(everyone.find((each) => each["id"] === back.id)?.["removed_at"]).toBeNull();
  } finally {
    ownerSocket.close();
  }
});

test("a room's link lets a guest into that room alone, and a guest of one room is refused another's", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const sockets: Socket[] = [ownerSocket];
  try {
    const kitchen = await roomOf(ownerSocket, `Kitchen ${Date.now()}`);
    const garden = await roomOf(ownerSocket, `Garden ${Date.now()}`);
    const kitchenLink = await owner.invite("guest", { space_id: kitchen });
    const gardenLink = await owner.invite("guest", { space_id: garden });
    expect(
      (await plain("POST", "/v1/invites/peek", { token: kitchenLink.token })).body,
    ).toMatchObject({ role: "guest", space_id: kitchen });

    const guestJoin = await Wire.redeem(kitchenLink.token, aName("Gauri"));
    expect(guestJoin.body).toMatchObject({ role: "guest", space_id: kitchen });
    const guest = guestJoin.wire as Wire;
    const guestSocket = await guest.socket();
    sockets.push(guestSocket);
    const hello = await guestSocket.event((event) => event["type"] === "hello", "hello");
    expect(hello["spaces"]).toEqual([kitchen]);

    // The garden's link, opened by the guest already in the kitchen: a guest is in one room at
    // most (Gate 5), and the link stays for whoever it was made for.
    const entered = await guest.call("POST", "/v1/invites/enter", { token: gardenLink.token });
    expect([entered.status, refusal(entered)]).toEqual([403, "forbidden"]);
    expect(entered.body.error.message).toBe("A guest is in one space at most.");
    // Nor may the owner add her there by hand.
    const byHand = await ownerSocket.send(added(garden, guest, "guest"));
    expect(byHand["frame"]).toBe("error");

    // A member already here is let into the garden by its link, which is not spent by it: once
    // in, again says so, and somebody new still joins by it afterwards.
    const member = await joined(owner, "member", "Mira");
    const memberIn = await member.call("POST", "/v1/invites/enter", { token: gardenLink.token });
    expect([memberIn.status, memberIn.body]).toEqual([
      200,
      { space_id: garden, workspace_id: member.device.workspaceId, already: false },
    ]);
    const memberAgain = await member.call("POST", "/v1/invites/enter", { token: gardenLink.token });
    expect(memberAgain.body).toMatchObject({ already: true });
    const newcomer = await Wire.redeem(gardenLink.token, aName("Neel"));
    expect(newcomer.body).toMatchObject({ role: "guest", space_id: garden });

    // A workspace's link is not a room's: somebody in the workspace entering it is told so.
    const workspaceLink = await owner.invite("member");
    const wrongDoor = await member.call("POST", "/v1/invites/enter", {
      token: workspaceLink.token,
    });
    expect(wrongDoor.status).toBe(422);
  } finally {
    for (const socket of sockets) socket.close();
  }
});

test("a room's link goes when its room is archived, or when its maker is no longer in it", async () => {
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  try {
    const shed = await roomOf(ownerSocket, `Shed ${Date.now()}`);
    const attic = await roomOf(ownerSocket, `Attic ${Date.now()}`);
    const shedLink = await owner.invite("guest", { space_id: shed });
    const atticLink = await owner.invite("member", { space_id: attic });

    // Archived: the link is refused, and the owner's list says it was withdrawn.
    const archived = await ownerSocket.send({
      type: "space.updated",
      space_id: shed,
      state: "closed",
    });
    expect(archived["frame"]).toBe("ack");
    expect((await Wire.redeem(shedLink.token, aName("Ojas"))).status).toBe(401);
    // Its maker left: the same.
    const left = await ownerSocket.send({
      type: "membership.removed",
      space_id: attic,
      participant_id: owner.id,
    });
    expect(left["frame"]).toBe("ack");
    expect((await Wire.redeem(atticLink.token, aName("Pari"))).status).toBe(401);

    const listed = (await owner.ok("GET", "/v1/invites")).invites as {
      invite_id: string;
      revoked_at: string | null;
    }[];
    for (const link of [shedLink, atticLink]) {
      expect(listed.find((each) => each.invite_id === link.id)?.revoked_at).not.toBeNull();
    }
    // And no new link is made into a room that would not take anybody.
    const another = await owner.call("POST", "/v1/invites", { role: "guest", space_id: shed });
    expect(another.status).toBe(422);
    // A room's link makes a guest or a member, never an admin.
    const admin = await owner.call("POST", "/v1/invites", { role: "admin", space_id: attic });
    expect(admin.status).toBe(422);
  } finally {
    ownerSocket.close();
  }
});
