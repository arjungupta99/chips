/**
 * A list taken down to a place on its own (`useScrollGlide`): over frames, as far as the list goes
 * and no further, never up, stopped by a finger, and put there at once under Reduce Motion. The
 * list here is React Native's mock, whose `scrollTo` is one Jest function for every list, so each
 * test clears it first and reads where the frames put the list.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, ScrollView } from "react-native";
import { type ScrollGlide, useScrollGlide } from "./useScrollGlide";

let glide: ScrollGlide | undefined;

function List() {
  glide = useScrollGlide();
  return <ScrollView testID="list" {...glide.list} />;
}

const scrollTo = jest.mocked(ScrollView.prototype.scrollTo);
const frames = () => act(() => new Promise<void>((done) => setTimeout(done, 50)));
const placed = () => scrollTo.mock.calls.map(([to]) => (typeof to === "object" ? to?.y : to));

/** The list drawn `height` tall over `content`, scrolled to `offset`. */
async function list(height: number, content: number, offset = 0) {
  await render(<List />);
  const view = screen.getByTestId("list");
  await fireEvent(view, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 393, height } } });
  await fireEvent(view, "contentSizeChange", 393, content);
  await fireEvent.scroll(view, { nativeEvent: { contentOffset: { x: 0, y: offset } } });
  scrollTo.mockClear();
  return view;
}

afterEach(() => jest.restoreAllMocks());

it("glides down over frames, as far as the list goes and no further", async () => {
  await list(600, 900);
  glide?.down(500);
  await waitFor(() => expect(scrollTo).toHaveBeenLastCalledWith({ y: 300, animated: false }));
  const ys = placed() as number[];
  expect(ys.length).toBeGreaterThan(2);
  expect(ys).toEqual([...ys].sort((a, b) => a - b));
});

it("leaves the list where it is when the place is already at its top, or above it", async () => {
  await list(600, 1400, 400);
  glide?.down(300);
  await frames();
  expect(scrollTo).not.toHaveBeenCalled();
});

it("stops where it is when a finger takes the list", async () => {
  const view = await list(600, 1400);
  glide?.down(800);
  await waitFor(() => expect(scrollTo).toHaveBeenCalled());
  await fireEvent(view, "scrollBeginDrag");
  const after = scrollTo.mock.calls.length;
  await frames();
  expect(scrollTo).toHaveBeenCalledTimes(after);
  expect(placed().at(-1)).toBeLessThan(800);
});

it("puts the list there at once under Reduce Motion", async () => {
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
  await list(600, 1400);
  glide?.down(500);
  await frames();
  expect(scrollTo.mock.calls).toEqual([[{ y: 500, animated: false }]]);
});
