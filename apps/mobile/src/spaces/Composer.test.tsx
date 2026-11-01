/**
 * The composer's files (M4.4): what the picker gives is staged, uploaded and sent with the
 * words; a file over the workspace's cap is refused at the chip with the server's sentence and
 * never uploaded; a picker that could not open says so. The pickers are the platform's and are
 * mocked; what is tested is everything either side of them.
 */

import type { Attachment, Snapshot } from "@chipschat/core";
import { parseCommand } from "@chipschat/core";
import { type AttachmentCaps, NO_CAPS } from "@chipschat/protocol";
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as audio from "expo-audio";
import * as Haptics from "expo-haptics";
import type { ImageRef } from "expo-image";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore } from "../testing/fixtures";
import { light, TEXT } from "../ui/tokens";
import { hasAudio } from "./audio";
import { Composer, forgetDrafts, launchOf, picturesOf } from "./Composer";
import type { FileService } from "./files";
import { type Picked, pick } from "./pick";
import type { Staged } from "./useStaged";

jest.mock("./pick", () => ({ pick: jest.fn() }));
// Jest's views never answer `measureInWindow`, so a staged photo's viewer is told where the chip and
// Send are: both at Send's place on an iPhone, which is all a test here can say about the glass.
jest.mock("../media/tiles", () => ({
  ...jest.requireActual("../media/tiles"),
  measureView: jest.fn(async () => ({ x: 339, y: 772, width: 30, height: 30 })),
}));
const picking = pick as jest.MockedFunction<typeof pick>;
const impact = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;
// A value queued for one test never leaks into the next, whatever happened to the first; nor
// does a draft, which is kept for its space while the app runs, nor a count of buzzes.
beforeEach(() => {
  picking.mockReset();
  impact.mockClear();
  forgetDrafts();
});

const MB = 1024 * 1024;
const PHOTO: Picked = {
  name: "holiday.png",
  mimeType: "image/png",
  size: 3 * MB,
  uri: "file:///tmp/holiday.png",
  width: 1200,
  height: 900,
};
const NOTES: Picked = { name: "notes.txt", mimeType: "text/plain", size: 12, uri: "file:///n" };
const CLIP: Picked = {
  name: "IMG_4410.MOV",
  mimeType: "video/quicktime",
  size: 9 * MB,
  uri: "file:///tmp/IMG_4410.MOV",
};

function fakeFiles(): FileService & { readonly uploaded: Picked[] } {
  const uploaded: Picked[] = [];
  return {
    uploaded,
    async upload(picked) {
      uploaded.push(picked);
      const attachment: Attachment = {
        id: `att_${uploaded.length}`,
        filename: picked.name,
        mimeType: picked.mimeType,
        byteSize: picked.size ?? 0,
      };
      return attachment;
    },
    thumb: async (id) => `file:///thumbs/${id}`,
    file: async (attachment) => `file:///files/${attachment.id}`,
    view: async (attachment) => ({ uri: `file:///views/${attachment.id}`, original: false }),
    play: async (attachment) => ({ uri: `file:///play/${attachment.id}.mp4`, beingMade: false }),
    streamUrl: async () => undefined,
    open: async () => undefined,
    preview: async () => undefined,
    page: async () => "<!doctype html><p>A page</p>",
  };
}

const SPACE = {
  id: "sp_1",
  kind: "room",
  title: "Supplier email",
  members: ["per_arjun", "har_scout"],
  roles: {},
  state: "open",
  lastEventSeq: 3,
  lines: [],
  runs: [],
  sessions: [],
  pins: [],
  glimpse: false,
};

function composer(
  files: FileService | undefined,
  caps: AttachmentCaps = NO_CAPS,
  roomNotice?: string,
) {
  const snapshot = {
    connection: "open",
    busy: new Set(),
    receipts: new Map(),
    readState: {},
    directory: {},
    model: { spaces: [SPACE], needsYou: [], lanes: [], fleet: [], harnesses: {} },
  } as unknown as Snapshot;
  const store = fakeStore(snapshot);
  const element = (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 393, height: 852 },
        insets: { top: 59, left: 0, right: 0, bottom: 34 },
      }}
    >
      <Composer
        store={store}
        space={SPACE as never}
        run={undefined}
        directory={{}}
        selfId="per_arjun"
        files={files}
        caps={caps}
        roomNotice={roomNotice}
      />
    </SafeAreaProvider>
  );
  return { store, element };
}

async function attach(source: "library" | "camera" | "files") {
  await userEvent.press(screen.getByRole("button", { name: "Attach" }));
  await userEvent.press(screen.getByTestId(`attach-${source}`));
}

describe("attaching from the phone", () => {
  it("stages what the picker gave, uploads it, and sends it with the words", async () => {
    const files = fakeFiles();
    const { store, element } = composer(files);
    picking.mockResolvedValueOnce({ picked: [PHOTO] });
    await render(element);

    await attach("library");
    expect(picking).toHaveBeenCalledWith("library");
    expect(screen.getByText("holiday.png")).toBeTruthy();
    // The sheet stayed up for the picker and slides away once it has come back.
    await waitFor(() => expect(screen.queryByTestId("attach-sheet")).toBeNull());
    await waitFor(() => expect(screen.getByText("3.0 MB")).toBeTruthy());
    expect(files.uploaded).toEqual([PHOTO]);

    // Files alone may go; the send carries what the server made of them.
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toEqual([
      {
        name: "send",
        args: {
          spaceId: "sp_1",
          text: "",
          attachments: [
            { id: "att_1", filename: "holiday.png", mimeType: "image/png", byteSize: 3 * MB },
          ],
        },
      },
    ]);
    expect(screen.queryByText("holiday.png")).toBeNull();
  });

  it("keeps the room's thumbnail of a photo warm under its chip once it is up, and none for a file", async () => {
    const files = fakeFiles();
    const { element } = composer(files);
    picking.mockResolvedValueOnce({ picked: [PHOTO, NOTES] });
    await render(element);
    await attach("library");
    await waitFor(() => expect(screen.getByText("3.0 MB")).toBeTruthy());
    // The chip shows the picker's file; the thumbnail the room will draw is under it, unseen, so
    // the image the tiles and a send's copy are drawn with holds it decoded before the send.
    // Hidden from a screen reader too, which is what the query has to be told.
    const hidden = { includeHiddenElements: true };
    const warm = await screen.findByTestId(/^staged-warm-/, hidden);
    expect(warm.props["source"]).toEqual({ uri: "file:///thumbs/att_1" });
    expect(StyleSheet.flatten(warm.props["style"])).toMatchObject({ opacity: 0 });
    expect(screen.getAllByTestId(/^staged-warm-/, hidden)).toHaveLength(1);
    expect(screen.getByText("notes.txt")).toBeTruthy();
  });

  it("shows a staged video's first frame, read from the file, and lets its reader go (AN-29)", async () => {
    const video = jest.requireMock("expo-video") as {
      players: { source: unknown; released: boolean; thumbnailsAsked?: unknown }[];
    };
    const before = video.players.length;
    const { element } = composer(fakeFiles());
    picking.mockResolvedValueOnce({ picked: [CLIP, NOTES] });
    await render(element);
    await attach("library");
    // A photo's chip shows the photo; a video's showed a paperclip.
    const picture = await screen.findByTestId(/^staged-frame-picture-/);
    expect(picture.props["source"]).toMatchObject({ requestedTime: 0 });
    expect(screen.getByTestId("play-mark")).toBeTruthy();
    const reader = video.players[before];
    // Loaded before it is read: on iOS a player still loading its file has no frame to give.
    expect(reader?.source).toBe(CLIP.uri);
    expect(reader?.thumbnailsAsked).toEqual({
      times: 0,
      options: { maxWidth: 240, maxHeight: 240 },
    });
    await waitFor(() => expect(reader?.released).toBe(true));
    // A file keeps its mark.
    expect(screen.getByText("notes.txt")).toBeTruthy();
    expect(screen.getAllByTestId(/^staged-frame-picture-/)).toHaveLength(1);
  });

  it("says how far a long upload has got while it goes, and holds Send until it is in", async () => {
    let progress: ((sent: number, total: number) => void) | undefined;
    let finish: ((attachment: Attachment) => void) | undefined;
    const files: FileService = {
      ...fakeFiles(),
      upload: (_picked, onProgress) => {
        progress = onProgress;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    };
    picking.mockResolvedValueOnce({ picked: [PHOTO] });
    await render(composer(files).element);
    await attach("library");
    await waitFor(() => expect(screen.getByText("uploading…")).toBeTruthy());

    await act(async () => progress?.(1.2 * MB, 3 * MB));
    expect(screen.getByText("uploading… 40%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" }).props["accessibilityState"]).toMatchObject({
      disabled: true,
    });

    await act(async () =>
      finish?.({ id: "att_1", filename: "holiday.png", mimeType: "image/png", byteSize: 3 * MB }),
    );
    await waitFor(() => expect(screen.getByText("3.0 MB")).toBeTruthy());
  });

  it("refuses a file over its kind's cap at the chip, and uploads nothing (ADR 0047)", async () => {
    const files = fakeFiles();
    const { element } = composer(files, { image: 1 * MB, video: null, file: null });
    picking.mockResolvedValueOnce({ picked: [PHOTO, NOTES] });
    await render(element);

    await attach("files");
    expect(
      await screen.findByText("Photos here are capped at 1 MB, and this one is 3 MB."),
    ).toBeTruthy();
    await waitFor(() => expect(screen.getByText("12 B")).toBeTruthy());
    expect(files.uploaded).toEqual([NOTES]);
    // The refused chip offers no retry: trying again changes nothing. The × takes it out.
    expect(screen.queryByText("Try again")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Remove holiday.png" }));
    expect(screen.queryByText("holiday.png")).toBeNull();
  });

  it("says why when a picker could not open, and keeps files out of a command", async () => {
    const files = fakeFiles();
    const { store, element } = composer(files);
    picking.mockResolvedValueOnce({ refused: "The camera is not available here: no camera" });
    await render(element);

    await attach("camera");
    expect(await screen.findByTestId("composer-notice")).toHaveTextContent(
      "The camera is not available here: no camera",
    );

    picking.mockResolvedValueOnce({ picked: [NOTES] });
    await attach("files");
    await waitFor(() => expect(screen.getByText("12 B")).toBeTruthy());
    await userEvent.type(screen.getByTestId("composer"), "/pause");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("composer-notice")).toHaveTextContent(/Files go with a message/);
    expect(store.calls).toEqual([]);
    expect(screen.getByText("notes.txt")).toBeTruthy();
  });

  it("opens a sheet from the +, and its X slides it away with nothing picked", async () => {
    const { element } = composer(fakeFiles());
    await render(element);
    expect(screen.queryByTestId("attach-sheet")).toBeNull();

    await userEvent.press(screen.getByRole("button", { name: "Attach" }));
    expect(screen.getByRole("header", { name: "Add to your message" })).toBeTruthy();
    // Each row is its name and, as the hint, what it gives.
    expect(screen.getByRole("button", { name: "Photo library" })).toHaveProp(
      "accessibilityHint",
      "A photo or video already on this phone",
    );
    expect(screen.getByRole("button", { name: "Camera" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Files" })).toBeTruthy();

    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("attach-sheet")).toBeNull());
    expect(picking).not.toHaveBeenCalled();
  });

  it("records a voice note on the sheet, and says it is being transcribed until it is in (ADR 0054)", async () => {
    let finish: ((attachment: Attachment) => void) | undefined;
    const uploaded: Picked[] = [];
    const files: FileService = {
      ...fakeFiles(),
      upload: (picked) => {
        uploaded.push(picked);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    };
    const { store, element } = composer(files);
    await render(element);
    await userEvent.press(screen.getByRole("button", { name: "Attach" }));
    await userEvent.press(screen.getByRole("button", { name: "Voice note" }));
    expect(await screen.findByRole("header", { name: "Voice note" })).toBeTruthy();
    expect(screen.getByTestId("voice-line")).toHaveTextContent(
      "Tap to record. A note stops at 5:00.",
    );

    await userEvent.press(screen.getByRole("button", { name: "Record" }));
    const { recorder } = audio as unknown as { recorder: { record: jest.Mock; stop: jest.Mock } };
    await waitFor(() => expect(recorder.record).toHaveBeenCalled());
    await userEvent.press(await screen.findByRole("button", { name: "Stop and add" }));
    await waitFor(() => expect(recorder.stop).toHaveBeenCalled());

    // Staged like any picked file, and the sheet is gone.
    await waitFor(() => expect(screen.queryByTestId("attach-sheet")).toBeNull());
    expect(uploaded).toEqual([
      expect.objectContaining({
        name: expect.stringMatching(/^voice-note-\d{4}-\d{4}\.m4a$/),
        mimeType: "audio/mp4",
        uri: "file:///cache/recording-1.m4a",
      }),
    ]);
    expect(screen.getByText("uploading and transcribing…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" }).props["accessibilityState"]).toMatchObject({
      disabled: true,
    });

    await act(async () =>
      finish?.({
        id: "att_1",
        filename: uploaded[0]?.name ?? "",
        mimeType: "audio/mp4",
        byteSize: 96_512,
        durationMs: 8400,
        transcript: "Send Priya the receipt.",
      }),
    );
    await waitFor(() => expect(screen.getByText("0:08")).toBeTruthy());
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(store.calls).toEqual([
      {
        name: "send",
        args: {
          spaceId: "sp_1",
          text: "",
          attachments: [
            expect.objectContaining({ id: "att_1", transcript: "Send Priya the receipt." }),
          ],
        },
      },
    ]);
  });

  it("offers no voice note on a build without the recorder's native half", async () => {
    jest.mocked(hasAudio).mockReturnValue(false);
    try {
      const { element } = composer(fakeFiles());
      await render(element);
      await userEvent.press(screen.getByRole("button", { name: "Attach" }));
      expect(screen.getByRole("button", { name: "Files" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Voice note" })).toBeNull();
    } finally {
      jest.mocked(hasAudio).mockReturnValue(true);
    }
  });

  it("says why the microphone would not start, and records nothing", async () => {
    jest
      .mocked(audio.requestRecordingPermissionsAsync)
      .mockResolvedValueOnce({ granted: false } as never);
    const { element } = composer(fakeFiles());
    await render(element);
    await userEvent.press(screen.getByRole("button", { name: "Attach" }));
    await userEvent.press(screen.getByRole("button", { name: "Voice note" }));
    await userEvent.press(await screen.findByRole("button", { name: "Record" }));
    expect(
      await screen.findByText("Chips may not use the microphone. Allow it in Settings."),
    ).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("attach-sheet")).toBeNull());
    expect(screen.queryByTestId("staged")).toBeNull();
  });

  it("opens the viewer over a staged photo, with Send where it was, which sends it", async () => {
    const files = fakeFiles();
    const { store, element } = composer(files);
    picking.mockResolvedValueOnce({ picked: [PHOTO] });
    await render(element);
    await attach("library");
    await waitFor(() => expect(screen.getByText("3.0 MB")).toBeTruthy());

    await userEvent.press(screen.getByRole("imagebutton", { name: "Look at holiday.png" }));
    const viewer = await screen.findByTestId("staged-viewer");
    // The file on this phone, not a copy fetched from anywhere, and the chip's own thumbnail hidden
    // under the stage that draws it — once the modal is up over it (the stage says it has drawn as
    // it mounts), and not while the modal is still coming.
    expect(within(viewer).getByTestId(/^stage-picture-/).props["source"]).toEqual({
      uri: "file:///tmp/holiday.png",
    });
    const thumb = screen.getByTestId(/^staged-thumb-/);
    expect(StyleSheet.flatten(thumb.props["style"])).not.toMatchObject({ opacity: 0 });
    await act(async () => viewer.props["onShow"]());
    expect(StyleSheet.flatten(thumb.props["style"])).toMatchObject({ opacity: 0 });
    // Close and nothing else: in no deck, with nothing to share, save or go to yet.
    expect(within(viewer).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(within(viewer).queryByTestId("viewer-counter")).toBeNull();
    expect(within(viewer).queryByRole("button", { name: "Share" })).toBeNull();
    expect(within(viewer).queryByRole("button", { name: "More" })).toBeNull();
    expect(within(viewer).getByText("You · Not sent yet")).toBeTruthy();
    expect(within(viewer).getByText("holiday.png · 3.0 MB · 1200 × 900")).toBeTruthy();
    // Send stands where the composer's does, and sends what the composer would.
    expect(
      StyleSheet.flatten(within(viewer).getByTestId("staged-viewer-send-place").props["style"]),
    ).toMatchObject({
      left: 339,
      top: 772,
      width: 30,
      height: 30,
    });
    await userEvent.press(within(viewer).getByRole("button", { name: "Send" }));
    expect(store.calls).toEqual([
      {
        name: "send",
        args: {
          spaceId: "sp_1",
          text: "",
          attachments: [
            { id: "att_1", filename: "holiday.png", mimeType: "image/png", byteSize: 3 * MB },
          ],
        },
      },
    ]);
    await waitFor(() => expect(screen.queryByTestId("staged-viewer")).toBeNull());
    expect(screen.queryByText("holiday.png")).toBeNull();
  });

  it("holds the viewer's Send while the upload goes, and Close gives the chip its photo back", async () => {
    let finish: ((attachment: Attachment) => void) | undefined;
    const files: FileService = {
      ...fakeFiles(),
      upload: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    };
    const { store, element } = composer(files);
    picking.mockResolvedValueOnce({ picked: [PHOTO] });
    await render(element);
    await attach("library");
    await waitFor(() => expect(screen.getByText("uploading…")).toBeTruthy());

    await userEvent.press(screen.getByRole("imagebutton", { name: "Look at holiday.png" }));
    const viewer = await screen.findByTestId("staged-viewer");
    const held = () =>
      within(screen.getByTestId("staged-viewer")).getByRole("button", { name: "Send" }).props[
        "accessibilityState"
      ];
    expect(held()).toMatchObject({ disabled: true });
    // What the composer knows, the viewer's Send knows as it changes.
    await act(async () =>
      finish?.({ id: "att_1", filename: "holiday.png", mimeType: "image/png", byteSize: 3 * MB }),
    );
    await waitFor(() => expect(held()).toMatchObject({ disabled: false }));

    // The bars take no press until they have come in, a beat after the picture.
    await waitFor(() =>
      expect(within(viewer).getByTestId("viewer-chrome").props["pointerEvents"]).toBe("box-none"),
    );
    await userEvent.press(within(viewer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("staged-viewer")).toBeNull());
    expect(store.calls).toEqual([]);
    const thumb = screen.getByTestId(/^staged-thumb-/);
    expect(StyleSheet.flatten(thumb.props["style"])).not.toMatchObject({ opacity: 0 });
    expect(screen.getByText("holiday.png")).toBeTruthy();
  });

  it("offers no look at a file that is not a photo, nor at a photo the workspace refused", async () => {
    const files = fakeFiles();
    const { element } = composer(files, { image: 1 * MB, video: null, file: null });
    picking.mockResolvedValueOnce({ picked: [PHOTO, NOTES] });
    await render(element);
    await attach("library");
    await waitFor(() => expect(screen.getByText("notes.txt")).toBeTruthy());
    expect(screen.queryByRole("imagebutton", { name: /^Look at/ })).toBeNull();
  });

  it("offers no Attach on a phone with no file service", async () => {
    const { element } = composer(undefined);
    await render(element);
    expect(screen.queryByRole("button", { name: "Attach" })).toBeNull();
  });
});

describe("the send, in the hand", () => {
  it("taps once when the message goes, and is silent when it is refused", async () => {
    const { element } = composer(undefined);
    await render(element);

    await userEvent.type(screen.getByTestId("composer"), "on its way");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(impact).toHaveBeenCalledTimes(1);
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

    // A refusal keeps the words and says why above the field. A buzz here would read as sent,
    // which is the opposite of what happened.
    await userEvent.type(screen.getByTestId("composer"), "/nonsense");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("composer-notice")).toHaveTextContent(/is not a command here/);
    expect(impact).toHaveBeenCalledTimes(1);
  });
});

describe("what the server said of a change to who is in the room", () => {
  it("says it over the field, and lets it go when the person writes again", async () => {
    // Agents review, finding 13: a refused add was silent on both apps.
    const said = "That agent is in another room: move it, or pick another.";
    const { store, element } = composer(undefined, NO_CAPS, said);
    await render(element);
    expect(screen.getByTestId("composer-notice")).toHaveTextContent(said);
    await userEvent.type(screen.getByTestId("composer"), "ok");
    expect(store.calls).toContainEqual({ name: "dismissNotice", args: "sp_1" });
  });
});

describe("the field", () => {
  it("holds the @ of a new agent asked for from here once it joins, and only once (ADR 0108)", async () => {
    const room = { ...SPACE, id: "sp_made", made: { evt_ask: "agt_reviewer" } };
    const snapshot = {
      connection: "open",
      busy: new Set(),
      receipts: new Map(),
      readState: {},
      directory: {},
      model: { spaces: [room], needsYou: [], lanes: [], fleet: [], harnesses: {} },
    } as unknown as Snapshot;
    const arrivals = ["@Reviewer"];
    const store = { ...fakeStore(snapshot), takeArrival: () => arrivals.shift() };
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 393, height: 852 },
          insets: { top: 59, left: 0, right: 0, bottom: 34 },
        }}
      >
        <Composer
          store={store}
          space={room as never}
          run={undefined}
          directory={{}}
          selfId="per_arjun"
        />
      </SafeAreaProvider>,
    );
    expect(screen.getByTestId("composer").props["value"]).toBe("@Reviewer ");
    expect(arrivals).toEqual([]);
  });

  it("keeps what was typed for the space while you are away, and lets it go once sent", async () => {
    const first = await render(composer(undefined).element);
    await userEvent.type(screen.getByTestId("composer"), "half a thought");
    await first.unmount();

    // Back in the room: the words are where they were left.
    const second = composer(undefined);
    const again = await render(second.element);
    expect(screen.getByTestId("composer").props["value"]).toBe("half a thought");
    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(second.store.calls.some((call) => call.name === "send")).toBe(true));
    await again.unmount();

    await render(composer(undefined).element);
    expect(screen.getByTestId("composer").props["value"]).toBe("");
  });

  describe("after a send", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const field = () => screen.getByTestId("composer");
    async function sendWords(words: string) {
      const { store, element } = composer(undefined);
      const shown = await render(element);
      await fireEvent.changeText(field(), words);
      await fireEvent.press(screen.getByRole("button", { name: "Send" }));
      expect(store.calls.filter((call) => call.name === "send")).toHaveLength(1);
      return shown;
    }

    it("does not take the words back when the keyboard's late change brings them", async () => {
      // On iOS the clear is dropped when the keyboard changed the field since this side last
      // heard, and the change it lost to comes after the send holding the whole message: taken,
      // it put the words back in the field and the draft (Arjun, 23 September 2026).
      const shown = await sendWords("see you at eight");
      await fireEvent.changeText(field(), "see you at eight");
      expect(field().props["value"]).toBe("");
      // Or the message as the keyboard corrected it, or with the last key that was on its way.
      await fireEvent.changeText(field(), "See you at eight");
      await fireEvent.changeText(field(), "see you at eight.");
      expect(field().props["value"]).toBe("");
      expect(screen.getByTestId("composer-send")).toBeDisabled();

      // Nor kept as the room's draft.
      await shown.unmount();
      await render(composer(undefined).element);
      expect(field().props["value"]).toBe("");
    });

    it("takes the next message's first letter at once, and the rest after it", async () => {
      await sendWords("see you at eight");
      await fireEvent.changeText(field(), "O");
      expect(field().props["value"]).toBe("O");
      await fireEvent.changeText(field(), "Or nine, and see you at eight then");
      expect(field().props["value"]).toBe("Or nine, and see you at eight then");
    });

    it("takes the same words again once the moment has passed", async () => {
      await sendWords("ok");
      await act(async () => jest.advanceTimersByTime(1000));
      await fireEvent.changeText(field(), "ok");
      expect(field().props["value"]).toBe("ok");
    });
  });

  it("puts Send inside the field, and dims it while there is nothing to send (WP5)", async () => {
    await render(composer(undefined).element);
    const send = screen.getByTestId("composer-send");
    // Inside the field rather than beside it: the arrow belongs to the words it sends.
    expect(within(screen.getByTestId("composer-field")).getByTestId("composer-send")).toBe(send);
    // Thirty-two points of circle, dimmed rather than gone, in a thumb's target. It was thirty
    // until 22 September 2026, when the whole of the field went up a fifth to the proportions the
    // mocks had been showing all along (`FIELD`, in `Composer.tsx`).
    const skin = StyleSheet.flatten(send.props["style"]);
    expect(skin).toMatchObject({ width: 32, height: 32, borderRadius: 16 });
    // Grey rather than faded: the arrow on it stays white, which a fade would take down with it.
    expect(skin["backgroundColor"]).toBe(light.gray);
    expect(skin["opacity"]).toBe(1);
    expect(send).toBeDisabled();

    await userEvent.type(screen.getByTestId("composer"), "something to say");
    expect(screen.getByTestId("composer-send")).not.toBeDisabled();
    expect(
      StyleSheet.flatten(screen.getByTestId("composer-send").props["style"])["backgroundColor"],
    ).toBe(light.blue);
  });

  it("is as tall as its twin measures the words, and one line the moment they are sent", async () => {
    await render(composer(undefined).element);
    const heightOf = () => StyleSheet.flatten(screen.getByTestId("composer").props["style"]).height;
    const twinSays = (height: number) =>
      fireEvent(screen.getByTestId("composer-twin", { includeHiddenElements: true }), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
      });
    expect(heightOf()).toBeCloseTo(TEXT.body * 1.35);

    await userEvent.type(screen.getByTestId("composer"), "three lines, or so, of a message");
    // Hidden from a screen reader, so it has to be asked for by name.
    expect(
      screen.getByTestId("composer-twin", { includeHiddenElements: true }).props["children"],
    ).toBe("three lines, or so, of a message");
    twinSays(65);
    await waitFor(() => expect(heightOf()).toBe(65));

    // The ceiling: six lines or so, then it scrolls.
    twinSays(400);
    await waitFor(() => expect(heightOf()).toBe(124));

    await userEvent.press(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByTestId("composer").props["value"]).toBe("");
    expect(heightOf()).toBeCloseTo(TEXT.body * 1.35);
  });
});

describe("what a send takes off with", () => {
  const placed = (x: number, y: number, width: number, height: number) => ({
    measureInWindow: (answer: (x: number, y: number, width: number, height: number) => void) =>
      answer(x, y, width, height),
  });
  /** A view the platform never answers for: one the list has let go of, or one under a test. */
  const silent = { measureInWindow: () => undefined };
  const field = placed(20, 700, 300, 40);
  const send = placed(330, 704, 32, 32);
  const chip = placed(24, 640, 40, 40);
  const photo = (thumb: typeof chip | null, id = "att_1") => ({
    attachmentId: id,
    uri: `file:///${id}.jpg`,
    thumb,
  });

  it("flies the words from the field, and a photo from its chip, for the room to carry", () => {
    expect(launchOf(field, send, parseCommand("On it"), [photo(chip)])).toEqual({
      text: "On it",
      words: { x: 20, y: 700, width: 300, height: 40 },
      // Send's middle, less half a field of one line, less the room's and the bar's clearance.
      rest: 704 + 16 - 25 - 24,
      pictures: [
        {
          attachmentId: "att_1",
          uri: "file:///att_1.jpg",
          from: { x: 24, y: 640, width: 40, height: 40 },
        },
      ],
    });
  });

  it("flies the capsule's arrow and faces up with the words, where the line wears a route (ADR 0081)", () => {
    const capsule = placed(28, 650, 44, 20);
    const routed = { to: ["har_tree"], view: capsule };
    expect(launchOf(field, send, parseCommand("On it"), [], routed)?.route).toEqual({
      to: ["har_tree"],
      from: { x: 28, y: 650, width: 44, height: 20 },
    });
    expect(launchOf(field, send, parseCommand("On it"), [])).not.toHaveProperty("route");
    expect(
      launchOf(field, send, parseCommand("On it"), [], { to: ["har_tree"], view: silent }),
    ).not.toHaveProperty("route");
  });

  it("flies a photo alone, with no words to fly", () => {
    const launch = launchOf(field, send, parseCommand(""), [photo(chip)]);
    expect(launch?.words).toBeUndefined();
    expect(launch?.pictures.map((each) => each.attachmentId)).toEqual(["att_1"]);
  });

  it("flies nothing for a command, for words the field cannot place, or with nothing to fly", () => {
    expect(launchOf(field, send, parseCommand("/help"), [photo(chip)])).toBeUndefined();
    expect(launchOf(silent, send, parseCommand("On it"), [photo(chip)])).toBeUndefined();
    expect(launchOf(field, send, parseCommand(""), [photo(null)])).toBeUndefined();
  });

  it("leaves out a photo whose chip cannot be placed, and flies the rest", () => {
    const launch = launchOf(field, send, parseCommand("On it"), [
      photo(null),
      photo(chip, "att_2"),
    ]);
    expect(launch?.words).toBeDefined();
    expect(launch?.pictures.map((each) => each.attachmentId)).toEqual(["att_2"]);
  });

  it("flies a photo's decoded thumbnail, for its copy to draw from its first frame", () => {
    // What `Image.loadAsync` gives: a native image, which the copy draws as it is handed it.
    const decoded = { width: 400, height: 300 } as unknown as ImageRef;
    const staged: Staged[] = [
      {
        localId: "f1",
        picked: PHOTO,
        status: "ready",
        attachment: { id: "att_f1", filename: "holiday.png", mimeType: "image/png", byteSize: MB },
        thumbUri: "file:///thumbs/att_f1.webp",
        picture: decoded,
      },
    ];
    const [picture] = picturesOf(staged, () => chip);
    expect(picture?.picture).toBe(decoded);
    const launch = launchOf(
      field,
      send,
      parseCommand(""),
      picturesOf(staged, () => chip),
    );
    expect(launch?.pictures[0]?.picture).toBe(decoded);
  });

  it("flies the room's thumbnail of a photo once it has come, and the picker's file until then", () => {
    const ready = (localId: string, thumbUri?: string): Staged => ({
      localId,
      picked: PHOTO,
      status: "ready",
      attachment: {
        id: `att_${localId}`,
        filename: "holiday.png",
        mimeType: "image/png",
        byteSize: 3 * MB,
      },
      thumbUri,
    });
    const staged: Staged[] = [
      ready("f1", "file:///thumbs/att_f1.webp"),
      ready("f2"),
      // Still going up: nothing to send yet. And a file is no picture.
      { localId: "f3", picked: PHOTO, status: "uploading" },
      { ...ready("f4"), picked: NOTES },
    ];
    const thumbAt = (localId: string) => (localId === "f2" ? null : chip);
    expect(picturesOf(staged, thumbAt)).toEqual([
      { attachmentId: "att_f1", uri: "file:///thumbs/att_f1.webp", thumb: chip },
      { attachmentId: "att_f2", uri: "file:///tmp/holiday.png", thumb: null },
    ]);
  });
});
