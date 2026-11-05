/**
 * Send feedback on You (ADR 0237): the row, the sheet's two ways, and the switch that keeps the
 * row from being drawn until the repository is public. Beside the list on an iPad the two ways are
 * a page, which goes as one is taken.
 */

import {
  type Directory,
  FEEDBACK_ASK,
  FEEDBACK_SENDS_NOTHING,
  feedbackLink,
  type WorkspaceModel,
} from "@chipschat/core";
import { render as renderBare, screen, userEvent, waitFor } from "@testing-library/react-native";
import { type ReactElement, type ReactNode, useState } from "react";
import { Linking } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { feedbackVersion, useFeedbackGroup } from "./Feedback";
import { YouBeside, type YouPage } from "./pages";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}

const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const mockPushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => mockPushed.push(to) }),
}));
const mockFilled: [string, string][] = [];
jest.mock("../spaces/Composer", () => ({
  fillField: (spaceId: string, text: string) => mockFilled.push([spaceId, text]),
}));

const ME = "per_arjun";
const MILO = "agt_milo";
const HOME = "spc_milo";

const DIRECTORY: Directory = {
  [ME]: { id: ME, kind: "person", displayName: "Arjun" },
  hrn_hermes: { id: "hrn_hermes", kind: "harness", displayName: "Hermes" },
  [MILO]: {
    id: MILO,
    kind: "agent",
    harnessId: "hrn_hermes",
    displayName: "Milo",
    lead: true,
    room: HOME,
  },
};

/** A workspace with Milo's Main space, which this person is in, or none. */
const workspace = (main: boolean) =>
  ({
    spaces: main
      ? [{ id: HOME, state: "open", home: true, members: [ME, MILO], lastActivityAt: "t1" }]
      : [],
  }) as unknown as WorkspaceModel;

function Feedback({ shown = true, main = true }: { shown?: boolean; main?: boolean }) {
  const { group, overlays } = useFeedbackGroup({
    shown,
    model: workspace(main),
    directory: DIRECTORY,
    selfId: ME,
  });
  return (
    <>
      {group}
      {overlays}
    </>
  );
}

/** Beside the list on an iPad: the row, and beside it the page open, if any. */
function Beside() {
  const [open, setOpen] = useState<YouPage | undefined>(undefined);
  return (
    <YouBeside value={{ open, go: setOpen }}>
      <BesideShown open={open} />
    </YouBeside>
  );
}

function BesideShown({ open }: { readonly open: YouPage | undefined }) {
  const { group, overlays, pages } = useFeedbackGroup({
    shown: true,
    model: workspace(true),
    directory: DIRECTORY,
    selfId: ME,
  });
  return (
    <>
      {group}
      {overlays}
      {open === "feedback" ? pages?.feedback : null}
    </>
  );
}

let opened: string[];
beforeEach(() => {
  opened = [];
  mockPushed.length = 0;
  mockFilled.length = 0;
  jest.spyOn(Linking, "openURL").mockImplementation(async (url: string) => {
    opened.push(url);
    return true;
  });
});

describe("the switch", () => {
  it("draws nothing while it is off", async () => {
    await render(<Feedback shown={false} />);
    expect(screen.queryByTestId("feedback-row")).toBeNull();
    expect(screen.queryByText("Send feedback")).toBeNull();
  });

  it("draws the row, with its line, once it is on", async () => {
    await render(<Feedback />);
    expect(screen.getByTestId("feedback-row")).toBeTruthy();
    expect(screen.getByText("Send feedback")).toBeTruthy();
    expect(screen.getByText("Tell the people who make Chips what you'd change.")).toBeTruthy();
  });
});

describe("the sheet", () => {
  it("offers the Main agent and GitHub, and says Chips sends nothing", async () => {
    await render(<Feedback />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    expect(screen.getByText("Feedback for Chips")).toBeTruthy();
    expect(screen.getByText("Write it with Milo")).toBeTruthy();
    expect(screen.getByText("Write it on GitHub")).toBeTruthy();
    expect(screen.getByText(FEEDBACK_SENDS_NOTHING)).toBeTruthy();
    expect(opened).toEqual([]);
  });

  it("opens the form with this build filled in, once the sheet has gone", async () => {
    await render(<Feedback />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    await userEvent.press(screen.getByTestId("feedback-github"));
    await waitFor(() => expect(opened).toEqual([feedbackLink(feedbackVersion())]));
    expect(mockFilled).toEqual([]);
  });

  it("puts the line in the Main space's field, not sent, and opens the space", async () => {
    await render(<Feedback />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    await userEvent.press(screen.getByTestId("feedback-agent"));
    await waitFor(() => expect(mockPushed).toEqual([`/spaces/${HOME}`]));
    expect(mockFilled).toEqual([[HOME, FEEDBACK_ASK]]);
    expect(opened).toEqual([]);
  });

  it("isn't there with no Main agent: the row opens GitHub straight away", async () => {
    await render(<Feedback main={false} />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    expect(opened).toEqual([feedbackLink(feedbackVersion())]);
    expect(screen.queryByText("Feedback for Chips")).toBeNull();
  });
});

describe("beside the list on an iPad", () => {
  it("opens the two ways as a page, chooses the row, and opens no sheet", async () => {
    await render(<Beside />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    expect(screen.getByTestId("feedback-page")).toBeOnTheScreen();
    expect(screen.getByRole("header", { name: "Feedback for Chips" })).toBeTruthy();
    expect(screen.getByTestId("feedback-row")).toBeSelected();
    expect(screen.queryByTestId("feedback-sheet")).toBeNull();
  });

  it("puts the line in the Main space's field and opens the space, the page gone", async () => {
    await render(<Beside />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    await userEvent.press(screen.getByTestId("feedback-agent"));
    expect(mockFilled).toEqual([[HOME, FEEDBACK_ASK]]);
    expect(mockPushed).toEqual([`/spaces/${HOME}`]);
    expect(screen.queryByTestId("feedback-page")).toBeNull();
    expect(screen.getByTestId("feedback-row")).not.toBeSelected();
  });

  it("opens the form on GitHub, the page gone", async () => {
    await render(<Beside />);
    await userEvent.press(screen.getByTestId("feedback-row"));
    await userEvent.press(screen.getByTestId("feedback-github"));
    expect(opened).toEqual([feedbackLink(feedbackVersion())]);
    expect(screen.queryByTestId("feedback-page")).toBeNull();
  });
});

describe("the version box", () => {
  it("is the Version row's words and the system", () => {
    expect(feedbackVersion()).toMatch(/^Chips \d+\.\d+\.\d+.* · \S+ · iOS \S+$/);
  });
});
