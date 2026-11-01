/**
 * Which line a send's words fly to, and the small store that tells one bubble it is held
 * (`sendLanding.ts`). The flight itself is the simulator's and the film's to judge.
 */

import type { Line } from "@chipschat/core";
import { act, renderHook } from "@testing-library/react-native";
import {
  heldBack,
  keysSaying,
  type Landing,
  makeLanding,
  sentKey,
  useSendFoot,
} from "./sendLanding";

function line(over: Partial<Line> = {}): Line {
  return {
    id: "ln_1",
    seq: 1,
    kind: "text",
    authorId: "per_arjun",
    authorKind: "person",
    text: "On it",
    ts: "2026-09-24T10:00:00.000Z",
    ...over,
  } as Line;
}

describe("the line a send's words fly to", () => {
  it("is the newest of yours still on its way, saying what was sent", () => {
    const lines = [
      line({ id: "pending:msg-a", key: "msg-a", pending: true }),
      line({ id: "ln_2", authorId: "har_scout", text: "Noted." }),
      line({ id: "pending:msg-b", key: "msg-b", pending: true }),
    ];
    expect(sentKey(lines, "per_arjun", "On it", new Set())).toBe("msg-b");
  });

  it("is the line the server has already answered for, when the answer came inside the frame", () => {
    // A good connection answers before the store builds: the first the room sees of the line is
    // the confirmed one, under the send's key (Arjun's phone, 25 September 2026).
    const lines = [line({ id: "ln_1", text: "Earlier" }), line({ id: "ln_9", key: "msg-b" })];
    expect(sentKey(lines, "per_arjun", "On it", new Set())).toBe("msg-b");
  });

  it("is not the same words still waiting from before the send, with no connection", () => {
    const waiting = line({ id: "pending:msg-a", key: "msg-a", pending: true });
    const before = new Set(keysSaying([waiting], "per_arjun", "On it"));
    expect(sentKey([waiting], "per_arjun", "On it", before)).toBeUndefined();
    const sent = line({ id: "pending:msg-b", key: "msg-b", pending: true });
    expect(sentKey([waiting, sent], "per_arjun", "On it", before)).toBe("msg-b");
  });

  it("is not the same words sent before, somebody else's, or other words", () => {
    const said = line({ id: "ln_1", key: "msg-a" });
    const before = new Set(keysSaying([said], "per_arjun", "On it"));
    const lines = [
      said,
      line({ id: "pending:msg-b", key: "msg-b", pending: true, authorId: "per_dana" }),
      line({ id: "pending:msg-c", key: "msg-c", pending: true, text: "Later" }),
    ];
    expect(sentKey(lines, "per_arjun", "On it", before)).toBeUndefined();
  });
});

describe("the landing", () => {
  const told = { aim: { value: undefined }, settled: { value: 0 } } as never;

  it("holds one line at a time, and says so to whoever listens", () => {
    const landing = makeLanding(told);
    const heard = jest.fn();
    const unhear = landing.subscribe(heard);
    landing.hold("msg-a");
    landing.hold("msg-a");
    expect(landing.held()).toBe("msg-a");
    expect(heard).toHaveBeenCalledTimes(1);
    landing.hold(undefined);
    expect(landing.held()).toBeUndefined();
    unhear();
    landing.hold("msg-b");
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("the room's foot while a send comes in", () => {
  const told = { aim: { value: undefined }, settled: { value: 0 } } as never;
  interface Foot {
    readonly measured: number;
    readonly flying: boolean;
    readonly landing: Landing;
  }
  const mount = (first: Foot) =>
    renderHook(({ measured, flying, landing }: Foot) => useSendFoot(measured, landing, flying), {
      initialProps: first,
    });

  it("does not drop with the composer until the line is in the room, then drops with it", async () => {
    const landing = makeLanding(told);
    const view = await mount({ measured: 140, flying: false, landing });
    expect(view.result.current).toBe(140);
    // Sent: the field of three lines closes to one, a frame before the store has the line.
    await view.rerender({ measured: 140, flying: true, landing });
    await view.rerender({ measured: 96, flying: true, landing });
    expect(view.result.current).toBe(140);
    // The line is in, and the room moves once.
    await act(() => landing.hold("msg-a"));
    expect(view.result.current).toBe(96);
  });

  it("grows with the composer at once, and follows it again once the words are down", async () => {
    const landing = makeLanding(told);
    const view = await mount({ measured: 96, flying: true, landing });
    await view.rerender({ measured: 130, flying: true, landing });
    expect(view.result.current).toBe(130);
    await view.rerender({ measured: 80, flying: false, landing });
    expect(view.result.current).toBe(80);
  });
});

describe("the tiles' landing", () => {
  const told = { aim: { value: undefined }, settled: { value: 0 } } as never;
  const watches = [
    { aim: { value: undefined }, settled: { value: 0 } },
    { aim: { value: undefined }, settled: { value: 0 } },
  ] as never[];

  it("holds the pictures flying to the line, each with a watch of its own, in their order", () => {
    const landing = makeLanding(told, watches);
    const heard = jest.fn();
    landing.subscribe(heard);
    landing.hold("msg-a", ["att_1", "att_2"]);
    expect(landing.held()).toBe("msg-a");
    expect(landing.pictures()).toEqual(["att_1", "att_2"]);
    expect(landing.tolds[1]).toBe(watches[1]);
    // The same line held again with the same pictures is nothing new to anyone.
    landing.hold("msg-a", ["att_1", "att_2"]);
    expect(heard).toHaveBeenCalledTimes(1);
    // Let go, the pictures go with it: nothing flies to a line no longer held.
    landing.hold(undefined);
    expect(landing.pictures()).toEqual([]);
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("holds a line with no pictures as before", () => {
    const landing = makeLanding(told);
    landing.hold("msg-a");
    expect(landing.pictures()).toEqual([]);
    expect(landing.tolds).toEqual([]);
  });
});

describe("what the room draws while a send is in the air", () => {
  const drawn = (line: Pick<Line, "id" | "key" | "authorId">) => ({ line });

  it("keeps what it drew before and the sender's own lines, and holds anyone else's back", () => {
    const known = new Set(["ln_1", "msg-old"]);
    const rows = [
      drawn({ id: "ln_1", authorId: "har_scout" }),
      drawn({ id: "ln_2", key: "msg-old", authorId: "per_arjun" }),
      // The line the words are for: yours, under the send's key, not drawn before.
      drawn({ id: "pending:msg-k1", key: "msg-k1", authorId: "per_arjun" }),
      // A reply landing while they fly, and a line of someone else's: after the words.
      drawn({ id: "ln_3", authorId: "har_scout" }),
      drawn({ id: "ln_4", authorId: "per_dana" }),
    ];
    expect(heldBack(rows, known, "per_arjun").map((each) => each.line.id)).toEqual([
      "ln_1",
      "ln_2",
      "pending:msg-k1",
    ]);
  });

  it("finds a line the room drew by the key it was drawn under", () => {
    // A line of someone else's the room has drawn goes by its id; the server's confirmation of
    // one of yours keeps the send's key, which is what the room drew it by.
    const known = new Set(["ln_1", "msg-k0"]);
    const rows = [
      drawn({ id: "ln_1", authorId: "har_scout" }),
      drawn({ id: "ln_7", key: "msg-k0", authorId: "per_dana" }),
      drawn({ id: "ln_8", key: "msg-k9", authorId: "per_dana" }),
    ];
    expect(heldBack(rows, known, "per_arjun").map((each) => each.line.id)).toEqual([
      "ln_1",
      "ln_7",
    ]);
  });
});
