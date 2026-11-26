/**
 * Universe on the phone (ADR 0227): the space's documents on Phone, and what happens on the
 * person's Mac on Desktop. Programs never open on the phone.
 */

import type { Space, Store } from "@chipschat/core";
import {
  act,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import { SheetDock } from "../ui/Sheet";
import { forgetDesktopSeen, loadDesktopSeen } from "./desktopSeen";
import { UniverseSheet } from "./Universe";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

const space = {
  id: "sp_1",
  title: "Terra Fab Research",
  kind: "group",
  members: ["per_arjun", "agt_hello"],
  roles: { per_arjun: "owner", agt_hello: "member" },
  state: "open",
  lastEventSeq: 1,
  lines: [],
  runs: [],
  sessions: [],
  pins: [],
  project: { files: 2, changes: [] },
} as unknown as Space;

/** A store whose project holds these files, read as they are. */
function storeWith(files: Record<string, string>) {
  const store = fakeStore(snapshot());
  const writable = store as {
    projectFiles: Store["projectFiles"];
    projectFile: Store["projectFile"];
  };
  writable.projectFiles = async () => ({
    at: "c".repeat(40),
    files: Object.keys(files).map((path) => ({
      path,
      bytes: files[path]?.length ?? 0,
      type: "text/plain",
    })),
  });
  writable.projectFile = async (_spaceId, path) => {
    const text = files[path];
    if (text === undefined) throw new Error("That file isn't in the project.");
    return { bytes: new TextEncoder().encode(text), type: "text/plain" };
  };
  return store;
}

const open = (store: Store) =>
  render(
    <UniverseSheet
      store={store}
      space={space}
      selfId="per_arjun"
      title="Terra Fab Research"
      open
      onClose={() => undefined}
    />,
  );

const desktop = () => userEvent.press(screen.getByRole("radio", { name: "Desktop" }));

describe("Universe on the phone (ADR 0227)", () => {
  it("shows the planets going round while it reads the space", async () => {
    const store = storeWith({});
    (store as { projectFiles: Store["projectFiles"] }).projectFiles = () =>
      new Promise(() => undefined);
    await open(store);
    expect(screen.getByTestId("universe-reading")).toBeOnTheScreen();
    expect(screen.getByTestId("universe-orbit")).toBeOnTheScreen();
    expect(screen.getByText("Reading the space…")).toBeOnTheScreen();
  });

  it("opens a page with the planets going round, and gives its read up when the page closes", async () => {
    const store = storeWith({ "a.html": "<h1>A</h1>", "b.html": "<h1>B</h1>" });
    const asked: AbortSignal[] = [];
    (store as { projectPage: Store["projectPage"] }).projectPage = (_space, _path, _at, signal) => {
      if (signal !== undefined) asked.push(signal);
      return new Promise(() => undefined);
    };
    await open(store);
    await userEvent.press(await screen.findByTestId("universe-document-a.html"));
    const sheet = await screen.findByTestId("page-sheet");
    // The page's own planets: the list's may still be fading out behind it.
    expect(within(sheet).getByTestId("universe-orbit")).toBeOnTheScreen();
    expect(asked.map((signal) => signal.aborted)).toEqual([false]);
    await userEvent.press(screen.getByTestId("page-done"));
    expect(asked.map((signal) => signal.aborted)).toEqual([true]);
  });

  it("gives up the start page when the sheet closes before it came, and keeps one that came", async () => {
    const store = storeWith({ ".chips/index.html": "<h1>Terafab</h1>" });
    const asked: AbortSignal[] = [];
    let answer: ((page: string) => void) | undefined;
    (store as { projectPage: Store["projectPage"] }).projectPage = (_space, _path, _at, signal) => {
      if (signal !== undefined) asked.push(signal);
      return new Promise((resolve) => {
        answer = resolve;
      });
    };
    const sheet = (up: boolean) => (
      <UniverseSheet
        store={store}
        space={space}
        selfId="per_arjun"
        title="Terra Fab Research"
        open={up}
        onClose={() => undefined}
      />
    );
    const { rerender } = await render(sheet(true));
    await waitFor(() => expect(asked).toHaveLength(1));
    await rerender(<SafeAreaProvider initialMetrics={IPHONE}>{sheet(false)}</SafeAreaProvider>);
    expect(asked[0]?.aborted).toBe(true);
    // Open again, it asks again, and once it has the page it does not ask for it a third time.
    await rerender(<SafeAreaProvider initialMetrics={IPHONE}>{sheet(true)}</SafeAreaProvider>);
    await waitFor(() => expect(asked).toHaveLength(2));
    await act(async () => answer?.("<h1>Terafab</h1>"));
    await rerender(<SafeAreaProvider initialMetrics={IPHONE}>{sheet(false)}</SafeAreaProvider>);
    await rerender(<SafeAreaProvider initialMetrics={IPHONE}>{sheet(true)}</SafeAreaProvider>);
    expect(asked).toHaveLength(2);
    expect(screen.getByTestId("universe-page")).toBeOnTheScreen();
  });

  it("is Universe, with the space's name under it, on Phone", async () => {
    await open(storeWith({ ".chips/index.html": "<h1>Terafab</h1>" }));
    expect(screen.getByRole("header")).toHaveTextContent("Universe");
    expect(screen.getByText("Terra Fab Research")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Phone" })).toBeChecked();
  });

  it("loads the start page the agents keep in the tab", async () => {
    await open(
      storeWith({ ".chips/index.html": "<h1>Terafab</h1>", "reports/overview.html": "<p>1</p>" }),
    );
    expect(await screen.findByTestId("universe-page")).toBeOnTheScreen();
  });

  it("keeps the start page unseen under the planets until it has loaded, then it arrives", async () => {
    await open(storeWith({ ".chips/index.html": "<h1>Terafab</h1>" }));
    // On the glass, so it loads, but not seen or read: a web view's canvas is white until its
    // page has painted over it.
    const view = await screen.findByTestId("page-view", { includeHiddenElements: true });
    expect(screen.queryByTestId("page-view")).toBeNull();
    expect(screen.getByText("Opening…")).toBeOnTheScreen();
    await act(async () => view.props["onLoadEnd"]());
    await waitFor(() => expect(screen.queryByText("Opening…")).toBeNull());
    expect(screen.getByTestId("page-view")).toBeOnTheScreen();
  });

  // 3 November 2026: "We also need a full screen view button maybe somewhere so we can view
  // content full screen when possible".
  it("opens the start page full screen from the words it already read", async () => {
    const store = storeWith({ ".chips/index.html": "<h1>Terafab</h1>" });
    let asked = 0;
    (store as { projectPage: Store["projectPage"] }).projectPage = async () => {
      asked += 1;
      return "<h1>Terafab</h1>";
    };
    await open(store);
    await screen.findByTestId("page-view", { includeHiddenElements: true });
    await userEvent.press(screen.getByRole("button", { name: "Full screen" }));
    expect(await screen.findByTestId("page-sheet")).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.getAllByTestId("page-view", { includeHiddenElements: true })).toHaveLength(2),
    );
    expect(asked).toBe(1);
  });

  it("has no Full screen where the tab draws no page", async () => {
    await open(storeWith({ "a.html": "<h1>A</h1>", "b.html": "<h1>B</h1>" }));
    expect(await screen.findByTestId("universe-document-a.html")).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Full screen" })).toBeNull();
  });

  it("lists several documents when there is no start page, and says so", async () => {
    await open(storeWith({ "a.pdf": "%PDF", "b.md": "# B" }));
    expect(
      await screen.findByText("2 documents and no start page yet. Ask the agents for one."),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("universe-document-a.pdf")).toBeOnTheScreen();
    expect(screen.getByTestId("universe-document-b.md")).toBeOnTheScreen();
  });

  it("opens nothing of a program here, and points to Desktop", async () => {
    const store = storeWith({
      "index.html": "<h1>Sudoku</h1>",
      ".chips/run.json": '{"run": "python3 -m http.server 8000", "opens": "http://localhost:8000"}',
    });
    await open(store);
    expect(await screen.findByTestId("universe-programs-here")).toHaveTextContent(
      /^Programs run on your Mac/,
    );
    expect(screen.queryByTestId("universe-page")).toBeNull();
    await userEvent.press(screen.getByTestId("universe-to-desktop"));
    expect(await screen.findByText("Program")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Run program" })).toHaveTextContent("Run");
  });

  it("shows no Desktop to somebody who isn't an owner, and says the program runs on the owner's Mac (ADR 0231)", async () => {
    const store = storeWith({
      ".chips/run.json": '{"run": "python3 -m http.server 8000", "opens": "http://localhost:8000"}',
    });
    await render(
      <UniverseSheet
        store={store}
        space={space}
        selfId="per_dana"
        title="Terra Fab Research"
        open
        onClose={() => undefined}
      />,
    );
    expect(await screen.findByTestId("universe-programs-here")).toHaveTextContent(
      /^Programs run on the owner's Mac/,
    );
    expect(screen.queryByTestId("universe-tabs")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Desktop" })).toBeNull();
    expect(screen.queryByTestId("universe-to-desktop")).toBeNull();
    expect(screen.queryByRole("button", { name: "Run program" })).toBeNull();
  });

  it("lists the page and the folder, each with Open, and says once that they happen on the Mac", async () => {
    const store = storeWith({ "lease-notes.pdf": "%PDF" });
    await open(store);
    await desktop();
    expect(await screen.findByText("The project's folder, in Finder")).toBeOnTheScreen();
    expect(screen.getByText("lease-notes.pdf")).toBeOnTheScreen();
    expect(screen.getByText("In Chips on your Mac")).toBeOnTheScreen();
    expect(screen.getByText("These happen in Chips for Mac, on your Mac.")).toBeOnTheScreen();
    expect(screen.getByRole("button", { name: "Open folder in Mac" })).toHaveTextContent("Open");
    expect(screen.getByRole("button", { name: "Open page" })).toHaveTextContent("Open");
    await userEvent.press(screen.getByTestId("universe-open-folder"));
    expect(await screen.findByTestId("universe-open-folder-said")).toHaveTextContent(
      "Sent to your Mac. Finder opens the folder there.",
    );
    await userEvent.press(screen.getByTestId("universe-open-page"));
    expect(await screen.findByTestId("universe-open-page-said")).toHaveTextContent(
      "Sent to your Mac. Chips opens it there.",
    );
    const calls = (store as unknown as { calls: unknown[] }).calls;
    expect(calls).toContainEqual({ name: "openFolderOnMac", args: { spaceId: "sp_1" } });
    expect(calls).toContainEqual({ name: "openPageOnMac", args: { spaceId: "sp_1" } });
    // No program, so no row for one.
    expect(screen.queryByText("Program")).toBeNull();
  });

  it("says when the server had to open Chips for Mac for the ask (ADR 0227)", async () => {
    const store = storeWith({ "lease-notes.pdf": "%PDF" });
    const woken = { macs: 1, opened_app: true } as const;
    (store as { openFolderOnMac: Store["openFolderOnMac"] }).openFolderOnMac = async () => woken;
    (store as { openPageOnMac: Store["openPageOnMac"] }).openPageOnMac = async () => woken;
    await open(store);
    await desktop();
    await userEvent.press(await screen.findByTestId("universe-open-folder"));
    expect(await screen.findByTestId("universe-open-folder-said")).toHaveTextContent(
      "Chips for Mac wasn't open, so Chips opened it. Finder opens the folder there.",
    );
    await userEvent.press(screen.getByTestId("universe-open-page"));
    expect(await screen.findByTestId("universe-open-page-said")).toHaveTextContent(
      "Chips for Mac wasn't open, so Chips opened it. The page opens there.",
    );
  });

  it("runs the program on the person's Mac, and shows what the Mac says (ADR 0226)", async () => {
    const store = storeWith({
      "chips.json": '{"run": "npm start", "setup": "npm install"}',
      "server.js": "",
    });
    await open(store);
    await desktop();
    expect(await screen.findByTestId("run-bar-words")).toHaveTextContent(
      "Runs npm install, then npm start on your Mac.",
    );
    await userEvent.press(screen.getByTestId("run-bar-run"));
    const runnable = store as unknown as {
      calls: unknown[];
      tellRun: (spaceId: string, run: unknown) => void;
    };
    expect(runnable.calls).toContainEqual({
      name: "runOnMac",
      args: { spaceId: "sp_1", ask: { op: "run", command: "npm install\nnpm start" } },
    });
    // A Mac heard it: Run waits on what that Mac says rather than coming back for a moment.
    expect(screen.getByTestId("run-bar-run")).toBeBusy();
    // Running, the row says so, and Stop and Run again open under it in place of Run.
    await act(async () =>
      runnable.tellRun("sp_1", {
        state: "running",
        command: "npm install\nnpm start",
        since: "2026-10-24T09:00:00.000Z",
        mac: "Mac mini",
        said_at: "2026-10-24T09:00:01.000Z",
      }),
    );
    expect(screen.getByTestId("run-bar-state")).toHaveTextContent("Running on your Mac");
    expect(screen.getByTestId("run-bar-stop")).toBeOnTheScreen();
    expect(screen.getByTestId("run-bar-again")).toHaveTextContent("Run again");
    expect(screen.queryByTestId("run-bar-run")).toBeNull();
    await act(async () =>
      runnable.tellRun("sp_1", {
        state: "failed",
        command: "npm install\nnpm start",
        since: "2026-10-24T09:00:00.000Z",
        ended: "2026-10-24T09:00:03.000Z",
        code: 1,
        lines: ["Error: Cannot find module 'vite'"],
        mac: "Mac mini",
        said_at: "2026-10-24T09:00:03.000Z",
      }),
    );
    expect(screen.getByTestId("run-bar-state")).toHaveTextContent("It stopped after 3 seconds.");
    expect(screen.getByTestId("run-bar-lines")).toHaveTextContent(
      "Error: Cannot find module 'vite'",
    );
    // Ended, Stop has gone, and Run is the row's own button again.
    expect(screen.queryByTestId("run-bar-stop")).toBeNull();
    expect(screen.getByRole("button", { name: "Run again" })).toHaveTextContent("Run");
  });

  it("draws a row for each program, with Run all, and runs one by name with what it needs (ADR 0303)", async () => {
    const programs = {
      programs: [
        {
          name: "Shop",
          in: "shop",
          run: "npm run dev",
          opens: "http://localhost:5173",
          needs: ["API"],
        },
        { name: "API", in: "api", run: "uvicorn main:app" },
      ],
    };
    const store = storeWith({
      ".chips/run.json": JSON.stringify(programs),
      ".chips/index.html": "<h1>Bake sale</h1>",
      "shop/index.html": "",
      "api/main.py": "",
    });
    await open(store);
    await desktop();
    expect(await screen.findByTestId("program-Shop-said")).toHaveTextContent(
      "npm run dev in shop/",
    );
    expect(screen.getByTestId("programs-all")).toHaveTextContent("Run all");
    expect(screen.getByText("Page and folder")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("program-Shop-run"));
    const runnable = store as unknown as {
      calls: unknown[];
      tellRun: (spaceId: string, run: unknown, program?: string) => void;
    };
    expect(runnable.calls).toContainEqual({
      name: "runOnMac",
      args: {
        spaceId: "sp_1",
        ask: {
          op: "run",
          program: "Shop",
          command:
            "program API in api\nuvicorn main:app\nprogram Shop in shop\nnpm run dev\nopen http://localhost:5173",
        },
      },
    });
    const said = {
      mac: "Mac mini",
      said_at: "2026-11-25T20:00:01.000Z",
      since: "2026-11-25T20:00:00.000Z",
    };
    await act(async () => {
      runnable.tellRun(
        "sp_1",
        { ...said, state: "running", runs_for: ["Shop"], listens: "http://127.0.0.1:8000/" },
        "API",
      );
      runnable.tellRun(
        "sp_1",
        { ...said, state: "running", opened: "http://127.0.0.1:5173/" },
        "Shop",
      );
    });
    expect(screen.getByTestId("program-API-said")).toHaveTextContent("Running for Shop");
    expect(screen.getByTestId("program-Shop-said")).toHaveTextContent("Running at localhost:5173");
    expect(screen.getByTestId("programs-all")).toHaveTextContent("Stop all");
    await userEvent.press(screen.getByTestId("program-Shop-open"));
    expect(runnable.calls).toContainEqual({
      name: "runOnMac",
      args: { spaceId: "sp_1", ask: { op: "show", program: "Shop" } },
    });
    await userEvent.press(screen.getByTestId("program-Shop-stop"));
    expect(runnable.calls).toContainEqual({
      name: "runOnMac",
      args: { spaceId: "sp_1", ask: { op: "stop", program: "Shop" } },
    });
  });

  const twoPrograms = {
    ".chips/run.json": JSON.stringify({
      programs: [
        { name: "Shop", in: "shop", run: "npm run dev", needs: ["API"] },
        { name: "API", in: "api", run: "uvicorn main:app" },
      ],
    }),
    ".chips/index.html": "<h1>Bake sale</h1>",
  };

  it("says over the start page that the programs aren't running (ADR 0303)", async () => {
    await open(storeWith(twoPrograms));
    expect(await screen.findByTestId("program-banner-title")).toHaveTextContent(
      "Programs aren’t running",
    );
  });

  it("runs no program of several where the computer holds one run per room (ADR 0303)", async () => {
    // A computer that holds one run per room would mix theirs: the phone doesn't run them.
    const older = storeWith(twoPrograms);
    Object.assign(older.getSnapshot(), { keepsPrograms: false });
    await open(older);
    await desktop();
    expect(await screen.findByTestId("run-bar-words")).toHaveTextContent(
      "This space runs several programs. Update Chips on your computer to run them from here.",
    );
    expect(screen.queryByTestId("programs")).toBeNull();
  });

  it("says when nothing opens here or on the Mac yet, and lists the file under Files", async () => {
    await open(storeWith({ "main.py": "print(1)" }));
    // A space whose one file is a script opens on Files, where the script is.
    expect(await screen.findByTestId("universe-file-main.py")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("tab", { name: "Pages, 0" }));
    expect(await screen.findByText("No pages here yet")).toBeOnTheScreen();
    await desktop();
    await waitFor(() =>
      expect(screen.getByText("Nothing here opens on your Mac yet.")).toBeOnTheScreen(),
    );
    expect(screen.getByTestId("universe-open-folder")).toBeOnTheScreen();
  });
});

describe("the Desktop tab's dot (ADR 0227's addendum of 17 November 2026)", () => {
  const SINCE = "2026-11-17T12:00:00.000Z";
  const RUN = '{"run": "npm run dev", "opens": "http://localhost:4173"}';
  const brought = (by: string, at: string) => ({
    commit: "b".repeat(40),
    before: null,
    by,
    byKind: by.startsWith("per_") ? "person" : "agent",
    at,
    seq: 2,
    message: "Game of life runs",
    files: [{ path: ".chips/run.json", added: 3, removed: 0 }],
    moreFiles: 0,
  });
  const life = (by = "agt_pavel", at = "2026-11-17T13:00:00.000Z") =>
    ({ ...space, project: { files: 2, changes: [brought(by, at)] } }) as unknown as Space;
  const sheet = (store: Store, made: Space, up = true) => (
    <UniverseSheet
      store={store}
      space={made}
      selfId="per_arjun"
      title="Game of life"
      open={up}
      onClose={() => undefined}
    />
  );
  /** Drawn again as `render` draws it, in the phone's safe area. */
  const again = (element: ReactElement) => (
    <SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>
  );

  beforeEach(async () => {
    forgetDesktopSeen();
    await loadDesktopSeen(() => new Date(SINCE));
  });
  afterEach(() => act(() => forgetDesktopSeen()));

  it("wears the dot for a program somebody else brought, and puts it out for good when Desktop opens", async () => {
    const store = storeWith({ ".chips/run.json": RUN, "life.js": "tick()" });
    const { rerender } = await render(sheet(store, life()));
    const tab = await screen.findByRole("radio", { name: "Desktop, new" });
    expect(screen.getByTestId("universe-tabs-desktop-dot")).toBeOnTheScreen();
    await userEvent.press(tab);
    expect(await screen.findByText("Program")).toBeOnTheScreen();
    // The row says it's the new one while the sheet stays open; the tab is plain again.
    expect(screen.getByTestId("run-bar-new")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Desktop" })).toBeOnTheScreen();
    // Opened again, nothing is new.
    await act(async () => rerender(again(sheet(store, life(), false))));
    await act(async () => rerender(again(sheet(store, life()))));
    expect(await screen.findByRole("radio", { name: "Desktop" })).toBeOnTheScreen();
    expect(screen.queryByRole("radio", { name: "Desktop, new" })).toBeNull();
  });

  it("counts Go to Desktop as opening it", async () => {
    const store = storeWith({ ".chips/run.json": RUN });
    await render(sheet(store, life()));
    await screen.findByRole("radio", { name: "Desktop, new" });
    await userEvent.press(screen.getByTestId("universe-to-desktop"));
    expect(await screen.findByTestId("run-bar-new")).toBeOnTheScreen();
    expect(screen.queryByRole("radio", { name: "Desktop, new" })).toBeNull();
  });

  it("marks a new page's row too", async () => {
    const store = storeWith({ ".chips/index.html": "<h1>Life</h1>" });
    const page = {
      ...space,
      project: {
        files: 1,
        changes: [
          {
            ...brought("agt_pavel", "2026-11-17T13:00:00.000Z"),
            files: [{ path: ".chips/index.html", added: 1, removed: 0 }],
          },
        ],
      },
    } as unknown as Space;
    await render(sheet(store, page));
    await userEvent.press(await screen.findByRole("radio", { name: "Desktop, new" }));
    expect(await screen.findByTestId("universe-open-page-new")).toBeOnTheScreen();
    expect(screen.queryByTestId("universe-open-folder-new")).toBeNull();
  });

  it("is plain for the person's own program, and for one there before the dot came", async () => {
    const store = storeWith({ ".chips/run.json": RUN });
    const { rerender } = await render(sheet(store, life("per_arjun")));
    expect(await screen.findByTestId("universe-programs-here")).toBeOnTheScreen();
    expect(screen.getByRole("radio", { name: "Desktop" })).toBeOnTheScreen();
    await act(async () =>
      rerender(again(sheet(store, life("agt_pavel", "2026-11-16T09:00:00.000Z")))),
    );
    expect(screen.getByRole("radio", { name: "Desktop" })).toBeOnTheScreen();
    expect(screen.queryByRole("radio", { name: "Desktop, new" })).toBeNull();
  });
});

describe("Media and Pages under Phone (ADR 0227's addendum of 13 November 2026)", () => {
  const shots = [
    "claude-desktop-screenshot.png",
    "claude-desktop-screenshot-2.png",
    "claude-desktop-screenshot-3.png",
  ];
  const change = (commit: string, path: string, at: string) => ({
    commit,
    before: null,
    by: "agt_hello",
    byKind: "agent",
    at,
    seq: 1,
    message: `Kept ${path}`,
    files: [{ path, added: null, removed: null }],
    moreFiles: 0,
    reply: `msg_${commit}`,
  });
  const screenshots = {
    ...space,
    title: "Temp-Claude desktop",
    project: {
      files: 3,
      changes: [
        change("c3", shots[2] as string, "2026-11-14T05:10:00Z"),
        change("c2", shots[1] as string, "2026-11-14T04:39:00Z"),
        change("c1", shots[0] as string, "2026-11-14T04:31:00Z"),
      ],
    },
  } as unknown as Space;

  /** A store of these files whose server makes the pictures' small copies. */
  function picturing(files: Record<string, string>) {
    const store = storeWith(files);
    const asked: string[] = [];
    (store as { projectPicture: Store["projectPicture"] }).projectPicture = async (
      _spaceId,
      path,
      edge,
    ) => {
      asked.push(`${edge} ${path}`);
      return { bytes: new Uint8Array([1, 2, 3]), type: "image/webp" };
    };
    return { store, asked };
  }

  it("opens a space of screenshots on Media, newest first, from the server's small copies", async () => {
    const { store, asked } = picturing(Object.fromEntries(shots.map((path) => [path, "png"])));
    await render(
      <UniverseSheet
        store={store}
        space={screenshots}
        selfId="per_arjun"
        title="Temp-Claude desktop"
        open
        onClose={() => undefined}
      />,
    );
    expect(await screen.findByTestId("universe-media")).toBeOnTheScreen();
    expect(
      screen.getAllByTestId(/^universe-media-claude/).map((square) => square.props["testID"]),
    ).toEqual([
      "universe-media-claude-desktop-screenshot-3.png",
      "universe-media-claude-desktop-screenshot-2.png",
      "universe-media-claude-desktop-screenshot.png",
    ]);
    expect(screen.getByRole("tab", { name: "Media, 3" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Pages, 0" })).not.toBeSelected();
    await waitFor(() => expect(asked).toHaveLength(3));
    expect(asked.every((each) => each.startsWith("small "))).toBe(true);
    // Pages is there with nothing in it, and says what would be.
    await userEvent.press(screen.getByRole("tab", { name: "Pages, 0" }));
    expect(await screen.findByTestId("universe-pages-empty")).toHaveTextContent(
      /^No pages here yet/,
    );
  });

  it("opens on Pages at the start page, with chips for the notes beside it", async () => {
    const { store } = picturing({
      ".chips/index.html": "<h1>Arjun's health</h1>",
      ".chips/run.json": '{"run": "python3 app/server.py"}',
      "lab-results.md": "# Lab results",
      "web/home.html": "<h1>Home</h1>",
      "web/assets/icon-180.png": "png",
    });
    await open(store);
    expect(await screen.findByTestId("universe-page-chips")).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Pages, 2" })).toBeSelected();
    // The app's own icon is a part of its pages, not Media.
    expect(screen.getByRole("tab", { name: "Media, 0" })).toBeOnTheScreen();
    expect(screen.getByRole("tab", { name: "Space page" })).toBeSelected();
    await userEvent.press(screen.getByRole("tab", { name: "lab-results.md" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "lab-results.md" })).toBeSelected());
    expect(screen.getByRole("tab", { name: "Space page" })).not.toBeSelected();
  });
});

describe("Files under Phone (ADR 0227's addendum of 14 November 2026)", () => {
  const script = '"""Control the house\'s Chromecast TVs."""\nimport sys\n';
  const tvControl = {
    ...space,
    title: "Tv control",
    project: {
      files: 1,
      changes: [
        {
          commit: "c1",
          before: null,
          by: "agt_hello",
          byKind: "agent",
          at: "2026-11-07T08:40:00Z",
          seq: 1,
          message: "I can control your Kitchen TV from this chat now.",
          files: [{ path: "tv.py", added: 101, removed: 0 }],
          moreFiles: 0,
        },
      ],
    },
  } as unknown as Space;
  const sheet = (store: Store, of: Space = tvControl) => (
    <UniverseSheet
      store={store}
      space={of}
      selfId="per_arjun"
      title={of.title ?? ""}
      open
      onClose={() => undefined}
    />
  );

  it("opens a space whose only file is a script on Files, and the script on its own page", async () => {
    await render(sheet(storeWith({ "tv.py": script })));
    const row = await screen.findByTestId("universe-file-tv.py");
    expect(screen.getByRole("tab", { name: "Files, 1" })).toBeSelected();
    expect(screen.getByRole("tab", { name: "Media, 0" })).not.toBeSelected();
    expect(screen.getByRole("tab", { name: "Pages, 0" })).not.toBeSelected();
    // Its size and the change that last named it, under its name.
    expect(row).toHaveTextContent(new RegExp(`^tv\\.py${script.length} bytes · .+ · `));
    await userEvent.press(row);
    expect(await screen.findByTestId("project-file-words")).toHaveTextContent(/Chromecast TVs/);
    // Back is Files' list, where the file was.
    await userEvent.press(screen.getByTestId("room-sheet-file-back"));
    expect(await screen.findByTestId("universe-file-tv.py")).toBeOnTheScreen();
  });

  it("lists every file under its folder and opens a document of Pages on Pages", async () => {
    const store = storeWith({
      ".chips/index.html": "<h1>Arjun's health</h1>",
      ".chips/run.json": '{"run": "python3 app/server.py"}',
      "lab-results.md": "# Lab results",
      "app/server.py": "print(1)",
      "web/home.html": "<h1>Home</h1>",
    });
    await open(store);
    expect(await screen.findByTestId("universe-page-chips")).toBeOnTheScreen();
    // Everything but .chips: the app's code and pages too.
    await userEvent.press(screen.getByRole("tab", { name: "Files, 3" }));
    expect(await screen.findByTestId("universe-files")).toBeOnTheScreen();
    expect(screen.getAllByTestId(/^universe-file-/).map((row) => row.props["testID"])).toEqual([
      "universe-file-lab-results.md",
      "universe-file-app/server.py",
      "universe-file-web/home.html",
    ]);
    expect(screen.getByText("app/")).toBeOnTheScreen();
    expect(screen.getByText("web/")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("universe-file-lab-results.md"));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Pages, 2" })).toBeSelected());
    expect(screen.getByRole("tab", { name: "lab-results.md" })).toBeSelected();
  });

  it("draws a picture's row from the server's small copy", async () => {
    const store = storeWith({ "shot.png": "png", "notes.txt": "hello" });
    const asked: string[] = [];
    (store as { projectPicture: Store["projectPicture"] }).projectPicture = async (
      _id,
      path,
      edge,
    ) => {
      asked.push(`${edge} ${path}`);
      return { bytes: new Uint8Array([1, 2, 3]), type: "image/webp" };
    };
    await open(store);
    expect(await screen.findByRole("tab", { name: "Pages, 1" })).toBeSelected();
    await userEvent.press(screen.getByRole("tab", { name: "Files, 2" }));
    expect(await screen.findByTestId("universe-file-shot.png")).toBeOnTheScreen();
    await waitFor(() => expect(asked).toContain("small shot.png"));
    expect(screen.getByTestId("universe-file-notes.txt")).toBeOnTheScreen();
  });
});

describe("Universe in the column beside a room (ADR 0276)", () => {
  const sheet = () => (
    <UniverseSheet
      store={storeWith({ "main.py": "print(1)" })}
      space={space}
      selfId="per_arjun"
      title="Terra Fab Research"
      open
      onClose={() => undefined}
    />
  );

  it("stands its tabs on the name's line on a wide sheet", async () => {
    await render(sheet());
    expect(within(screen.getByTestId("universe-head")).getByTestId("universe-tabs")).toBeTruthy();
  });

  it("stands its tabs under the name in the column, where on its line they ran over it", async () => {
    await render(<SheetDock.Provider value={420}>{sheet()}</SheetDock.Provider>);
    expect(within(screen.getByTestId("universe-head")).queryByTestId("universe-tabs")).toBeNull();
    expect(screen.getByTestId("universe-tabs")).toBeOnTheScreen();
  });
});
