/**
 * The phone's page for somebody with nothing set up yet (ADR 0290's addendum): the setup page's
 * link to copy or send, then Scan a QR code and Look around.
 */

import { render as renderBare, screen, userEvent, waitFor } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import type { ReactElement, ReactNode } from "react";
import { Share } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StartOnComputer } from "./StartOnComputer";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

function page() {
  const ways = { onBack: jest.fn(), onScan: jest.fn(), onLookAround: jest.fn() };
  return { ways, element: <StartOnComputer {...ways} /> };
}

it("says Chips starts on a computer, and copies the setup page's link", async () => {
  const { element } = page();
  const user = userEvent.setup();
  await render(element);
  expect(screen.getByRole("header", { name: "Chips starts on your computer" })).toBeOnTheScreen();
  expect(screen.getByTestId("start-link")).toHaveTextContent("chipschat.ai/setup");
  await user.press(screen.getByRole("button", { name: "Copy chipschat.ai/setup" }));
  await waitFor(() =>
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith("https://chipschat.ai/setup/"),
  );
  expect(await screen.findByRole("button", { name: "Copied" })).toBeOnTheScreen();
});

it("sends the link with the share sheet", async () => {
  const shared = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
  const { element } = page();
  const user = userEvent.setup();
  await render(element);
  await user.press(screen.getByRole("button", { name: "Send the link to myself" }));
  expect(shared).toHaveBeenCalledWith({ message: "https://chipschat.ai/setup/" });
  shared.mockRestore();
});

it("scans, looks around and goes back", async () => {
  const { ways, element } = page();
  const user = userEvent.setup();
  await render(element);
  await user.press(screen.getByRole("button", { name: "Scan a QR code" }));
  await user.press(screen.getByRole("button", { name: "Look around while you wait" }));
  await user.press(screen.getByRole("button", { name: "Back" }));
  expect(ways.onScan).toHaveBeenCalledTimes(1);
  expect(ways.onLookAround).toHaveBeenCalledTimes(1);
  expect(ways.onBack).toHaveBeenCalledTimes(1);
});
