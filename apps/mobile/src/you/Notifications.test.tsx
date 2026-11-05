/**
 * The notification settings (ADR 0085). They are the person's, not the phone's — they live on the
 * server and the desktop's banners follow them too — so what matters is that a row says what is
 * saved, a sheet changes exactly what it shows, and a refusal is not hidden. Quiet hours were the
 * broken part: they could not be turned off, and typing one end saved the other as a guess. Beside
 * the list on an iPad the sheets are pages, which the rows beside them follow.
 */

import type { Store } from "@chipschat/core";
import type { NotificationSettings } from "@chipschat/protocol";
import {
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
} from "@testing-library/react-native";
import { type ReactElement, type ReactNode, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Group } from "../ui/Group";
import { useNotificationsGroup } from "./Notifications";
import { isYouSheet, YouBeside, type YouPage } from "./pages";
import { clockWords } from "./words";

/** A sheet asks where the home indicator is, as the app always can from the router. */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

/**
 * The rows in their card with the line under it, and the sheets, as You puts them: one in its
 * scroll, the other beside it.
 */
function Shown(props: {
  readonly store: Store;
  readonly harnesses: readonly { readonly id: string; readonly name: string }[];
  readonly guest?: boolean;
}) {
  const { rows, foot, overlays } = useNotificationsGroup(props);
  return (
    <>
      <Group>{rows}</Group>
      {foot}
      {overlays}
    </>
  );
}

/** The same beside the list on an iPad: the rows, and beside them the page open, if any. */
function Beside(props: {
  readonly store: Store;
  readonly harnesses: readonly { readonly id: string; readonly name: string }[];
}) {
  const [open, setOpen] = useState<YouPage | undefined>(undefined);
  return (
    <YouBeside value={{ open, go: setOpen }}>
      <BesideShown {...props} open={open} />
    </YouBeside>
  );
}

function BesideShown({
  open,
  ...props
}: {
  readonly store: Store;
  readonly harnesses: readonly { readonly id: string; readonly name: string }[];
  readonly open: YouPage | undefined;
}) {
  const { rows, foot, overlays, pages } = useNotificationsGroup(props);
  return (
    <>
      <Group>{rows}</Group>
      {foot}
      {overlays}
      {isYouSheet(open) ? pages[open] : null}
    </>
  );
}

const DEFAULTS: NotificationSettings = {
  decide: "now",
  review: "hourly",
  fyi: "daily",
  harnesses: {},
};

const NIGHT: NotificationSettings = {
  ...DEFAULTS,
  quiet: { from: "23:00", to: "07:30", breakthrough: "decide" },
};

function fake(loaded: NotificationSettings = DEFAULTS, refuse?: string) {
  const saved: NotificationSettings[] = [];
  const store = {
    notificationSettings: () => DEFAULTS,
    loadNotificationSettings: async () => loaded,
    saveNotificationSettings: async (settings: NotificationSettings) => {
      saved.push(settings);
      if (refuse !== undefined) throw new Error(refuse);
    },
  } as unknown as Store;
  return { store, saved };
}

const HARNESSES = [
  { id: "har_scout", name: "Scout" },
  { id: "har_kit", name: "Kit" },
];

/** A time today, as the wheel hands one back. */
function at(hours: number, minutes: number): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

describe("the rows", () => {
  it("say what each is set to, as the server has it", async () => {
    const { store } = fake(NIGHT);
    await render(<Shown store={store} harnesses={HARNESSES} />);
    expect(screen.getByRole("button", { name: "Decisions, Right away" })).toBeTruthy();
    expect(
      await screen.findByRole("button", {
        name: `Quiet hours, ${clockWords("23:00")}–${clockWords("07:30")}`,
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agents, Everything" })).toBeTruthy();
  });

  it("say under the card what reaches this phone, in one line", async () => {
    const { store } = fake();
    await render(<Shown store={store} harnesses={HARNESSES} />);
    // Spaces start on People's messages (ADR 0216): more than decisions and @s reach it.
    expect(screen.getByTestId("notifications-reach")).toHaveTextContent(
      "Decisions reach this phone, and so do messages that @ you and what other people write in your spaces. Each space's sheet sets what it sends, under Notifications.",
    );
  });

  it("leave Decisions out for a guest, and say so under the card", async () => {
    const { store } = fake();
    await render(<Shown store={store} harnesses={HARNESSES} guest />);
    expect(screen.queryByTestId("decisions-row")).toBeNull();
    expect(screen.getByTestId("notifications-reach")).toHaveTextContent(
      "Messages that @ you reach this phone, and so does what other people write in your space. The space's sheet sets what it sends, under Notifications.",
    );
  });

  it("leave Agents out when the workspace has none", async () => {
    const { store } = fake();
    await render(<Shown store={store} harnesses={[]} />);
    expect(screen.queryByTestId("agents-row")).toBeNull();
  });

  it("put a refused save back, and say it was not saved", async () => {
    const { store } = fake(DEFAULTS, "no route to host");
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("decisions-row"));
    await userEvent.press(screen.getByTestId("decide-off"));
    expect(await screen.findByTestId("notifications-error")).toHaveTextContent(
      "Not saved: no route to host.",
    );
    expect(screen.getByRole("button", { name: "Decisions, Right away" })).toBeTruthy();
  });
});

describe("Decisions", () => {
  it("says in its sheet what a decision is, and what a push of one carries", async () => {
    const { store } = fake();
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("decisions-row"));
    expect(screen.getByText(/the agent stops until you answer it/)).toBeTruthy();
    expect(screen.getByTestId("push-note")).toHaveTextContent(/carries no words about the ask/);
  });

  it("is right away or off, and a tap chooses", async () => {
    const { store, saved } = fake();
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("decisions-row"));
    await userEvent.press(screen.getByTestId("decide-off"));
    expect(saved.at(-1)).toMatchObject({ decide: "off" });
    expect(screen.getByRole("button", { name: "Decisions, Off" })).toBeTruthy();
  });
});

describe("Quiet hours", () => {
  it("turn on for the night, saved once when the sheet is done with", async () => {
    const { store, saved } = fake();
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("quiet-row"));
    await fireEvent(screen.getByTestId("quiet-switch"), "valueChange", true);
    expect(saved).toHaveLength(0);
    await userEvent.press(screen.getByTestId("quiet-sheet-close"));
    expect(saved.at(-1)?.quiet).toEqual({ from: "22:00", to: "07:00", breakthrough: "decide" });
    expect(
      screen.getByRole("button", {
        name: `Quiet hours, ${clockWords("22:00")}–${clockWords("07:00")}`,
      }),
    ).toBeTruthy();
  });

  it("turn off again, which the screen could not do before", async () => {
    const { store, saved } = fake(NIGHT);
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await screen.findByRole("button", {
      name: `Quiet hours, ${clockWords("23:00")}–${clockWords("07:30")}`,
    });
    await userEvent.press(screen.getByTestId("quiet-row"));
    await fireEvent(screen.getByTestId("quiet-switch"), "valueChange", false);
    await userEvent.press(screen.getByTestId("quiet-sheet-close"));
    expect(saved.at(-1)?.quiet).toBeUndefined();
    expect(screen.getByRole("button", { name: "Quiet hours, Off" })).toBeTruthy();
  });

  it("change the end the wheel is turning, and leave the other as it was saved", async () => {
    const { store, saved } = fake(NIGHT);
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await screen.findByRole("button", {
      name: `Quiet hours, ${clockWords("23:00")}–${clockWords("07:30")}`,
    });
    await userEvent.press(screen.getByTestId("quiet-row"));
    await userEvent.press(screen.getByTestId("quiet-to"));
    await fireEvent(screen.getByTestId("quiet-wheel"), "valueChange", {}, at(6, 15));
    await userEvent.press(screen.getByTestId("quiet-sheet-close"));
    expect(saved.at(-1)?.quiet).toEqual({ from: "23:00", to: "06:15", breakthrough: "decide" });
  });

  it("let decisions through by default, and say what stopping them costs", async () => {
    const { store, saved } = fake(NIGHT);
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await screen.findByRole("button", {
      name: `Quiet hours, ${clockWords("23:00")}–${clockWords("07:30")}`,
    });
    await userEvent.press(screen.getByTestId("quiet-row"));
    expect(screen.getByText(/An approval still buzzes/)).toBeTruthy();
    await fireEvent(screen.getByTestId("quiet-through"), "valueChange", false);
    expect(screen.getByText(/not even an approval/)).toBeTruthy();
    await userEvent.press(screen.getByTestId("quiet-sheet-close"));
    expect(saved.at(-1)?.quiet?.breakthrough).toBe("none");
  });

  it("save nothing when the sheet is closed unchanged", async () => {
    const { store, saved } = fake(NIGHT);
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await screen.findByRole("button", {
      name: `Quiet hours, ${clockWords("23:00")}–${clockWords("07:30")}`,
    });
    await userEvent.press(screen.getByTestId("quiet-row"));
    await userEvent.press(screen.getByTestId("quiet-sheet-close"));
    expect(saved).toHaveLength(0);
  });
});

describe("Agents", () => {
  it("takes a word per agent, treats one not listed as everything, and names what is muted", async () => {
    const { store, saved } = fake();
    await render(<Shown store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("agents-row"));
    const scout = screen.getByLabelText("Hear from Scout");
    expect(scout).toBeTruthy();
    expect(screen.getAllByText("Its decisions, and messages that @ you").length).toBe(
      HARNESSES.length,
    );
    await userEvent.press(screen.getAllByRole("radio", { name: "Nothing" })[0] as never);
    await waitFor(() => expect(saved.at(-1)?.harnesses).toEqual({ har_scout: "none" }));
    // What the choice lets through is said under it.
    expect(screen.getByText("Nothing from it notifies you")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agents, Scout muted" })).toBeTruthy();
  });
});

describe("beside the list on an iPad", () => {
  it("opens each as a page, chooses its row, and opens no sheet", async () => {
    const { store } = fake();
    await render(<Beside store={store} harnesses={HARNESSES} />);
    for (const [row, page, sheet] of [
      ["decisions-row", "decide-page", "decide-sheet"],
      ["quiet-row", "quiet-page", "quiet-sheet"],
      ["agents-row", "agents-page", "agents-sheet"],
    ] as const) {
      await userEvent.press(screen.getByTestId(row));
      expect(screen.getByTestId(page)).toBeOnTheScreen();
      expect(screen.getByTestId(row)).toBeSelected();
      expect(screen.queryByTestId(sheet)).toBeNull();
    }
  });

  it("saves quiet hours once the wheel has rested, and the row beside the page says them", async () => {
    const { store, saved } = fake();
    await render(<Beside store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("quiet-row"));
    await fireEvent(screen.getByTestId("quiet-switch"), "valueChange", true);
    expect(saved).toHaveLength(0);
    await waitFor(() =>
      expect(saved.at(-1)?.quiet).toEqual({ from: "22:00", to: "07:00", breakthrough: "decide" }),
    );
    expect(saved).toHaveLength(1);
    expect(
      screen.getByRole("button", {
        name: `Quiet hours, ${clockWords("22:00")}–${clockWords("07:00")}`,
      }),
    ).toBeSelected();
    expect(screen.getByTestId("quiet-page")).toBeOnTheScreen();
  });

  it("saves what the wheel has not rested on yet as the page goes, and nothing unchanged", async () => {
    const { store, saved } = fake(NIGHT);
    await render(<Beside store={store} harnesses={HARNESSES} />);
    await screen.findByRole("button", {
      name: `Quiet hours, ${clockWords("23:00")}–${clockWords("07:30")}`,
    });
    await userEvent.press(screen.getByTestId("quiet-row"));
    await userEvent.press(screen.getByTestId("decisions-row"));
    expect(saved).toHaveLength(0);
    await userEvent.press(screen.getByTestId("quiet-row"));
    await userEvent.press(screen.getByTestId("quiet-to"));
    await fireEvent(screen.getByTestId("quiet-wheel"), "valueChange", {}, at(6, 15));
    await userEvent.press(screen.getByTestId("decisions-row"));
    expect(saved).toEqual([
      { ...NIGHT, quiet: { from: "23:00", to: "06:15", breakthrough: "decide" } },
    ]);
  });

  it("keeps the page of choices open as one is made: the tick moves, and the row says it", async () => {
    const { store, saved } = fake();
    await render(<Beside store={store} harnesses={HARNESSES} />);
    await userEvent.press(screen.getByTestId("agents-row"));
    await userEvent.press(screen.getAllByRole("radio", { name: "Nothing" })[0] as never);
    await waitFor(() => expect(saved.at(-1)?.harnesses).toEqual({ har_scout: "none" }));
    expect(screen.getByRole("button", { name: "Agents, Scout muted" })).toBeSelected();
    expect(screen.getByTestId("agents-page")).toBeOnTheScreen();
  });
});
