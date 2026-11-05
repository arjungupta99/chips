/**
 * The dialog that asks before a room is archived or deleted (ADR 0066, ADR 0067), a harness
 * removed (ADR 0078), an agent archived or deleted (ADR 0095), or several of either picked
 * (`BatchDialog`, ADR 0181, ADR 0182): the desktop's form of the phone's sheet, in the same words
 * (`archiveAsking`, `eraseAsking`, `removeAsking`, `agentArchiveAsking`, `agentDeleteAsking` and
 * their batches' in core). A modal `<dialog>`, so the keyboard stays in it and Escape is Cancel;
 * Delete waits for the server, and says why in red when the server will not, with the dialog still
 * up. A dialog may ask for a word under why it was refused (`field`): the name to join a workspace
 * under when the one you go by is taken there (ADR 0197).
 *
 * It grows out of what was pressed to open it, a row's menu item or a Delete button, and folds back
 * into it when it is taken away, however its owner takes it away (ADR 0274, `dialogMotion.ts`).
 */

import type { Asking } from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { boxOf, foldAway, growFrom, recentPress } from "./dialogMotion.ts";

/** A word the confirm goes with, typed: Enter is the confirm, and a blank one stops it. */
export interface ConfirmField {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly testId: string;
}

/** Why it did not happen, in words worth reading: an old server says so plainly. */
function refusal(error: unknown, tooOld: string): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) return tooOld;
  return said === "" ? "The server would not do it." : said;
}

export function ConfirmDialog({
  asking,
  danger,
  tooOld = "Not deleted: this server is older than the app, and cannot delete a space yet.",
  onCancel,
  cancel = "Cancel",
  onConfirm,
  alternative,
  field,
}: {
  readonly asking: Asking;
  /** Delete's red; Archive's is the primary button. */
  readonly danger: boolean;
  /** What to say when the server is older than the act: a delete's words unless told otherwise. */
  readonly tooOld?: string | undefined;
  readonly onCancel: () => void;
  /**
   * What the way out says: Cancel unless told otherwise ("Keep editing"). None at all for a dialog
   * that only tells, whose one button is OK (an invite that can't be used, ADR 0164).
   */
  readonly cancel?: string | null | undefined;
  /**
   * Resolves when it is done; a rejection's message is shown and the dialog stays. Told whether
   * the switch the asking offers is on: a room's one agent going in its harness too (ADR 0087),
   * or an agent's room going with it (ADR 0095).
   */
  readonly onConfirm: (options: { readonly too: boolean }) => Promise<void> | void;
  /**
   * A second thing the dialog may do instead, beside Cancel: Fork here, beside Move (ADR 0087,
   * Fork). It waits for the server as the confirm does, and says why when the server will not.
   */
  readonly alternative?:
    | { readonly label: string; readonly testId: string; readonly onChoose: () => Promise<void> }
    | undefined;
  readonly field?: ConfirmField | undefined;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // What the switch takes too goes until the checkbox says not (ADR 0087, rule 5; ADR 0095), and
  // so for several rooms' agents, or several agents' rooms (ADR 0181, ADR 0182).
  const [too, setToo] = useState(true);
  const words = asking.agentToo ?? asking.roomToo ?? asking.agentsToo ?? asking.roomsToo;

  // Before the page is drawn, so it is never seen whole before it grows; and let go while it is
  // still on the page, so its fold can be measured.
  useLayoutEffect(() => {
    const element = dialog.current;
    if (element === null) return;
    const opener = recentPress();
    if (!element.open) element.showModal();
    growFrom(element, boxOf(opener));
    return () => {
      foldAway(element, opener);
      element.close();
    };
  }, []);

  const settle = async (work: () => Promise<void> | void) => {
    setBusy(true);
    setFailed(undefined);
    try {
      await work();
    } catch (error) {
      setFailed(refusal(error, tooOld));
      setBusy(false);
    }
  };
  const blank = field !== undefined && field.value.trim() === "";
  const confirm = () => {
    if (busy || blank) return;
    return settle(() => onConfirm({ too: words !== undefined && too }));
  };

  return createPortal(
    <dialog
      ref={dialog}
      className="confirm grows"
      aria-labelledby={titleId}
      data-testid="confirm-dialog"
      onCancel={(event) => {
        // Escape: Cancel, unless the server is being asked.
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId}>{asking.title}</h2>
      <p>{asking.body}</p>
      {asking.note !== undefined && <p className="confirm-note">{asking.note}</p>}
      {words !== undefined && (
        <>
          <label className="confirm-too">
            <input
              type="checkbox"
              checked={too}
              disabled={busy}
              onChange={(event) => setToo(event.target.checked)}
              data-testid="confirm-too"
            />
            {words.label}
          </label>
          <p className="confirm-note">{too ? words.on : words.off}</p>
        </>
      )}
      {failed !== undefined && (
        <p className="confirm-failed" role="alert" data-testid="confirm-failed">
          {failed}
        </p>
      )}
      {field !== undefined && (
        <input
          className="confirm-field"
          aria-label={field.label}
          placeholder={field.label}
          value={field.value}
          maxLength={120}
          autoComplete="name"
          autoFocus
          disabled={busy}
          onChange={(event) => field.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void confirm();
          }}
          data-testid={field.testId}
        />
      )}
      <div className="confirm-actions">
        {cancel !== null && (
          <Button onClick={onCancel} disabled={busy}>
            {cancel}
          </Button>
        )}
        {alternative !== undefined && (
          <Button
            onClick={() => void settle(alternative.onChoose)}
            disabled={busy}
            data-testid={alternative.testId}
          >
            {alternative.label}
          </Button>
        )}
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => void confirm()}
          disabled={busy || blank}
          data-testid="confirm-go"
        >
          {asking.confirm}
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
