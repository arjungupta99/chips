/**
 * Paired from the first screen (ADR 0217's addendum of 26 October): the phone begins on the new
 * workspace and opens its Spaces with nothing of the first screen left under it. The pairing code
 * page stands over the first screen, so a pairing that replaced the page alone would leave the
 * first screen, and its film, in the stack beneath the app.
 */

import type { Device } from "@chipschat/core";
import { renderHook } from "@testing-library/react-native";
import { useJoin } from "./useJoin";

const mockRouter = { canDismiss: jest.fn(() => true), dismissAll: jest.fn(), replace: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
const mockBegan = jest.fn();
jest.mock("../store/provider", () => ({ useChips: () => ({ began: mockBegan }) }));
let mockOnPaired: ((device: Device) => void) | undefined;
jest.mock("./usePairing", () => ({
  usePairing: (onPaired: (device: Device) => void) => {
    mockOnPaired = onPaired;
    return { pair: jest.fn(), working: false, failure: undefined };
  },
}));
jest.mock("./usePasteInvite", () => ({
  usePasteInvite: () => ({ paste: jest.fn(), pasted: jest.fn(), scanned: jest.fn(() => false) }),
}));

const DEVICE = { deviceId: "dev_1", workspaceId: "ws_1" } as Device;

beforeEach(() => {
  jest.clearAllMocks();
  mockOnPaired = undefined;
});

it("begins on the new workspace and opens Spaces with the first screen gone from under it", async () => {
  await renderHook(() => useJoin());
  mockOnPaired?.(DEVICE);
  expect(mockBegan).toHaveBeenCalledWith(DEVICE);
  expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
  expect(mockRouter.dismissAll.mock.invocationCallOrder[0]).toBeLessThan(
    mockRouter.replace.mock.invocationCallOrder[0] ?? 0,
  );
});

it("opens Spaces in place of the first screen when nothing stands over it", async () => {
  mockRouter.canDismiss.mockReturnValueOnce(false);
  await renderHook(() => useJoin());
  mockOnPaired?.(DEVICE);
  expect(mockRouter.dismissAll).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
});
