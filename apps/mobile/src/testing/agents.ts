/**
 * A workspace with agents in it, for the Agents tab's tests (ADR 0087, Phase 5): J in its Main
 * room, Shopping working in its own, two of OpenClaw's in Hello and in the room it opened with
 * you, a free one with a word waiting, and two archived — one in a room you can read, one in a
 * room you left.
 */

import type { AgentStay, Line, Snapshot } from "@chipschat/core";

export const ME = "usr_arjun";

const line = (over: Partial<Line> & Pick<Line, "id" | "seq" | "text" | "authorId">): Line => ({
  kind: "text",
  authorKind: over.authorId.startsWith("usr_") ? "person" : "harness",
  ts: "2026-09-13T13:54:00.000Z",
  ...over,
});

const space = (id: string, title: string | undefined, members: string[], extra = {}) => ({
  id,
  ...(title === undefined ? {} : { title }),
  kind: "group",
  members,
  roles: {},
  state: "open",
  lastEventSeq: 0,
  lines: [],
  runs: [],
  ...extra,
});

export function agentsSnapshot(): Snapshot {
  return {
    connection: "open",
    link: "direct",
    // The server has said who is who: the Agents tab lists them (`agentsLook`).
    directoryFrom: "server",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    spaceIcons: new Map(),
    directory: {
      [ME]: { id: ME, kind: "person", displayName: "Arjun" },
      hrn_jacobian: { id: "hrn_jacobian", kind: "harness", displayName: "Jacobian", ownerId: ME },
      hrn_openclaw: { id: "hrn_openclaw", kind: "harness", displayName: "OpenClaw", ownerId: ME },
      agt_j: {
        id: "agt_j",
        kind: "agent",
        harnessId: "hrn_jacobian",
        displayName: "J",
        lead: true,
        room: "spc_j",
      },
      agt_shopping: {
        id: "agt_shopping",
        kind: "agent",
        harnessId: "hrn_jacobian",
        displayName: "Shopping",
        room: "spc_shopping",
      },
      agt_main: {
        id: "agt_main",
        kind: "agent",
        harnessId: "hrn_openclaw",
        displayName: "OpenClaw",
        room: "spc_hello",
      },
      agt_direct: {
        id: "agt_direct",
        kind: "agent",
        harnessId: "hrn_openclaw",
        displayName: "OpenClaw",
        room: "spc_direct",
      },
      agt_bland: {
        id: "agt_bland",
        kind: "agent",
        harnessId: "hrn_jacobian",
        displayName: "Bland Pricing",
        room: null,
        held: 1,
      },
      agt_chess: {
        id: "agt_chess",
        kind: "agent",
        harnessId: "hrn_jacobian",
        displayName: "Chess Game",
        archived: true,
        room: null,
        releasedFrom: "spc_chess",
      },
      agt_researcher: {
        id: "agt_researcher",
        kind: "agent",
        harnessId: "hrn_jacobian",
        displayName: "Researcher",
        archived: true,
        room: null,
        releasedFrom: "spc_gone",
      },
    },
    model: {
      needsYou: [],
      lanes: [],
      fleet: [],
      harnesses: {},
      connections: {},
      audit: [],
      people: { [ME]: { participantId: ME, displayName: "Arjun", role: "owner" } },
      spaces: [
        space("spc_j", "J", [ME, "agt_j"], {
          home: true,
          lastActivityAt: "2026-09-30T15:38:00.000Z",
        }),
        space("spc_shopping", "Shopping", [ME, "agt_shopping"], {
          lastActivityAt: "2026-09-30T15:41:00.000Z",
          runs: [
            {
              runId: "run_1",
              spaceId: "spc_shopping",
              harnessId: "agt_shopping",
              state: "running",
            },
          ],
        }),
        space("spc_hello", "Hello", [ME, "agt_main"], {
          lastActivityAt: "2026-09-30T21:45:00.000Z",
        }),
        space("spc_direct", undefined, [ME, "agt_direct"], {
          kind: "direct",
          lastActivityAt: "2026-09-30T15:40:00.000Z",
        }),
        space("spc_chess", "Chess Game", [ME], {
          state: "closed",
          lastActivityAt: "2026-09-20T06:58:00.000Z",
          lines: [
            line({
              id: "l1",
              seq: 10,
              text: "Send me a screenshot of the chess game",
              authorId: ME,
            }),
            line({
              id: "l2",
              seq: 11,
              text: "Screenshot captured and attached.",
              authorId: "agt_chess",
              ts: "2026-09-13T15:26:00.000Z",
            }),
            line({
              id: "l3",
              seq: 12,
              text: "A space notice",
              authorId: "agt_chess",
              kind: "system",
            }),
          ],
        }),
      ],
    },
  } as unknown as Snapshot;
}

/** What the server says of Chess Game: its own room, 5–20 September, and a room you're not in. */
export const CHESS_STAYS: readonly AgentStay[] = [
  {
    readable: true,
    spaceId: "spc_chess",
    fromSeq: 1,
    toSeq: 40,
    from: "2026-09-05T18:00:00.000Z",
    to: "2026-09-20T18:00:00.000Z",
    lines: 2,
  },
  { readable: false, from: "2026-09-22T10:00:00.000Z", to: "2026-09-23T10:00:00.000Z", lines: 2 },
];
