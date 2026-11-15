/**
 * The update dot on the Mac and the web (ADR 0296): lit for what waits, at the right end of a bar,
 * out when nothing does, when About already put it out for that version, or when it is turned off
 * here; a click opens About. And the provider behind it: when it reads the computer, what it keeps
 * when a read fails, what lights the dot for the owner (ADR 0297), and Chips for Mac's own update
 * (ADR 0298).
 */

import type {
  HarnessSoftware,
  MacUpdate,
  SelfUpdateFacts,
  ServerFacts,
  Software,
  UpdateDevice,
} from "@chipschat/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DOT_KEY,
  type MacUpdater,
  READ_AGAIN_MS,
  SEEN_KEY,
  SEEN_NEEDS_KEY,
  UpdateButton,
  UpdateDot,
  type Updates,
  UpdatesProvider,
  type UpdatesServer,
  useUpdates,
} from "./updates.tsx";

/** A computer on `version` whose feed says 1.3.0 is long out and asks for the dot. */
function facts(
  version = "1.2.3",
  releases = [{ version: "1.3.0", date: "2026-01-05", line: "New.", dot: true }],
) {
  return async (): Promise<ServerFacts> => ({
    machine: "Mac mini",
    version,
    publicUrl: "https://mini",
    relay: { url: undefined, status: "off" },
    updates: { releases, appStore: "1.3.0" },
  });
}

interface ShellOptions {
  read?: () => Promise<ServerFacts>;
  owner?: boolean;
  device?: UpdateDevice;
  app?: string;
  server?: UpdatesServer;
  mac?: Promise<MacUpdater | undefined>;
}

function provider(
  children: ReactNode,
  { read = facts(), owner = true, device = "browser", app = "1.2.4", server, mac }: ShellOptions,
) {
  return (
    <UpdatesProvider read={read} owner={owner} device={device} app={app} server={server} mac={mac}>
      {children}
    </UpdatesProvider>
  );
}

function shell(children: ReactNode, options: ShellOptions = {}) {
  return render(provider(children, options));
}

/** What the provider says now, for a test to read and to call. */
let says: Updates;
function Probe() {
  says = useUpdates();
  return null;
}

/** The dot beside what the provider says. */
const dotAndProbe = (
  <>
    <UpdateDot place="rail" onOpen={() => undefined} />
    <Probe />
  </>
);

/** Lets the provider's read land. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe("the update dot (ADR 0296)", () => {
  it("lights in a browser when the owner's computer is behind a release that asks for it, and opens About", async () => {
    const opened: string[] = [];
    shell(<UpdateDot place="rail" onOpen={() => opened.push("about")} />);
    const dot = await screen.findByTestId("update-dot");
    expect(dot.getAttribute("aria-label")).toBe("Update available. Opens About.");
    expect(dot.getAttribute("title")).toBe("Chips 1.3.0 is out");
    expect(dot.dataset["place"]).toBe("rail");
    fireEvent.click(dot);
    expect(opened).toEqual(["about"]);
  });

  it("stays out in a browser for somebody who doesn't own the computer", async () => {
    shell(<UpdateDot place="rail" onOpen={() => undefined} />, { owner: false });
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out while nothing waits", async () => {
    shell(<UpdateDot place="rail" onOpen={() => undefined} />, { read: facts("1.2.4", []) });
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out for the version About already put it out for", async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ version: "1.3.0", at: Date.now() }));
    shell(<UpdateDot place="rail" onOpen={() => undefined} />);
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out where it was turned off", async () => {
    localStorage.setItem(DOT_KEY, "off");
    shell(<UpdateDot place="rail" onOpen={() => undefined} />);
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("lights on the Mac for a newer Chips for Mac, and draws the strip's dot at the page's end", async () => {
    const view = shell(
      <div data-testid="frame">
        <UpdateDot place="bar" onOpen={() => undefined} />
      </div>,
      { read: facts("1.3.0"), device: "mac" },
    );
    const dot = await screen.findByTestId("update-dot");
    expect(dot.dataset["place"]).toBe("bar");
    expect(dot.parentElement).toBe(document.body);
    expect(view.getByTestId("frame").childElementCount).toBe(0);
  });

  it("goes out when About opens, and stays out for that version", async () => {
    function About() {
      const { opened } = useUpdates();
      return (
        <button type="button" onClick={opened}>
          About
        </button>
      );
    }
    shell(
      <>
        <UpdateDot place="rail" onOpen={() => undefined} />
        <About />
      </>,
    );
    await screen.findByTestId("update-dot");
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    await waitFor(() => expect(screen.queryByTestId("update-dot")).toBeNull());
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}")).toMatchObject({ version: "1.3.0" });
  });

  it("reads nothing waiting from a store that can't say, and draws no dot", async () => {
    const read = (() => {
      throw new Error("no such call");
    }) as () => Promise<ServerFacts>;
    shell(<UpdateDot place="rail" onOpen={() => undefined} />, { read });
    await settle();
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });
});

describe("About's Update button (ADR 0296)", () => {
  it("rings a beat later for each button below the first, and does what it says", () => {
    const clicked: string[] = [];
    render(
      <>
        <UpdateButton label="Install" onClick={() => clicked.push("install")} testId="first" />
        <UpdateButton
          label="Update"
          soft
          order={1}
          onClick={() => clicked.push("update")}
          testId="second"
        />
      </>,
    );
    const first = screen.getByTestId("first");
    const second = screen.getByTestId("second");
    expect(first.className).toBe("update-btn");
    expect(second.className).toBe("update-btn is-soft");
    expect(first.parentElement?.style.getPropertyValue("--ring-at")).toBe("280ms");
    expect(second.parentElement?.style.getPropertyValue("--ring-at")).toBe("440ms");
    fireEvent.click(second);
    expect(clicked).toEqual(["update"]);
  });
});

/** A bridge on this computer that couldn't take 1.0.32: its owner has something to do. */
function refused(harnessId: string): HarnessSoftware {
  const at = new Date().toISOString();
  return {
    harnessId,
    name: "chips-hermes",
    version: "1.0.31",
    seenAt: at,
    keepCurrent: true,
    bridgeUpdate: {
      package: "@chipschat/hermes",
      running: "1.0.31",
      phase: "refused",
      since: at,
      target: "1.0.32",
      reason: "room",
    },
  };
}

/** Somebody else's iPhone on an older Chips than the App Store's. */
const olderPhone = () => ({
  deviceId: "dev_n",
  personId: "par_n",
  name: "chips-iphone",
  version: "1.1.0",
  seenAt: new Date().toISOString(),
});

/**
 * A computer whose answers the test holds: what everything runs (`runs`, or a failure), and its
 * own updates. Nothing waits for a release, so only what needs the owner can light the dot.
 */
function computer(start: { runs?: Software; self?: SelfUpdateFacts } = {}) {
  const state = {
    runs: start.runs as Software | undefined,
    self: start.self,
    softwareFails: false,
    nightFails: false,
    serverFails: false,
  };
  const asked = { server: 0, software: 0, night: [] as boolean[] };
  const read = async (): Promise<ServerFacts> => {
    asked.server += 1;
    if (state.serverFails) throw new Error("offline");
    return {
      machine: "hetzner-box",
      version: "1.2.4",
      publicUrl: "https://box",
      relay: { url: undefined, status: "off" },
      updates: { releases: [], appStore: "1.2.4" },
      ...(state.self === undefined ? {} : { selfUpdate: state.self }),
    };
  };
  const server: UpdatesServer = {
    software: async () => {
      asked.software += 1;
      if (state.softwareFails) throw Object.assign(new Error("answered 503"), { status: 503 });
      return state.runs;
    },
    setSelfUpdate: async (automatic) => {
      asked.night.push(automatic);
      if (state.nightFails) throw new Error("offline");
      state.self = { available: true, ...state.self, automatic };
      return state.self;
    },
    keepBridgeCurrent: async () => undefined,
    me: "par_me",
    thisDevice: "dev_me",
    harnessName: (id) => ({ har_hermes: "Hermes", har_codex: "Codex" })[id],
    personName: (id) => (id === "par_n" ? "Natalie" : undefined),
  };
  return { state, asked, read, server };
}

describe("when the provider reads the computer", () => {
  it("reads again when the page comes back into view after ten minutes, and not before", async () => {
    let at = 1_800_000_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => at);
    try {
      const box = computer();
      shell(<Probe />, box);
      await settle();
      expect(box.asked).toMatchObject({ server: 1, software: 1 });

      at += READ_AGAIN_MS - 1;
      act(() => void document.dispatchEvent(new Event("visibilitychange")));
      await settle();
      expect(box.asked.server).toBe(1);

      at += 1;
      act(() => void document.dispatchEvent(new Event("visibilitychange")));
      await settle();
      expect(box.asked).toMatchObject({ server: 2, software: 2 });
    } finally {
      clock.mockRestore();
    }
  });

  it("reads nothing again for a new set of names from the same computer", async () => {
    // The shell hands in a new `server` whenever the directory changes: a rename, somebody's
    // presence. That is no news of the computer.
    const box = computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });
    const view = shell(<Probe />, box);
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge"]);
    expect(box.asked).toMatchObject({ server: 1, software: 1 });

    const renamed = { ...box.server, harnessName: () => "Hermes on the mini" };
    view.rerender(provider(<Probe />, { ...box, server: renamed }));
    await settle();
    expect(box.asked).toMatchObject({ server: 1, software: 1 });
    // The names are the new ones all the same.
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes on the mini bridge"]);
  });

  it("keeps the list a screen has drawn while a new one says the same", async () => {
    const box = computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });
    const view = shell(<Probe />, box);
    await settle();
    const drawn = says.needs;
    view.rerender(provider(<Probe />, { ...box, server: { ...box.server } }));
    await settle();
    expect(says.needs).toBe(drawn);
  });

  it("keeps the last list when a read fails", async () => {
    const box = computer({
      runs: { harnesses: [refused("har_hermes")], devices: [olderPhone()] },
      self: { available: true, automatic: true },
    });
    shell(<Probe />, box);
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge", "Natalie's iPhone"]);

    box.state.softwareFails = true;
    box.state.serverFails = true;
    await act(async () => says.opened()());
    await settle();
    expect(box.asked).toMatchObject({ server: 2, software: 2 });
    expect(says.software?.harnesses).toHaveLength(1);
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge", "Natalie's iPhone"]);
    expect(says.selfUpdate).toEqual({ available: true, automatic: true });
    expect(says.computer).toMatchObject({ kind: "read", facts: { version: "1.2.4" } });
  });

  it("knows nothing runs once the computer says it keeps no such list", async () => {
    const box = computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });
    shell(<Probe />, box);
    await settle();
    // As the store answers for an older server's 404.
    box.state.runs = undefined;
    await act(async () => says.readSoftware());
    await settle();
    expect(says.software).toBeUndefined();
    expect(says.needs).toEqual([]);
  });

  it("puts the night switch back when the computer wouldn't take it, though the read after fails", async () => {
    const box = computer({ self: { available: true, automatic: false } });
    shell(<Probe />, box);
    await settle();
    box.state.nightFails = true;
    box.state.serverFails = true;
    act(() => says.setNightly(true));
    expect(says.selfUpdate?.automatic).toBe(true);
    await settle();
    expect(box.asked.night).toEqual([true]);
    expect(says.selfUpdate?.automatic).toBe(false);
  });
});

describe("the dot, for the owner (ADR 0297)", () => {
  const needing = () => computer({ runs: { harnesses: [refused("har_hermes")], devices: [] } });

  it("lights for a bridge that needs them, with nothing out for the computer", async () => {
    shell(dotAndProbe, needing());
    const dot = await screen.findByTestId("update-dot");
    expect(dot.getAttribute("title")).toBe("Something needs an update");
    expect(says.dot).toBeUndefined();
    expect(says.ownerLit).toBe(true);
    // About Chips keeps its small dot for it too.
    expect(says.rowLit).toBe(true);
  });

  it("goes out when About opens, and is still out when the shell is made again", async () => {
    const box = needing();
    const view = shell(dotAndProbe, box);
    await screen.findByTestId("update-dot");
    act(() => void says.opened());
    await waitFor(() => expect(screen.queryByTestId("update-dot")).toBeNull());
    expect(localStorage.getItem(SEEN_NEEDS_KEY)).toContain("bridge:har_hermes");
    // The row in About keeps its small dot: the bridge still needs them.
    expect(says.rowLit).toBe(true);

    view.unmount();
    shell(dotAndProbe, box);
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("never lights for somebody's phone alone", async () => {
    shell(dotAndProbe, computer({ runs: { harnesses: [], devices: [olderPhone()] } }));
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Natalie's iPhone"]);
    expect(screen.queryByTestId("update-dot")).toBeNull();
    expect(says.rowLit).toBe(false);
  });

  it("stays out where the dot was turned off", async () => {
    localStorage.setItem(DOT_KEY, "off");
    shell(dotAndProbe, needing());
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("lights for a night that couldn't update only while the night switch is on", async () => {
    const last = { state: "failed" as const, from: "1.2.4", at: "2026-11-12T03:10:00.000Z" };
    const box = computer({ self: { available: true, automatic: true, last } });
    const view = shell(dotAndProbe, box);
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
    view.unmount();

    shell(dotAndProbe, computer({ self: { available: true, automatic: false, last } }));
    await settle();
    expect(says.selfUpdate?.last?.state).toBe("failed");
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("is nobody's but the owner's", async () => {
    shell(dotAndProbe, { ...needing(), owner: false });
    await settle();
    expect(says.needs).toEqual([]);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("stays out when one of two things About put it out for is fixed", async () => {
    const box = computer({
      runs: { harnesses: [refused("har_hermes"), refused("har_codex")], devices: [] },
    });
    shell(dotAndProbe, box);
    await screen.findByTestId("update-dot");
    let leave: () => void = () => undefined;
    act(() => {
      leave = says.opened();
    });
    await waitFor(() => expect(screen.queryByTestId("update-dot")).toBeNull());
    act(() => leave());

    // Codex's bridge takes its release; Hermes's still needs them, as it did when About was open.
    box.state.runs = { harnesses: [refused("har_hermes")], devices: [] };
    await act(async () => says.readSoftware());
    await settle();
    expect(says.needs.map((row) => row.label)).toEqual(["Hermes bridge"]);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });

  it("goes out for what comes to need them while About is the page being shown", async () => {
    const box = computer({ runs: { harnesses: [], devices: [] } });
    shell(dotAndProbe, box);
    await settle();
    let leave: () => void = () => undefined;
    act(() => {
      leave = says.opened();
    });
    await settle();

    // A bridge fails with About already open: it is on the page, so it is seen.
    box.state.runs = { harnesses: [refused("har_hermes")], devices: [] };
    await act(async () => says.readSoftware());
    await settle();
    expect(says.needs).toHaveLength(1);
    expect(screen.queryByTestId("update-dot")).toBeNull();
    expect(localStorage.getItem(SEEN_NEEDS_KEY)).toContain("bridge:har_hermes");

    // With About left, something new lights it again.
    act(() => leave());
    box.state.runs = { harnesses: [refused("har_hermes"), refused("har_codex")], devices: [] };
    await act(async () => says.readSoftware());
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
  });

  it("goes out for a release that comes out while About is the page being shown", async () => {
    const releases: { version: string; date: string; line: string; dot: boolean }[] = [];
    shell(dotAndProbe, { read: facts("1.2.4", releases) });
    await settle();
    act(() => void says.opened());
    await settle();
    expect(localStorage.getItem(SEEN_KEY)).toBeNull();

    // The computer reads the site's list while About is open, and a release is out.
    releases.push({ version: "1.3.0", date: "2026-01-05", line: "New.", dot: true });
    act(() => void says.opened());
    await settle();
    expect(says.waiting.computer).toEqual({ version: "1.3.0", from: "1.2.4" });
    expect(screen.queryByTestId("update-dot")).toBeNull();
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}")).toMatchObject({ version: "1.3.0" });
  });
});

describe("a computer Chips for Mac carries (ADR 0298)", () => {
  it("lights no dot and asks for no Update: it comes along with the app", async () => {
    const read = async (): Promise<ServerFacts> => ({
      ...(await facts("1.2.3")()),
      selfUpdate: { available: false, automatic: false, withApp: true },
    });
    shell(dotAndProbe, { read });
    await settle();
    expect(says.waiting.computer).toEqual({ version: "1.3.0", from: "1.2.3" });
    expect(says.asking.computer).toBeUndefined();
    expect(says.rowLit).toBe(false);
    expect(screen.queryByTestId("update-dot")).toBeNull();
  });
});

describe("Chips for Mac's own update, in the provider (ADR 0298)", () => {
  /** A shell whose update the test says, and whether it is still being listened to. */
  function macShell(updateNow: () => Promise<void> = async () => undefined) {
    const shellSays: { listen: (update: MacUpdate) => void; stopped: number } = {
      listen: () => undefined,
      stopped: 0,
    };
    const mac: MacUpdater = {
      onUpdate: async (listen) => {
        shellSays.listen = listen;
        return () => {
          shellSays.stopped += 1;
        };
      },
      updateNow,
    };
    return { shellSays, mac: Promise.resolve(mac) };
  }

  it("says what the shell says of it, and stops listening when the shell goes", async () => {
    const { shellSays, mac } = macShell();
    const view = shell(<Probe />, { device: "mac", mac });
    await settle();
    expect(says.macUpdate).toBeUndefined();
    act(() => shellSays.listen({ state: "getting", version: "1.3.0" }));
    expect(says.macUpdate).toEqual({ state: "getting", version: "1.3.0" });
    expect(shellSays.stopped).toBe(0);
    view.unmount();
    expect(shellSays.stopped).toBe(1);
  });

  it("stops listening at once when the shell goes before it has started", async () => {
    const { shellSays, mac } = macShell();
    const view = shell(<Probe />, { device: "mac", mac });
    view.unmount();
    await settle();
    expect(shellSays.stopped).toBe(1);
  });

  it("asks the shell to restart, and takes no harm when the shell won't", async () => {
    let asked = 0;
    const { mac } = macShell(async () => {
      asked += 1;
      throw new Error("no update is waiting");
    });
    shell(<Probe />, { device: "mac", mac });
    await settle();
    act(() => says.restartNow());
    await settle();
    expect(asked).toBe(1);
  });

  it("lights the dot for an update that failed, and puts it out once a later one is ready", async () => {
    const { shellSays, mac } = macShell();
    // The computer is on the release; Chips for Mac, at 1.2.4, is behind it.
    shell(dotAndProbe, { read: facts("1.3.0"), device: "mac", mac });
    await settle();
    act(() => shellSays.listen({ state: "failed", version: "1.3.0", why: "No room." }));
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
    expect(says.rowLit).toBe(true);

    act(() => shellSays.listen({ state: "ready", version: "1.3.0" }));
    expect(screen.queryByTestId("update-dot")).toBeNull();
    expect(says.rowLit).toBe(false);
    // Still shown in About, where Restart now is.
    expect(says.waiting.app).toEqual({ version: "1.3.0", from: "1.2.4" });
  });

  it("lights the dot for a release that waits on an administrator's password", async () => {
    const { shellSays, mac } = macShell();
    shell(dotAndProbe, { read: facts("1.3.0"), device: "mac", mac });
    await settle();
    act(() => shellSays.listen({ state: "ready", version: "1.3.0", asks: true }));
    expect(await screen.findByTestId("update-dot")).toBeTruthy();
    expect(says.rowLit).toBe(true);
  });
});
