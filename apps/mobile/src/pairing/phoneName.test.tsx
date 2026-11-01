/**
 * What a phone calls itself in the device list (ADR 0085): the name its owner gave it, or its
 * model where iOS will only say "iPhone" — a list of five "iPhone"s tells nobody which to sign out.
 */

import { phoneName } from "./usePairing";

const mockDevice: { deviceName: string | null; modelName: string | null } = {
  deviceName: null,
  modelName: null,
};
jest.mock("expo-device", () => ({
  get deviceName() {
    return mockDevice.deviceName;
  },
  get modelName() {
    return mockDevice.modelName;
  },
}));
jest.mock("@chipschat/core", () => ({ pairDevice: jest.fn() }));
jest.mock("../device/storage", () => ({ deviceStorage: {} }));

describe("phoneName", () => {
  it.each([
    ["Arjun's iPhone", "iPhone 15 Pro", "Arjun's iPhone"],
    ["iPhone", "iPhone 15 Pro", "iPhone 15 Pro"],
    ["iPad", "iPad Air", "iPad Air"],
    [null, "Pixel 9", "Pixel 9"],
    ["iPhone", null, "iPhone"],
    [null, null, "A phone"],
  ])("given %s on a %s, is %s", (deviceName, modelName, said) => {
    mockDevice.deviceName = deviceName;
    mockDevice.modelName = modelName;
    expect(phoneName()).toBe(said);
  });
});
