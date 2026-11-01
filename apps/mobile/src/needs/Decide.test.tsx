/**
 * The decision screen: everything wider than a thumb. The room's card is Approve and Deny at
 * scope `once`; this is where a scope beyond this one time, an edit, a reason and handing the
 * ask on live, and each of those is a different event on the wire.
 */

import type { Approval, Directory } from "@chipschat/core";
import { render, screen, userEvent } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { approval, snapshot } from "../testing/fixtures";
import { Decide, type DecisionInput } from "./Decide";
import { candidates } from "./HandOn";

const notify = Haptics.notificationAsync as jest.MockedFunction<typeof Haptics.notificationAsync>;
beforeEach(() => notify.mockClear());

const DIRECTORY: Directory = snapshot().directory;
const PEOPLE = snapshot().model.people;
const HAND_TO = candidates(DIRECTORY, ["per_arjun", "per_dana", "har_scout"], PEOPLE, "per_arjun");

function view(over: Partial<Approval> = {}, props: Partial<Parameters<typeof Decide>[0]> = {}) {
  const decided: DecisionInput[] = [];
  const handed: { to: string; reason: string | undefined }[] = [];
  const element = (
    <Decide
      approval={approval(over)}
      harnessName="Scout"
      directory={DIRECTORY}
      selfId="per_arjun"
      busy={false}
      now={Date.now()}
      onDecide={(input) => decided.push(input)}
      onHand={(to, reason) => handed.push({ to, reason })}
      handTo={HAND_TO}
      people={PEOPLE}
      {...props}
    />
  );
  return { element, decided, handed };
}

/** The one inside the form, not the one that opened it: both say Deny, which is the point. */
async function pressSecond(name: string): Promise<void> {
  const found = screen.getAllByRole("button", { name });
  const second = found[1];
  if (second === undefined) throw new Error(`only one ${name} button on screen`);
  await userEvent.press(second);
}

describe("an approval, in full", () => {
  it("says what is being asked, with its risks", async () => {
    const { element } = view({ to: "dana@northwind.com", preview: "Subject: PO #4471" });
    await render(element);
    expect(screen.getByText("email.send to dana@northwind.com")).toBeTruthy();
    expect(screen.getByText("Subject: PO #4471")).toBeTruthy();
    expect(screen.getByText("External message")).toBeTruthy();
  });

  it("asks the harness's question, with what a yes does, how long, and the preview under its title (ADR 0142)", async () => {
    const { element } = view({
      question: "Let Game of Life work in `~/JacobianSpaces/evolution-lab`?",
      effect: "It can run its seven fixed commands as your Mac user.",
      lasts: "standing",
      previewTitle: "Bind App workroot",
      preview: "Grant this App access to the folder.",
    });
    await render(element);
    expect(screen.getByText("~/JacobianSpaces/evolution-lab")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.getByText("It can run its seven fixed commands as your Mac user.")).toBeTruthy();
    expect(screen.getByText("Until you take it back")).toBeTruthy();
    // The question took the headline, so the preview keeps its own heading.
    expect(screen.getByText("Bind App workroot")).toBeTruthy();
    expect(screen.getByText("Grant this App access to the folder.")).toBeTruthy();
  });

  it("draws a Markdown preview as the room draws a message, fence and all (OpenClaw finding 7)", async () => {
    const { element } = view({
      preview: "```sh\ndate\n```\nin `/home/node/.openclaw/workspace`",
      previewFormat: "markdown",
      previewTitle: "Run a command",
    });
    await render(element);
    expect(screen.getByText("Run a command")).toBeTruthy();
    expect(screen.getByText("date")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.getByText("/home/node/.openclaw/workspace")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.queryByText(/`/)).toBeNull();
  });

  it("draws a diff as a code block, and words with no format as they were written", async () => {
    const diff = view({ preview: "-  120 units\n+  240 units", previewFormat: "diff" });
    await render(diff.element);
    expect(screen.getByText(/240 units/)).toHaveStyle({ fontFamily: "Menlo" });

    const plain = view({ preview: "Hi Dana, **as written**." });
    await render(plain.element);
    expect(screen.getByText("Hi Dana, **as written**.")).not.toHaveStyle({ fontFamily: "Menlo" });
  });

  it("approves at the scope that was chosen, not always at once", async () => {
    const { element, decided } = view();
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "Always" }));
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(decided).toEqual([{ decision: "approved", scope: "always" }]);
  });

  it("denies with the reason the harness gets to read, and without one when none is given", async () => {
    const first = view();
    await render(first.element);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await userEvent.type(screen.getByTestId("deny-input"), "Wrong supplier");
    await pressSecond("Deny");
    expect(first.decided).toEqual([
      { decision: "denied", scope: "once", reason: "Wrong supplier" },
    ]);

    const second = view();
    await render(second.element);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await pressSecond("Deny");
    expect(second.decided).toEqual([{ decision: "denied", scope: "once" }]);
  });

  it("approves with edits, carrying the rest of the input through", async () => {
    const { element, decided } = view({ preview: "Old body", input: { subject: "PO #4471" } });
    await render(element);
    await userEvent.press(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByTestId("edit-input"));
    await userEvent.type(screen.getByTestId("edit-input"), "New body");
    await userEvent.press(screen.getByRole("button", { name: "Approve with edits" }));
    expect(decided).toEqual([
      {
        decision: "edited",
        scope: "once",
        updatedInput: { subject: "PO #4471", body: "New body" },
      },
    ]);
  });

  it("offers no edit for an ask that cannot be edited", async () => {
    const { element } = view({ editable: false });
    await render(element);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("hands the ask on, with a word about why", async () => {
    const { element, handed } = view();
    await render(element);
    await userEvent.press(screen.getByRole("button", { name: "Hand to…" }));
    await userEvent.press(screen.getByRole("radio", { name: "Dana Ruiz" }));
    await userEvent.type(screen.getByTestId("hand-reason"), "She owns the supplier");
    await userEvent.press(screen.getByRole("button", { name: "Hand on" }));
    expect(handed).toEqual([{ to: "per_dana", reason: "She owns the supplier" }]);
  });

  it("offers nothing at all on somebody else's ask, and says whose", async () => {
    const { element } = view({ approvers: ["per_dana"] });
    await render(element);
    expect(screen.getByTestId("waiting-on")).toBeTruthy();
    expect(screen.getByText("Dana Ruiz answers this one.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("says who decided one that is already decided, and offers no second answer", async () => {
    const resolved = {
      decision: "denied",
      by: "per_dana",
      at: "2026-09-07T10:05:00.000Z",
      reason: "Wrong supplier",
    };
    const { element } = view({ resolved } as Partial<Approval>);
    await render(element);
    expect(screen.getByTestId("verdict")).toBeTruthy();
    expect(screen.getByText("Denied by Dana Ruiz — Wrong supplier")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("names the fallback that applied when one lapsed", async () => {
    const resolved = { decision: "expired", by: "system", at: "2026-09-07T10:05:00.000Z" };
    const { element } = view({ resolved, fallback: "allow" } as Partial<Approval>);
    await render(element);
    expect(screen.getByText("It lapsed, and policy let it through.")).toBeTruthy();
  });

  it("says when it was handed on, and by whom", async () => {
    const { element } = view({
      routedBy: "per_dana",
      approvers: ["per_arjun"],
      routedReason: "You own this one",
    });
    await render(element);
    expect(screen.getByText("Handed to Arjun by Dana Ruiz · You own this one")).toBeTruthy();
  });

  it("says when policy let the lane's lead answer", async () => {
    const { element } = view({ approvers: ["per_arjun", "har_scout"] });
    await render(element);
    expect(screen.getByText("Policy let Scout, the lead, answer this.")).toBeTruthy();
  });
});

describe("an ask that matters (ADR 0195)", () => {
  it("waits for you, offers no scope, says why, and is answered once", async () => {
    const { element, decided } = view({ matters: true });
    await render(element);
    expect(screen.getByTestId("waits-for-you")).toHaveTextContent("Waits for you");
    expect(screen.queryByRole("radio", { name: "Always" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "This session" })).toBeNull();
    expect(screen.getByTestId("once-only")).toHaveTextContent(
      "You answer asks like this each time, so there is no Always.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once" }]);
  });

  it("waits for a person when it is somebody else's to answer", async () => {
    const { element } = view({ matters: true, approvers: ["per_dana"] });
    await render(element);
    expect(screen.getByTestId("waits-for-you")).toHaveTextContent("Waits for a person");
  });

  it("stops saying it waits once it is answered", async () => {
    const resolved = { decision: "approved", by: "per_arjun", at: "2026-09-07T10:05:00.000Z" };
    const { element } = view({ matters: true, resolved } as Partial<Approval>);
    await render(element);
    expect(screen.queryByTestId("waits-for-you")).toBeNull();
  });

  it("offers the scopes as before for a smaller ask", async () => {
    const { element } = view();
    await render(element);
    expect(screen.queryByTestId("waits-for-you")).toBeNull();
    expect(screen.queryByTestId("once-only")).toBeNull();
    expect(screen.getByRole("radio", { name: "Always" })).toBeTruthy();
  });
});

describe("a command's yes beyond once (ADR 0239)", () => {
  const command = (line: string): Partial<Approval> => ({
    actionKind: "acp.execute",
    risk: [],
    input: { command: line },
  });

  it("remembers each part's start, and an owner's Always holds in every space", async () => {
    const { element, decided } = view(command("node --check game.js && echo ok"), {
      mayEverywhere: true,
      spaceName: "Bakery",
    });
    await render(element);
    // Nothing more under the choices while the yes is for this once.
    expect(screen.queryByTestId("standing")).toBeNull();
    await userEvent.press(screen.getByRole("radio", { name: "Always" }));
    expect(screen.getByText("node --check …")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.getByText("echo ok …")).toBeTruthy();
    expect(screen.getByTestId("reach")).toHaveTextContent(
      "Commands made only of these go ahead without a card in every space. Anything else still comes to you.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    await userEvent.press(screen.getByRole("radio", { name: "In this space" }));
    expect(screen.getByTestId("reach")).toHaveTextContent(/in Bakery\./);
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(decided).toEqual([
      { decision: "approved", scope: "always", everywhere: true },
      { decision: "approved", scope: "always" },
    ]);
  });

  it("keeps anybody else's Always to this space, and This session to the run", async () => {
    const { element, decided } = view(command("git status"), { spaceName: "Bakery" });
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "Always" }));
    expect(screen.queryByRole("radio", { name: "In every space" })).toBeNull();
    expect(screen.getByTestId("reach")).toHaveTextContent(/in Bakery\./);
    await userEvent.press(screen.getByRole("radio", { name: "This session" }));
    expect(screen.getByTestId("reach")).toHaveTextContent(/until this session ends\./);
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(decided).toEqual([{ decision: "approved", scope: "session" }]);
  });

  it("answers once a command it can't read, or one that uses rm, and says why", async () => {
    const unread = view(command("echo hi > out.txt"));
    await render(unread.element);
    expect(screen.queryByRole("radio", { name: "Always" })).toBeNull();
    expect(screen.getByTestId("once-only")).toHaveTextContent(
      "This command does more than Chips can read, so it's answered each time.",
    );
    const listed = view(command("ls && rm -rf build"));
    await render(listed.element);
    expect(screen.getByTestId("once-only")).toHaveTextContent(
      "Asks that use rm are answered each time.",
    );
  });
});

describe("an ask its harness settled itself (ADR 0195)", () => {
  const settled = (by: string) =>
    ({
      resolved: { decision: "approved", by, at: "2026-09-07T10:05:00.000Z", scope: "once" },
    }) as Partial<Approval>;

  it("says it was answered in the harness's own tools", async () => {
    const { element } = view(settled("har_scout"), { harnessId: "har_scout" });
    await render(element);
    expect(screen.getByTestId("own-tools")).toHaveTextContent(
      "Answered by Scout in its own tools.",
    );
  });

  it("says nothing of the kind for one a person answered", async () => {
    const { element } = view(settled("per_dana"), { harnessId: "har_scout" });
    await render(element);
    expect(screen.queryByTestId("own-tools")).toBeNull();
  });
});

describe("who an ask can be handed to", () => {
  it("offers the space, then the workspace, then the standing refs", () => {
    expect(HAND_TO.map((each) => each.value)).toEqual([
      "per_dana",
      "role:admin",
      "role:owner",
      "any",
      "lead",
    ]);
  });

  it("leaves guests out, because a guest is in one space and answers there", () => {
    const people = {
      ...PEOPLE,
      per_sam: { participantId: "per_sam", displayName: "Sam", role: "guest" },
    } as unknown as typeof PEOPLE;
    const offered = candidates(DIRECTORY, ["per_arjun"], people, "per_arjun");
    expect(offered.map((each) => each.value)).not.toContain("per_sam");
  });

  it("reaches past the space, because being named is standing enough (ADR 0042)", () => {
    const offered = candidates(DIRECTORY, ["per_arjun"], PEOPLE, "per_arjun");
    expect(offered.find((each) => each.value === "per_dana")?.description).toBe(
      "Not in this space",
    );
  });
});

describe("the answer, in the hand", () => {
  it("feels the same here as it does on the card in the room", async () => {
    await render(view().element);
    await userEvent.press(screen.getByRole("button", { name: "Approve" }));
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  });

  // An edit is still a yes. What the thumb is being told is that the ask was answered and how,
  // not which of the two screens it was answered on or whether the words were changed first.
  it("counts an approval with edits as the yes it is", async () => {
    const { element } = view({ preview: "Old body", input: { subject: "PO #4471" } });
    await render(element);
    await userEvent.press(screen.getByRole("button", { name: "Edit" }));
    await userEvent.press(screen.getByRole("button", { name: "Approve with edits" }));
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("warns for a denial rather than crying error over somebody's decision", async () => {
    await render(view().element);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await pressSecond("Deny");
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
    expect(notify).not.toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });
});
