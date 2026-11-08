/**
 * The dialog that asks before picked rows are archived or deleted together (ADR 0181, ADR 0182):
 * the confirm dialog, saying what core says of them, and the server asked about every row at once
 * (`actAll`). Rows it would not take stay in the dialog, with why, to be asked again or left; what it
 * said when the act was pressed holds while the server is asked, since a room going takes its agent
 * with it and the words worked out again mid-batch change under the button.
 */

import { type Asking, actAll } from "@chipschat/core";
import { useState } from "react";
import { ConfirmDialog } from "../ConfirmDialog.tsx";

/** What a batch asks about, as the list hands it over. */
export interface BatchAsk<T> {
  readonly kind: "archive" | "delete";
  /** The rows the act takes, as they were when asked, so the dialog can name them as they go. */
  readonly going: readonly T[];
  /** Picked rows a delete leaves, since this person may only archive them. */
  readonly staying: readonly T[];
}

/** What an act on one row is told: whether the dialog's switch is on, and what it said. */
export interface ActPlan<T> {
  readonly too: boolean;
  readonly asking: Asking;
  readonly going: readonly T[];
}

export function BatchDialog<T extends { readonly id: string }>({
  ask,
  asking: askingOf,
  nameOf,
  act,
  lane,
  onCancel,
  onActing,
  onDone,
}: {
  readonly ask: BatchAsk<T>;
  readonly asking: (
    kind: BatchAsk<T>["kind"],
    going: readonly T[],
    staying: readonly T[],
  ) => Asking;
  readonly nameOf: (item: T) => string;
  /** The act on one row, as the server is asked to do it. */
  readonly act: (kind: BatchAsk<T>["kind"], item: T, plan: ActPlan<T>) => Promise<void> | void;
  /** Rows that must go one at a time share a lane (`agentLane`); without it, each has its own. */
  readonly lane?: ((item: T) => string) | undefined;
  readonly onCancel: () => void;
  /** It was confirmed: the rows are held while the server is asked. */
  readonly onActing: (going: readonly T[]) => void;
  /** What the server did, and what it would not; with nothing refused, the dialog is done. */
  readonly onDone: (done: readonly string[], refused: readonly string[]) => void;
}) {
  const { kind } = ask;
  // What is still to do: all of it, until the server has refused some.
  const [left, setLeft] = useState<readonly T[]>(ask.going);
  const [said, setSaid] = useState<Asking | undefined>(undefined);
  const asking = said ?? askingOf(kind, left, ask.staying);
  return (
    <ConfirmDialog
      asking={asking}
      danger={kind === "delete"}
      onCancel={onCancel}
      onConfirm={async ({ too }) => {
        const going = left;
        setSaid(asking);
        onActing(going);
        const { done, refused } = await actAll(
          going,
          (item) => act(kind, item, { too, asking, going }),
          lane,
        );
        setSaid(undefined);
        onDone(
          done,
          refused.map((each) => each.item.id),
        );
        if (refused.length === 0) return;
        setLeft(refused.map((each) => each.item));
        const verbed = kind === "archive" ? "archived" : "deleted";
        const names = listed(refused.map((each) => nameOf(each.item)));
        const were = refused.length === 1 ? "was" : "were";
        const first = done.length === 0 ? "" : `${done.length} ${verbed}. `;
        // The confirm dialog shows it in red, and stays up for another go.
        throw new Error(`${first}${names} ${were} not ${verbed}: ${why(refused[0]?.error)}`);
      }}
    />
  );
}

/** Why the server would not, in words worth reading: an old server says so plainly. */
function why(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) {
    return "this server is older than the app, and cannot do that yet.";
  }
  return said === "" ? "the server would not do it." : said;
}

/** Names in a sentence: "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
