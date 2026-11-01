/**
 * The layer a lifted message's menu is drawn on (ADR 0200). On iOS the room behind takes a touch as soon as
 * the menu is put down, while its copy is still going back; a modal held the screen until the copy
 * had settled, and a second press on the same message in that time was lost (Arjun, 18 October
 * 2026).
 */

import { render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Platform, Text } from "react-native";
import { LiftLayer } from "./LiftLayer";

function layer(props: {
  shown: boolean;
  held: boolean;
  onGone?: () => void;
  children?: ReactNode;
}) {
  return (
    <LiftLayer
      shown={props.shown}
      held={props.held}
      onGone={props.onGone ?? (() => {})}
      onRequestClose={() => {}}
    >
      {props.children ?? <Text>menu</Text>}
    </LiftLayer>
  );
}

/** The view under the layer that says who takes a touch. */
function taker() {
  let node = screen.getByText("menu").parent;
  while (node !== null && node.props["pointerEvents"] === undefined) node = node.parent;
  return node?.props["pointerEvents"];
}

describe("LiftLayer on iOS", () => {
  beforeEach(() => {
    expect(Platform.OS).toBe("ios");
  });

  it("takes every touch while the menu is up", async () => {
    await render(layer({ shown: true, held: true }));
    expect(taker()).toBe("auto");
  });

  it("lets the room take touches once the menu is put down, while the copy goes back", async () => {
    const view = await render(layer({ shown: true, held: true }));
    await view.rerender(layer({ shown: true, held: false }));
    expect(screen.getByText("menu")).toBeOnTheScreen();
    expect(taker()).toBe("none");
  });

  it("has gone as soon as it is told to go, with no modal to wait for", async () => {
    const onGone = jest.fn();
    const view = await render(layer({ shown: true, held: false, onGone }));
    expect(onGone).not.toHaveBeenCalled();
    await view.rerender(layer({ shown: false, held: false, onGone }));
    expect(onGone).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("menu")).toBeNull();
  });
});
