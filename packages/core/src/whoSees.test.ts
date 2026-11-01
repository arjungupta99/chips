/**
 * Who a person sees and what they may do, and what the links say of themselves, as People, a
 * person's page and Invite someone say it (ADR 0209).
 */

import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import { buildModel, type Space, type WorkspaceModel } from "./model.js";
import { roleChangeAsking } from "./people.js";
import type { Invite } from "./store.js";
import {
  cameBy,
  cameByWords,
  canDo,
  inFilter,
  inviteSees,
  inviteSeesWords,
  inviteSpaces,
  joinedBy,
  leftWords,
  lifeLeft,
  linkEnding,
  linkUsedWords,
  openLinksWords,
  peopleFilters,
  roleChangeSees,
  roleCountWords,
  seenBy,
  spacesLine,
  spanWords,
  usedInvites,
} from "./whoSees.js";

const ARJUN = "usr_arjun";
const SAM = "usr_sam";
const LEO = "usr_leo";
const NATALIE = "usr_natalie";
const PRIYA = "usr_priya";
const SCOUT = "hrn_scout";
const JACOBIAN = "agt_jacobian";
const HERMES = "agt_hermes";
const OPENCLAW = "agt_openclaw";
const LEOS = "agt_leos";
const GONE = "agt_gone";

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [SAM]: { id: SAM, kind: "person", displayName: "Sam" },
  [LEO]: { id: LEO, kind: "person", displayName: "Leo" },
  [NATALIE]: { id: NATALIE, kind: "person", displayName: "Natalie" },
  [PRIYA]: { id: PRIYA, kind: "person", displayName: "Priya" },
  [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: ARJUN },
  hrn_leo: { id: "hrn_leo", kind: "harness", displayName: "Leo's box", ownerId: LEO },
  [JACOBIAN]: { id: JACOBIAN, kind: "agent", displayName: "Jacobian", harnessId: SCOUT },
  [HERMES]: { id: HERMES, kind: "agent", displayName: "Hermes", harnessId: SCOUT },
  [OPENCLAW]: { id: OPENCLAW, kind: "agent", displayName: "OpenClaw", harnessId: SCOUT },
  [LEOS]: { id: LEOS, kind: "agent", displayName: "Pip", harnessId: "hrn_leo" },
  [GONE]: { id: GONE, kind: "agent", displayName: "Old", harnessId: SCOUT, archived: true },
};

const JOINED: readonly (readonly [string, string, string | undefined, string | undefined])[] = [
  [ARJUN, "owner", undefined, undefined],
  [SAM, "admin", ARJUN, "inv_sam"],
  [LEO, "member", ARJUN, "inv_team"],
  [NATALIE, "member", ARJUN, "inv_foodie"],
  [PRIYA, "guest", ARJUN, "inv_bakery"],
];

const people = buildModel(
  JOINED.map(([id, role, by, invite], index) => ({
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
    ...(invite === undefined ? {} : { invite_id: invite }),
  })),
);

function room(id: string, title: string, members: readonly string[], state = "open") {
  return {
    id,
    title,
    kind: "group",
    members,
    roles: Object.fromEntries(members.map((each) => [each, each === ARJUN ? "owner" : "member"])),
    state,
    lines: [],
    runs: [],
    sessions: [],
  } as unknown as Space;
}

const foodie = room("spc_foodie", "Foodie", [ARJUN, NATALIE, JACOBIAN, HERMES]);
const bakery = room("spc_bakery", "Bakery", [ARJUN, PRIYA, JACOBIAN]);
const garden = room("spc_garden", "Garden", [ARJUN, SAM, LEO, JACOBIAN, OPENCLAW]);
const attic = room("spc_attic", "Attic", [ARJUN, NATALIE, GONE], "closed");
const model: WorkspaceModel = { ...people, spaces: [foodie, bakery, garden, attic] };

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

const reader = { selfId: ARJUN, workspace: "Primal" };
const HOUR = 3_600_000;

describe("who a person sees", () => {
  it("is everybody for a member, and the agents in their open rooms", () => {
    expect(seenBy(model, directory, NATALIE)).toEqual({
      spaces: ["spc_foodie"],
      people: [ARJUN, SAM, LEO, PRIYA],
      agents: [HERMES, JACOBIAN],
    });
  });

  it("is only the room for a guest", () => {
    expect(seenBy(model, directory, PRIYA)).toEqual({
      spaces: ["spc_bakery"],
      people: [ARJUN],
      agents: [JACOBIAN],
    });
  });

  it("is every agent for those who run it, never an archived one", () => {
    expect(seenBy(model, directory, SAM).agents).toEqual([HERMES, JACOBIAN, OPENCLAW, LEOS]);
  });

  it("takes in the agents of a member's own harness wherever they are", () => {
    expect(seenBy(model, directory, LEO).agents).toEqual([JACOBIAN, OPENCLAW, LEOS]);
  });

  it("is worked out for another role on asking", () => {
    expect(seenBy(model, directory, NATALIE, "guest")).toMatchObject({
      people: [ARJUN],
      agents: [HERMES, JACOBIAN],
    });
  });
});

describe("what a person can do", () => {
  it("says a member's rooms, everybody, their agents, and what they can't", () => {
    const lines = canDo(model, directory, NATALIE, reader);
    expect(lines.map((each) => [each.can, each.words])).toEqual([
      [true, "Works in Foodie, and any space they're added to"],
      [true, "Sees everybody in Primal"],
      [true, "Sees the agents in their spaces: Hermes and Jacobian"],
      [true, "Adds people to their spaces"],
      [false, "Can't invite, open a space, or put agents that aren't theirs in a space"],
    ]);
    expect(lines[0]?.spaces).toEqual(["spc_foodie"]);
    expect(lines[2]?.faces).toEqual([HERMES, JACOBIAN]);
  });

  it("names a member's own agents", () => {
    expect(canDo(model, directory, LEO, reader)[2]?.words).toBe(
      "Sees their own agents and the agents in their spaces: Jacobian, OpenClaw and Pip",
    );
  });

  it("says a guest is in one room and sees only who is there", () => {
    expect(canDo(model, directory, PRIYA, reader).map((each) => each.words)).toEqual([
      "Is in Bakery only",
      "Sees only who's there: Arjun and Jacobian",
      "Can't add anybody, or see any other space",
    ]);
  });

  it("says what an owner and an admin do", () => {
    expect(canDo(model, directory, ARJUN, reader)[0]?.words).toBe(
      "Invites people, changes roles, and removes anybody",
    );
    expect(canDo(model, directory, SAM, reader).at(-1)).toEqual({
      can: false,
      words: "Can't invite people, or change an owner",
    });
  });

  it("says a member in no room is in none yet", () => {
    const alone = { ...model, spaces: [] };
    expect(canDo(alone, directory, NATALIE, reader).map((each) => each.words)).toContain(
      "Sees no agents until they're in a space with one",
    );
  });
});

describe("a role change", () => {
  it("says who a member made a guest would stop seeing, and who is in their room", () => {
    const sees = roleChangeSees(model, directory, NATALIE, "guest", ARJUN);
    expect(sees).toEqual({
      stops: [SAM, LEO, PRIYA],
      starts: [],
      room: "Foodie",
      there: [ARJUN, HERMES, JACOBIAN],
    });
    const named = {
      ...sees,
      stops: ["Sam", "Leo", "Priya"],
      there: ["Arjun", "Hermes", "Jacobian"],
    };
    expect(roleChangeAsking({ name: "Natalie", to: "guest", sees: named })).toEqual({
      title: "Make Natalie a guest?",
      body: "Natalie stays in Foodie, and sees only who's there: Arjun, Hermes and Jacobian.",
      note: "They stop seeing Sam, Leo and Priya, and can't add anybody. You can change it back at any time.",
      confirm: "Make guest",
    });
  });

  it("says who a member made an admin would start seeing", () => {
    const sees = roleChangeSees(model, directory, NATALIE, "admin", ARJUN);
    expect(sees.starts).toEqual([OPENCLAW, LEOS]);
    expect(
      roleChangeAsking({
        name: "Natalie",
        to: "admin",
        sees: { ...sees, starts: ["OpenClaw", "Pip"] },
      }).note,
    ).toBe("They'll see OpenClaw and Pip too. You can change it back at any time.");
  });
});

describe("what an invite lets somebody see", () => {
  it("is a room's people and agents for a guest", () => {
    expect(inviteSees(model, directory, "guest", "spc_bakery")).toEqual({
      spaces: ["spc_bakery"],
      people: [ARJUN, PRIYA],
      agents: [JACOBIAN],
    });
    expect(inviteSees(model, directory, "guest")).toEqual({ spaces: [], people: [], agents: [] });
  });

  it("is everybody for a member, and the room's agents", () => {
    expect(inviteSees(model, directory, "member", "spc_foodie")).toMatchObject({
      people: [ARJUN, SAM, LEO, NATALIE, PRIYA],
      agents: [HERMES, JACOBIAN],
    });
    expect(inviteSees(model, directory, "member").agents).toEqual([]);
  });

  it("says it in a sentence", () => {
    expect(
      inviteSeesWords({
        role: "guest",
        workspace: "Primal",
        space: "Bakery",
        people: ["Arjun", "Priya"],
        agents: ["Jacobian"],
      }),
    ).toBe(
      "A guest in Bakery sees only who's there: Arjun, Priya and Jacobian. Nothing else in Primal.",
    );
    expect(inviteSeesWords({ role: "guest", workspace: "Primal", people: [], agents: [] })).toBe(
      "A guest in no space sees nobody until somebody adds them to one.",
    );
    expect(inviteSeesWords({ role: "member", workspace: "Primal", people: [], agents: [] })).toBe(
      "A member sees everybody here, and only the agents in their spaces: none until they're added to one.",
    );
    expect(
      inviteSeesWords({
        role: "member",
        workspace: "Primal",
        space: "Foodie",
        people: [],
        agents: ["Hermes", "Jacobian"],
      }),
    ).toBe(
      "A member starts in Foodie. They see everybody here, and only the agents in their spaces: Hermes and Jacobian.",
    );
  });

  it("offers the open rooms the owner is in, by name", () => {
    expect(inviteSpaces(model, directory, ARJUN).map((each) => each.title)).toEqual([
      "Bakery",
      "Foodie",
      "Garden",
    ]);
    expect(inviteSpaces(model, directory, SAM)).toEqual([]);
  });
});

describe("links", () => {
  const links = [
    invite({ inviteId: "inv_foodie", spaceId: "spc_foodie" }),
    invite({
      inviteId: "inv_team",
      singleUse: false,
      uses: 3,
      createdAt: "2026-10-16T00:00:00.000Z",
    }),
    invite({ inviteId: "inv_open", createdAt: "2026-10-18T00:00:00.000Z" }),
  ];

  it("says which link brought a person, and who came by each", () => {
    const person = model.people[NATALIE];
    if (person === undefined) throw new Error("no Natalie");
    expect(cameBy(person, links)?.inviteId).toBe("inv_foodie");
    expect(
      cameByWords({ invite: links[0] as Invite, by: "you", space: "Foodie", made: "14 October" }),
    ).toBe("Your member link to Foodie, made 14 October");
    expect(
      cameByWords({ invite: links[1] as Invite, by: "Sam", space: undefined, made: "16 October" }),
    ).toBe("Sam's member link, made 16 October, used 3 times");
    expect(joinedBy(model, { inviteId: "inv_team" }).map((each) => each.participantId)).toEqual([
      LEO,
    ]);
    expect(usedInvites(model, links).map((each) => each.inviteId)).toEqual([
      "inv_team",
      "inv_foodie",
    ]);
  });

  it("says how long a link has left", () => {
    const now = Date.parse("2026-10-20T04:00:00.000Z");
    expect(leftWords("2026-10-21T00:00:00.000Z", now)).toBe("20 h left");
    expect(leftWords("2026-10-25T05:00:00.000Z", now)).toBe("5 days left");
    expect(leftWords("2026-10-20T04:30:00.000Z", now)).toBe("30 min left");
    expect(leftWords("2026-10-19T00:00:00.000Z", now)).toBe("Ran out");
    expect(spanWords(25 * HOUR)).toBe("1 day");
    expect(lifeLeft(invite({}), Date.parse("2026-10-17T12:00:00.000Z"))).toBeCloseTo(0.5);
    expect(lifeLeft(invite({}), Date.parse("2026-10-30T00:00:00.000Z"))).toBe(0);
  });

  it("goes amber in the last quarter of a link's own life, and never more than its last day", () => {
    const made = Date.parse("2026-10-30T15:00:00.000Z");
    const short = invite({
      createdAt: "2026-10-30T15:00:00.000Z",
      expiresAt: "2026-10-30T15:30:00.000Z",
    });
    // A fresh 30-minute link isn't amber at once; in its last 7.5 minutes it is.
    expect(linkEnding(short, made)).toBe(false);
    expect(linkEnding(short, made + 22 * 60_000)).toBe(false);
    expect(linkEnding(short, made + 23 * 60_000)).toBe(true);
    // A week's link: its last day, as before, not its last quarter.
    const week = invite({});
    expect(linkEnding(week, Date.parse("2026-10-19T12:00:00.000Z"))).toBe(false);
    expect(linkEnding(week, Date.parse("2026-10-20T01:00:00.000Z"))).toBe(true);
  });

  it("says who used up a link made once, and nothing for one that can still be used", () => {
    expect(linkUsedWords(model, directory, { inviteId: "inv_foodie", singleUse: true })).toBe(
      "Used: Natalie joined by it",
    );
    expect(linkUsedWords(model, directory, { inviteId: "inv_open", singleUse: true })).toBe(
      undefined,
    );
    // By several: a join doesn't use it up.
    expect(linkUsedWords(model, directory, { inviteId: "inv_team", singleUse: false })).toBe(
      undefined,
    );
  });

  it("says the open links on You's row", () => {
    const now = Date.parse("2026-10-20T04:00:00.000Z");
    expect(openLinksWords([], now)).toBeUndefined();
    expect(openLinksWords([invite({ expiresAt: "2026-10-25T05:00:00.000Z" })], now)).toBe(
      "1 open link · runs out in 5 days",
    );
    expect(
      openLinksWords(
        [
          invite({ expiresAt: "2026-10-25T05:00:00.000Z" }),
          invite({ expiresAt: "2026-10-21T00:00:00.000Z" }),
        ],
        now,
      ),
    ).toBe("2 open links · the next runs out in 20 h");
  });
});

describe("People's list", () => {
  it("counts the roles on You's row", () => {
    expect(roleCountWords(model)).toBe("1 owner · 1 admin · 2 members · 1 guest");
  });

  it("filters by role, offering only a filter with somebody in it", () => {
    const list = Object.values(model.people);
    expect(peopleFilters(list)).toEqual([
      { key: "all", label: "All", count: 5 },
      { key: "runs", label: "Owners and admins", count: 2 },
      { key: "member", label: "Members", count: 2 },
      { key: "guest", label: "Guests", count: 1 },
    ]);
    expect(
      peopleFilters(list.filter((each) => each.role !== "guest")).map((each) => each.key),
    ).toEqual(["all", "runs", "member"]);
    expect(inFilter({ role: "admin" }, "runs")).toBe(true);
    expect(inFilter({ role: "member" }, "guest")).toBe(false);
  });

  it("names a person's rooms in a line", () => {
    expect(spacesLine([])).toBeUndefined();
    expect(spacesLine(["Foodie"])).toBe("Foodie");
    expect(spacesLine(["Foodie", "Garden"])).toBe("Foodie and Garden");
    expect(spacesLine(["Foodie", "Garden", "Trips", "Bakery"])).toBe("Foodie and 3 more");
  });
});
