/**
 * The web's lightbox under jsdom: the deck it opens with, the keys, where the focus goes, and each
 * action (the media viewer proposal, §4.3).
 *
 * What is *not* asked here is what jsdom does not have: the platform's focus trap, the top layer,
 * the backdrop, a real decoder, and every measurement a gesture needs — `clientWidth` is nought in
 * jsdom, so a stage has no size and `fitRect` fits nothing. Those are a browser's, and
 * `e2e/viewer.spec.ts` asks them of one, on a desktop viewport and a Pixel's.
 *
 * The arithmetic itself — when a swipe pages, when a drag closes, how far a zoom goes — is core's
 * and is property-tested there (`packages/core/src/viewer.test.ts`). This file asks only that the
 * lightbox is wired to it.
 */

import type { Attachment, Directory, Line, Space } from "@chipschat/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFiles } from "../../testing/files.ts";
import { Attachments } from "../Attachments.tsx";
import { ViewerHost } from "./ViewerHost.tsx";

const PHOTO = (n: number, over: Partial<Attachment> = {}): Attachment => ({
  id: `att_${n}`,
  filename: `photo-${n}.jpg`,
  mimeType: "image/jpeg",
  byteSize: 1024 * n,
  width: 1600,
  height: 1200,
  ...over,
});

const CLIP: Attachment = {
  id: "att_clip",
  filename: "IMG_4410.MOV",
  mimeType: "video/quicktime",
  byteSize: 66_000_000,
  width: 1920,
  height: 1080,
  durationMs: 43_000,
};

const DIRECTORY: Directory = {
  per_1: { id: "per_1", kind: "person", displayName: "Arjun" },
} as unknown as Directory;

function line(id: string, attachments: readonly Attachment[], seq: number): Line {
  return {
    id,
    seq,
    kind: "text",
    authorId: "per_1",
    authorKind: "person",
    text: "",
    ts: "2026-09-16T11:26:00.000Z",
    attachments,
  } as Line;
}

function space(lines: readonly Line[]): Space {
  return {
    id: "spc_1",
    kind: "direct",
    members: ["per_1"],
    roles: {},
    state: "open",
    lastEventSeq: lines.length,
    lines,
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
  } as unknown as Space;
}

/** A room of two messages: two photos in the first, one in the second. */
function room(files = fakeFiles(), onGoToMessage?: (lineId: string) => void) {
  const lines = [line("lin_1", [PHOTO(1), PHOTO(2)], 1), line("lin_2", [PHOTO(3)], 2)];
  const drawn = render(
    <ViewerHost
      space={space(lines)}
      lanes={[]}
      directory={DIRECTORY}
      files={files}
      {...(onGoToMessage === undefined ? {} : { onGoToMessage })}
    >
      {lines.map((each) => (
        <Attachments
          key={each.id}
          attachments={each.attachments ?? []}
          files={files}
          lineId={each.id}
        />
      ))}
    </ViewerHost>,
  );
  return { ...drawn, files, lines };
}

const openFirst = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Open photo-1.jpg" }));
  return await screen.findByRole("dialog");
};

const press = (key: string) => fireEvent.keyDown(screen.getByRole("dialog"), { key });

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the deck a click opens", () => {
  it("is the media of the messages around the one tapped, and says where it stands", async () => {
    room();
    await openFirst();
    // Three photos across two messages, oldest first, landed on the one tapped.
    expect(screen.getByTestId("viewer-count").textContent).toBe("1 of 3");
    expect(screen.getByTestId("viewer-said").textContent).toContain("Photo 1 of 3, photo-1.jpg");
    expect(screen.getByTestId("viewer-said").textContent).toContain("from Arjun");
  });

  it("opens on the photo that was clicked, not on the first of the deck", async () => {
    room();
    fireEvent.click(screen.getByRole("button", { name: "Open photo-3.jpg" }));
    await screen.findByRole("dialog");
    expect(screen.getByTestId("viewer-count").textContent).toBe("3 of 3");
  });

  it("says which of a message's own photos it is, when the message carried several", async () => {
    room();
    await openFirst();
    expect(screen.getByText(/1 of 2/)).toBeDefined();
  });
});

describe("the keys (§4.3)", () => {
  it("pages with the arrows and goes to the ends with Home and End", async () => {
    room();
    await openFirst();
    press("ArrowRight");
    expect(screen.getByTestId("viewer-count").textContent).toBe("2 of 3");
    press("ArrowLeft");
    expect(screen.getByTestId("viewer-count").textContent).toBe("1 of 3");
    press("End");
    expect(screen.getByTestId("viewer-count").textContent).toBe("3 of 3");
    press("Home");
    expect(screen.getByTestId("viewer-count").textContent).toBe("1 of 3");
  });

  it("does not wrap at either end", async () => {
    room();
    await openFirst();
    press("ArrowLeft");
    expect(screen.getByTestId("viewer-count").textContent).toBe("1 of 3");
    press("End");
    press("ArrowRight");
    expect(screen.getByTestId("viewer-count").textContent).toBe("3 of 3");
  });

  it("opens Details on I and the list of keys on ?", async () => {
    room();
    await openFirst();
    press("i");
    expect(screen.getByTestId("viewer-details")).toBeDefined();
    press("i");
    expect(screen.queryByTestId("viewer-details")).toBeNull();
    press("?");
    const keys = screen.getByTestId("viewer-keys");
    expect(within(keys).getByText("Esc")).toBeDefined();
    expect(within(keys).getByText("Close, back to the tile")).toBeDefined();
  });

  it("downloads the file as it was sent on D", async () => {
    const clicked = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clicked);
    const { files } = room();
    await openFirst();
    press("d");
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(await files.file("att_1")).toBe("blob:file-att_1");
  });

  it("closes on Escape, and the platform's cancel is the return rather than a cut", async () => {
    room();
    const dialog = await openFirst();
    fireEvent(dialog, new Event("cancel", { cancelable: true, bubbles: false }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("the focus", () => {
  it("goes to Close on opening and back to the tile on closing", async () => {
    room();
    const tile = screen.getByRole("button", { name: "Open photo-1.jpg" });
    await openFirst();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.activeElement).toBe(tile));
  });

  it("goes back to the tile of whatever is current, which may be another message's", async () => {
    room();
    await openFirst();
    press("End");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open photo-3.jpg" })),
    );
  });
});

describe("the actions (rule 8)", () => {
  it("Open message closes the viewer and lands the room on the line", async () => {
    const landed = vi.fn();
    room(fakeFiles(), landed);
    await openFirst();
    press("End");
    fireEvent.click(screen.getByRole("button", { name: "Open message" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(landed).toHaveBeenCalledWith("lin_2");
  });

  it("Details says the name, the size, the shape, who and when", async () => {
    room();
    await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    const details = screen.getByTestId("viewer-details");
    expect(within(details).getByText("photo-1.jpg")).toBeDefined();
    expect(within(details).getByText("1600 × 1200")).toBeDefined();
    expect(within(details).getByText("Arjun")).toBeDefined();
    expect(within(details).getByText("image/jpeg")).toBeDefined();
  });

  it("Copy image puts a PNG on the clipboard, and says so when the browser will not", async () => {
    const write = vi.fn().mockRejectedValue(new Error("no"));
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    room();
    await openFirst();
    fireEvent.click(screen.getByRole("button", { name: "Copy image" }));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-note").textContent).toBe(
        "This browser would not copy the picture.",
      ),
    );
  });

  it("says so when the browser will not go fullscreen", async () => {
    room();
    const dialog = await openFirst();
    // jsdom has no Fullscreen API at all, so the refusal has to be put there to be refused.
    Object.defineProperty(dialog, "requestFullscreen", {
      value: () => Promise.reject(new Error("no")),
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Fullscreen" }));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-note").textContent).toBe(
        "This browser would not go fullscreen.",
      ),
    );
  });
});

describe("what the stage draws (ADR 0058)", () => {
  it("draws a grant's URL where there is one, so the browser's own loader fetches it", async () => {
    const files = fakeFiles({
      grants: (id, variant) =>
        variant === "view"
          ? {
              url: `/v1/attachments/${id}?variant=view&sig=s`,
              expiresAt: Date.now() + 600_000,
              variant: "view",
              playable: undefined,
            }
          : undefined,
    });
    room(files);
    await openFirst();
    await waitFor(() =>
      expect(screen.getByTestId("viewer-image").getAttribute("src")).toBe(
        "/v1/attachments/att_1?variant=view&sig=s",
      ),
    );
    // And it offers Open original, since what is drawn is the copy made for a viewer.
    expect(screen.getByRole("button", { name: "Open original" })).toBeDefined();
  });

  it("falls back to an object URL of the view where there is no grant", async () => {
    room();
    await openFirst();
    await waitFor(() =>
      expect(screen.getByTestId("viewer-image").getAttribute("src")).toBe("blob:view-att_1"),
    );
  });

  it("offers no Open original where the server gave the photo itself", async () => {
    const files = fakeFiles({ view: (id) => ({ url: `blob:file-${id}`, original: true }) });
    room(files);
    await openFirst();
    await waitFor(() =>
      expect(screen.getByTestId("viewer-image").getAttribute("src")).toBe("blob:file-att_1"),
    );
    expect(screen.queryByRole("button", { name: "Open original" })).toBeNull();
  });

  it("asks with a fresh grant, then for the bytes, before it says it cannot be shown", async () => {
    const files = fakeFiles({
      grants: (id, variant) =>
        variant === "view"
          ? {
              url: `/v1/attachments/${id}?variant=view&sig=s`,
              expiresAt: Date.now() + 600_000,
              variant: "view",
              playable: undefined,
            }
          : undefined,
    });
    room(files);
    await openFirst();
    const picture = await screen.findByTestId("viewer-image");

    // The first failure is taken as a grant that expired under an open lightbox.
    fireEvent.error(picture);
    await waitFor(() => expect(files.asked).toContain("view:att_1 fresh"));
    expect(screen.queryByTestId("viewer-problem")).toBeNull();

    // The second could be nothing coming or what came not drawing: the bytes themselves say which.
    fireEvent.error(await screen.findByTestId("viewer-image"));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-image").getAttribute("src")).toBe("blob:view-att_1"),
    );
    expect(screen.queryByTestId("viewer-problem")).toBeNull();

    // Bytes in the page that will not draw are the browser's to say, with no Try again.
    fireEvent.error(screen.getByTestId("viewer-image"));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-problem").textContent).toBe(
        "This browser cannot show this picture. Download it to see it.",
      ),
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("says a photo that did not come did not come, with why, and Try again asks again", async () => {
    // It used to say the browser could not show it, a dropped connection among the reasons.
    let drops = true;
    room(
      fakeFiles({
        view: (id) => {
          if (drops) throw new Error("The connection dropped.");
          return { url: `blob:view-${id}`, original: false };
        },
      }),
    );
    await openFirst();
    const problem = await screen.findByTestId("viewer-problem");
    expect(within(problem).getByText("Could not fetch the photo.")).toBeDefined();
    expect(within(problem).getByText("The connection dropped.")).toBeDefined();
    expect(problem.textContent).not.toContain("This browser");

    drops = false;
    fireEvent.click(within(problem).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByTestId("viewer-image").getAttribute("src")).toBe("blob:view-att_1"),
    );
    expect(screen.queryByTestId("viewer-problem")).toBeNull();
  });

  it("draws the thumbnail underneath until the bigger picture has loaded", async () => {
    room();
    await openFirst();
    // The current page's own picture: the neighbour beside it is its thumbnail the whole time,
    // since a neighbour is not fetched until it is landed on.
    const page = () => screen.getByTestId("viewer-image").parentElement as HTMLElement;
    await waitFor(() =>
      expect(page().querySelector(".viewer-under")?.getAttribute("src")).toBe("blob:thumb-att_1"),
    );
    fireEvent.load(screen.getByTestId("viewer-image"));
    await waitFor(() => expect(page().querySelector(".viewer-under")).toBeNull());
  });
});

describe("the filmstrip (Arjun, decision 8)", () => {
  it("shows the deck with the current one marked, and goes there on a click", async () => {
    room();
    await openFirst();
    const strip = screen.getByTestId("viewer-filmstrip");
    expect(within(strip).getAllByRole("button")).toHaveLength(3);
    expect(within(strip).getByRole("button", { name: "Photo 1 of 3, photo-1.jpg" })).toHaveProperty(
      "ariaCurrent",
      "true",
    );
    fireEvent.click(within(strip).getByRole("button", { name: "Photo 3 of 3, photo-3.jpg" }));
    expect(screen.getByTestId("viewer-count").textContent).toBe("3 of 3");
  });

  it("goes while zoomed, and a thumb that had the focus leaves it with the dialog, not the page", async () => {
    room();
    const dialog = await openFirst();
    const thumb = within(screen.getByTestId("viewer-filmstrip")).getByRole("button", {
      name: "Photo 3 of 3, photo-3.jpg",
    });
    fireEvent.click(thumb);
    thumb.focus();
    press("+");
    await waitFor(() => expect(dialog.getAttribute("data-zoomed")).toBe("yes"));
    expect(screen.queryByTestId("viewer-filmstrip")).toBeNull();
    // Taken away with the strip, the focus would be on the inert page, and every key after lost.
    expect(document.activeElement).toBe(dialog);
    press("0");
    await waitFor(() => expect(screen.getByTestId("viewer-filmstrip")).toBeDefined());
  });

  it("is not drawn for a deck of one", async () => {
    const files = fakeFiles();
    const lines = [line("lin_1", [PHOTO(1)], 1)];
    render(
      <ViewerHost space={space(lines)} lanes={[]} directory={DIRECTORY} files={files}>
        <Attachments attachments={lines[0]?.attachments ?? []} files={files} lineId="lin_1" />
      </ViewerHost>,
    );
    await openFirst();
    expect(screen.queryByTestId("viewer-filmstrip")).toBeNull();
    expect(screen.getByTestId("viewer-count").textContent).toBe("");
  });
});

describe("a video on the stage", () => {
  const withClip = (files = fakeFiles()) => {
    const lines = [line("lin_1", [CLIP], 1)];
    render(
      <ViewerHost space={space(lines)} lanes={[]} directory={DIRECTORY} files={files}>
        <Attachments attachments={[CLIP]} files={files} lineId="lin_1" />
      </ViewerHost>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play IMG_4410.MOV" }));
    return files;
  };

  it("says the original is playing while the copy that plays everywhere is being made", async () => {
    withClip(
      fakeFiles({
        grants: (id, variant) =>
          variant === "play"
            ? {
                url: `/v1/attachments/${id}?variant=play&sig=s`,
                expiresAt: Date.now() + 600_000,
                variant: "file",
                playable: "pending",
              }
            : undefined,
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("viewer-caption").textContent).toBe(
        "Playing the original · the copy that plays everywhere is being made",
      ),
    );
  });

  it("says this browser cannot play the original, and Try again asks for a fresh grant", async () => {
    const files = withClip(
      fakeFiles({
        grants: (id, variant) =>
          variant === "play"
            ? {
                url: `/v1/attachments/${id}?variant=play&sig=s`,
                expiresAt: Date.now() + 600_000,
                variant: "file",
                playable: "pending",
              }
            : undefined,
      }),
    );
    const player = await screen.findByTestId("viewer-player");
    // The first failure is the grant being asked for afresh, as a picture's is.
    fireEvent.error(player);
    await waitFor(() => expect(files.asked).toContain("play:att_clip fresh"));
    fireEvent.error(await screen.findByTestId("viewer-player"));

    const problem = await screen.findByTestId("viewer-problem");
    expect(within(problem).getByText("This browser cannot play the original.")).toBeDefined();
    expect(
      within(problem).getByText(
        "The copy that plays everywhere is being made. Try again in a minute.",
      ),
    ).toBeDefined();
    fireEvent.click(within(problem).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByTestId("viewer-problem")).toBeNull());
  });

  it("says a video that did not come did not come, not that it would not play", async () => {
    withClip({
      ...fakeFiles(),
      play: async () => {
        throw new Error("The connection dropped.");
      },
    });
    const problem = await screen.findByTestId("viewer-problem");
    expect(within(problem).getByText("Could not fetch the video.")).toBeDefined();
    expect(within(problem).getByText("The connection dropped.")).toBeDefined();
    expect(problem.textContent).not.toContain("came");
  });

  it("fetches the whole copy where there is no grant to be had", async () => {
    withClip();
    const player = await screen.findByTestId("viewer-player");
    expect(player.getAttribute("src")).toBe("blob:play-att_clip");
  });

  it("plays when it is landed on, and Space stops it", async () => {
    withClip();
    const player = (await screen.findByTestId("viewer-player")) as HTMLVideoElement;
    const play = vi.spyOn(player, "play");
    const pause = vi.spyOn(player, "pause");
    Object.defineProperty(player, "paused", { value: false, configurable: true });
    press(" ");
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(player, "paused", { value: true, configurable: true });
    press(" ");
    expect(play).toHaveBeenCalled();
  });
});
