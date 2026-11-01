/**
 * The rules about a line (M5.4) — whether a reader may pin it, change its words, take it back or
 * delete it for themselves (ADR 0167) — and the thing that stands under a bubble once they have asked: the form that edits it. The
 * thread — carrying a line into one, and the count of replies under it — was here until the
 * offer was withdrawn (ADR 0035's addendum, 15 September 2026).
 *
 * The asking is [the menu](./LineMenu.tsx). Each of these is an event the door checks and the
 * fold draws; nothing here decides anything the server would not.
 */

import type { Line, SpaceRole, WorkspaceRole } from "@chipschat/core";
import { mayDelete, mayEdit, mayHide, mayPin } from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { type KeyboardEvent, useState } from "react";

/** The handlers a bar calls, by space so one object serves every room. */
export interface LineHandlers {
  readonly edit: (spaceId: string, line: Line, text: string) => void;
  readonly remove: (spaceId: string, line: Line) => void;
  /** Delete for the reader alone (ADR 0167), and put back by Undo. */
  readonly hide: (spaceId: string, line: Line) => void;
  readonly show: (spaceId: string, lineId: string) => void;
  readonly pin: (spaceId: string, line: Line) => void;
  readonly unpin: (spaceId: string, line: Line) => void;
}

/** The reader's standing where the line is: in the space, and in the workspace. */
export interface Standing {
  readonly inSpace: SpaceRole | undefined;
  readonly inWorkspace: WorkspaceRole | undefined;
}

export interface LineMay {
  readonly edit: boolean;
  /** Delete for everyone. */
  readonly remove: boolean;
  /** Delete for the reader alone (ADR 0167). */
  readonly hide: boolean;
  readonly pin: boolean;
}

/** What the reader may do to a line, by the same rules the door applies; nothing is pinned in a thread. */
export function mayFor(line: Line, selfId: string, standing: Standing, inThread: boolean): LineMay {
  const said = line.kind === "text" && line.pending !== true && line.deleted !== true;
  return {
    edit: mayEdit(line, selfId),
    remove: mayDelete(line, selfId, standing),
    hide: mayHide(line),
    pin: said && !inThread && mayPin(standing.inSpace),
  };
}

export function sameMay(a: LineMay | undefined, b: LineMay | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.edit === b.edit && a.remove === b.remove && a.hide === b.hide && a.pin === b.pin;
}

/** The form that stands where a bubble was while its words are being changed. */
export function EditForm(props: {
  readonly line: Line;
  readonly onSave: (text: string) => void;
  readonly onCancel: () => void;
}) {
  const [text, setText] = useState(props.line.text);
  const trimmed = text.trim();
  const changed = trimmed !== "" && trimmed !== props.line.text;
  const save = () => {
    if (changed) props.onSave(trimmed);
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") props.onCancel();
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save();
    }
  };
  return (
    <form
      className="edit-form"
      data-testid="edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <textarea
        aria-label="Edit message"
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKey}
      />
      <div className="edit-buttons">
        <Button type="submit" variant="primary" size="sm" disabled={!changed}>
          Save
        </Button>
        <Button type="button" size="sm" onClick={props.onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
