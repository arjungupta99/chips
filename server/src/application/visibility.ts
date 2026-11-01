/**
 * Who may see an event (phase-0-review finding 6): the rule itself is the protocol's
 * (`@chipschat/protocol`, `visibility.ts`), where the conformance fake reads the same one. The live
 * path asks it of each event; the replay path builds the same rule as a SQL predicate (see the
 * event store), from the sets named here.
 */

export type { Viewer } from "@chipschat/protocol";
export {
  APPROVER_EVENTS,
  ASK_EVENTS,
  canSee,
  DIRECTORY_EVENTS,
  FACE_EVENTS,
  FORK_EVENTS,
  HELD_EVENTS,
  JOIN_EVENTS,
  LOCK_EVENTS,
  MEMBERSHIP_EVENTS,
  namesApprover,
  namesViewer,
  opensFor,
  opensThreadIn,
  SELF_EVENTS,
  WHEREABOUTS_EVENTS,
} from "@chipschat/protocol";
