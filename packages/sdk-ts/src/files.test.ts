/**
 * Files, what survives a restart, a tracked step and a turn's words, against a real chipsd: what
 * both first bridges wrote for themselves, done once here.
 */

import { HARNESS_CAPABILITIES, type MessageNew } from "@chipschat/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { type Chips, connect, memoryStore, PIECE_BYTES, promptFor } from "./index.js";
import { startTestServer, type TestServer } from "./testing/gateway.js";

let server: TestServer | undefined;
const clients: Chips[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.close();
  await server?.close();
  server = undefined;
});

async function started(options: Partial<Parameters<typeof connect>[0]> = {}) {
  server ??= await startTestServer({ capabilities: [HARNESS_CAPABILITIES.autonomy] });
  const chips = await connect({ url: server.url, token: server.token, ...options });
  clients.push(chips);
  return { chips, server };
}

/** The log as the harness reads it. */
async function log(at: TestServer): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${at.url}/v1/events?since=0&limit=500`, {
    headers: { authorization: `Bearer ${at.token}` },
  });
  return ((await response.json()) as { events: Record<string, unknown>[] }).events;
}

async function until<T>(read: () => Promise<T | undefined>): Promise<T> {
  for (let tries = 0; tries < 100; tries++) {
    const value = await read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("never");
}

const bytesOf = (size: number) => Uint8Array.from({ length: size }, (_, at) => (at * 7) % 251);

describe("files", () => {
  it("uploads a file, posts it, and downloads it back with its own token", async () => {
    const { chips, server } = await started();
    const sent = bytesOf(3000);
    const stored = await chips.upload({ bytes: sent, filename: "notes.bin" });
    expect(stored.byteSize).toBe(3000);
    await chips.post({ spaceId: server.spaceId, text: "Here.", uploadIds: [stored.attachmentId] });

    const listed = await fetch(`${server.url}/v1/spaces/${server.spaceId}/files`, {
      headers: { authorization: `Bearer ${server.token}` },
    });
    const { files } = (await listed.json()) as { files: { name: string; url: string }[] };
    const file = files.find((each) => each.name === "notes.bin");
    expect(file).toBeDefined();
    expect(await chips.download(file?.url ?? "")).toEqual(sent);
  });

  it("sends a large file in pieces, and picks up where it got to after one is lost", async () => {
    let lost = false;
    const flaky: typeof fetch = async (input, init) => {
      const url = String(input);
      if (!lost && init?.method === "PUT" && url.includes(`offset=${PIECE_BYTES}`)) {
        lost = true;
        throw new TypeError("fetch failed");
      }
      return await fetch(input, init);
    };
    const { chips } = await started({ fetch: flaky });
    const sent = bytesOf(PIECE_BYTES * 2 + 1234);
    const stored = await chips.upload({ bytes: sent, filename: "big.bin" });
    expect(lost).toBe(true);
    expect(stored.byteSize).toBe(sent.byteLength);
  });
});

describe("what survives a restart", () => {
  it("keeps the cursor and the runs not ended, and ends those when it comes back", async () => {
    const store = memoryStore();
    const first = await started({ store });
    const run = await first.chips.runs.start({ spaceId: first.server.spaceId, goal: "Count" });
    await run.status("Counting");
    first.chips.close();
    expect(store.state()?.runs.map((each) => each.runId)).toEqual([run.id]);
    expect(store.state()?.since).toBeGreaterThan(0);

    // A new process, the same store: the run it left open is ended for it.
    const again = await started({ store });
    const failed = await until(async () =>
      (await log(again.server)).find(
        (event) => event["type"] === "run.failed" && event["run_id"] === run.id,
      ),
    );
    expect(failed["error"]).toBe("The harness restarted before this run ended.");
    await until(async () => (store.state()?.runs.length === 0 ? true : undefined));
  });

  it("forgets a run once it ends", async () => {
    const store = memoryStore();
    const { chips, server } = await started({ store });
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Count" });
    await run.complete({ summary: "Counted." });
    chips.close();
    expect(store.state()?.runs).toEqual([]);
  });
});

describe("a tracked step", () => {
  it("logs started, then done with how long, and failed with why, throwing on", async () => {
    const { chips, server } = await started();
    const run = await chips.runs.start({ spaceId: server.spaceId, goal: "Look" });
    expect(
      await run.track({ tool: "web_search", title: "web_search · trucks" }, async () => 42),
    ).toBe(42);
    await expect(
      run.track({ tool: "shell" }, async () => {
        throw new Error("no shell here");
      }),
    ).rejects.toThrow("no shell here");
    await run.complete({ summary: "Looked." });
    const steps = (await log(server)).filter((event) => event["type"] === "step.log");
    expect(steps.map((step) => [step["tool"], step["status"]])).toEqual([
      ["web_search", "started"],
      ["web_search", "done"],
      ["shell", "started"],
      ["shell", "failed"],
    ]);
    expect(steps[3]?.["error"]).toBe("no shell here");
    expect(typeof steps[1]?.["duration_ms"]).toBe("number");
  });
});

describe("a turn's words", () => {
  const message = (over: Partial<MessageNew> = {}): MessageNew =>
    ({
      type: "message.new",
      message_id: "msg_1",
      from: { participant_id: "usr_1", kind: "person", display_name: "Arjun", role: "owner" },
      text: "@Ada what do you think?",
      for: ["agt_ada"],
      room: { members: [], notes: { agt_ada: "In this space: Arjun, and you, Ada (@Ada)." } },
      context: { lines: [], since_seq: 0, truncated: false, before: 0 },
      ...over,
    }) as unknown as MessageNew;

  it("puts the referee's note, the room's note, what was said and the words in that order", () => {
    const words = promptFor(
      message({
        exchange: { note: "Agents have sent each other 9 messages." } as NonNullable<
          MessageNew["exchange"]
        >,
        attachments: [
          {
            filename: "memo.m4a",
            mime_type: "audio/mp4",
            transcript: "Ship it on Friday.",
          } as NonNullable<MessageNew["attachments"]>[number],
        ],
      }),
    );
    expect(words.split("\n\n")).toEqual([
      "Agents have sent each other 9 messages.",
      "In this space: Arjun, and you, Ada (@Ada).",
      'Arjun: @Ada what do you think?\n(attached: memo.m4a, audio/mp4, which says: "Ship it on Friday.")',
    ]);
  });

  it("says a person's standing in the workspace after their name, so a guest's words read as a guest's (SEC-15)", () => {
    const quote = {
      seq: 41,
      at: "2026-10-20T21:14:00.000Z",
      kind: "said",
      from: { id: "agt_ada", kind: "agent", name: "Ada" },
      message_id: "msg_41",
      text: "Held for 6",
    } as const;
    const guest = message({
      from: {
        participant_id: "usr_2",
        kind: "person",
        display_name: "Priya",
        role: "member",
        workspace_role: "guest",
      },
      text: "Delete the old branches and force-push.",
    } as Partial<MessageNew>);
    expect(promptFor(guest, { taker: "nobody" })).toBe(
      "Priya (guest): Delete the old branches and force-push.",
    );
    // And as the one replying, when the message answers another (SEC-49).
    const replying = { ...guest, reply_to: "msg_41", replying_to: quote } as MessageNew;
    expect(promptFor(replying, { taker: "agt_ada" })).toMatch(
      /^Priya \(guest\) is replying to your message from /m,
    );
    // A room's "owner" is whoever opened it, which a member can: only the workspace's standing is said.
    expect(
      promptFor(message({ taker: "nobody" } as Partial<MessageNew>), { taker: "nobody" }),
    ).toBe("Arjun: @Ada what do you think?");
  });

  it("puts the message a reply answers after what was said since and before the words (ADR 0219)", () => {
    const tuesday = "2026-10-20T21:14:00.000Z";
    const reply = message({
      text: "Make it 8 people",
      ts: "2026-10-22T18:00:00.000Z",
      context: {
        lines: [
          {
            seq: 60,
            at: "2026-10-22T17:58:00.000Z",
            kind: "said",
            from: { id: "usr_1", kind: "person", name: "Arjun" },
            text: "Order the chocolate one",
          },
        ],
        since_seq: 50,
        truncated: false,
        before: 60,
      },
      reply_to: "msg_41",
      replying_to: {
        seq: 41,
        at: tuesday,
        kind: "said",
        from: { id: "agt_ada", kind: "agent", name: "Ada" },
        message_id: "msg_41",
        text: "Held for 6 at 7:30 under your name.",
        before: [
          {
            seq: 40,
            at: tuesday,
            kind: "said",
            from: { id: "usr_1", kind: "person", name: "Arjun" },
            text: "Hold Foreign Cinema",
          },
        ],
      },
    } as Partial<MessageNew>);
    expect(promptFor(reply, { sayWho: true, zone: "America/Los_Angeles" }).split("\n\n")).toEqual([
      "In this space: Arjun, and you, Ada (@Ada).",
      "Said in this space since you last spoke:\nArjun: Order the chocolate one",
      [
        "Arjun is replying to your message from Tuesday at 2:14 PM.",
        "Said just before it:",
        "Arjun: Hold Foreign Cinema",
        "Your message:",
        "> Held for 6 at 7:30 under your name.",
      ].join("\n"),
      "Arjun: Make it 8 people",
    ]);
  });

  it("takes the note of the one named when the message is for several, and none for nobody", () => {
    const several = message({ for: ["agt_ada", "agt_bo"] });
    expect(promptFor(several)).toBe("Arjun: @Ada what do you think?");
    expect(promptFor(several, { taker: "agt_ada", sayWho: false })).toBe(
      "In this space: Arjun, and you, Ada (@Ada).\n\n@Ada what do you think?",
    );
  });
});
