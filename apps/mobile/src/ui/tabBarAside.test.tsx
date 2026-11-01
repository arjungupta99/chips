/**
 * The tab bar stepping aside for a screen's own bar (ADR 0181): the bar hears it, and the screen
 * that asked is not drawn again for it. Kept in one context with the setter, a Select drew the
 * whole Spaces list a second time, and the Agents tab under it (the simulator, 19 October 2026).
 */

import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { TabBarAsideProvider, useStepTabBarAside, useTabBarAside } from "./tabBarAside";

let drawn = 0;
function Asking({ aside }: { readonly aside: boolean }) {
  drawn += 1;
  useStepTabBarAside(aside);
  return null;
}
function Bar() {
  return <Text>{useTabBarAside() ? "aside" : "there"}</Text>;
}
function Tabs({ aside }: { readonly aside: boolean }) {
  return (
    <TabBarAsideProvider>
      <Asking aside={aside} />
      <Bar />
    </TabBarAsideProvider>
  );
}

describe("the tab bar stepping aside", () => {
  it("goes when a screen asks and comes back when it stops, without drawing that screen again", async () => {
    const view = await render(<Tabs aside={false} />);
    expect(screen.getByText("there")).toBeTruthy();

    drawn = 0;
    await view.rerender(<Tabs aside />);
    expect(screen.getByText("aside")).toBeTruthy();
    expect(drawn).toBe(1);

    drawn = 0;
    await view.rerender(<Tabs aside={false} />);
    expect(screen.getByText("there")).toBeTruthy();
    expect(drawn).toBe(1);
  });
});
