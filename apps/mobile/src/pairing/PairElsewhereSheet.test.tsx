/**
 * The sheet a pairing link for another server opens (SEC-8): both servers named, Switch pairs,
 * Stay does not, and a pairing that failed says why.
 */

import { fireEvent, render as renderBare, screen } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type ElsewhereAsk, PairElsewhereSheet } from "./PairElsewhereSheet";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

function ask(over: Partial<ElsewhereAsk> = {}): ElsewhereAsk {
  return {
    server: "http://192.168.1.99:4431",
    heldServer: "http://192.168.1.20:4431",
    workspace: "Home",
    device: "this phone",
    busy: false,
    failed: undefined,
    confirm: jest.fn(),
    dismiss: jest.fn(),
    ...over,
  };
}

it("names both servers, and pairs only on Switch", async () => {
  const asking = ask();
  await render(<PairElsewhereSheet ask={asking} />);
  expect(screen.getByText("Another Chips?")).toBeTruthy();
  expect(screen.getByText(/not with Home on 192\.168\.1\.20:4431, where it is now/)).toBeTruthy();
  fireEvent.press(screen.getByText("Switch to 192.168.1.99:4431"));
  expect(asking.confirm).toHaveBeenCalledTimes(1);
  expect(asking.dismiss).not.toHaveBeenCalled();
});

it("offers to stay, and says why a pairing failed", async () => {
  const asking = ask({ failed: "That pairing code is not valid." });
  await render(<PairElsewhereSheet ask={asking} />);
  expect(screen.getByText("That pairing code is not valid.")).toBeTruthy();
  expect(screen.getByText("Stay in Home")).toBeTruthy();
  fireEvent.press(screen.getByText("Stay in Home"));
  expect(asking.confirm).not.toHaveBeenCalled();
});
