import { describe, expect, it } from "vitest";
import type { Directory } from "./events.js";
import type { PersonModel, Space, WorkspaceModel } from "./model/types.js";
import { guestSpaceWords, signOutWords, welcomeFor } from "./welcome.js";

const ARJUN = "usr_arjun";
const PRIYA = "usr_priya";

function people(role: PersonModel["role"], invitedBy?: string): Record<string, PersonModel> {
  return {
    [ARJUN]: { participantId: ARJUN, displayName: "You", role: "owner", joinedAt: "t0" },
    [PRIYA]: { participantId: PRIYA, displayName: "Priya", role, joinedAt: "t1", invitedBy },
  };
}

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [PRIYA]: { id: PRIYA, kind: "person", displayName: "Priya Nair" },
};

describe("the welcome (JR-4)", () => {
  it("names who let a member in, by the name they go by now, and offers a member no space (ADR 0196)", () => {
    expect(welcomeFor(people("member", ARJUN), directory, PRIYA, "Demo")).toEqual({
      title: "You're in Demo",
      words: "Arjun invited you as a member. When somebody adds you to a space, it appears here.",
      mayCreate: false,
    });
    expect(welcomeFor(people("admin", ARJUN), directory, PRIYA, "Demo")?.mayCreate).toBe(true);
    expect(welcomeFor(people("admin", ARJUN), directory, PRIYA, "Demo")?.words).toMatch(
      /^Arjun invited you as an admin\./,
    );
  });

  it("offers a guest no space of their own", () => {
    expect(welcomeFor(people("guest", ARJUN), directory, PRIYA, "Demo")).toEqual({
      title: "You're in Demo",
      words: "Arjun invited you as a guest. When they add you to a space, it appears here.",
      mayCreate: false,
    });
  });

  it("names nobody for an inviter still called what the server first called them (JR-17)", () => {
    const unnamed: Directory = {
      ...directory,
      [ARJUN]: { ...directory[ARJUN], displayName: "You" },
    } as Directory;
    expect(welcomeFor(people("member", ARJUN), unnamed, PRIYA, "Demo")?.words).toBe(
      "You were invited as a member. When somebody adds you to a space, it appears here.",
    );
    expect(welcomeFor(people("guest", ARJUN), unnamed, PRIYA, "Demo")?.words).toBe(
      "You were invited as a guest. When somebody adds you to a space, it appears here.",
    );
  });

  it("is nothing for the workspace's first person, who came by no invite", () => {
    expect(welcomeFor(people("member", ARJUN), directory, ARJUN, "Demo")).toBeUndefined();
    expect(welcomeFor(people("member"), directory, PRIYA, "Demo")).toBeUndefined();
  });
});

describe("what Sign out says", () => {
  it("tells an owner they pair again, and anybody else to ask an owner to reconnect them", () => {
    expect(signOutWords(people("member", ARJUN), ARJUN)).toMatch(/pair again with a new code\.$/);
    expect(
      signOutWords(people("member", ARJUN), ARJUN, {
        names: ["Meera's workspace"],
        device: "phone",
      }),
    ).toMatch(/new code\. Meera's workspace stays on this phone\.$/);
    // Not a new invite link: the server turns it away, since somebody goes by their name already.
    expect(signOutWords(people("guest", ARJUN), PRIYA)).toBe(
      "Its key is withdrawn at the server and forgotten here. Nothing in the workspace is deleted. To come back, ask an owner to reconnect you: they choose Pair a new phone on your page in People. A code from another device you're signed in on works too.",
    );
    // An owner who came by an invite has a computer's way back, as the first one does.
    expect(signOutWords(people("owner", ARJUN), PRIYA)).toMatch(/pair again with a new code\.$/);
  });
});

describe("the line under a guest's Spaces (ADR 0196)", () => {
  const trip = {
    id: "spc_trip",
    title: "Japan trip",
    state: "open",
    members: [ARJUN, PRIYA],
  } as unknown as Space;
  const model = (role: PersonModel["role"], spaces: readonly Space[] = [trip]) =>
    ({ people: people(role, ARJUN), spaces }) as unknown as WorkspaceModel;

  it("says why a guest has one space, and who let them in", () => {
    expect(guestSpaceWords(model("guest"), directory, PRIYA)).toBe(
      "You're Arjun's guest in Japan trip, so it's your one space here.",
    );
    const unnamed = { ...directory, [ARJUN]: { ...directory[ARJUN], displayName: "You" } };
    expect(guestSpaceWords(model("guest"), unnamed as Directory, PRIYA)).toBe(
      "You're a guest in Japan trip, so it's your one space here.",
    );
  });

  it("is nothing for a member or an owner, or a guest whose space is archived", () => {
    expect(guestSpaceWords(model("member"), directory, PRIYA)).toBeUndefined();
    expect(guestSpaceWords(model("guest"), directory, ARJUN)).toBeUndefined();
    const archived = { ...trip, state: "closed" } as Space;
    expect(guestSpaceWords(model("guest", [archived]), directory, PRIYA)).toBeUndefined();
  });
});
