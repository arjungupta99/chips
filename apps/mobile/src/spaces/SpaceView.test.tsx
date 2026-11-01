/**
 * A space on the phone. What is worth proving: that each kind of line is drawn as the thing it
 * is, that the composer's commands go through core rather than through a dialect of this app's
 * own, and that being in a space marks it read.
 *
 * Long, and deliberately one file: the room is one screen, and a room's line, composer, keyboard
 * and asks are only true together — the offset the keyboard is held by is a sum of what the
 * composer measured and what the safe area reported, and a bubble's ground depends on whether
 * its run closed. Splitting it would mean building the same room four times over, and each copy
 * would drift from the screen on its own.
 */

import type { Line as LineModel, SendMessageInput, Snapshot } from "@chipschat/core";
import { CLOSE_WAIT_MS, LABEL_HOLD_MS, roomSnapshot } from "@chipschat/core";
import type { AgentState } from "@chipschat/protocol";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import type { ReactElement } from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  Share,
  type StyleProp,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { chooseAppearance } from "../ui/appearance";
import { PIN_REST } from "../ui/outline";
import { avatarHue, hueColours, sourceColours } from "../ui/sourceColours";
import { BUBBLE, ICON_GROUNDS, light, SPACE } from "../ui/tokens";
import { listRoom } from "./AddressInField";
import { forgetDrafts, quietFoot } from "./Composer";
import { homeward, madeHere } from "./RoomMotion";
import { MARKS_MS, PLACING_MS, SpaceView } from "./SpaceView";
import { CATCH_UP_MS, THINKING_GRACE_MS } from "./Thinking";
import { clockTime } from "./when";

const impact = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;

// A draft is kept for its space while the app runs, and these rooms all share one id; a count
// of buzzes is not kept between tests either.
beforeEach(() => {
  forgetDrafts();
  impact.mockClear();
});

/**
 * A phone with a home indicator, since nothing under Node has one to measure. The composer's
 * bottom margin is a fact about that band and about nothing else, so a screen rendered without
 * it would prove the opposite of what it looks like it proves.
 */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function onAPhone(element: ReactElement): ReactElement {
  return <SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>;
}

function line(over: Partial<LineModel> = {}): LineModel {
  return {
    id: "ln_1",
    seq: 1,
    kind: "text",
    authorId: "per_dana",
    authorKind: "person",
    text: "Shall we use Northwind?",
    ts: "2026-09-07T10:00:00.000Z",
    ...over,
  };
}

function state(
  lines: readonly LineModel[],
  over: Partial<{
    runs: unknown[];
    run: unknown;
    lanes: unknown[];
    state: string;
    connection: string;
    members: string[];
    icons: Record<string, { icon: string; ground: number }>;
    lead: string;
    askedOf: string;
    held: Record<string, string>;
    pins: string[];
    project: unknown;
  }> = {},
): Snapshot {
  return {
    connection: over.connection ?? "open",
    spaceIcons: new Map(Object.entries(over.icons ?? {})),
    link: "direct",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
      per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
      har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
      har_tree: { id: "har_tree", kind: "harness", displayName: "Tree" },
    },
    model: {
      needsYou: [],
      people: {},
      lanes: over.lanes ?? [],
      spaces: [
        {
          id: "sp_1",
          kind: "room",
          title: "Supplier email",
          members: over.members ?? ["per_arjun", "per_dana", "har_scout"],
          roles: {},
          lead: over.lead,
          ...(over.askedOf === undefined ? {} : { askedOf: over.askedOf }),
          ...(over.held === undefined ? {} : { held: over.held }),
          ...(over.project === undefined ? {} : { project: over.project }),
          state: over.state ?? "open",
          lastEventSeq: 9,
          lines,
          // The room's run is its newest, as the model folds it.
          runs: over.runs ?? (over.run === undefined ? [] : [over.run]),
          run: over.run,
          sessions: [],
          pins: (over.pins ?? []).map((lineId, index) => ({
            lineId,
            by: "per_arjun",
            ts: "2026-09-07T10:05:00.000Z",
            seq: 10 + index,
          })),
          glimpse: false,
        },
      ],
    },
  } as unknown as Snapshot;
}

function open(snapshot: Snapshot, onOpenSpace?: (spaceId: string) => void) {
  const store = fakeStore(snapshot);
  return {
    store,
    element: onAPhone(
      <SpaceView
        store={store}
        snapshot={snapshot}
        spaceId="sp_1"
        selfId="per_arjun"
        onOpenSpace={onOpenSpace}
      />,
    ),
  };
}

/**
 * The dots breathing at a chain row's right edge. Hidden from a screen reader — the row's own
 * label carries the word — so the query has to ask for hidden elements or it finds nothing and
 * proves nothing.
 */
function breathing() {
  return screen.queryByTestId("lane-working", { includeHiddenElements: true });
}

/** The beat the thinking bubble waits before it comes, under fake timers. */
/** The thinking bubble's dots, each as it is drawn: a dot is always a view, never a string. */
function dotsDrawn(): ViewStyle[] {
  return screen
    .getByTestId("doing-dots", { includeHiddenElements: true })
    .children.map((dot) =>
      StyleSheet.flatten(
        (dot as unknown as { props: { style: StyleProp<ViewStyle> } }).props.style,
      ),
    );
}

async function beat(ms = THINKING_GRACE_MS): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** An element as the queries hand it back, without naming the renderer's own package. */
type Node = ReturnType<typeof screen.getByTestId>;

/** Whether this piece of text is under the bubble's ceiling: its own, or one it sits inside. */
function capped(node: Node): boolean {
  for (let at: Node | null = node; at !== null; at = at.parent) {
    if (at.props["maxFontSizeMultiplier"] === BUBBLE.maxScale) return true;
  }
  return false;
}

describe("the lines a space draws", () => {
  it("names the others in a room of three, and never the reader", async () => {
    const { element } = open(
      state([line(), line({ id: "ln_2", authorId: "per_arjun", text: "Yes" })]),
    );
    await render(element);
    expect(screen.getByText("Dana Ruiz")).toBeTruthy();
    expect(screen.queryByText("You")).toBeNull();
    expect(screen.queryByText("Arjun")).toBeNull();
  });

  it("leaves the names off a room of two, where the side already says whose line it is", async () => {
    const { element } = open(
      state([line({ authorId: "har_scout", authorKind: "harness", text: "On it." })], {
        members: ["per_arjun", "har_scout"],
      }),
    );
    await render(element);
    expect(screen.queryByText("Scout")).toBeNull();
    expect(screen.getByText("On it.")).toBeTruthy();
  });

  it("puts the time in the bubble rather than over it", async () => {
    const { element } = open(state([line()]));
    await render(element);
    // 10:00 UTC, in whatever the runner's clock calls it: the digits are the point. Inside the
    // line, because the separator over it says the hour too.
    expect(within(screen.getByTestId("line-ln_1")).getByText(/\d{1,2}:\d{2}/)).toBeTruthy();
  });

  it("draws a taken-back line as a tombstone rather than dropping it", async () => {
    const { element } = open(state([line({ deleted: true })]));
    await render(element);
    expect(screen.getByTestId("tombstone")).toBeTruthy();
    expect(screen.queryByText("Shall we use Northwind?")).toBeNull();
  });

  it("marks a line that has been changed", async () => {
    const { element } = open(state([line({ editedAt: "2026-09-07T10:05:00.000Z" })]));
    await render(element);
    expect(screen.getByText("edited")).toBeTruthy();
  });

  it("tags a heartbeat's check-in, and no other line (ADR 0143)", async () => {
    const { element } = open(
      state([
        line({ id: "ln_1", seq: 1 }),
        line({ id: "ln_2", seq: 2, text: "The deploy is still red.", heartbeat: true }),
      ]),
    );
    await render(element);
    expect(screen.getAllByTestId("heartbeat-tag")).toHaveLength(1);
    expect(screen.getByLabelText("Heartbeat check-in")).toHaveTextContent("Heartbeat");
  });

  it("says beneath a line which agents' turns heard it while they worked (ADR 0106)", async () => {
    const { element } = open(
      state([line({ heardBy: ["har_scout"] })], { members: ["per_arjun", "har_scout"] }),
    );
    await render(element);
    expect(screen.getByText("Scout heard this while working")).toBeTruthy();
  });

  it("draws a harness's queued turn as the work it is, not as the text it arrives as", async () => {
    // What Jacobian edits into one message while a queued turn runs (core's `taskWords.ts`).
    const { element } = open(
      state([
        line({
          authorId: "har_scout",
          authorKind: "harness",
          text: "💭 Preparing tool call for app start\n▸ local-dev__serve · stop\n▸ show_app",
        }),
      ]),
    );
    await render(element);
    expect(screen.getByText("Preparing tool call for app start")).toBeTruthy();
    // Its dots, as the thinking bubble's (ADR 0126), in the colour of the face beside it.
    const dots = screen.getByTestId("task-dots", { includeHiddenElements: true });
    for (const dot of dots.children)
      expect(dot).toHaveStyle({ backgroundColor: avatarHue("Scout") });
    // The runtime's own prefix is read off the call, and the markers are drawn rather than said.
    expect(screen.getByText("serve · stop")).toBeTruthy();
    expect(screen.getByText("show app")).toBeTruthy();
    expect(screen.queryByText(/local-dev__/)).toBeNull();
    expect(screen.queryByText(/▸/)).toBeNull();
    expect(screen.queryByText(/💭/)).toBeNull();
  });

  it("holds a long call inside the bubble rather than letting it run off the room's edge", async () => {
    // A call longer than the bubble was laid out at its full length and the bubble's corner cut
    // it off mid-word, with no ellipsis to say there was more (Arjun, 1 October 2026, watching
    // Jacobian read about Starship). A box that stands to its own content overflows whatever it
    // is in, however hard the pill inside it tries to shrink, so neither the bubble's root nor
    // the wire may: both take the width they are given, and the pill ends where the bubble does.
    const { element } = open(
      state([
        line({
          authorId: "har_scout",
          authorKind: "harness",
          text: "💭 Reading the news\n▸ web_search · Starship Flight 14 September 2026 results",
        }),
      ]),
    );
    await render(element);
    for (const id of ["task", "task-wire"]) {
      expect(
        StyleSheet.flatten(screen.getByTestId(id).props["style"])["alignSelf"],
      ).toBeUndefined();
    }
    // And wraps inside it, as far as the thought does: held to one line, the pill ended in an
    // ellipsis that ate the thing the tool was given (Arjun, 1 October 2026).
    // A search is drawn as a glass and what it looked for (ADR 0126).
    expect(screen.getByText(/^Starship Flight/).props["numberOfLines"]).toBe(3);
  });

  it("draws the receipt a queued turn ends as, and leaves a lookalike the words it is", async () => {
    const loose = "💭 is the emoji for a thought.\nThis message is not one of those bubbles.";
    const { element } = open(
      state([
        line({
          id: "ln_a",
          authorId: "har_scout",
          authorKind: "harness",
          text: "💭 Worked 25s · 2 steps",
        }),
        line({ id: "ln_b", authorId: "har_scout", authorKind: "harness", text: loose }),
      ]),
    );
    await render(element);
    expect(screen.getByText("Worked 25s · 2 steps")).toBeTruthy();
    // A receipt is a settled thing, and wears no dots: three standing still read as words left
    // unsaid (ADR 0126).
    expect(screen.queryByTestId("task-dots", { includeHiddenElements: true })).toBeNull();
    expect(within(screen.getByTestId("line-ln_b")).getByText(/💭 is the emoji/)).toBeTruthy();
  });

  it("puts system, checkpoint and status lines in the margin, not in a bubble", async () => {
    const { element } = open(
      state([
        line({ id: "s", kind: "system", authorId: "har_scout", text: "read PO-4471.pdf" }),
        line({ id: "c", kind: "checkpoint", text: "Draft ready" }),
      ]),
    );
    await render(element);
    expect(screen.getByText("Scout read PO-4471.pdf")).toBeTruthy();
    expect(screen.getByText("Checkpoint")).toBeTruthy();
  });

  it("opens the agent's page from the line saying its context compacted (ADR 0146)", async () => {
    const snap = state([
      line({
        id: "k",
        kind: "system",
        authorId: "har_scout",
        text: "compacted its context · 214k → 21k tokens",
        compacted: { from: 214_000, to: 21_000, window: 272_000, by: "itself" },
      }),
      line({ id: "s", kind: "system", authorId: "har_scout", text: "read PO-4471.pdf" }),
    ]);
    const opened: string[] = [];
    const store = fakeStore(snap);
    await render(
      onAPhone(
        <SpaceView
          store={store}
          snapshot={snap}
          spaceId="sp_1"
          selfId="per_arjun"
          onOpenAgent={(id) => opened.push(id)}
        />,
      ),
    );
    expect(screen.getByText("Scout compacted its context · 214k → 21k tokens")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("compacted-k"));
    expect(opened).toEqual(["har_scout"]);
    // Any other margin line is words, not a way anywhere.
    expect(screen.queryByTestId("compacted-s")).toBeNull();
  });

  it("draws a lane a harness handed to itself, and gives each hop its own key", async () => {
    // Jacobian handing a Space of its own down: it is the lead and the specialist both, and the
    // last hop wears the child's label. So the same harness is in the trail twice, legitimately,
    // and keying a hop by who it is puts two children under one key — the console error Arjun
    // saw on 9 September 2026.
    const lane = {
      laneId: "lane_1",
      homeSpaceId: "sp_1",
      linkedSpaceIds: [],
      leadId: "har_scout",
      specialistId: "har_scout",
      onBehalfOf: "per_arjun",
      label: "Shopping",
      goal: "Check the Northwind quotes",
      constraints: [],
      state: "running",
      trail: [{ participantId: "per_arjun" }, { participantId: "har_scout" }],
    };
    const complained = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { element } = open(
        state([line({ id: "ln_task", kind: "task", laneId: "lane_1", text: "Check them" })], {
          lanes: [lane],
        }),
      );
      await render(element);
      expect(screen.getByTestId("task-card")).toBeTruthy();
      // The faces and nothing else: the room's title is already the last hop and the bubble
      // under the caption is already the first, so the names are the screen reader's alone
      // (Arjun, 11 September 2026).
      expect(screen.queryByText("Arjun → Scout → Shopping")).toBeNull();
      expect(screen.getByLabelText("Arjun → Scout → Shopping, working")).toBeTruthy();
      // The goal is the person's own words here, and the only copy of them in this room. No
      // *via Scout* under it: the chain above has Scout in the middle of it already.
      expect(screen.getByText("Check the Northwind quotes")).toBeTruthy();
      expect(screen.queryByText("via Scout")).toBeNull();
      const keys = complained.mock.calls.filter((call) => String(call[0]).includes("same key"));
      expect(keys).toEqual([]);
    } finally {
      complained.mockRestore();
    }
  });

  it("stands a lane's chain on the side of the bubble it captions", async () => {
    // Centred over a bubble that is hard against one edge, the caption read as the room's rather
    // than the line's (Arjun, 11 September 2026). Yours goes to the right, where your bubble is;
    // somebody else's begins where their bubble begins, which is past the face beside it.
    const lane = {
      laneId: "lane_3",
      homeSpaceId: "sp_1",
      linkedSpaceIds: [],
      leadId: "har_scout",
      specialistId: "har_scout",
      onBehalfOf: "per_arjun",
      label: "Shopping",
      goal: "Check the Northwind quotes",
      constraints: [],
      state: "running",
      trail: [{ participantId: "per_arjun" }],
    };
    const task = line({ id: "ln_task", kind: "task", laneId: "lane_3", text: "Check them" });
    const { rerender } = await render(open(state([task], { lanes: [lane] })).element);
    expect(screen.getByTestId("chain-ln_task")).toHaveStyle({ justifyContent: "flex-end" });

    const hers = { ...lane, onBehalfOf: "per_dana" };
    await rerender(open(state([task], { lanes: [hers] })).element);
    expect(screen.getByTestId("chain-ln_task")).toHaveStyle({ paddingLeft: 28 + SPACE.sm });
  });

  const routed = {
    laneId: "lane_2",
    homeSpaceId: "sp_2",
    linkedSpaceIds: ["sp_1"],
    leadId: "har_scout",
    specialistId: "har_scout",
    onBehalfOf: "per_arjun",
    label: "Shopping",
    goal: "Check the Northwind quotes",
    constraints: ["Under $500"],
    summary: "All three checked.",
    costUsd: 0.1,
    state: "running",
    trail: [{ participantId: "per_arjun" }],
  };
  const route = line({ id: "ln_route", kind: "route", laneId: "lane_2", text: "Check them" });

  it("opens a lane's details on a tap when its other end is this very room (Chess Game → Engineer, 15 September 2026)", async () => {
    // A Space handing work to a part of itself, in the one room (ADR 0032): there is nothing to
    // cross to, and a row that answered a tap with nothing read as broken.
    const opened: string[] = [];
    const self = { ...routed, homeSpaceId: "sp_1", linkedSpaceIds: ["sp_1"], state: "completed" };
    const { element } = open(state([route], { lanes: [self] }), (id) => opened.push(id));
    await render(element);
    const row = screen.getByTestId("route-card");
    expect(row).toHaveProp("accessibilityHint", "Opens the lane's details");
    expect(screen.queryByText("›")).toBeNull();
    await userEvent.press(row);
    expect(opened).toEqual([]);
    expect(screen.getByText("Check the Northwind quotes")).toBeTruthy();
    expect(screen.getByText("All three checked.")).toBeTruthy();
    await userEvent.press(screen.getByTestId(/^lane-.+-close$/));
    await waitFor(() => expect(screen.queryByTestId("lane-lane_2")).toBeNull());
  });

  it("draws a lane it routed as its chain alone, working while it goes and nothing once done", async () => {
    const opened: string[] = [];
    const { element } = open(state([route], { lanes: [routed] }), (id) => opened.push(id));
    const { rerender } = await render(element);
    expect(screen.getByTestId("route-card")).toBeTruthy();
    // Each name once: the faces are the hop, and the words are the space the work went to, which
    // is the one thing this room does not already say (Arjun, 11 September 2026).
    expect(screen.queryByText("Scout → Shopping")).toBeNull();
    expect(screen.getByText("Shopping")).toBeTruthy();
    expect(screen.getByLabelText("Scout → Shopping, working")).toBeTruthy();
    // The dots breathe at the row's right edge while it goes, and the word is the label's
    // (Arjun, 12 September 2026): a row that is breathing needs no telling what it is doing.
    expect(breathing()).toBeTruthy();
    expect(screen.queryByText("Working")).toBeNull();
    // Not the goal, which is the message one bubble up, nor the reply, which is one bubble down
    // (Arjun, 11 September 2026: only the chain).
    expect(screen.queryByText("Check the Northwind quotes")).toBeNull();
    expect(screen.queryByText("All three checked.")).toBeNull();

    // A tap crosses the lane; what the card used to show is one press and hold away.
    await userEvent.press(screen.getByTestId("route-card"));
    expect(opened).toEqual(["sp_2"]);
    await userEvent.longPress(screen.getByTestId("route-card"));
    expect(screen.getByText("Check the Northwind quotes")).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Request details" }));
    expect(screen.getByText("Under $500")).toBeTruthy();
    expect(screen.getByText("≈$0.10")).toBeTruthy();
    expect(screen.getByText("All three checked.")).toBeTruthy();
    await userEvent.press(screen.getByTestId(/^lane-.+-close$/));
    await waitFor(() => expect(screen.queryByTestId("lane-lane_2")).toBeNull());

    // Done draws nothing: the reply beneath is the proof.
    await rerender(open(state([route], { lanes: [{ ...routed, state: "completed" }] })).element);
    expect(breathing()).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    await rerender(open(state([route], { lanes: [{ ...routed, state: "failed" }] })).element);
    expect(screen.getByText("Failed")).toBeTruthy();
  });

  it("names the lead by the room of its own it handed down from", async () => {
    // Jacobian's Chess Game handing down to its Engineer read J → Engineer, as if from J's room
    // (13 September 2026). The model names the lead by that room; the row wears it.
    const handed = { ...routed, leadLabel: "Chess Game", label: "Engineer" };
    await render(open(state([route], { lanes: [handed] })).element);
    expect(screen.getByLabelText("Chess Game → Engineer, working")).toBeTruthy();
    expect(screen.queryByLabelText("Scout → Engineer, working")).toBeNull();
  });

  describe("the faces a person chose, carried into the chain (22 September 2026)", () => {
    // J → the game of life read as two sets of initials while the Spaces list wore the wafer and
    // the rocket Arjun had picked. Each face in the chain is now the room it stands for.
    const shade = (hex: string) => hueColours(hex, "light").ink;

    it("draws the room a route row crosses to in the face chosen for it, and says its name in that colour", async () => {
      const icons = { sp_2: { icon: "rocket", ground: 0 } };
      await render(open(state([route], { lanes: [routed], icons })).element);
      const face = screen.getByTestId("lane-face", { includeHiddenElements: true });
      expect(face).toHaveStyle({ backgroundColor: ICON_GROUNDS[0] });
      expect(screen.getByText("Shopping")).toHaveStyle({ color: shade(ICON_GROUNDS[0]) });
    });

    it("keeps the initials and the name's own colour where nothing was chosen", async () => {
      await render(open(state([route], { lanes: [routed] })).element);
      const face = screen.getByTestId("lane-face", { includeHiddenElements: true });
      expect(face).toHaveStyle({ backgroundColor: avatarHue("Shopping") });
      expect(screen.getByText("Shopping")).toHaveStyle({ color: shade(avatarHue("Shopping")) });
    });

    it("draws both ends of a caption as their rooms: the lead's, and this one", async () => {
      const handed = {
        ...routed,
        homeSpaceId: "sp_1",
        linkedSpaceIds: ["sp_j"],
        leadLabel: "J",
        leadSpaceId: "sp_j",
        trail: [
          { participantId: "per_arjun" },
          { participantId: "har_scout", label: "J", spaceId: "sp_j" },
        ],
      };
      const icons = { sp_j: { icon: "wafer", ground: 2 }, sp_1: { icon: "rocket", ground: 0 } };
      const task = line({ id: "ln_task", kind: "task", laneId: "lane_2", text: "Check them" });
      // A room of two, so the field draws no faces of its own (ADR 0204).
      const two = { lanes: [handed], icons, members: ["per_arjun", "har_scout"] };
      await render(open(state([task], two)).element);
      const faces = screen.getAllByTestId("trail-face", { includeHiddenElements: true });
      expect(faces).toHaveLength(3);
      // The person heads it as themselves; J is the wafer; this room is the rocket.
      expect(faces[0]).toHaveStyle({ backgroundColor: avatarHue("Arjun") });
      expect(faces[1]).toHaveStyle({ backgroundColor: ICON_GROUNDS[2] });
      expect(faces[2]).toHaveStyle({ backgroundColor: ICON_GROUNDS[0] });
    });

    it("never draws a harness as a room it is only working in", async () => {
      // Scout in PO-4471 is not PO-4471: a hop core did not name after a room keeps its own face,
      // whatever was chosen for the room the lane was linked into.
      const task = line({ id: "ln_task", kind: "task", laneId: "lane_2", text: "Check them" });
      const across = {
        ...routed,
        homeSpaceId: "sp_1",
        linkedSpaceIds: ["sp_po"],
        trail: [{ participantId: "per_arjun" }, { participantId: "har_scout" }],
      };
      const icons = { sp_po: { icon: "tent", ground: 4 }, sp_1: { icon: "rocket", ground: 0 } };
      await render(open(state([task], { lanes: [across], icons })).element);
      const faces = screen.getAllByTestId("trail-face", { includeHiddenElements: true });
      expect(faces[1]).toHaveStyle({ backgroundColor: avatarHue("Scout") });
      expect(faces[2]).toHaveStyle({ backgroundColor: ICON_GROUNDS[0] });
    });
  });

  it("draws the files the lane answered with under the route row, and never under the task", async () => {
    const menu = [
      { id: "att_1", filename: "menu-1.jpg", mimeType: "image/jpeg", byteSize: 4096 },
      { id: "att_2", filename: "menu-2.jpg", mimeType: "image/jpeg", byteSize: 2048 },
    ];
    const answered = { ...routed, state: "completed", attachments: menu };
    const { rerender } = await render(open(state([route], { lanes: [answered] })).element);
    // The summary is a bubble below; the photographs it is about were nowhere in this room
    // until now (Arjun, 12 September 2026).
    expect(screen.getByTestId("attachments")).toBeTruthy();
    expect(screen.getByText("menu-1.jpg")).toBeTruthy();
    expect(screen.getByText("menu-2.jpg")).toBeTruthy();

    // In the specialist's own room they are messages a few lines up, so the caption draws none.
    const task = line({ id: "ln_task", kind: "task", laneId: "lane_2", text: "Check them" });
    await rerender(open(state([task], { lanes: [answered] })).element);
    expect(screen.queryByTestId("attachments")).toBeNull();
  });

  const receipted = [
    {
      runId: "run_1",
      steps: [
        { stepId: "st_1", kind: "action", status: "done", title: "Drafted the email" },
        { stepId: "st_2", kind: "action", status: "failed", title: "Sent it", durationMs: 12_000 },
      ],
      costUsd: 0.42,
      model: "gpt-5.6-sol",
      inputTokens: 30_223,
      outputTokens: 232,
      approvals: [],
      questions: [],
    },
  ];

  it("keeps a run's receipt out of the room, and offers it on a long press", async () => {
    const { element } = open(
      state([line({ kind: "summary", runId: "run_1", text: "Emailed the supplier" })], {
        runs: receipted,
      }),
    );
    await render(element);
    // Nothing under the reply: a harness that makes ten calls to answer one question must not
    // leave ten rows, nor a box, under the answer (Arjun, 11 September 2026).
    expect(screen.queryByTestId("receipt")).toBeNull();
    expect(screen.queryByText(/2 steps/)).toBeNull();

    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    // The lifted menu says the run in one line, and opens the receipt on its own page.
    expect(screen.getByText("2 steps · 1 failed · ≈$0.42")).toBeTruthy();
    await userEvent.press(screen.getByTestId("lift-receipt"));
    expect(await screen.findByTestId("receipt")).toBeTruthy();
    expect(screen.getByText("2 steps · 1 failed · ≈$0.42")).toBeTruthy();
    expect(screen.getByText(/Drafted the email/)).toBeTruthy();
    expect(screen.getByText(/Sent it/)).toBeTruthy();
    expect(screen.getByText("12s")).toBeTruthy();
    expect(screen.getByText("gpt-5.6-sol · 30.2k in · 232 out")).toBeTruthy();
  });

  describe("a reply's change to the room's project (ADR 0222)", () => {
    const commit = "a".repeat(40);
    const change = (over: Record<string, unknown> = {}) => ({
      files: 2,
      changes: [
        {
          commit,
          before: null,
          by: "har_scout",
          byKind: "agent",
          at: "2026-09-07T10:00:00.000Z",
          seq: 1,
          message: "Two, not one",
          files: [{ path: "src/game.js", added: 1, removed: 1 }],
          moreFiles: 0,
          reply: "ln_1",
          ...over,
        },
      ],
    });
    const reply = line({
      kind: "summary",
      authorId: "har_scout",
      authorKind: "harness",
      runId: "run_1",
      text: "Made it two",
      change: commit,
    });

    it("is said under the reply, which opens it with its diff and Undo", async () => {
      const { element, store } = open(state([reply], { project: change() }));
      await render(element);
      await userEvent.press(screen.getByTestId(`change-${commit.slice(0, 7)}`));
      expect(await screen.findByTestId("line-change")).toBeTruthy();
      expect(await screen.findByText("+export const a = 2;\n")).toBeTruthy();
      await userEvent.press(screen.getByTestId("project-undo"));
      expect(store.calls).toContainEqual({ name: "undoChange", args: { spaceId: "sp_1", commit } });
    });

    it("says Undone once it is, and What the run did turns to it", async () => {
      const { element } = open(
        state([reply], { project: change({ undoneBy: "u".repeat(40) }), runs: receipted }),
      );
      await render(element);
      expect(screen.getByText("1 file changed · Undone")).toBeTruthy();
      await userEvent.longPress(screen.getByTestId("hold-ln_1"));
      await userEvent.press(screen.getByTestId("lift-receipt"));
      await userEvent.press(await screen.findByTestId("receipt-change"));
      expect(await screen.findByTestId("line-change")).toBeTruthy();
      // Undone already: nothing to undo again from here.
      expect(screen.queryByTestId("project-undo")).toBeNull();
    });
  });

  it("says how many of the tokens in came from the prompt cache, when the harness said", async () => {
    const cached = [{ ...receipted[0], inputTokens: 19_790, cacheReadTokens: 15_351 }];
    const { element } = open(
      state([line({ kind: "summary", runId: "run_1", text: "Emailed the supplier" })], {
        runs: cached,
      }),
    );
    await render(element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    await userEvent.press(screen.getByTestId("lift-receipt"));
    expect(await screen.findByText("gpt-5.6-sol · 19.8k in (15.4k cached) · 232 out")).toBeTruthy();
  });

  it("says only the tokens out when the run knew nothing of the tokens in (finding 11)", async () => {
    const outOnly = [{ ...receipted[0], inputTokens: undefined }];
    const { element } = open(
      state([line({ kind: "summary", runId: "run_1", text: "Emailed the supplier" })], {
        runs: outOnly,
      }),
    );
    await render(element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    await userEvent.press(screen.getByTestId("lift-receipt"));
    expect(await screen.findByText("gpt-5.6-sol · 232 out")).toBeTruthy();
  });

  it("offers what a run that only answered cost, and nothing when it said no cost", async () => {
    // Jacobian answering from what it knew: no calls, a cost (India trip, 20 October 2026).
    const answered = [
      {
        ...receipted[0],
        steps: [],
        costUsd: 0.029,
        startedAt: "2026-10-20T17:34:35.256Z",
        endedAt: "2026-10-20T17:34:38.893Z",
      },
    ];
    const reply = line({ kind: "summary", runId: "run_1", text: "There are 6 things on the list" });
    const { rerender } = await render(open(state([reply], { runs: answered })).element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.getByText("4s · ≈$0.03")).toBeTruthy();
    await userEvent.press(screen.getByTestId("lift-receipt"));
    expect(await screen.findByTestId("receipt")).toBeTruthy();
    expect(screen.getByText("4s · ≈$0.03")).toBeTruthy();

    const unpriced = [{ ...answered[0], costUsd: undefined }];
    await rerender(open(state([reply], { runs: unpriced })).element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.queryByTestId("lift-receipt")).toBeNull();
  });

  it("offers what a failed run did on the status line it left", async () => {
    const failed = line({
      kind: "status",
      runId: "run_1",
      authorId: "har_scout",
      authorKind: "harness",
      text: "The supplier's mail server refused the message.",
    });
    await render(open(state([failed], { runs: receipted })).element);
    expect(screen.queryByTestId("receipt")).toBeNull();
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.getByText("2 steps · 1 failed · ≈$0.42")).toBeTruthy();
  });

  it("keeps unattributed replies neutral even when a run completes", async () => {
    const closed = line({
      kind: "summary",
      folded: true,
      runId: "run_1",
      authorId: "har_scout",
      authorKind: "harness",
      text: "Emailed the supplier",
    });
    const { rerender } = await render(open(state([closed], { runs: receipted })).element);
    // Completion is not source identity; both remain neutral without provenance.
    expect(screen.getByTestId("bubble-ln_1")).toHaveStyle({ backgroundColor: light.them });
    const alone = { ...closed, folded: undefined };
    await rerender(open(state([alone], { runs: receipted })).element);
    expect(screen.getByTestId("bubble-ln_1")).toHaveStyle({ backgroundColor: light.them });
  });

  it("lets Dynamic Type carry a bubble half again and no further (WP5)", async () => {
    const said = line({ id: "ln_1", text: "Emailed the *supplier*" });
    await render(open(state([said])).element);
    const bubble = screen.getByTestId("bubble-ln_1");
    // The words, the bold inside them, and the time: each is either asking for the cap or
    // sitting inside a `Text` that asked, which is the only way a `Text` inherits one.
    const texts = within(bubble).getAllByText(/\w/);
    expect(texts.length).toBeGreaterThan(2);
    for (const text of texts) expect(capped(text)).toBe(true);
  });

  const going = {
    runId: "run_1",
    harnessId: "har_scout",
    state: "running",
    paused: false,
    startedAt: "2026-09-07T10:00:00.000Z",
    statusVerb: "Inferring the route",
    thought: { phase: "thinking", words: "Inferring the route", at: "2026-09-07T10:00:02.000Z" },
    steps: [
      {
        stepId: "st_1",
        status: "done",
        title: "memory_recall · the trip",
        tool: "jacobian.memory_recall",
        startedAt: "2026-09-07T10:00:01.000Z",
      },
      {
        stepId: "st_2",
        status: "started",
        title: "web_search · Tamar hours",
        tool: "jacobian.web_search",
        startedAt: "2026-09-07T10:00:03.000Z",
      },
    ],
    approvals: [],
    questions: [],
  };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("waits a beat before the dots come, and never before the person's own line is confirmed", async () => {
    const sent = line({ id: "ln_sent", authorId: "per_arjun", pending: true });
    const { rerender } = await render(open(state([sent], { run: going })).element);
    // Not in the same breath as the bubble that was just sent (Arjun, 11 September 2026).
    expect(screen.queryByTestId("doing")).toBeNull();
    await beat();
    expect(screen.queryByTestId("doing")).toBeNull();
    const { pending: _sending, ...confirmed } = sent;
    await rerender(open(state([confirmed], { run: going })).element);
    await beat(THINKING_GRACE_MS - 1);
    expect(screen.queryByTestId("doing")).toBeNull();
    await beat(1);
    expect(screen.getByTestId("doing")).toBeTruthy();
  });

  it("keeps the bubble up while more is sent, rather than folding it under each message", async () => {
    // Arjun, 23 September 2026: typing three messages while the harness worked took the bubble
    // down and brought it back a beat later under each, and the room dropped and rose with it.
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    expect(screen.getByTestId("doing")).toBeTruthy();
    const sent = line({
      id: "pending:k2",
      seq: Number.MAX_SAFE_INTEGER,
      authorId: "per_arjun",
      key: "k2",
      pending: true,
    });
    await rerender(open(state([line(), sent], { run: going })).element);
    // Long past the length of an exit: a bubble on its way out would be gone by now.
    await beat(THINKING_GRACE_MS * 2);
    expect(screen.getByTestId("doing")).toHaveAccessibleName(
      "Scout · Searching the web · “Tamar hours”",
    );
  });

  it("keeps a sent line's row when the server confirms it, so its landing is not cut short", async () => {
    const mine = { authorId: "per_arjun", key: "msg-k2" };
    const sent = line({
      ...mine,
      id: "pending:msg-k2",
      seq: Number.MAX_SAFE_INTEGER,
      pending: true,
    });
    const confirmed = line({ ...mine, id: "ln_2", seq: 2 });
    await render(open(state([line()])).element);
    const keyOf = screen.getByTestId("space-lines").props["keyExtractor"];
    expect(keyOf({ line: sent, place: "only" })).toBe(keyOf({ line: confirmed, place: "only" }));
    // A line nobody sent from here is still its own row by its id.
    expect(keyOf({ line: line(), place: "only" })).toBe("ln_1");
  });

  it("shows no dots at all for a run that answers inside the beat", async () => {
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat(THINKING_GRACE_MS / 2);
    const answer = line({ id: "ln_2", seq: 2, kind: "summary", runId: "run_1", text: "Seven." });
    await rerender(open(state([line(), answer], { run: { ...going, state: "done" } })).element);
    await beat();
    expect(screen.queryByTestId("doing")).toBeNull();
  });

  /** Scout's reply in run_1, posted while the run is still going, as Jacobian posts it. */
  const reply = line({
    id: "ln_2",
    seq: 2,
    authorId: "har_scout",
    authorKind: "harness",
    sourceRunId: "run_1",
    text: "Tamar opens at nine.",
  });

  it("holds a harness's reply until its run closes, so it lands as the bubble goes (ADR 0147)", async () => {
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    expect(screen.getByTestId("doing")).toBeTruthy();
    // The reply comes while the run is still going: held, the bubble standing.
    await rerender(open(state([line(), reply], { run: going })).element);
    expect(screen.queryByTestId("bubble-ln_2")).toBeNull();
    expect(screen.getByTestId("doing")).toBeTruthy();
    // The run closes on it 0.4 s later: the answer drawn in the render the bubble goes.
    await beat(400);
    const closed = line({ ...reply, kind: "summary", runId: "run_1", folded: true });
    await rerender(open(state([line(), closed], { run: { ...going, state: "done" } })).element);
    expect(screen.getByTestId("bubble-ln_2")).toBeTruthy();
    expect(screen.queryByTestId("doing")).toBeNull();
  });

  it("stands still while the room is out of touch, and goes as the reply it missed lands", async () => {
    // Arjun's iPhone, 14 October 2026: back after nine minutes, the turn long over, the bubble
    // breathed on for as long as the next socket took through the relay to bring the end.
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    await rerender(open(state([line()], { run: going, connection: "closed" })).element);
    for (const dot of dotsDrawn()) {
      expect(dot).toEqual(expect.objectContaining({ opacity: 0.28, transform: undefined }));
    }
    const clock = screen.getByTestId("doing-clock").props["children"];
    await beat(3000);
    expect(screen.getByTestId("doing-clock")).toHaveTextContent(clock);
    // Back in touch, the catch-up brings the reply and the close together: one change.
    const closed = line({ ...reply, kind: "summary", runId: "run_1", folded: true });
    await rerender(
      open(state([line(), closed], { run: { ...going, state: "done" }, connection: "open" }))
        .element,
    );
    expect(screen.getByTestId("bubble-ln_2")).toBeTruthy();
    expect(screen.queryByTestId("doing")).toBeNull();
  });

  it("lights its dots again a beat after the room is back, for a turn still going", async () => {
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    // Lit dots grow as the light reaches them; at rest nothing grows.
    const resting = () => dotsDrawn().every((dot) => dot.transform === undefined);
    expect(resting()).toBe(false);
    await rerender(open(state([line()], { run: going, connection: "connecting" })).element);
    expect(resting()).toBe(true);
    // Open again: the catch-up is a round trip behind, and may yet end the turn.
    await rerender(open(state([line()], { run: going, connection: "open" })).element);
    expect(resting()).toBe(true);
    await beat(CATCH_UP_MS);
    expect(resting()).toBe(false);
  });

  it("draws a word said mid-run once the wait is up, the bubble working on under it", async () => {
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    await rerender(open(state([line(), reply], { run: going })).element);
    expect(screen.queryByTestId("bubble-ln_2")).toBeNull();
    await beat(CLOSE_WAIT_MS);
    expect(screen.getByTestId("bubble-ln_2")).toBeTruthy();
    expect(screen.getByTestId("doing")).toBeTruthy();
  });

  it("draws what was said mid-run before the room was opened, without a wait", async () => {
    await render(open(state([line(), reply], { run: going })).element);
    expect(screen.getByTestId("bubble-ln_2")).toBeTruthy();
  });

  it("says what a harness is doing while it does it, as a bubble in the room", async () => {
    await render(open(state([line()], { run: going })).element);
    await beat();
    const bubble = screen.getByTestId("doing");
    // What kind of work, read off the tool and never off the harness's prose, and what the call
    // was given beside its glyph (ADR 0147). A screen reader hears what is on screen.
    expect(bubble).toHaveAccessibleName("Scout · Searching the web · “Tamar hours”");
    expect(screen.getByTestId("doing-label")).toHaveTextContent("Searching the web");
    expect(screen.getByTestId("doing-detail")).toHaveTextContent("“Tamar hours”");
    expect(screen.getByTestId("call-search")).toBeTruthy();
    // One line each, whatever they say: the bubble's size never follows its words.
    expect(screen.getByTestId("doing-label").props["numberOfLines"]).toBe(1);
    expect(screen.getByTestId("doing-detail").props["numberOfLines"]).toBe(1);
    expect(StyleSheet.flatten(within(bubble).getByTestId("doing-detail").props["style"])).toEqual(
      expect.objectContaining({ lineHeight: expect.any(Number) }),
    );
    // How long the turn has taken, as a clock reads.
    expect(screen.getByTestId("doing-clock")).toHaveTextContent(/^\d+:\d{2}$/);
    expect(within(bubble).getByTestId("doing-dots", { includeHiddenElements: true })).toBeTruthy();
    // The calls so far, a glyph each, the newest lit; drawn once the strip knows its width.
    const strip = screen.getByTestId("doing-strip", { includeHiddenElements: true });
    await act(async () => {
      fireEvent(strip, "layout", { nativeEvent: { layout: { width: 200, height: 18 } } });
    });
    expect(within(strip).getByTestId("strip-memory", { includeHiddenElements: true })).toBeTruthy();
    expect(within(strip).getByTestId("strip-search", { includeHiddenElements: true })).toBeTruthy();
    // Its face hangs at the bubble's foot, where a message's hangs (`Line.tsx`): a face at the
    // top while every other face in the room is at the bottom reads as a bubble that came loose
    // (Arjun, 1 October 2026).
    expect(StyleSheet.flatten(bubble.props["style"])["alignItems"]).toBe("flex-end");
    // Under the newest line, where the answer will land: the room's foot, the first row of an
    // inverted list, which moves with the rest of the room rather than standing outside it.
    const rows = screen.getByTestId("space-lines").props["data"] as readonly object[];
    expect(rows[0]).toMatchObject({ foot: true });
    expect(within(screen.getByTestId("space-foot")).getByTestId("doing")).toBeTruthy();
  });

  it("keeps an agent's face still beside its dots: one sign of the work, not two (ADR 0126)", async () => {
    // The face's pins ran round beside the mark running in the bubble, two spinners for one
    // agent (Arjun, 6 October 2026: "disable the agent icon spinner when spinner is going on in
    // bubble").
    const snapshot = state([line()], { run: going });
    const scout = { id: "har_scout", kind: "agent", displayName: "Scout" } as const;
    // In dark, where a pin's rest and the running light's low differ; in light both are none of
    // the colour, on metal (ADR 0192), so the two could not be told apart.
    await act(async () => chooseAppearance("dark"));
    try {
      await render(
        open({ ...snapshot, directory: { ...snapshot.directory, har_scout: scout } }).element,
      );
      await beat();
      const bubble = screen.getByTestId("doing");
      const hidden = { includeHiddenElements: true };
      // Its ten pins out and every one at rest: a light running round them starts each at the
      // clock's low, not at a pin's rest. Each pin holds its colour, which is what is lit.
      const pins = within(bubble).getByTestId("agent-pins", hidden).children;
      expect(pins).toHaveLength(10);
      for (const pin of pins) {
        const [colour] = (pin as { children: unknown[] }).children;
        expect(colour).toHaveStyle({ opacity: PIN_REST.outside });
      }
      expect(within(bubble).getByTestId("doing-dots", hidden)).toBeTruthy();
    } finally {
      await act(async () => chooseAppearance("system"));
    }
  });

  it("says Thinking and that it is reading the message before the harness says anything", async () => {
    const quiet = { ...going, statusVerb: undefined, thought: undefined, steps: [] };
    await render(open(state([line()], { run: quiet })).element);
    await beat();
    expect(screen.getByTestId("doing")).toHaveAccessibleName(
      "Scout · Thinking · Reading the message",
    );
    expect(screen.getByTestId("doing-dots", { includeHiddenElements: true })).toBeTruthy();
    // Two lines tall: the strip's row opens with the first call, and not before (ADR 0147).
    expect(screen.queryByTestId("doing-strip", { includeHiddenElements: true })).toBeNull();
  });

  it("holds its words a beat, and opens the strip's row with the first words after a call", async () => {
    const quiet = { ...going, statusVerb: "Writing…", thought: undefined, steps: [] };
    const { rerender } = await render(open(state([line()], { run: quiet })).element);
    await beat();
    expect(screen.getByTestId("doing-label")).toHaveTextContent("Thinking");
    const searching = {
      ...quiet,
      steps: [
        {
          stepId: "st_1",
          status: "started",
          title: "web_search · Tamar hours",
          tool: "jacobian.web_search",
          startedAt: "2026-09-07T10:00:03.000Z",
        },
      ],
    };
    await rerender(open(state([line()], { run: searching })).element);
    // Thinking has stood less than its time: the search waits its turn, and the row with it.
    expect(screen.getByTestId("doing-label")).toHaveTextContent("Thinking");
    expect(screen.queryByTestId("doing-strip", { includeHiddenElements: true })).toBeNull();
    await beat(LABEL_HOLD_MS);
    expect(screen.getAllByTestId("doing-label").at(0)).toHaveTextContent("Searching the web");
    expect(screen.getByTestId("doing-strip", { includeHiddenElements: true })).toBeTruthy();
  });

  it("never reads a reply on its way as the bubble's words", async () => {
    const writing = {
      ...going,
      statusVerb: "Tamar is open until",
      thought: { phase: "writing", words: "Tamar is open until", at: "2026-09-07T10:00:09.000Z" },
      steps: going.steps.map((step) => ({ ...step, status: "done" })),
    };
    await render(open(state([line()], { run: writing })).element);
    await beat();
    expect(screen.getByTestId("doing")).toHaveAccessibleName(
      "Scout · Writing · after 1 lookup · 1 search",
    );
    expect(screen.queryByText(/Tamar is open/)).toBeNull();
  });

  it("leaves the waiting to the chain row while a lane this room handed on is going", async () => {
    // The lead's own run and the lane it routed are the same waiting, and the room drew both:
    // dots in the row and dots in a bubble under it (Arjun, 12 September 2026).
    const { rerender } = await render(
      open(state([route], { lanes: [routed], run: going })).element,
    );
    await beat();
    expect(breathing()).toBeTruthy();
    expect(screen.queryByTestId("doing")).toBeNull();

    // Once the lane is done the row says nothing, and the bubble is the sign again.
    const done = { ...routed, state: "completed" };
    await rerender(open(state([route], { lanes: [done], run: going })).element);
    expect(screen.getByTestId("doing")).toBeTruthy();
  });

  it("goes the moment the answer lands, and the calls belong to the receipt from then on", async () => {
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    expect(screen.getByTestId("doing")).toBeTruthy();
    const answer = line({
      id: "ln_2",
      seq: 2,
      kind: "summary",
      authorId: "har_scout",
      authorKind: "harness",
      text: "Tamar, at seven.",
      runId: "run_1",
    });
    await rerender(open(state([line(), answer], { run: { ...going, state: "done" } })).element);
    expect(screen.queryByTestId("doing")).toBeNull();
    expect(screen.queryByText(/web_search · Tamar hours/)).toBeNull();
    expect(screen.getByText("Tamar, at seven.")).toBeTruthy();
  });

  it("goes when the run ends with nothing new to say, and leaves the foot standing nothing off", async () => {
    const { rerender } = await render(open(state([line()], { run: going })).element);
    await beat();
    await rerender(open(state([line()], { run: { ...going, state: "cancelled" } })).element);
    // Out of the room at once: its fade where it stood is the UI thread's (`Coming`, in
    // `RoomMotion.tsx`), and a bubble kept for the length of it held the room's foot open.
    expect(screen.queryByTestId("doing")).toBeNull();
    expect(screen.getByTestId("space-foot")).not.toHaveStyle({ paddingTop: 16 });
  });

  describe("with two harnesses at work in the room (the OpenClaw test, finding 22)", () => {
    const tree = {
      ...going,
      runId: "run_2",
      harnessId: "har_tree",
      statusVerb: "Checking the hours",
      thought: { phase: "thinking", words: "Checking the hours", at: "2026-09-07T10:00:02.000Z" },
      steps: [],
    };
    const said = () =>
      screen.getAllByTestId("doing").map((bubble) => bubble.props["accessibilityLabel"]);

    it("draws a bubble for each, the first to work in the room first", async () => {
      await render(open(state([line()], { runs: [going, tree], run: tree })).element);
      await beat();
      expect(within(screen.getByTestId("space-foot")).getAllByTestId("doing")).toHaveLength(2);
      expect(said()).toEqual([
        "Scout · Searching the web · “Tamar hours”",
        "Tree · Thinking · Checking the hours",
      ]);
    });

    it("keeps the bubble of the one still working when the other answers", async () => {
      // Jacobian began, OpenClaw began 1.7 s later and answered four seconds after that, and the
      // bubble went with it while Jacobian worked on for 28 seconds with nothing shown.
      const { rerender } = await render(
        open(state([line()], { runs: [going, tree], run: tree })).element,
      );
      await beat();
      const answer = line({
        id: "ln_2",
        seq: 2,
        kind: "summary",
        authorId: "har_tree",
        authorKind: "harness",
        text: "Open till nine.",
        runId: "run_2",
      });
      const answered = { ...tree, state: "done" };
      await rerender(
        open(state([line(), answer], { runs: [going, answered], run: answered })).element,
      );
      expect(said()).toEqual(["Scout · Searching the web · “Tamar hours”"]);
      expect(screen.getByText("Open till nine.")).toBeTruthy();
    });
  });

  it("closes up one author's bubbles said close together, and says the time over a silence", async () => {
    const said = (id: string, minute: number, who = "per_dana") =>
      line({ id, authorId: who, ts: `2026-09-07T10:${String(minute).padStart(2, "0")}:00.000Z` });
    await render(
      open(state([said("a", 0), said("b", 1), said("c", 30), said("d", 31, "per_arjun")])).element,
    );
    // The time stands over the first line and again after the half-hour, and nowhere else.
    expect(screen.getAllByTestId("separator")).toHaveLength(2);
    // Dana's two bubbles a minute apart are one turn: the time inside the last alone.
    const clock = /\d{1,2}:\d{2}/;
    expect(within(screen.getByTestId("line-a")).queryByText(clock)).toBeNull();
    expect(within(screen.getByTestId("line-b")).getByText(clock)).toBeTruthy();
    expect(within(screen.getByTestId("line-c")).getByText(clock)).toBeTruthy();
    expect(within(screen.getByTestId("line-d")).getByText(clock)).toBeTruthy();
  });

  it("says a line is waiting rather than sending when there is nothing to send it down", async () => {
    const held = line({ pending: true });
    await render(open(state([held], { connection: "closed" })).element);
    expect(screen.getByText("waiting for a connection")).toBeTruthy();

    await render(open(state([held])).element);
    expect(screen.getByText("sending…")).toBeTruthy();
  });

  it("shows the files a message carried", async () => {
    const withFile = line({
      attachments: [
        { id: "at_1", filename: "PO-4471.pdf", mimeType: "application/pdf", byteSize: 240_000 },
      ],
    });
    await render(open(state([withFile])).element);
    expect(screen.getByTestId("attachments")).toBeTruthy();
    expect(screen.getByText("PO-4471.pdf")).toBeTruthy();
  });

  it("shows the reactions and the notes the space has already given", async () => {
    const reacted = line({
      authorId: "har_scout",
      authorKind: "harness",
      reactions: [
        { by: "per_arjun", reaction: "👍", seq: 2 },
        { by: "per_dana", reaction: "👍", seq: 3 },
      ],
      corrections: [{ by: "per_dana", text: "Wrong address", ts: "x", seq: 4 }],
    });
    await render(open(state([reacted])).element);
    expect(screen.getByText("👍 2")).toBeTruthy();
    expect(screen.getByText("Dana Ruiz: Wrong address")).toBeTruthy();
  });

  it("says under a reply that its Not right? was turned away, with the words and why (PM-4)", async () => {
    const said = line({ id: "h", authorId: "har_scout", authorKind: "harness" });
    const refused: Snapshot = {
      ...state([said]),
      unsentNotes: new Map([
        ["h", { text: "Wrong facts. The 19th.", reason: "that message was taken back" }],
      ]),
    };
    await render(open(refused).element);
    const note = screen.getByTestId("unsent-h");
    expect(within(screen.getByTestId("line-h")).getByTestId("unsent-h")).toBe(note);
    expect(note).toHaveTextContent("Wrong facts. The 19th.", { exact: false });
    expect(note).toHaveTextContent("Not sent: that message was taken back.", { exact: false });

    await render(open(state([said])).element);
    expect(screen.queryByTestId("unsent-h")).toBeNull();
  });

  it("offers Not right? only on harness lines, and the quick actions on anyone's text", async () => {
    const said = line({ id: "h", authorId: "har_scout", authorKind: "harness" });
    await render(open(state([said, line({ authorId: "per_dana" })])).element);

    await userEvent.longPress(screen.getByTestId("hold-h"));
    expect(screen.getByRole("button", { name: "Not right?" })).toBeTruthy();
    // No thumbs any more (ADR 0200).
    expect(screen.queryByLabelText("Thumbs up")).toBeNull();
    expect(screen.queryByLabelText("Thumbs down")).toBeNull();
    // The card says who said it and when; the message itself is held up over the room.
    expect(screen.getByText(/^Scout · /)).toBeTruthy();
    expect(screen.getByTestId("bubble-copy-h")).toBeTruthy();
    for (const name of ["Copy", "Select", "Share"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }

    // A press on the room behind puts it down; it is unmounted once the copy has settled.
    await userEvent.press(screen.getByTestId("lift-backdrop"));
    await waitFor(() => expect(screen.queryByTestId("lift-card")).toBeNull());

    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.queryByRole("button", { name: "Not right?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("holds up the bubble as the room draws it, its words formatted", async () => {
    const said = line({
      id: "h",
      authorId: "har_scout",
      authorKind: "harness",
      text: "**These five are better matches** for the brief.\n\n- Northwind\n- Contoso",
    });
    await render(open(state([said])).element);
    await userEvent.longPress(screen.getByTestId("hold-h"));
    const copy = within(screen.getByTestId("bubble-copy-h"));
    expect(copy.getByText("These five are better matches")).toBeTruthy();
    expect(copy.queryByText(/\*\*/)).toBeNull();
  });

  it("shows a pinned reply by its words, not its marks", async () => {
    const said = line({
      id: "h",
      authorId: "har_scout",
      authorKind: "harness",
      text: "**These five are better matches** for the brief.",
    });
    await render(open(state([said], { pins: ["h"] })).element);
    expect(screen.getByText("📌 These five are better matches for the brief.")).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  it("sends Not right? as a note the harness hears: the reasons, then the words", async () => {
    const said = line({ id: "h", authorId: "har_scout", authorKind: "harness" });
    const { store, element } = open(state([said]));
    await render(element);
    await userEvent.longPress(screen.getByTestId("hold-h"));
    await userEvent.press(screen.getByRole("button", { name: "Not right?" }));
    // The menu goes, and the sheet comes up at its page.
    expect(await screen.findByTestId("not-right")).toBeTruthy();
    expect(screen.queryByTestId("lift-card")).toBeNull();
    // Nothing to send until a reason is picked or words are written.
    expect(screen.getByText("Pick a reason or say what to fix.")).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Send to Scout" }));
    expect(store.calls.some((call) => call.name === "sendFeedback")).toBe(false);

    await userEvent.press(screen.getByRole("checkbox", { name: "Missed what I asked" }));
    await userEvent.type(screen.getByTestId("not-right-h"), "The 19th, not the 12th.");
    await userEvent.press(screen.getByRole("button", { name: "Send to Scout" }));
    expect(store.calls).toContainEqual({
      name: "sendFeedback",
      args: {
        spaceId: "sp_1",
        lineId: "h",
        kind: "correction",
        text: "Missed what I asked. The 19th, not the 12th.",
      },
    });
    await waitFor(() => expect(screen.queryByTestId("not-right")).toBeNull());
  });

  it("marks the space read to its last line, or past a run that has ended", async () => {
    // The last line is 8; a run ended at 9, its completion after its message drawing no line
    // of its own. A run's card carries the run's last event, and being here has read it.
    const ended = {
      runId: "run_1",
      harnessId: "har_scout",
      state: "done",
      lastSeq: 9,
      steps: [],
      approvals: [],
      questions: [],
    };
    const lines = [line({ seq: 7 }), line({ id: "ln_2", seq: 8 })];
    const { store, element } = open(state(lines, { runs: [ended] }));
    await render(element);
    expect(store.calls).toContainEqual({ name: "markRead", args: { spaceId: "sp_1", seq: 9 } });
  });

  it("tells its screen when its list has laid out, so the platform's settings can reach it", async () => {
    // A room pushed from the + can be drawn without itself first and rebuilt, its list coming
    // after the screen has handed UIKit's edge settings out (`app/spaces/[id].tsx`).
    const listed = jest.fn();
    const snap = state([]);
    await render(
      onAPhone(
        <SpaceView
          store={fakeStore(snap)}
          snapshot={snap}
          spaceId="sp_1"
          selfId="per_arjun"
          onListed={listed}
        />,
      ),
    );
    expect(listed).not.toHaveBeenCalled();
    await fireEvent(screen.getByTestId("space-lines"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 573 } },
    });
    expect(listed).toHaveBeenCalled();
  });

  it("says nobody is here yet in a room of people alone, with Add agents (ADR 0148)", async () => {
    const opened = jest.fn();
    const snap = state([], { members: ["per_arjun"] });
    await render(
      onAPhone(
        <SpaceView
          store={fakeStore(snap)}
          snapshot={snap}
          spaceId="sp_1"
          selfId="per_arjun"
          onOpenRoom={opened}
        />,
      ),
    );
    expect(screen.getByText("Nobody's here yet")).toBeTruthy();
    expect(screen.queryByText("Nothing has been said here yet.")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Add agents" }));
    expect(opened).toHaveBeenCalledWith("add");
  });

  it("says so when the space is empty, and when it is closed", async () => {
    await render(open(state([], { members: ["per_arjun", "per_dana"] })).element);
    expect(screen.getByText("Nothing has been said here yet.")).toBeTruthy();
    // Over the list, which is there from the first frame: the platform's settings for the room's
    // scroll view are given to the one the screen finds as it is set up.
    expect(screen.getByTestId("space-empty")).toHaveStyle({
      position: "absolute",
      top: 0,
      bottom: 0,
    });
    expect(screen.getByTestId("space-lines")).toBeTruthy();

    await render(open(state([line()], { state: "closed" })).element);
    expect(screen.getByTestId("closed")).toBeTruthy();
  });

  it("asks what you would like to do while its agents wait for your first message (ADR 0149)", async () => {
    await render(open(state([])).element);
    expect(screen.getByTestId("space-waiting")).toBeTruthy();
    expect(screen.getByRole("header", { name: "What would you like to do?" })).toBeTruthy();
    expect(screen.getByText("Scout is here and waits for your first message.")).toBeTruthy();
    expect(screen.queryByText("Nothing has been said here yet.")).toBeNull();

    // Two wait together; and once you have said something, nobody is waiting.
    await render(open(state([], { members: ["per_arjun", "har_scout", "har_tree"] })).element);
    expect(
      screen.getByText("Scout and Tree are here and wait for your first message."),
    ).toBeTruthy();
    await render(open(state([line()])).element);
    expect(screen.queryByTestId("space-waiting")).toBeNull();
  });

  describe("with a harness that has never connected (the OpenClaw test, finding 18)", () => {
    /** The room, with each harness's last use as the server says it. */
    function lastSeen(snapshot: Snapshot, at: Readonly<Record<string, string | null>>): Snapshot {
      const directory = { ...snapshot.directory };
      for (const [id, lastSeenAt] of Object.entries(at)) {
        const found = directory[id];
        if (found !== undefined) directory[id] = { ...found, lastSeenAt };
      }
      return { ...snapshot, directory };
    }

    it("says so under a message sent to it, marks its face, and puts no notice over the composer (ADR 0083)", async () => {
      const asked = line({
        id: "ln_ask",
        seq: 5,
        authorId: "per_arjun",
        addressedTo: ["har_scout"],
      });
      const { rerender } = await render(
        open(lastSeen(state([asked]), { har_scout: null })).element,
      );
      const wait = await screen.findByTestId("wait-har_scout");
      expect(wait).toHaveTextContent(/Scout can't answer yet/);
      expect(wait).toHaveTextContent(/Never connected/);
      expect(screen.queryByTestId("unheard")).toBeNull();

      // Scout connects and speaks, and the line goes.
      const said = line({ id: "ln_scout", seq: 6, authorId: "har_scout", authorKind: "harness" });
      await rerender(
        open(lastSeen(state([asked, said]), { har_scout: "2026-09-27T10:00:00.000Z" })).element,
      );
      await waitFor(() => expect(screen.queryByTestId("wait-har_scout")).toBeNull());
    });
  });
});

describe("the composer", () => {
  it("sends what was typed", async () => {
    const { store, element } = open(state([line()], { members: ["per_arjun", "har_scout"] }));
    await render(element);
    await userEvent.type(screen.getByTestId("composer"), "On it");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: { spaceId: "sp_1", text: "On it" },
    });
  });

  it("takes the room to the foot when the message it sent lands, and not before", async () => {
    // Where the room moves on its transition, the line's cell takes it there (`RoomMotion.tsx`,
    // `send`), after the list has kept the reader's place; here, with Reduce Motion, the list is told.
    const { colourField } = jest.requireMock<{ colourField: { moves: boolean } }>(
      "./ScrollColours",
    );
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    colourField.moves = false;
    try {
      const view = await render(open(state([line()])).element);
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      // The press only asks. Going now would arrive at what *was* the foot and be held there
      // while the line landed under it, which is the bug this replaced.
      expect(scrolled).not.toHaveBeenCalled();

      const landed = state([line(), line({ id: "ln_2", text: "On it", authorId: "per_arjun" })]);
      await view.rerender(open(landed).element);
      // To the foot of the inverted list, which is where the line now is.
      expect(scrolled).toHaveBeenCalledTimes(1);
      expect(scrolled).toHaveBeenCalledWith({ offset: 0, animated: true });
    } finally {
      colourField.moves = true;
      scrolled.mockRestore();
    }
  });

  it("marks the first line after yours as its answer, which the room goes to as it lands", async () => {
    // Putting the keyboard away drags an inverted list up its history, past where the room holds
    // a reader's place, and the reply landed out of sight below (Arjun, 5 October 2026). The
    // answer's cell takes the room to it, on the room's spring (`RoomMotion.tsx`), as the line you
    // sent takes it to the foot: nothing here scrolls.
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    const asked = line({ id: "ln_2", seq: 2, text: "My lever is jammed", authorId: "per_arjun" });
    const said = (id: string, seq: number) =>
      line({ id, seq, text: "Don't force it.", authorId: "har_scout", authorKind: "harness" });
    try {
      const view = await render(open(state([line()])).element);
      await userEvent.type(screen.getByTestId("composer"), "My lever is jammed");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      await view.rerender(open(state([line(), asked])).element);
      expect(screen.getByTestId("arriving-ln_2").props["arrival"]).toBe("sent");

      await view.rerender(open(state([line(), asked, said("ln_3", 3)])).element);
      expect(screen.getByTestId("arriving-ln_3").props["arrival"]).toBe("answers");
      // Once: the next is read from its start, and a reader gone up to read the answer stays.
      await view.rerender(open(state([line(), asked, said("ln_3", 3), said("ln_4", 4)])).element);
      expect(screen.getByTestId("arriving-ln_4").props["arrival"]).toBe("opens");
      // And a line of yours that nothing armed — said elsewhere — only rises.
      const elsewhere = line({ id: "ln_5", seq: 5, text: "From the Mac", authorId: "per_arjun" });
      await view.rerender(
        open(state([line(), asked, said("ln_3", 3), said("ln_4", 4), elsewhere])).element,
      );
      expect(screen.getByTestId("arriving-ln_5").props["arrival"]).toBe("rises");
      expect(scrolled).not.toHaveBeenCalled();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("takes a room that does not move down to the answer from up the history itself", async () => {
    // Reduce Motion: no transition to go to it, so the list is told.
    const { colourField } = jest.requireMock<{
      colourField: { moves: boolean; scroll: { value: number } };
    }>("./ScrollColours");
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    const asked = line({ id: "ln_2", seq: 2, text: "On it", authorId: "per_arjun" });
    const said = (id: string, seq: number) =>
      line({ id, seq, authorId: "har_scout", authorKind: "harness" });
    colourField.moves = false;
    try {
      const view = await render(open(state([line()])).element);
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      await view.rerender(open(state([line(), asked])).element);
      expect(scrolled).toHaveBeenCalledTimes(1);

      colourField.scroll.value = 440;
      await view.rerender(open(state([line(), asked, said("ln_3", 3)])).element);
      expect(scrolled).toHaveBeenCalledTimes(2);
      expect(scrolled).toHaveBeenLastCalledWith({ offset: 0, animated: true });
      await view.rerender(open(state([line(), asked, said("ln_3", 3), said("ln_4", 4)])).element);
      expect(scrolled).toHaveBeenCalledTimes(2);
    } finally {
      colourField.moves = true;
      colourField.scroll.value = 0;
      scrolled.mockRestore();
    }
  });

  it("answers nothing for a line nobody there asked for, and scrolls nowhere", async () => {
    const { colourField } = jest.requireMock<{ colourField: { scroll: { value: number } } }>(
      "./ScrollColours",
    );
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    colourField.scroll.value = 440;
    try {
      const view = await render(open(state([line()])).element);
      const said = line({ id: "ln_2", seq: 2, authorId: "har_scout", authorKind: "harness" });
      await view.rerender(open(state([line(), said])).element);
      expect(screen.getByTestId("arriving-ln_2").props["arrival"]).toBe("opens");
      expect(scrolled).not.toHaveBeenCalled();
    } finally {
      colourField.scroll.value = 0;
      scrolled.mockRestore();
    }
  });

  it("leaves the room where it is when a command was typed rather than a message", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    try {
      const view = await render(open(state([line()])).element);
      await userEvent.type(screen.getByTestId("composer"), "/pause");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      // A line lands anyway — the harness said something — and the room stays where it was.
      const landed = state([line(), line({ id: "ln_2", text: "Paused.", authorId: "har_scout" })]);
      await view.rerender(open(landed).element);
      expect(scrolled).not.toHaveBeenCalled();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("carries a command out through core rather than through a dialect of its own", async () => {
    const runs = [
      {
        runId: "run_1",
        spaceId: "sp_1",
        harnessId: "har_scout",
        state: "running",
        paused: false,
        approvals: [],
        questions: [],
        steps: [],
      },
    ];
    const snapshot = state([line()], { runs });
    const store = fakeStore(snapshot);
    // The space's current run is the one the space carries.
    const withRun = {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: [{ ...snapshot.model.spaces[0], run: runs[0] }],
      },
    } as Snapshot;
    await render(
      onAPhone(<SpaceView store={store} snapshot={withRun} spaceId="sp_1" selfId="per_arjun" />),
    );
    await userEvent.type(screen.getByTestId("composer"), "/pause");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "pauseRun",
      args: { spaceId: "sp_1", runId: "run_1" },
    });
  });

  it("says why a command could not be carried out, and keeps the words", async () => {
    const { store, element } = open(state([line()]));
    await render(element);
    await userEvent.type(screen.getByTestId("composer"), "/pause");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("composer-notice")).toBeTruthy();
    expect(screen.getByText("There is no run going to pause.")).toBeTruthy();
    expect(screen.getByTestId("composer")).toHaveDisplayValue("/pause");
    expect(store.calls.filter((each) => each.name !== "markRead")).toEqual([]);
  });

  it("stands off the home indicator, whose band the phone takes the first touch in", async () => {
    await render(open(state([line()])).element);
    const bar = StyleSheet.flatten(screen.getByTestId("composer-bar").props["style"]);
    expect(bar.paddingBottom).toBe(SPACE.md + IPHONE.insets.bottom);
  });

  /** A foot standing taller than a quiet one: a notice over the field, or a draft of several lines. */
  const taller = quietFoot(IPHONE.insets.bottom) + 40;

  /** The foot, measured — which under Node nobody does, so the room is told (`room-foot`). */
  async function measuresItsFoot(height: number): Promise<void> {
    await act(async () => {
      screen
        .getByTestId("room-foot")
        .props["onLayout"]({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height } } });
    });
  }

  it("holds a quiet foot clear from its first frame, so a room opened does not shift up", async () => {
    await render(open(state([line()])).element);
    // Nothing under Node has laid anything out, so this is the room's first frame exactly: what
    // it is holding clear is the floor and not a measure.
    const clear = () =>
      StyleSheet.flatten(screen.getByTestId("space-lines").props["contentContainerStyle"])
        .paddingTop;
    expect(clear()).toBe(quietFoot(IPHONE.insets.bottom) + SPACE.md);
    // And the floor is the foot's own layout, read off the foot: the bar's padding over a field
    // of one line, over the band at the bottom of the glass. A padding or a field that changes
    // without this changing with it fails here.
    const bar = StyleSheet.flatten(screen.getByTestId("composer-bar").props["style"]);
    const field = StyleSheet.flatten(screen.getByTestId("composer-field").props["style"]);
    expect(quietFoot(IPHONE.insets.bottom)).toBe(bar.padding + field.minHeight + bar.paddingBottom);
    // The measure still governs: a foot with a notice over its field stands taller than the
    // floor, and the lines are held clear of that instead.
    await measuresItsFoot(taller);
    expect(clear()).toBe(taller + SPACE.md);
  });

  it("does not spring its own build: it moves once it has been drawn at its own foot's height", async () => {
    await render(open(state([line()])).element);
    const built = () => screen.getByTestId("space-lines").props["built"];
    // Nothing has measured itself yet, so nothing in the room has been seen: the room is being
    // built, and what the build changes is drawn where it belongs (`RoomMotion.tsx`).
    expect(built()).toBe(false);
    await measuresItsFoot(taller);
    // The foot it was drawn at is its own, and from here the room moves as a room does.
    expect(built()).toBe(true);
  });

  it("sends with the design system's arrow, and types on a keyboard the theme's colour", async () => {
    await render(open(state([line()])).element);
    // Send is a mark in a circle to the eye and the word to a screen reader.
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.queryByText("Send")).toBeNull();
    // A white keyboard across the bottom half of a dark room is the one thing the palette
    // cannot fix from the outside; the input asks for the theme's own.
    expect(screen.getByTestId("composer").props["keyboardAppearance"]).toBe("light");
  });

  it("will not send an empty line", async () => {
    await render(open(state([line()])).element);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("a message's words, flown from the field to their bubble (24 September 2026)", () => {
  const { flights } = jest.requireMock<{ flights: { land: () => void } }>("./SendFlight");
  const { colourField } = jest.requireMock<{
    colourField: { scroll: { value: number }; far: { value: number } };
  }>("./ScrollColours");

  /** Where the field says its words are, which the new architecture answers at once. */
  function fieldAt() {
    return jest
      .spyOn(TextInput.prototype, "measureInWindow")
      .mockImplementation((answer) => answer(92, 500, 250, 23));
  }

  /**
   * A room whose store does with a send what the real one does: a pending line of yours, under the
   * key the send was given, in what it says the room holds a moment after the send and not in it
   * (core's `notify` builds on the next frame); and a new listener answered at once. Or, `answered`,
   * the line as the server confirmed it, which on a good connection is the first the room sees.
   */
  function sending(lines: readonly LineModel[], answered = false) {
    let now = state(lines);
    const base = fakeStore(now);
    const listeners = new Set<(snapshot: Snapshot) => void>();
    const store = {
      ...base,
      getSnapshot: () => now,
      subscribe: (listener: (snapshot: Snapshot) => void) => {
        listeners.add(listener);
        listener(now);
        return () => {
          listeners.delete(listener);
        };
      },
      send: (input: { spaceId: string; text: string }) => {
        base.send(input);
        const said = { key: "msg-k1", seq: 2, text: input.text, authorId: "per_arjun" };
        const sent = answered
          ? line({ id: "ln_9", ...said })
          : line({ id: "pending:msg-k1", pending: true, ...said });
        queueMicrotask(() => {
          now = state([...lines, sent]);
          for (const listener of listeners) listener(now);
        });
      },
    };
    return {
      element: (snapshot: Snapshot) =>
        onAPhone(<SpaceView store={store} snapshot={snapshot} spaceId="sp_1" selfId="per_arjun" />),
      after: () => now,
      /** Another line lands in the room, as the store would say it. */
      arrive: (landed: LineModel) => {
        now = state([...(now.model.spaces[0]?.lines ?? []), landed]);
        for (const listener of listeners) listener(now);
      },
    };
  }

  it("keeps the new bubble out of sight while its words fly to it, and shows it when they land", async () => {
    const measured = fieldAt();
    try {
      const room = sending([line()]);
      const view = await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      // In the air, saying what the bubble will say while the server has not answered.
      expect(screen.getByTestId("send-flight")).toHaveTextContent("On it · sending…");

      // The room draws the line and keeps its bubble out of sight, watched for where it is.
      await view.rerender(room.element(room.after()));
      const bubble = screen.getByTestId("bubble-pending:msg-k1");
      expect(bubble).toHaveStyle({ opacity: 0 });
      expect(within(bubble).getByTestId("bubble-watch")).toBeTruthy();

      // On it: the bubble shows, the words that flew are gone, and nothing is watched.
      await act(async () => {
        flights.land();
      });
      expect(screen.getByTestId("bubble-pending:msg-k1")).not.toHaveStyle({ opacity: 0 });
      expect(screen.queryByTestId("send-flight")).toBeNull();
      expect(screen.queryByTestId("bubble-watch")).toBeNull();
    } finally {
      measured.mockRestore();
    }
  });

  it("holds the bubble of a line the server answered for before the room drew it", async () => {
    // A good connection answers inside the frame the store builds in, so the first the room sees
    // of the line is the confirmed one — and it is still the one the words are flying to. Found by
    // whether it was pending, it was missed: the bubble rose in on its own beside the words (Arjun's
    // phone, 25 September 2026).
    const measured = fieldAt();
    try {
      const room = sending([line()], true);
      const view = await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      await view.rerender(room.element(room.after()));
      const bubble = screen.getByTestId("bubble-ln_9");
      expect(bubble).toHaveStyle({ opacity: 0 });
      expect(within(bubble).getByTestId("bubble-watch")).toBeTruthy();
      await act(async () => {
        flights.land();
      });
      expect(screen.getByTestId("bubble-ln_9")).not.toHaveStyle({ opacity: 0 });
      expect(screen.queryByTestId("send-flight")).toBeNull();
    } finally {
      measured.mockRestore();
    }
  });

  it("brings the thinking bubble a beat after the words are down, not while they fly (ADR 0050, amended)", async () => {
    // Arjun's pick of B, 4 October 2026: counted from the run, the bubble came a fifth of a second
    // after the words had come to rest, and the room settled and rose again.
    const working = {
      runId: "run_1",
      harnessId: "har_scout",
      state: "running",
      paused: false,
      statusVerb: "Looking",
      steps: [],
      approvals: [],
      questions: [],
    };
    const measured = fieldAt();
    try {
      const room = sending([line()], true);
      const view = await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      jest.useFakeTimers();
      const lines = room.after().model.spaces[0]?.lines ?? [];
      await view.rerender(room.element(state(lines, { run: working })));
      // The run began while the words were in the air: nothing at the foot for as long as they are.
      await beat(THINKING_GRACE_MS * 2);
      expect(screen.queryByTestId("doing")).toBeNull();
      await act(async () => {
        flights.land();
      });
      await beat(THINKING_GRACE_MS - 1);
      expect(screen.queryByTestId("doing")).toBeNull();
      await beat(1);
      expect(screen.getByTestId("doing")).toBeTruthy();
    } finally {
      jest.useRealTimers();
      measured.mockRestore();
    }
  });

  it("holds a reply that lands while the words are in the air, and draws it once they are down", async () => {
    // A row mounting in the middle of the spring is where the room's rise took a double step
    // (the simulator, 25 September 2026): the harness's answer waits the rest of the flight.
    const measured = fieldAt();
    try {
      const room = sending([line()]);
      const view = await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      await view.rerender(room.element(room.after()));
      expect(screen.getByTestId("bubble-pending:msg-k1")).toHaveStyle({ opacity: 0 });

      // The harness answers inside the flight: the room draws your line and not the answer yet.
      const answer = line({ id: "ln_10", seq: 3, authorId: "har_scout", text: "Northwind it is." });
      await act(async () => room.arrive(answer));
      await view.rerender(room.element(room.after()));
      expect(screen.getByTestId("bubble-pending:msg-k1")).toBeTruthy();
      expect(screen.queryByText("Northwind it is.")).toBeNull();

      // Down: the answer lands, as one that came after.
      await act(async () => {
        flights.land();
      });
      expect(screen.getByText("Northwind it is.")).toBeTruthy();
      expect(screen.getByTestId("bubble-pending:msg-k1")).not.toHaveStyle({ opacity: 0 });
    } finally {
      measured.mockRestore();
    }
  });

  it("brings a reply in as a line that lands, and draws the room's own lines and your flown one where they stand", async () => {
    // A line that lands comes in under the one above it, as that one is drawn (`RoomMotion.tsx`),
    // asked once, as its row is first drawn. The lines the room opened with were there, and your
    // own line's words fly to it, so neither comes in.
    const measured = fieldAt();
    try {
      const room = sending([line()]);
      const view = await render(room.element(state([line()])));
      expect(screen.queryAllByTestId(/^arriving-/)).toHaveLength(0);

      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      await view.rerender(room.element(room.after()));
      await act(async () => {
        flights.land();
      });
      expect(screen.queryAllByTestId(/^arriving-/)).toHaveLength(0);

      const answer = line({ id: "ln_10", seq: 3, authorId: "har_scout", text: "Northwind it is." });
      await act(async () => room.arrive(answer));
      await view.rerender(room.element(room.after()));
      expect(
        within(screen.getByTestId("arriving-ln_10")).getByText("Northwind it is."),
      ).toBeTruthy();
      expect(screen.queryAllByTestId(/^arriving-/)).toHaveLength(1);
      // The answer to what was sent, read from its start and gone to (`RoomMotion.tsx`).
      expect(screen.getByTestId("arriving-ln_10").props["arrival"]).toBe("answers");

      // Drawn again — the next line lands under it — it is the line it was, not a new arrival.
      await act(async () =>
        room.arrive(line({ id: "ln_11", seq: 4, authorId: "har_scout", text: "And Acme." })),
      );
      await view.rerender(room.element(room.after()));
      expect(screen.getByTestId("arriving-ln_10").props["arrival"]).toBe("answers");
      expect(screen.getByTestId("arriving-ln_11").props["arrival"]).toBe("opens");
    } finally {
      measured.mockRestore();
    }
  });

  it("holds nothing at the foot where the room moves, and follows on the platform's ease where it does not", async () => {
    // A place kept at the foot is a line held still while one is put in under it, and the room
    // then has to be taken back down to the new one — the settle the room's transition replaced
    // (`RoomMotion.tsx`). Up the history the list keeps a reader's place itself (`ColourList`).
    const { colourField } = jest.requireMock<{ colourField: { moves: boolean } }>(
      "./ScrollColours",
    );
    const place = () => screen.getByTestId("space-lines").props["maintainVisibleContentPosition"];
    const view = await render(open(state([line(), line({ id: "ln_2", seq: 2 })])).element);
    expect(place()).toBeUndefined();
    colourField.moves = false;
    try {
      await view.rerender(open(state([line()])).element);
      expect(place()).toEqual({ minIndexForVisible: 0, autoscrollToTopThreshold: 100 });
    } finally {
      colourField.moves = true;
    }
  });

  it("flies nothing for a command, which puts no line in the room", async () => {
    const measured = fieldAt();
    try {
      await render(open(state([line()])).element);
      await userEvent.type(screen.getByTestId("composer"), "/title Supplier emails");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(screen.queryByTestId("send-flight")).toBeNull();
    } finally {
      measured.mockRestore();
    }
  });

  it("lets a message sent from far up the history land as it always has", async () => {
    const measured = fieldAt();
    jest.mocked(homeward).mockClear();
    colourField.scroll.value = 2400;
    colourField.far.value = 1;
    try {
      const room = sending([line()]);
      const view = await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(screen.queryByTestId("send-flight")).toBeNull();
      // Its line takes the list down once the room has kept the reader's place (`send`).
      expect(homeward).not.toHaveBeenCalled();
      await view.rerender(room.element(room.after()));
      expect(screen.getByTestId("bubble-pending:msg-k1")).not.toHaveStyle({ opacity: 0 });
    } finally {
      colourField.scroll.value = 0;
      colourField.far.value = 0;
      measured.mockRestore();
    }
  });

  it("lets one sent on the way back down land as from far, while the room still keeps the place", async () => {
    // Past `NEAR` the room keeps the reader's place, and goes on keeping it until they are back
    // inside `BACK`. Asked of the offset alone, a send from 80 points flew to a line the room was
    // holding off the glass below it (PH-21).
    const measured = fieldAt();
    colourField.scroll.value = 80;
    colourField.far.value = 1;
    try {
      const room = sending([line()]);
      await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(screen.queryByTestId("send-flight")).toBeNull();
    } finally {
      colourField.scroll.value = 0;
      colourField.far.value = 0;
      measured.mockRestore();
    }
  });

  it("flies one sent from a little above the foot, and asks the room for the foot", async () => {
    // Near the foot the list's offset stays where it is while the rows rise: the line landed as far
    // under the field as the list was above its foot (Arjun, 20 October 2026, PH-21).
    const measured = fieldAt();
    jest.mocked(homeward).mockClear();
    colourField.scroll.value = 40;
    try {
      const room = sending([line()]);
      await render(room.element(state([line()])));
      await userEvent.type(screen.getByTestId("composer"), "On it");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(screen.getByTestId("send-flight")).toHaveTextContent(/On it/);
      expect(homeward).toHaveBeenCalledTimes(1);
      expect(homeward).toHaveBeenCalledWith(colourField);
    } finally {
      colourField.scroll.value = 0;
      measured.mockRestore();
    }
  });
});

/**
 * A bubble whose time goes to the line that joins it. Laid out at once without it, and closed to
 * its new size on the room's transition while the time fades where it stood (`RoomMotion.tsx`);
 * what Node can say is what stands where, and the simulator shows how it moves there.
 */
describe("a bubble giving its time to the next", () => {
  const dana = (id: string, seq: number, text: string) =>
    line({ id, seq, text, ts: `2026-09-07T10:00:0${seq}.000Z` });

  it("gives it up to the next line of the same author, and takes the joined corner", async () => {
    const first = dana("ln_1", 1, "On it.");
    const view = await render(open(state([first])).element);
    expect(within(screen.getByTestId("bubble-ln_1")).getByText(clockTime(first.ts))).toBeTruthy();

    await view.rerender(open(state([first, dana("ln_2", 2, "Sent to you both.")])).element);
    expect(within(screen.getByTestId("bubble-ln_1")).queryByText(clockTime(first.ts))).toBeNull();
    expect(
      within(screen.getByTestId("bubble-ln_2")).getByText(clockTime("2026-09-07T10:00:02.000Z")),
    ).toBeTruthy();
    expect(screen.getByTestId("bubble-ln_1")).toHaveStyle({ borderBottomLeftRadius: BUBBLE.inner });
  });

  it("keeps it when the next line is somebody else's, which starts a turn of its own", async () => {
    const first = dana("ln_1", 1, "On it.");
    const view = await render(open(state([first])).element);
    await view.rerender(
      open(state([first, line({ id: "ln_2", seq: 2, authorId: "har_scout", text: "Filed." })]))
        .element,
    );
    expect(within(screen.getByTestId("bubble-ln_1")).getByText(clockTime(first.ts))).toBeTruthy();
    expect(screen.getByTestId("bubble-ln_1")).toHaveStyle({
      borderBottomLeftRadius: BUBBLE.radius,
    });
  });

  it("stands the time of my own files-only line on the page, in the page's ink", async () => {
    // A voice note sent from the emulator, 16 October 2026: its time was in the bubble's white,
    // under the note, on the light page.
    const note = line({
      id: "ln_1",
      authorId: "per_arjun",
      text: "",
      attachments: [
        { id: "at_1", filename: "voice-note.m4a", mimeType: "audio/mp4", byteSize: 90_000 },
      ],
    });
    await render(open(state([note])).element);
    const time = within(screen.getByTestId("line-ln_1")).getByText(clockTime(note.ts));
    expect(time).toHaveStyle({ color: light.ink3 });
  });

  it("gives a photo's time up from under its tile", async () => {
    const photo = line({
      id: "ln_1",
      text: "",
      attachments: [{ id: "at_1", filename: "dock.jpg", mimeType: "image/jpeg", byteSize: 90_000 }],
    });
    const view = await render(open(state([photo])).element);
    const row = () => screen.getByTestId("line-ln_1");
    expect(within(row()).getByText(clockTime(photo.ts))).toBeTruthy();
    await view.rerender(open(state([photo, dana("ln_2", 2, "That's the dock.")])).element);
    expect(within(row()).queryByText(clockTime(photo.ts))).toBeNull();
  });
});

/**
 * The press that opens the line's sheet, on the glass and in the hand.
 *
 * What Node can say about the lift is that it is wired: the bubble's scale is an animated one
 * rather than a number in a stylesheet. It cannot say how far it travels or when, because the
 * value belongs to the native driver from the moment the spring starts and JS is not told — the
 * same wall the room's other motion is behind. The haptic is different: it is a call, it is made
 * on the press and not on the sheet, and being made twice or not at all is exactly the bug.
 */
describe("holding a bubble", () => {
  const held = () => line({ authorId: "har_scout", authorKind: "harness", text: "Sent it" });

  it("answers in the hand on the press, before the sheet has started", async () => {
    await render(open(state([held()])).element);
    expect(impact).not.toHaveBeenCalled();

    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    // Medium: something was picked up. The light one is the composer's, for a message gone.
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it("holds up a copy of the bubble, and leaves the bubble where it is under it", async () => {
    // The bubble put out of sight took away at once whatever of it the copy did not cover — a long
    // reply's foot — and gave it back at once (Arjun, 18 October 2026). It stays, and goes soft with
    // the room behind its copy.
    await render(open(state([held()])).element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.getByTestId("bubble-copy-ln_1")).toBeTruthy();
    expect(screen.getByTestId("bubble-ln_1")).not.toHaveStyle({ opacity: 0 });

    await userEvent.press(screen.getByTestId("lift-backdrop"));
    await waitFor(() => expect(screen.queryByTestId("bubble-copy-ln_1")).toBeNull());
    expect(screen.getByTestId("bubble-ln_1")).not.toHaveStyle({ opacity: 0 });
  });

  it("holds the copy up still, with nothing in it coming or going on its own", async () => {
    // The copy's time faded as it went, as the room's does, and that fade put the room's own bubble
    // out of sight for some eight frames as the menu went (Arjun, 19 October 2026). How it moves is
    // the phone's; here, that the copy is held inside what keeps it still (`LiftStill`).
    await render(open(state([held()])).element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(within(screen.getByTestId("lift-still")).getByTestId("bubble-copy-ln_1")).toBeTruthy();
  });

  it("says nothing for a bubble with nothing to offer", async () => {
    // A message still on its way has no id the server knows to name in anything done to it.
    await render(open(state([line({ pending: true, key: "k1" })])).element);
    expect(screen.queryByTestId("hold-ln_1")).toBeNull();
    expect(impact).not.toHaveBeenCalled();
  });
});

/**
 * Deleting a message (ADR 0167). The dust is the UI thread's and the phone's to judge; under Node
 * the eraser is a marker and its wipe is over at once (`jest.setup.js`), so what a test reads is
 * the order of things: the sheet goes, the line breaks, the store is told, and Undo is offered.
 */
describe("deleting a message", () => {
  const mine = (over: Partial<LineModel> = {}) =>
    line({ authorId: "per_arjun", text: "Actually, check Tuesday too", ...over });

  it("offers Delete for me on anyone's message, and Delete for everyone on your own", async () => {
    const theirs = line({ id: "h", authorId: "har_scout", authorKind: "harness" });
    await render(open(state([theirs, mine()])).element);
    await userEvent.longPress(screen.getByTestId("hold-h"));
    expect(screen.getByRole("button", { name: "Delete for me" })).toBeTruthy();
    // Scout's words are not the reader's, and the reader does not own this room.
    expect(screen.queryByRole("button", { name: "Delete for everyone" })).toBeNull();
    await userEvent.press(screen.getByTestId("lift-backdrop"));
    await waitFor(() => expect(screen.queryByTestId("lift-card")).toBeNull());

    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.getByRole("button", { name: "Delete for me" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete for everyone" })).toBeTruthy();
  });

  it("deletes for you once the sheet has gone, and offers Undo, which puts it back", async () => {
    jest.mocked(madeHere).mockClear();
    const { store, element } = open(state([mine()]));
    await render(element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    await userEvent.press(screen.getByRole("button", { name: "Delete for me" }));
    await waitFor(() =>
      expect(store.calls).toContainEqual({
        name: "hideMessage",
        args: { spaceId: "sp_1", lineId: "ln_1" },
      }),
    );
    expect(screen.queryByTestId("lift-card")).toBeNull();
    expect(screen.getByText("Deleted for you")).toBeTruthy();
    // The room closes over it on its spring, up the history too: the reader's own change.
    expect(madeHere).toHaveBeenCalledTimes(1);

    await userEvent.press(screen.getByTestId("undo-pill-undo"));
    expect(store.calls).toContainEqual({
      name: "showMessage",
      args: { spaceId: "sp_1", lineId: "ln_1" },
    });
    expect(screen.queryByTestId("undo-pill")).toBeNull();
    // And opens for it on the same spring.
    expect(madeHere).toHaveBeenCalledTimes(2);
  });

  it("asks before deleting for everyone, says what an agent keeps, and Cancel puts it away", async () => {
    const { store, element } = open(state([mine()]));
    await render(element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    await userEvent.press(screen.getByRole("button", { name: "Delete for everyone" }));
    expect(await screen.findByRole("header", { name: "Delete for everyone?" })).toBeTruthy();
    expect(screen.getByText(/agents here have read it already/)).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByTestId("delete-asking")).toBeNull());
    expect(store.calls.some((call) => call.name === "deleteMessage")).toBe(false);

    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    await userEvent.press(screen.getByRole("button", { name: "Delete for everyone" }));
    await userEvent.press(screen.getByTestId("delete-for-everyone-confirm"));
    await waitFor(() =>
      expect(store.calls).toContainEqual({
        name: "deleteMessage",
        args: { spaceId: "sp_1", lineId: "ln_1" },
      }),
    );
    // No Undo: nothing undoes a deletion for everyone.
    expect(screen.queryByTestId("undo-pill")).toBeNull();
  });

  it("lets a tombstone go for you too, and nothing else", async () => {
    await render(open(state([mine({ deleted: true, text: "" })])).element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    expect(screen.getByRole("button", { name: "Delete for me" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete for everyone" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(screen.queryByTestId("lift-capsule")).toBeNull();
  });
});

/**
 * What a test under Node can say about the keyboard, and what it cannot. The room's frame holds
 * its foot clear of the keys with a Reanimated padding (`KeyboardRoom.tsx`), and Reanimated
 * cannot be imported here at all — so that file is a plain view under Jest, like the other three,
 * and nothing in this file can watch the composer ride. The arithmetic is
 * `roomKeyboard.vitest.ts`; the ride is a device's to prove and `e2e/maestro/keyboard.yaml` asks
 * for it. What is provable here is the other half of the room's bargain with the keyboard: that a
 * drag down the lines takes it, and that a tap puts it away.
 */
describe("the keyboard", () => {
  it("lets a drag down the room take the keyboard with it", async () => {
    await render(open(state([line()])).element);
    expect(screen.getByTestId("space-lines").props["keyboardDismissMode"]).toBe("interactive");
  });

  it("puts the keyboard away when the room itself is tapped", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    // With the keys up: the room asks for the touch only then, and the library holds a view that
    // refuses the touch to be untouchable, which is the same refusal a finger would meet.
    const up = jest.spyOn(Keyboard, "isVisible").mockReturnValue(true);
    try {
      await render(open(state([line()])).element);
      fireEvent(screen.getByTestId("room-tap"), "responderRelease");
      expect(away).toHaveBeenCalled();
    } finally {
      away.mockRestore();
      up.mockRestore();
    }
  });

  it("puts it away when a message is tapped, the bubble having taken that touch", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    try {
      await render(open(state([line()])).element);
      fireEvent.press(screen.getByTestId("hold-ln_1"));
      expect(away).toHaveBeenCalled();
    } finally {
      away.mockRestore();
    }
  });

  // Asked for only while there is something to put away, so a room at rest neither claims a
  // touch the list is about to use for a drag nor stands between a reader and what they tapped.
  it("asks for the touch only while the keyboard is up", async () => {
    const up = jest.spyOn(Keyboard, "isVisible").mockReturnValue(false);
    try {
      await render(open(state([line()])).element);
      const room = screen.getByTestId("room-tap");
      expect(room.props["onStartShouldSetResponder"]()).toBe(false);
      up.mockReturnValue(true);
      expect(room.props["onStartShouldSetResponder"]()).toBe(true);
    } finally {
      up.mockRestore();
    }
  });
});

describe("landing on the line a link points at", () => {
  /** Three lines, newest first in the room: ln_3 is row 1, the summary row 2, ln_1 row 3. */
  const said = () =>
    state([
      line({ id: "ln_1", text: "Northwind can deliver on Friday." }),
      line({
        id: "ln_2",
        text: "the summary: Northwind it is",
        kind: "summary",
        runId: "run_1",
        authorId: "har_scout",
        authorKind: "harness",
      }),
      line({ id: "ln_3", text: "after" }),
    ]);

  function landedIn(at: string, words?: string) {
    const snapshot = said();
    return onAPhone(
      <SpaceView
        store={fakeStore(snapshot)}
        snapshot={snapshot}
        spaceId="sp_1"
        selfId="per_arjun"
        at={at}
        words={words}
      />,
    );
  }

  /** The room's foot, measured, which is the room built: nobody under Node lays anything out. */
  async function built(): Promise<void> {
    await act(async () => {
      screen
        .getByTestId("room-foot")
        .props["onLayout"]({ nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 120 } } });
    });
  }

  /** The frames a landing places its line in, and any timers after them. */
  async function frames(ms = 100): Promise<void> {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }

  const shown = () => screen.getByTestId("space-lines").props["shown"];
  const marked = () => screen.queryAllByTestId("mark").map((mark) => mark.props["children"]);

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("opens on the line unseen, places it with no glide once built, then shows it lit (ADR 0133)", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(landedIn("run:run_1", "Northwind"));
      // Held unseen until the room has been built, so nothing it corrects moves the line after.
      expect(shown()).toBe(false);
      expect(scrolled).not.toHaveBeenCalled();
      await built();
      await frames();
      // Newest first in the room: ln_3 is 0, the summary is 1 — and row 2, the room's foot being
      // the list's first row. At once, each time, never on a glide from the foot.
      expect(scrolled).toHaveBeenCalledWith({ index: 2, viewPosition: 0.5, animated: false });
      expect(scrolled.mock.calls.every(([asked]) => asked.animated === false)).toBe(true);
      expect(shown()).toBe(true);
      expect(screen.getByTestId("flash-ln_2")).toBeTruthy();
      expect(screen.queryByTestId("flash-ln_1")).toBeNull();
      // A run lands on the line that closed it, where the words searched for were not: no marks.
      expect(marked()).toEqual([]);
    } finally {
      scrolled.mockRestore();
    }
  });

  it("draws every row to a line past its first rows once in view, then places it unseen", async () => {
    // Thirty lines, the oldest of them the one linked to: row 30, past the twelve a room draws first.
    const many = state(
      Array.from({ length: 30 }, (_, at) =>
        line({ id: `ln_${at + 1}`, seq: at + 1, text: `line ${at + 1}` }),
      ),
    );
    const room = (inView: boolean) =>
      onAPhone(
        <SpaceView
          store={fakeStore(many)}
          snapshot={many}
          spaceId="sp_1"
          selfId="per_arjun"
          at="line:ln_1"
          inView={inView}
        />,
      );
    // The list has measured only the rows it has drawn, as one far up a long room has not.
    const scrolled = jest.spyOn(FlatList.prototype, "scrollToIndex").mockImplementation(function (
      this: FlatList<unknown>,
      { index },
    ) {
      if (index < (this.props.initialNumToRender ?? 0)) return;
      this.props.onScrollToIndexFailed?.({
        index,
        averageItemLength: 80,
        highestMeasuredFrameIndex: (this.props.initialNumToRender ?? 1) - 1,
      });
    });
    const roughly = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    const drawn = () => screen.getByTestId("space-lines").props["initialNumToRender"];
    try {
      const { rerender } = await render(room(false));
      await built();
      await frames();
      // Not until the room has begun to come into view: the bar draws its name first.
      expect(scrolled).not.toHaveBeenCalled();
      expect(drawn()).toBe(12);
      await rerender(room(true));
      await frames();
      // Every row to it, and a few past, at once, and the line placed where it is, no glide.
      expect(drawn()).toBe(39);
      expect(scrolled).toHaveBeenLastCalledWith({ index: 30, viewPosition: 0.5, animated: false });
      expect(roughly).not.toHaveBeenCalled();
      expect(shown()).toBe(true);
      expect(screen.getByTestId("flash-ln_1")).toBeTruthy();
      // The rows between go again once the marks would have.
      await frames(MARKS_MS);
      expect(drawn()).toBe(12);
    } finally {
      scrolled.mockRestore();
      roughly.mockRestore();
    }
  });

  it("goes roughly to a line not laid out in a room already open, then to it on a glide", async () => {
    let asked = 0;
    const scrolled = jest.spyOn(FlatList.prototype, "scrollToIndex").mockImplementation(function (
      this: FlatList<unknown>,
      { index },
    ) {
      asked += 1;
      if (asked > 2) return;
      this.props.onScrollToIndexFailed?.({
        index,
        averageItemLength: 80,
        highestMeasuredFrameIndex: 1,
      });
    });
    const roughly = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    try {
      const snapshot = said();
      const room = (at?: string) =>
        onAPhone(
          <SpaceView
            store={fakeStore(snapshot)}
            snapshot={snapshot}
            spaceId="sp_1"
            selfId="per_arjun"
            at={at}
          />,
        );
      const { rerender } = await render(room());
      await built();
      await rerender(room("line:ln_1"));
      await frames();
      expect(roughly).toHaveBeenCalledWith({ offset: 240, animated: false });
      expect(scrolled).toHaveBeenLastCalledWith({ index: 3, viewPosition: 0.5, animated: true });
      expect(screen.getByTestId("flash-ln_1")).toBeTruthy();
    } finally {
      scrolled.mockRestore();
      roughly.mockRestore();
    }
  });

  it("marks the words searched for in the line, and clears them once the flash has gone", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(landedIn("line:ln_1", "northwind fri"));
      await built();
      await frames();
      const lit = screen.getByTestId("flash-ln_1");
      expect(
        within(lit)
          .getAllByTestId("mark")
          .map((mark) => mark.props["children"]),
      ).toEqual(["Northwind", "Friday"]);
      // Only in the line it opened: the summary says Northwind too.
      expect(marked()).toHaveLength(2);
      await frames(MARKS_MS);
      expect(marked()).toEqual([]);
      expect(screen.getByTestId("flash-ln_1")).toBeTruthy();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("marks nothing when the link says only where to land", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(landedIn("line:ln_1"));
      await built();
      await frames();
      expect(screen.getByTestId("flash-ln_1")).toBeTruthy();
      expect(marked()).toEqual([]);
    } finally {
      scrolled.mockRestore();
    }
  });

  it("is shown in the end however far it got, and goes to the line from there", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      // Never built: the foot is never measured.
      await render(landedIn("line:ln_1"));
      await frames(PLACING_MS - 1);
      expect(shown()).toBe(false);
      await frames(1);
      expect(shown()).toBe(true);
      expect(scrolled).toHaveBeenCalledWith({ index: 3, viewPosition: 0.5, animated: true });
    } finally {
      scrolled.mockRestore();
    }
  });

  it("goes to a line in view, on a glide, in a room that is already open", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      const snapshot = said();
      const room = (at?: string) =>
        onAPhone(
          <SpaceView
            store={fakeStore(snapshot)}
            snapshot={snapshot}
            spaceId="sp_1"
            selfId="per_arjun"
            at={at}
          />,
        );
      const { rerender } = await render(room());
      await built();
      expect(shown()).toBe(true);
      await rerender(room("line:ln_1"));
      await frames();
      expect(scrolled).toHaveBeenCalledWith({ index: 3, viewPosition: 0.5, animated: true });
      expect(shown()).toBe(true);
      expect(screen.getByTestId("flash-ln_1")).toBeTruthy();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("draws the asks the space is holding at its foot, and takes a yes from there", async () => {
    const runs = [
      {
        runId: "run_1",
        spaceId: "sp_1",
        harnessId: "har_scout",
        state: "waiting",
        paused: false,
        approvals: [
          {
            approvalId: "apr_1",
            runId: "run_1",
            actionKind: "email.send",
            to: "dana@northwind.com",
            askedAt: "2026-09-07T10:00:00.000Z",
            risk: ["external_communication"],
            sources: [],
            editable: true,
            fallback: "deny",
            approvers: [],
          },
        ],
        questions: [],
        steps: [],
      },
    ];
    const snapshot = state([line()], { runs });
    const store = fakeStore(snapshot);
    const details: string[] = [];
    await render(
      onAPhone(
        <SpaceView
          store={store}
          snapshot={snapshot}
          spaceId="sp_1"
          selfId="per_arjun"
          onDetails={(item) => details.push(item.id)}
        />,
      ),
    );
    expect(screen.getByTestId("room-asks")).toBeTruthy();
    expect(screen.getByText("Scout asks")).toBeTruthy();
    // In the room there is no way "into the space": it is already here.
    expect(screen.queryByRole("button", { name: /Open in the space/ })).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(store.calls).toContainEqual({
      name: "resolveApproval",
      args: {
        spaceId: "sp_1",
        runId: "run_1",
        approvalId: "apr_1",
        decision: "approved",
        scope: "once",
      },
    });
    await userEvent.press(screen.getByRole("button", { name: "Details" }));
    expect(details).toEqual(["apr_1"]);
  });

  it("answers a question on its card in the room, with no screen of its own", async () => {
    // The Chess Game space, 15 September 2026: the plan is the message above, and the question
    // is its three buttons. Answer used to open a screen that showed the prompt and not the plan.
    const runs = [
      {
        runId: "run_1",
        spaceId: "sp_1",
        harnessId: "har_scout",
        state: "done",
        paused: false,
        approvals: [],
        questions: [
          {
            askId: "qst_1",
            runId: "run_1",
            spaceId: "sp_1",
            harnessId: "har_scout",
            askedAt: "2026-09-15T06:59:34.244Z",
            onNoAnswer: "continue",
            questions: [
              {
                questionId: "choice",
                prompt: "Choose one, or reply in your own words:",
                options: [
                  { value: "ask:4ea1ce76:0", label: "Approve" },
                  { value: "ask:4ea1ce76:1", label: "Revise" },
                  { value: "ask:4ea1ce76:2", label: "Deny" },
                ],
                multiSelect: false,
                allowFreeText: true,
              },
            ],
          },
        ],
        steps: [],
      },
    ];
    const plan = line({
      authorId: "har_scout",
      authorKind: "harness",
      text: "Plan: add Bronze beside the current theme. How would you like to proceed?",
    });
    const snapshot = state([plan], { runs });
    const store = fakeStore(snapshot);
    const details: string[] = [];
    await render(
      onAPhone(
        <SpaceView
          store={store}
          snapshot={snapshot}
          spaceId="sp_1"
          selfId="per_arjun"
          onDetails={(item) => details.push(item.id)}
        />,
      ),
    );
    expect(screen.getByText("Scout has a question")).toBeTruthy();
    expect(screen.getByText(/How would you like to proceed\?/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Answer" })).toBeNull();
    await userEvent.press(screen.getByRole("radio", { name: "Approve" }));
    await userEvent.press(screen.getByRole("button", { name: "Send the answer" }));
    expect(store.calls).toContainEqual({
      name: "answerQuestion",
      args: {
        spaceId: "sp_1",
        runId: "run_1",
        askId: "qst_1",
        answers: [{ questionId: "choice", values: ["ask:4ea1ce76:0"] }],
      },
    });
    expect(details).toEqual([]);
  });

  it("says on the card why the server turned an answer away", async () => {
    const runs = [
      {
        runId: "run_1",
        spaceId: "sp_1",
        harnessId: "har_scout",
        state: "done",
        paused: false,
        approvals: [],
        questions: [
          {
            askId: "qst_1",
            runId: "run_1",
            spaceId: "sp_1",
            harnessId: "har_scout",
            askedAt: "2026-09-15T06:59:34.244Z",
            onNoAnswer: "continue",
            questions: [
              {
                questionId: "choice",
                prompt: "Which?",
                options: [
                  { value: "a", label: "A" },
                  { value: "b", label: "B" },
                ],
                multiSelect: false,
                allowFreeText: false,
              },
            ],
          },
        ],
        steps: [],
      },
    ];
    const refused = {
      ...state([line()], { runs }),
      refused: new Map([["qst_1", "question.answered was refused: the run has ended as done"]]),
    } as Snapshot;
    await render(open(refused).element);
    expect(screen.getByTestId("answer-refused")).toHaveTextContent(
      "Not sent: the run has ended as done.",
    );
  });
});

describe("text utilities and source identity", () => {
  it.each(["per_arjun", "har_scout"])(
    "copies %s's original Markdown and code whitespace",
    async (authorId) => {
      const text = "**Report**\n\n```ts\n  const a = 1;\n```";
      await render(
        open(
          state([
            line({ authorId, authorKind: authorId === "per_arjun" ? "person" : "harness", text }),
          ]),
        ).element,
      );
      await fireEvent(screen.getByTestId("hold-ln_1"), "longPress");
      await userEvent.press(screen.getByRole("button", { name: "Copy" }));
      expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(text);
      // It says so, and the message is put down a beat later.
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
      await waitFor(() => expect(screen.queryByTestId("lift-card")).toBeNull());

      await fireEvent(screen.getByTestId("hold-ln_1"), "longPress");
      await userEvent.press(screen.getByRole("button", { name: "Select" }));
      // Drawn formatted, as a page a finger selects across, with the code's indent kept.
      const html: string = (await screen.findByTestId("page-view")).props["source"].html;
      expect(html).toContain("<strong>Report</strong>");
      expect(html).toContain("  const a = 1;");
      expect(html).not.toContain("**");
      await userEvent.press(screen.getByRole("button", { name: "Back" }));
      await waitFor(() => expect(screen.queryByTestId("page-view")).toBeNull());

      await fireEvent(screen.getByTestId("hold-ln_1"), "longPress");
      if (authorId === "per_arjun") {
        // Your own words offer Edit where another's offer Share.
        expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
        return;
      }
      const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.dismissedAction });
      await userEvent.press(screen.getByRole("button", { name: "Share" }));
      expect(share).toHaveBeenCalledWith({ message: text });
      share.mockRestore();
    },
  );

  it("opens Edit's page once the lifted message has gone, saves the words, and lifts again", async () => {
    // A page presented while the menu's modal was still going went with it, and the line then held
    // a sheet nobody could see (the simulator, 18 October 2026): the page waits for the menu.
    const { store, element } = open(
      state([line({ authorId: "per_arjun", text: "Lunch at noon" })]),
    );
    await render(element);
    await fireEvent(screen.getByTestId("hold-ln_1"), "longPress");
    await userEvent.press(screen.getByRole("button", { name: "Edit" }));
    const field = await screen.findByTestId("edit-ln_1");
    expect(screen.queryByTestId("lift-card")).toBeNull();
    await userEvent.clear(field);
    await userEvent.type(field, "Lunch at one");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(store.calls).toContainEqual({
      name: "editMessage",
      args: { spaceId: "sp_1", lineId: "ln_1", text: "Lunch at one" },
    });
    await waitFor(() => expect(screen.queryByTestId("edit-page")).toBeNull());
    await fireEvent(screen.getByTestId("hold-ln_1"), "longPress");
    expect(screen.getByTestId("lift-card")).toBeTruthy();
  });

  it("uses each originating lane's hue in one receiver and leaves unattributed text neutral", async () => {
    const lane = {
      laneId: "lane_design",
      runId: "run_design",
      label: "Designer",
      specialistId: "har_scout",
      leadId: "har_scout",
      onBehalfOf: "per_arjun",
      linkedSpaceIds: ["sp_1"],
      homeSpaceId: "sp_1",
      goal: "Draw",
      constraints: [],
      state: "completed",
      delivery: "delivered",
      depth: 1,
      trail: [],
    };
    const authored = { authorId: "har_scout", authorKind: "harness" as const };
    await render(
      open(
        state(
          [
            line({ ...authored, sourceRunId: "run_design" }),
            line({ ...authored, id: "research", sourceRunId: "run_research", text: "Results" }),
            line({ ...authored, id: "unknown", text: "Unknown provenance" }),
          ],
          {
            lanes: [
              lane,
              { ...lane, laneId: "lane_research", runId: "run_research", label: "Research" },
            ],
          },
        ),
      ).element,
    );
    expect(screen.getByTestId("bubble-ln_1")).toHaveStyle({
      backgroundColor: sourceColours("Designer", "light").ground,
    });
    expect(screen.getByTestId("bubble-research")).toHaveStyle({
      backgroundColor: sourceColours("Research", "light").ground,
    });
    expect(screen.getByTestId("bubble-unknown")).toHaveStyle({ backgroundColor: light.them });
    expect(screen.getByText("Designer")).toBeTruthy();
  });
});

describe("who a message is for (ADR 0081)", () => {
  const PAIR = ["per_arjun", "har_scout", "har_tree"];
  const pair = (lines: readonly LineModel[]) => state(lines, { members: PAIR });

  // Where the capsule is, which the menu stands on: Jest's views never say on their own.
  beforeEach(() => {
    jest
      .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
      .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
        answer(16, 700, 140, 34)) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it("has no capsule in a room with only one other", async () => {
    await render(open(state([line()], { members: ["per_arjun", "har_scout"] })).element);
    expect(screen.queryByTestId("address-capsule")).toBeNull();
  });

  it("lists the people besides the agents where there are two others, and sends to a person alone (ADR 0204)", async () => {
    // Foodie, 19 October 2026: one agent and two people, and no way to say a message was for Arjun.
    const { store, element } = open(state([], { members: ["per_arjun", "per_dana", "har_scout"] }));
    await render(element);
    expect(screen.getByRole("button", { name: "To Scout" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("address-capsule"));
    expect(screen.getByRole("menuitem", { name: /^Scout,/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^Dana Ruiz,/ })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Everyone, scout answers" })).toBeTruthy();
    // Never the writer themself.
    expect(screen.queryByRole("menuitem", { name: /^Arjun/ })).toBeNull();
    await userEvent.press(screen.getByRole("menuitem", { name: /^Dana Ruiz,/ }));
    expect(screen.getByRole("button", { name: "To Dana Ruiz" })).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "How's it going?");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: {
        spaceId: "sp_1",
        text: "How's it going?",
        to: ["per_dana"],
        addressedTo: [],
        addressedPeople: ["per_dana"],
      },
    });
  });

  it("draws a route to a person over a message for them (ADR 0204)", async () => {
    const said = line({ authorId: "per_arjun", addressedTo: [], addressedPeople: ["per_dana"] });
    await render(open(state([said], { members: ["per_arjun", "per_dana", "har_scout"] })).element);
    expect(screen.getByRole("button", { name: "Went to Dana Ruiz" })).toBeTruthy();
  });

  it("says Everyone before your first message, and sends it to all", async () => {
    const { store, element } = open(pair([]));
    await render(element);
    expect(screen.getByRole("button", { name: "To Everyone" })).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "Hi both");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: {
        spaceId: "sp_1",
        text: "Hi both",
        to: "all",
        addressedTo: ["har_scout", "har_tree"],
      },
    });
  });

  it("marks the room's lead in its menu, as the room sheet does (ADR 0104)", async () => {
    await render(open(state([], { members: PAIR, lead: "har_tree" })).element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    const tree = screen.getByRole("menuitem", { name: "Tree, lead, @Tree" });
    expect(within(tree).getByText("Lead", { includeHiddenElements: true })).toBeTruthy();
    // Only the lead wears it.
    const scout = screen.getByRole("menuitem", { name: "Scout, @Scout" });
    expect(within(scout).queryByText("Lead", { includeHiddenElements: true })).toBeNull();
  });

  it("marks the harness a room was asked of as its lead before it has claimed (ADR 0149's addendum)", async () => {
    await render(open(state([], { members: PAIR, askedOf: "har_tree" })).element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    const tree = screen.getByRole("menuitem", { name: "Tree, lead, @Tree" });
    expect(within(tree).getByText("Lead", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Scout, @Scout" })).toBeTruthy();
  });

  it("calls each harness waiting in a room asked from the + by the first name held for its agent (ADR 0150)", async () => {
    const held = { har_scout: "Milo", har_tree: "Theo" };
    const room = roomSnapshot(state([], { members: PAIR, askedOf: "har_scout", held }), "sp_1");
    await render(open(room).element);
    // The middle names them, each with its harness under it.
    expect(screen.getByTestId("space-waiting")).toHaveTextContent(
      /Milo and Theo are here and wait for your first message\.$/,
    );
    // Its face wears the held name's initial, and its harness is under its name.
    expect(
      screen.getByTestId("space-waiting-har_scout", { includeHiddenElements: true }),
    ).toHaveTextContent("MMiloScout");
    // So does the list of who a message is for, the lead first.
    await userEvent.press(screen.getByTestId("address-capsule"));
    expect(screen.getByRole("menuitem", { name: "Milo, lead, @Milo, Scout" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Theo, @Theo, Tree" })).toBeTruthy();
  });

  it("says whose an agent is in the list, where it is somebody else's (ADR 0234)", async () => {
    const base = pair([]);
    const room = {
      ...base,
      directory: {
        ...base.directory,
        har_scout: { id: "har_scout", kind: "harness", displayName: "Scout", ownerId: "per_arjun" },
        har_tree: { id: "har_tree", kind: "harness", displayName: "Tree", ownerId: "per_dana" },
      },
    } as unknown as Snapshot;
    await render(open(room).element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    // Dana's, said after its @ and heard after it; the reader's own says nothing of whose.
    expect(screen.getByRole("menuitem", { name: "Tree, @Tree, Dana Ruiz's agent" })).toBeTruthy();
    expect(screen.getByText("Dana Ruiz's agent", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Scout, @Scout" })).toBeTruthy();
  });

  it("goes where your last message here went", async () => {
    const said = line({ authorId: "per_arjun", text: "@Tree hi", addressedTo: ["har_tree"] });
    await render(open(pair([said])).element);
    expect(screen.getByRole("button", { name: "To Tree" })).toBeTruthy();
  });

  it("picks from its menu, and sends the pick as to", async () => {
    const { store, element } = open(pair([]));
    await render(element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    expect(screen.getByTestId("address-menu")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Everyone, both answer" })).toBeTruthy();
    // Each says the @ that reaches it (ADR 0091).
    expect(screen.getByText("@Tree", { includeHiddenElements: true })).toBeTruthy();
    // A tap on an agent's name picks it alone, and closes the list (ADR 0114).
    await userEvent.press(screen.getByRole("menuitem", { name: "Scout, @Scout" }));
    await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
    expect(screen.getByRole("button", { name: "To Scout" })).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "Is it booked?");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: {
        spaceId: "sp_1",
        text: "Is it booked?",
        to: ["har_scout"],
        addressedTo: ["har_scout"],
      },
    });
  });

  it("offers the first message to Everyone, the room's middle asking what it is for (ADR 0149)", async () => {
    await render(open(pair([])).element);
    expect(screen.getByTestId("composer").props["placeholder"]).toBe("Message Everyone");
  });

  it("opens the field into its list, and closes it on a tap on the room, picking nothing", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    try {
      // Somebody has said something: a room nobody has asks what it is for (ADR 0148).
      await render(open(pair([line()])).element);
      // The field says who, and the list is the field's: no capsule of its own over it (Arjun's A).
      expect(screen.getByTestId("composer").props["placeholder"]).toBe("Message Everyone");
      const room = screen.getByTestId("room-tap");
      expect(room.props["onStartShouldSetResponder"]()).toBe(false);
      await userEvent.press(screen.getByTestId("address-capsule"));
      expect(screen.getByTestId("address-menu")).toBeTruthy();
      // Open, the room asks for a tap even with no keys up, before anything in it is offered the
      // tap — a bubble is pressable and would take it — and the tap closes the list only.
      expect(room.props["onStartShouldSetResponderCapture"]()).toBe(true);
      expect(room.props["onStartShouldSetResponder"]()).toBe(true);
      fireEvent(room, "responderRelease");
      await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
      expect(away).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "To Everyone" })).toBeTruthy();
      // Closed, it takes nothing first again: a bubble's own press and the list's drag are theirs.
      expect(room.props["onStartShouldSetResponderCapture"]()).toBe(false);
    } finally {
      away.mockRestore();
    }
  });

  // With the keys up the list stands nearly the room's height, and beside it is the foot's, not
  // the room's (Arjun's phone, 10 October 2026): a tap there closes the list as one on the room
  // does, and the keys stay.
  it("closes its list on a tap beside it, which is the foot's and not the room's", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    try {
      await render(open(pair([])).element);
      const foot = screen.getByTestId("room-foot");
      expect(foot.props["onStartShouldSetResponder"]()).toBe(false);
      await userEvent.press(screen.getByTestId("address-capsule"));
      expect(screen.getByTestId("address-menu")).toBeTruthy();
      expect(foot.props["onStartShouldSetResponder"]()).toBe(true);
      fireEvent(foot, "responderRelease");
      await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
      expect(away).not.toHaveBeenCalled();
      // Closed, the foot takes nothing: the field and the + are the only taps in it.
      expect(foot.props["onStartShouldSetResponder"]()).toBe(false);
    } finally {
      away.mockRestore();
    }
  });

  it("closes its list when a key is typed: the field is for writing again", async () => {
    await render(open(pair([])).element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    expect(screen.getByTestId("address-menu")).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "H");
    await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
  });

  it("closes its list when the room turns light or dark: the glass redraws only as it resizes", async () => {
    await render(open(pair([])).element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    expect(screen.getByTestId("address-menu")).toBeTruthy();
    try {
      await act(async () => chooseAppearance("dark"));
      await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
      // Opened again in the new appearance, it stays open.
      await userEvent.press(screen.getByTestId("address-capsule"));
      expect(screen.getByTestId("address-menu")).toBeTruthy();
    } finally {
      await act(async () => chooseAppearance("system"));
    }
  });

  it("runs the words the field's width once they would wrap beside the faces", async () => {
    await render(open(pair([])).element);
    const words = () => StyleSheet.flatten(screen.getByTestId("composer-words").props["style"]);
    // The twin that asks is unseen, and laid out by nobody under Node: its layout is told it.
    const laid = async (testID: string, width: number, height: number) => {
      await act(async () => {
        screen
          .getByTestId(testID, { includeHiddenElements: true })
          .props["onLayout"]({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
      });
    };
    await laid("composer-token", 90, 32);
    // One line: beside the faces, after them.
    await laid("composer-narrow-twin", 200, 23);
    expect(words().marginBottom ?? 0).toBe(0);
    expect(words().marginLeft).toBeGreaterThan(90);
    // Wrapping there: over them, the faces and Send on a line of their own under the words.
    await laid("composer-narrow-twin", 200, 46);
    expect(words().marginBottom).toBeGreaterThan(0);
    expect(words().marginLeft).toBeLessThan(90);
    // And back.
    await laid("composer-narrow-twin", 200, 23);
    expect(words().marginBottom ?? 0).toBe(0);
  });

  it("says in the field who a pick is for", async () => {
    await render(open(pair([])).element);
    await userEvent.press(screen.getByTestId("address-capsule"));
    await userEvent.press(screen.getByRole("menuitem", { name: "Tree, @Tree" }));
    expect(screen.getByTestId("composer").props["placeholder"]).toBe("Message Tree");
  });

  it("follows an @ in the draft, marked by @, and leaves to to the @", async () => {
    const { store, element } = open(pair([]));
    await render(element);
    await userEvent.type(screen.getByTestId("composer"), "@Tree which one?");
    expect(screen.getByRole("button", { name: "To Tree, by @" })).toBeTruthy();
    expect(screen.getByTestId("address-by-at")).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: { spaceId: "sp_1", text: "@Tree which one?", addressedTo: ["har_tree"] },
    });
  });

  it("says the person an @ names, and no agent (ADR 0204)", async () => {
    await render(open(state([], { members: [...PAIR, "per_dana"] })).element);
    await userEvent.type(screen.getByTestId("composer"), "@Dana look");
    expect(screen.getByRole("button", { name: "To Dana Ruiz, by @" })).toBeTruthy();
  });

  it("draws a route over a message only where the address changed (A2)", async () => {
    const lines = [
      line({ id: "a", authorId: "per_arjun", text: "@Tree hi", addressedTo: ["har_tree"] }),
      line({ id: "b", seq: 2, authorId: "per_arjun", text: "and?", addressedTo: ["har_tree"] }),
      line({ id: "c", seq: 3, authorId: "per_arjun", text: "both", addressedTo: PAIR.slice(1) }),
    ];
    await render(open(pair(lines)).element);
    expect(screen.getByTestId("route-a")).toBeTruthy();
    expect(screen.queryByTestId("route-b")).toBeNull();
    expect(screen.getByTestId("route-c")).toBeTruthy();
    // Both by name is both by name: Everyone is a message for everyone (ADR 0113).
    expect(screen.getByRole("button", { name: "Went to Scout and Tree" })).toBeTruthy();
  });

  it("starts another person's route at the arrow: their face is beside the bubble already", async () => {
    const lines = [
      line({ id: "mine", authorId: "per_arjun", text: "@Tree hi", addressedTo: ["har_tree"] }),
      line({
        id: "hers",
        seq: 2,
        authorId: "per_dana",
        text: "@Scout hi",
        addressedTo: ["har_scout"],
      }),
    ];
    await render(open(state(lines, { members: [...PAIR, "per_dana"] })).element);
    const faces = (id: string) =>
      within(screen.getByTestId(id)).queryAllByTestId("trail-face", {
        includeHiddenElements: true,
      });
    // Yours: your face, the arrow, Tree. Dana's: the arrow and Scout, her face beside the bubble.
    expect(faces("route-mine")).toHaveLength(2);
    expect(faces("route-hers")).toHaveLength(1);
  });

  it("draws no route in a room of two", async () => {
    const said = line({ authorId: "per_arjun", addressedTo: ["har_scout"] });
    await render(open(state([said], { members: ["per_arjun", "har_scout"] })).element);
    expect(screen.queryByTestId(`route-${said.id}`)).toBeNull();
  });

  it("folds harnesses talking to each other, and opens on a tap", async () => {
    const lines = [
      line({ id: "q", authorId: "per_arjun", text: "Sort it out", addressedTo: PAIR.slice(1) }),
      line({
        id: "h1",
        seq: 2,
        authorId: "har_scout",
        authorKind: "harness",
        text: "@Tree is it booked?",
        addressedTo: ["har_tree"],
      }),
      line({
        id: "h2",
        seq: 3,
        authorId: "har_tree",
        authorKind: "harness",
        text: "Yes, for the 19th.",
        addressedTo: ["har_scout"],
      }),
    ];
    await render(open(pair(lines)).element);
    const head = screen.getByRole("button", { name: "Scout and Tree, 2 messages" });
    expect(screen.getByText("Yes, for the 19th.", { exact: false })).toBeTruthy();
    expect(screen.queryByTestId("bubble-h1")).toBeNull();
    await userEvent.press(head);
    expect(screen.getByTestId("bubble-h1")).toBeTruthy();
    expect(screen.getByTestId("bubble-h2")).toBeTruthy();
  });

  it("flies the capsule's arrow and face up to be the route, held until they land", async () => {
    const measured = jest
      .spyOn(TextInput.prototype, "measureInWindow")
      .mockImplementation((answer) => answer(92, 500, 250, 23));
    const before = [
      line({ id: "a", authorId: "per_arjun", text: "@Scout hi", addressedTo: ["har_scout"] }),
    ];
    let now = pair(before);
    const base = fakeStore(now);
    const listeners = new Set<(snapshot: Snapshot) => void>();
    const store = {
      ...base,
      getSnapshot: () => now,
      subscribe: (listener: (snapshot: Snapshot) => void) => {
        listeners.add(listener);
        listener(now);
        return () => {
          listeners.delete(listener);
        };
      },
      send: (input: SendMessageInput) => {
        base.send(input);
        const sent = line({
          id: "pending:msg-k1",
          pending: true,
          key: "msg-k1",
          seq: 2,
          text: input.text,
          authorId: "per_arjun",
          addressedTo: input.addressedTo,
        });
        queueMicrotask(() => {
          now = pair([...before, sent]);
          for (const listener of listeners) listener(now);
        });
      },
    };
    const element = (snapshot: Snapshot) =>
      onAPhone(<SpaceView store={store} snapshot={snapshot} spaceId="sp_1" selfId="per_arjun" />);
    try {
      const view = await render(element(now));
      await userEvent.press(screen.getByTestId("address-capsule"));
      await userEvent.press(screen.getByRole("menuitem", { name: "Tree, @Tree" }));
      await userEvent.type(screen.getByTestId("composer"), "Your turn");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(screen.getByTestId("send-flight-route")).toHaveTextContent("har_tree");

      await view.rerender(element(now));
      const onward = within(screen.getByTestId("route-pending:msg-k1")).getByTestId("route-onward");
      expect(onward).toHaveStyle({ opacity: 0 });
      expect(within(onward).getByTestId("bubble-watch")).toBeTruthy();

      await act(async () => {
        const { flights } = jest.requireMock<{ flights: { land: () => void } }>("./SendFlight");
        flights.land();
      });
      const landed = within(screen.getByTestId("route-pending:msg-k1")).getByTestId("route-onward");
      expect(landed).not.toHaveStyle({ opacity: 0 });
    } finally {
      measured.mockRestore();
    }
  });

  it("flies no route when the message goes where the last one did", async () => {
    const measured = jest
      .spyOn(TextInput.prototype, "measureInWindow")
      .mockImplementation((answer) => answer(92, 500, 250, 23));
    try {
      const said = line({ authorId: "per_arjun", text: "@Scout hi", addressedTo: ["har_scout"] });
      await render(open(pair([said])).element);
      await userEvent.type(screen.getByTestId("composer"), "and?");
      await userEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(screen.getByTestId("send-flight")).toBeTruthy();
      expect(screen.queryByTestId("send-flight-route")).toBeNull();
    } finally {
      measured.mockRestore();
    }
  });

  /** Each its own words, so none repeats another. */
  const WORDS = [
    "",
    "which of the two warehouses is it",
    "the finance one up in the north",
    "and when does the shipment land there",
    "on Tuesday at the north dock gate",
    "who signs for it at the dock",
    "the night manager signs for every crate",
  ];
  const between = (id: string, seq: number, by: string, to: string, held = false) =>
    line({
      id,
      seq,
      authorId: by,
      authorKind: "harness",
      text: WORDS[Number(id)] ?? `message ${id}`,
      addressedTo: held ? [] : [to],
      ...(held ? { held: true as const } : {}),
    });

  it("says in the margin under the fold that Chips paused them, and offers to let them carry on above the field (ADR 0097)", async () => {
    const lines = [
      line({ id: "q", authorId: "per_arjun", text: "Sort it out", addressedTo: PAIR.slice(1) }),
      between("1", 2, "har_scout", "har_tree"),
      between("2", 3, "har_tree", "har_scout"),
      between("5", 6, "har_scout", "har_tree", true),
    ];
    const room = open(pair(lines));
    await render(room.element);
    expect(screen.getByRole("button", { name: "Scout and Tree, 3 messages" })).toBeTruthy();
    expect(screen.getByTestId("guard-line")).toHaveTextContent(
      "Chips paused the agents. Scout and Tree have sent each other 3 messages since you last acted.",
    );
    expect(screen.getByTestId("paused-banner")).toHaveTextContent(
      "Chips paused the agents. Scout and Tree sent each other 3 messages since you last acted.",
      { exact: false },
    );
    await userEvent.press(screen.getByTestId("carry-on"));
    expect(room.store.calls.filter((each) => each.name === "setExchange")).toEqual([
      { name: "setExchange", args: { spaceId: "sp_1", state: "going" } },
    ]);
  });

  it("says the job's spend in the margin at 80%, and at the ceiling the banner says it with Let them carry on (ADR 0118)", async () => {
    const lines = [
      line({
        id: "q",
        seq: 1,
        authorId: "per_arjun",
        text: "Read the trials",
        addressedTo: ["har_scout"],
      }),
      line({
        id: "w",
        seq: 5,
        kind: "status",
        authorId: "system",
        authorKind: "system",
        text: "This job has spent $2.41 of the $3.00 this space allows.",
      }),
    ];
    const snapshot = pair(lines);
    const [space] = snapshot.model.spaces;
    const paused = {
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: [
          { ...space, actedSeq: 1, pausedSeq: 9, pausedSpend: { spentUsd: 3.02, ceilingUsd: 3 } },
        ],
      },
    } as unknown as Snapshot;
    const room = open(paused);
    await render(room.element);
    expect(
      screen.getByText("This job has spent $2.41 of the $3.00 this space allows."),
    ).toBeTruthy();
    expect(screen.getByTestId("paused-banner")).toHaveTextContent(
      "This job has spent $3.02 of the $3.00 this space allows. The agents start nothing new until somebody lets them carry on.",
      { exact: false },
    );
    await userEvent.press(screen.getByTestId("carry-on"));
    expect(room.store.calls.filter((each) => each.name === "setExchange")).toEqual([
      { name: "setExchange", args: { spaceId: "sp_1", state: "going" } },
    ]);
  });

  /** Scout and Tree taking turns, from the first of `WORDS` to the `n`th. */
  const turns = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      between(
        String(i + 1),
        i + 2,
        i % 2 === 0 ? "har_scout" : "har_tree",
        i % 2 === 0 ? "har_tree" : "har_scout",
      ),
    );
  const sortItOut = line({
    id: "q",
    authorId: "per_arjun",
    text: "Sort it out",
    addressedTo: PAIR.slice(1),
  });

  it("draws nothing under the fold while two agents take turns, each with its own words", async () => {
    // Three rounds of the two of them: back and forth, not round (ADR 0097's addendum).
    await render(open(pair([sortItOut, ...turns(6)])).element);
    expect(screen.queryByTestId("guard-line")).toBeNull();
  });

  it("warns under the fold when two agents go round, with the two taps, and no banner", async () => {
    // Tree's third answer is its second again.
    const again = line({
      id: "6",
      seq: 7,
      authorId: "har_tree",
      authorKind: "harness",
      text: WORDS[4] ?? "",
      addressedTo: ["har_scout"],
    });
    const room = open(pair([sortItOut, ...turns(5), again]));
    await render(room.element);
    expect(screen.getByTestId("guard-line")).toHaveTextContent(
      "Scout and Tree have sent each other 6 messages since you last acted, and the last one repeated an earlier one.",
    );
    expect(screen.queryByTestId("paused-banner")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Pause them" }));
    expect(room.store.calls.filter((each) => each.name === "setExchange")).toEqual([
      { name: "setExchange", args: { spaceId: "sp_1", state: "paused" } },
    ]);
  });
});

describe("a slide up from the faces (ADR 0229)", () => {
  const PAIR = ["per_arjun", "har_scout", "har_tree"];
  const HIDDEN = { includeHiddenElements: true } as const;
  /** What the field told the column's pan, as `jest.setup.js` keeps it. */
  interface Told {
    readonly faces: number;
    readonly enabled: boolean;
    readonly onLit: (index: number) => void;
    readonly onPick: (index: number) => void;
  }
  const told = () => (globalThis as unknown as { faceSlide: Told }).faceSlide;
  const tick = Haptics.selectionAsync as jest.MockedFunction<typeof Haptics.selectionAsync>;

  beforeEach(() => {
    tick.mockClear();
    jest
      .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
      .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
        answer(16, 700, 140, 34)) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it("holds each agent over Everyone, and slides only while the list is shut", async () => {
    await render(open(state([], { members: PAIR })).element);
    expect(told().faces).toBe(2);
    expect(told().enabled).toBe(true);
    await userEvent.press(screen.getByTestId("address-capsule"));
    expect(told().enabled).toBe(false);
  });

  it("says who the words would go to under the finger, ticking, and picks there as it lets go", async () => {
    const { store, element } = open(state([], { members: PAIR }));
    await render(element);
    await act(() => told().onLit(1));
    expect(screen.getByRole("button", { name: "To Tree" })).toBeTruthy();
    expect(screen.getByTestId("composer-hint", HIDDEN)).toHaveTextContent("Message Tree");
    expect(tick).toHaveBeenCalledTimes(1);
    await act(() => {
      told().onPick(1);
      told().onLit(-1);
    });
    // Letting go is not a face of its own: no tick for it.
    expect(tick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "To Tree" })).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "Is it booked?");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: { spaceId: "sp_1", text: "Is it booked?", to: ["har_tree"], addressedTo: ["har_tree"] },
    });
  });

  it("leaves who it goes to as it was when the finger lets go off the column", async () => {
    await render(open(state([], { members: PAIR })).element);
    await act(() => told().onLit(0));
    expect(screen.getByRole("button", { name: "To Scout" })).toBeTruthy();
    await act(() => told().onLit(-1));
    expect(screen.getByRole("button", { name: "To Everyone" })).toBeTruthy();
    expect(screen.getByTestId("composer-hint", HIDDEN)).toHaveTextContent("Message Everyone");
  });

  it("picks Everyone at the column's foot", async () => {
    const said = line({ authorId: "per_arjun", text: "@Tree hi", addressedTo: ["har_tree"] });
    await render(open(state([said], { members: PAIR })).element);
    expect(screen.getByRole("button", { name: "To Tree" })).toBeTruthy();
    await act(() => {
      told().onLit(2);
      told().onPick(2);
      told().onLit(-1);
    });
    expect(screen.getByRole("button", { name: "To Everyone" })).toBeTruthy();
  });
});

describe("a room of many agents (ADR 0113)", () => {
  // The faces are seen, never read out: a query finds them only when asked to.
  const HIDDEN = { includeHiddenElements: true } as const;
  const ROOM = ["per_arjun", "har_scout", "har_tree", "har_moss", "har_fern", "har_reed"];
  const crowd = (
    lines: readonly LineModel[] = [],
    over: { readonly lead?: string; readonly members?: string[] } = {},
  ): Snapshot => {
    const snapshot = state(lines, {
      members: over.members ?? ROOM,
      ...(over.lead === undefined ? {} : { lead: over.lead }),
    });
    return {
      ...snapshot,
      directory: {
        ...snapshot.directory,
        har_moss: { id: "har_moss", kind: "harness", displayName: "Moss" },
        har_fern: { id: "har_fern", kind: "harness", displayName: "Fern" },
        har_reed: { id: "har_reed", kind: "harness", displayName: "Reed" },
      },
    } as Snapshot;
  };
  const view = (snapshot: Snapshot, store = fakeStore(snapshot)) =>
    onAPhone(<SpaceView store={store} snapshot={snapshot} spaceId="sp_1" selfId="per_arjun" />);

  // Where the field's words are in the window, which the list's height is measured from.
  beforeEach(() => {
    jest
      .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
      .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
        answer(16, 700, 140, 34)) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it("draws five as one mark and how many, and says Everyone on one line", async () => {
    // Somebody has said something: a room nobody has asks what it is for (ADR 0148).
    await render(view(crowd([line()])));
    const token = screen.getByRole("button", { name: "To Everyone, 5 agents" });
    expect(within(token).getByTestId("faces-mark", HIDDEN)).toBeTruthy();
    expect(within(token).getByTestId("faces-count", HIDDEN)).toHaveTextContent("5");
    expect(within(token).queryAllByTestId("trail-face", HIDDEN)).toHaveLength(0);
    const words = screen.getByTestId("composer-hint", HIDDEN);
    expect(words).toHaveTextContent("Message Everyone");
    expect(words.props["numberOfLines"]).toBe(1);
    // The input keeps its words, unseen, for a screen reader to say.
    expect(screen.getByTestId("composer").props["placeholder"]).toBe("Message Everyone");
    expect(screen.getByTestId("composer").props["placeholderTextColor"]).toBe("transparent");
  });

  it("draws three as their faces, as before", async () => {
    await render(view(crowd([], { members: ROOM.slice(0, 4) })));
    const token = screen.getByRole("button", { name: "To Everyone" });
    expect(within(token).getAllByTestId("trail-face", HIDDEN)).toHaveLength(3);
    expect(within(token).queryByTestId("faces-mark", HIDDEN)).toBeNull();
  });

  it("lists the lead first, scrolls the rest under half the window, and holds Everyone at the foot", async () => {
    await render(view(crowd([], { lead: "har_fern" })));
    await userEvent.press(screen.getByTestId("address-capsule"));
    const scroll = screen.getByTestId("address-scroll");
    const names = within(scroll)
      .getAllByRole("menuitem")
      .map((item) => item.props["accessibilityLabel"]);
    expect(names).toEqual([
      "Fern, lead, @Fern",
      "Scout, @Scout",
      "Tree, @Tree",
      "Moss, @Moss",
      "Reed, @Reed",
    ]);
    // Everyone is under the rows that scroll, not one of them.
    const everyone = screen.getByRole("menuitem", { name: "Everyone, all answer" });
    expect(within(scroll).queryByRole("menuitem", { name: "Everyone, all answer" })).toBeNull();
    expect(within(everyone).getByTestId("faces-count", HIDDEN)).toHaveTextContent("5");
    // Half Jest's window less the words' row, less Everyone's row and the list's padding.
    const { height } = Dimensions.get("window");
    expect(scroll).toHaveStyle({ maxHeight: height / 2 - 34 - 52 - 12 });
  });

  it("stops the list under the room's bar when there is less than half the window", () => {
    // The keys up on an iPhone 17 Pro: the words' row at 480, the bar's foot at 108.
    expect(listRoom(874, { top: 480, height: 50 }, 108)).toBe(480 - 108 - SPACE.sm);
    // The keys down: half the window, less the row.
    expect(listRoom(874, { top: 794, height: 50 }, 108)).toBe(874 / 2 - 50);
  });

  it("keeps Everyone picked as everyone when an agent joins before the send", async () => {
    // The last message here went to Scout alone, so the field says Scout until Everyone is picked.
    const said = line({ authorId: "per_arjun", text: "@Scout hi", addressedTo: ["har_scout"] });
    const before = crowd([said], { members: ROOM.slice(0, 5) });
    const store = fakeStore(before);
    await render(view(before, store));
    await userEvent.press(screen.getByRole("button", { name: "To Scout" }));
    await userEvent.press(screen.getByRole("menuitem", { name: "Everyone, all answer" }));
    expect(screen.getByRole("button", { name: "To Everyone, 4 agents" })).toBeTruthy();
    // Reed joins before the send, and is in it.
    const after = crowd([said]);
    const next = fakeStore(after);
    await screen.rerender(view(after, next));
    expect(screen.getByRole("button", { name: "To Everyone, 5 agents" })).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "And Reed");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(next.calls).toContainEqual({
      name: "send",
      args: {
        spaceId: "sp_1",
        text: "And Reed",
        to: "all",
        addressedTo: ROOM.slice(1),
      },
    });
  });

  it("adds agents by a tap on their rows, and the list stays open (ADR 0114)", async () => {
    const store = fakeStore(crowd());
    await render(view(crowd(), store));
    await userEvent.press(screen.getByTestId("address-capsule"));
    // Under Everyone, the first circle starts afresh.
    await userEvent.press(screen.getByTestId("address-add-Scout-target"));
    expect(screen.getByTestId("address-menu")).toBeTruthy();
    expect(screen.getByRole("button", { name: "To Scout" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("address-add-Tree-target"));
    await userEvent.press(screen.getByTestId("address-add-Moss-target"));
    await userEvent.press(screen.getByTestId("address-add-Fern-target"));
    // Four are the mark and how many, and the words say how many.
    expect(screen.getByRole("button", { name: "To 4 agents" })).toBeTruthy();
    expect(screen.getByTestId("composer-hint", HIDDEN)).toHaveTextContent("Message 4 agents");
    expect(
      screen.getByRole("menuitem", { name: "Moss, @Moss" }).props["accessibilityState"],
    ).toEqual({ selected: true });
    expect(
      screen.getByRole("menuitem", { name: "Reed, @Reed" }).props["accessibilityState"],
    ).toEqual({ selected: false });
    // A tap on the faces closes it; the send goes to the four.
    await userEvent.press(screen.getByTestId("address-capsule"));
    await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
    await userEvent.type(screen.getByTestId("composer"), "Check it, you four");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: {
        spaceId: "sp_1",
        text: "Check it, you four",
        to: ["har_scout", "har_tree", "har_moss", "har_fern"],
        addressedTo: ["har_scout", "har_tree", "har_moss", "har_fern"],
      },
    });
  });

  it("takes an agent out by a second tap, and none goes back to where the last message went", async () => {
    await render(view(crowd()));
    await userEvent.press(screen.getByTestId("address-capsule"));
    await userEvent.press(screen.getByTestId("address-add-Scout-target"));
    await userEvent.press(screen.getByTestId("address-add-Tree-target"));
    expect(screen.getByRole("button", { name: "To Scout and Tree" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("address-add-Tree-target"));
    expect(screen.getByRole("button", { name: "To Scout" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("address-add-Scout-target"));
    expect(screen.getByRole("button", { name: "To Everyone, 5 agents" })).toBeTruthy();
    // Every one, by their rows, says Everyone, but stays a list: each row checked, and a tap on
    // one takes it out rather than starting afresh.
    for (const name of ["Scout", "Tree", "Moss", "Fern", "Reed"]) {
      await userEvent.press(screen.getByTestId(`address-add-${name}-target`));
    }
    expect(screen.getByRole("button", { name: "To Everyone, 5 agents" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^Reed,/ }).props["accessibilityState"]).toEqual({
      selected: true,
    });
    expect(
      screen.getByRole("menuitem", { name: "Everyone, all answer" }).props["accessibilityState"],
    ).toEqual({ selected: false });
    await userEvent.press(screen.getByTestId("address-add-Reed-target"));
    expect(screen.getByRole("button", { name: "To 4 agents" })).toBeTruthy();
  });

  it("picks Everyone in one tap, and closes, as before", async () => {
    await render(view(crowd()));
    await userEvent.press(screen.getByTestId("address-capsule"));
    await userEvent.press(screen.getByTestId("address-add-Scout-target"));
    await userEvent.press(screen.getByRole("menuitem", { name: "Everyone, all answer" }));
    await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
    expect(screen.getByRole("button", { name: "To Everyone, 5 agents" })).toBeTruthy();
  });

  it("picks an agent alone by its name, and closes; its circle has a thumb's target", async () => {
    await render(view(crowd()));
    await userEvent.press(screen.getByTestId("address-capsule"));
    await userEvent.press(screen.getByTestId("address-add-Scout-target"));
    await userEvent.press(screen.getByRole("menuitem", { name: "Moss, @Moss" }));
    await waitFor(() => expect(screen.queryByTestId("address-menu")).toBeNull());
    expect(screen.getByRole("button", { name: "To Moss" })).toBeTruthy();
    // The circle's target is a thumb's square, with room round it.
    await userEvent.press(screen.getByTestId("address-capsule"));
    const target = screen.getByTestId("address-add-Moss-target");
    expect(target).toHaveStyle({ width: 44, height: 44 });
    expect(target.props["hitSlop"]).toEqual({ top: 6, bottom: 6, left: 10, right: 6 });
  });

  it("offers the circle to a screen reader as the row's action", async () => {
    await render(view(crowd()));
    await userEvent.press(screen.getByTestId("address-capsule"));
    const tree = screen.getByRole("menuitem", { name: "Tree, @Tree" });
    expect(tree.props["accessibilityActions"]).toEqual([
      { name: "add", label: "Add to who it goes to" },
    ]);
    await act(async () => {
      fireEvent(tree, "accessibilityAction", { nativeEvent: { actionName: "add" } });
    });
    expect(screen.getByRole("button", { name: "To Tree" })).toBeTruthy();
    expect(screen.getByTestId("address-menu")).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Tree, @Tree" }).props["accessibilityActions"],
    ).toEqual([{ name: "add", label: "Take out of who it goes to" }]);
  });

  it("keeps the pick when the room is left and opened again (ADR 0114)", async () => {
    await render(view(crowd()));
    await userEvent.press(screen.getByTestId("address-capsule"));
    await userEvent.press(screen.getByTestId("address-add-Scout-target"));
    await userEvent.press(screen.getByTestId("address-add-Tree-target"));
    await screen.unmount();
    await render(view(crowd()));
    expect(screen.getByRole("button", { name: "To Scout and Tree" })).toBeTruthy();
  });

  it("opens who a message went to from its route", async () => {
    const said = line({
      id: "a",
      authorId: "per_arjun",
      // The sheet quotes its words, not their marks.
      text: "**Hello** all",
      addressedTo: ROOM.slice(1),
      addressedToAll: true,
    });
    await render(view(crowd([said], { lead: "har_tree" })));
    const route = screen.getByRole("button", { name: "Went to Everyone, 5 agents" });
    expect(within(route).getByTestId("faces-count", HIDDEN)).toHaveTextContent("5");
    await userEvent.press(route);
    const sheet = await screen.findByTestId("route-sheet");
    expect(within(sheet).getByText("To Everyone")).toBeTruthy();
    expect(within(sheet).getByText(/^5 agents · “Hello all”/)).toBeTruthy();
    expect(within(sheet).getAllByTestId(/^route-sheet-agent-/)).toHaveLength(5);
    expect(within(sheet).getByLabelText("Tree, lead")).toBeTruthy();
    await userEvent.press(within(sheet).getByTestId("route-sheet-close"));
    await waitFor(() => expect(screen.queryByTestId("route-sheet")).toBeNull());
  });
});

describe("when an agent can't answer (ADR 0083)", () => {
  const PAIR = ["per_arjun", "har_scout", "har_tree"];
  const HARNESSES = ["har_scout", "har_tree"];

  /** The room, with each harness's state as the server says it. */
  function states(snapshot: Snapshot, at: Readonly<Record<string, AgentState>>): Snapshot {
    const directory = { ...snapshot.directory };
    for (const [id, state] of Object.entries(at)) {
      const found = directory[id];
      if (found !== undefined) directory[id] = { ...found, state };
    }
    return { ...snapshot, directory };
  }
  const fine: AgentState = { connected: true, since: "2026-09-07T09:00:00.000Z" };
  const trouble: AgentState = {
    connected: true,
    since: "2026-09-07T09:00:00.000Z",
    trouble: { reason: "Can't reach its gateway", since: "2026-09-07T09:12:00.000Z" },
  };

  it("says at once under your message that an agent in trouble can't answer, and why, and marks its face", async () => {
    const asked = line({
      id: "ln_ask",
      seq: 5,
      authorId: "per_arjun",
      text: "The first ten digits of pi?",
      addressedTo: HARNESSES,
      ts: new Date().toISOString(),
    });
    const scout = line({
      id: "ln_scout",
      seq: 6,
      authorId: "har_scout",
      authorKind: "harness",
      text: "3.141592653",
    });
    const room = states(state([asked, scout], { members: PAIR }), {
      har_scout: fine,
      har_tree: trouble,
    });
    await render(open(room).element);

    const wait = await screen.findByTestId("wait-har_tree");
    expect(wait).toHaveTextContent(/Tree can't answer yet/);
    expect(wait).toHaveTextContent(/Can't reach its gateway · since/);
    // Scout answered, so the message waits on nobody else.
    expect(screen.queryByTestId("wait-har_scout")).toBeNull();
    // Tree's face wears the mark: on the route over the message, and in the field.
    expect(
      screen.getAllByTestId("cant-answer-mark", { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  it("says an agent that seems fine hasn't picked a message up once it has waited, and nothing once it has", async () => {
    const asked = line({
      id: "ln_ask",
      seq: 5,
      authorId: "per_arjun",
      text: "Pi?",
      addressedTo: ["har_tree"],
    });
    const room = state([asked], { members: PAIR });
    const { rerender } = await render(open(states(room, { har_tree: fine })).element);
    const wait = await screen.findByTestId("wait-har_tree");
    expect(wait).toHaveTextContent(/Tree hasn't picked this up · \d+ d/);
    expect(screen.queryByTestId("cant-answer-mark", { includeHiddenElements: true })).toBeNull();

    // Anything from Tree after it, and the line goes.
    const answered = line({
      id: "ln_tree",
      seq: 6,
      authorId: "har_tree",
      authorKind: "harness",
      text: "3.14…",
    });
    await rerender(
      open(states(state([asked, answered], { members: PAIR }), { har_tree: fine })).element,
    );
    await waitFor(() => expect(screen.queryByTestId("wait-har_tree")).toBeNull());
  });

  it("draws the line under somebody else's message past their face, not over it (19 October 2026)", async () => {
    // Foodie: under Natalie's words the agent's face was drawn over hers, which had dropped to the
    // line beside it.
    const asked = line({
      id: "ln_ask",
      seq: 5,
      authorId: "per_dana",
      text: "Coffee this afternoon?",
      addressedTo: ["har_tree"],
    });
    const room = state([asked], { members: ["per_arjun", "per_dana", "har_tree"] });
    await render(open(states(room, { har_tree: fine })).element);
    const waits = await screen.findByTestId("waits-ln_ask");
    // The lines under a message are the line's own, below the row that holds the face and bubble,
    // and stand past the face's column.
    const under = waits.parent;
    expect(under?.parent).toBe(screen.getByTestId("line-ln_ask"));
    expect(under).toHaveStyle({ paddingLeft: 36 });
    // The face first and the words after, wrapping in the line rather than pushing the face out.
    expect(screen.getByTestId("wait-har_tree")).toHaveStyle({ alignSelf: "flex-start" });
  });

  it("says nothing under a message that is only just sent to an agent that seems fine", async () => {
    const asked = line({
      id: "ln_ask",
      seq: 5,
      authorId: "per_arjun",
      addressedTo: ["har_tree"],
      ts: new Date().toISOString(),
    });
    await render(open(states(state([asked], { members: PAIR }), { har_tree: fine })).element);
    expect(screen.queryByTestId("wait-har_tree")).toBeNull();
  });
});

describe("a reply in the room (ADR 0219)", () => {
  const earlier = "2026-09-03T21:14:00.000Z";
  const held = (over: Partial<LineModel> = {}) =>
    line({
      id: "ln_1",
      seq: 1,
      authorId: "har_scout",
      authorKind: "harness",
      text: "Held for **6** at 7:30.",
      ts: earlier,
      repliedBy: ["ln_3"],
      ...over,
    });
  const between = line({ id: "ln_2", seq: 2, text: "Order the chocolate one" });
  const reply = line({
    id: "ln_3",
    seq: 3,
    authorId: "per_arjun",
    text: "Make it 8 people",
    replyTo: "ln_1",
  });
  const room = (first: LineModel | "none" = held()) =>
    open(state(first === "none" ? [between, reply] : [first, between, reply])).element;

  it("quotes the message a reply answers above its words, and says under it that it has one", async () => {
    await render(room());
    const card = screen.getByTestId("reply-card-ln_1");
    expect(card).toHaveTextContent(/^Scout · 3 Sep/);
    expect(card).toHaveTextContent(/Held for 6 at 7:30\.$/);
    expect(card.props["accessibilityRole"]).toBe("button");
    expect(within(screen.getByTestId("bubble-ln_3")).getByTestId("reply-card-ln_1")).toBeTruthy();
    expect(screen.getByTestId("replies-ln_3")).toHaveTextContent("1 reply");
    expect(screen.queryByTestId("replies-ln_2")).toBeNull();
  });

  it("says a quoted message deleted, and goes nowhere from it", async () => {
    await render(room(held({ deleted: true, text: "" })));
    expect(screen.getByTestId("reply-card-ln_1")).toHaveTextContent(/Deleted message$/);
    expect(screen.getByTestId("reply-card-ln_1").props["accessibilityRole"]).toBe("text");
  });

  it("says a quoted message this phone doesn't hold, by no name", async () => {
    await render(room("none"));
    expect(screen.getByTestId("reply-card-ln_1")).toHaveTextContent(/^Earlier message$/);
  });

  it("goes to the message, lights it, and the pill comes back to the reply", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(room());
      await userEvent.press(screen.getByTestId("reply-card-ln_1"));
      expect(scrolled).toHaveBeenLastCalledWith(expect.objectContaining({ animated: true }));
      await waitFor(() => expect(screen.getByTestId("flash-ln_1")).toBeTruthy());
      expect(screen.getByTestId("back-pill")).toHaveTextContent("Back to your reply");
      await userEvent.press(screen.getByTestId("back-pill-press"));
      await waitFor(() => expect(screen.getByTestId("flash-ln_3")).toBeTruthy());
      expect(screen.queryByTestId("back-pill")).toBeNull();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("lets the pill go once the reply is in view again, after it left", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(room());
      await userEvent.press(screen.getByTestId("reply-card-ln_1"));
      await waitFor(() => expect(screen.getByTestId("back-pill")).toBeTruthy());
      const list = screen.getByTestId("space-lines");
      const reported = (indexes: number[]) =>
        act(() => {
          list.props["onViewableItemsChanged"]({
            viewableItems: indexes.map((index) => ({ index, isViewable: true })),
            changed: [],
          });
        });
      // The reply is the newest line, and its row the list's second: the room's foot is its first.
      const row = 1;
      // Still in view as the room begins to glide: the pill stays.
      await reported([row]);
      expect(screen.getByTestId("back-pill")).toBeTruthy();
      await reported([3]);
      expect(screen.getByTestId("back-pill")).toBeTruthy();
      await reported([row]);
      expect(screen.queryByTestId("back-pill")).toBeNull();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("lights a quoted message already in view where it is, with no pill back", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(room());
      const list = screen.getByTestId("space-lines");
      // The room's foot, the reply, the line between and the quoted message, all in view.
      await act(() => {
        list.props["onViewableItemsChanged"]({
          viewableItems: [0, 1, 2, 3].map((index) => ({ index, isViewable: true })),
          changed: [],
        });
      });
      await userEvent.press(screen.getByTestId("reply-card-ln_1"));
      await waitFor(() => expect(screen.getByTestId("flash-ln_1")).toBeTruthy());
      expect(screen.queryByTestId("back-pill")).toBeNull();
    } finally {
      scrolled.mockRestore();
    }
  });

  it("goes to the newest reply from the mark under the message", async () => {
    const scrolled = jest
      .spyOn(FlatList.prototype, "scrollToIndex")
      .mockImplementation(() => undefined);
    try {
      await render(room());
      await userEvent.press(screen.getByTestId("replies-ln_3"));
      await waitFor(() => expect(screen.getByTestId("flash-ln_3")).toBeTruthy());
      expect(screen.queryByTestId("back-pill")).toBeNull();
    } finally {
      scrolled.mockRestore();
    }
  });
});

describe("starting a reply (ADR 0219)", () => {
  const PAIR = ["per_arjun", "har_scout", "har_tree"];
  const held = line({
    id: "ln_1",
    authorId: "har_scout",
    authorKind: "harness",
    text: "Held for 6 at 7:30.",
    ts: "2026-09-03T21:14:00.000Z",
  });
  const room = (members = PAIR) => open(state([held], { members }));

  beforeEach(() => {
    forgetDrafts();
    // Where the capsule is, which the field's menu stands on: Jest's views never say on their own.
    jest
      .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
      .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
        answer(16, 700, 140, 34)) as never);
  });
  afterEach(() => jest.restoreAllMocks());

  /** Hold the message up and press Reply in its capsule. */
  async function replyToHeld() {
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    await userEvent.press(await screen.findByTestId("lift-reply"));
  }

  it("offers Reply first in a held message's capsule, before Copy", async () => {
    await render(room().element);
    await userEvent.longPress(screen.getByTestId("hold-ln_1"));
    const capsule = await screen.findByTestId("lift-capsule");
    const labels = within(capsule)
      .getAllByRole("button")
      .map((button) => button.props["accessibilityLabel"]);
    expect(labels.slice(0, 2)).toEqual(["Reply", "Copy"]);
  });

  it("holds the reply in a strip over the field, and × lets it go", async () => {
    await render(room().element);
    await replyToHeld();
    const strip = await screen.findByTestId("reply-strip");
    expect(strip).toHaveTextContent(/^Replying to Scout · 3 Sep/);
    expect(strip).toHaveTextContent(/Held for 6 at 7:30\.$/);
    await userEvent.press(screen.getByTestId("reply-strip-close"));
    expect(screen.queryByTestId("reply-strip")).toBeNull();
  });

  it("sends the reply with no to while it decides, and says so on the capsule", async () => {
    const { store, element } = room();
    await render(element);
    await replyToHeld();
    expect(await screen.findByRole("button", { name: "To Scout, by reply" })).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "Make it 8");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: { spaceId: "sp_1", text: "Make it 8", addressedTo: ["har_scout"], replyTo: "ln_1" },
    });
    // Sent, the strip goes.
    expect(screen.queryByTestId("reply-strip")).toBeNull();
  });

  it("sends a pick made after the reply as to, the reply still quoted", async () => {
    const { store, element } = room();
    await render(element);
    await replyToHeld();
    await userEvent.press(await screen.findByTestId("address-capsule"));
    await userEvent.press(screen.getByRole("menuitem", { name: /^Tree,/ }));
    expect(screen.getByTestId("reply-strip")).toBeTruthy();
    await userEvent.type(screen.getByTestId("composer"), "Tree, you take it");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: {
        spaceId: "sp_1",
        text: "Tree, you take it",
        to: ["har_tree"],
        addressedTo: ["har_tree"],
        replyTo: "ln_1",
      },
    });
  });

  it("names your own message as yours, and leaves who it is for alone", async () => {
    const mine = line({ id: "ln_1", authorId: "per_arjun", text: "Book it for Friday" });
    await render(open(state([mine], { members: PAIR })).element);
    await replyToHeld();
    expect(await screen.findByTestId("reply-strip")).toHaveTextContent(/^Replying to yourself/);
    expect(screen.queryByTestId("address-by-reply")).toBeNull();
  });

  it("replies to an agent's answer that also closed its run, as most answers do", async () => {
    const closed = line({ ...held, kind: "summary", runId: "run_1", folded: true });
    const { store, element } = open(state([closed], { members: PAIR }));
    await render(element);
    await replyToHeld();
    expect(await screen.findByTestId("reply-strip")).toHaveTextContent(/^Replying to Scout/);
    await userEvent.type(screen.getByTestId("composer"), "Make it 8");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toContainEqual({
      name: "send",
      args: { spaceId: "sp_1", text: "Make it 8", addressedTo: ["har_scout"], replyTo: "ln_1" },
    });
  });
});
