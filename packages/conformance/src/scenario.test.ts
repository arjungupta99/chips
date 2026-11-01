/**
 * The scenario, played against harnesses written on the SDK — which is the "custom" path of the
 * docs, and the reason the kit's own test needs no adapter: a harness that does the golden
 * scenario passes, one that leaves things out gets told exactly what, and one that never
 * connects gets a report rather than a hang.
 */

import { type Chips, connect, type Run } from "@chipschat/harness";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { GOLDEN_MESSAGE, NEW_SPACE_MESSAGE, runConformance } from "./scenario.js";
import type { ChipsAddress, Subject } from "./subject.js";
import { customSubject } from "./subject.js";

type Behaviour =
  | "golden"
  | "no-usage"
  | "says-too-much"
  | "asks-a-question"
  | "never-answers"
  | "fails";

/** What a harness that declares `new_spaces` does with a room it is asked for. */
type Asked = "claims" | "claims-untitled-and-says-nothing" | "never-claims";

/** What a harness that declares `forks` does when a person asks for a copy (ADR 0087, Fork). */
type Forked = "copies" | "never-copies";

/** A harness on the SDK that plays the scenario one way or another. */
function sdkHarness(
  behaviour: Behaviour,
  asked?: Asked,
  forked?: Forked,
): Subject & { readonly heard: string[]; readonly askedFor: string[] } {
  let chips: Chips | undefined;
  const heard: string[] = [];
  const askedFor: string[] = [];
  const capabilities = [
    ...(asked === undefined ? [] : [HARNESS_CAPABILITIES.newSpaces]),
    ...(forked === undefined ? [] : [HARNESS_CAPABILITIES.agents, HARNESS_CAPABILITIES.forks]),
  ];
  return {
    name: `sdk-${behaviour}`,
    heard,
    askedFor,
    ...(capabilities.length === 0 ? {} : { capabilities }),
    async start(address: ChipsAddress) {
      const connected = await connect({
        url: address.url,
        token: address.token,
        client: { name: "sdk", version: "0" },
      });
      chips = connected;
      connected.on("message.new", (message) => {
        heard.push(message.text);
        if (behaviour !== "never-answers") {
          void play(connected, message.space_id ?? address.spaceId, message.text, behaviour);
        }
      });
      if (forked === "copies") {
        connected.on("agent.fork", async (ask) => {
          await connected.agents.register({
            key: `copy-of-${ask.agent_id}`,
            name: "Scout",
            forkedFrom: ask.agent_id,
            spaceId: String(ask.space_id),
          });
        });
      }
      if (asked !== undefined) {
        connected.onSpaceAsked(async (room) => {
          askedFor.push(room.firstMessage.text);
          if (asked === "never-claims") return;
          const titled = asked === "claims";
          await connected.claimSpace(
            room.spaceId,
            `session-${askedFor.length}`,
            titled ? "Kitchen remodel" : undefined,
          );
          if (!titled) return;
          await connected.post({
            spaceId: room.spaceId,
            text: "On it: two quotes first.",
            replyTo: room.firstMessage.messageId,
          });
        });
      }
    },
    async stop() {
      chips?.close();
    },
  };
}

async function play(
  chips: Chips,
  spaceId: string,
  goal: string,
  behaviour: Behaviour,
): Promise<void> {
  const run: Run = await chips.runs.start({
    spaceId,
    goal,
    plan: [
      { stepId: "read-po", title: "Read PO #4471" },
      { stepId: "check-crm", title: "Check the Northwind record" },
      { stepId: "email-dana", title: "Email Dana to confirm" },
    ],
  });
  await run.status("Reading PO #4471…");
  if (behaviour === "says-too-much") {
    await chips.send("checkpoint", { run_id: run.id }, { label: "Read the PO", mood: "chuffed" });
  }
  await run.step({
    stepId: "read-po",
    tool: "drive.read",
    summary: "120 units, delivery 19 September.",
  });
  await run.step({
    stepId: "check-crm",
    tool: "crm.read",
    sources: [{ kind: "internal", label: "CRM" }],
  });
  if (behaviour === "fails") {
    await run.fail({ error: "The CRM is down.", leftUndone: ["Email Dana"] });
    return;
  }
  if (behaviour === "asks-a-question") {
    const answer = await run.question({
      questions: [
        {
          questionId: "which",
          prompt: "Which address?",
          options: [
            { value: "work", label: "Work" },
            { value: "home", label: "Home" },
          ],
          defaultValue: "home",
        },
      ],
    });
    await run.step({ title: `Chose ${answer.answers["which"]?.values.join(",")}` });
  }
  const decision = await run.approval({
    action: {
      kind: "email.send",
      input: { to: "dana@northwind.com" },
      external: true,
      irreversible: true,
    },
    risk: ["external_communication", "irreversible"],
    preview: { format: "markdown", body: "Hi Dana — confirming PO #4471." },
    stepId: "email-dana",
  });
  if (!decision.allowed) {
    await run.fail({ error: "The email was not approved." });
    return;
  }
  await run.executed(decision.approvalId, "executed");
  await run.step({ stepId: "email-dana" });
  if (behaviour !== "no-usage") {
    await run.usage({
      model: "claude-opus-5",
      inputTokens: 82_140,
      outputTokens: 3402,
      costUsd: 0.38,
    });
    await run.context({ usedTokens: 82_000, limitTokens: 200_000, model: "claude-opus-5" });
  }
  await chips.post({
    spaceId,
    text: "Confirmed with Northwind: 120 units on 19 September.",
    runId: run.id,
  });
  await run.complete({ summary: "Confirmed with Northwind: 120 units on 19 September." });
}

/** Hooks mode, as the Custom guide has it: read the log until the person speaks, then answer. */
async function pollThenAnswer(address: ChipsAddress, going: () => boolean): Promise<void> {
  const headers = { authorization: `Bearer ${address.token}`, "content-type": "application/json" };
  try {
    while (going()) {
      const page = await fetch(`${address.url}/v1/events?since=0&limit=100`, { headers });
      const { events } = (await page.json()) as {
        events: { type: string; actor: { kind: string } }[];
      };
      if (events.some((e) => e.type === "message.post" && e.actor.kind === "person")) {
        await fetch(`${address.url}/v1/harnesses/${address.harnessId}/events`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: "message.post",
            space_id: address.spaceId,
            text: "Heard you.",
            idempotency_key: "heard-1",
          }),
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  } catch {
    // The fake has closed under a poll that was still going; nothing to say.
  }
}

function lit(report: { rows: readonly { label: string; lit: boolean }[] }): string[] {
  return report.rows.filter((row) => row.lit).map((row) => row.label);
}

describe("the golden scenario", () => {
  it("passes a harness that does what Scout does, and reads its reason", async () => {
    const subject = sdkHarness("golden");
    const lines: string[] = [];
    const report = await runConformance({
      subject,
      beatTimeoutMs: 5000,
      log: (line) => lines.push(line),
    });
    expect(subject.heard).toEqual([GOLDEN_MESSAGE]);
    expect(lit(report)).toEqual([
      "Messages",
      "Runs",
      "Steps",
      "Approvals",
      "Context",
      "Cost",
      "Finished",
    ]);
    expect(report.findings).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.adapter).toBe("sdk-golden");
    expect(report.events).toBeGreaterThan(8);
    expect(lines).toEqual([
      "Waiting for the harness to connect (up to 120 s)…",
      "The harness is here.",
      `You: ${GOLDEN_MESSAGE}`,
      "You approved email.send.",
      "The run completed.",
    ]);
  });

  it("answers a question with its default, and lights the row", async () => {
    const report = await runConformance({
      subject: sdkHarness("asks-a-question"),
      beatTimeoutMs: 5000,
    });
    expect(lit(report)).toContain("Questions");
    expect(report.passed).toBe(true);
  });

  it("tells a harness that sends no usage exactly which row is dark", async () => {
    const report = await runConformance({ subject: sdkHarness("no-usage"), beatTimeoutMs: 5000 });
    expect(lit(report)).not.toContain("Cost");
    expect(report.passed).toBe(false);
    expect(report.findings).toEqual([]);
  });

  it("warns of a field the protocol does not declare, which Chips drops (ADR 0162)", async () => {
    const report = await runConformance({
      subject: sdkHarness("says-too-much"),
      beatTimeoutMs: 5000,
    });
    expect(report.findings).toEqual([
      {
        severity: "warn",
        message: "checkpoint carried `mood`, which the protocol does not declare: Chips drops it",
      },
    ]);
    expect(report.passed).toBe(true);
  });

  it("reports a run that fails, and a harness that never answers", async () => {
    const failed = await runConformance({ subject: sdkHarness("fails"), beatTimeoutMs: 5000 });
    expect(lit(failed)).toEqual(["Runs", "Steps", "Finished"]);
    expect(failed.findings).toContainEqual({
      severity: "note",
      message: "the run failed: The CRM is down.",
    });

    const silent = await runConformance({
      subject: sdkHarness("never-answers"),
      beatTimeoutMs: 300,
    });
    expect(lit(silent)).toEqual([]);
    expect(silent.passed).toBe(false);
    expect(silent.findings).toContainEqual({
      severity: "note",
      message: "no run started within 0 s of the message",
    });
  });

  it("hears a harness that only polls over HTTP before it has anything to say", async () => {
    let stopped = false;
    const subject: Subject = {
      name: "poller",
      async start(address: ChipsAddress) {
        void pollThenAnswer(address, () => !stopped);
      },
      async stop() {
        stopped = true;
      },
    };
    const lines: string[] = [];
    const report = await runConformance({
      subject,
      connectTimeoutMs: 3000,
      beatTimeoutMs: 500,
      log: (line) => lines.push(line),
    });
    expect(lines).toContain("The harness is here.");
    expect(lit(report)).toContain("Messages");
    expect(report.findings.map((finding) => finding.message)).not.toContainEqual(
      expect.stringContaining("never connected"),
    );
  });

  it("gives a custom harness that never shows up a report rather than a hang", async () => {
    const addresses: ChipsAddress[] = [];
    const report = await runConformance({
      subject: customSubject(),
      connectTimeoutMs: 300,
      onAddress: (address) => addresses.push(address),
    });
    expect(addresses).toHaveLength(1);
    expect(addresses[0]?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(report.adapter).toBe("custom");
    expect(report.findings).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("never connected"),
      }),
    );
    expect(report.passed).toBe(false);
  });

  it("copes with a subject that throws on start or stop", async () => {
    const report = await runConformance({
      subject: {
        name: "broken",
        start: async () => {
          throw new Error("no such adapter");
        },
        stop: async () => {
          throw new Error("and no stopping it");
        },
      },
      beatTimeoutMs: 300,
    });
    expect(report.findings).toEqual([
      { severity: "error", message: "the scenario could not be played: no such adapter" },
      { severity: "warn", message: "stopping the subject failed: and no stopping it" },
    ]);
  });
});

describe("a room a person asks for (new spaces)", () => {
  it("asks a harness that declares new_spaces for a room, which it claims and answers in", async () => {
    const subject = sdkHarness("golden", "claims");
    const lines: string[] = [];
    const report = await runConformance({
      subject,
      beatTimeoutMs: 5000,
      log: (line) => lines.push(line),
    });
    expect(subject.heard).toEqual([GOLDEN_MESSAGE]);
    expect(subject.askedFor).toEqual([NEW_SPACE_MESSAGE]);
    expect(report.findings).toEqual([]);
    expect(report.passed).toBe(true);
    expect(lines.slice(-3)).toEqual([
      `You asked for a new space: ${NEW_SPACE_MESSAGE}`,
      "It claimed the space as “Kitchen remodel”.",
      "It answered in the new space.",
    ]);
  });

  it("fails one that declares new_spaces and never claims, and notes one that claims in silence", async () => {
    const unclaimed = await runConformance({
      subject: sdkHarness("golden", "never-claims"),
      beatTimeoutMs: 800,
    });
    expect(unclaimed.passed).toBe(false);
    expect(unclaimed.findings).toEqual([
      {
        severity: "error",
        message:
          "the harness declares new_spaces but did not claim the space a person asked it for within 1 s",
      },
    ]);

    const silent = await runConformance({
      subject: sdkHarness("golden", "claims-untitled-and-says-nothing"),
      beatTimeoutMs: 800,
    });
    expect(silent.passed).toBe(true);
    expect(silent.findings).toEqual([
      {
        severity: "note",
        message: "the new space was claimed without a title, so it reads as its first words",
      },
      {
        severity: "warn",
        message: "the harness claimed the new space but said nothing in it within 1 s",
      },
    ]);
  });
});

describe("a copy a person asks for (forks)", () => {
  it("asks a harness that declares forks for a copy, which joins the room", async () => {
    const lines: string[] = [];
    const report = await runConformance({
      subject: sdkHarness("golden", undefined, "copies"),
      beatTimeoutMs: 5000,
      log: (line) => lines.push(line),
    });
    expect(report.findings).toEqual([]);
    expect(report.passed).toBe(true);
    expect(lines.slice(-2)).toEqual([
      "You asked for a copy of The harness under test in another space.",
      "Its copy, Scout, joined the space.",
    ]);
  });

  it("fails one that declares forks and never makes the copy", async () => {
    const report = await runConformance({
      subject: sdkHarness("golden", undefined, "never-copies"),
      beatTimeoutMs: 800,
    });
    expect(report.passed).toBe(false);
    expect(report.findings).toEqual([
      {
        severity: "error",
        message:
          "the harness declares forks but no copy joined the space it was asked for within 1 s",
      },
    ]);
  });
});
