/**
 * `chips conformance`, with the subjects injected: the adapters' own tests prove the adapters,
 * and this proves the command — what it prints, what it exits with, and what `custom` says.
 */

import type { ChipsAddress, Subject, Turn } from "@chipschat/conformance";
import { describe, expect, it } from "vitest";
import { scriptedConsole } from "../output.js";
import { conformance } from "./conformance.js";

/** A harness in hooks mode: told the message, it posts the scenario over HTTP and waits on the card. */
function hooksHarness(): Subject {
  let address: ChipsAddress | undefined;
  const post = async (path: string, event: Record<string, unknown>, key: string) => {
    if (address === undefined) throw new Error("not started");
    const response = await fetch(`${address.url}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${address.token}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: JSON.stringify(event),
    });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as { approval_id?: string };
  };
  return {
    name: "hooks",
    start: async (given) => {
      address = given;
    },
    turn: async (message: Turn) => {
      if (address === undefined) throw new Error("not started");
      const runId = "run_01K4ZQPX000000000000000004";
      const events = `/v1/harnesses/${address.harnessId}/events`;
      const inRun = `/v1/runs/${runId}/events`;
      await post(
        events,
        { type: "run.started", space_id: message.spaceId, run_id: runId, goal: message.text },
        "start",
      );
      await post(
        inRun,
        { type: "step.log", step_id: "read", status: "done", tool: "drive.read" },
        "s1",
      );
      const asked = await post(
        inRun,
        {
          type: "approval.request",
          approval_id: "apr_01K4ZQPX000000000000000005",
          action: { kind: "email.send", external: true },
          risk: ["external_communication"],
          expires_in: 60,
        },
        "ask",
      );
      const decided = await fetch(
        `${address.url}/v1/approvals/${asked.approval_id}/wait?timeout=30`,
        {
          headers: { authorization: `Bearer ${address.token}` },
        },
      );
      const { resolution } = (await decided.json()) as { resolution: string };
      await post(
        inRun,
        { type: "approval.executed", approval_id: asked.approval_id, outcome: "executed" },
        "done",
      );
      await post(
        inRun,
        { type: "usage", scope: "run", model: "claude-opus-5", input_tokens: 10, output_tokens: 2 },
        "usage",
      );
      await post(inRun, { type: "message.post", text: `Sent, after a ${resolution}.` }, "reply");
      await post(inRun, { type: "run.completed", summary: "Done." }, "end");
    },
    stop: async () => undefined,
  };
}

describe("chips conformance", () => {
  it("prints the checklist as the app shows it, and exits zero on a pass", async () => {
    const out = scriptedConsole(true);
    const { report, exitCode } = await conformance({
      adapter: "hooks",
      console: out,
      timeoutSeconds: 5,
      subjects: { hooks: hooksHarness },
    });
    expect(exitCode).toBe(0);
    expect(report.passed).toBe(true);
    const text = out.lines.join("\n");
    expect(text).toContain("Conformance · hooks");
    expect(text).toContain("  · You approved email.send.");
    expect(text).toContain("● Messages    sent message.post");
    expect(text).toContain("● Cost        sent usage");
    expect(text).toContain("○ Questions   send question.ask for a question card with options");
    expect(text).toContain("  Passed.");
    // The unlit rows link to the page that lights them.
    expect(text).toContain("https://chipschat.ai/reference/events/question-ask/");
  });

  it("prints only JSON with --json, and exits one when the adapter does not pass", async () => {
    const out = scriptedConsole(true);
    const idle: Subject = {
      name: "idle",
      start: async () => undefined,
      stop: async () => undefined,
    };
    const { exitCode } = await conformance({
      adapter: "hooks",
      console: out,
      json: true,
      timeoutSeconds: 1,
      subjects: { hooks: () => idle },
    });
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(out.lines.join("\n")) as { adapter: string; passed: boolean };
    expect(parsed).toMatchObject({ adapter: "idle", passed: false });
  });

  it("plays what declared capabilities promise, as --capabilities says them (ADR 0046)", async () => {
    const out = scriptedConsole(true);
    const { report } = await conformance({
      adapter: "hooks",
      console: out,
      timeoutSeconds: 1,
      capabilities: ["new_spaces"],
      subjects: { hooks: hooksHarness },
    });
    // The hooks harness answers the golden scenario and claims no room: the kit asked for one.
    expect(report.findings.map((each) => each.message).join("\n")).toContain(
      "declares new_spaces but did not claim the space",
    );
  });

  it("takes only the adapters the manifest has a subject for", async () => {
    await expect(
      conformance({ adapter: "jacobian", console: scriptedConsole(true), timeoutSeconds: 1 }),
    ).rejects.toThrow("No such adapter: jacobian. One of: custom.");
  });

  it("tells a person where to point a custom harness, and waits for it", async () => {
    const out = scriptedConsole(true);
    const { report, exitCode } = await conformance({
      adapter: "custom",
      console: out,
      timeoutSeconds: 1,
    });
    expect(exitCode).toBe(1);
    const text = out.lines.join("\n");
    expect(text).toMatch(/CHIPS_URL=http:\/\/127\.0\.0\.1:\d+/);
    expect(text).toMatch(/CHIPS_HARNESS_TOKEN=chips_at_/);
    expect(text).toContain("Waiting up to 1 s.");
    expect(report.findings[0]?.message).toContain("never connected");
  });
});
