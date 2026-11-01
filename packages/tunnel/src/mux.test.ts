/**
 * The multiplexer: requests and sockets as messages, bodies split at the chunk size and put
 * back together, limits on both ends, and a closed tunnel telling everything that waited on it.
 */

import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { type Bytes, bytes, text, utf8 } from "./bytes.js";
import { generateKeyPair } from "./keys.js";
import {
  ANSWER_WINDOW_BYTES,
  type Answerer,
  type AnswererHandlers,
  type AnswererOptions,
  type Caller,
  CHUNK_BYTES,
  type Channel,
  CLOSE_REFUSED,
  CLOSE_TOO_MANY,
  CLOSE_TUNNEL_GONE,
  createAnswerer,
  createCaller,
  createChannel,
  decodeFrame,
  encodeFrame,
  type Header,
  pace,
  readHeader,
  STREAM_AHEAD_BYTES,
  type TunnelSocket,
  UPLOAD_WINDOW_BYTES,
  type Wire,
} from "./mux.js";
import { initiateHandshake, respondHandshake, TunnelClosedError, TunnelError } from "./noise.js";

/** Two wires joined back to back, delivering on a microtask like a socket would. */
function wirePair(): [Wire, Wire, { sent: Bytes[] }] {
  const tap = { sent: [] as Bytes[] };
  let closed = false;
  const make = (other: () => Wire): Wire => {
    const wire: Wire = {
      onmessage: undefined,
      onclose: undefined,
      send: (data) => {
        tap.sent.push(data);
        queueMicrotask(() => other().onmessage?.(data));
      },
      close: () => {
        if (closed) return;
        closed = true;
        queueMicrotask(() => other().onclose?.("peer_closed"));
      },
    };
    return wire;
  };
  let a: Wire;
  let b: Wire;
  a = make(() => b);
  b = make(() => a);
  return [a, b, tap];
}

async function ends(
  handlers: Partial<AnswererHandlers> = {},
  options: AnswererOptions = {},
): Promise<{ caller: Caller; answerer: Answerer; tap: { sent: Bytes[] } }> {
  const key = await generateKeyPair();
  const started = await initiateHandshake(key.publicKey);
  const answered = await respondHandshake(key, started.message);
  const tunnel = await started.complete(answered.message);
  const [phoneWire, serverWire, tap] = wirePair();
  const caller = createCaller(createChannel(tunnel, phoneWire), options);
  const answerer = createAnswerer(
    createChannel(answered.tunnel, serverWire),
    {
      request:
        handlers.request ??
        (async (input) => ({
          status: 200,
          headers: { "content-type": "text/plain" },
          body: utf8(`${input.method} ${input.target} ${text(input.body ?? bytes(0))}`),
        })),
      socket: handlers.socket ?? (async () => ({ ok: true })),
    },
    options,
  );
  return { caller, answerer, tap };
}

describe("frames", () => {
  it("round-trip a header and a body, and refuse what is not a frame", () => {
    const frame = encodeFrame(
      { t: "req", id: 1, method: "GET", target: "/v1/health", headers: {}, end: true },
      utf8("x"),
    );
    const decoded = decodeFrame(frame);
    expect(decoded?.header).toEqual({
      t: "req",
      id: 1,
      method: "GET",
      target: "/v1/health",
      headers: {},
      end: true,
    });
    expect(text(decoded?.body ?? bytes(0))).toBe("x");
    expect(decodeFrame(bytes(1))).toBeUndefined();
    expect(decodeFrame(new Uint8Array([0, 5, 1, 2]))).toBeUndefined();
    expect(readHeader({ t: "req", id: 1 })).toBeUndefined();
    expect(readHeader({ t: "dance", id: 1 })).toBeUndefined();
    expect(readHeader({ t: "open", id: "1", target: "/" })).toBeUndefined();
    expect(readHeader({ t: "close", id: 2, code: 1000, reason: "" })).toEqual({
      t: "close",
      id: 2,
      code: 1000,
      reason: "",
    });
  });
});

describe("requests through the tunnel", () => {
  it("answer with the status, headers and body the handler gave", async () => {
    const { caller } = await ends();
    const response = await caller.fetch({ method: "POST", target: "/v1/pair", body: utf8("{}") });
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ "content-type": "text/plain" });
    expect(text(response.body)).toBe("POST /v1/pair {}");
  });

  it("carry a body larger than one chunk each way, in chunks, and put it back together", async () => {
    let seen: Bytes | undefined;
    const { caller, tap } = await ends({
      request: async (input) => {
        seen = input.body === undefined ? undefined : new Uint8Array(input.body);
        return { status: 200, headers: {}, body: bytes(CHUNK_BYTES * 3 + 5).fill(9) };
      },
    });
    const body = bytes(CHUNK_BYTES * 2 + 1);
    for (let i = 0; i < body.length; i += 1) body[i] = i % 251;
    const response = await caller.fetch({ method: "PUT", target: "/v1/uploads/u1", body });
    expect(seen).toEqual(body);
    expect(response.body.length).toBe(CHUNK_BYTES * 3 + 5);
    expect(response.body.every((byte) => byte === 9)).toBe(true);
    // Nothing on the wire is larger than a Noise message.
    expect(tap.sent.every((each) => each.length <= 65_535)).toBe(true);
    expect(tap.sent.length).toBeGreaterThan(6);
  });

  it("reject when the handler throws, and answer several in flight by id", async () => {
    const { caller } = await ends({
      request: async (input) => {
        if (input.target === "/boom") throw new Error("no such thing");
        await new Promise((resolve) => setTimeout(resolve, input.target === "/slow" ? 20 : 0));
        return { status: 200, headers: {}, body: utf8(input.target) };
      },
    });
    const [slow, fast] = await Promise.all([
      caller.fetch({ method: "GET", target: "/slow" }),
      caller.fetch({ method: "GET", target: "/fast" }),
    ]);
    expect(text(slow.body)).toBe("/slow");
    expect(text(fast.body)).toBe("/fast");
    await expect(caller.fetch({ method: "GET", target: "/boom" })).rejects.toThrow("no such thing");
  });

  it("refuse a body over the limit on either end, and too many at once", async () => {
    const { caller } = await ends(
      { request: async () => ({ status: 200, headers: {}, body: bytes(2000) }) },
      { maxBodyBytes: 1000 },
    );
    await expect(caller.fetch({ method: "GET", target: "/big" })).rejects.toThrow("too long");
    await expect(caller.fetch({ method: "PUT", target: "/x", body: bytes(1001) })).rejects.toThrow(
      "too long",
    );

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const busy = await ends(
      {
        request: async () => {
          await gate;
          return { status: 200, headers: {}, body: bytes(0) };
        },
      },
      { maxInFlight: 2 },
    );
    const first = busy.caller.fetch({ method: "GET", target: "/1" });
    const second = busy.caller.fetch({ method: "GET", target: "/2" });
    // Both in flight before the third is tried: a wait for the state, not for a number of
    // milliseconds that an idle machine meets and a loaded one does not.
    await expect.poll(() => busy.answerer.inFlight()).toBe(2);
    await expect(busy.caller.fetch({ method: "GET", target: "/3" })).rejects.toThrow("Too many");
    release();
    await Promise.all([first, second]);
    expect(busy.answerer.inFlight()).toBe(0);
  });

  it("holds one request to its own limit, read off its first frame, and a socket message to its own", async () => {
    const { caller } = await ends(
      {},
      {
        maxBodyBytes: 1000,
        bodyBytesFor: (request) =>
          request.headers?.["authorization"] === undefined ? 10 : undefined,
        maxSocketMessageBytes: 20,
      },
    );
    // A stranger's body is refused at its own, smaller limit; a credential's gets the usual one.
    await expect(caller.fetch({ method: "PUT", target: "/x", body: bytes(11) })).rejects.toThrow(
      "too long",
    );
    const allowed = await caller.fetch({
      method: "PUT",
      target: "/x",
      headers: { authorization: "Bearer t" },
      body: bytes(500),
    });
    expect(allowed.status).toBe(200);
    // A socket message over its limit closes the tunnel, as one over the body limit did.
    const socket = caller.open("/v1/ws?ticket=t1");
    await new Promise<void>((resolve) => {
      socket.onopen = resolve;
    });
    const gone = new Promise<string>((resolve) => {
      caller.onclose = resolve;
    });
    socket.send("x".repeat(21));
    expect(await gone).toBe("peer_closed");
  });

  it("round-trip any body at all", async () => {
    const { caller } = await ends({
      request: async (input) => ({
        status: 200,
        headers: {},
        body: new Uint8Array(input.body ?? bytes(0)) as Bytes,
      }),
    });
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: CHUNK_BYTES * 2 + 3 }), async (body) => {
        const response = await caller.fetch({ method: "POST", target: "/echo", body });
        expect(response.body).toEqual(new Uint8Array(body));
      }),
      { numRuns: 25 },
    );
  });
});

/** A channel whose frames a test hands in one at a time, and whose sends it reads. */
function handChannel(): Channel & { readonly sent: Header[] } {
  const sent: Header[] = [];
  let closed = false;
  const channel: Channel & { readonly sent: Header[] } = {
    sent,
    onframe: undefined,
    onclose: undefined,
    isClosed: () => closed,
    backlog: () => 0,
    below: async () => undefined,
    send: (header) => void sent.push(header),
    close: (reason = "closed") => {
      if (closed) return;
      closed = true;
      channel.onclose?.(reason);
    },
  };
  return channel;
}

describe("an answer as it comes", () => {
  it("is handed over at its headers, with its body arriving chunk by chunk", async () => {
    const channel = handChannel();
    const caller = createCaller(channel);
    const asked = caller.stream({ method: "GET", target: "/v1/attachments/att_1?variant=play" });
    expect(channel.sent[1]).toMatchObject({ t: "req", id: 1, method: "GET" });

    channel.onframe?.(
      { t: "res", id: 1, status: 200, headers: { "content-length": "7" }, end: false },
      utf8("abc"),
    );
    const answer = await asked;
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ "content-length": "7" });
    const reader = answer.body.getReader();
    expect(text((await reader.read()).value ?? bytes(0))).toBe("abc");

    // The rest has not come yet: a read waits for it.
    const next = reader.read();
    channel.onframe?.({ t: "data", id: 1, end: false }, utf8("de"));
    expect(text((await next).value ?? bytes(0))).toBe("de");
    channel.onframe?.({ t: "data", id: 1, end: true }, utf8("fg"));
    expect(text((await reader.read()).value ?? bytes(0))).toBe("fg");
    expect((await reader.read()).done).toBe(true);
  });

  it("errors a body the tunnel closes under, or that runs over the limit", async () => {
    const channel = handChannel();
    const caller = createCaller(channel, { maxBodyBytes: 4 });
    const cut = caller.stream({ method: "GET", target: "/cut" });
    const long = caller.stream({ method: "GET", target: "/long" });
    channel.onframe?.({ t: "res", id: 1, status: 200, headers: {}, end: false }, utf8("ab"));
    channel.onframe?.({ t: "res", id: 2, status: 200, headers: {}, end: false }, utf8("abc"));
    const longReader = (await long).body.getReader();
    await longReader.read();
    channel.onframe?.({ t: "data", id: 2, end: true }, utf8("de"));
    const tooLong = await longReader.read().catch((error: unknown) => error);
    expect(tooLong).toEqual(new TunnelError("The answer is too long."));
    // An answer refused is not a tunnel gone: asked again, it would be refused again.
    expect(tooLong).not.toBeInstanceOf(TunnelClosedError);

    const cutReader = (await cut).body.getReader();
    await cutReader.read();
    channel.close("wifi_gone");
    await expect(cutReader.read()).rejects.toThrow("The tunnel closed: wifi_gone.");
  });

  it("lets a reader stop reading, and the rest of the body fall away", async () => {
    const channel = handChannel();
    const caller = createCaller(channel);
    const asked = caller.stream({ method: "GET", target: "/big" });
    channel.onframe?.({ t: "res", id: 1, status: 200, headers: {}, end: false }, utf8("a"));
    await (await asked).body.cancel();
    // Chunks for a body nobody reads are nobody's: nothing throws.
    channel.onframe?.({ t: "data", id: 1, end: true }, utf8("b"));
    const later = caller.fetch({ method: "GET", target: "/after" });
    channel.onframe?.({ t: "res", id: 2, status: 204, headers: {}, end: true }, bytes(0));
    expect((await later).status).toBe(204);
  });
});

/** A body as a stream of the given pieces, and whether its reader was cancelled. */
function streamOf(pieces: readonly Uint8Array[], failAfter?: number) {
  const seen = { cancelled: false };
  let at = 0;
  const body = new ReadableStream<Bytes>({
    pull(controller) {
      if (failAfter !== undefined && at === failAfter) {
        controller.error(new Error("The disk went away."));
        return;
      }
      const piece = pieces[at++];
      if (piece === undefined) controller.close();
      else controller.enqueue(new Uint8Array(piece));
    },
    cancel() {
      seen.cancelled = true;
    },
  });
  return { body, seen };
}

/**
 * Ends over a wire with one slow direction: what is sent that way waits in a queue and arrives
 * `perTick` bytes a millisecond, as a socket's buffer drains onto a slow link. Down (server to
 * phone), the server's wire reports that queue as its backlog, as Node's WebSocket does; up, the
 * phone's does not, as React Native's does not.
 */
async function slowEnds(
  handlers: Partial<AnswererHandlers>,
  perTick: number,
  slow: "down" | "up" | "relay" = "down",
) {
  const key = await generateKeyPair();
  const started = await initiateHandshake(key.publicKey);
  const answered = await respondHandshake(key, started.message);
  const tunnel = await started.complete(answered.message);
  const waiting: Bytes[] = [];
  let backlog = 0;
  const queue = (data: Bytes) => {
    waiting.push(data);
    backlog += data.length;
  };
  // "relay": slow on the way down, with the queue where the server's socket cannot see it.
  const down = slow !== "up";
  const phoneWire: Wire = {
    onmessage: undefined,
    onclose: undefined,
    send: down ? (data) => queueMicrotask(() => serverWire.onmessage?.(data)) : queue,
    close: () => queueMicrotask(() => serverWire.onclose?.("peer_closed")),
  };
  const serverWire: Wire = {
    onmessage: undefined,
    onclose: undefined,
    send: down ? queue : (data) => queueMicrotask(() => phoneWire.onmessage?.(data)),
    close: () => undefined,
    ...(slow === "down" ? { backlog: () => backlog } : {}),
  };
  const far = down ? phoneWire : serverWire;
  const drain = setInterval(() => {
    let budget = perTick;
    while (budget > 0 && waiting.length > 0) {
      const next = waiting.shift() as Bytes;
      budget -= next.length;
      backlog -= next.length;
      far.onmessage?.(next);
    }
  }, 1);
  const caller = createCaller(createChannel(tunnel, phoneWire));
  createAnswerer(createChannel(answered.tunnel, serverWire), {
    request: handlers.request ?? (async () => ({ status: 200, headers: {}, body: bytes(0) })),
    socket: handlers.socket ?? (async () => ({ ok: true })),
  });
  // Settled before anything is asked.
  await new Promise((settle) => setTimeout(settle, 5));
  return { caller, stop: () => clearInterval(drain) };
}

describe("an answer read as it is sent", () => {
  it("arrives whole and in order, however the stream cuts it", async () => {
    const whole = new Uint8Array(3 * CHUNK_BYTES + 777).map((_, at) => at % 251);
    const cuts = [100, 100 + CHUNK_BYTES * 2, 105 + CHUNK_BYTES * 2, whole.length];
    const pieces = cuts.map((end, at) => whole.subarray(at === 0 ? 0 : (cuts[at - 1] ?? 0), end));
    const { caller } = await ends({
      request: async () => ({ status: 200, headers: { "x-n": "1" }, body: streamOf(pieces).body }),
    });
    const answer = await caller.fetch({ method: "GET", target: "/file" });
    expect(answer.status).toBe(200);
    expect(answer.headers).toEqual({ "x-n": "1" });
    expect([...answer.body]).toEqual([...whole]);
  });

  it("answers an empty stream with an empty body", async () => {
    const { caller } = await ends({
      request: async () => ({ status: 200, headers: {}, body: streamOf([]).body }),
    });
    expect((await caller.fetch({ method: "GET", target: "/none" })).body.length).toBe(0);
  });

  it("does not hold a small answer behind it on a slow link", async () => {
    const big = 2 * 1024 * 1024;
    const pieces = Array.from({ length: big / CHUNK_BYTES }, () => new Uint8Array(CHUNK_BYTES));
    const { caller, stop } = await slowEnds(
      {
        request: async (input) =>
          input.target === "/big"
            ? { status: 200, headers: {}, body: streamOf(pieces).body }
            : { status: 200, headers: {}, body: utf8("small") },
      },
      64 * 1024,
    );
    try {
      const reader = (await caller.stream({ method: "GET", target: "/big" })).body.getReader();
      let got = 0;
      let gotWhenSmallCame = -1;
      const small = caller.fetch({ method: "GET", target: "/small" }).then((answer) => {
        gotWhenSmallCame = got;
        return text(answer.body);
      });
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        got += read.value.length;
      }
      expect(await small).toBe("small");
      expect(got).toBe(big);
      // Behind at most what was already in the wire, not behind the whole file.
      expect(gotWhenSmallCame).toBeGreaterThanOrEqual(0);
      expect(gotWhenSmallCame).toBeLessThan(STREAM_AHEAD_BYTES + 4 * CHUNK_BYTES);
    } finally {
      stop();
    }
  });

  it("keeps answers within the caller's window when a relay hides the queue from the server", async () => {
    // A relay takes what the server's socket sends at once and holds it for a slow phone: the
    // socket's backlog stays empty, and only the phone's acks say how much is still on its way.
    const big = 8 * 1024 * 1024;
    const pieces = () =>
      Array.from({ length: big / CHUNK_BYTES }, () => new Uint8Array(CHUNK_BYTES));
    const { caller, stop } = await slowEnds(
      {
        request: async (input) =>
          input.target === "/small"
            ? { status: 200, headers: {}, body: utf8("small") }
            : { status: 200, headers: {}, body: streamOf(pieces()).body },
      },
      64 * 1024,
      "relay",
    );
    try {
      // Two large answers at once, as a page asked for twice: they share the one window.
      const first = (await caller.stream({ method: "GET", target: "/one" })).body.getReader();
      const second = caller.fetch({ method: "GET", target: "/two" });
      let got = 0;
      let gotWhenSmallCame = -1;
      const small = caller.fetch({ method: "GET", target: "/small" }).then((answer) => {
        gotWhenSmallCame = got;
        return text(answer.body);
      });
      for (let read = await first.read(); !read.done; read = await first.read()) {
        got += read.value.length;
      }
      expect(await small).toBe("small");
      expect((await second).body.length).toBe(big);
      expect(got).toBe(big);
      // Behind at most the caller's window, not behind both answers.
      expect(gotWhenSmallCame).toBeGreaterThanOrEqual(0);
      expect(gotWhenSmallCame).toBeLessThan(ANSWER_WINDOW_BYTES + 4 * CHUNK_BYTES);
      expect(ANSWER_WINDOW_BYTES).toBeLessThan(big);
    } finally {
      stop();
    }
    // Sixteen megabytes sealed and opened: well under a second alone, and past the default five
    // under the full gate on a loaded machine (24 October 2026).
  }, 20_000);

  it("says its window before its first frame, and what it has taken of an answer", async () => {
    const channel = handChannel();
    const caller = createCaller(channel);
    const asked = caller.stream({ method: "GET", target: "/big" });
    expect(channel.sent[0]).toEqual({ t: "window", id: 0, bytes: ANSWER_WINDOW_BYTES });
    expect(channel.sent[1]).toMatchObject({ t: "req", id: 1 });
    const piece = new Uint8Array(CHUNK_BYTES);
    channel.onframe?.({ t: "res", id: 1, status: 200, headers: {}, end: false }, piece);
    await asked;
    channel.onframe?.({ t: "data", id: 1, end: false }, piece);
    expect(channel.sent.filter((header) => header.t === "ack")).toEqual([
      { t: "ack", id: 1, bytes: 2 * CHUNK_BYTES },
    ]);
    channel.onframe?.({ t: "data", id: 1, end: true }, new Uint8Array(10));
    expect(channel.sent.filter((header) => header.t === "ack").at(-1)).toEqual({
      t: "ack",
      id: 1,
      bytes: 2 * CHUNK_BYTES + 10,
    });
    caller.open("/v1/ws");
    expect(channel.sent.filter((header) => header.t === "window")).toHaveLength(1);
  });

  it("keeps about a second of what the caller takes on its way: little on a weak signal, more on a strong one", async () => {
    let clock = 1_000_000;
    const now = vi.spyOn(Date, "now").mockImplementation(() => clock);
    try {
      const channel = handChannel();
      createAnswerer(channel, {
        request: async () => ({ status: 200, headers: {}, body: new Uint8Array(64 * CHUNK_BYTES) }),
        socket: async () => ({ ok: true }),
      });
      const frames = () =>
        channel.sent.filter((header) => header.t === "res" || header.t === "data").length;
      const settled = async () => {
        let before = -1;
        while (before !== frames()) {
          before = frames();
          await new Promise((settle) => setTimeout(settle, 5));
        }
        return frames();
      };
      channel.onframe?.({ t: "window", id: 0, bytes: ANSWER_WINDOW_BYTES }, bytes(0));
      channel.onframe?.(
        { t: "req", id: 1, method: "GET", target: "/big", headers: {}, end: true },
        bytes(0),
      );
      // Before the caller has taken anything: the least window, 128 KiB.
      expect(await settled()).toBe(4);
      const ack = async (chunks: number, after: number) => {
        clock += after;
        channel.onframe?.({ t: "ack", id: 1, bytes: chunks * CHUNK_BYTES }, bytes(0));
        return await settled();
      };
      // A weak signal, 64 KiB a second: the window comes down to its least, 128 KiB, and nothing
      // more goes while that much is still on its way.
      expect(await ack(2, 1000)).toBe(6);
      expect(await ack(4, 1000)).toBe(8);
      expect(await ack(6, 1000)).toBe(10);
      expect(await ack(10, 1000)).toBe(14);
      clock += 3000;
      expect(await ack(14, 0)).toBe(18);
      // A strong one, 128 KiB in fifty milliseconds: it opens up, and the rest goes.
      expect(await ack(18, 50)).toBe(65);
    } finally {
      now.mockRestore();
    }
  });

  it("sends as it always has to a caller that never said its window", async () => {
    const channel = handChannel();
    const big = 4 * 1024 * 1024;
    createAnswerer(channel, {
      request: async () => ({ status: 200, headers: {}, body: new Uint8Array(big) }),
      socket: async () => ({ ok: true }),
    });
    channel.onframe?.(
      { t: "req", id: 1, method: "GET", target: "/big", headers: {}, end: true },
      bytes(0),
    );
    await expect
      .poll(() => channel.sent.filter((header) => header.t === "data" && header.end).length)
      .toBe(1);
  });

  it("ends every small answer asked for at once, though the caller has acked none of them", async () => {
    // Foodie's albums asked for eleven thumbnails at once through the relay, 13 to 47 KiB each
    // (24 October 2026). The caller acks an answer every 64 KiB of it, or at its end, and every
    // frame, an end included, waited for room in the window: past 128 KiB in flight no answer
    // could be acked and none could end, and every read on the tunnel after them waited too.
    const channel = handChannel();
    const sizes = [12_900, 47_900, 30_100, 22_400, 41_000, 18_700, 35_500, 46_800, 26_300, 39_200];
    createAnswerer(channel, {
      // As the server hands over every tunnelled answer: a stream, read as it is sent.
      request: async (input) => ({
        status: 200,
        headers: {},
        body: streamOf([new Uint8Array(sizes[Number(input.target.slice(1))] ?? 0)]).body,
      }),
      socket: async () => ({ ok: true }),
    });
    channel.onframe?.({ t: "window", id: 0, bytes: ANSWER_WINDOW_BYTES }, bytes(0));
    for (const [at] of sizes.entries()) {
      channel.onframe?.(
        { t: "req", id: at + 1, method: "GET", target: `/${at}`, headers: {}, end: true },
        bytes(0),
      );
    }
    await expect
      .poll(() => channel.sent.filter((header) => header.t === "data" && header.end).length)
      .toBe(sizes.length);
  });

  it("tells the reader when the stream fails partway, and when it runs over the limit", async () => {
    const failing = streamOf([new Uint8Array(10), new Uint8Array(10)], 1);
    const { caller } = await ends(
      {
        request: async (input) =>
          input.target === "/fails"
            ? { status: 200, headers: {}, body: failing.body }
            : { status: 200, headers: {}, body: streamOf([new Uint8Array(64)]).body },
      },
      { maxBodyBytes: 32 },
    );
    await expect(caller.fetch({ method: "GET", target: "/fails" })).rejects.toThrow(
      "The disk went away.",
    );
    await expect(caller.fetch({ method: "GET", target: "/long" })).rejects.toThrow("too long");
  });

  it("stops reading once the tunnel has closed", async () => {
    const pieces = Array.from({ length: 64 }, () => new Uint8Array(CHUNK_BYTES));
    const stream = streamOf(pieces);
    const { caller, stop } = await slowEnds(
      { request: async () => ({ status: 200, headers: {}, body: stream.body }) },
      1024,
    );
    try {
      const asked = caller.stream({ method: "GET", target: "/big" });
      await asked;
      caller.close("gone");
      await expect.poll(() => stream.seen.cancelled, { timeout: 2000 }).toBe(true);
    } finally {
      stop();
    }
  });
});

describe("a reader that stops, and a body that goes up (ADR 0153)", () => {
  it("tells the answerer to stop sending, and it stops reading what it was sending", async () => {
    const pieces = Array.from({ length: 256 }, () => new Uint8Array(CHUNK_BYTES));
    const stream = streamOf(pieces);
    const { caller, stop } = await slowEnds(
      {
        request: async (input) =>
          input.target === "/big"
            ? { status: 200, headers: {}, body: stream.body }
            : { status: 200, headers: {}, body: utf8("after") },
      },
      64 * 1024,
    );
    try {
      const reader = (await caller.stream({ method: "GET", target: "/big" })).body.getReader();
      await reader.read();
      await reader.cancel();
      await expect.poll(() => stream.seen.cancelled, { timeout: 2000 }).toBe(true);
      // The tunnel carries on for everything else.
      expect(text((await caller.fetch({ method: "GET", target: "/after" })).body)).toBe("after");
    } finally {
      stop();
    }
  });

  it("gives up on an answer its caller let go, before its headers and partway through its body", async () => {
    const channel = handChannel();
    const caller = createCaller(channel);
    const early = new AbortController();
    const waiting = caller.fetch({ method: "GET", target: "/page", signal: early.signal });
    early.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(channel.sent).toContainEqual({ t: "cancel", id: 1 });
    // What comes for it after is nobody's: nothing throws.
    channel.onframe?.({ t: "res", id: 1, status: 200, headers: {}, end: false }, utf8("a"));
    channel.onframe?.({ t: "data", id: 1, end: true }, utf8("b"));

    const late = new AbortController();
    const reading = caller.fetch({ method: "GET", target: "/page", signal: late.signal });
    channel.onframe?.({ t: "res", id: 2, status: 200, headers: {}, end: false }, utf8("a"));
    late.abort();
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
    expect(channel.sent).toContainEqual({ t: "cancel", id: 2 });

    // Given up on once it has all come, or before it was asked, it says nothing.
    const done = new AbortController();
    const whole = caller.fetch({ method: "GET", target: "/small", signal: done.signal });
    channel.onframe?.({ t: "res", id: 3, status: 200, headers: {}, end: true }, utf8("ok"));
    expect(text((await whole).body)).toBe("ok");
    done.abort();
    await expect(
      caller.fetch({ method: "GET", target: "/never", signal: done.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(channel.sent.filter((header) => header.t === "cancel")).toHaveLength(2);
    expect(channel.sent.filter((header) => header.t === "req")).toHaveLength(3);
  });

  it("stops the answerer sending a page its caller gave up on, before or after it was built", async () => {
    const pieces = Array.from({ length: 256 }, () => new Uint8Array(CHUNK_BYTES));
    const sending = streamOf(pieces);
    const built = streamOf(pieces);
    let build: (() => void) | undefined;
    const { caller, stop } = await slowEnds(
      {
        request: async (input) => {
          if (input.target === "/sending") return { status: 200, headers: {}, body: sending.body };
          if (input.target === "/building") {
            await new Promise<void>((resolve) => {
              build = resolve;
            });
            return { status: 200, headers: {}, body: built.body };
          }
          return { status: 200, headers: {}, body: utf8("after") };
        },
      },
      64 * 1024,
      "relay",
    );
    try {
      const partway = new AbortController();
      const page = caller.fetch({ method: "GET", target: "/sending", signal: partway.signal });
      await new Promise((settle) => setTimeout(settle, 20));
      partway.abort();
      await expect(page).rejects.toMatchObject({ name: "AbortError" });
      await expect.poll(() => sending.seen.cancelled, { timeout: 2000 }).toBe(true);

      const early = new AbortController();
      const later = caller.fetch({ method: "GET", target: "/building", signal: early.signal });
      await expect.poll(() => build !== undefined, { timeout: 2000 }).toBe(true);
      early.abort();
      await expect(later).rejects.toMatchObject({ name: "AbortError" });
      build?.();
      await expect.poll(() => built.seen.cancelled, { timeout: 2000 }).toBe(true);

      // The tunnel carries on for everything else.
      expect(text((await caller.fetch({ method: "GET", target: "/after" })).body)).toBe("after");
    } finally {
      stop();
    }
  });

  it("paces a body going up by the answerer's acks, so a small request is not held behind it", async () => {
    const order: string[] = [];
    const { caller, stop } = await slowEnds(
      {
        request: async (input) => {
          order.push(input.target);
          return { status: 200, headers: {}, body: utf8(String(input.body?.length ?? 0)) };
        },
      },
      64 * 1024,
      "up",
    );
    try {
      // The caller speaks first, as a phone does when it opens its socket: only then does the
      // answerer say its window.
      await caller.fetch({ method: "GET", target: "/hello" });
      const big = 4 * 1024 * 1024;
      const up = caller.fetch({ method: "PUT", target: "/up", body: new Uint8Array(big) });
      const small = caller.fetch({ method: "GET", target: "/small" });
      expect(text((await small).body)).toBe("0");
      expect(text((await up).body)).toBe(String(big));
      // Behind at most a window of the upload, not behind all of it.
      expect(order).toEqual(["/hello", "/small", "/up"]);
    } finally {
      stop();
    }
  });

  it("sends a body whole to an answerer that never said its window, as before", async () => {
    const channel = handChannel();
    const caller = createCaller(channel);
    void caller.stream({ method: "PUT", target: "/up", body: new Uint8Array(4 * 1024 * 1024) });
    // Its own window first, then the whole body.
    expect(channel.sent.filter((header) => header.t !== "window")).toHaveLength(
      (4 * 1024 * 1024) / CHUNK_BYTES,
    );
  });

  it("says nothing before the caller has spoken, then its window first", async () => {
    // A phone listens on the channel only once its half of the handshake is done: anything the
    // answerer sent before then was lost, and the tunnel's nonces with it.
    const channel = handChannel();
    createAnswerer(channel, {
      request: async () => ({ status: 200, headers: {}, body: bytes(0) }),
      socket: async () => ({ ok: true }),
    });
    expect(channel.sent).toEqual([]);
    channel.onframe?.({ t: "open", id: 1, target: "/v1/ws" }, bytes(0));
    expect(channel.sent[0]).toEqual({ t: "window", id: 0, bytes: UPLOAD_WINDOW_BYTES });
    channel.onframe?.({ t: "open", id: 2, target: "/v1/ws" }, bytes(0));
    expect(channel.sent.filter((header) => header.t === "window")).toHaveLength(1);
  });

  it("reads the new headers, and refuses a window or an ack with no sense in it", () => {
    expect(readHeader({ t: "window", id: 0, bytes: 1024 })).toEqual({
      t: "window",
      id: 0,
      bytes: 1024,
    });
    expect(readHeader({ t: "ack", id: 3, bytes: 0 })).toEqual({ t: "ack", id: 3, bytes: 0 });
    expect(readHeader({ t: "cancel", id: 3 })).toEqual({ t: "cancel", id: 3 });
    expect(readHeader({ t: "window", id: 0, bytes: 0 })).toBeUndefined();
    expect(readHeader({ t: "ack", id: 3, bytes: -1 })).toBeUndefined();
    expect(readHeader({ t: "ack", id: 3, bytes: "lots" })).toBeUndefined();
  });
});

describe("sockets through the tunnel", () => {
  it("open, carry text both ways, and close from either end with a code", async () => {
    let peer: TunnelSocket | undefined;
    const { caller } = await ends({
      socket: async (target, socket) => {
        if (target !== "/v1/ws?ticket=t1") return { ok: false, code: 4003, reason: "unauthorized" };
        peer = socket;
        socket.onmessage = (message) => socket.send(`echo ${message}`);
        return { ok: true };
      },
    });
    const socket = caller.open("/v1/ws?ticket=t1");
    const opened = new Promise<void>((resolve) => {
      socket.onopen = resolve;
    });
    await opened;
    const heard = new Promise<string>((resolve) => {
      socket.onmessage = resolve;
    });
    socket.send("hello");
    expect(await heard).toBe("echo hello");

    // A message longer than a chunk arrives whole.
    const long = "x".repeat(CHUNK_BYTES + 10);
    const heardLong = new Promise<string>((resolve) => {
      socket.onmessage = resolve;
    });
    socket.send(long);
    expect(await heardLong).toBe(`echo ${long}`);

    const closed = new Promise<[number, string]>((resolve) => {
      socket.onclose = (code, reason) => resolve([code, reason]);
    });
    peer?.close(4001, "token_revoked");
    expect(await closed).toEqual([4001, "token_revoked"]);

    const refused = caller.open("/v1/ws?ticket=wrong");
    const refusal = new Promise<[number, string]>((resolve) => {
      refused.onclose = (code, reason) => resolve([code, reason]);
    });
    expect(await refusal).toEqual([4003, "unauthorized"]);
  });

  it("carry what is sent behind an open, read only once the answerer takes it (ADR 0253)", async () => {
    let letIn: (taken: boolean) => void = () => undefined;
    const asked: (Record<string, string> | undefined)[] = [];
    const read: string[] = [];
    const { caller } = await ends({
      socket: async (_target, peer, headers) => {
        asked.push(headers);
        // Wired at once, as the server's is, and still read nothing until it says yes.
        peer.onmessage = (message) => read.push(message);
        const taken = await new Promise<boolean>((resolve) => {
          letIn = resolve;
        });
        return taken ? { ok: true } : { ok: false, code: 4001, reason: "unauthorized" };
      },
    });
    const socket = caller.open("/v1/ws", { "x-chips-device": "dev_1" });
    const opened = new Promise<void>((resolve) => {
      socket.onopen = resolve;
    });
    socket.send("hello");
    socket.send("subscribe");
    await expect.poll(() => asked).toEqual([{ "x-chips-device": "dev_1" }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(read).toEqual([]);
    letIn(true);
    await opened;
    expect(read).toEqual(["hello", "subscribe"]);
    socket.send("after");
    await expect.poll(() => read).toEqual(["hello", "subscribe", "after"]);

    // Turned away: what came behind the open is never read, and the caller hears why.
    read.length = 0;
    const refused = caller.open("/v1/ws");
    const refusal = new Promise<[number, string]>((resolve) => {
      refused.onclose = (code, reason) => resolve([code, reason]);
    });
    refused.send("hello");
    await expect.poll(() => asked).toHaveLength(2);
    expect(asked[1]).toBeUndefined();
    letIn(false);
    expect(await refusal).toEqual([4001, "unauthorized"]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(read).toEqual([]);
  });

  it("tell a socket's handler once that it went, when it went while it was being taken", async () => {
    let letIn: () => void = () => undefined;
    const closes: number[] = [];
    const read: string[] = [];
    const { caller, answerer } = await ends({
      socket: async (_target, peer) => {
        peer.onmessage = (message) => read.push(message);
        peer.onclose = (code) => closes.push(code);
        await new Promise<void>((resolve) => {
          letIn = resolve;
        });
        return { ok: true };
      },
    });
    const socket = caller.open("/v1/ws");
    socket.send("hello");
    socket.close(1000, "done");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(closes).toEqual([]);
    letIn();
    await expect.poll(() => closes).toEqual([CLOSE_TUNNEL_GONE]);
    expect(read).toEqual([]);
    expect(answerer.openSockets()).toBe(0);
  });

  it("hold no more for the sockets being taken than one message may carry, counted in bytes", async () => {
    const { caller, answerer } = await ends(
      { socket: () => new Promise(() => undefined) },
      { maxSocketMessageBytes: 20 },
    );
    const gone = new Promise<string>((resolve) => {
      answerer.onclose = resolve;
    });
    // Six letters of two bytes each, on each of two sockets: 24 bytes held in all, over 20.
    caller.open("/v1/ws").send("é".repeat(6));
    caller.open("/v1/ws").send("é".repeat(6));
    expect(await gone).toBe("message_too_long");
  });

  it("count a socket that went while it was being taken until its handler has answered", async () => {
    const answers: ((ok: boolean) => void)[] = [];
    const { caller, answerer } = await ends(
      {
        socket: () =>
          new Promise((resolve) => {
            answers.push((ok) =>
              resolve(ok ? { ok: true } : { ok: false, code: 4001, reason: "unauthorized" }),
            );
          }),
      },
      { maxSockets: 1 },
    );
    const first = caller.open("/v1/ws");
    await expect.poll(() => answers).toHaveLength(1);
    first.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Its handler is still deciding, so it still holds the one place.
    const second = caller.open("/v1/ws");
    const refusal = new Promise<number>((resolve) => {
      second.onclose = (code) => resolve(code);
    });
    expect(await refusal).toBe(CLOSE_TOO_MANY);
    answers[0]?.(false);
    await expect.poll(() => answerer.openSockets()).toBe(0);
    const third = caller.open("/v1/ws");
    await expect.poll(() => answers).toHaveLength(2);
    answers[1]?.(true);
    await new Promise<void>((resolve) => {
      third.onopen = resolve;
    });
  });

  it("close the tunnel on an open under an id already used, which no caller sends", async () => {
    const key = await generateKeyPair();
    const started = await initiateHandshake(key.publicKey);
    const answered = await respondHandshake(key, started.message);
    const tunnel = await started.complete(answered.message);
    const [phoneWire, serverWire] = wirePair();
    const phone = createChannel(tunnel, phoneWire);
    const answerer = createAnswerer(createChannel(answered.tunnel, serverWire), {
      request: async () => ({ status: 200, headers: {}, body: bytes(0) }),
      socket: async () => ({ ok: true }),
    });
    const gone = new Promise<string>((resolve) => {
      answerer.onclose = resolve;
    });
    phone.send({ t: "open", id: 3, target: "/v1/ws" });
    phone.send({ t: "open", id: 3, target: "/v1/ws" });
    expect(await gone).toBe("socket_id_reused");
  });

  it("tell a caller its socket was refused when the handler failed, in a code that is not a removal", async () => {
    const { caller } = await ends({
      socket: async () => {
        throw new Error("the app fell over");
      },
    });
    const refused = caller.open("/v1/ws");
    const closed = new Promise<[number, string]>((resolve) => {
      refused.onclose = (code, reason) => resolve([code, reason]);
    });
    expect(await closed).toEqual([CLOSE_REFUSED, "refused"]);
    expect(CLOSE_REFUSED).not.toBe(4003);
  });

  it("hold no more sockets than the answerer allows", async () => {
    const { caller, answerer } = await ends({}, { maxSockets: 1 });
    const first = caller.open("/v1/ws?ticket=a");
    await new Promise<void>((resolve) => {
      first.onopen = resolve;
    });
    const second = caller.open("/v1/ws?ticket=b");
    const refusal = new Promise<[number, string]>((resolve) => {
      second.onclose = (code, reason) => resolve([code, reason]);
    });
    expect(await refusal).toEqual([CLOSE_TOO_MANY, "too_many_sockets"]);
    expect(answerer.openSockets()).toBe(1);
    first.close();
    // Wait for the close to land, not for a number of milliseconds: five was enough on an idle
    // machine and not under a coverage run beside two simulators.
    await expect.poll(() => answerer.openSockets()).toBe(0);
  });

  it("tell every open socket and every waiting request when the tunnel closes", async () => {
    const { caller, answerer } = await ends({
      request: () => new Promise(() => undefined),
    });
    const socket = caller.open("/v1/ws?ticket=a");
    await new Promise<void>((resolve) => {
      socket.onopen = resolve;
    });
    const closed = new Promise<number>((resolve) => {
      socket.onclose = (code) => resolve(code);
    });
    const waiting = caller.fetch({ method: "GET", target: "/never" });
    const told = new Promise<string>((resolve) => {
      answerer.onclose = resolve;
    });
    caller.close("bye");
    expect(await closed).toBe(CLOSE_TUNNEL_GONE);
    // Typed as a close, with its reason, so a reader can tell it from a refusal and ask again
    // through the next tunnel (ADR 0179).
    await expect(waiting).rejects.toMatchObject({ name: "TunnelClosedError", reason: "bye" });
    expect(await told).toBe("peer_closed");
    const after = caller.fetch({ method: "GET", target: "/after" });
    await expect(after).rejects.toBeInstanceOf(TunnelClosedError);
    await expect(after).rejects.toThrow("The tunnel is closed.");
  });

  it("tell a socket opened on a closed tunnel, when its handler is attached after an await", async () => {
    const { caller } = await ends();
    caller.close("bye");
    // What the transport does: open the socket inside an async function, and attach `onclose` once
    // that has returned to it. A close told on a microtask has already happened by then, to nobody.
    const opening = async () => caller.open("/v1/ws?ticket=a");
    const socket = await opening();
    let code: number | undefined;
    socket.onclose = (closedWith) => {
      code = closedWith;
    };
    await expect.poll(() => code).toBe(CLOSE_TUNNEL_GONE);
  });
});

describe("the answers' pace, against a caller that acks too fast, too far or never (SEC-43)", () => {
  /** A pace on a clock the test moves, the caller's window said. */
  function paced() {
    const clock = { at: 1_000_000 };
    const it = pace(
      () => false,
      () => clock.at,
    );
    it.windowOf(ANSWER_WINDOW_BYTES);
    return { paced: it, clock };
  }

  /** Whether `room` let the answer go once everything already queued has run. */
  async function lets(waiting: Promise<void>): Promise<boolean> {
    let gone = false;
    void waiting.then(() => {
      gone = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return gone;
  }

  it("takes a flood of acks in a few marks, so the last costs what the first did", () => {
    // The review's stranger streamed some 10,000 small acks a second: each one rebuilt every mark
    // of the last two seconds, 44 µs at 5,000 marks and 118 µs at 20,000, and the server's one
    // event loop went to 100%. These 50,000 inside one second took seconds that way.
    const { paced: p, clock } = paced();
    p.sent(1, 1_000_000);
    const start = performance.now();
    for (let taken = 1; taken <= 50_000; taken += 1) {
      clock.at += 0.02;
      p.took(1, taken);
    }
    expect(performance.now() - start).toBeLessThan(500);
    expect(p.inFlight()).toBe(1_000_000 - 50_000);
  });

  it("counts an ack no further than what was sent", async () => {
    const { paced: p } = paced();
    p.sent(1, 100);
    p.sent(2, 200 * 1024);
    // An ack for ten megabytes of a hundred-byte answer would have made room for everything.
    p.took(1, 10_000_000);
    expect(p.inFlight()).toBe(200 * 1024);
    expect(await lets(p.room(2))).toBe(false);
    p.took(2, 200 * 1024);
    expect(await lets(p.room(2))).toBe(true);
  });

  it("forgets a finished answer the caller is silent on for a minute", async () => {
    const { paced: p, clock } = paced();
    p.sent(1, 100 * 1024);
    p.finished(1);
    p.sent(2, 100 * 1024);
    const waiting = p.room(2);
    expect(await lets(waiting)).toBe(false);
    clock.at += 59_000;
    p.sent(3, 1);
    expect(p.inFlight()).toBe(200 * 1024 + 1);
    clock.at += 2000;
    p.sent(3, 1);
    expect(p.inFlight()).toBe(100 * 1024 + 2);
    expect(await lets(waiting)).toBe(true);
  });

  it("counts at most 1,024 finished answers waiting on their last ack, the oldest forgotten first", () => {
    const { paced: p } = paced();
    for (let id = 1; id <= 1100; id += 1) {
      p.sent(id, 10);
      p.finished(id);
    }
    expect(p.inFlight()).toBe(1024 * 10);
    // The newest are kept: an ack for the last settles it, and one for the first is nobody's.
    p.took(1100, 10);
    expect(p.inFlight()).toBe(1023 * 10);
    p.took(1, 10);
    expect(p.inFlight()).toBe(1023 * 10);
  });

  it("still lets an answer go once the caller has taken enough of what is in flight", async () => {
    const { paced: p, clock } = paced();
    p.sent(1, 256 * 1024);
    const waiting = p.room(1);
    expect(await lets(waiting)).toBe(false);
    // Acks every 50 ms: the window follows what the caller takes, and the answer goes.
    for (let taken = 64 * 1024; taken <= 192 * 1024; taken += 64 * 1024) {
      clock.at += 50;
      p.took(1, taken);
    }
    expect(await lets(waiting)).toBe(true);
    expect(p.inFlight()).toBe(64 * 1024);
  });
});
