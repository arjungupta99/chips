/**
 * The five feelings, and what happens when there is nothing to feel them with.
 *
 * Under Node the engine is a spy (`jest.setup.js`), so what is provable here is the ask: which
 * generator each name reaches and with which style, which is the part that goes wrong — a Send
 * that reaches for the notification pattern feels like an error, and a denial that reaches for
 * success feels like the wrong answer was recorded. Whether the phone then buzzes is the
 * phone's, and `e2e/maestro` is where a hand is asked.
 */

import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import * as feel from "./haptics";

const impact = Haptics.impactAsync as jest.MockedFunction<typeof Haptics.impactAsync>;
const notify = Haptics.notificationAsync as jest.MockedFunction<typeof Haptics.notificationAsync>;
const select = Haptics.selectionAsync as jest.MockedFunction<typeof Haptics.selectionAsync>;
const android = Haptics.performAndroidHapticsAsync as jest.MockedFunction<
  typeof Haptics.performAndroidHapticsAsync
>;

beforeEach(() => {
  impact.mockClear();
  notify.mockClear();
  select.mockClear();
  android.mockClear();
});

describe("what each name asks for", () => {
  it("sends on a light impact and holds on a medium one", () => {
    feel.tap();
    expect(impact).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    feel.lift();
    expect(impact).toHaveBeenLastCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(impact).toHaveBeenCalledTimes(2);
  });

  it("answers with the notification patterns, a yes apart from a no", () => {
    feel.success();
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    feel.warning();
    expect(notify).toHaveBeenLastCalledWith(Haptics.NotificationFeedbackType.Warning);
  });

  // Never Error: a denial is somebody's decision, not a failure, and the phone should not
  // tell a thumb that something went wrong when what happened is that it said no.
  it("never reaches for the error pattern", () => {
    feel.warning();
    expect(notify).not.toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it("clicks once for a line crossed", () => {
    feel.tick();
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe("on Android", () => {
  const was = Platform.OS;
  beforeEach(() => {
    Platform.OS = "android";
  });
  afterEach(() => {
    Platform.OS = was;
  });

  it("asks for the platform's own constant for each name, and never the iOS generators", () => {
    feel.tap();
    feel.lift();
    feel.success();
    feel.warning();
    feel.tick();
    expect(android.mock.calls.map(([constant]) => constant)).toEqual([
      Haptics.AndroidHaptics.Virtual_Key,
      Haptics.AndroidHaptics.Long_Press,
      Haptics.AndroidHaptics.Confirm,
      Haptics.AndroidHaptics.Reject,
      Haptics.AndroidHaptics.Clock_Tick,
    ]);
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("swallows a refusal there too", async () => {
    android.mockRejectedValueOnce(new Error("no vibrator"));
    expect(() => feel.tick()).not.toThrow();
    await Promise.resolve();
  });
});

describe("a platform with nothing to feel with", () => {
  it("swallows a refusal rather than handing a screen an error", async () => {
    impact.mockRejectedValueOnce(new Error("no haptics engine"));
    expect(() => feel.tap()).not.toThrow();
    // The rejection is settled before this assertion, and no handler was left for it.
    await Promise.resolve();
  });

  it("swallows a module that throws outright", () => {
    select.mockImplementationOnce(() => {
      throw new Error("no such native module");
    });
    expect(() => feel.tick()).not.toThrow();
  });
});
