/**
 * You as a settings list (ADR 0085), rendered on its own against fake services: the words that
 * change inside the desktop app, the appearance, the devices' order and fold, passkeys where one
 * can work, the workspace's cards for its admins, and settings that put back the server's word
 * when a save is refused. The shell's wiring of it is `Shell.test.tsx`'s.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildModel,
  type ClientEvent,
  type Directory,
  type Invite,
  type PairedDeviceRecord,
  type WorkspaceRole,
} from "@chipschat/core";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "@chipschat/protocol";
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
import { clockWords, quietWords } from "./you/Notifications.tsx";
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
        appUrl: "chips://pair?pair=QRS-789&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431",
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

describe("the words for where it is", () => {
  it("says this browser in a browser, and this computer inside the app", () => {
    renderYou({ onMute: () => undefined });
    expect(screen.getByTestId("sign-out").textContent).toBe("Sign out of this browser");
    expect(within(screen.getByTestId("mute")).getByRole("switch").getAttribute("aria-label")).toBe(
      "Banners in this browser",
    );
    expect(screen.getByTestId("appearance").textContent).toContain("This browser only");
  });

  it("names the computer, and the menu bar, in the desktop app", () => {
    renderYou({ desktop: true, onMute: () => undefined });
    expect(screen.getByTestId("sign-out").textContent).toBe("Sign out of this computer");
    const mute = screen.getByTestId("mute");
    expect(within(mute).getByRole("switch", { name: "Banners on this computer" })).toBeDefined();
    expect(mute.textContent).toContain("nothing from Demo reaches a banner or the menu bar here");
    expect(screen.getByTestId("appearance").textContent).toContain("This computer only");
  });

  it("says the role in a line, and the build and the server at the foot", () => {
    renderYou();
    expect(screen.getByTestId("my-role").textContent).toBe(
      "Owner of Demo: invites, roles, everyone's devices and harnesses",
    );
    expect(screen.getByTestId("build").textContent).toMatch(
      /^Chips .+ · .+ · chips\.example:4431$/,
    );
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
    expect(rows.map((row) => row.querySelector(".you-row-lab > span")?.textContent)).toEqual([
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
    expect(fold.textContent).toBe("2 not seen in a month");
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

  it("puts the code for another device under the card's head, with its QR", async () => {
    renderYou({}, [device("Chips for Mac", { current: true })]);
    fireEvent.click(screen.getByTestId("issue-code"));
    await waitFor(() => expect(screen.getByTestId("pairing-code").textContent).toBe("QRS-789"));
    expect(screen.getByTestId("issued-code").textContent).toContain("On this network only");
    expect(screen.getByTestId("issue-code").textContent).toBe("Another code");
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

describe("the workspace's cards", () => {
  it("are under its name, for an owner, with an invite that may be used many times", async () => {
    const limits: LimitsService = {
      set: () => undefined,
      ceiling: async () => 104_857_600,
      setExchange: () => undefined,
    };
    const done = renderYou({ limits });
    expect(screen.getByRole("heading", { name: "Demo" })).toBeDefined();
    expect(screen.getByTestId("people").textContent).toContain("2 in Demo");
    expect(screen.getByTestId("attachment-caps")).toBeDefined();
    // Nothing changed yet: no Save.
    expect(screen.queryByTestId("save-caps")).toBeNull();
    await waitFor(() =>
      expect(
        (within(screen.getByTestId("attachment-caps")).getByLabelText("Photos") as HTMLInputElement)
          .placeholder,
      ).toBe("100"),
    );

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
    fireEvent.click(screen.getByTestId("make-invite"));
    expect((await screen.findByTestId("invite-relay-off")).textContent).toBe(
      "The relay is off, so this link opens only on the server's own network.",
    );
  });

  it("say when Chips steps in on agents, and save a stop, a hold and the switch (ADR 0187)", () => {
    const set: unknown[] = [];
    renderYou({
      limits: {
        set: () => undefined,
        ceiling: async () => 104_857_600,
        setExchange: (limits) => set.push(limits),
      },
    });
    const card = within(screen.getByTestId("exchange-limits"));
    expect(card.getByText(/Agents in a space can pass work to each other/)).toBeDefined();
    expect(card.getByTestId("exchange-words").textContent).toBe(
      "Chips tells agents the count from 8 messages to each other with nobody acting, tells them to stop after 16, or sooner in circles, and holds them after 48.",
    );
    expect(card.queryByTestId("save-exchange-limits")).toBeNull();
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
    fireEvent.click(card.getByTestId("save-exchange-limits"));
    expect(set).toEqual([{ stop: 64, hold: null, circles: false }]);
  });

  it("take the stop down under a hold picked below it, and say why an Other is not whole", () => {
    const set: unknown[] = [];
    renderYou({
      limits: {
        set: () => undefined,
        ceiling: async () => 104_857_600,
        setExchange: (limits) => set.push(limits),
      },
    });
    const card = within(screen.getByTestId("exchange-limits"));
    const stop = within(card.getByTestId("exchange-stop"));
    const hold = within(card.getByTestId("exchange-hold"));
    fireEvent.click(hold.getByRole("radio", { name: "24" }));
    expect((stop.getByRole("radio", { name: "16" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(stop.getByRole("radio", { name: "Other" }));
    expect(card.getByRole("alert").textContent).toBe(
      "Tell them to stop after a whole number from 4 to 500.",
    );
    expect(card.queryByTestId("save-exchange-limits")).toBeNull();
    fireEvent.change(card.getByTestId("exchange-stop-other"), { target: { value: "12" } });
    fireEvent.click(card.getByTestId("save-exchange-limits"));
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
    const rows = screen.getAllByTestId("person-row");
    const mine = rows.find((row) => row.getAttribute("data-participant") === ARJUN);
    const danas = rows.find((row) => row.getAttribute("data-participant") === DANA);
    // Nobody removes themselves.
    fireEvent.click(within(mine as HTMLElement).getByTestId("person-open"));
    expect(within(mine as HTMLElement).getByTestId("person-details")).toBeDefined();
    expect(within(mine as HTMLElement).queryByTestId("remove-person")).toBeNull();
    // Opening one row closes the other.
    fireEvent.click(within(danas as HTMLElement).getByTestId("person-open"));
    expect(within(mine as HTMLElement).queryByTestId("person-details")).toBeNull();
    fireEvent.click(within(danas as HTMLElement).getByRole("button", { name: "Remove Dana…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading").textContent).toBe("Remove Dana from Demo?");
    expect(dialog.textContent).toContain("Scout becomes yours.");
    expect(dialog.textContent).toContain("To come back, Dana needs a new invite.");

    // Keep changes nothing.
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(removed).toEqual([]);

    fireEvent.click(within(danas as HTMLElement).getByRole("button", { name: "Remove Dana…" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removed).toEqual([DANA]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offer an owner New phone… for everyone else: the code, its QR, and the app's link to send (ADR 0206)", async () => {
    const done = renderYou();
    const rows = screen.getAllByTestId("person-row");
    const mine = rows.find((row) => row.getAttribute("data-participant") === ARJUN);
    const danas = rows.find((row) => row.getAttribute("data-participant") === DANA);
    fireEvent.click(within(mine as HTMLElement).getByTestId("person-open"));
    expect(within(mine as HTMLElement).queryByTestId("new-phone")).toBeNull();
    fireEvent.click(within(danas as HTMLElement).getByTestId("person-open"));
    fireEvent.click(
      within(danas as HTMLElement).getByRole("button", { name: "A new phone for Dana…" }),
    );
    const panel = await screen.findByTestId("new-phone-panel");
    await waitFor(() =>
      expect(within(panel).getByTestId("pairing-code").textContent).toBe("QRS-789"),
    );
    expect(done.pairedFor).toEqual([DANA]);
    expect(within(panel).getByRole("heading").textContent).toBe("A new phone for Dana");
    expect(panel.textContent).toContain("On Dana's phone, open Chips and choose Scan a QR code.");
    expect(within(panel).getByTestId("new-phone-link").textContent).toBe(
      "chips://pair?pair=QRS-789&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431",
    );
    await waitFor(() => expect(within(panel).getByRole("img")).toBeTruthy());
    fireEvent.click(within(panel).getByRole("button", { name: "Done" }));
    expect(screen.queryByTestId("new-phone-panel")).toBeNull();
  });

  it("offer an owner Reconnect… on a device of somebody else's, a code that takes its place (ADR 0236)", async () => {
    const done = renderYou();
    const danas = screen
      .getAllByTestId("person-row")
      .find((row) => row.getAttribute("data-participant") === DANA) as HTMLElement;
    fireEvent.click(within(danas).getByTestId("person-open"));
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
      "Chips deleted from it, or the phone reset? On it, open Chips and choose Scan a QR code. It takes this Dana's iPhone's place, with every space and everything Dana said, and the old one is signed out.",
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
    const danas = screen
      .getAllByTestId("person-row")
      .find((row) => row.getAttribute("data-participant") === DANA) as HTMLElement;
    fireEvent.click(within(danas).getByTestId("person-open"));
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
    const arjuns = screen
      .getAllByTestId("person-row")
      .find((row) => row.getAttribute("data-participant") === ARJUN) as HTMLElement;
    fireEvent.click(within(arjuns).getByTestId("person-open"));
    const device = await within(arjuns).findByTestId("person-device");
    expect(within(device).queryByRole("button")).toBeNull();
  });

  it("list people with their role in its colour, filter them, and open one to say what they can do (ADR 0209)", async () => {
    renderYou({}, [], LINKS);
    const card = within(screen.getByTestId("people"));
    const rows = () => card.getAllByTestId("person-row");
    expect(rows().map((row) => row.getAttribute("data-role"))).toEqual(["owner", "member"]);
    const mine = rows()[0] as HTMLElement;
    const danas = rows()[1] as HTMLElement;
    // The one owner can't be changed, so Arjun's role is a tag; Dana's is the picker.
    expect(within(mine).getByTestId("role-tag").textContent).toBe("Owner");
    expect(within(danas).getByRole("combobox", { name: "Dana's role" })).toBeDefined();
    expect(within(danas).getByTestId("person-open").textContent).toMatch(/Joined/);

    // Members only, then everybody again.
    fireEvent.click(card.getByTestId("filter-member"));
    expect(rows().map((row) => row.getAttribute("data-participant"))).toEqual([DANA]);
    expect(card.getByTestId("filter-member").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(card.getByTestId("filter-all"));
    expect(rows()).toHaveLength(2);

    fireEvent.click(within(rows()[1] as HTMLElement).getByTestId("person-open"));
    const details = within(card.getByTestId("person-details"));
    // Devices comes after, once they are read.
    expect(
      details
        .getAllByRole("heading")
        .slice(0, 2)
        .map((each) => each.textContent),
    ).toEqual(["What Dana can do", "Spaces you share"]);
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
  });

  it("list the spaces you share with a person by face and name, each opening its room (ADR 0209)", () => {
    const opened: string[] = [];
    renderYou({ onOpenSpace: (spaceId) => opened.push(spaceId) });
    const rows = screen.getAllByTestId("person-row");
    const mine = rows.find((row) => row.getAttribute("data-participant") === ARJUN) as HTMLElement;
    const danas = rows.find((row) => row.getAttribute("data-participant") === DANA) as HTMLElement;
    fireEvent.click(within(mine).getByTestId("person-open"));
    const yours = within(within(mine).getByTestId("person-spaces"));
    expect(yours.getByRole("heading").textContent).toBe("Your spaces");
    const room = yours.getByTestId("person-space");
    expect(room.textContent).toContain("PO-4471");
    // The room's face, as the rail draws it, beside its name.
    expect(room.querySelector(".ui-avatar")).not.toBeNull();
    fireEvent.click(room);
    expect(opened).toEqual(["spc_01K4ZQPX000000000000000002"]);
    // Dana is in no room Arjun is in.
    fireEvent.click(within(danas).getByTestId("person-open"));
    expect(within(danas).getByTestId("person-no-spaces").textContent).toBe("None yet.");
  });

  it("say what a link's newcomer will see, as the role and the room change, and make it into the room (ADR 0209)", async () => {
    const done = renderYou({}, [], LINKS);
    const card = within(screen.getByTestId("invites"));
    // The open link's count and time in the corner; the used one says who came by it.
    await waitFor(() =>
      expect(card.getByTestId("open-links").textContent).toBe("1 open link · runs out in 6 days"),
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
    expect(screen.getByTestId("name-first").textContent).toContain("Give yourself a name first");
    cleanup();
    renderYou();
    expect(screen.queryByTestId("name-first")).toBeNull();
  });

  it("are under a name an owner changes where it stands, and says why the server would not (ADR 0194)", async () => {
    const done = renderYou();
    const field = screen.getByRole("textbox", { name: "Workspace name" }) as HTMLInputElement;
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
  });

  it("are under the name alone for an admin, who may not change it", () => {
    const events = workspace().map((event) =>
      event.type === "person.joined" && event.seq === 2 ? { ...event, role: "admin" } : event,
    );
    renderYou({ model: buildModel(events), selfId: DANA });
    expect(screen.getByRole("heading", { name: "Demo" })).toBeDefined();
    expect(screen.queryByRole("textbox", { name: "Workspace name" })).toBeNull();
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
    expect(screen.queryByTestId("people")).toBeNull();
    expect(screen.queryByTestId("invites")).toBeNull();
    expect(screen.queryByTestId("attachment-caps")).toBeNull();
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

  it("says what quiet hours let through as they are set", () => {
    expect(quietWords(undefined)).toBe("Off: a banner may come at any hour");
    const night = `${clockWords("22:00")} to ${clockWords("07:00")}`;
    expect(quietWords({ from: "22:00", to: "07:00", breakthrough: "decide" })).toBe(
      `${night} · decisions still get through`,
    );
    expect(quietWords({ from: "22:00", to: "07:00", breakthrough: "none" })).toBe(
      `${night} · nothing gets through`,
    );
    // Said as this computer says times: twelve-hour or twenty-four, whichever it keeps.
    expect(clockWords("22:00")).toMatch(/^(10:00\s?PM|22:00)$/);
  });

  it("names every agent in the workspace with its face, and says Decisions only in full", () => {
    const ledger = "hrn_ledger";
    renderYou({
      notifications: fakeSettings(),
      // Ledger has never run: it can be quietened before it does.
      directory: { ...DIRECTORY, [ledger]: { id: ledger, kind: "harness", displayName: "Ledger" } },
    });
    const agents = screen.getByTestId("notify-harnesses");
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
    expect(
      within(agents).getByText("One choice per harness, for every agent it runs."),
    ).toBeDefined();
    expect(
      within(agents).getByText("Nothing: it never notifies you. Its spaces still show everything."),
    ).toBeDefined();
  });

  it("puts back the server's word, with the reason, when a change is refused", async () => {
    renderYou({ notifications: fakeSettings(true) });
    const decisions = screen.getByRole("combobox", { name: "Decisions" }) as HTMLSelectElement;
    fireEvent.change(decisions, { target: { value: "off" } });
    expect(decisions.value).toBe("off");
    const card = screen.getByTestId("notifications");
    expect((await within(card).findByRole("alert")).textContent).toBe("The server is away.");
    expect(decisions.value).toBe("now");
  });

  it("asks the browser for leave, and says it was given", async () => {
    const ask = vi.fn(async () => "granted" as const);
    renderYou({
      notifications: { ...fakeSettings(), browser: { state: "default", ask } },
    });
    const line = screen.getByTestId("browser-notifications");
    expect(line.textContent).toContain("This browser shows no banners yet.");
    await act(async () => {
      fireEvent.click(within(line).getByRole("button", { name: "Allow banners here" }));
    });
    expect(ask).toHaveBeenCalled();
    expect(screen.getByTestId("browser-notifications").textContent).toBe(
      "This browser shows banners.",
    );
  });
});
