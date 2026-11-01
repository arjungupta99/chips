/**
 * An agent's model and effort on the phone (ADR 0141): the Model group on its card, in each state
 * its row can be in, and the sheet that changes both, with what becomes of a save. Lathe is a
 * harness that sends its agents' models and takes changes; Shore is its agent, on Heron 2 at
 * Steady, the same as J.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { AWAY_READ_MS, MODEL_SAVED_MS, ServerRefused } from "@chipschat/core";
import type { AgentModelView, ModelChangeView, ModelChoice } from "@chipschat/protocol";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  within,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { forget } from "../../context/memory";
import { agentsSnapshot, ME } from "../../testing/agents";
import { fakeStore } from "../../testing/fixtures";
import { useModelGroup } from "./ModelGroup";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const DANA = "usr_dana";
const LATHE = "hrn_lathe";
const SHORE = "agt_shore";
const READ = "2026-10-09T17:42:00.000Z";
const CHANGE = "chg_01K4ZQPX00000000000CHANGE";

function snapshot(capabilities: readonly string[] = ["agents", "models"]): Snapshot {
  const base = agentsSnapshot();
  return {
    ...base,
    directory: {
      ...base.directory,
      [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
      [LATHE]: { id: LATHE, kind: "harness", displayName: "Lathe", ownerId: ME, capabilities },
      [SHORE]: { id: SHORE, kind: "agent", harnessId: LATHE, displayName: "Shore", room: null },
    },
    model: {
      ...base.model,
      people: {
        ...base.model.people,
        [DANA]: { participantId: DANA, displayName: "Dana", role: "member" },
      },
    },
  } as unknown as Snapshot;
}

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

function copy(more: Partial<AgentModelView> = {}): AgentModelView {
  return {
    agent_id: SHORE as AgentModelView["agent_id"],
    harness_id: LATHE as AgentModelView["harness_id"],
    model: "heron-2",
    effort: "steady",
    own: false,
    default: { label: "Same as J", model: "heron-2", effort: "steady" },
    choices: [heron, mini, kestrel],
    editable: true,
    read_at: READ,
    away: false,
    ...more,
  };
}

const change = (state: ModelChangeView["state"], more: Partial<ModelChangeView> = {}) =>
  ({
    change_id: CHANGE,
    state,
    model: "kestrel-1",
    effort: "deep",
    asked_at: READ,
    ...more,
  }) as ModelChangeView;

function storeWith(
  first: AgentModelView = copy(),
  options: { snap?: Snapshot; refuse?: Error } = {},
) {
  const asked: { model: string | null; effort: string | null }[] = [];
  let now = first;
  const store = Object.assign(fakeStore(options.snap ?? snapshot()), {
    readAgentModel: jest.fn(async () => now),
    changeAgentModel: jest.fn(
      async (_: string, ask: { model: string | null; effort: string | null }) => {
        asked.push(ask);
        if (options.refuse !== undefined) throw options.refuse;
        return change("waiting", ask);
      },
    ),
  });
  /** What the server says from the next read on. */
  const becomes = (next: AgentModelView) => {
    now = next;
  };
  return { store: store as unknown as Store & typeof store, asked, becomes };
}

function Card({ store, selfId = ME }: { readonly store: Store; readonly selfId?: string }) {
  const model = useModelGroup({
    store,
    snapshot: store.getSnapshot(),
    agentId: SHORE,
    selfId,
    focus: 1,
    sayMissing: true,
  });
  return (
    <>
      {model.group}
      {model.overlays}
    </>
  );
}

/** Lets the timers run as far as `ms`, and everything waiting on them settle. */
async function wait(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function openSheet(store: Store) {
  await render(<Card store={store} />);
  await userEvent.press(await screen.findByTestId("model-row"));
  return screen.getByTestId("model-sheet-panel");
}

/** The row's bars are hidden from a screen reader, since the row says its level. */
const HIDDEN = { includeHiddenElements: true };

const checked = (id: string) =>
  screen.getByTestId(`model-choice-${id}`).props["accessibilityState"]?.checked;

beforeEach(() => {
  forget();
});

describe("the Model group on an agent's card", () => {
  it("says the model, its effort and that it is the same as J's, under its harness's name", async () => {
    const { store } = storeWith();
    await render(<Card store={store} />);
    expect(await screen.findByTestId("model-row")).toHaveTextContent(
      /^Heron 2Steady effort · Same as J/,
    );
    expect(screen.getByTestId("model-read-from")).toHaveTextContent("Lathe");
    expect(screen.getByTestId("model-row-bars", HIDDEN)).toBeOnTheScreen();
    expect(screen.queryByTestId("model-foot")).toBeNull();
  });

  it("says its own, and has no bars for a model without levels", async () => {
    const { store } = storeWith(copy({ own: true, model: "heron-2-mini", effort: undefined }));
    await render(<Card store={store} />);
    expect(await screen.findByTestId("model-row")).toHaveTextContent(/^Heron 2 MiniIts own/);
    expect(screen.queryByTestId("model-row-bars", HIDDEN)).toBeNull();
  });

  it("says how many agents follow it", async () => {
    const { store } = storeWith(copy({ followed_by: 38 }));
    await render(<Card store={store} />);
    expect(await screen.findByTestId("model-foot")).toHaveTextContent(
      "38 agents have no model of their own and use Shore's.",
    );
  });

  it("is quiet while its harness is away: a tap says so and reads again, and no sheet opens", async () => {
    const { store } = storeWith(copy({ away: true }));
    await render(<Card store={store} />);
    expect(await screen.findByTestId("model-foot")).toHaveTextContent(
      "Lathe is away. You can see this, not change it.",
    );
    expect(screen.getByTestId("model-read-from")).toHaveTextContent(/^Lathe · /);
    await userEvent.press(screen.getByTestId("model-row"));
    expect(screen.getByTestId("model-hint")).toHaveTextContent("Lathe is away");
    expect(screen.queryByTestId("model-sheet-panel")).toBeNull();
    expect(store.readAgentModel).toHaveBeenCalledTimes(2);
  });

  it("is quiet when its harness keeps it, in the harness's words", async () => {
    const why = "Lathe's own agent. Change it in Lathe.";
    const { store } = storeWith(copy({ editable: false, why_read_only: why }));
    await render(<Card store={store} />);
    expect(await screen.findByTestId("model-foot")).toHaveTextContent(why);
    await userEvent.press(screen.getByTestId("model-row"));
    expect(screen.getByTestId("model-hint")).toHaveTextContent(why);
    expect(screen.queryByTestId("model-sheet-panel")).toBeNull();
  });

  it("is only for its harness's owner or an admin, while it sends models", async () => {
    const { store } = storeWith();
    await render(<Card store={store} selfId={DANA} />);
    const undeclared = storeWith(copy(), { snap: snapshot(["agents", "context_files"]) }).store;
    await render(<Card store={undeclared} />);
    await act(async () => undefined);
    expect(screen.queryByTestId("model-group")).toBeNull();
    expect(store.readAgentModel).not.toHaveBeenCalled();
    expect(undeclared.readAgentModel).not.toHaveBeenCalled();
    // Its owner is told the harness doesn't share it; the member is told nothing.
    expect(screen.getAllByTestId("model-not-shared")).toHaveLength(1);
    expect(screen.getByTestId("model-not-shared-words")).toHaveTextContent(
      /^Lathe doesn't share .*'s model with Chips\.$/,
    );
  });

  it("stands blank in its place, under its harness's name, until the first copy comes", async () => {
    const { store } = storeWith();
    store.readAgentModel.mockImplementation(() => new Promise<AgentModelView>(() => undefined));
    await render(<Card store={store} />);
    expect(screen.queryByTestId("model-row")).toBeNull();
    expect(screen.getByTestId("model-waiting-from")).toHaveTextContent("Lathe");
  });
});

describe("the model sheet", () => {
  it("opens on Same, showing the default's picks dimmed, with Save off", async () => {
    const { store } = storeWith();
    const sheet = await openSheet(store);
    expect(within(sheet).getByText("Shore's model")).toBeOnTheScreen();
    expect(within(sheet).getByText("Heron 2 · Steady effort")).toBeOnTheScreen();
    expect(screen.getByTestId("model-same").props["value"]).toBe(true);
    expect(checked("heron-2")).toBe(true);
    expect(screen.getByTestId("model-choice-kestrel-1")).toBeDisabled();
    expect(screen.getByTestId("model-level-name")).toHaveTextContent("Steady");
    expect(screen.getByTestId("model-save")).toBeDisabled();
  });

  it("gives the agent its own once Same is off, and Save is on", async () => {
    const { store } = storeWith();
    await openSheet(store);
    await fireEvent(screen.getByTestId("model-same"), "valueChange", false);
    expect(screen.getByTestId("model-choice-kestrel-1")).toBeEnabled();
    expect(screen.getByTestId("model-save")).toBeEnabled();
  });

  it("keeps the level when the new model has it, and moves it when it hasn't", async () => {
    const { store } = storeWith(copy({ own: true, effort: "deep" }));
    await openSheet(store);
    expect(screen.getByTestId("model-same").props["value"]).toBe(false);
    await userEvent.press(screen.getByTestId("model-choice-kestrel-1"));
    expect(checked("kestrel-1")).toBe(true);
    expect(screen.getByTestId("model-level-name")).toHaveTextContent("Deep");
    await userEvent.press(screen.getByTestId("model-choice-heron-2-mini"));
    expect(screen.queryByTestId("model-levels")).toBeNull();
    await userEvent.press(screen.getByTestId("model-choice-heron-2"));
    // Back on a model with levels, from one with none: its own default.
    expect(screen.getByTestId("model-level-name")).toHaveTextContent("Steady");
    await userEvent.press(screen.getByTestId("model-choice-kestrel-1"));
    // Steady isn't Kestrel's, and Kestrel has no default: the nearest lower it has.
    expect(screen.getByTestId("model-level-name")).toHaveTextContent("Light");
  });

  it("has Save off until something changed", async () => {
    const { store } = storeWith(copy({ own: true, effort: "deep" }));
    await openSheet(store);
    expect(screen.getByTestId("model-save")).toBeDisabled();
    await userEvent.press(screen.getByTestId("model-level-light"));
    expect(screen.getByTestId("model-save")).toBeEnabled();
    await userEvent.press(screen.getByTestId("model-level-deep"));
    expect(screen.getByTestId("model-save")).toBeDisabled();
  });

  it("saves both to the harness, says so, then goes and flashes the row", async () => {
    jest.useFakeTimers();
    try {
      const { store, asked, becomes } = storeWith();
      await openSheet(store);
      await fireEvent(screen.getByTestId("model-same"), "valueChange", false);
      await fireEvent.press(screen.getByTestId("model-choice-kestrel-1"));
      await fireEvent.press(screen.getByTestId("model-level-deep"));
      await fireEvent.press(screen.getByTestId("model-save"));
      expect(asked).toEqual([{ model: "kestrel-1", effort: "deep" }]);
      expect(screen.getByTestId("model-save-words")).toHaveTextContent("Saving to Lathe");
      becomes(copy({ own: true, model: "kestrel-1", effort: "deep", change: change("saved") }));
      await wait(800);
      expect(screen.getByTestId("model-save-words")).toHaveTextContent("Saved");
      expect(screen.getByTestId("model-row")).toHaveTextContent(/^Kestrel 1Deep effort · its own/);
      await wait(MODEL_SAVED_MS);
      expect(screen.getByTestId("model-sheet-panel")).toBeOnTheScreen();
      await wait(1000);
      expect(screen.queryByTestId("model-sheet-panel")).toBeNull();
      expect(screen.getByTestId("context-flash")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("sends neither for Same, so the agent takes the default's", async () => {
    jest.useFakeTimers();
    try {
      const { store, asked } = storeWith(copy({ own: true, model: "kestrel-1", effort: "deep" }));
      await openSheet(store);
      await fireEvent(screen.getByTestId("model-same"), "valueChange", true);
      expect(checked("heron-2")).toBe(true);
      await fireEvent.press(screen.getByTestId("model-save"));
      expect(asked).toEqual([{ model: null, effort: null }]);
    } finally {
      jest.useRealTimers();
    }
  });

  it("stays open with the harness's words when it refuses, the picks as they were", async () => {
    jest.useFakeTimers();
    try {
      const { store, becomes } = storeWith(copy({ own: true }));
      await openSheet(store);
      await fireEvent.press(screen.getByTestId("model-choice-kestrel-1"));
      await fireEvent.press(screen.getByTestId("model-save"));
      becomes(copy({ own: true, change: change("failed", { message: "Kestrel is resting." }) }));
      await wait(800);
      expect(screen.getByTestId("model-save-line")).toHaveTextContent("Kestrel is resting.");
      expect(checked("kestrel-1")).toBe(true);
      expect(screen.getByTestId("model-save")).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says the harness hasn't answered when its minute passes, and may still", async () => {
    jest.useFakeTimers();
    try {
      const { store, becomes } = storeWith(copy({ own: true }));
      await openSheet(store);
      await fireEvent.press(screen.getByTestId("model-choice-kestrel-1"));
      await fireEvent.press(screen.getByTestId("model-save"));
      becomes(copy({ own: true, change: change("missed") }));
      await wait(800);
      expect(screen.getByTestId("model-save-line")).toHaveTextContent(
        "Lathe hasn't answered. It may still change it.",
      );
      expect(screen.getByTestId("model-sheet-panel")).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it("says the harness is away at Save, and turns Save on again once it is back", async () => {
    jest.useFakeTimers();
    try {
      const gone = new ServerRefused("away", 422, { error: { refusal: "harness_away" } });
      const { store, becomes } = storeWith(copy({ own: true }), { refuse: gone });
      await openSheet(store);
      await fireEvent.press(screen.getByTestId("model-choice-kestrel-1"));
      becomes(copy({ own: true, away: true }));
      await fireEvent.press(screen.getByTestId("model-save"));
      expect(screen.getByTestId("model-save-line")).toHaveTextContent("Lathe is away");
      expect(screen.getByTestId("model-save")).toBeDisabled();
      becomes(copy({ own: true }));
      await wait(AWAY_READ_MS);
      expect(screen.getByTestId("model-save")).toBeEnabled();
      expect(checked("kestrel-1")).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
