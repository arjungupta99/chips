/**
 * `/v1/me/push-token`, and a decision going all the way to a push (M4.3, ADR 0045).
 *
 * The second half is the one that matters: a real gateway, a real approval raised by a real
 * harness, and a stub standing in for Expo's service, so that what is asserted is the body that
 * would actually leave the machine. It carries two ids and two fixed words. It does not carry
 * the action, the preview, the harness's name or the room's title — the same assertion the
 * relay tests make about a capture, made here about a push.
 */

import { createDecipheriv, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestWorkspace,
  type TestPerson,
  type TestWorkspace,
} from "../../../testing/workspace.js";

/** What the stub was handed, one entry per request. */
let received: unknown[];
let stub: Server;
let stubUrl: string;
let ws: TestWorkspace;

beforeEach(async () => {
  received = [];
  stub = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += String(chunk);
    });
    request.on("end", () => {
      const messages = JSON.parse(raw) as unknown[];
      received.push(...messages);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: messages.map(() => ({ status: "ok", id: "t" })) }));
    });
  });
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve));
  const { port } = stub.address() as AddressInfo;
  stubUrl = `http://127.0.0.1:${port}/send`;
  ws = await createTestWorkspace({
    config: { push: { url: stubUrl } } as Partial<TestWorkspace["config"]>,
  });
});

afterEach(async () => {
  await ws.close();
  await new Promise<void>((resolve) => stub.close(() => resolve()));
});

async function call(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await ws.gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...init.headers },
      ...(body === undefined ? {} : { body }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

function signed(person: TestPerson, method: string, path: string, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return { headers: person.sign(method, path, raw), ...(body === undefined ? {} : { body }) };
}

const PATH = "/v1/me/push-token";

function registration(over: Record<string, unknown> = {}) {
  return {
    token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    platform: "ios",
    time_zone: "Europe/London",
    ...over,
  };
}

async function registerPhone(person: TestPerson, over: Record<string, unknown> = {}) {
  const body = registration(over);
  return call("PUT", PATH, signed(person, "PUT", PATH, body));
}

/** Scout starts a run and asks for something only a person may allow. */
async function raiseAsk(): Promise<{ approvalId: string; runId: string }> {
  const runId = ws.ids.next("run");
  const approvalId = ws.ids.next("approval");
  const headers = (key: string) => ({ ...ws.scout.headers, "idempotency-key": key });
  await call("POST", `/v1/runs/${runId}/events`, {
    headers: headers(`run-${runId}`),
    body: { type: "run.started", space_id: ws.spaceId, goal: "Pay Northwind", plan: [] },
  });
  await call("POST", `/v1/runs/${runId}/events`, {
    headers: headers(`ask-${approvalId}`),
    body: {
      type: "approval.request",
      space_id: ws.spaceId,
      approval_id: approvalId,
      action: { kind: "payment.transfer", money_usd: 50_000, external: true },
      preview: { format: "plain", body: "Wire $50,000 to Northwind Traders" },
      risk: ["financial", "irreversible"],
      expires_in: 3600,
    },
  });
  return { approvalId, runId };
}

describe("registering a phone", () => {
  it("takes the token, the platform and the zone, and replaces them on the next launch", async () => {
    const first = await registerPhone(ws.arjun);
    expect(first.status).toBe(200);
    expect(first.body["device_id"]).toBe(ws.arjun.deviceId);

    const again = await registerPhone(ws.arjun, {
      token: "ExponentPushToken[second]",
      time_zone: "Asia/Kolkata",
    });
    expect(again.status).toBe(200);

    const held = await ws.gateway.deps.push.forPeople(ws.workspaceId, [ws.arjun.participantId]);
    expect(held).toEqual([
      {
        deviceId: ws.arjun.deviceId,
        participantId: ws.arjun.participantId,
        token: "ExponentPushToken[second]",
        platform: "ios",
        timeZone: "Asia/Kolkata",
      },
    ]);
  });

  it("forgets it on request", async () => {
    await registerPhone(ws.arjun);
    const gone = await call("DELETE", PATH, signed(ws.arjun, "DELETE", PATH));
    expect(gone.status).toBe(200);
    expect(await ws.gateway.deps.push.forPeople(ws.workspaceId, [ws.arjun.participantId])).toEqual(
      [],
    );
  });

  it("refuses a body that is missing a field, or names a platform it does not know", async () => {
    const tokens = [{ token: undefined }, { token: "x" }, { token: "ExponentPushToken[]" }];
    for (const bad of [...tokens, { platform: "blackberry" }, { time_zone: "" }]) {
      const body = { ...registration(), ...bad };
      const { status } = await call("PUT", PATH, signed(ws.arjun, "PUT", PATH, body));
      expect(status, JSON.stringify(bad)).toBe(422);
    }
  });

  it("is refused to a harness: a push token belongs to a person's device", async () => {
    const { status } = await call("PUT", PATH, {
      headers: ws.scout.headers,
      body: registration(),
    });
    expect(status).toBe(403);
  });

  it("goes when the device does: a withdrawn phone is not told about anything", async () => {
    await registerPhone(ws.dana);
    const path = `/v1/devices/${ws.dana.deviceId}`;
    const { status } = await call("DELETE", path, signed(ws.arjun, "DELETE", path));
    expect(status).toBe(200);
    expect(await ws.gateway.deps.push.forPeople(ws.workspaceId, [ws.dana.participantId])).toEqual(
      [],
    );
  });
});

describe("a decision reaching a phone", () => {
  it("carries the ids and none of the words", async () => {
    await registerPhone(ws.arjun);
    const { approvalId, runId } = await raiseAsk();

    expect(received).toHaveLength(1);
    const message = received[0] as Record<string, unknown>;
    expect(message["to"]).toBe("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]");
    expect(message["title"]).toBe("A decision is waiting");
    expect(message["categoryId"]).toBe("decision");
    expect(message["data"]).toEqual({
      approval_id: approvalId,
      space_id: ws.spaceId,
      run_id: runId,
      device_id: ws.arjun.deviceId,
    });

    // Nothing about the ask itself went to the push service.
    const wire = JSON.stringify(received);
    for (const word of [
      "payment.transfer",
      "Northwind",
      "50000",
      "financial",
      "irreversible",
      ws.scout.participantId,
    ]) {
      expect(wire, `the push carried ${word}`).not.toContain(word);
    }
  });

  it("says nothing when nobody registered a phone", async () => {
    await raiseAsk();
    expect(received).toEqual([]);
  });

  it("says nothing the second time, the key having been claimed", async () => {
    await registerPhone(ws.arjun);
    const { approvalId } = await raiseAsk();
    expect(received).toHaveLength(1);

    // The same ask handed on to the same person: the ledger has the key already.
    const path = `/v1/spaces/${ws.spaceId}/events`;
    const body = {
      type: "approval.routed",
      space_id: ws.spaceId,
      approval_id: approvalId,
      to: [ws.arjun.participantId],
      reason: "yours",
    };
    await call("POST", path, signed(ws.arjun, "POST", path, body));
    expect(received).toHaveLength(1);
  });

  it("says nothing about an ask a policy rule answered by itself", async () => {
    await registerPhone(ws.arjun);
    const runId = ws.ids.next("run");
    const headers = (key: string) => ({ ...ws.scout.headers, "idempotency-key": key });
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: headers(`run-${runId}`),
      body: { type: "run.started", space_id: ws.spaceId, goal: "Read a file", plan: [] },
    });
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: headers("harmless"),
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: ws.ids.next("approval"),
        action: { kind: "drive.read" },
        risk: [],
        expires_in: 3600,
      },
    });
    expect(received).toEqual([]);
  });
});

/** Scout says something in the room on its own, with nobody's turn before it (ADR 0157). */
async function scoutSays(text: string) {
  const path = `/v1/harnesses/${ws.scout.participantId}/events`;
  return call("POST", path, {
    headers: { ...ws.scout.headers, "idempotency-key": `say-${ws.ids.next("event")}` },
    body: { type: "message.post", space_id: ws.spaceId, text },
  });
}

/** What the phone's extension does with `data.sealed`. */
function unseal(key: string, sealed: string): Record<string, unknown> {
  const bytes = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(bytes.length - 16));
  const words = Buffer.concat([
    decipher.update(bytes.subarray(12, bytes.length - 16)),
    decipher.final(),
  ]);
  return JSON.parse(words.toString("utf8")) as Record<string, unknown>;
}

describe("a server that cannot push (ADR 0244)", () => {
  it("takes the token, says why it sends nothing, and leaves the banner to the computer", async () => {
    await ws.close();
    ws = await createTestWorkspace({
      config: { push: { url: "https://exp.host/--/api/v2/push/send" } } as Partial<
        TestWorkspace["config"]
      >,
    });
    expect((await registerPhone(ws.arjun)).status).toBe(200);
    const facts = await call("GET", "/v1/server", signed(ws.arjun, "GET", "/v1/server"));
    expect(facts.body["pushes"]).toBe("no_access_token");

    // No phone claimed the decision, so the person's computer still may.
    const { approvalId } = await raiseAsk();
    const claims = "/v1/me/notifications/claims";
    const body = { keys: [`decision:${approvalId}`] };
    const asked = await call("POST", claims, signed(ws.arjun, "POST", claims, body));
    expect(asked.body["granted"]).toEqual([`decision:${approvalId}`]);
  });
});

describe("an agent's @ reaching a phone (ADR 0158)", () => {
  const key = randomBytes(32).toString("base64");

  it("takes a sealing key with the token, and refuses one that is not 32 bytes", async () => {
    const taken = await registerPhone(ws.arjun, { seal_key: key });
    expect(taken.status).toBe(200);
    expect(taken.body["sealed"]).toBe(true);
    const [held] = await ws.gateway.deps.push.forPeople(ws.workspaceId, [ws.arjun.participantId]);
    expect(held?.sealKey).toBe(key);

    for (const bad of ["", "not base64!", randomBytes(16).toString("base64"), 32]) {
      const { status } = await registerPhone(ws.arjun, { seal_key: bad });
      expect(status, String(bad)).toBe(422);
    }
    // A launch without one (an older app) leaves fixed words only.
    await registerPhone(ws.arjun);
    const [again] = await ws.gateway.deps.push.forPeople(ws.workspaceId, [ws.arjun.participantId]);
    expect(again?.sealKey).toBeUndefined();
  });

  it("carries the words sealed to the phone, and fixed words for anyone looking", async () => {
    await registerPhone(ws.arjun, { seal_key: key });
    const said = await scoutSays("@Arjun ⏰ Reminder: **call the dentist** about Thursday");
    expect(said.status).toBe(201);

    expect(received).toHaveLength(1);
    const message = received[0] as Record<string, unknown>;
    expect(message["title"]).toBe("A message for you");
    expect(message["body"]).toBe("Open Chips to read it.");
    expect(message["mutableContent"]).toBe(true);
    expect(message["sound"]).toBe("default");
    const data = message["data"] as Record<string, string>;
    expect(data["space_id"]).toBe(ws.spaceId);
    expect(data["message_id"]).toMatch(/^msg_/);
    expect(unseal(key, data["sealed"] ?? "")).toEqual({
      title: "Scout · PO-4471",
      body: "@Arjun ⏰ Reminder: call the dentist about Thursday",
    });
    expect(JSON.stringify(received)).not.toContain("dentist");
  });

  it("sends fixed words alone to a phone with no key", async () => {
    await registerPhone(ws.arjun);
    await scoutSays("@Arjun the build is done");
    expect(received).toHaveLength(1);
    expect((received[0] as { data: Record<string, string> }).data["sealed"]).toBeUndefined();
  });

  it("pushes nothing for words that @ nobody, or @ somebody with no phone", async () => {
    await registerPhone(ws.arjun, { seal_key: key });
    await scoutSays("Here is the summary you asked for.");
    await scoutSays("@Dana the build is done");
    expect(received).toEqual([]);
  });
});

describe("a person's message reaching a phone (ADRs 0198, 0216)", () => {
  const key = randomBytes(32).toString("base64");
  /** Arjun writes in the room, as his app does over its socket. */
  const arjunSays = async (text: string) => {
    const result = await ws.gateway.deps.submitEvent({
      event: {
        type: "message.post",
        space_id: ws.spaceId,
        text,
        idempotency_key: `k-${ws.ids.next("event")}`,
      },
      principal: {
        kind: "person",
        participantId: ws.arjun.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Arjun",
        via: "device_key",
        deviceId: ws.arjun.deviceId,
        role: "owner",
      },
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  };

  it("reaches the person it @s, sealed, and never the person who wrote it", async () => {
    await registerPhone(ws.dana, { seal_key: key });
    await registerPhone(ws.arjun, { seal_key: key });
    await arjunSays("@Dana look at this");
    expect(received).toHaveLength(1);
    const message = received[0] as Record<string, unknown>;
    expect(message["title"]).toBe("A message for you");
    const data = message["data"] as Record<string, string>;
    expect(data["device_id"]).toBe(ws.dana.deviceId);
    expect(unseal(key, data["sealed"] ?? "")).toEqual({
      title: "Arjun · PO-4471",
      body: "@Dana look at this",
    });

    received.length = 0;
    await arjunSays("@Arjun a note to myself");
    const devices = received.map((each) => (each as { data: Record<string, string> }).data);
    expect(devices.map((data) => data["device_id"])).toEqual([ws.dana.deviceId]);
  });

  it("pushes a plain message to everyone else in the room, until they choose Only @ you", async () => {
    await registerPhone(ws.dana);
    await arjunSays("Lunch at one?");
    expect(received).toHaveLength(1);
    expect((received[0] as Record<string, unknown>)["title"]).toBe("A new message");

    received.length = 0;
    const settings = "/v1/me/notifications";
    const onlyAts = {
      decide: "now",
      review: "hourly",
      fyi: "daily",
      harnesses: {},
      spaces: { [ws.spaceId]: "mentions" },
    };
    const saved = await call("PUT", settings, signed(ws.dana, "PUT", settings, onlyAts));
    expect(saved.status).toBe(200);
    await arjunSays("Lunch at one?");
    expect(received).toEqual([]);
  });
});
