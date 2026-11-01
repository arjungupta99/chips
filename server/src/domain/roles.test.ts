/**
 * What each standing in the workspace may do (ADR 0034), as a table: the rules a route asks
 * before an invite or a token, and `authorize` asks before an event that changes the workspace.
 */

import { describe, expect, it } from "vitest";
import {
  administers,
  isGuest,
  isWorkspaceRole,
  mayAddToSpaces,
  mayInvite,
  mayOpenSpace,
  maySetSpendCeiling,
  outranks,
  refuseRoleChange,
  seesEveryAgent,
  seesWholeDirectory,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from "./roles.js";

describe("the four roles", () => {
  it("are owner, admin, member and guest, in that order of rank", () => {
    expect(WORKSPACE_ROLES).toEqual(["owner", "admin", "member", "guest"]);
    expect(outranks("owner", "admin")).toBe(true);
    expect(outranks("admin", "member")).toBe(true);
    expect(outranks("member", "guest")).toBe(true);
    expect(outranks("guest", "owner")).toBe(false);
    expect(outranks("member", "member")).toBe(false);
  });

  it("are the only words that are a role", () => {
    for (const role of WORKSPACE_ROLES) expect(isWorkspaceRole(role)).toBe(true);
    for (const not of ["", "root", "Owner", 3, null, undefined])
      expect(isWorkspaceRole(not)).toBe(false);
  });

  it.each([
    ["owner", true, false, true, true, true, true, true],
    ["admin", true, false, true, true, true, true, false],
    ["member", false, false, false, true, true, false, false],
    ["guest", false, true, false, false, false, false, false],
    [undefined, false, false, false, true, true, false, false],
  ] as const)(
    "%s: administers %s, guest %s, opens spaces %s, adds to them %s, sees every person %s, every agent %s, sets spend %s",
    (role, admin, guest, opens, adds, sees, agents, spends) => {
      expect(administers(role)).toBe(admin);
      expect(isGuest(role)).toBe(guest);
      expect(mayOpenSpace(role)).toBe(opens);
      expect(mayAddToSpaces(role)).toBe(adds);
      expect(seesWholeDirectory(role)).toBe(sees);
      expect(seesEveryAgent(role)).toBe(agents);
      expect(maySetSpendCeiling(role)).toBe(spends);
    },
  );
});

describe("inviting", () => {
  it("is an owner's alone (ADR 0034's addendum of 14 October 2026)", () => {
    expect(mayInvite("owner")).toBe(true);
    for (const role of ["admin", "member", "guest", undefined] as const) {
      expect(mayInvite(role)).toBe(false);
    }
  });
});

describe("changing a role", () => {
  const change = (
    actor: WorkspaceRole | undefined,
    target: WorkspaceRole,
    to: WorkspaceRole,
    lastOwner = false,
  ) => refuseRoleChange({ actor, target, to, lastOwner });

  it("takes an owner or an admin", () => {
    expect(change("owner", "member", "admin")).toBeUndefined();
    expect(change("admin", "member", "guest")).toBeUndefined();
    expect(change("member", "guest", "member")).toMatch(/only an owner or an admin/);
    expect(change("guest", "member", "guest")).toMatch(/only an owner or an admin/);
    expect(change(undefined, "member", "guest")).toMatch(/only an owner or an admin/);
  });

  it("lets an owner make and unmake owners, and an admin neither", () => {
    expect(change("owner", "member", "owner")).toBeUndefined();
    expect(change("owner", "owner", "member")).toBeUndefined();
    expect(change("admin", "member", "owner")).toMatch(/an admin may not/);
    expect(change("admin", "owner", "member")).toMatch(/an admin may not/);
  });

  it("keeps the last owner", () => {
    expect(change("owner", "owner", "admin", true)).toMatch(/the last owner stays/);
    expect(change("owner", "owner", "admin", false)).toBeUndefined();
  });

  it("refuses a change to what it already is", () => {
    expect(change("owner", "member", "member")).toMatch(/already member/);
  });

  it("makes nobody in more than one space a guest (Gate 5)", () => {
    const demote = (spaces: number) =>
      refuseRoleChange({ actor: "owner", target: "member", to: "guest", lastOwner: false, spaces });
    expect(demote(0)).toBeUndefined();
    expect(demote(1)).toBeUndefined();
    expect(demote(2)).toMatch(/in one space at most, and they are in 2/);
    expect(
      refuseRoleChange({
        actor: "owner",
        target: "guest",
        to: "member",
        lastOwner: false,
        spaces: 3,
      }),
    ).toBeUndefined();
  });
});
