/**
 * The push door (ADR 0246): it sends on only a Chips push, with the app's token, within its
 * limits, and answers in Expo's shape, so a server reads it as it reads Expo.
 */

import { createLogger, defaultConfig, EXPO_PUSH } from "@chipschat/platform";
import { PUSH_WORDS } from "@chipschat/protocol";
import { describe, expect, it, vi } from "vitest";
import {
  createPushDoor,
  MOST_MESSAGE_BYTES,
  MOST_MESSAGES,
  PER_PHONE,
  PER_PLACE,
  pushDoorOf,
} from "./push.js";

const logger = createLogger({ level: "silent", name: "push-door-test" });
const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";
const UPSTREAM = "https://expo.example/push/send";

/** A push as a server's sender writes one: fixed words, ids and a sealed line. */
function push(to = TOKEN, extra: Record<string, unknown> = {}) {
  return {
    to,
    ...PUSH_WORDS.message,
    priority: "high",
    ttl: 600,
    sound: "default",
    mutableContent: true,
    data: { device_id: "dev_1", space_id: "spc_1", sealed: "c2VhbGVk" },
    ...extra,
  };
}

/** Expo, answering a ticket for each message it was sent, and keeping what it was sent. */
function expo(status = 200) {
  const posts: { body: unknown[]; authorization: string | null }[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as unknown[];
    posts.push({ body, authorization: new Headers(init?.headers).get("authorization") });
    if (status !== 200) return new Response("no", { status });
    return Response.json({ data: body.map((_, index) => ({ status: "ok", id: `t${index}` })) });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, posts };
}

function door(
  fetch: typeof globalThis.fetch,
  clock = () => 0,
  counted?: (n: number) => void,
  mostCounted?: number,
) {
  return createPushDoor({
    accessToken: "app-token",
    upstream: UPSTREAM,
    logger,
    fetch,
    clock,
    counted,
    mostCounted,
  });
}

const send = (d: ReturnType<typeof door>, body: unknown, place = "203.0.113.7") =>
  d.send(JSON.stringify(body), place);

describe("the push door", () => {
  it("sends a Chips push on to Expo with the app's token, and answers Expo's tickets", async () => {
    const upstream = expo();
    const counted = vi.fn();
    const answer = await send(
      door(upstream.fetch, () => 0, counted),
      [push(), push()],
    );
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toEqual({
      data: [
        { status: "ok", id: "t0" },
        { status: "ok", id: "t1" },
      ],
    });
    expect(upstream.posts).toHaveLength(1);
    expect(upstream.posts[0]?.authorization).toBe("Bearer app-token");
    expect(upstream.posts[0]?.body[0]).toEqual(push());
    expect(counted).toHaveBeenCalledWith(2);
  });

  it("drops what a Chips push doesn't have", async () => {
    const upstream = expo();
    await send(door(upstream.fetch), [push(TOKEN, { badge: 9, channelId: "x", subtitle: "hi" })]);
    expect(upstream.posts[0]?.body[0]).toEqual(push());
  });

  it("refuses anything that isn't a list of pushes, and sends none of it", async () => {
    const upstream = expo();
    const d = door(upstream.fetch);
    const refused = ["not json", {}, [], Array.from({ length: MOST_MESSAGES + 1 }, () => push())];
    for (const body of refused) {
      const answer = await d.send(typeof body === "string" ? body : JSON.stringify(body), "p");
      expect(answer.status).toBe(400);
      expect(JSON.parse(answer.body).error.code).toBe("bad_request");
    }
    expect(upstream.posts).toHaveLength(0);
  });

  it("answers each entry that isn't a Chips push with a ticket of its own, and sends the rest", async () => {
    const upstream = expo();
    const d = door(upstream.fetch);
    const wrong = [
      push(TOKEN, { title: 7 }),
      push(TOKEN, { data: { n: 1 } }),
      push(TOKEN, { priority: "urgent" }),
      push(TOKEN, { ttl: -1 }),
    ];
    const answer = await send(d, [push(), ...wrong]);
    expect(answer.status).toBe(200);
    const [sent, ...refused] = JSON.parse(answer.body).data;
    expect(sent).toEqual({ status: "ok", id: "t0" });
    expect(refused).toEqual(wrong.map(() => ({ status: "error", message: expect.any(String) })));
    expect(upstream.posts).toEqual([expect.objectContaining({ body: [push()] })]);
  });

  it("sends on only Chips's own words, so nobody's sentence reaches a lock screen as Chips", async () => {
    const upstream = expo();
    const d = door(upstream.fetch);
    const decision = push(TOKEN, PUSH_WORDS.decision);
    const madeUp = [
      push(TOKEN, { title: "Chips", body: "Your key ran out. Pair again at evil.example" }),
      // Fixed words, but with the decision's buttons on them.
      push(TOKEN, { categoryId: "decision" }),
      // One of Chips's titles with somebody else's body, and a title on its own.
      push(TOKEN, { body: "Tap to see it." }),
      { to: TOKEN, title: PUSH_WORDS.message.title },
      // Nothing to show, which no server sends.
      { to: TOKEN, data: { device_id: "dev_1" } },
    ];
    const answer = await send(d, [decision, ...madeUp]);
    const tickets = JSON.parse(answer.body).data as { status: string }[];
    expect(tickets.map((ticket) => ticket.status)).toEqual(["ok", ...madeUp.map(() => "error")]);
    expect(upstream.posts.flatMap((post) => post.body)).toEqual([decision]);
  });

  it("sends every sentence a server says", async () => {
    const upstream = expo();
    const d = door(upstream.fetch);
    const all = Object.values(PUSH_WORDS).map((words, index) =>
      push(`ExponentPushToken[phone${index}]`, words),
    );
    const tickets = JSON.parse((await send(d, all)).body).data as { status: string }[];
    expect(tickets.every((ticket) => ticket.status === "ok")).toBe(true);
  });

  it("answers a token that isn't a phone's as dead, so its server forgets it", async () => {
    const upstream = expo();
    const answer = await send(door(upstream.fetch), [
      push(),
      push("not-a-token"),
      push("ExponentPushToken[]"),
    ]);
    const [sent, ...dead] = JSON.parse(answer.body).data;
    expect(sent.status).toBe("ok");
    for (const ticket of dead) expect(ticket.details).toEqual({ error: "DeviceNotRegistered" });
    expect(upstream.posts[0]?.body).toEqual([push()]);
  });

  it("answers a push too big for a phone as Expo does", async () => {
    const answer = await send(door(expo().fetch), [
      push(TOKEN, { data: { sealed: "x".repeat(MOST_MESSAGE_BYTES) } }),
    ]);
    expect(JSON.parse(answer.body).data[0].details).toEqual({ error: "MessageTooBig" });
  });

  it("forgets the oldest count when a minute is full, never refusing a phone for want of room", async () => {
    const d = door(expo().fetch, () => 0, undefined, 10);
    // A minute filled with made-up phones from places of their own.
    for (let n = 0; n < 10; n += 1) {
      await send(d, [push(`ExponentPushToken[madeup${n}]`)], `198.51.100.${n}`);
    }
    const answer = await send(d, [push()]);
    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body).data[0].status).toBe("ok");
  });

  it("counts a request it can't read against the place it came from", async () => {
    const d = door(expo().fetch);
    for (let sent = 0; sent < PER_PLACE; sent += 1) await d.send("not json", "203.0.113.7");
    expect((await send(d, [push()])).status).toBe(429);
  });

  it("pushes one phone at most PER_PHONE times a minute, saying so as Expo would", async () => {
    let now = 0;
    const upstream = expo();
    const d = door(upstream.fetch, () => now);
    for (let sent = 0; sent < PER_PHONE; sent += 1) await send(d, [push()]);
    const other = "ExponentPushToken[someoneelse0000000000]";
    const answer = await send(d, [push(), push(other)]);
    expect(JSON.parse(answer.body).data).toEqual([
      expect.objectContaining({ status: "error", details: { error: "MessageRateExceeded" } }),
      { status: "ok", id: "t0" },
    ]);
    // Only the other phone's went on.
    expect(upstream.posts.at(-1)?.body).toEqual([push(other)]);
    // A minute on, the phone is pushed again.
    now = 60_000;
    expect(JSON.parse((await send(d, [push()])).body).data[0].status).toBe("ok");
  });

  it("asks Expo nothing when every phone has had its pushes", async () => {
    const upstream = expo();
    const d = door(upstream.fetch);
    for (let sent = 0; sent < PER_PHONE; sent += 1) await send(d, [push()]);
    const before = upstream.posts.length;
    const answer = await send(d, [push()]);
    expect(answer.status).toBe(200);
    expect(upstream.posts).toHaveLength(before);
  });

  it("takes at most PER_PLACE pushes a minute from one place", async () => {
    const upstream = expo();
    const d = door(upstream.fetch);
    const phones = (from: number, count: number) =>
      Array.from({ length: count }, (_, index) => push(`ExponentPushToken[phone${from + index}]`));
    for (let from = 0; from < PER_PLACE; from += MOST_MESSAGES) {
      expect((await send(d, phones(from, MOST_MESSAGES))).status).toBe(200);
    }
    const busy = await send(d, phones(PER_PLACE, 1));
    expect(busy.status).toBe(429);
    expect(JSON.parse(busy.body).error.code).toBe("busy");
    // Another place isn't held to this one's count.
    expect((await send(d, phones(PER_PLACE, 1), "198.51.100.4")).status).toBe(200);
  });

  it("tells a server the relay can't push when Expo refuses its token, never a 401", async () => {
    for (const status of [401, 403]) {
      const answer = await send(door(expo(status).fetch), [push()]);
      expect(answer.status).toBe(503);
      expect(JSON.parse(answer.body).error.code).toBe("push_unavailable");
    }
    const failed = await send(door(expo(500).fetch), [push()]);
    expect(failed.status).toBe(502);
  });

  it("says whether the pushes it was last given went, for the relay's health", async () => {
    let status = 200;
    let reachable = true;
    const fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      if (!reachable) throw new Error("connect ECONNREFUSED");
      if (status !== 200) return new Response("no", { status });
      const body = JSON.parse(String(init?.body)) as unknown[];
      return Response.json({ data: body.map(() => ({ status: "ok", id: "t" })) });
    }) as unknown as typeof globalThis.fetch;
    const d = door(fetch);
    expect(d.readiness()).toBe("ready");
    status = 403;
    await send(d, [push()]);
    expect(d.readiness()).toBe("refused");
    // A request it turns away itself is no news about Expo.
    await send(d, "not a push");
    expect(d.readiness()).toBe("refused");
    status = 200;
    await send(d, [push()]);
    expect(d.readiness()).toBe("ready");
    status = 500;
    await send(d, [push()]);
    expect(d.readiness()).toBe("failing");
    status = 200;
    reachable = false;
    await send(d, [push()]);
    expect(d.readiness()).toBe("failing");
    reachable = true;
    await send(d, [push()]);
    expect(d.readiness()).toBe("ready");
  });

  it("trusts no answer from Expo that isn't a ticket for each push", async () => {
    const fetch = (async () =>
      Response.json({ data: [{ status: "ok" }] })) as unknown as typeof globalThis.fetch;
    const answer = await send(door(fetch), [push(), push("ExponentPushToken[b]")]);
    expect(answer.status).toBe(502);
  });

  it("opens only on a relay with the token, and sends on to Expo unless told otherwise", () => {
    const push = defaultConfig().push;
    expect(pushDoorOf(push)).toBeUndefined();
    expect(pushDoorOf({ ...push, accessToken: "t" })).toEqual({
      accessToken: "t",
      upstream: EXPO_PUSH,
    });
    expect(pushDoorOf({ url: UPSTREAM, accessToken: "t" })?.upstream).toBe(UPSTREAM);
  });
});
