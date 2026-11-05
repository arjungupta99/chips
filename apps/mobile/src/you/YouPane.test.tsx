/**
 * The page beside You's list on an iPad (ADR 0256). What is worth proving: with nothing open it says
 * to choose a row; each page stands under a bar that names it; a person opened from People stands
 * in a third column beside People with their row chosen, or in People's place with the way back
 * where none fits, and closing them or taking them out goes back to People alone; and a sheet's
 * page that You hands over stands in the pane, or with none for it, nothing open. The pages
 * themselves are proven in their own tests, and You's rows opening them in `You.test.tsx`.
 */

import type { Device } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import { useState } from "react";
import { Dimensions, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import type { Opened } from "../ui/opened";
import { Split } from "../ui/Split";
import type { YouPages } from "./pages";
import { YouPane, youThird } from "./YouPane";

jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

// Each page stands in as a word, with what a press in it would do.
jest.mock("../people/People", () => {
  const react = require("react");
  const { Pressable } = require("react-native");
  return {
    People: ({ onOpen, selected }: { onOpen: (id: string) => void; selected?: string }) =>
      react.createElement(Pressable, {
        accessibilityRole: "button",
        accessibilityLabel: "Dana",
        accessibilityState: { selected: selected === "per_dana" },
        onPress: () => onOpen("per_dana"),
        testID: "people-page",
      }),
  };
});
jest.mock("../people/Person", () => {
  const react = require("react");
  const { Pressable } = require("react-native");
  return {
    Person: ({ personId, onRemoved }: { personId: string; onRemoved: () => void }) =>
      react.createElement(Pressable, {
        accessibilityRole: "button",
        accessibilityLabel: `Remove ${personId}`,
        onPress: onRemoved,
        testID: "person-page",
      }),
  };
});
jest.mock("../people/Invite", () => ({ Invite: () => null }));
jest.mock("./RelayPage", () => ({ RelayPage: () => null }));
jest.mock("./MediaPage", () => ({ MediaPage: () => null }));
jest.mock("./ConnectionPage", () => ({ ConnectionPage: () => null }));

const IPAD = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

const DEVICE = {
  deviceId: "dev_1",
  workspaceId: "ws_1",
  workspaceName: "Northwind",
  participantId: "per_arjun",
  serverUrl: "https://chips.example",
} as unknown as Device;

/** The pane with what is open kept as the tabs keep it. */
function Kept({
  first,
  went,
  pages = {},
}: {
  readonly first: Opened;
  readonly went: Opened[];
  readonly pages?: YouPages | undefined;
}) {
  const [opened, setOpened] = useState(first);
  const store = fakeStore(snapshot());
  const go = (next: Opened) => {
    went.push(next);
    setOpened(next);
  };
  // As the route stands them: the page beside the list, and a person in a third column.
  return (
    <SafeAreaProvider initialMetrics={IPAD}>
      <Split
        list={null}
        detail={
          <YouPane
            device={DEVICE}
            store={store}
            files={{} as never}
            opened={opened}
            go={go}
            pages={pages}
          />
        }
        third={youThird({ device: DEVICE, store, opened, go })}
      />
    </SafeAreaProvider>
  );
}

async function draw(first: Opened, pages?: YouPages) {
  const went: Opened[] = [];
  await render(<Kept first={first} went={went} pages={pages} />);
  return went;
}

describe("the page beside You", () => {
  it("says to choose a row with nothing open", async () => {
    await draw({});
    expect(screen.getByText("Choose a row on the left.")).toBeTruthy();
  });

  it("names each page in its bar", async () => {
    await draw({ page: "invite" });
    expect(screen.getByRole("header", { name: "Invite someone" })).toBeTruthy();
    await draw({ page: "connection" });
    expect(screen.getByRole("header", { name: "Connection" })).toBeTruthy();
    await draw({ page: "media" });
    expect(screen.getByRole("header", { name: /^Media on / })).toBeTruthy();
  });

  it("stands a person from People in People's place where no third column fits, with the way back, and goes back when they are taken out", async () => {
    const went = await draw({ page: "people" });
    expect(screen.getByRole("header", { name: "People" })).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Dana" }));
    expect(screen.getByTestId("person-page")).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByTestId("people-page")).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Dana" }));
    await userEvent.press(screen.getByRole("button", { name: "Remove per_dana" }));
    expect(went).toEqual([
      { page: "people", person: "per_dana" },
      { page: "people" },
      { page: "people", person: "per_dana" },
      { page: "people" },
    ]);
  });

  it("stands a person in a third column beside People on a 13-inch on its side, their row chosen, and × goes back to People alone", async () => {
    const jestWindow = Dimensions.get("window");
    Dimensions.set({ window: { width: 1376, height: 1032, scale: 2, fontScale: 1 } });
    try {
      const went = await draw({ page: "people" });
      await userEvent.press(screen.getByRole("button", { name: "Dana" }));
      expect(screen.getByTestId("split-third")).toBeTruthy();
      expect(screen.getByTestId("person-page")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Dana" })).toBeSelected();
      expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
      await userEvent.press(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByTestId("person-page")).toBeNull();
      expect(screen.getByRole("button", { name: "Dana" })).not.toBeSelected();
      expect(went).toEqual([{ page: "people", person: "per_dana" }, { page: "people" }]);
    } finally {
      Dimensions.set({ window: jestWindow });
    }
  });

  it("stands a sheet's page that You hands it, and with none for it says nothing is open", async () => {
    await draw({ page: "quiet" }, { quiet: <Text testID="quiet-page">Quiet hours</Text> });
    expect(screen.getByTestId("quiet-page")).toBeTruthy();
    await draw({ page: "agents" }, { quiet: <Text testID="quiet-page">Quiet hours</Text> });
    expect(screen.getByText("Choose a row on the left.")).toBeTruthy();
  });
});
