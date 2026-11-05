/**
 * The seam between the page and the desktop shell: what it asks for, and what it makes of the
 * answers. The shell itself is Rust and is exercised by running the app; this is the contract
 * between them, which is the part that can drift silently.
 */

import { appPairingUrl, inviteAppUrl } from "@chipschat/protocol";
import { describe, expect, it, vi } from "vitest";
import { desktop, desktopWith, inDesktop, parseLink, type TauriApi } from "./native.ts";

function api(): TauriApi & {
  readonly calls: { command: string; args?: Record<string, unknown> }[];
  readonly handlers: Map<string, (message: { payload: unknown }) => void>;
  /** The links the shell is holding for the page, as `take_links` hands them over. */
  readonly waiting: string[];
} {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const handlers = new Map<string, (message: { payload: unknown }) => void>();
  const waiting: string[] = [];
  return {
    calls,
    handlers,
    waiting,
    invoke: (async (command: string, args?: Record<string, unknown>) => {
      calls.push({ command, ...(args === undefined ? {} : { args }) });
      if (command === "take_links") return waiting.splice(0);
      return command === "discover_servers" ? [] : undefined;
    }) as TauriApi["invoke"],
    listen: (async (event: string, handler: (message: { payload: unknown }) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    }) as TauriApi["listen"],
  };
}

describe("whether there is a shell at all", () => {
  it("is no in a browser, and yes in the window Tauri makes", () => {
    expect(inDesktop({} as typeof globalThis)).toBe(false);
    expect(inDesktop({ __TAURI_INTERNALS__: {} } as unknown as typeof globalThis)).toBe(true);
  });
});

describe("what the page asks the shell for", () => {
  it("passes each command what it needs, and nothing else", async () => {
    const shell = api();
    const desktop = desktopWith(shell);
    await desktop.discover(900);
    await desktop.ask("apr_1", "Scout wants to email Dana", "Confirming PO #4471");
    await desktop.badge(3);
    await desktop.holdPage?.("<p>Bronze</p>", "default-src 'none'");
    expect(shell.calls).toEqual([
      { command: "discover_servers", args: { millis: 900 } },
      {
        command: "ask_about",
        args: {
          approvalId: "apr_1",
          title: "Scout wants to email Dana",
          body: "Confirming PO #4471",
        },
      },
      { command: "set_badge", args: { count: 3 } },
      { command: "hold_page", args: { html: "<p>Bronze</p>", policy: "default-src 'none'" } },
    ]);
  });

  it("runs Chips here with the reach asked for, and reads the line chips up printed (ADR 0173)", async () => {
    const line = JSON.stringify({
      url: "http://127.0.0.1:4431",
      pair_link: "http://127.0.0.1:4431/#pair=ABC-234&v=1",
      phone_link: null,
      service: "launchd",
      reach: "lan",
      already_running: false,
      created: true,
    });
    const calls: { command: string; args?: Record<string, unknown> }[] = [];
    const shell: TauriApi = {
      invoke: (async (command: string, args?: Record<string, unknown>) => {
        calls.push({ command, ...(args === undefined ? {} : { args }) });
        if (command === "can_run_here") return true;
        return line;
      }) as TauriApi["invoke"],
      listen: (async () => () => undefined) as TauriApi["listen"],
    };
    const desktop = desktopWith(shell);
    expect(await desktop.canRunHere?.()).toBe(true);
    const answer = await desktop.runHere?.("lan");
    expect(answer?.pair_link).toBe("http://127.0.0.1:4431/#pair=ABC-234&v=1");
    expect(calls).toEqual([
      { command: "can_run_here" },
      { command: "run_here", args: { reach: "lan" } },
    ]);
  });

  it("carries nothing to run where the shell has no such command", async () => {
    const old: TauriApi = {
      invoke: (async () => {
        throw new Error("command can_run_here not found");
      }) as TauriApi["invoke"],
      listen: (async () => () => undefined) as TauriApi["listen"],
    };
    expect(await desktopWith(old).canRunHere?.()).toBe(false);
  });

  it("turns a notification's answer into a decision the app can act on", async () => {
    const shell = api();
    const heard: unknown[] = [];
    const stop = await desktopWith(shell).onDecision((decision) => heard.push(decision));

    shell.handlers.get("chips://approval-decided")?.({
      payload: { approval_id: "apr_1", decision: "approved" },
    });
    expect(heard).toEqual([{ approvalId: "apr_1", decision: "approved" }]);

    stop();
    expect(shell.handlers.has("chips://approval-decided")).toBe(false);
  });

  it("tells the menus what the page can do, and hears what was chosen from them (ADR 0267)", async () => {
    const shell = api();
    const mac = desktopWith(shell);
    await mac.setMenu?.([{ id: "new-space", title: "New Space", enabled: true }]);
    await mac.openLink?.("https://github.com/arjungupta99/chips/issues/new");
    expect(shell.calls).toEqual([
      {
        command: "set_menu",
        args: { standing: [{ id: "new-space", title: "New Space", enabled: true }] },
      },
      { command: "open_link", args: { url: "https://github.com/arjungupta99/chips/issues/new" } },
    ]);

    const chosen: string[] = [];
    const stop = await mac.onMenu?.((id) => chosen.push(id));
    shell.handlers.get("chips://menu")?.({ payload: "next-space" });
    expect(chosen).toEqual(["next-space"]);
    stop?.();
    expect(shell.handlers.has("chips://menu")).toBe(false);
  });

  it("says how large the page is drawn, at once and after each ⌘+ or ⌘−", async () => {
    const shell = api();
    const heard: number[] = [];
    const stop = await desktopWith({
      ...shell,
      invoke: (async (command: string) =>
        command === "page_zoom" ? 1.25 : undefined) as TauriApi["invoke"],
    }).onZoom?.((zoom) => heard.push(zoom));
    expect(heard).toEqual([1.25]);
    shell.handlers.get("chips://zoom")?.({ payload: 1.5 });
    expect(heard).toEqual([1.25, 1.5]);
    stop?.();
    expect(shell.handlers.has("chips://zoom")).toBe(false);
  });

  it("says whether the window fills the screen, at once and after each change of its size", async () => {
    const handlers = new Map<string, (message: { payload: unknown }) => void>();
    let full = false;
    const asked: string[] = [];
    const shell: TauriApi = {
      invoke: (async (command: string) => {
        asked.push(command);
        return full;
      }) as TauriApi["invoke"],
      listen: (async (event: string, handler: (message: { payload: unknown }) => void) => {
        handlers.set(event, handler);
        return () => handlers.delete(event);
      }) as TauriApi["listen"],
    };
    const heard: boolean[] = [];
    const stop = await desktopWith(shell).onFullScreen?.((now) => heard.push(now));
    expect(heard).toEqual([false]);
    full = true;
    handlers.get("tauri://resize")?.({ payload: {} });
    await vi.waitFor(() => expect(heard).toEqual([false, true]));
    expect(asked.every((command) => command === "plugin:window|is_fullscreen")).toBe(true);
    stop?.();
    expect(handlers.has("tauri://resize")).toBe(false);
  });

  it("takes the link the app was launched with, though the page was not there to hear it", async () => {
    const shell = api();
    shell.waiting.push("chips://space/spc_01H");
    const opened: unknown[] = [];
    await desktopWith(shell).onOpen((link) => opened.push(link));
    expect(opened).toEqual([{ kind: "space", id: "spc_01H" }]);
  });

  it("takes each later link once, and quietly drops one it does not understand", async () => {
    const shell = api();
    const opened: unknown[] = [];
    await desktopWith(shell).onOpen((link) => opened.push(link));
    const fire = shell.handlers.get("chips://open");

    shell.waiting.push("chips://nonsense/xyz", "not a url at all", "chips://approval/apr_01H");
    fire?.({ payload: null });
    await vi.waitFor(() => expect(opened).toEqual([{ kind: "approval", id: "apr_01H" }]));
    // Told again with nothing waiting: nothing arrives twice.
    fire?.({ payload: null });
    await new Promise((settle) => setTimeout(settle, 0));
    expect(opened).toHaveLength(1);
  });
});

describe("what a chips:// link points at", () => {
  it("reads a space and an approval", () => {
    expect(parseLink("chips://space/spc_01H")).toEqual({
      kind: "space",
      id: "spc_01H",
    });
    expect(parseLink("chips://approval/apr_01H")).toEqual({ kind: "approval", id: "apr_01H" });
  });

  it("reads a pairing link, as `pnpm desktop` and a page that cannot pair make one", () => {
    const link = appPairingUrl("https://mini.example.ts.net", "KMR-M3P");
    expect(parseLink(link)).toEqual({
      kind: "pair",
      payload: { v: 1, code: "KMR-M3P", lan: "https://mini.example.ts.net", candidates: [] },
    });
    // A `chips://` link has no origin to fall back on: with no server, it pairs with nothing.
    expect(parseLink("chips://pair?pair=KMR-M3P&v=1")).toBeUndefined();
    expect(parseLink("chips://pair?v=1&lan=https%3A%2F%2Fmini.example.ts.net")).toBeUndefined();
  });

  it("reads an invite for the app, with the server it names, and nothing without one (ADR 0164)", () => {
    const link = inviteAppUrl({
      token: "chips_inv_1",
      lan: "https://mini.example.ts.net",
      relay: "wss://relay.example",
      key: "k".repeat(43),
    });
    expect(parseLink(link)).toEqual({
      kind: "join",
      invite: {
        token: "chips_inv_1",
        lan: "https://mini.example.ts.net",
        relay: "wss://relay.example",
        key: "k".repeat(43),
      },
    });
    expect(parseLink("chips://join?invite=chips_inv_1")).toBeUndefined();
  });

  it("is lenient about the slashes and strict about everything else", () => {
    expect(parseLink("chips:approval/apr_01H")).toEqual({ kind: "approval", id: "apr_01H" });
    // A kind it does not know, an id of the wrong kind, another scheme, and not a URL.
    expect(parseLink("chips://run/run_01H")).toBeUndefined();
    expect(parseLink("chips://approval/spc_01H")).toBeUndefined();
    expect(parseLink("https://chipschat.ai/approval/apr_01H")).toBeUndefined();
    expect(parseLink("chips://approval")).toBeUndefined();
    expect(parseLink("nonsense")).toBeUndefined();
  });
});

describe("in a browser", () => {
  it("has no shell, and asking for one loads nothing of Tauri's", async () => {
    // The dynamic import sits behind this check, so a tab never fetches it: proving the answer
    // is `undefined` is proving the import is not reached.
    await expect(desktop({} as typeof globalThis)).resolves.toBeUndefined();
  });
});

describe("connecting a bridge's card here (ADR 0218, phase 5)", () => {
  it("runs it with the link as a word to the shell, hears its lines in order, and ends after the last", async () => {
    const shell = api();
    const heard: string[] = [];
    const run = await desktopWith(shell).connectHere?.(
      { id: "hermes", name: "Hermes" },
      "http://h/j/chips_j_x",
      (line) => heard.push(line),
    );
    const started = shell.calls.find((call) => call.command === "connect_here");
    // With the name the sheet showed, which `chips connect` checks against its own card (SEC-51).
    expect(started?.args).toMatchObject({
      id: "hermes",
      cardName: "Hermes",
      link: "http://h/j/chips_j_x",
    });
    const id = String(started?.args?.["run"]);
    const say = shell.handlers.get("chips://connect-line");
    // Another run's lines are not this one's.
    say?.({ payload: { run: "run_other", line: '{"step":"checking"}' } });
    say?.({ payload: { run: id, line: '{"step":"downloading"}' } });
    say?.({ payload: { run: id, line: '{"step":"checking"}' } });
    say?.({ payload: { run: id, end: 1 } });
    expect(await run?.done).toBe(1);
    expect(heard).toEqual(['{"step":"downloading"}', '{"step":"checking"}']);
    // Ended, it listens no more.
    expect(shell.handlers.has("chips://connect-line")).toBe(false);
    await run?.cancel();
    expect(shell.calls.at(-1)).toEqual({ command: "cancel_connect", args: { run: id } });
  });

  it("says the shell's refusal, and listens no more", async () => {
    const shell = api();
    const refusing: TauriApi = {
      ...shell,
      invoke: (async (command: string, args?: Record<string, unknown>) => {
        // A command's Err comes to the page as its words alone, as Tauri rejects with them.
        if (command === "connect_here")
          return Promise.reject("Move Chips to your Applications folder first.");
        return shell.invoke(command, args);
      }) as TauriApi["invoke"],
    };
    await expect(
      desktopWith(refusing).connectHere?.(
        { id: "hermes", name: "Hermes" },
        "http://h/j/chips_j_x",
        () => undefined,
      ),
    ).rejects.toBe("Move Chips to your Applications folder first.");
    expect(shell.handlers.has("chips://connect-line")).toBe(false);
  });
});
