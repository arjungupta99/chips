/**
 * When a bubble's corners take their transition (`RoomMotion.tsx`): with its first draw, and not
 * when the room is built. Arriving on a view already drawn, it takes every corner it names as
 * changing from nothing, and each one opens square and rounds, on every room that opens.
 *
 * Reanimated cannot be loaded under Jest and `jest.setup.js` stands plain boxes in for this file,
 * so this reads the real one over a small stand-in.
 */

import { render } from "@testing-library/react-native";
import type { ComponentType, Context, ReactNode } from "react";
import { Platform, StyleSheet, type ViewStyle } from "react-native";

let mockLess = false;

jest.mock("react-native-reanimated", () => {
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    Easing: { bezierFn: () => () => 0 },
    LayoutAnimationConfig: ({ children }: { readonly children: ReactNode }) => children,
  };
});
jest.mock("react-native-worklets", () => ({}));
jest.mock("../ui/useReduceMotion", () => ({ useReduceMotion: () => mockLess }));

const { MovingBubble, RoomTransition } = jest.requireActual("./RoomMotion") as {
  readonly MovingBubble: ComponentType<{
    readonly corners: ViewStyle;
    readonly testID: string;
    readonly children: ReactNode;
  }>;
  readonly RoomTransition: Context<unknown>;
};

const BUILT = { move: "the room's move" };

function bubble(room?: unknown) {
  return (
    <RoomTransition.Provider value={room}>
      <MovingBubble corners={{ borderTopRightRadius: 18 }} testID="bubble">
        {null}
      </MovingBubble>
    </RoomTransition.Provider>
  );
}

type Drawn = Awaited<ReturnType<typeof render>>;

function drawn(view: Drawn) {
  const { style, layout } = view.getByTestId("bubble").props;
  return { style: StyleSheet.flatten(style), layout };
}

function transitioned(view: Drawn) {
  return drawn(view).style.transitionProperty;
}

describe("a bubble's corners", () => {
  beforeEach(() => {
    mockLess = false;
  });

  it("take their transition with the first draw, before the room is built", async () => {
    const view = await render(bubble());
    expect(transitioned(view)).toContain("borderTopRightRadius");
    expect(drawn(view).style.borderTopRightRadius).toBe(18);
  });

  it("keep it when the room is built, and only then does the bubble move with the room", async () => {
    const view = await render(bubble());
    const first = transitioned(view);
    expect(drawn(view).layout).toBeUndefined();
    await view.rerender(bubble(BUILT));
    expect(transitioned(view)).toBe(first);
    expect(drawn(view).layout).toBe(BUILT.move);
  });

  it("stand plain for someone who asked for less motion", async () => {
    mockLess = true;
    expect(transitioned(await render(bubble(BUILT)))).toBeUndefined();
  });

  it("stand plain on the web", async () => {
    const web = jest.replaceProperty(Platform, "OS", "web");
    expect(transitioned(await render(bubble()))).toBeUndefined();
    web.restore();
  });
});
