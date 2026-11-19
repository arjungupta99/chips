/**
 * Stop asking's lengths on a harness's Chips's rules page (ADR 0300): 1 hour, 8 hours, until
 * tomorrow, in a row. The phone's (`apps/mobile/src/harnesses/permissions/StopLengths.tsx`) in the
 * desktop's terms; the words are core's.
 */

import { SNOOZE_CHIPS, type SnoozeLength, snoozeChipWords } from "@chipschat/core";

/** The lengths with an end, in a row. */
export function LengthChips(props: {
  readonly label: string;
  readonly onPick: (length: SnoozeLength) => void;
  readonly disabled?: boolean | undefined;
  readonly testId: string;
}) {
  return (
    <fieldset className="snz-chips" aria-label={props.label}>
      {SNOOZE_CHIPS.map((length) => (
        <button
          key={length}
          type="button"
          className="snz-chip"
          disabled={props.disabled}
          onClick={() => props.onPick(length)}
          data-testid={`${props.testId}-${length}`}
        >
          {snoozeChipWords(length)}
        </button>
      ))}
    </fieldset>
  );
}
