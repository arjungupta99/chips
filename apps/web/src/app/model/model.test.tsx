/**
 * An agent's Model group and its dialog on the desktop (ADR 0141, Phase 5): the row in each state
 * (follows, its own, away, read only, followed by others), the dialog (Same on and off, a pick
 * keeps or moves the level, Save off until something changed, saving, saved, refused), Enter and
 * the ×, and the group only for who runs its harness. Driven through the Agents tab, so the store
 * reaches the card as it does in the app. Lathe is a harness that sends its agents' models; Shore
 * is its agent, on Heron 2 at Steady, the same as Lathe's default.
 */

import { type AgentStay, buildModel, type ClientEvent, type Directory } from "@chipschat/core";
import type { AgentModelView, ModelChangeAsk, ModelChoice } from "@chipschat/protocol";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentsService } from "../Agents.tsx";
import { forget } from "../context/memory.ts";
import type { FileService } from "../files.ts";
import { Harnesses } from "../Harnesses.tsx";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const SHORE = "agt_01K4ZQPX000000000000SHORE";
/** Long enough for a save's first read, 800 ms after the change is sent, and Saved's beat. */
const SAVED = { timeout: 3000 };

const LIGHT = { id: "light", label: "Light" };
const STEADY = { id: "steady", label: "Steady" };
const DEEP = { id: "deep", label: "Deep" };
const heron: ModelChoice = {
  id: "heron-2",
  label: "Heron 2",
  efforts: [LIGHT, STEADY, DEEP],
  effort_default: "steady",
};
const mini: ModelChoice = { id: "heron-2-mini", label: "Heron 2 Mini", efforts: [] };
/** Light and Deep, and no default of its own. */
const kestrel: ModelChoice = { id: "kestrel-1", label: "Kestrel 1", efforts: [LIGHT, DEEP] };

const joined = (id: string, role: string, seq: number): ClientEvent =>
  ({
    seq,
    type: "person.joined",
    id: `evt_${seq}`,
    ts: "2026-10-09T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id === ARJUN ? "Arjun" : "Dana",
    role,
  }) as unknown as ClientEvent;
const model = buildModel([joined(ARJUN, "owner", 1), joined(DANA, "member", 2)]);

function directory(capabilities: readonly string[] = ["agents", "models"]): Directory {
  return {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
    [LATHE]: { id: LATHE, kind: "harness", displayName: "Lathe", ownerId: ARJUN, capabilities },
    [SHORE]: { id: SHORE, kind: "agent", harnessId: LATHE, displayName: "Shore" },
  } as Directory;
}

function viewOf(over: Partial<AgentModelView> = {}): AgentModelView {
  return {
    agent_id: SHORE,
    harness_id: LATHE,
    model: "heron-2",
    effort: "steady",
    own: false,
    default: { label: "Lathe's default", model: "heron-2", effort: "steady" },
    choices: [heron, mini, kestrel],
    editable: true,
    read_at: "2026-10-09T09:00:00.000Z",
    away: false,
    ...over,
  };
}

/** A store whose harness answers each change at once: made, or refused in its words. */
function reads(first: AgentModelView, refuse?: string) {
  let now = first;
  const asked: ModelChangeAsk[] = [];
  const store = {
    asked,
    readings: 0,
    readAgentModel: async () => {
      store.readings += 1;
      return now;
    },
    changeAgentModel: async (_agentId: string, ask: ModelChangeAsk) => {
      asked.push(ask);
      const change = {
        change_id: `chg_${asked.length}`,
        model: ask.model,
        effort: ask.effort,
        asked_at: "2026-10-09T09:01:00.000Z",
      };
      const made =
        ask.model === null
          ? { model: now.default?.model ?? now.model, effort: now.default?.effort, own: false }
          : { model: ask.model, effort: ask.effort ?? undefined, own: true };
      now = (
        refuse === undefined
          ? { ...now, ...made, change: { ...change, state: "saved" } }
          : { ...now, change: { ...change, state: "failed", message: refuse } }
      ) as AgentModelView;
      return { ...change, state: "waiting" as const };
    },
  };
  return store;
}

const agents: AgentsService = {
  stays: async () => [] as readonly AgentStay[],
  move: vi.fn(),
  fork: vi.fn(),
  forkRoom: vi.fn(),
  put: vi.fn(),
  newRoom: vi.fn(),
  refresh: async () => undefined,
  rename: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
  lock: vi.fn(),
  face: vi.fn(),
};

function page(
  models: ReturnType<typeof reads>,
  options: { selfId?: string; capabilities?: readonly string[] } = {},
) {
  return render(
    <Harnesses
      model={model}
      directory={directory(options.capabilities)}
      serverUrl="http://127.0.0.1:4431"
      onOpen={vi.fn()}
      onAdd={vi.fn()}
      selfId={options.selfId ?? ARJUN}
      agents={agents}
      files={{} as FileService}
      models={models}
      initialAgent={SHORE}
    />,
  );
}

const row = () => screen.getByTestId("model-row");
const sub = () => screen.getByTestId("model-row-sub").textContent;
const dialog = () => screen.getByTestId("model-dialog");
const save = () => screen.getByTestId("model-save");
const radio = (name: string) => screen.getByRole("radio", { name }) as HTMLInputElement;
const same = () => screen.getByRole("switch", { name: "Lathe's default" }) as HTMLInputElement;
/** Which of a set of bars are lit, as 1s and 0s, lowest first. */
const lit = (bars: HTMLElement) =>
  [...bars.querySelectorAll(".model-light")]
    .map((light) => (light.getAttribute("data-lit") === "true" ? 1 : 0))
    .join("");

async function opened() {
  fireEvent.click(await screen.findByTestId("model-row"));
  return dialog();
}

beforeEach(() => {
  act(() => forget());
});

describe("the Model group on an agent's card", () => {
  it("says the model, its effort and whose, with the bars lit to its level", async () => {
    page(reads(viewOf()));
    await screen.findByTestId("model-group");
    expect(within(row()).getByText("Heron 2")).toBeTruthy();
    expect(sub()).toBe("Steady effort · Lathe's default");
    expect(lit(screen.getByTestId("model-row-bars"))).toBe("110");
    expect(screen.getByTestId("model-read-from").textContent).toBe("Lathe");
    expect(row().textContent).toContain("›");
    expect(screen.queryByTestId("model-foot")).toBeNull();
  });

  it("says its own, and how many agents follow it", async () => {
    page(reads(viewOf({ model: "kestrel-1", effort: "deep", own: true, followed_by: 3 })));
    await screen.findByTestId("model-group");
    expect(sub()).toBe("Deep effort · its own");
    expect(lit(screen.getByTestId("model-row-bars"))).toBe("11");
    expect(screen.getByTestId("model-foot").textContent).toBe(
      "3 agents have no model of their own and use Shore's.",
    );
  });

  it("is quiet while its harness is away: a press says so, reads again, and opens nothing", async () => {
    const store = reads(viewOf({ away: true }));
    page(store);
    await screen.findByTestId("model-group");
    expect(row().getAttribute("data-quiet")).toBe("true");
    expect(row().textContent).not.toContain("›");
    expect(screen.getByTestId("model-foot").textContent).toBe(
      "Lathe is away. You can see this, not change it.",
    );
    const before = store.readings;
    fireEvent.click(row());
    expect(screen.getByTestId("model-hint").textContent).toBe("Lathe is away");
    expect(screen.queryByTestId("model-dialog")).toBeNull();
    await waitFor(() => expect(store.readings).toBe(before + 1));
  });

  it("is quiet when its harness keeps it, in the harness's words", async () => {
    const why = "Lathe's own agent. Change it in Lathe.";
    page(reads(viewOf({ editable: false, why_read_only: why })));
    await screen.findByTestId("model-group");
    fireEvent.click(row());
    expect(screen.getByTestId("model-hint").textContent).toBe(why);
    expect(screen.queryByTestId("model-dialog")).toBeNull();
  });

  it("is not there for a harness that sends no models, or for a member who doesn't run it", async () => {
    const store = reads(viewOf());
    const first = page(store, { capabilities: ["agents"] });
    await screen.findByTestId("agent-card");
    expect(screen.queryByTestId("model-group")).toBeNull();
    first.unmount();
    page(store, { selfId: DANA });
    await screen.findByTestId("agent-card");
    expect(screen.queryByTestId("model-group")).toBeNull();
    expect(screen.queryByTestId("model-not-shared")).toBeNull();
    expect(store.readings).toBe(0);
  });

  it("says so on the card of an agent whose harness sends no models (ADR 0238)", async () => {
    page(reads(viewOf()), { capabilities: ["agents"] });
    expect((await screen.findByTestId("model-not-shared-words")).textContent).toMatch(
      /^Lathe doesn't share .*'s model with Chips\.$/,
    );
  });
});

describe("the model dialog", () => {
  it("opens on Same, the default's picks dimmed, and Save with nothing to send", async () => {
    page(reads(viewOf()));
    const open = await opened();
    expect(within(open).getByRole("heading", { name: "Shore's model" })).toBeTruthy();
    expect(same().checked).toBe(true);
    expect(screen.getByTestId("model-same").textContent).toContain("Heron 2 · Steady effort");
    expect(radio("Heron 2").checked).toBe(true);
    expect(radio("Heron 2").disabled).toBe(true);
    expect(radio("Steady").checked).toBe(true);
    expect(screen.getByTestId("model-level-name").textContent).toBe("Steady");
    expect(save().getAttribute("aria-disabled")).toBe("true");
    // The bars sweep up from nothing as it opens.
    await waitFor(() => expect(lit(screen.getByTestId("model-levels"))).toBe("110"));
  });

  it("gives the agent its own with Same off, keeping or moving the level as the model allows", async () => {
    page(reads(viewOf()));
    await opened();
    fireEvent.click(same());
    expect(same().checked).toBe(false);
    expect(radio("Kestrel 1").disabled).toBe(false);
    expect(save().getAttribute("aria-disabled")).toBe("false");
    // Steady isn't Kestrel's, and Kestrel has no default: the nearest lower it has.
    fireEvent.click(radio("Kestrel 1"));
    expect(screen.getByTestId("model-level-name").textContent).toBe("Light");
    expect(screen.getAllByTestId("model-check")).toHaveLength(1);
    fireEvent.click(radio("Deep"));
    expect(screen.getByTestId("model-level-name").textContent).toBe("Deep");
    // A model with no levels has no bars.
    fireEvent.click(radio("Heron 2 Mini"));
    expect(screen.queryByTestId("model-levels")).toBeNull();
  });

  it("saves both, says so while the harness has it, and goes with the row saying what it runs on", async () => {
    const store = reads(viewOf());
    page(store);
    await opened();
    fireEvent.click(same());
    fireEvent.click(radio("Kestrel 1"));
    fireEvent.click(radio("Deep"));
    fireEvent.click(save());
    expect(screen.getByTestId("model-save-words").textContent).toBe("Saving to Lathe");
    expect(radio("Heron 2").disabled).toBe(true);
    await waitFor(
      () => expect(screen.getByTestId("model-save-words").textContent).toBe("Saved"),
      SAVED,
    );
    expect(store.asked).toEqual([{ model: "kestrel-1", effort: "deep" }]);
    await waitFor(() => expect(screen.queryByTestId("model-dialog")).toBeNull(), SAVED);
    expect(sub()).toBe("Deep effort · its own");
    expect(screen.getByTestId("context-flash")).toBeTruthy();
    // The row takes the keyboard in an effect, a task after the dialog has gone from the page.
    await waitFor(() => expect(document.activeElement).toBe(row()));
  });

  it("saves on Enter, and drops both for the default with Same on", async () => {
    const store = reads(viewOf({ model: "kestrel-1", effort: "light", own: true }));
    page(store);
    const open = await opened();
    expect(same().checked).toBe(false);
    fireEvent.click(same());
    fireEvent.keyDown(open.querySelector("form") as HTMLFormElement, { key: "Enter" });
    await waitFor(() => expect(store.asked).toEqual([{ model: null, effort: null }]));
  });

  it("keeps the dialog and the picks on a refusal, with the harness's words under Save", async () => {
    page(reads(viewOf(), "Kestrel 1 isn't on this plan."));
    await opened();
    fireEvent.click(same());
    fireEvent.click(radio("Kestrel 1"));
    fireEvent.click(save());
    await waitFor(
      () =>
        expect(screen.getByTestId("model-save-line").textContent).toBe(
          "Kestrel 1 isn't on this plan.",
        ),
      SAVED,
    );
    expect(dialog()).toBeTruthy();
    expect(radio("Kestrel 1").checked).toBe(true);
    expect(save().getAttribute("aria-disabled")).toBe("false");
    // A new pick clears the line: it was about the last picks.
    fireEvent.click(radio("Deep"));
    expect(screen.queryByTestId("model-save-line")).toBeNull();
  });

  it("closes from the ×, reads the copy again, and gives the row the keyboard back", async () => {
    const store = reads(viewOf());
    page(store);
    await opened();
    const before = store.readings;
    fireEvent.click(screen.getByTestId("model-close"));
    await waitFor(() => expect(screen.queryByTestId("model-dialog")).toBeNull());
    expect(store.readings).toBeGreaterThan(before);
    expect(store.asked).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(row()));
  });
});
