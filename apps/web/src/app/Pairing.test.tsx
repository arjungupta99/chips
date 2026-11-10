/**
 * The first screen, against a mocked core: a pairing code pairs; an invite link joins, saying
 * where it goes and as what first; a passkey signs in where the browser has one. The real key,
 * IndexedDB and WebAuthn are Playwright's (`people.spec.ts`).
 */

import { type Device, PairingError } from "@chipschat/core";
import { appPairingUrl, inviteAppUrl } from "@chipschat/protocol";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Desktop, parseLink } from "../native.ts";

const core = vi.hoisted(() => ({
  establishLink: vi.fn(),
  pairDevice: vi.fn(),
  peekInvite: vi.fn(),
  joinByInvite: vi.fn(),
  signInWithPasskey: vi.fn(),
  passkeysSupported: vi.fn(() => false),
}));

/** What a pairing or a join is handed to wait with, should its link ask (ADR 0232). */
const WAITS = expect.objectContaining({ onWaiting: expect.any(Function) });

vi.mock("@chipschat/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chipschat/core")>();
  return {
    ...actual,
    establishLink: core.establishLink,
    pairDevice: core.pairDevice,
    peekInvite: core.peekInvite,
    joinByInvite: core.joinByInvite,
    signInWithPasskey: core.signInWithPasskey,
    passkeysSupported: core.passkeysSupported,
  };
});

import { Pair } from "./Pairing.tsx";

const DEVICE: Device = {
  deviceId: "dev_1",
  participantId: "usr_1",
  workspaceId: "ws_1",
  displayName: "Dana",
  privateKey: {} as CryptoKey,
};

/** Safari on a Mac, which is what a browser pairing from here names itself (ADR 0085). */
const SAFARI_ON_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15";

beforeEach(() => {
  history.replaceState(null, "", "/");
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(SAFARI_ON_MAC);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  core.passkeysSupported.mockReturnValue(false);
});

describe("a plain-HTTP address away from loopback", () => {
  it("says a browser will not make a key here, and hands the code to the app instead", () => {
    // No `subtle`: what a browser exposes on an insecure origin.
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      history.replaceState(null, "", "/#pair=ABC-234&v=1");
      render(<Pair onPaired={vi.fn()} />);
      const said = screen.getByTestId("pair-keyless").textContent ?? "";
      expect(said).toContain("plain HTTP");
      expect(said).toContain("http://127.0.0.1:");
      expect(screen.getByRole("button", { name: "Pair" })).toHaveProperty("disabled", true);
      expect(screen.getByTestId("pair-app-link").getAttribute("href")).toBe(
        `chips://pair?pair=ABC-234&v=1&lan=${encodeURIComponent(location.origin)}`,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("has no app link to offer without a code, and says nothing at all on a secure page", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    let keyless: ReturnType<typeof render> | undefined;
    try {
      keyless = render(<Pair onPaired={vi.fn()} />);
      expect(screen.getByTestId("pair-keyless")).toBeDefined();
      expect(screen.queryByTestId("pair-app-link")).toBeNull();
    } finally {
      keyless?.unmount();
      vi.unstubAllGlobals();
    }
    render(<Pair onPaired={vi.fn()} />);
    expect(screen.queryByTestId("pair-keyless")).toBeNull();
  });
});

describe("a pairing code", () => {
  it("pairs this browser by its own name, and says why when the code is wrong", async () => {
    core.pairDevice.mockRejectedValueOnce(
      Object.assign(new Error("That pairing code is not valid."), { name: "PairingError" }),
    );
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} />);
    fireEvent.change(screen.getByLabelText("Pairing code"), { target: { value: "ABC-234" } });
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));
    await waitFor(() => expect(screen.getByText("Pairing failed.")).toBeDefined());

    core.pairDevice.mockResolvedValueOnce(DEVICE);
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE));
    expect(core.pairDevice).toHaveBeenLastCalledWith(
      "ABC-234",
      "Safari on Mac",
      "",
      undefined,
      undefined,
      WAITS,
    );
    // No passkey button in a browser that has none.
    expect(screen.queryByTestId("sign-in-passkey")).toBeNull();
  });

  it("offers a passkey where the browser has one, and pairs by it", async () => {
    core.passkeysSupported.mockReturnValue(true);
    core.signInWithPasskey.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} />);
    fireEvent.click(screen.getByTestId("sign-in-passkey"));
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE));
    expect(core.signInWithPasskey).toHaveBeenCalledWith("Safari on Mac", "");
  });
});

describe("an invite link", () => {
  it("says where it goes and as what, takes a name, and joins", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_abc1");
    core.peekInvite.mockResolvedValueOnce({
      inviteId: "inv_1",
      workspaceId: "ws_1",
      workspaceName: "Northwind",
      role: "admin",
      singleUse: true,
      expiresAt: "2026-09-13T09:00:00.000Z",
    });
    core.joinByInvite.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.getByTestId("join-role").textContent).toContain("as an admin");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Dana" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
    });
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE, undefined));
    // Named on the way in, and not the one whose Chips it is: no owner's welcome after it.
    expect(localStorage.getItem("chips.firstRun.welcomed.dev_1")).toBe("1");
    // The page's own server, reached as the page is: no relay in a browser (ADR 0164).
    expect(core.joinByInvite).toHaveBeenCalledWith(
      "chips_inv_abc1",
      "Dana",
      "Safari on Mac",
      "",
      expect.anything(),
      undefined,
      WAITS,
    );
    expect(core.peekInvite).toHaveBeenCalledWith("chips_inv_abc1", "", expect.anything());
    // The link is out of the address bar once used.
    expect(location.hash).toBe("");
  });

  it("names the room a space's link brings them into, and lands them in it (ADR 0168)", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_space1");
    core.peekInvite.mockResolvedValueOnce({
      inviteId: "inv_1",
      workspaceId: "ws_1",
      workspaceName: "Northwind",
      role: "guest",
      singleUse: true,
      expiresAt: "2026-09-13T09:00:00.000Z",
      invitedByName: "Arjun",
      spaceId: "spc_bakery",
      spaceName: "Bakery",
    });
    core.joinByInvite.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} />);
    await screen.findByRole("heading", { name: "Join Bakery" });
    expect(screen.getByTestId("join-role").textContent).toBe(
      "Arjun invited you to Bakery in Northwind as a guest.",
    );
    expect(screen.getByTestId("join-role-means").textContent).toBe(
      "A guest is in Bakery only, and sees only the people and agents there.",
    );
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Priya" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
    });
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE, "spc_bakery"));
  });

  it("says who sent it, and has the name field ready (JR-13, JR-14)", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_abc2");
    core.peekInvite.mockResolvedValueOnce({
      inviteId: "inv_1",
      workspaceId: "ws_1",
      workspaceName: "Northwind",
      role: "member",
      singleUse: true,
      expiresAt: "2026-09-13T09:00:00.000Z",
      invitedByName: "Arjun",
    });
    render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.getByTestId("join-role").textContent).toBe(
      "Arjun invited you to Northwind as a member.",
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Your name")));
  });

  it("says when the link is no good and what to do, and offers the code instead (JR-3)", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_spent");
    core.peekInvite.mockRejectedValueOnce(new PairingError("That invite is not valid."));
    render(<Pair onPaired={vi.fn()} />);
    const dead = await screen.findByTestId("join-dead");
    expect(dead.textContent).toContain("This invite can't be used");
    expect(dead.textContent).toContain("Ask whoever sent it for a new link.");
    expect(screen.queryByLabelText("Your name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I have a pairing code instead" }));
    expect(screen.getByLabelText("Pairing code")).toBeDefined();
    expect(location.hash).toBe("");
  });

  it("says the server's own words for anything but a dead link, and keeps the card", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_abc4");
    core.peekInvite.mockRejectedValueOnce(
      new PairingError("Too many wrong invites from this address. Try again in a minute."),
    );
    render(<Pair onPaired={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many wrong invites from this address. Try again in a minute.",
    );
    expect(screen.queryByTestId("join-dead")).toBeNull();
    expect(screen.getByRole("button", { name: "Join" })).toHaveProperty("disabled", true);
  });

  it("says the server cannot be reached when it does not answer at all", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_abc5");
    core.peekInvite.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<Pair onPaired={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Can't reach the server");
  });

  it("keeps the link for another name when the name is somebody's (JR-1)", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_abc6");
    core.peekInvite.mockResolvedValueOnce({
      inviteId: "inv_1",
      workspaceId: "ws_1",
      workspaceName: "Northwind",
      role: "member",
      singleUse: true,
      expiresAt: "2026-09-13T09:00:00.000Z",
    });
    core.joinByInvite.mockRejectedValueOnce(
      new PairingError("Somebody here goes by Priya Nair already."),
    );
    render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    const name = screen.getByLabelText("Your name");
    fireEvent.change(name, { target: { value: "priya nair" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "Somebody here goes by Priya Nair already.",
      ),
    );
    expect(document.activeElement).toBe(name);
    expect(screen.queryByTestId("join-dead")).toBeNull();
  });

  it("takes a link opened where the pairing screen already is, though nothing reloads", async () => {
    core.peekInvite.mockResolvedValueOnce({
      inviteId: "inv_8",
      workspaceId: "ws_1",
      workspaceName: "Northwind",
      role: "member",
      singleUse: true,
      expiresAt: "2026-09-13T09:00:00.000Z",
    });
    render(<Pair onPaired={vi.fn()} />);
    expect(screen.getByLabelText("Pairing code")).toBeDefined();
    await act(async () => {
      history.replaceState(null, "", "/#invite=chips_inv_abc8");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(core.peekInvite).toHaveBeenCalledWith("chips_inv_abc8", "", expect.anything());
  });

  it("keeps the person on the join screen when joining fails", async () => {
    history.replaceState(null, "", "/#invite=chips_inv_abc7");
    core.peekInvite.mockResolvedValueOnce({
      inviteId: "inv_1",
      workspaceId: "ws_1",
      workspaceName: "Northwind",
      role: "guest",
      singleUse: false,
      expiresAt: "2026-09-13T09:00:00.000Z",
    });
    core.joinByInvite.mockRejectedValueOnce(new Error("boom"));
    render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.getByTestId("join-role").textContent).toContain("as a guest");
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Vendor" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Join" }));
    });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Joining failed."));
  });
});

describe("a QR's payload (M4.1)", () => {
  it("pairs with the network address and the relay the fragment names", async () => {
    const key = "k".repeat(43);
    history.replaceState(
      null,
      "",
      `/#pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431&relay=wss%3A%2F%2Frelay.example&key=${key}`,
    );
    core.pairDevice.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} />);
    expect((screen.getByLabelText("Pairing code") as HTMLInputElement).value).toBe("ABC-234");
    expect(screen.getByTestId("pair-relay").textContent).toContain("relay.example");
    // The code goes at once, with nobody pressing Pair, and leaves the address as it goes.
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE));
    expect(location.hash).toBe("");
    expect(core.pairDevice).toHaveBeenCalledTimes(1);
    expect(core.pairDevice).toHaveBeenCalledWith(
      "ABC-234",
      "Safari on Mac",
      "http://192.168.1.20:4431",
      { serverKey: key, relayUrl: "wss://relay.example" },
      undefined,
      WAITS,
    );
  });

  it("pairs on this page's own origin when the fragment names it, with no relay", async () => {
    history.replaceState(null, "", `/#pair=ABC-234&v=1&lan=${encodeURIComponent(location.origin)}`);
    core.pairDevice.mockResolvedValueOnce(DEVICE);
    render(<Pair onPaired={vi.fn()} />);
    await waitFor(() =>
      expect(core.pairDevice).toHaveBeenCalledWith(
        "ABC-234",
        "Safari on Mac",
        "",
        undefined,
        undefined,
        WAITS,
      ),
    );
  });
});

describe("a pairing link the desktop app is opened with (`pnpm desktop`)", () => {
  const SERVER = "https://mini.example.ts.net";

  /** A shell holding one link, handed over when the page listens, as a launch leaves it. */
  function shellWith(link: string): Desktop {
    return {
      discover: async () => [],
      ask: async () => undefined,
      tell: async () => undefined,
      badge: async () => undefined,
      onDecision: async () => () => undefined,
      onOpen: async (listen) => {
        const opened = parseLink(link);
        if (opened !== undefined) listen(opened);
        return () => undefined;
      },
    };
  }

  it("pairs with the server and the code it carries, with nobody typing", async () => {
    core.pairDevice.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} desktop={shellWith(appPairingUrl(SERVER, "KMR-M3P"))} />);
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE));
    expect(core.pairDevice).toHaveBeenCalledTimes(1);
    expect(core.pairDevice).toHaveBeenCalledWith(
      "KMR-M3P",
      "Chips for Mac",
      SERVER,
      undefined,
      undefined,
      WAITS,
    );
  });

  it("says why when the code is no good, and leaves it in the box to try again", async () => {
    const { PairingError } = await import("@chipschat/core");
    core.pairDevice.mockRejectedValueOnce(new PairingError("That pairing code is not valid."));
    render(<Pair onPaired={vi.fn()} desktop={shellWith(appPairingUrl(SERVER, "KMR-M3P"))} />);
    expect(await screen.findByText("That pairing code is not valid.")).toBeDefined();
    expect((screen.getByLabelText("Pairing code") as HTMLInputElement).value).toBe("KMR-M3P");
    expect(screen.getByRole("heading", { name: "Pair with your server" })).toBeDefined();
  });
});

describe("the address `chips up` opens (ADR 0121)", () => {
  it("pairs once, by itself, and a code that fails is left to retry by hand", async () => {
    history.replaceState(null, "", "/#pair=ABC-234&v=1");
    core.pairDevice.mockRejectedValueOnce(
      Object.assign(new Error("That pairing code is not valid."), { name: "PairingError" }),
    );
    render(<Pair onPaired={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Pairing failed.")).toBeDefined());
    expect(core.pairDevice).toHaveBeenCalledTimes(1);
    expect(location.hash).toBe("");
    expect(screen.getByRole("button", { name: "Pair" })).toHaveProperty("disabled", false);
  });
});

describe("an invite, handed to the app (ADR 0164)", () => {
  const SERVER = "https://mini.example.ts.net";
  const KEY = "k".repeat(43);
  const NORTHWIND = {
    inviteId: "inv_1",
    workspaceId: "ws_1",
    workspaceName: "Northwind",
    role: "member",
    singleUse: true,
    expiresAt: "2099-09-13T09:00:00.000Z",
    invitedByName: "Arjun",
  };
  const agent = (said: string) => vi.spyOn(navigator, "userAgent", "get").mockReturnValue(said);

  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, "", "/");
  });

  it("offers an iPhone, an iPad or a Mac the same invite in the app, with this page as its server", async () => {
    agent("Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15");
    history.replaceState(
      null,
      "",
      `/#invite=chips_inv_app&relay=wss%3A%2F%2Frelay.example&key=${KEY}`,
    );
    core.peekInvite.mockResolvedValueOnce(NORTHWIND);
    render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.getByTestId("join-in-app").textContent).toContain("Have the Chips app?");
    expect(screen.getByTestId("join-app-link").getAttribute("href")).toBe(
      inviteAppUrl({
        token: "chips_inv_app",
        lan: location.origin,
        relay: "wss://relay.example",
        key: KEY,
      }),
    );
  });

  it("says where to get Chips beside the app's link: the App Store on an iPhone, the Mac's download on a Mac", async () => {
    agent("Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15");
    history.replaceState(null, "", "/#invite=chips_inv_store");
    core.peekInvite.mockResolvedValueOnce(NORTHWIND);
    const phone = render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.getByTestId("join-get-chips").getAttribute("href")).toBe(
      "https://apps.apple.com/app/id6824148802",
    );
    phone.unmount();
    agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15");
    history.replaceState(null, "", "/#invite=chips_inv_on_a_mac");
    core.peekInvite.mockResolvedValueOnce(NORTHWIND);
    render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.getByTestId("join-get-chips").getAttribute("href")).toBe(
      "https://chipschat.ai/download",
    );
  });

  it("says before a name is typed that a plain-HTTP page can't join, and holds Join (the onboarding audit, item 3)", async () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      history.replaceState(null, "", "/#invite=chips_inv_http");
      core.peekInvite.mockResolvedValueOnce(NORTHWIND);
      render(<Pair onPaired={vi.fn()} />);
      await screen.findByRole("heading", { name: "Join Northwind" });
      expect(screen.getByTestId("join-keyless").textContent).toContain("so it can't join here");
      expect(screen.getByLabelText("Your name")).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", { name: "Join" })).toHaveProperty("disabled", true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("offers nothing of the sort on a computer that can't have the app", async () => {
    agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0");
    history.replaceState(null, "", "/#invite=chips_inv_win");
    core.peekInvite.mockResolvedValueOnce(NORTHWIND);
    render(<Pair onPaired={vi.fn()} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(screen.queryByTestId("join-in-app")).toBeNull();
  });

  /** A shell holding one link, handed over when the page listens, as a launch leaves it. */
  function shellWith(link: string): Desktop {
    return {
      discover: async () => [],
      ask: async () => undefined,
      tell: async () => undefined,
      badge: async () => undefined,
      onDecision: async () => () => undefined,
      onOpen: async (listen) => {
        const opened = parseLink(link);
        if (opened !== undefined) listen(opened);
        return () => undefined;
      },
    };
  }

  it("joins from the Mac app on the server the link names, by the way it read the link", async () => {
    const tunnel = { kind: "relay", fetch: vi.fn(), socket: vi.fn(), close: vi.fn() };
    core.establishLink.mockResolvedValueOnce(tunnel);
    core.peekInvite.mockResolvedValueOnce(NORTHWIND);
    core.joinByInvite.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    const link = inviteAppUrl({
      token: "chips_inv_mac",
      lan: SERVER,
      relay: "wss://relay.example",
      key: KEY,
    });
    render(<Pair onPaired={onPaired} desktop={shellWith(link)} />);
    await screen.findByRole("heading", { name: "Join Northwind" });
    // The app is where the link opened: nothing to hand on.
    expect(screen.queryByTestId("join-in-app")).toBeNull();
    const reach = { serverKey: KEY, relayUrl: "wss://relay.example" };
    expect(core.establishLink).toHaveBeenCalledWith({ serverUrl: SERVER, ...reach });
    expect(core.peekInvite).toHaveBeenCalledWith("chips_inv_mac", SERVER, tunnel);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Dana" } });
    fireEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE, undefined));
    expect(core.joinByInvite).toHaveBeenCalledWith(
      "chips_inv_mac",
      "Dana",
      "Chips for Mac",
      SERVER,
      expect.anything(),
      { link: tunnel, ...reach },
      WAITS,
    );
  });

  it("takes an invite link pasted where the Mac app asks for a server", async () => {
    core.establishLink.mockResolvedValueOnce({
      kind: "direct",
      fetch: vi.fn(),
      socket: vi.fn(),
      close: vi.fn(),
    });
    core.peekInvite.mockResolvedValueOnce(NORTHWIND);
    render(<Pair onPaired={vi.fn()} desktop={shellWith("")} />);
    const field = await screen.findByTestId("pair-invite-link");
    fireEvent.change(field, { target: { value: `${SERVER}/#invite=chips_inv_pasted` } });
    await screen.findByRole("heading", { name: "Join Northwind" });
    expect(core.peekInvite).toHaveBeenCalledWith("chips_inv_pasted", SERVER, expect.anything());
  });

  it("pairs from a phone's pairing link pasted where the Mac app asks for a server, through the relay it names (ADR 0210)", async () => {
    core.pairDevice.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    render(<Pair onPaired={onPaired} desktop={shellWith("")} />);
    const field = await screen.findByTestId("pair-invite-link");
    const key = "k".repeat(43);
    const link = `https://relay.chipschat.ai/pair#pair=BKW-374&v=1&lan=${encodeURIComponent(SERVER)}&relay=wss%3A%2F%2Frelay.chipschat.ai&key=${key}&until=1792512345`;
    fireEvent.change(field, { target: { value: `Here: ${link}` } });
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE));
    expect(core.pairDevice).toHaveBeenCalledWith(
      "BKW-374",
      "Chips for Mac",
      SERVER,
      { serverKey: key, relayUrl: "wss://relay.chipschat.ai" },
      undefined,
      WAITS,
    );
  });
});

describe("Run Chips on this Mac (ADR 0173)", () => {
  const ANSWER = {
    url: "http://127.0.0.1:4431",
    pair_link: "http://127.0.0.1:4431/#pair=RUN-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431",
    phone_link: "chips://pair?pair=RUN-234",
    service: "launchd",
    reach: "lan" as const,
    already_running: false,
    created: true,
  };

  /** A shell that carries Chips, with whatever the network and this Mac answer. */
  function carrying(over: Partial<Desktop> = {}): Desktop {
    return {
      discover: async () => [],
      ask: async () => undefined,
      tell: async () => undefined,
      badge: async () => undefined,
      onDecision: async () => () => undefined,
      onOpen: async () => () => undefined,
      canRunHere: async () => true,
      runHere: vi.fn(async () => ANSWER),
      ...over,
    };
  }
  const nothingHere = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

  afterEach(() => vi.unstubAllGlobals());

  it("asks first when nothing answers here or on the network, then pairs with the code chips up printed", async () => {
    nothingHere();
    core.pairDevice.mockResolvedValueOnce(DEVICE);
    const onPaired = vi.fn();
    const shell = carrying();
    render(<Pair onPaired={onPaired} desktop={shell} />);
    expect(await screen.findByRole("heading", { name: "Run Chips on this Mac?" })).toBeDefined();
    expect(screen.queryByText(/Nothing is advertising itself here/)).toBeNull();
    fireEvent.click(screen.getByTestId("run-here"));
    await waitFor(() => expect(onPaired).toHaveBeenCalledWith(DEVICE));
    expect(shell.runHere).toHaveBeenCalledWith("lan");
    // Over loopback: this Mac talks to its own Chips by 127.0.0.1, whatever the Wi-Fi does.
    expect(core.pairDevice).toHaveBeenCalledWith(
      "RUN-234",
      "Chips for Mac",
      "http://127.0.0.1:4431",
      undefined,
      undefined,
      WAITS,
    );
  });

  it("runs it for this Mac alone where there is no home network, as chips up says to", async () => {
    nothingHere();
    core.pairDevice.mockResolvedValueOnce(DEVICE);
    const runHere = vi
      .fn()
      .mockRejectedValueOnce("This machine has no home-network address. Choose `--reach local`.")
      .mockResolvedValueOnce({ ...ANSWER, reach: "local" });
    render(<Pair onPaired={vi.fn()} desktop={carrying({ runHere })} />);
    fireEvent.click(await screen.findByTestId("run-here"));
    await waitFor(() => expect(runHere).toHaveBeenLastCalledWith("local"));
  });

  it("says what chips up said when it will not start, and lets it be tried again", async () => {
    nothingHere();
    const runHere = vi
      .fn()
      .mockRejectedValueOnce(
        "Something other than Chips answers on port 4431. Stop it, or run `chips up --port <n>`.",
      );
    render(<Pair onPaired={vi.fn()} desktop={carrying({ runHere })} />);
    fireEvent.click(await screen.findByTestId("run-here"));
    expect((await screen.findByTestId("run-here-error")).textContent).toContain("port 4431");
    expect(screen.getByTestId("run-here")).toHaveProperty("disabled", false);
  });

  it("offers it quietly beside servers on the network, and never where Chips answers here", async () => {
    nothingHere();
    const mini = {
      name: "Chips on the mini",
      host: "10.0.0.5",
      port: 4431,
      url: "http://10.0.0.5:4431",
    };
    const { unmount } = render(
      <Pair onPaired={vi.fn()} desktop={carrying({ discover: async () => [mini] })} />,
    );
    expect(await screen.findByText("Run Chips on this Mac instead")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Find your server" })).toBeDefined();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    render(<Pair onPaired={vi.fn()} desktop={carrying()} />);
    await screen.findByTestId("pair-runs-here");
    expect(screen.queryByTestId("run-here")).toBeNull();
  });

  it("offers the Chips that answers on this Mac alone, and its code screen (new-person sweep, 23)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    render(<Pair onPaired={vi.fn()} desktop={carrying()} />);
    const runs = await screen.findByTestId("pair-runs-here");
    expect(runs.textContent).toBe(
      "Chips is running on this Mac. To use it, pair with a code from chips pair --issue in Terminal.",
    );
    expect(screen.queryByText(/Nothing is advertising itself here/)).toBeNull();
    fireEvent.click(screen.getByTestId("pair-use-here"));
    expect(await screen.findByRole("heading", { name: "Pair with your server" })).toBeDefined();
    expect(screen.getByText("http://127.0.0.1:4431")).toBeDefined();
  });

  it("names chips up where nothing answers and the app can't run Chips", async () => {
    nothingHere();
    render(<Pair onPaired={vi.fn()} desktop={carrying({ canRunHere: async () => false })} />);
    const none = await screen.findByText(/Nothing is advertising itself here/);
    expect(none.textContent).toBe(
      "Nothing is advertising itself here. Start one with chips up, or type its address.",
    );
    expect(screen.queryByTestId("pair-runs-here")).toBeNull();
  });
});
