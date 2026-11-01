/**
 * A new space from the + (`docs/proposals/new-space.md`, Phase 4; ADR 0084): the desktop's form of
 * the phone's window, in its words. "New space", who will be asked, and a field that names the
 * space and sends on Enter (ADR 0149). The room is made on the send, by whoever holds the store
 * (`Shell.tsx`), and opens the way a room clicked in the rail does, by that name, with nothing said
 * in it: whoever was asked waits there for the person's first message, and makes its agent then.
 *
 * Who is asked is the phone's row of faces, wrapped to the dialog's width: every harness that takes
 * new spaces, picked as the phone picks (core's `newSpacePicks`) — the first click chooses, the
 * clicks after it add and take away — with the line under them saying what a send will do. Several
 * make a room of agents, asked of the first, which leads; the lead's name in the line is a button
 * that hands the lead to the next one picked (ADR 0149's addendum). Empty leads the row, as on the
 * phone (ADR 0148): the room
 * of people "No one" used to make, said so, which opens with its room sheet up, where agents
 * and people are added to it before anybody starts. Nobody picked sends nothing. Where no harness takes new spaces, Empty is all there is, so there are no faces.
 *
 * It grows out of the + that opened it and folds back into it (`GrowingDialog.tsx`). Escape, the ×
 * or a click outside it folds it away, and the words wait there for the next time. The rail's + is
 * one way in; an empty workspace's Create a space is the other (ADR 0131), so the shell holds it
 * (`useNewSpaceDialog`).
 */

import type { Directory, NewSpaceLine, Participant } from "@chipschat/core";
import {
  cantAnswer,
  EMPTY_ROOM,
  EMPTY_ROOM_LINE,
  NEW_SPACE_ALONE_LINE,
  NEW_SPACE_NAMED,
  newSpaceEmpty,
  newSpaceHarnesses,
  newSpaceLine,
  newSpaceNextLead,
  newSpacePicked,
  newSpacePickIds,
  newSpacePicks,
} from "@chipschat/core";
import { Avatar, Composer, Icon } from "@chipschat/ui";
import { type ReactNode, useCallback, useId, useMemo, useRef, useState } from "react";
import { GrowingDialog } from "./GrowingDialog.tsx";

export interface NewSpaceProps {
  /** Who may be asked, by name: `newSpaceHarnesses`. None, and the room is a room of people. */
  readonly harnesses: readonly Participant[];
  /** What was typed and not sent, and each change to it. */
  readonly draft: string;
  readonly onDraft: (draft: string) => void;
  /** Whom it opens on: whoever was asked for the last room made here, while they are offered. */
  readonly lastAsked?: string | undefined;
  /** The + that opened it, which it grows out of and folds back into. */
  readonly from?: HTMLElement | null | undefined;
  /** Ask the first of these for a room with this name; the rest are put in it (ADR 0149). */
  readonly onAsk: (harnessIds: readonly string[], title: string) => void;
  /** Open a room of people with this name (M3.3), empty, to be filled (ADR 0148). */
  readonly onGroup: (title: string) => void;
  /** Gone, the fade out finished. */
  readonly onClosed: () => void;
}

/**
 * The dialog for the whole shell, opened out of whichever control was pressed: the rail's + or the
 * empty pane's Create a space. What was typed and not sent, and who was asked last, wait here for
 * the next time it opens, from either; closed, the keyboard goes back to what opened it, unless a
 * room made empty said what comes once it has gone (ADR 0148).
 */
export function useNewSpaceDialog(input: {
  readonly directory: Directory;
  readonly onAsk: (harnessIds: readonly string[], title: string) => void;
  /** A room made empty, and what comes once the dialog has gone, in place of the keyboard going
   * back to the +: until then the page behind the modal dialog is inert and takes no focus. */
  readonly onGroup: (title: string) => (() => void) | undefined;
}): { readonly open: (from: HTMLElement | null) => void; readonly dialog: ReactNode } {
  const { directory, onAsk, onGroup } = input;
  const harnesses = useMemo(() => newSpaceHarnesses(directory), [directory]);
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const [lastAsked, setLastAsked] = useState<string | undefined>(undefined);
  const opener = useRef<HTMLElement | null>(null);
  const then = useRef<(() => void) | undefined>(undefined);
  const open = useCallback((from: HTMLElement | null) => {
    opener.current = from;
    setAsking(true);
  }, []);
  const closed = useCallback(() => {
    setAsking(false);
    const next = then.current;
    then.current = undefined;
    if (next === undefined) opener.current?.focus();
    else next();
  }, []);
  const ask = useCallback(
    (harnessIds: readonly string[], title: string) => {
      setLastAsked(harnessIds[0]);
      onAsk(harnessIds, title);
    },
    [onAsk],
  );
  const group = useCallback(
    (title: string) => {
      setLastAsked(EMPTY_ROOM);
      then.current = onGroup(title);
    },
    [onGroup],
  );
  const dialog = asking ? (
    <NewSpace
      harnesses={harnesses}
      draft={draft}
      onDraft={setDraft}
      lastAsked={lastAsked}
      from={opener.current}
      onAsk={ask}
      onGroup={group}
      onClosed={closed}
    />
  ) : null;
  return { open, dialog };
}

export function NewSpace(props: NewSpaceProps) {
  const { harnesses, draft, onDraft, onClosed } = props;
  const titleId = useId();
  // Nothing clicked yet: the dialog's own pick, whoever was asked last.
  const [chosen, setChosen] = useState<readonly string[] | undefined>(undefined);
  const [leaving, setLeaving] = useState(false);
  const picked = newSpacePicked(harnesses, chosen, props.lastAsked);
  const empty = newSpaceEmpty(harnesses, chosen, props.lastAsked);
  const choose = (harnessId: string) =>
    setChosen(newSpacePicks(newSpacePickIds(picked, empty), chosen !== undefined, harnessId));
  // The lead's name clicked: the next one picked leads, and the faces stay as they are.
  const handOn = () => setChosen(newSpaceNextLead(picked.map((each) => each.id)));
  // Sent, the words are the room's name, and the next dialog opens empty; folded away unsent, they
  // are the next draft. Cleared once it has gone, so they do not vanish while it fades.
  const sent = useRef(false);
  const gone = () => {
    if (sent.current) onDraft("");
    onClosed();
  };
  const leave = () => setLeaving(true);

  const send = (typed: string) => {
    // A name, on one line, whoever it is asked of.
    const title = typed.trim().replace(/\s+/g, " ");
    if (title === "" || leaving || (picked.length === 0 && !empty)) return;
    if (empty) props.onGroup(title);
    else
      props.onAsk(
        picked.map((each) => each.id),
        title,
      );
    sent.current = true;
    leave();
  };

  // Every room is named by the words; whoever is asked waits in it for the first message.
  const words = NEW_SPACE_NAMED;
  return (
    <GrowingDialog
      from={props.from}
      labelledBy={titleId}
      className="new-space"
      testId="new-space-window"
      // The field, not the first face or the ×: the words are what the dialog is for.
      focus="textarea"
      leaving={leaving}
      onLeave={leave}
      onGone={gone}
    >
      <div className="new-space-card">
        <div className="new-space-head">
          <h2 id={titleId}>New space</h2>
          <button
            type="button"
            className="new-space-close"
            aria-label="Close"
            data-testid="new-space-close"
            onClick={leave}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
        {harnesses.length > 0 && (
          <Faces harnesses={harnesses} picked={picked} empty={empty} onChoose={choose} />
        )}
        <Line picked={picked} empty={empty} anyone={harnesses.length > 0} onLead={handOn} />
        <Composer
          className="new-space-field"
          value={draft}
          onChange={onDraft}
          onSend={send}
          label={words}
          placeholder={words}
          disabled={leaving}
          maxRows={4}
        />
      </div>
    </GrowingDialog>
  );
}

/**
 * Who to ask: Empty, then a face for each harness that takes new spaces, each a checkbox, so Tab
 * moves between them and Space picks, as it does anywhere.
 */
function Faces(props: {
  readonly harnesses: readonly Participant[];
  readonly picked: readonly Participant[];
  readonly empty: boolean;
  readonly onChoose: (harnessId: string) => void;
}) {
  return (
    <fieldset className="new-space-faces" aria-label="Ask">
      <label
        className="new-space-face"
        data-on={props.empty ? "true" : undefined}
        data-testid={`new-space-pick-${EMPTY_ROOM}`}
      >
        <input
          type="checkbox"
          checked={props.empty}
          aria-label="Empty space"
          onChange={() => props.onChoose(EMPTY_ROOM)}
        />
        <span className="new-space-face-ring">
          <span className="new-space-empty">
            <Icon name="chat" size={18} />
          </span>
          <span className="new-space-check" aria-hidden="true">
            <Icon name="check" size={11} />
          </span>
        </span>
        <span className="new-space-face-name">Empty</span>
      </label>
      {props.harnesses.map((each) => {
        const on = props.picked.some((one) => one.id === each.id);
        const unable = cantAnswer({ [each.id]: each }, each.id) !== undefined;
        return (
          <label
            key={each.id}
            className="new-space-face"
            data-on={on ? "true" : undefined}
            data-testid={`new-space-pick-${each.id}`}
          >
            <input
              type="checkbox"
              checked={on}
              aria-label={unable ? `${each.displayName}, Can't answer now` : each.displayName}
              onChange={() => props.onChoose(each.id)}
            />
            <span className="new-space-face-ring">
              <Avatar name={each.displayName} kind="harness" cantAnswer={unable} />
              <span className="new-space-check" aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
            </span>
            <span className="new-space-face-name">{each.displayName}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/**
 * The line under the faces: who joins and waits for the first message, and with several who leads,
 * the lead's name a button that hands the lead on; or that the room will be empty, or that nobody
 * is picked yet.
 */
function Line(props: {
  readonly picked: readonly Participant[];
  readonly empty: boolean;
  readonly anyone: boolean;
  readonly onLead: () => void;
}) {
  const line: NewSpaceLine = newSpaceLine(props.picked) ?? {
    words: nobodyWords(props.anyone, props.empty),
    warn: false,
  };
  // With several picked, the lead's name is a button, outside the line's fade so it keeps the
  // keyboard as it hands the lead on.
  const leads = line.leads !== undefined && line.lead !== undefined;
  return (
    <p
      className="new-space-says"
      aria-live="polite"
      data-warn={line.warn ? "true" : undefined}
      data-testid="new-space-says"
    >
      {leads ? <Lead line={line} onLead={props.onLead} /> : null}
      <span key={`${line.lead ?? ""}${line.leads ?? ""}${line.words}`}>
        {leads || line.lead === undefined ? null : <b>{line.lead}</b>}
        {line.words}
      </span>
    </p>
  );
}

/** What the line says with nobody picked. Where nobody takes new spaces, nothing of picking. */
function nobodyWords(anyone: boolean, empty: boolean): string {
  if (!anyone) return NEW_SPACE_ALONE_LINE;
  return empty ? EMPTY_ROOM_LINE : "Pick who to ask";
}

/** "Jacobian leads ⇄": a click hands the lead to the next one picked. */
function Lead(props: { readonly line: NewSpaceLine; readonly onLead: () => void }) {
  return (
    <button
      type="button"
      className="new-space-lead"
      onClick={props.onLead}
      title={`Hand the lead to ${props.line.next ?? ""}`}
      data-testid="new-space-lead"
    >
      <b>{props.line.lead}</b>
      {props.line.leads}
      <span aria-hidden="true"> ⇄</span>
    </button>
  );
}
