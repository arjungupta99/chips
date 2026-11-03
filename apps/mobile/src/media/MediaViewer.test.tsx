/**
 * The media viewer, opened from a real room (the media viewer proposal, §4.2's list of tests).
 *
 * The stage is mocked (`jest.setup.js`): it draws the item the viewer stands on and carries the
 * stage's props, so these tests page it with `onNext` and `onPrevious`, and close it with
 * `onDismiss`, as a gesture would. What they prove is everything either side of the gesture —
 * which deck a tap opens, what the bars say about the item, which picture stands in for which, and
 * what each of the menu's rows reaches — and none of the motion, which is the simulator's, the
 * emulator's and the Maestro flow's.
 *
 * The room is diagram A's: Scout's clip, Dana's album of six, and Arjun's receipt beside a voice
 * note, then a PDF beside a walkthrough the server never measured. Eight items; the voice note, the
 * PDF and the walkthrough are rows, and not in the deck.
 *
 * The video player is a fake too (`jest.setup.js`): it plays at once when told and says so through
 * the player's own events, and a test moves its clock. So these prove what the viewer asks of the
 * player — play on landing, pause on leaving, where to seek, mute — and what the bars say, and not
 * that a frame was decoded, which the simulator and the emulator show.
 *
 * Every test runs on Jest's clock, not the wall's. The bars' beat, a tile's measure, the room's
 * follow and the bars' three seconds are all timers, and `waitFor`, the `find` queries and
 * `userEvent` move that clock as they wait, so a Mac loaded by other builds takes the same steps
 * as an idle one. On real timers a worker that lost the CPU for a second mid-wait saw `waitFor`'s
 * second run out before the bars it was waiting for were drawn, and the bars' wait failed in 3 of
 * 4 full checks at load 16–23 (1 November 2026).
 */

import type { Attachment, Line as LineModel, Snapshot } from "@chipschat/core";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import * as MediaLibrary from "expo-media-library";
import * as ExpoVideo from "expo-video";
import type { ReactElement } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { FileService, Played, Progress, Viewed } from "../spaces/files";
import { SpaceView } from "../spaces/SpaceView";
import { fakeStore } from "../testing/fixtures";
import { PREVIEW_ONLY } from "./Chrome";
import { CHROME_HIDES_MS, REVEAL_AFTER_MS } from "./MediaViewer";

/** The fake player `jest.setup.js` gives, as far as these tests drive it. */
interface FakePlayer {
  readonly source: { readonly uri: string } | null;
  readonly playing: boolean;
  currentTime: number;
  /** Seconds; what the player says of the video once it is loaded. */
  duration: number;
  /** Where it stands, set without the seek `currentTime` makes. */
  time: number;
  readonly muted: boolean;
  readonly emit: (name: string, payload?: unknown) => void;
  readonly pause: () => void;
  readonly replaceAsync: (source: { readonly uri: string }) => Promise<void>;
}
const video = ExpoVideo as unknown as {
  readonly players: FakePlayer[];
  readonly view: { readonly startPictureInPicture: jest.Mock; readonly enterFullscreen: jest.Mock };
};
/** The viewer's player: the newest made. */
function player(): FakePlayer {
  const made = video.players.at(-1);
  if (made === undefined) throw new Error("No player has been made.");
  return made;
}

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
/** An iPhone 17 Pro on its side: the island and the corners at the sides, a sliver at the foot. */
const IPHONE_ON_ITS_SIDE = {
  frame: { x: 0, y: 0, width: 874, height: 402 },
  insets: { top: 0, left: 62, right: 62, bottom: 20 },
};
/** An 11-inch iPad upright, which is what the `tablet` Playwright project runs in. */
const IPAD = {
  frame: { x: 0, y: 0, width: 834, height: 1194 },
  insets: { top: 24, left: 0, right: 0, bottom: 20 },
};

function photo(id: string, filename: string, over: Partial<Attachment> = {}): Attachment {
  return {
    id,
    filename,
    mimeType: "image/jpeg",
    byteSize: 2_516_582,
    width: 4032,
    height: 3024,
    ...over,
  };
}

const CLIP: Attachment = {
  id: "att_clip",
  filename: "IMG_4410.MOV",
  mimeType: "video/quicktime",
  byteSize: 38_000_000,
  width: 1080,
  height: 1920,
  durationMs: 42_500,
};
const ALBUM = [1, 2, 3, 4, 5, 6].map((n) => photo(`att_site${n}`, `site-0${n}.jpg`));
const RECEIPT = photo("att_receipt", "receipt.jpg", {
  byteSize: 3_250_585,
  width: 3024,
  height: 4032,
});
const VOICE: Attachment = {
  id: "att_voice",
  filename: "voice-note-0914-1126.m4a",
  mimeType: "audio/mp4",
  byteSize: 96_512,
  durationMs: 8400,
};
const PDF: Attachment = {
  id: "att_pdf",
  filename: "invoice.pdf",
  mimeType: "application/pdf",
  byteSize: 4096,
};
/** A video the server never measured: no length, no poster, a row in the room. */
const RAW: Attachment = {
  id: "att_raw",
  filename: "walkthrough.mp4",
  mimeType: "video/mp4",
  byteSize: 5_242_880,
};

function line(over: Partial<LineModel>): LineModel {
  return {
    id: "ln_x",
    seq: 1,
    kind: "text",
    authorId: "per_arjun",
    authorKind: "person",
    text: "",
    ts: new Date().toISOString(),
    ...over,
  };
}

const LINES: readonly LineModel[] = [
  line({
    id: "ln_clip",
    seq: 1,
    authorId: "har_scout",
    authorKind: "harness",
    text: "The clip.",
    attachments: [CLIP],
  }),
  line({
    id: "ln_album",
    seq: 2,
    authorId: "per_dana",
    text: "Photos from the site visit.",
    attachments: ALBUM,
  }),
  line({
    id: "ln_receipt",
    seq: 3,
    text: "The receipt from the hardware store, for Ledger.",
    attachments: [RECEIPT, VOICE],
  }),
  line({
    id: "ln_pdf",
    seq: 4,
    authorId: "har_scout",
    authorKind: "harness",
    text: "The invoice, and the walkthrough.",
    attachments: [PDF, RAW],
  }),
];

function snapshotOf(
  lines: readonly LineModel[],
  thread?: { readonly lines: readonly LineModel[] },
): Snapshot {
  const space = (id: string, held: readonly LineModel[], parent?: string) => ({
    id,
    kind: "room",
    title: "PO-4471",
    members: ["per_arjun", "per_dana", "har_scout"],
    roles: {},
    state: "open",
    lastEventSeq: 9,
    lines: held,
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...(parent === undefined ? {} : { parentSpaceId: parent }),
  });
  return {
    connection: "open",
    link: "direct",
    busy: new Set<string>(),
    receipts: new Map(),
    readState: {},
    directory: {
      per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
      per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
      har_scout: { id: "har_scout", kind: "harness", displayName: "Scout" },
    },
    model: {
      needsYou: [],
      people: {},
      lanes: [],
      spaces: [
        space("sp_1", lines),
        ...(thread === undefined ? [] : [space("sp_thread", thread.lines, "sp_1")]),
      ],
    },
  } as unknown as Snapshot;
}

/** A file service with the thumbnail, the view copy and the file each a separate URI, and a record of what was asked. */
// The viewer's own window is a native view on Android (`ViewerWindow.test.tsx`); here, what it is
// told.
jest.mock("./ViewerWindow", () => ({
  ViewerWindow: (props: {
    statusBarHidden: boolean;
    item?: { kind: string; attachment: { width?: number; height?: number } };
  }) =>
    require("react").createElement(require("react-native").View, {
      testID: "viewer-window",
      statusBarHidden: props.statusBarHidden,
      pinnedWidth: props.item?.kind === "video" ? props.item.attachment.width : 0,
      pinnedHeight: props.item?.kind === "video" ? props.item.attachment.height : 0,
    }),
}));

function fakeFiles(
  over: Partial<FileService> = {},
): FileService & { readonly opened: string[]; readonly viewed: string[] } {
  const opened: string[] = [];
  const viewed: string[] = [];
  return {
    opened,
    viewed,
    upload: async () => {
      throw new Error("not here");
    },
    thumb: async (id) => `file:///thumbs/${id}.webp`,
    file: async (attachment) => `file:///files/${attachment.filename}`,
    view: async (attachment): Promise<Viewed> => {
      viewed.push(attachment.id);
      return { uri: `file:///views/${attachment.id}.webp`, original: false };
    },
    play: async (attachment): Promise<Played> => ({
      uri: `file:///play/${attachment.id}.mp4`,
      beingMade: false,
    }),
    // Through the relay, or from a server from before grants: the download path, unless a test streams.
    streamUrl: async () => undefined,
    open: async (attachment) => {
      opened.push(attachment.filename);
    },
    preview: async () => undefined,
    page: async () => "<!doctype html><p>A page</p>",
    ...over,
  };
}

function room(
  files: FileService,
  snapshot: Snapshot = snapshotOf(LINES),
  spaceId = "sp_1",
  metrics = IPHONE,
): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <SpaceView
        store={fakeStore(snapshot)}
        snapshot={snapshot}
        spaceId={spaceId}
        selfId="per_arjun"
        files={files}
      />
    </SafeAreaProvider>
  );
}

/** Tap a photo's tile, and wait for the viewer to stand on it with its bars come in. */
async function tap(filename: string) {
  await userEvent.press(await screen.findByRole("imagebutton", { name: `Open ${filename}` }));
  await screen.findByTestId("viewer");
  // The bars arrive a beat after the picture, and take no press until they have.
  await waitFor(() =>
    expect(screen.getByTestId("viewer-chrome").props["pointerEvents"]).toBe("box-none"),
  );
}

/** Tap a video's tile or row, and wait for the viewer to stand on it with its bars come in. */
async function tapVideo(filename: string) {
  await userEvent.press(await screen.findByRole("button", { name: `Play ${filename}` }));
  await screen.findByTestId("viewer");
  await waitFor(() =>
    expect(screen.getByTestId("viewer-chrome").props["pointerEvents"]).toBe("box-none"),
  );
}

/** A download the test says the progress of, and ends. */
function slowPlay() {
  let heard: Progress | undefined;
  let arrive: ((played: Played) => void) | undefined;
  return {
    play: (_attachment: Attachment, onProgress?: Progress) =>
      new Promise<Played>((resolve) => {
        heard = onProgress;
        arrive = resolve;
      }),
    say: (received: number, total: number) => act(async () => heard?.(received, total)),
    arrive: (played: Played) => act(async () => arrive?.(played)),
  };
}

/** A touch on the scrubber, at a place on the glass and on the track, as the responder hears it. */
function touch(pageX: number, locationX: number, at: number) {
  const point = {
    touchActive: true,
    startPageX: pageX,
    startPageY: 700,
    startTimeStamp: at,
    currentPageX: pageX,
    currentPageY: 700,
    currentTimeStamp: at,
    previousPageX: pageX,
    previousPageY: 700,
    previousTimeStamp: at,
  };
  return {
    nativeEvent: { pageX, locationX },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: at,
      touchBank: [point],
    },
  };
}

function stage() {
  return screen.getByTestId("stage");
}

function counter(): string {
  return String(screen.getByTestId("viewer-counter").props["children"]).replaceAll(",", "");
}

/** The words a text element holds, however React split them. */
function words(testID: string): string {
  const flatten = (node: unknown): string =>
    Array.isArray(node) ? node.map(flatten).join("") : node == null ? "" : String(node);
  return within(screen.getByTestId(testID))
    .getAllByText(/./)
    .map((text) => flatten(text.props["children"]))
    .join(" | ");
}

async function page(direction: "onNext" | "onPrevious") {
  await act(async () => stage().props[direction]());
}

let scrolled: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  scrolled = jest.spyOn(FlatList.prototype, "scrollToIndex").mockImplementation(() => undefined);
  jest.mocked(MediaLibrary.Asset.create).mockClear();
  jest.mocked(Clipboard.setImageAsync).mockClear();
  video.players.length = 0;
  video.view.startPictureInPicture.mockClear();
  video.view.enterFullscreen.mockClear();
});
afterEach(() => {
  scrolled.mockRestore();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe("the media viewer, opened from a room", () => {
  it("opens on the tapped photo, its place in the deck of the twenty messages around it", async () => {
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    // Eight: the clip, the album of six and the receipt. The voice note and the PDF are rows.
    expect(stage().props["items"].map((item: { id: string }) => item.id)).toEqual([
      "att_clip",
      ...ALBUM.map((each) => each.id),
      "att_receipt",
    ]);
    expect(counter()).toBe("8 of 8");
    expect(words("viewer-caption")).toMatch(
      /^Arjun · Today .+ \| receipt\.jpg · 3\.1 MB · 3024 × 4032$/,
    );
  });

  it("draws the tile's thumbnail first, and the view copy over it once it comes", async () => {
    let arrive: ((viewed: Viewed) => void) | undefined;
    const files = fakeFiles({
      view: () =>
        new Promise<Viewed>((resolve) => {
          arrive = resolve;
        }),
    });
    await render(room(files));
    await tap("receipt.jpg");
    const picture = () => screen.getByTestId("stage-picture-att_receipt");
    expect(picture().props["source"]).toEqual({ uri: "file:///thumbs/att_receipt.webp" });
    await act(async () => arrive?.({ uri: "file:///views/att_receipt.webp", original: false }));
    expect(picture().props["source"]).toEqual({ uri: "file:///views/att_receipt.webp" });
    expect(picture().props["placeholder"]).toEqual({ uri: "file:///thumbs/att_receipt.webp" });
  });

  it("pages both ways, says where in an album an item stands, and stops at the ends", async () => {
    const files = fakeFiles();
    await render(room(files));
    await tap("receipt.jpg");
    await page("onNext");
    expect(counter()).toBe("8 of 8");

    await page("onPrevious");
    expect(counter()).toBe("7 of 8");
    expect(words("viewer-caption")).toMatch(
      /^Dana Ruiz · Today .+ · 6 of 6 in this message \| site-06\.jpg/,
    );
    // The neighbours' view copies are fetched ahead of the swipe; nothing further off is.
    await waitFor(() => expect(files.viewed).toContain("att_site5"));
    expect(files.viewed).not.toContain("att_site3");

    for (let n = 0; n < 8; n += 1) await page("onPrevious");
    expect(counter()).toBe("1 of 8");
    expect(words("viewer-caption")).toContain("IMG_4410.MOV · 0:43 · 36.2 MB");
  });

  it("tells a screen reader what is on the stage, and pages by its swipe", async () => {
    await render(room(fakeFiles()));
    await tap("site-02.jpg");
    const announced = jest.spyOn(AccessibilityInfo, "announceForAccessibility");
    const pages = screen.getByLabelText(/^Photo 3 of 8, site-02\.jpg, from Dana Ruiz, today at /);
    expect(pages.props["accessibilityRole"]).toBe("adjustable");
    await act(async () =>
      pages.props["onAccessibilityAction"]({ nativeEvent: { actionName: "increment" } }),
    );
    expect(counter()).toBe("4 of 8");
    expect(announced).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Photo 4 of 8, site-03\.jpg, from Dana Ruiz, today at /),
    );
  });

  it("opens a thread's deck from a thread, not the room's", async () => {
    const threadLines = [
      line({ id: "ln_t1", seq: 1, attachments: [photo("att_t1", "one.jpg")] }),
      line({
        id: "ln_t2",
        seq: 2,
        authorId: "per_dana",
        attachments: [photo("att_t2", "two.jpg")],
      }),
    ];
    const snapshot = snapshotOf(LINES, { lines: threadLines });
    await render(room(fakeFiles(), snapshot, "sp_thread"));
    await tap("one.jpg");
    expect(counter()).toBe("1 of 2");
  });

  it("hides the tile under the stage once the viewer is up over it and drawn, and closes on a dismiss", async () => {
    await render(room(fakeFiles()));
    const tile = await screen.findByTestId("photo-att_receipt");
    await tap("receipt.jpg");
    // The stage has drawn the tile's thumbnail (the mock says so as it mounts), but not while the
    // modal is still coming: the room would show a hole where the tile was.
    expect(tile).not.toHaveStyle({ opacity: 0 });
    await act(async () => screen.getByTestId("viewer").props["onShow"]());
    await waitFor(() =>
      expect(screen.getByTestId("photo-att_receipt")).toHaveStyle({ opacity: 0 }),
    );
    expect(stage().props["from"]).toBeUndefined(); // No layout under Node to measure: the crossfade.

    await act(async () => stage().props["onDismiss"]());
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
    expect(tile).not.toHaveStyle({ opacity: 0 });
  });

  it("keeps the tile until the stage has drawn a picture, whatever the modal says", async () => {
    // A tile whose thumbnail has not come yet opens the viewer with nothing to draw, and the view
    // copy is slow too.
    const arrivals: ((uri: string) => void)[] = [];
    const files = fakeFiles({
      thumb: (id) =>
        new Promise<string>((resolve) => {
          if (id === "att_receipt") arrivals.push(resolve);
          else resolve(`file:///thumbs/${id}.webp`);
        }),
      view: () => new Promise<Viewed>(() => undefined),
    });
    await render(room(files));
    const tile = await screen.findByTestId("photo-att_receipt");
    await tap("receipt.jpg");
    await act(async () => screen.getByTestId("viewer").props["onShow"]());
    expect(screen.queryByTestId("stage-picture-att_receipt")).toBeNull();
    // Hidden now, the room would show a hole under an empty stage.
    expect(tile).not.toHaveStyle({ opacity: 0 });
    await act(async () => {
      for (const arrive of arrivals) arrive("file:///thumbs/att_receipt.webp");
    });
    expect(screen.getByTestId("stage-picture-att_receipt").props["source"]).toEqual({
      uri: "file:///thumbs/att_receipt.webp",
    });
    await waitFor(() =>
      expect(screen.getByTestId("photo-att_receipt")).toHaveStyle({ opacity: 0 }),
    );
  });

  it("holds a view copy that comes while the picture is in flight until the flight has landed", async () => {
    const { holds } = jest.requireMock("./Stage") as { holds: { opening: boolean } };
    holds.opening = true;
    try {
      const files = fakeFiles();
      await render(room(files));
      await tap("receipt.jpg");
      await waitFor(() => expect(files.viewed).toContain("att_receipt"));
      const picture = () => screen.getByTestId("stage-picture-att_receipt");
      // Fetched, and not yet on the stage: the thumbnail the tile handed over is what is flying.
      expect(picture().props["source"]).toEqual({ uri: "file:///thumbs/att_receipt.webp" });
      await act(async () => stage().props["onOpened"]());
      expect(picture().props["source"]).toEqual({ uri: "file:///views/att_receipt.webp" });
    } finally {
      holds.opening = false;
    }
  });

  it("puts the keyboard away as it opens, from a tile and from a row alike", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    expect(away).toHaveBeenCalled();

    // The field was let go of rather than covered over, so nothing in the room asks for it back as
    // the viewer leaves; that iOS does not hand the caret back either is the simulator's to show.
    const asked = jest.spyOn(TextInput.prototype, "focus");
    await act(async () => stage().props["onDismiss"]());
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
    expect(asked).not.toHaveBeenCalled();

    away.mockClear();
    await tapVideo("walkthrough.mp4");
    expect(away).toHaveBeenCalled();
  });

  it("asks the room to bring a line into view when the item paged to has no tile on the glass", async () => {
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    scrolled.mockClear();
    await page("onPrevious");
    // Under Node no tile can say where it is, so the page that settles asks; newest first, the
    // album is 2, and the room's foot stands before the lines as its own row (`SpaceView.tsx`), so
    // its row is 3. It asks a beat after the paging stops, and nothing before.
    expect(scrolled).not.toHaveBeenCalled();
    await act(() => jest.advanceTimersByTimeAsync(REVEAL_AFTER_MS));
    await waitFor(() =>
      expect(scrolled).toHaveBeenCalledWith({ index: 3, viewPosition: 0.5, animated: false }),
    );
  });

  it("asks for the line the paging comes to rest on, and for none it only passed through", async () => {
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    scrolled.mockClear();
    // The whole way back, receipt to clip: seven pages, across the album's six and two other lines.
    for (let step = 0; step < 7; step += 1) await page("onPrevious");
    // Newest first the clip's line is 3, and the album's 2 was on the way: the room never hears it.
    // The room's foot is the list's first row, so the clip's row is 4.
    await act(() => jest.advanceTimersByTimeAsync(REVEAL_AFTER_MS));
    await waitFor(() =>
      expect(scrolled).toHaveBeenCalledWith({ index: 4, viewPosition: 0.5, animated: false }),
    );
    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it("flies a photo past the album's fourth home to the +N tile, and leaves the room where it is", async () => {
    // Every tile on the glass, so only a photo with no tile at all would send the room anywhere.
    // The preset's `measureInWindow` is a bare `jest.fn()`, not a spy, so nothing restores it: the
    // test resets it itself, or every test after it would measure.
    const measured = jest
      .spyOn(View.prototype as unknown as { measureInWindow: () => void }, "measureInWindow")
      .mockImplementation(((answer: (x: number, y: number, w: number, h: number) => void) =>
        answer(200, 400, 120, 120)) as never);
    try {
      await render(room(fakeFiles()));
      // The fourth tile says +2 over site-04, and stands for site-05 and site-06 (Foodie, 24
      // October 2026).
      await tap("site-04.jpg");
      await act(async () => screen.getByTestId("viewer").props["onShow"]());
      scrolled.mockClear();
      await page("onNext");
      expect(counter()).toBe("6 of 8");
      await waitFor(() =>
        expect(screen.getByTestId("photo-att_site4")).toHaveStyle({ opacity: 0 }),
      );
      await act(() => jest.advanceTimersByTimeAsync(REVEAL_AFTER_MS + 300));
      expect(scrolled).not.toHaveBeenCalled();

      await act(async () => stage().props["onDismiss"]());
      await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
      expect(scrolled).not.toHaveBeenCalled();
      expect(screen.getByTestId("photo-att_site4")).not.toHaveStyle({ opacity: 0 });
    } finally {
      measured.mockReset();
    }
  });

  it("hands Share the file as it was sent, from the bar", async () => {
    const files = fakeFiles();
    await render(room(files));
    await tap("receipt.jpg");
    await userEvent.press(screen.getByTestId("viewer-share"));
    await waitFor(() => expect(files.opened).toEqual(["receipt.jpg"]));
  });

  it("saves the file itself into the library from the menu, and says so", async () => {
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    await userEvent.press(screen.getByTestId("viewer-more"));
    await userEvent.press(await screen.findByTestId("viewer-action-save"));
    // Under the name it was sent with, not the one the phone keeps it by.
    await waitFor(() =>
      expect(MediaLibrary.Asset.create).toHaveBeenCalledWith("file:///cache/leaving/receipt.jpg"),
    );
    // Add-only, photos and videos: the prompt is about the one thing asked for.
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ["photo", "video"]);
    await waitFor(() => expect(words("viewer-caption")).toContain("Saved to Photos"));
  });

  it("says why when the library may not be written to", async () => {
    jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValueOnce({
      granted: false,
    } as Awaited<ReturnType<typeof MediaLibrary.requestPermissionsAsync>>);
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    await userEvent.press(screen.getByTestId("viewer-more"));
    await userEvent.press(await screen.findByTestId("viewer-action-save"));
    await waitFor(() => expect(words("viewer-caption")).toContain("Allow it in Settings"));
    expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
  });

  it("copies the picture on the stage to the clipboard", async () => {
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    await userEvent.press(screen.getByTestId("viewer-more"));
    await userEvent.press(await screen.findByTestId("viewer-action-copy"));
    await waitFor(() =>
      expect(Clipboard.setImageAsync).toHaveBeenCalledWith(
        "base64 of file:///views/att_receipt.webp",
      ),
    );
    await waitFor(() => expect(words("viewer-caption")).toContain("Copied"));
  });

  it("goes to the message: the viewer closes onto its line, which the room lands on and flashes", async () => {
    await render(room(fakeFiles()));
    await tap("site-04.jpg");
    await userEvent.press(screen.getByTestId("viewer-more"));
    scrolled.mockClear();
    await userEvent.press(await screen.findByTestId("viewer-action-go"));
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
    // The album's line is 2, and its row 3: the room's foot is the list's first.
    expect(scrolled).toHaveBeenCalledWith({ index: 3, viewPosition: 0.5, animated: true });
    expect(screen.getByTestId("flash-ln_album")).toBeTruthy();
  });

  it("says the details, and opens the original in place of the view copy", async () => {
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    await userEvent.press(screen.getByTestId("viewer-more"));
    await userEvent.press(await screen.findByTestId("viewer-action-details"));
    const details = words("viewer-details");
    expect(details).toContain("receipt.jpg");
    expect(details).toContain("3.1 MB");
    expect(details).toContain("3024 × 4032");
    expect(details).toContain("Arjun");
    expect(details).toContain("A copy made for viewing");
    await userEvent.press(screen.getByTestId("viewer-actions-close"));
    await waitFor(() => expect(screen.queryByTestId("viewer-actions")).toBeNull());

    await userEvent.press(screen.getByTestId("viewer-more"));
    await userEvent.press(await screen.findByTestId("viewer-action-original"));
    await waitFor(() =>
      expect(screen.getByTestId("stage-picture-att_receipt").props["source"]).toEqual({
        uri: "file:///files/receipt.jpg",
      }),
    );
    // The original is what is showing now: there is nothing larger to open.
    await userEvent.press(screen.getByTestId("viewer-more"));
    await screen.findByTestId("viewer-action-details");
    expect(screen.queryByTestId("viewer-action-original")).toBeNull();
  });

  it("offers no Open original where the server gave the file itself as the view", async () => {
    const files = fakeFiles({
      view: async (attachment) => ({ uri: `file:///files/${attachment.filename}`, original: true }),
    });
    await render(room(files));
    await tap("receipt.jpg");
    await userEvent.press(screen.getByTestId("viewer-more"));
    await screen.findByTestId("viewer-action-details");
    expect(screen.queryByTestId("viewer-action-original")).toBeNull();
  });

  it("says a photo's full picture would not come at the foot, over its preview, and tries again", async () => {
    let fails = true;
    const files = fakeFiles({
      view: async (attachment) => {
        if (fails) throw new Error("The connection dropped.");
        return { uri: `file:///views/${attachment.id}.webp`, original: false };
      },
    });
    await render(room(files));
    await tap("receipt.jpg");
    // The preview is a picture to look at: nothing is put over it (ADR 0179).
    const line = await screen.findByTestId("viewer-preview-only");
    expect(screen.queryByTestId("viewer-failure")).toBeNull();
    expect(screen.queryByText("Could not fetch the photo.")).toBeNull();
    expect(line.props["accessibilityLabel"]).toBe(`${PREVIEW_ONLY}. Try again`);
    expect(screen.getByTestId("stage-picture-att_receipt").props["source"]).toEqual({
      uri: "file:///thumbs/att_receipt.webp",
    });
    fails = false;
    await userEvent.press(line);
    await waitFor(() => expect(screen.queryByTestId("viewer-preview-only")).toBeNull());
    expect(screen.getByTestId("stage-picture-att_receipt").props["source"]).toEqual({
      uri: "file:///views/att_receipt.webp",
    });
  });

  it("takes back what it said when the photo comes after all, asked again as the deck changed", async () => {
    let fails = true;
    const files = fakeFiles({
      view: async (attachment) => {
        if (fails) throw new Error("The connection dropped.");
        return { uri: `file:///views/${attachment.id}.webp`, original: false };
      },
    });
    const { rerender } = await render(room(files));
    await tap("receipt.jpg");
    await screen.findByTestId("viewer-preview-only");
    fails = false;
    // The phone is back, and the room with it: a line lands, and the deck is made again.
    const landed = line({ id: "ln_back", seq: 5, text: "Back." });
    await rerender(room(files, snapshotOf([...LINES, landed])));
    await waitFor(() => expect(screen.queryByTestId("viewer-preview-only")).toBeNull());
    expect(screen.getByTestId("stage-picture-att_receipt").props["source"]).toEqual({
      uri: "file:///views/att_receipt.webp",
    });
  });

  it("says why a photo would not come over the stage when there is no preview either", async () => {
    let fails = true;
    const files = fakeFiles({
      thumb: async () => {
        throw new Error("The connection dropped.");
      },
      view: async (attachment) => {
        if (fails) throw new Error("Could not fetch the attachment: the server did not answer.");
        return { uri: `file:///views/${attachment.id}.webp`, original: false };
      },
    });
    await render(room(files));
    await userEvent.press(await screen.findByRole("imagebutton", { name: "Open receipt.jpg" }));
    expect(await screen.findByText("Could not fetch the photo.")).toBeTruthy();
    expect(
      screen.getByText("Could not fetch the attachment: the server did not answer."),
    ).toBeTruthy();
    expect(screen.queryByTestId("viewer-preview-only")).toBeNull();
    fails = false;
    await userEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByTestId("viewer-failure")).toBeNull());
    expect(screen.getByTestId("stage-picture-att_receipt").props["source"]).toEqual({
      uri: "file:///views/att_receipt.webp",
    });
  });

  it("holds its deck still: a line that lands is not in it, and a message taken back leaves it", async () => {
    const files = fakeFiles();
    const { rerender } = await render(room(files));
    await tap("receipt.jpg");
    const landed = line({
      id: "ln_new",
      seq: 5,
      attachments: [photo("att_new", "later.jpg")],
    });
    await rerender(room(files, snapshotOf([...LINES, landed])));
    expect(counter()).toBe("8 of 8");

    const takenBack = LINES.map((each) =>
      each.id === "ln_album" ? { ...each, deleted: true, attachments: undefined } : each,
    );
    await rerender(room(files, snapshotOf([...takenBack, landed])));
    expect(counter()).toBe("2 of 2");
  });

  it("keeps the status bar until the bars have come, hides it with them, and gives it back as the viewer leaves", async () => {
    await render(room(fakeFiles()));
    await userEvent.press(await screen.findByRole("imagebutton", { name: "Open site-02.jpg" }));
    await screen.findByTestId("viewer");
    // It stands beside the modal view, where a screen reader does not go.
    const hidden = () =>
      screen.getByTestId("viewer-window", { includeHiddenElements: true }).props["statusBarHidden"];
    // The bars are still on their way, and the status bar is not taken away ahead of them.
    expect(screen.getByTestId("viewer-chrome").props["pointerEvents"]).toBe("none");
    expect(hidden()).toBe(false);
    await waitFor(() =>
      expect(screen.getByTestId("viewer-chrome").props["pointerEvents"]).toBe("box-none"),
    );
    expect(hidden()).toBe(false);
    await act(async () => stage().props["onTap"]());
    expect(hidden()).toBe(true);
    await act(async () => stage().props["onTap"]());
    expect(hidden()).toBe(false);
    // Hidden with the bars, it is the room's again from the moment the viewer starts to leave.
    await act(async () => stage().props["onTap"]());
    expect(hidden()).toBe(true);
    await act(async () => stage().props["onDismiss"]());
    expect(hidden()).toBe(false);
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
  });

  it("crossfades under Reduce Motion", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    await waitFor(() => expect(stage().props["still"]).toBe(true));
  });
});

describe("a video in the viewer", () => {
  it("opens from its tile on its poster, with a ring while the copy comes, and plays", async () => {
    const coming = slowPlay();
    await render(room(fakeFiles({ play: coming.play })));
    await tapVideo("IMG_4410.MOV");
    expect(counter()).toBe("1 of 8");
    expect(screen.getByTestId("stage-picture-att_clip").props["source"]).toEqual({
      uri: "file:///thumbs/att_clip.webp",
    });

    await coming.say(0, 38_000_000);
    expect(screen.getByTestId("viewer-ring")).toHaveTextContent("0 %");
    await coming.say(15_200_000, 38_000_000);
    expect(screen.getByTestId("viewer-ring")).toHaveTextContent("40 %");
    expect(screen.getByTestId("viewer-note")).toHaveTextContent(
      "Fetching the video · 14.5 MB of 36.2 MB",
    );
    // Nothing to play or pause until it is here: the ring stands where the play disc would, and
    // the ten seconds either way wait.
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.getByRole("button", { name: "Back 10 seconds" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Forward 10 seconds" })).toBeDisabled();

    await coming.arrive({ uri: "file:///play/att_clip.mp4", beingMade: false });
    await waitFor(() => expect(screen.getByTestId("viewer-video")).toBeTruthy());
    expect(player().source).toEqual({ uri: "file:///play/att_clip.mp4" });
    expect(player().playing).toBe(true);
    expect(screen.getByTestId("viewer-video").props).toMatchObject({
      nativeControls: false,
      contentFit: "contain",
      allowsPictureInPicture: true,
    });
    expect(screen.queryByTestId("viewer-ring")).toBeNull();
    expect(screen.queryByTestId("viewer-note")).toBeNull();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("opens a mixed album on its clip, a tile of the album, where the message listed it", async () => {
    const mixed = [
      ...LINES,
      line({
        id: "ln_mixed",
        seq: 5,
        authorId: "per_dana",
        text: "The gate, and how it swings.",
        attachments: [
          photo("att_gate1", "gate-01.jpg"),
          { ...CLIP, id: "att_swing", filename: "gate-swing.mov" },
          photo("att_gate2", "gate-02.jpg"),
        ],
      }),
    ];
    await render(room(fakeFiles(), snapshotOf(mixed)));
    // One album of three, the clip among the photos rather than under them.
    const album = within(screen.getByTestId("line-ln_mixed")).getByTestId("photo-grid");
    expect(within(album).getByRole("button", { name: "Play gate-swing.mov" })).toBeTruthy();
    await tapVideo("gate-swing.mov");
    // The deck is the room's eight, then the album's three: the clip is the second of them.
    expect(counter()).toBe("10 of 11");
    expect(words("viewer-caption")).toContain("2 of 3 in this message");
    expect(screen.getByTestId("stage-picture-att_swing").props["source"]).toEqual({
      uri: "file:///thumbs/att_swing.webp",
    });
    await waitFor(() => expect(player().playing).toBe(true));
  });

  it("pauses when paged away from, and goes on from where it was when paged back to", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => {
      player().currentTime = 12;
      player().emit("timeUpdate", { currentTime: 12, bufferedPosition: 30 });
    });
    // iOS's own player's two times: gone, and left with a minus.
    expect(screen.getByTestId("viewer-time")).toHaveTextContent("0:12");
    expect(screen.getByTestId("viewer-remaining")).toHaveTextContent("\u22120:31");

    await page("onNext");
    expect(counter()).toBe("2 of 8");
    expect(player().playing).toBe(false);
    expect(screen.queryByTestId("viewer-controls")).toBeNull();

    const replaced = jest.spyOn(player(), "replaceAsync");
    player().currentTime = 0;
    await page("onPrevious");
    await waitFor(() => expect(player().playing).toBe(true));
    expect(player().currentTime).toBe(12);
    // The copy was on the player all along: nothing to load again.
    expect(replaced).not.toHaveBeenCalled();
  });

  it("hides its bars three seconds into playing; a tap brings them or takes them away, as iOS's own player's does, and leaves it playing; its end brings them back", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    const bars = () => screen.getByTestId("viewer-chrome").props["pointerEvents"];
    expect(bars()).toBe("box-none");
    await act(() => jest.advanceTimersByTimeAsync(CHROME_HIDES_MS));
    expect(bars()).toBe("none");

    // The bars hidden, a tap brings them back, and the film plays on under them.
    await act(async () => stage().props["onTap"]());
    expect(bars()).toBe("box-none");
    expect(player().playing).toBe(true);
    // Up, a tap takes them away again, and still it plays.
    await act(async () => stage().props["onTap"]());
    expect(bars()).toBe("none");
    expect(player().playing).toBe(true);

    // The middle disc is what pauses, and paused, the bars stay; it plays again from there.
    await act(async () => stage().props["onTap"]());
    await userEvent.press(screen.getByRole("button", { name: "Pause" }));
    expect(player().playing).toBe(false);
    expect(bars()).toBe("box-none");
    await userEvent.press(screen.getByRole("button", { name: "Play" }));
    expect(player().playing).toBe(true);

    // Played to its end, it brings them back, with Play to go again.
    await act(async () => stage().props["onTap"]());
    expect(bars()).toBe("none");
    await act(async () => {
      player().pause();
      player().emit("playToEnd");
    });
    expect(bars()).toBe("box-none");
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("skips ten seconds back and on from the transport, and no further than either end", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => {
      player().duration = 42.5;
      player().currentTime = 12;
      player().emit("timeUpdate", { currentTime: 12, bufferedPosition: 30 });
    });
    await userEvent.press(screen.getByRole("button", { name: "Forward 10 seconds" }));
    expect(player().currentTime).toBe(22);
    expect(screen.getByTestId("viewer-time")).toHaveTextContent("0:22");
    await userEvent.press(screen.getByRole("button", { name: "Back 10 seconds" }));
    await userEvent.press(screen.getByRole("button", { name: "Back 10 seconds" }));
    await userEvent.press(screen.getByRole("button", { name: "Back 10 seconds" }));
    expect(player().currentTime).toBe(0);
    for (const _ of [1, 2, 3, 4, 5]) {
      await userEvent.press(screen.getByRole("button", { name: "Forward 10 seconds" }));
    }
    expect(player().currentTime).toBe(42.5);
    // Skipping does not stop it: it plays on from where it went.
    expect(player().playing).toBe(true);
  });

  it("pauses under a drag to dismiss, plays on if it springs home, and closes paused", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => stage().props["onDragging"](true));
    expect(player().playing).toBe(false);
    await act(async () => stage().props["onDragging"](false));
    expect(player().playing).toBe(true);

    await act(async () => stage().props["onDragging"](true));
    await act(async () => stage().props["onDismiss"]());
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
    expect(player().playing).toBe(false);
  });

  it("scrubs: a thumb on the track holds it still, seeks where it goes, and lets it play on", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    const track = screen.getByTestId("viewer-scrubber");
    await act(async () =>
      track.props["onLayout"]({ nativeEvent: { layout: { x: 0, y: 0, width: 200, height: 44 } } }),
    );
    // The track starts 50 points in: a thumb landing 100 points along it is halfway.
    await act(async () => track.props["onResponderGrant"](touch(150, 100, 1)));
    expect(player().playing).toBe(false);
    expect(player().currentTime).toBeCloseTo(21.25);
    await act(async () => track.props["onResponderMove"](touch(200, 150, 2)));
    expect(screen.getByTestId("viewer-played")).toHaveStyle({ width: "75%" });
    await act(async () => track.props["onResponderRelease"](touch(200, 150, 3)));
    expect(player().currentTime).toBeCloseTo(31.875);
    expect(player().playing).toBe(true);

    // A screen reader's swipe moves it five seconds.
    await act(async () => {
      player().emit("timeUpdate", { currentTime: 31.875, bufferedPosition: 40 });
    });
    await act(async () =>
      track.props["onAccessibilityAction"]({ nativeEvent: { actionName: "decrement" } }),
    );
    expect(player().currentTime).toBeCloseTo(26.875);
  });

  it("mutes, goes into Picture in Picture, and hands itself to the system player from the menu", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await userEvent.press(screen.getByRole("button", { name: "Mute" }));
    expect(player().muted).toBe(true);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Picture in Picture" }));
    expect(video.view.startPictureInPicture).toHaveBeenCalled();
    // The window it is pinned in on Android takes the video's shape.
    expect(
      screen.getByTestId("viewer-window", { includeHiddenElements: true }).props,
    ).toMatchObject({ pinnedWidth: 1080, pinnedHeight: 1920 });

    await userEvent.press(screen.getByTestId("viewer-more"));
    expect(await screen.findByTestId("viewer-action-system")).toBeTruthy();
    // A video has nothing to copy, and no original to open in place of a view copy.
    expect(screen.queryByTestId("viewer-action-copy")).toBeNull();
    expect(screen.queryByTestId("viewer-action-original")).toBeNull();
    await act(async () => {
      player().currentTime = 20;
    });
    await userEvent.press(screen.getByTestId("viewer-action-system"));
    // Its own full-screen modal, with the platform's controls; the stage lets the player go to it.
    expect(await screen.findByTestId("viewer-system-player")).toBeTruthy();
    expect(screen.getByTestId("viewer-system-video").props["nativeControls"]).toBe(true);
    expect(screen.queryByTestId("viewer-video")).toBeNull();
    expect(player().playing).toBe(true);
    await userEvent.press(screen.getByRole("button", { name: "Close the system player" }));
    await waitFor(() => expect(screen.queryByTestId("viewer-system-player")).toBeNull());
    // Back on the stage as it was: where it had got to, still playing.
    expect(screen.getByTestId("viewer-video").props["nativeControls"]).toBe(false);
    expect(player().currentTime).toBe(20);
    expect(player().playing).toBe(true);
  });

  it("draws the last frame, not a black stage, when it comes back from the system player at its end", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => {
      player().duration = 42.5;
      player().currentTime = 42.5;
      player().emit("timeUpdate", { currentTime: 42.5, bufferedPosition: 42.5 });
      player().pause();
      player().emit("playToEnd", {});
    });
    await userEvent.press(screen.getByTestId("viewer-more"));
    await userEvent.press(await screen.findByTestId("viewer-action-system"));
    expect(await screen.findByTestId("viewer-system-player")).toBeTruthy();
    player().currentTime = 42.5;
    await userEvent.press(screen.getByRole("button", { name: "Close the system player" }));
    await waitFor(() => expect(screen.queryByTestId("viewer-system-player")).toBeNull());
    // A seek draws a frame into the new view; at the very end there is none, so just before it.
    expect(player().currentTime).toBeCloseTo(42.45);
    expect(player().playing).toBe(false);
    // And Play still goes again from the start.
    await userEvent.press(screen.getByRole("button", { name: "Play" }));
    expect(player().currentTime).toBe(0);
    expect(player().playing).toBe(true);
  });

  it("draws its frame again when it comes back from Picture in Picture paused", async () => {
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => {
      player().duration = 42.5;
      player().pause();
    });
    const drawn = jest.spyOn(player(), "currentTime", "set");
    player().time = 30;
    await act(async () => screen.getByTestId("viewer-video").props["onPictureInPictureStop"]());
    expect(drawn).toHaveBeenCalledWith(30);
    expect(player().playing).toBe(false);
  });

  it("says Android's own words for Share, Save and System player on Android", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    await render(room(fakeFiles()));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await userEvent.press(screen.getByTestId("viewer-more"));
    expect(await screen.findByText("The share sheet: Quick Share, and every app")).toBeTruthy();
    expect(screen.getByText("Into the gallery")).toBeTruthy();
    expect(screen.getByText("Full screen, with its speed and captions")).toBeTruthy();
    expect(screen.queryByText(/AirDrop|AirPlay/)).toBeNull();
  });

  it("says the original is playing while the copy that plays everywhere is being made", async () => {
    await render(
      room(
        fakeFiles({
          play: async (attachment) => ({
            uri: `file:///play/${attachment.id}.mov`,
            beingMade: true,
          }),
        }),
      ),
    );
    await tapVideo("IMG_4410.MOV");
    await waitFor(() =>
      expect(screen.getByTestId("viewer-note")).toHaveTextContent(
        "Playing the original · the copy that plays everywhere is being made",
      ),
    );
  });

  it("opens one the server never measured from its row, alone, with nothing to fly from", async () => {
    await render(room(fakeFiles()));
    await tapVideo("walkthrough.mp4");
    expect(counter()).toBe("1 of 1");
    expect(stage().props["from"]).toBeUndefined();
    expect(words("viewer-caption")).toMatch(/^Scout · Today .+ \| walkthrough\.mp4 · 5\.0 MB$/);
    await waitFor(() => expect(player().source).toEqual({ uri: "file:///play/att_raw.mp4" }));
    expect(player().playing).toBe(true);
    await act(async () => stage().props["onDismiss"]());
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
  });

  it("says a video came but would not play, with nothing left to press but Try again", async () => {
    await render(room(fakeFiles()));
    await tapVideo("walkthrough.mp4");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => {
      player().pause();
      player().emit("statusChange", {
        status: "error",
        error: { message: "Failed to load the player item: Cannot Open" },
      });
    });
    expect(screen.getByText("Could not play the video.")).toBeTruthy();
    expect(screen.getByText("Failed to load the player item: Cannot Open")).toBeTruthy();
    // The card stands where the transport was: nothing to play, and the track is still.
    expect(screen.queryByTestId("viewer-transport")).toBeNull();
    expect(screen.queryByRole("button", { name: "Play" })).toBeNull();
    expect(screen.getByTestId("viewer-scrubber")).toBeDisabled();
  });

  it("says this phone cannot play the original while its copy is made, and Try again asks for the copy", async () => {
    const asked: boolean[] = [];
    let made = false;
    const files = fakeFiles({
      play: async (attachment, _onProgress, forCopy = false) => {
        asked.push(forCopy);
        return made
          ? { uri: `file:///play/${attachment.id}.mp4`, beingMade: false }
          : { uri: `file:///play/${attachment.id}.mov`, beingMade: true };
      },
    });
    await render(room(files));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    await act(async () => {
      player().pause();
      player().emit("statusChange", {
        status: "error",
        error: {
          message: "MediaCodecVideoRenderer error, format_supported=NO_EXCEEDS_CAPABILITIES",
        },
      });
    });
    // The poster stays, with why in the app's words rather than the decoder's.
    expect(screen.getByText("This phone cannot play the original.")).toBeTruthy();
    expect(
      screen.getByText("The copy that plays everywhere is being made. Try again in a minute."),
    ).toBeTruthy();
    expect(screen.queryByText(/MediaCodecVideoRenderer/)).toBeNull();
    expect(screen.queryByTestId("viewer-note")).toBeNull();
    expect(screen.queryByTestId("viewer-transport")).toBeNull();
    // Nothing to pin in Picture in Picture either.
    expect(screen.queryByRole("button", { name: "Picture in Picture" })).toBeNull();

    // Still being made: the copy is asked for, and the words stay.
    await userEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(asked.at(-1)).toBe(true));
    expect(screen.getByText("This phone cannot play the original.")).toBeTruthy();

    // Made: the copy comes, and plays.
    made = true;
    await userEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(player().source).toEqual({ uri: "file:///play/att_clip.mp4" }));
    await waitFor(() => expect(player().playing).toBe(true));
    expect(screen.queryByTestId("viewer-failure")).toBeNull();
    expect(asked.filter(Boolean)).toHaveLength(2);
  });

  it("streams a clip from its grant where it can: no ring, a spinner while it starts, and nothing fetched", async () => {
    const streamed: boolean[] = [];
    const downloaded: string[] = [];
    const files = fakeFiles({
      streamUrl: async (attachment, fresh = false) => {
        streamed.push(fresh);
        return {
          uri: `http://mac.tail.ts.net/v1/attachments/${attachment.id}?variant=play&dev=d&exp=1&sig=s`,
          beingMade: false,
          streamed: true,
        };
      },
      play: async (attachment) => {
        downloaded.push(attachment.id);
        return { uri: `file:///play/${attachment.id}.mp4`, beingMade: false };
      },
    });
    await render(room(files));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() =>
      expect(player().source).toEqual({
        uri: "http://mac.tail.ts.net/v1/attachments/att_clip?variant=play&dev=d&exp=1&sig=s",
      }),
    );
    await waitFor(() => expect(player().playing).toBe(true));
    expect(streamed).toEqual([false]);
    expect(downloaded).toEqual([]);
    expect(screen.queryByTestId("viewer-ring")).toBeNull();

    // Starting, and catching up after a scrub: a spinner, and no play mark under it.
    await act(async () => player().emit("statusChange", { status: "loading" }));
    expect(screen.getByTestId("viewer-waiting")).toBeTruthy();
    expect(screen.getByLabelText("Starting the video")).toBeTruthy();
    await act(async () => player().emit("statusChange", { status: "readyToPlay" }));
    expect(screen.queryByTestId("viewer-waiting")).toBeNull();

    // Paged away and back: the same URL, so nothing is loaded again.
    const replaced = jest.spyOn(player(), "replaceAsync");
    await page("onNext");
    await page("onPrevious");
    await waitFor(() => expect(player().playing).toBe(true));
    expect(replaced).not.toHaveBeenCalled();
  });

  it("downloads, ring and all, when there is no grant to stream from", async () => {
    const asked: string[] = [];
    const coming = slowPlay();
    await render(
      room(
        fakeFiles({
          streamUrl: async (attachment) => {
            asked.push(attachment.id);
            return undefined;
          },
          play: coming.play,
        }),
      ),
    );
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(asked).toEqual(["att_clip"]));
    await coming.say(19_000_000, 38_000_000);
    expect(screen.getByTestId("viewer-ring")).toHaveTextContent("50 %");
    await coming.arrive({ uri: "file:///play/att_clip.mp4", beingMade: false });
    await waitFor(() => expect(player().playing).toBe(true));
    // A file on the phone never waits on the network: no spinner, whatever the player says.
    await act(async () => player().emit("statusChange", { status: "loading" }));
    expect(screen.queryByTestId("viewer-waiting")).toBeNull();
  });

  it("asks for a fresh grant when a stream would not play, and for the copy when the original would not", async () => {
    const asked: boolean[] = [];
    let made = false;
    let issued = 0;
    const files = fakeFiles({
      streamUrl: async (attachment, fresh = false) => {
        asked.push(fresh);
        issued += 1;
        return {
          uri: `http://mac/v1/attachments/${attachment.id}?${made ? "variant=play&" : ""}exp=${issued}`,
          beingMade: !made,
          streamed: true,
        };
      },
    });
    await render(room(files));
    await tapVideo("IMG_4410.MOV");
    await waitFor(() => expect(player().playing).toBe(true));
    expect(screen.getByTestId("viewer-note")).toHaveTextContent(
      "Playing the original · the copy that plays everywhere is being made",
    );
    await act(async () => {
      player().pause();
      player().emit("statusChange", {
        status: "error",
        error: {
          message: "MediaCodecVideoRenderer error, format_supported=NO_EXCEEDS_CAPABILITIES",
        },
      });
    });
    expect(screen.getByText("This phone cannot play the original.")).toBeTruthy();

    made = true;
    await userEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(player().source).toEqual({
        uri: "http://mac/v1/attachments/att_clip?variant=play&exp=2",
      }),
    );
    await waitFor(() => expect(player().playing).toBe(true));
    expect(asked).toEqual([false, true]);
    expect(screen.queryByTestId("viewer-failure")).toBeNull();
  });

  it("says why a video would not come, over its poster, and tries again", async () => {
    let fails = true;
    const files = fakeFiles({
      play: async (attachment) => {
        if (fails) throw new Error("Could not fetch the attachment: the tunnel closed.");
        return { uri: `file:///play/${attachment.id}.mp4`, beingMade: false };
      },
    });
    await render(room(files));
    await tapVideo("IMG_4410.MOV");
    expect(await screen.findByText("Could not play the video.")).toBeTruthy();
    expect(screen.getByText("Could not fetch the attachment: the tunnel closed.")).toBeTruthy();
    expect(screen.queryByTestId("viewer-transport")).toBeNull();
    expect(screen.getByTestId("viewer-scrubber")).toBeDisabled();
    fails = false;
    await userEvent.press(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByTestId("viewer-failure")).toBeNull());
    await waitFor(() => expect(player().playing).toBe(true));
  });
});

/**
 * The tablets, and the wide window (the media viewer proposal, §4.4 and rule 10). `useLayout`
 * reads the window and never the device, so setting the window is the whole of what makes this an
 * iPad — and it is also what a split, Stage Manager and a ChromeOS window do.
 *
 * What the strip and the arrows look like, where they sit and how they scroll is the simulator's
 * and the emulator's; what is provable here is that they are drawn where there is room, that they
 * reach the deck, and that a phone is left exactly as it was.
 */
describe("the viewer in a wide window", () => {
  const was = Dimensions.get("window");
  beforeEach(() => {
    Dimensions.set({ window: { ...IPAD.frame, scale: 2, fontScale: 1 } });
  });
  afterEach(() => {
    // The room goes before the window does. React Testing Library's own cleanup is registered at
    // the top level and so runs after this one, and a viewer still mounted when the window
    // narrows under it is a state change outside `act`.
    cleanup();
    Dimensions.set({ window: was });
  });

  it("draws the filmstrip, ringing the one on the stage, and a thumb goes there", async () => {
    await render(room(fakeFiles(), snapshotOf(LINES), "sp_1", IPAD));
    await tap("receipt.jpg");
    expect(counter()).toBe("8 of 8");
    const strip = within(screen.getByTestId("viewer-filmstrip"));
    // One thumb per item in the deck, in the deck's order, each a place to go by name.
    expect(strip.getAllByRole("button").map((thumb) => thumb.props["accessibilityLabel"])).toEqual([
      "Video 1 of 8, IMG_4410.MOV",
      ...ALBUM.map((each, at) => `Photo ${at + 2} of 8, ${each.filename}`),
      "Photo 8 of 8, receipt.jpg",
    ]);
    // The one on the stage is the one marked, and it is the only one.
    expect(
      strip.getByRole("button", { name: "Photo 8 of 8, receipt.jpg", selected: true }),
    ).toBeTruthy();
    expect(strip.queryAllByRole("button", { selected: true })).toHaveLength(1);
    // The video's thumb wears the play disc's triangle, bare (ADR 0163), and the photos none.
    expect(strip.getAllByTestId("play-mark")).toHaveLength(1);
    expect(strip.queryByText("▶")).toBeNull();

    await userEvent.press(strip.getByLabelText("Photo 2 of 8, site-01.jpg"));
    expect(counter()).toBe("2 of 8");
    expect(words("viewer-caption")).toContain("site-01.jpg");
  });

  it("draws the arrows, which page and are absent at the ends", async () => {
    await render(room(fakeFiles(), snapshotOf(LINES), "sp_1", IPAD));
    await tap("receipt.jpg");
    // The last of the deck: there is nowhere further on.
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Previous" }));
    expect(counter()).toBe("7 of 8");
    await userEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(counter()).toBe("8 of 8");
  });

  it("is the phone's viewer again in a narrow window — no strip, no arrows", async () => {
    Dimensions.set({ window: { ...IPHONE.frame, scale: 3, fontScale: 1 } });
    await render(room(fakeFiles()));
    await tap("receipt.jpg");
    expect(screen.queryByTestId("viewer-filmstrip")).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("draws no strip for a deck of one: a video the server never measured, opened from its row", async () => {
    await render(room(fakeFiles(), snapshotOf(LINES), "sp_1", IPAD));
    await tapVideo("walkthrough.mp4");
    expect(counter()).toBe("1 of 1");
    expect(screen.queryByTestId("viewer-filmstrip")).toBeNull();
  });
});

/**
 * A phone on its side (Arjun, 14 October 2026: "make sure video is playable in landscape as well").
 * The simulator walk found the bars where a phone upright had put them: Close and Play under the
 * island, at the very edge, and the shade drawn at the width it was first drawn at, so it stopped a
 * third of the way across the picture. What a turn looks like is the simulator's
 * (`e2e/maestro/video.yaml`); where the bars stand, and how wide and tall the shade is, are here.
 */
describe("a phone on its side", () => {
  const was = Dimensions.get("window");
  beforeEach(() => {
    Dimensions.set({ window: { ...IPHONE_ON_ITS_SIDE.frame, scale: 3, fontScale: 1 } });
  });
  afterEach(() => {
    cleanup();
    Dimensions.set({ window: was });
  });

  it("stands the bars and the controls clear of the island and the corners", async () => {
    await render(room(fakeFiles(), snapshotOf(LINES), "sp_1", IPHONE_ON_ITS_SIDE));
    await tapVideo("IMG_4410.MOV");
    // The safe area's side, and the bars' own eight points inside it.
    expect(screen.getByTestId("viewer-bar")).toHaveStyle({ left: 70, right: 70, top: 0 });
    expect(screen.getByTestId("viewer-foot")).toHaveStyle({ left: 70, right: 70, bottom: 36 });
    // And the video's controls are inside that foot: the capsule, and the transport over the stage.
    expect(within(screen.getByTestId("viewer-foot")).getByTestId("viewer-controls")).toBeTruthy();
    expect(screen.getByTestId("viewer-transport")).toBeTruthy();
  });

  it("shades the whole width, and the new whole width when the phone turns under it", async () => {
    await render(room(fakeFiles(), snapshotOf(LINES), "sp_1", IPHONE_ON_ITS_SIDE));
    await tapVideo("IMG_4410.MOV");
    expect(screen.getByTestId("scrim-top")).toHaveStyle({ width: 874 });
    expect(screen.getByTestId("scrim-bottom")).toHaveStyle({ width: 874 });
    await act(async () => {
      Dimensions.set({ window: { ...IPHONE.frame, scale: 3, fontScale: 1 } });
    });
    expect(screen.getByTestId("scrim-top")).toHaveStyle({ width: 393 });
    expect(screen.getByTestId("scrim-bottom")).toHaveStyle({ width: 393 });
  });

  it("shades the foot as far up as what stands there and a lead above it, not half the stage", async () => {
    await render(room(fakeFiles(), snapshotOf(LINES), "sp_1", IPHONE_ON_ITS_SIDE));
    await tapVideo("IMG_4410.MOV");
    await fireEvent(screen.getByTestId("viewer-foot"), "layout", {
      nativeEvent: { layout: { x: 70, y: 260, width: 734, height: 100 } },
    });
    // 20 of inset and 16 of margin under the foot, its 100, and a lead of 12 % of 402 points.
    expect(screen.getByTestId("scrim-bottom")).toHaveStyle({ height: 20 + 16 + 100 + 402 * 0.12 });
  });
});
