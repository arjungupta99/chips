/**
 * The door to a room's project (ADR 0220): who may fetch it and push to it, and what a push that
 * moved it is recorded as.
 *
 * Who may:
 *
 * - **A harness, for one of its agents in the room.** It names the agent in `chips-actor`, as an
 *   event names its actor (ADR 0087): the agent must be the harness's, not deleted, and in the
 *   room now. The push and its event are the agent's.
 * - **A person in the room**, with a project token their device asked for: their own push shows
 *   as theirs. A guest, by their standing in the workspace or in the room, reads the project and
 *   changes nothing: no push and no Undo (SEC-40). A guest has no harness of their own to push
 *   through either (`add-harness.ts`).
 *
 * Anybody else hears that there is no such room, as a read of a room they are not in does. A
 * thread has no project of its own: it is its room's, as its members are.
 *
 * A push into a room's project is taken one at a time, so that where `main` was before it and
 * where it is after are this push's alone. One that moved `main` is recorded as `project.changed`
 * before git's answer ends, and shows no line of its own: the change goes with the reply that made
 * it (ADR 0222). A push
 * may take the project up to `limits.maxProjectBytes`, and no file in it may be over the
 * workspace's cap for files (ADR 0047).
 */

import { attachmentCap, formatLimit, namesInWords } from "@chipschat/protocol";
import type { Principal } from "../ports/identity.js";
import type { Clock, EventStore, IdGenerator, ReadModels } from "../ports/index.js";
import type { ProjectRequest, ProjectStore, Served, Undone } from "../ports/projects.js";

/** What a person's Undo did (ADR 0222): the change it made, or why it made none, in words. */
export type UndoAnswer =
  | { readonly ok: true; readonly after: string }
  | {
      readonly ok: false;
      readonly kind: "not_found" | "forbidden" | "conflict" | "unavailable";
      readonly message: string;
    };

/**
 * An Undo's commit message, from the subject of the change it takes back: `Undid "…"`, and an Undo
 * of an Undo is Put it back's, `Put back "…"`.
 */
export function undoMessage(subject: string): string {
  const undid = /^Undid "(.*)"$/.exec(subject);
  if (undid !== null) return `Put back "${undid[1]}"`;
  const putBack = /^Put back "(.*)"$/.exec(subject);
  return `Undid "${putBack === null ? subject : putBack[1]}"`;
}

type Refused = Extract<UndoAnswer, { readonly ok: false }>;

const NOT_IN_PROJECT: Refused = {
  ok: false,
  kind: "not_found",
  message: "That change isn't in the space's project.",
};

/** What a guest is told when they would change the project: a push, or an Undo (SEC-40). */
const GUEST_WRITES: Readonly<Record<ProjectWrite, string>> = {
  push: "A guest can read the project but can't change it. Ask an agent in the space.",
  undo: "A guest can't undo a change. Ask the space's owner.",
};

/** The two ways a person changes a room's project: a push from their copy, and an Undo. */
export type ProjectWrite = "push" | "undo";

/**
 * Who may not undo: anybody but a person, and a guest of the workspace, who may read the project.
 * A member who is a guest in the room is turned away at the door (`admit`), in the same words.
 */
function undoRefused(principal: Principal): Refused | undefined {
  if (principal.kind !== "person")
    return { ok: false, kind: "forbidden", message: "Only a person undoes a change." };
  if (principal.role === "guest")
    return { ok: false, kind: "forbidden", message: GUEST_WRITES.undo };
  return undefined;
}

/** Why git took nothing back, in words. */
function undoFailed(undone: Exclude<Undone, { readonly state: "done" }>): Refused {
  switch (undone.state) {
    case "not_on_main":
      return NOT_IN_PROJECT;
    case "clash":
      return {
        ok: false,
        kind: "conflict",
        message: `${namesInWords(undone.files) || "A file"} changed again after this, on the same lines, so it can't be undone by itself. Ask the agents to take it out.`,
      };
    case "unsupported":
      return { ok: false, kind: "unavailable", message: undone.why };
  }
}

export interface ProjectDoorDeps {
  /** The repositories, or nothing when this machine has no git for them. */
  readonly projects: ProjectStore | undefined;
  /** Why there are none, in the words a person or a bridge is told. */
  readonly unavailable?: string | undefined;
  readonly store: Pick<EventStore, "append">;
  readonly readModels: Pick<
    ReadModels,
    "space" | "participant" | "spacesForMember" | "attachmentCaps" | "workspaceRole" | "memberRole"
  >;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly limits: { readonly maxAttachmentBytes: number; readonly maxProjectBytes: number };
  /** Told of a push whose record could not be written, so the log says so. */
  readonly onUnrecorded?: (spaceId: string, error: unknown) => void;
}

/** Who a project request is from, once the door has let it in. */
export interface ProjectVisitor {
  readonly workspaceId: string;
  /** The room whose project it is: the one named, or the room a thread grew in. */
  readonly spaceId: string;
  readonly actor:
    | { readonly kind: "agent"; readonly id: string; readonly harnessId: string }
    | {
        readonly kind: "person";
        readonly id: string;
      };
}

export type ProjectRefusal = {
  readonly kind: "not_found" | "forbidden" | "unavailable";
  readonly message: string;
};

type Admitted = { ok: true; value: ProjectVisitor } | { ok: false; error: ProjectRefusal };

const refuse = (kind: ProjectRefusal["kind"], message: string): Admitted => ({
  ok: false,
  error: { kind, message },
});

/** Not there, and not yours, are one answer: a door is no way to learn which rooms exist. */
const NO_SUCH_ROOM = "You are in no space with that id.";

/** Whether git is asked to take a push: its offer of what the project has, or the push itself. */
export function isPushRequest(method: string, rest: string, query: string): boolean {
  if (method === "POST") return rest === "/git-receive-pack";
  return rest === "/info/refs" && new URLSearchParams(query).get("service") === "git-receive-pack";
}

const NAME_THE_AGENT =
  "Name the agent this is for in the chips-actor header: a space's project is worked on by an agent.";

export function createProjectDoor(deps: ProjectDoorDeps) {
  /** The push going on in each room, which the next one waits for. */
  const pushing = new Map<string, Promise<void>>();

  /** A person in the room, as themselves; a guest, by either standing, for a read alone. */
  async function admitPerson(
    principal: Principal,
    room: string,
    writes: ProjectWrite | undefined,
  ): Promise<Admitted> {
    const { workspaceId, participantId } = principal;
    const mine = await deps.readModels.spacesForMember(workspaceId, participantId);
    if (!mine.includes(room)) return refuse("not_found", NO_SUCH_ROOM);
    if (writes !== undefined && (await isGuestIn(workspaceId, room, participantId))) {
      return refuse("forbidden", GUEST_WRITES[writes]);
    }
    return {
      ok: true,
      value: {
        workspaceId: principal.workspaceId,
        spaceId: room,
        actor: { kind: "person", id: principal.participantId },
      },
    };
  }

  /** A guest of the workspace, or of this room though a member of the workspace. */
  async function isGuestIn(workspaceId: string, room: string, personId: string): Promise<boolean> {
    const [standing, inRoom] = await Promise.all([
      deps.readModels.workspaceRole(workspaceId, personId),
      deps.readModels.memberRole(workspaceId, room, personId),
    ]);
    return standing === "guest" || inRoom === "guest";
  }

  /** A harness, as the agent of its it names, which must be in the room. */
  async function admitAgent(
    principal: Principal,
    room: string,
    actorId: string | undefined,
  ): Promise<Admitted> {
    if (actorId === undefined) return refuse("forbidden", NAME_THE_AGENT);
    const agent = await deps.readModels.participant(principal.workspaceId, actorId);
    if (agent?.kind !== "agent" || agent.harness_id !== principal.participantId) {
      return refuse("forbidden", "A harness works on a project only as one of its own agents.");
    }
    if (agent.removed_at !== null) return refuse("forbidden", "That agent was deleted.");
    const its = await deps.readModels.spacesForMember(principal.workspaceId, agent.id);
    if (!its.includes(room)) {
      return refuse("not_found", `${agent.display_name} is in no space with that id.`);
    }
    return {
      ok: true,
      value: {
        workspaceId: principal.workspaceId,
        spaceId: room,
        actor: { kind: "agent", id: agent.id, harnessId: principal.participantId },
      },
    };
  }

  async function admit(input: {
    readonly principal: Principal;
    readonly spaceId: string;
    /** The agent a harness names, from `chips-actor`. */
    readonly actorId?: string | undefined;
    /** What the visit would change, when it would: a guest is let in to read alone. */
    readonly writes?: ProjectWrite | undefined;
  }): Promise<Admitted> {
    const { principal } = input;
    if (deps.projects === undefined) {
      return refuse("unavailable", deps.unavailable ?? "Projects are off on this server.");
    }
    // Which agent comes first: a harness that names none is told so whichever room it asked for.
    if (principal.kind !== "person" && input.actorId === undefined) {
      return refuse("forbidden", NAME_THE_AGENT);
    }
    const space = await deps.readModels.space(principal.workspaceId, input.spaceId);
    if (space === undefined) return refuse("not_found", NO_SUCH_ROOM);
    const room = space.parent_space_id ?? space.space_id;
    return principal.kind === "person"
      ? admitPerson(principal, room, input.writes)
      : admitAgent(principal, room, input.actorId);
  }

  /** The room's turn to push, once the push before it has gone; the release ends it. */
  async function turnIn(spaceId: string): Promise<() => void> {
    const before = pushing.get(spaceId) ?? Promise.resolve();
    let release = () => {};
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chained = before.then(() => mine);
    pushing.set(spaceId, chained);
    await before;
    return () => {
      release();
      if (pushing.get(spaceId) === chained) pushing.delete(spaceId);
    };
  }

  async function record(
    projects: ProjectStore,
    visitor: ProjectVisitor,
    before: string | null,
    undoes?: string,
  ): Promise<void> {
    const after = await projects.head(visitor.spaceId);
    if (after === null || after === before) return;
    const changed = await projects.changes(visitor.spaceId, before, after);
    const { actor } = visitor;
    await deps.store.append({
      v: 1,
      type: "project.changed",
      id: deps.ids.next("event"),
      ts: deps.clock.nowIso(),
      workspace_id: visitor.workspaceId,
      space_id: visitor.spaceId,
      actor:
        actor.kind === "agent"
          ? { kind: "agent", id: actor.id, harness_id: actor.harnessId }
          : { kind: "person", id: actor.id },
      idempotency_key: `project-${visitor.spaceId}-${after}`,
      by: actor.id,
      before,
      after,
      commits: changed.commits,
      message: changed.message,
      files: changed.files,
      ...(changed.moreFiles > 0 ? { more_files: changed.moreFiles } : {}),
      file_count: changed.fileCount,
      ...(undoes === undefined ? {} : { undoes }),
    });
  }

  /**
   * A person's Undo of one change (ADR 0222): taken back as a new commit of theirs, in the room's
   * turn for pushes, and recorded as a change that `undoes` it. Every later change stays. A guest
   * may read the project and may not undo.
   */
  async function undo(principal: Principal, spaceId: string, commit: string): Promise<UndoAnswer> {
    const projects = deps.projects;
    if (projects === undefined) {
      return {
        ok: false,
        kind: "unavailable",
        message: deps.unavailable ?? "Projects are off on this server.",
      };
    }
    const refused = undoRefused(principal);
    if (refused !== undefined) return refused;
    const admitted = await admit({ principal, spaceId, writes: "undo" });
    if (!admitted.ok)
      return { ok: false, kind: admitted.error.kind, message: admitted.error.message };
    const visitor = admitted.value;
    const release = await turnIn(visitor.spaceId);
    try {
      return await undoNow(projects, visitor, principal, commit);
    } finally {
      release();
    }
  }

  /** The Undo itself, in the room's turn: the change found, taken back, and recorded. */
  async function undoNow(
    projects: ProjectStore,
    visitor: ProjectVisitor,
    principal: Principal,
    commit: string,
  ): Promise<UndoAnswer> {
    const change = await projects.change(visitor.spaceId, commit);
    if (change === undefined) return NOT_IN_PROJECT;
    const undone = await projects.undo(visitor.spaceId, {
      commit: change.commit,
      name: principal.displayName,
      email: `${principal.participantId}@people.chips.invalid`,
      message: undoMessage(change.message.split("\n")[0] ?? ""),
    });
    if (undone.state !== "done") return undoFailed(undone);
    await record(projects, visitor, undone.before, change.commit);
    return { ok: true, after: undone.after };
  }

  /**
   * git's answer to one request. A push waits for the room's turn, is held to what the room has
   * left, and, once git has taken it, is recorded when it moved `main`.
   */
  async function serve(
    visitor: ProjectVisitor,
    request: Omit<ProjectRequest, "spaceId" | "who" | "push">,
  ): Promise<Served> {
    const projects = deps.projects;
    if (projects === undefined) throw new Error("projects are off");
    const asked = { ...request, spaceId: visitor.spaceId, who: visitor.actor.id };
    if (!(request.method === "POST" && request.rest === "/git-receive-pack")) {
      return projects.serve(asked);
    }

    const release = await turnIn(visitor.spaceId);
    try {
      const [before, size, caps] = await Promise.all([
        projects.head(visitor.spaceId),
        projects.sizeOf(visitor.spaceId),
        deps.readModels.attachmentCaps(visitor.workspaceId),
      ]);
      const fileCap = attachmentCap(caps, "file", deps.limits.maxAttachmentBytes);
      const served = await projects.serve({
        ...asked,
        push: {
          fileCap,
          fileCapWords: formatLimit(fileCap),
          bytesLeft: deps.limits.maxProjectBytes - size,
        },
      });
      const recorded = served.done
        .then(() => record(projects, visitor, before))
        .catch((error: unknown) => deps.onUnrecorded?.(visitor.spaceId, error))
        .finally(release);
      // git's answer ends once the push is recorded, so a pusher who has heard "done" can name
      // the change, and anybody reading the room finds it.
      const body = served.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({ flush: () => recorded }),
      );
      return { ...served, body, done: recorded.then(() => served.done) };
    } catch (error) {
      release();
      throw error;
    }
  }

  /**
   * A person's look at the room's project (ADR 0222): the repositories and the room, once they are
   * let in, as the git door lets a person in. A harness reads its project with git.
   */
  async function open(
    principal: Principal,
    spaceId: string,
  ): Promise<
    { ok: true; spaceId: string; projects: ProjectStore } | { ok: false; error: ProjectRefusal }
  > {
    if (principal.kind !== "person") {
      return {
        ok: false,
        error: { kind: "forbidden", message: "A harness reads its space's project with git." },
      };
    }
    const admitted = await admit({ principal, spaceId });
    if (!admitted.ok) return admitted;
    const projects = deps.projects;
    if (projects === undefined) {
      return {
        ok: false,
        error: {
          kind: "unavailable",
          message: deps.unavailable ?? "Projects are off on this server.",
        },
      };
    }
    return { ok: true, spaceId: admitted.value.spaceId, projects };
  }

  return { admit, serve, undo, open };
}

export type ProjectDoor = ReturnType<typeof createProjectDoor>;
