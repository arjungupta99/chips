/**
 * The connection's mark, and the sheet behind it.
 *
 * What cannot be asked here is what it looks like: the mark is ten views with animated opacities
 * and the sheet rides a spring, and neither is a thing Jest can see. What is asked is everything
 * either side — that the good news is silent, that the mark waits out a blink before it appears,
 * what each state says when it is tapped, and that *Try again* reaches the store.
 */

import type { ConnectionState, LinkKind } from "@chipschat/core";
import { act, render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BACK_MS, ConnectionMark, ROOM_MS, SETTLES_MS, useMarking } from "./Connection";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

/** The sheet asks the window what the insets are, so the mark is rendered inside a real one. */
function mark(
  state: ConnectionState,
  onRetry: () => void = () => {},
  link?: LinkKind,
  facts: {
    readonly server?: string;
    readonly lostAt?: string;
    readonly noRelay?: boolean;
    readonly owner?: boolean;
  } = {},
) {
  return (
    <SafeAreaProvider initialMetrics={IPHONE}>
      <ConnectionMark
        state={state}
        link={link}
        onRetry={onRetry}
        server={facts.server}
        lostAt={facts.lostAt}
        noRelay={facts.noRelay}
        owner={facts.owner}
      />
    </SafeAreaProvider>
  );
}

/** The board is hidden from a screen reader, which the words already tell; the tests look anyway. */
const HIDDEN = { includeHiddenElements: true } as const;

/** The mark shows nothing for the first beat of not being connected; this is the beat passing. */
async function settle(): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(SETTLES_MS);
  });
}

describe("the connection's mark", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("shows nothing at all while the socket is open on the network", async () => {
    await render(mark("open", undefined, "direct"));
    await settle();
    expect(screen.queryByLabelText("Connecting to your server")).toBeNull();
    expect(screen.queryByLabelText("Not connected")).toBeNull();
  });

  it("waits out a blink rather than flashing on every reconnect", async () => {
    await render(mark("connecting"));
    expect(screen.queryByLabelText("Connecting to your server")).toBeNull();
    await settle();
    expect(screen.getByLabelText("Connecting to your server")).toBeTruthy();
  });

  it("stands where a socket that gave up can be seen", async () => {
    await render(mark("closed"));
    await settle();
    expect(screen.getByLabelText("Not connected")).toBeTruthy();
  });

  it("shows nothing through the relay either: connected is connected (You → This phone says which way)", async () => {
    await render(mark("open", undefined, "relay"));
    await settle();
    expect(screen.queryByTestId("connection")).toBeNull();
  });

  it("says on the sheet what is wrong, and offers to try again", async () => {
    const wake = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(mark("asleep", wake));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    expect(screen.getByText("Your server is not reachable")).toBeTruthy();
    expect(screen.getByText(/asleep, or switched off/)).toBeTruthy();
    await user.press(screen.getByLabelText("Try again"));
    expect(wake).toHaveBeenCalledTimes(1);
  });

  it("says why on a phone that knows no relay: it reaches the server only at home", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(mark("closed", () => {}, undefined, { noRelay: true }));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    expect(
      screen.getByText(/only on the server's own network, because the relay isn't on/),
    ).toBeTruthy();
    expect(
      screen.getByText(/an owner turns on the relay, at home: You → Workspace → Relay/),
    ).toBeTruthy();
  });

  it("does not offer to reconnect when reconnecting cannot help", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(mark("rejected"));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    expect(screen.getByText("This phone is no longer paired")).toBeTruthy();
    expect(screen.queryByLabelText("Try again")).toBeNull();
    expect(screen.getByLabelText("Pair this phone again")).toBeTruthy();
    // Somebody invited has no computer of the workspace's: an owner reconnects them.
    expect(
      screen.getByText(
        "Reconnecting cannot fix that — only pairing again can. Ask an owner to reconnect you: they choose Reconnect or Pair a new phone on your page in People, and you scan the code they get.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/On your computer/)).toBeNull();
  });

  it("sends an owner whose phone is no longer paired to a computer of theirs", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(mark("rejected", undefined, undefined, { owner: true }));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    expect(
      screen.getByText(/On your computer open Chips, then You → Devices → Pair another device\./),
    ).toBeTruthy();
    expect(screen.queryByText(/Ask an owner/)).toBeNull();
  });

  it("gives its place up altogether once the socket is back, and not a box of nothing", async () => {
    const { rerender } = await render(mark("closed"));
    await settle();
    expect(screen.getByLabelText("Not connected")).toBeTruthy();
    await act(async () => {
      rerender(mark("open", undefined, "direct"));
    });
    // The exit first, and then the place itself: a navigation bar draws a glass capsule for
    // whatever is put in its right-hand slot, so what is put there has to become nothing at all.
    await waitFor(() => expect(screen.queryByTestId("connection")).toBeNull());
  });

  it("says it is back, for a beat, once a connection it said had failed returns", async () => {
    const { rerender } = await render(mark("closed"));
    await settle();
    await act(async () => {
      rerender(mark("open", undefined, "direct"));
    });
    expect(screen.getByLabelText("Connected again")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS);
    });
    await waitFor(() => expect(screen.queryByTestId("connection")).toBeNull());
  });

  it("just goes after a slow connect that never failed, or every slow launch would flash", async () => {
    const { rerender } = await render(mark("connecting"));
    await settle();
    expect(screen.getByLabelText("Connecting to your server")).toBeTruthy();
    await act(async () => {
      rerender(mark("open", undefined, "direct"));
    });
    expect(screen.queryByLabelText("Connected again")).toBeNull();
  });

  it("says on the sheet which server, and since when it has not answered", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const lostAt = new Date(Date.now() - 4 * 60_000).toISOString();
    await render(mark("closed", undefined, undefined, { server: "100.64.0.7:4431", lostAt }));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    expect(screen.getByText("100.64.0.7:4431")).toBeTruthy();
    expect(screen.getByText("4 min ago")).toBeTruthy();
  });

  it("shows the mark on its board, saying what the sheet says, and stays up, green, once through", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = await render(mark("closed"));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    // Opened red: no sparks and no green, and nothing on its way in.
    expect(screen.getByTestId("connection-board", HIDDEN)).toBeTruthy();
    expect(screen.getByTestId("connection-board-sparks", HIDDEN)).toHaveStyle({ opacity: 0 });
    expect(screen.getByTestId("connection-board-flood", HIDDEN)).toHaveStyle({ opacity: 0 });
    await act(async () => {
      rerender(mark("connecting"));
    });
    expect(screen.getByText("Connecting…")).toBeTruthy();
    await act(async () => {
      rerender(mark("open", undefined, "direct"));
    });
    // Through: the sheet says so, green, and stays until it is closed (31 October 2026: "We do
    // not need to auto dismiss the loading bottom sheet when we connect, if it was open").
    expect(screen.getByText("Connected")).toBeTruthy();
    // The sparks fading and the green spreading run on the native driver, which Jest has not got:
    // the phone's e2e watches them (`asleep.spec.ts`).
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS * 3);
    });
    expect(screen.getByTestId("connection-board", HIDDEN)).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    // And the mark under it stays green with it, rather than leaving the sheet nothing to be of.
    expect(screen.getByLabelText("Connected again")).toBeTruthy();
    await user.press(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByTestId("connection-board", HIDDEN)).toBeNull());
    // Closed, the mark has its beat and goes.
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS);
    });
    await waitFor(() => expect(screen.queryByTestId("connection")).toBeNull());
  });

  it("stays up through a slow connect that never failed, the mark green under it", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = await render(mark("connecting"));
    await settle();
    await user.press(screen.getByLabelText("Connecting to your server"));
    await act(async () => {
      rerender(mark("open", undefined, "relay"));
    });
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS * 3);
    });
    expect(screen.getByText("Connected through the relay")).toBeTruthy();
    expect(screen.getByLabelText("Connected again")).toBeTruthy();
    await user.press(screen.getByLabelText("Close"));
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS);
    });
    await waitFor(() => expect(screen.queryByTestId("connection")).toBeNull());
  });

  it("changes look without mounting or dropping anything on the board", async () => {
    // The change comes when the app is busiest, so it moves what is there rather than making
    // anew: the sparks and the green stay where they are, faded out (31 October 2026).
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = await render(mark("connecting"));
    await settle();
    await user.press(screen.getByLabelText("Connecting to your server"));
    const sparks = screen.getByTestId("connection-board-sparks", HIDDEN);
    const flood = screen.getByTestId("connection-board-flood", HIDDEN);
    for (const state of ["closed", "connecting", "open"] as const) {
      await act(async () => {
        rerender(mark(state, undefined, "direct"));
      });
      expect(screen.getByTestId("connection-board-sparks", HIDDEN)).toBe(sparks);
      expect(screen.getByTestId("connection-board-flood", HIDDEN)).toBe(flood);
    }
  });

  it("stays up when the connection is lost again inside the green beat", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = await render(mark("closed"));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    await act(async () => {
      rerender(mark("open", undefined, "direct"));
    });
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS / 2);
    });
    await act(async () => {
      rerender(mark("closed"));
    });
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS * 2);
    });
    expect(screen.getByTestId("connection-board", HIDDEN)).toBeTruthy();
    expect(screen.getByLabelText("Try again")).toBeTruthy();
  });

  it("says what is on screen is old rather than leaving it looking live", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await render(mark("closed"));
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    expect(screen.getByText(/what this phone last saw/)).toBeTruthy();
    expect(screen.getByText(/Nothing you have sent is lost/)).toBeTruthy();
  });
});

/** A bar that puts the mark in the slot it was given, as the room's and the lists' do. */
function Slotted({ state }: { readonly state: ConnectionState }) {
  const { marking, markedBy } = useMarking(state, true);
  return (
    <SafeAreaProvider initialMetrics={IPHONE}>
      <Text>{marking ? "a slot" : "no slot"}</Text>
      {marking ? <ConnectionMark state={state} onRetry={() => {}} {...markedBy} /> : null}
    </SafeAreaProvider>
  );
}

/** A screen with a bar of its own asks this before it hands the bar a right-hand slot. */
function Asking({
  state,
  beside = false,
}: {
  readonly state: ConnectionState;
  readonly beside?: boolean;
}) {
  return <Text>{useMarking(state, beside).marking ? "a slot" : "no slot"}</Text>;
}

describe("whether a bar is given a slot at all", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("says no while the socket is open, so the bar draws no empty capsule", async () => {
    await render(<Asking state="open" />);
    await settle();
    expect(screen.getByText("no slot")).toBeTruthy();
  });

  it("says yes once not being connected has lasted, and no again once it is over", async () => {
    const { rerender } = await render(<Asking state="asleep" />);
    await settle();
    expect(screen.getByText("a slot")).toBeTruthy();
    await act(async () => {
      rerender(<Asking state="open" />);
    });
    // The capsule holds the mark through the beat that says it is back, and its exit.
    expect(screen.getByText("a slot")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS);
    });
    await waitFor(() => expect(screen.getByText("no slot")).toBeTruthy());
  });

  it("beside Universe, puts the mark in its room at once, and holds it while the room closes after its exit", async () => {
    // One bar with Universe beside the mark, and one with the mark alone.
    const both = (state: ConnectionState) => (
      <>
        <Asking state={state} beside />
        <Asking state={state} />
      </>
    );
    const { rerender } = await render(both("asleep"));
    await settle();
    // Both at once: beside Universe the room shows the mark as it opens (`MarkBeside`), so the mark
    // is in place before the room moves and nothing is mounted while it does.
    expect(screen.getAllByText("a slot")).toHaveLength(2);
    await act(async () => {
      rerender(both("open"));
    });
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS);
    });
    // The mark has faded: alone, its capsule has gone; beside Universe, its room is closing.
    await act(async () => {
      jest.advanceTimersByTime(ROOM_MS);
    });
    expect(screen.getByText("a slot")).toBeTruthy();
    expect(screen.getByText("no slot")).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(ROOM_MS);
    });
    expect(screen.getAllByText("no slot")).toHaveLength(2);
  });

  it("keeps the slot while the mark's sheet is up, so the sheet is not taken down with it", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { rerender } = await render(<Slotted state="closed" />);
    await settle();
    await user.press(screen.getByLabelText("Not connected"));
    await act(async () => {
      rerender(<Slotted state="open" />);
    });
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS * 3);
    });
    expect(screen.getByText("a slot")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    await user.press(screen.getByLabelText("Close"));
    await act(async () => {
      jest.advanceTimersByTime(BACK_MS + ROOM_MS * 2);
    });
    await waitFor(() => expect(screen.getByText("no slot")).toBeTruthy());
  });
});
