/** An agent's heartbeat, as its page draws it (ADR 0143). */

import type { AgentHeartbeatView, HeartbeatChangeView } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  everyChoices,
  everyWords,
  heartbeatFoot,
  heartbeatRows,
  heartbeatWords,
  mayChangeHeartbeat,
  perDay,
  saveHeartbeatChange,
  takesHeartbeats,
} from "./agentHeartbeat.js";
import type { Directory, Participant } from "./events.js";
import { buildModel } from "./model.js";
import { ServerRefused } from "./transport.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const AGENT = "agt_01K4ZQPX000000000000AGENT";
const CHANGE = "chg_01K4ZQPX00000000000CHANGE";

const lathe = (more: Partial<Participant> = {}): Participant => ({
  id: LATHE,
  kind: "harness",
  displayName: "Lathe",
  ownerId: ARJUN,
  capabilities: ["agents", "heartbeats"],
  ...more,
});
const directory = (more: Partial<Participant> = {}): Directory => ({
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [LATHE]: lathe(more),
  [AGENT]: { id: AGENT, kind: "agent", harnessId: LATHE, displayName: "Shore" },
});
const workspace = buildModel(
  Object.entries({ [ARJUN]: "owner", [DANA]: "member" }).map(([id, role], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: "2026-10-09T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

const view = (more: Partial<AgentHeartbeatView> = {}): AgentHeartbeatView => ({
  agent_id: AGENT,
  harness_id: LATHE,
  on: false,
  every: 30,
  choices: [15, 30, 60, 120, 240, 720, 1440],
  editable: true,
  read_at: "2026-10-09T09:00:00.000Z",
  away: false,
  ...more,
});

const asked = (more: Partial<HeartbeatChangeView> = {}): HeartbeatChangeView => ({
  change_id: CHANGE,
  state: "waiting",
  on: true,
  every: 30,
  asked_at: "2026-10-09T09:10:00.000Z",
  ...more,
});

describe("who sees an agent's heartbeat (ADR 0143)", () => {
  it("is the harness's owner or an admin, while it declares heartbeats", () => {
    expect(takesHeartbeats(directory(), AGENT)).toBe(true);
    expect(mayChangeHeartbeat(workspace, directory(), AGENT, ARJUN)).toBe(true);
    expect(mayChangeHeartbeat(workspace, directory(), AGENT, DANA)).toBe(false);
    const undeclared = directory({ capabilities: ["agents", "models"] });
    expect(mayChangeHeartbeat(workspace, undeclared, AGENT, ARJUN)).toBe(false);
  });
});

describe("an interval in words", () => {
  it("is minutes, hours, once a day, or every so many days", () => {
    expect([15, 30, 60, 120, 240, 720, 1440, 2880].map(everyWords)).toEqual([
      "15 min",
      "30 min",
      "1 hour",
      "2 hours",
      "4 hours",
      "12 hours",
      "Once a day",
      "Every 2 days",
    ]);
    expect(everyWords(90)).toBe("90 min");
    expect(everyWords(2160)).toBe("36 hours");
  });

  it("counts the checks a day, roughly, and none below one", () => {
    expect(perDay(30)).toBe("about 48 a day");
    expect(perDay(60)).toBe("about 24 a day");
    expect(perDay(45)).toBe("about 32 a day");
    expect(perDay(1440)).toBe("about 1 a day");
    expect(perDay(2880)).toBeUndefined();
  });
});

describe("the rows", () => {
  it("are a switch, off, with no Every row", () => {
    expect(heartbeatRows(view(), "Lathe")).toEqual({
      on: false,
      sub: "Off",
      every: { shows: false, minutes: 30, value: "30 min" },
      saving: undefined,
      quiet: false,
      hint: undefined,
    });
  });

  it("grow an Every row while it is on", () => {
    const rows = heartbeatRows(view({ on: true, every: 60 }), "Lathe");
    expect(rows).toMatchObject({ on: true, sub: "On" });
    expect(rows.every).toEqual({ shows: true, minutes: 60, value: "1 hour" });
  });

  it("show the switch as asked, saving, while its change waits", () => {
    const rows = heartbeatRows(view({ change: asked() }), "Lathe");
    expect(rows).toMatchObject({ on: true, sub: "Saving to Lathe", saving: "switch" });
    expect(rows.every).toEqual({ shows: true, minutes: 30, value: "30 min" });
  });

  it("show the Every row saving while a new interval waits", () => {
    const rows = heartbeatRows(view({ on: true, change: asked({ every: 60 }) }), "Lathe");
    expect(rows).toMatchObject({ on: true, sub: "On", saving: "every" });
    expect(rows.every).toEqual({ shows: true, minutes: 60, value: "Saving to Lathe" });
  });

  it("show the copy as the harness said once a change is answered, refused or missed", () => {
    for (const state of ["saved", "failed", "missed"] as const) {
      const rows = heartbeatRows(view({ change: asked({ state }) }), "Lathe");
      expect(rows).toMatchObject({ on: false, sub: "Off", saving: undefined });
    }
  });

  it("are quiet while the harness is away, and say so", () => {
    const rows = heartbeatRows(view({ on: true, away: true }), "Lathe");
    expect(rows).toMatchObject({ quiet: true, hint: "Lathe is away" });
    expect(rows.every.shows).toBe(true);
  });

  it("are quiet when read only, in the harness's words", () => {
    const why = "Lathe keeps this one's heartbeat.";
    const rows = heartbeatRows(view({ editable: false, why_read_only: why }), "Lathe");
    expect(rows).toMatchObject({ quiet: true, hint: why });
    expect(heartbeatRows(view({ editable: false }), "Lathe").hint).toBe(
      "Only Lathe can change this.",
    );
  });
});

describe("the intervals to pick from", () => {
  it("are the harness's, in words, with the checks a day and the one it beats at", () => {
    const choices = everyChoices(view({ choices: [30, 60, 2880], every: 60 }));
    expect(choices).toEqual([
      { minutes: 30, label: "30 min", sub: "about 48 a day", checked: false },
      { minutes: 60, label: "1 hour", sub: "about 24 a day", checked: true },
      { minutes: 2880, label: "Every 2 days", sub: undefined, checked: false },
    ]);
  });
});

describe("the foot", () => {
  it("says what the switch means off", () => {
    expect(heartbeatFoot(view(), "Shore", "Lathe")).toBe(
      "Off. Shore only answers when you write to it.",
    );
  });

  it("says how often, what a check does, and roughly how many a day, on", () => {
    expect(heartbeatFoot(view({ on: true }), "Shore", "Lathe")).toBe(
      "Every 30 min, Shore looks over what it's doing and writes in its space only when something needs you. Each look is a full turn: about 48 a day.",
    );
    expect(heartbeatFoot(view({ on: true, every: 60 }), "Shore", "Lathe")).toMatch(
      /^Every hour, Shore .* about 24 a day\.$/,
    );
    expect(heartbeatFoot(view({ on: true, every: 1440 }), "Shore", "Lathe")).toMatch(
      /^Once a day, Shore /,
    );
    expect(
      heartbeatFoot(view({ on: true, every: 2880, choices: [2880] }), "Shore", "Lathe"),
    ).toMatch(/^Every 2 days, Shore .* Each look is a full turn\.$/);
  });

  it("follows a change on its way", () => {
    expect(heartbeatFoot(view({ change: asked({ every: 60 }) }), "Shore", "Lathe")).toMatch(
      /^Every hour, /,
    );
  });

  it("says why it can't be changed now", () => {
    expect(heartbeatFoot(view({ away: true }), "Shore", "Lathe")).toBe(
      "Off. Shore only answers when you write to it. Lathe is away, so this can't be changed now.",
    );
    const why = "Lathe keeps this one's heartbeat.";
    expect(heartbeatFoot(view({ editable: false, why_read_only: why }), "Shore", "Lathe")).toBe(
      `Off. Shore only answers when you write to it. ${why}`,
    );
  });
});

describe("the words of a save", () => {
  it("are Chips' few, and the harness's for a refusal", () => {
    expect(heartbeatWords("saving", "Lathe")).toBe("Saving to Lathe");
    expect(heartbeatWords("saved", "Lathe")).toBe("Saved");
    expect(heartbeatWords("missed", "Lathe")).toBe(
      "Lathe hasn't answered. It may still change it.",
    );
    expect(heartbeatWords("away", "Lathe")).toBe("Lathe is away");
    expect(heartbeatWords("failed", "Lathe", "Lathe can't beat that often.")).toBe(
      "Lathe can't beat that often.",
    );
    expect(heartbeatWords("failed", "Lathe")).toBe("Lathe couldn't change it.");
  });
});

describe("saving a change", () => {
  const settled = (state: HeartbeatChangeView["state"], message?: string) =>
    view({ change: asked({ state, ...(message === undefined ? {} : { message }) }) });

  function store(
    reads: AgentHeartbeatView[],
    change: () => Promise<HeartbeatChangeView> = async () => asked(),
  ) {
    const seen: unknown[] = [];
    return {
      seen,
      store: {
        changeAgentHeartbeat: async (agentId: string, ask: unknown) => {
          seen.push([agentId, ask]);
          return await change();
        },
        readAgentHeartbeat: async () => reads.shift() ?? settled("waiting"),
      },
    };
  }
  const options = { alive: () => true, sleep: async () => {} };

  it("waits for the harness's answer", async () => {
    const fake = store([settled("waiting"), settled("saved")]);
    const done = await saveHeartbeatChange(fake.store, AGENT, { on: true }, options);
    expect(done.state).toBe("saved");
    expect(done.view?.change?.state).toBe("saved");
    expect(fake.seen).toEqual([[AGENT, { on: true }]]);
  });

  it("carries the harness's words for a refusal", async () => {
    const fake = store([settled("failed", "Lathe can't beat that often.")]);
    const done = await saveHeartbeatChange(fake.store, AGENT, { on: true, every: 15 }, options);
    expect(done).toMatchObject({ state: "failed", message: "Lathe can't beat that often." });
  });

  it("settles on missed when the server says so, or when its minute runs out", async () => {
    const missed = await saveHeartbeatChange(
      store([settled("missed")]).store,
      AGENT,
      { on: false },
      options,
    );
    expect(missed.state).toBe("missed");
    const silent = await saveHeartbeatChange(
      store([]).store,
      AGENT,
      { on: false },
      {
        ...options,
        everyMs: 20_000,
      },
    );
    expect(silent.state).toBe("missed");
  });

  it("is away when nothing of the harness hears it, and failed for another refusal", async () => {
    const refuse = (refusal: string) => async () => {
      throw new ServerRefused("Lathe is away, so Chips can't change it now.", 422, {
        error: { code: "invalid_event", refusal },
      });
    };
    const away = await saveHeartbeatChange(
      store([], refuse("harness_away")).store,
      AGENT,
      { on: true },
      options,
    );
    expect(away.state).toBe("away");
    const waiting = await saveHeartbeatChange(
      store([], refuse("change_waiting")).store,
      AGENT,
      { on: true },
      options,
    );
    expect(waiting).toMatchObject({ state: "failed", message: expect.stringContaining("away") });
  });

  it("stops asking once the page is gone", async () => {
    let reads = 0;
    const done = await saveHeartbeatChange(
      {
        changeAgentHeartbeat: async () => asked(),
        readAgentHeartbeat: async () => {
          reads += 1;
          return settled("waiting");
        },
      },
      AGENT,
      { on: true },
      { alive: () => false, sleep: async () => {} },
    );
    expect(done.state).toBe("missed");
    expect(reads).toBe(0);
  });
});
