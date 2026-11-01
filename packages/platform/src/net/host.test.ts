import { describe, expect, it } from "vitest";
import { accountName, firstName, machineName, type RunCommand } from "./host.js";

const answers =
  (table: Record<string, string>): RunCommand =>
  (command, args) => {
    const said = table[[command, ...args].join(" ")];
    if (said === undefined) throw new Error(`${command} failed`);
    return said;
  };

describe("machineName", () => {
  it("is a Mac's computer name, as Sharing settings says it", () => {
    const run = answers({ "scutil --get ComputerName": "Arjun's Mac mini\n" });
    expect(machineName("darwin", run, () => "Adas-Mac-mini-9.local")).toBe("Arjun's Mac mini");
  });

  it("falls back to the host name, without mDNS's .local, when a Mac won't say", () => {
    expect(machineName("darwin", answers({}), () => "Adas-Mac-mini-9.local")).toBe(
      "Adas-Mac-mini-9",
    );
  });

  it("is the host name elsewhere, and asks nothing", () => {
    const run: RunCommand = () => {
      throw new Error("asked");
    };
    expect(machineName("linux", run, () => "vps-fra-1")).toBe("vps-fra-1");
  });

  it("is never empty", () => {
    expect(machineName("linux", answers({}), () => "")).toBe("this computer");
  });
});

describe("accountName", () => {
  it("is id -F on a Mac", () => {
    expect(accountName("darwin", answers({ "id -F": "Arjun Gupta\n" }))).toBe("Arjun Gupta");
  });

  it("is the passwd comment's first field on Linux", () => {
    const run = answers({
      "getent passwd ada": "ada:x:1000:1000:Ada Lovelace,,,:/home/ada:/bin/bash",
    });
    expect(accountName("linux", run, "ada")).toBe("Ada Lovelace");
  });

  it("is nothing when the system won't say or the comment is empty", () => {
    expect(accountName("darwin", answers({}))).toBeUndefined();
    expect(
      accountName(
        "linux",
        answers({ "getent passwd ada": "ada:x:1000:1000::/home/ada:/bin/sh" }),
        "ada",
      ),
    ).toBeUndefined();
    expect(accountName("linux", answers({}), undefined)).toBeUndefined();
  });
});

describe("firstName", () => {
  it("is the first word", () => {
    expect(firstName("Arjun Gupta")).toBe("Arjun");
    expect(firstName("  Ada  ")).toBe("Ada");
  });

  it("is nothing for nothing", () => {
    expect(firstName(undefined)).toBeUndefined();
    expect(firstName("   ")).toBeUndefined();
  });
});
