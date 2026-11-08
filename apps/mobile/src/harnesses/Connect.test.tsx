/**
 * Connect a harness on the phone (ADR 0190): the gallery, a card's line made and copied, the link
 * followed in three steps, the tile's waiting words while the sheet is away, the arrival and Say
 * hello, and a card for a harness here already handing over to New agent.
 */

import type { JoinRequest, Snapshot } from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import {
  act,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { type ReactElement, type ReactNode, useMemo, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { avatarHue } from "../ui/Avatar";
import { ThirdSide } from "../ui/Split";
import {
  ConnectBeside,
  ConnectPane,
  ConnectProvider,
  LANDED_MS,
  useConnect,
  useConnectThird,
} from "./Connect";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));

// The store the provider reads, which a test swaps as the server would answer.
const mockChips: { store: ReturnType<typeof testStore> | undefined } = { store: undefined };
jest.mock("../store/provider", () => ({
  useChips: () => ({
    ready: true,
    paired: {
      store: mockChips.store,
      device: { participantId: "per_arjun", serverUrl: "http://192.168.1.20:4431" },
    },
  }),
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  useDeferredSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

const OPENCLAW: Connector = {
  id: "openclaw",
  name: "OpenClaw",
  line: "An OpenClaw gateway, on a server or this Mac",
  kind: "one-line",
  command: "chips connect openclaw '{link}'",
  package: "@chipschat/openclaw@1",
  capabilities: ["new_spaces", "agents"],
};
const HERMES: Connector = {
  id: "hermes",
  name: "Hermes",
  line: "Hermes Agent's API server, through chips-hermes",
  kind: "one-line",
  command: "cd ~/Work/chips-hermes && CHIPS_JOIN_LINK='{link}' npm start",
};
const LINK = "http://192.168.1.20:4431/j/chips_j_testlink_0123456789abcdef";

/** The link the fake store makes, as the server holds it a moment later. */
function link(over: Partial<JoinRequest> = {}): JoinRequest {
  return {
    requestId: "jrq_link",
    kind: "harness",
    state: "allowed",
    startedBy: "person",
    wants: [],
    capabilities: ["autonomy", "new_spaces", "agents"],
    url: "http://192.168.1.20:4431",
    createdAt: new Date(Date.now()).toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    ...over,
  };
}

const DIRECTORY = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  hrn_hermes: {
    id: "hrn_hermes",
    kind: "harness",
    displayName: "Hermes",
    ownerId: "per_arjun",
    capabilities: ["agents", "new_agents"],
  },
};

/** Arjun's workspace with Hermes here, and whatever links the server holds. */
function snapshot(
  joins: readonly JoinRequest[] = [],
  extra: { directory?: Record<string, unknown>; spaces?: unknown[] } = {},
): Snapshot {
  return {
    connection: "open",
    link: "direct",
    directoryFrom: "server",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    spaceIcons: new Map(),
    directory: { ...DIRECTORY, ...extra.directory },
    joins: new Map(joins.map((each) => [each.requestId, each])),
    model: {
      needsYou: [],
      lanes: [],
      spaces: extra.spaces ?? [],
      fleet: [],
      harnesses: {},
      connections: {},
      audit: [],
      people: { per_arjun: { id: "per_arjun", role: "owner", displayName: "Arjun" } },
    },
  } as unknown as Snapshot;
}

function testStore(first: Snapshot) {
  let current = first;
  const store = {
    ...fakeStore(first),
    getSnapshot: () => current,
    connectors: async () => [OPENCLAW, HERMES],
  };
  return Object.assign(store, { answer: (next: Snapshot) => (current = next) });
}

/** What the tile and You's row read, and buttons that do what they do. */
function Tile() {
  const connecting = useConnect();
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="Open" onPress={connecting.open}>
        <Text>Open</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ask Hermes"
        onPress={() => connecting.newAgent("hrn_hermes")}
      >
        <Text>Ask Hermes</Text>
      </Pressable>
      <Text testID="tile-waiting">
        {connecting.waiting === undefined
          ? "Connect"
          : connecting.waiting.taken
            ? "Connecting"
            : `Waiting ${connecting.waiting.left}`}
      </Text>
      <Text testID="tile-chosen">{connecting.chosen === true ? "Chosen" : ""}</Text>
    </>
  );
}

const app = () => (
  <ConnectProvider>
    <Tile />
  </ConnectProvider>
);

beforeEach(() => {
  mockPush.mockClear();
  jest.mocked(Clipboard.setStringAsync).mockClear();
});

describe("Connect a harness on the phone", () => {
  it("opens on the gallery: the docs' cards, the two ways, and Connected on a harness here", async () => {
    mockChips.store = testStore(snapshot());
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    expect(await screen.findByText("Connect a harness")).toBeTruthy();
    expect(await screen.findByLabelText("OpenClaw, Run a line")).toBeTruthy();
    expect(screen.getByLabelText("Hermes, Connected")).toBeTruthy();
    expect(screen.getByLabelText("Your own harness, Write code")).toBeTruthy();
    expect(screen.getByLabelText("Anything with HTTP, Advanced")).toBeTruthy();
  });

  it("draws a card by its name, the face its harness arrives with (ADR 0190)", async () => {
    // As a server still running the schema from before hands it out: the docs' red O for OpenClaw.
    const before = { ...OPENCLAW, face: { ground: 12 } } as Connector;
    mockChips.store = { ...testStore(snapshot()), connectors: async () => [before, HERMES] };
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    // The arrival, the shelf and the lists draw the harness by its name, so the card does too.
    expect(await screen.findByLabelText("OpenClaw")).toHaveStyle({
      backgroundColor: avatarHue("OpenClaw"),
    });
    expect(screen.getByLabelText("Hermes")).toHaveStyle({ backgroundColor: avatarHue("Hermes") });
  });

  it("makes a card's link, shows its line to copy, and follows the link while it waits", async () => {
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    await waitFor(() =>
      expect(store.calls.filter((each) => each.name === "makeJoinLink")).toEqual([
        { name: "makeJoinLink", args: ["new_spaces", "agents"] },
      ]),
    );
    // A bridge's card: the installer's line, which installs Chips on that computer first (ADR 0218).
    const line = `curl -fsSL https://chipschat.ai/install | CHIPS_JOIN_LINK='${LINK}' sh -s -- connect openclaw`;
    expect(await screen.findByTestId("connect-line-words")).toHaveTextContent(line);
    // A line to run says so in its box (ADR 0257); the page's head says where it goes.
    expect(screen.getByTestId("connect-line-run")).toHaveTextContent(/Run in Terminal$/);
    expect(
      screen.getByText(
        "This goes on the computer where OpenClaw runs, and installs Chips there if it needs to.",
      ),
    ).toBeTruthy();
    await userEvent.press(screen.getByLabelText("Copy"));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(line);
    // Copy says Copied itself; the note under it stays as it was, so the page keeps its height.
    expect(await screen.findByLabelText("Copied")).toBeTruthy();
    // And where the link works from: the server's own address (the new-person sweep's finding 3).
    expect(screen.getByTestId("connect-note")).toHaveTextContent(
      "With Handoff, Copy puts it on your Mac's clipboard too. The link in it works once, for 15 minutes. That computer has to reach Chips at http://192.168.1.20:4431: on the same network, on its tailnet, or at an address it can reach.",
    );
    expect(screen.getByTestId("connect-step-link")).toHaveTextContent(/Link ready/);
    expect(screen.getByTestId("connect-step-connects")).toHaveTextContent(
      /OpenClaw connects.*Waiting… 1[45]:\d\d left/,
    );
    expect(screen.getByTestId("tile-waiting")).toHaveTextContent(/Waiting 1[45]:\d\d/);
  });

  it("turns to the arrival on the hello, and Say hello opens its room", async () => {
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    const { rerender } = await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    await screen.findByTestId("connect-line-words");
    // OpenClaw takes its key from Arjun's MacBook Pro, connects, and says hello in its room.
    store.answer(
      snapshot(
        [
          link({
            state: "redeemed",
            name: "OpenClaw",
            machine: "Arjun's MacBook Pro",
            harnessId: "hrn_claw",
            spaceId: "spc_claw",
          }),
        ],
        {
          directory: {
            hrn_claw: { id: "hrn_claw", kind: "harness", displayName: "OpenClaw" },
            agt_claw: {
              id: "agt_claw",
              kind: "agent",
              harnessId: "hrn_claw",
              displayName: "OpenClaw",
              lead: true,
            },
          },
          spaces: [{ id: "spc_claw", lines: [{ kind: "text", authorId: "agt_claw" }], runs: [] }],
        },
      ),
    );
    await act(async () => rerender(app()));
    expect(await screen.findByText("OpenClaw is here")).toBeTruthy();
    expect(
      screen.getByText(
        "Connected from Arjun's MacBook Pro. Its Main agent is waiting in its space.",
      ),
    ).toBeTruthy();
    expect(screen.getByTestId("tile-waiting")).toHaveTextContent("Connect");
    await userEvent.press(screen.getByLabelText("Say hello"));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/spaces/[id]",
        params: { id: "spc_claw" },
      }),
    );
  });

  it("asks first on a card for a harness here, and hands New agent its sheet", async () => {
    const store = testStore(snapshot());
    mockChips.store = store;
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("Hermes, Connected"));
    expect(await screen.findByTestId("connect-here-already")).toHaveTextContent(
      /Hermes is connected here already/,
    );
    // Nothing to run on a page that asks first, so nothing says to run anything.
    expect(screen.queryByText(/This goes on the computer/)).toBeNull();
    expect(screen.queryByTestId("connect-line-run")).toBeNull();
    // Nothing is made for a harness that is here until another is asked for.
    expect(store.calls.some((each) => each.name === "makeJoinLink")).toBe(false);
    await userEvent.press(screen.getByLabelText("New Hermes agent"));
    const name = await screen.findByTestId("new-agent-name");
    await userEvent.type(name, "Reviewer");
    expect(screen.getByTestId("new-agent-hint")).toHaveTextContent(
      "It starts in a space of its own, called Reviewer.",
    );
    await userEvent.press(screen.getByLabelText("Create Reviewer"));
    expect(store.calls.filter((each) => each.name === "askIntoNewRoom")).toEqual([
      { name: "askIntoNewRoom", args: { harnessId: "hrn_hermes", name: "Reviewer" } },
    ]);
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/spaces/[id]",
        params: { id: "sp_asked" },
      }),
    );
  });

  it("says Build your own, not Or, when the server has no gallery, as the demo has none", async () => {
    mockChips.store = { ...testStore(snapshot()), connectors: async () => [] };
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    expect(await screen.findByText("Build your own")).toBeOnTheScreen();
    expect(screen.queryByText("Or build your own")).toBeNull();
  });

  it("cancels a link while it waits: withdrawn, the gallery again, the tile no longer waiting", async () => {
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    await screen.findByTestId("connect-line-words");
    expect(screen.getByTestId("tile-waiting")).toHaveTextContent(/Waiting/);
    await userEvent.press(screen.getByLabelText("Cancel link"));
    await waitFor(() =>
      expect(store.calls.filter((each) => each.name === "denyJoin")).toEqual([
        { name: "denyJoin", args: "jrq_link" },
      ]),
    );
    expect(await screen.findByTestId("connect-gallery")).toBeTruthy();
    expect(screen.getByTestId("tile-waiting")).toHaveTextContent("Connect");
    // The page fading out does not make another link the moment its own is gone.
    expect(store.calls.filter((each) => each.name === "makeJoinLink")).toHaveLength(1);
  });

  it("offers New agent a first name nobody here has", async () => {
    mockChips.store = testStore(snapshot());
    await render(app());
    await userEvent.press(screen.getByLabelText("Ask Hermes"));
    const name = await screen.findByTestId("new-agent-name");
    const offered = String(name.props["placeholder"]);
    expect(offered).toMatch(/^[A-Z][a-z]{2,5}$/);
    expect(screen.getByTestId("new-agent-hint")).toHaveTextContent(
      `It starts in a space of its own, called ${offered}.`,
    );
    expect(screen.getByLabelText(`Create ${offered}`)).toBeTruthy();
  });
});

/** Hidden from a screen reader, as the stand-in under "Making a link…" is, but drawn. */
const HIDDEN = { includeHiddenElements: true } as const;

/** A view's style as drawn now, its animated values read. */
const drawn = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID, HIDDEN).props["style"]);

// Under Jest the native driver's values never come back to JavaScript, so what is checked is how
// each piece of motion is put together, and where it ends with Reduce Motion on.
describe("Connect a harness beside the list on an iPad (ADR 0284's addendum)", () => {
  /**
   * A split's list, its pane and its third column, as the Agents tab and You hold them: the tile
   * opens the pane, a card picked there stands in the third column, and another row of the list
   * puts them away.
   */
  function Beside() {
    const [open, setOpen] = useState(false);
    const here = useMemo(() => ({ open: () => setOpen(true), chosen: open }), [open]);
    const third = useConnectThird();
    return (
      <ConnectBeside value={here}>
        <Tile />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Another row"
          onPress={() => setOpen(false)}
        >
          <Text>Another row</Text>
        </Pressable>
        {open ? <ConnectPane onClose={() => setOpen(false)} /> : null}
        {open && third !== undefined ? (
          <ThirdSide>
            <View testID="third-column">{third}</View>
          </ThirdSide>
        ) : null}
      </ConnectBeside>
    );
  }
  const beside = () => (
    <ConnectProvider>
      <Beside />
    </ConnectProvider>
  );

  it("opens its pages in the pane, never a sheet, its tile chosen, and another row puts them away", async () => {
    mockChips.store = testStore(snapshot());
    await render(beside());
    await userEvent.press(screen.getByLabelText("Open"));
    expect(await screen.findByTestId("connect-pane")).toBeTruthy();
    expect(await screen.findByLabelText("OpenClaw, Run a line")).toBeTruthy();
    expect(screen.queryByTestId("connect-sheet")).toBeNull();
    // The pane's bar names it; the gallery does not say it a second time under it.
    expect(screen.getAllByText("Connect a harness")).toHaveLength(1);
    expect(screen.getByTestId("tile-chosen")).toHaveTextContent("Chosen");
    // A pane a row opens has no way out of its own (ADR 0276): the list is beside it.
    expect(screen.queryByLabelText("Close")).toBeNull();
    expect(screen.queryByLabelText("Back")).toBeNull();
    await userEvent.press(screen.getByLabelText("Another row"));
    expect(screen.queryByTestId("connect-pane")).toBeNull();
    expect(screen.queryByTestId("connect-sheet")).toBeNull();
    expect(screen.getByTestId("tile-chosen")).toHaveTextContent("");
  });

  it("opens a card picked in the pane's gallery in the third column, its row chosen, and its × goes back to the gallery alone (point 4)", async () => {
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    await render(beside());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    // The card's page beside the gallery, which stays in the pane with its row chosen.
    const third = await screen.findByTestId("third-column");
    expect(within(third).getByTestId("connect-page")).toBeTruthy();
    expect(await within(third).findByTestId("connect-line-words")).toBeTruthy();
    expect(within(screen.getByTestId("connect-pane")).getByTestId("connect-gallery")).toBeTruthy();
    expect(screen.getByLabelText("OpenClaw, Run a line")).toBeSelected();
    // The column's bar names the card, and its × is the way back: the page has no Back of its own.
    expect(within(third).getByText("Connect OpenClaw")).toBeTruthy();
    expect(screen.queryByTestId("connect-back")).toBeNull();
    await userEvent.press(within(third).getByLabelText("Close"));
    expect(screen.queryByTestId("third-column")).toBeNull();
    expect(screen.getByTestId("connect-gallery")).toBeTruthy();
    expect(screen.getByLabelText("OpenClaw, Run a line")).not.toBeSelected();
    // The link it made is still followed, and the card opens on it again.
    await userEvent.press(screen.getByLabelText("OpenClaw, Run a line"));
    expect(await screen.findByTestId("connect-line-words")).toBeTruthy();
    expect(store.calls.filter((each) => each.name === "makeJoinLink")).toHaveLength(1);
  });

  it("keeps following a link the pane was left on, and opens again where it was", async () => {
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    await render(beside());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    expect(await screen.findByTestId("connect-line-words")).toBeTruthy();
    await userEvent.press(screen.getByLabelText("Another row"));
    expect(screen.getByTestId("tile-waiting")).toHaveTextContent(/Waiting 1[45]:\d\d/);
    await userEvent.press(screen.getByLabelText("Open"));
    expect(await screen.findByTestId("connect-line-words")).toBeTruthy();
    expect(store.calls.filter((each) => each.name === "makeJoinLink")).toHaveLength(1);
  });

  it("puts the pane away when Say hello opens the room, as it put the sheet away", async () => {
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    const { rerender } = await render(beside());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    await screen.findByTestId("connect-line-words");
    store.answer(
      snapshot(
        [link({ state: "redeemed", name: "OpenClaw", harnessId: "hrn_claw", spaceId: "spc_claw" })],
        {
          directory: { hrn_claw: { id: "hrn_claw", kind: "harness", displayName: "OpenClaw" } },
          spaces: [{ id: "spc_claw", lines: [{ kind: "text", authorId: "hrn_claw" }], runs: [] }],
        },
      ),
    );
    await act(async () => rerender(beside()));
    await userEvent.press(await screen.findByLabelText("Say hello"));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith({
        pathname: "/spaces/[id]",
        params: { id: "spc_claw" },
      }),
    );
    expect(screen.queryByTestId("connect-pane")).toBeNull();
    expect(screen.queryByTestId("connect-sheet")).toBeNull();
  });
});

describe("the sheet's motion, as walked on the simulator (18 October 2026)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("stands its steps and the line's place before the link is back, so it glides once", async () => {
    const store = testStore(snapshot());
    // The server has not answered yet.
    store.makeJoinLink = () => new Promise(() => undefined);
    mockChips.store = store;
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    expect(await screen.findByText("Making a link…")).toBeTruthy();
    // The line as it will be, unseen, holds the box at the height the real one will have.
    expect(screen.getByTestId("connect-line-stand-in", HIDDEN)).toHaveTextContent(
      /^curl -fsSL https:\/\/chipschat\.ai\/install \| CHIPS_JOIN_LINK='http:\/\/192\.168\.1\.20:4431\/j\/chips_j_x{32}' sh -s -- connect openclaw$/,
    );
    expect(drawn("connect-line-stand-in").opacity).toBe(0);
    // Run in Terminal stands over it already, so the box does not grow when the line comes.
    expect(screen.getByTestId("connect-line-run")).toHaveTextContent(/Run in Terminal$/);
    // The three steps stand already, the first under way, and What it may do under them.
    expect(screen.getByTestId("connect-step-link")).toHaveTextContent(/Making a link/);
    expect(screen.getByTestId("connect-step-link").props["accessibilityState"]).toMatchObject({
      busy: true,
    });
    expect(screen.getByTestId("connect-step-connects")).toHaveTextContent(
      /OpenClaw connects.*When it uses the link/,
    );
    expect(screen.getByTestId("connect-step-hello")).toHaveTextContent(/Says hello/);
    expect(screen.getByTestId("connect-may")).toHaveTextContent(/What it may do/);
    // Cancel link stands too, so the page does not grow when the link is back; nothing to cancel yet.
    expect(screen.getByLabelText("Cancel link").props["accessibilityState"]).toMatchObject({
      disabled: true,
    });
  });

  it("turns its fold's one chevron over as it opens, and back, rather than trading it for an arrow", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    mockChips.store = testStore(snapshot([link()]));
    await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    await screen.findByTestId("connect-line-words");
    expect(drawn("connect-may-chevron").transform).toEqual([{ rotate: "0deg" }]);
    await userEvent.press(screen.getByTestId("connect-may"));
    await waitFor(() =>
      expect(drawn("connect-may-chevron").transform).toEqual([{ rotate: "180deg" }]),
    );
    await userEvent.press(screen.getByTestId("connect-may"));
    await waitFor(() =>
      expect(drawn("connect-may-chevron").transform).toEqual([{ rotate: "0deg" }]),
    );
  });

  it("says who is here as the face lands, not once its spring has stopped", async () => {
    const delays = jest.spyOn(Animated, "delay");
    const sequences = jest.spyOn(Animated, "sequence");
    const store = testStore(snapshot([link()]));
    mockChips.store = store;
    const { rerender } = await render(app());
    await userEvent.press(screen.getByLabelText("Open"));
    await userEvent.press(await screen.findByLabelText("OpenClaw, Run a line"));
    await screen.findByTestId("connect-line-words");
    store.answer(
      snapshot(
        [link({ state: "redeemed", name: "OpenClaw", harnessId: "hrn_claw", spaceId: "spc_claw" })],
        {
          directory: { hrn_claw: { id: "hrn_claw", kind: "harness", displayName: "OpenClaw" } },
          spaces: [{ id: "spc_claw", lines: [{ kind: "text", authorId: "hrn_claw" }], runs: [] }],
        },
      ),
    );
    await act(async () => rerender(app()));
    await screen.findByText("OpenClaw is here");
    expect(drawn("connect-arrival-words").opacity).toBe(0);
    // The words wait a beat of their own, the face's first swing to its place; nothing waits on
    // the land spring, whose give takes near a second to be still (walked: the title came 0.97 s
    // after the face, the page bare between).
    expect(delays).toHaveBeenCalledWith(LANDED_MS);
    expect(LANDED_MS).toBeLessThan(300);
    expect(sequences).toHaveBeenCalledTimes(1);
    expect(sequences.mock.calls[0]?.[0][0]).toBe(delays.mock.results[0]?.value);
  });
});
