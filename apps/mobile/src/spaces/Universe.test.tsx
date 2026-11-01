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
} from "@testing-library/react-native";
import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
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
    expect(await screen.findByTestId("page-sheet")).toBeOnTheScreen();
    expect(screen.getByTestId("universe-orbit")).toBeOnTheScreen();
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

  it("says when nothing opens here or on the Mac yet", async () => {
    await open(storeWith({ "main.py": "print(1)" }));
    expect(await screen.findByText("Nothing here opens on the phone yet.")).toBeOnTheScreen();
    await desktop();
    await waitFor(() =>
      expect(screen.getByText("Nothing here opens on your Mac yet.")).toBeOnTheScreen(),
    );
    expect(screen.getByTestId("universe-open-folder")).toBeOnTheScreen();
  });
});
