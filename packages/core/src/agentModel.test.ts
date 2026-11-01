/** An agent's model and effort, as its page draws them (ADR 0140). */

import type { AgentModelView, ModelChangeView, ModelChoice } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  canSave,
  defaultWords,
  harnessModelAgent,
  levelAfter,
  mayChangeModel,
  modelAsk,
  modelRow,
  modelWords,
  openModelSheet,
  pickLevel,
  pickModel,
  sameAs,
  saveModelChange,
  sheetChanged,
  shownPick,
  sweepOf,
  takesModels,
} from "./agentModel.js";
import type { Directory, Participant } from "./events.js";
import { buildModel } from "./model.js";
import { ServerRefused } from "./transport.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const AGENT = "agt_01K4ZQPX000000000000AGENT";
const CHANGE = "chg_01K4ZQPX00000000000CHANGE";
const NAMES = { harness: "Lathe", agent: "Shore" };

const lathe = (more: Partial<Participant> = {}): Participant => ({
  id: LATHE,
  kind: "harness",
  displayName: "Lathe",
  ownerId: ARJUN,
  capabilities: ["agents", "models"],
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
    ts: "2026-10-08T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

const LIGHT = { id: "light", label: "Light" };
const STEADY = { id: "steady", label: "Steady" };
const DEEP = { id: "deep", label: "Deep" };
const levels = [LIGHT, STEADY, DEEP];
const heron: ModelChoice = {
  id: "heron-2",
  label: "Heron 2",
  efforts: levels,
  effort_default: "steady",
};
const mini: ModelChoice = { id: "heron-2-mini", label: "Heron 2 Mini", efforts: [] };
/** Two levels, Light and Deep, and no default of its own. */
const kestrel: ModelChoice = {
  id: "kestrel-1",
  label: "Kestrel 1",
  efforts: [LIGHT, DEEP],
};

const view = (more: Partial<AgentModelView> = {}): AgentModelView => ({
  agent_id: AGENT,
  harness_id: LATHE,
  model: "heron-2",
  effort: "steady",
  own: false,
  default: { label: "Same as J", model: "heron-2", effort: "steady" },
  choices: [heron, mini, kestrel],
  editable: true,
  read_at: "2026-10-08T23:00:00.000Z",
  away: false,
  ...more,
});

describe("who sees an agent's model (ADR 0140)", () => {
  it("is the harness's owner or an admin, while it declares models", () => {
    expect(takesModels(directory(), AGENT)).toBe(true);
    expect(mayChangeModel(workspace, directory(), AGENT, ARJUN)).toBe(true);
    expect(mayChangeModel(workspace, directory(), AGENT, DANA)).toBe(false);
    const undeclared = directory({ capabilities: ["agents", "context_files"] });
    expect(mayChangeModel(workspace, undeclared, AGENT, ARJUN)).toBe(false);
  });
});

describe("the harness's own Model row (ADR 0154)", () => {
  const MAIN = "agt_01K4ZQPX0000000000000MAIN";
  const OTHER = "hrn_01K4ZQPX000000000000OTHER";
  const withMain = (more: Partial<Participant> = {}): Directory => ({
    ...directory(),
    [OTHER]: { id: OTHER, kind: "harness", displayName: "Other" },
    [`${OTHER}_main`]: {
      id: `${OTHER}_main`,
      kind: "agent",
      harnessId: OTHER,
      displayName: "Other",
      lead: true,
    },
    [MAIN]: {
      id: MAIN,
      kind: "agent",
      harnessId: LATHE,
      displayName: "Lathe",
      lead: true,
      ...more,
    },
  });

  it("is its Main agent's, whose model the agents with none of their own follow", () => {
    expect(harnessModelAgent(withMain(), LATHE)).toBe(MAIN);
    expect(harnessModelAgent(withMain(), OTHER)).toBe(`${OTHER}_main`);
  });

  it("is nobody's for a harness with no Main agent, or an archived one", () => {
    expect(harnessModelAgent(directory(), LATHE)).toBeUndefined();
    expect(harnessModelAgent(withMain({ archived: true }), LATHE)).toBeUndefined();
  });
});

describe("the row", () => {
  it("says the model, its effort and whose, with the bars lit to its level", () => {
    const row = modelRow(view(), NAMES);
    expect(row).toEqual({
      label: "Heron 2",
      sub: "Steady effort · Same as J",
      levels,
      level: 1,
      quiet: false,
      hint: undefined,
      foot: undefined,
    });
  });

  it("says its own, and drops the effort for a model with none", () => {
    expect(modelRow(view({ own: true, effort: "deep" }), NAMES).sub).toBe("Deep effort · its own");
    const plain = modelRow(view({ own: true, model: "heron-2-mini", effort: undefined }), NAMES);
    expect(plain).toMatchObject({ sub: "Its own", levels: [], level: -1 });
    const follows = modelRow(view({ model: "heron-2-mini", effort: undefined }), NAMES);
    expect(follows.sub).toBe("Same as J");
  });

  it("is quiet while the harness is away, and says so", () => {
    const row = modelRow(view({ away: true }), NAMES);
    expect(row).toMatchObject({
      quiet: true,
      hint: "Lathe is away",
      foot: "Lathe is away. You can see this, not change it.",
    });
  });

  it("is quiet when read only, in the harness's words", () => {
    const why = "Lathe's own agent. Change it in Lathe.";
    const row = modelRow(view({ editable: false, why_read_only: why }), NAMES);
    expect(row).toMatchObject({ quiet: true, hint: why, foot: why });
    expect(modelRow(view({ editable: false }), NAMES).hint).toBe("Only Lathe can change this.");
  });

  it("says how many agents follow it", () => {
    expect(modelRow(view({ followed_by: 38 }), NAMES).foot).toBe(
      "38 agents have no model of their own and use Shore's.",
    );
    expect(modelRow(view({ followed_by: 1 }), NAMES).foot).toBe(
      "1 agent has no model of its own and uses Shore's.",
    );
    expect(modelRow(view({ followed_by: 0 }), NAMES).foot).toBeUndefined();
    expect(modelRow(view({ followed_by: 2, away: true }), NAMES).foot).toBe(
      "2 agents have no model of their own and use Shore's. Lathe is away. You can see this, not change it.",
    );
  });
});

describe("the Same as switch's line", () => {
  it("says what the default runs on, and its effort when it has one", () => {
    expect(defaultWords(view())).toBe("Heron 2 · Steady effort");
    const plain = view({ default: { label: "Lathe's default", model: "heron-2-mini" } });
    expect(defaultWords(plain)).toBe("Heron 2 Mini");
    expect(defaultWords(view({ default: undefined }))).toBeUndefined();
  });
});

describe("ruling 6: the level a new model takes", () => {
  it("keeps the level when the new model has it", () => {
    expect(levelAfter(heron, "deep", kestrel)).toBe("deep");
    expect(levelAfter(kestrel, "light", heron)).toBe("light");
  });

  it("takes the new model's own default when it hasn't", () => {
    const withDefault = { ...kestrel, effort_default: "deep" };
    expect(levelAfter(heron, "steady", withDefault)).toBe("deep");
  });

  it("else the nearest lower level the new model has", () => {
    expect(levelAfter(heron, "steady", kestrel)).toBe("light");
    const fine: ModelChoice = {
      id: "f",
      label: "F",
      efforts: [...levels, { id: "max", label: "Max" }],
    };
    const coarse: ModelChoice = { id: "c", label: "C", efforts: [LIGHT, STEADY] };
    expect(levelAfter(fine, "max", coarse)).toBe("steady");
  });

  it("else its lowest, and none for a model without levels", () => {
    const unrelated: ModelChoice = { id: "u", label: "U", efforts: [{ id: "x", label: "X" }] };
    expect(levelAfter(heron, "light", unrelated)).toBe("x");
    expect(levelAfter(mini, undefined, kestrel)).toBe("light");
    expect(levelAfter(heron, "deep", mini)).toBeUndefined();
  });
});

describe("the sheet", () => {
  it("opens on Same for an agent that follows, and on its own picks otherwise", () => {
    expect(openModelSheet(view())).toMatchObject({
      same: true,
      model: "heron-2",
      effort: "steady",
    });
    expect(openModelSheet(view({ own: true, effort: "deep" }))).toMatchObject({
      same: false,
      effort: "deep",
    });
    expect(openModelSheet(view({ default: undefined })).same).toBe(false);
  });

  it("starts a level from the model's default when the harness sent none", () => {
    expect(openModelSheet(view({ effort: undefined })).effort).toBe("steady");
  });

  it("picks nothing while Same is on, and shows the default's", () => {
    const sheet = openModelSheet(view({ default: { label: "Same as J", model: "kestrel-1" } }));
    expect(pickModel(sheet, "heron-2-mini")).toBe(sheet);
    expect(pickLevel(sheet, "deep")).toBe(sheet);
    expect(shownPick(sheet)).toMatchObject({ model: "kestrel-1", effort: undefined, level: -1 });
  });

  it("switching Same off gives the agent its own, from what it runs on now", () => {
    const sheet = sameAs(openModelSheet(view()), false);
    expect(shownPick(sheet)).toMatchObject({ model: "heron-2", effort: "steady", level: 1 });
    expect(sheetChanged(sheet)).toBe(true);
    expect(modelAsk(sheet)).toEqual({ model: "heron-2", effort: "steady" });
  });

  it("switching Same on drops both", () => {
    const sheet = sameAs(openModelSheet(view({ own: true, effort: "deep" })), true);
    expect(sheetChanged(sheet)).toBe(true);
    expect(modelAsk(sheet)).toEqual({ model: null, effort: null });
  });

  it("has no Same switch without a default", () => {
    const sheet = openModelSheet(view({ own: true, default: undefined }));
    expect(sameAs(sheet, true)).toBe(sheet);
  });

  it("moves the level by ruling 6 when the model changes, and keeps the picks across Same", () => {
    let sheet = sameAs(openModelSheet(view()), false);
    sheet = pickModel(sheet, "kestrel-1");
    expect(sheet).toMatchObject({ model: "kestrel-1", effort: "light" });
    sheet = pickLevel(sheet, "deep");
    sheet = pickModel(sheet, "heron-2");
    expect(sheet.effort).toBe("deep");
    sheet = pickModel(sheet, "heron-2-mini");
    expect(sheet.effort).toBeUndefined();
    expect(modelAsk(sheet)).toEqual({ model: "heron-2-mini", effort: null });
    sheet = sameAs(sameAs(sheet, true), false);
    expect(sheet.model).toBe("heron-2-mini");
  });

  it("refuses a level the picked model hasn't", () => {
    const sheet = sameAs(openModelSheet(view()), false);
    expect(pickLevel(pickModel(sheet, "kestrel-1"), "steady").effort).toBe("light");
  });

  it("lights Save only for a whole change the harness can take", () => {
    const own = openModelSheet(view({ own: true, effort: "deep" }));
    expect(sheetChanged(own)).toBe(false);
    expect(canSave(own)).toBe(false);
    expect(canSave(pickLevel(own, "light"))).toBe(true);
    expect(canSave(pickLevel(pickLevel(own, "light"), "deep"))).toBe(false);
    expect(canSave(openModelSheet(view()))).toBe(false);
    const away = openModelSheet(view({ own: true, effort: "deep", away: true }));
    expect(canSave(pickLevel(away, "light"))).toBe(false);
    const readOnly = openModelSheet(view({ own: true, effort: "deep", editable: false }));
    expect(canSave(pickLevel(readOnly, "light"))).toBe(false);
  });
});

describe("the words under Save", () => {
  it("are Chips' few, and the harness's for a refusal", () => {
    expect(modelWords("saving", "Lathe")).toBe("Saving to Lathe");
    expect(modelWords("saved", "Lathe")).toBe("Saved");
    expect(modelWords("missed", "Lathe")).toBe("Lathe hasn't answered. It may still change it.");
    expect(modelWords("away", "Lathe")).toBe("Lathe is away");
    expect(modelWords("failed", "Lathe", "Lathe can't run that now.")).toBe(
      "Lathe can't run that now.",
    );
    expect(modelWords("failed", "Lathe")).toBe("Lathe couldn't change it.");
  });
});

describe("saving a change", () => {
  const asked: ModelChangeView = {
    change_id: CHANGE,
    state: "waiting",
    model: "heron-2",
    effort: "deep",
    asked_at: "2026-10-08T23:10:00.000Z",
  };
  const settled = (state: ModelChangeView["state"], message?: string) =>
    view({ change: { ...asked, state, ...(message === undefined ? {} : { message }) } });

  function store(
    reads: AgentModelView[],
    change: () => Promise<ModelChangeView> = async () => asked,
  ) {
    const seen: unknown[] = [];
    return {
      seen,
      store: {
        changeAgentModel: async (agentId: string, ask: unknown) => {
          seen.push([agentId, ask]);
          return await change();
        },
        readAgentModel: async () => reads.shift() ?? settled("waiting"),
      },
    };
  }
  const options = { alive: () => true, sleep: async () => {} };

  it("waits for the harness's answer", async () => {
    const fake = store([settled("waiting"), settled("saved")]);
    const done = await saveModelChange(
      fake.store,
      AGENT,
      { model: "heron-2", effort: "deep" },
      options,
    );
    expect(done.state).toBe("saved");
    expect(done.view?.change?.state).toBe("saved");
    expect(fake.seen).toEqual([[AGENT, { model: "heron-2", effort: "deep" }]]);
  });

  it("carries the harness's words for a refusal", async () => {
    const fake = store([settled("failed", "Lathe can't run that now.")]);
    const done = await saveModelChange(fake.store, AGENT, { model: null, effort: null }, options);
    expect(done).toMatchObject({ state: "failed", message: "Lathe can't run that now." });
  });

  it("settles on missed when the server says so, or when its minute runs out", async () => {
    const missed = await saveModelChange(store([settled("missed")]).store, AGENT, asked, options);
    expect(missed.state).toBe("missed");
    const silent = await saveModelChange(store([]).store, AGENT, asked, {
      ...options,
      everyMs: 20_000,
    });
    expect(silent.state).toBe("missed");
  });

  it("is away when nothing of the harness hears it, and failed for another refusal", async () => {
    const refuse = (refusal: string) => async () => {
      throw new ServerRefused("Lathe is away, so Chips can't change it now.", 422, {
        error: { code: "invalid_event", refusal },
      });
    };
    const away = await saveModelChange(
      store([], refuse("harness_away")).store,
      AGENT,
      asked,
      options,
    );
    expect(away.state).toBe("away");
    const waiting = await saveModelChange(
      store([], refuse("change_waiting")).store,
      AGENT,
      asked,
      options,
    );
    expect(waiting).toMatchObject({ state: "failed", message: expect.stringContaining("away") });
  });

  it("stops asking once the sheet is gone", async () => {
    let reads = 0;
    const done = await saveModelChange(
      {
        changeAgentModel: async () => asked,
        readAgentModel: async () => {
          reads += 1;
          return settled("waiting");
        },
      },
      AGENT,
      asked,
      { alive: () => false, sleep: async () => {} },
    );
    expect(done.state).toBe("missed");
    expect(reads).toBe(0);
  });
});

describe("the bars' light", () => {
  it("sweeps up along the bars that light, from the lowest", () => {
    expect(sweepOf(5, 1, 4)).toEqual([
      { at: 2, on: 1, delay: 0 },
      { at: 3, on: 1, delay: 50 },
      { at: 4, on: 1, delay: 100 },
    ]);
  });

  it("sweeps down along the bars that go out, from the highest", () => {
    expect(sweepOf(5, 3, 0)).toEqual([
      { at: 1, on: 0, delay: 100 },
      { at: 2, on: 0, delay: 50 },
      { at: 3, on: 0, delay: 0 },
    ]);
  });

  it("sweeps up from none lit, the lowest first", () => {
    expect(sweepOf(3, -1, 1)).toEqual([
      { at: 0, on: 1, delay: 0 },
      { at: 1, on: 1, delay: 50 },
    ]);
  });
});
