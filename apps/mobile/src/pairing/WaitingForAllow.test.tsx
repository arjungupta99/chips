/**
 * Waiting for an Allow (ADR 0232), over the whole app: nothing until a link asks; then whom for,
 * the six digits and how long; Stop waiting ends it.
 */

import { waitForAllow } from "@chipschat/core";
import { act, render as renderBare, screen, userEvent } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WaitingForAllow } from "./WaitingForAllow";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

describe("waiting for an Allow", () => {
  it("shows nothing until a link asks, then the six digits, and goes on Stop waiting", async () => {
    await render(<WaitingForAllow />);
    expect(screen.queryByTestId("waiting-for-allow")).toBeNull();

    const wait = waitForAllow("invite", { inviter: "Arjun", place: "Japan trip" });
    await act(async () => {
      wait.onWaiting({ code: "742913", expiresAt: Date.now() + 600_000 });
    });
    expect(screen.getByText("Waiting for Arjun")).toBeTruthy();
    expect(screen.getByTestId("waiting-code")).toHaveTextContent("742 913");
    expect(screen.getByText(/Chips waits 10 minutes\.$/)).toBeTruthy();

    await userEvent.press(screen.getByText("Stop waiting"));
    expect(wait.signal?.aborted).toBe(true);
    expect(screen.queryByTestId("waiting-for-allow")).toBeNull();
  });
});
