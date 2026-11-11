/**
 * The written steps following along on Chips for Mac (ADR 0290's addendum, option B): each step
 * ticks itself off as Chips sees it done, the one under way says Chips is watching, a step it can't
 * see takes I've done this, and when the last ticks off the page goes on to Connect, starting it.
 * A browser, which can't look, shows the written steps as they are.
 */

import { startAnswers } from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const programsHere = vi.fn<(names: readonly string[]) => Promise<string[] | undefined>>();
const signedInHere = vi.fn<(card: string) => Promise<boolean | undefined>>();
let inMac = true;

vi.mock("../native.ts", async (original) => ({
  ...(await original<typeof import("../native.ts")>()),
  desktop: async () => (inMac ? { programsHere, signedInHere } : undefined),
}));

const CODEX: Connector = {
  id: "codex",
  name: "Codex",
  line: "OpenAI's coding agent",
  kind: "one-line",
  command: "chips connect codex '{link}'",
  program: "codex",
  start: {
    answer: "I use ChatGPT",
    suggest: "We'd suggest Codex.",
    steps: [
      { says: "Install Codex.", line: "curl -fsSL x | sh", done: { program: "codex" } },
      { says: "Sign in.", line: "codex login", done: { signedIn: true } },
    ],
    none: {
      answer: "Neither of those",
      suggest: "Make a ChatGPT account.",
      first: [{ says: "Make a ChatGPT account.", open: "https://chatgpt.com/" }],
    },
  },
};

const [CODEX_ANSWER, NONE_ANSWER] = startAnswers([CODEX]);

async function guide(answer = CODEX_ANSWER, onMac = true) {
  const { StartGuide } = await import("./StartSteps.tsx");
  const onConnect = vi.fn();
  if (answer === undefined) throw new Error("No answer.");
  render(
    <StartGuide
      titleId="t"
      answer={answer}
      onMac={onMac}
      onConnect={onConnect}
      onBack={() => undefined}
    />,
  );
  return { onConnect };
}

const states = () =>
  Array.from(screen.getByTestId("start-guide").querySelectorAll("ol > li"), (li) =>
    li.getAttribute("data-state"),
  );

/** The page looks again, as it does every few seconds and when the window comes back. */
const lookAgain = () => act(() => window.dispatchEvent(new Event("focus")));

beforeEach(() => {
  inMac = true;
  programsHere.mockReset();
  signedInHere.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the written steps following along on Chips for Mac", () => {
  it("watches the first step, ticks each off as Chips sees it, then goes on to Connect and starts it", async () => {
    programsHere.mockResolvedValue([]);
    signedInHere.mockResolvedValue(false);
    const { onConnect } = await guide();
    await waitFor(() => expect(states()).toEqual(["now", "later"]));
    expect(screen.getByTestId("start-watching-0").textContent).toBe("Chips is watching for this");
    expect(programsHere).toHaveBeenCalledWith(["codex"]);
    expect(signedInHere).toHaveBeenCalledWith("codex");

    programsHere.mockResolvedValue(["codex"]);
    await lookAgain();
    await waitFor(() => expect(states()).toEqual(["done", "now"]));
    expect(screen.getByText("Chips sees it on this Mac")).toBeTruthy();

    signedInHere.mockResolvedValue(true);
    await lookAgain();
    await waitFor(() => expect(states()).toEqual(["done", "done"]));
    expect(screen.getByTestId("start-connect").textContent).toBe("All done. Connecting…");
    await waitFor(() => expect(onConnect).toHaveBeenCalledWith(CODEX, true), { timeout: 2000 });
  });

  it("takes I've done this for a step it can't see, and counts it done once a later one is", async () => {
    programsHere.mockResolvedValue([]);
    signedInHere.mockResolvedValue(false);
    await guide(NONE_ANSWER);
    await waitFor(() => expect(states()).toEqual(["now", "later", "later"]));
    fireEvent.click(screen.getByTestId("start-mark-0"));
    expect(states()).toEqual(["done", "now", "later"]);
  });

  it("waits for Connect when every step was done at the first look, as on coming Back", async () => {
    programsHere.mockResolvedValue(["codex"]);
    signedInHere.mockResolvedValue(true);
    const { onConnect } = await guide();
    await waitFor(() => expect(states()).toEqual(["done", "done"]));
    await act(() => new Promise((done) => setTimeout(done, 1200)));
    expect(onConnect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("start-connect"));
    expect(onConnect).toHaveBeenCalledWith(CODEX);
  });

  it("shows the written steps as they are in a browser, which can't look", async () => {
    inMac = false;
    await guide(CODEX_ANSWER, false);
    await act(() => new Promise((done) => setTimeout(done, 0)));
    expect(states()).toEqual([null, null]);
    expect(screen.queryByText("Chips is watching for this")).toBeNull();
  });
});
