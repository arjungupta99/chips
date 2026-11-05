/**
 * The HTTP half of the gateway, against a real database and real credentials.
 *
 * The centrepiece is the hooks-mode approval round trip from the blueprint: Scout posts an
 * approval request and blocks on the long poll; Arjun approves from another surface; the poll
 * returns the decision. That is the loop the whole product is built around, and it is exercised
 * here without a socket, exactly as a `PreToolUse` hook would.
 */

import { generateKeyPairSync } from "node:crypto";
import { createLogger, defaultConfig, manualClock } from "@chipschat/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSweep } from "../../application/index.js";
import type { Principal } from "../../application/ports/index.js";
import type { Gateway } from "../../gateway.js";
import { mintHarnessToken } from "../../infrastructure/auth/credentials.js";
import { createTestWorkspace, type TestWorkspace } from "../../testing/workspace.js";
import { UNAUTHENTICATED_BODY_BYTES } from "./app.js";

let ws: TestWorkspace;
let gateway: Gateway;

beforeEach(async () => {
  ws = await createTestWorkspace();
  gateway = ws.gateway;
});

afterEach(async () => {
  await ws.close();
});

/** Call the app directly. No port, no network — Hono's `fetch` is the whole server. */
async function call(
  method: string,
  path: string,
  init: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  const response = await gateway.app.fetch(
    new Request(`http://chips.local${path}`, {
      method,
      headers: { "content-type": "application/json", ...init.headers },
      ...(body === undefined ? {} : { body }),
    }),
  );
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : JSON.parse(text) };
}

/** A request signed by a person's paired device. */
function signed(person: TestWorkspace["arjun"], method: string, path: string, body?: unknown) {
  const raw = body === undefined ? "" : JSON.stringify(body);
  return { headers: person.sign(method, path, raw), ...(body === undefined ? {} : { body }) };
}

describe("health", () => {
  it("answers without a credential, because a load balancer has none", async () => {
    const { status, body } = await call("GET", "/v1/health");
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: "ok", name: "chipsd", protocol: { min: 1, max: 1 } });
    // No relay configured: the line says so, and to a stranger it says nothing more (SEC-28).
    // Health names the tunnel door on this network, which answers only to the server's key.
    expect(body["relay"]).toEqual({ status: "off" });
    expect(body["tunnel"]).toEqual({ path: "/v1/tunnel" });
  });

  it("names the relay and the server's key only to a request straight from this machine (SEC-28)", async () => {
    const here = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };
    const read = async (headers: Record<string, string> = {}) =>
      (await (
        await gateway.app.fetch(new Request("http://127.0.0.1:4431/v1/health", { headers }), here)
      ).json()) as { relay: Record<string, unknown>; pushes?: string };
    // `chips doctor` beside the server, and the operator reading the key for a relay's list.
    const local = await read();
    expect(local.relay).toEqual({
      status: "off",
      url: null,
      key: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      // Why it isn't connected, for doctor's relay fix: nothing, since it isn't dialling.
      why: null,
    });
    // And whether it can push to phones (ADR 0244): this one has no token for Expo, so it sends
    // through Chips's push relay (ADR 0246), and can.
    expect(local.pushes).toBe("ready");
    // Tailscale Serve reaches the port from loopback too, for whoever asked it.
    const forwarded = await read({ "x-forwarded-for": "100.64.0.9" });
    expect(forwarded.relay).toEqual({ status: "off" });
    expect(forwarded.pushes).toBeUndefined();
  });

  it("carries a request id a log line can be found by", async () => {
    const response = await gateway.app.fetch(new Request("http://chips.local/v1/health"));
    expect(response.headers.get("x-request-id")).toMatch(/^evt_/);
  });
});

describe("the desktop window's origin (ADR 0086)", () => {
  const DESKTOP = "tauri://localhost";

  /** What WebKit asks before a signed or JSON request from another origin. */
  function preflight(origin: string, path: string) {
    return gateway.app.fetch(
      new Request(`http://chips.local${path}`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers":
            "content-type, x-chips-device, x-chips-timestamp, x-chips-signature",
        },
      }),
    );
  }

  it("lets the desktop window ask, before pairing and before anything signed", async () => {
    for (const path of ["/v1/pair", "/v1/socket-tickets"]) {
      const response = await preflight(DESKTOP, path);
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(DESKTOP);
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
      expect(response.headers.get("access-control-allow-headers")).toBe(
        "content-type,x-chips-device,x-chips-timestamp,x-chips-signature",
      );
    }
  });

  it("lets it read the answer, a refusal included, and the headers an attachment carries", async () => {
    const refused = await gateway.app.fetch(
      new Request("http://chips.local/v1/pair", {
        method: "POST",
        headers: { origin: DESKTOP, "content-type": "application/json" },
        body: JSON.stringify({ code: "ZZZ-999", public_key: "none", name: "Chips for Mac" }),
      }),
    );
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.headers.get("access-control-allow-origin")).toBe(DESKTOP);
    expect(refused.headers.get("access-control-expose-headers")).toBe(
      "x-chips-playable,x-chips-view",
    );
  });

  it("names no other origin, so a page elsewhere still cannot call the server", async () => {
    const elsewhere = await preflight("https://example.com", "/v1/pair");
    expect(elsewhere.headers.get("access-control-allow-origin")).toBeNull();
    const plain = await gateway.app.fetch(
      new Request("http://chips.local/v1/health", { headers: { origin: "https://example.com" } }),
    );
    expect(plain.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("authentication", () => {
  it("refuses a request with no credential", async () => {
    const { status, body } = await call("GET", "/v1/events?since=0");
    expect(status).toBe(401);
    expect(body["error"]).toMatchObject({ code: "unauthorized" });
  });

  it("refuses a token nobody issued", async () => {
    const { status } = await call("GET", "/v1/events?since=0", {
      headers: { authorization: "Bearer chips_at_not-a-real-token" },
    });
    expect(status).toBe(401);
  });

  it("says the same thing about an unknown and a revoked token", async () => {
    const unknown = await call("GET", "/v1/events?since=0", {
      headers: { authorization: "Bearer chips_at_nope" },
    });
    await ws.db
      .updateTable("harness_tokens")
      .set({ revoked_at: "2026-09-02T15:00:00.000Z" })
      .execute();
    const revoked = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });

    expect(revoked.status).toBe(unknown.status);
    expect(revoked.body).toMatchObject({ error: { code: "unauthorized" } });
  });

  it("accepts a harness's bearer token", async () => {
    const { status } = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    expect(status).toBe(200);
  });

  it("accepts a request signed by a paired device", async () => {
    const { status } = await call(
      "GET",
      "/v1/events?since=0",
      signed(ws.arjun, "GET", "/v1/events?since=0"),
    );
    expect(status).toBe(200);
  });

  it("refuses a signature made for a different path", async () => {
    const headers = ws.arjun.sign("GET", "/v1/health", "");
    const { status } = await call("GET", "/v1/events?since=0", { headers });
    expect(status).toBe(401);
  });

  it("refuses a signature made for a different query (finding 5)", async () => {
    // One signature must not stand in for every query string. The device signs the full
    // target; a request with a different `since` is a different target.
    const headers = ws.arjun.sign("GET", "/v1/events?since=0", "");
    const { status } = await call("GET", "/v1/events?since=999", { headers });
    expect(status).toBe(401);
  });

  it("refuses a signature made for a different body", async () => {
    const path = `/v1/harnesses/${ws.scout.participantId}/events`;
    const headers = ws.arjun.sign("POST", path, JSON.stringify({ type: "checkpoint" }));
    const { status } = await call("POST", path, { headers, body: { type: "handoff" } });
    expect(status).toBe(401);
  });
});

/** Scout starts a run in the space over HTTP, the way every run begins. */
async function startedRun(key: string): Promise<string> {
  const runId = ws.ids.next("run");
  const { status } = await call("POST", `/v1/runs/${runId}/events`, {
    headers: { ...ws.scout.headers, "idempotency-key": key },
    body: { type: "run.started", space_id: ws.spaceId, goal: "g", plan: [] },
  });
  if (status !== 201) throw new Error(`run.started answered ${status}`);
  return runId;
}

describe("hooks-mode ingest", () => {
  it("appends a run's events and returns their sequence numbers", async () => {
    const runId = ws.ids.next("run");
    const started = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "scout-1" },
      body: {
        type: "run.started",
        space_id: ws.spaceId,
        goal: "Confirm PO #4471",
        plan: [{ step_id: "read-po", title: "Read the PO" }],
      },
    });

    expect(started.status).toBe(201);
    expect(started.body["duplicate"]).toBe(false);
    expect(started.body["seq"]).toBeGreaterThan(0);
  });

  it("treats a retried post as already applied", async () => {
    const runId = await startedRun("retry-run");
    const body = {
      type: "run.status",
      space_id: ws.spaceId,
      phase: "reading",
      verb_phrase: "Reading…",
    };
    const headers = { ...ws.scout.headers, "idempotency-key": "scout-status-1" };

    const first = await call("POST", `/v1/runs/${runId}/events`, { headers, body });
    const again = await call("POST", `/v1/runs/${runId}/events`, { headers, body });

    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body["duplicate"]).toBe(true);
    expect(again.body["seq"]).toBe(first.body["seq"]);
  });

  it("keeps a key to its sender: two harnesses may both say hello-1", async () => {
    const body = JSON.stringify({ name: "Scout-web" });
    const added = await gateway.app.fetch(
      new Request("http://chips.local/v1/harnesses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...ws.arjun.sign("POST", "/v1/harnesses", body),
        },
        body,
      }),
    );
    const other = (await added.json()) as { harness_id: string; token: string; space_id: string };
    const hello = (harnessId: string, headers: Record<string, string>, spaceId: string) =>
      call("POST", `/v1/harnesses/${harnessId}/events`, {
        headers,
        body: {
          type: "message.post",
          space_id: spaceId,
          text: "Hello from my harness",
          idempotency_key: "hello-1",
        },
      });

    const first = await hello(ws.scout.participantId, ws.scout.headers, ws.spaceId);
    const second = await hello(
      other.harness_id,
      { authorization: `Bearer ${other.token}` },
      other.space_id,
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body["duplicate"]).toBe(false);
    expect(second.body["seq"]).not.toBe(first.body["seq"]);
  });

  it("refuses a write with no idempotency key, because a retry has to be safe", async () => {
    const runId = ws.ids.next("run");
    const { status, body } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: ws.scout.headers,
      body: { type: "checkpoint", space_id: ws.spaceId, label: "one" },
    });
    expect(status).toBe(422);
    expect(
      String(body["error"] && (body["error"] as Record<string, unknown>)["message"]),
    ).toContain("idempotency key");
  });

  it("refuses an event sent on somebody else's behalf", async () => {
    const runId = ws.ids.next("run");
    const { status, body } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "forged-1" },
      body: {
        type: "checkpoint",
        space_id: ws.spaceId,
        actor: { kind: "person", id: ws.arjun.participantId },
        label: "not mine to send",
      },
    });
    expect(status).toBe(403);
    expect(body["error"]).toMatchObject({ code: "forbidden" });
  });

  it("refuses an event Chips produces at delivery time", async () => {
    const { status, body } = await call("POST", `/v1/harnesses/${ws.scout.participantId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "forged-hello" },
      body: { type: "message.new", space_id: ws.spaceId },
    });
    expect(status).toBe(403);
    expect(String((body["error"] as Record<string, unknown>)["message"])).toContain("message.new");
  });

  it("refuses a harness saying always for a person, and records its own answer as its own", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    const headers = (key: string) => ({ ...ws.scout.headers, "idempotency-key": key });
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: headers("self-run"),
      body: { type: "run.started", space_id: ws.spaceId, goal: "g", plan: [] },
    });
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: headers("self-ask"),
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: approvalId,
        action: { kind: "payment.transfer", money_usd: 50_000, external: true },
        risk: ["financial", "irreversible"],
        expires_in: 3600,
      },
    });

    const { status, body } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: headers("self-approve"),
      body: {
        type: "approval.resolved",
        space_id: ws.spaceId,
        approval_id: approvalId,
        decision: "approved",
        scope: "always",
        resolved_by: ws.arjun.participantId,
        resolved_at: "2026-09-02T14:30:12.881Z",
      },
    });
    // Always is a person's to give (ADR 0079): the ask stays open.
    expect(status).toBe(422);
    expect(body["error"]).toMatchObject({ code: "invalid_event" });
    expect(String((body["error"] as Record<string, unknown>)["message"])).toContain(
      "a person's to give",
    );
    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval?.state).toBe("pending");

    // Not even once: a payment waits for a person, whatever its own window said (SEC-10, ADR 0195).
    const settle = (id: string, key: string) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: headers(key),
        body: {
          type: "approval.resolved",
          space_id: ws.spaceId,
          approval_id: id,
          decision: "approved",
          scope: "once",
          resolved_by: ws.arjun.participantId,
        },
      });
    const payment = await settle(approvalId, "self-settle");
    expect(payment.status).toBe(403);
    expect(String((payment.body["error"] as Record<string, unknown>)["message"])).toContain(
      "wait for a person",
    );
    expect((await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId))?.state).toBe(
      "pending",
    );

    // A small ask, settled once as answered in its own tools, is the harness's answer, whoever it
    // names. At L1, so the small write waits rather than running on the spot.
    await ws.gateway.deps.store.append({
      v: 1,
      type: "policy.updated",
      id: ws.ids.next("event"),
      ts: "2026-09-02T15:00:00.000Z",
      workspace_id: ws.workspaceId,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: ws.ids.next("event"),
      harness_id: ws.scout.participantId,
      policy: { autonomy: 1, rules: [] },
      workspace_max_autonomy: 3,
      changed_by: ws.arjun.participantId,
      // biome-ignore lint/suspicious/noExplicitAny: a hand-built validated event for the test.
    } as any);
    const smallId = ws.ids.next("approval");
    const smallAsk = await call("POST", `/v1/runs/${runId}/events`, {
      headers: headers("self-small"),
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: smallId,
        action: { kind: "shell.exec" },
        risk: [],
        expires_in: 3600,
      },
    });
    expect(smallAsk.status, JSON.stringify(smallAsk.body)).toBe(201);
    const small = await settle(smallId, "self-settle-small");
    expect(small.status, JSON.stringify(small.body)).toBe(201);
    const settled = await ws.gateway.deps.readModels.approval(ws.workspaceId, smallId);
    expect(settled).toMatchObject({ state: "resolved", resolved_by: ws.scout.participantId });
  });

  it("refuses a person starting a run", async () => {
    const path = `/v1/runs/${ws.ids.next("run")}/events`;
    const body = {
      type: "run.started",
      space_id: ws.spaceId,
      goal: "g",
      plan: [],
      idempotency_key: "person-run",
    };
    const { status, body: answer } = await call("POST", path, signed(ws.arjun, "POST", path, body));
    expect(status).toBe(403);
    expect(String((answer["error"] as Record<string, unknown>)["message"])).toContain(
      "a harness sends",
    );
  });

  it("refuses an event Chips works out for itself", async () => {
    const { status, body } = await call("POST", `/v1/harnesses/${ws.scout.participantId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "forged-warning" },
      body: {
        type: "budget.warning",
        budget: { limit_usd: 25, spent_usd: 20 },
        threshold: 80,
        action: "warn",
      },
    });
    expect(status).toBe(403);
    expect(String((body["error"] as Record<string, unknown>)["message"])).toContain(
      "budget.warning",
    );
  });

  it("records who decided and when from the credential, whatever the body says", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    for (const [key, body] of [
      ["attr-run", { type: "run.started", goal: "g", plan: [] }],
      [
        "attr-ask",
        {
          type: "approval.request",
          approval_id: approvalId,
          action: { kind: "email.send" },
          risk: ["external"],
          expires_in: 600,
        },
      ],
    ] as const) {
      await call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: { space_id: ws.spaceId, ...body },
      });
    }

    const path = `/v1/runs/${runId}/events`;
    const body = {
      type: "approval.resolved",
      space_id: ws.spaceId,
      approval_id: approvalId,
      decision: "approved",
      resolved_by: "usr_01K4ZQPX00000000000000000Q",
      resolved_at: "2020-01-01T00:00:00.000Z",
      idempotency_key: "attr-resolve",
    };
    const { status } = await call("POST", path, signed(ws.arjun, "POST", path, body));
    expect(status).toBe(201);

    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval?.resolved_by).toBe(ws.arjun.participantId);
    expect(Date.parse(approval?.resolved_at ?? "")).toBeGreaterThan(Date.now() - 60_000);
  });

  it("dates an event by its own clock, whatever `ts` the sender wrote", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "ts-run" },
      body: { type: "run.started", space_id: ws.spaceId, goal: "g", plan: [] },
    });
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "ts-ask" },
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: approvalId,
        action: { kind: "email.send" },
        risk: ["external"],
        expires_in: 60,
        ts: "2099-01-01T00:00:00.000Z",
      },
    });

    // The expiry is computed from `ts`, so an approval dated into next year would never expire.
    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(Date.parse(approval?.expires_at ?? "")).toBeLessThan(Date.now() + 120_000);
  });

  it("refuses a harness posting to another harness's route", async () => {
    const { status } = await call("POST", `/v1/harnesses/${ws.arjun.participantId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "wrong-route" },
      body: { type: "checkpoint", space_id: ws.spaceId, label: "one" },
    });
    expect(status).toBe(403);
  });

  it("reports what is wrong with an invalid event, field by field", async () => {
    const runId = ws.ids.next("run");
    const { status, body } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "bad-1" },
      body: { type: "run.started", space_id: ws.spaceId },
    });
    expect(status).toBe(422);
    const issues = (body["error"] as { issues?: { path: string }[] }).issues ?? [];
    expect(issues.map((issue) => issue.path)).toContain("goal");
  });

  it("clamps a page to between one and a thousand events (phase-0-review finding 7)", async () => {
    // The workspace was set up with seven events.
    const negative = await call("GET", "/v1/events?since=0&limit=-2", {
      headers: ws.scout.headers,
    });
    expect((negative.body["events"] as unknown[]).length).toBe(1);
    expect(negative.body["next_cursor"]).toBe(1);

    const zero = await call("GET", "/v1/events?since=0&limit=0", { headers: ws.scout.headers });
    expect((zero.body["events"] as unknown[]).length).toBe(1);

    const huge = await call("GET", "/v1/events?since=0&limit=5000", { headers: ws.scout.headers });
    expect((huge.body["events"] as unknown[]).length).toBe(7);
    expect(huge.body["next_cursor"]).toBeNull();

    const nonsense = await call("GET", "/v1/events?since=0&limit=lots", {
      headers: ws.scout.headers,
    });
    expect((nonsense.body["events"] as unknown[]).length).toBe(7);
  });

  it("pages the event log by cursor", async () => {
    const runId = await startedRun("page-run");
    for (let i = 0; i < 5; i += 1) {
      await call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": `page-${i}` },
        body: { type: "checkpoint", space_id: ws.spaceId, label: `${i}` },
      });
    }

    const page = await call("GET", "/v1/events?since=0&limit=3", { headers: ws.scout.headers });
    expect((page.body["events"] as unknown[]).length).toBe(3);
    expect(page.body["next_cursor"]).not.toBeNull();
  });
});

describe("the directory (M3.3)", () => {
  it("names the whole workspace to a person, and only the shared rooms to a harness", async () => {
    // Ledger: Dana's harness, in no room with Arjun or Scout.
    const added = await ws.gateway.deps.addHarness({
      principal: {
        kind: "person",
        participantId: ws.dana.participantId,
        workspaceId: ws.workspaceId,
        displayName: "Dana",
        via: "device_key",
      },
      displayName: "Ledger",
    });
    if (!added.ok) throw new Error(added.error.message);

    const arjun = await call(
      "GET",
      "/v1/participants",
      signed(ws.arjun, "GET", "/v1/participants"),
    );
    const names = (arjun.body["participants"] as { display_name: string }[]).map(
      (each) => each.display_name,
    );
    expect(names).toEqual(expect.arrayContaining(["Arjun", "Dana", "Scout", "Ledger"]));

    const scout = await call("GET", "/v1/participants", { headers: ws.scout.headers });
    const heard = (scout.body["participants"] as { display_name: string }[]).map(
      (each) => each.display_name,
    );
    expect(heard).toEqual(expect.arrayContaining(["Arjun", "Dana", "Scout"]));
    expect(heard).not.toContain("Ledger");
  });
});

describe("who may answer an approval (M3.3)", () => {
  it("is who policy named — the harness's owner — and nobody else in the room", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "run-1" },
      body: { type: "run.started", space_id: ws.spaceId, goal: "Confirm PO #4471", plan: [] },
    });
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "approval-1" },
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: approvalId,
        action: { kind: "email.send", external: true, irreversible: true },
        risk: ["external_communication"],
        expires_in: 3600,
      },
    });
    // Scout is Arjun's, so the ask is Arjun's to answer, and the stored event says so.
    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval?.approvers).toEqual([ws.arjun.participantId]);

    const path = `/v1/runs/${runId}/events`;
    const decision = {
      type: "approval.resolved",
      space_id: ws.spaceId,
      approval_id: approvalId,
      decision: "approved",
      scope: "once",
      resolved_by: "whoever",
      resolved_at: "2026-09-02T14:30:12.881Z",
    };
    // Dana is in the room, and it is not hers to answer.
    const dana = await call(
      "POST",
      path,
      signed(ws.dana, "POST", path, { ...decision, idempotency_key: "dana-approve" }),
    );
    expect(dana.status).toBe(403);
    expect(dana.body["error"]).toMatchObject({ code: "forbidden" });

    const arjun = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, { ...decision, idempotency_key: "arjun-approve" }),
    );
    expect(arjun.status).toBe(201);
    expect(
      (await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId))?.resolved_by,
    ).toBe(ws.arjun.participantId);
  });
});

describe("feedback on a harness's message (M3.4)", () => {
  it("is who the credential says, in their standing, and reaches only a harness's message", async () => {
    const runId = ws.ids.next("run");
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "run-1" },
      body: { type: "run.started", space_id: ws.spaceId, goal: "Confirm PO #4471", plan: [] },
    });
    const said = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "said-1" },
      body: { type: "message.post", space_id: ws.spaceId, text: "Delivery is on the 12th." },
    });
    expect(said.status).toBe(201);
    const messageId = String(said.body["event_id"]).replace(/^evt_/, "msg_");

    // Dana, a member, says what went wrong and claims to be the owner; the door knows better.
    const path = `/v1/runs/${runId}/events`;
    const note = {
      type: "feedback",
      space_id: ws.spaceId,
      message_id: messageId,
      kind: "correction",
      text: "The 19th, not the 12th.",
      from: { participant_id: "usr_x", kind: "person", display_name: "Owner", role: "owner" },
    };
    const dana = await call(
      "POST",
      path,
      signed(ws.dana, "POST", path, { ...note, idempotency_key: "dana-note" }),
    );
    expect(dana.status, JSON.stringify(dana.body)).toBe(201);
    const page = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    const stored = page.events.find((event) => event.type === "feedback");
    expect(stored?.payload["from"]).toEqual({
      participant_id: ws.dana.participantId,
      kind: "person",
      display_name: "Dana",
      role: "member",
    });

    // A harness does not give feedback; and feedback is on a harness's message, not a person's.
    const scout = await call("POST", path, {
      headers: { ...ws.scout.headers, "idempotency-key": "scout-note" },
      body: note,
    });
    expect(scout.status).toBe(403);
    const arjunSaid = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, {
        type: "message.post",
        space_id: ws.spaceId,
        text: "Is it the 12th?",
        idempotency_key: "arjun-said",
      }),
    );
    const onAPerson = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, {
        ...note,
        message_id: String(arjunSaid.body["event_id"]).replace(/^evt_/, "msg_"),
        idempotency_key: "on-a-person",
      }),
    );
    expect(onAPerson.status).toBe(422);
    const onNothing = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, {
        ...note,
        message_id: `msg_${ws.ids.next("event").slice(4)}`,
        idempotency_key: "on-nothing",
      }),
    );
    expect(onNothing.status).toBe(404);
  });
});

describe("the approval round trip, in hooks mode", () => {
  it("blocks the hook until a person answers, then returns the decision", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");

    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "run-1" },
      body: {
        type: "run.started",
        space_id: ws.spaceId,
        goal: "Confirm PO #4471",
        plan: [],
      },
    });

    const requested = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "approval-1" },
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: approvalId,
        action: {
          kind: "email.send",
          to: "dana@northwind.com",
          external: true,
          irreversible: true,
        },
        preview: { format: "markdown", body: "Hi Dana, confirming PO #4471…" },
        risk: ["external_communication", "irreversible"],
        expires_in: 3600,
      },
    });
    expect(requested.body["approval_id"]).toBe(approvalId);

    // The hook blocks here. Nothing has answered yet.
    const waiting = call("GET", `/v1/approvals/${approvalId}/wait?timeout=10`, {
      headers: ws.scout.headers,
    });

    // Arjun approves from his laptop, signing with his device key.
    const path = `/v1/runs/${runId}/events`;
    const resolveBody = {
      type: "approval.resolved",
      space_id: ws.spaceId,
      approval_id: approvalId,
      decision: "approved",
      scope: "once",
      reason: "Looks right. Send it.",
      resolved_by: ws.arjun.participantId,
      resolved_at: "2026-09-02T14:30:12.881Z",
      idempotency_key: "arjun-approve-1",
    };
    const resolved = await call("POST", path, signed(ws.arjun, "POST", path, resolveBody));
    expect(resolved.status).toBe(201);

    const answer = await waiting;
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      approval_id: approvalId,
      state: "resolved",
      resolution: "approved",
      scope: "once",
      resolved_by: ws.arjun.participantId,
    });

    // And the run went back to work, because a person answered.
    const run = await ws.gateway.deps.readModels.run(ws.workspaceId, runId);
    expect(run?.state).toBe("running");
  });

  it("returns immediately when the decision was already made", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");

    for (const [key, body] of [
      ["run-2", { type: "run.started", goal: "g", plan: [] }],
      [
        "approval-2",
        {
          type: "approval.request",
          approval_id: approvalId,
          action: { kind: "file.delete" },
          risk: ["destructive"],
          expires_in: 600,
        },
      ],
    ] as const) {
      await call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: { space_id: ws.spaceId, ...body },
      });
    }

    // The decision is a person's to make, so Arjun signs it. This test used to have Scout post
    // it, which is exactly the thing the sender rule now refuses.
    const path = `/v1/runs/${runId}/events`;
    const denial = {
      type: "approval.resolved",
      space_id: ws.spaceId,
      approval_id: approvalId,
      decision: "denied",
      resolved_by: ws.arjun.participantId,
      resolved_at: "2026-09-02T14:31:00.000Z",
      idempotency_key: "resolve-2",
    };
    expect((await call("POST", path, signed(ws.arjun, "POST", path, denial))).status).toBe(201);

    const started = Date.now();
    const answer = await call("GET", `/v1/approvals/${approvalId}/wait?timeout=30`, {
      headers: ws.scout.headers,
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(answer.body).toMatchObject({ state: "resolved", resolution: "denied" });
  });

  it("returns the approval as it stands when the poll times out", async () => {
    const runId = ws.ids.next("run");
    const approvalId = ws.ids.next("approval");
    for (const [key, body] of [
      ["run-3", { type: "run.started", goal: "g", plan: [] }],
      [
        "approval-3",
        {
          type: "approval.request",
          approval_id: approvalId,
          action: { kind: "email.send" },
          risk: ["external"],
          expires_in: 600,
        },
      ],
    ] as const) {
      await call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: { space_id: ws.spaceId, ...body },
      });
    }

    const answer = await call("GET", `/v1/approvals/${approvalId}/wait?timeout=0`, {
      headers: ws.scout.headers,
    });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ state: "pending", resolution: null });
  });

  it("says not found for an approval in another workspace", async () => {
    const { status, body } = await call(
      "GET",
      "/v1/approvals/apr_01K4ZQPX00000000000000000Z/wait",
      {
        headers: ws.scout.headers,
      },
    );
    expect(status).toBe(404);
    expect(body["error"]).toMatchObject({ code: "not_found" });
  });
});

describe("uploads", () => {
  it("issues a slot with an id and an expiry", async () => {
    const { status, body } = await call("POST", "/v1/uploads", {
      headers: ws.scout.headers,
      body: { filename: "PO-4471.pdf", byte_size: 184_302, mime_type: "application/pdf" },
    });
    expect(status).toBe(201);
    expect(body["attachment_id"]).toMatch(/^att_/);
    expect(body["expires_at"]).toEqual(expect.any(String));
  });

  it("refuses something larger than the workspace allows", async () => {
    const { status } = await call("POST", "/v1/uploads", {
      headers: ws.scout.headers,
      body: { filename: "huge.mov", byte_size: 999_999_999_999 },
    });
    expect(status).toBe(422);
  });
});

describe("the error envelope", () => {
  it("is the same shape for every failure", async () => {
    const notFound = await call("GET", "/v1/nothing-here", { headers: ws.scout.headers });
    expect(notFound.status).toBe(404);
    expect(notFound.body["error"]).toMatchObject({
      code: "not_found",
      message: expect.any(String),
      request_id: expect.any(String),
    });
  });
});

describe("pairing", () => {
  /** A 32-byte Ed25519 key in SPKI DER is 44 base64 characters. */
  const PUBLIC_KEY = "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=";

  it("needs no credential, because it is how you get one", async () => {
    const { status, body } = await call("POST", "/v1/pair", {
      body: { code: "ABC-234", public_key: PUBLIC_KEY, name: "A browser" },
    });
    // Refused because the code is not real, not because nothing was presented.
    expect(status).toBe(401);
    expect(body["error"]).toMatchObject({ code: "unauthorized" });
  });

  it("registers a device, and that device can then sign requests", async () => {
    const code = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    });
    expect(code).toBeDefined();

    const paired = await call("POST", "/v1/pair", {
      body: { code: code?.code, public_key: PUBLIC_KEY, name: "A browser" },
    });
    expect(paired.status).toBe(201);
    expect(paired.body).toMatchObject({
      participant_id: ws.arjun.participantId,
      workspace_id: ws.workspaceId,
      display_name: "Arjun",
    });
    expect(paired.body["device_id"]).toMatch(/^dev_/);
  });

  it("refuses a body that is not JSON", async () => {
    const response = await gateway.app.fetch(
      new Request("http://chips.local/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(response.status).toBe(422);
  });

  it("refuses a body with no code or key", async () => {
    const { status } = await call("POST", "/v1/pair", { body: { name: "A browser" } });
    expect(status).toBe(422);
  });

  it("refuses something that is not a key", async () => {
    const code = ws.gateway.deps.pairingCodes?.issue({
      workspaceId: ws.workspaceId,
      participantId: ws.arjun.participantId,
    });
    const { status, body } = await call("POST", "/v1/pair", {
      body: { code: code?.code, public_key: "not a key", name: "A browser" },
    });
    expect(status).toBe(422);
    expect(String((body["error"] as Record<string, unknown>)["message"])).toContain("Ed25519");
  });

  it("says the same thing about an unknown code and an expired one", async () => {
    const unknown = await call("POST", "/v1/pair", {
      body: { code: "ZZZ-999", public_key: PUBLIC_KEY, name: "x" },
    });
    expect(unknown.status).toBe(401);
    expect((unknown.body["error"] as Record<string, unknown>)["message"]).toBe(
      "That pairing code is not valid.",
    );
  });
});

describe("writing to a run (M1.3: ownership and transitions, enforced at the door)", () => {
  /** A second harness in the space, with a token of its own. */
  async function addHarness(
    name: string,
  ): Promise<{ id: string; headers: Record<string, string> }> {
    const id = ws.ids.next("harness");
    await ws.db
      .insertInto("participants")
      .values({
        id,
        workspace_id: ws.workspaceId,
        kind: "harness",
        display_name: name,
        owner_id: ws.arjun.participantId,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: "2026-09-02T15:00:00.000Z",
      })
      .execute();
    const minted = mintHarnessToken();
    await ws.db
      .insertInto("harness_tokens")
      .values({
        id: ws.ids.next("token"),
        workspace_id: ws.workspaceId,
        harness_id: id,
        token_hash: minted.hash,
        name: "laptop",
        created_at: "2026-09-02T15:00:00.000Z",
        last_used_at: null,
        revoked_at: null,
      })
      .execute();
    await ws.gateway.deps.store.append({
      v: 1,
      type: "membership.added",
      id: ws.ids.next("event"),
      ts: "2026-09-02T15:00:00.000Z",
      workspace_id: ws.workspaceId,
      space_id: ws.spaceId,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: ws.ids.next("event"),
      participant_id: id,
      participant_kind: "harness",
      role: "member",
      // biome-ignore lint/suspicious/noExplicitAny: a hand-built validated event for the test.
    } as any);
    return { id, headers: { authorization: `Bearer ${minted.token}` } };
  }

  it("refuses an event for a run nobody started, as not found (the review's probe W4)", async () => {
    const runId = ws.ids.next("run");
    const { status, body } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "w4" },
      body: { type: "run.status", phase: "reading", verb_phrase: "Reading…" },
    });
    expect(status).toBe(404);
    expect(body["error"]).toMatchObject({ code: "not_found" });
    expect(await ws.gateway.deps.readModels.run(ws.workspaceId, runId)).toBeUndefined();
  });

  it("refuses a harness writing into another harness's run", async () => {
    const runId = await startedRun("mine");
    const ledger = await addHarness("Ledger");
    const { status, body } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ledger.headers, "idempotency-key": "not-mine" },
      body: { type: "run.status", phase: "meddling", verb_phrase: "Meddling…" },
    });
    expect(status).toBe(403);
    expect(String((body["error"] as Record<string, unknown>)["message"])).toContain(
      "another harness",
    );
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.status_verb).toBeNull();
  });

  it("lands a hook's event that names no space in the run's own", async () => {
    const runId = await startedRun("hook-run");
    const approvalId = ws.ids.next("approval");
    const { status } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "hook-ask" },
      body: {
        type: "approval.request",
        approval_id: approvalId,
        action: { kind: "email.send" },
        risk: ["external"],
        expires_in: 600,
      },
    });
    expect(status).toBe(201);
    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval?.space_id).toBe(ws.spaceId);
  });

  it("refuses an event into a run that has ended, and a resume of one that is not paused", async () => {
    const runId = await startedRun("ending");
    const post = (key: string, body: Record<string, unknown>, headers = ws.scout.headers) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...headers, "idempotency-key": key },
        body,
      });

    const path = `/v1/runs/${runId}/events`;
    const resume = { type: "run.resume", idempotency_key: "resume-running" };
    const early = await call("POST", path, signed(ws.arjun, "POST", path, resume));
    expect(early.status).toBe(422);
    expect(String((early.body["error"] as Record<string, unknown>)["message"])).toContain(
      "not paused",
    );

    expect((await post("done", { type: "run.completed", summary: "Done." })).status).toBe(201);
    const late = await post("too-late", { type: "step.log", step_id: "x", status: "done" });
    expect(late.status).toBe(422);
    expect(String((late.body["error"] as Record<string, unknown>)["message"])).toContain(
      "ended as done",
    );
  });

  it("fills `from` on a steer from the credential and the membership, whatever the body says", async () => {
    const runId = await startedRun("steered");
    const path = `/v1/runs/${runId}/events`;
    const body = {
      type: "run.steer",
      mode: "steer",
      text: "Mention the pallet count.",
      from: {
        participant_id: "usr_01K4ZQPX00000000000000000Q",
        kind: "harness",
        display_name: "X",
        role: "guest",
      },
      idempotency_key: "steer-1",
    };
    const { status } = await call("POST", path, signed(ws.arjun, "POST", path, body));
    expect(status).toBe(201);

    const log = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    const steer = (log.body["events"] as Record<string, unknown>[]).find(
      (event) => event["type"] === "run.steer",
    );
    expect(steer?.["from"]).toEqual({
      participant_id: ws.arjun.participantId,
      kind: "person",
      display_name: "Arjun",
      role: "owner",
    });
    expect(steer?.["space_id"]).toBe(ws.spaceId);
  });

  it("prices a usage that carries no cost from the workspace's table, and records it", async () => {
    const runId = await startedRun("priced");
    const { status } = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "usage-1" },
      body: {
        type: "usage",
        scope: "run",
        model: "opus-5",
        input_tokens: 82_140,
        output_tokens: 3402,
      },
    });
    expect(status).toBe(201);
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.cost_usd).toBe(1.4873);

    const log = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    const usage = (log.body["events"] as Record<string, unknown>[]).find(
      (event) => event["type"] === "usage",
    );
    expect(usage?.["cost"]).toEqual({ usd: 1.4873, estimated: true });
  });

  it("adds a step's usage onto the run's total", async () => {
    const runId = await startedRun("summed");
    for (const [key, tokens] of [
      ["step-a", 1000],
      ["step-b", 500],
    ] as const) {
      await call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: {
          type: "usage",
          scope: "step",
          model: "opus-5",
          input_tokens: tokens,
          output_tokens: 0,
        },
      });
    }
    const run = await ws.db
      .selectFrom("runs")
      .select(["input_tokens", "cost_usd"])
      .where("id", "=", runId)
      .executeTakeFirst();
    expect(run?.input_tokens).toBe(1500);
    expect(run?.cost_usd).toBeCloseTo(0.0225, 6);
  });

  it("takes a usage that knows only its tokens out, and prices none of it (finding 11)", async () => {
    const runId = await startedRun("output-only");
    const post = (key: string, body: Record<string, unknown>) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: { type: "usage", model: "opus-5", ...body },
      });
    const numbers = () =>
      ws.db
        .selectFrom("runs")
        .select(["input_tokens", "output_tokens", "cost_usd"])
        .where("id", "=", runId)
        .executeTakeFirst();

    const first = await post("out-only", { scope: "step", output_tokens: 232 });
    expect(first.status).toBe(201);
    expect(await numbers()).toEqual({ input_tokens: null, output_tokens: 232, cost_usd: null });

    // A count that is not known leaves the run's count as it was, a total's included.
    await post("both", { scope: "step", input_tokens: 1000, output_tokens: 8 });
    await post("total", { scope: "run", output_tokens: 300 });
    expect(await numbers()).toMatchObject({ input_tokens: 1000, output_tokens: 300 });
  });

  it("takes a usage that says its cost alone, and keeps the run's counts (ADR 0162)", async () => {
    const runId = await startedRun("cost-only");
    const post = (key: string, body: Record<string, unknown>) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: { type: "usage", model: "agent", ...body },
      });
    expect(
      (await post("cost-1", { scope: "run", cost: { usd: 0.12, estimated: true } })).status,
    ).toBe(201);
    await post("counted", { scope: "step", input_tokens: 1000, output_tokens: 8 });
    await post("cost-2", { scope: "run", cost: { usd: 0.3, estimated: true } });
    const run = await ws.db
      .selectFrom("runs")
      .select(["input_tokens", "output_tokens", "cost_usd"])
      .where("id", "=", runId)
      .executeTakeFirst();
    expect(run).toEqual({ input_tokens: 1000, output_tokens: 8, cost_usd: 0.3 });
  });

  /**
   * A run-scoped report is the total so far, so restating it moves the harness's spend by
   * nothing — `spendDelta` returns 0 and the budget is left alone. Worth its own test because
   * the replay suite reached this only by replaying that same total, which made it a property
   * of when the projection caught up: the branch was covered on some runs and not others, and
   * the branch count moved between them.
   */
  it("does not charge a harness twice for a run total it restates", async () => {
    const runId = await startedRun("restated");
    for (const key of ["total-once", "total-again"]) {
      await call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body: {
          type: "usage",
          scope: "run",
          model: "opus-5",
          input_tokens: 1000,
          output_tokens: 0,
          cost: { usd: 0.5, estimated: true },
        },
      });
    }
    const run = await ws.db
      .selectFrom("runs")
      .select(["cost_usd"])
      .where("id", "=", runId)
      .executeTakeFirst();
    expect(run?.cost_usd).toBeCloseTo(0.5, 6);
  });

  it("replaces the steps still to come with a new plan, keeping the ones done", async () => {
    const runId = ws.ids.next("run");
    const post = (key: string, body: Record<string, unknown>) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body,
      });
    await post("plan-run", {
      type: "run.started",
      space_id: ws.spaceId,
      goal: "g",
      plan: [
        { step_id: "a", title: "A" },
        { step_id: "b", title: "B" },
        { step_id: "c", title: "C" },
      ],
    });
    await post("plan-a", { type: "step.log", step_id: "a", status: "done" });
    const replanned = await post("plan-new", {
      type: "run.plan",
      plan: [
        { step_id: "d", title: "D" },
        { step_id: "c", title: "C, later" },
      ],
    });
    expect(replanned.status).toBe(201);

    const steps = await ws.db
      .selectFrom("steps")
      .select(["step_id", "status", "ordinal", "title"])
      .where("run_id", "=", runId)
      .orderBy("ordinal", "asc")
      .execute();
    expect(steps.map((step) => [step.step_id, step.status, step.ordinal])).toEqual([
      ["a", "done", 0],
      ["d", "planned", 1],
      ["c", "planned", 2],
    ]);
    expect(steps[2]?.title).toBe("C, later");
  });
});

describe("the dev-mode pairing code (phase-1-interim-review finding 12)", () => {
  it("is not there outside dev mode", async () => {
    const { status } = await call("POST", "/v1/dev/pairing-code");
    expect(status).toBe(404);
  });

  it("mints a code for the demo person in dev mode, on a loopback address", async () => {
    const dev = await createTestWorkspace({ config: { devMode: true } });
    try {
      const response = await dev.gateway.app.fetch(
        new Request("http://chips.local/v1/dev/pairing-code", { method: "POST" }),
      );
      expect(response.status).toBe(201);
      const { code } = (await response.json()) as { code: string };
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    } finally {
      await dev.close();
    }
  });

  it("is not there when the server is bound to the network, dev mode or not", async () => {
    const exposed = await createTestWorkspace({
      config: { devMode: true, server: { host: "0.0.0.0", port: 0 } },
    });
    try {
      const response = await exposed.gateway.app.fetch(
        new Request("http://chips.local/v1/dev/pairing-code", { method: "POST" }),
      );
      expect(response.status).toBe(404);
    } finally {
      await exposed.close();
    }
  });
});

describe("the operator's pairing code (ADR 0048)", () => {
  const target = "/v1/operator/pairing-code";

  it("mints a code for the workspace's first person when the token is the server's own", async () => {
    const token = gateway.deps.operatorToken ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { status, body } = await call("POST", target, {
      headers: { "x-chips-operator": token },
    });
    expect(status).toBe(201);
    expect(body["code"]).toMatch(/^[A-Z2-9]{3}-[A-Z2-9]{3}$/);
    expect(body).toMatchObject({
      v: 1,
      relay: null,
      server_key: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      candidates: [],
    });
    expect(typeof body["server_url"]).toBe("string");

    // And the code pairs a device as that person — the owner, who `chips serve` pairs its own
    // machine as.
    const publicKey = generateKeyPairSync("ed25519")
      .publicKey.export({ type: "spki", format: "der" })
      .toString("base64");
    const paired = await call("POST", "/v1/pair", {
      body: { code: body["code"], public_key: publicKey, name: "A phone" },
    });
    expect(paired.status).toBe(201);
    expect(paired.body["participant_id"]).toBe(ws.arjun.participantId);
  });

  it("refuses a wrong token and a missing one alike, and says nothing else", async () => {
    const wrong = await call("POST", target, { headers: { "x-chips-operator": "x".repeat(43) } });
    expect(wrong.status).toBe(401);
    const short = await call("POST", target, { headers: { "x-chips-operator": "x" } });
    expect(short.status).toBe(401);
    const missing = await call("POST", target);
    expect(missing.status).toBe(401);
    expect(missing.body).toMatchObject({
      error: { code: "unauthorized", message: "That is not this server's operator token." },
    });
  });
});

describe("socket tickets (finding 5)", () => {
  it("mints a single-use ticket for a signed request", async () => {
    const target = "/v1/socket-tickets";
    const first = await call("POST", target, signed(ws.arjun, "POST", target));
    expect(first.status).toBe(201);
    expect(typeof first.body["ticket"]).toBe("string");
    expect(first.body["expires_in"]).toBe(30);

    // A ticket is spent on the upgrade; here we spend it directly against the port. A second
    // redemption returns nothing, so a leaked ticket is worth one connection at most.
    const ticket = first.body["ticket"] as string;
    expect(ws.gateway.deps.socketTickets.redeem(ticket)?.participantId).toBe(
      ws.arjun.participantId,
    );
    expect(ws.gateway.deps.socketTickets.redeem(ticket)).toBeUndefined();
  });

  it("needs a credential, because a ticket is a credential", async () => {
    const { status } = await call("POST", "/v1/socket-tickets", {});
    expect(status).toBe(401);
  });
});

describe("reading, scoped by membership (finding 6)", () => {
  /** A second space Arjun is not a member of, with one event in it. */
  async function privateSpace(): Promise<{ spaceId: string; seq: number }> {
    const spaceId = ws.ids.next("space");
    const append = (type: string, extra: Record<string, unknown>) =>
      ws.gateway.deps.store.append({
        v: 1,
        type,
        id: ws.ids.next("event"),
        ts: "2026-09-02T15:00:00.000Z",
        workspace_id: ws.workspaceId,
        space_id: spaceId,
        actor: { kind: "person", id: ws.dana.participantId },
        idempotency_key: ws.ids.next("event"),
        ...extra,
        // biome-ignore lint/suspicious/noExplicitAny: the store takes a validated event; the test builds one by hand.
      } as any);

    await append("space.created", { kind: "direct" });
    await append("membership.added", {
      participant_id: ws.dana.participantId,
      participant_kind: "person",
      role: "owner",
    });
    const posted = await append("message.post", { text: "Dana and Scout only." });
    return { spaceId, seq: posted.event.seq };
  }

  it("does not return another space's events to a non-member", async () => {
    const { seq } = await privateSpace();

    const arjun = await call(
      "GET",
      "/v1/events?since=0",
      signed(ws.arjun, "GET", "/v1/events?since=0"),
    );
    const seqs = (arjun.body["events"] as { seq: number }[]).map((event) => event.seq);
    expect(seqs).not.toContain(seq);
    // Arjun still sees his own space, which was set up with four events, and the
    // workspace-wide events: two people joining and the policy.
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns a space's events to its members", async () => {
    const { seq } = await privateSpace();
    const dana = await call(
      "GET",
      "/v1/events?since=0",
      signed(ws.dana, "GET", "/v1/events?since=0"),
    );
    const seqs = (dana.body["events"] as { seq: number }[]).map((event) => event.seq);
    expect(seqs).toContain(seq);
  });

  it("does not leak another space to a harness either", async () => {
    const { seq } = await privateSpace();
    const scout = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    const seqs = (scout.body["events"] as { seq: number }[]).map((event) => event.seq);
    expect(seqs).not.toContain(seq);
  });
});

describe("the participant directory", () => {
  it("names the people and harnesses of the workspace to a person", async () => {
    const { body, status } = await call(
      "GET",
      "/v1/participants",
      signed(ws.arjun, "GET", "/v1/participants"),
    );
    expect(status).toBe(200);
    const ids = (body["participants"] as { id: string }[]).map((p) => p.id).sort();
    expect(ids).toEqual(
      [ws.arjun.participantId, ws.dana.participantId, ws.scout.participantId].sort(),
    );
    const scout = (
      body["participants"] as { id: string; display_name: string; kind: string }[]
    ).find((p) => p.id === ws.scout.participantId);
    expect(scout).toMatchObject({ display_name: "Scout", kind: "harness" });
  });

  it("does not name, to a harness, someone from a space it is not in", async () => {
    // A space between Dana and a second harness, with Scout nowhere in it.
    const other = ws.ids.next("space");
    const strangerId = ws.ids.next("harness");
    await ws.db
      .insertInto("participants")
      .values({
        id: strangerId,
        workspace_id: ws.workspaceId,
        kind: "harness",
        display_name: "Stranger",
        owner_id: ws.dana.participantId,
        parent_id: null,
        ephemeral: 0,
        capabilities: null,
        created_at: "2026-09-02T15:00:00.000Z",
      })
      .execute();
    for (const participant of [ws.dana.participantId, strangerId]) {
      await ws.gateway.deps.store.append({
        v: 1,
        type: "membership.added",
        id: ws.ids.next("event"),
        ts: "2026-09-02T15:00:00.000Z",
        workspace_id: ws.workspaceId,
        space_id: other,
        actor: { kind: "person", id: ws.dana.participantId },
        idempotency_key: ws.ids.next("event"),
        participant_id: participant,
        participant_kind: "harness",
        role: "member",
        // biome-ignore lint/suspicious/noExplicitAny: a hand-built validated event for the test.
      } as any);
    }

    const { body } = await call("GET", "/v1/participants", { headers: ws.scout.headers });
    const ids = (body["participants"] as { id: string }[]).map((p) => p.id);
    expect(ids).not.toContain(strangerId);
  });
});

describe("writing, scoped by membership (phase-1-interim-review finding 1)", () => {
  /** A direct space Dana alone is in. */
  async function danaOnly(): Promise<string> {
    const spaceId = ws.ids.next("space");
    const append = (type: string, extra: Record<string, unknown>) =>
      ws.gateway.deps.store.append({
        v: 1,
        type,
        id: ws.ids.next("event"),
        ts: "2026-09-02T15:00:00.000Z",
        workspace_id: ws.workspaceId,
        space_id: spaceId,
        actor: { kind: "person", id: ws.dana.participantId },
        idempotency_key: ws.ids.next("event"),
        ...extra,
        // biome-ignore lint/suspicious/noExplicitAny: the store takes a validated event; the test builds one by hand.
      } as any);
    await append("space.created", { kind: "direct" });
    return spaceId;
  }

  /** The types in a space, as Dana reads them. */
  async function danaSees(spaceId: string): Promise<string[]> {
    const dana = await call(
      "GET",
      "/v1/events?since=0",
      signed(ws.dana, "GET", "/v1/events?since=0"),
    );
    return (dana.body["events"] as { space_id?: string; type: string }[])
      .filter((event) => event.space_id === spaceId)
      .map((event) => event.type);
  }

  it("refuses a harness posting into a space it is not in, and appends nothing", async () => {
    const spaceId = await danaOnly();
    const { status, body } = await call("POST", `/v1/harnesses/${ws.scout.participantId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "uninvited" },
      body: {
        type: "message.post",
        space_id: spaceId,
        text: "Scout was never invited.",
      },
    });
    expect(status).toBe(403);
    expect(body["error"]).toMatchObject({ code: "forbidden" });
    expect(await danaSees(spaceId)).toEqual(["space.created"]);
  });

  it("refuses a person deciding in a space they are not in", async () => {
    const spaceId = await danaOnly();
    // A run in Dana's space, appended behind the door the way a member's would be.
    const runId = ws.ids.next("run");
    await ws.gateway.deps.store.append({
      v: 1,
      type: "run.started",
      id: ws.ids.next("event"),
      ts: "2026-09-02T15:00:00.000Z",
      workspace_id: ws.workspaceId,
      space_id: spaceId,
      run_id: runId,
      actor: { kind: "harness", id: ws.scout.participantId },
      idempotency_key: ws.ids.next("event"),
      goal: "g",
      plan: [],
      // biome-ignore lint/suspicious/noExplicitAny: a hand-built validated event for the test.
    } as any);
    const path = `/v1/runs/${runId}/events`;
    const body = {
      type: "approval.resolved",
      space_id: spaceId,
      approval_id: "apr_01K4ZQPX0000000000000000W2",
      decision: "approved",
      scope: "always",
      idempotency_key: "outside-decision",
    };
    const { status } = await call("POST", path, signed(ws.arjun, "POST", path, body));
    expect(status).toBe(403);
  });

  it("still accepts a member's event", async () => {
    const { status } = await call("POST", `/v1/harnesses/${ws.scout.participantId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "invited" },
      body: { type: "message.post", space_id: ws.spaceId, text: "From inside." },
    });
    expect(status).toBe(201);
  });

  it("makes whoever opened a space its first member", async () => {
    // Dana opened her space with nothing but `space.created`: no membership event.
    const spaceId = await danaOnly();
    expect(
      await ws.gateway.deps.readModels.isMember(ws.workspaceId, spaceId, ws.dana.participantId),
    ).toBe(true);
    expect(
      await ws.gateway.deps.readModels.spacesForMember(ws.workspaceId, ws.dana.participantId),
    ).toContain(spaceId);
  });
});

describe("policy at the door (M1.4)", () => {
  /** Arjun turns Scout's dial everywhere, the way the app would: a policy event. */
  async function setLevel(autonomy: number, rules: unknown[] = []): Promise<void> {
    await ws.gateway.deps.store.append({
      v: 1,
      type: "policy.updated",
      id: ws.ids.next("event"),
      ts: "2026-09-02T15:00:00.000Z",
      workspace_id: ws.workspaceId,
      actor: { kind: "person", id: ws.arjun.participantId },
      idempotency_key: ws.ids.next("event"),
      harness_id: ws.scout.participantId,
      policy: { autonomy, rules },
      workspace_max_autonomy: 3,
      changed_by: ws.arjun.participantId,
      // biome-ignore lint/suspicious/noExplicitAny: a hand-built validated event for the test.
    } as any);
  }

  const askToEmail = (runId: string, key: string) =>
    call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": key },
      body: {
        type: "approval.request",
        approval_id: ws.ids.next("approval"),
        action: { kind: "email.send", external: true, irreversible: true },
        risk: ["external_communication"],
        expires_in: 3600,
      },
    });

  /** A small ask, which since ADR 0195 is the only kind This session and Always are given for. */
  const askToTest = (runId: string, key: string) =>
    call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": key },
      body: {
        type: "approval.request",
        approval_id: ws.ids.next("approval"),
        action: { kind: "shell.exec" },
        risk: [],
        expires_in: 3600,
      },
    });

  it("approves an ask on the spot at L3, logged as Chips' own event, and the wait returns at once", async () => {
    await setLevel(3);
    const runId = await startedRun("auto-run");
    const asked = await askToEmail(runId, "auto-ask");
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ resolution: "approved" });
    expect(String(asked.body["reason"])).toContain("L3");

    const approvalId = String(asked.body["approval_id"]);
    const wait = await call("GET", `/v1/approvals/${approvalId}/wait?timeout=1`, {
      headers: ws.scout.headers,
    });
    expect(wait.body).toMatchObject({
      state: "resolved",
      resolution: "approved",
      resolved_by: "system",
    });

    const log = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    const types = (log.body["events"] as { type: string }[]).map((event) => event.type);
    expect(types.slice(-2)).toEqual(["approval.request", "approval.resolved"]);
  });

  it("leaves an ask for a person at L2, and denies on the spot by a rule", async () => {
    const runId = await startedRun("ask-run");
    const asked = await askToEmail(runId, "ask-ask");
    expect(asked.status).toBe(201);
    expect(asked.body["resolution"]).toBeUndefined();

    await setLevel(2, [{ match: "email.*", decision: "deny", reason: "Not from here." }]);
    const denied = await askToEmail(runId, "deny-ask");
    expect(denied.body).toMatchObject({ resolution: "denied", reason: "Not from here." });
  });

  it("takes the first decision and refuses the second, whoever makes it", async () => {
    const runId = await startedRun("first-run");
    const asked = await askToEmail(runId, "first-ask");
    const approvalId = String(asked.body["approval_id"]);
    const path = `/v1/runs/${runId}/events`;

    const first = {
      type: "approval.resolved",
      approval_id: approvalId,
      decision: "approved",
      idempotency_key: "first",
    };
    expect((await call("POST", path, signed(ws.arjun, "POST", path, first))).status).toBe(201);

    const second = {
      type: "approval.resolved",
      approval_id: approvalId,
      decision: "denied",
      idempotency_key: "second",
    };
    const refused = await call("POST", path, signed(ws.dana, "POST", path, second));
    expect(refused.status).toBe(422);
    expect(String((refused.body["error"] as Record<string, unknown>)["message"])).toContain(
      "first answer wins",
    );

    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval).toMatchObject({ decision: "approved", resolved_by: ws.arjun.participantId });
  });

  it("turns an always into a rule, and decides the next ask of that kind by it", async () => {
    // At L1 a small write asks, so the rule is what decides the next one.
    await setLevel(1);
    const runId = await startedRun("always-run");
    // An ask that matters takes Once only (ADR 0195): Always on an outside email is refused.
    const email = await askToEmail(runId, "always-email");
    const emailPath = `/v1/runs/${runId}/events`;
    const refused = await call(
      "POST",
      emailPath,
      signed(ws.arjun, "POST", emailPath, {
        type: "approval.resolved",
        approval_id: email.body["approval_id"],
        decision: "approved",
        scope: "always",
        idempotency_key: "always-email-answer",
      }),
    );
    expect(refused.status).toBe(422);
    const asked = await askToTest(runId, "always-ask");
    const approvalId = String(asked.body["approval_id"]);
    const path = `/v1/runs/${runId}/events`;
    const always = {
      type: "approval.resolved",
      approval_id: approvalId,
      decision: "approved",
      scope: "always",
      idempotency_key: "always",
    };
    const answered = await call("POST", path, signed(ws.arjun, "POST", path, always));
    expect(answered.status, JSON.stringify(answered.body)).toBe(201);

    const policy = await ws.gateway.deps.readModels.harnessPolicy(
      ws.workspaceId,
      ws.scout.participantId,
      ws.spaceId,
    );
    expect(policy?.rules[0]).toMatchObject({
      match: "shell.exec",
      decision: "allow",
      made_by: ws.arjun.participantId,
    });

    const next = await askToTest(runId, "next-ask");
    expect(next.body).toMatchObject({ resolution: "approved" });
    expect(String(next.body["reason"])).toContain("Arjun said always");
  });

  it("decides the same kind the same way for the rest of the run, with a session scope", async () => {
    await setLevel(1);
    const runId = await startedRun("session-run");
    const asked = await askToTest(runId, "session-ask");
    const path = `/v1/runs/${runId}/events`;
    const session = {
      type: "approval.resolved",
      approval_id: asked.body["approval_id"],
      decision: "approved",
      scope: "session",
      idempotency_key: "sess",
    };
    expect((await call("POST", path, signed(ws.arjun, "POST", path, session))).status).toBe(201);
    expect(await ws.gateway.deps.readModels.sessionRules(ws.workspaceId, runId)).toHaveLength(1);

    const next = await askToTest(runId, "session-next");
    expect(next.body).toMatchObject({ resolution: "approved" });

    // Another run knows nothing of it.
    const other = await startedRun("other-run");
    const fresh = await askToTest(other, "other-ask");
    expect(fresh.body["resolution"]).toBeUndefined();
  });

  /** A shell ask carrying a command, the way every bridge sends one (ADR 0239). */
  const askToRun = (runId: string, key: string, command: string) =>
    call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": key },
      body: {
        type: "approval.request",
        approval_id: ws.ids.next("approval"),
        action: { kind: "shell.exec", input: { command } },
        risk: [],
        expires_in: 3600,
      },
    });
  const answer = (runId: string, approvalId: unknown, key: string, extra: object) => {
    const path = `/v1/runs/${runId}/events`;
    const body = {
      type: "approval.resolved",
      approval_id: approvalId,
      decision: "approved",
      idempotency_key: key,
      ...extra,
    };
    return call("POST", path, signed(ws.arjun, "POST", path, body));
  };

  it("keeps a command's Always by its parts' starts, in every space, after a space's own (ADR 0239)", async () => {
    await setLevel(1);
    const runId = await startedRun("starts-run");
    const asked = await askToRun(runId, "starts-ask", "node --check a.js && echo ok");
    const everywhere = await answer(runId, asked.body["approval_id"], "starts-always", {
      scope: "always",
      everywhere: true,
    });
    expect(everywhere.status, JSON.stringify(everywhere.body)).toBe(201);

    expect((await askToRun(runId, "starts-same", "echo ok; node --check b.js")).body).toMatchObject(
      { resolution: "approved" },
    );
    const more = await askToRun(runId, "starts-more", "node --check b.js && cat b.js");
    expect(more.body["resolution"]).toBeUndefined();

    // An Always kept to this space gives it a row of its own; what was kept everywhere still holds.
    const here = await answer(runId, more.body["approval_id"], "starts-here", { scope: "always" });
    expect(here.status, JSON.stringify(here.body)).toBe(201);
    const policy = await ws.gateway.deps.readModels.harnessPolicy(
      ws.workspaceId,
      ws.scout.participantId,
      ws.spaceId,
    );
    expect(policy?.space_id).toBe(ws.spaceId);
    expect(policy?.rules.map((rule) => rule.when?.starts_with)).toEqual([
      ["node", "--check"],
      ["cat", "b.js"],
    ]);
    expect(policy?.everywhere_rules?.map((rule) => rule.when?.starts_with)).toEqual([
      ["node", "--check"],
      ["echo", "ok"],
    ]);
    expect((await askToRun(runId, "starts-both", "cat b.js | echo ok")).body).toMatchObject({
      resolution: "approved",
    });
  });

  it("keeps a command's This session by its parts' starts, and refuses one it can't read (ADR 0239)", async () => {
    await setLevel(1);
    const runId = await startedRun("session-starts-run");
    const asked = await askToRun(runId, "ss-ask", "ls -la && git status --short");
    const session = await answer(runId, asked.body["approval_id"], "ss-answer", {
      scope: "session",
    });
    expect(session.status, JSON.stringify(session.body)).toBe(201);
    const rules = await ws.gateway.deps.readModels.sessionRules(ws.workspaceId, runId);
    expect(rules.map((rule) => rule.when?.starts_with)).toEqual([
      ["ls", "-la"],
      ["git", "status"],
    ]);
    expect((await askToRun(runId, "ss-next", "git status | ls -la")).body).toMatchObject({
      resolution: "approved",
    });
    expect(
      (await askToRun(runId, "ss-other", "ls -la && rm x")).body["resolution"],
    ).toBeUndefined();

    const written = await askToRun(runId, "ss-write", "echo hi > out.txt");
    const refused = await answer(runId, written.body["approval_id"], "ss-refused", {
      scope: "session",
    });
    expect(refused.status).toBe(422);
  });
});

describe("the sweep: what nobody answered in time (M1.4)", () => {
  const sweepAt = (ms: number) =>
    createSweep({
      store: ws.gateway.deps.store,
      readModels: ws.gateway.deps.readModels,
      clock: manualClock(ms),
      ids: ws.ids,
    });

  it("asks for pushes' receipts, counting the tokens they had forgotten", async () => {
    let checks = 0;
    const withReceipts = createSweep({
      store: ws.gateway.deps.store,
      readModels: ws.gateway.deps.readModels,
      clock: manualClock(Date.now()),
      ids: ws.ids,
      receipts: {
        check: async () => {
          checks += 1;
          return 2;
        },
      },
    });
    expect((await withReceipts()).undeliverable).toBe(2);
    expect(checks).toBe(1);
    expect((await sweepAt(Date.now())()).undeliverable).toBe(0);
  });

  it("resolves an approval as expired by its fallback, once, and the run carries on", async () => {
    const runId = await startedRun("expiry-run");
    const asked = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "expiring" },
      body: {
        type: "approval.request",
        approval_id: ws.ids.next("approval"),
        action: { kind: "email.send", external: true },
        risk: ["external"],
        expires_in: 60,
      },
    });
    const approvalId = String(asked.body["approval_id"]);

    const early = await sweepAt(Date.now())();
    expect(early.expired).toEqual([]);

    const late = await sweepAt(Date.now() + 120_000)();
    expect(late.expired).toEqual([approvalId]);
    const approval = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(approval).toMatchObject({
      state: "resolved",
      decision: "expired",
      resolved_by: "system",
    });
    expect(approval?.reason).toContain("deny");
    expect((await ws.gateway.deps.readModels.run(ws.workspaceId, runId))?.state).toBe("running");

    const again = await sweepAt(Date.now() + 240_000)();
    expect(again.expired).toEqual([]);
  });

  it("answers a question nobody answered with its default, as timed out", async () => {
    const runId = await startedRun("timeout-run");
    const askId = ws.ids.next("question");
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "asking" },
      body: {
        type: "question.ask",
        ask_id: askId,
        questions: [
          {
            question_id: "date",
            prompt: "Which date?",
            options: [
              { value: "19", label: "19 Sep" },
              { value: "26", label: "26 Sep" },
            ],
            default_value: "19",
          },
        ],
        timeout_seconds: 30,
      },
    });

    const result = await sweepAt(Date.now() + 60_000)();
    expect(result.timedOut).toEqual([askId]);
    const question = await ws.gateway.deps.readModels.question(ws.workspaceId, askId);
    expect(question).toMatchObject({ state: "answered", answered_by: "system" });
    const log = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    const answered = (log.body["events"] as Record<string, unknown>[]).find(
      (event) => event["type"] === "question.answered",
    );
    expect(answered).toMatchObject({
      timed_out: true,
      answers: [{ question_id: "date", values: ["19"] }],
    });
  });
});

describe("a task over HTTP (M3.5)", () => {
  it("acknowledges with where the lane is, so a lead that drives it knows where to post", async () => {
    const runId = ws.ids.next("run");
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "lane-run" },
      body: { type: "run.started", space_id: ws.spaceId, goal: "Look into it", plan: [] },
    });
    const laneId = ws.ids.next("lane");
    const routed = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "lane-task" },
      body: {
        type: "task",
        space_id: ws.spaceId,
        task_id: laneId,
        to: ws.scout.participantId,
        home: ws.spaceId,
        label: "Explore",
        on_behalf_of: ws.arjun.participantId,
        goal: "Find where the quotes live",
      },
    });
    expect(routed.status).toBe(201);
    const lane = await ws.gateway.deps.readModels.lane(ws.workspaceId, laneId);
    expect(routed.body["lane"]).toEqual({
      lane_id: laneId,
      run_id: lane?.run_id,
      space_id: ws.spaceId,
    });

    // The harness route says so too, for an adapter that posts there.
    const second = ws.ids.next("lane");
    const viaHarness = await call("POST", `/v1/harnesses/${ws.scout.participantId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "lane-task-2" },
      body: {
        type: "task",
        space_id: ws.spaceId,
        run_id: runId,
        task_id: second,
        to: ws.scout.participantId,
        home: ws.spaceId,
        on_behalf_of: ws.arjun.participantId,
        goal: "And the invoices",
      },
    });
    expect(viaHarness.status).toBe(201);
    expect(viaHarness.body["lane"]).toMatchObject({ lane_id: second, space_id: ws.spaceId });
  });
});

describe("an approval decided after its run has ended (M3.5)", () => {
  it("takes the decision and its outcome, and nothing else, into a finished run", async () => {
    const runId = ws.ids.next("run");
    const asScout = (key: string, body: Record<string, unknown>) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body,
      });
    await asScout("d-run", {
      type: "run.started",
      space_id: ws.spaceId,
      goal: "Fetch the quotes",
      plan: [],
    });
    // The gate asks, gets no answer in time, hands the question back to the terminal, and the
    // turn ends before anybody decides in Chips.
    const asked = await asScout("d-ask", {
      type: "approval.request",
      space_id: ws.spaceId,
      approval_id: ws.ids.next("approval"),
      action: { kind: "http.fetch", input: { url: "https://northwind.example" } },
      risk: ["external"],
      expires_in: 3600,
      fallback: "deny",
    });
    expect(asked.status).toBe(201);
    const approvalId = String(asked.body["approval_id"]);
    expect(
      (await asScout("d-done", { type: "run.completed", space_id: ws.spaceId, summary: "Done." }))
        .status,
    ).toBe(201);

    // Arjun's decision, late, still settles the card.
    const path = `/v1/runs/${runId}/events`;
    const decision = {
      type: "approval.resolved",
      space_id: ws.spaceId,
      approval_id: approvalId,
      decision: "approved",
      scope: "once",
      reason: "Go ahead.",
      idempotency_key: "d-yes",
    };
    const resolved = await call("POST", path, signed(ws.arjun, "POST", path, decision));
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(201);

    // And the harness reports what became of it, on the same finished run.
    const told = await asScout("d-executed", {
      type: "approval.executed",
      space_id: ws.spaceId,
      approval_id: approvalId,
      outcome: "executed",
      detail: "Carried into the session by starting it again.",
    });
    expect(told.status, JSON.stringify(told.body)).toBe(201);
    const card = await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId);
    expect(card).toMatchObject({ state: "resolved", decision: "approved" });

    // Anything else into the finished run is still refused.
    const late = await asScout("d-step", {
      type: "step.log",
      space_id: ws.spaceId,
      step_id: "late",
      status: "done",
      title: "Too late",
    });
    expect(late.status).toBe(422);
  });
});

describe("a question answered after its run has ended", () => {
  it("takes the answer, once, into a finished run, as Jacobian asks and ends its turn", async () => {
    const runId = ws.ids.next("run");
    const askId = ws.ids.next("question");
    const asScout = (key: string, body: Record<string, unknown>) =>
      call("POST", `/v1/runs/${runId}/events`, {
        headers: { ...ws.scout.headers, "idempotency-key": key },
        body,
      });
    await asScout("q-run", {
      type: "run.started",
      space_id: ws.spaceId,
      goal: "Add a Bronze theme",
      plan: [],
    });
    // The turn posts its plan, asks with the plan's buttons, and ends: the order the Chess Game
    // space's run came in on 15 September 2026.
    const asked = await asScout("q-ask", {
      type: "question.ask",
      space_id: ws.spaceId,
      ask_id: askId,
      questions: [
        {
          question_id: "choice",
          prompt: "Choose one, or reply in your own words:",
          options: [
            { value: "ask:4ea1ce76:0", label: "Approve" },
            { value: "ask:4ea1ce76:1", label: "Revise" },
            { value: "ask:4ea1ce76:2", label: "Deny" },
          ],
          allow_free_text: true,
        },
      ],
      on_no_answer: "continue",
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    const done = await asScout("q-done", {
      type: "run.completed",
      space_id: ws.spaceId,
      summary: "Please review the mock.",
    });
    expect(done.status).toBe(201);

    const path = `/v1/runs/${runId}/events`;
    const answer = (values: string[], key: string) =>
      call(
        "POST",
        path,
        signed(ws.arjun, "POST", path, {
          type: "question.answered",
          space_id: ws.spaceId,
          ask_id: askId,
          answers: [{ question_id: "choice", values }],
          idempotency_key: key,
        }),
      );
    const answered = await answer(["ask:4ea1ce76:0"], "q-yes");
    expect(answered.status, JSON.stringify(answered.body)).toBe(201);
    const question = await ws.gateway.deps.readModels.question(ws.workspaceId, askId);
    expect(question).toMatchObject({ state: "answered", answered_by: ws.arjun.participantId });
    const run = await ws.db
      .selectFrom("runs")
      .select("state")
      .where("id", "=", runId)
      .executeTakeFirstOrThrow();
    expect(run.state).toBe("done");

    // First answer wins, on a finished run as on a live one; and nothing else gets in.
    const again = await answer(["ask:4ea1ce76:2"], "q-no");
    expect(again.status).toBe(422);
    expect(JSON.stringify(again.body)).toContain("the first answer wins");
    const late = await asScout("q-step", {
      type: "step.log",
      space_id: ws.spaceId,
      step_id: "late",
      status: "done",
      title: "Too late",
    });
    expect(late.status).toBe(422);
  });
});

describe("messaging depth (M5.4)", () => {
  const asMessage = (body: Record<string, unknown>) =>
    String(body["event_id"]).replace(/^evt_/, "msg_");

  async function startRun(): Promise<string> {
    const runId = ws.ids.next("run");
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "run-1" },
      body: { type: "run.started", space_id: ws.spaceId, goal: "Confirm PO #4471", plan: [] },
    });
    return runId;
  }

  /** An event from a person, signed, on the run's route. */
  function fromPerson(
    person: TestWorkspace["arjun"],
    runId: string,
    event: Record<string, unknown>,
  ) {
    const path = `/v1/runs/${runId}/events`;
    return call("POST", path, signed(person, "POST", path, event));
  }

  async function messageRow(eventId: string) {
    return ws.db
      .selectFrom("messages")
      .select(["text", "edited_at", "deleted_at"])
      .where("id", "=", eventId)
      .executeTakeFirst();
  }

  /** A person as the door sees them, for an event no run is in the way of. */
  function principalOf(
    person: TestWorkspace["arjun"],
    displayName: string,
    role: "owner" | "member",
  ): Principal {
    return {
      kind: "person",
      participantId: person.participantId,
      workspaceId: ws.workspaceId,
      displayName,
      via: "device_key",
      deviceId: person.deviceId,
      role,
    };
  }

  const submit = (principal: Principal, event: Record<string, unknown>) =>
    ws.gateway.deps.submitEvent({ event, principal });

  it("lets a message be edited by its author, and taken back by its author or the room's owner", async () => {
    const runId = await startRun();
    const said = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "said-1" },
      body: { type: "message.post", space_id: ws.spaceId, text: "Delivery is on the 12th." },
    });
    const messageId = asMessage(said.body);

    const edited = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "edit-1" },
      body: { type: "message.edited", message_id: messageId, text: "Delivery is on the 19th." },
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(201);
    expect(await messageRow(String(said.body["event_id"]))).toMatchObject({
      text: "Delivery is on the 19th.",
    });

    // Dana is a member of the room, and the words are not hers to change.
    const danaEdits = await fromPerson(ws.dana, runId, {
      type: "message.edited",
      message_id: messageId,
      text: "Never.",
      idempotency_key: "dana-edit",
    });
    expect(danaEdits.status).toBe(403);
    const danaDeletes = await fromPerson(ws.dana, runId, {
      type: "message.deleted",
      message_id: messageId,
      idempotency_key: "dana-delete",
    });
    expect(danaDeletes.status).toBe(403);

    // Arjun owns the room: he may take it back, and the words leave the row.
    const arjunDeletes = await fromPerson(ws.arjun, runId, {
      type: "message.deleted",
      message_id: messageId,
      reason: "Wrong date.",
      idempotency_key: "arjun-delete",
    });
    expect(arjunDeletes.status, JSON.stringify(arjunDeletes.body)).toBe(201);
    const row = await messageRow(String(said.body["event_id"]));
    expect(row?.text).toBeNull();
    expect(row?.deleted_at).not.toBeNull();

    // And once taken back, it is left alone.
    const late = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "edit-2" },
      body: { type: "message.edited", message_id: messageId, text: "Too late." },
    });
    expect(late.status).toBe(422);
    const nothing = await fromPerson(ws.arjun, runId, {
      type: "message.deleted",
      message_id: `msg_${ws.ids.next("event").slice(4)}`,
      idempotency_key: "delete-nothing",
    });
    expect(nothing.status).toBe(404);
  });

  it("pins a message for anyone in the room but a guest, and takes reactions on anyone's", async () => {
    const runId = await startRun();
    const said = await fromPerson(ws.arjun, runId, {
      type: "message.post",
      space_id: ws.spaceId,
      text: "Is it the 12th?",
      idempotency_key: "arjun-said",
    });
    const messageId = asMessage(said.body);

    const pinned = await fromPerson(ws.dana, runId, {
      type: "message.pinned",
      message_id: messageId,
      idempotency_key: "dana-pins",
    });
    expect(pinned.status, JSON.stringify(pinned.body)).toBe(201);
    const pins = await ws.db.selectFrom("pins").selectAll().execute();
    expect(pins).toMatchObject([{ message_id: messageId, pinned_by: ws.dana.participantId }]);

    // A guest of the room may not; a harness may not, whoever it is.
    const guest = await ws.addPerson("Vendor", "guest");
    await fromPerson(ws.arjun, runId, {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: guest.participantId,
      participant_kind: "person",
      role: "guest",
      idempotency_key: "add-vendor",
    });
    const guestPins = await fromPerson(guest, runId, {
      type: "message.pinned",
      message_id: messageId,
      idempotency_key: "vendor-pins",
    });
    expect(guestPins.status).toBe(403);
    const scoutPins = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": "scout-pins" },
      body: { type: "message.pinned", message_id: messageId },
    });
    expect(scoutPins.status).toBe(403);

    // A reaction on a person's message is fine now; a correction still needs a harness's.
    const thumbs = await fromPerson(ws.dana, runId, {
      type: "feedback",
      message_id: messageId,
      kind: "reaction",
      reaction: "👍",
      idempotency_key: "dana-thumbs",
    });
    expect(thumbs.status, JSON.stringify(thumbs.body)).toBe(201);
    const note = await fromPerson(ws.dana, runId, {
      type: "feedback",
      message_id: messageId,
      kind: "correction",
      text: "No.",
      idempotency_key: "dana-note",
    });
    expect(note.status).toBe(422);

    const unpinned = await fromPerson(ws.arjun, runId, {
      type: "message.unpinned",
      message_id: messageId,
      idempotency_key: "arjun-unpins",
    });
    expect(unpinned.status).toBe(201);
    expect(await ws.db.selectFrom("pins").selectAll().execute()).toEqual([]);
  });

  it("opens a thread for the room, which its members read and outsiders do not", async () => {
    const runId = await startRun();
    const said = await fromPerson(ws.arjun, runId, {
      type: "message.post",
      space_id: ws.spaceId,
      text: "Shall we take this to a thread?",
      idempotency_key: "arjun-said",
    });
    const messageId = asMessage(said.body);
    const arjun = principalOf(ws.arjun, "Arjun", "owner");
    const threadId = ws.ids.next("space");
    const opened = await submit(arjun, {
      type: "space.created",
      space_id: threadId,
      kind: "thread",
      parent_space_id: ws.spaceId,
      root_message_id: messageId,
      idempotency_key: "thread-1",
    });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);

    // A second thread on the same message is refused, naming the first.
    const again = await submit(arjun, {
      type: "space.created",
      space_id: ws.ids.next("space"),
      kind: "thread",
      parent_space_id: ws.spaceId,
      root_message_id: messageId,
      idempotency_key: "thread-2",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.message).toContain(threadId);

    // Dana, in the room, posts into the thread without ever being added to it.
    const reply = await submit(principalOf(ws.dana, "Dana", "member"), {
      type: "message.post",
      space_id: threadId,
      text: "Yes, let's.",
      idempotency_key: "dana-reply",
    });
    expect(reply.ok, JSON.stringify(reply)).toBe(true);
    const danaReads = await call(
      "GET",
      `/v1/events?since=0&space_id=${threadId}`,
      signed(ws.dana, "GET", `/v1/events?since=0&space_id=${threadId}`),
    );
    // The read carries the workspace-wide events too; the thread's own are these.
    const inThread = (body: Record<string, unknown>) =>
      (body["events"] as { type: string; space_id?: string }[])
        .filter((e) => e.space_id === threadId)
        .map((e) => e.type);
    expect(inThread(danaReads.body)).toEqual(["space.created", "message.post"]);

    // Priya, not in the room, reads nothing of it, and is refused when she tries to post.
    const priya = await ws.addPerson("Priya", "member");
    const priyaReads = await call(
      "GET",
      `/v1/events?since=0&space_id=${threadId}`,
      signed(priya, "GET", `/v1/events?since=0&space_id=${threadId}`),
    );
    expect(inThread(priyaReads.body)).toEqual([]);
    const priyaPosts = await submit(principalOf(priya, "Priya", "member"), {
      type: "message.post",
      space_id: threadId,
      text: "Hello?",
      idempotency_key: "priya-reply",
    });
    expect(priyaPosts).toMatchObject({ ok: false, error: { kind: "wrong_space" } });

    // Nobody is added to a thread: whoever is in the room is in it.
    const added = await submit(arjun, {
      type: "membership.added",
      space_id: threadId,
      participant_id: priya.participantId,
      participant_kind: "person",
      role: "member",
      idempotency_key: "add-priya",
    });
    expect(added).toMatchObject({ ok: false, error: { kind: "invalid" } });
  });

  it("searches the caller's spaces, and only those", async () => {
    const runId = await startRun();
    await fromPerson(ws.arjun, runId, {
      type: "message.post",
      space_id: ws.spaceId,
      text: "Northwind confirmed the 19th.",
      idempotency_key: "arjun-said",
    });
    // A room of Arjun's own: Dana is not in it.
    const direct = ws.ids.next("space");
    const arjun = principalOf(ws.arjun, "Arjun", "owner");
    const opened = await submit(arjun, {
      type: "space.created",
      space_id: direct,
      kind: "group",
      title: "Mine",
      idempotency_key: "d-1",
    });
    expect(opened.ok, JSON.stringify(opened)).toBe(true);
    const privately = await submit(arjun, {
      type: "message.post",
      space_id: direct,
      text: "Northwind, privately.",
      idempotency_key: "d-2",
    });
    expect(privately.ok, JSON.stringify(privately)).toBe(true);

    const mine = await call(
      "GET",
      "/v1/search?q=northwind",
      signed(ws.arjun, "GET", "/v1/search?q=northwind"),
    );
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    expect(mine.body["hits"], JSON.stringify(mine.body)).toHaveLength(2);
    expect(mine.body["next_cursor"]).toBeNull();

    const dana = await call(
      "GET",
      "/v1/search?q=northwind&limit=1",
      signed(ws.dana, "GET", "/v1/search?q=northwind&limit=1"),
    );
    expect(dana.status).toBe(200);
    expect(dana.body["hits"]).toMatchObject([{ kind: "message", space_id: ws.spaceId }]);

    // Scout shares the first room with Arjun and Dana, and is not in Arjun's own.
    const scout = await call("GET", "/v1/search?q=northwind", { headers: ws.scout.headers });
    expect(scout.body["hits"]).toMatchObject([{ kind: "message", space_id: ws.spaceId }]);

    const bare = await call("GET", "/v1/search", signed(ws.arjun, "GET", "/v1/search"));
    expect(bare.status).toBe(422);
    const silly = await call(
      "GET",
      "/v1/search?q=x&limit=0",
      signed(ws.arjun, "GET", "/v1/search?q=x&limit=0"),
    );
    expect(silly.status).toBe(422);
  });
});

describe("approval routing (M5.5)", () => {
  const principalOf = (kind: "person" | "harness", id: string, name: string): Principal =>
    kind === "person"
      ? {
          kind,
          participantId: id,
          workspaceId: ws.workspaceId,
          displayName: name,
          via: "device_key",
          role: id === ws.arjun.participantId ? "owner" : "member",
        }
      : {
          kind,
          participantId: id,
          workspaceId: ws.workspaceId,
          displayName: name,
          via: "harness_token",
          ownerId: ws.arjun.participantId,
        };
  const submit = (principal: Principal, event: Record<string, unknown>) =>
    ws.gateway.deps.submitEvent({ event, principal });

  async function ask(runId: string, approvers?: string[]): Promise<string> {
    await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": `${runId}-run` },
      body: { type: "run.started", space_id: ws.spaceId, goal: "Confirm PO #4471", plan: [] },
    });
    const asked = await call("POST", `/v1/runs/${runId}/events`, {
      headers: { ...ws.scout.headers, "idempotency-key": `${runId}-ask` },
      body: {
        type: "approval.request",
        space_id: ws.spaceId,
        approval_id: ws.ids.next("approval"),
        action: { kind: "email.send", external: true },
        risk: ["external_communication"],
        expires_in: 3600,
        fallback: "deny",
        ...(approvers === undefined ? {} : { approvers }),
      },
    });
    expect(asked.status, JSON.stringify(asked.body)).toBe(201);
    return String(asked.body["approval_id"]);
  }

  const decision = (approvalId: string, key: string) => ({
    type: "approval.resolved",
    space_id: ws.spaceId,
    approval_id: approvalId,
    decision: "approved",
    scope: "once",
    idempotency_key: key,
  });

  it("hands an approval to a teammate or a role: the old names may no longer answer, the new may, and the audit says who handed it on", async () => {
    const runId = ws.ids.next("run");
    const approvalId = await ask(runId);
    const path = `/v1/runs/${runId}/events`;
    expect(await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId)).toMatchObject({
      approvers: [ws.arjun.participantId],
    });

    // Dana may not hand on what is not hers to answer; Arjun, named, may.
    const danaRoutes = await call(
      "POST",
      path,
      signed(ws.dana, "POST", path, {
        type: "approval.routed",
        space_id: ws.spaceId,
        approval_id: approvalId,
        to: [ws.dana.participantId],
        idempotency_key: "dana-routes",
      }),
    );
    expect(danaRoutes.status).toBe(403);
    const routed = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, {
        type: "approval.routed",
        space_id: ws.spaceId,
        approval_id: approvalId,
        to: [ws.dana.participantId],
        reason: "Dana knows the account.",
        approvers: ["usr_forged"],
        idempotency_key: "arjun-routes",
      }),
    );
    expect(routed.status, JSON.stringify(routed.body)).toBe(201);
    expect(await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId)).toMatchObject({
      approvers: [ws.dana.participantId],
      state: "pending",
    });
    const log = await ws.gateway.deps.store.since(ws.workspaceId, 0, 100);
    const stored = log.events.find((event) => event.type === "approval.routed");
    expect(stored?.payload).toMatchObject({
      approvers: [ws.dana.participantId],
      routed_by: ws.arjun.participantId,
      reason: "Dana knows the account.",
    });

    // Arjun handed it on and may no longer answer; Dana may, and the log says she did.
    const arjunDecides = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, decision(approvalId, "arjun-decides")),
    );
    expect(arjunDecides.status).toBe(403);
    const danaDecides = await call(
      "POST",
      path,
      signed(ws.dana, "POST", path, decision(approvalId, "dana-decides")),
    );
    expect(danaDecides.status, JSON.stringify(danaDecides.body)).toBe(201);
    expect(await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId)).toMatchObject({
      state: "resolved",
      resolved_by: ws.dana.participantId,
    });
    // A decision made is not handed on.
    const late = await call(
      "POST",
      path,
      signed(ws.arjun, "POST", path, {
        type: "approval.routed",
        space_id: ws.spaceId,
        approval_id: approvalId,
        to: [ws.arjun.participantId],
        idempotency_key: "too-late",
      }),
    );
    expect(late.status).toBe(422);

    // A role reads the workspace's standing too: Priya, an admin in the room, is `role:admin`.
    const priya = await ws.addPerson("Priya", "admin");
    await submit(principalOf("person", ws.arjun.participantId, "Arjun"), {
      type: "membership.added",
      space_id: ws.spaceId,
      participant_id: priya.participantId,
      participant_kind: "person",
      role: "member",
      idempotency_key: "add-priya",
    });
    const second = ws.ids.next("run");
    const another = await ask(second);
    const toAdmins = await submit(principalOf("person", ws.arjun.participantId, "Arjun"), {
      type: "approval.routed",
      space_id: ws.spaceId,
      run_id: second,
      approval_id: another,
      to: ["role:admin"],
      idempotency_key: "to-admins",
    });
    expect(toAdmins.ok, JSON.stringify(toAdmins)).toBe(true);
    expect(await ws.gateway.deps.readModels.approval(ws.workspaceId, another)).toMatchObject({
      approvers: [priya.participantId],
    });
  });

  it("lets a lead answer what policy handed it, from outside the specialist's room, and a person take it back (open decision 7)", async () => {
    const arjun = principalOf("person", ws.arjun.participantId, "Arjun");
    const scout = principalOf("harness", ws.scout.participantId, "Scout");
    const added = await ws.gateway.deps.addHarness({ principal: arjun, displayName: "Ledger" });
    if (!added.ok) throw new Error("could not add Ledger");
    const ledger = principalOf("harness", added.value.harnessId, "Ledger");

    // Scout, the lead, routes a task to Ledger; the lane opens in Ledger's own room with Arjun.
    const leadRun = ws.ids.next("run");
    const laneId = ws.ids.next("lane");
    await submit(scout, {
      type: "run.started",
      space_id: ws.spaceId,
      run_id: leadRun,
      goal: "Confirm PO-4471 with Northwind",
      plan: [],
      idempotency_key: "lead-run",
    });
    const task = await submit(scout, {
      type: "task",
      space_id: ws.spaceId,
      run_id: leadRun,
      task_id: laneId,
      to: ledger.participantId,
      on_behalf_of: ws.arjun.participantId,
      goal: "Check the three Northwind quotes",
      link_to: ws.spaceId,
      idempotency_key: "lead-task",
    });
    expect(task.ok, JSON.stringify(task)).toBe(true);
    const lane = await ws.gateway.deps.readModels.lane(ws.workspaceId, laneId);
    const laneRun = lane?.run_id ?? "";
    const home = lane?.home_space_id ?? "";
    expect(laneRun).not.toBe("");
    await submit(ledger, {
      type: "run.started",
      space_id: home,
      run_id: laneRun,
      goal: "Check the three Northwind quotes",
      plan: [],
      idempotency_key: "lane-run",
    });

    // Arjun's rule for Ledger hands its calendar writes to the lead (Gate 5: a person's rule,
    // never the specialist's own refs; and never for money, a deletion or an external action).
    await submit(arjun, {
      type: "policy.updated",
      harness_id: ledger.participantId,
      policy: {
        autonomy: 1,
        rules: [{ match: "calendar.*", decision: "ask", approvers: ["lead"] }],
      },
      budget_usd: 25,
      idempotency_key: "ledger-policy",
    });
    const ask = (approvalId: string, key: string) =>
      submit(ledger, {
        type: "approval.request",
        space_id: home,
        run_id: laneRun,
        approval_id: approvalId,
        action: { kind: "calendar.write" },
        risk: [],
        expires_in: 3600,
        fallback: "deny",
        idempotency_key: key,
      });
    const approvalId = ws.ids.next("approval");
    const asked = await ask(approvalId, "lane-ask");
    expect(asked.ok, JSON.stringify(asked)).toBe(true);
    expect(await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId)).toMatchObject({
      approvers: [ws.scout.participantId],
    });

    // Scout is not in Ledger's room, and is sent the ask because it names Scout.
    const seen = await call("GET", "/v1/events?since=0", { headers: ws.scout.headers });
    const requests = (seen.body["events"] as Record<string, unknown>[]).filter(
      (event) => event["type"] === "approval.request" && event["approval_id"] === approvalId,
    );
    expect(requests).toHaveLength(1);
    expect(
      await ws.gateway.deps.readModels.isMember(ws.workspaceId, home, scout.participantId),
    ).toBe(false);

    // Arjun, in the room and the person the work is for, was not handed it; he may take it.
    const lanePath = `/v1/runs/${laneRun}/events`;
    const arjunFirst = await call(
      "POST",
      lanePath,
      signed(ws.arjun, "POST", lanePath, {
        type: "approval.resolved",
        space_id: home,
        approval_id: approvalId,
        decision: "approved",
        scope: "once",
        idempotency_key: "arjun-first",
      }),
    );
    expect(arjunFirst.status, JSON.stringify(arjunFirst.body)).toBe(403);

    // Scout, the lead, answers from outside the room.
    const scoutDecides = await call("POST", lanePath, {
      headers: { ...ws.scout.headers, "idempotency-key": "scout-decides" },
      body: {
        type: "approval.resolved",
        space_id: home,
        approval_id: approvalId,
        decision: "approved",
        scope: "once",
      },
    });
    expect(scoutDecides.status, JSON.stringify(scoutDecides.body)).toBe(201);
    expect(await ws.gateway.deps.readModels.approval(ws.workspaceId, approvalId)).toMatchObject({
      state: "resolved",
      resolved_by: ws.scout.participantId,
    });

    // A second ask, taken back by Arjun before the lead answers: he hands it to himself.
    const secondId = ws.ids.next("approval");
    await ask(secondId, "lane-ask-2");
    const takenBack = await call(
      "POST",
      lanePath,
      signed(ws.arjun, "POST", lanePath, {
        type: "approval.routed",
        space_id: home,
        approval_id: secondId,
        to: [ws.arjun.participantId],
        idempotency_key: "arjun-takes-it",
      }),
    );
    expect(takenBack.status, JSON.stringify(takenBack.body)).toBe(201);
    const scoutLate = await call("POST", lanePath, {
      headers: { ...ws.scout.headers, "idempotency-key": "scout-late" },
      body: {
        type: "approval.resolved",
        space_id: home,
        approval_id: secondId,
        decision: "approved",
        scope: "once",
      },
    });
    expect(scoutLate.status).toBe(403);
    // And Scout, still a harness in somebody else's run, may post nothing else there.
    const scoutPosts = await call("POST", lanePath, {
      headers: { ...ws.scout.headers, "idempotency-key": "scout-posts" },
      body: { type: "checkpoint", space_id: home, label: "Hello?" },
    });
    expect(scoutPosts.status).toBe(403);
  });
});

describe("the body cap, before the credential (SEC-11)", () => {
  /** A body of `bytes` bytes, as chunks on a stream with no `content-length` to say how long. */
  function streamed(bytes: number, chunk = 16 * 1024): ReadableStream<Uint8Array> {
    let sent = 0;
    return new ReadableStream({
      pull(controller) {
        if (sent >= bytes) {
          controller.close();
          return;
        }
        const size = Math.min(chunk, bytes - sent);
        controller.enqueue(new Uint8Array(size).fill(120));
        sent += size;
      },
    });
  }

  it("refuses a stranger's body over the fixed budget by its content-length, with a 413 and not a 401", async () => {
    const response = await gateway.app.fetch(
      new Request("http://chips.local/v1/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(UNAUTHENTICATED_BODY_BYTES + 1),
        },
        body: "x".repeat(UNAUTHENTICATED_BODY_BYTES + 1),
      }),
    );
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "payload_too_large",
    );
  });

  it("counts a body as it streams, so one with no content-length is capped at the byte it goes over", async () => {
    const response = await gateway.app.fetch(
      new Request("http://chips.local/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: streamed(UNAUTHENTICATED_BODY_BYTES + 1),
        duplex: "half",
      } as RequestInit),
    );
    expect(response.status).toBe(413);
    // And one just under it is read: the pairing door answers it as the bad JSON it is.
    const under = await gateway.app.fetch(
      new Request("http://chips.local/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: streamed(UNAUTHENTICATED_BODY_BYTES),
        duplex: "half",
      } as RequestInit),
    );
    expect(under.status).toBe(422);
  });

  it("holds a signed body to the workspace's limit, and an upload's bytes to the attachment's", async () => {
    const small = await createTestWorkspace({
      config: {
        limits: { ...defaultConfig().limits, maxBodyBytes: 2048, maxAttachmentBytes: 4096 },
      },
    });
    try {
      const text = JSON.stringify({ type: "message.post", text: "x".repeat(2100) });
      const over = await small.gateway.app.fetch(
        new Request("http://chips.local/v1/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...small.arjun.sign("POST", "/v1/events", text),
          },
          body: text,
        }),
      );
      expect(over.status).toBe(413);
      // An upload's bytes are not a JSON body: they get the attachment limit, which is larger.
      const bytes = new Uint8Array(3000).fill(1);
      const upload = await small.gateway.app.fetch(
        new Request("http://chips.local/v1/uploads/att_nothing", {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            ...small.arjun.sign("PUT", "/v1/uploads/att_nothing", bytes),
          },
          body: bytes,
        }),
      );
      expect(upload.status).not.toBe(413);
      const tooBig = new Uint8Array(4097).fill(1);
      const refused = await small.gateway.app.fetch(
        new Request("http://chips.local/v1/uploads/att_nothing", {
          method: "PUT",
          headers: {
            "content-type": "application/octet-stream",
            ...small.arjun.sign("PUT", "/v1/uploads/att_nothing", tooBig),
          },
          body: tooBig,
        }),
      );
      expect(refused.status).toBe(413);
    } finally {
      await small.close();
    }
  });

  it("caps a chunked body over the port too, where the request is Node's", async () => {
    const listening = await gateway.listen();
    const response = await fetch(`http://127.0.0.1:${listening.port}/v1/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: streamed(UNAUTHENTICATED_BODY_BYTES + 1),
      duplex: "half",
    } as RequestInit);
    expect(response.status).toBe(413);
  });
});

describe("the headers that go into every log line (SEC-38)", () => {
  it("takes a request id and a workspace id only short and plain, and mints or drops the rest", async () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      destination: { write: (line: string) => void lines.push(line) },
    });
    const own = await createTestWorkspace({ logger });
    try {
      const long = "x".repeat(10_000);
      const forged = `wsp_1","level":"error","msg":"forged`;
      const bloated = await own.gateway.app.fetch(
        new Request("http://chips.local/v1/nope", {
          headers: { "x-request-id": long, "x-chips-workspace": forged },
        }),
      );
      expect(bloated.status).toBe(401);
      const minted = bloated.headers.get("x-request-id") ?? "";
      expect(minted).toMatch(/^evt_/);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line).not.toContain("xxxxxxxxxx");
        expect(line).not.toContain("forged");
      }
      expect(lines.some((line) => line.includes(minted))).toBe(true);

      const plain = await own.gateway.app.fetch(
        new Request("http://chips.local/v1/health", {
          headers: {
            "x-request-id": "req-42.a:b",
            "x-chips-workspace": "wsp_01K4ZQPX00000000000000000Z",
          },
        }),
      );
      expect(plain.headers.get("x-request-id")).toBe("req-42.a:b");
    } finally {
      await own.close();
    }
  });
});
