import { readFileSync } from "node:fs";
import { type Connector, readConnectors } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import { isNoneAnswer, openWords, startAnswers, startWhere } from "./startSteps.js";

const card = (id: string, start?: Connector["start"]): Connector => ({
  id,
  name: id,
  line: `${id}'s line`,
  kind: "one-line",
  ...(start === undefined ? {} : { start }),
});

const step = (says: string, line?: string) => ({ says, ...(line === undefined ? {} : { line }) });

describe("startAnswers (ADR 0290)", () => {
  it("is nothing when no card has steps, so the gallery shows no row for them", () => {
    expect(startAnswers(undefined)).toEqual([]);
    expect(startAnswers([card("openclaw"), card("hermes")])).toEqual([]);
  });

  it("gives each card with steps in the docs' order, then the answer for somebody with none", () => {
    const cards = [
      card("openclaw"),
      card("claude", { answer: "I pay for Claude", suggest: "Claude.", steps: [step("Install.")] }),
      card("codex", {
        answer: "I use ChatGPT",
        suggest: "Codex.",
        steps: [step("Install.", "curl x | sh"), step("Sign in.", "codex login")],
        none: {
          answer: "Neither of those",
          suggest: "Make an account.",
          first: [{ says: "Make an account.", open: "https://chatgpt.com/" }],
        },
      }),
    ];
    const answers = startAnswers(cards);
    expect(answers.map((each) => [each.key, each.answer, each.card.id])).toEqual([
      ["claude", "I pay for Claude", "claude"],
      ["codex", "I use ChatGPT", "codex"],
      ["codex:none", "Neither of those", "codex"],
    ]);
    // Somebody with none makes the account first, then does the card's own steps.
    expect(answers[2]?.steps.map((each) => each.says)).toEqual([
      "Make an account.",
      "Install.",
      "Sign in.",
    ]);
    expect(answers.map(isNoneAnswer)).toEqual([false, false, true]);
  });

  it("reads the docs' own cards: Claude Code, Codex, then Neither, which leads to Codex", () => {
    const raw: unknown = JSON.parse(
      readFileSync(new URL("../../../apps/docs/public/connectors.json", import.meta.url), "utf8"),
    );
    const answers = startAnswers(readConnectors(raw));
    expect(answers.map((each) => each.key)).toEqual(["claude-code", "codex", "codex:none"]);
    for (const answer of answers) {
      // Every step is something to run or somewhere to go, never words alone.
      for (const each of answer.steps) expect(each.line ?? each.open).toBeDefined();
    }
    expect(answers[2]?.steps[0]?.open).toBe("https://chatgpt.com/");
  });
});

describe("the steps' words", () => {
  it("say where they run: Terminal on Chips for Mac, the agent's computer in a browser", () => {
    expect(startWhere(true)).toContain("press ⌘ Space and type Terminal");
    expect(startWhere(false)).toBe(
      "These steps run in a terminal on the computer you'll run the agent on.",
    );
  });

  it("name a step's page by its host", () => {
    expect(openWords("https://chatgpt.com/")).toBe("Open chatgpt.com");
    expect(openWords("https://www.example.org/a")).toBe("Open example.org");
    expect(openWords("not a url")).toBe("Open its page");
  });
});
