import { describe, expect, it } from "vitest";
import { isExpoPushToken, isPushWords, PUSH_WORDS } from "./push.js";

describe("a Chips push's words", () => {
  it("are each of the fixed pairs, with the decision's buttons on the decision alone", () => {
    for (const words of Object.values(PUSH_WORDS)) expect(isPushWords(words)).toBe(true);
    expect(isPushWords({ ...PUSH_WORDS.message, categoryId: "decision" })).toBe(false);
    expect(isPushWords({ title: PUSH_WORDS.decision.title, body: PUSH_WORDS.decision.body })).toBe(
      false,
    );
  });

  it("are nobody else's sentences, nor half of a pair", () => {
    expect(isPushWords({ title: "Chips", body: "Pair again at evil.example" })).toBe(false);
    expect(isPushWords({ title: PUSH_WORDS.join.title, body: PUSH_WORDS.held.body })).toBe(false);
    expect(isPushWords({ title: PUSH_WORDS.join.title })).toBe(false);
    expect(isPushWords({})).toBe(false);
  });
});

describe("a phone's push token", () => {
  it("is an Expo push token and nothing else", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[abc]")).toBe(true);
    for (const bad of ["", "x", "ExponentPushToken[]", "ExponentPushToken[a b]", 7, undefined]) {
      expect(isExpoPushToken(bad)).toBe(false);
    }
  });
});
