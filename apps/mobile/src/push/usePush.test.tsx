/**
 * The launch's word to each workspace's server about this phone's pushes (ADRs 0157, 0197): every
 * workspace is told once, the muted ones too, since a withdraw that never reached a server is said
 * again only here (the stranger review, 4 November 2026).
 */

import type { Device } from "@chipschat/core";
import { renderHook, waitFor } from "@testing-library/react-native";
import { settleRegistration } from "./register";
import { usePushRefresh } from "./usePush";

jest.mock("./register", () => ({ settleRegistration: jest.fn(async () => undefined) }));
jest.mock("./queue", () => ({}));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../store/provider", () => ({ useSnapshot: jest.fn() }));
jest.mock("../workspaces/forward", () => ({ useBringForward: jest.fn() }));
jest.mock("../prefs", () => ({ SETTINGS: { push: "push" }, readSetting: async () => "on" }));

const settle = jest.mocked(settleRegistration);
const HOME = { deviceId: "dev_home" } as Device;
const MUTED = { deviceId: "dev_muted", muted: true } as Device;

afterEach(() => settle.mockClear());

it("tells every workspace, muted ones too, once a launch", async () => {
  const { rerender } = await renderHook(
    ({ devices }: { devices: readonly Device[] }) => usePushRefresh(devices),
    { initialProps: { devices: [HOME, MUTED] } },
  );
  await waitFor(() => expect(settle).toHaveBeenCalledTimes(2));
  expect(settle.mock.calls).toEqual([
    [HOME, "on"],
    [MUTED, "on"],
  ]);
  // The same workspaces again, as a snapshot moves: nothing more is said.
  await rerender({ devices: [HOME, { ...MUTED }] });
  const later = { deviceId: "dev_later" } as Device;
  await rerender({ devices: [HOME, MUTED, later] });
  await waitFor(() => expect(settle).toHaveBeenCalledTimes(3));
  expect(settle).toHaveBeenLastCalledWith(later, "on");
});

it("lets one server out of reach stop none of the others", async () => {
  settle.mockRejectedValueOnce(new Error("no route to host"));
  await renderHook(() => usePushRefresh([MUTED, HOME]));
  await waitFor(() => expect(settle).toHaveBeenCalledTimes(2));
});
