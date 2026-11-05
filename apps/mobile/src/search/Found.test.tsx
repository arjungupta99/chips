/**
 * What stands beside Search's results on an iPad (ADR 0256). What is worth proving: the faces drift
 * there before anything is typed or opened, and it asks for a result once something is typed; a
 * found message's room opens at its line with the words, and Open in Spaces goes to it there; an
 * agent's card from the room stands over it with the way back to it, and one found by name is the
 * top of the pane. The room and the card are their own panes, proven in their own tests.
 */

import type { Snapshot } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import type { Opened } from "../ui/opened";
import { Found } from "./Found";

const mockPushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => mockPushed.push(to) }),
}));

// The room, the card and the faces stand in as what they were handed.
jest.mock("../spaces/RoomPane", () => {
  const react = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    RoomPane: (props: {
      spaceId: string;
      at?: string;
      words?: string;
      preview: () => void;
      onOpenAgent: (id: string) => void;
    }) =>
      react.createElement(
        react.Fragment,
        null,
        react.createElement(
          Text,
          { testID: "room" },
          [props.spaceId, props.at, props.words].join(" "),
        ),
        react.createElement(Pressable, {
          accessibilityRole: "button",
          accessibilityLabel: "Open in Spaces",
          onPress: props.preview,
        }),
        react.createElement(Pressable, {
          accessibilityRole: "button",
          accessibilityLabel: "Its agent",
          onPress: () => props.onOpenAgent("agt_scout"),
        }),
      ),
  };
});
jest.mock("../agents/AgentPane", () => {
  const react = require("react");
  const { Pressable, Text } = require("react-native");
  return {
    AgentPane: (props: {
      agentId: string;
      history: boolean;
      onBack?: () => void;
      onHistory: () => void;
    }) =>
      react.createElement(
        react.Fragment,
        null,
        react.createElement(
          Text,
          { testID: "card" },
          `${props.agentId}${props.history ? " history" : ""}`,
        ),
        props.onBack === undefined
          ? null
          : react.createElement(Pressable, {
              accessibilityRole: "button",
              accessibilityLabel: "Back",
              onPress: props.onBack,
            }),
        react.createElement(Pressable, {
          accessibilityRole: "button",
          accessibilityLabel: "Message history",
          onPress: props.onHistory,
        }),
      ),
  };
});
jest.mock("./Backdrop", () => {
  const react = require("react");
  const { View } = require("react-native");
  return { Backdrop: () => react.createElement(View, { testID: "search-backdrop" }) };
});

const IPAD = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

/** The fixtures' workspace, with Supplier email's room as `sp_1`. */
function workspace(): Snapshot {
  const whole = snapshot();
  const room = whole.model.spaces[0];
  if (room === undefined) throw new Error("no room");
  return { ...whole, model: { ...whole.model, spaces: [{ ...room, id: "sp_1" }] } } as Snapshot;
}

/** Found with what is open kept as `useOpened` keeps it, and every change to it recorded. */
function Kept({
  first,
  typed,
  went,
}: {
  readonly first: Opened;
  readonly typed: boolean;
  readonly went: Opened[];
}) {
  const [opened, setOpened] = useState(first);
  const state = workspace();
  return (
    <SafeAreaProvider initialMetrics={IPAD}>
      <Found
        store={fakeStore(state)}
        snapshot={state}
        selfId="per_arjun"
        opened={opened}
        go={(next) => {
          went.push(next);
          setOpened(next);
        }}
        faces={[]}
        typed={typed}
      />
    </SafeAreaProvider>
  );
}

async function draw(first: Opened, typed = true) {
  const went: Opened[] = [];
  await render(<Kept first={first} typed={typed} went={went} />);
  return went;
}

beforeEach(() => {
  mockPushed.length = 0;
});

describe("beside Search's results", () => {
  it("drifts the faces before anything is typed or opened, and asks for a result after", async () => {
    await draw({}, false);
    expect(screen.getByTestId("search-drifting")).toBeTruthy();
    await draw({}, true);
    expect(screen.getByText("Choose a result on the left.")).toBeTruthy();
  });

  it("opens a found message's room at its line, with the words, and Open in Spaces goes there", async () => {
    await draw({ space: "sp_1", at: "line:ln_1", words: "chin" });
    expect(screen.getByTestId("room")).toHaveTextContent("sp_1 line:ln_1 chin");
    await userEvent.press(screen.getByRole("button", { name: "Open in Spaces" }));
    expect(mockPushed).toEqual(["/spaces/sp_1?at=line%3Aln_1&words=chin"]);
  });

  it("stands a room's agent's card over the room, and its history goes back to the card, the card to the room", async () => {
    const went = await draw({ space: "sp_1", at: "line:ln_1", words: "chin" });
    await userEvent.press(screen.getByRole("button", { name: "Its agent" }));
    expect(screen.getByTestId("card")).toHaveTextContent("agt_scout");
    expect(screen.getByTestId("room")).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Message history" }));
    expect(screen.getByTestId("card")).toHaveTextContent("agt_scout history");
    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(went.at(-1)).toEqual({ space: "sp_1", at: "line:ln_1", words: "chin" });
    expect(screen.queryByTestId("card")).toBeNull();
  });

  it("makes an agent found by name the top of the pane", async () => {
    await draw({ agent: "agt_scout" });
    expect(screen.getByTestId("card")).toHaveTextContent("agt_scout");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.queryByTestId("room")).toBeNull();
  });

  it("looks at nothing once the room is gone from under the reader", async () => {
    await draw({ space: "sp_gone", at: "line:ln_1" });
    expect(screen.queryByTestId("room")).toBeNull();
    expect(screen.getByText("Choose a result on the left.")).toBeTruthy();
  });
});
