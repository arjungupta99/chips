/**
 * What a message's files look like on the phone (M4.4): photos as thumbnails and a measured video
 * as its poster, one album in the desktop's shapes, each opening the media viewer, and a video the server never measured as a row whose
 * Play opens it too (the viewer's own tests, playing included, are `media/MediaViewer.test.tsx`);
 * and anything else as a row that opens — through a file service that is faked here, since the
 * bytes and the share sheet are the platform's.
 */

import type { Attachment } from "@chipschat/core";
import {
  act,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import * as audio from "expo-audio";
import type { ReactElement } from "react";
import { Keyboard, Platform, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Attachments } from "./Attachments";
import { hasAudio } from "./audio";
import { type FileService, nameFor } from "./files";
import { hasPageView } from "./pages";
import { makeLanding, SendLandingContext } from "./sendLanding";

/** On a phone with a notch and a home indicator, which a modal's bars stand clear of. */
/**
 * A page's view is on the glass from the moment it has a document, but unseen and hidden from
 * VoiceOver until it says it has loaded (`Arrival`), so a test that reaches for it then says so.
 */
const HIDDEN_TOO = { includeHiddenElements: true } as const;

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function render(element: ReactElement) {
  return renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);
}

const PHOTO: Attachment = {
  id: "att_1",
  filename: "holiday.png",
  mimeType: "image/png",
  byteSize: 3_145_728,
  width: 1200,
  height: 900,
};
const SECOND: Attachment = {
  ...PHOTO,
  id: "att_2",
  filename: "receipt.jpg",
  mimeType: "image/jpeg",
};
const CLIP: Attachment = {
  id: "att_3",
  filename: "clip.mp4",
  mimeType: "video/mp4",
  byteSize: 52_428_800,
};
/** A video the server measured: it has a length, and a poster to ask for. */
const MEASURED: Attachment = {
  id: "att_5",
  filename: "IMG_4410.MOV",
  mimeType: "video/quicktime",
  byteSize: 38_000_000,
  width: 1080,
  height: 1920,
  durationMs: 42_500,
};
/** A voice note the server heard: how long it runs, and what was said (ADR 0054). */
const VOICE: Attachment = {
  id: "att_6",
  filename: "voice-note-0913-1142.m4a",
  mimeType: "audio/mp4",
  byteSize: 96_512,
  durationMs: 8400,
  transcript: "Send Priya the receipt from the hardware store.",
};
const PDF: Attachment = {
  id: "att_4",
  filename: "invoice.pdf",
  mimeType: "application/pdf",
  byteSize: 4096,
};
/** The mock Jacobian's designer sent into the Chess Game space (ADR 0059). */
const PAGE: Attachment = {
  id: "att_7",
  filename: "chess-bronze-theme-approval-mock.html",
  mimeType: "text/html",
  byteSize: 10_815,
};
/** The walking tour J sent into Mission Murals, which went to the share sheet (ADR 0123). */
const TOUR: Attachment = {
  id: "att_8",
  filename: "mission-murals-walking-tour.md",
  mimeType: "text/markdown",
  byteSize: 23_317,
};

function fakeFiles(
  options: { readonly openFails?: string; readonly pageFails?: string } = {},
): FileService & {
  /** Handed to the share sheet: Share, in a page's bar. */
  readonly opened: string[];
  /** Shown to the person: Quick Look on an iPhone, the share sheet where there is none. */
  readonly previewed: string[];
  readonly played: string[];
  readonly posters: string[];
  readonly pages: string[];
} {
  const opened: string[] = [];
  const previewed: string[] = [];
  const played: string[] = [];
  const posters: string[] = [];
  const pages: string[] = [];
  return {
    opened,
    previewed,
    played,
    posters,
    pages,
    upload: async () => {
      throw new Error("not here");
    },
    thumb: async (id) => {
      posters.push(id);
      return `file:///thumbs/${id}.webp`;
    },
    file: async (attachment) => `file:///files/${attachment.id}`,
    view: async (attachment) => ({ uri: `file:///views/${attachment.id}`, original: false }),
    play: async (attachment) => {
      played.push(attachment.id);
      return { uri: `file:///play/${attachment.id}.mp4`, beingMade: false };
    },
    streamUrl: async () => undefined,
    async open(attachment) {
      if (options.openFails !== undefined) throw new Error(options.openFails);
      opened.push(attachment.filename);
    },
    async preview(attachment) {
      if (options.openFails !== undefined) throw new Error(options.openFails);
      previewed.push(attachment.filename);
    },
    async page(attachment) {
      pages.push(attachment.id);
      if (options.pageFails !== undefined) throw new Error(options.pageFails);
      if (attachment.mimeType === "text/markdown") {
        return "# Mission murals\n\n- **MaestraPeace:** [NoeHill](https://noehill.com)\n\n<script>x</script>";
      }
      return "<!doctype html><title>Bronze</title><p>The mock</p>";
    },
  };
}

describe("a message's files on the phone", () => {
  it("draws photos as thumbnails, which open nothing outside a room's viewer", async () => {
    const files = fakeFiles();
    await render(<Attachments attachments={[PHOTO, SECOND]} files={files} lineId="ln_1" />);
    await waitFor(() => expect(screen.getByTestId("thumb-att_1")).toBeTruthy());
    expect(screen.getByTestId("thumb-att_1").props["source"]).toEqual({
      uri: "file:///thumbs/att_1.webp",
    });
    expect(screen.getByTestId("thumb-att_2")).toBeTruthy();

    // The viewer is the room's (`MediaProvider`); a grid drawn without one is a picture only.
    await userEvent.press(screen.getByRole("imagebutton", { name: "Open holiday.png" }));
    expect(screen.queryByTestId("viewer")).toBeNull();
    expect(files.opened).toEqual([]);
  });

  it("draws an unmeasured video as a row that plays only in a room's viewer, and opens any other file", async () => {
    const files = fakeFiles();
    await render(<Attachments attachments={[CLIP, PDF]} files={files} lineId="ln_1" />);
    expect(screen.getByText("50.0 MB")).toBeTruthy();
    // Its Play opens the viewer, which is the room's (`MediaProvider`): outside one it offers none.
    expect(screen.queryByRole("button", { name: "Play clip.mp4" })).toBeNull();
    // A video the server never measured has no poster to ask for.
    expect(files.posters).toEqual([]);
    expect(files.played).toEqual([]);

    // A PDF is shown, in Quick Look where the phone has it (ADR 0124), not handed on.
    await userEvent.press(screen.getByRole("button", { name: "Open invoice.pdf" }));
    await waitFor(() => expect(files.previewed).toEqual(["invoice.pdf"]));
    expect(files.opened).toEqual([]);
  });

  it("shows a measured video as its poster with how long it runs, a tile that opens the viewer", async () => {
    const files = fakeFiles();
    await render(<Attachments attachments={[MEASURED]} files={files} lineId="ln_1" />);
    await waitFor(() => expect(screen.getByTestId("poster-att_5")).toBeTruthy());
    expect(screen.getByTestId("poster-att_5").props["source"]).toEqual({
      uri: "file:///thumbs/att_5.webp",
    });
    expect(screen.getByText("0:43")).toBeTruthy();
    // It wears the viewer's play disc, at the size Messages gives one, not a glyph (ADR 0163).
    expect(StyleSheet.flatten(screen.getByTestId("play-disc").props["style"])).toMatchObject({
      width: 44,
      height: 44,
    });
    expect(screen.queryByText("▶")).toBeNull();
    // Not a row with a size: the tile is the video.
    expect(screen.queryByTestId("file-att_5")).toBeNull();

    // Outside a room's viewer a tap plays nothing: nothing is fetched, and no player is drawn.
    await userEvent.press(screen.getByRole("button", { name: "Play IMG_4410.MOV" }));
    expect(screen.queryByTestId("viewer")).toBeNull();
    expect(files.played).toEqual([]);
  });

  it("puts a message's photos and measured videos in one album, in the order it listed them", async () => {
    const files = fakeFiles();
    const photos = ["a", "b", "c", "d", "e"].map((id) => ({ ...PHOTO, id, filename: `${id}.png` }));
    const [a, b, c, d, e] = photos as [Attachment, Attachment, Attachment, Attachment, Attachment];
    await render(
      <Attachments attachments={[a, MEASURED, PDF, b, c, d, e]} files={files} lineId="ln_1" />,
    );
    const grid = screen.getByTestId("photo-grid");
    // Two by two, the clip second as the message had it; the fifth and sixth past the grid are
    // `+2` on the fourth, and the PDF is a row of its own under the album.
    expect(
      within(grid)
        .getAllByRole(/^(image)?button$/)
        .map((tile) => tile.props["accessibilityLabel"]),
    ).toEqual(["Open a.png", "Play IMG_4410.MOV", "Open b.png", "Open c.png"]);
    expect(within(grid).getByText("+2")).toBeTruthy();
    expect(within(grid).getByText("0:43")).toBeTruthy();
    expect(within(grid).queryByText("invoice.pdf")).toBeNull();
    expect(screen.getByRole("button", { name: "Open invoice.pdf" })).toBeTruthy();
    // Every tile draws with `expo-image`, the stage's own, cropped to its square.
    await waitFor(() => expect(screen.getByTestId("poster-att_5")).toBeTruthy());
    expect(screen.getByTestId("thumb-a").props["contentFit"]).toBe("cover");
    expect(screen.getByTestId("photo-a")).toHaveStyle({ flex: 1, aspectRatio: 1 });
  });

  it("draws three as one tall beside two, as the desktop does", async () => {
    const files = fakeFiles();
    await render(
      <Attachments attachments={[PHOTO, SECOND, MEASURED]} files={files} lineId="ln_1" />,
    );
    expect(screen.getByTestId("photo-att_1")).toHaveStyle({ flex: 2 });
    expect(screen.getByTestId("photo-att_2")).toHaveStyle({ aspectRatio: 1 });
    expect(screen.getByTestId("video-att_5")).toHaveStyle({ aspectRatio: 1 });
  });

  it("keeps a photo alone at its own shape, no taller than 200 points, on the bubble's side", async () => {
    const files = fakeFiles();
    const receipt = { ...SECOND, width: 3024, height: 4032 };
    await render(<Attachments attachments={[receipt]} files={files} lineId="ln_1" mine />);
    // Three by four: 150 by 200, said outright, and never wider than the album.
    expect(screen.getByTestId("photo-att_2")).toHaveStyle({
      width: 150,
      height: 200,
      maxWidth: "100%",
      alignSelf: "flex-end",
    });
    expect(screen.getByTestId("photo-grid")).toHaveStyle({ alignSelf: "flex-end" });
  });

  it("keeps a played copy under the name its type has, since a player goes by the name", () => {
    expect(nameFor("IMG_4410.MOV", "video/mp4")).toBe("IMG_4410.mp4");
    expect(nameFor("IMG_4410.MOV", "video/quicktime")).toBe("IMG_4410.mov");
    expect(nameFor("clip", "video/mp4")).toBe("clip.mp4");
    expect(nameFor("notes.txt", "text/plain")).toBe("notes.txt");
  });

  it("opens an HTML file as a page over the room, with Share and Done (ADR 0059)", async () => {
    const files = fakeFiles();
    await render(<Attachments attachments={[PAGE]} files={files} lineId="ln_1" />);
    await userEvent.press(
      screen.getByRole("button", { name: "Open chess-bronze-theme-approval-mock.html" }),
    );
    const view = await screen.findByTestId("page-view", HIDDEN_TOO);
    expect(files.pages).toEqual(["att_7"]);
    // The file as it came, under the policy of its own (ADR 0059's addendum, SEC-7): its own
    // script runs, what it carries in itself draws and plays, and nothing comes from elsewhere.
    expect(view.props["source"]).toEqual({
      html: `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"><title>Bronze</title><p>The mock</p>`,
    });
    // Every load goes through the rule, and none is handed to the platform on the library's say.
    expect(view.props["originWhitelist"]).toEqual(["*"]);
    expect(view.props["onMessage"]).toBeUndefined();
    expect(view.props["incognito"]).toBe(true);
    expect(view.props["allowFileAccess"]).toBe(false);
    // Nor the camera or the microphone, whatever it asks (SEC-7).
    expect(view.props["mediaCapturePermissionGrantType"]).toBe("deny");
    // Scrolls as the rest of the phone does: unset, the view's rate arrives as zero.
    expect(view.props["decelerationRate"]).toBe("normal");
    expect(view.props["onShouldStartLoadWithRequest"]({ url: "about:blank" })).toBe(true);
    expect(
      view.props["onShouldStartLoadWithRequest"]({
        url: "chips://pair?pair=ABC-234&v=1",
        navigationType: "click",
      }),
    ).toBe(false);
    // Not the share sheet: that is Share's.
    expect(files.opened).toEqual([]);

    await userEvent.press(
      screen.getByRole("button", { name: "Share chess-bronze-theme-approval-mock.html" }),
    );
    await waitFor(() => expect(files.opened).toEqual(["chess-bronze-theme-approval-mock.html"]));
    await userEvent.press(screen.getByRole("button", { name: "Close the page" }));
    expect(screen.queryByTestId("page-sheet")).toBeNull();
  });

  it("gives Android's page none of iOS's words, which it would read as a number or a list and fall over", async () => {
    const android = jest.replaceProperty(Platform, "OS", "android");
    try {
      await render(<Attachments attachments={[PAGE]} files={fakeFiles()} lineId="ln_1" />);
      await userEvent.press(
        screen.getByRole("button", { name: "Open chess-bronze-theme-approval-mock.html" }),
      );
      const view = await screen.findByTestId("page-view", HIDDEN_TOO);
      expect(view.props["decelerationRate"]).toBeUndefined();
      expect(view.props["dataDetectorTypes"]).toBeUndefined();
      // And opens nothing outside, since Android cannot say a tap from the page leaving (SEC-7).
      expect(
        view.props["onShouldStartLoadWithRequest"]({
          url: "https://chess.example/rules",
          navigationType: "other",
          isTopFrame: true,
        }),
      ).toBe(false);
    } finally {
      android.restore();
    }
  });

  it("opens a Markdown file as a page made from it, in the app's own ink (ADR 0123)", async () => {
    const files = fakeFiles();
    await render(<Attachments attachments={[TOUR]} files={files} lineId="ln_1" />);
    await userEvent.press(
      screen.getByRole("button", { name: "Open mission-murals-walking-tour.md" }),
    );
    const view = await screen.findByTestId("page-view", HIDDEN_TOO);
    expect(files.pages).toEqual(["att_8"]);
    const html: string = view.props["source"].html;
    expect(html).toContain("<h1>Mission murals</h1>");
    expect(html).toContain(
      '<li><strong>MaestraPeace:</strong> <a href="https://noehill.com" target="_blank" rel="noopener noreferrer">NoeHill</a></li>',
    );
    // The author's HTML is words, and the page may run nothing.
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("default-src 'none'");
    // The phone's light palette and a message's size, and the same ground past its edges.
    expect(html).toContain("background: #fbfbf8;");
    expect(html).toContain("font: 17px/1.5");
    expect(view).toHaveStyle({ backgroundColor: "#fbfbf8" });
    expect(files.opened).toEqual([]);
    await userEvent.press(
      screen.getByRole("button", { name: "Share mission-murals-walking-tour.md" }),
    );
    await waitFor(() => expect(files.opened).toEqual(["mission-murals-walking-tour.md"]));
  });

  it("holds the page back until it has a document to draw, and says so meanwhile", async () => {
    await render(<Attachments attachments={[PAGE]} files={fakeFiles()} lineId="ln_1" />);
    await userEvent.press(
      screen.getByRole("button", { name: "Open chess-bronze-theme-approval-mock.html" }),
    );
    // The view has the document and is on the glass, and *Opening…* is still over it: a web view's
    // canvas is white from the moment it is mounted, and blank paper is not the page.
    const view = await screen.findByTestId("page-view", HIDDEN_TOO);
    expect(screen.getByTestId("page-reading")).toBeTruthy();
    await act(async () => view.props["onLoadEnd"]());
    // Then the page arrives and *Opening…* fades from over it, and is gone once it has.
    await waitFor(() => expect(screen.queryByTestId("page-reading")).toBeNull());
    expect(screen.getByTestId("page-view")).toBeOnTheScreen();
  });

  it("says why a page would not open, and keeps Share", async () => {
    const files = fakeFiles({ pageFails: "This page is too large to open here." });
    await render(<Attachments attachments={[PAGE]} files={files} />);
    await userEvent.press(
      screen.getByRole("button", { name: "Open chess-bronze-theme-approval-mock.html" }),
    );
    expect(await screen.findByTestId("page-failed")).toHaveTextContent(
      "This page is too large to open here.",
    );
    expect(
      screen.getByRole("button", { name: "Share chess-bronze-theme-approval-mock.html" }),
    ).toBeTruthy();
  });

  it("hands an HTML file to the share sheet on a build that cannot draw a page", async () => {
    jest.mocked(hasPageView).mockReturnValue(false);
    try {
      const files = fakeFiles();
      await render(<Attachments attachments={[PAGE]} files={files} />);
      await userEvent.press(
        screen.getByRole("button", { name: "Open chess-bronze-theme-approval-mock.html" }),
      );
      await waitFor(() =>
        expect(files.previewed).toEqual(["chess-bronze-theme-approval-mock.html"]),
      );
      expect(files.pages).toEqual([]);
      expect(screen.queryByTestId("page-sheet")).toBeNull();
    } finally {
      jest.mocked(hasPageView).mockReturnValue(true);
    }
  });

  it("puts the keyboard away as a row opens, whatever the row opens over the room", async () => {
    const away = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    try {
      await render(<Attachments attachments={[PDF]} files={fakeFiles()} />);
      await userEvent.press(screen.getByRole("button", { name: "Open invoice.pdf" }));
      expect(away).toHaveBeenCalled();
    } finally {
      away.mockRestore();
    }
  });

  it("says why when a file would not open", async () => {
    const files = fakeFiles({ openFails: "Sharing is not available on this device." });
    await render(<Attachments attachments={[PDF]} files={files} />);
    await userEvent.press(screen.getByRole("button", { name: "Open invoice.pdf" }));
    expect(await screen.findByText("Sharing is not available on this device.")).toBeTruthy();
  });

  it("shows a voice note's words under Play, and plays the sound here on a tap (ADR 0054)", async () => {
    const files = fakeFiles();
    const fetched: string[] = [];
    await render(
      <Attachments
        attachments={[VOICE]}
        files={{
          ...files,
          file: async (attachment) => {
            fetched.push(attachment.id);
            return `file:///files/${attachment.id}.m4a`;
          },
        }}
      />,
    );
    expect(screen.getByText("Voice note")).toBeTruthy();
    expect(screen.getByText("0:08")).toBeTruthy();
    expect(screen.getByTestId("transcript-att_6")).toHaveTextContent(
      "Send Priya the receipt from the hardware store.",
    );
    // Nothing is fetched until somebody wants to hear it.
    expect(fetched).toEqual([]);

    await userEvent.press(screen.getByRole("button", { name: "Play Voice note" }));
    await waitFor(() => expect(screen.getByTestId("voice-player")).toBeTruthy());
    expect(fetched).toEqual(["att_6"]);
    const { player } = audio as unknown as { player: { play: jest.Mock } };
    await waitFor(() => expect(player.play).toHaveBeenCalled());
  });

  it("hands a voice note to the share sheet on a build that cannot play it, and keeps its words", async () => {
    jest.mocked(hasAudio).mockReturnValueOnce(false);
    const files = fakeFiles();
    await render(<Attachments attachments={[VOICE]} files={files} />);
    await userEvent.press(screen.getByRole("button", { name: "Play Voice note" }));
    await waitFor(() => expect(files.previewed).toEqual(["voice-note-0913-1142.m4a"]));
    expect(screen.queryByTestId("voice-player")).toBeNull();
    expect(screen.getByTestId("transcript-att_6")).toBeTruthy();
  });

  it("lists files as rows that open nothing when this phone has no file service", async () => {
    await render(<Attachments attachments={[PHOTO, PDF, VOICE]} />);
    expect(screen.getByText("holiday.png")).toBeTruthy();
    // A voice note's words are there to read without a byte fetched.
    expect(screen.getByTestId("transcript-att_6")).toBeTruthy();
    expect(screen.getByText("invoice.pdf")).toBeTruthy();
    expect(screen.queryByTestId("thumb-att_1")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open invoice.pdf" })).toBeNull();
  });
});

describe("a photo of yours on its way from the composer", () => {
  const watch = () => ({ aim: { value: undefined }, settled: { value: 0 } }) as never;

  it("keeps the tile out of sight while the picture flies to it, watched, and shows it once landed", async () => {
    const files = fakeFiles();
    const landing = makeLanding(watch(), [watch(), watch()]);
    landing.hold("msg-a", ["att_1"]);
    await render(
      <SendLandingContext.Provider value={landing}>
        <Attachments
          attachments={[PHOTO, SECOND]}
          files={files}
          lineId="ln_1"
          lineKey="msg-a"
          mine
        />
      </SendLandingContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("thumb-att_1")).toBeTruthy());
    // The first tile is held for its picture, and watched for it; the second, not flown, is drawn.
    expect(screen.getByTestId("photo-att_1")).toHaveStyle({ opacity: 0 });
    expect(within(screen.getByTestId("photo-att_1")).getByTestId("bubble-watch")).toBeTruthy();
    expect(screen.getByTestId("photo-att_2")).not.toHaveStyle({ opacity: 0 });
    expect(within(screen.getByTestId("photo-att_2")).queryByTestId("bubble-watch")).toBeNull();

    // Landed: the tile shows, and the watch is done with.
    await act(async () => {
      landing.hold(undefined);
    });
    expect(screen.getByTestId("photo-att_1")).not.toHaveStyle({ opacity: 0 });
    expect(within(screen.getByTestId("photo-att_1")).queryByTestId("bubble-watch")).toBeNull();
  });

  it("holds nothing under somebody else's line, nor under a line of yours whose photos did not fly", async () => {
    const files = fakeFiles();
    const landing = makeLanding(watch(), [watch()]);
    landing.hold("msg-a", ["att_1"]);
    await render(
      <SendLandingContext.Provider value={landing}>
        <Attachments attachments={[PHOTO]} files={files} lineId="ln_2" lineKey="msg-b" mine />
      </SendLandingContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("thumb-att_1")).toBeTruthy());
    expect(screen.getByTestId("photo-att_1")).not.toHaveStyle({ opacity: 0 });
  });
});
