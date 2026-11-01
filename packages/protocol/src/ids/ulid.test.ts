import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  createIdGenerator,
  eventIdOfMessage,
  ID_PREFIXES,
  InvalidIdError,
  isId,
  messageIdOf,
  newId,
  parseId,
  timestampOf,
} from "./ulid.js";

const KINDS = Object.keys(ID_PREFIXES) as (keyof typeof ID_PREFIXES)[];
const MAX_TIME_MS = 281_474_976_710_655;

/** A generator whose randomness is fixed, so a test can name the id it expects. */
function generatorAt(timeMs: number, fill = 0) {
  let now = timeMs;
  return {
    generator: createIdGenerator({
      now: () => now,
      randomFill: (into) => into.fill(fill),
    }),
    setTime: (ms: number) => {
      now = ms;
    },
  };
}

describe("newId", () => {
  it("prefixes each kind with the letters from decision 11", () => {
    expect(newId("run")).toMatch(/^run_[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(newId("workspace")).toMatch(/^ws_/);
    expect(newId("space")).toMatch(/^spc_/);
    expect(newId("person")).toMatch(/^usr_/);
  });

  it("produces a distinct id every call", () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newId("message")));
    expect(ids.size).toBe(5000);
  });
});

describe("id generation", () => {
  it("encodes the minting instant", () => {
    const { generator } = generatorAt(1_756_800_000_000);
    expect(timestampOf(generator.next("run"))).toBe(1_756_800_000_000);
  });

  it("keeps ids increasing inside a single millisecond", () => {
    const { generator } = generatorAt(1_756_800_000_000);
    const ids = Array.from({ length: 100 }, () => generator.next("step"));
    const sorted = [...ids].sort();
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(100);
  });

  it("keeps ids increasing when the clock moves backwards", () => {
    const { generator, setTime } = generatorAt(1_756_800_000_000);
    const first = generator.next("run");
    setTime(1_756_700_000_000);
    const second = generator.next("run");
    expect(second > first).toBe(true);
  });

  it("borrows the next millisecond when the random component is exhausted", () => {
    const { generator } = generatorAt(1000, 0xff);
    const first = generator.next("run");
    const second = generator.next("run");
    expect(timestampOf(first)).toBe(1000);
    expect(timestampOf(second)).toBe(1001);
    expect(second > first).toBe(true);
  });

  it("borrows a millisecond on a backwards clock with exhausted randomness", () => {
    const { generator, setTime } = generatorAt(5000, 0xff);
    const first = generator.next("run");
    setTime(1000);
    const second = generator.next("run");
    expect(timestampOf(second)).toBe(5001);
    expect(second > first).toBe(true);
  });

  it("rejects a timestamp a ULID cannot hold", () => {
    const { generator } = generatorAt(MAX_TIME_MS + 1);
    expect(() => generator.next("run")).toThrow(RangeError);
  });

  it("rejects an unknown kind", () => {
    const { generator } = generatorAt(1000);
    // The cast is the point of the test: it proves the runtime guard, not the type.
    expect(() => generator.next("nonsense" as "run")).toThrow(InvalidIdError);
  });
});

describe("parseId", () => {
  it("splits an id into its kind and ULID", () => {
    const id = newId("approval");
    expect(parseId(id)).toEqual({ kind: "approval", ulid: id.slice("apr_".length) });
  });

  it.each([
    ["no underscore", "run01JBXR4Q1T0000000000000A"],
    ["a leading underscore", "_01JBXR4Q1T0000000000000A"],
    ["an unknown prefix", "nope_01JBXR4Q1T0000000000000A"],
    ["a short ULID", "run_01JBXR4Q1T"],
    ["a long ULID", "run_01JBXR4Q1T0000000000000AB"],
    ["a character outside Crockford base32", "run_01JBXR4Q1T0000000000000U"],
    ["a timestamp beyond 48 bits", "run_80000000000000000000000000"],
  ])("rejects %s", (_reason, value) => {
    expect(() => parseId(value)).toThrow(InvalidIdError);
    expect(isId("run", value)).toBe(false);
  });
});

describe("isId", () => {
  it("accepts an id of the kind asked for", () => {
    expect(isId("run", newId("run"))).toBe(true);
  });

  it("rejects an id of another kind", () => {
    expect(isId("run", newId("message"))).toBe(false);
  });

  it("rejects anything that is not a string", () => {
    for (const value of [undefined, null, 42, {}, []]) {
      expect(isId("run", value)).toBe(false);
    }
  });
});

describe("ids, as properties", () => {
  it("round-trips the minting instant for every kind at any instant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_TIME_MS }),
        fc.constantFrom(...KINDS),
        fc.uint8Array({ minLength: 10, maxLength: 10 }),
        (timeMs, kind, randomness) => {
          const generator = createIdGenerator({
            now: () => timeMs,
            randomFill: (into) => into.set(randomness),
          });
          const id = generator.next(kind);
          expect(parseId(id).kind).toBe(kind);
          expect(timestampOf(id)).toBe(timeMs);
          expect(isId(kind, id)).toBe(true);
        },
      ),
    );
  });

  it("sorts lexicographically in the order the ids were minted", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 4000 }), { minLength: 2, maxLength: 40 }),
        (gaps) => {
          let now = 1_756_800_000_000;
          const generator = createIdGenerator({
            now: () => now,
            randomFill: (into) => globalThis.crypto.getRandomValues(into),
          });
          const ids: string[] = [];
          for (const gap of gaps) {
            now += gap;
            ids.push(generator.next("step"));
          }
          expect(ids).toEqual([...ids].sort());
        },
      ),
    );
  });

  it("never mints the same id twice, whatever the clock does", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -5000, max: 5000 }), { minLength: 2, maxLength: 60 }),
        (steps) => {
          let now = 1_756_800_000_000;
          const generator = createIdGenerator({ now: () => now });
          const ids = steps.map((step) => {
            now = Math.max(0, now + step);
            return generator.next("message");
          });
          expect(new Set(ids).size).toBe(ids.length);
        },
      ),
    );
  });
});

describe("a message's id on the wire", () => {
  it("is its event's ULID with the message prefix, both ways", () => {
    expect(messageIdOf("evt_01K4ZQPX000000000000000074")).toBe("msg_01K4ZQPX000000000000000074");
    expect(eventIdOfMessage("msg_01K4ZQPX000000000000000074")).toBe(
      "evt_01K4ZQPX000000000000000074",
    );
    expect(eventIdOfMessage(messageIdOf("evt_01K4ZQPX000000000000000074"))).toBe(
      "evt_01K4ZQPX000000000000000074",
    );
  });

  it("refuses something that is not an id", () => {
    expect(() => messageIdOf("nope")).toThrow();
  });
});
