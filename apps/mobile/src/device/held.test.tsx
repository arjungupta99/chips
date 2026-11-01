/**
 * What the phone holds, read once it can be (ADR 0228): a read that met a shut Keychain is not an
 * answer, so it is made again once the app is in front, and there a few times more before the app
 * goes on with what it could read. The front and the reads are stand-ins: what is proved is when
 * the answer comes, and what it is.
 */

import type { Device, HeldDevices } from "@chipschat/core";
import { AGAIN_MS, type Front, readAgain, readWhenOpen, TRIES_IN_FRONT } from "./held";

jest.mock("./storage", () => ({ deviceStorage: {} }));

const HOME = { deviceId: "dev_home" } as unknown as Device;
const WHOLE: HeldDevices = { devices: [HOME], unreadable: 0 };
const SHUT: HeldDevices = { devices: [], unreadable: 1 };

/** Reads that answer each of `answers` in turn, the last one ever after; a thrown one throws. */
function reads(...answers: (HeldDevices | Error)[]) {
  let made = 0;
  const read = async () => {
    const answer = answers[Math.min(made, answers.length - 1)] as HeldDevices | Error;
    made += 1;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { read, made: () => made };
}

/** A front that is where `inFront` says, and comes there when `come` is called. */
function aFront(inFront: boolean) {
  let now = inFront;
  const waiting = new Set<() => void>();
  const front: Front = {
    now: () => now,
    when: (then) => {
      waiting.add(then);
      return () => waiting.delete(then);
    },
  };
  const come = () => {
    now = true;
    for (const then of [...waiting]) then();
  };
  return { front, come, listening: () => waiting.size };
}

/** Whether a promise has settled yet, without waiting for it. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => {
    done = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

afterEach(() => {
  jest.useRealTimers();
});

describe("a read that opened every key", () => {
  it("is the answer, at once, wherever the app is", async () => {
    const { read, made } = reads(WHOLE);
    const { front } = aFront(false);
    expect(await readWhenOpen(undefined, read, front)).toEqual([HOME]);
    expect(made()).toBe(1);
  });
});

describe("a read that met a shut Keychain", () => {
  it("behind, waits for the front and reads again there: never an empty answer", async () => {
    const { read, made } = reads(SHUT, WHOLE);
    const { front, come, listening } = aFront(false);
    const answer = readWhenOpen(undefined, read, front);
    expect(await settled(answer)).toBe(false);
    expect(made()).toBe(1);
    expect(listening()).toBe(1);

    come();
    expect(await answer).toEqual([HOME]);
    expect(made()).toBe(2);
    expect(listening()).toBe(0);
  });

  it("counts a storage that will not open at all as shut: its files, before the first unlock", async () => {
    const { read } = reads(new Error("protected data unavailable"), WHOLE);
    const { front, come } = aFront(false);
    const answer = readWhenOpen(undefined, read, front);
    expect(await settled(answer)).toBe(false);
    come();
    expect(await answer).toEqual([HOME]);
  });

  it("in front, reads again a moment later, and the next whole read is the answer", async () => {
    jest.useFakeTimers();
    const { read, made } = reads(SHUT, SHUT, WHOLE);
    const { front } = aFront(true);
    const answer = readWhenOpen(undefined, read, front);
    await jest.advanceTimersByTimeAsync(AGAIN_MS * 2);
    expect(await answer).toEqual([HOME]);
    expect(made()).toBe(3);
  });

  it("in front, goes on with what it could read after the last try", async () => {
    jest.useFakeTimers();
    const part: HeldDevices = { devices: [HOME], unreadable: 1 };
    const { read, made } = reads(part);
    const { front } = aFront(true);
    const answer = readWhenOpen(undefined, read, front);
    await jest.advanceTimersByTimeAsync(AGAIN_MS * TRIES_IN_FRONT);
    expect(await answer).toEqual([HOME]);
    expect(made()).toBe(TRIES_IN_FRONT);
  });

  it("stops listening and reading once it is called off", async () => {
    const { read, made } = reads(SHUT, WHOLE);
    const { front, come, listening } = aFront(false);
    const off = new AbortController();
    const answer = readWhenOpen(off.signal, read, front);
    await settled(answer);
    off.abort();
    expect(listening()).toBe(0);
    come();
    expect(await settled(answer)).toBe(false);
    expect(made()).toBe(1);
  });
});

describe("a read again after a change this phone made", () => {
  it("answers the list when it is whole, and nothing when part of it would not open", async () => {
    expect(await readAgain(reads(WHOLE).read)).toEqual([HOME]);
    expect(await readAgain(reads(SHUT).read)).toBeUndefined();
    expect(await readAgain(reads(new Error("shut")).read)).toBeUndefined();
  });
});
