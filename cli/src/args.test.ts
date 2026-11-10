/**
 * The words after `chips` (the onboarding audit, items 6 and 37): `--flag=value` is the flag, an
 * unknown flag is refused, and the words that are not flags are found wherever they stand.
 */

import { describe, expect, it } from "vitest";
import { readArgs, serverAddress } from "./args.js";

describe("readArgs", () => {
  it("reads a flag's value after a space or an equals sign alike", () => {
    const spaced = readArgs(["pair", "--server", "http://mini.local:4431", "ABC-234"]);
    const joined = readArgs(["pair", "--server=http://mini.local:4431", "ABC-234"]);
    expect(spaced).toEqual(joined);
    expect(spaced).toMatchObject({
      ok: true,
      command: "pair",
      words: ["ABC-234"],
      flags: { server: "http://mini.local:4431" },
    });
    expect(readArgs(["up", "--reach=relay", "--port=5000"])).toMatchObject({
      ok: true,
      flags: { reach: "relay", port: 5000 },
    });
  });

  it("refuses a flag it doesn't know rather than ignoring it", () => {
    expect(readArgs(["up", "--reahc", "lan"])).toEqual({
      ok: false,
      problem: "`chips` has no flag `--reahc`. `chips help` lists them.",
    });
  });

  it("refuses a flag with no value, a switch given one, and a port that is not a port", () => {
    expect(readArgs(["pair", "ABC-234", "--server"])).toMatchObject({ ok: false });
    expect(readArgs(["pair", "--server", "--issue"])).toMatchObject({ ok: false });
    expect(readArgs(["up", "--yes=no"])).toEqual({ ok: false, problem: "`--yes` takes no value." });
    expect(readArgs(["up", "--port", "70000"])).toMatchObject({ ok: false });
    expect(readArgs(["up", "--port", "50x"])).toMatchObject({ ok: false });
  });

  it("takes --help anywhere as the usage, so a command is never run by asking about it", () => {
    expect(readArgs(["up", "--help"])).toMatchObject({ ok: true, flags: { help: true } });
    expect(readArgs(["connect", "-h"])).toMatchObject({ ok: true, flags: { help: true } });
  });

  it("is help with nothing given", () => {
    expect(readArgs([])).toMatchObject({ ok: true, command: "help", words: [] });
  });

  it("lists the words around the flags in order", () => {
    expect(readArgs(["connect", "hermes", "--name", "Ada", "--json", "extra"])).toMatchObject({
      words: ["hermes", "extra"],
      flags: { name: "Ada", json: true },
    });
  });
});

describe("serverAddress", () => {
  it("gives an address its http:// and drops a slash at the end", () => {
    expect(serverAddress("192.168.1.20:4431")).toBe("http://192.168.1.20:4431");
    expect(serverAddress("https://chips.example.com/")).toBe("https://chips.example.com");
    expect(serverAddress("ftp://x")).toBeUndefined();
    expect(serverAddress("")).toBeUndefined();
  });
});
