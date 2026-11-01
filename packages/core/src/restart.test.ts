/** Who may restart a harness, what its page offers, and what the sheet says (ADR 0094). */

import type { AgentState } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { agentStateWords, cantAnswer, whyWords } from "./agents.js";
import type { Directory, Participant } from "./events.js";
import { buildModel } from "./model.js";
import {
  backFromRestart,
  backWords,
  mayRestartHarness,
  restartAsking,
  restartOffer,
} from "./restart.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const VENDOR = "usr_01K4ZQPX000000000000VENDOR";
const CLAW = "hrn_01K4ZQPX0000000000000CLAW";
const SINCE = "2026-10-02T15:06:00.000Z";
const ASKED = "2026-10-02T15:31:00.000Z";
const NOW = Date.parse("2026-10-02T15:32:00.000Z");
const clock = (iso: string) => `[${iso.slice(11, 16)}]`;

const fine: AgentState = { connected: true, since: SINCE };
const claw = (more: Partial<Participant> = {}): Participant => ({
  id: CLAW,
  kind: "harness",
  displayName: "OpenClaw",
  ownerId: ARJUN,
  lastSeenAt: SINCE,
  capabilities: ["new_spaces", "agents", "restarts"],
  state: fine,
  ...more,
});
const directory = (more: Partial<Participant> = {}): Directory => ({
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [CLAW]: claw(more),
});

const model = buildModel(
  Object.entries({ [ARJUN]: "owner", [DANA]: "member", [VENDOR]: "guest" }).map(
    ([id, role], index) => ({
      seq: index + 1,
      type: "person.joined",
      id: `evt_${index + 1}`,
      ts: "2026-09-27T00:00:00.000Z",
      workspace_id: "ws_1",
      actor: { kind: "person", id },
      participant_id: id,
      display_name: id,
      role,
    }),
  ),
);

const restarting = (by = ARJUN): Partial<Participant> => ({
  state: { connected: true, since: SINCE, restarting: { since: ASKED, by } },
});

describe("who may restart a harness (ADR 0094)", () => {
  it("is who may remove it, for a harness that says it takes restarts", () => {
    expect(mayRestartHarness(model, directory(), CLAW, ARJUN)).toBe(true);
    expect(mayRestartHarness(model, directory(), CLAW, DANA)).toBe(false);
    expect(mayRestartHarness(model, directory(), CLAW, VENDOR)).toBe(false);
    expect(mayRestartHarness(model, directory({ capabilities: ["agents"] }), CLAW, ARJUN)).toBe(
      false,
    );
    expect(mayRestartHarness(model, directory({ removedAt: SINCE }), CLAW, ARJUN)).toBe(false);
  });
});

describe("what the harness's page offers (ADR 0094)", () => {
  it("offers Restart quietly while it can answer, and in gold while it can't", () => {
    expect(restartOffer(model, directory(), CLAW, ARJUN)).toEqual({
      kind: "offer",
      loud: false,
      label: "Restart OpenClaw…",
    });
    const trouble = directory({
      state: { ...fine, trouble: { reason: "Can't reach its gateway", since: SINCE } },
    });
    expect(restartOffer(model, trouble, CLAW, ARJUN)).toMatchObject({ kind: "offer", loud: true });
  });

  it("offers nothing to press while a restart stands, and says why there's no button offline", () => {
    expect(restartOffer(model, directory(restarting()), CLAW, ARJUN)).toEqual({
      kind: "going",
      label: "Restarting…",
    });
    const offline = directory({ state: { connected: false, since: SINCE } });
    expect(restartOffer(model, offline, CLAW, ARJUN)).toMatchObject({
      kind: "unreachable",
      title: "Chips can't reach OpenClaw",
    });
    expect(restartOffer(model, directory(), CLAW, DANA)).toBeUndefined();
  });

  it("asks first, saying it stops what the harness is doing", () => {
    const asking = restartAsking("OpenClaw");
    expect(asking.title).toBe("Restart OpenClaw?");
    expect(asking.body).toContain("stops whatever it's doing");
    expect(asking.confirm).toBe("Restart");
  });
});

describe("restarting as the agent's state (ADR 0094)", () => {
  it("can't answer while restarting, even offline on the way back, and says who asked", () => {
    const offlineOnTheWay = directory({
      state: { connected: false, since: ASKED, restarting: { since: ASKED, by: ARJUN } },
    });
    const why = cantAnswer(offlineOnTheWay, CLAW);
    expect(why).toEqual({ kind: "restarting", since: ASKED, by: ARJUN });
    expect(whyWords(why ?? { kind: "offline" }, NOW, clock)).toBe("Restarting · since [15:31]");
    expect(agentStateWords(offlineOnTheWay, CLAW, NOW, clock, ARJUN)).toBe(
      "Restarting · asked by you [15:31]",
    );
    expect(agentStateWords(directory(restarting()), CLAW, NOW, clock, DANA)).toBe(
      "Restarting · asked by Arjun [15:31]",
    );
  });

  it("says it is back only when a restart ended with it able to answer", () => {
    const going: AgentState = { ...fine, restarting: { since: ASKED, by: ARJUN } };
    expect(backFromRestart(going, fine)).toBe(true);
    expect(backFromRestart(fine, fine)).toBe(false);
    expect(backFromRestart(going, { ...fine, trouble: { reason: "Colima", since: ASKED } })).toBe(
      false,
    );
    expect(backFromRestart(going, { connected: false, since: ASKED })).toBe(false);
    expect(backWords(Date.parse("2026-10-02T15:33:00.000Z"), NOW, clock)).toBe("Back · [15:33]");
  });
});
