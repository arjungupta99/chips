/**
 * The SDK against a real chipsd: the contract (technical-plan 6.3). Everything a harness
 * author does — connect, start a run, log steps, ask, hear what people say — against the
 * server's public surface on a real socket.
 */

import {
  CEILING,
  createIdGenerator,
  HARNESS_CAPABILITIES,
  type MessageNew,
  messageIdOf,
} from "@chipschat/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConnectError,
  connect,
  RefusedError,
  renderContext,
  type SocketLike,
  type SpaceAsked,
} from "./index.js";
import { startTestServer, type TestServer } from "./testing/gateway.js";

let server: TestServer;
const clients: { close: () => void }[] = [];

beforeEach(async () => {
  server = await startTestServer();
});
afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await server.close();
});

async function open(options: { since?: number; context?: { lines?: number } } = {}) {
  const chips = await connect({
    url: server.url,
    token: server.token,
    client: { name: "sdk-test", version: "0.0.0" },
    ...options,
  });
  clients.push(chips);
  return chips;
}

/** What a person does, through the door, the way the app would. */
function asPerson(event: Record<string, unknown>) {
  return server.gateway.deps.submitEvent({ principal: server.person, event });
}

describe("connecting", () => {
  it("says hello, learns who it is and what it may do, and subscribes", async () => {
    const chips = await open();
    expect(chips.state).toBe("open");
    expect(chips.harnessId).toBe(server.harnessId);
    expect(chips.workspaceId).toBe(server.workspaceId);
    expect(chips.autonomy).toBe(2);
    expect(chips.policy).toEqual({ autonomy: 2, rules: [] });
    expect(chips.hello.server.name).toBe("chipsd");
  });

  it("opens the socket with a single-use ticket, never the token in the URL (SEC-22)", async () => {
    const urls: string[] = [];
    const chips = await connect({
      url: server.url,
      token: server.token,
      createSocket: (url) => {
        urls.push(url);
        return new WebSocket(url) as unknown as SocketLike;
      },
    });
    clients.push(chips);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/v1\/ws\?ticket=[A-Za-z0-9_-]{40,}$/);
    expect(urls[0]).not.toContain(server.token);
    // Spent on the upgrade: the same URL opens nothing a second time.
    const again = new WebSocket(String(urls[0]));
    let opened = false;
    again.addEventListener("open", () => {
      opened = true;
    });
    await new Promise((resolve) => {
      again.addEventListener("error", resolve);
      again.addEventListener("close", resolve);
    });
    expect(opened).toBe(false);
  });

  it("refuses a bad token with a reason, not a hang", async () => {
    await expect(
      connect({ url: server.url, token: "chips_at_nope", reconnect: false }),
    ).rejects.toThrow(/closed the socket|401|unauthorized/i);
  });

  it("refuses on an error that no close follows, as Node 22's WebSocket reports a refusal", async () => {
    await expect(
      connect({
        url: server.url,
        token: server.token,
        reconnect: false,
        createSocket: () => refusedSocket(["error"]),
      }),
    ).rejects.toThrow(ConnectError);
  });
});

describe("reconnecting", () => {
  it("keeps trying after an attempt fails before it opens, and comes back when one does", async () => {
    let attempts = 0;
    let first: SocketLike | undefined;
    const chips = await connect({
      url: server.url,
      token: server.token,
      client: { name: "sdk-test", version: "0.0.0" },
      createSocket: (url) => {
        attempts += 1;
        // The server is still down for two attempts: refused as Node 26 reports it, then as
        // Node 22 does. The fourth reaches it.
        if (attempts === 2) return refusedSocket(["error", "close"]);
        if (attempts === 3) return refusedSocket(["error"]);
        const socket = new WebSocket(url) as unknown as SocketLike;
        first ??= socket;
        return socket;
      },
    });
    clients.push(chips);

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      first?.close();
      // The backoff runs on fake time; the real socket's I/O gets a turn of the loop each step.
      for (let step = 0; step < 300 && (attempts < 4 || chips.state !== "open"); step += 1) {
        await vi.advanceTimersByTimeAsync(100);
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(attempts).toBe(4);
      expect(chips.state).toBe("open");
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A socket the server refuses before it opens. Node 22's WebSocket reports that as `error` alone;
 * Node 26 and browsers follow it with `close`. Fired on `setImmediate`, which fake timers leave be.
 */
function refusedSocket(events: readonly ("error" | "close")[]): SocketLike {
  const handlers = new Map<string, (message: { readonly data?: unknown }) => void>();
  setImmediate(() => {
    for (const name of events) handlers.get(name)?.({});
  });
  return {
    send: () => undefined,
    close: () => undefined,
    addEventListener: (name, handler) => handlers.set(name, handler),
  };
}

describe("a run", () => {
  it("starts, reports status, logs steps, and completes, each acknowledged", async () => {
    const chips = await open();
    const run = await chips.runs.start({
      spaceId: server.spaceId,
      goal: "Get PO #4471 confirmed.",
      plan: [
        { stepId: "read-po", title: "Read PO #4471" },
        { stepId: "email-dana", title: "Email Dana to confirm" },
      ],
    });
    expect(run.id).toMatch(/^run_/);

    const status = await run.status("Reading PO #4471…");
    expect(status).toMatchObject({ duplicate: false });
    await run.step({
      stepId: "read-po",
      tool: "drive.read",
      summary: "120 units.",
      durationMs: 1840,
    });
    await run.context({ usedTokens: 82_000, limitTokens: 200_000, model: "opus-5" });
    await run.usage({ model: "opus-5", inputTokens: 82_140, outputTokens: 3402, costUsd: 1.47 });
    await run.complete({ summary: "Confirmed PO #4471.", changed: ["Emailed Dana"] });
    expect(run.over).toBe(true);

    const view = await server.gateway.deps.readModels.run(server.workspaceId, run.id);
    expect(view).toMatchObject({ state: "done", harness_id: server.harnessId });
  });

  it("reports the tokens out alone when that is all the harness knows (finding 11)", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Answer briefly" });
    const ack = await run.usage({ model: "gpt-6-astra", outputTokens: 232 });
    expect(ack).toMatchObject({ duplicate: false });
    const { events } = await server.gateway.deps.store.since(server.workspaceId, 0, 500);
    const usage = events.find((event) => event.type === "usage")?.payload;
    expect(usage).toMatchObject({ output_tokens: 232 });
    expect(usage).not.toHaveProperty("input_tokens");
  });

  it("says how much of the tokens in came from the prompt cache", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Answer briefly" });
    await run.usage({
      model: "claude-opus-5-5",
      inputTokens: 19_790,
      cacheReadTokens: 15_351,
      cacheWriteTokens: 4435,
      outputTokens: 185,
      costUsd: 0.029,
    });
    const { events } = await server.gateway.deps.store.since(server.workspaceId, 0, 500);
    expect(events.find((event) => event.type === "usage")?.payload).toMatchObject({
      input_tokens: 19_790,
      cache_read_tokens: 15_351,
      cache_write_tokens: 4435,
    });
  });

  it("says a turn heard a message said in the room while it worked (ADR 0106)", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Check the quotes." });
    await asPerson({
      type: "message.post",
      space_id: server.spaceId,
      text: "The quotes are in.",
      idempotency_key: "arjun-quotes-in",
    });
    const before = await server.gateway.deps.store.since(server.workspaceId, 0, 500);
    const said = before.events.find((event) => event.payload["text"] === "The quotes are in.");
    if (said === undefined) throw new Error("not said");
    expect(await run.heard(messageIdOf(said.id))).toMatchObject({ duplicate: false });
    const { events } = await server.gateway.deps.store.since(server.workspaceId, 0, 500);
    const heard = events.find((event) => event.type === "message.heard");
    expect(heard?.run_id).toBe(run.id);
    expect(heard?.payload).toMatchObject({ message_id: messageIdOf(said.id) });
  });

  it("says what a turn cost alone, and what kind of call a step was (ADR 0162)", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Read the plan" });
    await run.step({ stepId: "t1", tool: "read_text_file", kind: "file", title: "src/plan.md" });
    await run.usage({ model: "agent", costUsd: 0.12 });
    const { events } = await server.gateway.deps.store.since(server.workspaceId, 0, 500);
    expect(events.find((event) => event.type === "step.log")?.payload).toMatchObject({
      tool: "read_text_file",
      kind: "file",
    });
    const usage = events.find((event) => event.type === "usage")?.payload;
    expect(usage).toMatchObject({ cost: { usd: 0.12, estimated: true } });
    expect(usage).not.toHaveProperty("output_tokens");
  });

  it("refuses what the door refuses, with the server's reason", async () => {
    const chips = await open();
    await expect(
      chips.runs.start({ spaceId: "spc_01K4ZQPX00000000000000000X", goal: "Nope" }),
    ).rejects.toBeInstanceOf(RefusedError);
  });

  it("asks for approval and gets the decision a person makes, edited input included", async () => {
    const chips = await open();
    const run = await chips.runs.start({
      spaceId: server.spaceId,
      goal: "Email Dana.",
    });
    const decision = run.approval({
      action: {
        kind: "email.send",
        input: { to: "dana@northwind.com", body: "Hi" },
        external: true,
      },
      risk: ["external_communication"],
      preview: { format: "markdown", body: "Hi Dana" },
      editable: true,
    });
    // The ask reaches the log; a person edits it.
    const approvalId = await waitForApproval();
    const resolved = await asPerson({
      type: "approval.resolved",
      space_id: server.spaceId,
      run_id: run.id,
      approval_id: approvalId,
      decision: "edited",
      updated_input: { to: "dana@northwind.com", body: "Hi Dana, confirming PO #4471." },
      reason: "Add the number.",
      idempotency_key: "arjun-edit",
    });
    expect(resolved.ok).toBe(true);

    const got = await decision;
    expect(got).toMatchObject({
      approvalId,
      decision: "edited",
      allowed: true,
      by: server.personId,
      reason: "Add the number.",
      input: { to: "dana@northwind.com", body: "Hi Dana, confirming PO #4471." },
    });
    await run.executed(approvalId, "executed", "Sent.");
  });

  it("gets the policy engine's answer at once when the dial allows", async () => {
    await server.close();
    server = await startTestServer({ autonomy: 3 });
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Read." });
    const decision = await run.approval({
      action: { kind: "drive.read", input: {} },
      risk: [],
    });
    expect(decision).toMatchObject({ decision: "approved", allowed: true, by: "system" });
  });

  it("asks a question and reads the answer by question id", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Ask." });
    const answer = run.question({
      questions: [
        {
          questionId: "when",
          prompt: "Deliver when?",
          options: [
            { value: "sep19", label: "19 September" },
            { value: "sep26", label: "26 September" },
          ],
        },
      ],
    });
    const askId = await waitForQuestion();
    await asPerson({
      type: "question.answered",
      space_id: server.spaceId,
      run_id: run.id,
      ask_id: askId,
      answers: [{ question_id: "when", values: ["sep26"] }],
      idempotency_key: "arjun-answer",
    });
    expect(await answer).toMatchObject({
      askId,
      answers: { when: { values: ["sep26"] } },
      timedOut: false,
      by: server.personId,
    });
  });

  it("hears a person steer, pause, resume and stop it", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Go." });
    const heard: string[] = [];
    run.on("steer", (event) => {
      heard.push(`steer:${event.text}:${event.from.display_name}`);
    });
    run.on("pause", () => {
      heard.push("pause");
    });
    run.on("resume", () => {
      heard.push("resume");
    });
    run.on("cancel", () => {
      heard.push("cancel");
    });

    const target = { space_id: server.spaceId, run_id: run.id };
    await asPerson({
      type: "run.steer",
      ...target,
      mode: "steer",
      text: "Mention the pallets.",
      idempotency_key: "s1",
    });
    await asPerson({ type: "run.pause", ...target, idempotency_key: "p1" });
    await settle();
    expect(run.paused).toBe(true);
    const running = run.whenRunning();
    await asPerson({ type: "run.resume", ...target, idempotency_key: "r1" });
    await running;
    expect(run.paused).toBe(false);
    await asPerson({ type: "run.cancel", ...target, reason: "Enough.", idempotency_key: "c1" });
    await settle();
    expect(run.over).toBe(true);
    expect(heard).toEqual(["steer:Mention the pallets.:Arjun", "pause", "resume", "cancel"]);
  });
});

describe("messages", () => {
  it("hears what a person says as message.new, with who said it, and can answer", async () => {
    const chips = await open();
    const heard = new Promise<{ text: string; from: string; messageId: string }>((resolve) => {
      chips.on("message.new", (message) => {
        resolve({
          text: message.text,
          from: message.from.display_name,
          messageId: message.message_id,
        });
      });
    });
    await asPerson({
      type: "message.post",
      space_id: server.spaceId,
      text: "Get PO #4471 confirmed with Northwind.",
      idempotency_key: "arjun-hello",
    });
    const message = await heard;
    expect(message).toMatchObject({
      text: "Get PO #4471 confirmed with Northwind.",
      from: "Arjun",
    });
    expect(message.messageId).toMatch(/^msg_/);

    const ack = await chips.post({
      spaceId: server.spaceId,
      text: "On it.",
      replyTo: message.messageId,
    });
    expect(ack.seq).toBeGreaterThan(0);
  });

  it("hears as new what is for it, and overhears the rest (ADR 0081)", async () => {
    // Ledger, a second harness of Arjun's, in Scout's room: Chips says which of the two each
    // message is for, and only that one takes a turn. With no direct room of its own, so its one
    // agent is free to join this one (ADR 0087).
    const added = await server.gateway.deps.addHarness({
      principal: server.person,
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error(added.error.message);
    await asPerson({
      type: "membership.added",
      space_id: server.spaceId,
      idempotency_key: "add-ledger",
      participant_id: added.value.harnessId,
      participant_kind: "harness",
      role: "member",
    });
    const ledger = await connect({ url: server.url, token: added.value.token });
    clients.push(ledger);

    /** What Scout hears, by name, up to and including the person's last word. */
    function heardBy(chips: Awaited<ReturnType<typeof open>>) {
      const heard: { new: string[]; overheard: string[] } = { new: [], overheard: [] };
      return new Promise<typeof heard>((resolve) => {
        chips.on("message.overheard", (message) => {
          heard.overheard.push(message.text);
        });
        chips.on("message.new", (message) => {
          heard.new.push(message.text);
          if (message.text === "Thanks, Scout.") resolve(heard);
        });
      });
    }
    const scout = heardBy(await open());

    await ledger.post({ spaceId: server.spaceId, text: "The quotes are in." });
    await ledger.post({ spaceId: server.spaceId, text: "@Scout the Northwind one is lowest." });
    await ledger.post({ spaceId: server.spaceId, text: "Over to you.", to: [server.harnessId] });
    await asPerson({
      type: "message.post",
      space_id: server.spaceId,
      text: "@Ledger thanks.",
      idempotency_key: "arjun-thanks-ledger",
    });
    await asPerson({
      type: "message.post",
      space_id: server.spaceId,
      text: "Thanks, Scout.",
      to: [server.harnessId],
      idempotency_key: "arjun-thanks-scout",
    });

    expect(await scout).toEqual({
      new: ["@Scout the Northwind one is lowest.", "Over to you.", "Thanks, Scout."],
      overheard: ["The quotes are in.", "@Ledger thanks."],
    });
  });

  it("is handed what was said since it last spoke, and reads further back (ADR 0088)", async () => {
    const chips = await open({ context: { lines: 5 } });
    const asked = new Promise<MessageNew>((resolve) => {
      chips.on("message.new", (message) => {
        if (message.text === "Scout, the tracker?") resolve(message);
      });
    });
    await chips.post({ spaceId: server.spaceId, text: "Morning." });
    // For no harness: an @ that names only a person decides (ADR 0081).
    await asPerson({
      type: "message.post",
      space_id: server.spaceId,
      text: "@Arjun note to self: Friday.",
      idempotency_key: "arjun-note",
    });
    await asPerson({
      type: "message.post",
      space_id: server.spaceId,
      text: "Scout, the tracker?",
      to: [server.harnessId],
      idempotency_key: "arjun-tracker",
    });

    const message = await asked;
    expect(renderContext(message.context)).toBe(
      "Said in this space since you last spoke:\nArjun (owner): @Arjun note to self: Friday.",
    );

    const page = await chips.roomContext(server.spaceId, { limit: 2 });
    expect(page.lines.map((line) => line.text)).toEqual([
      "@Arjun note to self: Friday.",
      "Scout, the tracker?",
    ]);
    const before = await chips.roomContext(server.spaceId, { before: page.before, limit: 1 });
    expect(before.lines.map((line) => line.text)).toEqual(["Morning."]);
  });

  it("hears a thumb or a note on its own message as feedback, with who gave it (M3.4)", async () => {
    const chips = await open();
    const heard = new Promise<{ kind: string; reaction?: string; from: string; role: string }>(
      (resolve) => {
        chips.on("feedback", (feedback) => {
          resolve({
            kind: feedback.kind,
            ...(feedback.reaction === undefined ? {} : { reaction: feedback.reaction }),
            from: feedback.from.display_name,
            role: feedback.from.role,
          });
        });
      },
    );
    await chips.post({ spaceId: server.spaceId, text: "Delivery is on the 12th." });
    const page = await server.gateway.deps.store.since(server.workspaceId, 0, 100);
    const said = page.events.find((event) => event.type === "message.post");
    if (said === undefined) throw new Error("the post did not reach the log");

    await asPerson({
      type: "feedback",
      space_id: server.spaceId,
      message_id: messageIdOf(said.id),
      kind: "reaction",
      reaction: "👎",
      idempotency_key: "arjun-thumb",
    });
    expect(await heard).toEqual({ kind: "reaction", reaction: "👎", from: "Arjun", role: "owner" });
  });

  it("replays from `since`, so a decision made while it was down still arrives", async () => {
    const first = await open();
    const run = await first.runs.start({ spaceId: server.spaceId, goal: "Go." });
    const seq = first.lastSeq ?? 0;
    first.close();

    await asPerson({
      type: "run.steer",
      space_id: server.spaceId,
      run_id: run.id,
      mode: "followup",
      text: "Also check the invoice.",
      idempotency_key: "s-late",
    });

    const second = await open({ since: seq });
    const steer = await second.waitFor((event) =>
      event["type"] === "run.steer" ? (event["text"] as string) : undefined,
    );
    expect(steer).toBe("Also check the invoice.");
  });
});

async function waitForApproval(): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const head = await server.gateway.deps.store.head(server.workspaceId);
    const page = await server.gateway.deps.store.since(
      server.workspaceId,
      Math.max(0, head - 5),
      10,
    );
    const ask = page.events.find((event) => event.type === "approval.request");
    if (ask !== undefined) return String(ask.payload["approval_id"]);
    await settle();
  }
  throw new Error("no approval.request reached the log");
}

async function waitForQuestion(): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const head = await server.gateway.deps.store.head(server.workspaceId);
    const page = await server.gateway.deps.store.since(
      server.workspaceId,
      Math.max(0, head - 5),
      10,
    );
    const ask = page.events.find((event) => event.type === "question.ask");
    if (ask !== undefined) return String(ask.payload["ask_id"]);
    await settle();
  }
  throw new Error("no question.ask reached the log");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("what the harness says, and Chips's answer", () => {
  it("is told when Chips held its message from the agents it named (ADR 0097)", async () => {
    const added = await server.gateway.deps.addHarness({
      principal: server.person,
      displayName: "Ledger",
      openDirectSpace: false,
    });
    if (!added.ok) throw new Error(added.error.message);
    const joined = await asPerson({
      type: "membership.added",
      space_id: server.spaceId,
      participant_id: added.value.harnessId,
      participant_kind: "harness",
      role: "member",
      idempotency_key: "add-ledger",
    });
    if (!joined.ok) throw new Error(joined.error.message);
    const ledger = await connect({ url: server.url, token: added.value.token });
    clients.push(ledger);
    const chips = await open();
    for (let i = 0; i < CEILING; i += 1) {
      const ack =
        i % 2 === 0
          ? await chips.post({ spaceId: server.spaceId, text: `@Ledger step ${i} of the plan` })
          : await ledger.post({ spaceId: server.spaceId, text: `@Scout step ${i} checks out` });
      expect(ack.held).toBeUndefined();
    }
    const past = await chips.post({ spaceId: server.spaceId, text: "@Ledger one more thing" });
    expect(past).toMatchObject({
      held: true,
      exchange: { count: CEILING + 1, allowance: CEILING },
    });
  });

  it("opens a room of its own by key, and finds it again by the same key", async () => {
    const chips = await open();
    const opened = await chips.openSpace("project-alpha", "Project Alpha");
    expect(await chips.openSpace("project-alpha")).toBe(opened);
    const listed = await chips.request("GET", `/v1/harnesses/${chips.harnessId}/spaces`);
    const spaces = listed["spaces"] as { space_id: string; title?: string }[];
    expect(spaces.find((space) => space.space_id === opened)?.title).toBe("Project Alpha");
  });

  it("reaches any route with its token, and a refusal is a RefusedError", async () => {
    const chips = await open();
    const agents = await chips.request("GET", `/v1/harnesses/${chips.harnessId}/agents`);
    expect(Array.isArray(agents["agents"])).toBe(true);
    await expect(chips.request("GET", "/v1/harnesses/hrn_nobody/agents")).rejects.toBeInstanceOf(
      RefusedError,
    );
  });
});

describe("lanes (M3.5)", () => {
  /** A second harness of Arjun's, with a token and a direct space with him. */
  async function addLedger(): Promise<{ id: string; token: string; home: string }> {
    const added = await server.gateway.deps.addHarness({
      principal: server.person,
      displayName: "Ledger",
    });
    if (!added.ok) throw new Error(added.error.message);
    return { id: added.value.harnessId, token: added.value.token, home: added.value.spaceId ?? "" };
  }

  it("routes a task to a specialist, which accepts the lane and works it; the lead hears the result", async () => {
    const ledger = await addLedger();
    const specialist = await connect({ url: server.url, token: ledger.token });
    clients.push(specialist);
    const worked: string[] = [];
    specialist.on("run.requested", async (requested) => {
      const run = specialist.runs.accept(requested);
      worked.push(run.id);
      expect(run.laneId).toBe(requested.lane_id);
      expect(run.spaceId).toBe(ledger.home);
      await run.status("Comparing the quotes…");
      await specialist.post({
        spaceId: run.spaceId,
        runId: run.id,
        text: "Northwind is 4 percent under last quarter.",
      });
      await run.usage({ model: "opus-5", inputTokens: 900, outputTokens: 120, costUsd: 0.03 });
      await run.complete({ summary: "Northwind is 4 percent under last quarter." });
    });

    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Check the quotes." });
    const lane = await run.task({
      to: ledger.id,
      goal: "Are the Northwind quotes in line with last quarter?",
      constraints: ["Use the finance warehouse"],
      onBehalfOf: server.personId,
    });
    // Acknowledged with where the lane is: Ledger's home, and the run Chips seeded there.
    expect(lane.spaceId).toBe(ledger.home);
    expect(lane.runId).toMatch(/^run_/);
    expect(lane.state).toBe("running");

    const outcome = await lane.result;
    expect(outcome).toMatchObject({
      state: "completed",
      summary: "Northwind is 4 percent under last quarter.",
      costUsd: 0.03,
    });
    expect(lane.over).toBe(true);
    expect(worked).toEqual([lane.runId]);
  });

  it("opens a lane between two of its own spaces, and works it itself", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Look into it." });
    const lane = await run.task({
      to: server.harnessId,
      home: server.spaceId,
      label: "Explore",
      goal: "Find where the quotes live",
      onBehalfOf: server.personId,
    });
    expect(lane.spaceId).toBe(server.spaceId);

    const inner = lane.work();
    expect(inner.id).toBe(lane.runId);
    expect(inner.laneId).toBe(lane.id);
    await inner.step({ tool: "grep", summary: "quotes/ has three files." });
    await inner.complete({ summary: "They are under quotes/." });
    const outcome = await lane.result;
    expect(outcome).toMatchObject({ state: "completed", summary: "They are under quotes/." });
    // Working the lane again hands back the same run.
    expect(lane.work()).toBe(inner);
  });

  it("says when a task was flattened, so the lead carries on without a lane", async () => {
    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Ask around." });
    const lane = await run.task({
      to: "hrn_01K4ZQPX0000000000000NOBODY",
      goal: "Anything",
      onBehalfOf: server.personId,
    });
    expect(lane.state).toBe("flattened");
    expect(await lane.result).toEqual({ state: "flattened" });
    expect(() => lane.work()).toThrow(/flattened/);
  });

  it("tells both sides when a person cancels the lane", async () => {
    const ledger = await addLedger();
    const specialist = await connect({ url: server.url, token: ledger.token });
    clients.push(specialist);
    const cancelled: string[] = [];
    specialist.on("run.requested", (requested) => {
      const run = specialist.runs.accept(requested);
      run.on("cancel", () => {
        cancelled.push(run.id);
      });
    });

    const chips = await open();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Check the quotes." });
    const updates: string[] = [];
    const lane = await run.task({ to: ledger.id, goal: "Compare", onBehalfOf: server.personId });
    lane.on("updated", (event) => {
      updates.push(event.state);
    });

    // Arjun cancels the specialist's run from its home, as the route card does.
    const stopped = await asPerson({
      type: "run.cancel",
      space_id: ledger.home,
      run_id: lane.runId,
      reason: "Cancelled from the route card.",
      idempotency_key: "arjun-cancel-lane",
    });
    expect(stopped.ok).toBe(true);

    const outcome = await lane.result;
    expect(outcome.state).toBe("cancelled");
    expect(updates).toEqual(["cancelled"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cancelled).toEqual([lane.runId]);
  });
});

describe("rooms a person asks for (new spaces)", () => {
  const ids = createIdGenerator();

  beforeEach(async () => {
    await server.close();
    server = await startTestServer({ capabilities: [HARNESS_CAPABILITIES.newSpaces] });
  });

  /** What the phone does on the first send: the room asked of Scout, Scout in it, the words. */
  async function askForRoom(text: string | undefined): Promise<string> {
    const spaceId = ids.next("space");
    const steps: Record<string, unknown>[] = [
      { type: "space.created", kind: "direct", asked_of: server.harnessId },
      {
        type: "membership.added",
        participant_id: server.harnessId,
        participant_kind: "harness",
        role: "member",
      },
      ...(text === undefined ? [] : [{ type: "message.post", text }]),
    ];
    for (const [index, step] of steps.entries()) {
      const done = await asPerson({
        ...step,
        space_id: spaceId,
        idempotency_key: `${spaceId}-${index}`,
      });
      if (!done.ok) throw new Error(done.error.message);
    }
    return spaceId;
  }

  function say(spaceId: string, text: string) {
    return asPerson({ type: "message.post", space_id: spaceId, text, idempotency_key: text });
  }

  it("hands over a room asked of it with its first words, which message.new does not hear", async () => {
    const chips = await open();
    const heard: string[] = [];
    chips.on("message.new", (message) => {
      heard.push(message.text);
    });
    const asked = new Promise<SpaceAsked>((resolve) => chips.onSpaceAsked(resolve));
    const spaceId = await askForRoom("Plan the kitchen remodel");

    const got = await asked;
    expect(got).toEqual({
      spaceId,
      askedBy: server.personId,
      firstMessage: { messageId: expect.stringMatching(/^msg_/), text: "Plan the kitchen remodel" },
    });

    // Claimed under the harness's own key, and named; the retry finds it claimed.
    expect(await chips.claimSpace(spaceId, "session-7", "Kitchen remodel")).toEqual({
      spaceId,
      claimed: true,
      retitled: true,
    });
    expect(await chips.claimSpace(spaceId, "session-7", "Kitchen remodel")).toEqual({
      spaceId,
      claimed: false,
      retitled: false,
    });
    expect(await server.gateway.deps.readModels.space(server.workspaceId, spaceId)).toMatchObject({
      title: "Kitchen remodel",
      opened_by: server.harnessId,
      external_key: `${server.harnessId}:session-7`,
    });

    // It answers there, and what is said after the first words is an ordinary message.
    await chips.post({ spaceId, text: "On it.", replyTo: got.firstMessage.messageId });
    await say(spaceId, "The budget is 20k.");
    await vi.waitFor(() => expect(heard).toEqual(["The budget is 20k."]));
  });

  it("catches up at connect on a room asked while it was away, and hands it over once", async () => {
    const spaceId = await askForRoom("Plan the kitchen remodel");
    // From the beginning, so the replay carries the room as well as the catch-up reading it.
    const chips = await open({ since: 0 });
    const heard: string[] = [];
    chips.on("message.new", (message) => {
      heard.push(message.text);
    });
    // Two listeners at once: two catch-ups read side by side, and the room is handed over once.
    const handed: SpaceAsked[] = [];
    const alsoHanded: SpaceAsked[] = [];
    chips.onSpaceAsked((asked) => {
      handed.push(asked);
    });
    chips.onSpaceAsked((asked) => {
      alsoHanded.push(asked);
    });
    await vi.waitFor(() => expect(handed).toHaveLength(1));
    expect(handed[0]).toMatchObject({
      spaceId,
      askedBy: server.personId,
      firstMessage: { text: "Plan the kitchen remodel" },
    });

    // Reading again changes nothing: a later listener hears no room handed over already.
    const again: SpaceAsked[] = [];
    chips.onSpaceAsked((asked) => {
      again.push(asked);
    });
    await settle();
    await settle();
    expect(handed).toHaveLength(1);
    expect(alsoHanded).toEqual(handed);
    expect(again).toEqual([]);
    expect(heard).toEqual([]);
  });

  it("hands over a room caught up without words when its first words come", async () => {
    const spaceId = await askForRoom(undefined);
    // A page of one, so the history is read as far as it goes a page at a time.
    const chips = await connect({
      url: server.url,
      token: server.token,
      fetch: (input, init) => fetch(String(input).replace("limit=100", "limit=1"), init),
    });
    clients.push(chips);
    const handed: string[] = [];
    chips.onSpaceAsked((asked) => {
      handed.push(asked.firstMessage.text);
    });
    await settle();
    expect(handed).toEqual([]);
    await say(spaceId, "Plan the kitchen remodel");
    await vi.waitFor(() => expect(handed).toEqual(["Plan the kitchen remodel"]));
  });

  it("reads again at a reconnect: a room asked while the socket was down arrives, one handed before does not", async () => {
    let socket: SocketLike | undefined;
    const chips = await connect({
      // A socket URL: the HTTP calls go to the same server over http.
      url: server.url.replace(/^http/, "ws"),
      token: server.token,
      createSocket: (url) => {
        socket = new WebSocket(url) as unknown as SocketLike;
        return socket;
      },
    });
    clients.push(chips);
    const handed: string[] = [];
    chips.onSpaceAsked((asked) => {
      handed.push(asked.firstMessage.text);
    });
    await askForRoom("First space");
    await vi.waitFor(() => expect(handed).toEqual(["First space"]));

    socket?.close();
    await vi.waitFor(() => expect(chips.state).toBe("closed"));
    await askForRoom("Second space");
    await vi.waitFor(() => expect(handed).toEqual(["First space", "Second space"]), {
      timeout: 4000,
    });
    await settle();
    expect(handed).toEqual(["First space", "Second space"]);
  });

  it("leaves the first words to message.new when nobody listens for asks", async () => {
    const chips = await open();
    const heard = new Promise<string>((resolve) => {
      chips.on("message.new", (message) => resolve(message.text));
    });
    await askForRoom("Plan the kitchen remodel");
    expect(await heard).toBe("Plan the kitchen remodel");
  });

  it("is refused a room nobody asked it for, and one that is not there, with the server's reason", async () => {
    const chips = await open();
    await expect(chips.claimSpace(server.spaceId, "session-1")).rejects.toMatchObject({
      name: "RefusedError",
      code: "forbidden",
      message: expect.stringContaining("Nobody asked this harness"),
    });
    await expect(chips.claimSpace(ids.next("space"), "session-1")).rejects.toBeInstanceOf(
      RefusedError,
    );
  });

  it("carries on when the catch-up cannot be read, and says what an answer without words was", async () => {
    const chips = await connect({
      url: server.url,
      token: server.token,
      // The ticket that opens the socket comes through; everything else is down.
      fetch: async (input, init) =>
        String(input).endsWith("/v1/socket-tickets")
          ? fetch(input, init)
          : new Response("down", { status: 502 }),
    });
    clients.push(chips);
    chips.onSpaceAsked(() => undefined);
    const heard = new Promise<string>((resolve) => {
      chips.on("message.new", (message) => resolve(message.text));
    });
    await say(server.spaceId, "Still there?");
    expect(await heard).toBe("Still there?");
    await expect(chips.claimSpace(server.spaceId, "k")).rejects.toMatchObject({
      code: "502",
      message: expect.stringContaining("502"),
    });
  });
});

describe("saying how it is (ADR 0083)", () => {
  it("reports its trouble and that it is fine, and says the trouble again after a reconnect", async () => {
    let socket: SocketLike | undefined;
    const chips = await connect({
      url: server.url.replace(/^http/, "ws"),
      token: server.token,
      createSocket: (url) => {
        socket = new WebSocket(url) as unknown as SocketLike;
        return socket;
      },
    });
    clients.push(chips);
    const { presence } = server.gateway.deps;
    const trouble = () => presence.stateOf(server.workspaceId, server.harnessId).trouble?.reason;

    await chips.reportTrouble("Can't reach its gateway");
    expect(trouble()).toBe("Can't reach its gateway");

    // Chips forgets it — as it does when the harness goes offline — and the reconnect says it again.
    presence.report(server.workspaceId, server.harnessId, undefined);
    socket?.close();
    await vi.waitFor(() => expect(chips.state).toBe("closed"));
    await vi.waitFor(() => expect(trouble()).toBe("Can't reach its gateway"), { timeout: 4000 });

    await chips.reportOk();
    expect(trouble()).toBeUndefined();
  });

  it("refuses trouble with no words, with the server's own", async () => {
    const chips = await open();
    await expect(chips.reportTrouble("   ")).rejects.toBeInstanceOf(RefusedError);
  });
});

describe("restarting (ADR 0094)", () => {
  it("hears a person's ask on a connection that takes restarts, and only there", async () => {
    await server.close();
    server = await startTestServer({ capabilities: [HARNESS_CAPABILITIES.restarts] });
    const ask = () =>
      server.gateway.deps.restartHarness({ principal: server.person, harnessId: server.harnessId });

    // Without a restart of its own, its connection doesn't say it hears one, and nobody can ask.
    const deaf = await open();
    const refused = await ask();
    expect(refused.ok).toBe(false);
    deaf.close();

    const asks: { askedBy: string; askedAt: string }[] = [];
    const chips = await connect({
      url: server.url,
      token: server.token,
      onRestart: (heard) => {
        asks.push(heard);
      },
    });
    clients.push(chips);
    const asked = await ask();
    expect(asked).toMatchObject({ ok: true, asked: true, sockets: 1 });
    await vi.waitFor(() => expect(asks).toHaveLength(1));
    expect(asks[0]?.askedBy).toBe(server.person.participantId);

    // Its word that it is back ends the restart, for everybody.
    await chips.reportOk();
    expect(
      server.gateway.deps.presence.stateOf(server.workspaceId, server.harnessId).restarting,
    ).toBeUndefined();
  });
});

describe("agents (ADR 0087)", () => {
  it("registers agents by its own key, and speaks as one of them", async () => {
    const chips = await open();
    const chess = await chips.agents.register({ key: "e0d0f115", name: "Chess Game" });
    expect(chess).toMatchObject({ name: "Chess Game", key: "e0d0f115", created: true });
    const again = await chips.agents.register({ key: "e0d0f115", name: "Chess Game" });
    expect(again).toMatchObject({ agentId: chess.agentId, created: false, renamed: false });
    expect((await chips.agents.list()).map((agent) => agent.key)).toContain("e0d0f115");

    // A person adds it to the room; the harness speaks as it there, and starts a run as it.
    const added = await asPerson({
      type: "membership.added",
      space_id: server.spaceId,
      participant_id: chess.agentId,
      participant_kind: "agent",
      role: "member",
      idempotency_key: "add-chess",
    });
    expect(added.ok).toBe(true);
    const said = await chips.as(chess.agentId).post({ spaceId: server.spaceId, text: "e4." });
    const page = await server.gateway.deps.store.since(server.workspaceId, said.seq - 1, 1);
    expect(page.events[0]?.actor).toEqual({
      kind: "agent",
      id: chess.agentId,
      harness_id: server.harnessId,
    });
    const run = await chips.as(chess.agentId).runs.start({
      spaceId: server.spaceId,
      goal: "Pick an opening",
    });
    await run.complete({ summary: "The Ruy Lopez." });
    const row = await server.gateway.deps.readModels.run(server.workspaceId, run.id);
    expect(row).toMatchObject({ agent_id: chess.agentId, state: "done" });
  });

  it("archives an agent and brings it back, and a name may come back too", async () => {
    const chips = await open();
    const put = await chips.agents.register({ key: "1b2c", name: "Tax", state: "archived" });
    expect(put).toMatchObject({ state: "archived", created: true });
    const back = await chips.agents.register({ key: "1b2c", name: "Taxes", state: "active" });
    expect(back).toMatchObject({ state: "active", name: "Taxes", renamed: true });
    await chips.agents.register({ key: "1b2c", name: "Tax" });
    const again = await chips.agents.register({ key: "1b2c", name: "Taxes" });
    expect(again).toMatchObject({ renamed: true });
    const listed = (await chips.agents.list()).find((agent) => agent.key === "1b2c");
    expect(listed).toMatchObject({ name: "Taxes", state: "active" });
  });

  it("attaches an agent in the place of the one there, once", async () => {
    // The harness is in its room itself, as it was before agents.
    const chips = await open();
    const chess = await chips.agents.register({ key: "e0d0f115", name: "Chess Game" });
    const where = { spaceId: server.spaceId, replacing: server.harnessId };
    expect(await chips.agents.attach(chess.agentId, where)).toEqual({ attached: true });
    expect(await chips.agents.attach(chess.agentId, where)).toEqual({ attached: false });
    const now = await chips.agents.list();
    expect(now.find((agent) => agent.agentId === chess.agentId)?.spaces).toEqual([server.spaceId]);

    // And in the place of that agent, another of its own.
    const tree = await chips.agents.register({ key: "3f2a", name: "Tree" });
    const swap = { spaceId: server.spaceId, replacing: chess.agentId };
    expect(await chips.agents.attach(tree.agentId, swap)).toEqual({ attached: true });
    expect(
      await chips.agents.attach(chess.agentId, {
        spaceId: server.spaceId,
        replacing: tree.agentId,
      }),
    ).toEqual({ attached: true });

    // What the harness says there as itself is its one agent's there now.
    const said = await chips.post({ spaceId: server.spaceId, text: "Nf3." });
    const page = await server.gateway.deps.store.since(server.workspaceId, said.seq - 1, 1);
    expect(page.events[0]?.actor).toMatchObject({ kind: "agent", id: chess.agentId });

    await expect(
      chips.agents.attach(chess.agentId, { spaceId: server.spaceId, replacing: "agt_nobody" }),
    ).rejects.toBeInstanceOf(RefusedError);
  });
});
