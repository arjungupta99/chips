/**
 * The split's third column (ADR 0276): a page one level deeper beside the page it came from, the
 * detail narrowing for it, the list stepping aside where the detail would be too narrow, and the
 * deeper page in the detail's place where no third column fits. What it tells the capsule: how
 * wide the detail is at the window's edge, less a column the detail stands beside itself. And a
 * sheet opened in the detail standing in the third column where the caller asks (ADR 0276's
 * addendum), and a room's details and its Universe sharing the one column beside it.
 */

import { render, screen, userEvent, within } from "@testing-library/react-native";
import { useState } from "react";
import { Dimensions, Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ChromeProvider, useChrome } from "./chrome";
import { Sheet } from "./Sheet";
import { Split, THIRD } from "./Split";

const jestWindow = Dimensions.get("window");
afterEach(() => Dimensions.set({ window: jestWindow }));
const on = (width: number, height: number) =>
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });

function split(third?: string) {
  return render(
    <Split
      list={<Text>the list</Text>}
      detail={<Text>the page</Text>}
      third={third === undefined ? undefined : <Text>{third}</Text>}
    />,
  );
}

describe("a third column", () => {
  it("stands beside the page on a 13-inch on its side, the page narrowing to 616 and the list kept", async () => {
    on(1376, 1032);
    await split("its history");
    expect(screen.getByTestId("split-third")).toHaveStyle({ width: THIRD });
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: 1376 - 340 - THIRD });
    expect(screen.getByTestId("split-list")).not.toHaveStyle({ display: "none" });
    expect(screen.getByText("the page")).toBeTruthy();
  });

  it("has the list step aside upright, where the page would be left under 540", async () => {
    on(1032, 1376);
    await split("its history");
    // Still drawn, slid out of its box of none, and out of reach of a tap or VoiceOver.
    expect(screen.queryByTestId("split-list")).toBeNull();
    expect(screen.getByTestId("split-list", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: 1032 - THIRD });
    expect(screen.getByTestId("split-third")).toBeTruthy();
  });

  it("stands in the page's place where no third column fits: an iPad mini upright", async () => {
    on(744, 1133);
    await split("its history");
    expect(screen.queryByTestId("split-third")).toBeNull();
    expect(screen.getByText("its history")).toBeTruthy();
    expect(screen.queryByText("the page")).toBeNull();
  });

  it("is not there with nothing deeper open, and the page has the rest", async () => {
    on(1376, 1032);
    await split();
    expect(screen.queryByTestId("split-third")).toBeNull();
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: 1376 - 340 });
  });
});

/** What the Spaces tab's split told the capsule about its detail's foot. */
function Foot() {
  const foot = useChrome().feet["index"];
  return <Text testID="foot">{foot === undefined ? "none" : `${foot.atEdge} ${foot.width}`}</Text>;
}

describe("the capsule over the detail", () => {
  it("is told the room's width at the window's edge, less the details beside it", async () => {
    on(1032, 1376);
    await render(
      <ChromeProvider>
        <Split tab="index" away docked={THIRD} list={null} detail={<Text>the room</Text>} />
        <Foot />
      </ChromeProvider>,
    );
    expect(screen.getByTestId("foot")).toHaveTextContent(`true ${1032 - THIRD}`);
  });

  it("is told the detail is not at the edge with the list beside it", async () => {
    on(1376, 1032);
    await render(
      <ChromeProvider>
        <Split tab="index" list={null} detail={<Text>the room</Text>} />
        <Foot />
      </ChromeProvider>,
    );
    expect(screen.getByTestId("foot")).toHaveTextContent(`false ${1376 - 340}`);
  });
});

/** A row of the detail that opens a choice as a sheet, as an agent's card opens its model's. */
function Choosing() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} testID="choose" />
      <Sheet open={open} onClose={() => setOpen(false)} testID="choice">
        <Text>the choices</Text>
      </Sheet>
    </>
  );
}

const IPAD = {
  frame: { x: 0, y: 0, width: 1376, height: 1032 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

/** Two rows of the detail, each opening its own choice, as the card's Model and Icon do. */
function TwoChoices() {
  const [open, setOpen] = useState<"model" | "icon" | "both" | undefined>(undefined);
  const either = (one: "model" | "icon") => open === one || open === "both";
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen("model")} testID="model" />
      <Pressable accessibilityRole="button" onPress={() => setOpen("both")} testID="icon" />
      {/* Icon's drawn before Model's, as the card draws them, so its effects run first. */}
      <Sheet
        open={either("icon")}
        onClose={() => setOpen((now) => (now === "both" ? "model" : undefined))}
        testID="icon-sheet"
      >
        <Text>the icons</Text>
      </Sheet>
      <Sheet
        open={either("model")}
        onClose={() => setOpen((now) => (now === "both" ? "icon" : undefined))}
        testID="model-sheet"
      >
        <Text>the models</Text>
      </Sheet>
    </>
  );
}

describe("a sheet opened in the detail", () => {
  it("takes the column from one standing there, which closes", async () => {
    on(1376, 1032);
    await render(
      <SafeAreaProvider initialMetrics={IPAD}>
        <Split sheetsBeside list={null} detail={<TwoChoices />} />
      </SafeAreaProvider>,
    );
    await userEvent.press(screen.getByTestId("model"));
    expect(within(screen.getByTestId("split-third")).getByText("the models")).toBeTruthy();
    // Icon opened while Model still stands: both are drawn open in one go, and Icon takes over.
    await userEvent.press(screen.getByTestId("icon"));
    expect(within(screen.getByTestId("split-third")).getByText("the icons")).toBeTruthy();
    expect(screen.queryByText("the models")).toBeNull();
  });

  const draw = (sheetsBeside: boolean) =>
    render(
      <SafeAreaProvider initialMetrics={IPAD}>
        <Split sheetsBeside={sheetsBeside} list={null} detail={<Choosing />} />
      </SafeAreaProvider>,
    );

  it("stands in the third column where the split is asked, and its X takes the column away", async () => {
    on(1376, 1032);
    await draw(true);
    expect(screen.queryByTestId("split-third")).toBeNull();
    await userEvent.press(screen.getByTestId("choose"));
    expect(within(screen.getByTestId("split-third")).getByText("the choices")).toBeTruthy();
    expect(screen.getByTestId("split-detail")).toHaveStyle({ width: 1376 - 340 - THIRD });
    await userEvent.press(screen.getByTestId("choice-close"));
    expect(screen.queryByTestId("split-third")).toBeNull();
    expect(screen.queryByText("the choices")).toBeNull();
  });

  it("stays a sheet where the split is not asked", async () => {
    on(1376, 1032);
    await draw(false);
    await userEvent.press(screen.getByTestId("choose"));
    expect(screen.queryByTestId("split-third")).toBeNull();
    expect(screen.getByText("the choices")).toBeTruthy();
  });

  it("stays a sheet where no third column fits: an iPad mini upright", async () => {
    on(744, 1133);
    await draw(true);
    await userEvent.press(screen.getByTestId("choose"));
    expect(screen.queryByTestId("split-third")).toBeNull();
    expect(screen.getByText("the choices")).toBeTruthy();
  });
});

/** What stands beside a room, as the chrome holds it, with a button for each. */
function Beside() {
  const { details, setDetails, universe, setUniverse } = useChrome();
  return (
    <>
      <Text testID="beside">{details ? "details" : universe ? "universe" : "nothing"}</Text>
      <Pressable accessibilityRole="button" onPress={() => setDetails(!details)} testID="d" />
      <Pressable accessibilityRole="button" onPress={() => setUniverse(!universe)} testID="u" />
    </>
  );
}

describe("the column beside a room", () => {
  it("holds its details or its Universe, opening either putting the other away", async () => {
    await render(
      <ChromeProvider>
        <Beside />
      </ChromeProvider>,
    );
    expect(screen.getByTestId("beside")).toHaveTextContent("nothing");
    await userEvent.press(screen.getByTestId("d"));
    expect(screen.getByTestId("beside")).toHaveTextContent("details");
    await userEvent.press(screen.getByTestId("u"));
    expect(screen.getByTestId("beside")).toHaveTextContent("universe");
    await userEvent.press(screen.getByTestId("d"));
    expect(screen.getByTestId("beside")).toHaveTextContent("details");
    await userEvent.press(screen.getByTestId("d"));
    expect(screen.getByTestId("beside")).toHaveTextContent("nothing");
  });
});
