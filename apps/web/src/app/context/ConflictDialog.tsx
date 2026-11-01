/**
 * The dialog that asks whose words stay (ADR 0135, the phone's sheet on the desktop): the file
 * changed in its harness after the person opened it, so Save stopped. It shows what each side
 * changed since then, line by line, and offers **Keep mine** (save the person's words over the
 * harness's) and **Use theirs** (put the harness's in the editor, to read before anything is
 * saved). Put away with Escape, the person's words stay in the editor, to save over the
 * harness's when they choose.
 */

import { conflictOf, type LineChanges } from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { clockTime } from "../time.ts";
import type { Editor } from "./useEditor.ts";

/** Each side's lines, at most this many: the dialog is a glance, the editor has the whole. */
const LINES = 6;

function Side({ who, changes }: { readonly who: string; readonly changes: LineChanges }) {
  const lines = [
    ...changes.added.map((line) => ({ line, added: true })),
    ...changes.removed.map((line) => ({ line, added: false })),
  ];
  const more = lines.length - LINES;
  return (
    <div className="ctx-side">
      <span className="ctx-side-who">{who}</span>
      {lines.length === 0 && <span className="ctx-diff-line">Nothing but spacing.</span>}
      {lines.slice(0, LINES).map(({ line, added }, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a line may repeat; its place is its identity.
          key={index}
          className="ctx-diff-line"
          data-side={added ? "added" : "removed"}
        >
          {`${added ? "+" : "−"}  ${line}`}
        </span>
      ))}
      {more > 0 && <span className="ctx-diff-line">{`and ${more} more`}</span>}
    </div>
  );
}

export function ConflictDialog({
  editor,
  name,
  title,
  harnessName,
  face,
}: {
  readonly editor: Editor;
  readonly name: string;
  readonly title: string;
  readonly harnessName: string;
  /** Whose file: the agent's face, or its harness's mark. */
  readonly face: ReactNode;
}) {
  const theirs = editor.theirs;
  if (theirs === undefined) return null;
  return (
    <Asking
      editor={editor}
      name={name}
      title={title}
      harnessName={harnessName}
      face={face}
      at={clockTime(theirs.readAt)}
      sides={conflictOf(editor.base.text, theirs.text, editor.text)}
    />
  );
}

function Asking(props: {
  readonly editor: Editor;
  readonly name: string;
  readonly title: string;
  readonly harnessName: string;
  readonly face: ReactNode;
  readonly at: string;
  readonly sides: ReturnType<typeof conflictOf>;
}) {
  const { editor, harnessName } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="confirm ctx-conflict"
      aria-labelledby={titleId}
      data-testid="context-conflict"
      onCancel={(event) => {
        event.preventDefault();
        editor.later();
      }}
    >
      <div className="ctx-conflict-head">
        {props.face}
        <span className="ctx-caps">{`${props.name} · ${props.at}`}</span>
      </div>
      <h2 id={titleId}>{`Changed in ${harnessName} while you were editing`}</h2>
      <p>{`${props.title} was changed in ${harnessName} after you opened it. Nothing you typed is lost.`}</p>
      <div className="ctx-diff">
        <Side who={`In ${harnessName}`} changes={props.sides.theirs} />
        <Side who="You" changes={props.sides.mine} />
      </div>
      <div className="confirm-actions">
        <Button onClick={editor.useTheirs} data-testid="context-use-theirs">
          Use theirs
        </Button>
        <Button className="you-gold" onClick={editor.keepMine} data-testid="context-keep-mine">
          Keep mine
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
