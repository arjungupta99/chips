/**
 * The Mode picker on a harness's settings page (ADR 0300, addendum of 19 November 2026), as the
 * plan "Harness first, Chips's rules if you want them" drew it: the modes the harness offers, a row
 * each in its own words, the one in force ticked, and under it when it goes back. Tapping a mode
 * other than the one it starts in opens For how long under the rows (1 hour, 8 hours, Until
 * tomorrow, Keep it), then Cancel or "Use Auto", which is red for a mode that never asks. Tapping
 * the one it starts in puts it back at once. A member sees the rows without the choices. The
 * phone's (`apps/mobile/src/harnesses/permissions/ModePicker.tsx`) in the desktop's terms.
 */

import {
  CANCEL_WORDS,
  MODE_HEADING,
  MODE_LENGTH_HEADING,
  MODE_LENGTHS,
  type ModeChoice,
  type ModePicker as ModePickerView,
  modeConfirmWords,
  modeLengthWords,
  type SnoozeLength,
  snoozeUntil,
} from "@chipschat/core";
import { useState } from "react";
import type { PermissionsService } from "./service.ts";

export function ModePicker(props: {
  readonly picker: ModePickerView;
  readonly harnessId: string;
  readonly service: PermissionsService | undefined;
}) {
  const { picker, harnessId, service } = props;
  const [choosing, setChoosing] = useState<ModeChoice | undefined>(undefined);
  // The one last tapped, so the fold keeps its words while it closes.
  const [last, setLast] = useState<ModeChoice | undefined>(undefined);
  const [length, setLength] = useState<SnoozeLength>("1h");
  const may = picker.may && service !== undefined;
  const ticked = choosing?.id ?? picker.current.id;

  const pick = (choice: ModeChoice) => {
    if (!may) return;
    if (choice.base) {
      setChoosing(undefined);
      if (!picker.current.base) service?.setMode(harnessId, null);
      return;
    }
    setLength("1h");
    setChoosing(choice);
    setLast(choice);
  };
  const use = () => {
    if (choosing === undefined) return;
    service?.setMode(harnessId, {
      id: choosing.id,
      name: choosing.name,
      backTo: picker.base.name,
      everything: choosing.everything,
      until: snoozeUntil(length),
    });
    setChoosing(undefined);
  };

  return (
    <>
      <div className="asking-part-h">
        <h4>{MODE_HEADING}</h4>
      </div>
      <div
        className="perms-modes"
        role="radiogroup"
        aria-label={MODE_HEADING}
        data-testid="perms-modes"
      >
        {picker.choices.map((choice) => {
          const on = ticked === choice.id;
          const back = on && choosing === undefined && !choice.base ? picker.back : undefined;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a native radio checks on every arrow, and the mode it starts in saves at once.
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={on}
              className="perms-mode"
              data-hot={choice.everything ? "true" : undefined}
              disabled={!may}
              onClick={() => pick(choice)}
              data-testid={`perms-mode-${choice.id}`}
            >
              <span className="perms-mode-dot" aria-hidden="true">
                <i />
              </span>
              <span className="perms-row-words">
                <b>{choice.name}</b>
                {choice.words !== undefined && <small>{choice.words}</small>}
                {back !== undefined && (
                  <span className="perms-mode-back" data-testid="perms-mode-back">
                    {back}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <div className="snz-fold" data-open={choosing !== undefined ? "true" : undefined}>
          <div className="snz-in">
            <div className="perms-mode-long" data-testid="perms-mode-long">
              <p className="perms-mode-label">{MODE_LENGTH_HEADING}</p>
              <fieldset className="snz-chips" aria-label={MODE_LENGTH_HEADING}>
                {MODE_LENGTHS.map((each) => (
                  <button
                    key={each}
                    type="button"
                    className="snz-chip"
                    aria-pressed={length === each}
                    onClick={() => setLength(each)}
                    data-testid={`perms-mode-len-${each}`}
                  >
                    {modeLengthWords(each)}
                  </button>
                ))}
              </fieldset>
              <div className="perms-mode-acts">
                <button
                  type="button"
                  className="perms-mode-cancel"
                  onClick={() => setChoosing(undefined)}
                  data-testid="perms-mode-cancel"
                >
                  {CANCEL_WORDS}
                </button>
                <button
                  type="button"
                  className="perms-mode-use"
                  data-tone={last?.everything === true ? "danger" : undefined}
                  onClick={use}
                  data-testid="perms-mode-use"
                >
                  {modeConfirmWords(last?.name ?? "")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {picker.differs !== undefined && (
        <p className="asking-note perms-mode-differs" data-testid="perms-mode-differs">
          {picker.differs}
        </p>
      )}
      <p className="asking-note" data-testid="perms-mode-foot">
        {picker.foot}
      </p>
    </>
  );
}
