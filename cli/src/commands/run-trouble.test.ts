/**
 * Reading what a run printed (ADR 0230): the address the program listens on, and what went wrong
 * in the words the person reads.
 */

import { describe, expect, it } from "vitest";
import { printedAddress, troubleOf, unansweredWords } from "./run-trouble.js";

const nobody = async () => undefined;

describe("the address a program printed", () => {
  it("reads it as a browser on this Mac would open it", () => {
    // Vite, in colour.
    expect(
      printedAddress(
        "  \u001b[32m➜\u001b[39m  Local:   \u001b[36mhttp://localhost:5173/\u001b[39m",
      ),
    ).toBe("http://localhost:5173/");
    // Python's http.server, listening on IPv6: exactly there, not another program's IPv4.
    expect(printedAddress("Serving HTTP on :: port 8000 (http://[::]:8000/) ...")).toBe(
      "http://[::1]:8000/",
    );
    expect(printedAddress("Emergence is running at http://0.0.0.0:4174.")).toBe(
      "http://127.0.0.1:4174",
    );
    expect(printedAddress("Docs at https://example.com, nothing local")).toBeUndefined();
  });
});

describe("what went wrong", () => {
  it("says Apple's command line tools are missing, for Python's stand-in", async () => {
    const said = "xcode-select: note: No developer tools were found, requesting install.";
    expect(await troubleOf(said, 1, undefined, nobody)).toBe(
      "This needs Apple's command line tools. Install them when your Mac asks, then press Run again.",
    );
  });

  it("names the program and what to install, where the shell said which", async () => {
    expect(await troubleOf("zsh:1: command not found: node", 127, undefined, nobody)).toBe(
      "Chips couldn't find node on your Mac, so the program couldn't start. Install Node.js, or ask the agents for a version that needs nothing installed.",
    );
  });

  it("takes the port from where it opens when the program didn't say it, and names nobody it can't", async () => {
    const said = "OSError: [Errno 48] Address already in use";
    expect(await troubleOf(said, 1, "http://localhost:8000", nobody)).toBe(
      "Port 8000 is already in use, so the program couldn't start. Quit that program, or ask the agents to have it pick a free port.",
    );
  });

  it("leaves any other crash to its code and last lines", async () => {
    expect(
      await troubleOf("Error: Cannot find module 'vite'", 1, undefined, nobody),
    ).toBeUndefined();
  });

  it("counts the wait in seconds", () => {
    expect(unansweredWords("http://localhost:4173", 30_000)).toBe(
      "It's running, but nothing answered at localhost:4173 after 30 seconds.",
    );
  });
});
