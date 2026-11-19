/**
 * One choice of who a message goes to, as the field's list and the column of faces both draw it
 * (`AddressInField.tsx`, `FaceColumn.tsx`, `columnChoices.ts`).
 */

import type { AimPick } from "@chipschat/core";

/** One choice: an agent, a person (ADR 0204), every person here, or everybody here. */
export interface Choice {
  readonly ids: readonly string[];
  /**
   * What picking it keeps: the harness, `people`, every person here when the message goes, or
   * `all`, whoever is here then.
   */
  readonly pick: AimPick;
  /** An agent's own row, which a crowded list stands under Agents. */
  readonly agent?: boolean | undefined;
  /**
   * The column's All, in a room whose faces don't fit it: letting go there opens the list rather
   * than picking (`columnOf`). Never in the list itself.
   */
  readonly more?: boolean | undefined;
  readonly name: string;
  readonly under?: string | undefined;
  /** Whether `under` is the handle that reaches it, drawn as a mention is. */
  readonly handle?: boolean | undefined;
  /** It leads the room (ADR 0104), and wears "Lead" beside its name as it does on the sheet. */
  readonly lead?: boolean | undefined;
  /** Its harness, where its name does not say it: "Milo" is Jacobian's (ADR 0150). */
  readonly harness?: string | undefined;
  /** Whose agent it is, where that is somebody else: "Dana's agent" (ADR 0234). */
  readonly owner?: string | undefined;
}
