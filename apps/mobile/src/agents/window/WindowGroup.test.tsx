/**
 * An agent's Context window group (ADR 0146, layout B): how full, the limit as a marker let go to
 * save it, a switch where the harness lets it be turned off, Compact now asking first in a sheet
 * and the fill draining when it is done, quiet while the harness is away, and nothing for anyone
 * but the people who run its harness, or for a harness that sends no copy.
 */

import { ServerRefused, type Snapshot, type Store } from "@chipschat/core";
import type { AgentContextWindowView, WindowLimitAsk } from "@chipschat/protocol";
import { act, fireEvent, render as renderBare, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { forget } from "../../context/memory";
import { agentsSnapshot, ME } from "../../testing/agents";
import { fakeStore } from "../../testing/fixtures";
import { light } from "../../ui/tokens";
import type { GaugeBarsProps } from "./GaugeBars";
import { useWindowGroup } from "./WindowGroup";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const CHOICES = [50, 60, 70, 80, 90];

/** The workspace with both harnesses declaring context windows; without, neither sends one. */
function snapshot(declares = true): Snapshot {
  const base = agentsSnapshot();
  const takes = (id: string) => ({
    ...base.directory[id],
    capabilities: declares ? ["agents", "context_windows"] : ["agents"],
  });
  return {
    ...base,
    directory: {
      ...base.directory,
      hrn_jacobian: takes("hrn_jacobian"),
      hrn_openclaw: takes("hrn_openclaw"),
    },
  } as Snapshot;
}

function viewOf(over: Partial<AgentContextWindowView> = {}): AgentContextWindowView {
  return {
    agent_id: "agt_j",
    harness_id: "hrn_jacobian",
    used: 172_000,
    window: 272_000,
    model: "gpt-6.1-sol",
    as_of: "2026-10-09T09:00:00.000Z",
    compacts: true,
    limit: { at: 80, choices: CHOICES, default: 80, may_turn_off: false },
    editable: true,
    read_at: "2026-10-09T09:00:00.000Z",
    away: false,
    ...over,
  };
}

const ASKED = { change_id: "chg_01K4ZQPX0000000000000000C1", asked_at: "2026-10-09T09:01:00.000Z" };

/** A store whose harness answers a limit at once, and a Compact now in two reads: taken, then done. */
function storeWith(first: AgentContextWindowView, opts: { refuse?: Error } = {}) {
  const store = fakeStore(snapshot());
  let now = first;
  let reads = 0;
  const asked: WindowLimitAsk[] = [];
  const compacted: string[] = [];
  return Object.assign(store, {
    asked,
    compacted,
    readAgentContextWindow: async () => {
      reads += 1;
      if (now.compaction?.state === "taken" && reads >= 2) {
        now = {
          ...now,
          used: 24_000,
          compacting: undefined,
          last: { at: "2026-10-09T09:01:30.000Z", from: 172_000, to: 24_000, by: "asked" },
          compaction: { ...ASKED, state: "done", done_at: "2026-10-09T09:01:30.000Z" },
        };
      }
      return now;
    },
    changeAgentContextWindow: async (_agentId: string, ask: WindowLimitAsk) => {
      if (opts.refuse) throw opts.refuse;
      asked.push(ask);
      now = {
        ...now,
        limit: now.limit === undefined ? undefined : { ...now.limit, at: ask.at },
        change: { ...ASKED, state: "saved", at: ask.at, answered_at: "2026-10-09T09:01:01.000Z" },
      };
      return { ...ASKED, state: "waiting" as const, at: ask.at };
    },
    compactAgent: async (agentId: string) => {
      if (opts.refuse) throw opts.refuse;
      compacted.push(agentId);
      reads = 0;
      now = { ...now, compacting: "running", compaction: { ...ASKED, state: "taken" } };
      return { ...ASKED, state: "waiting" as const };
    },
  });
}

function Card(props: {
  readonly store: Store;
  readonly snap: Snapshot;
  readonly agentId: string;
  readonly working: boolean;
}) {
  const card = useWindowGroup({
    store: props.store,
    snapshot: props.snap,
    agentId: props.agentId,
    selfId: ME,
    focus: 0,
    working: props.working,
  });
  return (
    <>
      {card.group}
      {card.overlays}
    </>
  );
}

async function show(
  store: Store,
  options: { snap?: Snapshot; agentId?: string; working?: boolean } = {},
) {
  await render(
    <Card
      store={store}
      snap={options.snap ?? snapshot()}
      agentId={options.agentId ?? "agt_j"}
      working={options.working ?? false}
    />,
  );
  await settle(0);
}

/** Lets the saves' and the compaction's reads run. */
async function settle(ms = 1000) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/** What the bars were drawn with: the stand-in carries `GaugeBars`' props (`jest.setup.js`). */
const bars = () => screen.getByTestId("window-bars").props as GaugeBarsProps;
/** Whether Compact now takes a press. */
const pillOff = () =>
  (screen.getByTestId("window-compact").props["accessibilityState"] as { disabled: boolean })
    .disabled;

beforeEach(() => {
  forget();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe("the Context window group", () => {
  it("says how full, of what, and where it compacts itself", async () => {
    await show(storeWith(viewOf()));
    // Just read: the fill climbs to it, and the number counts up from none with it.
    expect(bars().climb).toBe(true);
    expect(screen.getByTestId("window-percent")).toHaveTextContent("0%");
    await settle(1200);
    expect(screen.getByTestId("window-percent")).toHaveTextContent("63%");
    expect(screen.getByTestId("window-tokens")).toHaveTextContent("172k of 272k tokens");
    expect(screen.getByTestId("window-marker")).toHaveTextContent("80%");
    expect(screen.getByTestId("window-lit")).toHaveTextContent("25 lit");
    expect(screen.getByTestId("window-auto")).toHaveTextContent(
      /At 80%\. Drag the marker to change it\./,
    );
    // Jacobian's limit can't be turned off: no switch.
    expect(screen.queryByTestId("window-switch")).toBeNull();
    expect(screen.getByTestId("window-note")).toHaveTextContent("It hasn't compacted yet.");
    expect(screen.getByTestId("window-foot")).toHaveTextContent(
      /Compacting sums up J's conversation so far/,
    );
  });

  it("draws its last long turn past the fill, in that turn's tone, and says so", async () => {
    const turn = { at: "2026-10-09T09:16:00.000Z", peak: 218_000, folds: 1 };
    await show(storeWith(viewOf({ used: 11_600, long_turn: turn })));
    expect(screen.getByTestId("window-lit")).toHaveTextContent("2 lit");
    expect(screen.getByTestId("window-end")).toHaveTextContent("272k");
    expect(screen.getByTestId("window-ghost")).toHaveTextContent("Last long turn 80%, 32 bars");
    // 80% is amber's, whatever the fill's tone.
    expect(bars().ghost).toMatchObject({ ink: light.amber, wordsInk: light.amberInk });
    expect(screen.getByTestId("window-note")).toHaveTextContent(
      /Its last long turn reached 218k and compacted itself once/,
    );
    expect(screen.getByLabelText(/Its last long turn reached 80%/)).toBeOnTheScreen();
  });

  it("draws no last long turn that doesn't reach past the fill", async () => {
    const turn = { at: "2026-10-09T08:00:00.000Z", peak: 150_000, folds: 0 };
    await show(storeWith(viewOf({ long_turn: turn })));
    expect(bars().ghost).toBeUndefined();
    expect(screen.queryByTestId("window-ghost")).toBeNull();
  });

  it("saves a limit when the marker is let go at it", async () => {
    const store = storeWith(viewOf());
    await show(store);
    await act(async () => bars().onPick(60));
    expect(screen.getByTestId("window-auto")).toHaveTextContent(/Saving to Jacobian/);
    await settle();
    expect(store.asked).toEqual([{ at: 60 }]);
    expect(screen.getByTestId("window-marker")).toHaveTextContent("60%");
    expect(screen.getByTestId("window-auto")).toHaveTextContent(/At 60%/);
  });

  it("does nothing when the marker is let go where it was", async () => {
    const store = storeWith(viewOf());
    await show(store);
    await act(async () => bars().onPick(80));
    await settle();
    expect(store.asked).toEqual([]);
  });

  it("turns OpenClaw's limit off from its switch, to only when asked", async () => {
    const view = viewOf({
      agent_id: "agt_main",
      harness_id: "hrn_openclaw",
      limit: { at: 80, choices: CHOICES, default: null, may_turn_off: true },
    });
    const store = storeWith(view);
    await show(store, { agentId: "agt_main" });
    await fireEvent(screen.getByTestId("window-switch"), "valueChange", false);
    await settle();
    expect(store.asked).toEqual([{ at: null }]);
    expect(screen.getByTestId("window-auto")).toHaveTextContent(
      /Only when you ask, or when it is full\./,
    );
    expect(screen.getByTestId("window-marker")).toHaveTextContent("no marker");
  });

  it("asks first, then compacts, and the fill drains when it is done", async () => {
    const store = storeWith(viewOf());
    await show(store);
    await fireEvent.press(screen.getByTestId("window-compact"));
    expect(screen.getByText("Compact J's context?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("confirm-go"));
    expect(store.compacted).toEqual(["agt_j"]);
    expect(screen.getByTestId("window-compact")).toHaveTextContent("Compacting");
    await settle(2100);
    expect(screen.getByTestId("window-note")).toHaveTextContent(
      "J is summing up its conversation.",
    );
    await settle(2100);
    expect(screen.getByTestId("window-percent")).toHaveTextContent("9%");
    expect(screen.getByTestId("window-note")).toHaveTextContent(
      /Compacted when asked .* 172k to 24k\./,
    );
    expect(screen.getByTestId("window-compact")).toHaveTextContent("Compact now");
  });

  it("says, in the sheet, that a working agent compacts when its turn ends", async () => {
    await show(storeWith(viewOf()), { working: true });
    await fireEvent.press(screen.getByTestId("window-compact"));
    expect(screen.getByText("J is working, so it compacts when this turn ends.")).toBeTruthy();
  });

  it("says the harness is away when a Compact now can't reach it", async () => {
    const away = new ServerRefused("away", 422, { error: { refusal: "harness_away" } });
    await show(storeWith(viewOf(), { refuse: away }));
    await fireEvent.press(screen.getByTestId("window-compact"));
    await fireEvent.press(screen.getByTestId("confirm-go"));
    await settle(0);
    expect(screen.getByTestId("window-note")).toHaveTextContent("Jacobian is away");
  });

  it("is quiet while the harness is away: a tap on the limit says why", async () => {
    await show(storeWith(viewOf({ away: true })));
    expect(bars().quiet).toBe(true);
    expect(bars().drags).toBe(false);
    expect(pillOff()).toBe(true);
    await act(async () => bars().onQuiet());
    expect(screen.getByTestId("model-hint")).toHaveTextContent("Jacobian is away");
    expect(screen.getByTestId("window-foot")).toHaveTextContent(
      /Jacobian is away, so nothing can be asked of it now\./,
    );
  });

  it("can't compact with nothing to compact, and says why", async () => {
    await show(storeWith(viewOf({ used: 0, compacts: false, why_not: "Nothing to compact yet." })));
    expect(pillOff()).toBe(true);
    expect(screen.getByTestId("window-foot")).toHaveTextContent(/Nothing to compact yet\./);
  });

  it("says so, for a harness that shares no windows", async () => {
    await show(storeWith(viewOf()), { snap: snapshot(false) });
    expect(screen.queryByTestId("window-group")).toBeNull();
    expect(screen.getByTestId("window-not-shared")).toHaveTextContent(
      /^Context window.*Jacobian doesn't share how full .*'s context is\.$/,
    );
  });
});

describe("the Context window on its way (ADR 0238)", () => {
  const never = () =>
    Object.assign(fakeStore(snapshot()), {
      readAgentContextWindow: () => new Promise<AgentContextWindowView>(() => undefined),
    });

  it("stands blank in its place, with its harness named, until the first copy comes", async () => {
    await show(never());
    expect(screen.queryByTestId("window-group")).toBeNull();
    expect(screen.getByTestId("window-waiting")).toBeTruthy();
    expect(screen.getByTestId("window-waiting-from")).toHaveTextContent("Jacobian");
  });

  it("says the harness hasn't said yet when it holds no copy of the agent", async () => {
    const none = Object.assign(fakeStore(snapshot()), {
      readAgentContextWindow: async () => {
        throw Object.assign(new Error("answered 404"), { status: 404 });
      },
    });
    await show(none);
    expect(screen.queryByTestId("window-waiting")).toBeNull();
    expect(screen.getByTestId("window-not-yet")).toHaveTextContent(
      /Jacobian hasn't said how full .*'s context is yet\./,
    );
  });

  it("goes when the read gets no answer, rather than wait for ever", async () => {
    const lost = Object.assign(fakeStore(snapshot()), {
      readAgentContextWindow: async () => {
        throw new Error("offline");
      },
    });
    await show(lost);
    expect(screen.queryByTestId("window-waiting")).toBeNull();
    expect(screen.queryByTestId("window-not-yet")).toBeNull();
  });

  it("draws the copy kept from before at once, opened again, with no climb", async () => {
    await show(storeWith(viewOf()));
    await settle(1200);
    screen.unmount();
    await show(never());
    expect(screen.queryByTestId("window-waiting")).toBeNull();
    expect(screen.getByTestId("window-percent")).toHaveTextContent("63%");
    expect(bars().climb).toBe(false);
  });
});
