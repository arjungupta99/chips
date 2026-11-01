/**
 * Join requests over the wire (ADR 0122): the doors with no credential, the ones for people who
 * decide, the refusals a connector can act on, and the frame an owner's socket hears.
 */

import { generateKeyPairSync } from "node:crypto";
import { parseJoinLink } from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

let ws: TestWorkspace;
const BASE = "http://chips.local";

beforeEach(async () => {
  ws = await createTestWorkspace();
});
afterEach(async () => {
  await ws.close();
});

async function open(
  method: string,
  path: string,
  body: unknown,
  env?: { relay: { from: string } } | { lan: { from: string } },
): Promise<Response> {
  return await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

async function as(
  who: TestPerson,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return await ws.gateway.app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...who.sign(method, path, raw) },
      ...(raw === "" ? {} : { body: raw }),
    }),
  );
}

async function socketOf(who: TestPerson, port: number, accepts: string[]) {
  const ticket = await who.socketTicket();
  const socket = new WebSocket(`ws://127.0.0.1:${port}/v1/ws?ticket=${encodeURIComponent(ticket)}`);
  const frames: Record<string, unknown>[] = [];
  socket.on("message", (data) => frames.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  socket.send(
    JSON.stringify({
      frame: "hello",
      protocol: { min: 1, max: 1 },
      client: { name: "test", version: "0" },
      accepts,
    }),
  );
  for (let i = 0; i < 100 && frames.length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return { socket, frames };
}

const joinFrames = (frames: Record<string, unknown>[]) =>
  frames.filter((frame) => frame["frame"] === "join");

describe("a harness asks, and an owner allows it", () => {
  it("is answered with a code and a secret, polls, and collects a key that works", async () => {
    const asked = await open("POST", "/v1/join", {
      name: "Tide",
      software: "tide 0.4.1",
      wants: ["autonomy", "restarts"],
    });
    expect(asked.status).toBe(201);
    const { request_id, secret, code, interval, expires_in } = (await asked.json()) as Record<
      string,
      string
    >;
    expect({ interval, expires_in }).toEqual({ interval: 3, expires_in: 600 });
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    const waiting = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(waiting.status).toBe(202);
    expect(await waiting.json()).toEqual({ state: "waiting", interval: 3 });

    const listed = await as(ws.arjun, "GET", "/v1/join?state=waiting");
    const { requests } = (await listed.json()) as { requests: Record<string, unknown>[] };
    expect(requests).toEqual([
      expect.objectContaining({ request_id, code, name: "Tide", wants: ["autonomy", "restarts"] }),
    ]);
    expect(JSON.stringify(requests)).not.toContain(secret);
    // A member decides only the links they handed out (ADR 0232): none of a harness's.
    const danas = await as(ws.dana, "GET", "/v1/join");
    expect(danas.status).toBe(200);
    expect(await danas.json()).toEqual({ requests: [] });

    const allowed = await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: ["autonomy"],
    });
    expect(allowed.status).toBe(200);

    const collected = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(collected.status).toBe(200);
    const joined = (await collected.json()) as Record<string, unknown>;
    expect(joined).toMatchObject({ kind: "harness", url: BASE, capabilities: ["autonomy"] });
    const participants = await ws.gateway.app.fetch(
      new Request(`${BASE}/v1/participants`, {
        headers: { authorization: `Bearer ${String(joined["token"])}` },
      }),
    );
    expect(participants.status).toBe(200);

    const again = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(again.status).toBe(403);
    expect(((await again.json()) as { error: Record<string, unknown> }).error).toMatchObject({
      code: "forbidden",
      refusal: "spent",
    });
  });

  it("tells an owner's socket that hears it, and nobody else's", async () => {
    const { port } = await ws.gateway.listen();
    const owner = await socketOf(ws.arjun, port, ["events", "join"]);
    const deaf = await socketOf(ws.arjun, port, ["events"]);
    const member = await socketOf(ws.dana, port, ["events", "join"]);

    const asked = await open("POST", "/v1/join", { name: "Tide" });
    const { request_id } = (await asked.json()) as { request_id: string };
    for (let i = 0; i < 100 && joinFrames(owner.frames).length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(joinFrames(owner.frames)).toEqual([
      { frame: "join", request: expect.objectContaining({ request_id, state: "waiting" }) },
    ]);

    await as(ws.arjun, "DELETE", `/v1/join/${request_id}`);
    for (let i = 0; i < 100 && joinFrames(owner.frames).length < 2; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(joinFrames(owner.frames).at(-1)).toMatchObject({ request: { state: "denied" } });
    expect(joinFrames(deaf.frames)).toEqual([]);
    expect(joinFrames(member.frames)).toEqual([]);
    for (const each of [owner, deaf, member]) each.socket.close();
  });
});

describe("what came of a request, in the log", () => {
  it("is read by people who see the directory, and never by a harness or a guest", async () => {
    const guest = await ws.addPerson("Vendor", "guest");
    const asked = await open("POST", "/v1/join", { name: "Tide" });
    const { request_id } = (await asked.json()) as { request_id: string };
    await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, { capabilities: [] });

    const types = async (headers: Record<string, string>) => {
      const read = await ws.gateway.app.fetch(
        new Request(`${BASE}/v1/events?since=0&limit=500`, { headers }),
      );
      const { events } = (await read.json()) as { events: { type: string }[] };
      return events.map((event) => event.type);
    };
    const path = "/v1/events?since=0&limit=500";
    expect(await types(ws.arjun.sign("GET", path, ""))).toContain("join.allowed");
    expect(await types(ws.dana.sign("GET", path, ""))).toContain("join.allowed");
    expect(await types(guest.sign("GET", path, ""))).not.toContain("join.allowed");
    expect(await types(ws.scout.headers)).not.toContain("join.allowed");
  });
});

describe("where a request came from, on the relay's word (SEC-27)", () => {
  it("is put on the card when it is an address, and left off when it is not", async () => {
    const named = await open(
      "POST",
      "/v1/join",
      { name: "Kit" },
      { relay: { from: "203.0.113.5" } },
    );
    expect(named.status).toBe(201);
    const unnamed = await open("POST", "/v1/join", { name: "Kai" }, { relay: { from: "unknown" } });
    expect(unnamed.status).toBe(201);
    const listed = await as(ws.arjun, "GET", "/v1/join?state=waiting");
    const cards = ((await listed.json()) as { requests: Record<string, unknown>[] }).requests;
    expect(cards.find((card) => card["name"] === "Kit")?.["from_addr"]).toBe("203.0.113.5");
    expect(cards.find((card) => card["name"] === "Kai")?.["from_addr"]).toBeUndefined();
  });
});

describe("where a harness is told Chips is", () => {
  const PUBLIC = "https://mini.tail0000.ts.net";

  /**
   * A harness asks at `base` with `headers`, over a socket from `peer`, and is allowed: the
   * address the key it collects names, which is where the SDK keeps Chips.
   */
  async function answeredAt(
    at: TestWorkspace,
    base: string,
    via: { peer?: string; headers?: Record<string, string>; relay?: string },
  ): Promise<unknown> {
    const env =
      via.relay !== undefined
        ? { relay: { from: via.relay } }
        : via.peer === undefined
          ? undefined
          : { incoming: { socket: { remoteAddress: via.peer } } };
    const post = (path: string, body: unknown) =>
      at.gateway.app.fetch(
        new Request(`${base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...via.headers },
          body: JSON.stringify(body),
        }),
        env,
      );
    const asked = await post("/v1/join", { name: "Tide" });
    expect(asked.status).toBe(201);
    const { request_id, secret } = (await asked.json()) as Record<string, string>;
    const path = `/v1/join/${request_id}/allow`;
    const raw = JSON.stringify({ capabilities: [] });
    const allowed = await at.gateway.app.fetch(
      new Request(`${BASE}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...at.arjun.sign("POST", path, raw) },
        body: raw,
      }),
    );
    expect(allowed.status).toBe(200);
    const collected = await post(`/v1/join/${request_id}/redeem`, { secret });
    expect(collected.status).toBe(200);
    return ((await collected.json()) as Record<string, unknown>)["url"];
  }

  it("is the address it asked at on this machine, and the public address from anywhere else", async () => {
    const at = await createTestWorkspace({ config: { server: { publicUrl: PUBLIC } as never } });
    try {
      // Beside the server, straight to the port: the address it used, tailnet up or down.
      expect(await answeredAt(at, "http://127.0.0.1:4431", { peer: "127.0.0.1" })).toBe(
        "http://127.0.0.1:4431",
      );
      expect(await answeredAt(at, "http://localhost:4431", { peer: "::1" })).toBe(
        "http://localhost:4431",
      );
      // Through Tailscale Serve, which reaches the port from loopback and says it forwarded.
      expect(
        await answeredAt(at, "http://mini.tail0000.ts.net", {
          peer: "127.0.0.1",
          headers: { "x-forwarded-for": "100.101.102.103" },
        }),
      ).toBe(PUBLIC);
      // A loopback peer that asked for another host is a proxy that did not say so: not local.
      expect(await answeredAt(at, "http://mini.tail0000.ts.net", { peer: "127.0.0.1" })).toBe(
        PUBLIC,
      );
      // Another machine, and the relay, are told the public address.
      expect(await answeredAt(at, "http://192.168.1.20:4431", { peer: "192.168.1.30" })).toBe(
        PUBLIC,
      );
      expect(await answeredAt(at, "http://127.0.0.1:4431", { relay: "203.0.113.5" })).toBe(
        at.gateway.deps.reachableUrl(),
      );
    } finally {
      await at.close();
    }
  });
});

describe("the refusals a connector can act on", () => {
  it("names the rule: a device through the relay, a sixth waiting, a wrong secret", async () => {
    const key = "MCowBQYDK2VwAyEAr3z7c4a2j8mPqZ0y1xW9n4kL2vB6dF8hJ0sT5uY7wE0=";
    const relayed = await open(
      "POST",
      "/v1/join",
      { kind: "device", name: "Pixel 9", public_key: key },
      { relay: { from: "192.168.1.41" } },
    );
    expect(relayed.status).toBe(403);
    expect(((await relayed.json()) as { error: Record<string, unknown> }).error["refusal"]).toBe(
      "not_here",
    );

    for (let i = 0; i < 5; i += 1) {
      expect((await open("POST", "/v1/join", { name: `Asker ${i}` })).status).toBe(201);
    }
    const sixth = await open("POST", "/v1/join", { name: "Asker 6" });
    expect(sixth.status).toBe(429);
    expect(((await sixth.json()) as { error: Record<string, unknown> }).error["refusal"]).toBe(
      "too_many",
    );

    const wrong = await open("POST", "/v1/join/jrq_01K4ZQPX00000000000000000Z/redeem", {
      secret: "chips_j_guessed",
    });
    expect(wrong.status).toBe(401);
  });

  it("takes a device through the tunnel door on this network as it takes one on the port (ADR 0191)", async () => {
    const key = "MCowBQYDK2VwAyEAr3z7c4a2j8mPqZ0y1xW9n4kL2vB6dF8hJ0sT5uY7wE0=";
    const atHome = await open(
      "POST",
      "/v1/join",
      { kind: "device", name: "Pixel 9", public_key: key },
      { lan: { from: "192.168.1.41" } },
    );
    expect(atHome.status).toBe(201);
    expect(((await atHome.json()) as Record<string, unknown>)["code"]).toMatch(
      /^[A-Z2-9]{3}-[A-Z2-9]{3}$/,
    );
    // The door's peer is still judged: an address off the network is not here.
    const afar = await open(
      "POST",
      "/v1/join",
      { kind: "device", name: "Pixel 9", public_key: key },
      { lan: { from: "8.8.8.8" } },
    );
    expect(afar.status).toBe(403);
    expect(((await afar.json()) as { error: Record<string, unknown> }).error["refusal"]).toBe(
      "not_here",
    );
  });
});

describe("a device asks from the network, and its code is typed to allow it (SEC-6)", () => {
  it("is allowed with the code it was given and not without, and the owner's view never shows it", async () => {
    const { port } = await ws.gateway.listen();
    const key = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "der" })
      .toString("base64");
    const asked = await fetch(`http://127.0.0.1:${port}/v1/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "device", name: "Arjun's iPad", public_key: key }),
    });
    expect(asked.status).toBe(201);
    const { request_id, secret, code } = (await asked.json()) as Record<string, string>;
    expect(code).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);

    const listed = (await (await as(ws.arjun, "GET", "/v1/join")).json()) as {
      requests: Record<string, unknown>[];
    };
    expect(listed.requests.find((each) => each["request_id"] === request_id)).not.toHaveProperty(
      "code",
    );

    const silent = await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, { capabilities: [] });
    expect(silent.status).toBe(422);
    expect(((await silent.json()) as { error: Record<string, unknown> }).error["refusal"]).toBe(
      "wrong_code",
    );
    const wrong = await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code: "ZZZ-ZZZ",
    });
    expect(wrong.status).toBe(422);

    const allowed = await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code: code?.toLowerCase(),
    });
    expect(allowed.status).toBe(200);
    expect(
      ((await allowed.json()) as { request: Record<string, unknown> }).request,
    ).not.toHaveProperty("code");
    const redeemed = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toMatchObject({
      kind: "device",
      participant_id: ws.arjun.participantId,
    });
  });

  it("slows an address whose asks could not be taken, as the pairing door does", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await open("POST", "/v1/join", {})).status);
    expect(statuses).toEqual([422, 422, 422, 422, 422, 429]);
  });
});

describe("a phone that asks is paired as somebody already here (ADR 0206)", () => {
  /** A phone asks on this network, as a reinstalled one does from Welcome's Ask to join. */
  async function phoneAsks() {
    const { port } = await ws.gateway.listen();
    const key = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "der" })
      .toString("base64");
    const asked = await fetch(`http://127.0.0.1:${port}/v1/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "device", name: "iPhone 16", public_key: key }),
    });
    return (await asked.json()) as { request_id: string; secret: string; code: string };
  }

  it("pairs Natalie's new phone as her when the owner allows it as her, and logs whom", async () => {
    const { request_id, secret, code } = await phoneAsks();
    const allowed = await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code,
      as: ws.dana.participantId,
    });
    expect(allowed.status).toBe(200);
    expect(((await allowed.json()) as { request: Record<string, unknown> }).request).toMatchObject({
      pair_as: ws.dana.participantId,
    });
    const redeemed = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(await redeemed.json()).toMatchObject({
      kind: "device",
      participant_id: ws.dana.participantId,
      display_name: "Dana",
    });
    const audit = await ws.db
      .selectFrom("events")
      .select("payload")
      .where("type", "=", "join.allowed")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(String(audit.payload))).toMatchObject({
      by: ws.arjun.participantId,
      pair_as: ws.dana.participantId,
    });
  });

  it("is the allower's own when they name themselves", async () => {
    const { request_id, secret, code } = await phoneAsks();
    await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code,
      as: ws.arjun.participantId,
    });
    const redeemed = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(await redeemed.json()).toMatchObject({ participant_id: ws.arjun.participantId });
  });

  it("refuses an admin who names somebody else, and somebody not here", async () => {
    const admin = await ws.addPerson("Priya", "admin");
    const { request_id, code } = await phoneAsks();
    const byAdmin = await as(admin, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code,
      as: ws.dana.participantId,
    });
    expect(byAdmin.status).toBe(403);
    const nobody = await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code,
      as: ws.scout.participantId,
    });
    expect(nobody.status).toBe(422);
  });

  it("refuses the pairing when the person chosen was taken out before the phone collected it", async () => {
    const { request_id, secret, code } = await phoneAsks();
    await as(ws.arjun, "POST", `/v1/join/${request_id}/allow`, {
      capabilities: [],
      code,
      as: ws.dana.participantId,
    });
    expect(
      (await as(ws.arjun, "DELETE", `/v1/people/${ws.dana.participantId}`)).status,
    ).toBeLessThan(300);
    const redeemed = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(redeemed.status).toBe(403);
    expect(((await redeemed.json()) as { error: { refusal: string } }).error.refusal).toBe(
      "denied",
    );
    // Asked again, the same: nothing was spent, so it never says it was used (JR-21).
    const again = await open("POST", `/v1/join/${request_id}/redeem`, { secret });
    expect(again.status).toBe(403);
    expect(((await again.json()) as { error: { refusal: string } }).error.refusal).toBe("denied");
  });
});

describe("a link an owner makes", () => {
  it("carries the server's address and the secret, works once, and opened in a browser says what it is", async () => {
    const made = await as(ws.arjun, "POST", "/v1/join/links", {
      capabilities: ["new_spaces"],
    });
    expect(made.status).toBe(201);
    const { link, request } = (await made.json()) as {
      link: string;
      request: Record<string, unknown>;
    };
    expect(request).toMatchObject({
      state: "allowed",
      started_by: "person",
      capabilities: ["new_spaces"],
    });
    const parsed = parseJoinLink(link);
    expect(parsed?.url).toBe(ws.gateway.deps.reachableUrl());
    if (parsed === undefined) throw new Error("not a link");

    const page = await ws.gateway.app.fetch(new Request(`${BASE}/j/${parsed.secret}`));
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("good once");

    const joined = await open("POST", "/v1/join/redeem", {
      secret: parsed.secret,
      name: "Kit",
      machine: "vps-fra-1",
    });
    expect(joined.status).toBe(200);
    expect(await joined.json()).toMatchObject({ kind: "harness", capabilities: ["new_spaces"] });
    const twice = await open("POST", "/v1/join/redeem", { secret: parsed.secret, name: "Kit" });
    expect(twice.status).toBe(403);

    const card = await as(ws.arjun, "GET", `/v1/join/${String(request["request_id"])}`);
    expect(((await card.json()) as { request: Record<string, unknown> }).request).toMatchObject({
      state: "redeemed",
      name: "Kit",
      machine: "vps-fra-1",
    });
    expect((await as(ws.dana, "POST", "/v1/join/links", {})).status).toBe(403);
  });
});
