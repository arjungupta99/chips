/**
 * Joining by an invite on the phone (ADR 0164): the card a phone in no workspace sees, which reads
 * the link through the relay when it must and joins by the same way; the sheet a phone already in
 * a workspace sees, which opens the one it is in or asks before signing out of it for another;
 * and a link pasted on the first screen. A space's link (ADR 0168) lands in its space: the card
 * says so, and the sheet opens a space the person is in, or lets them into one they are not.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { render as renderBare, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { JoinCard } from "./JoinCard";
import { JoinSheet } from "./JoinSheet";
import type { InviteOffer } from "./useInvite";
import { NO_INVITE, usePasteInvite } from "./usePasteInvite";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockLink = { kind: "relay", fetch: jest.fn(), socket: jest.fn(), close: jest.fn() };
jest.mock("@chipschat/core", () => ({
  ...jest.requireActual("@chipschat/core"),
  establishLink: jest.fn(async () => mockLink),
  peekInvite: jest.fn(),
  joinByInvite: jest.fn(),
  forgetDevice: jest.fn(async () => undefined),
}));
const core = jest.requireMock("@chipschat/core") as {
  establishLink: jest.Mock;
  peekInvite: jest.Mock;
  joinByInvite: jest.Mock;
  forgetDevice: jest.Mock;
};

const mockBegan = jest.fn();
/** The workspaces the phone holds, beside the one a sheet opens in (ADR 0197). */
let mockHeld: unknown[] = [];
jest.mock("../store/provider", () => ({
  deviceStorage: { kind: "phone storage" },
  useChips: () => ({
    ready: true,
    paired: undefined,
    devices: mockHeld,
    began: mockBegan,
    ended: jest.fn(),
  }),
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));
jest.mock("../device/storage", () => ({ deviceStorage: { kind: "phone storage" } }));
jest.mock("../spaces/Composer", () => ({ forgetDrafts: jest.fn() }));
jest.mock("./usePairing", () => ({ phoneName: () => "iPhone 17" }));
const mockPushed: unknown[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: (to: unknown) => mockPushed.push(to),
    replace: (to: unknown) => mockPushed.push(to),
  }),
}));

const REACH = { serverKey: "k".repeat(43), relayUrl: "wss://relay.example" };
const OFFER: InviteOffer = {
  token: "chips_inv_1",
  serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
  ...REACH,
};
const DEMO = {
  inviteId: "inv_1",
  workspaceId: "ws_demo",
  workspaceName: "Demo",
  role: "member" as const,
  singleUse: true,
  expiresAt: "2099-10-21T00:00:00.000Z",
  invitedByName: "Arjun",
};
const JOINED = {
  deviceId: "dev_new",
  participantId: "usr_priya",
  workspaceId: "ws_demo",
  displayName: "Priya Nair",
  privateKey: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPushed.length = 0;
  core.peekInvite.mockResolvedValue(DEMO);
  core.joinByInvite.mockResolvedValue(JOINED);
});

describe("the join card, on a phone in no workspace", () => {
  it("says who invited you, where to and as what, and joins by the way it read the link", async () => {
    const joined = jest.fn();
    await render(<JoinCard offer={OFFER} onJoined={joined} onCancel={jest.fn()} />);
    expect(await screen.findByText("Join Demo")).toBeOnTheScreen();
    expect(screen.getByText("Arjun invited you to Demo as a member.")).toBeOnTheScreen();
    expect(screen.getByText(/A member works in the spaces they're added to/)).toBeOnTheScreen();
    // What a newcomer would ask: there is nothing to set up.
    expect(
      screen.getByText("Nothing to set up: the agents there come with Demo."),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("join-through-relay")).toBeOnTheScreen();
    expect(core.establishLink).toHaveBeenCalledWith({ serverUrl: OFFER.serverUrl, ...REACH });
    expect(core.peekInvite).toHaveBeenCalledWith("chips_inv_1", OFFER.serverUrl, mockLink);

    await userEvent.type(screen.getByTestId("join-name"), "Priya Nair");
    await userEvent.press(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(joined).toHaveBeenCalledWith(JOINED, undefined));
    expect(core.joinByInvite).toHaveBeenCalledWith(
      "chips_inv_1",
      "Priya Nair",
      "iPhone 17",
      OFFER.serverUrl,
      { kind: "phone storage" },
      { link: mockLink, ...REACH },
      // What it waits with, should the link ask (ADR 0232).
      expect.objectContaining({ onWaiting: expect.any(Function) }),
    );
    // The tunnel is the new device's now: leaving the card does not close it.
    screen.unmount();
    expect(mockLink.close).not.toHaveBeenCalled();
  });

  it("says a name somebody there goes by, and joins under another on the same link (JR-1)", async () => {
    const { PairingError } = jest.requireActual("@chipschat/core");
    core.joinByInvite.mockRejectedValueOnce(
      new PairingError("Somebody here goes by Priya already.", "name_taken"),
    );
    const joined = jest.fn();
    await render(<JoinCard offer={OFFER} onJoined={joined} onCancel={jest.fn()} />);
    await screen.findByText("Join Demo");
    await userEvent.type(screen.getByTestId("join-name"), "Priya");
    await userEvent.press(screen.getByRole("button", { name: "Join" }));
    expect(await screen.findByTestId("join-failed")).toHaveTextContent(
      "Somebody here goes by Priya already.",
    );
    // The name stays where it was typed, to be added to.
    await userEvent.type(screen.getByTestId("join-name"), " Nair");
    await userEvent.press(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(joined).toHaveBeenCalledWith(JOINED, undefined));
    expect(core.joinByInvite.mock.calls.map((call) => call[1])).toEqual(["Priya", "Priya Nair"]);
  });

  it("says a used link can't be used, and offers another paste or pairing", async () => {
    core.peekInvite.mockRejectedValue(
      new (jest.requireActual("@chipschat/core").PairingError)("That invite is not valid."),
    );
    await render(<JoinCard offer={OFFER} onJoined={jest.fn()} onCancel={jest.fn()} />);
    expect(await screen.findByText("This invite can't be used")).toBeOnTheScreen();
    expect(screen.getByText(/Ask whoever sent it for a new link/)).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Paste another link" })).toBeOnTheScreen();
    expect(mockLink.close).toHaveBeenCalled();
  });

  it("says when the server can't be reached, and tries again", async () => {
    core.establishLink.mockRejectedValueOnce(new Error("relay unreachable"));
    await render(<JoinCard offer={OFFER} onJoined={jest.fn()} onCancel={jest.fn()} />);
    expect(await screen.findByTestId("join-trouble")).toHaveTextContent(
      "Chips couldn't reach the server this invite is for, on its network or through its relay (relay unreachable).",
    );
    await userEvent.press(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Join Demo")).toBeOnTheScreen();
  });

  it("says why in the system's words, not in Expo's and Swift's", async () => {
    core.establishLink.mockRejectedValueOnce(
      new Error(
        "fetch failed: UnexpectedException: Could not connect to the server. (at ExpoModulesCore/Promise.swift:56)",
      ),
    );
    await render(<JoinCard offer={OFFER} onJoined={jest.fn()} onCancel={jest.fn()} />);
    expect(await screen.findByTestId("join-trouble")).toHaveTextContent(
      "Chips couldn't reach the server this invite is for, on its network or through its relay (Could not connect to the server).",
    );
  });
});

function paired(
  workspaceId: string,
  world: {
    role?: string;
    spaces?: { id: string; title: string; members: string[] }[];
    /** Who let her into the workspace she is in; nobody, for its first person. */
    invitedBy?: string;
  } = { invitedBy: "usr_arjun" },
) {
  const snapshot = {
    directory: { usr_priya: { id: "usr_priya", kind: "person", displayName: "Priya Nair" } },
    model: {
      people: {
        usr_priya: {
          participantId: "usr_priya",
          role: world.role ?? "member",
          invitedBy: world.invitedBy,
        },
      },
      spaces: world.spaces ?? [],
    },
  } as unknown as Snapshot;
  const store = {
    getSnapshot: () => snapshot,
    revokeDevice: jest.fn(async () => undefined),
    enterByInvite: jest.fn(async () => ({ spaceId: "spc_bakery", already: false })),
  };
  return {
    device: {
      deviceId: "dev_here",
      participantId: "usr_priya",
      workspaceId,
      workspaceName: workspaceId === "ws_demo" ? "Demo" : "Bakehouse",
      displayName: "Priya",
      privateKey: {} as CryptoKey,
    },
    store: store as unknown as Store,
    revoke: store.revokeDevice,
    enter: store.enterByInvite,
  };
}

describe("the join sheet, on a phone in a workspace", () => {
  it("opens the workspace it is in already, and leaves the link unused", async () => {
    const here = paired("ws_demo");
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={here} onDone={done} />);
    expect(await screen.findByText("You're already in Demo")).toBeOnTheScreen();
    expect(screen.getByText(/As Priya Nair, on this phone/)).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Open Demo" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(undefined, undefined));
    expect(core.joinByInvite).not.toHaveBeenCalled();
  });

  it("joins another workspace alongside, the one it is in staying (ADR 0197)", async () => {
    const here = paired("ws_bakehouse");
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={here} onDone={done} />);
    expect(await screen.findByText("Join Demo too?")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Bakehouse stays on this phone. Switch between them from the top of Spaces.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Not now" })).toBeOnTheScreen();

    await userEvent.press(screen.getByRole("button", { name: "Join Demo" }));
    // Into the workspace joined once the sheet has gone; the one it was in is kept.
    await waitFor(() => expect(done).toHaveBeenCalledWith(JOINED, undefined));
    // Under the name you go by here.
    expect(core.joinByInvite.mock.calls[0]?.[1]).toBe("Priya Nair");
    expect(here.revoke).not.toHaveBeenCalled();
    expect(core.forgetDevice).not.toHaveBeenCalled();
  });

  it("asks for another name when the one you go by is taken there, and joins under it (ADR 0197)", async () => {
    const { PairingError } = jest.requireActual("@chipschat/core");
    core.joinByInvite.mockRejectedValueOnce(
      new PairingError("Somebody here goes by Priya Nair already.", "name_taken"),
    );
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={paired("ws_bakehouse")} onDone={done} />);
    expect(await screen.findByText("Join Demo too?")).toBeOnTheScreen();
    expect(screen.queryByTestId("join-sheet-name")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Join Demo" }));

    // Why, in the sheet's words, and the name tried in a field to change; the link is unspent.
    expect(await screen.findByTestId("confirm-failed")).toHaveTextContent(
      "The name Priya Nair is taken in Demo. Join under another one.",
    );
    const field = screen.getByTestId("join-sheet-name");
    expect(field).toHaveDisplayValue("Priya Nair");
    expect(screen.queryByText(/You join as/)).toBeNull();
    expect(done).not.toHaveBeenCalled();

    // A blank name is not sent.
    await userEvent.clear(field);
    await userEvent.press(screen.getByRole("button", { name: "Join Demo" }));
    expect(core.joinByInvite).toHaveBeenCalledTimes(1);

    await userEvent.type(field, "Priya N.");
    await userEvent.press(screen.getByRole("button", { name: "Join Demo" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(JOINED, undefined));
    expect(core.joinByInvite.mock.calls.map((call) => call[1])).toEqual(["Priya Nair", "Priya N."]);
  });

  it("from Look around, asks for a name first, since the demo calls everybody You (the onboarding audit, item 27)", async () => {
    const { DEMO_DEVICE_ID } = jest.requireActual("@chipschat/core");
    const demo = paired("ws_bakehouse");
    const inDemo = { ...demo, device: { ...demo.device, deviceId: DEMO_DEVICE_ID } };
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={inDemo} onDone={done} />);
    expect(await screen.findByText("Join Demo too?")).toBeOnTheScreen();
    const field = screen.getByTestId("join-sheet-name");
    expect(field).toHaveDisplayValue("");
    expect(screen.queryByText(/You join as/)).toBeNull();
    await userEvent.type(field, "Sam");
    await userEvent.press(screen.getByRole("button", { name: "Join Demo" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(JOINED, undefined));
    expect(core.joinByInvite.mock.calls[0]?.[1]).toBe("Sam");
  });

  it("asks for no name when the join is refused for anything else", async () => {
    const { PairingError } = jest.requireActual("@chipschat/core");
    core.joinByInvite.mockRejectedValueOnce(new PairingError("That device is paired already."));
    await render(<JoinSheet offer={OFFER} paired={paired("ws_bakehouse")} onDone={jest.fn()} />);
    await userEvent.press(await screen.findByRole("button", { name: "Join Demo" }));
    expect(await screen.findByTestId("confirm-failed")).toHaveTextContent(
      "That device is paired already.",
    );
    expect(screen.queryByTestId("join-sheet-name")).toBeNull();
    expect(screen.getByText(/You join as Priya Nair/)).toBeOnTheScreen();
  });

  it("switches to a workspace it holds behind the one in front, and leaves the link unused", async () => {
    const demo = { deviceId: "dev_demo", workspaceId: "ws_demo", workspaceName: "Demo" };
    mockHeld = [demo];
    try {
      const done = jest.fn();
      await render(<JoinSheet offer={OFFER} paired={paired("ws_bakehouse")} onDone={done} />);
      expect(await screen.findByText("You're in Demo on this phone")).toBeOnTheScreen();
      await userEvent.press(screen.getByRole("button", { name: "Switch to Demo" }));
      await waitFor(() => expect(done).toHaveBeenCalledWith(demo, undefined));
      expect(core.joinByInvite).not.toHaveBeenCalled();
    } finally {
      mockHeld = [];
    }
  });
});

describe("a space's link (ADR 0168)", () => {
  const BAKERY_LINK = {
    ...DEMO,
    role: "guest" as const,
    spaceId: "spc_bakery",
    spaceName: "Bakery",
  };
  beforeEach(() => core.peekInvite.mockResolvedValue(BAKERY_LINK));

  it("names the space on the card, and joining says which space to land in", async () => {
    const joined = jest.fn();
    await render(<JoinCard offer={OFFER} onJoined={joined} onCancel={jest.fn()} />);
    expect(await screen.findByText("Join Bakery")).toBeOnTheScreen();
    expect(screen.getByText("Arjun invited you to Bakery in Demo as a guest.")).toBeOnTheScreen();
    expect(
      screen.getByText("A guest is in Bakery only, and sees only the people and agents there."),
    ).toBeOnTheScreen();
    await userEvent.type(screen.getByTestId("join-name"), "Priya Nair");
    await userEvent.press(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(joined).toHaveBeenCalledWith(JOINED, "spc_bakery"));
  });

  it("asks somebody in Demo but not in Bakery, lets them in, and leaves the link unused", async () => {
    const here = paired("ws_demo", {
      spaces: [{ id: "spc_studio", title: "Studio", members: ["usr_priya"] }],
    });
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={here} onDone={done} />);
    expect(await screen.findByText("Join Bakery?")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Arjun's link to Bakery, in Demo. You're in Demo as Priya Nair, so it adds you to Bakery. The link stays unused, so it can go to somebody else.",
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Not now" })).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Join Bakery" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(undefined, "spc_bakery"));
    expect(here.enter).toHaveBeenCalledWith("chips_inv_1");
    expect(core.joinByInvite).not.toHaveBeenCalled();
  });

  it("opens Bakery for somebody in it already", async () => {
    const here = paired("ws_demo", {
      spaces: [{ id: "spc_bakery", title: "Bakery", members: ["usr_priya"] }],
    });
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={here} onDone={done} />);
    expect(await screen.findByText("You're already in Bakery")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Open Bakery" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(undefined, "spc_bakery"));
    expect(here.enter).not.toHaveBeenCalled();
  });

  it("tells a guest in another space that a guest is in one", async () => {
    const here = paired("ws_demo", {
      role: "guest",
      spaces: [{ id: "spc_studio", title: "Studio", members: ["usr_priya"] }],
    });
    await render(<JoinSheet offer={OFFER} paired={here} onDone={jest.fn()} />);
    expect(await screen.findByText("A guest is in one space")).toBeOnTheScreen();
    expect(
      screen.getByText(
        "You're a guest in Studio, so this link can't add you to Bakery. Ask Arjun to make you a member.",
      ),
    ).toBeOnTheScreen();
    expect(here.enter).not.toHaveBeenCalled();
  });

  it("from another workspace, joins and lands in Bakery", async () => {
    const here = paired("ws_bakehouse");
    const done = jest.fn();
    await render(<JoinSheet offer={OFFER} paired={here} onDone={done} />);
    expect(await screen.findByText("Join Demo too?")).toBeOnTheScreen();
    expect(screen.getByText("Arjun invited you to Bakery in Demo as a guest.")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Join Demo" }));
    await waitFor(() => expect(done).toHaveBeenCalledWith(JOINED, "spc_bakery"));
  });
});

function Paste() {
  const { paste, problem } = usePasteInvite();
  return (
    <>
      <PasteButton onPress={paste} />
      {problem === undefined ? null : <Said words={problem} />}
    </>
  );
}
const { Pressable, Text } = jest.requireActual("react-native");
function PasteButton({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Text>Paste</Text>
    </Pressable>
  );
}
function Said({ words }: { readonly words: string }) {
  return <Text>{words}</Text>;
}

describe("an invite pasted on the first screen", () => {
  it("opens the join card on the link, wherever in the message it was", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce(
      "Here's your link https://host.example/#invite=chips_inv_9&relay=wss%3A%2F%2Fr&key=" +
        "k".repeat(43),
    );
    await render(<Paste />);
    await userEvent.press(screen.getByRole("button", { name: "Paste" }));
    await waitFor(() =>
      expect(mockPushed).toEqual([
        {
          pathname: "/join",
          params: {
            invite: "chips_inv_9",
            lan: "https://host.example",
            relay: "wss://r",
            key: "k".repeat(43),
          },
        },
      ]),
    );
  });

  it("says so when the clipboard holds no invite", async () => {
    (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce("https://example.com/menu");
    await render(<Paste />);
    await userEvent.press(screen.getByRole("button", { name: "Paste" }));
    expect(await screen.findByText(NO_INVITE)).toBeOnTheScreen();
    expect(mockPushed).toEqual([]);
  });

  it("opens what iOS's own Paste button hands over, without reading the clipboard", async () => {
    const reads = (Clipboard.getStringAsync as jest.Mock).mock.calls.length;
    await render(
      <Handed text={`Tap it: https://host.example/#invite=chips_inv_7&key=${"k".repeat(43)}`} />,
    );
    await userEvent.press(screen.getByRole("button", { name: "Hand over" }));
    await waitFor(() =>
      expect(mockPushed).toEqual([
        {
          pathname: "/join",
          params: { invite: "chips_inv_7", lan: "https://host.example", key: "k".repeat(43) },
        },
      ]),
    );
    expect((Clipboard.getStringAsync as jest.Mock).mock.calls.length).toBe(reads);
  });
});

describe("a new phone's link pasted on the first screen (ADR 0206)", () => {
  it("pairs with the link in the message instead of saying there is no invite", async () => {
    const paired: string[] = [];
    const link = `chips://pair?pair=PRY-234&v=1&lan=http%3A%2F%2F10.0.0.36%3A4431&key=${"k".repeat(43)}`;
    function NewPhone() {
      const { pasted, problem } = usePasteInvite({
        orPair: (text) => {
          const found = text.includes("pair=") ? text.split(/\s+/).at(-1) : undefined;
          if (found === undefined) return false;
          paired.push(found);
          return true;
        },
      });
      return (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => pasted(`Your Chips, on your new phone.\n\n${link}`)}
          >
            <Text>Hand over</Text>
          </Pressable>
          {problem === undefined ? null : <Said words={problem} />}
        </>
      );
    }
    await render(<NewPhone />);
    await userEvent.press(screen.getByRole("button", { name: "Hand over" }));
    expect(paired).toEqual([link]);
    expect(screen.queryByText(NO_INVITE)).toBeNull();
    expect(mockPushed).toEqual([]);
  });
});

/** What iOS's Paste button does: hands the hook what was copied. */
function Handed({ text }: { readonly text: string }) {
  const { pasted } = usePasteInvite();
  return (
    <Pressable accessibilityRole="button" onPress={() => pasted(text)}>
      <Text>Hand over</Text>
    </Pressable>
  );
}
