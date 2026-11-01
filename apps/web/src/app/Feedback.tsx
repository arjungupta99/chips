/**
 * What a person says about a line a harness said (M3.4, ADR 0031): Not right?, in place of the
 * thumbs and *What went wrong?* (ADR 0200). It becomes a `feedback` event the harness hears, and is
 * folded back onto the line from the log, so what this draws under a bubble is what everyone in the
 * room sees — the one who wrote it included, once the server has it.
 *
 * The menu asks for it; the form stands under the bubble, since it wants a field: the reasons,
 * each a press, anything else in words, and Send once there is either (core's `notRight`). A 👍
 * or 👎 already on a line still draws, as what the room has said.
 */

import type { Correction, Directory, Line, Reaction, UnsentNote } from "@chipschat/core";
import { NOT_RIGHT_REASONS, nameOf, notRight, notRightWords, refusalWords } from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";

/** What a row may say about a line: a note, or a reaction, which an older device may still send. */
export type FeedbackGivenInput =
  | { readonly kind: "reaction"; readonly reaction: string }
  | { readonly kind: "correction"; readonly text: string };

export type OnFeedback = (line: Line, input: FeedbackGivenInput) => void;

export interface NoteFormProps {
  readonly line: Line;
  /** Who said it: the agent the note goes to. */
  readonly name: string;
  /** The note is on its way; the form waits for the answer. */
  readonly busy: boolean;
  readonly onFeedback: OnFeedback;
  readonly onClose: () => void;
}

/**
 * Not right?, asked for from the menu and standing open under the bubble until it is sent or
 * dropped. Only a harness reads one, so only a harness's line offers it.
 */
export function NoteForm({ line, name, busy, onFeedback, onClose }: NoteFormProps) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [more, setMore] = useState("");
  const first = useRef<HTMLButtonElement>(null);
  const words = notRightWords(name);
  const note = notRight(picked, more);
  // The reader asked for this from the menu; the first reason is where a keyboard carries on.
  useEffect(() => first.current?.focus(), []);
  const toggle = (reason: string) =>
    setPicked((now) =>
      now.includes(reason) ? now.filter((each) => each !== reason) : [...now, reason],
    );
  return (
    <form
      className="feedback-form"
      data-testid="correction-form"
      aria-label={words.title}
      onSubmit={(event) => {
        event.preventDefault();
        if (note === undefined) return;
        onFeedback(line, { kind: "correction", text: note });
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <b className="feedback-title">{words.title}</b>
      <fieldset className="feedback-reasons" aria-label="Reasons">
        {NOT_RIGHT_REASONS.map((reason, index) => (
          <button
            key={reason}
            ref={index === 0 ? first : undefined}
            type="button"
            className="feedback-reason"
            aria-pressed={picked.includes(reason)}
            disabled={busy}
            onClick={() => toggle(reason)}
          >
            {reason}
          </button>
        ))}
      </fieldset>
      <label>
        <span>{words.placeholder}</span>
        <input
          aria-label="Anything else"
          value={more}
          onChange={(event) => setMore(event.target.value)}
          disabled={busy}
        />
      </label>
      <div className="feedback-buttons">
        {note === undefined && <span className="feedback-empty">{words.empty}</span>}
        <Button size="sm" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          type="submit"
          variant="primary"
          disabled={busy || note === undefined}
          data-testid="not-right-send"
        >
          {words.send}
        </Button>
      </div>
    </form>
  );
}

/** Who said a line, as the room names them: the agent a note on it goes to. */
export function saidName(line: Line, directory: Directory): string {
  return nameOf(directory, line.authorId);
}

/**
 * What the room has said about a line so far: reactions as chips, notes as quoted lines. And the
 * reader's own note the server turned away, quoted where it would have stood with why under it
 * (PM-4), as a refused message keeps its words and says why.
 */
export function FeedbackGiven({
  line,
  directory,
  unsent,
}: {
  readonly line: Line;
  readonly directory: Directory;
  readonly unsent?: UnsentNote | undefined;
}) {
  const reactions = line.reactions ?? [];
  const corrections = line.corrections ?? [];
  if (reactions.length === 0 && corrections.length === 0 && unsent === undefined) return null;
  return (
    <div className="feedback-given">
      {reactions.length > 0 && (
        <ul className="reactions" aria-label="Reactions">
          {byEmoji(reactions).map(([emoji, who]) => (
            <li key={emoji} data-testid="reaction" data-reaction={emoji}>
              {emoji} {who.map((id) => nameOf(directory, id)).join(", ")}
            </li>
          ))}
        </ul>
      )}
      {corrections.map((note: Correction) => (
        <blockquote key={note.seq} className="correction" data-testid="correction">
          <b>{nameOf(directory, note.by)}</b>
          {note.text}
        </blockquote>
      ))}
      {unsent !== undefined && (
        <blockquote className="correction unsent" data-testid="unsent-note">
          {unsent.text}
          <span className="unsent-why" role="status">
            {refusalWords(unsent.reason, directory)}
          </span>
        </blockquote>
      )}
    </div>
  );
}

/** `👎 Arjun, Dana`: one chip per emoji, in the order first given, naming everyone who gave it. */
function byEmoji(reactions: readonly Reaction[]): [string, string[]][] {
  const grouped = new Map<string, string[]>();
  for (const each of reactions) {
    const who = grouped.get(each.reaction) ?? [];
    who.push(each.by);
    grouped.set(each.reaction, who);
  }
  return [...grouped.entries()];
}
