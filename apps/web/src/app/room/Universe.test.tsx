/**
 * Universe's Media, Pages and Files on the web and the Mac (ADR 0227's addenda of 13 and 14
 * November 2026), as on the phone: the project's pictures as squares opening in the viewer, the
 * start page and the documents beside it, and every file under its folder, each opening where it
 * belongs.
 */

import type { ProjectChange, Space } from "@chipschat/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectActions } from "./Project.tsx";
import { UniversePage } from "./Universe.tsx";
import { useUniverseCall } from "./universeSeen.ts";

afterEach(cleanup);

const change = (commit: string, path: string, at: string): ProjectChange => ({
  commit,
  before: null,
  by: "agt_jacob",
  byKind: "agent",
  at,
  seq: 1,
  message: `Kept ${path}`,
  files: [{ path, added: null, removed: null }],
  moreFiles: 0,
});

const SHOTS = [
  "claude-desktop-screenshot.png",
  "claude-desktop-screenshot-2.png",
  "claude-desktop-screenshot-3.png",
] as const;

function spaceWith(changes: readonly ProjectChange[], id = "spc_1"): Space {
  return {
    id,
    title: "Temp-Claude desktop",
    roles: {},
    project: { files: changes.length, changes },
  } as unknown as Space;
}

/** A project of these files whose server makes the pictures' small copies, saying what it asked. */
function projectOf(files: Readonly<Record<string, string>>) {
  const asked: string[] = [];
  const types: Readonly<Record<string, string>> = {
    png: "image/png",
    md: "text/markdown",
    html: "text/html",
    py: "text/x-python",
  };
  const typeOf = (path: string) => types[path.split(".").pop() ?? ""] ?? "text/plain";
  const project: ProjectActions = {
    files: async () => ({
      at: "c".repeat(40),
      files: Object.keys(files).map((path) => ({
        path,
        bytes: files[path]?.length ?? 0,
        type: typeOf(path),
      })),
    }),
    file: async (path) => {
      const text = files[path];
      if (text === undefined) throw new Error("That file isn't in the project.");
      return { bytes: new TextEncoder().encode(text), type: typeOf(path) };
    },
    history: async (path) => ({ path, versions: [] }),
    change: async () => {
      throw new Error("no such change");
    },
    undo: async () => {
      throw new Error("no such change");
    },
    page: async (path) => `<h1>${path}</h1>`,
    pageUrl: async () => undefined,
    picture: async (path, edge) => {
      asked.push(`${edge} ${path}`);
      return { bytes: new Uint8Array([1, 2, 3]), type: "image/webp", width: 2560, height: 1440 };
    },
    universe: async () => {
      const { readUniverse } = await import("@chipschat/core");
      return readUniverse(
        {
          projectFiles: project.files,
          projectFile: (_id: string, path: string) => project.file(path),
        } as never,
        "spc_1",
      );
    },
  };
  return { project, asked };
}

function open(project: ProjectActions, space: Space) {
  render(
    <UniversePage
      titleId="universe-title"
      space={space}
      directory={{} as never}
      selfId="usr_arjun"
      title={space.title ?? ""}
      project={project}
      onBack={() => undefined}
    />,
  );
}

describe("Media, Pages and Files on the web and the Mac", () => {
  it("opens a space of screenshots on Media, newest first, from the server's small copies", async () => {
    const { project, asked } = projectOf(Object.fromEntries(SHOTS.map((path) => [path, "png"])));
    open(
      project,
      spaceWith([
        change("c3", SHOTS[2], "2026-11-14T05:10:00Z"),
        change("c2", SHOTS[1], "2026-11-14T04:39:00Z"),
        change("c1", SHOTS[0], "2026-11-14T04:31:00Z"),
      ]),
    );
    expect(await screen.findByTestId("universe-media")).toBeTruthy();
    expect(
      screen.getAllByTestId(/^universe-media-claude/).map((square) => square.dataset["testid"]),
    ).toEqual([
      "universe-media-claude-desktop-screenshot-3.png",
      "universe-media-claude-desktop-screenshot-2.png",
      "universe-media-claude-desktop-screenshot.png",
    ]);
    expect(screen.getByRole("tab", { name: "Media, 3" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    await waitFor(() => expect(asked).toHaveLength(3));
    expect(asked.every((each) => each.startsWith("small "))).toBe(true);
    // A square opens the viewer on Media's pictures, at the one clicked.
    fireEvent.click(screen.getByTestId("universe-media-claude-desktop-screenshot-2.png"));
    expect((await screen.findByTestId("viewer-count")).textContent).toBe("2 of 3");
  });

  it("marks what came after the change Universe was last opened at", async () => {
    const changes = [
      change("c3", SHOTS[2], "2026-11-14T05:10:00Z"),
      change("c2", SHOTS[1], "2026-11-14T04:39:00Z"),
      change("c1", SHOTS[0], "2026-11-14T04:31:00Z"),
    ];
    // Opened here at c2, then again once c3 came: what came after c2 is new this time.
    const room = renderHook(
      ({ space }: { space: Space }) => useUniverseCall(space.id, space.project, "usr_arjun"),
      { initialProps: { space: spaceWith(changes.slice(1), "spc_seen") } },
    );
    act(() => room.result.current.opened());
    room.rerender({ space: spaceWith(changes, "spc_seen") });
    act(() => room.result.current.opened());
    const { project } = projectOf(Object.fromEntries(SHOTS.map((path) => [path, "png"])));
    open(project, spaceWith(changes, "spc_seen"));
    expect(await screen.findByTestId(`universe-new-${SHOTS[2]}`)).toBeTruthy();
    expect(screen.queryByTestId(`universe-new-${SHOTS[1]}`)).toBeNull();
  });

  it("opens a space whose only file is a script on Files, and the script on its own page", async () => {
    const script = '"""Control the house\'s Chromecast TVs."""\nimport sys\n';
    const { project } = projectOf({ "tv.py": script });
    open(project, spaceWith([change("c1", "tv.py", "2026-11-07T08:40:00Z")]));
    const row = await screen.findByTestId("universe-file-tv.py");
    expect(screen.getByRole("tab", { name: "Files, 1" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(row.textContent).toMatch(new RegExp(`^tv\\.py${script.length} bytes · .+ · `));
    fireEvent.click(row);
    expect((await screen.findByTestId("project-file-words")).textContent).toMatch(/Chromecast/);
    // Back is Universe, on Files, on the file's row.
    fireEvent.click(screen.getByTestId("room-sheet-file-back"));
    expect(document.activeElement).toBe(await screen.findByTestId("universe-file-tv.py"));
  });

  it("opens on Pages at Open page, and lists every file under its folder", async () => {
    const { project } = projectOf({
      ".chips/index.html": "<h1>Arjun's health</h1>",
      ".chips/run.json": '{"run": "python3 app/server.py"}',
      "lab-results.md": "# Lab results",
      "app/server.py": "print(1)",
      "web/home.html": "<h1>Home</h1>",
    });
    open(project, spaceWith([]));
    const pages = await screen.findByTestId("universe-documents");
    expect(screen.getByRole("tab", { name: "Pages, 2" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(within(pages).getByTestId("universe-open-page")).toBeTruthy();
    expect(within(pages).getByTestId("universe-document-lab-results.md")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Files, 3" }));
    expect(await screen.findByTestId("universe-files")).toBeTruthy();
    expect(screen.getAllByTestId(/^universe-file-/).map((row) => row.dataset["testid"])).toEqual([
      "universe-file-lab-results.md",
      "universe-file-app/server.py",
      "universe-file-web/home.html",
    ]);
    expect(screen.getByText("app/")).toBeTruthy();
    // A note opens in the page dialog, as Pages opens it.
    fireEvent.click(screen.getByTestId("universe-file-lab-results.md"));
    expect(await screen.findByTestId("project-page-view")).toBeTruthy();
  });

  it("says what would be on a shelf that has nothing yet", async () => {
    const { project } = projectOf({ "notes.txt": "hello" });
    open(project, spaceWith([]));
    expect(await screen.findByTestId("universe-documents")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Media, 0" }));
    expect((await screen.findByTestId("universe-media-empty")).textContent).toMatch(
      /^No pictures yet/,
    );
  });
});
