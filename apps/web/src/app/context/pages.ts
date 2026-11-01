/**
 * The pages that open over the Agents tab on the desktop: one file of an agent's or of its
 * harness's own set, in the editor or to read (ADR 0135); a harness's page, which a shared file
 * opens on, flashing the file it is, and which a tile on the shelf opens; every harness's card,
 * from View all under the shelf (ADR 0185); and one of a harness's own jobs, from its card's "Its
 * own jobs" (ADR 0252). Each goes back to the page it was opened from.
 */

import type { ContextOwner } from "@chipschat/core";

export type ContextPage =
  | {
      readonly kind: "file";
      readonly owner: ContextOwner;
      readonly name: string;
      /** Begun from a shared file, to give the agent its own. */
      readonly own: boolean;
    }
  | {
      readonly kind: "harness_page";
      readonly harnessId: string;
      /** The shared file an agent's page opened it for, flashed once. */
      readonly flash?: string | undefined;
    }
  | {
      /** Every harness's card, in the shelf's order (ADR 0185). */
      readonly kind: "harnesses";
    }
  | {
      /** One of a harness's own jobs: its switch, its last fourteen days and its runs (ADR 0252). */
      readonly kind: "job";
      readonly harnessId: string;
      readonly jobId: string;
    };
