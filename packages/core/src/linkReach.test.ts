/**
 * A link to an address only some devices reach (ADR 0227's addendum of 10 November 2026): where
 * an address is, what stands in its way from what a device saw, and the words each case says.
 */

import { describe, expect, it } from "vitest";
import {
  blockedBy,
  cleared,
  hostShown,
  linkName,
  linkNameIn,
  linksThroughTailscale,
  nameToLookUp,
  needsLooking,
  networkOf,
  reachAsk,
  reachLine,
  reachNote,
} from "./linkReach.js";

const LABS = "https://mac-mini.tail1234.ts.net:8443/overview.html";

describe("where an address is", () => {
  it("knows Tailscale's names and addresses", () => {
    expect(networkOf(LABS)).toBe("tailscale");
    expect(networkOf("http://100.101.102.103:4173/")).toBe("tailscale");
    expect(networkOf("http://100.64.0.1/")).toBe("tailscale");
    expect(networkOf("http://100.127.255.254/")).toBe("tailscale");
    expect(networkOf("http://[fd7a:115c:a1e0::1]/")).toBe("tailscale");
  });

  it("keeps 100.x outside Tailscale's range on the web", () => {
    expect(networkOf("http://100.63.0.1/")).toBe("web");
    expect(networkOf("http://100.128.0.1/")).toBe("web");
  });

  it("knows private networks", () => {
    for (const url of [
      "http://192.168.1.20:4173/",
      "http://10.0.0.5/",
      "http://172.16.4.2/",
      "http://172.31.0.1/",
      "http://169.254.3.3/",
      "http://nas.local/",
      "http://printer.home.arpa/",
      "http://[fd12:3456::1]/",
    ]) {
      expect(networkOf(url)).toBe("private");
    }
    expect(networkOf("http://172.32.0.1/")).toBe("web");
  });

  it("knows the device's own address, the web, and links that aren't addresses", () => {
    expect(networkOf("http://localhost:4173/home.html")).toBe("own");
    expect(networkOf("http://127.0.0.1:4173/")).toBe("own");
    expect(networkOf("https://chipschat.ai/")).toBe("web");
    expect(networkOf("mailto:someone@example.com")).toBeUndefined();
    expect(networkOf("not a link")).toBeUndefined();
  });

  it("looks first only at Tailscale's and private addresses", () => {
    expect(needsLooking(LABS)).toBe(true);
    expect(needsLooking("http://192.168.1.20/")).toBe(true);
    expect(needsLooking("http://localhost:4173/")).toBe(false);
    expect(needsLooking("https://chipschat.ai/")).toBe(false);
  });

  it("looks up a name, and nothing for an address given as numbers", () => {
    expect(nameToLookUp(LABS)).toBe("mac-mini.tail1234.ts.net");
    expect(nameToLookUp("http://100.101.102.103:4173/")).toBeUndefined();
    expect(nameToLookUp("http://[fd7a:115c:a1e0::1]/")).toBeUndefined();
    expect(nameToLookUp("nonsense")).toBeUndefined();
  });

  it("names a tailnet machine by its own name, anything else by its host", () => {
    expect(hostShown(LABS)).toBe("mac-mini");
    expect(hostShown("http://192.168.1.20:4173/x")).toBe("192.168.1.20");
  });
});

describe("what stands in a link's way", () => {
  const owner = true;

  it("is nothing once the page answers", () => {
    expect(blockedBy("tailscale", { found: true, answered: true }, owner)).toBeUndefined();
    expect(blockedBy("private", { answered: true }, owner)).toBeUndefined();
  });

  it("is Tailscale being off when the name isn't found", () => {
    expect(blockedBy("tailscale", { found: false, tailscale: false }, owner)).toBe("tailscale-off");
    expect(blockedBy("tailscale", { found: false }, owner)).toBe("tailscale-off");
  });

  it("is another VPN on a phone, which runs one at a time", () => {
    const seen = { found: false, tailscale: false, otherVpn: true };
    expect(blockedBy("tailscale", { ...seen, oneVpn: true }, owner)).toBe("other-vpn");
    // A Mac runs both: another VPN there doesn't turn Tailscale off.
    expect(blockedBy("tailscale", seen, owner)).toBe("tailscale-off");
  });

  it("is Tailscale not installed, where the device can tell", () => {
    expect(blockedBy("tailscale", { found: false, installed: false }, owner)).toBe("not-installed");
  });

  it("is something in Tailscale's way when it's on and the name still isn't found", () => {
    expect(blockedBy("tailscale", { found: false, tailscale: true }, owner)).toBe("vpn-in-way");
  });

  it("is the Mac not answering when the name is found but the page isn't", () => {
    expect(blockedBy("tailscale", { found: true, answered: false }, owner)).toBe("mac-quiet");
  });

  it("goes by the page for an address given as numbers", () => {
    expect(blockedBy("tailscale", { answered: false, tailscale: false }, owner)).toBe(
      "tailscale-off",
    );
    expect(blockedBy("tailscale", { answered: false, tailscale: true }, owner)).toBe("mac-quiet");
  });

  it("says nothing while the page wasn't asked and the name was found", () => {
    expect(blockedBy("tailscale", { found: true }, owner)).toBeUndefined();
    expect(blockedBy("tailscale", {}, owner)).toBeUndefined();
  });

  it("is the owner's tailnet for anybody else whose device can't find the name", () => {
    expect(blockedBy("tailscale", { found: false, tailscale: false }, false)).toBe("their-tailnet");
    expect(blockedBy("tailscale", { found: true }, false)).toBeUndefined();
  });

  it("is a private network that didn't answer or wasn't found", () => {
    expect(blockedBy("private", { answered: false }, owner)).toBe("private");
    expect(blockedBy("private", { found: false }, false)).toBe("private");
    expect(blockedBy("private", {}, owner)).toBeUndefined();
  });

  it("is never anything for the web or the device itself", () => {
    expect(blockedBy("web", { found: false, answered: false }, owner)).toBeUndefined();
    expect(blockedBy("own", { answered: false }, owner)).toBeUndefined();
  });

  it("counts the way as clear once the name is found or the page answers", () => {
    expect(cleared({ found: true })).toBe(true);
    expect(cleared({ answered: true })).toBe(true);
    expect(cleared({ found: false, tailscale: true })).toBe(false);
  });
});

describe("the words", () => {
  const said = { name: "Labs", device: "iPhone" as const, url: LABS };

  it("names the link and the device when Tailscale is off", () => {
    expect(reachAsk("tailscale-off", said)).toEqual({
      kind: "tailscale-off",
      title: "Labs needs Tailscale",
      body: "Tailscale is off on this iPhone. Turn it on, and Chips opens Labs.",
      tone: "plain",
      go: "Open Tailscale",
      opens: "tailscale",
      anyway: true,
    });
  });

  it("says This link and the page where the link has no name", () => {
    const words = reachAsk("tailscale-off", { device: "Mac", url: LABS });
    expect(words.title).toBe("This link needs Tailscale");
    expect(words.body).toBe("Tailscale is off on this Mac. Turn it on, and Chips opens the page.");
    expect(reachAsk("reaching", { device: "Mac", url: LABS }).title).toBe("Opening the page");
    expect(reachAsk("tailscale-wait", { device: "Mac", url: LABS }).body).toBe(
      "The page opens once this Mac is on your tailnet.",
    );
  });

  it("says Tailscale comes first while the program isn't running", () => {
    expect(reachAsk("tailscale-off", { ...said, stopped: true }).body).toBe(
      "Tailscale is off on this iPhone, and the program isn’t running. Turn Tailscale on first.",
    );
  });

  it("says another VPN is on, and what turning Tailscale on does to it", () => {
    expect(reachAsk("other-vpn", said).body).toBe(
      "Another VPN is on. Your iPhone runs one VPN at a time, so turning on Tailscale turns the other one off.",
    );
  });

  it("offers Get Tailscale where it isn't installed, tapped or clicked", () => {
    const words = reachAsk("not-installed", { ...said, device: "Mac" });
    expect(words.go).toBe("Get Tailscale");
    expect(words.opens).toBe("get");
    expect(words.body).toBe(
      "Tailscale isn’t on this Mac. Get it, sign in with the account your Mac uses, and click Labs again.",
    );
  });

  it("waits, then opens, once Tailscale is on", () => {
    expect(reachAsk("tailscale-wait", said)).toMatchObject({
      title: "Waiting for Tailscale",
      body: "Labs opens once this iPhone is on your tailnet.",
      go: "Open Tailscale",
    });
    expect(reachAsk("reaching", said)).toMatchObject({
      title: "Opening Labs",
      body: "Tailscale is on.",
      busy: true,
      anyway: false,
    });
  });

  it("names the machine when something is in the way, or it didn't answer", () => {
    expect(reachAsk("vpn-in-way", { ...said, device: "Mac" })).toMatchObject({
      title: "This Mac can’t find mac-mini",
      tone: "bad",
      go: "Try again",
      opens: "again",
    });
    expect(reachAsk("mac-quiet", said).body).toBe(
      "This iPhone is on Tailscale, but mac-mini didn’t answer. Check that Tailscale is on on your Mac.",
    );
  });

  it("names the owner's tailnet for somebody else, with nothing gold to press", () => {
    const words = reachAsk("their-tailnet", { ...said, ownerName: "Arjun" });
    expect(words.title).toBe("Labs is on Arjun’s tailnet");
    expect(words.body).toBe(
      "It opens only on devices on Arjun’s Tailscale network. Arjun can share that Mac with you from Tailscale.",
    );
    expect(words.go).toBeUndefined();
    expect(words.anyway).toBe(true);
  });

  it("names the host of a private address", () => {
    expect(reachAsk("private", { ...said, url: "http://192.168.1.20:4173/" }).body).toBe(
      "This iPhone can’t reach 192.168.1.20 from here. It opens on the same Wi-Fi as your Mac.",
    );
  });

  it("says the banner's line for a running program and a stopped one", () => {
    expect(reachLine(true, "iPhone")).toBe(
      "Links here need Tailscale, which is off on this iPhone.",
    );
    expect(reachLine(false, "Mac")).toBe(
      "Links here need it running, and Tailscale, which is off on this Mac.",
    );
  });

  it("says, in a browser, what a link it opened needed", () => {
    expect(reachNote(LABS, "Labs")).toBe(
      "Labs goes through Tailscale. If it didn’t open, turn Tailscale on on this computer.",
    );
    expect(reachNote("http://192.168.1.20/", undefined)).toBe(
      "This link is on a private network. If it didn’t open, this computer can’t reach 192.168.1.20 from here.",
    );
    expect(reachNote("https://chipschat.ai/", "Site")).toBeUndefined();
  });
});

describe("a link's name", () => {
  it("is one line without a trailing arrow", () => {
    expect(linkName("Open your health app →")).toBe("Open your health app");
    expect(linkName("  Heart &\n fitness  ")).toBe("Heart & fitness");
  });

  it("is nothing when empty or too long for a title", () => {
    expect(linkName("")).toBeUndefined();
    expect(linkName(" → ")).toBeUndefined();
    expect(linkName(null)).toBeUndefined();
    expect(linkName("x".repeat(41))).toBeUndefined();
  });

  const page = `
    <a class="card open" href="https://mac-mini.tail1234.ts.net:8443/home.html" target="_blank" data-chips-address="" data-chips-words="Open your health app →"><b>Open your health app →</b></a>
    <a class="card" href="https://mac-mini.tail1234.ts.net:8443/home.html" target="_blank" data-chips-address="" data-chips-words="Home"><b>Home</b></a>
    <a class="card" href="${LABS}" target="_blank" data-chips-address="" data-chips-words="Labs"><b>Labs</b></a>
    <a href="https://example.com/?a=1&amp;b=2" data-chips-address="" data-chips-words="Tom &amp; Jerry">x</a>
    <a href="chips-file:report.md" data-chips-file="report.md">Report</a>`;

  it("is read from the page by its address, when every link to it has the same one", () => {
    expect(linkNameIn(page, LABS)).toBe("Labs");
    expect(linkNameIn(page, "https://example.com/?a=1&b=2")).toBe("Tom & Jerry");
  });

  it("is nothing where links to the same address have different names, or none", () => {
    expect(linkNameIn(page, "https://mac-mini.tail1234.ts.net:8443/home.html")).toBe(undefined);
    expect(linkNameIn(page, "https://nowhere.example/")).toBeUndefined();
    expect(linkNameIn('<a href="https://x.example/">x</a>', "https://x.example/")).toBeUndefined();
  });

  it("matches an address the web view wrote with a slash the page left out", () => {
    expect(
      linkNameIn('<a href="https://x.example" data-chips-words="X">x</a>', "https://x.example/"),
    ).toBe("X");
  });

  it("tells a page that links through Tailscale from one that doesn't", () => {
    expect(linksThroughTailscale(page)).toBe(true);
    expect(linksThroughTailscale('<a href="http://localhost:4173/">x</a>')).toBe(false);
  });
});
