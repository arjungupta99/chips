/**
 * Which share sheet the words go to (ADR 0127). The app's own module, where the build has it,
 * holds the sheet so it slides up; without it the words still go, through React Native's
 * `Share.share`. How the sheet comes in is the phone's to show, and a simulator film is where
 * that was seen.
 */

import { requireOptionalNativeModule } from "expo";
import { Share } from "react-native";

jest.mock("expo", () => ({
  ...jest.requireActual("expo"),
  requireOptionalNativeModule: jest.fn(),
}));

const optional = jest.mocked(requireOptionalNativeModule);

/** A fresh copy of the module, since it keeps what it found the first time it was asked. */
function load(): typeof import("./share") {
  let loaded: typeof import("./share") | undefined;
  jest.isolateModules(() => {
    loaded = require("./share");
  });
  return loaded as typeof import("./share");
}

afterEach(() => {
  optional.mockReset();
  jest.restoreAllMocks();
});

it("hands the words to the app's own share sheet where the build has it", async () => {
  const native = { shareText: jest.fn().mockResolvedValue(undefined) };
  optional.mockReturnValue(native);
  const share = jest.spyOn(Share, "share");
  await load().shareText("beans on Tuesday.");
  expect(optional).toHaveBeenCalledWith("ChipsShareSheet");
  expect(native.shareText).toHaveBeenCalledWith("beans on Tuesday.");
  expect(share).not.toHaveBeenCalled();
});

it("still shares through React Native in a build made before the module", async () => {
  optional.mockReturnValue(null);
  const share = jest.spyOn(Share, "share").mockResolvedValue({ action: Share.dismissedAction });
  await load().shareText("beans on Tuesday.");
  expect(share).toHaveBeenCalledWith({ message: "beans on Tuesday." });
});

it("lets a refusal reach the caller, who says sharing is unavailable", async () => {
  optional.mockReturnValue({ shareText: jest.fn().mockRejectedValue(new Error("no top")) });
  await expect(load().shareText("beans")).rejects.toThrow("no top");
});
