/**
 * The signed list of bridge releases that may arrive on their own: read once a day, taken only
 * when its signature is the release key's, timed by the site's clock.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger, manualClock } from "@chipschat/platform";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signedByHand, signerByHand } from "../../testing/sshsig.js";
import {
  BRIDGES_KEPT_FOR_MS,
  BRIDGES_MAX_BYTES,
  bridgeList,
  readBridgeList,
  signedBefore,
} from "./bridge-list.js";
import { UPDATES_FIRST_MS, UPDATES_KEPT_MS, UPDATES_RETRY_MS } from "./releases.js";

const logger = createLogger({ level: "silent" });
const hasKeygen = existsSync("/usr/bin/ssh-keygen");
const SRI = `sha512-${"A".repeat(86)}==`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "chips-bridge-list-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const body = {
  format: 1,
  packages: {
    "@chipschat/acp": {
      releases: [
        {
          version: "1.0.24",
          integrity: SRI,
          published: "2026-11-11T20:00:00.000Z",
          computer: "1.2.4",
        },
        { version: "1.0.25", integrity: SRI, published: "2026-11-13T20:00:00.000Z", urgent: true },
        { version: "not one", integrity: SRI, published: "2026-11-13T20:00:00.000Z" },
        { version: "1.0.26", integrity: "sha1-x", published: "2026-11-13T20:00:00.000Z" },
      ],
      withdrawn: ["1.0.22"],
    },
  },
};

describe("a bridge list", () => {
  it("keeps each release it can read and leaves out the rest", () => {
    const list = readBridgeList(body, "2026-11-20T10:00:00.000Z", 5);
    expect(list.packages["@chipschat/acp"]).toEqual({
      releases: [
        {
          version: "1.0.24",
          integrity: SRI,
          published: "2026-11-11T20:00:00.000Z",
          computer: "1.2.4",
        },
        { version: "1.0.25", integrity: SRI, published: "2026-11-13T20:00:00.000Z", urgent: true },
      ],
      withdrawn: ["1.0.22"],
    });
    expect(() => readBridgeList({ format: 2, packages: {} }, "", 0)).toThrow("not a bridge list");
  });

  it.skipIf(!hasKeygen)(
    "is taken only with the release key's signature, at the site's time",
    async () => {
      execFileSync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", join(dir, "key")]);
      const key = readFileSync(join(dir, "key.pub"), "utf8").split(" ")[1] ?? "";
      const text = JSON.stringify(body);
      writeFileSync(join(dir, "bridges.json"), text);
      execFileSync("ssh-keygen", [
        "-Y",
        "sign",
        "-q",
        "-f",
        join(dir, "key"),
        "-n",
        "chips-bridges",
        join(dir, "bridges.json"),
      ]);
      let signature = readFileSync(join(dir, "bridges.json.sig"), "utf8");
      const asked: string[] = [];
      const fetching = (async (input: string | URL) => {
        asked.push(String(input));
        return String(input).endsWith(".sig")
          ? new Response(signature)
          : new Response(text, { headers: { date: "Fri, 20 Nov 2026 10:00:00 GMT" } });
      }) as typeof fetch;
      const clock = manualClock(Date.parse("2026-11-25T00:00:00.000Z"));
      const reader = bridgeList({
        source: "https://site.test/bridges.json",
        clock,
        logger,
        fetch: fetching,
        key,
      });
      reader.tick();
      expect(asked).toEqual([]);
      clock.advance(UPDATES_FIRST_MS);
      reader.tick();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(asked).toEqual([
        "https://site.test/bridges.json",
        "https://site.test/bridges.json.sig",
      ]);
      expect(reader.read()?.at).toBe("2026-11-20T10:00:00.000Z");
      expect(reader.read()?.heardAt).toBe(clock.nowMs());

      // A list whose signature isn't the key's is no list.
      signature = signature.replace(/[A-Za-z](?=[^\n]*\n-----END)/, (c) => (c === "A" ? "B" : "A"));
      const other = bridgeList({
        source: "https://site.test/bridges.json",
        clock,
        logger,
        fetch: fetching,
        key,
      });
      clock.advance(UPDATES_FIRST_MS);
      other.tick();
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(other.read()).toBeUndefined();
    },
  );

  it("is read from nowhere when it is told nowhere, or off", () => {
    const clock = manualClock(0);
    const asked: string[] = [];
    const fetching = (async (input: string | URL) => {
      asked.push(String(input));
      return new Response("");
    }) as typeof fetch;
    for (const source of [undefined, "off"]) {
      const reader = bridgeList({ source, clock, logger, fetch: fetching });
      clock.advance(UPDATES_FIRST_MS * 2);
      reader.tick();
      expect(reader.read()).toBeUndefined();
    }
    expect(asked).toEqual([]);
  });
});

describe("a bridge list, entry by entry", () => {
  it("leaves out what isn't a package, a release or a version, and keeps the rest", () => {
    const list = readBridgeList(
      {
        format: 1,
        packages: {
          "@chipschat/acp": {
            releases: [
              "1.0.24",
              null,
              { version: "1.0.24", integrity: SRI, published: "the other day" },
              { version: "1.0.24", integrity: SRI },
              { version: "1.0.25", integrity: SRI, published: "2026-11-13T20:00:00.000Z" },
              // A floor that isn't a version and an urgency that isn't `true` are left off.
              {
                version: "1.0.26",
                integrity: SRI,
                published: "2026-11-14T20:00:00.000Z",
                computer: "newest",
                urgent: "yes",
              },
              // What it needs of its harness, by card: a floor that isn't a release number, a
              // name that isn't a card's, and a value that isn't words are each left off.
              {
                version: "1.0.27",
                integrity: SRI,
                published: "2026-11-15T20:00:00.000Z",
                needs: { "claude-code": "2.1.0", codex: ">=0.9", "Not A Card": "1.0.0", hermes: 3 },
              },
              {
                version: "1.0.28",
                integrity: SRI,
                published: "2026-11-16T20:00:00.000Z",
                needs: "hermes 0.9",
              },
            ],
            withdrawn: ["1.0.22", 7, null],
          },
          "@chipschat/hermes": { releases: "none", withdrawn: "none" },
          "@chipschat/opencode": "soon",
        },
      },
      "2026-11-20T10:00:00.000Z",
      5,
    );
    expect(list.packages).toEqual({
      "@chipschat/acp": {
        releases: [
          { version: "1.0.25", integrity: SRI, published: "2026-11-13T20:00:00.000Z" },
          { version: "1.0.26", integrity: SRI, published: "2026-11-14T20:00:00.000Z" },
          {
            version: "1.0.27",
            integrity: SRI,
            published: "2026-11-15T20:00:00.000Z",
            needs: { "claude-code": "2.1.0" },
          },
          { version: "1.0.28", integrity: SRI, published: "2026-11-16T20:00:00.000Z" },
        ],
        withdrawn: ["1.0.22"],
      },
      "@chipschat/hermes": { releases: [], withdrawn: [] },
    });
  });

  it("is no list at all without a format it knows and its packages", () => {
    for (const not of [null, [], "list", { format: 1 }, { format: 1, packages: [] }]) {
      expect(() => readBridgeList(not, "", 0)).toThrow("not a bridge list");
    }
  });
});

describe("reading the bridge list from the site", () => {
  const SOURCE = "https://site.test/bridges.json";
  const text = JSON.stringify(body);
  const signed = signedByHand(text);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

  /** A site that answers as the test says, and a reader of it a minute after its server started. */
  function site() {
    const clock = manualClock(Date.parse("2026-11-25T00:00:00.000Z"));
    const asked: string[] = [];
    const answers = {
      list: () => new Response(text, { headers: { date: "Fri, 20 Nov 2026 10:00:00 GMT" } }),
      signature: () => new Response(signed.armoured),
    };
    const reader = bridgeList({
      source: SOURCE,
      clock,
      logger,
      key: signed.key,
      fetch: (async (input: string | URL) => {
        asked.push(String(input));
        return String(input).endsWith(".sig") ? answers.signature() : answers.list();
      }) as typeof fetch,
    });
    clock.advance(UPDATES_FIRST_MS);
    const tick = async (ms = 0) => {
      clock.advance(ms);
      reader.tick();
      await settle();
    };
    return { clock, asked, answers, reader, tick, reads: () => asked.length / 2 };
  }

  it("reads it once a day, and not twice at once", async () => {
    const it = site();
    it.reader.tick();
    it.reader.tick();
    await settle();
    expect(it.reads()).toBe(1);
    expect(it.reader.read()?.packages["@chipschat/acp"]?.releases).toHaveLength(2);
    await it.tick(UPDATES_KEPT_MS - 1);
    expect(it.reads()).toBe(1);
    await it.tick(1);
    expect(it.reads()).toBe(2);
  });

  it("keeps the last good list while the site is down, trying again after ten minutes, then twenty", async () => {
    const it = site();
    await it.tick();
    const good = it.reader.read();
    expect(good).toBeDefined();
    it.answers.list = () => new Response("down", { status: 503 });
    await it.tick(UPDATES_KEPT_MS);
    expect(it.reads()).toBe(2);
    expect(it.reader.read()).toBe(good);
    await it.tick(UPDATES_RETRY_MS - 1);
    expect(it.reads()).toBe(2);
    await it.tick(1);
    expect(it.reads()).toBe(3);
    await it.tick(2 * UPDATES_RETRY_MS - 1);
    expect(it.reads()).toBe(3);
    await it.tick(1);
    expect(it.reads()).toBe(4);
    expect(it.reader.read()).toBe(good);
    // Back: read, and a day until the next.
    it.answers.list = () => new Response(text);
    await it.tick(4 * UPDATES_RETRY_MS);
    expect(it.reads()).toBe(5);
    expect(it.reader.read()).not.toBe(good);
    await it.tick(UPDATES_RETRY_MS);
    expect(it.reads()).toBe(5);
  });

  it("takes the time from this machine when the site says none", async () => {
    const it = site();
    it.answers.list = () => new Response(text);
    await it.tick();
    expect(it.reader.read()?.at).toBe(new Date(it.clock.nowMs()).toISOString());
  });

  it("takes nothing from a list with no signature beside it", async () => {
    const it = site();
    it.answers.signature = () => new Response("not found", { status: 404 });
    await it.tick();
    expect(it.reader.read()).toBeUndefined();
  });

  it("takes nothing from a list signed for something else, or by someone else", async () => {
    const forReleases = site();
    forReleases.answers.signature = () =>
      new Response(signedByHand(text, { namespace: "chips-release" }).armoured);
    await forReleases.tick();
    expect(forReleases.reader.read()).toBeUndefined();

    const bySomeoneElse = site();
    bySomeoneElse.answers.signature = () => new Response(signedByHand(text).armoured);
    await bySomeoneElse.tick();
    expect(bySomeoneElse.reader.read()).toBeUndefined();

    // One byte of the list changed after it was signed.
    const changed = site();
    changed.answers.list = () => new Response(text.replace("1.0.24", "1.0.99"));
    await changed.tick();
    expect(changed.reader.read()).toBeUndefined();
  });

  it("takes nothing from a list, or a signature, bigger than a list is", async () => {
    const big = `${text}${" ".repeat(BRIDGES_MAX_BYTES)}`;
    const bigSigned = signedByHand(big);
    const clock = manualClock(0);
    const reader = bridgeList({
      source: SOURCE,
      clock,
      logger,
      key: bigSigned.key,
      fetch: (async (input: string | URL) =>
        new Response(String(input).endsWith(".sig") ? bigSigned.armoured : big)) as typeof fetch,
    });
    clock.advance(UPDATES_FIRST_MS);
    reader.tick();
    await settle();
    expect(reader.read()).toBeUndefined();

    const it = site();
    it.answers.signature = () => new Response("A".repeat(BRIDGES_MAX_BYTES + 1));
    await it.tick();
    expect(it.reader.read()).toBeUndefined();
  });

  it("takes nothing from a signed file that isn't a list", async () => {
    for (const wrong of ["not json", '{"format":2,"packages":{}}']) {
      const mine = signedByHand(wrong);
      const clock = manualClock(0);
      const reader = bridgeList({
        source: SOURCE,
        clock,
        logger,
        key: mine.key,
        fetch: (async (input: string | URL) =>
          new Response(String(input).endsWith(".sig") ? mine.armoured : wrong)) as typeof fetch,
      });
      clock.advance(UPDATES_FIRST_MS);
      reader.tick();
      await settle();
      expect(reader.read()).toBeUndefined();
    }
  });

  it("checks with Chips's release key when no other is given", async () => {
    const clock = manualClock(0);
    const reader = bridgeList({
      source: SOURCE,
      clock,
      logger,
      fetch: (async (input: string | URL) =>
        new Response(String(input).endsWith(".sig") ? signed.armoured : text)) as typeof fetch,
    });
    clock.advance(UPDATES_FIRST_MS);
    reader.tick();
    await settle();
    // Signed well, but by a throwaway key: not the release key's.
    expect(reader.read()).toBeUndefined();
  });
});

describe("an older list served again", () => {
  const SOURCE = "https://site.test/bridges.json";
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  const listSigned = (signed: string | undefined, withdrawn: string[]) =>
    JSON.stringify({
      format: 1,
      ...(signed === undefined ? {} : { signed }),
      packages: { "@chipschat/acp": { releases: [], withdrawn } },
    });

  /** A site whose list the test swaps, each signed with the one key the reader checks with. */
  function site(first: string) {
    const clock = manualClock(Date.parse("2026-11-25T00:00:00.000Z"));
    const sign = signerByHand();
    let served = { text: first, ...sign(first) };
    const reader = bridgeList({
      source: SOURCE,
      clock,
      logger,
      key: served.key,
      fetch: (async (input: string | URL) =>
        new Response(
          String(input).endsWith(".sig") ? served.armoured : served.text,
        )) as typeof fetch,
    });
    clock.advance(UPDATES_FIRST_MS);
    const tick = async (ms = 0) => {
      clock.advance(ms);
      reader.tick();
      await settle();
    };
    return {
      reader,
      tick,
      clock,
      sign: (text: string) => {
        served = { text, ...sign(text) };
      },
    };
  }

  it("is refused once a newer one has been read, so a release taken back stays back", async () => {
    const it = site(listSigned("2026-11-20T10:00:00.000Z", ["1.0.31"]));
    await it.tick();
    expect(it.reader.read()?.signed).toBe("2026-11-20T10:00:00.000Z");
    // Yesterday's list again, from before 1.0.31 was taken back.
    it.sign(listSigned("2026-11-19T10:00:00.000Z", []));
    await it.tick(UPDATES_KEPT_MS);
    expect(it.reader.read()?.packages["@chipschat/acp"]?.withdrawn).toEqual(["1.0.31"]);
    // So is one that doesn't say when it was signed.
    it.sign(listSigned(undefined, []));
    await it.tick(UPDATES_RETRY_MS);
    expect(it.reader.read()?.packages["@chipschat/acp"]?.withdrawn).toEqual(["1.0.31"]);
    // A newer one is taken.
    it.sign(listSigned("2026-11-21T10:00:00.000Z", ["1.0.31", "1.0.32"]));
    await it.tick(2 * UPDATES_RETRY_MS);
    expect(it.reader.read()?.signed).toBe("2026-11-21T10:00:00.000Z");
  });

  it("is told apart by when each was signed, and a list that never said is older than one that says", () => {
    const at = "2026-11-25T00:00:00.000Z";
    const list = (signed?: string) =>
      readBridgeList({ format: 1, packages: {}, ...(signed ? { signed } : {}) }, at, 0);
    expect(signedBefore(list("2026-11-19T10:00:00.000Z"), list("2026-11-20T10:00:00.000Z"))).toBe(
      true,
    );
    expect(signedBefore(list("2026-11-20T10:00:00.000Z"), list("2026-11-20T10:00:00.000Z"))).toBe(
      false,
    );
    expect(signedBefore(list(), list("2026-11-20T10:00:00.000Z"))).toBe(true);
    expect(signedBefore(list("2026-11-20T10:00:00.000Z"), list())).toBe(false);
    expect(signedBefore(list(), undefined)).toBe(false);
    // A date that isn't one is no date.
    expect(
      readBridgeList({ format: 1, packages: {}, signed: "today" }, at, 0).signed,
    ).toBeUndefined();
  });

  it("is acted on no more once it hasn't been read again for a week", async () => {
    const it = site(listSigned("2026-11-20T10:00:00.000Z", []));
    await it.tick();
    expect(it.reader.read()).toBeDefined();
    // The site can't be reached from here on.
    it.sign("down");
    it.clock.advance(BRIDGES_KEPT_FOR_MS);
    expect(it.reader.read()).toBeDefined();
    it.clock.advance(1);
    expect(it.reader.read()).toBeUndefined();
  });
});
