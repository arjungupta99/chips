/**
 * The setup card's rail (ADR 0170) never draws the card on a device that was set up before whose
 * the card is had been read: the directory comes in after the server and the devices have answered.
 */

import type { SetupStep } from "@chipschat/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SetupRail } from "./SetupCard.tsx";

const ALL: SetupStep[] = [
  { id: "running", title: "Chips is running", done: true },
  { id: "computer", title: "This Mac", done: true },
  { id: "hello", title: "An agent said hello", done: true },
  { id: "phone", title: "Your phone", done: true },
  { id: "notify", title: "Notifications", done: true },
  { id: "away", title: "Away from home", done: true },
];
const rail = (theirs: boolean, steps: readonly SetupStep[]) => (
  <SetupRail theirs={theirs} steps={steps} actions={{}} onHide={() => {}} />
);

describe("the setup rail", () => {
  it("never draws the card when whose it is comes in after everything is done", () => {
    const hello = ALL.map((step) => (step.id === "hello" ? { ...step, done: false } : step));
    const { rerender } = render(rail(false, hello));
    rerender(rail(true, ALL));
    expect(screen.queryByTestId("setup-card")).toBeNull();
  });

  it("says set up when the last step is done while the card is on screen", async () => {
    const away = ALL.map((step) => (step.id === "away" ? { ...step, done: false } : step));
    const { rerender } = render(rail(true, away));
    expect((await screen.findByTestId("setup-count")).textContent).toBe("5 of 6");
    rerender(rail(true, ALL));
    expect(await screen.findByText("You're set up")).toBeTruthy();
  });
});
