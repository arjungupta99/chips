/**
 * Chips on this Wi-Fi (ADR 0172): what answered is listed, a tap asks to join, the code is shown
 * while a person decides on the computer, and the phone is in once they allow it.
 */

import { askToJoin, type Device } from "@chipschat/core";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { canFind, findServers } from "./finder";
import { OnThisWifi } from "./OnThisWifi";

jest.mock("./finder", () => ({ canFind: jest.fn(), findServers: jest.fn() }));
jest.mock("./usePairing", () => ({ phoneName: () => "iPhone 17 Pro" }));
jest.mock("../device/storage", () => ({ deviceStorage: {} }));
jest.mock("@chipschat/core", () => ({ askToJoin: jest.fn() }));

const MINI = { name: "Arjun's Mac mini", url: "http://192.168.1.20:4431", workspaceId: "ws_1" };

afterEach(() => jest.clearAllMocks());

it("lists what answered, asks to join, shows the code, and is in once allowed", async () => {
  jest.mocked(canFind).mockReturnValue(true);
  jest.mocked(findServers).mockResolvedValue([MINI]);
  let allow: (device: Device) => void = () => undefined;
  jest.mocked(askToJoin).mockImplementation(async (input) => {
    input.onWaiting({ code: "ABC-234", expiresAt: 0 });
    return await new Promise<Device>((resolve) => {
      allow = resolve;
    });
  });
  const paired = jest.fn();
  await render(<OnThisWifi onPaired={paired} />);
  expect(await screen.findByText("Arjun's Mac mini")).toBeTruthy();
  expect(screen.getByText("192.168.1.20:4431")).toBeTruthy();

  await fireEvent.press(screen.getByTestId("found-0"));
  expect(jest.mocked(askToJoin).mock.calls[0]?.[0]).toMatchObject({
    serverUrl: "http://192.168.1.20:4431",
    name: "iPhone 17 Pro",
  });
  expect(await screen.findByTestId("join-code")).toHaveTextContent("ABC-234");
  expect(screen.getByText("Allow this phone on Arjun's Mac mini")).toBeTruthy();

  const device = { deviceId: "dev_phone" } as Device;
  await act(async () => allow(device));
  expect(paired).toHaveBeenCalledWith(device);
});

it("says so when nothing answered, and shows nothing on a build that can't look", async () => {
  jest.mocked(canFind).mockReturnValue(true);
  jest.mocked(findServers).mockResolvedValue([]);
  await render(<OnThisWifi onPaired={jest.fn()} />);
  expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();

  jest.mocked(canFind).mockReturnValue(false);
  await render(<OnThisWifi onPaired={jest.fn()} />);
  expect(screen.queryByTestId("on-this-wifi")).toBeNull();
});

it("asks first when a found server is not the one this phone holds, and asks at once when it is (SEC-8)", async () => {
  jest.mocked(canFind).mockReturnValue(true);
  jest.mocked(findServers).mockResolvedValue([MINI]);
  jest.mocked(askToJoin).mockImplementation(() => new Promise<Device>(() => undefined));

  // Paired elsewhere: the row says so and asks to join only on Switch.
  await render(
    <OnThisWifi
      held={{ serverUrl: "http://192.168.1.99:4431", workspace: "Home" }}
      onPaired={jest.fn()}
    />,
  );
  await fireEvent.press(await screen.findByTestId("found-0"));
  expect(askToJoin).not.toHaveBeenCalled();
  expect(screen.getByTestId("asking-elsewhere")).toBeTruthy();
  expect(screen.getByText(/not with Home on 192\.168\.1\.99:4431, where it is now/)).toBeTruthy();
  await fireEvent.press(screen.getByText("Switch to 192.168.1.20:4431"));
  expect(jest.mocked(askToJoin).mock.calls[0]?.[0]).toMatchObject({
    serverUrl: "http://192.168.1.20:4431",
  });
  jest.clearAllMocks();

  // Paired with this very server: nothing to ask.
  jest.mocked(canFind).mockReturnValue(true);
  jest.mocked(findServers).mockResolvedValue([MINI]);
  jest.mocked(askToJoin).mockImplementation(() => new Promise<Device>(() => undefined));
  await render(
    <OnThisWifi
      held={{ serverUrl: "http://192.168.1.20:4431/", workspace: "Home" }}
      onPaired={jest.fn()}
    />,
  );
  await fireEvent.press(await screen.findByTestId("found-0"));
  expect(askToJoin).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId("asking-elsewhere")).toBeNull();
});

it("looks again while nothing has answered, so a Chips allowed late still slides in", async () => {
  jest.useFakeTimers();
  try {
    jest.mocked(canFind).mockReturnValue(true);
    jest.mocked(findServers).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    jest.mocked(findServers).mockResolvedValue([MINI]);
    await render(<OnThisWifi foot onPaired={jest.fn()} />);
    await act(async () => undefined);
    expect(screen.queryByText("Arjun's Mac mini")).toBeNull();

    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.queryByText("Arjun's Mac mini")).toBeNull();
    await act(async () => jest.advanceTimersByTime(5000));
    expect(screen.getByText("Arjun's Mac mini")).toBeTruthy();
    expect(findServers).toHaveBeenCalledTimes(3);

    // Once something answered, it stops looking.
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(findServers).toHaveBeenCalledTimes(3);
  } finally {
    jest.useRealTimers();
  }
});
