/**
 * A new space from the +: who may be asked — and, until the directory is read, who was last time —
 * the window's words, the send and its order, the draft a fold keeps, and the room held under the
 * window until it has gone into it. The window's motion is Reanimated's and stands in here as its
 * words, its stages run at once (`jest.setup.js`).
 */

import type { Participant, Snapshot, Store } from "@chipschat/core";
import { act, fireEvent, render, screen, userEvent, within } from "@testing-library/react-native";
import { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { SETTINGS } from "../prefs";
import { fakeStore, type Recorded, snapshot } from "../testing/fixtures";
import { NewSpaceProvider, useDrawnUnderWindow, useNewSpace, useUnderWindow } from "./NewSpace";
import { loadRemembered } from "./remembered";

const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { appearance: "appearance", newSpace: "new-space" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

let mockStore: Store | undefined;
let mockWorkspace = "ws_1";
jest.mock("../store/provider", () => ({
  useChips: () => ({
    paired:
      mockStore === undefined
        ? undefined
        : { store: mockStore, device: { workspaceId: mockWorkspace } },
  }),
  useSnapshot: (store: Store) => store.getSnapshot(),
}));

const { holds } = jest.requireMock("./Window") as {
  holds: { covering: boolean; revealing: boolean; cover: () => void; reveal: () => void };
};

/** The fixture's workspace, with these harnesses declaring that they take new spaces. */
function taking(...ids: readonly string[]): Snapshot {
  const base = snapshot();
  const directory: Record<string, Participant> = {
    ...base.directory,
    har_ledger: { id: "har_ledger", kind: "harness", displayName: "Ledger" },
    har_claude: { id: "har_claude", kind: "harness", displayName: "Claude Code" },
  };
  for (const id of ids) {
    const each = directory[id];
    if (each !== undefined) directory[id] = { ...each, capabilities: ["new_spaces"] };
  }
  return { ...base, directory };
}

/** A stand-in for the + by the bar, there whoever there is to ask: it opens the window from where
 * the + is. */
function PlusButton() {
  const { harnesses, open } = useNewSpace();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="New space"
      onPress={() => open({ x: 319, y: 791, width: 62, height: 62 })}
    >
      <Text>{harnesses.length === 0 ? "Nobody to ask" : `${harnesses.length} to ask`}</Text>
    </Pressable>
  );
}

/** Whether the stand-in room draws itself as soon as it is under the window; a test may hold it. */
let drawsAtOnce = true;

/**
 * A room's screen, as far as the window is anything to it: whether it is still under it, and that
 * it has drawn itself, as soon as it is under it or when it is pressed.
 */
function Room({ spaceId }: { readonly spaceId: string }) {
  const under = useUnderWindow(spaceId);
  const drawn = useDrawnUnderWindow(spaceId);
  useEffect(() => {
    if (under && drawsAtOnce) drawn();
  }, [under, drawn]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Draw ${spaceId}`} onPress={drawn}>
      <Text testID={`room-${spaceId}`}>{under ? "under the window" : "clear"}</Text>
    </Pressable>
  );
}

async function renderWith(state: Snapshot, room = "sp_new") {
  const store = fakeStore(state);
  mockStore = store;
  await render(
    <NewSpaceProvider>
      <PlusButton />
      <Room spaceId={room} />
    </NewSpaceProvider>,
  );
  return store;
}

const names = (calls: readonly Recorded[]) => calls.map((call) => call.name);

beforeEach(async () => {
  mockPush.mockClear();
  holds.covering = false;
  holds.revealing = false;
  drawsAtOnce = true;
  mockWorkspace = "ws_1";
  mockSettings.clear();
  // Nothing written is nothing remembered: who the last test asked is not this one's.
  await loadRemembered();
});

/** Scout, remembered as taking new spaces in the fixture's workspace. */
const REMEMBERED = JSON.stringify({
  workspaceId: "ws_1",
  harnesses: [{ id: "har_scout", displayName: "Scout" }],
});

/** The workspace before the directory has come in: nobody has a name yet. */
const unread = (): Snapshot => ({ ...snapshot(), directory: {} });

describe("a new space from the +", () => {
  it("has nobody to ask until a harness takes new spaces", async () => {
    await renderWith(snapshot());
    expect(screen.getByText("Nobody to ask")).toBeOnTheScreen();
  });

  it("with nobody to ask, opens on no faces and makes the room empty, by its name (ADR 0148)", async () => {
    const store = await renderWith(snapshot());
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "A space for people, named by what you type",
    );
    await userEvent.type(screen.getByTestId("new-space-field"), "Japan trip");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(names(store.calls)).toEqual(["createSpace"]);
    expect(store.calls[0]?.args).toEqual({ title: "Japan trip" });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/spaces/[id]",
      params: { id: "sp_new", via: "new", add: "1" },
    });
  });

  it("opens a window that says who joins and that it waits, asking for a name (ADR 0149)", async () => {
    await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByRole("header", { name: "New space" })).toBeOnTheScreen();
    expect(screen.getByRole("checkbox", { name: "Scout" })).toBeChecked();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Scout joins · waits for your first message",
    );
    expect(screen.getByPlaceholderText("Name the space")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("makes the room on the send, by its name, asked of the harness with it in, and says nothing", async () => {
    const store = await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.type(screen.getByTestId("new-space-field"), "Kitchen  remodel");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));

    // Its name on one line; the harness makes its agent on the person's first message there.
    expect(names(store.calls)).toEqual(["createSpace", "addMember"]);
    expect(store.calls[0]?.args).toEqual({
      kind: "direct",
      askedOf: "har_scout",
      title: "Kitchen remodel",
    });
    expect(store.calls[1]?.args).toEqual({
      spaceId: "sp_new",
      participantId: "har_scout",
      kind: "harness",
      agentName: expect.stringMatching(/^[A-Z][a-z]{2,5}$/),
    });
    // Under the window, once it has covered the screen, and with no transition of its own; not on
    // its Add, which is an Empty room's.
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/spaces/[id]",
      params: { id: "sp_new", via: "new" },
    });
    expect(screen.queryByTestId("new-space-window")).toBeNull();
  });

  it("makes the room only once the window has covered the list, so the list is not seen taking it in", async () => {
    holds.covering = true;
    const store = await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.type(screen.getByTestId("new-space-field"), "Plan the kitchen remodel");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("new-space-window")).toBeOnTheScreen();

    await act(() => holds.cover());
    expect(names(store.calls)).toEqual(["createSpace", "addMember"]);
    expect(mockPush).toHaveBeenCalledTimes(1);
    // Covered once is made once.
    await act(() => holds.cover());
    expect(names(store.calls)).toEqual(["createSpace", "addMember"]);
  });

  it("holds the room under the window until the window has gone into it", async () => {
    holds.revealing = true;
    await renderWith(taking("har_scout"));
    expect(screen.getByTestId("room-sp_new")).toHaveTextContent("clear");
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.type(screen.getByTestId("new-space-field"), "Kitchen remodel");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("room-sp_new")).toHaveTextContent("under the window");
    expect(screen.getByTestId("new-space-window")).toBeOnTheScreen();

    await act(() => holds.reveal());
    expect(screen.getByTestId("room-sp_new")).toHaveTextContent("clear");
    expect(screen.queryByTestId("new-space-window")).toBeNull();
  });

  it("goes into the room only once the room has drawn itself", async () => {
    drawsAtOnce = false;
    await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.type(screen.getByTestId("new-space-field"), "Kitchen remodel");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    // Made and under the window, which stays over it while it is still being drawn.
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("room-sp_new")).toHaveTextContent("under the window");
    expect(screen.getByTestId("new-space-window")).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Draw sp_new" }));
    expect(screen.queryByTestId("new-space-window")).toBeNull();
    expect(screen.getByTestId("room-sp_new")).toHaveTextContent("clear");
  });

  it("goes into a room that never says it has drawn once it has waited a second and a half", async () => {
    drawsAtOnce = false;
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await renderWith(taking("har_scout"));
      await user.press(screen.getByRole("button", { name: "New space" }));
      await user.type(screen.getByTestId("new-space-field"), "Kitchen remodel");
      await user.press(screen.getByRole("button", { name: "Send" }));
      await act(() => jest.advanceTimersByTime(1400));
      expect(screen.getByTestId("new-space-window")).toBeOnTheScreen();
      await act(() => jest.advanceTimersByTime(200));
      expect(screen.queryByTestId("new-space-window")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("holds no other room", async () => {
    holds.revealing = true;
    await renderWith(taking("har_scout"), "sp_1");
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.type(screen.getByTestId("new-space-field"), "Kitchen remodel");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("room-sp_1")).toHaveTextContent("clear");
  });

  it("sends on Enter as it does on the arrow, and never sends nothing", async () => {
    const store = await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    fireEvent(screen.getByTestId("new-space-field"), "submitEditing");
    expect(store.calls).toEqual([]);
    await userEvent.type(screen.getByTestId("new-space-field"), "  India trip  ");
    await fireEvent(screen.getByTestId("new-space-field"), "submitEditing");
    expect(store.calls[0]?.args).toMatchObject({ title: "India trip" });
  });

  it("folds away on the ×, keeping what was typed for next time; a send takes it", async () => {
    await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.type(screen.getByTestId("new-space-field"), "Garden plan");
    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("new-space-window")).toBeNull();

    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByTestId("new-space-field")).toHaveDisplayValue("Garden plan");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));

    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByTestId("new-space-field")).toHaveDisplayValue("");
  });

  it("offers a face for each harness that takes new spaces, and the first tap chooses one", async () => {
    const store = await renderWith(taking("har_scout", "har_ledger"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    // By name, so the first offered, and the one asked unless another is picked, is Ledger.
    expect(screen.getByRole("checkbox", { name: "Ledger" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Scout" })).not.toBeChecked();
    // Scout is chosen instead of Ledger, not beside it (ADR 0084).
    await userEvent.press(screen.getByRole("checkbox", { name: "Scout" }));
    expect(screen.getByRole("checkbox", { name: "Scout" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ledger" })).not.toBeChecked();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Scout joins · waits for your first message",
    );
    await userEvent.type(screen.getByTestId("new-space-field"), "Quarterly taxes");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(names(store.calls)).toEqual(["createSpace", "addMember"]);
    expect(store.calls[0]?.args).toEqual({
      kind: "direct",
      askedOf: "har_scout",
      title: "Quarterly taxes",
    });
  });

  it("takes the last face out too, and then says to pick someone and sends nothing", async () => {
    const store = await renderWith(taking("har_scout", "har_ledger"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Ledger" }));
    expect(screen.getByRole("checkbox", { name: "Ledger" })).not.toBeChecked();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent("Pick who to ask");
    await userEvent.type(screen.getByTestId("new-space-field"), "Quarterly taxes");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    fireEvent(screen.getByTestId("new-space-field"), "submitEditing");
    expect(store.calls).toEqual([]);
  });

  it("makes a group of every harness picked, asked of the first, all waiting for the first message", async () => {
    const store = await renderWith(taking("har_scout", "har_ledger"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    // The first tap chooses Scout; the next puts Ledger in beside it.
    await userEvent.press(screen.getByRole("checkbox", { name: "Scout" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Ledger" }));
    expect(screen.getByRole("checkbox", { name: "Scout" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ledger" })).toBeChecked();
    // Scout was picked first, so Scout leads.
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Scout leads ⇄ · Ledger joins · they wait for you",
    );
    await userEvent.type(screen.getByTestId("new-space-field"), "Offsite");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));

    expect(names(store.calls)).toEqual(["createSpace", "addMember", "addMember"]);
    // Scout was in first, so Scout is asked for the room and claims it; Ledger is asked for an
    // agent of its own in it (ADR 0087's addendum of 30 September). Each makes it on the first
    // message, which is Everyone's (ADR 0081).
    expect(store.calls[0]?.args).toEqual({
      kind: "group",
      askedOf: "har_scout",
      alsoAskedOf: ["har_ledger"],
      title: "Offsite",
    });
    // Each with a first name held for its agent there, a letter apart (ADR 0150).
    const added = store.calls.slice(1, 3).map((call) => call.args as Record<string, unknown>);
    expect(added).toEqual([
      {
        spaceId: "sp_new",
        participantId: "har_scout",
        kind: "harness",
        agentName: expect.any(String),
      },
      {
        spaceId: "sp_new",
        participantId: "har_ledger",
        kind: "harness",
        agentName: expect.any(String),
      },
    ]);
    const [scouts, ledgers] = added.map((each) => String(each["agentName"]));
    expect(scouts?.charAt(0)).not.toBe(ledgers?.charAt(0));

    // The next window opens on whoever was asked last, alone, and remembers it past a launch.
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByRole("checkbox", { name: "Scout" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ledger" })).not.toBeChecked();
    expect(JSON.parse(mockSettings.get(SETTINGS.newSpace) ?? "null")).toMatchObject({
      workspaceId: "ws_1",
      lastAsked: "har_scout",
    });
  });

  it("gives a name of two words two lines, and counts the rest beside the lead (15 October 2026)", async () => {
    await renderWith(taking("har_scout", "har_ledger", "har_claude"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    // "Claude Code" was cut to "Claude…" under its face; one word stays on one line.
    const nameUnder = (name: string) =>
      within(screen.getByRole("checkbox", { name })).getAllByText(name).at(-1);
    expect(nameUnder("Claude Code")).toHaveProp("numberOfLines", 2);
    expect(nameUnder("Ledger")).toHaveProp("numberOfLines", 1);
    await userEvent.press(screen.getByRole("checkbox", { name: "Scout" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Ledger" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Claude Code" }));
    // The faces show which: naming them all ran the line out before "they wait for you".
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Scout leads ⇄ · 2 more join · they wait for you",
    );
  });

  it("hands the lead to the next one picked when the lead's name is tapped (ADR 0149's addendum)", async () => {
    const store = await renderWith(taking("har_scout", "har_ledger"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Scout" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Ledger" }));
    const lead = screen.getByRole("button", { name: "Scout leads" });
    expect(lead.props["accessibilityHint"]).toBe("Hands the lead to Ledger");
    await userEvent.press(lead);
    // The faces are as they were; only who leads has changed, and round again it is Scout.
    expect(screen.getByRole("checkbox", { name: "Scout" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ledger" })).toBeChecked();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Ledger leads ⇄ · Scout joins · they wait for you",
    );
    await userEvent.type(screen.getByTestId("new-space-field"), "Offsite");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls[0]?.args).toEqual({
      kind: "group",
      askedOf: "har_ledger",
      alsoAskedOf: ["har_scout"],
      title: "Offsite",
    });
  });

  it("names nobody as leading, and offers no lead to hand on, with one picked", async () => {
    await renderWith(taking("har_scout", "har_ledger"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.queryByRole("button", { name: /leads$/ })).toBeNull();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Ledger joins · waits for your first message",
    );
  });

  it("leads the faces with Empty, and with it picked the field asks for a name (ADR 0148)", async () => {
    await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByRole("checkbox", { name: "Empty space" })).not.toBeChecked();
    await userEvent.press(screen.getByRole("checkbox", { name: "Empty space" }));
    expect(screen.getByRole("checkbox", { name: "Empty space" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Scout" })).not.toBeChecked();
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "An empty space · you add agents next",
    );
    expect(screen.getByPlaceholderText("Name the space")).toBeOnTheScreen();
    // A face tapped while it is picked is that face instead, and the field still asks for a name.
    await userEvent.press(screen.getByRole("checkbox", { name: "Scout" }));
    expect(screen.getByRole("checkbox", { name: "Scout" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Empty space" })).not.toBeChecked();
    expect(screen.getByPlaceholderText("Name the space")).toBeOnTheScreen();
  });

  it("makes an empty room by its name, asking nobody and saying nothing, and opens it on its Add", async () => {
    const store = await renderWith(taking("har_scout"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    await userEvent.press(screen.getByRole("checkbox", { name: "Empty space" }));
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await userEvent.type(screen.getByTestId("new-space-field"), "  Japan \n trip ");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));

    // One line, its name; nobody asked, nobody added, nothing sent.
    expect(names(store.calls)).toEqual(["createSpace"]);
    expect(store.calls[0]?.args).toEqual({ title: "Japan trip" });
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/spaces/[id]",
      params: { id: "sp_new", via: "new", add: "1" },
    });
    expect(screen.queryByTestId("new-space-window")).toBeNull();

    // The next window opens on Empty, and remembers it past a launch.
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByRole("checkbox", { name: "Empty space" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Scout" })).not.toBeChecked();
    expect(screen.getByTestId("new-space-field")).toHaveDisplayValue("");
    expect(JSON.parse(mockSettings.get(SETTINGS.newSpace) ?? "null")).toMatchObject({
      lastAsked: "empty",
    });
  });

  it("draws the + from who took new spaces last time, until the directory has been read", async () => {
    mockSettings.set(SETTINGS.newSpace, REMEMBERED);
    await loadRemembered();
    const store = await renderWith(unread());
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Scout joins · waits for your first message",
    );
    await userEvent.type(screen.getByTestId("new-space-field"), "Garden plan");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls[0]?.args).toEqual({
      kind: "direct",
      askedOf: "har_scout",
      title: "Garden plan",
    });
  });

  it("draws nothing remembered from another workspace, or from nonsense", async () => {
    mockSettings.set(SETTINGS.newSpace, REMEMBERED);
    await loadRemembered();
    mockWorkspace = "ws_2";
    await renderWith(unread());
    expect(screen.getByText("Nobody to ask")).toBeOnTheScreen();

    mockWorkspace = "ws_1";
    for (const nonsense of ["{not json", JSON.stringify({ workspaceId: "ws_1", harnesses: [7] })]) {
      mockSettings.set(SETTINGS.newSpace, nonsense);
      await loadRemembered();
      await renderWith(unread());
      expect(screen.getByText("Nobody to ask")).toBeOnTheScreen();
    }
  });

  it("goes by the directory once it is read, and writes it down for next time", async () => {
    mockSettings.set(SETTINGS.newSpace, REMEMBERED);
    await loadRemembered();
    await renderWith(taking("har_ledger"));
    await userEvent.press(screen.getByRole("button", { name: "New space" }));
    expect(screen.getByTestId("new-space-says")).toHaveTextContent(
      "Ledger joins · waits for your first message",
    );
    expect(JSON.parse(mockSettings.get(SETTINGS.newSpace) ?? "null")).toEqual({
      workspaceId: "ws_1",
      harnesses: [{ id: "har_ledger", displayName: "Ledger" }],
    });

    // Nobody takes them any more: that is written down too, and the next launch draws no +.
    await renderWith(snapshot());
    expect(JSON.parse(mockSettings.get(SETTINGS.newSpace) ?? "null")).toEqual({
      workspaceId: "ws_1",
      harnesses: [],
    });
    await loadRemembered();
    await renderWith(unread());
    expect(screen.getAllByText("Nobody to ask").length).toBeGreaterThan(0);
  });

  it("is nothing at all for a phone that is not paired", async () => {
    mockStore = undefined;
    await render(
      <NewSpaceProvider>
        <PlusButton />
      </NewSpaceProvider>,
    );
    expect(screen.getByText("Nobody to ask")).toBeOnTheScreen();
  });
});
