/**
 * A person's standing in the workspace (ADR 0034): owner, admin, member or guest. Pure rules
 * about what each may do to the workspace itself; `authorize` asks them for the events that
 * change it, and the routes ask them for the things that are not events — an invite, a token.
 *
 * The rank is what most of the rules come down to. An owner does everything; an admin does
 * everything but touch an owner, make one, or invite anybody; a member works in the spaces they are
 * added to — adds people to them, adds harnesses, and puts their own harnesses' agents in them —
 * and opens none of their own (ADR 0196), and is told every person but only the agents in their
 * spaces and their own (ADR 0034's addendum); a guest is in one space at most and changes nothing about the workspace.
 */

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member", "guest"];

const RANK: Readonly<Record<WorkspaceRole, number>> = { owner: 3, admin: 2, member: 1, guest: 0 };

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

/** An owner or an admin: somebody who runs the workspace rather than just working in it. */
export function administers(role: WorkspaceRole | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** A guest is in one space at most and changes nothing about the workspace. */
export function isGuest(role: WorkspaceRole | undefined): boolean {
  return role === "guest";
}

/**
 * Whether `role` may issue an invite, see the open ones and withdraw one: an owner's alone, for
 * any role (his call of 14 October 2026, ADR 0034's addendum). An admin changes roles and removes
 * people, and lets nobody in.
 */
export function mayInvite(role: WorkspaceRole | undefined): boolean {
  return role === "owner";
}

/**
 * Whether `role` may name the workspace again (ADR 0194): an owner's alone, as inviting is. The
 * name is what everybody in it, and everybody invited to it, knows it by.
 */
export function mayRenameWorkspace(role: WorkspaceRole | undefined): boolean {
  return role === "owner";
}

/**
 * Whether `role` may open a space: an owner's or an admin's (his call of 18 October 2026, ADR
 * 0196). A space a member opened would be answered by the workspace's agents, on the owner's
 * computer and account; a member is added to the spaces they work in.
 */
export function mayOpenSpace(role: WorkspaceRole | undefined): boolean {
  return administers(role);
}

/** A guest adds nobody to a space; everyone else adds people and agents to the ones they're in. */
export function mayAddToSpaces(role: WorkspaceRole | undefined): boolean {
  return !isGuest(role);
}

/**
 * Whether `role` may set what a room allows a job (ADR 0117): the owner's alone (his call of 18
 * October 2026, ADR 0196), since a job is paid for on the owner's account. Anybody else in the
 * room but a guest sees the amount.
 */
export function maySetSpendCeiling(role: WorkspaceRole | undefined): boolean {
  return role === "owner";
}

/**
 * Whether `role` is told who every person in the workspace is: anybody but a guest, who is told
 * only whom they share a space with, as a harness is. A member adds people to the spaces they're
 * in, and cannot add whom they cannot name (M3.3).
 */
export function seesWholeDirectory(role: WorkspaceRole | undefined): boolean {
  return !isGuest(role);
}

/**
 * Whether `role` is told every agent in the workspace: an owner's or an admin's, who may move,
 * archive or delete any of them (his call of 19 October 2026, ADR 0034's addendum). A member is
 * told the agents in their spaces and those of a harness they own, as a guest is: the agents run
 * on the owner's computer and account, and a member could do nothing with the rest but read what
 * they were called and when they were busy.
 */
export function seesEveryAgent(role: WorkspaceRole | undefined): boolean {
  return administers(role);
}

export interface RoleChange {
  readonly actor: WorkspaceRole | undefined;
  readonly target: WorkspaceRole;
  readonly to: WorkspaceRole;
  /** True when the target is the only owner left, who cannot be demoted. */
  readonly lastOwner: boolean;
  /** How many spaces the target is in: a guest is in one at most (Gate 5). Absent means none. */
  readonly spaces?: number | undefined;
}

/**
 * Why a role change is refused, or nothing when it may go ahead: only an owner or admin changes
 * a role; an admin neither touches an owner nor makes one; the last owner stays; somebody in
 * more than one space is not made a guest, since a guest is in one at most; and a change to
 * what it already is changes nothing.
 */
export function refuseRoleChange(change: RoleChange): string | undefined {
  if (!administers(change.actor)) return "only an owner or an admin changes a person's role";
  if (change.actor === "admin" && (change.target === "owner" || change.to === "owner")) {
    return "an admin may not change an owner's role, or make one";
  }
  if (change.target === "owner" && change.to !== "owner" && change.lastOwner) {
    return "the last owner stays an owner until there is another";
  }
  if (change.target === change.to) return `they are already ${change.to}`;
  if (change.to === "guest" && (change.spaces ?? 0) > 1) {
    return `a guest is in one space at most, and they are in ${change.spaces}: remove them from the others first`;
  }
  return undefined;
}

/** Strictly above: an owner outranks an admin, an admin a member, a member a guest. */
export function outranks(a: WorkspaceRole, b: WorkspaceRole): boolean {
  return RANK[a] > RANK[b];
}
