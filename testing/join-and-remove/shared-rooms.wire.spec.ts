/**
 * A room shared by people and an agent, at its edges, on the wire (ADRs 0111, 0160, 0198, 0204,
 * 0205, 0216; SH-1). Foodie, 19 October 2026, is the shape: Arjun's agent, Arjun, and Natalie, a member.
 * Her words reach the agent as hers to answer; a message for a person goes to no agent; Everyone
 * goes to every agent and pushes nobody new. Taken out once, a second removal is refused and the
 * room says it once; a retry of the same removal is that removal; two at once, one goes in. Added
 * back, she hears the room again. Leave is hers. Her pushes follow her word for the room: the
 * owner's words reach her whoever they were for until she chooses Only @ you, an @ or a pick
 * reaching her through it, None and a hide keeping her phone quiet; and they are hers alone:
 * nothing she sets changes the owner's. An admin takes anybody out but the workspace's
 * owner (JR-23); a guest whose one room was archived is put in another, and the archived room opens
 * again only once they're out of it (JR-24). The harness is the test's (`Harness`), as Jacobian
 * would be, and the pushes land in the suite's sink.
 */

import { demo, type Frame, Harness, newRunId, registerAgent } from "../../apps/web/e2e/support.ts";
import { aName, expect, test } from "./support.ts";
import {
  added,
  pushedTo,
  pushesTo,
  pushToken,
  removed,
  roomOf,
  type Socket,
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

/** What a harness heard with these words: the event, `message.new` or `message.overheard`. */
function heard(harness: Harness, text: string): Promise<Frame> {
  return harness
    .waitFor(
      (frame) => ((frame["event"] as Frame | undefined)?.["text"] as string | undefined) === text,
      `"${text}" at the harness`,
    )
    .then((frame) => frame["event"] as Frame);
}

interface Foodie {
  readonly owner: Wire;
  readonly ownerSocket: Socket;
  readonly room: string;
  readonly agent: string;
  readonly harness: Harness;
  readonly sockets: Socket[];
}

let rooms = 0;

/** Foodie's shape: a room of the owner's with one agent of the test's harness in it. */
async function foodie(): Promise<Foodie> {
  rooms += 1;
  const owner = await Wire.owner();
  const ownerSocket = await owner.socket();
  const harness = await Harness.connect(newRunId());
  const agent = await registerAgent(demo().harness, `foodie-${Date.now()}-${rooms}`, "Foodie");
  const room = await roomOf(ownerSocket, `Foodie ${Date.now()}-${rooms}`);
  const seated = await ownerSocket.send({
    type: "membership.added",
    space_id: room,
    participant_id: agent,
    participant_kind: "agent",
    role: "member",
  });
  expect(seated["frame"], JSON.stringify(seated)).toBe("ack");
  // The harness learns the room from its agent being put in it.
  await harness.waitFor(
    (frame) =>
      (frame["event"] as Frame | undefined)?.["space_id"] === room &&
      ["membership.added", "agent.attached"].includes(
        String((frame["event"] as Frame | undefined)?.["type"]),
      ),
    "the agent put in Foodie",
  );
  harness.space = room;
  return { owner, ownerSocket, room, agent, harness, sockets: [ownerSocket] };
}

/** Put a person in the room from the owner's socket, and open their own socket. */
async function seat(room: Foodie, who: Wire, role: "member" | "guest" = "member"): Promise<Socket> {
  const answer = await room.ownerSocket.send(added(room.room, who, role));
  expect(answer["frame"], JSON.stringify(answer)).toBe("ack");
  const socket = await who.socket();
  room.sockets.push(socket);
  return socket;
}

function done(room: Foodie): void {
  for (const socket of room.sockets) socket.close();
  room.harness.close();
}

test("Foodie: a member's and a guest's words reach the agent to answer, a message for a person reaches no agent, and Everyone reaches it again", async () => {
  const room = await foodie();
  try {
    const natalie = await joined(room.owner, "member", "Natalie");
    const herSocket = await seat(room, natalie);
    const guest = await joined(room.owner, "guest", "Vikram");
    const guestSocket = await seat(room, guest, "guest");

    // Hers, naming nobody: the room's agent takes a turn on it, and it is hers.
    const hers = `Coffee this afternoon? ${Date.now()}`;
    expect((await herSocket.send(said(room.room, hers)))["frame"]).toBe("ack");
    const asked = await heard(room.harness, hers);
    expect(asked).toMatchObject({ type: "message.new", space_id: room.room });
    // From her, as a member of the room: what a harness that answers its owner's rooms reads.
    expect(asked["from"]).toMatchObject({
      participant_id: natalie.id,
      kind: "person",
      display_name: natalie.name,
      role: "member",
    });
    // For the room's one agent: by its own id, or its harness's to a harness that has not declared
    // agents, as this test's has not.
    expect(asked["addressed_to"]).toHaveLength(1);
    expect([room.agent, demo().harness.id]).toContain((asked["addressed_to"] as string[])[0]);
    // The guest's too.
    const theirs = `Is the patio open? ${Date.now()}`;
    expect((await guestSocket.send(said(room.room, theirs)))["frame"]).toBe("ack");
    const guestAsked = await heard(room.harness, theirs);
    expect(guestAsked).toMatchObject({ type: "message.new" });
    expect(guestAsked["from"]).toMatchObject({ participant_id: guest.id, role: "guest" });

    // For the owner alone (ADR 0204): no agent takes a turn on it; it is overheard, and says whom.
    const forArjun = `How's it going? ${Date.now()}`;
    expect((await herSocket.send(said(room.room, forArjun, [room.owner.id])))["frame"]).toBe("ack");
    const overheard = await heard(room.harness, forArjun);
    expect(overheard).toMatchObject({ type: "message.overheard", addressed_to: [] });
    // The owner's own socket has it with the same address, as the route over it draws.
    const ownerCopy = await room.ownerSocket.event(
      (event) => event["text"] === forArjun,
      "her words on the owner's socket",
    );
    expect(ownerCopy["addressed_people"]).toEqual([room.owner.id]);

    // For the agent and a person at once: the agent takes it, and the person is named.
    const both = `Book a table for us both? ${Date.now()}`;
    const bothAnswer = await herSocket.send(said(room.room, both, [room.agent, room.owner.id]));
    expect(bothAnswer["frame"]).toBe("ack");
    expect(await heard(room.harness, both)).toMatchObject({ type: "message.new" });
    const bothCopy = await room.ownerSocket.event((event) => event["text"] === both, "both");
    expect(bothCopy["addressed_people"]).toEqual([room.owner.id]);

    // Everyone: every agent here, and no person named.
    const everyone = `Dinner at 8, everyone? ${Date.now()}`;
    expect((await herSocket.send(said(room.room, everyone, "all")))["frame"]).toBe("ack");
    expect(await heard(room.harness, everyone)).toMatchObject({ type: "message.new" });
    const all = await room.ownerSocket.event((event) => event["text"] === everyone, "everyone");
    expect(all["addressed_to_all"]).toBe(true);
    expect(all["addressed_people"]).toBeUndefined();

    // Somebody not in the room is no one to send to: the pick keeps only the members.
    const outsider = await joined(room.owner, "member", "Zoya");
    const toOutsider = `Zoya, you there? ${Date.now()}`;
    expect((await herSocket.send(said(room.room, toOutsider, [outsider.id])))["frame"]).toBe("ack");
    const kept = await room.ownerSocket.event((event) => event["text"] === toOutsider, "Zoya's");
    expect(kept["addressed_people"]).toBeUndefined();
  } finally {
    done(room);
  }
});

test("taken out once: a retry is the same removal, a second is refused, the room says it once, and two at once let one in", async () => {
  const room = await foodie();
  try {
    const natalie = await joined(room.owner, "member", "Natalie");
    const herSocket = await seat(room, natalie);
    const key = `take-out-${Date.now()}`;
    expect((await room.ownerSocket.send(removed(room.room, natalie, key)))["frame"]).toBe("ack");
    // Her phone hears it, and her words no longer go in.
    await herSocket.event(
      (event) => event["type"] === "membership.removed" && event["participant_id"] === natalie.id,
      "her removal on her socket",
    );
    const after = await herSocket.send(said(room.room, "Still here?"));
    expect(after["frame"]).toBe("error");

    // The same removal again, as an outbox resends it: answered as the one it is (SH-1).
    expect((await room.ownerSocket.send(removed(room.room, natalie, key)))["frame"]).toBe("ack");
    // A second, of its own: refused, saying why.
    const second = await room.ownerSocket.send(removed(room.room, natalie));
    expect(second).toMatchObject({ frame: "error" });
    expect(String(second["message"])).toMatch(/not in this space any more/i);
    // One line in the room for all of that.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const lines = room.ownerSocket.seen(
      (event) => event["type"] === "membership.removed" && event["participant_id"] === natalie.id,
    );
    expect(lines).toHaveLength(1);

    // Two at once, as three taps on a phone coming back online sent them: one goes in.
    const pari = await joined(room.owner, "member", "Pari");
    await seat(room, pari);
    const answers = await Promise.all([
      room.ownerSocket.send(removed(room.room, pari)),
      room.ownerSocket.send(removed(room.room, pari)),
      room.ownerSocket.send(removed(room.room, pari)),
    ]);
    expect(answers.map((each) => each["frame"]).sort()).toEqual(["ack", "error", "error"]);
  } finally {
    done(room);
  }
});

test("added back after being taken out, she hears the room again, and what she hid stays hidden", async () => {
  const room = await foodie();
  try {
    const natalie = await joined(room.owner, "member", "Natalie");
    const herSocket = await seat(room, natalie);
    // She hides the room from her own list first (ADR 0205).
    expect((await natalie.call("PUT", `/v1/me/hidden-spaces/${room.room}`)).status).toBe(204);
    expect((await room.ownerSocket.send(removed(room.room, natalie)))["frame"]).toBe("ack");
    // Out, the room is none of hers to hide or unhide.
    expect((await natalie.call("DELETE", `/v1/me/hidden-spaces/${room.room}`)).status).toBe(404);

    const back = await room.ownerSocket.send(added(room.room, natalie));
    expect(back["frame"]).toBe("ack");
    await herSocket.event(
      (event) =>
        event["type"] === "membership.added" &&
        event["participant_id"] === natalie.id &&
        (event["seq"] as number) >
          (room.ownerSocket.seen((each) => each["type"] === "membership.removed")[0]?.[
            "seq"
          ] as number),
      "her coming back on her socket",
    );
    const again = `Welcome back ${Date.now()}`;
    expect((await room.ownerSocket.send(said(room.room, again)))["frame"]).toBe("ack");
    await herSocket.event((event) => event["text"] === again, "the room on her socket again");
    // Her words reach the agent again.
    const hers = `Thanks! ${Date.now()}`;
    expect((await herSocket.send(said(room.room, hers)))["frame"]).toBe("ack");
    expect(await heard(room.harness, hers)).toMatchObject({ type: "message.new" });
    // Brought back, the room comes back hidden, as she left it (ADR 0205's consequences).
    expect((await natalie.ok("GET", "/v1/me/hidden-spaces")).spaces).toContain(room.room);
  } finally {
    done(room);
  }
});

test("only the room's owner or an admin takes somebody out; anyone leaves, and the owner hears they left by themselves", async () => {
  const room = await foodie();
  try {
    const natalie = await joined(room.owner, "member", "Natalie");
    const herSocket = await seat(room, natalie);
    const pari = await joined(room.owner, "member", "Pari");
    await seat(room, pari);
    const admin = await joined(room.owner, "admin", "Anand");
    const adminSocket = await seat(room, admin);
    const guest = await joined(room.owner, "guest", "Gita");
    const guestSocket = await seat(room, guest, "guest");

    // A member takes nobody out; a guest neither, and adds nobody.
    expect((await herSocket.send(removed(room.room, pari)))["frame"]).toBe("error");
    expect((await guestSocket.send(removed(room.room, pari)))["frame"]).toBe("error");
    const outsider = await joined(room.owner, "member", "Omkar");
    expect((await guestSocket.send(added(room.room, outsider)))["frame"]).toBe("error");
    // An admin in the room may (ADR 0111).
    expect((await adminSocket.send(removed(room.room, pari)))["frame"]).toBe("ack");
    // But not the workspace's owner, whose agents answer only while he is in it (JR-23): he is
    // still in, and talks there.
    const owned = await adminSocket.send(removed(room.room, room.owner));
    expect([owned["frame"], owned["message"]]).toEqual([
      "error",
      "only an owner of the workspace takes an owner out of a space",
    ]);
    expect(
      (await room.ownerSocket.send(said(room.room, `Still here ${Date.now()}`)))["frame"],
    ).toBe("ack");

    // She leaves by herself: the owner's socket has her going, by nobody.
    expect((await herSocket.send(removed(room.room, natalie)))["frame"]).toBe("ack");
    const left = await room.ownerSocket.event(
      (event) => event["type"] === "membership.removed" && event["participant_id"] === natalie.id,
      "her leaving on the owner's socket",
    );
    expect(left["removed_by"]).toBeUndefined();
    // The guest may leave too.
    expect((await guestSocket.send(removed(room.room, guest)))["frame"]).toBe("ack");
  } finally {
    done(room);
  }
});

test("her pushes follow her word for the room, are hers alone, and a hidden room or a removal keeps her phone quiet", async () => {
  const room = await foodie();
  try {
    const natalie = await joined(room.owner, "member", "Natalie");
    await seat(room, natalie);
    const hers = await pushToken(natalie);
    const owners = await pushToken(room.owner);
    const say = async (text: string, to?: "all" | readonly string[]) => {
      const since = Date.now();
      expect((await room.ownerSocket.send(said(room.room, text, to)))["frame"]).toBe("ack");
      return since;
    };

    // People's messages, the default (ADR 0216): the owner's words push her whoever they were for,
    // his message to the agent as "A new message", a pick of her as "A message for you".
    let since = await say(`Ordinary ${Date.now()}`);
    expect((await pushedTo(hers, room.room, since)).title).toBe("A new message");
    since = await say(`For you ${Date.now()}`, [natalie.id]);
    expect((await pushedTo(hers, room.room, since)).title).toBe("A message for you");
    since = await say(`Everyone ${Date.now()}`, "all");
    expect((await pushedTo(hers, room.room, since)).title).toBe("A new message");
    // Her own words never push her, and reach the owner, on the default too.
    const herSocket = room.sockets.at(-1) as Socket;
    const sinceHers = Date.now();
    expect((await herSocket.send(said(room.room, `Mine ${Date.now()}`)))["frame"]).toBe("ack");
    expect((await pushedTo(owners, room.room, sinceHers)).title).toBe("A new message");
    expect(await pushesTo(hers, room.room, sinceHers)).toHaveLength(0);

    // Only @ you (ADR 0198): an ordinary message pushes her nothing; a pick of her does; Everyone
    // names nobody, so it pushes nobody new (ADR 0204). The owner's word is untouched by hers.
    const settings = { decide: "now", review: "hourly", fyi: "daily", harnesses: {} };
    await natalie.ok("PUT", "/v1/me/notifications", {
      ...settings,
      spaces: { [room.room]: "mentions" },
    });
    since = await say(`Ordinary again ${Date.now()}`);
    expect(await pushesTo(hers, room.room, since)).toHaveLength(0);
    since = await say(`For you again ${Date.now()}`, [natalie.id]);
    expect((await pushedTo(hers, room.room, since)).title).toBe("A message for you");
    since = await say(`Everyone again ${Date.now()}`, "all");
    expect(await pushesTo(hers, room.room, since)).toHaveLength(0);
    const ownerSettings = (await room.owner.ok("GET", "/v1/me/notifications")).settings;
    expect(ownerSettings?.spaces?.[room.room]).toBeUndefined();

    // All: everything here pushes her.
    await natalie.ok("PUT", "/v1/me/notifications", {
      ...settings,
      spaces: { [room.room]: "all" },
    });
    since = await say(`Now everything ${Date.now()}`);
    expect((await pushedTo(hers, room.room, since)).title).toBe("A new message");
    // And her pick of him pushes him as an @.
    const sincePick = Date.now();
    expect(
      (await herSocket.send(said(room.room, `Arjun? ${Date.now()}`, [room.owner.id])))["frame"],
    ).toBe("ack");
    expect((await pushedTo(owners, room.room, sincePick)).title).toBe("A message for you");

    // None: not even a pick of her.
    await natalie.ok("PUT", "/v1/me/notifications", {
      ...settings,
      spaces: { [room.room]: "none" },
    });
    since = await say(`Quiet please ${Date.now()}`, [natalie.id]);
    expect(await pushesTo(hers, room.room, since)).toHaveLength(0);

    // Hidden (ADR 0205): back on All, but hidden, nothing; unhidden, All again.
    await natalie.ok("PUT", "/v1/me/notifications", {
      ...settings,
      spaces: { [room.room]: "all" },
    });
    expect((await natalie.call("PUT", `/v1/me/hidden-spaces/${room.room}`)).status).toBe(204);
    since = await say(`While hidden ${Date.now()}`, [natalie.id]);
    expect(await pushesTo(hers, room.room, since)).toHaveLength(0);
    expect((await natalie.call("DELETE", `/v1/me/hidden-spaces/${room.room}`)).status).toBe(204);
    since = await say(`Unhidden ${Date.now()}`);
    await pushedTo(hers, room.room, since);

    // Taken out of the room: nothing from it reaches her phone, whatever she had set.
    expect((await room.ownerSocket.send(removed(room.room, natalie)))["frame"]).toBe("ack");
    since = await say(`After she went ${Date.now()}`, "all");
    expect(await pushesTo(hers, room.room, since)).toHaveLength(0);
  } finally {
    done(room);
  }
});

test("removed from the workspace, her phone is pushed nothing more, and its token is gone", async () => {
  const room = await foodie();
  try {
    const natalie = await joined(room.owner, "member", "Natalie");
    await seat(room, natalie);
    const hers = await pushToken(natalie);
    const settings = { decide: "now", review: "hourly", fyi: "daily", harnesses: {} };
    await natalie.ok("PUT", "/v1/me/notifications", {
      ...settings,
      spaces: { [room.room]: "all" },
    });
    let since = Date.now();
    expect((await room.ownerSocket.send(said(room.room, `Before ${Date.now()}`)))["frame"]).toBe(
      "ack",
    );
    await pushedTo(hers, room.room, since);

    await room.owner.ok("DELETE", `/v1/people/${natalie.id}`);
    // Put back in the room by hand cannot happen: she is nobody here now.
    expect((await room.ownerSocket.send(added(room.room, natalie)))["frame"]).toBe("error");
    since = Date.now();
    expect((await room.ownerSocket.send(said(room.room, `After ${Date.now()}`)))["frame"]).toBe(
      "ack",
    );
    expect(await pushesTo(hers, room.room, since)).toHaveLength(0);
  } finally {
    done(room);
  }
});

test("a guest whose one room was archived is put in another, and the old room opens only once they're out (JR-24)", async () => {
  const room = await foodie();
  try {
    const guest = await joined(room.owner, "guest", "Gauri");
    const trip = await roomOf(room.ownerSocket, `Trip ${Date.now()}`);
    expect((await room.ownerSocket.send(added(trip, guest, "guest")))["frame"]).toBe("ack");
    const guestOf = async () =>
      (await room.owner.participants()).find((each) => each["id"] === guest.id)?.["guest_of"];
    expect(await guestOf()).toBe(trip);
    const state = (spaceId: string, to: "open" | "closed") =>
      room.ownerSocket.send({ type: "space.updated", space_id: spaceId, state: to });

    // The trip ends: archived, she is in no open room, and Foodie takes her.
    expect((await state(trip, "closed"))["frame"]).toBe("ack");
    expect(await guestOf()).toBeNull();
    const seated = await room.ownerSocket.send(added(room.room, guest, "guest"));
    expect(seated["frame"], JSON.stringify(seated)).toBe("ack");
    expect(await guestOf()).toBe(room.room);

    // The trip unarchived would make her a guest of two: refused, and the room says whom.
    const reopened = await state(trip, "open");
    expect([reopened["frame"], reopened["message"]]).toEqual([
      "error",
      `${guest.name} is a guest in another space now, and a guest is in one at a time: take them out of one first, or make them a member`,
    ]);
    // Out of Foodie, the trip opens, hers again.
    expect((await room.ownerSocket.send(removed(room.room, guest)))["frame"]).toBe("ack");
    expect((await state(trip, "open"))["frame"]).toBe("ack");
    expect(await guestOf()).toBe(trip);
  } finally {
    done(room);
  }
});
