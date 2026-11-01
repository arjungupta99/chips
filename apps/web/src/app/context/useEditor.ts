/**
 * What the context editor does (ADR 0135), on the desktop. How it works is core's
 * (`contextEditor.ts`), the same on the phone; this keeps its model in the page's state. Save
 * sends the edit down the harness's socket and waits for the harness's copy back (ADR 0134):
 * saved, and the editor goes back by itself a second later; changed, and a dialog asks whose
 * words stay; failed or missed, and the words stay for another go; away, and Save waits for the
 * harness to be back.
 */

import {
  AWAY_READ_MS,
  type ContextOwner,
  type ContextReads,
  cameBack,
  type EditBase,
  type EditorModel,
  editorCan,
  harnessAway,
  keptMine,
  openEditor,
  putOff,
  SAVED_BEAT_MS,
  saveContextEdit,
  sending,
  settled,
  tookTheirs,
  typed,
} from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface Editor extends Omit<EditorModel, "rest" | "awayAtOpen"> {
  /** Whether there is anything to save. */
  readonly dirty: boolean;
  /** Whether leaving would lose words typed here: it asks first. */
  readonly unsaved: boolean;
  readonly mayType: boolean;
  readonly maySave: boolean;
  readonly change: (next: string) => void;
  readonly save: () => void;
  readonly keepMine: () => void;
  readonly useTheirs: () => void;
  /** The dialog put away unanswered: the person's words stay, to be saved over the harness's. */
  readonly later: () => void;
}

export function useEditor({
  reads,
  owner,
  name,
  opened,
  awayAtOpen,
  onSaved,
}: {
  readonly reads: ContextReads;
  readonly owner: ContextOwner;
  readonly name: string;
  readonly opened: EditBase;
  readonly awayAtOpen: boolean;
  /** Saved, and its second is up: go back to the page, which flashes the row. */
  readonly onSaved: () => void;
}): Editor {
  const [model, setModel] = useState(() => openEditor(opened, awayAtOpen));
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const can = editorCan(model);

  const send = useCallback(
    async (from: EditBase, words: string) => {
      setModel(sending);
      const outcome = await saveContextEdit(reads, owner, name, from, words, {
        alive: () => alive.current,
      });
      if (!alive.current) return;
      setModel((was) => settled(was, outcome));
      if (outcome.state === "saved") {
        setTimeout(() => alive.current && onSaved(), SAVED_BEAT_MS);
      }
    },
    [reads, owner, name, onSaved],
  );
  const change = useCallback((next: string) => setModel((was) => typed(was, next)), []);

  // Away: its copy is read again until the harness is back, and then Save is on again.
  const away = model.state === "away";
  const { kind, id } = owner;
  useEffect(() => {
    if (!away) return;
    let open = true;
    const whose: ContextOwner = { kind, id };
    const reading = setInterval(() => {
      void harnessAway(reads, whose).then((still) => {
        if (open && !still) setModel(cameBack);
      });
    }, AWAY_READ_MS);
    return () => {
      open = false;
      clearInterval(reading);
    };
  }, [away, reads, kind, id]);

  return {
    text: model.text,
    base: model.base,
    state: model.state,
    message: model.message,
    theirs: model.theirs,
    theirsAt: model.theirsAt,
    ...can,
    change,
    save: () => {
      if (can.maySave) void send(model.base, model.text);
    },
    keepMine: () => {
      const kept = keptMine(model);
      if (kept === undefined) return;
      setModel(kept.model);
      void send(kept.from, model.text);
    },
    later: () => setModel(putOff),
    useTheirs: () => setModel(tookTheirs),
  };
}
