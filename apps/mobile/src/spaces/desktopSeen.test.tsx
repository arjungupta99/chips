/**
 * What the phone keeps of each space's Desktop tab (ADR 0227's addendum of 17 November 2026): since
 * when, and the rows it has shown there.
 */

import type { ProjectChange, Universe } from "@chipschat/core";
import { act, renderHook } from "@testing-library/react-native";
import { desktopSeenOf, forgetDesktopSeen, loadDesktopSeen, useDesktopNews } from "./desktopSeen";

const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { desktopSeen: "desktop.seen" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

const SINCE = "2026-11-17T12:00:00.000Z";
const program: Universe = { program: { run: "npm run dev" } };
const brought: ProjectChange = {
  commit: "b".repeat(40),
  before: null,
  by: "agt_pavel",
  byKind: "agent",
  at: "2026-11-17T13:00:00.000Z",
  seq: 2,
  message: "Game of life runs",
  files: [{ path: ".chips/run.json", added: 3, removed: 0 }],
  moreFiles: 0,
};

beforeEach(() => {
  mockSettings.clear();
  forgetDesktopSeen();
});

describe("what the phone keeps of Desktop", () => {
  it("starts keeping at its first reading, and says so, so what Desktop has then counts as seen", async () => {
    await loadDesktopSeen(() => new Date(SINCE));
    expect(desktopSeenOf("sp_1")).toEqual({ since: SINCE, rows: [] });
    expect(JSON.parse(mockSettings.get("desktop.seen") ?? "{}")).toEqual({
      since: SINCE,
      spaces: {},
    });
  });

  it("reads back what it kept, and drops what isn't a row", async () => {
    mockSettings.set(
      "desktop.seen",
      JSON.stringify({ since: SINCE, spaces: { sp_1: ["page", "folder"] } }),
    );
    await loadDesktopSeen(() => new Date("2026-12-01T00:00:00.000Z"));
    expect(desktopSeenOf("sp_1")).toEqual({ since: SINCE, rows: ["page"] });
  });

  it("starts again over something it can't read", async () => {
    mockSettings.set("desktop.seen", "{nonsense");
    await loadDesktopSeen(() => new Date(SINCE));
    expect(desktopSeenOf("sp_1")?.since).toBe(SINCE);
  });

  it("is lit for a new row until Desktop is opened, then keeps the row as seen", async () => {
    await loadDesktopSeen(() => new Date(SINCE));
    const { result } = await renderHook(() =>
      useDesktopNews("sp_1", program, [brought], "per_arjun"),
    );
    expect(result.current.news).toEqual(["program"]);
    await act(async () => result.current.opened());
    expect(result.current.news).toEqual([]);
    expect(JSON.parse(mockSettings.get("desktop.seen") ?? "{}").spaces).toEqual({
      sp_1: ["program"],
    });
  });

  it("is dark until the record has been read", async () => {
    const { result } = await renderHook(() =>
      useDesktopNews("sp_1", program, [brought], "per_arjun"),
    );
    expect(result.current.news).toEqual([]);
  });
});
