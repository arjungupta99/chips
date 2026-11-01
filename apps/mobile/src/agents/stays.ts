/**
 * The rooms an agent has been in, read from the server (`GET /v1/agents/:id/stays`): its card's
 * dates and its history's dividers. Read when the card or the history opens, and again when the
 * agent moves, which the directory says; the lines under each divider are the rooms' own here.
 */

import type { AgentStay, Store } from "@chipschat/core";
import { useEffect, useState } from "react";

export interface Stays {
  /** Undefined until the server answers. */
  readonly stays: readonly AgentStay[] | undefined;
  /** Why the server didn't, in words worth reading. */
  readonly failed: string | undefined;
}

export function useStays(store: Store, agentId: string, room: string | null | undefined): Stays {
  const [read, setRead] = useState<Stays>({ stays: undefined, failed: undefined });
  // The room is a dependency it doesn't read: a move reads the stays again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the agent moves.
  useEffect(() => {
    let live = true;
    store.agentStays(agentId).then(
      (stays) => {
        if (live) setRead({ stays, failed: undefined });
      },
      (error: unknown) => {
        if (live) setRead((was) => ({ stays: was.stays, failed: notRead(error) }));
      },
    );
    return () => {
      live = false;
    };
  }, [store, agentId, room]);
  return read;
}

/** An old server says so plainly; anything else is the server's own words. */
function notRead(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) {
    return "This server is older than the app, and can't say where an agent has been yet.";
  }
  return said === "" ? "The server didn't say where it has been." : said;
}
