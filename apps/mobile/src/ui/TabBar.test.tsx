/**
 * The bar of tabs. What is worth proving is what a screen reader and a thumb get: each tab is
 * a tab and says whether it is the one in front, a press goes where it says and nowhere when the tab is already in front, a hidden tab is not
 * there, the bar stands off the home indicator, and on a wide screen it is a rail.
 */

import { render, screen, userEvent } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";
import { TabBar, type TabBarProps } from "./TabBar";
import { TABS, tabsShown } from "./tabs";

const mockLayout = { wide: false, landscape: false };
jest.mock("./layout", () => ({ useLayout: () => mockLayout }));

function props(index = 0): TabBarProps & { readonly navigate: jest.Mock } {
  const navigate = jest.fn();
  const routes = [
    { key: "index-1", name: "index" },
    { key: "agents-1", name: "agents" },
    { key: "runtime-1", name: "runtime" },
  ];
  const descriptors = {
    "index-1": {
      options: {
        title: "Spaces",
        tabBarIcon: ({ color }: { color: string }) => <Text>{`chat ${color}`}</Text>,
      },
    },
    "agents-1": { options: { title: "Agents" } },
    "runtime-1": { options: { title: "Runtime", tabBarItemStyle: { display: "none" } } },
  };
  const navigation = { emit: () => ({ defaultPrevented: false }), navigate };
  return {
    state: { index, routes },
    descriptors,
    navigation,
    insets: { top: 59, bottom: 34, left: 0, right: 0 },
    navigate,
  } as unknown as TabBarProps & { readonly navigate: jest.Mock };
}

beforeEach(() => {
  mockLayout.wide = false;
});

describe("the tab bar", () => {
  it("names each tab, says which is in front, and leaves a hidden one out", async () => {
    await render(<TabBar {...props(1)} />);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tab", { name: "Agents", selected: true })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Spaces", selected: false })).toBeTruthy();
    expect(screen.queryByText("Runtime")).toBeNull();
  });

  it("goes to the tab pressed, and nowhere for the one already in front", async () => {
    const given = props(0);
    await render(<TabBar {...given} />);
    await userEvent.press(screen.getByRole("tab", { name: "Spaces" }));
    expect(given.navigate).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole("tab", { name: "Agents" }));
    expect(given.navigate).toHaveBeenCalledWith("agents", undefined);
  });

  it("draws the four a release has, from the one list: Search between Agents and You (ADR 0132)", async () => {
    const names = tabsShown(false);
    const routes = names.map((name) => ({ key: `${name}-1`, name }));
    const descriptors = Object.fromEntries(
      names.map((name) => [`${name}-1`, { options: { title: TABS[name].title } }]),
    );
    const given = {
      ...props(),
      state: { index: names.indexOf("search"), routes },
      descriptors,
    } as unknown as TabBarProps;
    await render(<TabBar {...given} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.props["accessibilityLabel"])).toEqual([
      "Spaces",
      "Agents",
      "Search",
      "You",
    ]);
    expect(screen.getByRole("tab", { name: "Search", selected: true })).toBeTruthy();
  });

  it("stands off the home indicator", async () => {
    await render(<TabBar {...props()} />);
    const bar = StyleSheet.flatten(screen.getByTestId("tab-bar").props["style"]);
    expect(bar.paddingBottom).toBe(34);
    expect(bar.flexDirection).toBe("row");
  });

  it("is a rail on the left of a wide screen, under the notch rather than beside it", async () => {
    mockLayout.wide = true;
    await render(<TabBar {...props()} />);
    const bar = StyleSheet.flatten(screen.getByTestId("tab-bar").props["style"]);
    expect(bar.flexDirection).toBe("column");
    expect(bar.paddingTop).toBeGreaterThan(59);
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
});
