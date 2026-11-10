/**
 * The You screen, as a settings list (ADR 0085): who you are and the workspace in front at the
 * top, the rows that say what each setting is at, one card under each heading, the workspace's own
 * group for the people who run it, what this phone keeps and which build it is, the devices that
 * hold your key, and a sign-out that reaches the server. The notification sheets, the push switch
 * and the workspace row have their own files. On an iPad, beside the list, the rows' sheets are
 * pages in the pane, and the row stays chosen while its page is open; on a phone they are sheets.
 */

import type { Device, Store } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { type ReactElement, type ReactNode, useState } from "react";
import { Alert, type AlertButton, Dimensions, Share } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { drawLibrary } from "../testing/picker";
import { chooseFaceTheme } from "../ui/faceTheme";
import type { Opened } from "../ui/opened";
import { buildWords } from "./About";
import { ARRIVAL_POLL_MS, arrivedSince } from "./PairSheet";
import { isYouPage, isYouThird, YouBeside, type YouPage } from "./pages";
import { useYou, You } from "./You";
import { YouPane, youThird } from "./YouPane";

/**
 * A tab's name floats over its list on iOS, and asks for the safe area to know where the status
 * bar ends (`ui/Screen.tsx`), so every render here gets a provider with an iPhone's metrics — as
 * the app always has one, from the router. A wrapper, so a re-render keeps it.
 */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockReplaced: string[] = [];
const mockPushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: (to: string) => mockReplaced.push(to),
    push: (to: string) => mockPushed.push(to),
  }),
  // You is in view as it renders here; it measures what is kept then, as on coming back.
  useFocusEffect: (effect: () => void) => require("react").useEffect(effect, [effect]),
}));
const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { appearance: "appearance", faces: "faces", push: "push" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));
const mockEnded = jest.fn();
/** The workspaces this phone holds; none but the one in front unless a test says. */
let mockHeld: unknown[] = [];
jest.mock("../store/provider", () => ({
  deviceStorage: {},
  useChips: () => ({
    ready: true,
    paired: undefined,
    devices: mockHeld,
    others: { stores: new Map(), needs: {}, decides: {} },
    began: () => {},
    ended: mockEnded,
    switchTo: async () => {},
    mute: async () => {},
  }),
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  useDeferredSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));
// Connect a harness's pages are the app's (`harnesses/Connect.tsx`); here, only that the row opens
// them (beside the list, You's pane holds them: ADR 0284's addendum).
const mockConnect: {
  open: jest.Mock;
  waiting: { left: string; share: number; taken: boolean } | undefined;
  newAgent: jest.Mock;
} = { open: jest.fn(), waiting: undefined, newAgent: jest.fn() };
jest.mock("../harnesses/Connect", () => ({ useConnect: () => mockConnect }));
const mockKept = { bytes: 212 * 1024 * 1024 };
jest.mock("../spaces/local", () => ({
  keptBytes: async () => mockKept.bytes,
}));
jest.mock("@chipschat/core", () => ({
  ...jest.requireActual("@chipschat/core"),
  forgetDevice: jest.fn(async () => undefined),
}));
const core = jest.requireMock("@chipschat/core") as { forgetDevice: jest.Mock };

const DEVICE = {
  deviceId: "dev_1",
  workspaceId: "ws_1",
  workspaceName: "Northwind",
  participantId: "per_arjun",
  displayName: "Arjun's iPhone",
  serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
} as unknown as Device;

/** The same phone, which knows the server's relay. */
const RELAYED = { ...DEVICE, relayUrl: "wss://relay.chipschat.ai" } as Device;

const MB = 1024 * 1024;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

const DEVICES = [
  { deviceId: "dev_1", name: "iPhone 17 Pro", current: true, pairedAt: ago(20) },
  {
    deviceId: "dev_2",
    name: "Chips for Mac",
    current: false,
    pairedAt: ago(20),
    lastSeenAt: ago(0.1),
  },
  {
    deviceId: "dev_3",
    name: "Safari on Mac",
    current: false,
    pairedAt: ago(40),
    lastSeenAt: ago(45),
  },
  { deviceId: "dev_4", name: "An old phone", current: false, pairedAt: ago(9), revokedAt: ago(1) },
];

/** One of Scout's asks, answered by Arjun. */
const asked = (id: string, question: string, minute: number, decision: string) => ({
  approvalId: id,
  runId: "run_scout",
  actionKind: "shell.exec",
  askedAt: `2026-11-01T10:0${minute}:00.000Z`,
  question,
  risk: [],
  sources: [],
  editable: false,
  fallback: "deny",
  approvers: [],
  resolved: {
    decision,
    by: "per_arjun",
    at: `2026-11-01T10:0${minute}:30.000Z`,
    scope: "once",
    elsewhere: false,
  },
});

/** A room where Scout asked twice: a yes, then a no. */
const ASKED_ROOM = {
  id: "spc_asked",
  title: "Tic tac toe",
  kind: "room",
  members: ["per_arjun", "har_scout"],
  roles: {},
  state: "open",
  lines: [],
  runs: [
    {
      runId: "run_scout",
      harnessId: "har_scout",
      approvals: [
        asked("apr_1", "Run npm test?", 1, "approved"),
        asked("apr_2", "Push to main?", 2, "denied"),
      ],
    },
  ],
};

/** A room Scout was let work in without asking, until stopped (ADR 0281). */
const WORKING_ROOM = {
  id: "spc_explain",
  title: "Chips explain",
  kind: "room",
  members: ["per_arjun", "har_scout"],
  roles: {},
  state: "open",
  lines: [],
  runs: [],
  letWork: [{ asker: "har_scout", by: "per_arjun", since: "2026-11-06T09:50:00.000Z" }],
};

function fake(
  over: {
    role?: string;
    caps?: { image: number | null; video: number | null; file: number | null };
    limits?: { stop: number | null; hold: number | null; circles: boolean };
    /** What the directory calls this person, once it has been read. */
    name?: string;
    /** What the server says to a rename: nothing, or why not. */
    refuse?: string;
    /** The face this person chose, once the directory has been read. */
    face?: unknown;
    connection?: string;
    link?: string;
    /** The server names a relay under a key this phone did not pin (SEC-2). */
    rekeyed?: boolean;
    /** Scout's rules, a person's Always among them (ADR 0195). */
    rules?: unknown[];
    /** The relay as an owner last turned it (ADR 0211, Phase 4). */
    relay?: { on: boolean; by: string; at: string };
    /** Why the server refuses to delete the account, when it does (ADR 0243). */
    refuseDelete?: string;
    /** Scout's asks so far in a room of its own, answered yes and then no (ADR 0255). */
    asks?: boolean;
    /** Scout let work without asking in a room (ADR 0281). */
    working?: boolean;
  } = {},
) {
  const snapshot = {
    connection: over.connection ?? "open",
    link: over.link ?? "direct",
    ...(over.rekeyed === true ? { rekeyed: true } : {}),
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    directory: {
      har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
      ...(over.name === undefined
        ? {}
        : {
            per_arjun: {
              id: "per_arjun",
              kind: "person",
              displayName: over.name,
              ...(over.face === undefined ? {} : { face: over.face }),
            },
          }),
    },
    model: {
      needsYou: [],
      lanes: [],
      fleet: [],
      harnesses:
        over.rules === undefined
          ? {}
          : {
              har_scout: {
                harnessId: "har_scout",
                autonomy: 1,
                maxAutonomy: 2,
                rules: over.rules,
                budgetUsd: 20,
                spentUsd: 0,
                bySpace: {},
              },
            },
      spaces: [ASKED_ROOM, WORKING_ROOM].filter(
        (room) => (room === ASKED_ROOM ? over.asks : over.working) === true,
      ),
      people: { per_arjun: { participantId: "per_arjun", role: over.role ?? "owner" } },
      attachmentCaps: over.caps ?? { image: null, video: null, file: null },
      exchangeLimits: over.limits ?? { stop: 16, hold: 48, circles: true },
      takenOut: {},
      ...(over.relay === undefined ? {} : { relay: over.relay }),
    },
  };
  const calls: { name: string; args: unknown }[] = [];
  let devices = DEVICES.map((each) => ({ lastSeenAt: undefined, revokedAt: undefined, ...each }));
  return {
    calls,
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    wake: () => undefined,
    setAttachmentCaps: (caps: unknown) => calls.push({ name: "setAttachmentCaps", args: caps }),
    setExchangeLimits: (limits: unknown) => calls.push({ name: "setExchangeLimits", args: limits }),
    setRules: (input: unknown) => calls.push({ name: "setRules", args: input }),
    stopLetWork: (input: unknown) => calls.push({ name: "stopLetWork", args: input }),
    rename: async (name: string) => {
      calls.push({ name: "rename", args: name });
      if (over.refuse !== undefined) throw new Error(over.refuse);
    },
    setMyFace: async (face: unknown) => {
      calls.push({ name: "setMyFace", args: face });
    },
    deleteAccount: async () => {
      calls.push({ name: "deleteAccount", args: undefined });
      if (over.refuseDelete !== undefined) throw new Error(over.refuseDelete);
    },
    serverLimits: async () => ({ maxAttachmentBytes: 100 * MB, maxMessageBytes: 65_536 }),
    serverFacts: async () => ({
      machine: "Mac mini",
      version: "1.0.0",
      publicUrl: "http://192.168.1.4:4431",
      relay: { url: undefined, status: "off" },
      pushes: "ready",
    }),
    invites: async () => [
      {
        inviteId: "inv_open",
        role: "member",
        singleUse: false,
        uses: 0,
        createdBy: "per_arjun",
        createdAt: "2026-10-13T00:00:00.000Z",
        expiresAt: "2099-10-20T00:00:00.000Z",
        revokedAt: undefined,
      },
    ],
    notificationSettings: () => ({ decide: "now", review: "hourly", fyi: "daily", harnesses: {} }),
    loadNotificationSettings: async () => ({
      decide: "now",
      review: "hourly",
      fyi: "daily",
      harnesses: {},
    }),
    saveNotificationSettings: async () => undefined,
    devices: async () => devices,
    revokeDevice: async (id: string) => {
      calls.push({ name: "revokeDevice", args: id });
      devices = devices.filter((each) => each.deviceId !== id);
    },
    makeJoinLink: async (capabilities: readonly string[]) => {
      calls.push({ name: "makeJoinLink", args: capabilities });
      return {
        request: { requestId: "jrq_link", state: "allowed", capabilities },
        link: "https://adas-mac-mini.tail2f9c1e.ts.net/j/chips_j_testlink_0123456789abcdef",
      };
    },
    issuePairingCode: async () => ({
      code: "K7Q-94M",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
      relay: undefined,
    }),
  } as unknown as Store & { calls: { name: string; args: unknown }[] };
}

/** Say yes to whatever an alert asks: the destructive button, as a thumb on it would. */
function agreeing() {
  return jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
    (buttons as AlertButton[] | undefined)
      ?.find((each) => each.style === "destructive")
      ?.onPress?.();
  });
}

beforeEach(() => {
  mockHeld = [];
  mockReplaced.length = 0;
  mockPushed.length = 0;
  mockKept.bytes = 212 * MB;
  mockEnded.mockClear();
  core.forgetDevice.mockClear();
});

afterEach(() => jest.restoreAllMocks());

describe("who you are", () => {
  it("heads the screen with your name as the directory has it, and your role where", async () => {
    await render(<You device={DEVICE} store={fake({ name: "Arj" })} />);
    expect(screen.getByText("Arj")).toBeTruthy();
    expect(screen.queryByText("Arjun's iPhone")).toBeNull();
    expect(screen.getByTestId("my-role")).toHaveTextContent("Owner · Northwind");
  });

  it("changes the name you go by where it stands (ADR 0082, ADR 0139)", async () => {
    const store = fake({ name: "Arj" });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("your-name"));
    const field = screen.getByTestId("your-name-field");
    expect(field).toHaveDisplayValue("Arj");
    // Under the field, what the name is for, in place of the role.
    expect(screen.getByTestId("your-name-hint")).toHaveTextContent(
      "What people and agents here call you.",
    );
    expect(screen.queryByTestId("my-role")).toBeNull();
    await fireEvent.changeText(field, " Arjun ");
    await fireEvent(field, "submitEditing");
    expect(store.calls).toContainEqual({ name: "rename", args: "Arjun" });
    // Saved, it is the name again, with the role back under it.
    expect(await screen.findByTestId("my-role")).toBeTruthy();
    expect(screen.queryByTestId("your-name-field")).toBeNull();
  });

  it("saves nothing for the same name, and puts the name back when you look away", async () => {
    const store = fake({ name: "Arj" });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("your-name"));
    await fireEvent(screen.getByTestId("your-name-field"), "submitEditing");
    expect(store.calls.filter((each) => each.name === "rename")).toEqual([]);

    await userEvent.press(screen.getByTestId("your-name"));
    await fireEvent.changeText(screen.getByTestId("your-name-field"), "Arjun");
    await fireEvent(screen.getByTestId("your-name-field"), "blur");
    expect(screen.queryByTestId("your-name-field")).toBeNull();
    expect(screen.getByText("Arj")).toBeTruthy();
    expect(store.calls.filter((each) => each.name === "rename")).toEqual([]);
  });

  it("keeps what you typed and says why when the server refuses the name", async () => {
    const store = fake({ name: "You", refuse: "An agent here goes by Scout already." });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("your-name"));
    const field = () => screen.getByTestId("your-name-field");
    await fireEvent.changeText(field(), "Scout");
    await fireEvent(field(), "submitEditing");
    expect(await screen.findByTestId("your-name-hint")).toHaveTextContent(
      "An agent here goes by Scout already.",
    );
    expect(field()).toHaveDisplayValue("Scout");
    // A tap elsewhere puts your name back.
    await fireEvent(field(), "blur");
    expect(screen.queryByTestId("your-name-field")).toBeNull();
    expect(screen.getByTestId("your-name")).toHaveAccessibleName("You");
  });
});

describe("your face (ADR 0139)", () => {
  it("opens the icon sheet with you at its head, and saves the mark that is tapped", async () => {
    const store = fake({ name: "Arj" });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("profile-face"));
    const sheet = await screen.findByTestId("icon-sheet");
    await drawLibrary();
    expect(within(sheet).getByText("Owner · Northwind")).toBeTruthy();
    await userEvent.press(screen.getByTestId("mark-tent"));
    expect(store.calls.filter((each) => each.name === "setMyFace")).toEqual([
      { name: "setMyFace", args: { icon: "tent", ground: expect.any(Number) } },
    ]);
  });

  it("takes a letter or two, or an emoji, and wears the face you chose", async () => {
    const store = fake({ name: "Arj", face: { icon: "", ground: 3, letters: "🦊" } });
    await render(<You device={DEVICE} store={store} />);
    expect(
      within(screen.getByTestId("profile")).getByText("🦊", { includeHiddenElements: true }),
    ).toBeTruthy();
    await userEvent.press(screen.getByTestId("profile-face"));
    await screen.findByTestId("icon-sheet");
    const field = screen.getByTestId("face-letters");
    expect(field).toHaveDisplayValue("🦊");
    await fireEvent.changeText(field, "AG");
    await fireEvent(field, "submitEditing");
    expect(store.calls.filter((each) => each.name === "setMyFace").at(-1)).toEqual({
      name: "setMyFace",
      args: { icon: "", ground: 3, letters: "AG" },
    });
  });
});

describe("one card under each heading (ADR 0085, 20 October 2026)", () => {
  it("puts the workspace in front under your name, in the same card", async () => {
    await render(<You device={DEVICE} store={fake({ name: "Arj" })} />);
    const me = within(screen.getByTestId("me"));
    expect(me.getByTestId("profile")).toBeOnTheScreen();
    expect(me.getByTestId("you-workspace")).toBeOnTheScreen();
  });

  it("puts the push switch in Notifications' card, with Decisions and Quiet hours", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    const card = within(screen.getByTestId("notifications"));
    expect(card.getByTestId("push-switch")).toBeOnTheScreen();
    expect(card.getByTestId("decisions-row")).toBeOnTheScreen();
    expect(card.getByTestId("quiet-row")).toBeOnTheScreen();
    expect(card.getByTestId("agents-row")).toBeOnTheScreen();
  });

  it("says under a card only what a row can't: no paragraph the rows or their sheets say", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.queryByText(/Soothing and Bright are the colours/)).toBeNull();
    expect(screen.queryByText(/For everyone in/)).toBeNull();
    expect(screen.queryByText(/a second look costs nothing/)).toBeNull();
    expect(screen.queryByText(/never every reply/)).toBeNull();
    expect(screen.queryByText(/carries no words about the ask/)).toBeNull();
    expect(screen.getByText("Sign out leaves the workspace as it is.")).toBeTruthy();
  });
});

describe("what is gone, and why", () => {
  it("says neither the name twice nor how the server is reached, which the mark says", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.queryByText("You are")).toBeNull();
    expect(screen.queryByText("Reaching it")).toBeNull();
  });

  it("offers no tier the server never pushes, and promises no passkey", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.queryByText("Review today")).toBeNull();
    expect(screen.queryByText("FYI")).toBeNull();
    expect(screen.queryByText(/passkey/i)).toBeNull();
  });

  it("draws Send feedback, now that the repository is public (ADR 0237)", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.getByTestId("about-version")).toBeTruthy();
    expect(screen.getByTestId("feedback-row")).toBeTruthy();
  });
});

describe("appearance", () => {
  it("lets the person choose dark over the phone's own setting, and remembers", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    await userEvent.press(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark", checked: true })).toBeTruthy();
    expect(mockSettings.get("appearance")).toBe("dark");
    await userEvent.press(screen.getByRole("radio", { name: "System" }));
    expect(mockSettings.get("appearance")).toBe("system");
  });

  it("offers the faces' two themes in the same group, and says nothing about System", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    const group = screen.getByTestId("appearance");
    expect(within(group).getByRole("radio", { name: "System" })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "Soothing", checked: true })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "Bright", checked: false })).toBeTruthy();
    expect(screen.queryByText(/System follows/)).toBeNull();
  });

  it("lets the person choose Bright, and remembers", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    try {
      await userEvent.press(screen.getByRole("radio", { name: "Bright" }));
      expect(screen.getByRole("radio", { name: "Bright", checked: true })).toBeTruthy();
      expect(mockSettings.get("faces")).toBe("bright");
    } finally {
      await act(() => {
        chooseFaceTheme("soothing");
      });
    }
  });
});

describe("devices", () => {
  it("lists this phone first, the rest by when they were seen, and not the signed out", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(await screen.findByTestId("device-current")).toHaveTextContent(/iPhone 17 Pro/);
    expect(within(screen.getByTestId("device-current")).getByText("This phone")).toBeTruthy();
    expect(screen.getByText("Chips for Mac")).toBeTruthy();
    expect(screen.getByText("2 h ago")).toBeTruthy();
    expect(screen.queryByText("An old phone")).toBeNull();
  });

  it("folds what has not been seen for a month, and opens it", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    await userEvent.press(await screen.findByRole("button", { name: "1 not seen in a month" }));
    expect(screen.getByText("Safari on Mac")).toBeTruthy();
    expect(screen.getByText("6 weeks ago")).toBeTruthy();
  });

  it("signs another device out at the server, and takes it off the list", async () => {
    const store = fake();
    await render(<You device={DEVICE} store={store} />);
    const mac = await screen.findByLabelText(/^Chips for Mac/);
    await fireEvent(mac, "accessibilityAction", { nativeEvent: { actionName: "signOut" } });
    expect(store.calls).toContainEqual({ name: "revokeDevice", args: "dev_2" });
    await waitFor(() => expect(screen.queryByText("Chips for Mac")).toBeNull());
  });

  it("signs every stale device out at once, having asked", async () => {
    const store = fake();
    const asked = agreeing();
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(await screen.findByRole("button", { name: "1 not seen in a month" }));
    await userEvent.press(screen.getByRole("button", { name: "Sign out all 1" }));
    expect(asked).toHaveBeenCalledWith("Sign out 1 device?", expect.any(String), expect.any(Array));
    await waitFor(() =>
      expect(store.calls).toContainEqual({ name: "revokeDevice", args: "dev_3" }),
    );
  });

  it("waits for the connection to ask, and says nothing went wrong while it waits", async () => {
    const store = fake({ connection: "connecting" });
    const asked = jest.spyOn(store, "devices");
    const { rerender } = await render(<You device={DEVICE} store={store} />);
    expect(asked).not.toHaveBeenCalled();
    expect(screen.queryByText(/did not answer/)).toBeNull();
    (store.getSnapshot() as { connection: string }).connection = "open";
    await rerender(<You device={DEVICE} store={store} />);
    expect(await screen.findByTestId("device-current")).toHaveTextContent(/iPhone 17 Pro/);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("asks again when the connection opens again, and takes back what failed", async () => {
    const store = fake();
    const snapshot = store.getSnapshot() as { connection: string };
    jest.spyOn(store, "devices").mockRejectedValueOnce(new TypeError("Network request failed"));
    const { rerender } = await render(<You device={DEVICE} store={store} />);
    expect(await screen.findByText(/The server did not answer/)).toBeOnTheScreen();
    snapshot.connection = "closed";
    await rerender(<You device={DEVICE} store={store} />);
    snapshot.connection = "open";
    await rerender(<You device={DEVICE} store={store} />);
    expect(await screen.findByTestId("device-current")).toBeOnTheScreen();
    expect(screen.queryByText(/did not answer/)).toBeNull();
  });

  it("gives a code and the relay's link to send a computer (ADR 0210)", async () => {
    const store = fake();
    const link = `https://relay.chipschat.ai/pair#pair=K7Q-94M&v=1`;
    jest.spyOn(store, "issuePairingCode").mockResolvedValue({
      code: "K7Q-94M",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      serverUrl: "https://adas-mac-mini.tail2f9c1e.ts.net",
      relay: "wss://relay.chipschat.ai",
      serverKey: "k".repeat(43),
      link,
    });
    const shared = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("pair-computer"));
    expect(await screen.findByTestId("pair-code")).toHaveTextContent("K7Q-94M");
    expect(screen.getByText(/Good for 10 minutes, once/)).toBeTruthy();
    expect(screen.getByTestId("pair-words")).toHaveTextContent(
      "Send the link to the computer and open it there. It reaches your Chips from any network.",
    );
    // No tailnet name to "choose": the Mac's list of servers never shows one.
    expect(within(screen.getByTestId("pair-sheet-panel")).queryByText(/choose/)).toBeNull();
    expect(screen.getByTestId("pair-foot")).toHaveTextContent(
      "At home? You can type the code in Chips on the computer instead.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Send the link" }));
    // The link goes alone, as an invite's does.
    expect(shared).toHaveBeenCalledWith({ message: link });
    shared.mockRestore();
  });

  it("names the server to choose, from a server too old to make a link", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    await userEvent.press(screen.getByTestId("pair-computer"));
    expect(await screen.findByTestId("pair-code")).toHaveTextContent("K7Q-94M");
    expect(within(screen.getByTestId("pair-sheet-panel")).getByText(/choose/)).toHaveTextContent(
      "On the computer, open Chips, choose adas-mac-mini.tail2f9c1e.ts.net, and type this code.",
    );
    expect(screen.getByRole("button", { name: "Send the code" })).toBeTruthy();
    expect(screen.queryByTestId("pair-foot")).toBeNull();
  });

  it("counts as arrived only a device paired since the code, not one there was, signed out or this one", () => {
    const since = Date.parse("2026-10-20T09:00:00.000Z");
    const device = (id: string, at: string, extra: Record<string, unknown> = {}) => ({
      deviceId: id,
      name: id,
      pairedAt: at,
      lastSeenAt: undefined,
      revokedAt: undefined,
      current: false,
      ...extra,
    });
    const known = new Set(["dev_old"]);
    expect(
      arrivedSince([device("dev_old", "2026-10-20T09:00:05.000Z")], since, known),
    ).toBeUndefined();
    expect(
      arrivedSince(
        [device("dev_gone", "2026-10-20T09:00:05.000Z", { revokedAt: "x" })],
        since,
        known,
      ),
    ).toBeUndefined();
    expect(
      arrivedSince([device("dev_me", "2026-10-20T09:00:05.000Z", { current: true })], since, known),
    ).toBeUndefined();
    expect(
      arrivedSince([device("dev_week", "2026-10-13T09:00:00.000Z")], since, undefined),
    ).toBeUndefined();
    // The server's clock a little behind this phone's still counts.
    expect(
      arrivedSince([device("dev_mac", "2026-10-20T08:59:30.000Z")], since, known)?.deviceId,
    ).toBe("dev_mac");
  });

  describe("when the computer arrives", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("turns the sheet to say it is paired, and the list of devices has it", async () => {
      const store = fake();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await render(<You device={DEVICE} store={store} />);
      await user.press(screen.getByTestId("pair-computer"));
      expect(await screen.findByTestId("pair-code")).toHaveTextContent("K7Q-94M");
      const before = await store.devices();
      jest.spyOn(store, "devices").mockResolvedValue([
        ...before,
        {
          deviceId: "dev_new",
          name: "Chips for Mac",
          current: false,
          pairedAt: new Date().toISOString(),
          lastSeenAt: undefined,
          revokedAt: undefined,
        },
      ]);
      await act(async () => {
        jest.advanceTimersByTime(ARRIVAL_POLL_MS);
      });
      expect(await screen.findByTestId("pair-paired")).toHaveTextContent(
        /^Chips for Mac is pairedJust now\. It's under Devices now\./,
      );
      await user.press(screen.getByRole("button", { name: "Done" }));
      // The sheet slides away, and is gone once it has.
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByTestId("pair-paired")).toBeNull();
    });
  });
});

describe("the workspace's own group", () => {
  it("shows an owner the attachment limits, and caps them in megabytes (ADR 0047)", async () => {
    const store = fake();
    await render(<You device={DEVICE} store={store} />);
    expect(await screen.findByRole("button", { name: "Attachment limits, 100 MB" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("caps-row"));
    await userEvent.type(screen.getByLabelText("Photos"), "25");
    await userEvent.type(screen.getByLabelText("Files"), "50");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(store.calls).toEqual([
      { name: "setAttachmentCaps", args: { image: 25 * MB, video: null, file: 50 * MB } },
    ]);
  });

  it("shows an owner the relay where the server has one, and opens its page (ADR 0211)", async () => {
    await render(<You device={RELAYED} store={fake()} />);
    expect(await screen.findByRole("button", { name: "Relay, On" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("relay-row"));
    expect(mockPushed).toEqual(["/relay"]);
  });

  it("says the relay is off once an owner has turned it off", async () => {
    const off = { on: false, by: "per_arjun", at: "2026-10-21T09:05:00.000Z" };
    await render(<You device={RELAYED} store={fake({ relay: off })} />);
    expect(await screen.findByRole("button", { name: "Relay, Off" })).toBeTruthy();
  });

  it("shows an owner the relay off before anybody turned Chips's own on (ADR 0245)", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(await screen.findByRole("button", { name: "Relay, Off" })).toBeTruthy();
  });

  it("shows the relay to nobody but an owner", async () => {
    await render(<You device={RELAYED} store={fake({ role: "admin" })} />);
    expect(await screen.findByTestId("caps-row")).toBeTruthy();
    expect(screen.queryByTestId("relay-row")).toBeNull();
  });

  it("refuses a cap above what the server takes, in the server's own words", async () => {
    const store = fake();
    await render(<You device={DEVICE} store={store} />);
    await screen.findByRole("button", { name: "Attachment limits, 100 MB" });
    await userEvent.press(screen.getByTestId("caps-row"));
    await userEvent.type(screen.getByLabelText("Videos"), "200");
    await userEvent.press(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByTestId("caps-error")).toHaveTextContent(
      "A cap of 200 MB on videos is more than this server takes (100 MB).",
    );
    expect(store.calls).toHaveLength(0);
  });

  it("shows an owner when Chips steps in on agents, and saves a stop, a hold and the switch (ADR 0187)", async () => {
    const store = fake();
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(
      await screen.findByRole("button", {
        name: "Messages between agents, Stop after 16 · hold after 48",
      }),
    );
    const sheet = within(screen.getByTestId("exchange-limits-sheet-panel"));
    expect(sheet.getByText("Why this is here")).toBeTruthy();
    expect(sheet.getByTestId("exchange-foot")).toHaveTextContent("Chips's own numbers.");
    // Nothing new yet: Save says so and sends nothing.
    await userEvent.press(sheet.getByRole("button", { name: "Save" }));
    expect(store.calls).toHaveLength(0);
    await userEvent.press(sheet.getByTestId("exchange-stop-32"));
    await userEvent.press(sheet.getByTestId("exchange-hold-100"));
    await fireEvent(sheet.getByTestId("exchange-circles"), "valueChange", false);
    expect(sheet.getByTestId("exchange-step-count")).toHaveTextContent(/16/);
    expect(sheet.getByTestId("exchange-step-stop")).toHaveTextContent(/32/);
    expect(sheet.getByTestId("exchange-step-hold")).toHaveTextContent(/100/);
    await userEvent.press(sheet.getByRole("button", { name: "Save" }));
    expect(store.calls).toEqual([
      { name: "setExchangeLimits", args: { stop: 32, hold: 100, circles: false } },
    ]);
  });

  it("takes the stop down under a hold picked below it, and greys the stops that would cross", async () => {
    const store = fake({ limits: { stop: 64, hold: 200, circles: true } });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(await screen.findByTestId("exchange-limits-row"));
    const sheet = within(screen.getByTestId("exchange-limits-sheet-panel"));
    await userEvent.press(sheet.getByTestId("exchange-hold-48"));
    expect(sheet.getByTestId("exchange-stop-32").props["accessibilityState"]).toMatchObject({
      selected: true,
    });
    expect(sheet.getByTestId("exchange-stop-64").props["accessibilityState"]).toMatchObject({
      disabled: true,
    });
    await userEvent.press(sheet.getByRole("button", { name: "Save" }));
    expect(store.calls).toEqual([
      { name: "setExchangeLimits", args: { stop: 32, hold: 48, circles: true } },
    ]);
  });

  it("says what a hold of Never leaves, and saves nothing while Other holds no number", async () => {
    const store = fake();
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(await screen.findByTestId("exchange-limits-row"));
    const sheet = within(screen.getByTestId("exchange-limits-sheet-panel"));
    await userEvent.press(sheet.getByTestId("exchange-hold-never"));
    expect(sheet.getByTestId("exchange-foot")).toHaveTextContent(/Spend per job still pauses them/);
    await userEvent.press(sheet.getByTestId("exchange-stop-other"));
    expect(sheet.getByTestId("exchange-foot")).toHaveTextContent(
      "Tell them to stop after a whole number from 4 to 500.",
    );
    await userEvent.press(sheet.getByRole("button", { name: "Save" }));
    expect(store.calls).toHaveLength(0);
    await userEvent.type(sheet.getByTestId("exchange-stop-field"), "24");
    await userEvent.press(sheet.getByRole("button", { name: "Save" }));
    expect(store.calls).toEqual([
      { name: "setExchangeLimits", args: { stop: 24, hold: null, circles: true } },
    ]);
  });

  it("opens How Chips counts, and shuts it again", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    await userEvent.press(await screen.findByTestId("exchange-limits-row"));
    const sheet = within(screen.getByTestId("exchange-limits-sheet-panel"));
    expect(sheet.queryByTestId("exchange-how-body")).toBeNull();
    await userEvent.press(sheet.getByTestId("exchange-how"));
    expect(sheet.getByTestId("exchange-how-body")).toHaveTextContent(
      /Only messages agents send each other count/,
    );
    await userEvent.press(sheet.getByTestId("exchange-how"));
    expect(sheet.queryByTestId("exchange-how-body")).toBeNull();
  });

  it("says once that nothing is allowed always, and how a rule comes to be there (ADR 0195)", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(
      screen.getByRole("button", { name: "Allowed always, Asks every time" }),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("allowed-always-row"));
    const sheet = within(screen.getByTestId("always-sheet-panel"));
    expect(sheet.getByTestId("always-none")).toBeTruthy();
    expect(sheet.getByText(/^Nothing is allowed always, so every ask comes to /)).toBeTruthy();
    expect(sheet.getByText(/^When a harness asks to do something small, Always/)).toBeTruthy();
    // The harnesses are one line, not a box each that says the same.
    expect(sheet.getByTestId("always-sheet-asking")).toHaveTextContent("Scout asks every time.");
    expect(sheet.queryByText("Nothing allowed always.")).toBeNull();
  });

  it("lists who works without asking, where and until when, with Stop (ADR 0281)", async () => {
    const store = fake({ working: true });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("allowed-always-row"));
    const sheet = within(screen.getByTestId("always-sheet-panel"));
    const working = within(sheet.getByTestId("always-working"));
    expect(working.getByText("Working without asking")).toBeTruthy();
    expect(sheet.getByTestId("always-working-har_scout")).toHaveTextContent(
      "ScoutIn Chips explain · Until you stop itStop",
    );
    await userEvent.press(working.getByRole("button", { name: "Stop" }));
    expect(store.calls).toEqual([
      { name: "stopLetWork", args: { spaceId: "spc_explain", asker: "har_scout" } },
    ]);
  });

  it("opens every ask from the dots: the sheet goes down, then the list comes up (ADR 0255)", async () => {
    mockPushed.length = 0;
    await render(<You device={DEVICE} store={fake({ asks: true })} />);
    await userEvent.press(screen.getByTestId("allowed-always-row"));
    const sheet = within(screen.getByTestId("always-sheet-panel"));
    const dots = sheet.getByRole("button", { name: /^Asks so far: 2 asks since/ });
    expect(dots).toHaveProp("accessibilityHint", "Opens every ask");
    await userEvent.press(dots);
    await waitFor(() => expect(screen.queryByTestId("always-sheet-panel")).toBeNull());
    expect(mockPushed).toEqual(["/asks"]);
  });

  it("counts what is allowed always, and switches it from the sheet as on the harness's page (ADR 0195)", async () => {
    const rule = {
      match: "shell.exec",
      decision: "allow",
      made_by: "per_arjun",
      made_at: "2026-10-12T09:00:00.000Z",
    };
    const store = fake({ rules: [rule] });
    await render(<You device={DEVICE} store={store} />);
    expect(screen.getByRole("button", { name: "Allowed always, 1 on" })).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("allowed-always-row"));
    const sheet = within(screen.getByTestId("always-sheet-panel"));
    // What it allows in words, the harness's own kind under it, and where it holds: a rule for
    // every command, as only a policy written another way now makes (ADR 0239).
    expect(sheet.getByText("Any command")).toBeTruthy();
    expect(sheet.getByText("shell.exec")).toBeTruthy();
    expect(sheet.getByText("In every space · by you, 12 October")).toBeTruthy();
    expect(sheet.queryByTestId("always-none")).toBeNull();
    expect(sheet.queryByTestId("always-sheet-asking")).toBeNull();
    await fireEvent(sheet.getByTestId("always-switch-har_scout:*:0"), "valueChange", false);
    expect(store.calls).toEqual([
      { name: "setRules", args: { harnessId: "har_scout", rules: [{ ...rule, off: true }] } },
    ]);
  });

  it("names a command's rule by its start, in code (ADR 0239)", async () => {
    const rule = {
      match: "shell.exec",
      when: { starts_with: ["node", "--check"] },
      decision: "allow",
      made_by: "per_arjun",
      made_at: "2026-10-27T09:00:00.000Z",
    };
    await render(<You device={DEVICE} store={fake({ rules: [rule] })} />);
    await userEvent.press(screen.getByTestId("allowed-always-row"));
    const sheet = within(screen.getByTestId("always-sheet-panel"));
    expect(sheet.getByText("node --check …")).toHaveStyle({ fontFamily: "Menlo" });
    expect(sheet.getByText("shell.exec")).toBeTruthy();
    expect(sheet.getByLabelText("Allow node --check … always")).toBeTruthy();
  });

  it("shows an owner People and Invite someone, which say how many and open their pages", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    // Who is here by role, and the open links with when the next runs out (ADR 0209).
    expect(screen.getByTestId("people-row").props["accessibilityLabel"]).toBe("People: 1 owner");
    expect(
      await screen.findByLabelText(/^Invite someone: 1 open link · runs out in \d+ days$/),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("people-row"));
    await userEvent.press(screen.getByTestId("invite-row"));
    expect(mockPushed.slice(-2)).toEqual(["/people", "/invite"]);
  });

  it("opens a row's page beside the list on an iPad, and chooses its row while it is open (ADR 0256)", async () => {
    const went: (YouPage | undefined)[] = [];
    await render(
      <YouBeside value={{ open: "people", go: (page) => went.push(page) }}>
        <You device={DEVICE} store={fake()} />
      </YouBeside>,
    );
    expect(screen.getByTestId("people-row")).toBeSelected();
    expect(await screen.findByTestId("invite-row")).not.toBeSelected();
    await userEvent.press(screen.getByTestId("invite-row"));
    await userEvent.press(screen.getByTestId("about-connection"));
    expect(went).toEqual(["invite", "connection"]);
    expect(mockPushed).toEqual([]);
  });

  it("shows an admin People and no Invite someone: only an owner invites", async () => {
    await render(<You device={DEVICE} store={fake({ role: "admin" })} />);
    expect(screen.getByTestId("people-row")).toBeOnTheScreen();
    expect(screen.queryByTestId("invite-row")).toBeNull();
  });

  it("is headed by the workspace's name, and says at its right who sees it", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.getByRole("header", { name: "Northwind" })).toBeOnTheScreen();
    expect(screen.getByText("Owners and admins")).toBeOnTheScreen();
    // The name is changed from the Workspace row under yours, in the sheet Spaces opens (ADR 0194).
    expect(screen.queryByTestId("workspace-name-row")).toBeNull();
  });

  it("connects a harness as the Agents shelf's last tile does: it opens the same sheet (ADR 0190)", async () => {
    mockConnect.waiting = undefined;
    mockConnect.open.mockClear();
    await render(<You device={DEVICE} store={fake({ role: "admin" })} />);
    await userEvent.press(screen.getByTestId("connect-harness-row"));
    expect(mockConnect.open).toHaveBeenCalledTimes(1);
  });

  it("says the link it waits on, while it waits", async () => {
    mockConnect.waiting = { left: "14:12", share: 0.94, taken: false };
    await render(<You device={DEVICE} store={fake({ role: "admin" })} />);
    expect(screen.getByTestId("connect-harness-row")).toHaveTextContent(/Waiting, 14:12/);
    mockConnect.waiting = undefined;
  });

  it("is not there for a member", async () => {
    await render(<You device={DEVICE} store={fake({ role: "member" })} />);
    expect(screen.getByTestId("my-role")).toHaveTextContent("Member · Northwind");
    expect(screen.queryByTestId("workspace")).toBeNull();
    expect(screen.queryByTestId("connect-harness-row")).toBeNull();
  });
});

describe("about this phone", () => {
  it("names the server by its host, and the build", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.getByTestId("about-server")).toHaveTextContent(
      /adas-mac-mini\.tail2f9c1e\.ts\.net/,
    );
    expect(screen.getByTestId("about-version")).toHaveTextContent(/ · /);
  });

  it("says the build number as TestFlight does, in brackets after the version", () => {
    expect(buildWords("0.0.0", "202610190718", "15ad3ee0")).toBe("0.0.0 (202610190718) · 15ad3ee0");
    // The web and Expo Go have no build number; a build from a dirty tree has no commit.
    expect(buildWords("0.0.0", null, "15ad3ee0")).toBe("0.0.0 · 15ad3ee0");
    expect(buildWords(undefined, undefined, "")).toBe("0.0.0 · dev");
  });

  it("is headed for this phone, Media first", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.getByRole("header", { name: "This phone" })).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "About" })).toBeNull();
  });

  it("says which way it reaches the server: straight over the network, in a word", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.getByTestId("about-connection")).toHaveTextContent("ConnectionDirect");
  });

  it("or through the relay, named by its host", async () => {
    const away = {
      ...DEVICE,
      serverKey: "k".repeat(43),
      relayUrl: "wss://relay.chipschat.ai",
    } as Device;
    await render(<You device={away} store={fake({ link: "relay" })} />);
    expect(screen.getByTestId("about-connection")).toHaveTextContent(/Relay/);
    expect(screen.getByTestId("about-connection")).toHaveTextContent(
      /Encrypted, via relay\.chipschat\.ai/,
    );
  });

  it("opens Connection, which draws the way (ADR 0211)", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    await userEvent.press(screen.getByRole("button", { name: "Connection, Direct" }));
    expect(mockPushed).toEqual(["/connection"]);
  });

  it("and says so when it is not reaching it at all", async () => {
    await render(<You device={DEVICE} store={fake({ connection: "closed" })} />);
    expect(screen.getByTestId("about-connection")).toHaveTextContent(/Not connected/);
  });

  it("says to pair again when the server names a relay under a key this phone did not pin (SEC-2)", async () => {
    await render(<You device={DEVICE} store={fake({ rekeyed: true })} />);
    expect(screen.getByTestId("about-connection")).toHaveTextContent(/Direct/);
    expect(screen.getByTestId("about-connection")).toHaveTextContent(
      /keeps the key it paired with; pair it again to use the new one/,
    );
  });

  it("says how much is kept here, and opens Media on this phone (ADR 0159)", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    const row = await screen.findByRole("button", { name: "Media on this phone, 212 MB" });
    await userEvent.press(row);
    expect(mockPushed).toEqual(["/media"]);
  });
});

describe("signing out", () => {
  it("withdraws this phone at the server before forgetting its key", async () => {
    agreeing();
    const store = fake();
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("sign-out"));
    await waitFor(() =>
      expect(mockReplaced).toEqual([{ pathname: "/pair", params: { ways: "1" } }]),
    );
    expect(store.calls).toContainEqual({ name: "revokeDevice", args: "dev_1" });
    // Its key, and its cache with it (SEC-32).
    expect(core.forgetDevice).toHaveBeenCalledWith(
      "dev_1",
      expect.anything(),
      expect.objectContaining({ delete: expect.any(Function) }),
    );
    expect(mockEnded).toHaveBeenCalled();
  });

  it("names the workspace that goes, and the one that stays, on a phone holding two", async () => {
    mockHeld = [DEVICE, { ...DEVICE, deviceId: "dev_2", workspaceName: "Bakehouse" }];
    const asked = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<You device={DEVICE} store={fake()} />);
    expect(screen.getByTestId("sign-out")).toHaveTextContent("Sign out of Northwind");
    await userEvent.press(screen.getByTestId("sign-out"));
    expect(asked).toHaveBeenCalledWith(
      "Sign out of Northwind?",
      expect.stringMatching(/ Bakehouse stays on this phone\.$/),
      expect.any(Array),
    );
  });

  it("still forgets the key when the server cannot be reached", async () => {
    agreeing();
    const store = fake();
    (store as unknown as { revokeDevice: () => Promise<void> }).revokeDevice = async () => {
      throw new Error("offline");
    };
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("sign-out"));
    await waitFor(() =>
      expect(mockReplaced).toEqual([{ pathname: "/pair", params: { ways: "1" } }]),
    );
    expect(core.forgetDevice).toHaveBeenCalled();
  });

  it("forgets at once a workspace it never reaches, whose withdrawal never answers", async () => {
    // His "Demo", 26 October 2026: paired by an address the phone cannot reach, so the request
    // hung, and Sign out did nothing.
    agreeing();
    const store = fake({ connection: "connecting" });
    const asked: string[] = [];
    (store as unknown as { revokeDevice: (id: string) => Promise<void> }).revokeDevice = (id) => {
      asked.push(id);
      return new Promise(() => undefined);
    };
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("sign-out"));
    await waitFor(() =>
      expect(mockReplaced).toEqual([{ pathname: "/pair", params: { ways: "1" } }]),
    );
    expect(asked).toEqual(["dev_1"]);
    expect(core.forgetDevice).toHaveBeenCalledWith("dev_1", expect.anything(), expect.anything());
  });
});

describe("deleting your account (ADR 0243)", () => {
  it("says what goes and what stays, and deletes once the workspace's name is typed", async () => {
    const asked = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const store = fake({ role: "member" });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("delete-account"));
    const sheet = await screen.findByTestId("delete-account-sheet");
    // The devices are counted once the server has said which hold the key.
    const goes = within(sheet).getByTestId("delete-goes");
    expect(
      await within(goes).findByText("Your 3 devices and their sign-ins, and push to them"),
    ).toBeTruthy();
    const stays = within(sheet).getByTestId("delete-stays");
    expect(within(stays).getByText("What you said, under your name")).toBeTruthy();
    const confirm = within(sheet).getByTestId("delete-account-confirm");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(sheet).getByTestId("delete-account-typed"), "Northwin");
    expect(confirm).toBeDisabled();
    expect(store.calls.some((call) => call.name === "deleteAccount")).toBe(false);
    await userEvent.type(within(sheet).getByTestId("delete-account-typed"), "d");
    expect(confirm).toBeEnabled();
    await userEvent.press(confirm);
    await waitFor(() =>
      expect(mockReplaced).toEqual([{ pathname: "/pair", params: { ways: "1" } }]),
    );
    expect(store.calls).toContainEqual({ name: "deleteAccount", args: undefined });
    // The workspace leaves this phone as after a sign-out: its key and cache, here.
    expect(core.forgetDevice).toHaveBeenCalledWith("dev_1", expect.anything(), expect.anything());
    expect(asked).toHaveBeenCalledWith(
      "You've left Northwind",
      "Your account there is deleted.",
      expect.any(Array),
    );
  });

  it("keeps the sheet up with the server's reason when it refuses, and forgets nothing", async () => {
    const store = fake({ role: "member", refuseDelete: "The server could not be reached." });
    await render(<You device={DEVICE} store={store} />);
    await userEvent.press(screen.getByTestId("delete-account"));
    const sheet = await screen.findByTestId("delete-account-sheet");
    await userEvent.type(within(sheet).getByTestId("delete-account-typed"), "northwind");
    await userEvent.press(within(sheet).getByTestId("delete-account-confirm"));
    expect(await within(sheet).findByText("The server could not be reached.")).toBeTruthy();
    expect(mockReplaced).toEqual([]);
    expect(core.forgetDevice).not.toHaveBeenCalled();
  });

  it("tells the only owner how the workspace itself is deleted, and opens no sheet", async () => {
    const asked = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<You device={DEVICE} store={fake()} />);
    await userEvent.press(screen.getByTestId("delete-account"));
    expect(asked).toHaveBeenCalledWith(
      "You own Northwind",
      expect.stringContaining("chips uninstall --remove-data"),
      [{ text: "OK" }],
    );
    expect(screen.queryByTestId("delete-account-sheet")).toBeNull();
  });
});

/**
 * The list and the pane beside it, as the route draws them on an iPad (`app/(tabs)/you.tsx`): one
 * You, whose rows open their pages in the pane, kept here as the tabs keep them.
 */
function IPad({ store, device = DEVICE }: { readonly store: Store; readonly device?: Device }) {
  const [opened, go] = useState<Opened>({});
  const page = opened["page"];
  const third = opened["third"];
  return (
    <YouBeside
      value={{
        open: isYouPage(page) ? page : undefined,
        go: (next) => go(next === undefined ? {} : { page: next }),
        third: isYouThird(third) ? third : undefined,
        goThird: (next) => go(next === undefined ? { page } : { page, third: next }),
      }}
    >
      <Halves store={store} device={device} opened={opened} go={go} />
    </YouBeside>
  );
}

function Halves({
  store,
  device,
  opened,
  go,
}: {
  readonly store: Store;
  readonly device: Device;
  readonly opened: Opened;
  readonly go: (next: Opened) => void;
}) {
  const you = useYou({ device, store });
  return (
    <>
      {you.screen}
      <YouPane
        device={device}
        store={store}
        files={{} as never}
        opened={opened}
        go={go}
        pages={you.pages}
      />
      {youThird({ device, store, opened, go })}
    </>
  );
}

/** What says the pane has nothing open. */
const NOTHING_OPEN = "Choose a row on the left.";

describe("beside the list on an iPad (ADR 0256, 3 November 2026)", () => {
  it("opens each row's sheet as a page in the pane, chooses the row, and opens no sheet", async () => {
    await render(<IPad store={fake({ role: "member", name: "Arj" })} />);
    expect(screen.getByText(NOTHING_OPEN)).toBeTruthy();
    const rows: readonly [string, string, string][] = [
      ["profile-face", "face-page", "icon-sheet"],
      ["decisions-row", "decide-page", "decide-sheet"],
      ["quiet-row", "quiet-page", "quiet-sheet"],
      ["agents-row", "agents-page", "agents-sheet"],
      ["pair-computer", "pair-page", "pair-sheet"],
      ["delete-account", "delete-account-page", "delete-account-sheet"],
    ];
    for (const [row, page, sheet] of rows) {
      await userEvent.press(await screen.findByTestId(row));
      expect(await screen.findByTestId(page)).toBeOnTheScreen();
      expect(screen.getByTestId(row)).toBeSelected();
      expect(screen.queryByTestId(sheet)).toBeNull();
      expect(screen.queryByText(NOTHING_OPEN)).toBeNull();
    }
    expect(mockPushed).toEqual([]);
  });

  it("names the page in the pane's bar, and keeps it open as a choice is made, the row saying it", async () => {
    await render(<IPad store={fake()} />);
    await userEvent.press(screen.getByTestId("decisions-row"));
    expect(screen.getByRole("header", { name: "Decisions" })).toBeTruthy();
    await userEvent.press(screen.getByTestId("decide-off"));
    expect(screen.getByRole("button", { name: "Decisions, Off" })).toBeSelected();
    expect(screen.getByTestId("decide-page")).toBeOnTheScreen();
  });

  it("saves the attachment limits from the bar's Save, and goes back to nothing open", async () => {
    const store = fake();
    await render(<IPad store={store} />);
    await userEvent.press(await screen.findByTestId("caps-row"));
    expect(screen.getByRole("header", { name: "Attachment limits" })).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Photos"), "25");
    await userEvent.press(screen.getByTestId("caps-save"));
    expect(store.calls).toEqual([
      { name: "setAttachmentCaps", args: { image: 25 * MB, video: null, file: null } },
    ]);
    expect(screen.getByText(NOTHING_OPEN)).toBeTruthy();
    expect(screen.getByTestId("caps-row")).not.toBeSelected();
    expect(screen.queryByTestId("caps-sheet")).toBeNull();
  });

  it("holds Save for the messages between agents until something new is picked", async () => {
    const store = fake();
    await render(<IPad store={store} />);
    await userEvent.press(await screen.findByTestId("exchange-limits-row"));
    const page = within(screen.getByTestId("exchange-limits-page"));
    expect(page.getByText("Why this is here")).toBeTruthy();
    expect(screen.getByTestId("exchange-limits-save")).toBeDisabled();
    await userEvent.press(page.getByTestId("exchange-stop-32"));
    await userEvent.press(screen.getByTestId("exchange-limits-save"));
    expect(store.calls).toEqual([
      { name: "setExchangeLimits", args: { stop: 32, hold: 48, circles: true } },
    ]);
    expect(screen.getByText(NOTHING_OPEN)).toBeTruthy();
  });

  it("says on the page what is allowed always, as the sheet does", async () => {
    await render(<IPad store={fake()} />);
    await userEvent.press(await screen.findByTestId("allowed-always-row"));
    const page = within(screen.getByTestId("always-page"));
    expect(page.getByTestId("always-none")).toBeTruthy();
    expect(page.getByTestId("always-sheet-asking")).toHaveTextContent("Scout asks every time.");
    expect(screen.queryByTestId("always-sheet")).toBeNull();
  });

  it("opens every ask in a third column beside Allowed always, and shuts it (ADR 0276)", async () => {
    mockPushed.length = 0;
    await render(<IPad store={fake({ asks: true })} />);
    await userEvent.press(await screen.findByTestId("allowed-always-row"));
    const dots = within(screen.getByTestId("always-page")).getByTestId("always-none-history");
    await userEvent.press(dots);
    const list = within(screen.getByTestId("ask-list"));
    expect(list.getByText("Push to main?")).toBeTruthy();
    expect(list.getByText("Run npm test?")).toBeTruthy();
    expect(dots).toBeSelected();
    expect(mockPushed).toEqual([]);
    // Its way back: an × in the split's third column, Back where it stands alone, as here.
    await userEvent.press(screen.getByTestId("pane-back"));
    expect(screen.queryByTestId("ask-list")).toBeNull();
    expect(screen.getByTestId("always-page")).toBeTruthy();
  });

  it("gives the pairing code on the page, under its name in the bar", async () => {
    const store = fake();
    await render(<IPad store={store} />);
    await userEvent.press(await screen.findByTestId("pair-computer"));
    expect(await screen.findByTestId("pair-code")).toHaveTextContent("K7Q-94M");
    expect(screen.getByRole("header", { name: "Pair a computer" })).toBeTruthy();
  });

  it("saves the face tapped on its page, with you at its head", async () => {
    const store = fake({ name: "Arj" });
    await render(<IPad store={store} />);
    await userEvent.press(screen.getByTestId("profile-face"));
    const page = await screen.findByTestId("face-page");
    expect(screen.getByRole("header", { name: "Your face" })).toBeTruthy();
    expect(within(page).getByText("Owner · Northwind")).toBeTruthy();
    await drawLibrary();
    await userEvent.press(screen.getByTestId("mark-tent"));
    expect(store.calls.filter((each) => each.name === "setMyFace")).toEqual([
      { name: "setMyFace", args: { icon: "tent", ground: expect.any(Number) } },
    ]);
  });

  it("deletes the account from its page once the name is typed, and Keep it goes back", async () => {
    const asked = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const store = fake({ role: "member" });
    await render(<IPad store={store} />);
    await userEvent.press(screen.getByTestId("delete-account"));
    const page = within(await screen.findByTestId("delete-account-page"));
    expect(screen.getByRole("header", { name: "Delete your account" })).toBeTruthy();
    expect(
      await page.findByText("Your 3 devices and their sign-ins, and push to them"),
    ).toBeTruthy();
    await userEvent.press(page.getByRole("button", { name: "Keep it" }));
    expect(screen.getByText(NOTHING_OPEN)).toBeTruthy();
    expect(store.calls.some((call) => call.name === "deleteAccount")).toBe(false);

    await userEvent.press(screen.getByTestId("delete-account"));
    const again = within(await screen.findByTestId("delete-account-page"));
    await userEvent.type(again.getByTestId("delete-account-typed"), "Northwind");
    await userEvent.press(again.getByTestId("delete-account-confirm"));
    await waitFor(() =>
      expect(mockReplaced).toEqual([{ pathname: "/pair", params: { ways: "1" } }]),
    );
    expect(asked).toHaveBeenCalledWith(
      "You've left Northwind",
      "Your account there is deleted.",
      expect.any(Array),
    );
  });

  it("still tells the only owner in an alert, and opens no page", async () => {
    const asked = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await render(<IPad store={fake()} />);
    await userEvent.press(screen.getByTestId("delete-account"));
    expect(asked).toHaveBeenCalledWith("You own Northwind", expect.any(String), [{ text: "OK" }]);
    expect(screen.getByText(NOTHING_OPEN)).toBeTruthy();
  });
});

describe("on a phone", () => {
  const IPHONE_WINDOW = { width: 393, height: 852, scale: 3, fontScale: 1 };
  let was: ReturnType<typeof Dimensions.get>;
  beforeEach(() => {
    was = Dimensions.get("window");
    Dimensions.set({ window: IPHONE_WINDOW });
  });
  afterEach(() => Dimensions.set({ window: was }));

  it("opens the rows' sheets as sheets, and pushes nothing", async () => {
    await render(<You device={DEVICE} store={fake({ role: "member" })} />);
    const rows: readonly [string, string][] = [
      ["decisions-row", "decide-sheet"],
      ["quiet-row", "quiet-sheet"],
      ["pair-computer", "pair-sheet"],
      ["delete-account", "delete-account-sheet"],
    ];
    for (const [row, sheet] of rows) {
      await userEvent.press(await screen.findByTestId(row));
      expect(await screen.findByTestId(sheet)).toBeOnTheScreen();
      expect(screen.queryByTestId(sheet.replace("-sheet", "-page"))).toBeNull();
      await userEvent.press(screen.getByTestId(`${sheet}-close`));
    }
    expect(mockPushed).toEqual([]);
  });

  it("opens the workspace's own sheets as sheets too", async () => {
    await render(<You device={DEVICE} store={fake()} />);
    for (const [row, sheet] of [
      ["caps-row", "caps-sheet"],
      ["exchange-limits-row", "exchange-limits-sheet"],
      ["allowed-always-row", "always-sheet"],
    ] as const) {
      await userEvent.press(await screen.findByTestId(row));
      expect(await screen.findByTestId(sheet)).toBeOnTheScreen();
      await userEvent.press(screen.getByTestId(`${sheet}-close`));
    }
  });
});
