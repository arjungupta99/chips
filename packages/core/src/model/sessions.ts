/** A visit: opened by a harness, renamed as it goes, and ended. */

import { type FoldStep, field, type MutableSpace, sessionOf, spaceOf } from "./state.js";
import type { Session } from "./types.js";

/**
 * The visits, live ones first and then the most recently heard from — which is the order the
 * harness itself delivers a message in, so what the composer promises and what the bridge does
 * are the same sentence.
 */
export function freezeSessions(space: MutableSpace): Session[] {
  return [...space.sessions.values()]
    .map((session) => ({
      sessionRef: session.sessionRef,
      spaceId: session.spaceId,
      harnessId: session.harnessId,
      where: session.where,
      title: session.title,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      endedReason: session.endedReason,
      transcriptRef: session.transcriptRef,
      live: session.endedAt === undefined,
      lastRunId: session.lastRunId,
      lastSeenAt: session.lastSeenAt,
    }))
    .sort((a, b) => {
      if (a.live !== b.live) return a.live ? -1 : 1;
      return b.lastSeenAt.localeCompare(a.lastSeenAt);
    });
}

export const SESSION_FOLDS: Readonly<Record<string, FoldStep>> = {
  // A visit opened here. It may already be known: a run can arrive before the visit that
  // started it, and a harness may report runs without ever opening a visit for them.
  "session.started": (state, event) => {
    const space = spaceOf(state, event);
    const session = sessionOf(space, event, field<string>(event, "session_ref"));
    if (session === undefined) return;
    session.startedAt = event.ts;
    session.where = field<string>(event, "where") ?? session.where;
    session.transcriptRef = field<string>(event, "transcript_ref") ?? session.transcriptRef;
    // A visit that is started again after it ended is open again, whatever it said last time.
    session.endedAt = undefined;
    session.endedReason = undefined;
  },

  // What the visit is called, as the harness now calls it. A name changes as a session moves on,
  // and the latest is the one shown: the label says which terminal a line came from, not what
  // that terminal was called at the time.
  "session.renamed": (state, event) => {
    const space = spaceOf(state, event);
    const session = sessionOf(space, event, field<string>(event, "session_ref"));
    if (session === undefined) return;
    session.title = field<string>(event, "title") ?? session.title;
  },

  // The visit is over; the space, its history and anything still waiting all stay.
  "session.ended": (state, event) => {
    const space = spaceOf(state, event);
    const session = sessionOf(space, event, field<string>(event, "session_ref"));
    if (session === undefined) return;
    session.endedAt = event.ts;
    session.endedReason = field<string>(event, "ended_reason");
  },
};
