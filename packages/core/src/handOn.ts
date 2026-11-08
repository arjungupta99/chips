/**
 * Who an ask may be handed to (M5.5), as a card lists them: the people in its space, then the
 * workspace's people who are not in it (being named is standing enough, ADR 0042), then the
 * standings: the admins, the owners, anyone in the space, the lane's lead.
 *
 * A standing is listed only when it reaches somebody other than the one handing it on (6 November
 * 2026). In a space of one person and an agent, The admins named nobody and the server refused it,
 * The owners and Anyone in the space named only the reader, and The lane's lead was offered on a
 * run that was no lane's. The server resolves the standings the same way (`approverRefIds`): a
 * role is the space's or the workspace's, and anyone leaves out guests.
 */

import type { Directory } from "./events.js";
import { nameOf } from "./events.js";
import type { PersonModel, Space, WorkspaceModel } from "./model/types.js";

export interface HandChoice {
  /** What the hand-on names: a person's id, `role:admin`, `role:owner`, `any` or `lead`. */
  readonly value: string;
  readonly label: string;
  /** Somebody in the workspace who is not in the space. */
  readonly elsewhere?: true | undefined;
}

export interface HandOnFacts {
  readonly directory: Directory;
  readonly space: Pick<Space, "members" | "roles"> | undefined;
  readonly people: Readonly<Record<string, PersonModel>>;
  readonly selfId: string;
  /** Whether the ask's run works a lane, so that it has a lead to be handed to. */
  readonly lane: boolean;
}

export function handChoices(facts: HandOnFacts): readonly HandChoice[] {
  const { directory, space, people, selfId } = facts;
  const members = space?.members ?? [];
  const here = members.filter((id) => id !== selfId && directory[id]?.kind === "person");
  const elsewhere = Object.values(people).filter(
    (person) =>
      person.role !== "guest" &&
      person.participantId !== selfId &&
      !members.includes(person.participantId),
  );
  const holds = (id: string, role: string) =>
    space?.roles[id] === role || people[id]?.role === role;
  const guest = (id: string) => holds(id, "guest");
  const standings: readonly (readonly [HandChoice, boolean])[] = [
    [{ value: "role:admin", label: "The admins" }, here.some((id) => holds(id, "admin"))],
    [{ value: "role:owner", label: "The owners" }, here.some((id) => holds(id, "owner"))],
    [{ value: "any", label: "Anyone in the space" }, here.some((id) => !guest(id))],
    [{ value: "lead", label: "The lane's lead" }, facts.lane],
  ];
  return [
    ...here.map((id) => ({ value: id, label: nameOf(directory, id) })),
    ...elsewhere.map((person) => ({
      value: person.participantId,
      label: person.displayName,
      elsewhere: true as const,
    })),
    ...standings.filter(([, reaches]) => reaches).map(([choice]) => choice),
  ];
}

/** Whether a run works a lane: the specialist's run of one the model knows. */
export function runIsLane(model: Pick<WorkspaceModel, "lanes">, runId: string): boolean {
  return model.lanes.some((lane) => lane.runId === runId);
}
