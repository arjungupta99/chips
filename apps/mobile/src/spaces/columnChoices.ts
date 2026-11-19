/**
 * What the column of faces holds (ADR 0229, and its addendum of 18 November 2026): the field's own
 * choices where their faces all fit it; in a room where they don't, a short column that never
 * scrolls. At its top All, which opens the field's list where every one of them is, with a search
 * line; under it the lead, then whoever the writer has been talking with here, the latest first
 * (core's `recentIn`), and then the rest, as many as fit, in the list's own order; and at its foot
 * People and Everyone, as always. The column used to scroll under a finger held at its top, and
 * in a room of fifty the lead was four seconds of holding away (Arjun's 2A of
 * `chips-notes/mocks/selector-people-crowd/`).
 *
 * Apart from the views, so Node can check it.
 */

import type { Choice } from "./choice";
import { SLOT, shapeOf } from "./faceColumnMath";

/**
 * How many choices at the end are groups, which stand at the list's foot and the column's: People
 * where it is offered, and Everyone.
 */
export function footOf(choices: readonly Choice[]): number {
  let count = 0;
  for (let index = choices.length - 1; index >= 0; index -= 1) {
    const choice = choices[index];
    if (choice === undefined || Array.isArray(choice.pick) || choice.more === true) break;
    count += 1;
  }
  return count;
}

/** What letting go on All says, in the tag over the column. */
export const MORE_WORDS = "Let go to open the list";

/**
 * The column for `choices` (`choicesOf`), in `room` points over the field (`columnRoom`). Unmeasured,
 * or where every face fits, it is the choices themselves.
 */
export function columnOf(
  choices: readonly Choice[],
  recent: readonly string[],
  room: number | undefined,
): readonly Choice[] {
  const groups = footOf(choices);
  const faces = choices.slice(0, choices.length - groups);
  const ends = choices.slice(choices.length - groups);
  const shape = shapeOf(faces.length, room, Math.max(0, groups - 1));
  if (room === undefined || shape.most <= 0) return choices;
  // All takes a slot; the lead and somebody else, at least, take the rest.
  const room_for = Math.max(1, Math.floor(shape.view / SLOT) - 1);
  const kept = new Set<Choice>();
  const keep = (choice: Choice | undefined) => {
    if (choice !== undefined && kept.size < room_for) kept.add(choice);
  };
  keep(faces.find((choice) => choice.lead === true));
  for (const id of recent) keep(faces.find((choice) => choice.ids[0] === id));
  for (const choice of faces) keep(choice);
  const everyone = ends.at(-1);
  const all: Choice = {
    ids: everyone?.ids ?? faces.flatMap((choice) => choice.ids),
    pick: "all",
    name: `All ${faces.length}`,
    under: MORE_WORDS,
    more: true,
  };
  return [all, ...faces.filter((choice) => kept.has(choice)), ...ends];
}
