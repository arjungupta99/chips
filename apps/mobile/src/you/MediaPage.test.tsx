/**
 * Media on this phone (ADR 0159): what the phone keeps, one section per space, biggest first, and
 * Other last; a photo opens in the viewer over its section's deck and a file in Quick Look; a
 * section's Delete, the select bar's Delete and Clear all each ask, then let go of what they name
 * and nothing else. The disk is faked here (`spaces/local`), and so is the viewer.
 */

import type { Line, Space, Store } from "@chipschat/core";
import { render as renderBare, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Image } from "expo-image";
import type { ReactElement, ReactNode } from "react";
import { Alert, type AlertButton } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { FileService } from "../spaces/files";
import type { KeptFile } from "../spaces/local";
import { MediaPage } from "./MediaPage";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockPushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: (to: string) => mockPushed.push(to),
    dismissTo: (to: string) => mockPushed.push(`back to ${to}`),
  }),
  // The bar's right-hand item, drawn where a test can press it.
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
}));
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));
jest.mock("../spaces/RowAvatar", () => ({
  RowAvatar: () => null,
}));
const mockDisk: { files: KeptFile[]; forgot: string[][]; cleared: number; previewed: string[] } = {
  files: [],
  forgot: [],
  cleared: 0,
  previewed: [],
};
jest.mock("../spaces/local", () => ({
  keptFiles: async () => mockDisk.files,
  forgetKept: async (ids: readonly string[]) => {
    mockDisk.forgot.push([...ids]);
    mockDisk.files = mockDisk.files.filter(
      (file) => !ids.some((id) => file.name.startsWith(`${id}-`)),
    );
  },
  clearKept: async () => {
    mockDisk.cleared += 1;
    mockDisk.files = [];
  },
  previewLocally: async (uri: string) => {
    mockDisk.previewed.push(uri);
  },
}));
/*
 * The viewer's host, faked: a tile that opens hands the host its picture and its deck, and the
 * fake draws what it was handed, with Go to message and Close.
 */
jest.mock("../media/MediaViewer", () => {
  const react = require("react");
  const { Pressable: Press, Text: Words, View: Box } = require("react-native");
  const Host = react.createContext(undefined);
  return {
    MediaProvider: ({
      children,
      onGoTo,
    }: {
      children: ReactNode;
      onGoTo: (lineId: string) => void;
    }) => {
      const [opening, setOpening] = react.useState(undefined);
      return (
        <Host.Provider value={setOpening}>
          {children}
          {opening === undefined ? null : (
            <Box testID="viewer">
              <Words testID="viewer-deck">
                {opening.deck
                  .map((item: { attachment: { id: string } }) => item.attachment.id)
                  .join(",")}
              </Words>
              <Words testID="viewer-at">{opening.attachmentId}</Words>
              <Words testID="viewer-thumb">{opening.thumb}</Words>
              <Words testID="viewer-corners">
                {[
                  opening.corners.topLeft,
                  opening.corners.topRight,
                  opening.corners.bottomRight,
                  opening.corners.bottomLeft,
                ].join(",")}
              </Words>
              <Press
                accessibilityRole="button"
                accessibilityLabel="Go to message"
                onPress={() => onGoTo(opening.lineId)}
              />
              <Press
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setOpening(undefined)}
              />
            </Box>
          )}
        </Host.Provider>
      );
    },
    useViewerTile: (lineId: string | undefined, attachmentId: string, corners: unknown) => {
      const open = react.useContext(Host);
      return {
        ref: react.useRef(null),
        hidden: false,
        open:
          lineId === undefined
            ? undefined
            : (thumb: string | undefined, deck: unknown) =>
                open({ lineId, attachmentId, thumb, deck, corners }),
      };
    },
  };
});

// ---------------------------------------------------------------------------------------------

const MB = 1024 * 1024;

const photo = (id: string) => ({ id, filename: `${id}.jpg`, mimeType: "image/jpeg", byteSize: 1 });
const pdf = (id: string) => ({
  id,
  filename: `${id}.pdf`,
  mimeType: "application/pdf",
  byteSize: 1,
});

function line(id: string, minute: number, attachments: ReturnType<typeof photo>[]): Line {
  return {
    id,
    seq: minute,
    kind: "text",
    authorId: "per_arjun",
    authorKind: "person",
    text: id,
    ts: new Date(Date.UTC(2026, 9, 13, 10, minute)).toISOString(),
    attachments,
  } as Line;
}

function space(id: string, title: string, lines: Line[]): Space {
  return {
    id,
    kind: "group",
    title,
    members: ["per_arjun"],
    roles: {},
    state: "open",
    lastEventSeq: lines.length,
    lines,
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
  } as Space;
}

const POMODORO = space("spc_pomodoro", "Pomodoro Timer", [
  line("ln_1", 1, [photo("att_ring"), pdf("att_spec")]),
  line("ln_2", 2, [photo("att_desk")]),
  // Sent, and never opened on this phone: in the space's own Media, not in Media on this phone.
  line("ln_3", 3, [photo("att_fresh")]),
]);
const CHESS = space("spc_chess", "Chess Game", [line("ln_9", 9, [photo("att_board")])]);
const hum = {
  id: "att_hum",
  filename: "att_hum.m4a",
  mimeType: "audio/mp4",
  byteSize: 1,
  durationMs: 14_000,
};
const NOTES = space("spc_notes", "Notes", [
  line("ln_20", 20, [pdf("att_memo")]),
  line("ln_21", 21, [hum as ReturnType<typeof photo>]),
]);
const QUIET = space("spc_quiet", "Quiet", []);

const kept = (name: string, size: number): KeptFile => ({
  name,
  uri: `file:///cache/attachments/${name}`,
  size,
});

const DISK: KeptFile[] = [
  kept("att_ring-thumb-thumb.webp", 6 * MB),
  kept("att_desk-thumb-thumb.webp", 5 * MB),
  kept("att_spec-att_spec.pdf", 7 * MB),
  kept("att_board-att_board.jpg", 2 * MB),
  kept("att_lost-thumb-thumb.webp", 1 * MB),
];

function fakeStore(): Store {
  const snapshot = {
    model: { spaces: [POMODORO, CHESS, NOTES, QUIET], lanes: [] },
    directory: { per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" } },
    spaceIcons: new Map(),
  };
  return { getSnapshot: () => snapshot } as unknown as Store;
}

const thumb = jest.fn(async (id: string) => `https://chips.test/thumbs/${id}.webp`);
const files = { preview: jest.fn(async () => undefined), thumb } as unknown as FileService;

/** Every alert asked, and the answer: its destructive button, unless a test says keep. */
let asked: { title: string; message: string | undefined }[] = [];
function agreeing() {
  jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons?: AlertButton[]) => {
    asked.push({ title, message });
    buttons?.find((button) => button.style === "destructive")?.onPress?.();
  });
}

beforeEach(() => {
  // expo-image's own disk cache, which Clear all empties too; its stand-in under Jest has no such call.
  Object.assign(Image, { clearDiskCache: async () => true });
  mockPushed.length = 0;
  thumb.mockClear();
  mockDisk.files = [...DISK];
  mockDisk.forgot = [];
  mockDisk.cleared = 0;
  mockDisk.previewed = [];
  asked = [];
  agreeing();
});

afterEach(() => jest.restoreAllMocks());

const page = () => render(<MediaPage store={fakeStore()} files={files} selfId="per_arjun" />);

/** The sections in the order the page draws them, by the act each head carries. */
const sectionKeys = () =>
  screen
    .getAllByTestId(/^media-section-act-/)
    .map((each) => String(each.props["testID"]).slice("media-section-act-".length));

describe("Media on this phone", () => {
  it("shows what is kept, one section per space with its size and count, biggest first, Other last", async () => {
    await page();
    expect(await screen.findByTestId("media-summary")).toHaveTextContent(
      /21 MB.*5 files from 2 spaces/,
    );
    expect(sectionKeys()).toEqual(["spc_pomodoro", "spc_chess", "other"]);
    expect(screen.getByTestId("media-section-spc_pomodoro")).toHaveTextContent(
      /Pomodoro Timer.*18 MB · 3/,
    );
    expect(screen.getByTestId("media-section-other")).toHaveTextContent(/Other.*1 MB · 1/);
  });

  it("opens a photo from its tile on the tile's own picture, over its section's photos, newest first (ADR 0161)", async () => {
    await page();
    await userEvent.press(await screen.findByRole("button", { name: "Open att_ring.jpg" }));
    expect(screen.getByTestId("viewer-deck")).toHaveTextContent("att_desk,att_ring");
    expect(screen.getByTestId("viewer-at")).toHaveTextContent("att_ring");
    // The thumbnail the tile draws, from the phone: the flight's first frame, with nothing fetched.
    expect(screen.getByTestId("viewer-thumb")).toHaveTextContent(
      "file:///cache/attachments/att_ring-thumb-thumb.webp",
    );
    await userEvent.press(screen.getByRole("button", { name: "Go to message" }));
    expect(mockPushed).toEqual(["/spaces/spc_pomodoro?at=line:ln_1"]);
  });

  it("flies from the tile's own corners: a section's outer ones round, the rest square (ADR 0161)", async () => {
    await page();
    // Pomodoro's one row, newest first: att_desk at its left end, att_ring inside it.
    await userEvent.press(await screen.findByRole("button", { name: "Open att_desk.jpg" }));
    expect(screen.getByTestId("viewer-corners")).toHaveTextContent("12,0,0,12");
    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    await userEvent.press(screen.getByRole("button", { name: "Open att_ring.jpg" }));
    expect(screen.getByTestId("viewer-corners")).toHaveTextContent("0,0,0,0");
  });

  it("opens any other file in Quick Look, from where the phone keeps it", async () => {
    await page();
    await userEvent.press(await screen.findByRole("button", { name: "Open att_spec.pdf" }));
    expect(mockDisk.previewed).toEqual(["file:///cache/attachments/att_spec-att_spec.pdf"]);
    expect(screen.queryByTestId("viewer")).toBeNull();
  });

  it("deletes a space's files from this phone having asked, and no other space's", async () => {
    await page();
    await userEvent.press(await screen.findByTestId("media-section-act-spc_pomodoro"));
    expect(asked).toEqual([
      {
        title: "Delete 18 MB from this phone?",
        message:
          "Pomodoro Timer's 3 photos, videos and files stay in the space. They come back the next time they're opened.",
      },
    ]);
    expect(mockDisk.forgot).toEqual([["att_desk", "att_spec", "att_ring"]]);
    await waitFor(() => expect(sectionKeys()).toEqual(["spc_chess", "other"]));
    expect(screen.getByTestId("media-summary")).toHaveTextContent(/3 MB.*2 files from 1 space/);
  });

  it("keeps them when the ask is answered Keep them", async () => {
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    await page();
    await userEvent.press(await screen.findByTestId("media-section-act-spc_chess"));
    expect(mockDisk.forgot).toEqual([]);
  });

  it("picks files to delete from Select, says how many and how much, and lets only those go", async () => {
    await page();
    await userEvent.press(await screen.findByRole("button", { name: "Select" }));
    expect(screen.queryByTestId("media-pick-bar")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "att_ring.jpg" }));
    await userEvent.press(screen.getByRole("button", { name: "att_board.jpg" }));
    expect(screen.getByRole("button", { name: "att_ring.jpg" })).toBeSelected();
    expect(screen.getByTestId("media-pick-bar")).toHaveTextContent(/2 selected · 8 MB/);
    // Nothing opens while picking, and Clear all waits.
    expect(screen.queryByTestId("viewer")).toBeNull();
    expect(screen.queryByTestId("media-clear-all")).toBeNull();
    await userEvent.press(screen.getByTestId("media-delete-picked"));
    expect(asked).toEqual([
      {
        title: "Delete 2 files from this phone?",
        message: "They stay in their spaces and come back the next time they're opened.",
      },
    ]);
    expect(mockDisk.forgot).toEqual([["att_ring", "att_board"]]);
    // Done picking: Select is back, and what was let go is gone from the page.
    expect(await screen.findByRole("button", { name: "Select" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open att_ring.jpg" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open att_desk.jpg" })).toBeTruthy();
  });

  it("turns each section's Delete into Select all while picking, and back into Deselect all", async () => {
    await page();
    await userEvent.press(await screen.findByRole("button", { name: "Select" }));
    await userEvent.press(screen.getByRole("button", { name: "Select all, Pomodoro Timer" }));
    expect(screen.getByTestId("media-pick-bar")).toHaveTextContent(/3 selected · 18 MB/);
    await userEvent.press(screen.getByRole("button", { name: "Deselect all, Pomodoro Timer" }));
    expect(screen.queryByTestId("media-pick-bar")).toBeNull();
    expect(mockDisk.forgot).toEqual([]);
  });

  it("starts picking from a long press, with that file picked", async () => {
    await page();
    await userEvent.longPress(await screen.findByRole("button", { name: "Open att_board.jpg" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "att_board.jpg" })).toBeSelected();
    expect(screen.getByTestId("media-pick-bar")).toHaveTextContent(/1 selected · 2 MB/);
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("media-pick-bar")).toBeNull();
  });

  it("clears all of it having asked, and says nothing is kept", async () => {
    await page();
    await userEvent.press(await screen.findByTestId("media-clear-all"));
    expect(asked[0]?.title).toBe("Clear 21 MB?");
    expect(mockDisk.cleared).toBe(1);
    expect(await screen.findByTestId("media-nothing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });
});

describe("a space's own Media (ADR 0165)", () => {
  const own = (spaceId = "spc_pomodoro") =>
    render(<MediaPage store={fakeStore()} files={files} selfId="per_arjun" spaceId={spaceId} />);
  const tiles = () =>
    screen
      .getAllByRole("button", { name: /^(Open|Play) / })
      .map((each) => each.props["accessibilityLabel"]);

  it("shows every file the space has, documents too, newest first, and how much is on this phone", async () => {
    await own();
    expect(await screen.findByTestId("media-summary")).toHaveTextContent(
      /18 MB.*On this phone · 4 photos, videos and files/,
    );
    // The photo never opened here is here, and so is the PDF; the bigger of a line's two first.
    expect(tiles()).toEqual([
      "Open att_fresh.jpg",
      "Open att_desk.jpg",
      "Open att_spec.pdf",
      "Open att_ring.jpg",
    ]);
    // One space, under the page's own head: no section head, and no other space.
    expect(screen.queryAllByTestId(/^media-section-/)).toEqual([]);
    // What the phone keeps draws itself; a photo it does not is fetched, as a room's tile is, and a
    // document, which has no thumbnail, is not asked for one.
    await waitFor(() => expect(thumb).toHaveBeenCalledWith("att_fresh"));
    expect(thumb).toHaveBeenCalledTimes(1);
  });

  it("opens a photo the phone had nothing of on the thumbnail its tile fetched, over the space's photos", async () => {
    await own();
    await waitFor(() => expect(thumb).toHaveBeenCalled());
    await userEvent.press(await screen.findByRole("button", { name: "Open att_fresh.jpg" }));
    expect(screen.getByTestId("viewer-deck")).toHaveTextContent("att_fresh,att_desk,att_ring");
    expect(screen.getByTestId("viewer-thumb")).toHaveTextContent(
      "https://chips.test/thumbs/att_fresh.webp",
    );
    // Go to message goes back to the room under this page, at the line, rather than a second one.
    await userEvent.press(screen.getByRole("button", { name: "Go to message" }));
    expect(mockPushed).toEqual(["back to /spaces/spc_pomodoro?at=line:ln_3"]);
  });

  it("opens a document it keeps in Quick Look from this phone", async () => {
    await own();
    await userEvent.press(await screen.findByRole("button", { name: "Open att_spec.pdf" }));
    expect(mockDisk.previewed).toEqual(["file:///cache/attachments/att_spec-att_spec.pdf"]);
    expect(screen.queryByTestId("viewer")).toBeNull();
  });

  it("marks a voice note by its length, and opens it and a document it doesn't keep in Quick Look from the server", async () => {
    await own("spc_notes");
    expect(await screen.findByRole("button", { name: "Open att_hum.m4a" })).toHaveTextContent(
      "0:14",
    );
    await userEvent.press(screen.getByRole("button", { name: "Open att_hum.m4a" }));
    await userEvent.press(screen.getByRole("button", { name: "Open att_memo.pdf" }));
    expect(files.preview).toHaveBeenCalledWith(expect.objectContaining({ id: "att_hum" }));
    expect(files.preview).toHaveBeenCalledWith(expect.objectContaining({ id: "att_memo" }));
    expect(screen.queryByTestId("viewer")).toBeNull();
    // Neither has a thumbnail to ask for.
    expect(thumb).not.toHaveBeenCalled();
  });

  it("deletes the space's files from this phone having asked, and still shows them", async () => {
    await own();
    await userEvent.press(await screen.findByTestId("media-space-act"));
    expect(asked).toEqual([
      {
        title: "Delete 18 MB from this phone?",
        message:
          "Pomodoro Timer's photos, videos and files stay in the space. They come back the next time they're opened.",
      },
    ]);
    expect(mockDisk.forgot).toEqual([["att_fresh", "att_desk", "att_spec", "att_ring"]]);
    await waitFor(() =>
      expect(screen.getByTestId("media-summary")).toHaveTextContent(
        /0 KB.*On this phone · 4 photos, videos and files/,
      ),
    );
    // Nothing of them on the phone now: no Delete, every tile still there, each fetched again.
    expect(screen.queryByTestId("media-space-act")).toBeNull();
    expect(tiles()).toHaveLength(4);
    await waitFor(() => expect(thumb).toHaveBeenCalledWith("att_ring"));
    // Chess's board, another space's, is still kept.
    expect(mockDisk.files.map((file) => file.name)).toContain("att_board-att_board.jpg");
  });

  it("picks from Select, its head's Delete turned Select all, and lets only the picked go", async () => {
    await own();
    await userEvent.press(await screen.findByRole("button", { name: "Select" }));
    await userEvent.press(screen.getByRole("button", { name: "att_desk.jpg" }));
    expect(screen.getByTestId("media-pick-bar")).toHaveTextContent(/1 selected · 5 MB/);
    await userEvent.press(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByTestId("media-pick-bar")).toHaveTextContent(/4 selected · 18 MB/);
    await userEvent.press(screen.getByRole("button", { name: "Deselect all" }));
    await userEvent.press(screen.getByRole("button", { name: "att_spec.pdf" }));
    await userEvent.press(screen.getByTestId("media-delete-picked"));
    expect(asked[0]?.title).toBe("Delete 1 file from this phone?");
    expect(mockDisk.forgot).toEqual([["att_spec"]]);
  });

  it("says so where nothing has been sent in the space", async () => {
    await own("spc_quiet");
    expect(await screen.findByTestId("media-nothing")).toHaveTextContent(
      "No photos, videos or files in this space yet.",
    );
    expect(screen.queryByRole("button", { name: "Select" })).toBeNull();
  });
});
