/**
 * Join requests at their edges, on the wire (ADR 0122, ADR 0206): a device on the network asks,
 * shows a code, and collects a key once an owner or admin allows it with that code. Collected
 * before the decision it waits; after a no it is refused; twice, it is spent. An owner may allow
 * it as somebody already here, whose phone is new; nobody else may, and somebody removed, or an
 * allower no longer one, between the allow and the collecting pairs nothing. `a-new-phone.spec.ts`
 * N2 shows the owner's dialog for the same.
 */

import { createHash, randomBytes } from "node:crypto";
import { aName, expect, test } from "./support.ts";
import { type Answer, newKey, plain, refusal, Wire } from "./wire.ts";

/**
 * The check a device that committed shows (ADR 0278), worked out here as a phone would, from the
 * ADR's words rather than the protocol package: the SHA-256 of both keys and both nonces, its first
 * thirty bits as six characters of the pairing alphabet.
 */
function checkCode(parts: readonly string[]): string {
  const digest = createHash("sha256")
    .update(["chips join check v1", ...parts].join("\n"), "utf8")
    .digest();
  const bits = digest.readUInt32BE(0) >>> 2;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const six = [0, 1, 2, 3, 4, 5].map((i) => alphabet.charAt((bits >>> (25 - 5 * i)) & 31));
  return `${six.slice(0, 3).join("")}-${six.slice(3).join("")}`;
}

let lan = 0;
/** An address on the server's own network, as a device that may ask has: one each. */
function onTheNetwork(): string {
  lan += 1;
  return `10.77.${Math.floor(lan / 200) + Math.floor(Math.random() * 50)}.${1 + (lan % 200)}`;
}

interface Asked {
  readonly id: string;
  readonly secret: string;
  readonly code: string;
  readonly key: ReturnType<typeof newKey>;
  readonly from: string;
}

/** A device asks to join, from the network, and is answered with a code and a secret. */
async function ask(name = "iPhone 16"): Promise<Asked> {
  const key = newKey();
  const from = onTheNetwork();
  const answer = await plain(
    "POST",
    "/v1/join",
    { kind: "device", name, public_key: key.publicKey },
    from,
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  return {
    id: String(answer.body.request_id),
    secret: String(answer.body.secret),
    code: String(answer.body.code),
    key,
    from,
  };
}

/** The device asks whether it was let in, with its secret. */
function collect(asked: Asked): Promise<Answer> {
  return plain("POST", `/v1/join/${asked.id}/redeem`, { secret: asked.secret }, asked.from);
}

/** Somebody joined by a fresh invite of the owner's, with this role. */
async function joined(owner: Wire, role: "admin" | "member" | "guest", first: string) {
  const { token } = await owner.invite(role);
  const answer = await Wire.redeem(token, aName(first));
  expect(answer.status, JSON.stringify(answer.body)).toBe(200);
  return answer.wire as Wire;
}

/** The key a device collected, as a device of its own: its requests are signed by it. */
function deviceFrom(asked: Asked, body: Record<string, unknown>): Wire {
  return Wire.of(body, asked.key.privateKey, asked.from);
}

/** What waits on this server is withdrawn, so the next test finds room for five (JOIN_WAITING_MAX). */
test.afterEach(async () => {
  const owner = await Wire.owner();
  const waiting = await owner.ok("GET", "/v1/join?state=waiting");
  for (const request of waiting.requests as { request_id: string }[]) {
    await owner.call("DELETE", `/v1/join/${request.request_id}`);
  }
});

test("a device that commits to a nonce works its code out with the server, and the code from another key lets nobody in (ADR 0278)", async () => {
  const owner = await Wire.owner();
  const phone = newKey();
  const from = onTheNetwork();
  const nonce = randomBytes(32).toString("base64url");
  const commit = createHash("sha256")
    .update(`chips join commit v1\n${nonce}`, "utf8")
    .digest("base64url");
  // Somebody between the phone and the computer passes the phone's commitment on with their key.
  const theirs = newKey();
  const answer = await plain(
    "POST",
    "/v1/join",
    { kind: "device", name: "iPhone 17", public_key: theirs.publicKey, commit },
    from,
  );
  expect(answer.status, JSON.stringify(answer.body)).toBe(201);
  expect(answer.body.code).toBeUndefined();
  const serverKey = String(answer.body.server_key);
  const serverNonce = String(answer.body.nonce);
  const id = String(answer.body.request_id);
  const secret = String(answer.body.secret);
  const poll = () => plain("POST", `/v1/join/${id}/redeem`, { secret, nonce }, from);
  expect((await poll()).status).toBe(202);
  const codeOf = (publicKey: string) => checkCode([publicKey, serverKey, nonce, serverNonce]);
  // The phone shows the code from its own key; typed, it lets nobody in.
  const typed = await owner.call("POST", `/v1/join/${id}/allow`, { code: codeOf(phone.publicKey) });
  expect([typed.status, refusal(typed)]).toEqual([422, "wrong_code"]);
  // Only the code from the key in the request would, which no phone of the person's shows.
  const allowed = await owner.call("POST", `/v1/join/${id}/allow`, {
    code: codeOf(theirs.publicKey),
  });
  expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  const collected = await poll();
  expect(collected.status).toBe(200);
  expect(collected.body.server_key).toBe(serverKey);
});

test("a device is let in only with the code it shows, waits until then, and collects its key once", async () => {
  const owner = await Wire.owner();
  const asked = await ask();
  // Before anybody decides, it waits.
  const early = await collect(asked);
  expect([early.status, early.body]).toEqual([202, { state: "waiting", interval: 3 }]);
  // The owner's view of it never shows the code: it is the device's to show (SEC-6).
  const seen = await owner.ok("GET", `/v1/join/${asked.id}`);
  expect(seen.request).toMatchObject({ kind: "device", state: "waiting", name: "iPhone 16" });
  expect(seen.request.code).toBeUndefined();

  // Nobody but an owner or admin decides; and they decide with the code typed, or not at all.
  for (const role of ["member", "guest"] as const) {
    const somebody = await joined(owner, role, "Hari");
    const tried = await somebody.call("POST", `/v1/join/${asked.id}/allow`, { code: asked.code });
    expect([tried.status, refusal(tried)]).toEqual([403, "not_allowed"]);
    const denied = await somebody.call("DELETE", `/v1/join/${asked.id}`);
    expect(denied.status).toBe(403);
  }
  const blank = await owner.call("POST", `/v1/join/${asked.id}/allow`, {});
  expect([blank.status, refusal(blank)]).toEqual([422, "wrong_code"]);
  const wrong = await owner.call("POST", `/v1/join/${asked.id}/allow`, { code: "AAA-AAA" });
  expect([wrong.status, refusal(wrong)]).toEqual([422, "wrong_code"]);
  expect((await collect(asked)).status).toBe(202);

  // Typed as a person types it: lower case, no dash.
  const typed = asked.code.replace("-", "").toLowerCase();
  const allowed = await owner.call("POST", `/v1/join/${asked.id}/allow`, { code: typed });
  expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  expect(allowed.body.request).toMatchObject({ state: "allowed", decided_by: owner.id });
  expect(allowed.body.request.pair_as).toBeUndefined();
  const twice = await owner.call("POST", `/v1/join/${asked.id}/allow`, { code: asked.code });
  expect([twice.status, refusal(twice)]).toEqual([403, "decided"]);

  const collected = await collect(asked);
  expect(collected.status).toBe(200);
  expect(collected.body).toMatchObject({ kind: "device", participant_id: owner.id });
  // The key it collected signs requests the server takes.
  const device = deviceFrom(asked, collected.body);
  expect((await device.call("GET", "/v1/participants")).status).toBe(200);
  // Collected again: spent.
  const again = await collect(asked);
  expect([again.status, refusal(again)]).toEqual([403, "spent"]);
  // A wrong secret is no request at all.
  const forged = await plain("POST", `/v1/join/${asked.id}/redeem`, { secret: "nope" }, asked.from);
  expect(forged.status).toBe(401);
});

test("a device refused is told so when it collects, and the no can't be taken back", async () => {
  const owner = await Wire.owner();
  const asked = await ask("Tablet");
  const no = await owner.call("DELETE", `/v1/join/${asked.id}`);
  expect([no.status, no.body.request.state]).toEqual([200, "denied"]);
  const collected = await collect(asked);
  expect([collected.status, refusal(collected)]).toEqual([403, "denied"]);
  const allowed = await owner.call("POST", `/v1/join/${asked.id}/allow`, { code: asked.code });
  expect([allowed.status, refusal(allowed)]).toEqual([403, "denied"]);
  const again = await owner.call("DELETE", `/v1/join/${asked.id}`);
  expect([again.status, refusal(again)]).toEqual([403, "denied"]);
});

test("an ask past its ten minutes is expired, at the allow and at the collecting", async () => {
  const owner = await Wire.owner();
  const asked = await ask("Old phone");
  // The join clock, ahead by the code's ten minutes and a second (dev mode only).
  const moved = await plain("POST", "/v1/dev/join-clock", { advance_seconds: 601 });
  expect(moved.status).toBe(200);
  const allowed = await owner.call("POST", `/v1/join/${asked.id}/allow`, { code: asked.code });
  expect([allowed.status, refusal(allowed)]).toEqual([403, "expired"]);
  const collected = await collect(asked);
  expect([collected.status, refusal(collected)]).toEqual([403, "expired"]);
});

test("an owner allows a device as somebody already here, and the key it collects is theirs", async () => {
  const owner = await Wire.owner();
  const natalie = await joined(owner, "member", "Natalie");
  const asked = await ask("Natalie's iPhone");
  const allowed = await owner.call("POST", `/v1/join/${asked.id}/allow`, {
    code: asked.code,
    as: natalie.id,
  });
  expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
  expect(allowed.body.request).toMatchObject({ state: "allowed", pair_as: natalie.id });

  const collected = await collect(asked);
  expect(collected.status, JSON.stringify(collected.body)).toBe(200);
  expect(collected.body).toMatchObject({
    kind: "device",
    participant_id: natalie.id,
    display_name: natalie.name,
  });
  // Her own device: You on it is her.
  const phone = deviceFrom(asked, collected.body);
  const me = (await phone.participants()).find((each) => each["id"] === natalie.id);
  expect(me).toMatchObject({ display_name: natalie.name, role: "member" });
  // The old device of hers still speaks for her: a new phone takes nothing from it.
  expect((await natalie.call("GET", "/v1/participants")).status).toBe(200);
});

test("pair it as is an owner's, and only for somebody here who is a person", async () => {
  const owner = await Wire.owner();
  const admin = await joined(owner, "admin", "Anil");
  const member = await joined(owner, "member", "Bina");
  const asked = await ask("Bina's iPad");

  // An admin pairs only as themselves: one who could pair a phone as a member could read as them.
  const byAdmin = await admin.call("POST", `/v1/join/${asked.id}/allow`, {
    code: asked.code,
    as: member.id,
  });
  expect([byAdmin.status, refusal(byAdmin)]).toEqual([403, "not_allowed"]);

  // Somebody who isn't a person here: an agent, an id nobody has, somebody removed.
  const agent = (await owner.participants()).find((each) => each["kind"] === "agent");
  const gone = await joined(owner, "member", "Chitra");
  await owner.ok("DELETE", `/v1/people/${gone.id}`);
  for (const as of [String(agent?.["id"]), "usr_01K4ZQPX0000000000000000", gone.id]) {
    const tried = await owner.call("POST", `/v1/join/${asked.id}/allow`, { code: asked.code, as });
    expect([tried.status, refusal(tried)], as).toEqual([422, "invalid"]);
  }
  // Still waiting after all of that, and an owner naming themselves is the plain allow.
  expect((await collect(asked)).status).toBe(202);
  const self = await owner.call("POST", `/v1/join/${asked.id}/allow`, {
    code: asked.code,
    as: owner.id,
  });
  expect(self.status).toBe(200);
  expect(self.body.request.pair_as).toBeUndefined();
  expect((await collect(asked)).body).toMatchObject({ participant_id: owner.id });

  // A harness joins as the person who allows it, never as anybody else.
  const harness = await plain(
    "POST",
    "/v1/join",
    { kind: "harness", name: "Hermes on the Mini", wants: [] },
    onTheNetwork(),
  );
  expect(harness.status).toBe(201);
  const asHer = await owner.call("POST", `/v1/join/${harness.body.request_id}/allow`, {
    as: member.id,
  });
  expect([asHer.status, refusal(asHer)]).toEqual([422, "invalid"]);
  expect(asHer.body.error.message).toBe("A harness joins as the person who allows it.");
});

test("the person chosen is removed before the phone collects: refused as denied, every time, and nothing is paired", async () => {
  const owner = await Wire.owner();
  const natalie = await joined(owner, "member", "Natalie");
  const asked = await ask("Natalie's iPhone");
  const allowed = await owner.call("POST", `/v1/join/${asked.id}/allow`, {
    code: asked.code,
    as: natalie.id,
  });
  expect(allowed.status).toBe(200);
  await owner.ok("DELETE", `/v1/people/${natalie.id}`);

  const collected = await collect(asked);
  expect([collected.status, refusal(collected)]).toEqual([403, "denied"]);
  // Asked again, the same answer: nothing was spent, so it never reads as used.
  const again = await collect(asked);
  expect([again.status, refusal(again)]).toEqual([403, "denied"]);
  // No device of hers was made, nor of the owner's.
  const view = await owner.ok("GET", `/v1/join/${asked.id}`);
  expect(view.request.device_id).toBeUndefined();
});

test("an admin no longer an admin when the phone collects: the allow is good for nothing", async () => {
  const owner = await Wire.owner();
  const admin = await joined(owner, "admin", "Dilip");
  const asked = await ask("Dilip's phone");
  const allowed = await admin.call("POST", `/v1/join/${asked.id}/allow`, { code: asked.code });
  expect(allowed.status).toBe(200);
  // The owner makes him a member before the phone collects.
  const socket = await owner.socket();
  try {
    const demoted = await socket.send({
      type: "role.changed",
      participant_id: admin.id,
      role: "member",
    });
    expect(demoted["frame"]).toBe("ack");
  } finally {
    socket.close();
  }
  const collected = await collect(asked);
  expect([collected.status, refusal(collected)]).toEqual([403, "denied"]);
});
