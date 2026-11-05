/**
 * The Expo push adapter (M4.3): the batching, the header, and what happens when the service
 * is not there. A push is best effort, so nothing here is allowed to throw at the caller.
 */

import { createLogger } from "@chipschat/platform";
import { describe, expect, it, vi } from "vitest";
import type { PushMessage } from "../../application/ports/push.js";
import { createExpoPushSender } from "./expo.js";

const logger = createLogger({ level: "silent" });
const URL_ = "https://push.example/send";

function message(to: string): PushMessage {
  return { to, title: "Chips", body: "A decision is waiting", data: { approval_id: "apr_1" } };
}

function answering(handler: (body: PushMessage[]) => unknown) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)) as PushMessage[];
    return new Response(JSON.stringify(handler(sent)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}

describe("sending a push", () => {
  it("posts the messages and hands back a ticket each, in order", async () => {
    const fetch = answering((sent) => ({
      data: sent.map((one, index) => ({ status: "ok", id: `ticket_${index}_${one.to}` })),
    }));
    const sender = createExpoPushSender({ url: URL_, logger, fetch });

    const tickets = await sender.send([message("a"), message("b")]);

    expect(tickets).toEqual([
      { ok: true, id: "ticket_0_a" },
      { ok: true, id: "ticket_1_b" },
    ]);
  });

  it("carries the access token when there is one, and no header when there is not", async () => {
    const seen: (string | undefined)[] = [];
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("authorization") ?? undefined);
      return new Response(JSON.stringify({ data: [{ status: "ok" }] }), { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    await createExpoPushSender({ url: URL_, logger, fetch, accessToken: "s3cret" }).send([
      message("a"),
    ]);
    await createExpoPushSender({ url: URL_, logger, fetch }).send([message("a")]);

    expect(seen).toEqual(["Bearer s3cret", undefined]);
  });

  it("sends a hundred at a time, and keeps the tickets in one list", async () => {
    const batches: number[] = [];
    const fetch = answering((sent) => {
      batches.push(sent.length);
      return { data: sent.map(() => ({ status: "ok" })) };
    });
    const sender = createExpoPushSender({ url: URL_, logger, fetch });

    const tickets = await sender.send(
      Array.from({ length: 205 }, (_, index) => message(`d${index}`)),
    );

    expect(batches).toEqual([100, 100, 5]);
    expect(tickets).toHaveLength(205);
  });

  it("reads back the error a ticket carries, which is how a dead token is found", async () => {
    const fetch = answering(() => ({
      data: [
        { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
      ],
    }));
    const tickets = await createExpoPushSender({ url: URL_, logger, fetch }).send([message("a")]);
    expect(tickets).toEqual([
      { ok: false, error: "DeviceNotRegistered", message: "not registered" },
    ]);
  });
});

describe("when the push service is not there", () => {
  it("fails every message rather than throwing, when the request will not go", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof globalThis.fetch;

    const tickets = await createExpoPushSender({ url: URL_, logger, fetch }).send([
      message("a"),
      message("b"),
    ]);

    expect(tickets.every((ticket) => !ticket.ok)).toBe(true);
    expect(tickets).toHaveLength(2);
  });

  it("fails every message when the answer is not a 2xx", async () => {
    const fetch = vi.fn(
      async () => new Response("no", { status: 503 }),
    ) as unknown as typeof globalThis.fetch;
    const tickets = await createExpoPushSender({ url: URL_, logger, fetch }).send([message("a")]);
    expect(tickets).toEqual([{ ok: false, message: "http 503" }]);
  });

  it("fails every message when the answer is not JSON", async () => {
    const fetch = vi.fn(
      async () => new Response("<html>", { status: 200 }),
    ) as unknown as typeof globalThis.fetch;
    const tickets = await createExpoPushSender({ url: URL_, logger, fetch }).send([message("a")]);
    expect(tickets[0]?.ok).toBe(false);
  });

  it("trusts no ticket when the list is not one per message", async () => {
    // Matched by position and nothing else, so a short list cannot be matched at all.
    const fetch = answering(() => ({ data: [{ status: "ok" }] }));
    const tickets = await createExpoPushSender({ url: URL_, logger, fetch }).send([
      message("a"),
      message("b"),
    ]);
    expect(tickets.map((ticket) => ticket.ok)).toEqual([false, false]);
  });
});

describe("whether a push can go at all (ADR 0244)", () => {
  const EXPO = "https://exp.host/--/api/v2/push/send";

  it("sends nothing to Expo without an access token, and says so once as it starts", async () => {
    const warn = vi.fn();
    const said = { ...logger, warn } as unknown as typeof logger;
    const fetch = answering(() => ({ data: [{ status: "ok" }] }));

    const sender = createExpoPushSender({ url: EXPO, logger: said, fetch });
    const tickets = await sender.send([message("a")]);

    expect(sender.readiness()).toBe("no_access_token");
    expect(fetch).not.toHaveBeenCalled();
    expect(tickets).toEqual([{ ok: false, message: "no_access_token" }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[1]).toMatch(/CHIPS_PUSH_ACCESS_TOKEN is not set/);
  });

  it("is ready for Expo with a token, and for any other service without one", () => {
    const fetch = answering(() => ({ data: [] }));
    expect(
      createExpoPushSender({ url: EXPO, logger, fetch, accessToken: "s3cret" }).readiness(),
    ).toBe("ready");
    expect(createExpoPushSender({ url: URL_, logger, fetch }).readiness()).toBe("ready");
  });

  it.each([401, 403])(
    "stops sending after a %i, which a token that works never gets",
    async (status) => {
      const fetch = vi.fn(
        async () => new Response("unauthorized", { status }),
      ) as unknown as typeof globalThis.fetch;
      const sender = createExpoPushSender({ url: EXPO, logger, fetch, accessToken: "revoked" });

      expect(await sender.send([message("a")])).toEqual([{ ok: false, message: "refused" }]);
      expect(sender.readiness()).toBe("refused");
      await sender.send([message("b")]);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it("is failing while the push service doesn't take its pushes, and ready once it does", async () => {
    let answer: "down" | "busy" | "tickets" = "down";
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (answer === "down") throw new Error("connect ECONNREFUSED");
      if (answer === "busy") return new Response("no", { status: 503 });
      const sent = JSON.parse(String(init?.body)) as PushMessage[];
      return Response.json({
        data: sent.map(() => ({ status: "error", details: { error: "DeviceNotRegistered" } })),
      });
    }) as unknown as typeof globalThis.fetch;
    const sender = createExpoPushSender({ url: URL_, logger, fetch });
    expect(sender.standing()).toBe("ready");

    await sender.send([message("a")]);
    expect(sender.standing()).toBe("failing");
    // It still sends: that is how it learns the service is back.
    expect(sender.readiness()).toBe("ready");
    answer = "busy";
    await sender.send([message("b")]);
    expect(sender.standing()).toBe("failing");
    // A ticket for each push, even one saying its phone is gone, is the service taking them.
    answer = "tickets";
    await sender.send([message("c")]);
    expect(sender.standing()).toBe("ready");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stands as its readiness when it can't push at all", async () => {
    const fetch = vi.fn(
      async () => new Response("unauthorized", { status: 403 }),
    ) as unknown as typeof globalThis.fetch;
    const sender = createExpoPushSender({ url: URL_, logger, fetch, accessToken: "revoked" });
    await sender.send([message("a")]);
    expect(sender.standing()).toBe("refused");
    const none = createExpoPushSender({
      url: "https://exp.host/--/api/v2/push/send",
      logger,
      fetch,
    });
    expect(none.standing()).toBe("no_access_token");
  });

  it("stays ready after a failure that is not about the token", async () => {
    const fetch = vi.fn(
      async () => new Response("no", { status: 503 }),
    ) as unknown as typeof globalThis.fetch;
    const sender = createExpoPushSender({ url: EXPO, logger, fetch, accessToken: "s3cret" });
    await sender.send([message("a")]);
    expect(sender.readiness()).toBe("ready");
  });
});

describe("a push's receipts (the stranger review)", () => {
  /** A push service that answers receipts for the ids it knows, and says where it was asked. */
  function receipting(known: Record<string, unknown>, status = 200) {
    const asked: { url: string; ids: unknown; authorization: string | null }[] = [];
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { ids: string[] };
      asked.push({
        url,
        ids: body.ids,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (status !== 200) return new Response("no", { status });
      return Response.json({
        data: Object.fromEntries(body.ids.filter((id) => id in known).map((id) => [id, known[id]])),
      });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, asked };
  }

  it("asks beside where pushes go, with the token, and reads each receipt", async () => {
    const service = receipting({
      a: { status: "ok" },
      b: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
    });
    const sender = createExpoPushSender({
      url: "https://exp.host/--/api/v2/push/send",
      logger,
      fetch: service.fetch,
      accessToken: "s3cret",
    });
    const found = await sender.receipts?.(["a", "b", "c"]);
    expect(found).toEqual(
      new Map([
        ["a", { ok: true }],
        ["b", { ok: false, error: "DeviceNotRegistered", message: "gone" }],
      ]),
    );
    expect(service.asked).toEqual([
      {
        url: "https://exp.host/--/api/v2/push/getReceipts",
        ids: ["a", "b", "c"],
        authorization: "Bearer s3cret",
      },
    ]);
  });

  it("asks the push relay at its receipts door, three hundred at a time", async () => {
    const service = receipting({});
    const sender = createExpoPushSender({
      url: "https://relay.chipschat.ai/v1/push",
      logger,
      fetch: service.fetch,
    });
    const ids = Array.from({ length: 301 }, (_, i) => `t${i}`);
    expect(await sender.receipts?.(ids)).toEqual(new Map());
    expect(service.asked.map((each) => [each.url, (each.ids as string[]).length])).toEqual([
      ["https://relay.chipschat.ai/v1/push/receipts", 300],
      ["https://relay.chipschat.ai/v1/push/receipts", 1],
    ]);
  });

  it("asks a push relay with no receipts door once, and then no more", async () => {
    const service = receipting({}, 404);
    const sender = createExpoPushSender({ url: URL_, logger, fetch: service.fetch });
    expect(typeof (await sender.receipts?.(["a"]))).toBe("string");
    expect(typeof (await sender.receipts?.(["a"]))).toBe("string");
    expect(service.asked).toHaveLength(1);
  });

  it("says why there are none rather than throwing, and asks nothing when it can't push", async () => {
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof globalThis.fetch;
    const sender = createExpoPushSender({ url: URL_, logger, fetch: down });
    expect(await sender.receipts?.(["a"])).toBe("ECONNREFUSED");
    const failing = createExpoPushSender({ url: URL_, logger, fetch: receipting({}, 500).fetch });
    expect(await failing.receipts?.(["a"])).toBe("http 500");
    const odd = vi.fn(async () =>
      Response.json({ data: [] }),
    ) as unknown as typeof globalThis.fetch;
    expect(
      typeof (await createExpoPushSender({ url: URL_, logger, fetch: odd }).receipts?.(["a"])),
    ).toBe("string");
    const none = receipting({});
    const off = createExpoPushSender({
      url: "https://exp.host/--/api/v2/push/send",
      logger,
      fetch: none.fetch,
    });
    expect(await off.receipts?.(["a"])).toBe("no_access_token");
    expect(none.asked).toEqual([]);
  });
});
