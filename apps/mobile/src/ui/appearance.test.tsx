/**
 * The appearance choice. What is worth proving: that the palette follows the choice over the
 * system, and the system when there is no choice; that the choice is written down and read back
 * at launch; and that the platform is told, so what the app does not draw follows too.
 */

import { act, renderHook } from "@testing-library/react-native";
import { Appearance } from "react-native";
import { SETTINGS } from "../prefs";
import { chooseAppearance, loadAppearance } from "./appearance";
import { usePalette, useScheme } from "./theme";
import { dark, light } from "./tokens";

const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { appearance: "appearance" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

beforeEach(async () => {
  mockSettings.clear();
  await act(() => {
    chooseAppearance("system");
  });
});

describe("the appearance", () => {
  it("follows the system until somebody chooses", async () => {
    // jest-expo's system is light.
    expect((await renderHook(() => useScheme())).result.current).toBe("light");
    expect((await renderHook(() => usePalette())).result.current).toBe(light);
  });

  it("follows the choice over the system, and writes it down", async () => {
    const told = jest.spyOn(Appearance, "setColorScheme").mockImplementation(() => undefined);
    try {
      await act(() => {
        chooseAppearance("dark");
      });
      expect((await renderHook(() => usePalette())).result.current).toBe(dark);
      expect(mockSettings.get(SETTINGS.appearance)).toBe("dark");
      expect(told).toHaveBeenCalledWith("dark");
      await act(() => {
        chooseAppearance("system");
      });
      expect(told).toHaveBeenLastCalledWith("unspecified");
    } finally {
      told.mockRestore();
    }
  });

  it("reads what was chosen last time at launch, and shrugs at nonsense", async () => {
    mockSettings.set(SETTINGS.appearance, "dark");
    await act(async () => {
      expect(await loadAppearance()).toBe("dark");
    });
    expect((await renderHook(() => useScheme())).result.current).toBe("dark");
    mockSettings.set(SETTINGS.appearance, "sepia");
    await act(async () => {
      expect(await loadAppearance()).toBe("system");
    });
  });

  it("re-renders whoever is reading it when it changes", async () => {
    const { result } = await renderHook(() => useScheme());
    expect(result.current).toBe("light");
    await act(() => {
      chooseAppearance("dark");
    });
    expect(result.current).toBe("dark");
  });
});
