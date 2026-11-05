/**
 * The space before or after the one open, down the list as it is drawn (Previous Space and Next
 * Space, ⌥↑ ⌥↓, ADR 0256): with none open, or one that is not in the run (hidden, archived), the
 * first or the last of it; none past either end.
 */
export function stepSpace(
  order: readonly string[],
  current: string | undefined,
  step: 1 | -1,
): string | undefined {
  const at = current === undefined ? -1 : order.indexOf(current);
  if (at === -1) return step === 1 ? order[0] : order.at(-1);
  return order[at + step];
}
