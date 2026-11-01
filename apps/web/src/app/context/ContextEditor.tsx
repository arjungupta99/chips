/**
 * The context editor (ADR 0135, the phone's on the desktop): one file of an agent's, or of its
 * harness's own set, in a card under the bar, its Markdown dimmed as it is typed; Save at the
 * bar's right, and ⌘S; a capsule at the foot saying what the file is doing. Saved, it goes back by
 * itself a second later, and the page it goes back to flashes the row. Changed in the harness
 * meanwhile, a dialog asks whose words stay. Away, it reads and does not save. Left with words
 * unsaved, it asks once.
 *
 * The words are drawn twice, in one place: dimmed and marked in a layer under the field, and
 * typed into the field over it, whose own letters are clear and whose caret is not. The two share
 * a font, a size and a wrap, so each letter sits on its own; the layer is what gives the card its
 * height, so the field grows with it and the page scrolls, not the field.
 */

import type { ContextOwner, ContextReads, ContextRow, EditorWords } from "@chipschat/core";
import { type ReactNode, useEffect, useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog.tsx";
import { ConflictDialog } from "./ConflictDialog.tsx";
import { EditorStatus, SaveButton, saveLook } from "./EditorChrome.tsx";
import { markdownSpans } from "./markdown.tsx";
import { land } from "./memory.ts";
import { RoleTile } from "./rows.tsx";
import { ownerKey } from "./useContext.ts";
import { type Editor, useEditor } from "./useEditor.ts";

export function ContextEditor({
  reads,
  owner,
  row,
  opened,
  readAt,
  away,
  words,
  face,
  backLabel,
  onBack,
}: {
  readonly reads: ContextReads;
  readonly owner: ContextOwner;
  readonly row: ContextRow;
  readonly opened: { readonly text: string; readonly hash: string | null };
  readonly readAt: string;
  readonly away: boolean;
  readonly words: EditorWords;
  /** Whose file, for the dialog that asks: the agent's face, or its harness's mark. */
  readonly face: ReactNode;
  /** What the back button says: the page it goes back to. */
  readonly backLabel: string;
  readonly onBack: () => void;
}) {
  const editor = useEditor({
    reads,
    owner,
    name: row.name,
    opened,
    awayAtOpen: away,
    onSaved: () => {
      land(ownerKey(owner), row.name);
      onBack();
    },
  });
  const unsaved = editor.unsaved;
  const [asking, setAsking] = useState(false);
  useLeaveAsks(unsaved);
  const leave = () => (unsaved ? setAsking(true) : onBack());
  return (
    <main
      className="conv ctx-page"
      aria-label={row.title}
      onKeyDown={(event) => {
        if (event.key === "s" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          editor.save();
        }
      }}
    >
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={leave}>
            {`‹ ${backLabel}`}
          </button>
          <h1>{row.title}</h1>
        </div>
        <div className="conv-h-r">
          <SaveButton look={saveLook(editor)} onSave={editor.save} />
        </div>
      </header>
      <div className="ctx-page-scroll">
        <div className="ctx-page-column">
          <div className="ctx-meta">
            <RoleTile role={row.role} side={26} />
            <span className="ctx-meta-name">
              {row.name}
              <span className="ctx-meta-whose">{` · ${words.whose}`}</span>
            </span>
          </div>
          <Words editor={editor} row={row} />
        </div>
      </div>
      <div className="ctx-status-dock">
        <EditorStatus
          editor={editor}
          harnessName={words.harnessName}
          agentName={words.agentName}
          readAt={readAt}
          from={words.from}
        />
      </div>
      <ConflictDialog
        editor={editor}
        name={row.name}
        title={row.title}
        harnessName={words.harnessName}
        face={face}
      />
      {asking && (
        <ConfirmDialog
          asking={{
            title: "Leave without saving?",
            body: `Your changes to ${row.title} aren't saved.`,
            confirm: "Leave",
          }}
          danger
          cancel="Keep editing"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onBack();
          }}
        />
      )}
    </main>
  );
}

/** The card: the marked words under the field, the field over them. */
function Words({ editor, row }: { readonly editor: Editor; readonly row: ContextRow }) {
  return (
    <div className="ctx-card ctx-write" data-busy={editor.mayType ? undefined : "true"}>
      <div className="ctx-text ctx-write-ink" aria-hidden="true">
        {markdownSpans(editor.text)}
        {/* A field's last empty line still has a height; the layer's needs a letter to have one. */}
        {"​"}
      </div>
      <textarea
        className="ctx-text ctx-write-field"
        value={editor.text}
        readOnly={!editor.mayType}
        spellCheck={false}
        autoCorrect="off"
        aria-label={`${row.title}, ${row.name}`}
        onChange={(event) => editor.change(event.target.value)}
        data-testid="context-text"
      />
    </div>
  );
}

/** Closing the window or reloading with words unsaved asks, as the browser does. */
function useLeaveAsks(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return;
    const ask = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);
}
