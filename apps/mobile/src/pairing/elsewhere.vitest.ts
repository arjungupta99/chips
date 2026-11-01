import { describe, expect, it } from "vitest";
import { elsewhereAsking, hostOf, isElsewhere } from "./elsewhere";

describe("a pairing that names another server (SEC-8)", () => {
  it("is one whose host is not the held server's, however either is spelt", () => {
    expect(isElsewhere("http://192.168.1.20:4431", "http://192.168.1.20:4431/")).toBe(false);
    expect(isElsewhere("http://Mini.local:4431", "http://mini.local:4431")).toBe(false);
    expect(isElsewhere("http://192.168.1.20:4431", "http://192.168.1.99:4431")).toBe(true);
    // A device paired before there was anywhere else to be holds no server, and nothing is elsewhere.
    expect(isElsewhere(undefined, "http://192.168.1.99:4431")).toBe(false);
    expect(isElsewhere("", "http://192.168.1.99:4431")).toBe(false);
  });

  it("names both servers in the question, and the switch in the answer", () => {
    const asking = elsewhereAsking(
      {
        server: "http://192.168.1.99:4431",
        heldServer: "http://192.168.1.20:4431",
        workspace: "Home",
        device: "this phone",
      },
      "link",
    );
    expect(asking.title).toBe("Another Chips?");
    expect(asking.body).toBe(
      "This link pairs this phone with Chips at 192.168.1.99:4431, not with Home on 192.168.1.20:4431, where it is now. This phone would keep Home, switch to 192.168.1.99:4431, and show whatever it says is yours.",
    );
    expect(asking.confirm).toBe("Switch to 192.168.1.99:4431");
    expect(asking.note).toContain("a reason to stop here");
  });

  it("says what a found server calls itself, and how the pairing would come about", () => {
    const asking = elsewhereAsking(
      {
        server: "http://192.168.1.99:4431",
        name: "A stranger's Mac",
        heldServer: undefined,
        workspace: "Home",
        device: "this iPad",
      },
      "wifi",
    );
    expect(asking.body).toMatch(
      /^Asking to join pairs this iPad with Chips at A stranger's Mac \(192\.168\.1\.99:4431\), not with Home, where it is now\./,
    );
    expect(hostOf("https://Chips.Example/x")).toBe("chips.example");
  });
});
