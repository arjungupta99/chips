import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  aloneTile,
  attachmentFromWire,
  fetchAttachment,
  fetchAttachmentBytes,
  fetchAttachmentWithType,
  formatBytes,
  formatDuration,
  grantAttachment,
  hasPoster,
  hasThumbnail,
  inAlbum,
  isVoiceNoteName,
  kindOf,
  pageUrl,
  UploadError,
  uploadFile,
  voiceNoteName,
} from "./attachments.js";
import type { Device } from "./device.js";
import { directLink, dropLink, type Link, reached, useLink } from "./link.js";

vi.mock("./device.js", () => ({
  signRequest: async (_device: unknown, method: string, target: string) => ({
    "x-chips-device": "dev_1",
    "x-test-signed": `${method} ${target}`,
  }),
  // The real one, because where a request goes is part of what these tests assert.
  endpoint: (paired: { serverUrl?: string }, path: string) => `${paired.serverUrl ?? ""}${path}`,
}));

const device = { deviceId: "dev_1", participantId: "usr_1" } as unknown as Device;

/**
 * A device with an address reaches its server by the link the transport chose for it (ADR 0191);
 * the plain one here, as for a server from before keys, so the stubbed `fetch` is what answers.
 */
const onThePlainLink = () => useLink("dev_1", directLink);

afterEach(() => {
  vi.unstubAllGlobals();
  dropLink("dev_1");
});

describe("what an attachment is", () => {
  it("sorts a MIME type into a kind, with an SVG as a file", () => {
    expect(kindOf("image/jpeg")).toBe("image");
    expect(kindOf("image/svg+xml")).toBe("file");
    expect(kindOf("video/mp4")).toBe("video");
    expect(kindOf("audio/ogg")).toBe("audio");
    expect(kindOf("application/pdf")).toBe("file");
    expect(hasThumbnail("image/png")).toBe(true);
    expect(hasThumbnail("application/pdf")).toBe(false);
  });

  it("draws a picture alone at its own shape, a glance: 240 wide or 200 tall at most", () => {
    const of = (width?: number, height?: number, mimeType = "image/jpeg") =>
      aloneTile({ id: "a", filename: "f", mimeType, byteSize: 1, width, height });
    expect(of(600, 800)).toEqual({ width: 150, height: 200 });
    expect(of(1600, 900)).toEqual({ width: 240, height: 135 });
    // Past the shapes worth drawing: a strip is cut to 1.8:1, a column to 3:4.
    expect(of(4000, 500)).toEqual({ width: 239, height: 133 });
    expect(of(300, 3000)).toEqual({ width: 150, height: 200 });
    // Not measured: a square, and a video at 16:9.
    expect(of()).toEqual({ width: 200, height: 200 });
    expect(of(undefined, undefined, "video/mp4")).toEqual({ width: 240, height: 135 });
  });

  it("formats a size the way a chip shows it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(184_302)).toBe("180 KB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20.0 MB");
  });

  it("asks for a video's poster only when the server measured it, and says how long it runs", () => {
    const video = { id: "att_1", filename: "a.mov", mimeType: "video/quicktime", byteSize: 1 };
    expect(hasPoster({ ...video, durationMs: 42_500 })).toBe(true);
    expect(hasPoster(video)).toBe(false);
    expect(hasPoster({ ...video, mimeType: "image/png", durationMs: 1 })).toBe(false);
    // The album is photos and measured videos alike (decision 7); an unmeasured video is a row.
    expect(inAlbum({ ...video, durationMs: 42_500 })).toBe(true);
    expect(inAlbum({ ...video, mimeType: "image/jpeg" })).toBe(true);
    expect(inAlbum(video)).toBe(false);
    expect(inAlbum({ ...video, mimeType: "image/svg+xml" })).toBe(false);
    expect(formatDuration(42_500)).toBe("0:43");
    expect(formatDuration(725_000)).toBe("12:05");
    expect(formatDuration(3_723_000)).toBe("1:02:03");
  });

  it("names a recorded voice note for when it was made, in the recorder's own time", () => {
    const at = new Date(2026, 8, 3, 9, 5);
    expect(voiceNoteName(at, "m4a")).toBe("voice-note-0903-0905.m4a");
    expect(voiceNoteName(new Date(2026, 11, 31, 23, 59), "webm")).toBe("voice-note-1231-2359.webm");
    expect(isVoiceNoteName("voice-note-0903-0905.m4a")).toBe(true);
    expect(isVoiceNoteName("interview.m4a")).toBe(false);
  });

  it("reads a voice note's words", () => {
    expect(
      attachmentFromWire({
        attachment_id: "att_2",
        filename: "voice-note.m4a",
        mime_type: "audio/mp4",
        byte_size: 96_512,
        duration_ms: 8400,
        transcript: "Send Priya the receipt.",
      }),
    ).toEqual({
      id: "att_2",
      filename: "voice-note.m4a",
      mimeType: "audio/mp4",
      byteSize: 96_512,
      durationMs: 8400,
      transcript: "Send Priya the receipt.",
    });
  });

  it("reads the wire's shape", () => {
    expect(
      attachmentFromWire({
        attachment_id: "att_1",
        filename: "a.png",
        mime_type: "image/png",
        byte_size: 3,
        width: 4,
        height: 5,
        duration_ms: 6,
      }),
    ).toEqual({
      id: "att_1",
      filename: "a.png",
      mimeType: "image/png",
      byteSize: 3,
      width: 4,
      height: 5,
      durationMs: 6,
    });
  });
});

describe("uploading", () => {
  it("sends them to the server the device is paired with, and signs the path alone", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          attachment_id: "att_1",
          upload_url: "/v1/uploads/att_1",
          attachment: {
            attachment_id: "att_1",
            filename: "a.png",
            mime_type: "image/png",
            byte_size: 1,
          },
        }),
        { status: 201 },
      );
    });

    const paired = { ...device, serverUrl: "http://mini.local:4431" } as Device;
    onThePlainLink();
    await uploadFile(paired, { name: "a.png", bytes: new Uint8Array([1]) });

    expect(calls.map((call) => call.url)).toEqual([
      "http://mini.local:4431/v1/uploads",
      "http://mini.local:4431/v1/uploads/att_1",
    ]);
    // The signature covers the path the server sees, never the origin the client added.
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>)["x-test-signed"]).not.toContain(
        "mini.local",
      );
    }
  });

  it("asks for a slot, sends the bytes to it, and returns what the server made of them", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url === "/v1/uploads") {
        return new Response(
          JSON.stringify({ attachment_id: "att_1", upload_url: "/v1/uploads/att_1" }),
          {
            status: 201,
          },
        );
      }
      return new Response(
        JSON.stringify({
          attachment: {
            attachment_id: "att_1",
            filename: "a.png",
            mime_type: "image/png",
            byte_size: 4,
          },
        }),
        { status: 201 },
      );
    });

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const attachment = await uploadFile(device, { name: "a.png", bytes });
    expect(attachment).toEqual({
      id: "att_1",
      filename: "a.png",
      mimeType: "image/png",
      byteSize: 4,
    });
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      "POST /v1/uploads",
      "PUT /v1/uploads/att_1",
    ]);
    // The slot asks with the name and the size. This slot does not say it takes pieces, as a
    // server from before ADR 0052 does not, so the bytes go up whole, signed for their own target.
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      filename: "a.png",
      byte_size: 4,
      keep_metadata: false,
    });
    const put = calls[1];
    expect(put?.init.body).toBe(bytes);
    const headers = (put?.init.headers ?? {}) as Record<string, string>;
    expect(headers["x-test-signed"]).toBe("PUT /v1/uploads/att_1");
  });

  it("says why when the server refuses", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "too big for this workspace" } }), {
          status: 400,
        }),
    );
    await expect(uploadFile(device, { name: "a", bytes: new Uint8Array(1) })).rejects.toThrow(
      new UploadError("Could not start the upload: too big for this workspace."),
    );
  });

  it("ends the sentence once when the server's reason ends its own", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "This isn't in the demo." } }), {
          status: 501,
        }),
    );
    await expect(uploadFile(device, { name: "a", bytes: new Uint8Array(1) })).rejects.toThrow(
      new UploadError("Could not start the upload: This isn't in the demo."),
    );
  });

  it("stops at once, without trying again, when the server refuses the bytes", async () => {
    const server = fakeServer({ size: 10, refuse: { status: 422, message: "not a video here" } });
    const waits: number[] = [];
    await expect(
      uploadFile(
        device,
        { name: "a.bin", bytes: new Uint8Array(10) },
        { pieceBytes: 4, wait: async (ms) => void waits.push(ms) },
      ),
    ).rejects.toThrow(new UploadError("Could not upload a.bin: not a video here."));
    expect(server.requests).toEqual(["POST /v1/uploads", "PUT /v1/uploads/att_1?offset=0"]);
    expect(waits).toEqual([]);
  });

  it("fetches an attachment, or its thumbnail, as a blob", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(new Uint8Array([9]), {
        status: 200,
        headers: { "content-type": "image/webp" },
      });
    });
    const blob = await fetchAttachment(device, "att_1", "thumb");
    expect(blob.size).toBe(1);
    // Typed as served: a PDF preview draws nothing from a blob that says it is bytes.
    expect(blob.type).toBe("image/webp");
    // A phone takes the bytes themselves, to write to a file it can play or share.
    expect(await fetchAttachmentBytes(device, "att_1")).toEqual(new Uint8Array([9]));
    // And what to play, with the type it was served as, to name the file it is kept in.
    expect(await fetchAttachmentWithType(device, "att_1", "play")).toEqual({
      bytes: new Uint8Array([9]),
      mimeType: "image/webp",
    });
    expect(urls).toEqual([
      "/v1/attachments/att_1?variant=thumb",
      "/v1/attachments/att_1",
      "/v1/attachments/att_1?variant=play",
    ]);
  });

  it("says how much of a download has come as it arrives, and where a video's copy has got to", async () => {
    const chunks = [
      new Uint8Array(4).fill(1),
      new Uint8Array(3).fill(2),
      new Uint8Array(3).fill(3),
    ];
    const streamed = (length: string | undefined, playable?: string) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "video/quicktime",
            ...(length === undefined ? {} : { "content-length": length }),
            ...(playable === undefined ? {} : { "x-chips-playable": playable }),
          },
        },
      );
    const heard: [number, number | undefined][] = [];
    vi.stubGlobal("fetch", async () => streamed("10", "pending"));
    const fetched = await fetchAttachmentWithType(device, "att_clip", "play", {
      onProgress: (received, total) => void heard.push([received, total]),
    });
    expect(heard).toEqual([
      [0, 10],
      [4, 10],
      [7, 10],
      [10, 10],
    ]);
    expect(fetched.bytes).toEqual(new Uint8Array([1, 1, 1, 1, 2, 2, 2, 3, 3, 3]));
    expect(fetched.playable).toBe("pending");

    // No length said, and a length too short: the count goes on, and every byte is kept.
    heard.length = 0;
    vi.stubGlobal("fetch", async () => streamed(undefined, "who knows"));
    const unsized = await fetchAttachmentWithType(device, "att_clip", "play", {
      onProgress: (received, total) => void heard.push([received, total]),
    });
    expect(heard.at(-1)).toEqual([10, undefined]);
    expect(unsized.bytes.length).toBe(10);
    // A state this client does not know is no state.
    expect(unsized.playable).toBeUndefined();
    vi.stubGlobal("fetch", async () => streamed("2"));
    expect(
      (await fetchAttachmentWithType(device, "att_clip", "play", { onProgress: () => {} })).bytes,
    ).toEqual(new Uint8Array([1, 1, 1, 1, 2, 2, 2, 3, 3, 3]));

    // A response with no body to read, as React Native's own gives: said once, at the end.
    heard.length = 0;
    vi.stubGlobal("fetch", async () => {
      const whole = new Response(new Uint8Array(6), { headers: { "content-length": "6" } });
      Object.defineProperty(whole, "body", { value: undefined });
      return whole;
    });
    await fetchAttachmentWithType(device, "att_clip", "file", {
      onProgress: (received, total) => void heard.push([received, total]),
    });
    expect(heard).toEqual([[6, 6]]);
  });

  it("stops a download that is let go of partway, and stops reading it (ADR 0153)", async () => {
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            // One chunk, and then the rest never comes: only the let-go ends it.
            start(controller) {
              controller.enqueue(new Uint8Array(4).fill(1));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200, headers: { "content-type": "video/mp4", "content-length": "100" } },
        ),
    );
    const letGo = new AbortController();
    const fetching = fetchAttachmentWithType(device, "att_clip", "play", {
      signal: letGo.signal,
      onProgress: (received) => {
        if (received === 4) letGo.abort();
      },
    });
    await expect(fetching).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toBe(true);

    // Let go of before it was asked, it never reads a byte.
    const before = new AbortController();
    before.abort();
    await expect(
      fetchAttachmentWithType(device, "att_clip", "play", { signal: before.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("asks for a video's copy alone, leaving the original unread while the copy is still to come", async () => {
    let cancelled = 0;
    const answer = (playable: string | undefined, bytes: number[]) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(bytes));
            controller.close();
          },
          cancel() {
            cancelled += 1;
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": playable === "done" ? "video/mp4" : "video/quicktime",
            ...(playable === undefined ? {} : { "x-chips-playable": playable }),
          },
        },
      );
    const heard: number[] = [];
    const ask = () =>
      fetchAttachmentWithType(device, "att_clip", "play", {
        copyOnly: true,
        onProgress: (received) => void heard.push(received),
      });

    // Still being made, or never to be: the original is not fetched again, and nothing is heard.
    vi.stubGlobal("fetch", async () => answer("pending", [1, 2, 3]));
    expect(await ask()).toEqual({
      bytes: new Uint8Array(0),
      mimeType: "video/quicktime",
      playable: "pending",
    });
    vi.stubGlobal("fetch", async () => answer("failed", [1, 2, 3]));
    expect((await ask()).playable).toBe("failed");
    expect(cancelled).toBe(2);
    expect(heard).toEqual([]);

    // Made, or a server from before the header: the copy is fetched as any answer is.
    vi.stubGlobal("fetch", async () => answer("done", [7, 8]));
    expect(await ask()).toEqual({
      bytes: new Uint8Array([7, 8]),
      mimeType: "video/mp4",
      playable: "done",
    });
    vi.stubGlobal("fetch", async () => answer(undefined, [9]));
    expect((await ask()).bytes).toEqual(new Uint8Array([9]));
    expect(heard).toEqual([0, 2, 0, 1]);
  });

  it("says whether a view is the copy made for a viewer or the photo itself, when the server says", async () => {
    const answer = (view: string | undefined) =>
      new Response(new Uint8Array([1]), {
        headers: {
          "content-type": "image/webp",
          ...(view === undefined ? {} : { "x-chips-view": view }),
        },
      });
    vi.stubGlobal("fetch", async () => answer("copy"));
    expect((await fetchAttachmentWithType(device, "att_1", "view")).view).toBe("copy");
    vi.stubGlobal("fetch", async () => answer("original"));
    expect((await fetchAttachmentWithType(device, "att_1", "view")).view).toBe("original");
    vi.stubGlobal("fetch", async () => answer(undefined));
    expect((await fetchAttachmentWithType(device, "att_1", "view")).view).toBeUndefined();
    vi.stubGlobal("fetch", async () => answer("sideways"));
    expect((await fetchAttachmentWithType(device, "att_1", "view")).view).toBeUndefined();
  });

  it("asks again, signed afresh, when the server goes under a download and comes back (ADR 0179)", async () => {
    const signed: string[] = [];
    let first = true;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      signed.push(new Headers(init.headers).get("x-test-signed") ?? "");
      if (first) {
        first = false;
        // The socket the server's restart closed opens again while the failure is on its way.
        reached("dev_1");
        throw new TypeError("Network request failed");
      }
      return new Response(new Uint8Array([4, 2]), { headers: { "content-type": "image/webp" } });
    });
    const fetched = await fetchAttachmentWithType(device, "att_1", "view");
    expect([...fetched.bytes]).toEqual([4, 2]);
    expect(signed).toEqual([
      "GET /v1/attachments/att_1?variant=view",
      "GET /v1/attachments/att_1?variant=view",
    ]);
  });

  it("says what the server answered when it will not give the bytes, so a viewer can fall back", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "That attachment has no view copy" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
    );
    const refused = await fetchAttachmentBytes(device, "att_1", "view").catch((error) => error);
    expect(refused).toBeInstanceOf(UploadError);
    expect(refused).toMatchObject({
      status: 404,
      message: "Could not fetch the attachment: That attachment has no view copy.",
    });
  });
});

/**
 * A server that takes pieces as ADR 0052 says, over a stubbed `fetch`: it holds what it was sent,
 * answers a piece with how much it holds and the last with the attachment, and says how far an
 * upload got. `drop` loses the answer to the nth piece after keeping it, as a network does;
 * `busy` answers the nth `503`; `refuse` answers every piece so.
 */
function fakeServer(options: {
  readonly size: number;
  readonly drop?: readonly number[];
  readonly busy?: readonly number[];
  readonly refuse?: { readonly status: number; readonly message: string };
  /** A server from before ADR 0052: its slot does not say it takes pieces. */
  readonly whole?: boolean;
}) {
  const requests: string[] = [];
  const bodies: Uint8Array[] = [];
  const signed: string[] = [];
  let held = 0;
  let pieces = 0;
  const attachment = {
    attachment_id: "att_1",
    filename: "a.bin",
    mime_type: "application/octet-stream",
    byte_size: options.size,
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  const howFar = () =>
    json({
      attachment_id: "att_1",
      received_bytes: held,
      byte_size: options.size,
      ...(held === options.size ? { attachment } : {}),
    });
  const take = (url: string, body: Uint8Array) => {
    pieces += 1;
    if (options.refuse !== undefined) {
      return json({ error: { message: options.refuse.message } }, options.refuse.status);
    }
    if (options.busy?.includes(pieces)) return json({ error: { message: "busy" } }, 503);
    const offset = Number(new URL(url, "http://x").searchParams.get("offset") ?? 0);
    if (offset !== held) return json({ error: { message: `that upload has ${held} bytes` } }, 422);
    bodies.push(body);
    held += body.byteLength;
    if (options.drop?.includes(pieces)) throw new TypeError("The network connection was lost.");
    return held === options.size
      ? json({ attachment }, 201)
      : json({ attachment_id: "att_1", received_bytes: held });
  };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    requests.push(`${method} ${url}`);
    signed.push((init.headers as Record<string, string>)["x-test-signed"] ?? "");
    if (method === "POST") {
      const slot = { attachment_id: "att_1", upload_url: "/v1/uploads/att_1" };
      return json(options.whole === true ? slot : { ...slot, pieces: true }, 201);
    }
    return method === "GET" ? howFar() : take(url, init.body as Uint8Array);
  });
  return { requests, bodies, signed };
}

describe("uploading in pieces (ADR 0052)", () => {
  const noWait = (waits: number[]) => async (ms: number) => void waits.push(ms);

  it("sends a file a piece at a time, each signed for its offset, and says how far it got", async () => {
    const server = fakeServer({ size: 10 });
    const progress: [number, number][] = [];
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const attachment = await uploadFile(
      device,
      { name: "a.bin", bytes },
      { pieceBytes: 4, onProgress: (sent, total) => progress.push([sent, total]) },
    );
    expect(attachment).toMatchObject({ id: "att_1", byteSize: 10 });
    expect(server.requests).toEqual([
      "POST /v1/uploads",
      "PUT /v1/uploads/att_1?offset=0",
      "PUT /v1/uploads/att_1?offset=4",
      "PUT /v1/uploads/att_1?offset=8",
    ]);
    expect(server.signed.slice(1)).toEqual([
      "PUT /v1/uploads/att_1?offset=0",
      "PUT /v1/uploads/att_1?offset=4",
      "PUT /v1/uploads/att_1?offset=8",
    ]);
    expect(server.bodies).toEqual([
      new Uint8Array([0, 1, 2, 3]),
      new Uint8Array([4, 5, 6, 7]),
      new Uint8Array([8, 9]),
    ]);
    expect(progress).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
  });

  it("sends the file whole, with no offset, to a server that does not say it takes pieces", async () => {
    // Such a server would store a first piece as the whole file, and say nothing.
    const server = fakeServer({ size: 10, whole: true });
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const attachment = await uploadFile(device, { name: "a.bin", bytes }, { pieceBytes: 4 });
    expect(attachment).toMatchObject({ id: "att_1", byteSize: 10 });
    expect(server.requests).toEqual(["POST /v1/uploads", "PUT /v1/uploads/att_1"]);
    expect(server.bodies).toEqual([bytes]);
  });

  it("reads from a source only the piece it is about to send", async () => {
    fakeServer({ size: 10 });
    const reads: [number, number][] = [];
    await uploadFile(
      device,
      {
        name: "clip.mov",
        source: {
          size: 10,
          read: async (start, end) => {
            reads.push([start, end]);
            return new Uint8Array(end - start);
          },
        },
      },
      { pieceBytes: 4 },
    );
    expect(reads).toEqual([
      [0, 4],
      [4, 8],
      [8, 10],
    ]);
  });

  it("asks how far the upload got when the network drops a piece, and goes on from there", async () => {
    // The server kept the second piece; only its answer was lost.
    const server = fakeServer({ size: 10, drop: [2] });
    const waits: number[] = [];
    const attachment = await uploadFile(
      device,
      { name: "a.bin", bytes: new Uint8Array(10) },
      { pieceBytes: 4, wait: noWait(waits) },
    );
    expect(attachment.id).toBe("att_1");
    expect(server.requests).toEqual([
      "POST /v1/uploads",
      "PUT /v1/uploads/att_1?offset=0",
      "PUT /v1/uploads/att_1?offset=4",
      "GET /v1/uploads/att_1",
      "PUT /v1/uploads/att_1?offset=8",
    ]);
    expect(waits).toEqual([500]);
  });

  it("finds the upload finished when the answer to its last piece was lost", async () => {
    const server = fakeServer({ size: 10, drop: [3] });
    const attachment = await uploadFile(
      device,
      { name: "a.bin", bytes: new Uint8Array(10) },
      { pieceBytes: 4, wait: noWait([]) },
    );
    expect(attachment).toMatchObject({ id: "att_1", byteSize: 10 });
    expect(server.requests.at(-1)).toBe("GET /v1/uploads/att_1");
    expect(server.bodies).toHaveLength(3);
  });

  it("waits longer each time the server is busy, and gives up after six tries with nothing gained", async () => {
    const server = fakeServer({ size: 10, busy: [1, 2, 3, 4, 5, 6, 7] });
    const waits: number[] = [];
    await expect(
      uploadFile(
        device,
        { name: "a.bin", bytes: new Uint8Array(10) },
        { pieceBytes: 4, wait: noWait(waits) },
      ),
    ).rejects.toThrow(new UploadError("Could not upload a.bin: busy."));
    expect(waits).toEqual([500, 1000, 2000, 4000, 8000]);
    expect(server.requests.filter((request) => request.startsWith("PUT"))).toHaveLength(6);
  });

  it("counts failures afresh once a piece gets through", async () => {
    // Five failures, a piece in, five more: eleven tries, and the upload still arrives.
    const server = fakeServer({ size: 10, busy: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11] });
    const attachment = await uploadFile(
      device,
      { name: "a.bin", bytes: new Uint8Array(10) },
      { pieceBytes: 4, wait: noWait([]) },
    );
    expect(attachment.id).toBe("att_1");
    expect(server.bodies).toHaveLength(3);
  });
});

describe("a grant for a player (ADR 0058)", () => {
  const paired = { ...device, serverUrl: "http://100.64.0.7:4431" } as unknown as Device;

  beforeEach(onThePlainLink);

  it("asks the server for one, signed, and hands back the URL on the server the device reaches", async () => {
    const asked: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      asked.push({ url, init });
      return new Response(
        JSON.stringify({
          url: "/v1/attachments/att_1?variant=play&dev=dev_1&exp=1800000600&sig=abc",
          expires_at: "2027-01-15T08:10:00.000Z",
          variant: "play",
          playable: "done",
        }),
        { status: 200 },
      );
    });
    expect(await grantAttachment(paired, "att_1", "play")).toEqual({
      url: "http://100.64.0.7:4431/v1/attachments/att_1?variant=play&dev=dev_1&exp=1800000600&sig=abc",
      expiresAt: Date.parse("2027-01-15T08:10:00.000Z"),
      variant: "play",
      playable: "done",
    });
    expect(asked).toHaveLength(1);
    const [first] = asked;
    if (first === undefined) return;
    expect(first.url).toBe("http://100.64.0.7:4431/v1/attachments/att_1/grant");
    expect(first.init.method).toBe("POST");
    expect(first.init.body).toBe(JSON.stringify({ variant: "play" }));
    const signed = first.init.headers as Record<string, string>;
    expect(signed["x-test-signed"]).toBe("POST /v1/attachments/att_1/grant");
  });

  it("names the file while a video's copy is being made, as the server says", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            url: "/v1/attachments/att_1?dev=dev_1&exp=1&sig=a",
            expires_at: "2027-01-15T08:10:00.000Z",
            variant: "file",
            playable: "pending",
          }),
        ),
    );
    expect(await grantAttachment(device, "att_1", "play")).toMatchObject({
      url: "/v1/attachments/att_1?dev=dev_1&exp=1&sig=a",
      variant: "file",
      playable: "pending",
    });
  });

  it("is nothing through the relay, where a player cannot go, and asks nothing", async () => {
    let asked = 0;
    vi.stubGlobal("fetch", async () => {
      asked += 1;
      return new Response("{}");
    });
    const relay: Link = {
      kind: "relay",
      fetch: async () => {
        asked += 1;
        return new Response("{}");
      },
      socket: () => {
        throw new Error("no socket");
      },
      close: () => undefined,
    };
    useLink("dev_1", relay);
    expect(await grantAttachment(paired, "att_1", "play")).toBeUndefined();
    expect(asked).toBe(0);
  });

  it("is nothing from a server from before grants, and says why when one refuses", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "No route matches that." } }), {
          status: 404,
        }),
    );
    expect(await grantAttachment(paired, "att_1", "play")).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "That attachment was not sent in a space you are in." },
          }),
          {
            status: 403,
          },
        ),
    );
    await expect(grantAttachment(paired, "att_1", "play")).rejects.toMatchObject({
      status: 403,
      message: "Could not play it here: That attachment was not sent in a space you are in.",
    });
  });
});

describe("a page's URL for a frame (ADR 0201)", () => {
  const paired = { ...device, serverUrl: "http://100.64.0.7:4431" } as unknown as Device;

  beforeEach(onThePlainLink);

  it("asks the page door, signed, and hands back the ticket's URL on the server the device reaches", async () => {
    const asked: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      asked.push({ url, init });
      return new Response(JSON.stringify({ url: "/v1/pages/tkt_abc", expires_in: 30 }), {
        status: 201,
      });
    });
    expect(await pageUrl(paired, "att_1")).toBe("http://100.64.0.7:4431/v1/pages/tkt_abc");
    expect(asked).toHaveLength(1);
    const [first] = asked;
    if (first === undefined) return;
    expect(first.url).toBe("http://100.64.0.7:4431/v1/attachments/att_1/page");
    expect(first.init.method).toBe("POST");
    expect(first.init.body).toBeUndefined();
    expect((first.init.headers as Record<string, string>)["x-test-signed"]).toBe(
      "POST /v1/attachments/att_1/page",
    );
  });

  it("is nothing through a tunnel, where a frame cannot follow, and asks nothing", async () => {
    let asked = 0;
    const tunnel: Link = {
      kind: "tunnel",
      fetch: async () => {
        asked += 1;
        return new Response("{}");
      },
      socket: () => {
        throw new Error("no socket");
      },
      close: () => undefined,
    };
    useLink("dev_1", tunnel);
    expect(await pageUrl(paired, "att_1")).toBeUndefined();
    expect(asked).toBe(0);
  });

  it("is nothing from a server from before the door, and says why when one refuses", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "No route matches that." } }), {
          status: 404,
        }),
    );
    expect(await pageUrl(paired, "att_1")).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ error: { message: "Only an HTML file opens as a page here." } }),
          { status: 422 },
        ),
    );
    await expect(pageUrl(paired, "att_1")).rejects.toThrow(
      "Could not open it here: Only an HTML file opens as a page here.",
    );
  });
});
