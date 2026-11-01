import { describe, expect, it } from "vitest";
import { offerFrom, pairingLinkIn, partsOf, scanned } from "./scanned";

const KEY = "a".repeat(43);

describe("partsOf", () => {
  it("splits an address without leaning on the runtime's URL", () => {
    expect(partsOf("http://192.168.1.20:4431/#pair=ABC-234&v=1")).toEqual({
      origin: "http://192.168.1.20:4431",
      search: "",
      hash: "#pair=ABC-234&v=1",
    });
  });

  it("keeps a fragment that holds a slash, which React Native's URL would cut short", () => {
    expect(partsOf("http://a.b:4431/#pair=ABC-234&lan=http://a.b:4431").hash).toBe(
      "#pair=ABC-234&lan=http://a.b:4431",
    );
  });

  it("reads a query as well as a fragment, and an address with neither", () => {
    expect(partsOf("http://a.b/?pair=ABC-234")).toEqual({
      origin: "http://a.b",
      search: "?pair=ABC-234",
      hash: "",
    });
    expect(partsOf("ABC-234")).toEqual({ search: "", hash: "" });
  });
});

describe("scanned", () => {
  it("reads the chips:// link the installed app is launched with, address in the query", () => {
    expect(scanned("chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2F100.64.0.7%3A4431")).toEqual({
      v: 1,
      code: "ABC-234",
      lan: "http://100.64.0.7:4431",
      candidates: [],
    });
  });

  it("reads the QR M4.1 prints, relay and key and all", () => {
    const url = `http://192.168.1.20:4431/#pair=ABC-234&v=1&relay=wss%3A%2F%2Frelay.example&key=${KEY}`;
    expect(scanned(url)).toEqual({
      v: 1,
      code: "ABC-234",
      lan: "http://192.168.1.20:4431",
      relay: "wss://relay.example",
      key: KEY,
      candidates: [],
    });
  });

  it("reads six characters typed by hand, in either case", () => {
    expect(scanned("abc-234")?.code).toBe("ABC-234");
    expect(scanned("  ABC-234  ")?.code).toBe("ABC-234");
  });

  it("says nothing about a QR that is not ours", () => {
    expect(scanned("https://example.com/menu")).toBeUndefined();
    expect(scanned("")).toBeUndefined();
    expect(scanned("WIFI:S:home;")).toBeUndefined();
  });
});

describe("offerFrom", () => {
  it("takes the address out of the QR, and the key and the relay with it", () => {
    const url = `http://192.168.1.20:4431/#pair=ABC-234&v=1&relay=wss%3A%2F%2Frelay.example&key=${KEY}`;
    expect(offerFrom(url)).toEqual({
      ok: true,
      code: "ABC-234",
      lan: "http://192.168.1.20:4431",
      serverKey: KEY,
      relayUrl: "wss://relay.example",
    });
  });

  it("keeps the key on its own when the QR names no relay (ADR 0191)", () => {
    const url = `http://192.168.1.20:4431/#pair=ABC-234&v=1&key=${KEY}`;
    expect(offerFrom(url)).toEqual({
      ok: true,
      code: "ABC-234",
      lan: "http://192.168.1.20:4431",
      serverKey: KEY,
    });
  });

  it("takes the typed address when the code was typed too, and no relay with it", () => {
    expect(offerFrom("ABC-234", " http://mini.local:4431 ")).toEqual({
      ok: true,
      code: "ABC-234",
      lan: "http://mini.local:4431",
    });
  });

  it("asks for an address rather than pairing with nowhere", () => {
    expect(offerFrom("ABC-234")).toEqual({
      ok: false,
      problem: "Add the server's address — the QR usually carries it.",
    });
  });

  it("says so plainly when it is not a pairing code at all", () => {
    expect(offerFrom("https://example.com")).toEqual({
      ok: false,
      problem: "That is not a Chips pairing code.",
    });
  });

  it("leaves the relay out when the QR named one but no key to ask for it by", () => {
    const url = "http://a.b:4431/#pair=ABC-234&v=1&relay=wss%3A%2F%2Frelay.example";
    expect(offerFrom(url)).toEqual({ ok: true, code: "ABC-234", lan: "http://a.b:4431" });
  });
});

describe("pairingLinkIn (ADR 0206)", () => {
  const link = `chips://pair?pair=PRY-234&v=1&lan=http%3A%2F%2F10.0.0.36%3A4431&relay=wss%3A%2F%2Frelay.chipschat.ai&key=${KEY}`;

  it("finds a new phone's link in the message it was sent in", () => {
    expect(pairingLinkIn(`Your Chips, on this phone: copy this link.\n\n${link}`)).toBe(link);
    expect(offerFrom(link)).toMatchObject({
      ok: true,
      code: "PRY-234",
      lan: "http://10.0.0.36:4431",
    });
  });

  it("finds nothing in an invite, a bare code, or words", () => {
    expect(pairingLinkIn("https://host.example/#invite=chips_inv_9")).toBeUndefined();
    expect(pairingLinkIn("the code is PRY-234")).toBeUndefined();
    expect(pairingLinkIn("")).toBeUndefined();
  });
});
