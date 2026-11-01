import { describe, expect, it } from "vitest";
import { HTML_POLICY, PAGE_HEADER_POLICY, PAGE_SANDBOX } from "./pages.js";

describe("an HTML page's policy (ADR 0059's addendum, ADR 0201)", () => {
  it("runs the page's own script and lets nothing leave", () => {
    const directives = new Map(
      HTML_POLICY.split(";").map((each) => {
        const [name = "", ...sources] = each.trim().split(/\s+/);
        return [name, sources.join(" ")];
      }),
    );
    expect(directives.get("default-src")).toBe("'none'");
    expect(directives.get("script-src")).toBe("'unsafe-inline'");
    expect(directives.get("style-src")).toBe("'unsafe-inline'");
    // A picture, a font, a sound or a clip from the page itself, never from an address a script
    // could time.
    expect(directives.get("img-src")).toBe("data: blob:");
    expect(directives.get("font-src")).toBe("data:");
    expect(directives.get("media-src")).toBe("data: blob:");
    for (const name of ["connect-src", "frame-src", "form-action", "object-src", "child-src"]) {
      expect(directives.has(name), name).toBe(false);
    }
    expect(HTML_POLICY).not.toContain("http");
    expect(HTML_POLICY).not.toContain("unsafe-eval");
  });

  it("sandboxes the frame to scripts and windows, on an origin that is nobody's", () => {
    expect(PAGE_SANDBOX.split(" ")).toEqual([
      "allow-scripts",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
    ]);
    expect(PAGE_SANDBOX).not.toContain("allow-same-origin");
    expect(PAGE_SANDBOX).not.toContain("allow-forms");
    expect(PAGE_SANDBOX).not.toContain("allow-top-navigation");
  });

  it("answers both doors with the policy and the sandbox in one header", () => {
    expect(PAGE_HEADER_POLICY).toBe(`${HTML_POLICY}; sandbox ${PAGE_SANDBOX}`);
    expect(PAGE_HEADER_POLICY).toBe(
      "default-src 'none'; img-src data: blob:; font-src data:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
    );
  });
});
