/**
 * Where the room's lift goes once the rows have moved under it while it goes (`RoomMotion.tsx`,
 * `follow` and `keep`), as arithmetic alone — shared by the UI worklet that steers the lift and
 * the test that checks it.
 *
 * A lift to a line goes with the line: the rows moved by `by`, and so did the offset that stands
 * that line's start under the bar. A lift to the foot goes to the foot: nought is the foot however
 * the rows above it move. Moved with them, a send from up the history stopped short of the foot by
 * whatever had landed while the room went down to it — its own line, or the thinking bubble under
 * it — and the reply stood under the field and the keys (Arjun's phone, 23 October 2026).
 */
export function movedGoal(goal: number, by: number): number {
  "worklet";
  return goal === 0 ? 0 : goal + by;
}
