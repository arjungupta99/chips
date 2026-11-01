/**
 * The page a tab starts with. What is proved here is what the eye cannot see: which of its
 * children UIKit meets first, because that is the only place the tab bar looks for the list it
 * shrinks away from; and, where the name floats over the list on glass, that the list is told
 * how much of its top the name covers, since nothing pushes it down any more.
 */

import { render as renderBare, screen, waitFor, within } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { AccessibilityInfo, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GLASS } from "./Glass";
import { Empty, Screen, UnderName, UnderNameList } from "./Screen";
import { hasScrollBand } from "./ScrollBand";
import { WindowInsets } from "./windowInsets";

// A test renderer's views have no native tags, so the list is given one.
jest.mock("react-native/Libraries/ReactNative/RendererProxy", () => {
  const actual = jest.requireActual("react-native/Libraries/ReactNative/RendererProxy");
  return {
    ...actual,
    findNodeHandle: (view: { props?: { testID?: string } } | null) =>
      view?.props?.testID === "list" ? 42 : actual.findNodeHandle(view),
  };
});

// The band's holder is a native view (`modules/scroll-band`), here a plain one that keeps its
// props where a test can read them.
jest.mock("./ScrollBand", () => ({
  hasScrollBand: jest.fn(() => true),
  ScrollBand: (props: object) =>
    require("react").createElement(require("react-native").View, {
      ...props,
      testID: "scroll-band",
    }),
}));

/** A floating name asks where the status bar ends, as the app's router always lets it. */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

/** The name before it has measured itself: its padding, and one line of a 34-point title. */
const NAME = 12 + 41 + 8;

type Element = ReturnType<typeof screen.getByTestId>;

/** The style a scroll view's content is laid out with. */
function contentStyle(list: Element) {
  return StyleSheet.flatten(list.props["contentContainerStyle"]) ?? {};
}

function firstChildOf(testID: string): Element {
  const [first] = screen.getByTestId(testID).children;
  if (first === undefined || typeof first === "string") throw new Error("no first child");
  return first;
}

beforeEach(() => jest.mocked(hasScrollBand).mockReturnValue(true));
afterEach(() => jest.restoreAllMocks());

describe("a screen", () => {
  it("puts its list before its name in the tree on iOS, so the tab bar can find it", async () => {
    await render(
      <Screen title="Spaces" testID="page">
        <ScrollView testID="list" />
      </Screen>,
    );
    const first = firstChildOf("page");
    expect(within(first).getByTestId("list")).toBeOnTheScreen();
    expect(within(first).queryByRole("header")).toBeNull();
    // Still named, and still a heading, wherever it is in the tree.
    expect(screen.getByRole("header", { name: "Spaces" })).toBeOnTheScreen();
  });

  it("leaves a list alone under a name that is a shelf", async () => {
    await render(
      <Screen title="Runtime" testID="page">
        <UnderName testID="list" contentContainerStyle={{ padding: 16 }} />
      </Screen>,
    );
    expect(contentStyle(screen.getByTestId("list")).paddingTop).toBeUndefined();
  });
});

describe("a screen whose name floats on glass", () => {
  it("still puts its list first, and its name is still the heading", async () => {
    await render(
      <Screen title="Spaces" testID="page" glass>
        <UnderName testID="list" />
      </Screen>,
    );
    expect(within(firstChildOf("page")).getByTestId("list")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Spaces" })).toBeOnTheScreen();
  });

  it("gives the list the name's height above its first row, on top of its own padding", async () => {
    await render(
      <Screen title="You" testID="page" glass>
        <UnderName testID="list" contentContainerStyle={{ padding: 16 }} />
      </Screen>,
    );
    const list = screen.getByTestId("list");
    // The name's room is the list's; its own padding stays with its rows (`UnderBody`).
    expect(contentStyle(list).paddingTop).toBe(NAME);
    expect(StyleSheet.flatten(screen.getByTestId("under-body").props["style"])).toEqual({
      padding: 16,
    });
    // The scroll bar starts below the name; the status bar's share is iOS's to add.
    expect(list.props["scrollIndicatorInsets"]).toEqual({ top: NAME });
  });

  it("keeps a line that is not in a list clear of the status bar and the name", async () => {
    await render(
      <Screen title="Harnesses" testID="page" glass>
        <Empty>No harnesses yet.</Empty>
      </Screen>,
    );
    const line = screen.getByText("No harnesses yet.");
    expect(StyleSheet.flatten(line.props["style"]).marginTop).toBe(IPHONE.insets.top + NAME);
  });

  it("hands the band the list it follows, over the status bar, the name and the ramp", async () => {
    await render(
      <Screen title="Agents" testID="page" glass>
        <UnderName testID="list" />
      </Screen>,
    );
    await waitFor(() => expect(screen.getByTestId("scroll-band").props["scrollView"]).toBe(42));
    const band = screen.getByTestId("scroll-band");
    expect(band.props["ramp"]).toBe(GLASS.rampTop);
    expect(StyleSheet.flatten(band.props["style"])).toMatchObject({
      top: 0,
      height: IPHONE.insets.top + NAME + GLASS.rampTop,
    });
  });

  it("stands its name and band on the window's status bar when its tab is told the top is 0", async () => {
    // iOS 27 tells a tab off screen that its top inset is 0, until the tab is shown (ADR 0107).
    const offScreen = { ...IPHONE, insets: { ...IPHONE.insets, top: 0 } };
    await renderBare(
      <SafeAreaProvider initialMetrics={IPHONE}>
        <WindowInsets>
          <SafeAreaProvider initialMetrics={offScreen}>
            <Screen title="You" testID="page" glass>
              <UnderName testID="list" />
            </Screen>
          </SafeAreaProvider>
        </WindowInsets>
      </SafeAreaProvider>,
    );
    expect(StyleSheet.flatten(screen.getByTestId("scroll-band").props["style"])).toMatchObject({
      height: IPHONE.insets.top + NAME + GLASS.rampTop,
    });
  });

  it("opens a room at the head of its list for the line under the name, and shuts it after", async () => {
    const line = { node: <Text>Select all</Text>, height: 30 };
    const page = (under?: typeof line) => (
      <Screen title="Spaces" testID="page" glass under={under}>
        <UnderName testID="list" contentContainerStyle={{ padding: 16, gap: 12 }} />
      </Screen>
    );
    const view = await render(page(line));
    const list = screen.getByTestId("list");
    // The name's room is padding, as it was; the line's is a view at the head of the list, and the
    // rows stand below it in the list's own style, with its gap.
    expect(contentStyle(list).paddingTop).toBe(NAME);
    expect(StyleSheet.flatten(screen.getByTestId("under-room").props["style"])).toEqual({
      height: 30,
    });
    expect(StyleSheet.flatten(screen.getByTestId("under-body").props["style"])).toEqual({
      padding: 16,
      gap: 12,
    });
    expect(list.props["scrollIndicatorInsets"]).toEqual({ top: NAME + 30 });
    expect(screen.getByText("Select all")).toBeOnTheScreen();
    // The band is drawn at its height with the line from the first frame (`UnderBand`).
    expect(StyleSheet.flatten(screen.getByTestId("scroll-band").props["style"])).toMatchObject({
      height: IPHONE.insets.top + NAME + 30 + GLASS.rampTop,
    });
    await view.rerender(page());
    expect(screen.queryByTestId("under-room")).toBeNull();
    expect(screen.queryByText("Select all")).toBeNull();
    expect(contentStyle(screen.getByTestId("list")).paddingTop).toBe(NAME);
  });

  it("lays a list of results out under the line at once, since they come with it", async () => {
    await render(
      <Screen title="Search" testID="page" glass under={{ node: <Text>chips</Text>, height: 44 }}>
        <UnderNameList testID="list" data={[]} renderItem={() => null} />
      </Screen>,
    );
    expect(contentStyle(screen.getByTestId("list")).paddingTop).toBe(NAME + 44);
  });

  it("is a shelf on a build without the band's module", async () => {
    jest.mocked(hasScrollBand).mockReturnValue(false);
    await render(
      <Screen title="You" testID="page" glass>
        <UnderName testID="list" contentContainerStyle={{ padding: 16 }} />
      </Screen>,
    );
    expect(contentStyle(screen.getByTestId("list")).paddingTop).toBeUndefined();
    expect(screen.queryByTestId("scroll-band")).toBeNull();
  });

  it("is a shelf again when Reduce Transparency is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    await render(
      <Screen title="You" testID="page" glass>
        <UnderName testID="list" contentContainerStyle={{ padding: 16 }} />
      </Screen>,
    );
    await waitFor(() =>
      expect(contentStyle(screen.getByTestId("list")).paddingTop).toBeUndefined(),
    );
  });
});
