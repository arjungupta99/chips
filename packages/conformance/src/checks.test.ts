/**
 * The checks for each capability past the golden scenario (open-source harnesses plan, Phase 7),
 * played against small harnesses on the SDK: one that does what it declares is told so level by
 * level, and one that declares and doesn't is told exactly what it left undone.
 */

import { type Chips, connect, Refuse } from "@chipschat/harness";
import { HARNESS_CAPABILITIES } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { formatReport } from "./report.js";
import { runConformance } from "./scenario.js";
import type { ChipsAddress, Subject } from "./subject.js";

/** What the harness under test does with each thing a person asks of it. */
interface Does {
  readonly newAgents?: "makes" | "never";
  /** Copies sent and changes answered; `refuses` answers each with a refusal; `silent` never. */
  readonly settings?: "answers" | "refuses" | "silent" | "deaf";
  readonly restarts?: "comes-back" | "says-ok" | "fails" | "never";
}

const MODEL = {
  model: "heron-2",
  own: false,
  choices: [{ id: "heron-2", label: "Heron 2", efforts: [] }],
  editable: true,
};
const HEARTBEAT = { on: false, every: 60, choices: [30, 60], editable: true };
const WINDOW = {
  used: 1200,
  window: 200_000,
  as_of: "2026-10-14T09:00:00.000Z",
  limit: { at: 80, choices: [60, 80], may_turn_off: false },
  compacts: false,
  why_not: "It compacts on its own.",
  editable: true,
};
const FILES = {
  files: [
    { name: "AGENTS.md", title: "Instructions", text: "Be brief.\n", hash: "h1", editable: true },
  ],
};

function capabilitiesOf(does: Does): string[] {
  const settings =
    does.settings === undefined
      ? []
      : [
          HARNESS_CAPABILITIES.contextFiles,
          HARNESS_CAPABILITIES.models,
          HARNESS_CAPABILITIES.heartbeats,
          HARNESS_CAPABILITIES.contextWindows,
        ];
  return [
    HARNESS_CAPABILITIES.agents,
    ...(does.newAgents === undefined ? [] : [HARNESS_CAPABILITIES.newAgents]),
    ...settings,
    ...(does.restarts === undefined ? [] : [HARNESS_CAPABILITIES.restarts]),
  ];
}

/** A harness that answers every message plainly, and does what `does` says with the rest. */
function managedHarness(does: Does): Subject {
  let chips: Chips | undefined;
  const answer = async <T>(copy: T): Promise<T> => {
    if (does.settings === "refuses") throw new Refuse("Not from here, sorry.");
    if (does.settings === "silent") await new Promise(() => undefined);
    return copy;
  };
  const open = async (address: ChipsAddress, again: boolean): Promise<void> => {
    const deaf = does.settings === "deaf" || does.settings === undefined;
    const connected = await connect({
      url: address.url,
      token: address.token,
      client: { name: "managed", version: "0" },
      ...(does.restarts === undefined || does.restarts === "never"
        ? {}
        : { onRestart: () => void restart(address) }),
      ...(deaf
        ? {}
        : {
            settings: {
              context: () => answer(FILES),
              models: () => answer(MODEL),
              heartbeats: () => answer(HEARTBEAT),
              contextWindows: { compact: () => answer(WINDOW), change: () => answer(WINDOW) },
            },
          }),
    });
    chips = connected;
    connected.on("message.new", async (message) => {
      const spaceId = String(message.space_id);
      const run = await connected.runs.start({ spaceId, goal: message.text });
      await connected.post({ spaceId, text: "Done.", runId: run.id });
      await run.complete({ summary: "Done." });
    });
    if (does.newAgents === "makes") {
      connected.on("agent.asked", async (ask) => {
        await connected.agents.register({
          key: `new-${ask.id}`,
          name: ask.name,
          madeFor: ask.id,
          spaceId: String(ask.space_id),
        });
      });
    }
    if (again || does.settings === undefined) return;
    const main = await connected.agents.register({ key: "main", name: "Main", lead: true });
    await connected.settings.context(main.agentId, FILES);
    await connected.settings.model(main.agentId, MODEL);
    await connected.settings.heartbeat(main.agentId, HEARTBEAT);
    await connected.settings.contextWindow(main.agentId, WINDOW);
  };
  const restart = async (address: ChipsAddress): Promise<void> => {
    if (does.restarts === "fails") return chips?.reportTrouble("The agent would not start.");
    if (does.restarts === "says-ok") return chips?.reportOk();
    chips?.close();
    await open(address, true);
  };
  return {
    name: "managed",
    capabilities: capabilitiesOf(does),
    start: (address) => open(address, false),
    async stop() {
      chips?.close();
    },
  };
}

const BEAT = 1500;

describe("a harness that does what it declares", () => {
  it("is managed from Chips: copies sent, a change answered, a new agent, and a restart", async () => {
    const lines: string[] = [];
    const report = await runConformance({
      subject: managedHarness({ newAgents: "makes", settings: "answers", restarts: "comes-back" }),
      beatTimeoutMs: BEAT,
      log: (line) => lines.push(line),
    });
    expect(report.findings.filter((finding) => finding.severity !== "note")).toEqual([]);
    const levels = Object.fromEntries(report.levels.map((level) => [level.label, level.has]));
    expect(levels).toMatchObject({ Talks: 1, "Lives in Chips": 3, "Managed from Chips": 4 });
    expect(report.levels[2]?.capabilities).toEqual([
      { capability: "agents", outcome: "declared" },
      { capability: "new_agents", outcome: "passed" },
      { capability: "restarts", outcome: "passed" },
    ]);
    expect(lines).toEqual(
      expect.arrayContaining([
        "The new agent joined the space.",
        "It saved the model.",
        "It saved the context files.",
        "It restarted and connected again.",
      ]),
    );
    expect(formatReport(report)).toContain(
      "    ◐ Lives in Chips       3 of 6: agents · not checked, new agents ✓, restarts ✓",
    );
  });

  it("may refuse a change and say why, and come back from a restart by saying it is fine", async () => {
    const report = await runConformance({
      subject: managedHarness({ settings: "refuses", restarts: "says-ok" }),
      beatTimeoutMs: BEAT,
    });
    expect(report.findings).toContainEqual({
      severity: "note",
      message:
        "the harness refused a change of heartbeat to what it already was: Not from here, sorry.",
    });
    expect(report.findings.filter((finding) => finding.severity === "error")).toEqual([]);
    expect(report.levels[3]?.has).toBe(4);
  });
});

describe("a harness that declares and does not", () => {
  it("is told each thing it left undone, and the level it reached", async () => {
    const report = await runConformance({
      subject: managedHarness({ newAgents: "never", settings: "silent", restarts: "never" }),
      beatTimeoutMs: BEAT,
    });
    const errors = report.findings.filter((finding) => finding.severity === "error");
    expect(errors.map((finding) => finding.message)).toEqual([
      "the harness declares new_agents but no new agent joined the space it was asked for within 2 s",
      "the harness did not answer a person's change of an agent's context files within 2 s",
      "the harness did not answer a person's change of an agent's model within 2 s",
      "the harness did not answer a person's change of an agent's heartbeat within 2 s",
      "the harness did not answer a person's change of an agent's context window within 2 s",
      "the harness declares restarts but no socket of it said `restart` in its hello, so a person's Restart can't reach it",
    ]);
    expect(report.passed).toBe(false);
    expect(report.levels.slice(2).map((level) => level.has)).toEqual([1, 0]);
  });

  it("is told a copy never sent, and a socket that never said it takes changes", async () => {
    const report = await runConformance({
      subject: managedHarness({ settings: "deaf", restarts: "fails" }),
      beatTimeoutMs: BEAT,
    });
    const errors = report.findings.filter((finding) => finding.severity === "error");
    expect(errors.map((finding) => finding.message)).toContain(
      "the harness declares models but no socket of it said `models` in its hello, so a person's change can't reach it",
    );
    expect(errors.map((finding) => finding.message)).toContain(
      "the harness says its restart did not work: The agent would not start.",
    );
  });
});
