/**
 * Who may remove a harness (ADR 0078) or a person (ADR 0160), and what the sheet that asks first
 * says; and what deleting your own account says (ADR 0243).
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import { buildModel, type Space, type WorkspaceModel } from "./model.js";
import {
  deleteAccountSheet,
  deleteAccountTyped,
  harnessesOf,
  mayPairFor,
  mayRemoveHarness,
  mayRemovePerson,
  maySignOutDevicesOf,
  pairAsChoices,
  pairedAsWords,
  removeAsking,
  removePersonAsking,
} from "./removal.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const PRIYA = "usr_01K4ZQPX0000000000000PRIYA";
const VENDOR = "usr_01K4ZQPX000000000000VENDOR";
const SCOUT = "hrn_01K4ZQPX000000000000SCOUT";
const GONE = "hrn_01K4ZQPX0000000000000GONE";

/** Scout, owned by whoever is named. */
const scout = (ownerId: string) =>
  ({ id: SCOUT, kind: "harness", displayName: "Scout", ownerId }) as const;

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [SCOUT]: scout(DANA),
  [GONE]: {
    id: GONE,
    kind: "harness",
    displayName: "Gone",
    ownerId: DANA,
    removedAt: "2026-09-27T10:00:00.000Z",
  },
};

const model = buildModel(
  Object.entries({
    [ARJUN]: "owner",
    [DANA]: "member",
    [PRIYA]: "admin",
    [VENDOR]: "guest",
  }).map(([id, role], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: "2026-09-27T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

describe("who may remove a harness", () => {
  it("is its owner, or an owner or admin of the workspace", () => {
    expect(mayRemoveHarness(model, directory, SCOUT, DANA)).toBe(true);
    expect(mayRemoveHarness(model, directory, SCOUT, ARJUN)).toBe(true);
    expect(mayRemoveHarness(model, directory, SCOUT, PRIYA)).toBe(true);
  });

  it("is not a member who does not own it, nor a guest", () => {
    const others: Directory = { ...directory, [SCOUT]: scout(ARJUN) };
    expect(mayRemoveHarness(model, others, SCOUT, DANA)).toBe(false);
    // A guest who somehow owns one still changes nothing about the workspace.
    const theirs: Directory = { ...directory, [SCOUT]: scout(VENDOR) };
    expect(mayRemoveHarness(model, theirs, SCOUT, VENDOR)).toBe(false);
  });

  it("is nobody's for a harness removed already, a person, or an id nobody has", () => {
    expect(mayRemoveHarness(model, directory, GONE, ARJUN)).toBe(false);
    expect(mayRemoveHarness(model, directory, DANA, ARJUN)).toBe(false);
    expect(mayRemoveHarness(model, directory, "hrn_nobody", ARJUN)).toBe(false);
  });
});

describe("the sheet that asks first", () => {
  it("names the harness, says what goes and what stays, and is answered Remove", () => {
    const asking = removeAsking("Scout");
    expect(asking.title).toBe("Remove Scout?");
    expect(asking.body).toMatch(/tokens are withdrawn/);
    expect(asking.body).toMatch(/What Scout said stays/);
    expect(asking.note).toMatch(/archived or deleted/);
    expect(asking.confirm).toBe("Remove");
  });
});

describe("who may remove a person (ADR 0160)", () => {
  it("is an owner or an admin, and an admin never an owner", () => {
    expect(mayRemovePerson(model, DANA, ARJUN)).toBe(true);
    expect(mayRemovePerson(model, PRIYA, ARJUN)).toBe(true);
    expect(mayRemovePerson(model, DANA, PRIYA)).toBe(true);
    expect(mayRemovePerson(model, ARJUN, PRIYA)).toBe(false);
  });

  it("is nobody for themselves, a member, a guest, or somebody not here", () => {
    expect(mayRemovePerson(model, ARJUN, ARJUN)).toBe(false);
    expect(mayRemovePerson(model, VENDOR, DANA)).toBe(false);
    expect(mayRemovePerson(model, DANA, VENDOR)).toBe(false);
    expect(mayRemovePerson(model, "usr_nobody", ARJUN)).toBe(false);
  });
});

describe("the sheet that asks before a person is removed", () => {
  it("says it is everywhere at once, which harnesses become yours, what stays, and the way back", () => {
    const asking = removePersonAsking({
      name: "Dana",
      workspace: "Demo",
      harnesses: harnessesOf(directory, DANA),
    });
    expect(asking.title).toBe("Remove Dana from Demo?");
    expect(asking.body).toBe(
      "Dana is signed out on every device now and taken out of every space. Scout becomes yours. What Dana said stays where it was said.",
    );
    expect(asking.note).toBe("To come back, Dana needs a new invite.");
    expect(asking.confirm).toBe("Remove");
  });

  it("names several harnesses as a list, and none when there are none", () => {
    const two = removePersonAsking({ name: "Dana", workspace: "Demo", harnesses: ["A", "B", "C"] });
    expect(two.body).toContain(" A, B and C become yours.");
    const none = removePersonAsking({ name: "Dana", workspace: "Demo", harnesses: [] });
    expect(none.body).not.toContain("yours");
  });
});

describe("who may sign out a person's device (ADR 0236)", () => {
  it("is themselves, an owner for anybody, and an admin for anybody but an owner", () => {
    expect(maySignOutDevicesOf(model, DANA, DANA)).toBe(true);
    expect(maySignOutDevicesOf(model, DANA, ARJUN)).toBe(true);
    expect(maySignOutDevicesOf(model, PRIYA, ARJUN)).toBe(true);
    expect(maySignOutDevicesOf(model, DANA, PRIYA)).toBe(true);
    expect(maySignOutDevicesOf(model, VENDOR, PRIYA)).toBe(true);
  });

  it("is never a member or a guest for somebody else, an admin for an owner, or somebody not here", () => {
    expect(maySignOutDevicesOf(model, ARJUN, DANA)).toBe(false);
    expect(maySignOutDevicesOf(model, DANA, VENDOR)).toBe(false);
    expect(maySignOutDevicesOf(model, ARJUN, PRIYA)).toBe(false);
    expect(maySignOutDevicesOf(model, "usr_nobody", ARJUN)).toBe(false);
  });
});

describe("who may pair a new phone for a person (ADR 0206)", () => {
  it("is an owner, for anybody else here", () => {
    expect(mayPairFor(model, DANA, ARJUN)).toBe(true);
    expect(mayPairFor(model, PRIYA, ARJUN)).toBe(true);
    expect(mayPairFor(model, VENDOR, ARJUN)).toBe(true);
  });

  it("is never an admin, a member, themselves, or somebody not here", () => {
    expect(mayPairFor(model, DANA, PRIYA)).toBe(false);
    expect(mayPairFor(model, ARJUN, DANA)).toBe(false);
    expect(mayPairFor(model, ARJUN, ARJUN)).toBe(false);
    expect(mayPairFor(model, "usr_nobody", ARJUN)).toBe(false);
  });

  it("offers an owner themselves first, then everyone else here by name; anyone else, only themselves", () => {
    const named: Directory = {
      ...directory,
      [PRIYA]: { id: PRIYA, kind: "person", displayName: "Priya" },
      [VENDOR]: { id: VENDOR, kind: "person", displayName: "Avery" },
    };
    expect(pairAsChoices(model, named, ARJUN).map((each) => each.name)).toEqual([
      "Arjun",
      "Avery",
      "Dana",
      "Priya",
    ]);
    expect(pairAsChoices(model, named, ARJUN)[0]?.label).toBe("Arjun (you)");
    expect(pairAsChoices(model, named, PRIYA)).toEqual([
      { id: PRIYA, name: "Priya", label: "Priya (you)" },
    ]);
    // An owner nobody named yet is "You", once.
    const unnamed: Directory = {
      ...named,
      [ARJUN]: { id: ARJUN, kind: "person", displayName: "You" },
    };
    expect(pairAsChoices(model, unnamed, ARJUN)[0]?.label).toBe("You");
  });

  it("says whom the device will be", () => {
    const choices = [
      { id: ARJUN, name: "Arjun" },
      { id: DANA, name: "Dana" },
    ];
    expect(pairedAsWords(choices, ARJUN)).toBe(
      "It is paired as you, as if you had scanned your code with it.",
    );
    expect(pairedAsWords(choices, DANA)).toBe(
      "It is paired as Dana, with their spaces and everything they said: for Dana's new phone.",
    );
  });
});

describe("what deleting your own account says (ADR 0243)", () => {
  /** The same four people, with whoever is named an owner too, and the reader in some rooms. */
  const withOwners = (owners: readonly string[], rooms: readonly (readonly string[])[] = []) => {
    const built = buildModel(
      [ARJUN, DANA, PRIYA, VENDOR].map((id, index) => ({
        seq: index + 1,
        type: "person.joined",
        id: `evt_${index + 1}`,
        ts: "2026-09-27T00:00:00.000Z",
        workspace_id: "ws_1",
        actor: { kind: "person", id },
        participant_id: id,
        display_name: id,
        role: owners.includes(id) ? "owner" : id === PRIYA ? "admin" : "member",
      })),
    );
    const spaces = rooms.map(
      (members, index) => ({ id: `sp_${index}`, members }) as unknown as Space,
    );
    return { ...built, spaces } as WorkspaceModel;
  };
  const sheet = (
    model: WorkspaceModel,
    selfId: string,
    extra: Partial<Directory> = {},
    devices?: number,
  ) =>
    deleteAccountSheet({
      model,
      directory: { ...directory, ...extra } as Directory,
      selfId,
      workspace: "My Spaces",
      devices,
    });

  it("says what goes and what stays for a member, and names the owner their harness goes to", () => {
    const model = withOwners([ARJUN], [[DANA, ARJUN], [DANA], [ARJUN]]);
    const face = { [DANA]: { ...directory[DANA], face: { icon: "", ground: 2 } } } as Directory;
    expect(sheet(model, DANA, face, 2)).toEqual({
      kind: "delete",
      title: "Delete your account",
      lead: "You leave My Spaces for good.",
      goes: ["Your 2 devices and their sign-ins, and push to them", "Your face"],
      stays: [
        "What you said, in its 2 spaces, under your name",
        "Scout, which you connected: it goes to Arjun",
      ],
      typed: "My Spaces",
      placeholder: "Type My Spaces to delete",
      confirm: "Delete your account",
    });
  });

  it("says this device alone, or devices uncounted, and leaves out a face never chosen", () => {
    const model = withOwners([ARJUN], [[PRIYA]]);
    const one = sheet(model, PRIYA, {}, 1);
    expect(one.kind === "delete" && one.goes).toEqual([
      "This device and its sign-in, and push to it",
    ]);
    expect(one.kind === "delete" && one.stays).toEqual([
      "What you said, in its space, under your name",
    ]);
    const unread = sheet(model, PRIYA);
    expect(unread.kind === "delete" && unread.goes[0]).toBe(
      "Your devices and their sign-ins, and push to them",
    );
  });

  it("tells the only owner how the workspace is deleted, rather than offering to", () => {
    const alone = sheet(withOwners([ARJUN]), ARJUN);
    expect(alone.kind).toBe("only_owner");
    expect(alone).toMatchObject({ title: "You own My Spaces" });
    expect(alone.kind === "only_owner" && alone.body).toContain("chips uninstall --remove-data");
    // A removed owner leaves nobody to hand on to.
    const gone = {
      [DANA]: { ...directory[DANA], removedAt: "2026-10-01T00:00:00.000Z" },
    } as Directory;
    expect(sheet(withOwners([ARJUN, DANA]), ARJUN, gone).kind).toBe("only_owner");
  });

  it("lets an owner go while another stays, with their invites, and says an owner when there are several", () => {
    const two = sheet(withOwners([ARJUN, DANA]), DANA, {}, 1);
    expect(two.kind === "delete" && two.goes).toEqual([
      "This device and its sign-in, and push to it",
      "The invites you made",
    ]);
    expect(two.kind === "delete" && two.stays.at(-1)).toBe(
      "Scout, which you connected: it goes to Arjun",
    );
    const three = sheet(withOwners([ARJUN, DANA, VENDOR]), DANA);
    expect(three.kind === "delete" && three.stays.at(-1)).toBe(
      "Scout, which you connected: it goes to an owner",
    );
  });

  it("wakes Delete for the workspace's name as a person types it, and for nothing else", () => {
    expect(deleteAccountTyped("My Spaces", "My Spaces")).toBe(true);
    expect(deleteAccountTyped("  my   spaces ", "My Spaces")).toBe(true);
    expect(deleteAccountTyped("My Space", "My Spaces")).toBe(false);
    expect(deleteAccountTyped("", "")).toBe(false);
  });
});
