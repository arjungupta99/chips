/**
 * People, a person's page and Invite someone on the phone (people review, Phase 1; ADR 0209):
 * everyone in the workspace, their spaces and role, narrowed by role; what a person can do, the
 * link they came by and their devices; a role that asks before it changes, saying who they'd stop
 * seeing, and Guest off for somebody in two spaces; Remove from the workspace in the desktop's
 * words; and a link made as what, into which room, how often and for how long, with who they'll
 * see, out through the share sheet, and withdrawn, and the links somebody came by.
 */

import type { Invite as InviteRow, IssuedInvite, Snapshot, Store } from "@chipschat/core";
import {
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { ReactElement, ReactNode } from "react";
import { ScrollView } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { Invite } from "./Invite";
import { People } from "./People";
import { Person } from "./Person";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockPushed: string[] = [];
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => mockPushed.push(to), back: mockBack }),
}));
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  // A workspace of somebody's own, not the demo's (ADR 0213).
  useChips: () => ({ paired: undefined }),
}));
const mockShared: string[] = [];
jest.mock("../ui/share", () => ({
  shareText: async (text: string) => {
    mockShared.push(text);
  },
}));

const room = (id: string, title: string, members: readonly string[]) => ({
  id,
  title,
  kind: "group",
  members,
  roles: Object.fromEntries(members.map((member) => [member, "member"])),
  state: "open",
  lines: [],
  runs: [],
  sessions: [],
});

function people(over: { readonly selfName?: string } = {}): Snapshot {
  return {
    connection: "open",
    link: "direct",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    spaceIcons: new Map(),
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: over.selfName ?? "Arjun" },
      per_maya: { id: "per_maya", kind: "person", displayName: "Maya Chen" },
      per_priya: { id: "per_priya", kind: "person", displayName: "Priya Nair" },
      har_ledger: {
        id: "har_ledger",
        kind: "harness",
        displayName: "Ledger",
        ownerId: "per_priya",
      },
      agt_scout: { id: "agt_scout", kind: "agent", displayName: "Scout", harnessId: "har_ledger" },
    },
    model: {
      needsYou: [],
      spaces: [
        room("sp_bakery", "Bakery", ["per_arjun", "per_maya", "per_priya", "agt_scout"]),
        room("sp_studio", "Studio", ["per_arjun", "per_priya"]),
      ],
      people: {
        per_arjun: {
          participantId: "per_arjun",
          displayName: "Arjun",
          role: "owner",
          joinedAt: "2026-10-01T00:00:00.000Z",
        },
        per_maya: {
          participantId: "per_maya",
          displayName: "Maya Chen",
          role: "admin",
          joinedAt: "2026-10-09T00:00:00.000Z",
          invitedBy: "per_arjun",
        },
        per_priya: {
          participantId: "per_priya",
          displayName: "Priya Nair",
          role: "member",
          joinedAt: "2026-10-12T00:00:00.000Z",
          invitedBy: "per_arjun",
          inviteId: "inv_open",
        },
      },
    },
  } as unknown as Snapshot;
}

const LINK: InviteRow = {
  inviteId: "inv_open",
  role: "member",
  singleUse: false,
  uses: 2,
  createdBy: "per_arjun",
  createdAt: "2026-10-13T00:00:00.000Z",
  expiresAt: "2099-10-20T00:00:00.000Z",
  revokedAt: undefined,
  spaceId: undefined,
};

/** The fake store, with the registry's reads and writes the people pages call. */
/** The relay's page, which opens anywhere (ADR 0207). */
const RELAY_LINK =
  "https://relay.chipschat.ai/join#invite=chips_inv_new&lan=https%3A%2F%2Fadas-mac-mini.tail2f9c1e.ts.net&relay=wss%3A%2F%2Frelay.chipschat.ai&key=k";

function store(
  snapshot: Snapshot,
  url = "https://adas-mac-mini.tail2f9c1e.ts.net/#invite=chips_inv_new",
) {
  const base = fakeStore(snapshot);
  let links: InviteRow[] = [LINK];
  const made: unknown[] = [];
  const issued: IssuedInvite = {
    inviteId: "inv_new",
    role: "guest",
    singleUse: true,
    url,
    expiresAt: "2099-10-15T00:00:00.000Z",
    spaceId: undefined,
  };
  const fake = {
    ...base,
    invites: jest.fn(async () => links),
    createInvite: jest.fn(async (input: unknown) => {
      made.push(input);
      return issued;
    }),
    revokeInvite: jest.fn(async (inviteId: string) => {
      links = links.filter((each) => each.inviteId !== inviteId);
    }),
    changeRole: jest.fn(),
    removePerson: jest.fn(async () => undefined),
    personDevices: jest.fn(async () => [
      {
        deviceId: "dev_priya",
        name: "iPhone 17",
        pairedAt: "2026-10-12T00:00:00.000Z",
        lastSeenAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        revokedAt: undefined,
        current: false,
      },
    ]),
    revokeDevice: jest.fn(async () => undefined),
    issuePairingCode: jest.fn(async () => ({
      code: "PRY-234",
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      serverUrl: "http://10.0.0.36:4431",
      relay: "wss://relay.chipschat.ai",
      serverKey: "k".repeat(43),
    })),
  };
  return { store: fake as unknown as Store, fake, made };
}

beforeEach(() => {
  mockPushed.length = 0;
  mockShared.length = 0;
  mockBack.mockClear();
});

describe("People", () => {
  it("lists everyone, the longest here first, with the spaces you share and their role", async () => {
    const { store: s } = store(people());
    await render(<People store={s} selfId="per_arjun" workspace="Demo" />);
    expect(screen.getByText("3 in Demo, the longest here first.")).toBeOnTheScreen();
    const priya = screen.getByTestId("person-row-per_priya");
    expect(priya.props["accessibilityLabel"]).toBe("Priya Nair, Member");
    // Arjun and Priya are both in Bakery and Studio; Maya in Bakery.
    expect(screen.getAllByText(/^Bakery and Studio · joined /)).toHaveLength(2);
    expect(screen.getByText(/^Bakery · joined /)).toBeOnTheScreen();
    expect(screen.getByText("Arjun (you)")).toBeOnTheScreen();
    expect(screen.getByLabelText("Owner")).toBeOnTheScreen();
    await userEvent.press(priya);
    expect(mockPushed).toEqual(["/people/per_priya"]);
  });

  it("narrows to a role, offering only roles somebody has", async () => {
    const { store: s } = store(people());
    await render(<People store={s} selfId="per_arjun" workspace="Demo" />);
    expect(screen.getByLabelText("Owners and admins, 2")).toBeOnTheScreen();
    expect(screen.queryByTestId("filter-guest")).toBeNull();
    await userEvent.press(screen.getByTestId("filter-member"));
    expect(screen.getByTestId("person-row-per_priya")).toBeOnTheScreen();
    expect(screen.queryByTestId("person-row-per_maya")).toBeNull();
    await userEvent.press(screen.getByTestId("filter-runs"));
    expect(screen.getByTestId("person-row-per_maya")).toBeOnTheScreen();
    expect(screen.queryByTestId("person-row-per_priya")).toBeNull();
  });

  it("lists an owner nobody named yet as You, once (NP-1)", async () => {
    const { store: s } = store(people({ selfName: "You" }));
    await render(<People store={s} selfId="per_arjun" workspace="Demo" />);
    expect(screen.getByText("You")).toBeOnTheScreen();
    expect(screen.queryByText("You (you)")).toBeNull();
  });

  it("heads an unnamed owner's own page You, once (NP-1)", async () => {
    const { store: s } = store(people({ selfName: "You" }));
    await render(<Person store={s} selfId="per_arjun" personId="per_arjun" workspace="Demo" />);
    expect(screen.getByRole("header", { name: "You" })).toBeOnTheScreen();
    expect(screen.queryByText("You (you)")).toBeNull();
  });
});

describe("a person's page", () => {
  it("says what they can do, the link they came by, and their devices", async () => {
    const { store: s, fake } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_priya" workspace="Demo" />);
    expect(screen.getByRole("header", { name: "What Priya Nair can do" })).toBeOnTheScreen();
    expect(
      screen.getByLabelText("Works in Bakery and Studio, and any space they're added to"),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText("Sees everybody in Demo")).toBeOnTheScreen();
    // Ledger is hers: she sees its agent wherever it is.
    expect(
      screen.getByLabelText("Sees their own agents and the agents in their spaces: Scout"),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText(
        "Can't invite, open a space, or put agents that aren't theirs in a space",
      ),
    ).toBeOnTheScreen();
    expect(await screen.findByText(/^Your member link, made .+, used 2 times$/)).toBeOnTheScreen();
    expect(fake.personDevices).toHaveBeenCalledWith("per_priya");
    expect(await screen.findByText("iPhone 17")).toBeOnTheScreen();
    expect(screen.getByText("Seen 2 h ago")).toBeOnTheScreen();
  });

  it("lists the spaces you share as rows with their faces, each opening its room", async () => {
    const { store: s } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_maya" workspace="Demo" />);
    const spaces = screen.getByTestId("person-spaces");
    const bakery = within(spaces).getByTestId("person-space-sp_bakery");
    expect(within(bakery).getByText("Bakery")).toBeOnTheScreen();
    // Maya is not in Studio: only the room both of them are in.
    expect(within(spaces).queryByTestId("person-space-sp_studio")).toBeNull();
    await fireEvent.press(within(spaces).getByTestId("person-space-sp_bakery"));
    expect(mockPushed).toEqual(["/spaces/sp_bakery"]);
  });

  it("says None yet where you share no space", async () => {
    const snapshot = people();
    const { store: s } = store({
      ...snapshot,
      model: {
        ...snapshot.model,
        spaces: snapshot.model.spaces.filter((each) => each.id === "sp_studio"),
      },
    } as Snapshot);
    await render(<Person store={s} selfId="per_arjun" personId="per_maya" workspace="Demo" />);
    expect(screen.getByTestId("person-no-spaces")).toHaveTextContent("None yet");
  });

  it("says who a member made a guest would stop seeing, before it asks", async () => {
    const { store: s } = store(people());
    const one = people();
    const single = {
      ...one,
      model: { ...one.model, spaces: one.model.spaces.slice(0, 1) },
    } as unknown as Snapshot;
    await render(
      <Person
        store={store(single).store}
        selfId="per_arjun"
        personId="per_priya"
        workspace="Demo"
      />,
    );
    await userEvent.press(screen.getByTestId("person-role"));
    await userEvent.press(screen.getByTestId("role-guest"));
    expect(screen.getByText("Make Priya Nair a guest?")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Priya Nair stays in Bakery, and sees only who's there: Arjun, Maya Chen and Scout.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText(/^You can change it back at any time\.$/)).toBeOnTheScreen();
    expect(s).toBeDefined();
  });

  it("asks before a role changes, saying what they'll be able to do", async () => {
    const { store: s, fake } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_priya" workspace="Demo" />);
    expect(screen.getByTestId("person-space-sp_bakery")).toBeOnTheScreen();
    expect(screen.getByTestId("person-space-sp_studio")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("person-role"));
    // Guest is off: she is in two spaces.
    expect(screen.getByText("In 2 spaces: a guest is in one")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("role-admin"));
    expect(screen.getByText("Make Priya Nair an admin?")).toBeOnTheScreen();
    expect(fake.changeRole).not.toHaveBeenCalled();
    await userEvent.press(screen.getByRole("button", { name: "Make admin" }));
    expect(fake.changeRole).toHaveBeenCalledWith({ participantId: "per_priya", role: "admin" });
  });

  it("removes them from the workspace after asking, in the desktop's words, and goes back", async () => {
    const { store: s, fake } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_priya" workspace="Demo" />);
    await userEvent.press(screen.getByTestId("remove-person"));
    expect(screen.getByText("Remove Priya Nair from Demo?")).toBeOnTheScreen();
    expect(screen.getByText(/Ledger becomes yours/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Remove" }));
    expect(fake.removePerson).toHaveBeenCalledWith("per_priya");
    expect(mockBack).toHaveBeenCalled();
  });

  it("gives an owner a new phone for Priya: a QR her Welcome scans, the code, and a link to send (ADR 0206)", async () => {
    const { store: s, fake } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_priya" workspace="Demo" />);
    expect(
      await screen.findByText(
        /Pair a new phone… is for a phone Priya Nair hasn't used here before/,
      ),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("pair-new-phone"));
    expect(fake.issuePairingCode).toHaveBeenCalledWith("per_priya", undefined);
    expect(await screen.findByText("A new phone for Priya Nair")).toBeOnTheScreen();
    expect(await screen.findByTestId("new-phone-qr")).toBeOnTheScreen();
    expect(screen.getByTestId("new-phone-code")).toHaveTextContent("PRY-234");
    expect(
      screen.getByText(/On Priya Nair's phone, open Chips and choose Scan a QR code/),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Send the link" }));
    // The app's own link: it carries the server's address, its relay and key, to pair from anywhere.
    expect(mockShared[0]).toMatch(/\n\nchips:\/\/pair\?pair=PRY-234&v=1&lan=http/);
    expect(mockShared[0]).toContain("relay=wss");
  });

  it("reconnects Priya's iPhone 17 from its row, the code naming it, and says the old one goes (ADR 0236)", async () => {
    const { store: s, fake } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_priya" workspace="Demo" />);
    await userEvent.press(await screen.findByTestId("person-device-dev_priya"));
    expect(fake.issuePairingCode).toHaveBeenCalledWith("per_priya", "dev_priya");
    expect(await screen.findByText("Reconnect iPhone 17")).toBeOnTheScreen();
    expect(await screen.findByTestId("new-phone-qr")).toBeOnTheScreen();
    expect(
      screen.getByText(
        /It takes this iPhone 17's place, with every space and everything Priya Nair said, and the old one is signed out\./,
      ),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Send the link" }));
    expect(mockShared[0]).toMatch(/^Your Chips, back on your phone: /);
  });

  it("signs out a device of Priya's from its row, and reads the list again (ADR 0236)", async () => {
    const { store: s, fake } = store(people());
    await render(<Person store={s} selfId="per_arjun" personId="per_priya" workspace="Demo" />);
    const row = await screen.findByLabelText("iPhone 17, Seen 2 h ago");
    fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "signOut" } });
    expect(fake.revokeDevice).toHaveBeenCalledWith("dev_priya");
    await waitFor(() => expect(fake.personDevices).toHaveBeenCalledTimes(2));
  });

  it("lets an admin sign out a member's device but not reconnect it, and touch no owner's", async () => {
    const { store: asAdmin } = store(people());
    await render(
      <Person store={asAdmin} selfId="per_maya" personId="per_priya" workspace="Demo" />,
    );
    expect(await screen.findByLabelText("iPhone 17, Seen 2 h ago")).toBeOnTheScreen();
    expect(
      screen.getByTestId("person-device-dev_priya").props["accessibilityRole"],
    ).toBeUndefined();
    expect(
      screen.getByText("Push a device of Priya Nair's left to sign it out."),
    ).toBeOnTheScreen();
    const { store: onOwner } = store(people());
    await render(
      <Person store={onOwner} selfId="per_maya" personId="per_arjun" workspace="Demo" />,
    );
    expect(await screen.findByText("iPhone 17")).toBeOnTheScreen();
    expect(screen.queryByLabelText("iPhone 17, Seen 2 h ago")).toBeNull();
  });

  it("offers no new phone to an admin, to anyone on their own page, or for themselves", async () => {
    const { store: asAdmin } = store(people());
    await render(
      <Person store={asAdmin} selfId="per_maya" personId="per_priya" workspace="Demo" />,
    );
    expect(screen.queryByTestId("pair-new-phone")).toBeNull();
    const { store: own } = store(people());
    await render(<Person store={own} selfId="per_arjun" personId="per_arjun" workspace="Demo" />);
    expect(screen.queryByTestId("pair-new-phone")).toBeNull();
  });

  it("offers an admin no Remove on an owner, and no role to give one", async () => {
    const { store: s } = store(people());
    await render(<Person store={s} selfId="per_maya" personId="per_arjun" workspace="Demo" />);
    expect(screen.queryByTestId("remove-person")).toBeNull();
    expect(screen.getByTestId("person-role").props["accessibilityRole"]).toBeUndefined();
  });
});

describe("Invite someone", () => {
  it("makes a link as what and how often, for 30 minutes, shares it, and copies it", async () => {
    const { store: s, made } = store(people());
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    await userEvent.press(screen.getByRole("radio", { name: "Guest" }));
    expect(screen.getByTestId("invite-role-means")).toHaveTextContent(
      "A guest in no space sees nobody until somebody adds them to one.",
    );
    // Can be used says what it means; every link lasts 30 minutes, with nothing to choose (ADR 0232).
    expect(screen.getByTestId("invite-uses-means")).toHaveTextContent(
      "The first person to join by it uses it up. Unused, it stops working after 30 minutes.",
    );
    expect(screen.queryByRole("radio", { name: "A day" })).toBeNull();
    await userEvent.press(screen.getByRole("radio", { name: "By several" }));
    expect(screen.getByTestId("invite-uses-means")).toHaveTextContent(/^Everyone you send it to/);
    await userEvent.press(screen.getByRole("radio", { name: "Once" }));
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    expect(made).toEqual([{ role: "guest", singleUse: true }]);
    expect(await screen.findByTestId("invite-url")).toHaveTextContent(/#invite=chips_inv_new/);
    await userEvent.press(screen.getByRole("button", { name: "Share…" }));
    // How to get Chips first, then the link, which a tap opens in Chips (ADR 0207).
    expect(mockShared).toEqual([
      "No Chips yet? Get it on the App Store for iPhone or iPad: https://apps.apple.com/app/id6824148802\n\nThen tap this link to join:\n\nhttps://adas-mac-mini.tail2f9c1e.ts.net/#invite=chips_inv_new",
    ]);
    await userEvent.press(screen.getByRole("button", { name: "Copy" }));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(
      "https://adas-mac-mini.tail2f9c1e.ts.net/#invite=chips_inv_new",
    );
    // For somebody beside you, who scans it with Chips (ADR 0164), shown with the link.
    expect(screen.getByTestId("invite-qr")).toBeOnTheScreen();
    expect(screen.getByText(/they scan it with Chips/)).toBeOnTheScreen();
    // And the card it opens to, in the join card's words.
    expect(screen.getByTestId("join-preview")).toHaveTextContent(
      /Arjun invited you to Demo as a guest\./,
    );
    // The server's own address: it says where that opens, and offers an owner the relay.
    expect(screen.getByTestId("invite-relay-off")).toHaveTextContent(
      "The relay is off, so this link opens only on your tailnet.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Turn on the relay" }));
    expect(mockPushed).toContain("/relay");
  });

  it("glides down to the link it made, so its QR code isn't left below the fold", async () => {
    const { store: s } = store(people());
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    // The page as a phone holds it: 700 points of a list that is 1,500 tall once the link is in.
    const list = screen.getByTestId("invite-page");
    await fireEvent(list, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 700 } },
    });
    const scrollTo = jest.mocked(ScrollView.prototype.scrollTo);
    scrollTo.mockClear();
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    await fireEvent(list, "contentSizeChange", 393, 1500);
    const card = { x: 16, y: 560, width: 361, height: 480 };
    await fireEvent(await screen.findByTestId("issued-invite"), "layout", {
      nativeEvent: { layout: card },
    });
    // Down until the card, with its room above it, stands at the top: over frames, not at once.
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith({ y: card.y - 12, animated: false }),
    );
    expect(scrollTo.mock.calls.length).toBeGreaterThan(2);
  });

  it("says nothing of where the relay's link opens, since it opens anywhere", async () => {
    const { store: s } = store(people(), RELAY_LINK);
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    expect(await screen.findByTestId("invite-url")).toHaveTextContent(/relay\.chipschat\.ai\/join/);
    expect(screen.queryByTestId("invite-relay-off")).toBeNull();
    expect(screen.queryByTestId("invite-turn-on-relay")).toBeNull();
    // It asks (ADR 0232): the maker learns where the Allow comes up.
    expect(screen.getByTestId("invite-asks")).toHaveTextContent(
      "When somebody opens it, you'll be asked to allow them wherever you have Chips open.",
    );
  });

  it("shows a link made once as used when somebody has joined by it, with nothing to share", async () => {
    const snapshot = people();
    const joined = {
      ...snapshot,
      model: {
        ...snapshot.model,
        people: {
          ...snapshot.model.people,
          per_bea: {
            participantId: "per_bea",
            displayName: "Bea",
            role: "guest",
            joinedAt: "2026-10-30T00:00:00.000Z",
            invitedBy: "per_arjun",
            inviteId: "inv_new",
          },
        },
      },
      directory: {
        ...snapshot.directory,
        per_bea: { id: "per_bea", kind: "person", displayName: "Bea" },
      },
    } as Snapshot;
    const { store: s } = store(joined, RELAY_LINK);
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    expect(await screen.findByTestId("invite-used")).toHaveTextContent("Used: Bea joined by it.");
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Share…" })).toBeNull();
    expect(screen.queryByTestId("invite-qr")).toBeNull();
    expect(screen.queryByTestId("invite-asks")).toBeNull();
  });

  it("says a link opens only on the tailnet while an owner has the relay off (ADR 0211)", async () => {
    const snapshot = people();
    const off = {
      ...snapshot,
      model: {
        ...snapshot.model,
        relay: { on: false, by: "per_arjun", at: "2026-10-21T09:05:00.000Z" },
      },
    } as Snapshot;
    const { store: s } = store(off);
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    expect(await screen.findByTestId("invite-relay-off")).toHaveTextContent(
      "The relay is off, so this link opens only on your tailnet.",
    );
  });

  it("brings them into a room, saying who they'll find there", async () => {
    const { store: s, made } = store(people());
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    expect(screen.getByTestId("invite-role-means")).toHaveTextContent(
      "A member sees everybody here, and only the agents in their spaces: none until they're added to one.",
    );
    await userEvent.press(screen.getByRole("radio", { name: "Guest" }));
    await userEvent.press(screen.getByTestId("into-sp_bakery"));
    expect(screen.getByTestId("invite-into-means")).toHaveTextContent(
      "They land in Bakery, and stay there: a guest is in one space.",
    );
    expect(screen.getByTestId("invite-role-means")).toHaveTextContent(
      "A guest in Bakery sees only who's there: Arjun, Maya Chen, Priya Nair and Scout. Nothing else in Demo.",
    );
    // An admin's link names no room.
    await userEvent.press(screen.getByRole("radio", { name: "Admin" }));
    expect(screen.getByTestId("invite-into-means")).toHaveTextContent(/is for a guest or a member/);
    await userEvent.press(screen.getByRole("radio", { name: "Guest" }));
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    expect(made).toEqual([{ role: "guest", singleUse: true, spaceId: "sp_bakery" }]);
  });

  it("lists the open links, and withdraws one", async () => {
    const { store: s, fake } = store(people());
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    const row = await screen.findByTestId("invite-row-inv_open");
    // Open, and under Used, since Priya came by it.
    expect(screen.getAllByText("Member · by several, used 2 times")).toHaveLength(2);
    expect(screen.getByText(/^\d+ days left · until /)).toBeOnTheScreen();
    expect(screen.getByTestId("used-inv_open")).toBeOnTheScreen();
    expect(screen.getByText(/^Priya Nair joined by it, /)).toBeOnTheScreen();
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "withdraw" } });
    expect(fake.revokeInvite).toHaveBeenCalledWith("inv_open");
    expect(await screen.findByTestId("no-links")).toBeOnTheScreen();
  });

  it("asks an owner still called You for a name first", async () => {
    const { store: s } = store(people({ selfName: "You" }));
    await render(<Invite store={s} selfId="per_arjun" workspace="Demo" />);
    expect(screen.getByTestId("name-first")).toBeOnTheScreen();
  });
});
