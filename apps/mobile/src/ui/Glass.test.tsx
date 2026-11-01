/**
 * The band of glass a tab's name and a room's bar stand on (`EdgeBand`). What is proved here is
 * that a band is drawn afresh at a new size rather than resized: its gradients are drawn by
 * react-native-svg, two of them as masks, and on Arjun's iPhone a mask's drawing kept the size
 * the band was first drawn at when the band grew (ADR 0107). Where the glass stands is the
 * phone's to show, and the walk's.
 */

import { render } from "@testing-library/react-native";
import { EdgeBand, GLASS } from "./Glass";

// Each pane's blur, counted as it is made: a band made again makes both of its panes again.
const mockMade = { panes: 0 };
jest.mock("expo-blur", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    BlurView: (props: object) => {
      react.useEffect(() => {
        mockMade.panes += 1;
      }, []);
      return react.createElement(View, props);
    },
  };
});

// Whether the build can blur with no tint (`ClearBlur`, ADR 0129). Under Node there is no module,
// so each test says which build it stands for.
const mockClear = { present: false };
jest.mock("./ClearBlur", () => {
  const react = require("react");
  const { View } = require("react-native");
  return {
    hasClearBlur: () => mockClear.present,
    ClearBlur: (props: object) => react.createElement(View, { ...props, testID: "clear-blur" }),
  };
});

// A band is hidden from a screen reader, so a query must be told to look in it.
const HIDDEN = { includeHiddenElements: true };

beforeEach(() => {
  mockMade.panes = 0;
  mockClear.present = false;
});

describe("a band of glass", () => {
  it("is drawn afresh when its size changes, and only then", async () => {
    const view = await render(<EdgeBand edge="top" height={101} ramp={40} />);
    expect(mockMade.panes).toBe(2);
    await view.rerender(<EdgeBand edge="top" height={163} ramp={40} />);
    expect(mockMade.panes).toBe(4);
    await view.rerender(<EdgeBand edge="top" height={163} ramp={40} />);
    expect(mockMade.panes).toBe(4);
  });

  it("blurs with no tint over it where the build can, and with a material where it cannot", async () => {
    mockClear.present = true;
    const clear = await render(<EdgeBand edge="top" height={163} ramp={40} />);
    const radii = clear.getAllByTestId("clear-blur", HIDDEN).map((pane) => pane.props["radius"]);
    expect(radii).toEqual([GLASS.thinBlur, GLASS.blur]);
    expect(mockMade.panes).toBe(0);
    await clear.unmount();

    mockClear.present = false;
    const material = await render(<EdgeBand edge="top" height={163} ramp={40} />);
    expect(material.queryAllByTestId("clear-blur", HIDDEN)).toHaveLength(0);
    expect(mockMade.panes).toBe(2);
  });
});
