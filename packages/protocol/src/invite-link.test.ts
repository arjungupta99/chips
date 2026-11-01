/**
 * An invite as a link carries it (ADR 0164): the server's page with the token in its fragment,
 * the server's key and its relay beside it (the key alone when there is no relay, ADR 0191), and
 * the apps' `chips://join` link, read back from either, from a message it was pasted with, and
 * from a link somebody rewrote.
 */

import { describe, expect, it } from "vitest";
import { inviteAppUrl, inviteFromLink, inviteRelayUrl, inviteUrl } from "./invite-link.js";

const KEY = "k".repeat(43);
const HOST = "https://adas-mac-mini.tail2f9c1e.ts.net";

describe("an invite link", () => {
  it("is the server's page with the invite, the relay and the key in the fragment", () => {
    const text = inviteUrl(`${HOST}/`, "chips_inv_1", {
      relay: "wss://relay.example/v1",
      key: KEY,
    });
    expect(text).toBe(
      `${HOST}/#invite=chips_inv_1&relay=wss%3A%2F%2Frelay.example%2Fv1&key=${KEY}`,
    );
    expect(inviteFromLink(text)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
      relay: "wss://relay.example/v1",
      key: KEY,
    });
  });

  it("carries the invite alone when there is no key, and never a relay without one", () => {
    expect(inviteUrl(HOST, "chips_inv_1")).toBe(`${HOST}/#invite=chips_inv_1`);
    expect(inviteUrl(HOST, "chips_inv_1", { relay: "wss://relay.example" })).toBe(
      `${HOST}/#invite=chips_inv_1`,
    );
    expect(inviteFromLink(`${HOST}/#invite=chips_inv_1`)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
    });
    // A relay somebody wrote in without a key reads as no relay.
    expect(inviteFromLink(`${HOST}/#invite=chips_inv_1&relay=wss%3A%2F%2Fr`)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
    });
  });

  it("carries the key alone when the server has no relay: the tunnel door needs only the key (ADR 0191)", () => {
    const text = inviteUrl(HOST, "chips_inv_1", { key: KEY });
    expect(text).toBe(`${HOST}/#invite=chips_inv_1&key=${KEY}`);
    expect(text).not.toContain("relay=");
    expect(inviteFromLink(text)).toEqual({ token: "chips_inv_1", lan: HOST, key: KEY });
    expect(inviteAppUrl({ token: "chips_inv_1", lan: HOST, key: KEY })).toBe(
      `chips://join?invite=chips_inv_1&lan=${encodeURIComponent(HOST)}&key=${KEY}`,
    );
  });

  it("opens at the relay's page when the server has a relay, with the server as lan (ADR 0207)", () => {
    const text = inviteRelayUrl("wss://relay.chipschat.ai", "chips_inv_1", {
      lan: `${HOST}/`,
      key: KEY,
    });
    expect(text).toBe(
      `https://relay.chipschat.ai/join#invite=chips_inv_1&lan=${encodeURIComponent(HOST)}&relay=wss%3A%2F%2Frelay.chipschat.ai&key=${KEY}`,
    );
    // Read back as the apps read it, by builds from before the relay's page as well: `lan` wins
    // over the link's own origin.
    expect(inviteFromLink(text)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
      relay: "wss://relay.chipschat.ai",
      key: KEY,
    });
    // A relay on plain ws (the end-to-end tests') has a plain http page; a path on the relay or
    // the server goes, since both are named by their origin.
    expect(
      inviteRelayUrl("ws://127.0.0.1:4433/", "chips_inv_1", {
        lan: "https://relay.chipschat.ai/try",
        key: KEY,
      }),
    ).toMatch(
      /^http:\/\/127\.0\.0\.1:4433\/join#invite=chips_inv_1&lan=https%3A%2F%2Frelay\.chipschat\.ai&/,
    );
    expect(() => inviteRelayUrl("relay.example", "chips_inv_1", { lan: HOST, key: KEY })).toThrow();
  });

  it("carries when the link runs out, in whole seconds, for the relay's page to say", () => {
    const text = inviteRelayUrl("wss://relay.chipschat.ai", "chips_inv_1", {
      lan: HOST,
      key: KEY,
      until: 1_792_512_345.678,
    });
    expect(text).toMatch(/&until=1792512345$/);
    // The apps read the invite as before: the time is the page's alone.
    expect(inviteFromLink(text)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
      relay: "wss://relay.chipschat.ai",
      key: KEY,
    });
  });

  it("goes to the app as chips://join, with the server as lan, and reads back the same", () => {
    const text = inviteAppUrl({
      token: "chips_inv_1",
      lan: `${HOST}/`,
      relay: "wss://r",
      key: KEY,
    });
    expect(text).toBe(
      `chips://join?invite=chips_inv_1&lan=${encodeURIComponent(HOST)}&relay=wss%3A%2F%2Fr&key=${KEY}`,
    );
    expect(inviteFromLink(text)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
      relay: "wss://r",
      key: KEY,
    });
  });

  it("is found in the message it was pasted with, and in a link somebody rewrote", () => {
    expect(
      inviteFromLink(`Here's your link for Demo: ${HOST}/#invite=chips_inv_1 see you`),
    ).toEqual({
      token: "chips_inv_1",
      lan: HOST,
    });
    expect(inviteFromLink(`${HOST}/?invite=chips_inv_1`)).toEqual({
      token: "chips_inv_1",
      lan: HOST,
    });
  });

  it("is nothing for a pairing code, a stranger's QR, or an empty invite", () => {
    expect(inviteFromLink(`${HOST}/#pair=ABC-234&v=1`)).toBeUndefined();
    expect(inviteFromLink("https://example.com/menu")).toBeUndefined();
    expect(inviteFromLink(`${HOST}/#invite=`)).toBeUndefined();
    expect(inviteFromLink("")).toBeUndefined();
  });

  it("names no server for an app link that has none", () => {
    expect(inviteFromLink("chips://join?invite=chips_inv_1")).toEqual({ token: "chips_inv_1" });
  });
});
