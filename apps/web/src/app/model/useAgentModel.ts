/**
 * An agent's model and effort on its card (ADR 0141, the phone's on the desktop): the harness's
 * copy, read when the card opens and again each time the window comes back to the front, and only
 * for who may change it. Anybody else's card has no Model group, and never asks. Chips hears
 * nothing when a harness sends a new copy, so a change made elsewhere (J's, reaching its
 * followers) shows the next time the card is read.
 *
 * The dialog's own state lives here too: what is picked, and what became of Save. How either works
 * is core's (`agentModel.ts`), the same on the phone.
 */

import {
  AWAY_READ_MS,
  canSave,
  type Directory,
  MODEL_SAVED_MS,
  type ModelReads,
  type ModelSaveState,
  type ModelSheet,
  mayChangeModel,
  modelAsk,
  openModelSheet,
  pickLevel,
  pickModel,
  sameAs,
  saveModelChange,
  type WorkspaceModel,
} from "@chipschat/core";
import type { AgentModelView } from "@chipschat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { recall, remember } from "../context/memory.ts";
import { useFocusCount } from "../context/useContext.ts";

const keyOf = (agentId: string) => `model:${agentId}`;

export interface AgentModelReading {
  /** The harness's copy, once read: none while it has never been, or the harness never sent one. */
  readonly view: AgentModelView | undefined;
  /** No copy yet, and the first read is on its way: the group stands blank in its place. */
  readonly waiting: boolean;
  /** Read it again: a press on a quiet row, to see whether the harness is back. */
  readonly reread: () => void;
  /** A copy the dialog already has, saved: shown at once, before the next read. */
  readonly took: (view: AgentModelView) => void;
}

export function useAgentModel(
  reads: ModelReads | undefined,
  model: WorkspaceModel,
  directory: Directory,
  agentId: string,
  selfId: string,
): AgentModelReading {
  const may = reads !== undefined && mayChangeModel(model, directory, agentId, selfId);
  const focus = useFocusCount();
  const [view, setView] = useState<AgentModelView | undefined>(() =>
    may ? recall<AgentModelView>(keyOf(agentId)) : undefined,
  );
  const [asked, setAsked] = useState(0);
  const [reading, setReading] = useState(true);
  const took = useCallback(
    (fresh: AgentModelView) => {
      remember(keyOf(agentId), fresh);
      setView(fresh);
    },
    [agentId],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` and `asked` are when to read.
  useEffect(() => {
    setView(may ? recall<AgentModelView>(keyOf(agentId)) : undefined);
    if (!may || reads === undefined) return;
    let alive = true;
    reads
      .readAgentModel(agentId)
      .then(
        (fresh) => {
          remember(keyOf(agentId), fresh);
          if (alive) setView(fresh);
        },
        // Not sent yet, or not declared any more: the last copy stands, or there is no group.
        () => undefined,
      )
      .finally(() => alive && setReading(false));
    return () => {
      alive = false;
    };
  }, [reads, agentId, may, focus, asked]);
  const reread = useCallback(() => setAsked((was) => was + 1), []);
  return {
    view: may ? view : undefined,
    waiting: may && view === undefined && reading,
    reread,
    took,
  };
}

/** What became of Save, and the harness's words when it refused. */
export interface ModelSaving {
  readonly state: ModelSaveState;
  readonly message?: string | undefined;
}

export interface ModelSheetState {
  /** The dialog's picks while it is open; none once it is put away. */
  readonly sheet: ModelSheet | undefined;
  readonly saving: ModelSaving | undefined;
  readonly maySave: boolean;
  readonly open: (view: AgentModelView) => void;
  readonly close: () => void;
  readonly same: (on: boolean) => void;
  readonly pick: (modelId: string) => void;
  readonly level: (effortId: string) => void;
  readonly save: () => void;
}

/** What the dialog tells the card: a copy to show, Saved's beat over, and the dialog put away. */
export interface SheetHandlers {
  /** The agent as its harness says it is now, from the answer to a Save, saved or refused. */
  readonly took: (view: AgentModelView) => void;
  /** Saved, and its beat is over: the dialog goes, and the row flashes. */
  readonly landed: () => void;
  /** Put away before an answer: the card reads the copy again. */
  readonly closed: () => void;
}

/**
 * The dialog: open on what the agent runs on now, picks kept until Save, Save sending both and
 * waiting for the harness. Saved: the copy goes to the row at once, and the dialog goes after
 * `MODEL_SAVED_MS`, the row flashing. Refused or missed: the dialog stays, with the picks as they
 * were (rulings 8 and 9). Away: its copy is read again until the harness is back.
 */
export function useModelSheet(
  reads: ModelReads | undefined,
  agentId: string,
  handlers: SheetHandlers,
): ModelSheetState {
  const [sheet, setSheet] = useState<ModelSheet | undefined>(undefined);
  const [saving, setSaving] = useState<ModelSaving | undefined>(undefined);
  const open = useRef(false);
  // Read when they fire, so a new set of handlers does not make new callbacks.
  const told = useRef(handlers);
  told.current = handlers;
  useEffect(
    () => () => {
      open.current = false;
    },
    [],
  );

  const close = useCallback(() => {
    open.current = false;
    setSheet(undefined);
    told.current.closed();
  }, []);

  const save = useCallback(async () => {
    if (reads === undefined || sheet === undefined || !canSave(sheet)) return;
    if (saving?.state === "saving") return;
    setSaving({ state: "saving" });
    const outcome = await saveModelChange(reads, agentId, modelAsk(sheet), {
      alive: () => open.current,
    });
    if (!open.current) return;
    setSaving({ state: outcome.state, message: outcome.message });
    if (outcome.view !== undefined) told.current.took(outcome.view);
    if (outcome.state !== "saved") return;
    setTimeout(() => {
      if (!open.current) return;
      open.current = false;
      setSheet(undefined);
      told.current.landed();
    }, MODEL_SAVED_MS);
  }, [reads, sheet, saving, agentId]);

  // Away: read again until the harness is back, and then Save is on again.
  const away = saving?.state === "away";
  useEffect(() => {
    if (!away || reads === undefined) return;
    const reading = setInterval(() => {
      void reads.readAgentModel(agentId).then(
        (fresh) => {
          if (!open.current || fresh.away) return;
          setSaving(undefined);
          setSheet((was) => (was === undefined ? was : { ...was, view: fresh }));
        },
        () => undefined,
      );
    }, AWAY_READ_MS);
    return () => clearInterval(reading);
  }, [away, reads, agentId]);

  const settled = saving === undefined || saving.state !== "saving";
  const maySave =
    sheet !== undefined && settled && saving?.state !== "saved" && !away && canSave(sheet);
  return {
    sheet,
    saving,
    maySave,
    open: (view) => {
      open.current = true;
      setSaving(undefined);
      setSheet(openModelSheet(view));
    },
    close,
    // A new pick clears what the last Save said: the line was about those picks.
    same: (on) => {
      if (!settled) return;
      setSaving(undefined);
      setSheet((was) => was && sameAs(was, on));
    },
    pick: (modelId) => {
      if (!settled) return;
      setSaving(undefined);
      setSheet((was) => was && pickModel(was, modelId));
    },
    level: (effortId) => {
      if (!settled) return;
      setSaving(undefined);
      setSheet((was) => was && pickLevel(was, effortId));
    },
    // Enter as well as Save: only while Save is lit.
    save: () => {
      if (maySave) void save();
    },
  };
}
