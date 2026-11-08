/**
 * The ask's card, under Jest, as the room draws it at its foot.
 *
 * These were the queue's tests until For you was withdrawn (ADR 0065); the card outlived it, so
 * what they proved about the card is proved here instead. Not the layout: that the right things
 * are on it at all, that a tap hands over the decision it says, that no decision is offered when
 * the room has none to give, and that the two answers feel different in the hand.
 */

import { render, screen, userEvent } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { approval, needsItem, snapshot } from "../testing/fixtures";
import { NeedsCard, type NeedsCardProps } from "./NeedsCard";

const notify = Haptics.notificationAsync as jest.MockedFunction<typeof Haptics.notificationAsync>;

beforeEach(() => {
  notify.mockClear();
});

function draw(over: Partial<NeedsCardProps> = {}) {
  return render(
    <NeedsCard item={needsItem()} snapshot={snapshot()} now={Date.now()} busy={false} {...over} />,
  );
}

describe("the ask's card", () => {
  it("shows a summary's words, not the marks the harness wrote them with", async () => {
    const item = needsItem({
      kind: "summary",
      tier: "review",
      id: "sum_1",
      title: "The stop is **2421 Golden Hill Rd**, Paso Robles.",
    });
    await draw({ item });
    expect(screen.getByText("The stop is 2421 Golden Hill Rd, Paso Robles.")).toBeTruthy();
  });

  it("keeps a long one to three lines, so the cards under it stay on the screen", async () => {
    const title = "One sentence. ".repeat(60);
    await draw({ item: needsItem({ kind: "summary", tier: "review", id: "sum_2", title }) });
    expect(screen.getByText(title.trim()).props["numberOfLines"]).toBe(3);
  });

  it("hands over the decision it says", async () => {
    const onDecide = jest.fn();
    await draw({ onDecide });
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    expect(onDecide.mock.calls.map(([asked, decision]) => [asked.approvalId, decision])).toEqual([
      ["apr_1", "approved"],
      ["apr_1", "denied"],
    ]);
  });

  it("offers no decision when the room has none to give", async () => {
    // Somebody else's ask, or one already answered: the room leaves `onDecide` off.
    await draw();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });

  it("draws a command a few parts deep, and not again as JSON (ADR 0280)", async () => {
    const command =
      "cd /room; ls -la; git log --oneline | wc -l; cat package.json 2>/dev/null | head -60";
    await draw({
      snapshot: snapshot({
        approvals: [
          approval({
            actionKind: "acp.execute",
            risk: [],
            question: `Look around the room? \`${command.slice(0, 30)}…\``,
            input: { command },
            preview: JSON.stringify({ command }),
            previewFormat: "json",
            lasts: "once",
          }),
        ],
      }),
    });
    expect(screen.getByTestId("ask-headline")).toHaveTextContent("Look around the room?");
    expect(screen.getAllByTestId("plate-part")).toHaveLength(4);
    expect(screen.getByTestId("plate-more")).toHaveTextContent("and 2 more parts");
    expect(screen.queryByTestId("plate-caption")).toBeNull();
    expect(screen.queryByText(/"command"/)).toBeNull();
    expect(screen.queryByText("Just this once")).toBeNull();
  });

  it("shows the risks and what lapsing would mean", async () => {
    await draw({
      item: needsItem({ expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() }),
      snapshot: snapshot({
        approvals: [approval({ risk: ["financial", "external"], fallback: "allow" })],
      }),
    });
    expect(screen.getByText("Money")).toBeTruthy();
    expect(screen.getByText("External")).toBeTruthy();
    expect(screen.getByText("Goes ahead in 20 min if you don't answer")).toBeTruthy();
  });

  it("leads with the harness's question, what a yes does and how long it lasts (ADR 0142)", async () => {
    await draw({
      item: needsItem({ expiresAt: new Date(Date.now() + 23 * 3_600_000).toISOString() }),
      snapshot: snapshot({
        approvals: [
          approval({
            actionKind: "jacobian.kit_write.kit_write_connectors_robinhood_yaml",
            question: "Turn off the Robinhood connector?",
            effect: "Its 73 tools disappear from every Space.",
            lasts: "standing",
            risk: [],
          }),
        ],
      }),
    });
    expect(screen.getByText("Scout asks")).toBeTruthy();
    expect(screen.getByText("Turn off the Robinhood connector?")).toBeTruthy();
    expect(screen.getByText("Its 73 tools disappear from every Space.")).toBeTruthy();
    expect(screen.getByText("Until you take it back")).toBeTruthy();
    expect(screen.getByText("Denied in 23 h if you don't answer")).toBeTruthy();
    // The policy engine's word for it is not a person's, so it is not on the card.
    expect(screen.queryByText(/kit_write/)).toBeNull();
  });

  it("sets a command named in the question in mono, and says a one-off is a one-off", async () => {
    await draw({
      snapshot: snapshot({
        approvals: [approval({ question: "Let OpenClaw run `date`?", lasts: "once" })],
      }),
    });
    expect(screen.getByText("date")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.queryByText(/`/)).toBeNull();
    expect(screen.getByText("Just this once")).toBeTruthy();
  });

  it("is headed by the preview's title when no question was asked, its fence drawn as code", async () => {
    await draw({
      snapshot: snapshot({
        approvals: [
          approval({
            actionKind: "shell.exec",
            previewTitle: "Run a command",
            preview: "```sh\nnpm test\n```\nin `/workspace/chess`",
            previewFormat: "markdown",
          }),
        ],
      }),
    });
    expect(screen.getByText("Run a command")).toBeTruthy();
    expect(screen.getByText("npm test")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.queryByText("shell.exec")).toBeNull();
    // Nothing said how long a yes lasts, so the card does not guess.
    expect(screen.queryByTestId("ask-lasts")).toBeNull();
  });

  it("falls back to the action's kind when the harness gave nothing better", async () => {
    await draw({ snapshot: snapshot({ approvals: [approval({ to: "dana@northwind.com" })] }) });
    expect(screen.getByText("email.send to dana@northwind.com")).toBeTruthy();
  });

  it("opens the ask's own screen on Details", async () => {
    const onDetails = jest.fn();
    await draw({ onDetails });
    await userEvent.press(screen.getByRole("button", { name: "Details" }));
    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it("offers no Details for an ask from a space you're not in, where the card is all of it", async () => {
    await draw({ item: needsItem({ outside: true }), onDetails: jest.fn() });
    expect(screen.getByText("In a space you're not in")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Details" })).toBeNull();
  });

  it("greys the buttons while a decision is on its way", async () => {
    await draw({ busy: true, onDecide: jest.fn() });
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  });
});

/**
 * The answer, in the hand: the moment somebody's thumb changed what a harness is allowed to do.
 * The two answers feel different from each other, and neither feels like a failure, which the
 * system's error pattern would say and nobody meant.
 *
 * What the swipe does is not here: the swipeable is mocked away under Node (`jest.setup.js`),
 * and the click at the line where letting go decides is `needs/Crossing.tsx`, which is mocked
 * with it. The Maestro flow is where a real thumb is asked.
 */
describe("the answer, in the hand", () => {
  it("feels like success for a yes", async () => {
    await draw({ onDecide: jest.fn() });
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("feels like a warning for a no, and never like an error", async () => {
    await draw({ onDecide: jest.fn() });
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
    expect(notify).not.toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });

  it("stays quiet on an ask that is not this person's to answer", async () => {
    await draw();
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(notify).not.toHaveBeenCalled();
  });
});
