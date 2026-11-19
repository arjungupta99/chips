/**
 * A harness's Permissions on the phone and the iPad (ADR 0299), the parts its page's own tests
 * leave: New rule, which lights its asks as starts are picked, locks the never list under Allow and
 * saves the rules to the harness or to every harness; and the room's gold band while a harness
 * isn't asking, with Ask again.
 */

import { EVERY_HARNESS, type Snapshot, type Space } from "@chipschat/core";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { HoldBands } from "../../spaces/LetWorkBand";
import { approval, fakeStore, snapshot } from "../../testing/fixtures";
import { NewRule } from "./NewRule";

const asked = (id: string, command: string) =>
  approval({
    approvalId: id,
    actionKind: "acp.bash",
    input: { command },
    risk: [],
    resolved: { decision: "approved", by: "per_arjun", at: "2026-11-18T09:00:00.000Z" },
  } as unknown as Parameters<typeof approval>[0]);

/** Scout asked twice in its room, `ls -la` and `git log`; `hold` as given. */
function asking(hold?: { until?: string; by: string }, every?: { until?: string }): Snapshot {
  const base = snapshot();
  return {
    ...base,
    model: {
      ...base.model,
      spaces: [
        {
          id: "sp_1",
          kind: "room",
          title: "Bakery",
          state: "open",
          members: ["per_arjun", "har_scout"],
          roles: {},
          runs: [
            {
              runId: "run_1",
              harnessId: "har_scout",
              approvals: [asked("apr_1", "ls -la"), asked("apr_2", "git log --oneline")],
              questions: [],
            },
          ],
        },
      ],
      harnesses: {
        har_scout: {
          harnessId: "har_scout",
          autonomy: 1,
          maxAutonomy: 2,
          rules: [],
          bySpace: {},
          ...(hold === undefined ? {} : { hold }),
        },
      },
      workspaceRules: { rules: [], ...(every === undefined ? {} : { hold: every }) },
    },
  } as unknown as Snapshot;
}

describe("New rule (ADR 0299)", () => {
  it("lights its asks as a start is picked, locks the never list under Allow, and saves", async () => {
    const snap = asking();
    const store = fakeStore(snap);
    const done = jest.fn();
    await render(<NewRule store={store} snapshot={snap} harnessId="har_scout" onDone={done} />);
    expect(screen.getByTestId("rule-save")).toBeDisabled();
    expect(screen.getByTestId("rule-chip-rm")).toBeDisabled();
    expect(screen.getByTestId("rule-count")).toHaveTextContent("0");
    await userEvent.press(screen.getByTestId("rule-chip-git log"));
    expect(screen.getByTestId("rule-picked")).toHaveTextContent("1 picked");
    expect(screen.getByTestId("rule-count")).toHaveTextContent("1");
    await userEvent.press(screen.getByTestId("rule-save"));
    expect(store.calls.filter((each) => each.name === "setRules")).toEqual([
      {
        name: "setRules",
        args: {
          harnessId: "har_scout",
          spaceId: undefined,
          rules: [{ match: "*", when: { starts_with: ["git", "log"] }, decision: "allow" }],
        },
      },
    ]);
    expect(screen.getByTestId("rule-save")).toHaveTextContent("Saved");
  });

  it("refuses with Never, every harness's rules going to the workspace", async () => {
    const snap = asking();
    const store = fakeStore(snap);
    await render(
      <NewRule store={store} snapshot={snap} harnessId={EVERY_HARNESS} onDone={() => undefined} />,
    );
    await userEvent.press(screen.getByRole("radio", { name: "Never" }));
    expect(screen.getByTestId("rule-chip-rm")).not.toBeDisabled();
    await userEvent.press(screen.getByTestId("rule-chip-rm"));
    await userEvent.press(screen.getByTestId("rule-save"));
    expect(store.calls.filter((each) => each.name === "setWorkspaceRules")).toEqual([
      {
        name: "setWorkspaceRules",
        args: { rules: [{ match: "*", when: { starts_with: ["rm"] }, decision: "deny" }] },
      },
    ]);
  });
});

describe("the room's line while Chips says yes for a harness (ADR 0299, 0300)", () => {
  const room = (snap: Snapshot) => snap.model.spaces[0] as Space;

  it("says so in a plain line, and Ask again turns its asks back on", async () => {
    const snap = asking({ by: "per_arjun" });
    const store = fakeStore(snap);
    await render(
      <HoldBands store={store} space={room(snap)} directory={snap.directory} selfId="per_arjun" />,
    );
    expect(screen.getByTestId("hold-bands")).toHaveTextContent(
      "Chips is saying yes for ScoutAsk again",
    );
    await fireEvent.press(screen.getByTestId("hold-band-resume"));
    expect(store.calls).toContainEqual({ name: "resumeHarness", args: "har_scout" });
  });

  it("says Chips is saying yes for every harness while that holds, and Ask again ends it", async () => {
    const until = new Date(Date.now() + 3_600_000).toISOString();
    const snap = asking(undefined, { until });
    const store = fakeStore(snap);
    await render(
      <HoldBands store={store} space={room(snap)} directory={snap.directory} selfId="per_arjun" />,
    );
    expect(screen.getByTestId("hold-bands")).toHaveTextContent(
      /^Chips is saying yes for every harness until /,
    );
    await fireEvent.press(screen.getByTestId("hold-band-resume"));
    expect(store.calls).toContainEqual({ name: "setWorkspaceRules", args: { hold: null } });
  });

  it("draws nothing while every harness is asking", async () => {
    const snap = asking();
    await render(
      <HoldBands
        store={fakeStore(snap)}
        space={room(snap)}
        directory={snap.directory}
        selfId="per_arjun"
      />,
    );
    expect(screen.queryByTestId("hold-bands")).toBeNull();
  });
});
