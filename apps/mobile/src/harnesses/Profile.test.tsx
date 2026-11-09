/**
 * A harness's profile (ADR 0254): what it is now, five of its agents, how it is set up and what it
 * has run, each deeper section a row opening a page of its own. The dial, on When it asks you's
 * page, is the one control that changes anything, and it is the important one: turning it up is a
 * person deciding a machine may act without asking, so what it sends and what it refuses to offer
 * both matter.
 */

import type { Snapshot } from "@chipschat/core";
import { fireEvent, render, screen, userEvent, within } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { Split } from "../ui/Split";
import { Profile } from "./Profile";
import { WhenItAsks } from "./parts/WhenItAsks";
import { harnessRuns } from "./words";

const pushed: unknown[] = [];
/** When it asks you's dots, pressed (ADR 0255). */
const openAsks = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: (to: unknown) => pushed.push(to) }) }));

beforeEach(() => {
  pushed.length = 0;
});

function state(
  over: {
    policy?: unknown;
    fleet?: unknown[];
    runs?: unknown[];
    known?: boolean;
    /** Whether Scout's manifest says it takes the dial (ADR 0046). It does unless said otherwise. */
    declares?: boolean;
    /** Arjun's standing in the workspace, who is reading. An owner unless said otherwise. */
    role?: "owner" | "admin" | "member" | "guest";
  } = {},
): Snapshot {
  return {
    connection: "open",
    link: "direct",
    // The server has said who is who, so a harness missing from it is not there.
    directoryFrom: "server",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    directory:
      over.known === false
        ? {}
        : {
            har_scout: {
              id: "har_scout",
              kind: "harness",
              displayName: "Scout",
              ...(over.declares === false ? {} : { capabilities: ["autonomy"] }),
            },
          },
    model: {
      needsYou: [],
      lanes: [],
      people: {
        per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: over.role ?? "owner" },
      },
      fleet: over.fleet ?? [
        {
          harnessId: "har_scout",
          liveSessions: 1,
          sessionCount: 3,
          spaceCount: 2,
          needsYou: 0,
          paused: false,
          status: "running",
          statusVerb: "Drafting the reply",
          spaceId: "sp_1",
          runId: "run_1",
        },
      ],
      harnesses:
        over.policy === null
          ? {}
          : {
              har_scout: over.policy ?? {
                harnessId: "har_scout",
                autonomy: 1,
                maxAutonomy: 2,
                rules: [{ match: "email.send", decision: "ask", approvers: ["owner"] }],
                budgetUsd: 20,
                spentUsd: 4.1,
                bySpace: {},
              },
            },
      spaces: [{ id: "sp_1", runs: over.runs ?? [] }],
    },
  } as unknown as Snapshot;
}

/** A phone's window and insets, for the sheets an owner's profile holds. */
const WINDOW = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function view(over: Parameters<typeof state>[0] = {}) {
  const snapshot = state(over);
  const store = fakeStore(snapshot);
  return {
    store,
    element: (
      <SafeAreaProvider initialMetrics={WINDOW}>
        <Profile store={store} snapshot={snapshot} harnessId="har_scout" selfId="per_arjun" />
      </SafeAreaProvider>
    ),
  };
}

/** When it asks you's page, where the dial stands since ADR 0254. */
function asksView(over: Parameters<typeof state>[0] = {}) {
  const snapshot = state(over);
  const store = fakeStore(snapshot);
  return {
    store,
    element: (
      <SafeAreaProvider initialMetrics={WINDOW}>
        <WhenItAsks
          store={store}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
          onOpenAsks={openAsks}
        />
      </SafeAreaProvider>
    ),
  };
}

describe("a harness's profile", () => {
  it("reads as one column across the whole pane beside the list (ADR 0276)", async () => {
    const { element } = view();
    await render(<Split away list={<Text>the agents</Text>} detail={element} />);
    expect(screen.queryByTestId("columns")).toBeNull();
    expect(screen.getByTestId("harness-set-up")).toBeTruthy();
    expect(screen.getByTestId("harness-history")).toBeTruthy();
  });

  it("says what it is doing, in words as well as a ring", async () => {
    await render(view().element);
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByText("1 live session · 2 spaces")).toBeTruthy();
  });

  it("says what its run is at as its bubble does, never its run.status prose (ADR 0147)", async () => {
    const run = {
      runId: "run_1",
      harnessId: "har_scout",
      state: "running",
      paused: false,
      startedAt: "2026-10-10T19:07:47.000Z",
      statusVerb: "I need to check the images and ensure they are fresh, along with proofreading.",
      steps: [
        {
          stepId: "s1",
          status: "started",
          title: "web_search · Terafab suppliers",
          tool: "jacobian.web_search",
          startedAt: "2026-10-10T19:07:50.000Z",
        },
      ],
    };
    await render(view({ runs: [run] }).element);
    expect(screen.getByText("Working · Searching the web")).toBeTruthy();
    expect(screen.queryByText(/I need to check the images/)).toBeNull();
  });

  it("turns the dial, keeping the rules it already had", async () => {
    const { store, element } = asksView();
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "L2, Ask when it matters" }));
    expect(store.calls).toContainEqual({
      name: "setAutonomy",
      args: {
        harnessId: "har_scout",
        level: 2,
        rules: [{ match: "email.send", decision: "ask", approvers: ["owner"] }],
      },
    });
  });

  it("shows the level to a member, who cannot turn it (SEC-1)", async () => {
    // The server refuses a member's `policy.updated`: the dial says so by not moving.
    const { store, element } = asksView({ role: "member" });
    await render(element);
    const level = screen.getByRole("radio", { name: "L2, Ask when it matters" });
    expect(level.props["accessibilityState"]).toMatchObject({ checked: false, disabled: true });
    fireEvent.press(level);
    expect(store.calls.filter((each) => each.name === "setAutonomy")).toEqual([]);
    // The level in force, and the rules, are still read; a rule's switch is drawn and still, and
    // its row offers no Remove (ADR 0195).
    expect(
      screen.getByRole("radio", { name: "L1, Ask first" }).props["accessibilityState"],
    ).toMatchObject({ checked: true });
    expect(screen.getByText("email.send")).toBeTruthy();
    expect(screen.getByTestId("always-switch-har_scout:*:0").props["disabled"]).toBe(true);
    expect(screen.getByTestId("always-row-har_scout:*:0").props["accessibilityActions"]).toEqual(
      [],
    );
  });

  it("turns for an admin as for an owner (SEC-1)", async () => {
    const { store, element } = asksView({ role: "admin" });
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "L2, Ask when it matters" }));
    expect(store.calls.filter((each) => each.name === "setAutonomy")).toHaveLength(1);
  });

  it("shows the workspace's ceiling and will not go past it", async () => {
    const { store, element } = asksView();
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "L3, Autonomous, report back" }));
    expect(store.calls.filter((each) => each.name === "setAutonomy")).toEqual([]);
  });

  it("lists what its policy says under Allowed always, in words", async () => {
    await render(asksView().element);
    expect(screen.getByText("email.send")).toBeTruthy();
    expect(screen.getByText("Asks always · In every space · from its policy")).toBeTruthy();
  });

  it("shows the budget and what has gone of it", async () => {
    await render(view().element);
    expect(screen.getByLabelText("Budget: $4.10 of $20.00")).toBeTruthy();
  });

  it("draws no dial for a harness that does not take a level", async () => {
    // Jacobian's manifest declares nothing. Its status, its spaces, its budget and its runs
    // stay; a dial that changed nothing it could see does not (ADR 0046).
    const runs = [{ runId: "r1", harnessId: "har_scout", goal: "x", state: "done" }];
    await render(asksView({ declares: false }).element);
    expect(screen.queryByText("How far it is trusted")).toBeNull();
    expect(screen.queryByRole("radio", { name: "L1, Ask first" })).toBeNull();
    await render(view({ declares: false, runs }).element);
    expect(screen.queryByText("What it may do")).toBeNull();
    expect(screen.getByLabelText("Budget: $4.10 of $20.00")).toBeTruthy();
    expect(screen.getByTestId("harness-runs-row")).toBeTruthy();
  });

  it("says there is no policy yet rather than showing an empty dial", async () => {
    await render(asksView({ policy: null }).element);
    expect(screen.getByText(/No policy yet/)).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "L1, Ask first" })).toBeNull();
  });

  it("pauses a run that is going, and resumes one that is held", async () => {
    const going = view();
    await render(going.element);
    await userEvent.press(screen.getByRole("button", { name: "Pause" }));
    expect(going.store.calls).toContainEqual({
      name: "pauseRun",
      args: { spaceId: "sp_1", runId: "run_1" },
    });

    const held = view({
      fleet: [
        {
          harnessId: "har_scout",
          liveSessions: 0,
          sessionCount: 1,
          spaceCount: 1,
          needsYou: 0,
          paused: true,
          status: "running",
          spaceId: "sp_1",
          runId: "run_1",
        },
      ],
    });
    await render(held.element);
    await userEvent.press(screen.getByRole("button", { name: "Resume" }));
    expect(held.store.calls).toContainEqual({
      name: "resumeRun",
      args: { spaceId: "sp_1", runId: "run_1" },
    });
  });

  it("greys Pause out once its latest run has ended, which the server would refuse to pause (ADR 0254)", async () => {
    const ended = (status: string) =>
      view({
        fleet: [
          {
            harnessId: "har_scout",
            liveSessions: 0,
            sessionCount: 1,
            spaceCount: 1,
            needsYou: 0,
            paused: false,
            status,
            spaceId: "sp_1",
            runId: "run_1",
          },
        ],
      }).element;
    for (const status of ["done", "failed", "cancelled"]) {
      await render(ended(status));
      expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    }
  });

  it("keeps the token screen off the phone", async () => {
    await render(view().element);
    expect(screen.queryByText("Tokens")).toBeNull();
  });

  it("says it is connected and since when, where it once said how its last run ended (ADR 0254)", async () => {
    const snapshot = state({
      fleet: [
        {
          harnessId: "har_scout",
          liveSessions: 0,
          sessionCount: 1,
          spaceCount: 2,
          needsYou: 0,
          paused: false,
          status: "done",
        },
      ],
    });
    const fine = {
      ...snapshot,
      directory: {
        har_scout: {
          id: "har_scout",
          kind: "harness",
          displayName: "Scout",
          state: { connected: true, since: "2026-10-31T15:02:00.000Z" },
        },
      },
    } as unknown as Snapshot;
    await render(
      <SafeAreaProvider initialMetrics={WINDOW}>
        <Profile store={fakeStore(fine)} snapshot={fine} harnessId="har_scout" />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId("profile-connected")).toHaveTextContent(/^Connected · since /);
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByTestId("profile-status")).toBeNull();
  });

  it("says so rather than drawing an empty profile for a harness this phone has not seen", async () => {
    await render(view({ known: false }).element);
    expect(screen.getByText(/no harness by that name on this phone/)).toBeTruthy();
  });

  it("waits for the server's word before saying there is no such harness", async () => {
    // Opened before this phone ever had the list: from a link on the first launch, say.
    const { directoryFrom: _said, ...first } = state({ known: false });
    const shown = (snapshot: Snapshot) => (
      <SafeAreaProvider initialMetrics={WINDOW}>
        <Profile store={fakeStore(snapshot)} snapshot={snapshot} harnessId="har_scout" />
      </SafeAreaProvider>
    );
    await render(shown(first));
    expect(screen.queryByText(/no harness by that name/)).toBeNull();
    const offline = { ...first, connection: "closed" as const };
    await render(shown(offline));
    expect(screen.getByText("This harness will show here once your server answers.")).toBeTruthy();
  });
});

describe("removing it (ADR 0078)", () => {
  /** A sheet asks for the safe area, so these renders get an iPhone's, as `Sheet.test.tsx` does. */
  const IPHONE = {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 59, left: 0, right: 0, bottom: 34 },
  };

  /** Scout, owned by `owner`, read by Arjun at `role` in the workspace. */
  function removable(
    over: { owner?: string; role?: "owner" | "member" | "guest"; removedAt?: string } = {},
  ): Snapshot {
    const snapshot = state();
    return {
      ...snapshot,
      directory: {
        har_scout: {
          id: "har_scout",
          kind: "harness",
          displayName: "Scout",
          ownerId: over.owner ?? "per_arjun",
          ...(over.removedAt === undefined ? {} : { removedAt: over.removedAt }),
        },
      },
      model: {
        ...snapshot.model,
        people: {
          per_arjun: {
            participantId: "per_arjun",
            displayName: "Arjun",
            role: over.role ?? "member",
          },
        },
      },
    } as unknown as Snapshot;
  }

  async function open(snapshot: Snapshot, removeHarness: (id: string) => Promise<void>) {
    const store = Object.assign(fakeStore(snapshot), { removeHarness });
    const left = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Profile
          store={store}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
          onRemoved={left}
        />
      </SafeAreaProvider>,
    );
    return { left };
  }

  it("is offered to its owner, asks first, and leaves the profile once the server has removed it", async () => {
    const removed: string[] = [];
    const { left } = await open(removable(), async (id) => {
      removed.push(id);
    });
    await userEvent.press(screen.getByRole("button", { name: "Remove harness…" }));
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Remove Scout?")).toBeTruthy();
    expect(within(sheet).getByText(/What Scout said stays/)).toBeTruthy();
    expect(removed).toEqual([]);

    await userEvent.press(within(sheet).getByRole("button", { name: "Remove" }));
    expect(removed).toEqual(["har_scout"]);
    expect(left).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the sheet is cancelled", async () => {
    const removed: string[] = [];
    const { left } = await open(removable(), async (id) => {
      removed.push(id);
    });
    await userEvent.press(screen.getByRole("button", { name: "Remove harness…" }));
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(removed).toEqual([]);
    expect(left).not.toHaveBeenCalled();
  });

  it("keeps the sheet up with the server's reason when it will not remove it", async () => {
    const { left } = await open(removable(), async () => {
      throw new Error("A harness is removed by its owner, or by an owner or admin.");
    });
    await userEvent.press(screen.getByRole("button", { name: "Remove harness…" }));
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Remove" }));
    expect(await screen.findByTestId("confirm-failed")).toHaveTextContent(
      "Not removed: A harness is removed by its owner, or by an owner or admin.",
    );
    expect(screen.getByTestId("confirm-sheet")).toBeTruthy();
    expect(left).not.toHaveBeenCalled();
  });

  it("is offered to an owner of the workspace, and not to a member who does not own it", async () => {
    const refuse = async () => {
      throw new Error("not reached");
    };
    await open(removable({ owner: "per_dana", role: "owner" }), refuse);
    expect(screen.getByRole("button", { name: "Remove harness…" })).toBeTruthy();

    await open(removable({ owner: "per_dana", role: "member" }), refuse);
    expect(screen.queryByRole("button", { name: "Remove harness…" })).toBeNull();
  });

  it("says a harness removed already is, and offers nothing more", async () => {
    await open(removable({ removedAt: "2026-09-27T10:00:00.000Z" }), async () => undefined);
    expect(screen.getByText(/Removed from the workspace/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove harness…" })).toBeNull();
  });
});

describe("restarting it (ADR 0094)", () => {
  const IPHONE = {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 59, left: 0, right: 0, bottom: 34 },
  };
  const FINE = { connected: true, since: "2026-10-02T15:06:00.000Z" };

  /** OpenClaw, Arjun's, taking restarts unless said otherwise, in the state given. */
  function restartable(
    over: { state?: unknown; takes?: boolean; role?: "owner" | "member" } = {},
  ): Snapshot {
    const snapshot = state();
    return {
      ...snapshot,
      directory: {
        per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
        har_scout: {
          id: "har_scout",
          kind: "harness",
          displayName: "OpenClaw",
          ownerId: over.role === "member" ? "per_dana" : "per_arjun",
          lastSeenAt: "2026-10-02T15:00:00.000Z",
          capabilities: over.takes === false ? [] : ["restarts"],
          state: over.state ?? FINE,
        },
      },
      model: {
        ...snapshot.model,
        people: {
          per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: "member" },
        },
      },
    } as unknown as Snapshot;
  }

  async function open(snapshot: Snapshot, restartHarness: (id: string) => Promise<void>) {
    const store = Object.assign(fakeStore(snapshot), { restartHarness });
    const shown = await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Profile store={store} snapshot={snapshot} harnessId="har_scout" selfId="per_arjun" />
      </SafeAreaProvider>,
    );
    const again = (next: Snapshot) =>
      shown.rerender(
        <SafeAreaProvider initialMetrics={IPHONE}>
          <Profile store={store} snapshot={next} harnessId="har_scout" selfId="per_arjun" />
        </SafeAreaProvider>,
      );
    return { again };
  }

  it("asks first, then asks the server, for a harness that takes restarts", async () => {
    const asked: string[] = [];
    await open(
      restartable({
        state: { ...FINE, trouble: { reason: "Can't reach its gateway", since: FINE.since } },
      }),
      async (id) => {
        asked.push(id);
      },
    );
    await userEvent.press(screen.getByRole("button", { name: "Restart harness…" }));
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByText("Restart OpenClaw?")).toBeTruthy();
    expect(within(sheet).getByText(/stops whatever it's doing/)).toBeTruthy();
    expect(asked).toEqual([]);
    await userEvent.press(within(sheet).getByRole("button", { name: "Restart" }));
    expect(asked).toEqual(["har_scout"]);
  });

  it("keeps the sheet up with the server's reason when nobody could hear it", async () => {
    await open(restartable(), async () => {
      throw new Error("Chips can't reach OpenClaw to restart it.");
    });
    await userEvent.press(screen.getByRole("button", { name: "Restart harness…" }));
    const sheet = await screen.findByTestId("confirm-sheet");
    await userEvent.press(within(sheet).getByRole("button", { name: "Restart" }));
    expect(await screen.findByTestId("confirm-failed")).toHaveTextContent(
      "Not restarted: Chips can't reach OpenClaw to restart it.",
    );
  });

  it("says it is restarting, and who asked, with nothing to press; then when it was back", async () => {
    const going = restartable({
      state: { ...FINE, restarting: { since: "2026-10-02T15:31:00.000Z", by: "per_arjun" } },
    });
    const { again } = await open(going, async () => undefined);
    expect(screen.getByTestId("profile-trouble")).toHaveTextContent(/^Restarting · asked by you/);
    // Not what its last run was doing beside it (17 October 2026), as its card.
    expect(screen.queryByText("Working")).toBeNull();
    // A row at the foot that says so, with nothing to press (ADR 0254).
    expect(screen.getByTestId("restart-harness")).toHaveTextContent("Restarting…");
    expect(screen.queryByRole("button", { name: /Restart/ })).toBeNull();

    await again(restartable());
    expect(screen.queryByTestId("profile-trouble")).toBeNull();
    expect(screen.getByText("Working")).toBeTruthy();
    expect(screen.getByTestId("profile-back")).toHaveTextContent(/^Back · /);
    expect(screen.getByRole("button", { name: "Restart harness…" })).toBeTruthy();
  });

  it("says why there is nothing to press while nothing of it is connected", async () => {
    await open(
      restartable({ state: { connected: false, since: FINE.since } }),
      async () => undefined,
    );
    expect(screen.getByTestId("restart-unreachable")).toHaveTextContent(
      /^Restart harness.*Start it on its machine/,
    );
    expect(screen.queryByRole("button", { name: /Restart/ })).toBeNull();
  });

  it("is not offered for a harness that doesn't take restarts, nor to a member who doesn't own it", async () => {
    await open(restartable({ takes: false }), async () => undefined);
    expect(screen.queryByRole("button", { name: /Restart/ })).toBeNull();
    await open(restartable({ role: "member" }), async () => undefined);
    expect(screen.queryByRole("button", { name: /Restart/ })).toBeNull();
  });
});

describe("its recent runs (`harnessRuns`)", () => {
  it("are the newest first, and only this harness's", () => {
    const snapshot = state({
      runs: [
        { runId: "r1", harnessId: "har_scout", startedAt: "2026-09-07T09:00:00.000Z", goal: "old" },
        {
          runId: "r2",
          harnessId: "har_other",
          startedAt: "2026-09-07T11:00:00.000Z",
          goal: "theirs",
        },
        { runId: "r3", harnessId: "har_scout", startedAt: "2026-09-07T10:00:00.000Z", goal: "new" },
      ],
    });
    expect(harnessRuns(snapshot, "har_scout").map((run) => run.runId)).toEqual(["r3", "r1"]);
  });

  it("are its agents' too, which is whose runs are since agents (ADR 0087)", () => {
    const snapshot = state({
      runs: [
        {
          runId: "r1",
          harnessId: "agt_tree",
          startedAt: "2026-09-30T09:00:00.000Z",
          goal: "its agent's",
        },
        {
          runId: "r2",
          harnessId: "agt_else",
          startedAt: "2026-09-30T10:00:00.000Z",
          goal: "another's",
        },
      ],
    });
    const directory = {
      ...snapshot.directory,
      agt_tree: { id: "agt_tree", kind: "agent", harnessId: "har_scout", displayName: "Tree" },
      agt_else: { id: "agt_else", kind: "agent", harnessId: "har_other", displayName: "Else" },
    } as Snapshot["directory"];
    expect(harnessRuns({ ...snapshot, directory }, "har_scout").map((run) => run.runId)).toEqual([
      "r1",
    ]);
  });

  it("stop at as many as are asked for", () => {
    const runs = Array.from({ length: 9 }, (_, index) => ({
      runId: `r${index}`,
      harnessId: "har_scout",
      startedAt: `2026-09-0${index + 1}T10:00:00.000Z`,
      goal: "x",
    }));
    expect(harnessRuns(state({ runs }), "har_scout", 5)).toHaveLength(5);
    expect(harnessRuns(state({ runs }), "har_scout")).toHaveLength(9);
  });
});

describe("its Model row (ADR 0154)", () => {
  const IPHONE = {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 59, left: 0, right: 0, bottom: 34 },
  };
  const MAIN = "agt_scout_main";
  const steady = { id: "steady", label: "Steady" };
  const copy = {
    agent_id: MAIN,
    harness_id: "har_scout",
    model: "heron-2",
    effort: "steady",
    own: false,
    default: { label: "Scout's default", model: "heron-2", effort: "steady" },
    choices: [{ id: "heron-2", label: "Heron 2", efforts: [steady] }],
    editable: true,
    followed_by: 21,
    read_at: "2026-10-12T17:42:00.000Z",
    away: false,
  };

  /** Scout, owned by Arjun and sending its models, with its Main agent unless `main` is false. */
  function sending(main = true): Snapshot {
    const snapshot = state();
    return {
      ...snapshot,
      directory: {
        har_scout: {
          id: "har_scout",
          kind: "harness",
          displayName: "Scout",
          ownerId: "per_arjun",
          capabilities: ["agents", "models"],
        },
        ...(main
          ? {
              [MAIN]: {
                id: MAIN,
                kind: "agent",
                harnessId: "har_scout",
                displayName: "Scout",
                lead: true,
              },
            }
          : {}),
      },
      model: {
        ...snapshot.model,
        people: { per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: "member" } },
      },
    } as unknown as Snapshot;
  }

  async function open(snapshot: Snapshot) {
    const store = Object.assign(fakeStore(snapshot), { readAgentModel: jest.fn(async () => copy) });
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Profile store={store} snapshot={snapshot} harnessId="har_scout" selfId="per_arjun" />
      </SafeAreaProvider>,
    );
    return store;
  }

  it("is its Main agent's, with who follows it, so changing it changes the harness's", async () => {
    const store = await open(sending());
    expect(store.readAgentModel).toHaveBeenCalledWith(MAIN);
    const row = await screen.findByTestId("model-row");
    expect(within(row).getByText("Heron 2")).toBeTruthy();
    expect(screen.getByText("21 agents have no model of their own and use Scout's.")).toBeTruthy();
  });

  it("is not there for a harness with no Main agent, and nothing is asked", async () => {
    const store = await open(sending(false));
    expect(store.readAgentModel).not.toHaveBeenCalled();
    expect(screen.queryByTestId("model-row")).toBeNull();
  });
});

describe("When it asks you (ADR 0195)", () => {
  const IPHONE = {
    frame: { x: 0, y: 0, width: 393, height: 852 },
    insets: { top: 59, left: 0, right: 0, bottom: 34 },
  };
  /** Two of Arjun's Always: an email in Bakery, newest, and a shell command everywhere. */
  const SHELL = {
    match: "shell.exec",
    decision: "allow",
    made_by: "per_arjun",
    made_at: "2026-10-12T09:00:00.000Z",
  };
  const EMAIL = {
    match: "email.draft",
    decision: "allow",
    made_by: "per_arjun",
    made_at: "2026-10-14T09:00:00.000Z",
  };
  const asked = (id: string, askedAt: string, resolved?: unknown) => ({
    approvalId: id,
    askedAt,
    action: { kind: "shell.exec" },
    risk: [],
    ...(resolved === undefined ? {} : { resolved }),
  });

  /** Scout, Arjun's, at `role`; its rules as given; three asks answered. */
  function asking(
    over: { role?: "owner" | "member"; rules?: unknown[]; room?: unknown[]; asks?: unknown[] } = {},
  ): Snapshot {
    const snapshot = state();
    return {
      ...snapshot,
      directory: {
        per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
        har_scout: { id: "har_scout", kind: "harness", displayName: "Scout", ownerId: "per_arjun" },
      },
      model: {
        ...snapshot.model,
        people: {
          per_arjun: {
            participantId: "per_arjun",
            displayName: "Arjun",
            role: over.role ?? "owner",
          },
        },
        harnesses: {
          har_scout: {
            harnessId: "har_scout",
            autonomy: 1,
            maxAutonomy: 2,
            rules: over.rules ?? [SHELL],
            budgetUsd: 20,
            spentUsd: 4.1,
            bySpace: over.room === undefined ? {} : { sp_1: { autonomy: 1, rules: over.room } },
          },
        },
        spaces: [
          {
            id: "sp_1",
            title: "Bakery",
            runs: [
              {
                runId: "run_1",
                harnessId: "har_scout",
                startedAt: "2026-09-06T09:00:00.000Z",
                approvals: over.asks ?? [
                  asked("a1", "2026-09-06T09:00:00.000Z", {
                    by: "per_arjun",
                    decision: "approved",
                    scope: "once",
                  }),
                  asked("a2", "2026-09-07T09:00:00.000Z", {
                    by: "per_arjun",
                    decision: "approved",
                    scope: "always",
                  }),
                  asked("a3", "2026-09-08T09:00:00.000Z", {
                    by: "per_arjun",
                    decision: "denied",
                    scope: "once",
                  }),
                ],
              },
            ],
          },
        ],
      },
    } as unknown as Snapshot;
  }

  async function open(snapshot: Snapshot) {
    const store = fakeStore(snapshot);
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <WhenItAsks
          store={store}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
          onOpenAsks={openAsks}
        />
      </SafeAreaProvider>,
    );
    return store;
  }

  it("is a row on the harness's page, saying how much is allowed always, opening its page (ADR 0254)", async () => {
    const snapshot = asking();
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Profile
          store={fakeStore(snapshot)}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId("asking")).toBeNull();
    const row = screen.getByTestId("harness-asks-row");
    expect(row).toHaveProp("accessibilityLabel", "When it asks you, 1 allowed always");
    await userEvent.press(row);
    expect(pushed).toContainEqual({
      pathname: "/harnesses/[id]/[part]",
      params: { id: "har_scout", part: "asks" },
    });
  });

  it("switches the banner for all its agents, with Undo (ADR 0286)", async () => {
    const snapshot = { ...asking(), keepsBanners: true };
    const store = fakeStore(snapshot);
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Profile store={store} snapshot={snapshot} harnessId="har_scout" selfId="per_arjun" />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId("harness-banners-row")).toHaveTextContent(/Show banners/);
    expect(screen.getByTestId("harness-banners-foot")).toHaveTextContent(/any made later/);
    await fireEvent(screen.getByTestId("harness-banners-switch"), "valueChange", false);
    expect(store.calls).toContainEqual({
      name: "setHarnessBanner",
      args: { harnessId: "har_scout", shown: false },
    });
    expect(screen.getByTestId("undo-pill")).toHaveTextContent(/Banners off for its agent/);
    await userEvent.press(screen.getByTestId("undo-pill-undo"));
    expect(store.calls.map((each) => each.name)).toContain("undoHarnessBanner");
  });

  it("offers no banner switch on a server that keeps no choices (ADR 0286)", async () => {
    const snapshot = { ...asking(), keepsBanners: false };
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Profile
          store={fakeStore(snapshot)}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
        />
      </SafeAreaProvider>,
    );
    expect(screen.queryByTestId("harness-banners-row")).toBeNull();
  });

  it("says who decides when and who decides the answer, and the three promises", async () => {
    await open(asking());
    const section = screen.getByTestId("asking");
    expect(within(section).getByTestId("asking-hero")).toBeTruthy();
    expect(screen.getByTestId("asking-headline")).toHaveTextContent(
      "Scout decides when to ask. You decide the answer.",
    );
    expect(screen.getByTestId("asking-sub")).toHaveTextContent(/Its asks come to you/);
    expect(
      within(screen.getByTestId("asking-promise-big")).getByText("The big ones wait for you"),
    ).toBeTruthy();
    expect(screen.getByTestId("asking-promise-window")).toBeTruthy();
    expect(screen.getByTestId("asking-promise-silence")).toBeTruthy();
  });

  it("lists what was allowed always, newest first, with who, where and when", async () => {
    await open(asking({ room: [EMAIL] }));
    const list = screen.getByTestId("asking-always");
    const kinds = within(list)
      .getAllByText(/^(shell\.exec|email\.draft)$/)
      .map((each) => each.props["children"]);
    expect(kinds).toEqual(["email.draft", "shell.exec"]);
    expect(within(list).getByText(/^In Bakery · by you, 14 October/)).toBeTruthy();
    expect(within(list).getByText(/^In every space · by you, 12 October/)).toBeTruthy();
    expect(screen.getByTestId("asking-count")).toHaveTextContent("2 on");
    expect(screen.getByTestId("asking-always-foot")).toBeTruthy();
  });

  it("says nothing is allowed always when nothing is", async () => {
    await open(asking({ rules: [] }));
    expect(screen.getByTestId("asking-always-empty")).toHaveTextContent(/Nothing yet/);
    expect(screen.queryByTestId("asking-count")).toBeNull();
    expect(screen.queryByTestId("asking-always-foot")).toBeNull();
  });

  it("switches a rule off, keeping it in the list, and the switch stays where the thumb put it", async () => {
    const store = await open(asking());
    await fireEvent(screen.getByTestId("always-switch-har_scout:*:0"), "valueChange", false);
    expect(store.calls.filter((each) => each.name === "setRules")).toEqual([
      { name: "setRules", args: { harnessId: "har_scout", rules: [{ ...SHELL, off: true }] } },
    ]);
    // Before the server has echoed it back, the row is drawn off.
    expect(screen.getByTestId("always-switch-har_scout:*:0").props["value"]).toBe(false);
    expect(screen.getByText("Off · Scout asks again")).toBeTruthy();
    expect(screen.getByTestId("asking-count")).toHaveTextContent("0 of 1 on");
  });

  it("removes a rule into dust, and Undo puts it back where it was", async () => {
    const store = await open(asking({ rules: [SHELL, EMAIL] }));
    await fireEvent(screen.getByTestId("always-row-har_scout:*:1"), "accessibilityAction", {
      nativeEvent: { actionName: "remove" },
    });
    expect(store.calls.filter((each) => each.name === "setRules")).toEqual([
      { name: "setRules", args: { harnessId: "har_scout", rules: [SHELL] } },
    ]);
    expect(screen.queryByText("email.draft")).toBeNull();
    expect(screen.getByTestId("undo-pill")).toHaveTextContent(/Removed/);

    await userEvent.press(screen.getByTestId("undo-pill-undo"));
    expect(store.calls.filter((each) => each.name === "setRules").at(-1)).toEqual({
      name: "setRules",
      args: { harnessId: "har_scout", rules: [SHELL, EMAIL] },
    });
    expect(screen.getByText("email.draft")).toBeTruthy();
    expect(screen.queryByTestId("undo-pill")).toBeNull();
  });

  it("draws a dot for each ask, keys them and says who answered them", async () => {
    await open(asking());
    expect(screen.getByTestId("asking-dot-yes")).toBeTruthy();
    expect(screen.getByTestId("asking-dot-session")).toBeTruthy();
    expect(screen.getByTestId("asking-dot-no")).toBeTruthy();
    expect(screen.getByTestId("asking-key")).toHaveTextContent("2 yes1 no");
    expect(screen.getByTestId("asking-history")).toHaveProp(
      "accessibilityLabel",
      "Asks so far: 2 yes, 1 no. 3 asks since 6 September · all answered by you",
    );
  });

  it("opens every ask from a tap on the dots (ADR 0255)", async () => {
    openAsks.mockClear();
    await open(asking());
    expect(screen.getByTestId("asking-history")).toHaveTextContent(/^Asks so farSee all/);
    await userEvent.press(screen.getByTestId("asking-history"));
    expect(openAsks).toHaveBeenCalledTimes(1);
  });

  it("has no dots before the harness has asked anything", async () => {
    await open(asking({ asks: [] }));
    expect(screen.queryByTestId("asking-history")).toBeNull();
  });
});
