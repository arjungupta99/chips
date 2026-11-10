/**
 * The program's banner over a page in Universe, and the sheet a tapped link brings up (ADR 0227's
 * addendum of 9 November 2026): Run and Stop on the banner, a link tapped while the program isn't
 * running asking first, one tapped while it runs opening at once.
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
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import { answersWithin } from "./answers";
import { UniverseSheet } from "./Universe";

jest.mock("./answers", () => ({ answersWithin: jest.fn(async () => true) }));

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

const LABS = "https://mac-mini.example.ts.net:8443/overview.html";

const space = (id = "sp_1") =>
  ({
    id,
    title: "Health",
    kind: "group",
    members: ["per_arjun", "per_dana"],
    roles: { per_arjun: "owner", per_dana: "member" },
    state: "open",
    lastEventSeq: 1,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    project: { files: 2, changes: [] },
  }) as unknown as Space;

/** The Health space: a start page that links to its app, and a program that serves it. */
function healthStore(running?: unknown) {
  const files: Record<string, string> = {
    ".chips/index.html": `<a href="${LABS}">Labs</a>`,
    ".chips/run.json": '{"run": "python3 app/server.py"}',
  };
  const store = fakeStore(snapshot());
  const writable = store as {
    projectFiles: Store["projectFiles"];
    projectFile: Store["projectFile"];
    projectPage: Store["projectPage"];
    projectRun: Store["projectRun"];
  };
  writable.projectFiles = async () => ({
    at: "c".repeat(40),
    files: Object.keys(files).map((path) => ({ path, bytes: 1, type: "text/plain" })),
  });
  writable.projectFile = async (_spaceId, path) => {
    const text = files[path];
    if (text === undefined) throw new Error("That file isn't in the project.");
    return { bytes: new TextEncoder().encode(text), type: "text/plain" };
  };
  writable.projectPage = async () => files[".chips/index.html"] ?? "";
  if (running !== undefined) {
    writable.projectRun = async () => ({ macs: 1, run: running }) as never;
  }
  return store as Store & {
    readonly calls: { readonly name: string; readonly args: unknown }[];
    readonly tellRun: (spaceId: string, run: unknown) => void;
  };
}

const open = (store: Store, selfId = "per_arjun", id = "sp_1") =>
  render(
    <UniverseSheet
      store={store}
      space={space(id)}
      selfId={selfId}
      title="Health"
      open
      onClose={() => undefined}
    />,
  );

/** A tap on a link of the page, as iOS hands the web view one. */
async function tapLink(url: string) {
  const view = await screen.findByTestId("page-view", { includeHiddenElements: true });
  const allowed = await act(async () =>
    view.props["onShouldStartLoadWithRequest"]({ url, navigationType: "click", isTopFrame: true }),
  );
  expect(allowed).toBe(false);
}

const RUN = "python3 app/server.py";
const said = (run: object) => ({ mac: "Mac mini", said_at: "2026-11-09T20:00:01.000Z", ...run });

let opened: jest.SpyInstance;
beforeEach(() => {
  opened = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  jest.mocked(answersWithin).mockResolvedValue(true);
});
afterEach(() => opened.mockRestore());

describe("the program's banner over the page", () => {
  it("says the program isn't running, with Run, once it knows", async () => {
    await open(healthStore());
    expect(await screen.findByTestId("program-banner-title")).toHaveTextContent(
      "Program isn’t running",
    );
    expect(screen.getByTestId("program-banner-words")).toHaveTextContent(
      "Some links here open only while it runs on your Mac.",
    );
    expect(screen.getByRole("button", { name: "Run program" })).toBeOnTheScreen();
    expect(screen.getByTestId("universe-page")).toBeOnTheScreen();
  });

  it("runs it, turns Run into Stop as it starts and runs, and folds to one row", async () => {
    jest.useFakeTimers();
    try {
      const store = healthStore();
      await open(store);
      await userEvent.press(await screen.findByTestId("program-banner-run"));
      expect(store.calls).toContainEqual({
        name: "runOnMac",
        args: { spaceId: "sp_1", ask: { op: "run", command: RUN } },
      });
      await act(async () => store.tellRun("sp_1", said({ state: "starting", command: RUN })));
      expect(screen.getByTestId("program-banner-title")).toHaveTextContent("Starting on your Mac");
      expect(screen.getByTestId("program-banner-stop")).toBeOnTheScreen();
      expect(screen.queryByTestId("program-banner-run")).toBeNull();
      await act(async () =>
        store.tellRun(
          "sp_1",
          said({ state: "running", command: RUN, since: new Date().toISOString() }),
        ),
      );
      expect(screen.getByTestId("program-banner-title")).toHaveTextContent("Running on your Mac");
      expect(screen.getByTestId("program-banner-words")).toHaveTextContent("Links here open now.");
      await act(async () => jest.advanceTimersByTime(3100));
      expect(screen.queryByTestId("program-banner-words")).toBeNull();
      await userEvent.press(screen.getByTestId("program-banner-stop"));
      expect(store.calls).toContainEqual({
        name: "runOnMac",
        args: { spaceId: "sp_1", ask: { op: "stop" } },
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("tells somebody who isn't the owner whose Mac it runs on, with nothing to press", async () => {
    await open(healthStore(), "per_dana");
    expect(await screen.findByTestId("program-banner-title")).toHaveTextContent(
      "Runs on Arjun’s Mac",
    );
    expect(screen.queryByTestId("program-banner-run")).toBeNull();
    // Their tap opens as it does anywhere: whether it runs isn't theirs to see.
    await tapLink(LABS);
    expect(opened).toHaveBeenCalledWith(LABS);
    expect(screen.queryByTestId("link-ask-title")).toBeNull();
  });
});

describe("a link tapped on the page", () => {
  it("brings up the sheet while the program isn't running, and Open anyway opens it", async () => {
    await open(healthStore());
    await screen.findByTestId("program-banner");
    await tapLink(LABS);
    expect(await screen.findByTestId("link-ask-title")).toHaveTextContent(
      "This link needs the program running",
    );
    expect(screen.getByTestId("link-ask-address")).toHaveTextContent(
      "mac-mini.example.ts.net:8443/overview.html",
    );
    expect(opened).not.toHaveBeenCalled();
    await userEvent.press(screen.getByTestId("link-ask-anyway"));
    await waitFor(() => expect(opened).toHaveBeenCalledWith(LABS));
  });

  it("Run and open runs it, waits for the page to answer, and opens it", async () => {
    const store = healthStore();
    await open(store);
    await screen.findByTestId("program-banner");
    await tapLink(LABS);
    await userEvent.press(await screen.findByTestId("link-ask-go"));
    expect(store.calls).toContainEqual({
      name: "runOnMac",
      args: { spaceId: "sp_1", ask: { op: "run", command: RUN } },
    });
    expect(screen.getByTestId("link-ask-title")).toHaveTextContent("Starting on your Mac");
    expect(screen.queryByTestId("link-ask-anyway")).toBeNull();
    expect(opened).not.toHaveBeenCalled();
    await act(async () => store.tellRun("sp_1", said({ state: "starting", command: RUN })));
    await act(async () =>
      store.tellRun(
        "sp_1",
        said({ state: "running", command: RUN, since: new Date().toISOString() }),
      ),
    );
    await waitFor(() => expect(opened).toHaveBeenCalledWith(LABS));
    expect(jest.mocked(answersWithin)).toHaveBeenCalledWith(LABS, 20_000, expect.anything());
  });

  it("says when the page doesn't answer, and then opens it anyway on a press", async () => {
    jest.mocked(answersWithin).mockResolvedValue(false);
    const store = healthStore();
    await open(store);
    await screen.findByTestId("program-banner");
    await tapLink(LABS);
    await userEvent.press(await screen.findByTestId("link-ask-go"));
    await act(async () =>
      store.tellRun(
        "sp_1",
        said({ state: "running", command: RUN, since: new Date().toISOString() }),
      ),
    );
    expect(await screen.findByText("The page isn’t answering yet")).toBeOnTheScreen();
    expect(opened).not.toHaveBeenCalled();
    await userEvent.press(screen.getByTestId("link-ask-go"));
    await waitFor(() => expect(opened).toHaveBeenCalledWith(LABS));
  });

  it("says so when no Mac heard Run and open", async () => {
    await open(healthStore(), "per_arjun", "sp_nomac");
    await screen.findByTestId("program-banner");
    await tapLink(LABS);
    await userEvent.press(await screen.findByTestId("link-ask-go"));
    expect(await screen.findByText("Your Mac didn’t hear it")).toBeOnTheScreen();
    expect(screen.getByTestId("link-ask-words")).toHaveTextContent(
      "Chips for Mac isn't open, so nothing ran. Open Chips on your Mac and press again.",
    );
    expect(screen.getByTestId("link-ask-anyway")).toBeOnTheScreen();
  });

  it("opens at once while the program runs, with no sheet", async () => {
    await open(
      healthStore(said({ state: "running", command: RUN, since: new Date().toISOString() })),
    );
    expect(await screen.findByTestId("program-banner-title")).toHaveTextContent(
      "Running on your Mac",
    );
    await tapLink(LABS);
    expect(opened).toHaveBeenCalledWith(LABS);
    expect(screen.queryByTestId("link-ask-title")).toBeNull();
  });

  it("says localhost opens only on the Mac, and opens nothing", async () => {
    await open(healthStore());
    await screen.findByTestId("program-banner");
    await tapLink("http://localhost:4173/home.html");
    expect(screen.getByTestId("program-banner-words")).toHaveTextContent(
      "localhost opens only on your Mac.",
    );
    expect(opened).not.toHaveBeenCalled();
    expect(screen.queryByTestId("link-ask-title")).toBeNull();
  });

  it("opens mail as it would anywhere", async () => {
    await open(healthStore());
    await screen.findByTestId("program-banner");
    await tapLink("mailto:dr.gill@example.com");
    expect(opened).toHaveBeenCalledWith("mailto:dr.gill@example.com");
  });
});
