/**
 * What a harness's page opens since ADR 0254: five of its agents and the page with every one of
 * them, which a field searches; and its runs, a row each, opening their spaces. And what When it
 * asks you opens since ADR 0255: every ask so far, a row each, opening the ask.
 */

import { askDay, type Snapshot } from "@chipschat/core";
import { render, screen, userEvent, within } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../../testing/fixtures";
import { Profile } from "../Profile";
import { AllAgents } from "./AllAgents";
import { AskList } from "./AskList";
import { RecentRuns } from "./RecentRuns";

const pushed: unknown[] = [];
jest.mock("expo-router", () => ({ useRouter: () => ({ push: (to: unknown) => pushed.push(to) }) }));

beforeEach(() => {
  pushed.length = 0;
});

const WINDOW = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const NAMES = ["Kalshi Operator", "Engineer", "Analyst", "Researcher", "Designer", "Malik"];

/** Jacobian, Arjun's, with its Main agent and `count` more, and the runs given. */
function jacobian(count = NAMES.length, runs: unknown[] = []): Snapshot {
  const agents = Object.fromEntries(
    NAMES.slice(0, count).map((name, at) => [
      `agt_${at}`,
      { id: `agt_${at}`, kind: "agent", harnessId: "hrn_jac", displayName: name },
    ]),
  );
  return {
    connection: "open",
    link: "direct",
    directoryFrom: "server",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
      hrn_jac: { id: "hrn_jac", kind: "harness", displayName: "Jacobian", ownerId: "per_arjun" },
      agt_main: {
        id: "agt_main",
        kind: "agent",
        harnessId: "hrn_jac",
        displayName: "Jacobian",
        lead: true,
      },
      ...agents,
    },
    model: {
      needsYou: [],
      lanes: [],
      people: { per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: "owner" } },
      fleet: [],
      harnesses: {},
      spaces: [{ id: "sp_desk", title: "Kalshi Trading Desk", runs }],
    },
  } as unknown as Snapshot;
}

async function page(snapshot: Snapshot) {
  await render(
    <SafeAreaProvider initialMetrics={WINDOW}>
      <Profile
        store={fakeStore(snapshot)}
        snapshot={snapshot}
        harnessId="hrn_jac"
        selfId="per_arjun"
      />
    </SafeAreaProvider>,
  );
}

describe("its agents on its page (ADR 0254)", () => {
  it("are five, the Main agent first, and a row opens all of them", async () => {
    await page(jacobian());
    const list = screen.getByTestId("its-agents");
    expect(within(list).getByText("Agents · 7")).toBeTruthy();
    expect(within(list).getAllByTestId(/^agent-agt_[a-z0-9]+$/)).toHaveLength(5);
    expect(within(list).getByTestId("agent-agt_main")).toBeTruthy();
    await userEvent.press(within(list).getByTestId("its-agents-all"));
    expect(pushed).toEqual([
      { pathname: "/harnesses/[id]/[part]", params: { id: "hrn_jac", part: "agents" } },
    ]);
  });

  it("are all there, with no See all, when there are five or fewer", async () => {
    await page(jacobian(4));
    const list = screen.getByTestId("its-agents");
    expect(within(list).getAllByTestId(/^agent-agt_[a-z0-9]+$/)).toHaveLength(5);
    expect(screen.queryByTestId("its-agents-all")).toBeNull();
  });
});

describe("every agent of it, on a page of their own (ADR 0254)", () => {
  async function all(snapshot: Snapshot) {
    await render(
      <SafeAreaProvider initialMetrics={WINDOW}>
        <AllAgents snapshot={snapshot} harnessId="hrn_jac" selfId="per_arjun" />
      </SafeAreaProvider>,
    );
  }

  it("lists the Main agent first, then the rest", async () => {
    await all(jacobian());
    expect(screen.getByRole("header", { name: "Main" })).toBeTruthy();
    expect(screen.getByRole("header", { name: "Agents · 6" })).toBeTruthy();
    expect(screen.getAllByTestId(/^agent-agt_[a-z0-9]+$/)).toHaveLength(7);
  });

  it("finds an agent by its name as it is typed, and says so when none has it", async () => {
    await all(jacobian());
    const field = screen.getByTestId("all-agents-search");
    expect(field).toHaveProp("placeholder", "Search 7 agents");
    await userEvent.type(field, "ana");
    expect(screen.getAllByTestId(/^agent-agt_[a-z0-9]+$/)).toHaveLength(1);
    expect(screen.getByText("Analyst")).toBeTruthy();
    expect(screen.queryByRole("header", { name: "Main" })).toBeNull();
    await userEvent.clear(field);
    await userEvent.type(field, "zebra");
    expect(screen.queryAllByTestId(/^agent-agt_[a-z0-9]+$/)).toHaveLength(0);
    expect(screen.getByTestId("all-agents-none")).toHaveTextContent(/zebra/);
  });

  it("opens an agent's card from its row", async () => {
    await all(jacobian());
    await userEvent.press(screen.getByTestId("agent-agt_2"));
    expect(pushed).toEqual(["/agents/agt_2"]);
  });
});

describe("its recent runs (ADR 0254)", () => {
  const RUNS = [
    {
      runId: "r1",
      spaceId: "sp_desk",
      harnessId: "agt_0",
      goal: "Backtest the October spreads",
      state: "done",
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      costUsd: 0.62,
    },
    {
      runId: "r2",
      spaceId: "sp_desk",
      harnessId: "agt_0",
      goal: "An old one",
      state: "failed",
      startedAt: "2026-09-01T10:00:00.000Z",
    },
  ];

  it("are a row on its page, with how many began this week", async () => {
    await page(jacobian(6, RUNS));
    const row = screen.getByTestId("harness-runs-row");
    expect(row).toHaveProp("accessibilityLabel", "Recent runs, 1 this week");
    await userEvent.press(row);
    expect(pushed).toEqual([
      { pathname: "/harnesses/[id]/[part]", params: { id: "hrn_jac", part: "runs" } },
    ]);
  });

  it("are not on a page that has never run", async () => {
    await page(jacobian());
    expect(screen.queryByTestId("harness-runs-row")).toBeNull();
  });

  it("list the newest first, where, how they ended and what they cost, each opening its space", async () => {
    await render(
      <SafeAreaProvider initialMetrics={WINDOW}>
        <RecentRuns snapshot={jacobian(6, RUNS)} harnessId="hrn_jac" selfId="per_arjun" />
      </SafeAreaProvider>,
    );
    const first = screen.getByTestId("run-r1");
    expect(within(first).getByText("Backtest the October spreads")).toBeTruthy();
    expect(within(first).getByText("Kalshi Trading Desk · 2h · Done")).toBeTruthy();
    expect(within(first).getByText("$0.62")).toBeTruthy();
    expect(within(screen.getByTestId("run-r2")).getByText(/Failed$/)).toBeTruthy();
    await userEvent.press(first);
    expect(pushed).toEqual(["/spaces/sp_desk"]);
  });
});

describe("every ask so far, on a page of their own (ADR 0255)", () => {
  const today = new Date();
  today.setHours(9, 12, 0, 0);
  // Over a week ago, so its heading is its weekday and date.
  const before = new Date(today.getTime() - 9 * 86_400_000);
  before.setHours(5, 0, 0, 0);
  const later = new Date(before.getTime() + 30 * 60_000);
  const ask = (id: string, at: string, resolved?: Record<string, unknown>) => ({
    approvalId: id,
    runId: "r1",
    actionKind: "acp.bash",
    question: `Allow it to ${id}?`,
    askedAt: at,
    risk: [],
    sources: [],
    editable: false,
    fallback: "deny",
    approvers: ["per_arjun"],
    ...(resolved === undefined
      ? {}
      : { resolved: { by: "per_arjun", at, scope: "once", elsewhere: false, ...resolved } }),
  });
  const RUN = {
    runId: "r1",
    spaceId: "sp_desk",
    harnessId: "agt_0",
    goal: "Backtest",
    state: "done",
    approvals: [
      ask("ls", before.toISOString(), { decision: "approved" }),
      ask("rm", later.toISOString(), { decision: "denied" }),
      ask("git push", today.toISOString()),
    ],
  };

  async function asks() {
    await render(
      <SafeAreaProvider initialMetrics={WINDOW}>
        <AskList snapshot={jacobian(6, [RUN])} harnessId="hrn_jac" selfId="per_arjun" />
      </SafeAreaProvider>,
    );
  }

  it("lists them newest first under their days, with the answer and who asked where", async () => {
    await asks();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText(askDay(before.toISOString()))).toBeTruthy();
    const open = screen.getByTestId("ask-row-git push");
    expect(open).toHaveTextContent(
      "Allow it to git push?Waiting for you · Kalshi Operator in Kalshi Trading Desk9:12 AM",
    );
    expect(within(open).getByTestId("ask-mark-open")).toBeTruthy();
    expect(screen.getByTestId("ask-row-rm")).toHaveTextContent(/You said no · Kalshi Operator/);
    expect(within(screen.getByTestId("ask-row-ls")).getByTestId("ask-mark-yes")).toBeTruthy();
  });

  it("keeps the noes alone under No, and opens an ask from its row", async () => {
    await asks();
    expect(screen.getByTestId("ask-filter")).toHaveTextContent("All 3Yes 1No 1");
    await userEvent.press(screen.getByText("No 1"));
    expect(screen.queryByTestId("ask-row-ls")).toBeNull();
    expect(screen.queryByTestId("ask-row-git push")).toBeNull();
    await userEvent.press(screen.getByTestId("ask-row-rm"));
    expect(pushed).toEqual(["/needs/rm"]);
  });
});
