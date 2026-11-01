/**
 * Send feedback on the web and the Mac (ADR 0237): the card, the dialog's two ways, and the
 * switch that keeps the card off You until the repository is public.
 */

import {
  type Directory,
  FEEDBACK_SENDS_NOTHING,
  FEEDBACK_SHOWN,
  type FeedbackAgent,
  feedbackLink,
  type WorkspaceModel,
} from "@chipschat/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BUILD, You, type YouProps } from "../You.tsx";
import { FEEDBACK_ON, FeedbackCard, type FeedbackService } from "./Feedback.tsx";

const MILO: FeedbackAgent = { id: "agt_milo", name: "Milo", spaceId: "spc_milo" };
const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  agt_milo: { id: "agt_milo", kind: "agent", displayName: "Milo", lead: true, room: "spc_milo" },
};
const VERSION = "Chips 0.0.0 · b770067c · Mac";

function service() {
  const opened: string[] = [];
  const written: FeedbackAgent[] = [];
  const feedback: FeedbackService = {
    openLink: (url) => opened.push(url),
    writeWith: (agent) => written.push(agent),
  };
  return { opened, written, feedback };
}

describe("the switch", () => {
  it("is on, now that the repository is public", () => {
    expect(FEEDBACK_SHOWN).toBe(true);
    expect(FEEDBACK_ON).toBe(true);
  });

  it("leaves You without the card while the shell offers none, and draws it once it does", () => {
    const props = {
      model: {
        people: { per_arjun: { participantId: "per_arjun", role: "member" } },
        spaces: [],
      } as unknown as WorkspaceModel,
      directory: DIRECTORY,
      selfId: "per_arjun",
      workspaceName: "Northwind",
      passkeysWork: false,
      desktop: true,
      serverHost: "adas-mac-mini",
      busy: new Set<string>(),
      connected: false,
      people: {
        rename: async () => undefined,
        renameWorkspace: async () => undefined,
      } as unknown as YouProps["people"],
      onChangeRole: () => undefined,
      onRemovePerson: async () => undefined,
      onSignOut: () => undefined,
    } satisfies YouProps;
    const { rerender } = render(<You {...props} />);
    expect(screen.queryByTestId("feedback")).toBeNull();
    const { opened, feedback } = service();
    rerender(<You {...props} feedback={feedback} />);
    fireEvent.click(screen.getByTestId("feedback-row"));
    // No Main agent here: GitHub opens at once, with this build and the Mac named.
    expect(opened).toEqual([feedbackLink(`${BUILD} · Mac`)]);
  });
});

describe("the card", () => {
  it("says what it is for", () => {
    render(
      <FeedbackCard
        agent={MILO}
        directory={DIRECTORY}
        version={VERSION}
        service={service().feedback}
      />,
    );
    expect(screen.getByTestId("feedback").textContent).toContain(
      "Tell the people who make Chips what you'd change.",
    );
    expect(screen.getByTestId("feedback-row").textContent).toBe("Send feedback");
  });

  it("opens the dialog: the Main agent, GitHub, and that Chips sends nothing", () => {
    const { opened, feedback } = service();
    render(
      <FeedbackCard agent={MILO} directory={DIRECTORY} version={VERSION} service={feedback} />,
    );
    fireEvent.click(screen.getByTestId("feedback-row"));
    const dialog = screen.getByTestId("feedback-dialog");
    expect(dialog.textContent).toContain("Feedback for Chips");
    expect(screen.getByRole("button", { name: "Write it with Milo" })).toBe(
      screen.getByTestId("feedback-agent"),
    );
    expect(screen.getByRole("button", { name: "Write it on GitHub" })).toBe(
      screen.getByTestId("feedback-github"),
    );
    expect(dialog.textContent).toContain(FEEDBACK_SENDS_NOTHING);
    expect(opened).toEqual([]);
  });

  it("opens GitHub from the click itself, with the version filled in", () => {
    const { opened, written, feedback } = service();
    render(
      <FeedbackCard agent={MILO} directory={DIRECTORY} version={VERSION} service={feedback} />,
    );
    fireEvent.click(screen.getByTestId("feedback-row"));
    fireEvent.click(screen.getByTestId("feedback-github"));
    expect(opened).toEqual([feedbackLink(VERSION)]);
    expect(written).toEqual([]);
  });

  it("opens the Main space with the line once the dialog has folded", async () => {
    const { opened, written, feedback } = service();
    render(
      <FeedbackCard agent={MILO} directory={DIRECTORY} version={VERSION} service={feedback} />,
    );
    fireEvent.click(screen.getByTestId("feedback-row"));
    fireEvent.click(screen.getByTestId("feedback-agent"));
    expect(written).toEqual([]);
    await waitFor(() => expect(written).toEqual([MILO]));
    expect(screen.queryByTestId("feedback-dialog")).toBeNull();
    expect(opened).toEqual([]);
  });
});
