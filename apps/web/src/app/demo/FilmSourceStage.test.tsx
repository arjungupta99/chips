/**
 * The render mode's stage (ADR 0217): the film starts as the page comes up, the shell is left to
 * what the render does on it, the page marks the chapter for `pnpm film`, and the lock screen is a
 * picture over the shell whose own Approve answers through the store.
 */

import type { DemoState } from "@chipschat/core";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilmSourceStage } from "./FilmSourceStage.tsx";
import { heldPlayer, stateAt } from "./testing.ts";

function filmed(start: DemoState) {
  const player = heldPlayer(start);
  const store = { resolveApproval: vi.fn() };
  render(
    <FilmSourceStage player={player} store={store}>
      <div data-testid="shell" />
    </FilmSourceStage>,
  );
  const set = (state: DemoState) => act(() => player.set(state));
  return { player, store, set };
}

describe("the render mode's stage", () => {
  it("starts the film, and draws the shell as it is", () => {
    const { player, set } = filmed(stateAt("spaces"));
    expect(player.calls.play).toBe(1);
    expect(screen.getByTestId("shell")).toBeDefined();
    set(stateAt("agents"));
    expect(player.calls.play).toBe(1);
    expect(screen.getByTestId("shell")).toBeDefined();
  });

  it("draws the lock screen over the shell, and its Approve answers through the store", () => {
    const lockScreen = {
      who: "Milo",
      room: "Birthday dinner",
      question: "Send Theo's invite card to the 11 people in Family?",
      spaceId: "spc_1",
      runId: "run_1",
      approvalId: "apr_2",
      answered: false,
    };
    const { store, set } = filmed(stateAt("lock", { lockScreen }));
    const lock = screen.getByTestId("demo-lock");
    expect(lock.textContent).toContain("Milo · Birthday dinner");
    expect(lock.textContent).toContain(lockScreen.question);
    fireEvent.click(within(lock).getByRole("button", { name: "Approve" }));
    expect(store.resolveApproval).toHaveBeenCalledWith({
      spaceId: "spc_1",
      runId: "run_1",
      approvalId: "apr_2",
      decision: "approved",
    });
    set(stateAt("lock", { lockScreen: { ...lockScreen, answered: true } }));
    expect(screen.getByTestId("demo-lock-done").textContent).toContain("Approved");
    set(stateAt("teamwork"));
    expect(screen.queryByTestId("demo-lock")).toBeNull();
  });
});
