/**
 * The workspace's people as You and a room's sheet draw them (Phase 1 of the people review): who
 * invites and for how long, which links still work, the roles a changer may set and what a change
 * asks first, how a person stands in a room, and who may leave or add.
 */

import { inviteFromLink } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { type Directory, nameOf } from "./events.js";
import { buildModel, type Space, type WorkspaceModel } from "./model.js";
import {
  alreadyInAsking,
  alreadyInSpaceAsking,
  DEAD_INVITE,
  enterSpaceAsking,
  guestElsewhereAsking,
  guestRefusal,
  guestStandingWords,
  invitedByWords,
  invitedWords,
  inviteRowWords,
  inviteShareWords,
  inviteSomeoneNew,
  inviteToSpaceHint,
  inviteUsesMeans,
  inviteUseWords,
  isShared,
  joinAlongsideAsking,
  joinFacts,
  joinTitle,
  leaveAsking,
  liveInvites,
  mayAddToRoom,
  mayInvite,
  mayInviteToSpace,
  mayLeave,
  mayOpenSpace,
  nameTakenWords,
  nobodyToAddWords,
  peopleOf,
  ROLE_MEANS,
  roleChangeAsking,
  roleMeansFor,
  rolesOffered,
  SPACE_INVITE_ROLES,
  selfLabel,
  spaceLinkAsking,
  spacesShared,
  standingInRoom,
  standingWords,
  takeOutAsking,
} from "./people.js";
import type { Invite } from "./store.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const MAYA = "usr_01K4ZQPX00000000000000MAYA";
const PRIYA = "usr_01K4ZQPX0000000000000PRIYA";
const DEV = "usr_01K4ZQPX000000000000000DEV";
const SCOUT = "agt_01K4ZQPX000000000000SCOUT";

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [MAYA]: { id: MAYA, kind: "person", displayName: "Maya" },
  [PRIYA]: { id: PRIYA, kind: "person", displayName: "Priya" },
  [DEV]: { id: DEV, kind: "person", displayName: "Dev" },
  [SCOUT]: { id: SCOUT, kind: "agent", displayName: "Scout" },
};

const JOINED: readonly (readonly [string, string, string | undefined])[] = [
  [ARJUN, "owner", undefined],
  [MAYA, "admin", ARJUN],
  [PRIYA, "member", ARJUN],
  [DEV, "guest", MAYA],
];

const joined = buildModel(
  JOINED.map(([id, role, by], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: `2026-10-0${index + 1}T00:00:00.000Z`,
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
    ...(by === undefined ? {} : { invited_by: by }),
  })),
);

function room(id: string, title: string, roles: Record<string, "owner" | "member" | "guest">) {
  return {
    id,
    title,
    kind: "group",
    members: Object.keys(roles),
    roles,
    state: "open",
    lines: [],
    runs: [],
    sessions: [],
  } as unknown as Space;
}

const bakery = room("spc_bakery", "Bakery", {
  [ARJUN]: "owner",
  [MAYA]: "member",
  [PRIYA]: "member",
  [DEV]: "guest",
  [SCOUT]: "member",
});
const studio = room("spc_studio", "Studio", { [ARJUN]: "owner", [PRIYA]: "member" });
const solo = room("spc_solo", "Notes", { [ARJUN]: "owner", [SCOUT]: "member" });
const model: WorkspaceModel = { ...joined, spaces: [bakery, studio, solo] };

const invite = (over: Partial<Invite>): Invite => ({
  inviteId: "inv_1",
  role: "member",
  singleUse: true,
  uses: 0,
  createdBy: ARJUN,
  createdAt: "2026-10-14T00:00:00.000Z",
  expiresAt: "2026-10-21T00:00:00.000Z",
  revokedAt: undefined,
  spaceId: undefined,
  ...over,
});

describe("inviting", () => {
  it("is an owner's alone", () => {
    expect(mayInvite("owner")).toBe(true);
    for (const role of ["admin", "member", "guest", undefined] as const) {
      expect(mayInvite(role)).toBe(false);
    }
  });

  it("says what once or by several means, and that the link stops after 30 minutes (ADR 0232)", () => {
    expect(inviteUsesMeans("once")).toBe(
      "The first person to join by it uses it up. Unused, it stops working after 30 minutes.",
    );
    expect(inviteUsesMeans("open")).toBe(
      "Everyone you send it to can join by it, until it stops working after 30 minutes or you withdraw it.",
    );
  });

  it("lists only the links that still let somebody in, and says how each is used", () => {
    const now = Date.parse("2026-10-15T00:00:00.000Z");
    const links = [
      invite({ inviteId: "live" }),
      invite({ inviteId: "spent", uses: 1 }),
      invite({ inviteId: "withdrawn", revokedAt: "2026-10-14T01:00:00.000Z" }),
      invite({ inviteId: "lapsed", expiresAt: "2026-10-14T12:00:00.000Z" }),
      invite({ inviteId: "open", singleUse: false, uses: 2 }),
    ];
    expect(liveInvites(links, now).map((each) => each.inviteId)).toEqual(["live", "open"]);
    expect(inviteUseWords(links[0] as Invite)).toBe("Once");
    expect(inviteUseWords({ singleUse: false, uses: 1 })).toBe("By several, used 1 time");
    expect(inviteUseWords({ singleUse: false, uses: 2 })).toBe("By several, used 2 times");
  });

  it("shares the link alone, which a tap opens in Chips (ADR 0207), and Paste still reads", () => {
    const url =
      "https://relay.example/join#invite=chips_inv_x&lan=https%3A%2F%2Fchips.example&relay=wss%3A%2F%2Frelay.example&key=k";
    expect(inviteShareWords(url)).toBe(url);
    // With TestFlight's link, how to get Chips comes first, and Paste still finds the invite.
    const fresh = inviteShareWords(url, "https://testflight.apple.com/join/AbCd1234");
    expect(fresh).toBe(
      `No Chips yet? Get it for iPhone: https://testflight.apple.com/join/AbCd1234\n\nThen tap this link to join:\n\n${url}`,
    );
    expect(inviteFromLink(fresh)?.token).toBe("chips_inv_x");
  });
});

describe("People", () => {
  it("lists the longest here first, and says who let each in", () => {
    expect(peopleOf(model).map((each) => each.participantId)).toEqual([ARJUN, MAYA, PRIYA, DEV]);
    expect(invitedByWords(ARJUN, ARJUN, directory)).toBe("you");
    expect(invitedByWords(MAYA, ARJUN, directory)).toBe("Maya");
    expect(invitedByWords(undefined, ARJUN, directory)).toBeUndefined();
  });

  it("offers an owner every role, an admin none of an owner's, and keeps the last owner", () => {
    const priya = model.people[PRIYA];
    const arjun = model.people[ARJUN];
    if (priya === undefined || arjun === undefined) throw new Error("missing");
    expect(rolesOffered("owner", priya, 1)).toEqual(["owner", "admin", "member", "guest"]);
    expect(rolesOffered("admin", priya, 1)).toEqual(["admin", "member", "guest"]);
    expect(rolesOffered("admin", arjun, 1)).toEqual([]);
    expect(rolesOffered("owner", arjun, 1)).toEqual(["owner"]);
    expect(rolesOffered("member", priya, 1)).toEqual([]);
  });

  it("names the spaces the reader shares with a person, and why they can't be a guest", () => {
    expect(spacesShared(model, directory, PRIYA, ARJUN)).toEqual(["Bakery", "Studio"]);
    expect(spacesShared(model, directory, DEV, MAYA)).toEqual(["Bakery"]);
    expect(guestRefusal(model, PRIYA)).toBe("In 2 spaces: a guest is in one");
    expect(guestRefusal(model, MAYA)).toBeUndefined();
  });

  it("asks before a role changes, saying what they'll be able to do", () => {
    expect(roleChangeAsking({ name: "Priya", to: "admin" })).toEqual({
      title: "Make Priya an admin?",
      body: "Priya can change roles and remove anybody but an owner. Only an owner invites.",
      note: "You can change it back at any time.",
      confirm: "Make admin",
    });
    expect(roleChangeAsking({ name: "Priya", to: "owner" })).toMatchObject({
      title: "Make Priya an owner?",
      note: "Only an owner can undo it.",
    });
    expect(roleChangeAsking({ name: "Arjun", to: "admin", yourself: true })).toMatchObject({
      title: "Make yourself an admin?",
      note: "Only an owner can make you an owner again.",
    });
  });
});

describe("who else reads a room: the shared tag (ADR 0234)", () => {
  const HERMES = "hrn_01K4ZQPX00000000000000HERMES";
  const OLD = "hrn_01K4ZQPX0000000000000000OLD";
  const MINE = "hrn_01K4ZQPX000000000000000MINE";
  const THEO = "agt_01K4ZQPX0000000000000000THEO";
  const PIP = "agt_01K4ZQPX00000000000000000PIP";
  const ODD = "agt_01K4ZQPX00000000000000000ODD";
  const owned: Directory = {
    ...directory,
    [HERMES]: { id: HERMES, kind: "harness", displayName: "Hermes", ownerId: PRIYA },
    [MINE]: { id: MINE, kind: "harness", displayName: "OpenClaw", ownerId: ARJUN },
    [OLD]: { id: OLD, kind: "harness", displayName: "Old" },
    [THEO]: { id: THEO, kind: "agent", displayName: "Theo", harnessId: HERMES },
    [PIP]: { id: PIP, kind: "agent", displayName: "Pip", harnessId: MINE },
    [ODD]: { id: ODD, kind: "agent", displayName: "Odd", harnessId: OLD },
  };

  it("marks a room another person is in, for each of them", () => {
    expect(isShared(studio, owned, ARJUN)).toBe(true);
    expect(isShared(studio, owned, PRIYA)).toBe(true);
    expect(isShared(bakery, owned, DEV)).toBe(true);
  });

  it("marks a room with somebody else's agent, and never for the reader's own", () => {
    const foodie = room("spc_foodie", "Foodie", { [ARJUN]: "owner", [THEO]: "member" });
    expect(isShared(foodie, owned, ARJUN)).toBe(true);
    // Priya's own agent, with Arjun's room around it: Arjun is another person.
    expect(isShared(foodie, owned, PRIYA)).toBe(true);
    const mine = room("spc_mine", "Mine", { [ARJUN]: "owner", [PIP]: "member" });
    expect(isShared(mine, owned, ARJUN)).toBe(false);
    expect(isShared(solo, owned, ARJUN)).toBe(false);
  });

  it("counts an agent whose harness has no owner as nobody else's", () => {
    const odd = room("spc_odd", "Odd", { [ARJUN]: "owner", [ODD]: "member" });
    expect(isShared(odd, owned, ARJUN)).toBe(false);
    // Nor one the directory doesn't know.
    const unknown = room("spc_unknown", "Unknown", {
      [ARJUN]: "owner",
      agt_01K4ZQPX000000000000UNKNOWN: "member",
    });
    expect(isShared(unknown, owned, ARJUN)).toBe(false);
  });

  it("leaves a thread to its room", () => {
    const thread = { ...studio, id: "spc_thread", parentSpaceId: studio.id } as Space;
    expect(isShared(thread, owned, ARJUN)).toBe(false);
  });
});

describe("a room's people", () => {
  it("names the room's owner and the workspace's owners and admins as such", () => {
    expect(standingInRoom(bakery, model, ARJUN)).toBe("Owner");
    expect(standingInRoom(bakery, model, MAYA)).toBe("Admin");
    expect(standingInRoom(bakery, model, PRIYA)).toBe("Member");
    expect(standingInRoom(bakery, model, DEV)).toBe("Guest");
  });

  it("asks before somebody is taken out, and before you leave", () => {
    expect(takeOutAsking({ name: "Priya", room: "Bakery" })).toEqual({
      title: "Take Priya out of Bakery?",
      body: "Priya sees that you took them out, where the space was. What Priya said stays.",
      note: "You can add them back, and they find the space whole.",
      confirm: "Take out",
    });
    expect(leaveAsking("Bakery")).toMatchObject({ title: "Leave Bakery?", confirm: "Leave" });
  });

  it("offers Leave where somebody else could add you back, and Add to anybody but a guest", () => {
    expect(mayLeave(bakery, directory, PRIYA)).toBe(true);
    expect(mayLeave(solo, directory, ARJUN)).toBe(false);
    expect(mayLeave(studio, directory, MAYA)).toBe(false);
    // The workspace's owner stays in the rooms his agents answer (ADR 0204's addendum); an admin,
    // a member and a guest may go.
    expect(mayLeave(bakery, directory, ARJUN, model)).toBe(false);
    expect(mayLeave(bakery, directory, MAYA, model)).toBe(true);
    expect(mayLeave(bakery, directory, PRIYA, model)).toBe(true);
    expect(mayLeave(bakery, directory, DEV, model)).toBe(true);
    // Without the model, the directory's word.
    const owned = { ...directory, [ARJUN]: { ...directory[ARJUN], role: "owner" } } as Directory;
    expect(mayLeave(bakery, owned, ARJUN)).toBe(false);
    expect(mayAddToRoom(bakery, model, PRIYA)).toBe(true);
    expect(mayAddToRoom(bakery, model, DEV)).toBe(false);
    expect(mayAddToRoom(studio, model, MAYA)).toBe(false);
  });
});

describe("joining from the apps (ADR 0164)", () => {
  const acme = { workspaceName: "Acme", role: "member", invitedByName: "Ravi" } as const;

  it("says whose invite, where to and as what, or only where when nobody is named", () => {
    expect(invitedWords(acme)).toBe("Ravi invited you to Acme as a member.");
    expect(invitedWords({ workspaceName: "Acme", role: "admin" })).toBe(
      "You were invited to Acme as an admin.",
    );
    expect(DEAD_INVITE.body).toMatch(/Ask whoever sent it for a new link/);
  });

  it("opens the workspace this device is in already, and leaves the link for somebody else", () => {
    expect(alreadyInAsking({ workspace: "Demo", name: "Priya Nair", here: "phone" })).toEqual({
      title: "You're already in Demo",
      body: "As Priya Nair, on this phone. The link stays unused, so it can go to somebody else.",
      confirm: "Open Demo",
    });
  });

  it("tells a newcomer the space's history is there, and that there is nothing to set up", () => {
    expect(joinFacts({ ...acme, spaceName: "Japan trip" })).toEqual([
      "Everything said in Japan trip so far is there for you to read.",
      "Nothing to set up: the agents there come with Acme.",
    ]);
    expect(joinFacts(acme)).toEqual(["Nothing to set up: the agents there come with Acme."]);
  });

  it("joins alongside on the phone too, switched between at the top of Spaces (ADR 0197)", () => {
    expect(
      joinAlongsideAsking({
        invite: acme,
        here: "Demo",
        name: "Arjun",
        on: { device: "phone", place: "Spaces" },
      }).body,
    ).toBe("Demo stays on this phone. Switch between them from the top of Spaces.");
  });

  it("joins alongside in a browser or on the Mac, under the name you go by", () => {
    expect(joinAlongsideAsking({ invite: acme, here: "Demo", name: "Arjun" })).toEqual({
      title: "Join Acme too?",
      body: "Ravi invited you to Acme as a member. Demo stays: switch between them at the top of the sidebar.",
      note: "You join as Arjun. You can change your name there in You.",
      confirm: "Join Acme",
    });
  });

  it("asks for another name in a field when the one you go by is taken there (ADR 0197)", () => {
    const asking = joinAlongsideAsking({ invite: acme, here: "Demo", name: "Meera", naming: true });
    expect(asking).not.toHaveProperty("note");
    expect(asking.confirm).toBe("Join Acme");
    expect(nameTakenWords({ name: "  Meera ", workspace: "Arjun's workspace" })).toBe(
      "The name Meera is taken in Arjun's workspace. Join under another one.",
    );
  });
});

describe("a link to a space (ADR 0168)", () => {
  const priyaLink = {
    workspaceName: "Demo",
    role: "guest" as const,
    invitedByName: "Arjun",
    spaceName: "Bakery",
  };

  it("names the space before the workspace, on the card and its title", () => {
    expect(invitedWords(priyaLink)).toBe("Arjun invited you to Bakery in Demo as a guest.");
    expect(joinTitle(priyaLink)).toBe("Join Bakery");
    expect(joinTitle({ workspaceName: "Demo", role: "member" })).toBe("Join Demo");
    expect(roleMeansFor("guest", "Bakery")).toBe(
      "A guest is in Bakery only, and sees only the people and agents there.",
    );
    expect(roleMeansFor("member", "Bakery")).toBe(
      "A member starts in Bakery, and can be added to other spaces later. They see everybody here, and only the agents in their spaces.",
    );
    expect(roleMeansFor("member")).toBe(ROLE_MEANS.member);
    expect(SPACE_INVITE_ROLES).toEqual(["guest", "member"]);
  });

  it("is an owner's to make, in an open room they're in", () => {
    expect(mayInviteToSpace(bakery, model, ARJUN)).toBe(true);
    // Maya is a member of Bakery, and only an owner invites.
    expect(mayInviteToSpace(bakery, model, MAYA)).toBe(false);
    // Arjun is not in a room he left.
    const without = { ...bakery, members: bakery.members.filter((id) => id !== ARJUN) };
    expect(mayInviteToSpace(without, model, ARJUN)).toBe(false);
    expect(mayInviteToSpace({ ...bakery, state: "closed" }, model, ARJUN)).toBe(false);
    // A room of one agent takes a link like any other; a thread never does (ADR 0168's addendum).
    expect(mayInviteToSpace({ ...solo, kind: "direct" }, model, ARJUN)).toBe(true);
    expect(mayInviteToSpace({ ...bakery, parentSpaceId: "spc_studio" }, model, ARJUN)).toBe(false);
  });

  it("says why People offers nobody: nobody else yet, everybody here, or guests elsewhere", () => {
    const alone = { [ARJUN]: joined.people[ARJUN] } as WorkspaceModel["people"];
    expect(nobodyToAddWords(solo, alone, ARJUN)).toBe("Nobody else is in your workspace yet");
    expect(nobodyToAddWords(bakery, joined.people, ARJUN)).toBe(
      "Everyone in your workspace is here",
    );
    // Studio lacks Maya and Dev; were Maya in it, only Dev, a guest of Bakery, would be out.
    const withMaya = { ...studio, members: [...studio.members, MAYA] };
    expect(nobodyToAddWords(withMaya, joined.people, ARJUN)).toBe(
      "Everyone else is a guest in another space",
    );
  });

  it("names the space on its row, and words the Add row and the form", () => {
    expect(inviteRowWords(invite({ role: "guest" }), "Bakery")).toBe("Guest · once · Bakery");
    expect(inviteRowWords(invite({ singleUse: false, uses: 2 }))).toBe(
      "Member · by several, used 2 times",
    );
    expect(inviteSomeoneNew("Bakery")).toEqual({
      title: "Invite someone new",
      under: "A link that brings them straight into Bakery",
    });
    expect(inviteToSpaceHint("Demo", "Bakery")).toBe(
      "Whoever opens it names themselves, joins Demo, and lands in Bakery.",
    );
  });

  it("asks somebody already in Demo before adding them, and tells a guest elsewhere why not", () => {
    expect(alreadyInSpaceAsking("Bakery")).toEqual({
      title: "You're already in Bakery",
      body: "The link stays unused, so it can go to somebody else.",
      confirm: "Open Bakery",
    });
    expect(enterSpaceAsking({ invite: priyaLink, name: "Ravi Shah" })).toEqual({
      title: "Join Bakery?",
      body: "Arjun's link to Bakery, in Demo. You're in Demo as Ravi Shah, so it adds you to Bakery. The link stays unused, so it can go to somebody else.",
      confirm: "Join Bakery",
    });
    expect(
      guestElsewhereAsking({ spaceName: "Bakery", there: "Studio", invitedByName: "Arjun" }),
    ).toEqual({
      title: "A guest is in one space",
      body: "You're a guest in Studio, so this link can't add you to Bakery. Ask Arjun to make you a member.",
      confirm: "OK",
    });
  });

  it("opens the space for somebody in it, asks a member, and tells a guest elsewhere", () => {
    const asked = (spaceId: string, selfId: string, spaceName: string) =>
      spaceLinkAsking({
        invite: { ...priyaLink, spaceName },
        spaceId,
        model,
        directory,
        selfId,
        name: nameOf(directory, selfId),
      });
    expect(asked("spc_bakery", PRIYA, "Bakery")).toEqual({
      kind: "in",
      asking: alreadyInSpaceAsking("Bakery"),
    });
    expect(asked("spc_solo", PRIYA, "Notes").kind).toBe("enter");
    expect(asked("spc_solo", PRIYA, "Notes").asking.confirm).toBe("Join Notes");
    // Dev is a guest in Bakery.
    expect(asked("spc_studio", DEV, "Studio")).toEqual({
      kind: "guest_elsewhere",
      asking: guestElsewhereAsking({
        spaceName: "Studio",
        there: "Bakery",
        invitedByName: "Arjun",
      }),
    });
    // Bakery archived, Dev is in no open room: Studio's link is theirs to take (JR-24).
    const ended = {
      ...model,
      spaces: model.spaces.map((each) =>
        each.id === "spc_bakery" ? { ...each, state: "closed" as const } : each,
      ),
    };
    const after = spaceLinkAsking({
      invite: { ...priyaLink, spaceName: "Studio" },
      spaceId: "spc_studio",
      model: ended,
      directory,
      selfId: DEV,
      name: nameOf(directory, DEV),
    });
    expect(after.kind).toBe("enter");
  });
});

describe("how the reader reads themselves among people (NP-1)", () => {
  it("is their name and (you), but an owner nobody named yet is You, once", () => {
    expect(selfLabel("Arjun")).toBe("Arjun (you)");
    expect(selfLabel("You")).toBe("You");
    // A person who chose "you" in another case is somebody's name, and said as one.
    expect(selfLabel("you")).toBe("you (you)");
  });
});

describe("the line under your name on You (ADR 0085)", () => {
  it("names the role and the workspace, or only the workspace while joining", () => {
    expect(standingWords("owner", "Demo")).toBe("Owner · Demo");
    expect(standingWords("admin", "Demo")).toBe("Admin · Demo");
    expect(standingWords(undefined, "Demo")).toBe("Demo");
  });

  it("names a guest's one space and who let them in, and nothing before they have one", () => {
    const model = {
      spaces: [
        { id: "spc_old", title: "Old trip", state: "archived", members: ["usr_gus"] },
        { id: "spc_japan", title: "Japan trip", state: "open", members: ["usr_arjun", "usr_gus"] },
      ],
      people: { usr_gus: { participantId: "usr_gus", role: "guest", invitedBy: "usr_arjun" } },
    } as unknown as WorkspaceModel;
    const directory: Directory = {
      usr_arjun: { id: "usr_arjun", kind: "person", displayName: "Arjun" },
    };
    expect(guestStandingWords(model, directory, "usr_gus")).toBe(
      "Guest in Japan trip · invited by Arjun",
    );
    expect(guestStandingWords({ ...model, spaces: [] }, directory, "usr_gus")).toBeUndefined();
  });
});

describe("who opens a space, and so has the + (ADR 0196)", () => {
  it("is an owner or an admin, never a member, a guest, or somebody whose role is not read yet", () => {
    expect(mayOpenSpace("owner")).toBe(true);
    expect(mayOpenSpace("admin")).toBe(true);
    expect(mayOpenSpace("member")).toBe(false);
    expect(mayOpenSpace("guest")).toBe(false);
    expect(mayOpenSpace(undefined)).toBe(false);
  });
});
