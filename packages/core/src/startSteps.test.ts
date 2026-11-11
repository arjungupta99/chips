import { readFileSync } from "node:fs";
import { type Connector, readConnectors } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  followSteps,
  isNoneAnswer,
  openWords,
  startAnswers,
  startWhere,
  stepPrograms,
  stepsSignIn,
} from "./startSteps.js";

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

describe("followSteps: the steps ticking themselves off on Chips for Mac (option B)", () => {
  const account = { says: "Make a ChatGPT account.", open: "https://chatgpt.com/" };
  const install = { says: "Install Codex.", line: "curl x | sh", done: { program: "codex" } };
  const signIn = { says: "Sign in.", line: "codex login", done: { signedIn: true as const } };
  const seen = (programs: string[], signedIn?: boolean, marked: number[] = []) => ({
    programs: new Set(programs),
    signedIn,
    marked: new Set(marked),
  });
  const states = (result: ReturnType<typeof followSteps>) => result.steps.map((one) => one.state);

  it("watches the first step not done, and keeps the rest waiting", () => {
    const followed = followSteps([install, signIn], seen([]));
    expect(states(followed)).toEqual(["now", "later"]);
    expect(followed.steps.map((one) => one.watched)).toEqual([true, true]);
    expect(followed.ready).toBe(false);
  });

  it("ticks a program off once it's on this Mac, and the sign-in once the agent says so", () => {
    const installed = followSteps([install, signIn], seen(["codex"], false));
    expect(states(installed)).toEqual(["done", "now"]);
    expect(installed.steps[0]?.saw).toBe("Chips sees it on this Mac");
    const signed = followSteps([install, signIn], seen(["codex"], true));
    expect(states(signed)).toEqual(["done", "done"]);
    expect(signed.steps[1]?.saw).toBe("Signed in");
    expect(signed.ready).toBe(true);
  });

  it("counts a step it can't see done when the person says so, or once a step after it is", () => {
    expect(states(followSteps([account, install, signIn], seen([])))).toEqual([
      "now",
      "later",
      "later",
    ]);
    expect(states(followSteps([account, install, signIn], seen([], undefined, [0])))).toEqual([
      "done",
      "now",
      "later",
    ]);
    // Codex is on this Mac: whoever installed it got past making an account.
    expect(states(followSteps([account, install, signIn], seen(["codex"])))).toEqual([
      "done",
      "done",
      "now",
    ]);
  });

  it("is never ready by itself where it can see none of the steps", () => {
    expect(followSteps([account], seen([], undefined, [0])).ready).toBe(false);
  });

  it("says which programs to look for and whether to ask about the sign-in", () => {
    expect(stepPrograms([account, install, signIn, install])).toEqual(["codex"]);
    expect(stepsSignIn([account, install])).toBe(false);
    expect(stepsSignIn([install, signIn])).toBe(true);
  });
});
