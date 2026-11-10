import { describe, expect, it } from "vitest";
import { pairingLink, sameServer } from "./link";

const KEY = "a".repeat(43);

describe("a pairing offer that arrives as a link", () => {
  it("reads the link pnpm phone launches the app with", () => {
    expect(pairingLink("chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2F100.64.0.7%3A4431")).toEqual(
      { ok: true, code: "ABC-234", lan: "http://100.64.0.7:4431" },
    );
  });

  it("reads the QR's own address, when the app is what opens it", () => {
    expect(pairingLink("http://192.168.1.20:4431/#pair=ABC-234&v=1")).toEqual({
      ok: true,
      code: "ABC-234",
      lan: "http://192.168.1.20:4431",
    });
  });

  it("reads the phone's QR at chipschat.ai/p, the server from the link and not chipschat.ai", () => {
    const link = `https://chipschat.ai/p#pair=ABC-234&v=1&lan=http%3A%2F%2F192.168.1.20%3A4431&relay=wss%3A%2F%2Frelay.example&key=${KEY}`;
    expect(pairingLink(link)).toEqual({
      ok: true,
      code: "ABC-234",
      lan: "http://192.168.1.20:4431",
      serverKey: KEY,
      relayUrl: "wss://relay.example",
    });
  });

  it("carries the key and the relay when the link has them", () => {
    const link = `chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2Fa.b%3A4431&relay=wss%3A%2F%2Frelay.example&key=${KEY}`;
    expect(pairingLink(link)).toEqual({
      ok: true,
      code: "ABC-234",
      lan: "http://a.b:4431",
      serverKey: KEY,
      relayUrl: "wss://relay.example",
    });
  });

  it("says what is missing when a pairing link names no server", () => {
    const offer = pairingLink("chips://pair?pair=ABC-234");
    expect(offer?.ok).toBe(false);
    expect(offer && !offer.ok ? offer.problem : "").toMatch(/address/);
  });

  it("is nothing for a link about something else, and for no link at all", () => {
    expect(pairingLink("chips://space/spc_01H")).toBeUndefined();
    expect(pairingLink("chips://approval/apr_01H")).toBeUndefined();
    expect(pairingLink("https://chipschat.ai/")).toBeUndefined();
    expect(pairingLink("not a url")).toBeUndefined();
    expect(pairingLink("")).toBeUndefined();
  });
});

describe("whether two addresses are one server", () => {
  it("compares origins, not spellings", () => {
    expect(sameServer("http://100.64.0.7:4431", "http://100.64.0.7:4431/")).toBe(true);
    expect(sameServer("HTTP://Mini.local:4431", "http://mini.local:4431")).toBe(true);
    expect(sameServer("http://mini.local:4431", "http://mini.local:4432")).toBe(false);
    expect(sameServer("http://mini.local:4431", "https://mini.local:4431")).toBe(false);
  });

  it("matches nothing for a device that has no address of its own", () => {
    expect(sameServer(undefined, "http://mini.local:4431")).toBe(false);
    expect(sameServer("", "http://mini.local:4431")).toBe(false);
  });
});
