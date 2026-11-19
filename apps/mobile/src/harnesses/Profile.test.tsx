/**
 * A harness's profile (ADR 0254): what it is now, five of its agents, how it is set up and what it
 * has run, each deeper section a row opening a page of its own. The dial, on When it asks you's
 * page, is the one control that changes anything, and it is the important one: turning it up is a
 * person deciding a machine may act without asking, so what it sends and what it refuses to offer
 * both matter.
 */

import type { BridgeUpdate, HarnessSoftware, Snapshot, Store } from "@chipschat/core";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { Split } from "../ui/Split";
import { UpdatesProvider } from "../updates/updates";
import { Profile } from "./Profile";
import { Part } from "./parts/Part";
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
          pausable: true,
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
          onOpenPart={() => undefined}
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
          status: "paused",
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

  it("greys Pause out while its run's harness never said a Pause holds it (ADR 0293)", async () => {
    await render(
      view({
        fleet: [
          {
            harnessId: "har_scout",
            liveSessions: 1,
            sessionCount: 1,
            spaceCount: 1,
            needsYou: 0,
            paused: false,
            status: "running",
            spaceId: "sp_1",
            runId: "run_1",
          },
        ],
      }).element,
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeDisabled();
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

describe("its Permissions (ADR 0299; When it asks you, ADR 0195)", () => {
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

  // The main page and its Chips's rules page, drawn together (ADR 0300).
  async function open(snapshot: Snapshot, onOpenPart: (part: string) => void = () => undefined) {
    const store = fakeStore(snapshot);
    await render(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <WhenItAsks
          store={store}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
          onOpenAsks={openAsks}
          onOpenPart={onOpenPart}
        />
        <Part
          part="chips"
          store={store}
          snapshot={snapshot}
          harnessId="har_scout"
          selfId="per_arjun"
          focus={0}
          onOpenPart={onOpenPart}
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
    expect(screen.queryByTestId("permissions")).toBeNull();
    const row = screen.getByTestId("harness-asks-row");
    expect(row).toHaveProp("accessibilityLabel", "Permissions, 1 on");
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

  it("says who decides, one gate while its Chips's rules are off (ADR 0300)", async () => {
    await open(asking({ rules: [] }));
    const page = screen.getByTestId("permissions");
    expect(within(page).getByTestId("asking-hero")).toBeTruthy();
    expect(screen.getByTestId("perms-headline")).toHaveTextContent(
      "Scout decides what to ask. Chips brings every ask to you.",
    );
    expect(screen.getByTestId("perms-settings-row")).toHaveTextContent(
      /Doesn't say yet what it runs on its own/,
    );
    expect(screen.queryByTestId("perms-open")).toBeNull();
  });

  it("switches Chips's rules off, and Stop asking says yes for a length with Ask again (ADR 0300)", async () => {
    const store = await open(asking());
    await userEvent.press(screen.getByTestId("perms-stop"));
    await userEvent.press(screen.getByTestId("perms-stop-len-8h"));
    const sent = store.calls.find((each) => each.name === "snoozeHarness");
    expect(sent?.args).toMatchObject({ harnessId: "har_scout", snooze: { matters: false } });
    await fireEvent(screen.getByTestId("perms-switch"), "valueChange", false);
    expect(store.calls).toContainEqual({
      name: "setChipsRules",
      args: { harnessId: "har_scout", on: false },
    });
  });

  it("opens New rule from Add a rule on Chips's rules (ADR 0299, 0300)", async () => {
    const opened = jest.fn();
    await open(asking(), opened);
    await userEvent.press(screen.getByTestId("perms-add-rule"));
    expect(opened).toHaveBeenCalledWith("rule");
  });

  it("opens its settings and Chips's rules from the main page's rows (ADR 0300)", async () => {
    const opened = jest.fn();
    await open(asking(), opened);
    await userEvent.press(screen.getByTestId("perms-settings-row"));
    await userEvent.press(screen.getByTestId("perms-chips-row"));
    expect(opened.mock.calls).toEqual([["settings"], ["chips"]]);
  });

  it("lists what Chips answers, newest first, each with its answer, where, who and when", async () => {
    await open(asking({ room: [EMAIL] }));
    const list = screen.getByTestId("perms-rules");
    const titles = within(list)
      .getAllByText(/^(Any command|Draft email)$/)
      .map((each) => each.props["children"]);
    expect(titles).toEqual(["Draft email", "Any command"]);
    expect(within(list).getByText(/^In Bakery · by you, 14 October/)).toBeTruthy();
    expect(within(list).getByText(/^In every space · by you, 12 October/)).toBeTruthy();
    expect(screen.getByTestId("always-tag-har_scout:*:0")).toHaveTextContent("Allow");
    expect(screen.getByTestId("asking-count")).toHaveTextContent("2 on");
    expect(screen.getByTestId("perms-rules-foot")).toHaveTextContent(/Swipe one to remove it/);
  });

  it("says Chips's rules are off for a harness with none, and what turning them on does (ADR 0300)", async () => {
    await open(asking({ rules: [] }));
    expect(screen.queryByTestId("perms-rules")).toBeNull();
    expect(screen.queryByTestId("perms-add-rule")).toBeNull();
    expect(screen.getByTestId("perms-off-foot")).toHaveTextContent(/^Turn them on/);
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
    expect(screen.queryByText("Draft email")).toBeNull();
    expect(screen.getByTestId("undo-pill")).toHaveTextContent(/Removed/);

    await userEvent.press(screen.getByTestId("undo-pill-undo"));
    expect(store.calls.filter((each) => each.name === "setRules").at(-1)).toEqual({
      name: "setRules",
      args: { harnessId: "har_scout", rules: [SHELL, EMAIL] },
    });
    expect(screen.getByText("Draft email")).toBeTruthy();
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

describe("a harness's Bridge group (ADR 0297)", () => {
  const at = new Date().toISOString();
  /** Scout's bridge, kept by this computer, as the computer says it. */
  const kept = (
    update: Partial<BridgeUpdate> = {},
    rest: Partial<HarnessSoftware> = {},
  ): HarnessSoftware => ({
    harnessId: "har_scout",
    name: "chips-hermes",
    version: "1.0.31",
    seenAt: at,
    keepCurrent: true,
    bridgeUpdate: {
      package: "@chipschat/hermes",
      running: "1.0.31",
      phase: "current",
      since: at,
      ...update,
    },
    ...rest,
  });
  /** Scout's bridge kept on another machine, with a release out for it. */
  const elsewhere: HarnessSoftware = {
    harnessId: "har_scout",
    name: "chips-hermes",
    version: "1.0.29",
    seenAt: at,
    keepCurrent: true,
    releaseOut: "1.0.31",
  };

  /** Scout's page under the updates provider, the computer saying `harnesses` run. */
  async function bridge(harnesses: HarnessSoftware[], role: "owner" | "member" = "owner") {
    const snapshot = state({ role });
    const asked = { software: 0, kept: [] as [string, boolean][] };
    const store = {
      ...fakeStore(snapshot),
      // As the computer answers: with the switch as last turned.
      software: async () => {
        asked.software += 1;
        const on = asked.kept.at(-1)?.[1];
        return {
          harnesses: harnesses.map((each) =>
            on === undefined ? each : { ...each, keepCurrent: on },
          ),
          devices: [],
        };
      },
      keepBridgeCurrent: async (harnessId: string, on: boolean) => {
        asked.kept.push([harnessId, on]);
      },
    } as unknown as Store;
    const page = (focus = 0) => (
      <SafeAreaProvider initialMetrics={WINDOW}>
        <UpdatesProvider store={store} owner={role === "owner"} me="per_arjun">
          <Profile
            store={store}
            snapshot={snapshot}
            harnessId="har_scout"
            selfId="per_arjun"
            focus={focus}
          />
        </UpdatesProvider>
      </SafeAreaProvider>
    );
    const view = await render(page());
    return { asked, front: (focus: number) => view.rerender(page(focus)) };
  }

  const putBack = { outcome: "put-back" as const, from: "1.0.31", to: "1.0.32", at };
  const updated = { outcome: "updated" as const, from: "1.0.30", to: "1.0.31", at };
  const STATES: [string, HarnessSoftware, RegExp, "still" | "needs"][] = [
    [
      "has updated",
      kept({ last: updated }),
      /^Bridge 1\.0\.31Updated \d+ \w+, at a quiet moment\.$/,
      "still",
    ],
    [
      "has a release ready, waiting for a quiet moment",
      kept({ phase: "waiting", target: "1.0.32" }),
      /^1\.0\.32 is readyWaiting for a quiet moment, when nothing is going on for Scout\.$/,
      "still",
    ],
    [
      "is starting a release",
      kept({ phase: "watching", target: "1.0.32" }),
      /^Starting 1\.0\.32Back in a moment\. If it doesn't come back, 1\.0\.31 goes back on\.$/,
      "still",
    ],
    [
      "couldn't update because it didn't come back",
      kept({ last: putBack }),
      /^Couldn't update to 1\.0\.32It didn't come back, so 1\.0\.31 is back on\. Chips tries again when the next release is out\.$/,
      "needs",
    ],
    [
      "couldn't update for a reason Chips names",
      kept({ phase: "refused", target: "1.0.32", reason: "room" }),
      /^Couldn't update to 1\.0\.32This computer's disk is full\. Still on 1\.0\.31\.$/,
      "needs",
    ],
    [
      "has updates off with a release out",
      kept({ phase: "off", target: "1.0.32" }, { keepCurrent: false }),
      /^Updates are offBridge 1\.0\.31 · 1\.0\.32 is out\.$/,
      "needs",
    ],
    [
      "is kept on another machine with a release out",
      elsewhere,
      /^Bridge 1\.0\.29 · 1\.0\.31 is outOn the computer this bridge runs on:$/,
      "needs",
    ],
  ];

  it.each(STATES)("says its line when it %s", async (_state, harness, words, dot) => {
    await bridge([harness]);
    const line = await screen.findByTestId("harness-bridge-line");
    expect(line).toHaveTextContent(words);
    // The breathing gold dot where the owner has something to do; a still one otherwise.
    expect(within(line).queryByTestId("needs-dot") !== null).toBe(dot === "needs");
  });

  it("says where to run the line once, over the command", async () => {
    await bridge([elsewhere]);
    const group = await screen.findByTestId("harness-bridge");
    expect(within(group).getAllByText("On the computer this bridge runs on:")).toHaveLength(1);
    expect(within(group).getByTestId("connect-line-words")).toHaveTextContent(
      "chips connect --update",
    );
    expect(within(group).getByTestId("connect-line-run")).toBeTruthy();
    // Nothing is said again under the command.
    expect(within(group).queryByTestId("connect-note")).toBeNull();
    // A bridge kept elsewhere is not this computer's to keep current: no switch.
    expect(screen.queryByTestId("harness-bridge-switch")).toBeNull();
  });

  it("gives the owner the switch, and turns it", async () => {
    const { asked } = await bridge([kept()]);
    const keep = await screen.findByTestId("harness-bridge-switch");
    expect(keep).toHaveProp("value", true);
    expect(screen.getByText("Keep this bridge up to date")).toBeTruthy();
    await act(async () => {
      fireEvent(keep, "valueChange", false);
    });
    await waitFor(() => expect(asked.kept).toEqual([["har_scout", false]]));
    // What the bridge runs is read again, and its line follows the switch.
    await waitFor(() =>
      expect(screen.getByTestId("harness-bridge-line")).toHaveTextContent(/Updates are off\./),
    );
    expect(screen.getByTestId("harness-bridge-switch")).toHaveProp("value", false);
  });

  it("shows a member the line, and no switch", async () => {
    await bridge([kept({ phase: "waiting", target: "1.0.32" })], "member");
    expect(await screen.findByTestId("harness-bridge-line")).toHaveTextContent(/1\.0\.32 is ready/);
    expect(screen.queryByTestId("harness-bridge-switch")).toBeNull();
    expect(screen.queryByText("Keep this bridge up to date")).toBeNull();
  });

  it("draws nothing for a harness the computer says nothing of", async () => {
    const { asked } = await bridge([kept({}, { harnessId: "har_other" })]);
    await waitFor(() => expect(asked.software).toBeGreaterThan(0));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId("harness-bridge")).toBeNull();
  });

  it("asks what the bridge runs as the page opens, and each time it comes to the front", async () => {
    const { asked, front } = await bridge([kept()]);
    await screen.findByTestId("harness-bridge-line");
    // Once for the page and once as the app's provider started, which here is the same moment.
    const opened = asked.software;
    expect(opened).toBeGreaterThanOrEqual(1);
    await front(1);
    await waitFor(() => expect(asked.software).toBe(opened + 1));
    await front(2);
    await waitFor(() => expect(asked.software).toBe(opened + 2));
    // Drawn again where it stands, it asks nothing.
    await front(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(asked.software).toBe(opened + 2);
  });
});
