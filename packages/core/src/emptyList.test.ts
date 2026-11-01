import { describe, expect, it } from "vitest";
import { agentsLook, emptyList, patientEmpty, patientLook } from "./emptyList.js";

describe("what a list with no rooms says", () => {
  it("says nothing while the cache is still being read, whatever else is true", () => {
    expect(emptyList({ connection: "open", readingCache: true, awaiting: 0 })).toBe("reading");
  });

  it("says there are none only once a hello has listed none", () => {
    expect(emptyList({ connection: "open", awaiting: 0 })).toBe("none");
    // The server said so before the socket went: still none, and the bar says the rest.
    expect(emptyList({ connection: "closed", awaiting: 0 })).toBe("none");
  });

  it("says rooms are coming while the ones a hello listed are on their way", () => {
    expect(emptyList({ connection: "open", awaiting: 3 })).toBe("fetching");
  });

  it("says what the connection is doing until the server has said", () => {
    expect(emptyList({ connection: "connecting" })).toBe("connecting");
    // Open, and the hello a moment behind it.
    expect(emptyList({ connection: "open" })).toBe("connecting");
    expect(emptyList({ connection: "closed" })).toBe("closed");
    expect(emptyList({ connection: "asleep" })).toBe("asleep");
    expect(emptyList({ connection: "rejected" })).toBe("rejected");
  });

  it("says the reader was removed whatever else is true, rooms or none (ADR 0160)", () => {
    expect(emptyList({ connection: "removed", awaiting: 0 })).toBe("removed");
    expect(emptyList({ connection: "removed", awaiting: 4 })).toBe("removed");
  });

  it("says why it cannot fetch the rooms a hello listed once the socket has gone", () => {
    expect(emptyList({ connection: "closed", awaiting: 2 })).toBe("closed");
  });
});

describe("what the Agents tab shows", () => {
  it("shows nothing while the cache is still being read", () => {
    expect(agentsLook({ connection: "open", readingCache: true, directoryFrom: "cache" })).toBe(
      "reading",
    );
  });

  it("lists the directory once the server has said, now or as this device kept it", () => {
    expect(agentsLook({ connection: "open", directoryFrom: "server" })).toBe("listed");
    // Kept from the last answer: listed offline too, and the bar's mark says the rest.
    expect(agentsLook({ connection: "closed", directoryFrom: "cache" })).toBe("listed");
    expect(agentsLook({ connection: "asleep", directoryFrom: "cache" })).toBe("listed");
    // A read that failed over a kept list leaves the list.
    expect(agentsLook({ connection: "open", directoryFrom: "cache", directoryFailed: true })).toBe(
      "listed",
    );
  });

  it("is fetching, never empty, while this device has never had the server's word", () => {
    expect(agentsLook({ connection: "connecting" })).toBe("fetching");
    expect(agentsLook({ connection: "open" })).toBe("fetching");
    // The launch's read failed before the socket had a way through: the hello reads it again.
    expect(agentsLook({ connection: "connecting", directoryFailed: true })).toBe("fetching");
  });

  it("says the read failed only when the server is there to ask again", () => {
    expect(agentsLook({ connection: "open", directoryFailed: true })).toBe("failed");
  });

  it("says why it cannot ask when the server cannot be reached", () => {
    expect(agentsLook({ connection: "closed" })).toBe("closed");
    expect(agentsLook({ connection: "asleep", directoryFailed: true })).toBe("asleep");
    expect(agentsLook({ connection: "rejected" })).toBe("rejected");
  });

  it("says the reader was removed whatever the directory holds (ADR 0160)", () => {
    expect(agentsLook({ connection: "removed", directoryFrom: "server" })).toBe("removed");
    expect(agentsLook({ connection: "removed" })).toBe("removed");
  });
});

describe("the Agents tab's patience with trouble on its first load", () => {
  it("stands its blank agents through trouble that has not lasted", () => {
    expect(patientLook("closed", "closed", false)).toBe("fetching");
    expect(patientLook("asleep", "asleep", false)).toBe("fetching");
    expect(patientLook("failed", "open", false)).toBe("fetching");
  });

  it("says trouble that has lasted", () => {
    expect(patientLook("closed", "closed", true)).toBe("closed");
    expect(patientLook("failed", "open", true)).toBe("failed");
  });

  it("says the server is being reached when it tries again after trouble was said", () => {
    expect(patientLook("fetching", "connecting", true)).toBe("connecting");
    // Open, and the list on its way: the blank agents again, not "reaching".
    expect(patientLook("fetching", "open", true)).toBe("fetching");
    expect(patientLook("fetching", "connecting", false)).toBe("fetching");
  });

  it("is never patient with what waiting cannot change, nor with the list", () => {
    expect(patientLook("rejected", "rejected", false)).toBe("rejected");
    expect(patientLook("removed", "removed", false)).toBe("removed");
    expect(patientLook("listed", "closed", true)).toBe("listed");
    expect(patientLook("reading", "connecting", false)).toBe("reading");
  });
});

describe("the Spaces list's patience with trouble while it has no room to show", () => {
  it("says the server is being reached through trouble that has not lasted", () => {
    expect(patientEmpty("closed", false)).toBe("connecting");
    expect(patientEmpty("asleep", false)).toBe("connecting");
  });

  it("says trouble that has lasted", () => {
    expect(patientEmpty("closed", true)).toBe("closed");
    expect(patientEmpty("asleep", true)).toBe("asleep");
  });

  it("is never patient with what waiting cannot change, nor with the server's word", () => {
    expect(patientEmpty("rejected", false)).toBe("rejected");
    expect(patientEmpty("removed", false)).toBe("removed");
    expect(patientEmpty("none", false)).toBe("none");
    expect(patientEmpty("fetching", false)).toBe("fetching");
    expect(patientEmpty("reading", false)).toBe("reading");
    expect(patientEmpty("connecting", true)).toBe("connecting");
  });
});
