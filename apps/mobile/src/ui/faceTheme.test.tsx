/**
 * The faces' theme (ADR 0176). What is worth proving: that the choice is written down and read
 * back at launch; that a face is painted in the theme at the moment it is drawn — its ground, its
 * pins' light, its letters — while the paper and everything that is not a face stay as they were;
 * and that a preview can hold its faces in a theme whatever the phone chose.
 */

import { act, render, renderHook, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { Avatar } from "./Avatar";
import {
  chooseFaceTheme,
  FacesIn,
  loadFaceTheme,
  paintedGround,
  useFacePaint,
  useFaceTheme,
} from "./faceTheme";
import { FACE_INK, ICON_GROUNDS, ICON_GROUNDS_BRIGHT, light } from "./tokens";

const mockSettings = new Map<string, string>();
jest.mock("../prefs", () => ({
  SETTINGS: { faces: "faces" },
  readSetting: async (name: string) => mockSettings.get(name),
  writeSetting: async (name: string, value: string) => {
    mockSettings.set(name, value);
  },
}));

beforeEach(async () => {
  mockSettings.clear();
  await act(() => {
    chooseFaceTheme("soothing");
  });
});

describe("the faces' theme", () => {
  it("is Soothing until somebody chooses, and Bright once they do, written down", async () => {
    expect((await renderHook(() => useFaceTheme())).result.current).toBe("soothing");
    await act(() => {
      chooseFaceTheme("bright");
    });
    expect((await renderHook(() => useFaceTheme())).result.current).toBe("bright");
    expect(mockSettings.get("faces")).toBe("bright");
  });

  it("reads what was chosen last time at launch, and shrugs at nonsense", async () => {
    mockSettings.set("faces", "bright");
    await act(async () => {
      expect(await loadFaceTheme()).toBe("bright");
    });
    mockSettings.set("faces", "neon");
    await act(async () => {
      expect(await loadFaceTheme()).toBe("soothing");
    });
  });

  it("paints a ground as its Bright sister by index, and leaves any other colour alone", () => {
    ICON_GROUNDS.forEach((ground, at) => {
      expect(paintedGround(ground, "soothing")).toBe(ground);
      expect(paintedGround(ground, "bright")).toBe(ICON_GROUNDS_BRIGHT[at]);
      // Painting twice changes nothing: a Bright ground is not a Soothing one.
      expect(paintedGround(ICON_GROUNDS_BRIGHT[at] ?? "", "bright")).toBe(ICON_GROUNDS_BRIGHT[at]);
    });
    expect(paintedGround(light.surface2, "bright")).toBe(light.surface2);
  });

  it("is held for a preview whatever the phone chose", async () => {
    const { result } = await renderHook(() => useFacePaint(), {
      wrapper: ({ children }) => <FacesIn value="bright">{children}</FacesIn>,
    });
    expect(result.current.theme).toBe("bright");
    expect(result.current.ink).toBe(FACE_INK.bright);
  });
});

describe("a face in each theme", () => {
  /** The colour of the letters a face wears, and of the square they stand on. */
  async function drawn(theme: "soothing" | "bright") {
    await render(
      <FacesIn value={theme}>
        <Avatar name="Kit" kind="channel" icon={{ icon: "chip", ground: 4, letters: "K" }} />
      </FacesIn>,
    );
    const letters = StyleSheet.flatten(screen.getByText("K").props["style"]);
    const square = StyleSheet.flatten(screen.getByRole("image").props["style"]);
    return { ink: letters.color, ground: square.backgroundColor };
  }

  it("wears white letters on its deep ground in Soothing", async () => {
    expect(await drawn("soothing")).toEqual({ ink: FACE_INK.soothing, ground: ICON_GROUNDS[4] });
  });

  it("wears dark letters on its Bright sister in Bright", async () => {
    expect(await drawn("bright")).toEqual({ ink: FACE_INK.bright, ground: ICON_GROUNDS_BRIGHT[4] });
  });
});
