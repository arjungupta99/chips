/**
 * An agent's Heartbeat group (ADR 0143, the mock's layout A): a switch that saves when flipped, an
 * Every row while it is on that opens the intervals, the foot, and nothing for anyone but the
 * people who run its harness, or for an agent its harness sends no heartbeat for.
 */

import type { Snapshot, Store } from "@chipschat/core";
import type { AgentHeartbeatView, HeartbeatChangeAsk } from "@chipschat/protocol";
import { act, fireEvent, render as renderBare, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { forget } from "../../context/memory";
import { agentsSnapshot, ME } from "../../testing/agents";
import { fakeStore } from "../../testing/fixtures";
import { HeartbeatGroup } from "./HeartbeatGroup";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const AGENT = "agt_main";
const CHOICES = [15, 30, 60, 120, 240, 720, 1440];

/** The workspace with OpenClaw declaring heartbeats; without, it sends none. */
function snapshot(declares = true): Snapshot {
  const base = agentsSnapshot();
  const harness = base.directory["hrn_openclaw"];
  return {
    ...base,
    directory: {
      ...base.directory,
      hrn_openclaw: { ...harness, capabilities: declares ? ["agents", "heartbeats"] : ["agents"] },
    },
  } as Snapshot;
}

function viewOf(over: Partial<AgentHeartbeatView> = {}): AgentHeartbeatView {
  return {
    agent_id: AGENT,
    harness_id: "hrn_openclaw",
    on: false,
    every: 30,
    choices: CHOICES,
    editable: true,
    read_at: "2026-10-09T09:00:00.000Z",
    away: false,
    ...over,
  };
}

/** A store whose harness answers each change at once, with the copy as asked. */
function storeWith(first: AgentHeartbeatView, opts: { refuse?: string } = {}) {
  const store = fakeStore(snapshot());
  let now = first;
  const asked: HeartbeatChangeAsk[] = [];
  return Object.assign(store, {
    asked,
    readAgentHeartbeat: async () => now,
    changeAgentHeartbeat: async (_agentId: string, ask: HeartbeatChangeAsk) => {
      asked.push(ask);
      const every = ask.every ?? now.every;
      const change = {
        change_id: "chg_01K4ZQPX0000000000000000C1",
        asked_at: "2026-10-09T09:01:00.000Z",
        answered_at: "2026-10-09T09:01:01.000Z",
        on: ask.on,
        every,
      };
      now =
        opts.refuse === undefined
          ? { ...now, on: ask.on, every, change: { ...change, state: "saved" } }
          : { ...now, change: { ...change, state: "failed", message: opts.refuse } };
      return { ...change, state: "waiting" as const };
    },
  });
}

async function show(store: Store, snap: Snapshot = snapshot()) {
  await render(
    <HeartbeatGroup
      store={store}
      snapshot={snap}
      agentId={AGENT}
      agentName="OpenClaw"
      selfId={ME}
      focus={0}
    />,
  );
}

/** Lets the save's reads, 800 ms apart, run. */
async function settle() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1000);
  });
}

beforeEach(() => {
  forget();
  jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

describe("the Heartbeat group", () => {
  it("says off, with no Every row, and what off means", async () => {
    await show(storeWith(viewOf()));
    expect(screen.getByTestId("heartbeat-row")).toHaveTextContent(/Off/);
    expect(screen.queryByTestId("heartbeat-every")).toBeNull();
    expect(screen.getByTestId("heartbeat-foot")).toHaveTextContent(
      "Off. OpenClaw only answers when you write to it.",
    );
  });

  it("turns it on from the switch, and shows how often and how many a day", async () => {
    const store = storeWith(viewOf());
    await show(store);
    await fireEvent(screen.getByTestId("heartbeat-switch"), "valueChange", true);
    expect(screen.getByTestId("heartbeat-row")).toHaveTextContent(/Saving to OpenClaw/);
    await settle();
    expect(store.asked).toEqual([{ on: true }]);
    expect(screen.getByTestId("heartbeat-row")).toHaveTextContent(/On/);
    expect(screen.getByTestId("heartbeat-every")).toHaveTextContent(/30 min/);
    expect(screen.getByTestId("heartbeat-foot")).toHaveTextContent(/about 48 a day/);
  });

  it("picks every hour from the sheet, which saves it", async () => {
    const store = storeWith(viewOf({ on: true }));
    await show(store);
    await fireEvent.press(screen.getByTestId("heartbeat-every"));
    await fireEvent.press(screen.getByTestId("heartbeat-every-60"));
    await settle();
    expect(store.asked).toEqual([{ on: true, every: 60 }]);
    expect(screen.getByTestId("heartbeat-every")).toHaveTextContent(/1 hour/);
    expect(screen.getByTestId("heartbeat-foot")).toHaveTextContent(/about 24 a day/);
  });

  it("says why when the harness refuses, and keeps what holds", async () => {
    await show(storeWith(viewOf(), { refuse: "rate limited" }));
    await fireEvent(screen.getByTestId("heartbeat-switch"), "valueChange", true);
    await settle();
    expect(screen.getByTestId("heartbeat-row")).toHaveTextContent(/rate limited/);
    expect(screen.queryByTestId("heartbeat-every")).toBeNull();
  });

  it("is quiet while the harness is away: no switch to flip, and the foot says why", async () => {
    await show(storeWith(viewOf({ on: true, away: true })));
    // Read off the prop: the testing library's `toBeDisabled` does not read a Switch's `disabled`.
    expect(screen.getByTestId("heartbeat-switch").props["disabled"]).toBe(true);
    expect(screen.getByTestId("heartbeat-foot")).toHaveTextContent(/OpenClaw is away/);
  });

  it("says so, for a harness that sends no heartbeat", async () => {
    await show(storeWith(viewOf()), snapshot(false));
    expect(screen.queryByTestId("heartbeat-group")).toBeNull();
    expect(screen.getByTestId("heartbeat-not-shared-words")).toHaveTextContent(
      /^OpenClaw doesn't share a heartbeat for .* with Chips\.$/,
    );
  });
});

describe("the Heartbeat group on its way (ADR 0238)", () => {
  const never = () =>
    Object.assign(fakeStore(snapshot()), {
      readAgentHeartbeat: () => new Promise<AgentHeartbeatView>(() => undefined),
    });

  it("stands blank in its place until the first copy comes", async () => {
    await show(never());
    expect(screen.queryByTestId("heartbeat-group")).toBeNull();
    expect(screen.getByTestId("heartbeat-waiting-from")).toHaveTextContent("OpenClaw");
  });

  it("draws the copy kept from before at once, opened again", async () => {
    await show(storeWith(viewOf({ on: true })));
    await act(async () => undefined);
    screen.unmount();
    await show(never());
    expect(screen.queryByTestId("heartbeat-waiting")).toBeNull();
    expect(screen.getByTestId("heartbeat-switch").props["value"]).toBe(true);
  });
});
