/**
 * The rule a page in the app is held to (ADR 0059): what it may load inside its own view, what a
 * tap may open in the platform's browser, and that nothing else happens — above all, that a page
 * cannot open a `chips://` link in the app it is drawn in.
 */

import { describe, expect, it } from "vitest";
import { fileOfLink, isPage, MAX_PAGE_BYTES, pageLoad } from "./page";

describe("which files open as a page", () => {
  it("takes an HTML document or a Markdown file, however its type is spelled, and nothing else", () => {
    expect(isPage("text/html")).toBe(true);
    expect(isPage("text/html; charset=utf-8")).toBe(true);
    expect(isPage("TEXT/HTML")).toBe(true);
    // ADR 0123: the walking tour J sent to Mission Murals went to the share sheet.
    expect(isPage("text/markdown")).toBe(true);
    expect(isPage("text/markdown; charset=utf-8")).toBe(true);
    expect(isPage("image/svg+xml")).toBe(false);
    expect(isPage("application/xhtml+xml")).toBe(false);
    expect(isPage("text/plain")).toBe(false);
  });

  it("draws a mock or a report, and hands a page of megabytes to the share sheet", () => {
    expect(MAX_PAGE_BYTES).toBe(5 * 1024 * 1024);
  });
});

describe("what a page may load", () => {
  it("writes itself into its own document, and jumps within it", () => {
    for (const platform of ["ios", "android"] as const) {
      expect(pageLoad({ url: "about:blank", navigationType: "other" }, platform)).toBe("load");
      expect(pageLoad({ url: "about:blank#moves" }, platform)).toBe("load");
      expect(pageLoad({ url: "about:srcdoc", isTopFrame: false }, platform)).toBe("load");
    }
  });

  it("opens a web address or an email a person tapped in the platform's own app", () => {
    const tap = { navigationType: "click", isTopFrame: true, hasTargetFrame: true };
    expect(pageLoad({ url: "https://chess.example/rules", ...tap }, "ios")).toBe("outside");
    expect(pageLoad({ url: "http://chess.example", ...tap }, "ios")).toBe("outside");
    expect(pageLoad({ url: "mailto:arjun@example.com", ...tap }, "ios")).toBe("outside");
    // A link that asks for a window of its own is still a tap.
    expect(
      pageLoad(
        { url: "https://chess.example", navigationType: "click", hasTargetFrame: false },
        "ios",
      ),
    ).toBe("outside");
  });

  it("opens nothing outside on Android, whose web view cannot say a tap from a page leaving by itself (SEC-7)", () => {
    // The library calls every load `other` and the top frame, a tap and a script's `location`
    // alike, so a page there opened any address outside on its own. Until it can say, it stays put.
    for (const request of [
      { url: "https://chess.example" },
      { url: "https://chess.example", navigationType: "other", isTopFrame: true },
      { url: "https://chess.example", navigationType: "click", isTopFrame: true },
      { url: "mailto:arjun@example.com", navigationType: "click" },
    ]) {
      expect(pageLoad(request, "android"), request.url).toBe("refuse");
    }
  });

  it("stays put when the page tries to leave by itself, or to send a form", () => {
    for (const navigationType of ["other", "formsubmit", "reload", "backforward"]) {
      expect(
        pageLoad({ url: "https://tracker.example", navigationType, isTopFrame: true }, "ios"),
      ).toBe("refuse");
    }
  });

  it("lets a frame inside the page show a web page there", () => {
    expect(
      pageLoad(
        { url: "https://board.example/embed", isTopFrame: false, hasTargetFrame: true },
        "ios",
      ),
    ).toBe("load");
  });

  it("refuses every other scheme, however it is asked for — this app's own above all", () => {
    const schemes = [
      "chips://pair?pair=ABC-234&v=1&lan=http%3A%2F%2Fevil.example",
      "CHIPS://spaces/spc_1",
      "file:///var/mobile/Containers/Data/Application/chips-devices.db",
      "javascript:alert(1)",
      "data:text/html,<p>elsewhere</p>",
      "blob:null/1234",
      "tel:+15555550100",
      "sms:+15555550100",
      "intent://scan#Intent;scheme=chips;end",
      "about:config",
      "",
    ];
    for (const url of schemes) {
      for (const platform of ["ios", "android"] as const) {
        expect(pageLoad({ url, navigationType: "click" }, platform), url).toBe("refuse");
        expect(pageLoad({ url, isTopFrame: false }, platform), url).toBe("refuse");
      }
    }
  });

  it("opens a file of the room's project in Chips from a tapped chips-file: link, on iOS alone (ADR 0227)", () => {
    const url = "chips-file:reports%2Foverview.html";
    expect(pageLoad({ url, navigationType: "click", isTopFrame: true }, "ios")).toBe("file");
    expect(fileOfLink(url)).toBe("reports/overview.html");
    // Not tapped, or on Android, where a tap isn't said: nothing.
    expect(pageLoad({ url, navigationType: "other" }, "ios")).toBe("refuse");
    expect(pageLoad({ url, navigationType: "click" }, "android")).toBe("refuse");
    // Out of the project, or not readable: nothing.
    expect(pageLoad({ url: "chips-file:..%2Fsecret", navigationType: "click" }, "ios")).toBe(
      "refuse",
    );
    expect(fileOfLink("chips-file:%E0%A4%A")).toBeUndefined();
    expect(fileOfLink("https://example.com")).toBeUndefined();
  });
});
