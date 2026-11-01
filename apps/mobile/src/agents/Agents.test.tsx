/**
 * The Agents tab (ADR 0087, Phase 5): the Main agent, then the agents with the free one first and
 * the rest by when their room last spoke, the archived ones behind a row, and the harnesses.
 */

import type { Snapshot } from "@chipschat/core";
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
import { agentsSnapshot, ME } from "../testing/agents";
import { fakeStore } from "../testing/fixtures";
import { drawLibrary } from "../testing/picker";
import { avatarHueIndex } from "../ui/sourceColours";
import { Agents } from "./Agents";
import { Archived } from "./Archived";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const pushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => pushed.push(to) }),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
  // A pushed page's bar (the Archived page's): its title, and what stands at its right.
  Stack: {
    Screen: ({
      options,
    }: {
      options: { title?: string; headerRight?: () => import("react").ReactNode };
    }) => {
      const react = require("react");
      const { Text } = require("react-native");
      return react.createElement(
        react.Fragment,
        null,
        react.createElement(Text, { testID: "bar-title" }, options.title),
        options.headerRight?.() ?? null,
      );
    },
  },
}));
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  useDeferredSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  // What the connection's words read of the pairing, when the server can't be reached.
  useChips: () => ({ paired: undefined, ended: () => undefined }),
}));

beforeEach(() => {
  pushed.length = 0;
});

/** The workspace with the agents named locked (ADR 0199). */
function withLocked(...ids: readonly string[]): Snapshot {
  const base = agentsSnapshot();
  const directory: Record<string, object> = { ...base.directory };
  for (const id of ids) directory[id] = { ...directory[id], locked: true };
  return { ...base, directory } as unknown as Snapshot;
}

describe("the Agents tab", () => {
  it("lists the Main agent, the free one first, then by their rooms' last line", async () => {
    await render(<Agents store={fakeStore(agentsSnapshot())} selfId={ME} />);
    const rows = screen.getAllByTestId(/^agent-agt_/).map((row) => row.props["testID"]);
    expect(rows).toEqual([
      "agent-agt_j",
      "agent-agt_bland",
      "agent-agt_main",
      "agent-agt_shopping",
      "agent-agt_direct",
    ]);
    expect(screen.getByText("Agents · 4")).toBeTruthy();
    // The Main agent wears the Main tag rather than standing under a heading (ADR 0145).
    expect(screen.queryByText("Main agent")).toBeNull();
    expect(within(screen.getByTestId("agent-agt_j")).getByTestId("main-tag")).toHaveTextContent(
      "Main",
    );
    expect(screen.getAllByTestId("main-tag")).toHaveLength(1);
    expect(screen.getByTestId("agent-agt_j").props["accessibilityLabel"]).toMatch(
      /^J, Main agent, /,
    );
  });

  it("draws again only the row of an agent that changed, not every row for every word", async () => {
    const motion = jest.requireMock<{ PickRow: (props: unknown) => unknown }>(
      "../spaces/SelectMotion",
    );
    const drawn = jest.spyOn(motion, "PickRow");
    const ids = () =>
      drawn.mock.calls.map(
        ([props]) =>
          (props as { children: { props: { row?: { id: string } } }[] }).children[1]?.props.row?.id,
      );
    const snapshot = agentsSnapshot();
    const view = await render(<Agents store={fakeStore(snapshot)} selfId={ME} />);
    // The wrapper is the render's own, kept for the tree drawn again.
    const again = (next: Snapshot) => view.rerender(<Agents store={fakeStore(next)} selfId={ME} />);

    // A word in a room that changes no agent: the tab is made afresh, and no row is drawn.
    drawn.mockClear();
    await again({ ...snapshot, model: { ...snapshot.model } } as Snapshot);
    expect(ids()).toEqual([]);

    // One agent renamed: its row alone.
    drawn.mockClear();
    const directory = snapshot.directory as Record<string, { displayName: string }>;
    await again({
      ...snapshot,
      directory: { ...directory, agt_main: { ...directory["agt_main"], displayName: "Main two" } },
    } as unknown as Snapshot);
    expect(ids()).toEqual(["agt_main"]);
    drawn.mockRestore();
  });

  it("says where each is, a free one in amber with what waits, and which is working", async () => {
    await render(<Agents store={fakeStore(agentsSnapshot())} selfId={ME} />);
    const row = (id: string) => within(screen.getByTestId(`agent-${id}`));
    // Its room is named after it, as a Space's is: the harness alone (ADR 0145).
    expect(row("agt_j").getByText("Jacobian")).toBeTruthy();
    expect(row("agt_main").getByText("OpenClaw · in Hello")).toBeTruthy();
    expect(row("agt_direct").getByText("OpenClaw · with you")).toBeTruthy();
    expect(row("agt_bland").getByText("Free · Jacobian")).toBeTruthy();
    expect(row("agt_bland").getByText("1 waiting")).toBeTruthy();
    expect(row("agt_shopping").getByText("Working ·")).toBeTruthy();
  });

  it("draws each agent in its own face: the one chosen for it, or its initials", async () => {
    const snapshot = agentsSnapshot();
    const worn = {
      ...snapshot,
      directory: {
        ...snapshot.directory,
        agt_shopping: { ...snapshot.directory["agt_shopping"], face: { icon: "cart", ground: 4 } },
      },
    } as typeof snapshot;
    await render(<Agents store={fakeStore(worn)} selfId={ME} />);
    // The face is decoration inside a row that says the name, so it is looked for as hidden.
    const face = (id: string) =>
      within(screen.getByTestId(`agent-face-${id}`, { includeHiddenElements: true }));
    const hidden = { includeHiddenElements: true };
    // A chosen mark takes the initials' place; an agent nobody chose for keeps its own.
    expect(face("agt_shopping").queryByText("S", hidden)).toBeNull();
    expect(face("agt_j").getByText("J", hidden)).toBeTruthy();
    // Every agent in the list wears the mark's pins, at work or not.
    expect(face("agt_shopping").getByTestId("agent-pins", hidden)).toBeTruthy();
    expect(face("agt_j").getByTestId("agent-pins", hidden)).toBeTruthy();
  });

  it("changes an agent's face on a long press, on the sheet a space's is changed on", async () => {
    const store = fakeStore(agentsSnapshot());
    await render(<Agents store={store} selfId={ME} />);
    expect(screen.queryByTestId("icon-sheet")).toBeNull();
    fireEvent(screen.getByTestId("agent-agt_shopping"), "longPress");
    const sheet = within(await screen.findByTestId("icon-sheet"));
    await drawLibrary();
    // The head is the agent: its name, and its harness under it.
    expect(sheet.getByText("Shopping")).toBeTruthy();
    expect(sheet.getByText("Jacobian")).toBeTruthy();

    await userEvent.press(screen.getByTestId("mark-cart"));
    await userEvent.press(screen.getByTestId("ground-4"));
    expect(store.calls.filter((each) => each.name === "setAgentFace")).toEqual([
      // No colour chosen yet, so the mark lands on the hue its name already wears.
      {
        name: "setAgentFace",
        args: {
          agentId: "agt_shopping",
          face: { icon: "cart", ground: avatarHueIndex("Shopping") },
        },
      },
      // The colour keeps the mark just tapped, though this store never takes it: the sheet wears
      // what it asked for until the store says otherwise (9 October 2026).
      {
        name: "setAgentFace",
        args: { agentId: "agt_shopping", face: { icon: "cart", ground: 4 } },
      },
    ]);
  });

  it("takes no long press from a guest, who changes nothing about the workspace", async () => {
    const snapshot = agentsSnapshot();
    const asGuest = {
      ...snapshot,
      model: {
        ...snapshot.model,
        people: {
          [ME]: {
            participantId: ME,
            displayName: "Arjun",
            role: "guest",
            joinedAt: "2026-09-05T00:00:00.000Z",
          },
        },
      },
    } as typeof snapshot;
    await render(<Agents store={fakeStore(asGuest)} selfId={ME} />);
    fireEvent(screen.getByTestId("agent-agt_shopping"), "longPress");
    expect(screen.queryByTestId("icon-sheet")).toBeNull();
  });

  it("folds the archived ones into a row, and shelves the harnesses at its head (ADR 0185)", async () => {
    await render(<Agents store={fakeStore(agentsSnapshot())} selfId={ME} />);
    expect(screen.queryByText("Chess Game")).toBeNull();
    await userEvent.press(screen.getByTestId("archived-agents"));
    expect(pushed).toEqual(["/agents/archived"]);
    expect(screen.getByLabelText("Archived · 2")).toBeTruthy();
    // No heading at the foot: the harnesses stand on their shelf, over the Main agents.
    expect(screen.queryByText("Harnesses")).toBeNull();
    const shelf = screen.getByTestId("harness-shelf");
    expect(within(shelf).getByRole("button", { name: "Jacobian" })).toBeTruthy();
    expect(within(shelf).getByRole("button", { name: "OpenClaw" })).toBeTruthy();
  });

  it("opens an agent's card, pushed on a phone and beside the list when told how", async () => {
    await render(<Agents store={fakeStore(agentsSnapshot())} selfId={ME} />);
    await userEvent.press(screen.getByTestId("agent-agt_shopping"));
    expect(pushed).toEqual(["/agents/agt_shopping"]);

    const opened: string[] = [];
    await render(
      <Agents
        store={fakeStore(agentsSnapshot())}
        selfId={ME}
        selected="agt_main"
        onOpen={(id) => opened.push(id)}
      />,
    );
    expect(screen.getByTestId("agent-agt_main")).toBeSelected();
    await userEvent.press(screen.getByTestId("agent-agt_main"));
    expect(opened).toEqual(["agt_main"]);
  });
});

/**
 * The phone keeps who is who from the server's last answer (14 October 2026). Before it ever had
 * one, a cold start said "Agents · 0" and "No agents yet" until the server answered.
 */
describe("a guest's agents (ADR 0196)", () => {
  const PRIYA = "usr_priya";
  /** Priya, Arjun's guest in Hello, told only of who is in Hello and the harness behind its agent. */
  function asGuest(): Snapshot {
    const snapshot = agentsSnapshot();
    const { directory, model } = snapshot;
    const hello = model.spaces.find((each) => each.id === "spc_hello");
    return {
      ...snapshot,
      directory: {
        [ME]: directory[ME],
        [PRIYA]: { id: PRIYA, kind: "person", displayName: "Priya" },
        hrn_openclaw: directory["hrn_openclaw"],
        agt_main: directory["agt_main"],
      } as Snapshot["directory"],
      model: {
        ...model,
        people: {
          ...model.people,
          [PRIYA]: {
            participantId: PRIYA,
            displayName: "Priya",
            role: "guest",
            joinedAt: "2026-10-18T00:00:00.000Z",
            invitedBy: ME,
          },
        },
        spaces: hello === undefined ? [] : [{ ...hello, members: [...hello.members, PRIYA] }],
      },
    };
  }

  it("names whose each agent is, and says so under them", async () => {
    await render(<Agents store={fakeStore(asGuest())} selfId={PRIYA} />);
    expect(
      within(screen.getByTestId("agent-agt_main")).getByText("Arjun's agent · in Hello"),
    ).toBeTruthy();
    expect(screen.getByTestId("agents-guest-foot")).toHaveTextContent(
      "OpenClaw is Arjun's agent and answers in Hello.",
    );
    expect(screen.queryByTestId("harness-shelf")).toBeNull();
  });

  it("changes nothing for an owner or a member", async () => {
    const snapshot = agentsSnapshot();
    const asMember = {
      ...snapshot,
      model: {
        ...snapshot.model,
        people: {
          [ME]: {
            participantId: ME,
            displayName: "Arjun",
            role: "member",
            joinedAt: "2026-09-05T00:00:00.000Z",
          },
        },
      },
    } as typeof snapshot;
    for (const each of [snapshot, asMember]) {
      const { unmount } = await render(<Agents store={fakeStore(each)} selfId={ME} />);
      expect(
        within(screen.getByTestId("agent-agt_main")).getByText("OpenClaw · in Hello"),
      ).toBeTruthy();
      expect(screen.queryByTestId("agents-guest-foot")).toBeNull();
      await unmount();
    }
  });
});

describe("before this phone has the server's word on who is who", () => {
  /** A phone that has never had an answer: nobody known, and nothing kept. */
  const unknown = (over: Partial<Snapshot> = {}): Snapshot => {
    const { directoryFrom: _kept, ...rest } = agentsSnapshot();
    return { ...rest, directory: {}, ...over };
  };

  it("stands blank agents where the list will be, and never says there are none", async () => {
    await render(<Agents store={fakeStore(unknown())} selfId={ME} />);
    expect(screen.getByTestId("agents-fetching")).toBeTruthy();
    expect(screen.getByLabelText("Loading your agents")).toBeTruthy();
    // A Main agent's place and three more: blank faces with their pins.
    expect(screen.getAllByTestId("blank-face", { includeHiddenElements: true })).toHaveLength(4);
    expect(screen.queryByText(/No agents yet/)).toBeNull();
    expect(screen.queryByText(/No harnesses yet/)).toBeNull();
    expect(screen.queryByText(/^Agents · /)).toBeNull();
    expect(screen.queryByTestId("add-agent")).toBeNull();
  });

  it("draws nothing at all while the phone is still reading what it kept", async () => {
    await render(<Agents store={fakeStore(unknown({ readingCache: true }))} selfId={ME} />);
    expect(screen.queryByTestId("agents-fetching")).toBeNull();
    expect(screen.queryByTestId(/^agent-agt_/)).toBeNull();
    expect(screen.queryByText(/No agents yet/)).toBeNull();
  });

  it("lists what it kept from the last answer while the server is out of reach", async () => {
    const kept = {
      ...agentsSnapshot(),
      directoryFrom: "cache" as const,
      connection: "closed" as const,
    };
    await render(<Agents store={fakeStore(kept)} selfId={ME} />);
    expect(screen.getByTestId("agent-agt_j")).toBeTruthy();
    expect(screen.getByText("Agents · 4")).toBeTruthy();
    expect(screen.queryByTestId("no-agents-closed")).toBeNull();
  });

  /** Fake timers for one test: the first load's patience is four seconds of trouble. */
  async function patiently(test: () => Promise<void>): Promise<void> {
    jest.useFakeTimers();
    try {
      await test();
    } finally {
      jest.useRealTimers();
    }
  }
  const waitOut = () =>
    act(async () => {
      jest.advanceTimersByTime(4000);
    });

  it("stands blank agents through a launch's blip, then says the server can't be reached", () =>
    patiently(async () => {
      // His iPhone through the relay (14 October 2026): a socket closing and opening again in a
      // second or two at launch is not "Can't reach your server".
      const store = fakeStore(unknown({ connection: "closed" }));
      await render(<Agents store={store} selfId={ME} server="100.64.0.7:4431" />);
      expect(screen.getByTestId("agents-fetching")).toBeTruthy();
      expect(screen.queryByTestId("no-agents-closed")).toBeNull();
      await waitOut();
      expect(screen.getByTestId("no-agents-closed")).toBeTruthy();
      expect(screen.getByText("Can't reach your server")).toBeTruthy();
      expect(screen.getByText(/^Your agents will show here as soon as it answers/)).toBeTruthy();
      expect(screen.getByText("100.64.0.7:4431")).toBeTruthy();
      // The body says it, so the bar's mark stands down rather than saying it twice.
      expect(screen.queryByTestId("connection")).toBeNull();
      fireEvent.press(screen.getByText("Try again"));
      expect(store.calls.filter((each) => each.name === "wake")).toHaveLength(1);
    }));

  it("says the server is being reached when it tries again, once trouble was said", () =>
    patiently(async () => {
      const closed = fakeStore(unknown({ connection: "closed" }));
      const view = await render(<Agents store={closed} selfId={ME} />);
      await waitOut();
      expect(screen.getByTestId("no-agents-closed")).toBeTruthy();
      // The next try: not back to blank agents and out again, but the server being reached.
      await view.rerender(
        <Agents store={fakeStore(unknown({ connection: "connecting" }))} selfId={ME} />,
      );
      expect(screen.getByTestId("no-agents-connecting")).toBeTruthy();
      expect(screen.getByText("Reaching your server")).toBeTruthy();
      expect(screen.queryByTestId("agents-fetching")).toBeNull();
    }));

  it("says the list didn't come when the server is there, and asks for it again", () =>
    patiently(async () => {
      const asked: string[] = [];
      const store = Object.assign(fakeStore(unknown({ directoryFailed: true })), {
        refreshDirectory: async () => {
          asked.push("directory");
        },
      });
      await render(<Agents store={store} selfId={ME} />);
      // The store has already tried three times; still, a moment's patience first.
      expect(screen.getByTestId("agents-fetching")).toBeTruthy();
      await waitOut();
      expect(screen.getByTestId("no-agents-failed")).toBeTruthy();
      expect(screen.getByText("Couldn't load your agents")).toBeTruthy();
      // Once as the tab comes into focus, as always; then once for the tap.
      expect(asked).toHaveLength(1);
      await act(async () => {
        fireEvent.press(screen.getByText("Try again"));
      });
      expect(asked).toHaveLength(2);
    }));
});

describe("the archived agents", () => {
  it("come with the ones in rooms you're not in folded under their own row", async () => {
    await render(<Archived store={fakeStore(agentsSnapshot())} selfId={ME} />);
    expect(screen.getByTestId("agent-agt_chess")).toBeTruthy();
    expect(screen.queryByTestId("agent-agt_researcher")).toBeNull();
    await userEvent.press(screen.getByTestId("archived-elsewhere"));
    expect(
      within(screen.getByTestId("agent-agt_researcher")).getByText(
        "Jacobian · was in a space you're not in",
      ),
    ).toBeTruthy();
    await userEvent.press(screen.getByTestId("agent-agt_chess"));
    expect(pushed).toEqual(["/agents/agt_chess"]);
  });
});

describe("archiving and deleting from a row (ADR 0095)", () => {
  const actions = (id: string) =>
    (screen.getByTestId(`agent-${id}`).props["accessibilityActions"] as { name: string }[]).map(
      (each) => each.name,
    );

  it("offers the harness's owner Archive and Delete on a row, and nothing on J's", async () => {
    await render(<Agents store={fakeStore(agentsSnapshot())} selfId={ME} />);
    expect(actions("agt_shopping")).toEqual(["changeIcon", "archive", "delete"]);
    expect(actions("agt_j")).toEqual(["changeIcon"]);
  });

  it("asks before archiving, from the row's action, then archives", async () => {
    const store = fakeStore(agentsSnapshot());
    await render(<Agents store={store} selfId={ME} />);
    fireEvent(screen.getByTestId("agent-agt_main"), "accessibilityAction", {
      nativeEvent: { actionName: "archive" },
    });
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByRole("header")).toHaveTextContent("Archive OpenClaw?");
    await userEvent.press(within(sheet).getByTestId("confirm-go"));
    expect(store.calls.filter((each) => each.name === "setAgentArchived")).toEqual([
      { name: "setAgentArchived", args: { agentId: "agt_main", archived: true } },
    ]);
  });

  it("offers Locked in place of Archive and Delete on a locked agent's row (ADR 0199)", async () => {
    const store = fakeStore(withLocked("agt_shopping"));
    await render(<Agents store={store} selfId={ME} />);
    expect(actions("agt_shopping")).toEqual(["changeIcon", "locked"]);
    const labels = (
      screen.getByTestId("agent-agt_shopping").props["accessibilityActions"] as { label: string }[]
    ).map((each) => each.label);
    expect(labels).toContain("Locked, show details");
    // It asks nothing: the card opens, its lock's row to glow.
    fireEvent(screen.getByTestId("agent-agt_shopping"), "accessibilityAction", {
      nativeEvent: { actionName: "locked" },
    });
    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(pushed).toEqual([
      { pathname: "/agents/[id]", params: { id: "agt_shopping", lock: "1" } },
    ]);
    expect(store.calls.filter((each) => each.name === "setAgentArchived")).toEqual([]);
  });

  it("opens a locked agent's card beside the list when told how", async () => {
    const opened: string[] = [];
    await render(
      <Agents
        store={fakeStore(withLocked("agt_shopping"))}
        selfId={ME}
        onOpen={() => undefined}
        onOpenLocked={(id) => opened.push(id)}
      />,
    );
    fireEvent(screen.getByTestId("agent-agt_shopping"), "accessibilityAction", {
      nativeEvent: { actionName: "locked" },
    });
    expect(opened).toEqual(["agt_shopping"]);
    expect(pushed).toEqual([]);
  });

  it("offers Unarchive and Locked on a locked archived agent's row", async () => {
    await render(<Archived store={fakeStore(withLocked("agt_chess"))} selfId={ME} />);
    expect(actions("agt_chess")).toEqual(["unarchive", "locked"]);
    fireEvent(screen.getByTestId("agent-agt_chess"), "accessibilityAction", {
      nativeEvent: { actionName: "locked" },
    });
    expect(pushed).toEqual([{ pathname: "/agents/[id]", params: { id: "agt_chess", lock: "1" } }]);
  });

  it("offers Unarchive on the Archived page, which does not ask", async () => {
    const store = fakeStore(agentsSnapshot());
    await render(<Archived store={store} selfId={ME} />);
    expect(actions("agt_chess")).toEqual(["unarchive", "delete"]);
    fireEvent(screen.getByTestId("agent-agt_chess"), "accessibilityAction", {
      nativeEvent: { actionName: "unarchive" },
    });
    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(store.calls.filter((each) => each.name === "setAgentArchived")).toEqual([
      { name: "setAgentArchived", args: { agentId: "agt_chess", archived: false } },
    ]);
  });
});

describe("picking agents to archive or delete together (ADR 0182)", () => {
  // The motion is plain views under Jest (`jest.setup.js`): a row says whether it is picked as a
  // checkbox, and a fold lands at once.
  const press = (name: string) => userEvent.press(screen.getByRole("button", { name }));
  const row = (id: string) => screen.getByTestId(`agent-${id}`);
  const called = (store: ReturnType<typeof fakeStore>, name: string) =>
    store.calls.filter((each) => each.name === name).map((each) => each.args);

  it("turns each agent's row into a checkbox from Select, and the Main agent can't be picked", async () => {
    await render(<Agents store={fakeStore(agentsSnapshot())} selfId={ME} />);
    await userEvent.press(screen.getByTestId("select-agents"));
    expect(screen.getByText("Select agents")).toBeTruthy();
    expect(screen.getByText("Main agents can't be picked")).toBeTruthy();
    expect(row("agt_shopping").props["accessibilityRole"]).toBe("checkbox");
    expect(row("agt_shopping")).not.toBeChecked();

    await userEvent.press(row("agt_shopping"));
    expect(row("agt_shopping")).toBeChecked();
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Archive 1" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete 1" })).toBeTruthy();

    // J stays as it is, and says why; it opens no card.
    await userEvent.press(row("agt_j"));
    expect(row("agt_j")).not.toBeChecked();
    expect(screen.getByTestId("pick-note")).toHaveTextContent(
      "J is its harness's Main agent: it can't be archived or deleted.",
    );
    expect(pushed).toEqual([]);

    await press("Done");
    expect(screen.getByText("Agents")).toBeTruthy();
    expect(row("agt_shopping").props["accessibilityRole"]).toBe("button");
    expect(screen.queryByTestId("pick-bar")).toBeNull();
  });

  it("can't pick a locked agent, which wears the padlock and says why (ADR 0199)", async () => {
    await render(<Agents store={fakeStore(withLocked("agt_shopping"))} selfId={ME} />);
    await userEvent.press(screen.getByTestId("select-agents"));
    // Said as locked, not as somebody else's.
    expect(screen.getByText("Main and locked agents can't be picked")).toBeTruthy();
    expect(row("agt_shopping").props["accessibilityLabel"]).toMatch(/, locked$/);
    await userEvent.press(row("agt_shopping"));
    expect(row("agt_shopping")).not.toBeChecked();
    expect(screen.getByTestId("pick-note")).toHaveTextContent(
      "Shopping is locked. Unlock it on its card to archive or delete it.",
    );
    expect(screen.queryByRole("button", { name: "Archive 1" })).toBeNull();
    expect(pushed).toEqual([]);
    // The others are still picked.
    await userEvent.press(row("agt_main"));
    expect(row("agt_main")).toBeChecked();
  });

  it("offers no Select to a guest, who changes nothing about the workspace", async () => {
    const snapshot = agentsSnapshot();
    const asGuest = {
      ...snapshot,
      model: {
        ...snapshot.model,
        people: {
          [ME]: {
            participantId: ME,
            displayName: "Arjun",
            role: "guest",
            joinedAt: "2026-09-05T00:00:00.000Z",
          },
        },
      },
    } as typeof snapshot;
    await render(<Agents store={fakeStore(asGuest)} selfId={ME} />);
    expect(screen.queryByTestId("select-agents")).toBeNull();
  });

  it("archives the picked agents after asking once, and stops picking", async () => {
    const store = fakeStore(agentsSnapshot());
    await render(<Agents store={store} selfId={ME} />);
    await userEvent.press(screen.getByTestId("select-agents"));
    await userEvent.press(row("agt_shopping"));
    await userEvent.press(row("agt_main"));

    await press("Archive 2");
    const sheet = within(await screen.findByTestId("confirm-sheet"));
    expect(sheet.getByRole("header")).toHaveTextContent("Archive 2 agents?");
    // In the list's order: OpenClaw's room spoke last.
    expect(sheet.getByText("OpenClaw and Shopping")).toBeTruthy();
    expect(called(store, "setAgentArchived")).toEqual([]);

    await userEvent.press(sheet.getByTestId("confirm-go"));
    expect(called(store, "setAgentArchived")).toEqual([
      { agentId: "agt_main", archived: true },
      { agentId: "agt_shopping", archived: true },
    ]);
    expect(screen.getByText("Agents")).toBeTruthy();
  });

  /** Arjun owns Shopping's room and Hello, so he may delete them with their agents. */
  function owned(): Snapshot {
    const snapshot = agentsSnapshot();
    return {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: snapshot.model.spaces.map((space) =>
          space.id === "spc_shopping" || space.id === "spc_hello"
            ? { ...space, roles: { [ME]: "owner" } }
            : space,
        ),
      },
    } as Snapshot;
  }

  it.each([
    ["on", true],
    ["off", false],
  ])(
    "deletes the picked agents one by one, with the spaces they leave while the switch is %s",
    async (_, on) => {
      const store = fakeStore(owned());
      await render(<Agents store={store} selfId={ME} />);
      await userEvent.press(screen.getByTestId("select-agents"));
      await userEvent.press(row("agt_shopping"));
      await userEvent.press(row("agt_main"));

      await press("Delete 2");
      const sheet = within(await screen.findByTestId("confirm-sheet"));
      expect(sheet.getByRole("header")).toHaveTextContent("Delete 2 agents?");
      expect(sheet.getByText("Delete their 2 spaces too")).toBeTruthy();
      if (!on) fireEvent(sheet.getByTestId("confirm-too"), "valueChange", false);
      await userEvent.press(sheet.getByTestId("confirm-go"));
      expect(called(store, "deleteAgent")).toEqual([
        { agentId: "agt_main", options: { deleteRoom: on } },
        { agentId: "agt_shopping", options: { deleteRoom: on } },
      ]);
    },
  );

  it("keeps the sheet up with an agent the server would not delete, and why", async () => {
    const store = fakeStore(agentsSnapshot());
    const refusing = Object.assign(store, {
      deleteAgent: async (agentId: string) => {
        if (agentId === "agt_main") throw new Error("Not yours to delete.");
      },
    });
    await render(<Agents store={refusing} selfId={ME} />);
    await userEvent.press(screen.getByTestId("select-agents"));
    await userEvent.press(row("agt_shopping"));
    await userEvent.press(row("agt_main"));
    await press("Delete 2");
    const sheet = within(await screen.findByTestId("confirm-sheet"));
    await userEvent.press(sheet.getByTestId("confirm-go"));

    // What went is gone; what the server refused is asked about again, alone, with why.
    expect(
      await sheet.findByText(/1 deleted\. OpenClaw was not deleted: Not yours to delete\./),
    ).toBeTruthy();
    expect(sheet.getByRole("header")).toHaveTextContent("Delete OpenClaw?");
    await act(async () => undefined);
  });
});

describe("picking archived agents to unarchive or delete together", () => {
  const press = (name: string) => userEvent.press(screen.getByRole("button", { name }));
  const row = (id: string) => screen.getByTestId(`agent-${id}`);
  const called = (store: ReturnType<typeof fakeStore>, name: string) =>
    store.calls.filter((each) => each.name === name).map((each) => each.args);
  const title = () => screen.getByTestId("bar-title");

  it("puts picked agents back at once from Select in the bar, with no sheet", async () => {
    const store = fakeStore(agentsSnapshot());
    await render(<Archived store={store} selfId={ME} />);
    expect(title()).toHaveTextContent("Archived");
    await userEvent.press(screen.getByTestId("select-archived"));
    expect(title()).toHaveTextContent("Select agents");
    expect(row("agt_chess").props["accessibilityRole"]).toBe("checkbox");

    await userEvent.press(row("agt_chess"));
    // The ones in rooms you're not in can be picked once their row is opened.
    await userEvent.press(screen.getByTestId("archived-elsewhere"));
    await userEvent.press(row("agt_researcher"));
    expect(title()).toHaveTextContent("2 selected");
    expect(screen.getByRole("button", { name: "Delete 2" })).toBeTruthy();

    await press("Unarchive 2");
    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(called(store, "setAgentArchived")).toEqual([
      { agentId: "agt_chess", archived: false },
      { agentId: "agt_researcher", archived: false },
    ]);
    expect(title()).toHaveTextContent("Archived");
    expect(screen.queryByTestId("pick-bar")).toBeNull();
    await act(async () => undefined);
  });

  it("asks before deleting picked archived agents, then deletes them", async () => {
    const store = fakeStore(agentsSnapshot());
    await render(<Archived store={store} selfId={ME} />);
    await userEvent.press(screen.getByTestId("select-archived"));
    await userEvent.press(row("agt_chess"));
    await press("Delete 1");
    const sheet = within(await screen.findByTestId("confirm-sheet"));
    expect(called(store, "deleteAgent")).toEqual([]);
    await userEvent.press(sheet.getByTestId("confirm-go"));
    expect(called(store, "deleteAgent")).toEqual([
      expect.objectContaining({ agentId: "agt_chess" }),
    ]);
    await act(async () => undefined);
  });
});
