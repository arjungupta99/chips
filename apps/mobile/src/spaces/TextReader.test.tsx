/**
 * What a reader is drawn in on a phone, where a selectable `Text` keeps a selection inside its
 * paragraph (on an iPhone it copies itself whole): the words formatted, as a page, so a finger
 * selects across paragraphs. Whether the handles then drag is the phone's to show; a simulator
 * and an emulator walk are where that was seen.
 */

import { act, render, screen, userEvent } from "@testing-library/react-native";
import * as Clipboard from "expo-clipboard";
import { Platform } from "react-native";
import { OnGround } from "../ui/ground";
import { light } from "../ui/tokens";
import { hasPageView } from "./pages";
import { TextReader } from "./TextReader";

const REPLY = "**Done.** Two shops:\n\n- Ritual on Valencia\n- Sightglass on 20th\n\n`brew 4m`";

it("reads a formatted reply as one page, made from the reply, in the app's ink", async () => {
  await render(<TextReader title="Designer’s reply" text={REPLY} onBack={() => undefined} />);
  const view = await screen.findByTestId("page-view");
  const html: string = view.props["source"].html;
  expect(html).toContain("<strong>Done.</strong>");
  expect(html).toContain("<li>Ritual on Valencia</li>");
  expect(html).toContain("<code>brew 4m</code>");
  expect(html).toContain("font: 17px/1.5");
  // The same page rules as a file's page: nothing loads but pictures, no script posts back.
  expect(html).toContain("default-src 'none'");
  expect(view.props["onMessage"]).toBeUndefined();
  // An iPhone's page shares the sheet's pull as it was walked: nothing of Android's.
  expect(view.props["nestedScrollEnabled"]).toBeUndefined();
  expect(view.props["onScroll"]).toBeUndefined();
  expect(screen.getByRole("button", { name: "Copy text" })).toBeTruthy();
});

it("reads it as a page on Android too, where a selectable Text stops at its paragraph's end", async () => {
  const android = jest.replaceProperty(Platform, "OS", "android");
  try {
    await render(<TextReader title="Select text" text={REPLY} onBack={() => undefined} />);
    const view = await screen.findByTestId("page-view");
    expect(view.props["source"].html).toContain("<li>Sightglass on 20th</li>");
    // Android's view is told none of iOS's words, which it would read wrong (AN-22).
    expect(view.props["decelerationRate"]).toBeUndefined();
  } finally {
    android.restore();
  }
});

it("keeps the finger from the sheet's pull on Android while the page stands off its top", async () => {
  const android = jest.replaceProperty(Platform, "OS", "android");
  const scrolled = (y: number) =>
    act(async () =>
      screen.getByTestId("page-view").props["onScroll"]({ nativeEvent: { contentOffset: { y } } }),
    );
  try {
    await render(<TextReader title="Select text" text={REPLY} onBack={() => undefined} />);
    // At its top a pull down takes the sheet, as a list on a sheet lets it (ADR 0175).
    expect((await screen.findByTestId("page-view")).props["nestedScrollEnabled"]).toBe(false);
    await scrolled(240);
    expect(screen.getByTestId("page-view").props["nestedScrollEnabled"]).toBe(true);
    await scrolled(0);
    expect(screen.getByTestId("page-view").props["nestedScrollEnabled"]).toBe(false);
  } finally {
    android.restore();
  }
});

it("keeps the words as they are on the web target, where the browser selects across them", async () => {
  const web = jest.replaceProperty(Platform, "OS", "web");
  try {
    await render(<TextReader title="Select text" text={REPLY} onBack={() => undefined} />);
    expect(screen.queryByTestId("page-view")).toBeNull();
    expect(screen.getByText("Done.")).toBeTruthy();
  } finally {
    web.restore();
  }
});

it("goes back to the bubble's words when the page cannot be drawn", async () => {
  await render(<TextReader title="Designer’s reply" text={REPLY} onBack={() => undefined} />);
  const view = await screen.findByTestId("page-view");
  await act(async () => view.props["onError"]?.({ nativeEvent: { description: "gone" } }));
  expect(screen.queryByTestId("page-view")).toBeNull();
  expect(screen.getByText(/Ritual on Valencia/)).toBeTruthy();
  expect(screen.getByTestId("text-reader-scroll")).toBeTruthy();
});

it("keeps the bubble's words on a build that cannot draw a page", async () => {
  jest.mocked(hasPageView).mockReturnValue(false);
  try {
    await render(<TextReader title="Designer’s reply" text={REPLY} onBack={() => undefined} />);
    expect(screen.queryByTestId("page-view")).toBeNull();
    expect(screen.getByText("Done.")).toBeTruthy();
  } finally {
    jest.mocked(hasPageView).mockReturnValue(true);
  }
});

it("draws Select text's words formatted, never their marks, and copies them as written", async () => {
  const back = jest.fn();
  await render(<TextReader title="Select text" text={REPLY} onBack={back} />);
  const html: string = (await screen.findByTestId("page-view")).props["source"].html;
  expect(html).toContain("<strong>Done.</strong>");
  expect(html).not.toContain("**");
  expect(screen.queryByDisplayValue(REPLY)).toBeNull();
  await userEvent.press(screen.getByRole("button", { name: "Copy text" }));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith(REPLY);
  await userEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(back).toHaveBeenCalled();
});

it("stands on the sheet's own ground, with code a step down from it, not on the paper", async () => {
  await render(
    <OnGround kind="grouped">
      <TextReader title="Select text" text={REPLY} onBack={() => undefined} />
    </OnGround>,
  );
  const html: string = (await screen.findByTestId("page-view")).props["source"].html;
  expect(html).toContain(`background: ${light.grouped}`);
  expect(html).toContain(`background: ${light.sunk}`);
  expect(html).not.toContain(light.bg);
});
