/** Which of an agent's four groups a person sees, and what a missing one says (ADR 0238). */

import { describe, expect, it } from "vitest";
import {
  noCopy,
  notSharedWords,
  type SettingGroup,
  settingLook,
  windowNotYetWords,
} from "./agentSettings.js";
import type { Directory, Participant } from "./events.js";
import { buildModel } from "./model.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const AGENT = "agt_01K4ZQPX000000000000AGENT";

const directory = (capabilities: string[]): Directory => {
  const lathe: Participant = {
    id: LATHE,
    kind: "harness",
    displayName: "Lathe",
    ownerId: ARJUN,
    capabilities,
  };
  return {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
    [LATHE]: lathe,
    [AGENT]: { id: AGENT, kind: "agent", harnessId: LATHE, displayName: "Shore" },
  };
};
const workspace = buildModel(
  Object.entries({ [ARJUN]: "owner", [DANA]: "member" }).map(([id, role], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: "2026-10-27T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

const GROUPS: readonly SettingGroup[] = ["model", "heartbeat", "window", "context"];
const looks = (capabilities: string[], selfId: string) =>
  GROUPS.map((group) => settingLook(workspace, directory(capabilities), AGENT, selfId, group));

describe("an agent's groups, as a person sees them", () => {
  it("shows what the harness shares to its owner, and says what it doesn't", () => {
    expect(looks(["agents", "context_windows", "context_files"], ARJUN)).toEqual([
      "not_shared",
      "not_shared",
      "shown",
      "shown",
    ]);
  });

  it("hides all four from a member who doesn't run the harness", () => {
    expect(looks(["agents", "models", "context_windows"], DANA)).toEqual([
      "hidden",
      "hidden",
      "hidden",
      "hidden",
    ]);
  });

  it("hides them while the harness isn't in the directory yet", () => {
    const bare: Directory = {
      [AGENT]: { id: AGENT, kind: "agent", harnessId: LATHE, displayName: "Shore" },
    };
    expect(settingLook(workspace, bare, AGENT, ARJUN, "model")).toBe("hidden");
  });
});

describe("the words", () => {
  it("name the harness and the agent", () => {
    const names = directory([]);
    expect(GROUPS.map((group) => notSharedWords(group, names, AGENT))).toEqual([
      "Lathe doesn't share Shore's model with Chips.",
      "Lathe doesn't share a heartbeat for Shore with Chips.",
      "Lathe doesn't share how full Shore's context is.",
      "Lathe doesn't share Shore's context files with Chips.",
    ]);
    expect(windowNotYetWords(names, AGENT)).toBe(
      "Lathe hasn't said how full Shore's context is yet.",
    );
  });
});

describe("a read with no copy", () => {
  it("is a 404, not a read that went unanswered", () => {
    expect(noCopy(Object.assign(new Error("answered 404"), { status: 404 }))).toBe(true);
    expect(noCopy(Object.assign(new Error("answered 503"), { status: 503 }))).toBe(false);
    expect(noCopy(new Error("offline"))).toBe(false);
  });
});
