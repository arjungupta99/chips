/**
 * You as a settings list (ADR 0085), and on the web and the Mac the iPad's split (ADR 0265),
 * rendered on its own against fake services: the list beside the page its row opens, or in its
 * place where You is narrow; the words that change inside the desktop app, the appearance, the
 * devices' order and fold, passkeys where one can work, the workspace's rows for its admins and
 * the pages and forms they open, and settings that put back the server's word when a save is
 * refused. The shell's wiring of it is `Shell.test.tsx`'s.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildModel,
  type ClientEvent,
  type Directory,
  type Invite,
  type PairedDeviceRecord,
  quietWords,
  type WorkspaceRole,
} from "@chipschat/core";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type SpaceIcon,
} from "@chipschat/protocol";
import { FACES_ATTRIBUTE, THEME_ATTRIBUTE } from "@chipschat/ui";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type LimitsService,
  type NotificationsService,
  type PeopleService,
  You,
  type YouProps,
} from "./You.tsx";
import { seenWords } from "./you/Devices.tsx";
import { OpenRelay } from "./you/openRelay.ts";

const FIXTURES = `${resolve(import.meta.dirname, "../../../../packages/protocol/fixtures")}/`;
const ARJUN = "usr_01K4ZQPX000000000000000003";
const DANA = "usr_01K4ZQPX000000000000000009";
const SCOUT = "hrn_01K4ZQPX000000000000000004";
const HERE = "dev_here";
const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function fixture(type: string, seq: number, overrides: Record<string, unknown> = {}): ClientEvent {
  return { ...JSON.parse(readFileSync(`${FIXTURES}${type}.json`, "utf8")), seq, ...overrides };
}

/** Arjun owns the workspace, Dana is a member, and Scout works in a space of theirs. */
function workspace(): ClientEvent[] {
  return [
    fixture("person.joined", 1, {
      participant_id: ARJUN,
      display_name: "Arjun",
      role: "owner",
      invite_id: undefined,
      invited_by: undefined,
      actor: { kind: "person", id: ARJUN },
    }),
    fixture("person.joined", 2),
    fixture("space.created", 3, { actor: { kind: "person", id: ARJUN } }),
    fixture("membership.added", 4, { participant_id: SCOUT, participant_kind: "harness" }),
    fixture("run.started", 5),
  ];
}

const DIRECTORY: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout" },
};

function device(name: string, over: Partial<PairedDeviceRecord> = {}): PairedDeviceRecord {
  return {
    deviceId: `dev_${name.replace(/\W/g, "_")}`,
    name,
    pairedAt: ago(40),
    lastSeenAt: ago(0.1),
    revokedAt: undefined,
    current: false,
    ...over,
  };
}

/** Dana's iPhone, seen two hours ago: the devices signed in as somebody else (ADR 0209). */
const THEIRS: PairedDeviceRecord[] = [
  {
    deviceId: "dev_danas_iphone",
    name: "Dana's iPhone",
    pairedAt: ago(20),
    lastSeenAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    revokedAt: undefined,
    current: false,
  },
];

/** The link Dana came by, used up, and one Arjun made yesterday for a guest, still open. */
const LINKS: Invite[] = [
  {
    inviteId: "inv_01K4ZQPX0000000000000000D1",
    role: "member",
    singleUse: true,
    uses: 1,
    createdBy: ARJUN,
    createdAt: "2026-09-06T08:00:00.000Z",
    expiresAt: "2026-09-13T08:00:00.000Z",
    revokedAt: undefined,
    spaceId: undefined,
  },
  {
    inviteId: "inv_open",
    role: "guest",
    singleUse: true,
    uses: 0,
    createdBy: ARJUN,
    createdAt: ago(1),
    expiresAt: new Date(NOW + 6 * DAY + 3_600_000).toISOString(),
    revokedAt: undefined,
    spaceId: undefined,
  },
];

function fakePeople(devices: PairedDeviceRecord[], links: Invite[] = []) {
  const done = {
    revoked: [] as string[],
    passkeysAdded: [] as string[],
    invites: [] as unknown[],
    workspaceNames: [] as string[],
    pairedFor: [] as (string | undefined)[],
    replacing: [] as (string | undefined)[],
    faces: [] as (SpaceIcon | undefined)[],
  };
  let live = devices;
  let theirs = THEIRS;
  const people: PeopleService = {
    passkeys: async () => [],
    addPasskey: async (name) => {
      done.passkeysAdded.push(name);
    },
    revokePasskey: async () => undefined,
    devices: async () => live,
    revokeDevice: async (deviceId) => {
      done.revoked.push(deviceId);
      live = live.filter((each) => each.deviceId !== deviceId);
      theirs = theirs.filter((each) => each.deviceId !== deviceId);
    },
    issuePairingCode: async (forId, replaces) => {
      done.pairedFor.push(forId);
      done.replacing.push(replaces);
      return {
        code: "QRS-789",
        expiresAt: new Date(NOW + 15 * 60_000).toISOString(),
        url: "http://192.168.1.20:4431/#pair=QRS-789",
        appUrl: "https://chipschat.ai/p#pair=QRS-789&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431",
        relay: undefined,
      };
    },
    invites: async () => links,
    createInvite: async (role, singleUse, spaceId) => {
      done.invites.push(spaceId === undefined ? { role, singleUse } : { role, singleUse, spaceId });
      return {
        inviteId: "inv_1",
        url: "http://192.168.1.20:4431/#invite=chips_inv_test",
        role,
        singleUse,
        expiresAt: new Date(NOW + 7 * DAY).toISOString(),
        spaceId: undefined,
      };
    },
    revokeInvite: async () => undefined,
    personDevices: async () => theirs,
    rename: async () => undefined,
    renameWorkspace: async (name) => {
      done.workspaceNames.push(name);
      if (name === "x") throw new Error("Only an owner of the workspace renames it.");
    },
    setMyFace: async (face) => {
      done.faces.push(face);
      if (face?.ground === 26) throw new Error("404 No route matches that.");
    },
  };
  return { people, done };
}

function renderYou(
  over: Partial<YouProps> = {},
  devices: PairedDeviceRecord[] = [],
  links: Invite[] = [],
) {
  const { people, done } = fakePeople(devices, links);
  const props: YouProps = {
    model: buildModel(workspace()),
    directory: DIRECTORY,
    selfId: ARJUN,
    workspaceName: "Demo",
    passkeysWork: false,
    desktop: false,
    serverHost: "chips.example:4431",
    busy: new Set(),
    connected: true,
    people,
    onChangeRole: () => undefined,
    onRemovePerson: async () => undefined,
    onSignOut: () => undefined,
    ...over,
  };
  const { rerender } = render(<You {...props} />);
  /** The screen again, with what changed: the connection closing, or opening again. */
  const again = (more: Partial<YouProps>) => rerender(<You {...props} {...more} />);
  return Object.assign(done, { again, props });
}

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.removeAttribute(FACES_ATTRIBUTE);
});

/** A row of You's opened: its page, beside the list. */
/**
 * A window a phone's width (`useNarrow`), where You is one column and a page stands in the list's
 * place (ADR 0284); what puts the window back.
 */
function phoneWidth(): () => void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 640px)",
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  return () => vi.unstubAllGlobals();
}

function openPage(row: string): HTMLElement {
  fireEvent.click(screen.getByTestId(row));
  return screen.getByTestId("you-pane");
}

/** A person's page, from People. */
function openPerson(id: string): HTMLElement {
  openPage("people-row");
  const row = screen
    .getAllByTestId("person-row")
    .find((each) => each.getAttribute("data-participant") === id) as HTMLElement;
  fireEvent.click(row);
  return screen.getByTestId("person-details");
}

/** A row's form, on its page beside the list (ADR 0265's addendum). */
function openForm(row: string, form: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByTestId(row));
  return screen.findByTestId(form);
}

describe("the list and the page beside it (ADR 0265)", () => {
  it("opens a row's page beside the list, the row wearing the chosen ground, and says so before", () => {
    renderYou();
    expect(screen.getByTestId("you-pane-empty").textContent).toContain("Nothing open");
    const pane = openPage("people-row");
    expect(within(pane).getByRole("heading").textContent).toBe("People");
    expect(screen.getByTestId("people-row").getAttribute("aria-current")).toBe("page");
    // Beside the list, People has no way back: the list is right there.
    expect(within(pane).queryByRole("button", { name: /You/ })).toBeNull();
    // A person opens in its place, with the way back to People.
    fireEvent.click(screen.getAllByTestId("person-row")[1] as HTMLElement);
    const person = screen.getByTestId("you-pane");
    expect(within(person).getByRole("heading", { level: 2 }).textContent).toBe("Dana");
    fireEvent.click(within(person).getByRole("button", { name: "‹ People" }));
    expect(screen.getByTestId("people")).toBeDefined();
    // Another row's page takes its place.
    openPage("workspace-log");
    expect(within(screen.getByTestId("you-pane")).getByRole("heading").textContent).toBe(
      "Workspace log",
    );
    expect(screen.getByTestId("people-row").getAttribute("aria-current")).toBeNull();
  });

  it("stands a page in the list's place where You is narrow, with the way back to You", () => {
    const narrow = phoneWidth();
    try {
      renderYou();
      expect(screen.queryByTestId("you-pane-empty")).toBeNull();
      const pane = openPage("people-row");
      expect(
        screen.getByRole("main", { name: "You" }).querySelector<HTMLElement>(".you-list-col")
          ?.hidden,
      ).toBe(true);
      fireEvent.click(within(pane).getByRole("button", { name: "‹ You" }));
      expect(screen.queryByTestId("you-pane")).toBeNull();
      expect(
        screen.getByRole("main", { name: "You" }).querySelector<HTMLElement>(".you-list-col")
          ?.hidden,
      ).toBe(false);
    } finally {
      narrow();
    }
  });

  it("opens the workspace's log beside the list, a decision a row, its room a button", () => {
    const opened: string[] = [];
    renderYou({
      model: buildModel([...workspace(), fixture("run.pause", 6)]),
      onOpenSpace: (spaceId) => opened.push(spaceId),
    });
    const pane = openPage("workspace-log");
    const entries = within(pane).getAllByRole("listitem");
    // Newest first; who comes under what was decided, with when and where.
    expect(entries.map((each) => each.querySelector(".audit-kind")?.textContent)).toEqual([
      "Run",
      "People",
      "People",
    ]);
    expect(entries[2]?.textContent).toContain("Arjun joined as owner");
    expect(entries[0]?.textContent).toContain("paused the run · Budget reached 100 percent.");
    expect(entries[0]?.querySelector("small")?.textContent).toMatch(/ · Chips · PO-4471$/);
    fireEvent.click(within(entries[0] as HTMLElement).getByRole("button", { name: "PO-4471" }));
    expect(opened).toEqual(["spc_01K4ZQPX000000000000000002"]);
  });

  it("opens Relay when the setup card's Away from home sends You there (ADR 0245)", async () => {
    const relay = {
      read: async () => ({
        configured: true,
        on: true,
        setBy: undefined,
        setAt: undefined,
        devices: [],
        keptLink: undefined,
      }),
      set: async () => {
        throw new Error("not here");
      },
      ask: async () => 0,
      forget: async () => undefined,
      relayHost: "relay.chipschat.ai",
      serverUrl: "http://192.168.1.20:4431",
      machine: async () => "Arjun's Mac mini",
      here: { deviceId: HERE, word: "This browser" },
    };
    const { again } = renderYou({ relay });
    expect(await screen.findByTestId("relay-row-open")).toBeDefined();
    expect(screen.getByTestId("relay-row-open").textContent).toContain("On");
    again({ relay: { ...relay, reveal: 1 } });
    expect(within(screen.getByTestId("you-pane")).getByRole("heading").textContent).toBe("Relay");
    expect(await screen.findByTestId("relay-switch")).toBeDefined();
  });
});

describe("a short setting is a page too (ADR 0265's addendum)", () => {
  const limits = (set: unknown[] = []): LimitsService => ({
    set: (caps) => set.push(caps),
    ceiling: async () => 104_857_600,
    setExchange: () => undefined,
  });
  /** The column beside the list, where pages stand. */
  const paneColumn = () =>
    screen.getByRole("main", { name: "You" }).querySelector<HTMLElement>(".you-pane-col");
  const listColumn = () =>
    screen.getByRole("main", { name: "You" }).querySelector<HTMLElement>(".you-list-col");

  it("opens beside the list, its row lit and the keyboard in it, one page at a time", async () => {
    renderYou({ limits: limits() }, [device("Chips for Mac", { current: true })]);
    const caps = await openForm("caps-row", "attachment-caps");
    expect(paneColumn()?.contains(caps)).toBe(true);
    expect(screen.queryByTestId("you-pane-empty")).toBeNull();
    expect(within(caps).getByRole("heading", { level: 2 }).textContent).toBe("Attachment limits");
    expect(screen.getByTestId("caps-row").getAttribute("aria-current")).toBe("page");
    expect(document.activeElement).toBe(within(caps).getByLabelText("Photos"));
    // Beside the list, no way back: the list is right there, and the next row takes its place.
    expect(within(caps).queryByRole("button", { name: /‹/ })).toBeNull();
    const pair = await openForm("issue-code", "pair-form");
    expect(screen.queryByTestId("attachment-caps")).toBeNull();
    expect(screen.getByTestId("caps-row").getAttribute("aria-current")).toBeNull();
    expect(screen.getByTestId("issue-code").getAttribute("aria-current")).toBe("page");
    // With no field in it, its name has the keyboard.
    expect(document.activeElement).toBe(within(pair).getByRole("heading", { level: 2 }));
    // A page puts the form away, and a form the page.
    openPage("people-row");
    expect(screen.queryByTestId("pair-form")).toBeNull();
    expect(screen.getByTestId("issue-code").getAttribute("aria-current")).toBeNull();
    await openForm("caps-row", "attachment-caps");
    expect(screen.queryByTestId("you-pane")).toBeNull();
    expect(screen.getByTestId("people-row").getAttribute("aria-current")).toBeNull();
  });

  it("goes back on Cancel with nothing saved, and on Save once saved, to its row", async () => {
    const set: unknown[] = [];
    renderYou({ limits: limits(set) });
    let caps = await openForm("caps-row", "attachment-caps");
    fireEvent.change(within(caps).getByLabelText("Videos"), { target: { value: "25" } });
    fireEvent.click(within(caps).getByTestId("attachment-caps-cancel"));
    expect(screen.queryByTestId("attachment-caps")).toBeNull();
    expect(set).toEqual([]);
    expect(screen.getByTestId("you-pane-empty")).toBeDefined();
    expect(document.activeElement).toBe(screen.getByTestId("caps-row"));

    caps = await openForm("caps-row", "attachment-caps");
    fireEvent.change(within(caps).getByLabelText("Videos"), { target: { value: "25" } });
    fireEvent.click(within(caps).getByTestId("attachment-caps-save"));
    expect(set).toEqual([{ image: null, video: 26_214_400, file: null }]);
    expect(screen.queryByTestId("attachment-caps")).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId("caps-row"));
  });

  it("stands in the list's place where You is narrow, and ‹ You goes back to its row", async () => {
    const narrow = phoneWidth();
    try {
      renderYou({ limits: limits() });
      expect(paneColumn()?.hidden).toBe(true);
      const caps = await openForm("caps-row", "attachment-caps");
      expect(listColumn()?.hidden).toBe(true);
      expect(paneColumn()?.hidden).toBe(false);
      fireEvent.click(within(caps).getByRole("button", { name: "‹ You" }));
      expect(screen.queryByTestId("attachment-caps")).toBeNull();
      expect(listColumn()?.hidden).toBe(false);
      expect(paneColumn()?.hidden).toBe(true);
      expect(document.activeElement).toBe(screen.getByTestId("caps-row"));
    } finally {
      narrow();
    }
  });
});

describe("your face (ADR 0272)", () => {
  it("opens the face picker as a page beside the list, from your face, and saves each pick", () => {
    const done = renderYou();
    const face = screen.getByTestId("profile-face");
    expect(face.getAttribute("aria-label")).toBe("Your face");
    fireEvent.click(face);
    const pane = screen.getByTestId("you-pane");
    expect(within(pane).getByRole("heading", { level: 2 }).textContent).toBe("Your face");
    expect(face.getAttribute("aria-current")).toBe("page");
    const picker = within(pane).getByTestId("your-face");
    expect(picker.querySelector(".face-head")?.textContent).toContain("Arjun");
    expect(picker.querySelector(".face-head")?.textContent).toContain("Owner · Demo");

    fireEvent.click(within(pane).getByRole("radio", { name: "Navy" }));
    fireEvent.click(within(pane).getByTestId("mark-rocket"));
    expect(done.faces).toEqual([
      { icon: "", ground: 23 },
      { icon: "rocket", ground: 23 },
    ]);
  });

  it("says why a pick did not stick, at the top of the page", async () => {
    const done = renderYou();
    fireEvent.click(screen.getByTestId("profile-face"));
    fireEvent.click(screen.getByRole("radio", { name: "Ink" }));
    expect(done.faces).toEqual([{ icon: "", ground: 26 }]);
    expect((await screen.findByTestId("icon-failed")).textContent).toBe(
      "Not saved: this server is older than the app, and has no icons yet.",
    );
  });

  it("stands in the list's place where You is narrow, with the way back", () => {
    const narrow = phoneWidth();
    try {
      renderYou();
      fireEvent.click(screen.getByTestId("profile-face"));
      const pane = screen.getByTestId("you-pane");
      expect(within(pane).getByTestId("your-face")).toBeTruthy();
      fireEvent.click(within(pane).getByRole("button", { name: "‹ You" }));
      expect(screen.queryByTestId("you-pane")).toBeNull();
    } finally {
      narrow();
    }
  });
});

describe("the words for where it is", () => {
  it("says this browser in a browser, and this computer inside the app", () => {
    renderYou({ onMute: () => undefined });
    expect(screen.getByTestId("sign-out").textContent).toBe("Sign out of this browser");
    expect(within(screen.getByTestId("mute")).getByRole("switch").getAttribute("aria-label")).toBe(
      "Banners in this browser",
    );
    expect(screen.getByTestId("appearance").textContent).toContain("this browser only");
    expect(screen.getByTestId("about").textContent).toContain("This browser");
  });

  it("names the computer, and the menu bar, in the desktop app", () => {
    renderYou({ desktop: true, muted: true, onMute: () => undefined });
    expect(screen.getByTestId("sign-out").textContent).toBe("Sign out of this computer");
    const mute = screen.getByTestId("mute");
    expect(within(mute).getByRole("switch", { name: "Banners on this computer" })).toBeDefined();
    expect(mute.textContent).toContain(
      "Off. Nothing from Demo reaches a banner or the menu bar here.",
    );
    expect(screen.getByTestId("appearance").textContent).toContain("this computer only");
    expect(within(screen.getByTestId("about")).getByRole("heading").textContent).toBe(
      "This computer",
    );
  });

  it("says the role in a line, and the server and the build under This browser", () => {
    renderYou();
    expect(screen.getByTestId("my-role").textContent).toBe("Owner · Demo");
    expect(screen.getByTestId("you-workspace").textContent).toBe("Workspace Demo");
    expect(screen.getByTestId("about-server").textContent).toBe("Server chips.example:4431");
    expect(screen.getByTestId("build").textContent).toMatch(/^Version.+ · .+$/);
  });

  it("puts Sign out and Delete your account at the foot, red, as the phone does (ADR 0243)", () => {
    const signedOut: string[] = [];
    renderYou({ onSignOut: () => signedOut.push("out"), onDeleteAccount: async () => undefined });
    const foot = screen.getByTestId("your-account");
    expect(
      within(foot)
        .getAllByRole("button")
        .map((each) => each.textContent),
    ).toEqual(["Sign out of this browser", "Delete your account"]);
    expect(foot.textContent).toContain("Sign out leaves the workspace as it is.");
    fireEvent.click(screen.getByTestId("sign-out"));
    expect(signedOut).toEqual(["out"]);
  });
});

describe("appearance", () => {
  it("applies the theme chosen at once, and back to the system's", () => {
    renderYou();
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    expect((within(group).getByRole("radio", { name: "System" }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(within(group).getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect((within(group).getByRole("radio", { name: "Dark" }) as HTMLInputElement).checked).toBe(
      true,
    );
    fireEvent.click(within(group).getByRole("radio", { name: "System" }));
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });
  it("offers the faces' two themes in the same card, each preview held in its own (ADR 0176)", () => {
    renderYou();
    const card = screen.getByTestId("appearance");
    const themes = within(card).getByRole("radiogroup", { name: "Theme" });
    const soothing = within(themes).getByRole("radio", { name: "Soothing" }) as HTMLInputElement;
    expect(soothing.checked).toBe(true);
    expect(
      screen
        .getByTestId("face-theme-bright")
        .querySelector("[data-faces]")
        ?.getAttribute(FACES_ATTRIBUTE),
    ).toBe("bright");
    fireEvent.click(within(themes).getByRole("radio", { name: "Bright" }));
    expect(document.documentElement.getAttribute(FACES_ATTRIBUTE)).toBe("bright");
    fireEvent.click(within(themes).getByRole("radio", { name: "Soothing" }));
    expect(document.documentElement.hasAttribute(FACES_ATTRIBUTE)).toBe(false);
  });
});

describe("devices (ADR 0085)", () => {
  it("leads with this one, then the last seen, and folds a month's absence under one row", async () => {
    const done = renderYou({}, [
      device("chips CLI", { lastSeenAt: ago(3) }),
      device("Safari on Mac", { lastSeenAt: ago(0.1) }),
      device("Chips for Mac", { current: true, deviceId: HERE, lastSeenAt: ago(0) }),
      device("iPhone", { lastSeenAt: ago(45) }),
      device("This browser", { lastSeenAt: undefined, pairedAt: ago(60) }),
    ]);
    const rows = await screen.findAllByTestId("device-row");
    expect(rows.map((row) => row.querySelector(".you-lrow-lab > span")?.textContent)).toEqual([
      "Chips for Mac",
      "Safari on Mac",
      "chips CLI",
    ]);
    expect(rows[0]?.textContent).toContain("This one");
    expect(rows[1]?.querySelector("[data-kind]")?.getAttribute("data-kind")).toBe("browser");
    expect(rows[2]?.querySelector("[data-kind]")?.getAttribute("data-kind")).toBe("terminal");
    expect(rows[2]?.textContent).toContain("Seen 3d ago");

    // The two not seen for a month, folded; opened, each can go on its own.
    const fold = screen.getByTestId("stale-fold");
    expect(fold.textContent).toBe("2 not seen in a monthShow");
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(fold);
    expect(screen.getAllByTestId("device-row")).toHaveLength(5);

    // All at once asks first; cancelled, nothing goes.
    fireEvent.click(screen.getByTestId("sign-out-stale"));
    const dialog = screen.getByTestId("confirm-dialog");
    expect(dialog.textContent).toContain("Sign out 2 devices?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(done.revoked).toEqual([]);

    fireEvent.click(screen.getByTestId("sign-out-stale"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-go"));
    });
    await waitFor(() => expect(screen.queryByTestId("stale-devices")).toBeNull());
    expect(done.revoked).toEqual(["dev_iPhone", "dev_This_browser"]);
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("puts the code for another device in a form out of Pair another device, with its QR", async () => {
    const done = renderYou({}, [device("Chips for Mac", { current: true })]);
    const form = await openForm("issue-code", "pair-form");
    await waitFor(() =>
      expect(within(form).getByTestId("pairing-code").textContent).toBe("QRS-789"),
    );
    expect(within(form).getByTestId("issued-code").textContent).toContain("On this network only");
    // The address to type beside the code on a phone, not a long link (the onboarding audit, item 30).
    expect(within(form).getByTestId("pairing-address").textContent).toBe(
      "http://192.168.1.20:4431",
    );
    await waitFor(() =>
      expect(within(form).getByTestId("pairing-qr").getAttribute("data-link")).toBe(
        "https://chipschat.ai/p#pair=QRS-789&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431",
      ),
    );
    fireEvent.click(within(form).getByRole("button", { name: "Another code" }));
    await waitFor(() => expect(done.pairedFor).toHaveLength(2));
    // A server too old to make a computer's link offers none.
    expect(screen.queryByTestId("pair-computer-link")).toBeNull();
  });

  it("offers a computer the relay's /pair link beside the phone's QR, and copies it (ADR 0210)", async () => {
    const { people } = fakePeople([device("Chips for Mac", { current: true })]);
    const link = "https://relay.chipschat.ai/pair#pair=QRS-789&v=1";
    const issuePairingCode = async () => ({
      code: "QRS-789",
      expiresAt: new Date(NOW + 15 * 60_000).toISOString(),
      url: "http://192.168.1.20:4431/#pair=QRS-789",
      relay: "wss://relay.chipschat.ai",
      link,
    });
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    try {
      renderYou({ people: { ...people, issuePairingCode } });
      fireEvent.click(screen.getByTestId("issue-code"));
      const offer = await screen.findByTestId("pair-computer-link");
      expect(offer.textContent).toContain(
        "For a computer, send this link. It opens on any network.",
      );
      expect(screen.getByTestId("pair-link").textContent).toBe(link);
      fireEvent.click(screen.getByTestId("copy-pair-link"));
      expect(writeText).toHaveBeenCalledWith(link);
      await waitFor(() => expect(screen.getByTestId("copy-pair-link").textContent).toBe("Copied"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("draws no phone QR for a server only this computer reaches, and says how to let a phone in", async () => {
    const { people } = fakePeople([device("Chips for Mac", { current: true })]);
    const issuePairingCode = async () => ({
      code: "QRS-789",
      expiresAt: new Date(NOW + 15 * 60_000).toISOString(),
      url: "http://127.0.0.1:4431/#pair=QRS-789",
      relay: undefined,
    });
    renderYou({ people: { ...people, issuePairingCode } });
    fireEvent.click(screen.getByTestId("issue-code"));
    const issued = await screen.findByTestId("issued-code");
    expect(issued.textContent).toContain("so a phone can't reach it");
    expect(issued.textContent).toContain("chips up --reach lan");
    expect(screen.queryByTestId("pairing-qr")).toBeNull();
  });

  it("reads the list once the connection is open, and says nothing is wrong before it", async () => {
    const { people } = fakePeople([]);
    const devices = vi.fn(async () => [device("Chips for Mac", { current: true })]);
    const { again } = renderYou({ connected: false, people: { ...people, devices } });
    expect(devices).not.toHaveBeenCalled();
    expect(within(screen.getByTestId("devices")).queryByRole("alert")).toBeNull();
    again({ connected: true });
    expect(await screen.findAllByTestId("device-row")).toHaveLength(1);
    expect(devices).toHaveBeenCalledTimes(1);
  });

  it("reads it again when the connection opens again, and lets go of why it could not", async () => {
    const { people } = fakePeople([]);
    const devices = vi
      .fn<() => Promise<PairedDeviceRecord[]>>()
      .mockRejectedValueOnce(new TypeError("Load failed"))
      .mockResolvedValue([device("Chips for Mac", { current: true })]);
    const { again } = renderYou({ people: { ...people, devices } });
    expect(await within(screen.getByTestId("devices")).findByRole("alert")).toBeTruthy();
    again({ connected: false });
    again({ connected: true });
    expect(await screen.findAllByTestId("device-row")).toHaveLength(1);
    expect(within(screen.getByTestId("devices")).queryByRole("alert")).toBeNull();
  });

  it("reads a date as a date, and a moment ago as one", () => {
    expect(seenWords("Seen", new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe("Seen 5m ago");
    expect(seenWords("Seen", new Date(NOW).toISOString(), NOW)).toBe("Seen now");
    expect(seenWords("Paired", ago(30), NOW)).toMatch(/^Paired [A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe("passkeys", () => {
  it("are drawn only where one can work, and one is named for the browser that made it", async () => {
    const agent = vi
      .spyOn(navigator, "userAgent", "get")
      .mockReturnValue(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      );
    try {
      const done = renderYou({ passkeysWork: true });
      const card = screen.getByTestId("passkeys");
      expect(await within(card).findByText(/None yet/)).toBeDefined();
      fireEvent.click(within(card).getByTestId("add-passkey"));
      await waitFor(() => expect(done.passkeysAdded).toEqual(["Chrome on Mac"]));
    } finally {
      agent.mockRestore();
    }
  });
});

describe("the workspace's rows", () => {
  it("are under its name, for an owner, with an invite that may be used many times", async () => {
    const set: unknown[] = [];
    const limits: LimitsService = {
      set: (caps) => set.push(caps),
      ceiling: async () => 104_857_600,
      setExchange: () => undefined,
    };
    const done = renderYou({ limits });
    expect(screen.getByRole("heading", { name: "Demo" })).toBeDefined();
    expect(screen.getByTestId("people-row").textContent).toContain("1 owner · 1 member");
    await waitFor(() => expect(screen.getByTestId("caps-row").textContent).toContain("100 MB"));

    // The limits in their form: blank is the server's, a cap over it is refused in its words.
    const caps = await openForm("caps-row", "attachment-caps");
    expect((within(caps).getByLabelText("Photos") as HTMLInputElement).placeholder).toBe("100");
    fireEvent.change(within(caps).getByLabelText("Videos"), { target: { value: "500" } });
    fireEvent.click(within(caps).getByTestId("attachment-caps-save"));
    expect(within(caps).getByTestId("caps-error").textContent).toMatch(/100 MB/);
    expect(set).toEqual([]);
    fireEvent.change(within(caps).getByLabelText("Videos"), { target: { value: "25" } });
    fireEvent.click(within(caps).getByTestId("attachment-caps-save"));
    expect(set).toEqual([{ image: null, video: 26_214_400, file: null }]);

    openPage("invite-someone");
    fireEvent.change(screen.getByRole("combobox", { name: "Invite uses" }), {
      target: { value: "open" },
    });
    fireEvent.click(screen.getByTestId("make-invite"));
    await waitFor(() => expect(done.invites).toEqual([{ role: "member", singleUse: false }]));
    expect(await screen.findByTestId("invite-url")).toBeDefined();
    // The server's own address, as a server whose relay was never turned on makes it (ADR 0245):
    // the link says where it opens, whatever the switch says.
    expect(screen.getByTestId("invite-relay-off").textContent).toBe(
      "The relay is off, so this link opens only on the server's own network.",
    );
  });

  it("offer an owner the relay beside a link that opens only at home, from the shell", async () => {
    const opened: string[] = [];
    const { props } = renderYou();
    cleanup();
    render(
      <OpenRelay.Provider value={() => opened.push("relay")}>
        <You {...props} />
      </OpenRelay.Provider>,
    );
    openPage("invite-someone");
    fireEvent.click(screen.getByTestId("make-invite"));
    fireEvent.click(await screen.findByTestId("invite-turn-on-relay"));
    expect(opened).toEqual(["relay"]);
  });

  it("say nothing of where the relay's link opens, since it opens anywhere", async () => {
    const relayLink =
      "https://relay.chipschat.ai/join#invite=chips_inv_test&lan=http%3A%2F%2F192.168.1.20%3A4431&relay=wss%3A%2F%2Frelay.chipschat.ai&key=k";
    const { props } = renderYou();
    cleanup();
    const people = {
      ...props.people,
      createInvite: async (role: WorkspaceRole, singleUse: boolean) => ({
        inviteId: "inv_1",
        url: relayLink,
        role,
        singleUse,
        expiresAt: new Date(NOW + DAY).toISOString(),
        spaceId: undefined,
      }),
    };
    render(<You {...props} people={people} />);
    openPage("invite-someone");
    fireEvent.click(screen.getByTestId("make-invite"));
    expect(await screen.findByTestId("invite-url")).toBeDefined();
    expect(screen.queryByTestId("invite-relay-off")).toBeNull();
    // It asks (ADR 0232): the maker learns where the Allow comes up.
    expect(screen.getByTestId("invite-asks").textContent).toBe(
      "When somebody opens it, you'll be asked to allow them wherever you have Chips open.",
    );
  });

  it("show a link made once as used once somebody joined by it, with no Copy or Withdraw", async () => {
    const { props } = renderYou();
    cleanup();
    const people = {
      ...props.people,
      // The link Dana joined by, as the server would hand it back.
      createInvite: async (role: WorkspaceRole) => ({
        inviteId: "inv_01K4ZQPX0000000000000000D1",
        url: "http://192.168.1.20:4431/#invite=chips_inv_test",
        role,
        singleUse: true,
        expiresAt: new Date(NOW + DAY).toISOString(),
        spaceId: undefined,
      }),
    };
    render(<You {...props} people={people} />);
    openPage("invite-someone");
    fireEvent.click(screen.getByTestId("make-invite"));
    const issued = within(await screen.findByTestId("issued-invite"));
    expect(issued.getByTestId("invite-used").textContent).toBe("Used: Dana joined by it");
    expect(issued.queryByRole("button", { name: "Copy" })).toBeNull();
    expect(issued.queryByRole("button", { name: "Withdraw" })).toBeNull();
    expect(issued.queryByTestId("invite-qr")).toBeNull();
    expect(issued.queryByTestId("invite-relay-off")).toBeNull();
  });

  it("say a link opens only where the server is while an owner has the relay off (ADR 0211)", async () => {
    renderYou({ model: buildModel([...workspace(), fixture("relay.set", 6)]) });
    openPage("invite-someone");
    fireEvent.click(screen.getByTestId("make-invite"));
    expect((await screen.findByTestId("invite-relay-off")).textContent).toBe(
      "The relay is off, so this link opens only on the server's own network.",
    );
  });

  it("say when Chips steps in on agents, and save a stop, a hold and the switch (ADR 0187)", async () => {
    const set: unknown[] = [];
    renderYou({
      limits: {
        set: () => undefined,
        ceiling: async () => 104_857_600,
        setExchange: (limits) => set.push(limits),
      },
    });
    expect(screen.getByTestId("exchange-limits-row").textContent).toContain(
      "Stop after 16 · hold after 48",
    );
    const card = within(await openForm("exchange-limits-row", "exchange-limits"));
    expect(card.getByText(/Agents in a space can pass work to each other/)).toBeDefined();
    expect(card.getByTestId("exchange-words").textContent).toBe(
      "Chips tells agents the count from 8 messages to each other with nobody acting, tells them to stop after 16, or sooner in circles, and holds them after 48.",
    );
    // 64 is over the hold of 48, so it waits for the hold to go.
    expect((card.getByRole("radio", { name: "64" }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(
      within(card.getByTestId("exchange-hold")).getByRole("radio", { name: "Never" }),
    );
    fireEvent.click(card.getByRole("radio", { name: "64" }));
    fireEvent.click(card.getByRole("switch", { name: "Stop them when they go in circles" }));
    expect(card.getByTestId("exchange-words").textContent).toBe(
      "Chips tells agents the count from 32 messages to each other with nobody acting, tells them to stop after 64, and never holds them.",
    );
    expect(card.getByText(/Spend per job still pauses them/)).toBeDefined();
    fireEvent.click(card.getByTestId("exchange-limits-save"));
    expect(set).toEqual([{ stop: 64, hold: null, circles: false }]);
  });

  it("take the stop down under a hold picked below it, and say why an Other is not whole", async () => {
    const set: unknown[] = [];
    renderYou({
      limits: {
        set: () => undefined,
        ceiling: async () => 104_857_600,
        setExchange: (limits) => set.push(limits),
      },
    });
    const card = within(await openForm("exchange-limits-row", "exchange-limits"));
    const stop = within(card.getByTestId("exchange-stop"));
    const hold = within(card.getByTestId("exchange-hold"));
    fireEvent.click(hold.getByRole("radio", { name: "24" }));
    expect((stop.getByRole("radio", { name: "16" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(stop.getByRole("radio", { name: "Other" }));
    expect(card.getByRole("alert").textContent).toBe(
      "Tell them to stop after a whole number from 4 to 500.",
    );
    // Saved while it isn't whole, the form stays up with why, and nothing is sent.
    fireEvent.click(card.getByTestId("exchange-limits-save"));
    expect(set).toEqual([]);
    fireEvent.change(card.getByTestId("exchange-stop-other"), { target: { value: "12" } });
    fireEvent.click(card.getByTestId("exchange-limits-save"));
    expect(set).toEqual([{ stop: 12, hold: 24, circles: true }]);
  });

  it("offer Remove… on everyone the reader may remove, and ask first (ADR 0160)", async () => {
    const removed: string[] = [];
    const directory: Directory = {
      ...DIRECTORY,
      [SCOUT]: { id: SCOUT, kind: "harness", displayName: "Scout", ownerId: DANA },
    };
    renderYou({
      directory,
      onRemovePerson: async (participantId) => {
        removed.push(participantId);
      },
    });
    // Nobody removes themselves.
    expect(within(openPerson(ARJUN)).queryByTestId("remove-person")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "‹ People" }));
    const danas = openPerson(DANA);
    expect(within(danas).getByTestId("remove-person").textContent).toBe("Remove from Demo…");
    fireEvent.click(within(danas).getByRole("button", { name: "Remove Dana…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Remove Dana from Demo?");
    expect(dialog.textContent).toContain("Scout becomes yours.");
    expect(dialog.textContent).toContain("To come back, Dana needs a new invite.");

    // Keep changes nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(removed).toEqual([]);

    fireEvent.click(within(danas).getByRole("button", { name: "Remove Dana…" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removed).toEqual([DANA]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("go back to People when the person whose page is open leaves (ADR 0160)", () => {
    const { again } = renderYou();
    openPerson(DANA);
    again({ model: buildModel([...workspace(), fixture("person.removed", 5)]) });
    expect(screen.queryByTestId("person-details")).toBeNull();
    expect(screen.getByTestId("people")).toBeDefined();
  });

  it("offer an owner New phone… for everyone else: the code, its QR, and the app's link to send (ADR 0206)", async () => {
    const done = renderYou();
    expect(within(openPerson(ARJUN)).queryByTestId("new-phone")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "‹ People" }));
    const danas = openPerson(DANA);
    fireEvent.click(within(danas).getByRole("button", { name: "A new phone for Dana…" }));
    const panel = await screen.findByTestId("new-phone-panel");
    await waitFor(() =>
      expect(within(panel).getByTestId("pairing-code").textContent).toBe("QRS-789"),
    );
    expect(done.pairedFor).toEqual([DANA]);
    expect(within(panel).getByRole("heading").textContent).toBe("A new phone for Dana");
    expect(panel.textContent).toContain("Scan the QR with Dana's phone's camera.");
    expect(within(panel).getByTestId("new-phone-link").textContent).toBe(
      "https://chipschat.ai/p#pair=QRS-789&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431",
    );
    await waitFor(() => expect(within(panel).getByRole("img")).toBeTruthy());
    fireEvent.click(within(panel).getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("new-phone-panel")).toBeNull();
  });

  it("offer an owner Reconnect… on a device of somebody else's, a code that takes its place (ADR 0236)", async () => {
    const done = renderYou();
    const danas = openPerson(DANA);
    const device = await within(danas).findByTestId("person-device");
    fireEvent.click(within(device).getByRole("button", { name: "Reconnect Dana's iPhone…" }));
    const panel = await within(danas).findByTestId("reconnect-panel");
    await waitFor(() =>
      expect(within(panel).getByTestId("pairing-code").textContent).toBe("QRS-789"),
    );
    expect(done.pairedFor).toEqual([DANA]);
    expect(done.replacing).toEqual(["dev_danas_iphone"]);
    expect(within(panel).getByRole("heading").textContent).toBe("Reconnect Dana's iPhone");
    expect(panel.textContent).toContain(
      "Chips deleted from it, or the phone reset? Scan the QR with its camera. It takes this Dana's iPhone's place, with every space and everything Dana said, and the old one is signed out.",
    );
    // Another code names the same phone; Done puts the panel away.
    fireEvent.click(within(panel).getByRole("button", { name: "Another code" }));
    await waitFor(() => expect(done.replacing).toEqual(["dev_danas_iphone", "dev_danas_iphone"]));
    fireEvent.click(within(panel).getByRole("button", { name: "Done" }));
    expect(within(danas).queryByTestId("reconnect-panel")).toBeNull();
    // New phone… still names none.
    fireEvent.click(within(danas).getByRole("button", { name: "A new phone for Dana…" }));
    await screen.findByTestId("new-phone-panel");
    await waitFor(() => expect(done.replacing).toHaveLength(3));
    expect(done.replacing[2]).toBeUndefined();
  });

  it("sign a device of somebody else's out, and list it no more (ADR 0236)", async () => {
    const done = renderYou();
    const danas = openPerson(DANA);
    const device = await within(danas).findByTestId("person-device");
    fireEvent.click(within(device).getByRole("button", { name: "Sign out Dana's iPhone" }));
    await waitFor(() => expect(within(danas).getByTestId("person-no-devices")).toBeDefined());
    expect(done.revoked).toEqual(["dev_danas_iphone"]);
  });

  it("give an admin neither Reconnect… nor Sign out on an owner's devices (ADR 0236)", async () => {
    const events = workspace().map((event) =>
      event.type === "person.joined" && event.seq === 2 ? { ...event, role: "admin" } : event,
    );
    renderYou({ model: buildModel(events), selfId: DANA });
    const arjuns = openPerson(ARJUN);
    const device = await within(arjuns).findByTestId("person-device");
    expect(within(device).queryByRole("button")).toBeNull();
  });

  it("list people with their role in its colour, filter them, and open one to say what they can do (ADR 0209)", async () => {
    renderYou({}, [], LINKS);
    openPage("people-row");
    const card = within(screen.getByTestId("people"));
    const rows = () => card.getAllByTestId("person-row");
    expect(rows().map((row) => row.getAttribute("data-role"))).toEqual(["owner", "member"]);
    expect(within(rows()[0] as HTMLElement).getByTestId("role-tag").textContent).toBe("Owner");
    expect(rows()[1]?.textContent).toMatch(/Joined/);
    expect(card.getByText("2 people in Demo.")).toBeDefined();

    // Members only, then everybody again.
    fireEvent.click(card.getByTestId("filter-member"));
    expect(rows().map((row) => row.getAttribute("data-participant"))).toEqual([DANA]);
    expect(card.getByTestId("filter-member").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(card.getByTestId("filter-all"));
    expect(rows()).toHaveLength(2);

    fireEvent.click(rows()[1] as HTMLElement);
    const details = within(screen.getByTestId("person-details"));
    // Devices comes after, once they are read.
    expect(
      details
        .getAllByRole("heading")
        .slice(0, 3)
        .map((each) => each.textContent),
    ).toEqual(["What Dana can do", "In Demo", "Spaces you share"]);
    // Dana's role is the picker; the one owner's can't be changed, so it is said.
    expect(details.getByRole("combobox", { name: "Dana's role" })).toBeDefined();
    expect(details.getByText("Sees everybody in Demo")).toBeDefined();
    expect(
      details.getByText("Can't invite, open a space, or put agents that aren't theirs in a space"),
    ).toBeDefined();
    await waitFor(() =>
      expect(details.getByTestId("person-came-by").textContent).toMatch(
        /^Your member link, made (6 September|September 6)$/,
      ),
    );
    const device = await details.findByTestId("person-device");
    expect(device.textContent).toContain("Dana's iPhone");
    expect(device.textContent).toContain("Seen 2h ago");
    expect(details.getByRole("button", { name: "A new phone for Dana…" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "‹ People" }));
    fireEvent.click(screen.getAllByTestId("person-row")[0] as HTMLElement);
    expect(screen.getByTestId("person-role").textContent).toBe("RoleOwner");
  });

  it("list the spaces you share with a person by face and name, each opening its room (ADR 0209)", () => {
    const opened: string[] = [];
    renderYou({ onOpenSpace: (spaceId) => opened.push(spaceId) });
    const yours = within(within(openPerson(ARJUN)).getByTestId("person-spaces"));
    expect(yours.getByRole("heading").textContent).toBe("Your spaces");
    const room = yours.getByTestId("person-space");
    expect(room.textContent).toContain("PO-4471");
    // The room's face, as the rail draws it, beside its name.
    expect(room.querySelector(".ui-avatar")).not.toBeNull();
    fireEvent.click(room);
    expect(opened).toEqual(["spc_01K4ZQPX000000000000000002"]);
    // Dana is in no room Arjun is in.
    fireEvent.click(screen.getByRole("button", { name: "‹ People" }));
    expect(within(openPerson(DANA)).getByTestId("person-no-spaces").textContent).toBe("None yet.");
  });

  it("say what a link's newcomer will see, as the role and the room change, and make it into the room (ADR 0209)", async () => {
    const done = renderYou({}, [], LINKS);
    // The open link's count and time on the row, and over the links on its page.
    await waitFor(() =>
      expect(screen.getByTestId("invite-someone").textContent).toContain(
        "1 open link · runs out in 6 days",
      ),
    );
    openPage("invite-someone");
    const card = within(screen.getByTestId("invites"));
    expect(card.getByTestId("open-links").textContent).toBe(
      "Open links · 1 open link · runs out in 6 days",
    );
    expect(card.getByTestId("invite-row").textContent).toMatch(/^Guest6 days left · /);
    expect(card.getByTestId("used-link").textContent).toMatch(/Dana joined by it, /);

    // A member sees everybody.
    expect(card.getByTestId("invite-role-means").textContent).toMatch(/^A member sees everybody/);
    const people = card.getByTestId("sees-people");
    expect(people.querySelectorAll(".faces-shown-one.is-on")).toHaveLength(2);

    // A guest into the room sees only who's there.
    fireEvent.change(card.getByRole("combobox", { name: "Invite role" }), {
      target: { value: "guest" },
    });
    expect(card.getByTestId("invite-role-means").textContent).toBe(
      "A guest in no space sees nobody until somebody adds them to one.",
    );
    expect(people.querySelectorAll(".faces-shown-one.is-on")).toHaveLength(0);
    const into = card.getByRole("combobox", { name: "Invite into" }) as HTMLSelectElement;
    const room = [...into.options].find((each) => each.value !== "");
    fireEvent.change(into, { target: { value: room?.value } });
    expect(card.getByTestId("invite-into-means").textContent).toMatch(
      /^They land in .+, and stay there: a guest is in one space\.$/,
    );
    expect(card.getByTestId("invite-role-means").textContent).toMatch(
      /^A guest in .+ sees only who's there: Arjun.*\. Nothing else in Demo\.$/,
    );

    // An admin's link names no room.
    fireEvent.change(card.getByRole("combobox", { name: "Invite role" }), {
      target: { value: "admin" },
    });
    expect(into.disabled).toBe(true);
    fireEvent.change(card.getByRole("combobox", { name: "Invite role" }), {
      target: { value: "guest" },
    });
    expect(into.value).toBe(room?.value);

    fireEvent.click(card.getByTestId("make-invite"));
    await waitFor(() =>
      expect(done.invites).toEqual([{ role: "guest", singleUse: true, spaceId: room?.value }]),
    );
    expect(await card.findByTestId("invite-qr")).toBeDefined();
    const preview = card.getByTestId("join-preview");
    expect(within(preview).getByRole("heading").textContent).toMatch(/^Join /);
  });

  it("ask an owner still called You for a name before they invite anybody (JR-17)", () => {
    renderYou({
      directory: { ...DIRECTORY, [ARJUN]: { id: ARJUN, kind: "person", displayName: "You" } },
    });
    openPage("invite-someone");
    expect(screen.getByTestId("name-first").textContent).toContain("Give yourself a name first");
    cleanup();
    renderYou();
    openPage("invite-someone");
    expect(screen.queryByTestId("name-first")).toBeNull();
  });

  it("are under a name an owner changes where it stands, and says why the server would not (ADR 0194)", async () => {
    const done = renderYou();
    const form = await openForm("you-workspace", "workspace-form");
    const field = within(form).getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
    expect(field.value).toBe("Demo");

    fireEvent.change(field, { target: { value: "  Primal " } });
    fireEvent.blur(field);
    await waitFor(() => expect(done.workspaceNames).toEqual(["Primal"]));

    fireEvent.change(field, { target: { value: "x" } });
    fireEvent.submit(field);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Only an owner of the workspace renames it.",
    );
    // The server's word replaces the draft: a rename on another device shows here.
    done.again({ workspaceName: "Primal Labs" });
    expect(field.value).toBe("Primal Labs");

    // Escape puts back the name, and sends nothing.
    fireEvent.change(field, { target: { value: "Someone else's" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    expect(field.value).toBe("Primal Labs");
    expect(done.workspaceNames).toEqual(["Primal", "x"]);
    expect(screen.getByTestId("you-workspace").textContent).toBe("Workspace Primal Labs");
  });

  it("are under the name alone for an admin, who may not change it", () => {
    const events = workspace().map((event) =>
      event.type === "person.joined" && event.seq === 2 ? { ...event, role: "admin" } : event,
    );
    renderYou({ model: buildModel(events), selfId: DANA });
    expect(screen.getByRole("heading", { name: "Demo" })).toBeDefined();
    expect(screen.getByTestId("my-role").textContent).toBe("Admin · Demo");
    // One workspace on this device and no rename: the row only says it.
    expect(screen.getByTestId("you-workspace").tagName).toBe("DIV");
    expect(screen.queryByTestId("invite-someone")).toBeNull();
    expect(screen.getByTestId("people-row")).toBeDefined();
  });

  it.each(["member", "guest"] as WorkspaceRole[])("are not drawn for a %s", (role) => {
    const events = workspace().map((event) =>
      event.type === "person.joined" && event.seq === 2 ? { ...event, role } : event,
    );
    renderYou({
      model: buildModel(events),
      selfId: DANA,
      limits: { set: vi.fn(), ceiling: vi.fn(), setExchange: vi.fn() },
    });
    expect(screen.queryByRole("heading", { name: "Demo" })).toBeNull();
    expect(screen.queryByTestId("people-row")).toBeNull();
    expect(screen.queryByTestId("invite-someone")).toBeNull();
    expect(screen.queryByTestId("caps-row")).toBeNull();
    expect(screen.queryByTestId("workspace-log")).toBeNull();
  });
});

describe("notifications", () => {
  /** Settings held as the store holds them, and a save the test can refuse. */
  function fakeSettings(refuse = false) {
    let held: NotificationSettings = DEFAULT_NOTIFICATION_SETTINGS;
    const service: NotificationsService = {
      settings: () => held,
      load: async () => held,
      save: async (next) => {
        if (refuse) throw new Error("The server is away.");
        held = next;
      },
    };
    return service;
  }

  it("says each setting on its row, and saves the one picked in its form", async () => {
    const service = fakeSettings();
    renderYou({ notifications: service });
    expect(screen.getByTestId("decisions-row").textContent).toBe("Decisions Right away");
    expect(screen.getByTestId("quiet-row").textContent).toContain("Off");
    const form = await openForm("decisions-row", "decide-form");
    await act(async () => {
      fireEvent.click(within(form).getByRole("radio", { name: /Off/ }));
    });
    expect(service.settings().decide).toBe("off");
    expect(screen.getByTestId("decisions-row").textContent).toBe("Decisions Off");
  });

  it("says what quiet hours let through as they are set", async () => {
    const service = fakeSettings();
    renderYou({ notifications: service });
    const form = await openForm("quiet-row", "quiet-form");
    expect(within(form).queryByTestId("quiet-window")).toBeNull();
    await act(async () => {
      fireEvent.click(within(form).getByRole("switch", { name: "Quiet hours" }));
    });
    expect(within(form).getByTestId("quiet-window")).toBeDefined();
    const night = { from: "22:00", to: "07:00", breakthrough: "decide" } as const;
    expect(service.settings().quiet).toEqual(night);
    expect(within(form).getByTestId("quiet-words").textContent).toBe(
      `${quietWords(night)}. Only decisions get through.`,
    );
    expect(screen.getByTestId("quiet-row").textContent).toContain(quietWords(night));
  });

  it("names every agent in the workspace with its face, and says Decisions only in full", async () => {
    const ledger = "hrn_ledger";
    renderYou({
      notifications: fakeSettings(),
      // Ledger has never run: it can be quietened before it does.
      directory: { ...DIRECTORY, [ledger]: { id: ledger, kind: "harness", displayName: "Ledger" } },
    });
    expect(screen.getByTestId("agents-row").textContent).toBe("Agents Everything");
    const form = await openForm("agents-row", "agents-form");
    const agents = within(form).getByTestId("notify-harnesses");
    expect(within(agents).getByRole("img", { name: "Scout" })).toBeDefined();
    expect(
      within(agents)
        .getAllByRole("combobox")
        .map((each) => each.getAttribute("aria-label")),
    ).toEqual(["Hear from Ledger", "Hear from Scout"]);
    const choice = within(agents).getByRole("combobox", { name: "Hear from Scout" });
    expect(
      within(choice)
        .getAllByRole("option")
        .map((each) => each.textContent),
    ).toEqual(["Everything", "Decisions only", "Nothing"]);
    // What each word lets through, and that it covers every agent a harness runs.
    expect(form.textContent).toContain("One word per harness, for every agent it runs.");
    fireEvent.change(choice, { target: { value: "decide" } });
    await waitFor(() =>
      expect(screen.getByTestId("agents-row").textContent).toBe("Agents Scout decisions only"),
    );
  });

  it("puts back the server's word, with the reason, when a change is refused", async () => {
    renderYou({ notifications: fakeSettings(true) });
    const form = await openForm("decisions-row", "decide-form");
    fireEvent.click(within(form).getByRole("radio", { name: /Off/ }));
    expect(screen.getByTestId("decisions-row").textContent).toBe("Decisions Off");
    const card = screen.getByTestId("notifications");
    expect((await within(card).findByRole("alert")).textContent).toBe("The server is away.");
    expect(screen.getByTestId("decisions-row").textContent).toBe("Decisions Right away");
  });

  it("shows the switch off until the browser is asked, and turning it on asks", async () => {
    const ask = vi.fn(async () => "granted" as const);
    const muted: boolean[] = [];
    renderYou({
      onMute: (to) => muted.push(to),
      notifications: { ...fakeSettings(), browser: { state: "default", ask } },
    });
    const row = screen.getByTestId("mute");
    const toggle = within(row).getByRole("switch") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(row.textContent).toContain(
      "This browser hasn't been asked yet. Turning this on asks it.",
    );
    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(ask).toHaveBeenCalled();
    // Given, the switch is on and says nothing more.
    expect(toggle.checked).toBe(true);
    expect(row.textContent).toBe("Banners in this browser");
    expect(muted).toEqual([false]);
  });

  it("shows the switch off and held where the browser refused, and says where to allow it", () => {
    renderYou({
      onMute: () => undefined,
      notifications: { ...fakeSettings(), browser: { state: "denied", ask: async () => "denied" } },
    });
    const row = screen.getByTestId("mute");
    const toggle = within(row).getByRole("switch") as HTMLInputElement;
    // Not on: the person's word is on, but no banner can be raised here.
    expect(toggle.checked).toBe(false);
    expect(toggle.disabled).toBe(true);
    expect(row.textContent).toContain(
      "This browser has refused banners. Allow them in its settings to hear from here.",
    );
  });

  it("names each row by its words, title first, so voice control finds it by them", () => {
    renderYou({
      notifications: fakeSettings(),
      limits: {
        set: () => undefined,
        ceiling: async () => 104_857_600,
        setExchange: () => undefined,
      },
      onDeleteAccount: async () => undefined,
    });
    // What it shows, in order, with a space between: not "DecisionsRight away", and not a name
    // of its own that voice control would not match ("Decisions, Right away").
    expect(screen.getByRole("button", { name: "Decisions Right away" })).toBe(
      screen.getByTestId("decisions-row"),
    );
    expect(screen.getByRole("button", { name: /^People 1 owner · 1 member/ })).toBe(
      screen.getByTestId("people-row"),
    );
    expect(
      screen.getByRole("button", {
        name: /^Messages between agents Stop after 16 · hold after 48/,
      }),
    ).toBe(screen.getByTestId("exchange-limits-row"));
    // A row that says more to a screen reader still begins with its words.
    const you = screen.getByRole("main", { name: "You" });
    for (const row of you.querySelectorAll("button.you-lrow")) {
      const title = row.querySelector(".you-lrow-lab > span")?.textContent ?? "";
      const named = row.getAttribute("aria-label");
      if (named !== null) expect(named.slice(0, title.length)).toBe(title);
    }
  });
});
