import { describe, expect, it } from "vitest";
import {
  agentModelPut,
  agentModelView,
  EFFORT_LEVELS_MAX,
  MODEL_CHOICES_MAX,
  modelChangeAsk,
  modelChangeFrame,
} from "./agent-models.js";

const levels = [
  { id: "light", label: "Light" },
  { id: "steady", label: "Steady" },
  { id: "deep", label: "Deep" },
];
const heron = { id: "heron-2", label: "Heron 2", efforts: levels, effort_default: "steady" };
const mini = { id: "heron-2-mini", label: "Heron 2 Mini", efforts: [] };

/** A copy as an adapter sends one: an agent that follows its harness's default. */
const copy = (extra: Record<string, unknown> = {}) => ({
  model: "heron-2",
  effort: "steady",
  own: false,
  default: { label: "Same as Lathe", model: "heron-2", effort: "steady" },
  choices: [heron, mini],
  editable: true,
  ...extra,
});

describe("an agent's model, as its harness sends it (ADR 0140)", () => {
  it("takes the copy an adapter sends", () => {
    expect(agentModelPut.safeParse(copy()).success).toBe(true);
    expect(agentModelPut.safeParse(copy({ followed_by: 38 })).success).toBe(true);
    const own = copy({ model: "heron-2-mini", effort: undefined, own: true });
    expect(agentModelPut.safeParse(own).success).toBe(true);
  });

  it("refuses a model not among its choices", () => {
    const put = agentModelPut.safeParse(copy({ model: "kestrel-1" }));
    expect(put.success).toBe(false);
    expect(put.error?.issues[0]?.path).toEqual(["model"]);
  });

  it("refuses an effort that isn't one of its model's levels, and any for a model with none", () => {
    expect(agentModelPut.safeParse(copy({ effort: "frantic" })).success).toBe(false);
    const levelOnMini = copy({ model: "heron-2-mini", effort: "light" });
    expect(agentModelPut.safeParse(levelOnMini).success).toBe(false);
  });

  it("refuses a default that isn't among the choices", () => {
    const stray = copy({ default: { label: "Same as Lathe", model: "kestrel-1" } });
    const put = agentModelPut.safeParse(stray);
    expect(put.success).toBe(false);
    expect(put.error?.issues[0]?.path).toEqual(["default"]);
  });

  it("takes forty models and refuses a forty-first", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, at) => ({ id: `m-${at}`, label: `M ${at}`, efforts: [] }));
    const forty = copy({ model: "m-0", effort: undefined, default: undefined });
    expect(agentModelPut.safeParse({ ...forty, choices: many(MODEL_CHOICES_MAX) }).success).toBe(
      true,
    );
    expect(
      agentModelPut.safeParse({ ...forty, choices: many(MODEL_CHOICES_MAX + 1) }).success,
    ).toBe(false);
  });

  it("takes eight levels and refuses a ninth", () => {
    const steps = (count: number) =>
      Array.from({ length: count }, (_, at) => ({ id: `l${at}`, label: `L${at}` }));
    const at = (count: number) =>
      copy({
        effort: "l0",
        default: undefined,
        choices: [{ id: "heron-2", label: "Heron 2", efforts: steps(count) }],
      });
    expect(agentModelPut.safeParse(at(EFFORT_LEVELS_MAX)).success).toBe(true);
    expect(agentModelPut.safeParse(at(EFFORT_LEVELS_MAX + 1)).success).toBe(false);
  });

  it("refuses a model named twice, a level named twice, and a default level not its own", () => {
    expect(agentModelPut.safeParse(copy({ choices: [heron, heron] })).success).toBe(false);
    const twice = { ...heron, efforts: [...levels, levels[0]] };
    expect(agentModelPut.safeParse(copy({ choices: [twice] })).success).toBe(false);
    const strayDefault = { ...heron, effort_default: "frantic" };
    expect(agentModelPut.safeParse(copy({ choices: [strayDefault] })).success).toBe(false);
  });

  it("refuses no choices at all", () => {
    expect(agentModelPut.safeParse(copy({ choices: [] })).success).toBe(false);
  });

  it("carries an answer, or a refusal with the harness's words", () => {
    const id = "chg_01JB0000000000000000000000";
    expect(agentModelPut.safeParse(copy({ answers: id })).success).toBe(true);
    const refusal = copy({ refuses: { change_id: id, message: "Lathe can't run that now." } });
    expect(agentModelPut.safeParse(refusal).success).toBe(true);
    expect(
      agentModelPut.safeParse(copy({ answers: "edt_01JB0000000000000000000000" })).success,
    ).toBe(false);
  });
});

describe("a person's change", () => {
  it("names both, or neither for the default", () => {
    expect(modelChangeAsk.safeParse({ model: "heron-2", effort: "deep" }).success).toBe(true);
    expect(modelChangeAsk.safeParse({ model: "heron-2-mini", effort: null }).success).toBe(true);
    expect(modelChangeAsk.safeParse({ model: null, effort: null }).success).toBe(true);
    expect(modelChangeAsk.safeParse({ model: "heron-2" }).success).toBe(false);
  });

  it("goes down as a frame naming the agent", () => {
    const frame = {
      frame: "model.change",
      change_id: "chg_01JB0000000000000000000000",
      harness_id: "hrn_01JB0000000000000000000000",
      agent_id: "agt_01JB0000000000000000000000",
      model: null,
      effort: null,
      asked_by: "usr_01JB0000000000000000000000",
      asked_at: "2026-10-08T23:10:00.000Z",
    };
    expect(modelChangeFrame.safeParse(frame).success).toBe(true);
  });
});

describe("what a person reads", () => {
  it("is the copy, with whether the harness is away and the last change asked", () => {
    const view = {
      ...copy(),
      agent_id: "agt_01JB0000000000000000000000",
      harness_id: "hrn_01JB0000000000000000000000",
      read_at: "2026-10-08T23:09:00.000Z",
      away: false,
      change: {
        change_id: "chg_01JB0000000000000000000000",
        state: "missed",
        model: "heron-2",
        effort: "deep",
        asked_at: "2026-10-08T23:10:00.000Z",
      },
    };
    expect(agentModelView.safeParse(view).success).toBe(true);
  });
});
