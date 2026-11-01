/**
 * The relay's invite page and the iPhone app's association file (ADR 0207): the page reads the
 * invite out of its fragment into the app's link and the server's own page, from a link the server
 * made, and drops what a made-up link puts in its place; it runs only the script and style it was
 * served with; and the file names the app `apps/mobile/app.json` builds.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inviteFromLink, inviteRelayUrl } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { APP_ID, APP_SITE_ASSOCIATION, LINKS_SOURCE, relayPage } from "./join-page.js";

type Links = {
  readonly app: string;
  readonly browser: string;
  readonly until: number | null;
} | null;
/** The page's own functions, from the source the browser runs. */
const page = new Function(`${LINKS_SOURCE}\nreturn { invite, lifeOf, whenOf };`)() as {
  invite: (hash: string) => Links;
  lifeOf: (until: number | null, now: number) => string;
  whenOf: (until: number, now: number) => string;
};
const { invite } = page;

const KEY = "k".repeat(43);
const LAN = "https://adas-mac-mini.tail2f9c1e.ts.net";
const hashOf = (link: string) => link.slice(link.indexOf("#"));

describe("the relay's invite page", () => {
  it("turns a link the server made into the app's link and the server's own page", () => {
    const link = inviteRelayUrl("wss://relay.chipschat.ai", "chips_inv_AbC-_1", {
      lan: LAN,
      key: KEY,
    });
    const found = invite(hashOf(link));
    expect(found?.app).toMatch(/^chips:\/\/join\?/);
    // The app reads it as the link itself reads.
    expect(inviteFromLink(found?.app ?? "")).toEqual(inviteFromLink(link));
    expect(inviteFromLink(found?.app ?? "")).toEqual({
      token: "chips_inv_AbC-_1",
      lan: LAN,
      relay: "wss://relay.chipschat.ai",
      key: KEY,
    });
    expect(found?.browser).toBe(`${LAN}/#invite=chips_inv_AbC-_1`);
  });

  it("finds no invite where there is none, or where it names no server", () => {
    expect(invite("")).toBeNull();
    expect(invite("#lan=https%3A%2F%2Fa.example")).toBeNull();
    expect(invite("#invite=chips_inv_1")).toBeNull();
    expect(invite("#invite=nope&lan=https%3A%2F%2Fa.example")).toBeNull();
    expect(invite("#invite=chips_inv_1%3Cb%3E&lan=https%3A%2F%2Fa.example")).toBeNull();
  });

  it("drops what a made-up link puts in place of a server, a relay or a key", () => {
    expect(invite("#invite=chips_inv_1&lan=javascript%3Aalert(1)")).toBeNull();
    expect(invite("#invite=chips_inv_1&lan=chips%3A%2F%2Fjoin")).toBeNull();
    // A server by its origin alone: a path, a query or a fragment of its own goes.
    expect(invite("#invite=chips_inv_1&lan=https%3A%2F%2Fa.example%2Fx%3Fy%23z")?.browser).toBe(
      "https://a.example/#invite=chips_inv_1",
    );
    const relayOverHttp = invite(
      `#invite=chips_inv_1&lan=https%3A%2F%2Fa.example&relay=https%3A%2F%2Fr.example&key=${KEY}`,
    );
    expect(inviteFromLink(relayOverHttp?.app ?? "")).toEqual({
      token: "chips_inv_1",
      lan: "https://a.example",
      key: KEY,
    });
    const shortKey = invite(
      "#invite=chips_inv_1&lan=https%3A%2F%2Fa.example&relay=wss%3A%2F%2Fr&key=k",
    );
    expect(inviteFromLink(shortKey?.app ?? "")).toEqual({
      token: "chips_inv_1",
      lan: "https://a.example",
    });
  });

  it("says when the link runs out: the time on its last day, the date before", () => {
    const link = inviteRelayUrl("wss://relay.chipschat.ai", "chips_inv_1", {
      lan: LAN,
      key: KEY,
      until: 1_792_512_345,
    });
    expect(invite(hashOf(link))?.until).toBe(1_792_512_345_000);
    expect(invite("#invite=chips_inv_1&lan=https%3A%2F%2Fa.example&until=soon")?.until).toBeNull();

    const now = new Date(2026, 9, 30, 15, 12).getTime();
    const today = new Date(2026, 9, 30, 15, 42).getTime();
    const later = new Date(2026, 10, 2, 9, 0).getTime();
    const time = new Date(today).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const date = new Date(later).toLocaleDateString([], { month: "long", day: "numeric" });
    expect(page.whenOf(today, now)).toBe(time);
    expect(page.whenOf(later, now)).toBe(date);
    expect(page.lifeOf(today, now)).toBe(
      `This link works until ${time}. If it has run out by the time Chips is installed, ask whoever sent it for a new one.`,
    );
    expect(page.lifeOf(null, now)).toBe(
      "If this link has run out by the time Chips is installed, ask whoever sent it for a new one.",
    );
  });

  it("names no store and no test, and says so when the link has run out", () => {
    const body = relayPage("GET", "/join")?.body ?? "";
    expect(body).not.toMatch(/testing|TestFlight|App Store/i);
    expect(body).toContain("This link has run out");
  });

  it("runs only the script and the style it was served with, and is never framed", () => {
    const page = relayPage("GET", "/join");
    expect(page?.status).toBe(200);
    const policy = page?.headers["content-security-policy"] ?? "";
    const sha = (text: string) => createHash("sha256").update(text).digest("base64");
    const script = /<script>([\s\S]*?)<\/script>/.exec(page?.body ?? "")?.[1] ?? "";
    const style = /<style>([\s\S]*?)<\/style>/.exec(page?.body ?? "")?.[1] ?? "";
    expect(policy).toContain(`script-src 'sha256-${sha(script)}'`);
    expect(policy).toContain(`style-src 'sha256-${sha(style)}'`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(page?.body).not.toMatch(/<(img|link|iframe)\b|src=|https?:\/\/(?!www\.w3)/);
    expect(page?.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("is served only for GET and HEAD at its own paths", () => {
    expect(relayPage("HEAD", "/join")).toBeDefined();
    expect(relayPage("POST", "/join")).toBeUndefined();
    expect(relayPage("GET", "/join/x")).toBeUndefined();
    expect(relayPage("GET", "/")).toBeUndefined();
  });
});

describe("the app's association file", () => {
  it("names the app apps/mobile/app.json builds, for /join alone", () => {
    const app = JSON.parse(
      readFileSync(new URL("../../apps/mobile/app.json", import.meta.url), "utf8"),
    ) as { expo: { ios: { appleTeamId: string; bundleIdentifier: string } } };
    expect(APP_ID).toBe(`${app.expo.ios.appleTeamId}.${app.expo.ios.bundleIdentifier}`);
    expect(JSON.parse(APP_SITE_ASSOCIATION)).toEqual({
      applinks: {
        details: [
          { appIDs: [APP_ID], components: [{ "/": "/join", comment: expect.any(String) }] },
        ],
      },
    });
    expect(
      relayPage("GET", "/.well-known/apple-app-site-association")?.headers["content-type"],
    ).toBe("application/json");
  });
});
