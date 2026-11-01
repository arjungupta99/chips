/** The harnesses' shelf at the head of the Agents tab (ADR 0185): its tiles, their order, their words. */

import { describe, expect, it } from "vitest";
import type { AgentRow, AgentsTab } from "./agentsTab.js";
import type { Directory, Participant } from "./events.js";
import { agentCountWords, harnessShelf, troubleWord } from "./harnessShelf.js";

const JACOBIAN = "hrn_01K4ZQPX0000000000JACOBIAN";
const OPENCLAW = "hrn_01K4ZQPX0000000000OPENCLAW";
const CODEX = "hrn_01K4ZQPX0000000000000CODEX";
const SCOUT = "hrn_01K4ZQPX0000000000000SCOUT";
const SINCE = "2026-10-09T08:00:00.000Z";

const harness = (id: string, name: string, extra: Partial<Participant> = {}): Participant => ({
  id,
  kind: "harness",
  displayName: name,
  ...extra,
});

const row = (id: string, harnessId: string, at?: string, lead = false): AgentRow => ({
  id,
  name: id,
  harnessId,
  line: "",
  at,
  lead,
  archived: false,
  free: false,
  held: 0,
  doing: "idle",
});

const HARNESSES = [
  harness(CODEX, "Codex"),
  harness(JACOBIAN, "Jacobian"),
  harness(OPENCLAW, "OpenClaw"),
  harness(SCOUT, "Scout", { state: { connected: false, since: SINCE } }),
];
const directory: Directory = Object.fromEntries(HARNESSES.map((each) => [each.id, each]));

const tab = (over: Partial<AgentsTab> = {}): AgentsTab => ({
  leads: [row("j", JACOBIAN, "2026-10-16T11:52:00.000Z", true)],
  agents: [
    row("claw-3", OPENCLAW, "2026-10-16T12:41:00.000Z"),
    row("life", JACOBIAN, "2026-10-16T09:00:00.000Z"),
    row("garage", JACOBIAN, "2026-10-15T09:00:00.000Z"),
    row("scout", SCOUT, "2026-10-02T09:00:00.000Z"),
  ],
  archived: { here: [row("chess", JACOBIAN, "2026-10-17T00:00:00.000Z")], elsewhere: [] },
  harnesses: HARNESSES,
  ...over,
});

describe("the harnesses' shelf", () => {
  it("runs in the order their rooms last spoke, a harness none of whose rooms has, last", () => {
    expect(harnessShelf(tab(), directory).map((each) => each.name)).toEqual([
      "OpenClaw",
      "Jacobian",
      "Scout",
      "Codex",
    ]);
  });

  it("counts a harness's agents with its Main agent, never its archived ones", () => {
    const counts = Object.fromEntries(
      harnessShelf(tab(), directory).map((each) => [each.name, each.agents]),
    );
    expect(counts).toEqual({ OpenClaw: 1, Jacobian: 3, Scout: 1, Codex: 0 });
  });

  it("says in a word why a harness can't answer, and nothing while it can", () => {
    const tiles = harnessShelf(tab(), directory);
    expect(tiles.find((each) => each.id === SCOUT)?.trouble).toBe("Offline");
    expect(tiles.find((each) => each.id === JACOBIAN)?.trouble).toBeUndefined();
  });

  it("puts harnesses whose rooms never spoke in the order of their names", () => {
    const quiet = tab({ leads: [], agents: [] });
    expect(harnessShelf(quiet, directory).map((each) => each.name)).toEqual([
      "Codex",
      "Jacobian",
      "OpenClaw",
      "Scout",
    ]);
  });

  it("is empty with no harnesses", () => {
    expect(harnessShelf(tab({ harnesses: [] }), directory)).toEqual([]);
  });
});

describe("a tile's words", () => {
  it("says offline, restarting, or that it can't answer", () => {
    expect(troubleWord(undefined)).toBeUndefined();
    expect(troubleWord({ kind: "offline" })).toBe("Offline");
    expect(troubleWord({ kind: "offline", since: SINCE })).toBe("Offline");
    expect(troubleWord({ kind: "restarting", since: SINCE })).toBe("Restarting");
    expect(troubleWord({ kind: "trouble", reason: "Out of credits", since: SINCE })).toBe(
      "Can't answer",
    );
  });

  it("counts agents, and says when there are none yet", () => {
    expect(agentCountWords(0)).toBe("No agents yet");
    expect(agentCountWords(1)).toBe("1 agent");
    expect(agentCountWords(21)).toBe("21 agents");
  });
});
