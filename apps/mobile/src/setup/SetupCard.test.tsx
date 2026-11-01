/**
 * The phone's setup card (ADR 0170): the six steps as core reads them, the things to do beside
 * those left, and the × that puts it away; and the rail, which never draws it on a phone that was
 * set up before its steps were read.
 */

import {
  buildModel,
  type Device,
  type SetupStep,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { readSetting } from "../prefs";
import { pushIsOn } from "../push/turnOn";
import { type Setup, SetupCard, SetupRail, useSetup } from "./SetupCard";

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../push/turnOn", () => ({ pushIsOn: jest.fn(), turnOnPush: jest.fn() }));
jest.mock("../prefs", () => ({
  SETTINGS: { setupHidden: "setup.hidden" },
  readSetting: jest.fn(),
  writeSetting: jest.fn(),
}));

const STEPS: SetupStep[] = [
  { id: "running", title: "Chips is running", detail: "on Arjun's Mac mini", done: true },
  { id: "computer", title: "A computer", detail: "Chips for Mac", done: true },
  { id: "hello", title: "An agent said hello", detail: "OpenClaw", done: true },
  { id: "phone", title: "This iPhone", done: true },
  { id: "notify", title: "Notifications", done: false },
  { id: "away", title: "Away from home", detail: "through your relay", done: true },
];

it("counts what's done, says what's left, and offers to do it", async () => {
  const onAction = jest.fn();
  const onHide = jest.fn();
  await render(<SetupCard steps={STEPS} onAction={onAction} onHide={onHide} />);
  expect(screen.getByText("Finish setting up")).toBeTruthy();
  expect(screen.getByTestId("setup-count")).toHaveTextContent("5 of 6");
  expect(screen.getByTestId("setup-running")).toHaveTextContent(/on Arjun's Mac mini/);
  await fireEvent.press(screen.getByText("Turn on"));
  expect(onAction).toHaveBeenCalledWith("notify");
  await fireEvent.press(screen.getByLabelText("Hide"));
  expect(onHide).toHaveBeenCalled();
});

it("says so when all six are done, and offers nothing", async () => {
  await render(
    <SetupCard
      steps={STEPS.map((step) => ({ ...step, done: true }))}
      onAction={jest.fn()}
      onHide={jest.fn()}
    />,
  );
  expect(screen.getByText("You're set up")).toBeTruthy();
  expect(screen.getByTestId("setup-count")).toHaveTextContent("6 of 6");
  expect(screen.queryByText("Turn on")).toBeNull();
});

describe("the rail", () => {
  const setup = (theirs: boolean, steps: readonly SetupStep[]): Setup => ({
    theirs,
    decided: theirs,
    steps,
    onHide: jest.fn(),
    onTurnOn: jest.fn(),
  });
  const UNREAD = STEPS.map((step) => ({ ...step, done: false }));
  const ALL = STEPS.map((step) => ({ ...step, done: true }));

  it("never draws the card on a cold start whose answers come in all done", async () => {
    const { rerender } = await render(<SetupRail setup={setup(false, UNREAD)} />);
    await rerender(<SetupRail setup={setup(true, ALL)} />);
    expect(screen.queryByTestId("setup-card")).toBeNull();
  });

  it("draws what is left once read, and says set up when the last is done on screen", async () => {
    const { rerender } = await render(<SetupRail setup={setup(false, UNREAD)} />);
    await rerender(<SetupRail setup={setup(true, STEPS)} />);
    expect(screen.getByTestId("setup-count")).toHaveTextContent("5 of 6");
    await rerender(<SetupRail setup={setup(true, ALL)} />);
    expect(screen.getByText("You're set up")).toBeTruthy();
  });
});

describe("the card's answers", () => {
  const device = { deviceId: "dev_memory", participantId: "usr_arjun" } as unknown as Device;
  const snapshot = {
    model: buildModel([]),
    directory: { usr_arjun: { id: "usr_arjun", kind: "person", role: "owner" } },
  } as unknown as Snapshot;
  const store = {
    serverFacts: jest.fn(async () => ({
      machine: "Arjun's Mac mini",
      version: "0.1.0",
      publicUrl: "https://chips.example",
      relay: { url: "wss://relay.example", status: "connected" },
    })),
    devices: jest.fn(async () => []),
  } as unknown as Store;
  const firstFrames: boolean[] = [];
  function Card() {
    const setup = useSetup(store, snapshot, device);
    firstFrames.push(setup.decided);
    return null;
  }

  it("are kept for the workspace, so it is decided in its first frame when drawn again (ADR 0197)", async () => {
    (readSetting as jest.Mock).mockResolvedValue(undefined);
    (pushIsOn as jest.Mock).mockResolvedValue(false);
    const first = await render(<Card />);
    // Drawn for the first time, nothing is read yet: the rooms wait for it, a little.
    expect(firstFrames[0]).toBe(false);
    await waitFor(() => expect(firstFrames.at(-1)).toBe(true));
    await first.unmount();

    // Switched away and back: drawn afresh, decided from what it read last, and read again.
    firstFrames.length = 0;
    await render(<Card />);
    expect(firstFrames[0]).toBe(true);
  });
});
