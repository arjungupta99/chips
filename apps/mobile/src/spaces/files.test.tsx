/**
 * What the viewer is given to draw (`files.view`): the view copy where the server makes one, and
 * the file itself where it does not — which the server says, or a server from before the copy
 * either answers `view` with the file, which is kept once and is the file from then on, or refuses
 * it with a 404, and then the file is fetched as the file. What it plays a video from: a download
 * (`files.play`), or a grant's URL (`files.streamUrl`). The network is core's and is faked here; so
 * is the disk.
 */

import { type Attachment, type Device, UploadError } from "@chipschat/core";
import { createFileService } from "./files";

const mockFetched: string[] = [];
let mockAnswer: (
  id: string,
  variant: string,
  copyOnly: boolean,
) => { bytes: Uint8Array; mimeType: string; playable?: string; view?: string } | Error;
/** What the fake server grants: a grant, nothing (the relay, or a server from before), or a refusal. */
let mockGrant: (
  id: string,
) => { url: string; expiresAt: number; variant: string; playable?: string } | undefined | Error;
const mockGranted: string[] = [];
/** What the fake download says as it goes, before it answers. */
let mockProgress: [number, number | undefined][] = [];
let mockHold: Promise<void> = Promise.resolve();
/** Downloads that were let go of before they finished, by attachment. */
const mockStopped: string[] = [];

jest.mock("@chipschat/core", () => {
  const actual = jest.requireActual("@chipschat/core");
  return {
    ...actual,
    fetchAttachmentWithType: jest.fn(
      async (
        _device: unknown,
        id: string,
        variant: string,
        options: {
          onProgress?: (received: number, total: number | undefined) => void;
          copyOnly?: boolean;
          signal?: AbortSignal;
        } = {},
      ) => {
        const copyOnly = options.copyOnly === true;
        mockFetched.push(`${copyOnly ? "copy" : variant}:${id}`);
        const [first, ...rest] = mockProgress;
        if (first !== undefined) options.onProgress?.(...first);
        await Promise.race([
          mockHold,
          new Promise<void>((letGo) => options.signal?.addEventListener("abort", () => letGo())),
        ]);
        if (options.signal?.aborted === true) {
          mockStopped.push(id);
          throw Object.assign(new Error("The download was let go of."), { name: "AbortError" });
        }
        for (const each of rest) options.onProgress?.(...each);
        const given = mockAnswer(id, variant, copyOnly);
        if (given instanceof Error) throw given;
        return given;
      },
    ),
    grantAttachment: jest.fn(async (_device: unknown, id: string, variant: string) => {
      mockGranted.push(`${variant}:${id}`);
      const given = mockGrant(id);
      if (given instanceof Error) throw given;
      return given;
    }),
    fetchAttachmentBytes: jest.fn(async (_device: unknown, id: string, variant = "file") => {
      mockFetched.push(`${variant}:${id}`);
      const given = mockAnswer(id, variant, false);
      if (given instanceof Error) throw given;
      return given.bytes;
    }),
  };
});

let mockClearings = 0;
const mockLetGo: string[] = [];
/** What the phone already keeps, as `findKept` finds it: `part:id` to its URI. */
const mockOnPhone = new Map<string, string>();
jest.mock("./local", () => ({
  keptClearings: () => mockClearings,
  keptLetGo: () => mockLetGo,
  findKept: (id: string, part: string) => mockOnPhone.get(`${part}:${id}`),
  keepLocally: jest.fn(async (id: string, name: string) => `file:///kept/${id}-${name}`),
  openLocally: jest.fn(async () => undefined),
  previewLocally: jest.fn(async () => undefined),
  openSource: jest.fn(),
}));

const RECEIPT: Attachment = {
  id: "att_1",
  filename: "receipt.jpg",
  mimeType: "image/jpeg",
  byteSize: 6,
  width: 3024,
  height: 4032,
};

const device = {} as Device;

beforeEach(() => {
  mockOnPhone.clear();
  mockFetched.length = 0;
  mockStopped.length = 0;
  mockGranted.length = 0;
  mockGrant = () => undefined;
  mockProgress = [];
  mockHold = Promise.resolve();
});

describe("what the viewer is given to draw", () => {
  it("is fetched again once what was kept has been cleared from You (ADR 0085)", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
    const files = createFileService(device);
    await files.view(RECEIPT);
    await files.view(RECEIPT);
    expect(mockFetched).toEqual(["view:att_1"]);
    mockClearings += 1;
    await files.view(RECEIPT);
    expect(mockFetched).toEqual(["view:att_1", "view:att_1"]);
  });

  it("is fetched again once its own files were let go from Media on this phone, and no other (ADR 0159)", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
    const files = createFileService(device);
    const other = { ...RECEIPT, id: "att_2" };
    await files.view(RECEIPT);
    await files.view(other);
    await files.thumb(RECEIPT.id);
    mockLetGo.push(RECEIPT.id);
    await files.view(RECEIPT);
    await files.view(other);
    await files.thumb(RECEIPT.id);
    expect(mockFetched).toEqual([
      "view:att_1",
      "view:att_2",
      "thumb:att_1",
      "view:att_1",
      "thumb:att_1",
    ]);
  });

  it("is what the phone already keeps, from a day the app was open before, with nothing fetched (ADR 0161)", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
    mockOnPhone.set("thumb:att_1", "file:///kept/att_1-thumb-thumb.webp");
    mockOnPhone.set("view:att_1", "file:///kept/att_1-view-view.webp");
    mockOnPhone.set("file:att_1", "file:///kept/att_1-receipt.jpg");
    const files = createFileService(device);
    expect(await files.thumb("att_1")).toBe("file:///kept/att_1-thumb-thumb.webp");
    expect(await files.view(RECEIPT)).toEqual({
      uri: "file:///kept/att_1-view-view.webp",
      original: false,
    });
    expect(await files.file(RECEIPT)).toBe("file:///kept/att_1-receipt.jpg");
    expect(mockFetched).toEqual([]);
  });

  it("is a photo's own file where only that is kept, and fetched where nothing is", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
    mockOnPhone.set("file:att_1", "file:///kept/att_1-receipt.jpg");
    const files = createFileService(device);
    expect(await files.view(RECEIPT)).toEqual({
      uri: "file:///kept/att_1-receipt.jpg",
      original: true,
    });
    expect(await files.view({ ...RECEIPT, id: "att_2" })).toEqual({
      uri: "file:///kept/att_2-view-view.webp",
      original: false,
    });
    expect(mockFetched).toEqual(["view:att_2"]);
  });

  it("is the view copy, kept apart from the file, where the server made one", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/webp" });
    const files = createFileService(device);
    expect(await files.view(RECEIPT)).toEqual({
      uri: "file:///kept/att_1-view-view.webp",
      original: false,
    });
    // Asked once however often it is drawn.
    await files.view(RECEIPT);
    expect(mockFetched).toEqual(["view:att_1"]);
  });

  it("is the file itself, kept once as the file, when the server says so, whatever its size", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array(4), mimeType: "image/gif", view: "original" });
    const files = createFileService(device);
    expect(await files.view({ ...RECEIPT, mimeType: "image/gif" })).toEqual({
      uri: "file:///kept/att_1-receipt.jpg",
      original: true,
    });
    // And a copy the server says is the copy is one, even at the file's size and type.
    mockAnswer = () => ({ bytes: new Uint8Array(6), mimeType: "image/jpeg", view: "copy" });
    expect(await createFileService(device).view(RECEIPT)).toEqual({
      uri: "file:///kept/att_1-view-view.jpg",
      original: false,
    });
  });

  it("is the file itself, kept once as the file, from a server that answers with it", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array(6), mimeType: "image/jpeg" });
    const files = createFileService(device);
    expect(await files.view(RECEIPT)).toEqual({
      uri: "file:///kept/att_1-receipt.jpg",
      original: true,
    });
    // Share and Save want the file: it is the same bytes, and not mockFetched a second time.
    expect(await files.file(RECEIPT)).toBe("file:///kept/att_1-receipt.jpg");
    expect(mockFetched).toEqual(["view:att_1"]);
  });

  it("is the file, fetched as the file, from a server that refuses the view with a 404", async () => {
    mockAnswer = (_id, variant) =>
      variant === "view"
        ? new UploadError("Could not fetch the attachment: no such variant.", 404)
        : { bytes: new Uint8Array(6), mimeType: "image/jpeg" };
    const files = createFileService(device);
    expect(await files.view(RECEIPT)).toEqual({
      uri: "file:///kept/att_1-receipt.jpg",
      original: true,
    });
    expect(mockFetched).toEqual(["view:att_1", "file:att_1"]);
  });

  it("says why when the server could not be reached, and asks again next time", async () => {
    mockAnswer = () =>
      new UploadError("Could not fetch the attachment: the server did not answer.");
    const files = createFileService(device);
    await expect(files.view(RECEIPT)).rejects.toThrow("the server did not answer");
    mockAnswer = () => ({ bytes: new Uint8Array([1]), mimeType: "image/webp" });
    expect((await files.view(RECEIPT)).original).toBe(false);
    expect(mockFetched).toEqual(["view:att_1", "view:att_1"]);
  });
});

const CLIP: Attachment = {
  id: "att_clip",
  filename: "IMG_4410.MOV",
  mimeType: "video/quicktime",
  byteSize: 10,
  durationMs: 42_500,
};

describe("what the viewer plays a video from", () => {
  it("is the copy the phone already keeps, with nothing fetched, unless Try again asks for the copy (ADR 0161)", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array(8), mimeType: "video/mp4", playable: "done" });
    mockOnPhone.set("play:att_clip", "file:///kept/att_clip-play-IMG_4410.mp4");
    const files = createFileService(device);
    expect(await files.play(CLIP)).toEqual({
      uri: "file:///kept/att_clip-play-IMG_4410.mp4",
      beingMade: false,
    });
    expect(mockFetched).toEqual([]);
    // Try again, after what was kept would not play: the server is asked for its copy alone.
    await files.play(CLIP, undefined, true);
    expect(mockFetched).toEqual(["copy:att_clip"]);
  });

  it("is the copy that plays everywhere, named for what came, and heard as it comes", async () => {
    mockAnswer = () => ({ bytes: new Uint8Array(8), mimeType: "video/mp4", playable: "done" });
    mockProgress = [
      [0, 8],
      [4, 8],
      [8, 8],
    ];
    const files = createFileService(device);
    const heard: [number, number | undefined][] = [];
    expect(await files.play(CLIP, (received, total) => void heard.push([received, total]))).toEqual(
      {
        uri: "file:///kept/att_clip-play-IMG_4410.mp4",
        beingMade: false,
      },
    );
    expect(heard).toEqual(mockProgress);
    // Fetched once, however often it is played.
    await files.play(CLIP);
    expect(mockFetched).toEqual(["play:att_clip"]);
  });

  it("says when the original is playing because the copy is still being made, and only then", async () => {
    mockAnswer = (id) => ({
      bytes: new Uint8Array(10),
      mimeType: "video/quicktime",
      playable: id === "att_clip" ? "pending" : "skipped",
    });
    const files = createFileService(device);
    expect((await files.play(CLIP)).beingMade).toBe(true);
    expect((await files.play({ ...CLIP, id: "att_h264" })).beingMade).toBe(false);
  });

  it("tells a second listener where the download has got to, and then the rest", async () => {
    let release: () => void = () => undefined;
    mockHold = new Promise((resolve) => {
      release = resolve;
    });
    mockProgress = [
      [3, 10],
      [10, 10],
    ];
    mockAnswer = () => ({ bytes: new Uint8Array(10), mimeType: "video/mp4" });
    const files = createFileService(device);
    const first = files.play(CLIP);
    await Promise.resolve();
    const heard: [number, number | undefined][] = [];
    const second = files.play(CLIP, (received, total) => void heard.push([received, total]));
    expect(heard).toEqual([[3, 10]]);
    release();
    await Promise.all([first, second]);
    expect(heard).toEqual([
      [3, 10],
      [10, 10],
    ]);
    expect(mockFetched).toEqual(["play:att_clip"]);
  });

  it("stops a download once everyone who asked has let go, and starts it again when asked (ADR 0153)", async () => {
    let release: () => void = () => undefined;
    mockHold = new Promise((resolve) => {
      release = resolve;
    });
    mockAnswer = () => ({ bytes: new Uint8Array(10), mimeType: "video/mp4" });
    const files = createFileService(device);
    const viewer = new AbortController();
    const again = new AbortController();
    const first = files.play(CLIP, undefined, false, viewer.signal);
    const second = files.play(CLIP, undefined, false, again.signal);
    viewer.abort();
    await Promise.resolve();
    // One asker still wants it.
    expect(mockStopped).toEqual([]);
    again.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(mockStopped).toEqual(["att_clip"]);

    // Asked again, it is fetched again; and an asker that gave no signal keeps it to the end.
    const kept = files.play(CLIP);
    const passing = new AbortController();
    const glance = files.play(CLIP, undefined, false, passing.signal);
    passing.abort();
    release();
    expect(await kept).toEqual(await glance);
    expect(mockFetched).toEqual(["play:att_clip", "play:att_clip"]);
    expect(mockStopped).toEqual(["att_clip"]);
  });

  it("asks for the copy alone when the original would not play, keeping the original until it comes", async () => {
    const files = createFileService(device);
    let state = "pending";
    mockAnswer = (_id, _variant, copyOnly) =>
      copyOnly && state !== "done"
        ? { bytes: new Uint8Array(0), mimeType: "video/quicktime", playable: state }
        : state === "done"
          ? { bytes: new Uint8Array(4), mimeType: "video/mp4", playable: "done" }
          : { bytes: new Uint8Array(10), mimeType: "video/quicktime", playable: "pending" };
    const original = { uri: "file:///kept/att_clip-play-IMG_4410.mov", beingMade: true };
    expect(await files.play(CLIP)).toEqual(original);
    // Asked again without `forCopy`, it is the download already here.
    expect(await files.play(CLIP)).toEqual(original);
    // For the copy, still being made: the server is asked, and the original stays.
    expect(await files.play(CLIP, undefined, true)).toEqual(original);
    // Made now: the copy comes, and is what plays from then on.
    state = "done";
    const copy = { uri: "file:///kept/att_clip-play-IMG_4410.mp4", beingMade: false };
    expect(await files.play(CLIP, undefined, true)).toEqual(copy);
    expect(await files.play(CLIP, undefined, true)).toEqual(copy);
    expect(mockFetched).toEqual(["play:att_clip", "copy:att_clip", "copy:att_clip"]);
  });

  it("keeps the original when asking for the copy fails, and says when no copy will come", async () => {
    const files = createFileService(device);
    mockAnswer = () => ({
      bytes: new Uint8Array(10),
      mimeType: "video/quicktime",
      playable: "pending",
    });
    const original = await files.play(CLIP);
    mockAnswer = () => new UploadError("Could not fetch the attachment: the tunnel closed.");
    await expect(files.play(CLIP, undefined, true)).rejects.toThrow("the tunnel closed");
    expect(await files.play(CLIP)).toEqual(original);
    mockAnswer = () => ({
      bytes: new Uint8Array(0),
      mimeType: "video/quicktime",
      playable: "failed",
    });
    expect(await files.play(CLIP, undefined, true)).toEqual({ ...original, beingMade: false });
    // Nothing more to ask for: the original is what there is.
    await files.play(CLIP, undefined, true);
    expect(mockFetched).toEqual(["play:att_clip", "copy:att_clip", "copy:att_clip"]);
  });

  it("asks again after a download that failed", async () => {
    mockAnswer = () => new UploadError("Could not fetch the attachment: the tunnel closed.");
    const files = createFileService(device);
    await expect(files.play(CLIP)).rejects.toThrow("the tunnel closed");
    mockAnswer = () => ({ bytes: new Uint8Array(10), mimeType: "video/mp4" });
    expect((await files.play(CLIP)).uri).toBe("file:///kept/att_clip-play-IMG_4410.mp4");
    expect(mockFetched).toEqual(["play:att_clip", "play:att_clip"]);
  });
});

describe("what the viewer streams a video from (ADR 0058)", () => {
  const CLIP: Attachment = {
    id: "att_clip",
    filename: "IMG_4410.MOV",
    mimeType: "video/quicktime",
    byteSize: 40_000_000,
    durationMs: 42_000,
  };

  it("is the copy the phone already keeps, before any grant is asked for, unless Try again (ADR 0161)", async () => {
    mockGrant = (id) => ({
      url: `http://mac.tail.ts.net/v1/attachments/${id}?variant=play`,
      expiresAt: Date.now() + 11 * 60_000,
      variant: "play",
      playable: "done",
    });
    mockOnPhone.set("play:att_clip", "file:///kept/att_clip-play-IMG_4410.mp4");
    const files = createFileService(device);
    expect(await files.streamUrl(CLIP)).toEqual({
      uri: "file:///kept/att_clip-play-IMG_4410.mp4",
      beingMade: false,
    });
    expect(mockGranted).toEqual([]);
    expect((await files.streamUrl(CLIP, true))?.streamed).toBe(true);
    expect(mockGranted).toEqual(["play:att_clip"]);
  });

  it("is a grant's URL, kept while it has more than a minute to run, and asked for again after", async () => {
    let now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    let issued = 0;
    mockGrant = (id) => {
      issued += 1;
      return {
        url: `http://mac.tail.ts.net/v1/attachments/${id}?variant=play&dev=d&exp=${issued}&sig=s`,
        expiresAt: now + 11 * 60_000,
        variant: "play",
        playable: "done",
      };
    };
    const files = createFileService(device);
    const first = await files.streamUrl(CLIP);
    expect(first).toEqual({
      uri: "http://mac.tail.ts.net/v1/attachments/att_clip?variant=play&dev=d&exp=1&sig=s",
      beingMade: false,
      streamed: true,
    });
    now += 9 * 60_000;
    expect(await files.streamUrl(CLIP)).toBe(first);
    now += 90_000;
    expect((await files.streamUrl(CLIP))?.uri).toContain("exp=2");
    // Nothing is fetched to the phone.
    expect(mockFetched).toEqual([]);
    expect(mockGranted).toEqual(["play:att_clip", "play:att_clip"]);
    jest.restoreAllMocks();
  });

  it("says the original is streaming while the copy is being made, and asks afresh when told", async () => {
    let playable = "pending";
    mockGrant = (id) => ({
      url: `http://mac/v1/attachments/${id}?dev=d&exp=1&sig=${playable}`,
      expiresAt: Date.now() + 600_000,
      variant: playable === "done" ? "play" : "file",
      playable,
    });
    const files = createFileService(device);
    expect(await files.streamUrl(CLIP)).toMatchObject({ beingMade: true, streamed: true });
    playable = "done";
    expect(await files.streamUrl(CLIP)).toMatchObject({ beingMade: true });
    expect(await files.streamUrl(CLIP, true)).toEqual({
      uri: "http://mac/v1/attachments/att_clip?dev=d&exp=1&sig=done",
      beingMade: false,
      streamed: true,
    });
  });

  it("is nothing through the relay or from a server that grants nothing, and nothing when it refuses", async () => {
    const files = createFileService(device);
    mockGrant = () => undefined;
    expect(await files.streamUrl(CLIP)).toBeUndefined();
    mockGrant = () => new UploadError("Could not play it here: the server did not answer.");
    expect(await files.streamUrl(CLIP)).toBeUndefined();
    // And it asks again next time, having kept nothing.
    mockGrant = (id) => ({
      url: `http://mac/${id}`,
      expiresAt: Date.now() + 600_000,
      variant: "play",
    });
    expect(await files.streamUrl(CLIP)).toMatchObject({ uri: "http://mac/att_clip" });
  });
});
