import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aboutBlurb,
  bugReportLine,
  buildCapsule,
  computerBehind,
  olderThan,
  RELEASES,
  releaseDay,
  releaseOf,
} from "./about.js";

const ROOT = new URL("../../../", import.meta.url);
const repoVersion = (
  JSON.parse(readFileSync(new URL("package.json", ROOT), "utf8")) as {
    version: string;
  }
).version;

describe("RELEASES", () => {
  it("has the repository's version first, so a cut without its words fails here", () => {
    expect(RELEASES[0]?.version).toBe(repoVersion);
  });

  it("lists the version the release is with its changes, for What's new", () => {
    expect(RELEASES[0]?.changes?.length ?? 0).toBeGreaterThan(0);
  });

  it("is newest first, by version and by day", () => {
    for (let index = 1; index < RELEASES.length; index += 1) {
      const newer = RELEASES[index - 1];
      const older = RELEASES[index];
      if (newer === undefined || older === undefined) continue;
      expect(olderThan(older.version, newer.version)).toBe(true);
      expect(older.date <= newer.date).toBe(true);
    }
  });

  it("says each release in a sentence", () => {
    for (const release of RELEASES) {
      expect(release.line).toMatch(/^[A-Z].*\.$/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("olderThan", () => {
  it("compares by the numbers", () => {
    expect(olderThan("1.2.3", "1.2.4")).toBe(true);
    expect(olderThan("1.9.0", "1.10.0")).toBe(true);
    expect(olderThan("1.2.4", "1.2.4")).toBe(false);
    expect(olderThan("1.3.0", "1.2.9")).toBe(false);
    expect(olderThan("1.2", "1.2.1")).toBe(true);
  });

  it("never calls something that isn't numbers older", () => {
    expect(olderThan("dev", "1.2.4")).toBe(false);
    expect(olderThan("1.2.4", "next")).toBe(false);
  });
});

describe("computerBehind", () => {
  it("says what waits for an older computer, from the release's own words", () => {
    expect(computerBehind("1.2.4", { machine: "Mac mini", version: "1.2.3" }, "This iPhone")).toBe(
      "This iPhone has 1.2.4. Pause, No cap and See all need 1.2.4 on Mac mini too.",
    );
  });

  it("says some of it where the release names nothing", () => {
    expect(computerBehind("1.2.3", { machine: "Mac mini", version: "1.2.2" }, "This iPad")).toBe(
      "This iPad has 1.2.3. Some of what's new needs 1.2.3 on Mac mini too.",
    );
  });

  it("says nothing of a computer as new as the app, or newer", () => {
    expect(computerBehind("1.2.4", { machine: "Mac mini", version: "1.2.4" }, "This iPhone")).toBe(
      undefined,
    );
    expect(computerBehind("1.2.3", { machine: "Mac mini", version: "1.2.4" }, "This iPhone")).toBe(
      undefined,
    );
  });
});

describe("the build's words", () => {
  it("writes the capsule as TestFlight writes a build, and leaves out a number there isn't", () => {
    expect(buildCapsule("1.2.4", "202611111859", "b45d368")).toBe("1.2.4 (202611111859) · b45d368");
    expect(buildCapsule("1.2.4", undefined, "b45d368")).toBe("1.2.4 · b45d368");
  });

  it("copies the computer into the bug report line where it is known", () => {
    expect(
      bugReportLine({
        version: "1.2.4",
        build: "202611111859",
        commit: "b45d368",
        system: "iOS 26.1",
        computer: { machine: "Mac mini", version: "1.2.3" },
      }),
    ).toBe("Chips 1.2.4 (202611111859) · b45d368 · iOS 26.1 · Mac mini on 1.2.3");
    expect(
      bugReportLine({ version: "1.2.4", build: undefined, commit: "b45d368", system: "Mac" }),
    ).toBe("Chips 1.2.4 · b45d368 · Mac");
  });

  it("puts the device in the sentence under the name", () => {
    expect(aboutBlurb("this iPhone")).toBe(
      "Chips is a chat app for you and the AI agents you already run. It runs on your own computer, and this iPhone reaches it.",
    );
  });
});

describe("releaseDay", () => {
  it("says the day as people say it", () => {
    expect(releaseDay("2026-11-01")).toBe("1 November 2026");
    expect(releaseDay("2026-11-11")).toBe("11 November 2026");
    expect(releaseDay("soon")).toBe("soon");
  });

  it("finds a release by its version", () => {
    expect(releaseOf("1.1.0")?.date).toBe("2026-11-04");
    expect(releaseOf("9.9.9")).toBe(undefined);
    expect(releaseOf(undefined)).toBe(undefined);
  });
});
