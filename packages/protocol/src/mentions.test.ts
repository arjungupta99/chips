import { describe, expect, it } from "vitest";
import {
  handlesIn,
  handlesOf,
  mentionPattern,
  mentionsEveryone,
  resolveMentions,
} from "./mentions.js";

const LEDGER = { id: "hrn_ledger", displayName: "Ledger" };
const SCOUT = { id: "hrn_scout", displayName: "Scout · mini" };
const ARJUN = { id: "usr_arjun", displayName: "Arjun Gupta" };

describe("an @handle", () => {
  it("is found at the start of the text or after a space, and not inside a word", () => {
    expect(handlesIn("@Ledger are the quotes in line?")).toEqual(["ledger"]);
    expect(handlesIn("ask @Ledger")).toEqual(["ledger"]);
    expect(handlesIn("mail arjun@example.com")).toEqual([]);
  });

  it("does not swallow the full stop that ends a sentence", () => {
    expect(handlesIn("Over to @Ledger.")).toEqual(["ledger"]);
    expect(handlesIn("See @v1.2 and @a-b_c")).toEqual(["v1.2", "a-b_c"]);
  });

  it("names each handle once, lowercased, in order", () => {
    expect(handlesIn("@Scout then @Ledger then @scout again")).toEqual(["scout", "ledger"]);
  });

  it("is found after Markdown's emphasis, a parenthesis or a quotation opens (AW-20)", () => {
    expect(handlesIn("1. **@OpenClaw3:** find the renderings")).toEqual(["openclaw3"]);
    expect(handlesIn("*@Ledger* and _@Scout_ and __@arjun__")).toEqual([
      "ledger",
      "scout",
      "arjun",
    ]);
    expect(handlesIn('(@Ledger) and "@Scout" and \u201C@arjun\u201D')).toEqual([
      "ledger",
      "scout",
      "arjun",
    ]);
    expect(handlesIn("mail arjun@example.com or first_@example.com")).toEqual([]);
  });

  it("does not end in an underscore, so italics close round it", () => {
    expect(handlesIn("Over to _@Ledger_.")).toEqual(["ledger"]);
    expect(handlesIn("@a-b_c")).toEqual(["a-b_c"]);
  });

  it("is what the inline parser matches", () => {
    const match = mentionPattern().exec("Thanks @Ledger.");
    expect(match?.[1]).toBe("Ledger");
    expect(mentionPattern().exec("x@y")).toBeNull();
  });
});

describe("the handles a participant answers to", () => {
  it("are the name without spaces and its first word", () => {
    expect(handlesOf("Arjun Gupta")).toEqual(["arjungupta", "arjun"]);
    expect(handlesOf("Scout · mini")).toEqual(["scout·mini", "scout"]);
  });

  it("is one handle for a one-word name, and none for no name", () => {
    expect(handlesOf("Ledger")).toEqual(["ledger"]);
    expect(handlesOf("  ")).toEqual([]);
  });

  it("is never all, which names every harness (ADR 0081)", () => {
    expect(handlesOf("All")).toEqual([]);
    expect(handlesOf("All Hands")).toEqual(["allhands"]);
  });
});

describe("resolving mentions", () => {
  it("turns handles into ids, in the order the text names them", () => {
    expect(
      resolveMentions("@Ledger and @arjun, then @scout — and @Ledger again", [
        LEDGER,
        SCOUT,
        ARJUN,
      ]),
    ).toEqual([LEDGER.id, ARJUN.id, SCOUT.id]);
  });

  it("leaves a handle nobody answers to alone", () => {
    expect(resolveMentions("@nobody here", [LEDGER])).toEqual([]);
  });

  it("gives a whole name to its owner over anybody's first word, in either order (ADR 0091)", () => {
    const other = { id: "usr_other", displayName: "Ledger Smith" };
    expect(resolveMentions("@ledger", [other, LEDGER])).toEqual([LEDGER.id]);
    expect(resolveMentions("@ledger", [LEDGER, other])).toEqual([LEDGER.id]);
    expect(resolveMentions("@ledgersmith", [other, LEDGER])).toEqual([other.id]);
  });

  it("tells OpenClaw from OpenClaw 2, whichever joined first", () => {
    const one = { id: "agt_one", displayName: "OpenClaw" };
    const two = { id: "agt_two", displayName: "OpenClaw 2" };
    for (const members of [
      [one, two],
      [two, one],
    ]) {
      expect(resolveMentions("@OpenClaw", members)).toEqual([one.id]);
      expect(resolveMentions("@OpenClaw2", members)).toEqual([two.id]);
    }
  });

  it("names nobody by a first word two participants share", () => {
    const chess = { id: "agt_chess", displayName: "Chess Game" };
    const chess2 = { id: "agt_chess2", displayName: "Chess Game 2" };
    expect(resolveMentions("@chess over to you", [chess, chess2])).toEqual([]);
    expect(resolveMentions("@ChessGame over to you", [chess, chess2])).toEqual([chess.id]);
    expect(resolveMentions("@ChessGame2", [chess2, chess])).toEqual([chess2.id]);
  });

  it("still names a person by a first word nobody else has", () => {
    expect(resolveMentions("@arjun", [ARJUN, LEDGER])).toEqual([ARJUN.id]);
  });

  it("gives a name two participants share to the first given, from before names were numbered", () => {
    const first = { id: "agt_first", displayName: "OpenClaw" };
    const second = { id: "agt_second", displayName: "OpenClaw" };
    expect(resolveMentions("@openclaw", [first, second])).toEqual([first.id]);
  });
});

describe("@all", () => {
  it("is said at the start of the text or after a space, in any case", () => {
    expect(mentionsEveryone("@all hi")).toBe(true);
    expect(mentionsEveryone("hi @ALL.")).toBe(true);
    expect(mentionsEveryone("mail all@example.com")).toBe(false);
    expect(mentionsEveryone("@allhands")).toBe(false);
  });

  it("reaches nobody by name, not even a participant called All", () => {
    expect(resolveMentions("@all hi", [{ id: "usr_all", displayName: "All" }, LEDGER])).toEqual([]);
  });
});

describe("a harness's name (ADR 0087's addendum)", () => {
  const people = [{ id: "usr_arjun", displayName: "Arjun" }];

  it("names the agent it is `also` known by", () => {
    const agents = [{ id: "agt_hello", displayName: "Hello", also: ["Jacobian"] }];
    expect(resolveMentions("@Jacobian what did OpenClaw say?", [...people, ...agents])).toEqual([
      "agt_hello",
    ]);
    expect(resolveMentions("@Hello hi", [...people, ...agents])).toEqual(["agt_hello"]);
  });

  it("gives way to anybody who goes by it", () => {
    const participants = [
      { id: "agt_hello", displayName: "Hello", also: ["Scout"] },
      { id: "agt_scout", displayName: "Scout" },
    ];
    expect(resolveMentions("@Scout", participants)).toEqual(["agt_scout"]);
  });

  it("does not take a first word two participants share", () => {
    const participants = [
      { id: "agt_one", displayName: "Open Claw" },
      { id: "agt_two", displayName: "Open Sesame", also: ["Open"] },
    ];
    expect(resolveMentions("@open", participants)).toEqual([]);
  });
});
