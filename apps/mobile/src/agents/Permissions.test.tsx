/**
 * An agent's Permissions page (ADR 0286): what it says while the agent asks and while it doesn't,
 * Let it work's confirmation, the banner's switch, and the way on to its harness.
 */

import type { Snapshot } from "@chipschat/core";
import { fireEvent, render, screen, userEvent } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import { Permissions } from "./Permissions";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};
const SINCE = "2026-11-06T09:50:00.000Z";
const HARNESS = "har_claude";
const AGENT = "agt_jiro";
const ME = "per_arjun";
const SPACE = "spc_explain";

function page(options: { working?: boolean; more?: Partial<Snapshot>; selfId?: string } = {}) {
  const base = snapshot();
  const shot = {
    ...base,
    directory: {
      [HARNESS]: { id: HARNESS, kind: "harness", displayName: "Claude Code", ownerId: ME },
      [AGENT]: { id: AGENT, kind: "agent", displayName: "Jiro", harnessId: HARNESS, room: SPACE },
      [ME]: { id: ME, kind: "person", displayName: "Arjun", role: "owner" },
      per_dana: { id: "per_dana", kind: "person", displayName: "Dana", role: "member" },
    },
    model: {
      ...base.model,
      people: {
        [ME]: { participantId: ME, displayName: "Arjun", role: "owner" },
        per_dana: { participantId: "per_dana", displayName: "Dana", role: "member" },
      },
      harnesses: { [HARNESS]: { harnessId: HARNESS, autonomy: 1, rules: [], bySpace: {} } },
      spaces: [
        {
          id: SPACE,
          title: "Chips explain",
          state: "open",
          members: [ME, AGENT],
          lines: [],
          runs: [],
          approvals: [],
          ...(options.working === true
            ? { letWork: [{ asker: AGENT, by: ME, since: SINCE }] }
            : {}),
        },
      ],
    },
    keepsBanners: true,
    keepsHeldStart: true,
    ...options.more,
  } as unknown as Snapshot;
  const store = fakeStore(shot);
  const opened: string[] = [];
  return {
    store,
    opened,
    element: (
      <SafeAreaProvider initialMetrics={IPHONE}>
        <Permissions
          store={store}
          snapshot={shot}
          agentId={AGENT}
          selfId={options.selfId ?? ME}
          onOpenHarness={(id) => opened.push(`harness:${id}`)}
          onOpenAsks={(id) => opened.push(`asks:${id}`)}
        />
      </SafeAreaProvider>
    ),
  };
}

const user = () => userEvent.setup();

describe("an agent's Permissions (ADR 0286)", () => {
  it("says it asks, and opens Let it work in place before anything changes", async () => {
    const { element, store } = page();
    await render(element);
    expect(screen.getByTestId("permissions-headline")).toHaveTextContent(
      "Jiro decides when to ask. You decide the answer.",
    );
    await user().press(screen.getByTestId("permissions-let-work"));
    expect(store.calls.map((each) => each.name)).not.toContain("letAgentWork");
    expect(screen.getByTestId("permissions-confirm")).toHaveTextContent(/until you stop it/);
    await user().press(screen.getByTestId("permissions-cancel"));
    expect(screen.queryByTestId("permissions-confirm")).toBeNull();
    expect(store.calls.map((each) => each.name)).not.toContain("letAgentWork");
  });

  it("lets it work on Let Jiro work", async () => {
    const { element, store } = page();
    await render(element);
    await user().press(screen.getByTestId("permissions-let-work"));
    await user().press(screen.getByRole("button", { name: "Let Jiro work" }));
    expect(store.calls).toContainEqual({
      name: "letAgentWork",
      args: { spaceId: SPACE, asker: AGENT },
    });
    expect(screen.queryByTestId("permissions-confirm")).toBeNull();
    expect(screen.getByTestId("permissions-let-work")).toBeDisabled();
  });

  it("offers Stop while it isn't asking, and stops it", async () => {
    const { element, store } = page({ working: true });
    await render(element);
    expect(screen.getByTestId("permissions-headline")).toHaveTextContent(
      "Jiro is working without asking in Chips explain.",
    );
    expect(screen.queryByTestId("permissions-let-work")).toBeNull();
    await user().press(screen.getByTestId("permissions-stop"));
    expect(store.calls).toContainEqual({
      name: "stopLetWork",
      args: { spaceId: SPACE, asker: AGENT },
    });
  });

  it("doesn't offer Let it work to somebody who may not give that yes", async () => {
    const { element } = page({ selfId: "per_dana" });
    await render(element);
    expect(screen.queryByTestId("permissions-let-work")).toBeNull();
  });

  it("turns the banner off and on, and folds its picture", async () => {
    const { element, store } = page({ working: true });
    await render(element);
    expect(
      screen.getByTestId("permissions-preview", { includeHiddenElements: true }),
    ).toHaveTextContent(/Jiro is working without asking/);
    await fireEvent(screen.getByTestId("permissions-banner-switch"), "valueChange", false);
    expect(store.calls).toContainEqual({
      name: "setAgentBanner",
      args: { agentId: AGENT, shown: false },
    });
    const off = page({
      working: true,
      more: { banners: { choices: { [AGENT]: false }, closed: [] } },
    });
    await render(off.element);
    expect(
      screen.getByTestId("permissions-nothing", { includeHiddenElements: true }),
    ).toHaveTextContent("Nothing shows in the space.");
    expect(screen.getByTestId("permissions-banner-row")).toHaveTextContent(/Off for Jiro only/);
  });

  it("says when it is closed for now, and Show again opens it", async () => {
    const { element, store } = page({
      working: true,
      more: { banners: { choices: {}, closed: [{ spaceId: SPACE, asker: AGENT, since: SINCE }] } },
    });
    await render(element);
    expect(screen.getByTestId("permissions-closed")).toHaveTextContent(
      /Closed in Chips explainUntil Jiro is given a new yes/,
    );
    await user().press(screen.getByTestId("permissions-show-again"));
    expect(store.calls).toContainEqual({
      name: "reopenBanner",
      args: { spaceId: SPACE, asker: AGENT },
    });
  });

  it("offers no banner switch on a server that keeps no choices", async () => {
    await render(page({ more: { keepsBanners: false } }).element);
    expect(screen.queryByTestId("permissions-banner")).toBeNull();
  });

  it("goes on to its harness", async () => {
    const { element, opened } = page();
    await render(element);
    await user().press(screen.getByTestId("permissions-harness"));
    expect(opened).toEqual([`harness:${HARNESS}`]);
  });
});
