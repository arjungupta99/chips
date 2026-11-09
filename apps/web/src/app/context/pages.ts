/**
 * The pages that open over the Agents tab on the desktop: one file of an agent's or of its
 * harness's own set, in the editor or to read (ADR 0135); a harness's page, which a tile on the
 * shelf opens, and the pages it opens in turn (ADR 0254), its context files flashing the shared
 * file an agent's page sent the reader to; every harness's card, from View all under the shelf (ADR
 * 0185); and one of a harness's own jobs, from its page's "Its own jobs" (ADR 0252). Each goes back
 * to the page it was opened from.
 */

import type { ContextOwner } from "@chipschat/core";
import { createContext } from "react";
import type { HarnessPart } from "../harness/parts.ts";

export type ContextPage =
  | {
      /** An agent's page, its card (ADR 0087, 0270), over what opened it. */
      readonly kind: "agent";
      readonly agentId: string;
    }
  | {
      /** An agent's message history, which its card's Message history row opens (ADR 0270). */
      readonly kind: "agent_history";
      readonly agentId: string;
    }
  | {
      readonly kind: "file";
      readonly owner: ContextOwner;
      readonly name: string;
      /** Begun from a shared file, to give the agent its own. */
      readonly own: boolean;
    }
  | {
      /** An agent's Permissions (ADR 0286), which its card's row and its band in a room open. */
      readonly kind: "agent_permissions";
      readonly agentId: string;
    }
  | {
      /** An agent's face, chosen on a page over its card (ADR 0272), its Icon row's. */
      readonly kind: "agent_face";
      readonly agentId: string;
    }
  | {
      readonly kind: "harness_page";
      readonly harnessId: string;
      /** The shared file an agent's page opened it for, flashed once. */
      readonly flash?: string | undefined;
      /** Opened for a new agent of it, from Connect's card for one here already: its dialog opens. */
      readonly newAgent?: boolean | undefined;
    }
  | {
      /**
       * One of the pages a harness's page opens (ADR 0254): all of its agents, its context files,
       * When it asks you, or its recent runs.
       */
      readonly kind: "harness_part";
      readonly harnessId: string;
      readonly part: HarnessPart;
      /** On its context files: the shared file an agent's page opened them for, flashed once. */
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

/**
 * Which page this is, for the page that turns to it (`Turns`): a page with the same name is the same
 * page drawn again, and one with another turns.
 */
export function pageName(page: ContextPage): string {
  switch (page.kind) {
    case "agent":
    case "agent_history":
    case "agent_permissions":
    case "agent_face":
      return `${page.kind} ${page.agentId}`;
    case "file":
      return `file ${page.owner.kind} ${page.owner.id} ${page.name}`;
    case "harness_page":
      return `harness_page ${page.harnessId}`;
    case "harness_part":
      return `harness_part ${page.harnessId} ${page.part}`;
    case "harnesses":
      return "harnesses";
    case "job":
      return `job ${page.harnessId} ${page.jobId}`;
  }
}

/**
 * The page open in the second column beside the Agents list (ADR 0284): its row or tile in the list
 * wears the chosen ground, as the iPad's does.
 */
export const OpenedPage = createContext<ContextPage | undefined>(undefined);
