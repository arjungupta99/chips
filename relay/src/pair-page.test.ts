/**
 * The relay's pairing page (ADR 0210): it reads the payload out of its fragment into Chips for
 * Mac's link and the server's own page, from a link the server made, and drops what a made-up link
 * puts in its place; it knows when a code has run out; and it runs only the script and style it
 * was served with, as the invite page does.
 */

import { createHash } from "node:crypto";
import {
  appPairingUrl,
  pairingFromLink,
  pairingFromUrl,
  pairingUrl,
  pairRelayUrl,
} from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { relayPage } from "./join-page.js";
import { PAIR_SOURCE } from "./pair-page.js";

type Found = {
  readonly code: string;
  readonly app: string;
  readonly browser: string;
  readonly until: number | null;
} | null;
/** The page's own functions, from the source the browser runs. */
const page = new Function(`${PAIR_SOURCE}\nreturn { pairing, lifeOf };`)() as {
  pairing: (hash: string) => Found;
  lifeOf: (until: number | null, now: number) => string;
};

const KEY = "k".repeat(43);
const LAN = "https://adas-mac-mini.tail2f9c1e.ts.net";
const RELAY = "wss://relay.chipschat.ai";
const hashOf = (link: string) => link.slice(link.indexOf("#"));

describe("the relay's pairing page", () => {
  it("turns a link the server made into Chips for Mac's link and the server's own page", () => {
    const link = pairRelayUrl(RELAY, "BKW-374", { lan: LAN, key: KEY, until: 1_792_512_345 });
    const found = page.pairing(hashOf(link));
    expect(found?.code).toBe("BKW-374");
    // Exactly the links the apps and the server's page already take.
    expect(found?.app).toBe(appPairingUrl(LAN, "BKW-374", { relay: RELAY, key: KEY }));
    expect(found?.browser).toBe(pairingUrl(LAN, "BKW-374", { relay: RELAY, key: KEY }));
    expect(pairingFromUrl(new URL(found?.app ?? ""))).toEqual(pairingFromLink(link));
    expect(found?.until).toBe(1_792_512_345_000);
  });

  it("finds no code where there is none, or where it names no server", () => {
    expect(page.pairing("")).toBeNull();
    expect(page.pairing("#lan=https%3A%2F%2Fa.example")).toBeNull();
    expect(page.pairing("#pair=BKW-374")).toBeNull();
    expect(page.pairing("#pair=nope&lan=https%3A%2F%2Fa.example")).toBeNull();
    expect(page.pairing("#pair=BKW-3741&lan=https%3A%2F%2Fa.example")).toBeNull();
    // 0, 1, O and I are not in the alphabet a code is made from.
    expect(page.pairing("#pair=B0W-374&lan=https%3A%2F%2Fa.example")).toBeNull();
  });

  it("reads a code typed in lower case as the code it is", () => {
    expect(page.pairing("#pair=bkw-374&lan=https%3A%2F%2Fa.example")?.code).toBe("BKW-374");
  });

  it("drops what a made-up link puts in place of a server, a relay, a key or a time", () => {
    expect(page.pairing("#pair=BKW-374&lan=javascript%3Aalert(1)")).toBeNull();
    expect(page.pairing("#pair=BKW-374&lan=chips%3A%2F%2Fpair")).toBeNull();
    // A server by its origin alone: a path, a query or a fragment of its own goes.
    expect(page.pairing("#pair=BKW-374&lan=https%3A%2F%2Fa.example%2Fx%3Fy%23z")?.browser).toBe(
      "https://a.example/#pair=BKW-374&v=1",
    );
    const relayOverHttp = page.pairing(
      `#pair=BKW-374&lan=https%3A%2F%2Fa.example&relay=https%3A%2F%2Fr.example&key=${KEY}`,
    );
    expect(pairingFromUrl(new URL(relayOverHttp?.app ?? ""))).toMatchObject({ key: KEY });
    expect(pairingFromUrl(new URL(relayOverHttp?.app ?? ""))?.relay).toBeUndefined();
    const shortKey = page.pairing(
      "#pair=BKW-374&lan=https%3A%2F%2Fa.example&relay=wss%3A%2F%2Fr&key=k",
    );
    expect(shortKey?.app).toBe("chips://pair?pair=BKW-374&v=1&lan=https%3A%2F%2Fa.example");
    expect(page.pairing("#pair=BKW-374&lan=https%3A%2F%2Fa.example&until=soon")?.until).toBeNull();
  });

  it("says how long the code has, in whole minutes, and good once when the link does not say", () => {
    const now = 1_000_000_000_000;
    expect(page.lifeOf(now + 14 * 60_000 - 5000, now)).toBe("14 more minutes, once");
    expect(page.lifeOf(now + 20_000, now)).toBe("1 more minute, once");
    expect(page.lifeOf(null, now)).toBe("good once");
  });

  it("runs only the script and the style it was served with, and is never framed", () => {
    const served = relayPage("GET", "/pair");
    expect(served?.status).toBe(200);
    const policy = served?.headers["content-security-policy"] ?? "";
    const sha = (text: string) => createHash("sha256").update(text).digest("base64");
    const script = /<script>([\s\S]*?)<\/script>/.exec(served?.body ?? "")?.[1] ?? "";
    const style = /<style>([\s\S]*?)<\/style>/.exec(served?.body ?? "")?.[1] ?? "";
    expect(policy).toContain(`script-src 'sha256-${sha(script)}'`);
    expect(policy).toContain(`style-src 'sha256-${sha(style)}'`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(served?.body).not.toMatch(/<(img|link|iframe)\b|src=|https?:\/\/(?!www\.w3)/);
    expect(served?.headers["referrer-policy"]).toBe("no-referrer");
    expect(served?.body).toContain("<title>Pair a computer with Chips</title>");
  });

  it("is served only for GET and HEAD at its own path", () => {
    expect(relayPage("HEAD", "/pair")).toBeDefined();
    expect(relayPage("POST", "/pair")).toBeUndefined();
    expect(relayPage("GET", "/pair/x")).toBeUndefined();
  });
});
