/**
 * The pairing payload: the QR's address with the code in the fragment, as since Gate 2, now with
 * a version, the relay, the server's key, and a candidate list that is empty in v0 (ADR 0038).
 */

import { describe, expect, it } from "vitest";
import {
  appPairingUrl,
  PAIRING_VERSION,
  pairingCodeTyped,
  pairingFromLink,
  pairingFromUrl,
  pairingPayload,
  pairingUrl,
  pairRelayUrl,
} from "./pairing.js";

const KEY = "k".repeat(43);

describe("the pairing payload", () => {
  it("is the address with the code, the version, the relay and the key in the fragment", () => {
    const text = pairingUrl("http://192.168.1.20:4431", "ABC-234", {
      relay: "wss://relay.example",
      key: KEY,
    });
    expect(text).toBe(
      `http://192.168.1.20:4431/#pair=ABC-234&v=1&relay=wss%3A%2F%2Frelay.example&key=${KEY}`,
    );
    const url = new URL(text);
    expect(pairingFromUrl(url)).toEqual({
      v: PAIRING_VERSION,
      code: "ABC-234",
      lan: "http://192.168.1.20:4431",
      relay: "wss://relay.example",
      key: KEY,
      candidates: [],
    });
  });

  it("carries the code alone when the server has no relay, and drops a trailing slash", () => {
    expect(pairingUrl("http://127.0.0.1:4431/", "ABC-234")).toBe(
      "http://127.0.0.1:4431/#pair=ABC-234&v=1",
    );
    expect(pairingFromUrl(new URL("http://127.0.0.1:4431/#pair=ABC-234&v=1"))).toEqual({
      v: 1,
      code: "ABC-234",
      lan: "http://127.0.0.1:4431",
      candidates: [],
    });
  });

  it("names the network address in the fragment when the page is not the server's", () => {
    const text = pairingUrl("http://app.local", "ABC-234", { lan: "http://192.168.1.20:4431" });
    expect(text).toBe("http://app.local/#pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431");
    expect(pairingFromUrl(new URL(text))?.lan).toBe("http://192.168.1.20:4431");
    // The same address as the base is not repeated.
    expect(
      pairingUrl("http://192.168.1.20:4431", "ABC-234", { lan: "http://192.168.1.20:4431" }),
    ).toBe("http://192.168.1.20:4431/#pair=ABC-234&v=1");
  });

  it("reads a QR from before M4.1 as version 0 with the code, and a query as the fragment", () => {
    expect(pairingFromUrl(new URL("http://mini.local:4431/#pair=abc-234"))).toEqual({
      v: 0,
      code: "ABC-234",
      lan: "http://mini.local:4431",
      candidates: [],
    });
    expect(pairingFromUrl({ search: "?pair=ABC-234", hash: "" })).toEqual({
      v: 0,
      code: "ABC-234",
      candidates: [],
    });
    expect(pairingFromUrl({ search: "", hash: "" })).toBeUndefined();
    expect(pairingFromUrl({ search: "", hash: "#invite=chips_inv_x" })).toBeUndefined();
  });

  it("keeps the code when the rest of the fragment is one this version cannot read", () => {
    // A relay address that is not a WebSocket address: the code still pairs on the network.
    expect(
      pairingFromUrl(new URL("http://mini.local:4431/#pair=ABC-234&v=1&relay=ftp://x&key=bad")),
    ).toEqual({ v: 0, code: "ABC-234", candidates: [] });
  });

  it("refuses what is not a payload", () => {
    expect(pairingPayload.safeParse({ v: 1, code: "abc-234" }).success).toBe(false);
    expect(pairingPayload.safeParse({ v: 1, code: "ABC-234", key: "short" }).success).toBe(false);
    expect(pairingPayload.safeParse({ v: 1, code: "ABC-234", relay: "http://x" }).success).toBe(
      false,
    );
    expect(pairingPayload.parse({ v: 1, code: "ABC-234" }).candidates).toEqual([]);
  });
});

describe("the same payload as a link the app opens", () => {
  it("puts the server's address in the query, since a chips:// link has no origin of its own", () => {
    const text = appPairingUrl("http://100.64.0.7:4431/", "ABC-234", {
      relay: "wss://relay.example",
      key: KEY,
    });
    expect(text).toBe(
      `chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2F100.64.0.7%3A4431&relay=wss%3A%2F%2Frelay.example&key=${KEY}`,
    );
    expect(pairingFromUrl(new URL(text))).toEqual({
      v: PAIRING_VERSION,
      code: "ABC-234",
      lan: "http://100.64.0.7:4431",
      relay: "wss://relay.example",
      key: KEY,
      candidates: [],
    });
  });

  it("names the server the offer names, when the page it came from is somewhere else", () => {
    const text = appPairingUrl("http://127.0.0.1:5173", "ABC-234", {
      lan: "http://mini.local:4431",
    });
    expect(pairingFromUrl(new URL(text))?.lan).toBe("http://mini.local:4431");
  });
});

describe("a code as somebody typed it (SEC-6)", () => {
  it("is put in the form a code is compared in, whatever case and separator were typed", () => {
    for (const typed of ["KQ7-M4P", "kq7-m4p", "kq7 m4p", " kq7m4p ", "KQ7—M4P"]) {
      expect(pairingCodeTyped(typed)).toBe("KQ7-M4P");
    }
  });

  it("comes back as typed when it is not six characters of the alphabet, which no code matches", () => {
    expect(pairingCodeTyped("kq7")).toBe("KQ7");
    expect(pairingCodeTyped("KQ7-M4P-X")).toBe("KQ7-M4P-X");
    expect(pairingCodeTyped("")).toBe("");
  });
});

describe("a pairing link at the relay (ADR 0210)", () => {
  const LAN = "https://adas-mac-mini.tail2f9c1e.ts.net";

  it("is the relay's page with the payload, the server as lan, and when the code runs out", () => {
    const link = pairRelayUrl("wss://relay.chipschat.ai", "BKW-374", {
      lan: `${LAN}/`,
      key: KEY,
      until: 1_792_512_345.9,
    });
    expect(link).toBe(
      `https://relay.chipschat.ai/pair#pair=BKW-374&v=1&lan=${encodeURIComponent(LAN)}&relay=wss%3A%2F%2Frelay.chipschat.ai&key=${KEY}&until=1792512345`,
    );
    expect(pairingFromLink(link)).toEqual({
      v: PAIRING_VERSION,
      code: "BKW-374",
      lan: LAN,
      relay: "wss://relay.chipschat.ai",
      key: KEY,
      candidates: [],
    });
  });

  it("opens over plain http for a relay on plain ws, as a test's relay is", () => {
    expect(pairRelayUrl("ws://127.0.0.1:4439", "BKW-374", { lan: LAN, key: KEY })).toMatch(
      /^http:\/\/127\.0\.0\.1:4439\/pair#pair=BKW-374&v=1&lan=/,
    );
  });

  it("refuses an address that is not a relay's", () => {
    expect(() => pairRelayUrl("not a url", "BKW-374", { lan: LAN, key: KEY })).toThrow();
  });
});

describe("a pairing link somebody pasted (ADR 0210)", () => {
  const LAN = "https://adas-mac-mini.tail2f9c1e.ts.net";

  it("reads the relay's page, the server's own page and the app's link alike", () => {
    const relay = pairRelayUrl("wss://relay.chipschat.ai", "BKW-374", { lan: LAN, key: KEY });
    const own = pairingUrl(LAN, "BKW-374", { key: KEY });
    const app = appPairingUrl(LAN, "BKW-374", { key: KEY });
    for (const link of [relay, own, app]) {
      expect(pairingFromLink(link)).toMatchObject({ code: "BKW-374", lan: LAN, key: KEY });
    }
  });

  it("finds the link among the words of the message it came in", () => {
    const relay = pairRelayUrl("wss://relay.chipschat.ai", "BKW-374", { lan: LAN, key: KEY });
    expect(pairingFromLink(`Here you go: ${relay} (good for 15 minutes)`)?.code).toBe("BKW-374");
  });

  it("finds nothing without a code, or at a relay page that names no server", () => {
    expect(pairingFromLink("")).toBeUndefined();
    expect(pairingFromLink("https://relay.chipschat.ai/join#invite=chips_inv_1")).toBeUndefined();
    expect(pairingFromLink("https://relay.chipschat.ai/pair#pair=BKW-374&v=1")).toBeUndefined();
    expect(pairingFromLink("pair=BKW-374")).toBeUndefined();
  });
});
