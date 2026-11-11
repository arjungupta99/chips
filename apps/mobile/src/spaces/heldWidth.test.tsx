/**
 * How a room's lines take a change of the room's width on an iPad (ADR 0279): the width they had
 * while their words go, set going in the same render as the change; the new one in one render once
 * the words say they have gone, from which they glide; and the room's own once they have landed,
 * the words coming back only then, and simply there once they say they are back. Where they stand in the
 * room, in its middle or at the edge that stays put, and how far the start of their column moves on
 * the glass as they take the new width, the column standing in their middle. A turned window, a
 * room that doesn't move, and the first width, at once.
 */

import { act, render, screen } from "@testing-library/react-native";
import { Dimensions, Text, useWindowDimensions } from "react-native";
import { GLIDE, type HeldWidth, LET_GO, useHeldWidth, WORDS_BACK } from "./heldWidth";

jest.useFakeTimers();

const jestWindow = Dimensions.get("window");
afterEach(() => Dimensions.set({ window: jestWindow }));
const on = (width: number, height: number) =>
  Dimensions.set({ window: { width, height, scale: 2, fontScale: 1 } });

/** The lines' column: all of them, up to 900. */
const column = (width: number) => Math.min(width, 900);
/** What the room's moves were told, in order: how far the column's start moves, and landed. */
let glides: string[] = [];
const glided = (shift: number) => `by ${shift}`;
/** What the words would say, as the lines last drew them. */
let wordsSay: Pick<HeldWidth, "change" | "gone" | "back"> | undefined;
/** What the panes beside the room were told, in order, and what the lines drew as they were. */
let waits: string[] = [];
beforeEach(() => {
  glides = [];
  waits = [];
  wordsSay = undefined;
});

/** A room `width` wide, ending `end` short of the detail's right: the column beside it, if any. */
function Lines({
  width,
  end = 0,
  moves = true,
}: {
  readonly width: number;
  readonly end?: number;
  readonly moves?: boolean;
}) {
  const {
    width: held,
    edge,
    words,
    gliding,
    ...says
  } = useHeldWidth({ width, end }, moves, column, {
    glide: (shift, take) => {
      glides.push(glided(shift));
      take();
    },
    landed: () => glides.push("landed"),
    waiting: (waiting) => waits.push(`${waiting} at ${held ?? "the room's"}`),
  });
  wordsSay = says;
  return (
    <>
      <Text testID="lines">{held === undefined ? "the room's" : String(held)}</Text>
      <Text testID="edge">{edge ?? "none"}</Text>
      <Text testID="words">{words ?? "there"}</Text>
      <Text testID="gliding">{gliding ? "gliding" : "still"}</Text>
    </>
  );
}

/** The room beside the list, as wide as the window leaves it. */
function Beside() {
  const { width } = useWindowDimensions();
  return <Lines width={width - 340} />;
}

const lines = () => screen.getByTestId("lines");
const edge = () => screen.getByTestId("edge");
const words = () => screen.getByTestId("words");
const gliding = () => screen.getByTestId("gliding");
const wait = (ms: number) =>
  act(() => {
    jest.advanceTimersByTime(ms);
  });
const gone = () => act(() => wordsSay?.gone());
const back = () => act(() => wordsSay?.back());

it("takes its first width as the room's, its words there", async () => {
  await render(<Lines width={1036} />);
  expect(lines()).toHaveTextContent("the room's");
  expect(words()).toHaveTextContent("there");
});

it("holds the width it had while its words go, takes the new one once they have gone, and lets go once it has glided there", async () => {
  const { rerender } = await render(<Lines width={1036} />);
  // The details open at the room's end: the lines keep to its start, which stays put.
  await rerender(<Lines width={616} end={420} />);
  expect(lines()).toHaveTextContent("1036");
  expect(edge()).toHaveTextContent("start");
  expect(words()).toHaveTextContent("going");
  expect(gliding()).toHaveTextContent("still");

  // However long the words take, nothing moves until they say they have gone.
  await wait(1000);
  expect(lines()).toHaveTextContent("1036");
  expect(glides).toEqual([]);
  await gone();
  expect(lines()).toHaveTextContent("616");
  expect(edge()).toHaveTextContent("start");
  expect(gliding()).toHaveTextContent("gliding");
  // The column of 900 stood 68 in from the room's start; at 616 it fills the room, from its start.
  expect(glides).toEqual([glided(-68)]);
  // Said again, it is the same change.
  await gone();
  expect(glides).toEqual([glided(-68)]);

  // They glide there, their words gone until the columns have landed too.
  await wait(GLIDE);
  expect(lines()).toHaveTextContent("616");
  expect(words()).toHaveTextContent("going");

  // Landed, the columns with them, which set off as the lines took the width: the words come back,
  // and the lines let go of it once the columns have stopped whatever a stall made of them.
  await wait(WORDS_BACK - GLIDE);
  expect(words()).toHaveTextContent("coming");
  expect(lines()).toHaveTextContent("616");
  await wait(LET_GO - WORDS_BACK);
  expect(lines()).toHaveTextContent("the room's");
  expect(edge()).toHaveTextContent("none");
  expect(gliding()).toHaveTextContent("still");
  expect(glides).toEqual([glided(-68), "landed"]);

  // They are coming back until they say they are back, and then simply there.
  await wait(1000);
  expect(words()).toHaveTextContent("coming");
  await back();
  expect(words()).toHaveTextContent("there");
});

it("holds where a glide has its lines when the width changes again on the way, and takes the newest", async () => {
  const { rerender } = await render(<Lines width={1036} />);
  await rerender(<Lines width={616} end={420} />);
  await gone();
  await wait(GLIDE / 2);
  expect(lines()).toHaveTextContent("616");

  // The details close again on the way: the words stay gone, and the coming back the change before
  // would have begun is not begun for this one.
  await rerender(<Lines width={1036} />);
  expect(lines()).toHaveTextContent("616");
  expect(words()).toHaveTextContent("going");
  await wait(WORDS_BACK);
  expect(words()).toHaveTextContent("going");
  expect(lines()).toHaveTextContent("616");

  await gone();
  expect(lines()).toHaveTextContent("1036");
  expect(edge()).toHaveTextContent("start");
  expect(glides.at(-1)).toBe(glided(68));
  await wait(LET_GO);
  expect(words()).toHaveTextContent("coming");
  await back();
  expect(glides.at(-1)).toBe("landed");
  expect(lines()).toHaveTextContent("the room's");
  expect(words()).toHaveTextContent("there");
});

it("keeps the panes waiting from the commit that holds the lines to the one that draws them at the new width", async () => {
  const { rerender, unmount } = await render(<Lines width={1036} />);
  expect(waits).toEqual(["false at the room's"]);

  await rerender(<Lines width={616} end={420} />);
  expect(waits).toEqual(["false at the room's", "true at 1036"]);

  // However long the words and JavaScript take, until the lines are drawn at 616.
  await wait(1000);
  expect(waits).toHaveLength(2);
  await gone();
  expect(waits.at(-1)).toBe("false at 616");

  // Once more for a change on the way, and let go for a room that has closed meanwhile.
  await rerender(<Lines width={1036} />);
  expect(waits.at(-1)).toBe("true at 616");
  await unmount();
  expect(waits.at(-1)).toMatch(/^false/);
});

it("counts each change the words go for, so a change once they have gone is said for too", async () => {
  const { rerender } = await render(<Lines width={1036} />);
  await rerender(<Lines width={616} end={420} />);
  const first = wordsSay?.change;
  await gone();
  await wait(GLIDE / 2);
  await rerender(<Lines width={1036} />);
  expect(words()).toHaveTextContent("going");
  expect(wordsSay?.change).toBe((first ?? 0) + 1);
});

it("sends the words going again when the width changes as they come back, and their coming back is not taken for its end", async () => {
  const { rerender } = await render(<Lines width={1036} />);
  await rerender(<Lines width={616} end={420} />);
  await gone();
  await wait(LET_GO);
  expect(words()).toHaveTextContent("coming");
  expect(lines()).toHaveTextContent("the room's");

  // The words go again from where they had come back to, the lines at the width they stood.
  await rerender(<Lines width={1036} />);
  expect(lines()).toHaveTextContent("616");
  expect(words()).toHaveTextContent("going");
  await back();
  expect(words()).toHaveTextContent("going");

  await gone();
  expect(lines()).toHaveTextContent("1036");
  expect(glides.at(-1)).toBe(glided(68));
  await wait(LET_GO);
  await back();
  expect(glides.at(-1)).toBe("landed");
  expect(lines()).toHaveTextContent("the room's");
  expect(words()).toHaveTextContent("there");
});

it("takes the newest width once the words have gone when it changes again while they go", async () => {
  const { rerender } = await render(<Lines width={1036} />);
  await rerender(<Lines width={616} />);
  // The list comes back at the room's start, and the column narrows: the lines keep to its end.
  expect(edge()).toHaveTextContent("end");
  await rerender(<Lines width={1376} />);
  expect(lines()).toHaveTextContent("1036");
  // And goes again: from the width they hold, the column is 900 either way, and stands in the
  // middle of the room the whole way, as the lines do.
  expect(edge()).toHaveTextContent("middle");
  await gone();
  expect(lines()).toHaveTextContent("1376");
  expect(glides).toEqual([glided(0)]);
});

it("takes the new width at once in a turned window, as UIKit lays it out", async () => {
  on(1376, 1032);
  await render(<Beside />);
  await act(() => on(1032, 1376));
  expect(lines()).toHaveTextContent("the room's");
  expect(words()).toHaveTextContent("there");
  await gone();
  expect(glides).toEqual([]);
});

it("takes it at once in a room that doesn't move: Reduce Motion", async () => {
  const { rerender } = await render(<Lines width={1036} moves={false} />);
  await rerender(<Lines width={616} moves={false} />);
  expect(lines()).toHaveTextContent("the room's");
  expect(words()).toHaveTextContent("there");
});
