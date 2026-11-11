/**
 * The decision screen: everything wider than a thumb. The room's card is Approve and Deny at
 * scope `once`; this is where a scope beyond this one time, an edit, a reason and handing the
 * ask on live, and each of those is a different event on the wire.
 */

import type { Approval, Directory } from "@chipschat/core";
import { fireEvent, render as renderBare, screen, userEvent } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import type { ReactElement, ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { approval, snapshot } from "../testing/fixtures";
import { Decide, type DecisionInput } from "./Decide";
import { candidates } from "./HandOn";

/** The tray stands clear of the home indicator, so the screen is drawn on a phone that has one. */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const notify = Haptics.notificationAsync as jest.MockedFunction<typeof Haptics.notificationAsync>;
beforeEach(() => notify.mockClear());

const DIRECTORY: Directory = snapshot().directory;
const PEOPLE = snapshot().model.people;
const SPACE = { members: ["per_arjun", "per_dana", "har_scout"], roles: {} };
const HAND_TO = candidates({
  directory: DIRECTORY,
  space: SPACE,
  people: PEOPLE,
  selfId: "per_arjun",
  lane: false,
});

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

/**
 * Deny opens its form in the tray's place, and the form's own Deny sends: one Deny on the screen
 * at a time, the opener and then the sender.
 */
async function denyInForm(): Promise<void> {
  expect(screen.getByTestId("deny-form")).toBeTruthy();
  await userEvent.press(screen.getByRole("button", { name: "Deny" }));
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
    await userEvent.press(screen.getByRole("button", { name: "Approve always" }));
    expect(decided).toEqual([{ decision: "approved", scope: "always" }]);
  });

  it("denies with the reason the harness gets to read, and without one when none is given", async () => {
    const first = view();
    await render(first.element);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await userEvent.type(screen.getByTestId("deny-input"), "Wrong supplier");
    await denyInForm();
    expect(first.decided).toEqual([
      { decision: "denied", scope: "once", reason: "Wrong supplier" },
    ]);

    const second = view();
    await render(second.element);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await denyInForm();
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
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
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
    expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
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
    expect(screen.queryByRole("radio", { name: "For an hour" })).toBeNull();
    // Nor does the agent get let work without asking on it (ADR 0281).
    expect(screen.queryByTestId("let-work")).toBeNull();
    expect(screen.getByTestId("once-only")).toHaveTextContent(
      "You answer asks like this each time, so there is no Always.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Approve once" }));
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

  it("lights the words Always keeps in the command, and an owner's Always holds in every space", async () => {
    const { element, decided } = view(command("node --check game.js && echo ok"), {
      mayEverywhere: true,
      spaceName: "Bakery",
    });
    await render(element);
    // Nothing under the choices while the yes is for this once, and nothing lit.
    expect(screen.queryByTestId("reach")).toBeNull();
    expect(screen.queryAllByTestId("lit-words")).toHaveLength(0);
    expect(screen.getAllByTestId("start-words")).toHaveLength(2);
    await userEvent.press(screen.getByRole("radio", { name: "Always" }));
    expect(screen.getByText("node --check")).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.getAllByTestId("lit-words")).toHaveLength(2);
    expect(screen.queryByTestId("remembers")).toBeNull();
    expect(screen.getByTestId("reach")).toHaveTextContent(
      "Commands made only of the lit words go ahead without a card in every space. Anything else still comes to you.",
    );
    await userEvent.press(screen.getByRole("radio", { name: "In this space" }));
    expect(screen.getByTestId("reach")).toHaveTextContent(/in Bakery\./);
    await userEvent.press(screen.getByRole("button", { name: "Approve always" }));
    expect(decided).toEqual([{ decision: "approved", scope: "always" }]);
    // Approve turns to what was given, and takes no second press.
    expect(screen.getByRole("button", { name: "Always, in Bakery" })).toBeDisabled();
  });

  it("sends an owner's Always for every space unless they pick this one", async () => {
    const { element, decided } = view(command("git status"), { mayEverywhere: true });
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "Always" }));
    await userEvent.press(screen.getByRole("button", { name: "Approve always" }));
    expect(decided).toEqual([{ decision: "approved", scope: "always", everywhere: true }]);
    expect(screen.getByRole("button", { name: "Always, in every space" })).toBeTruthy();
  });

  it("keeps anybody else's Always to this space, and draws the hour For an hour gives", async () => {
    const { element, decided } = view(command("git status"), { spaceName: "Bakery" });
    await render(element);
    expect(screen.queryByRole("radio", { name: "This session" })).toBeNull();
    await userEvent.press(screen.getByRole("radio", { name: "Always" }));
    expect(screen.queryByRole("radio", { name: "In every space" })).toBeNull();
    expect(screen.getByTestId("reach")).toHaveTextContent(/in Bakery\./);
    await userEvent.press(screen.getByRole("radio", { name: "For an hour" }));
    expect(screen.queryByTestId("reach")).toBeNull();
    expect(screen.getByTestId("hour-strip")).toHaveTextContent(
      /^Now, \d{1,2}:\d\d [AP]MUntil \d{1,2}:\d\d [AP]M$/,
    );
    expect(screen.getByTestId("for-a-while")).toHaveTextContent(
      "Everything Scout asks in this space goes ahead without a card for the hour, commands Chips can't read too. Anything that moves money, messages someone outside, or can't be undone still comes to you.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Approve for an hour" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once", forMinutes: 60 }]);
    expect(screen.getByRole("button", { name: /^Until \d{1,2}:\d\d [AP]M$/ })).toBeTruthy();
  });

  it("sends a no picked under For an hour as a no this once", async () => {
    const { element, decided } = view(command("git status"));
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "For an hour" }));
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await denyInForm();
    expect(decided).toEqual([{ decision: "denied", scope: "once" }]);
  });

  it("keeps no Always for a command that writes a file, or uses rm, but still gives it the hour (ADR 0281)", async () => {
    const writes = view(command("echo hi > out.txt"));
    await render(writes.element);
    expect(screen.queryByRole("radio", { name: "Always" })).toBeNull();
    expect(screen.getByTestId("once-only")).toHaveTextContent(
      "This writes to out.txt, so there is no Always for it.",
    );
    expect(screen.getByText("out.txt", { exact: true })).toHaveStyle({ fontFamily: "Menlo" });
    expect(screen.getByTestId("writes-words")).toHaveTextContent("> out.txt");
    expect(screen.getByTestId("once-dot")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve once" })).toBeTruthy();
    // For an hour reaches it, and the line under Once goes as it is picked.
    await userEvent.press(screen.getByRole("radio", { name: "For an hour" }));
    expect(screen.queryByTestId("once-only")).toBeNull();
    await userEvent.press(screen.getByRole("button", { name: "Approve for an hour" }));
    expect(writes.decided).toEqual([{ decision: "approved", scope: "once", forMinutes: 60 }]);
    const listed = view(command("ls && rm -rf build"));
    await render(listed.element);
    expect(screen.getByTestId("once-only")).toHaveTextContent(
      "There is no Always for asks that use rm.",
    );
    expect(screen.getByTestId("never-words")).toHaveTextContent("rm -rf");
  });
});

describe("letting the agent work without asking (ADR 0281)", () => {
  const unread: Partial<Approval> = {
    actionKind: "acp.execute",
    risk: [],
    input: { command: "for r in a b; do head -3 $r; done" },
  };

  it("offers neither the switch nor the hour to a server that wouldn't keep them", async () => {
    const { element, decided } = view({}, { keepsHeldYes: false });
    await render(element);
    expect(screen.queryByTestId("let-work")).toBeNull();
    expect(screen.queryByRole("radio", { name: "For an hour" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Always" })).toBeTruthy();
    await userEvent.press(screen.getByRole("button", { name: "Approve once" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once" }]);
  });

  it("folds the choices away under the switch, and Approve lets it work until stopped", async () => {
    const { element, decided } = view(unread, { spaceName: "Chips explain" });
    await render(element);
    expect(screen.getByTestId("let-work")).toHaveTextContent(
      "Let Scout work without askingIn Chips explain, until you stop it",
    );
    expect(screen.getByRole("radio", { name: "For an hour" })).toBeTruthy();
    await userEvent.press(screen.getByRole("radio", { name: "For an hour" }));
    await fireEvent(screen.getByTestId("let-work-switch"), "valueChange", true);
    expect(screen.queryByTestId("lasting")).toBeNull();
    expect(screen.queryByTestId("hour-strip")).toBeNull();
    expect(screen.getByTestId("until-stopped")).toHaveTextContent(
      "Everything Scout asks here goes ahead without a card until you stop it, commands Chips can't read too. Anything that moves money, messages someone outside, or can't be undone still comes to you.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Approve and let it work" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once", untilStopped: true }]);
    expect(screen.getByRole("button", { name: "Until you stop it" })).toBeDisabled();
  });

  it("gives the choice back as it was when the switch goes off, and a no is a no this once", async () => {
    const { element, decided } = view(unread);
    await render(element);
    await userEvent.press(screen.getByRole("radio", { name: "For an hour" }));
    const flip = (on: boolean) =>
      fireEvent(screen.getByTestId("let-work-switch"), "valueChange", on);
    await flip(true);
    expect(screen.getByRole("button", { name: "Approve and let it work" })).toBeTruthy();
    await flip(false);
    expect(screen.getByRole("radio", { name: "For an hour", checked: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve for an hour" })).toBeTruthy();
    await flip(true);
    await userEvent.press(screen.getByRole("button", { name: "Deny" }));
    await denyInForm();
    expect(decided).toEqual([{ decision: "denied", scope: "once" }]);
  });
});

describe("a command on its plate (ADR 0280)", () => {
  const IKE =
    "cd /Users/me/Work/Chips/chips-main; ls -la; git log --oneline | wc -l; cat package.json 2>/dev/null | head -60";
  const ike: Partial<Approval> = {
    actionKind: "acp.execute",
    risk: [],
    question: `Inspect the main Chips repo layout? \`${IKE.slice(0, 60)}…\``,
    input: { command: IKE, description: "Inspect the main Chips repo layout" },
    preview: JSON.stringify({ command: IKE, description: "Inspect the main Chips repo layout" }),
    previewFormat: "json",
  };

  it("draws the command a part to a line under the question, and not again as JSON", async () => {
    await render(view(ike).element);
    expect(screen.getByTestId("ask-headline")).toHaveTextContent(
      "Inspect the main Chips repo layout?",
    );
    expect(
      screen.getAllByTestId("plate-part").map((part) => part.props["accessibilityLabel"]),
    ).toEqual([
      "cd /Users/me/Work/Chips/chips-main",
      "then ls -la",
      "then git log --oneline",
      "piped to wc -l",
      "then cat package.json 2>/dev/null",
      "piped to head -60",
    ]);
    expect(screen.getByTestId("dropped-words")).toHaveTextContent("2>/dev/null");
    expect(screen.getByTestId("plate-caption")).toHaveTextContent(
      "6 parts. Chips reads each one, and 2>/dev/null writes no file.",
    );
    expect(screen.queryByText(/"command"/)).toBeNull();
    // A command is once by its nature, and Approve says so.
    expect(screen.queryByText("Just this once")).toBeNull();
  });

  it("says when it lapses here, unless the bar's ring does", async () => {
    const soon = { ...ike, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    await render(view(soon).element);
    expect(screen.getByText(/if you don't answer$/)).toBeTruthy();
    await render(view(soon, { timeInBar: true }).element);
    expect(screen.queryByText(/if you don't answer$/)).toBeNull();
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
  it("offers the space, then the workspace, then only the standings that reach somebody else", () => {
    expect(HAND_TO.map((each) => each.value)).toEqual(["per_dana", "any"]);
    const lane = candidates({
      directory: DIRECTORY,
      space: { ...SPACE, roles: { per_dana: "owner" } },
      people: PEOPLE,
      selfId: "per_arjun",
      lane: true,
    });
    expect(lane.map((each) => each.value)).toEqual(["per_dana", "role:owner", "any", "lead"]);
  });

  it("offers no Hand to… when nobody but the reader could answer (6 November 2026)", async () => {
    const alone = candidates({
      directory: DIRECTORY,
      space: { members: ["per_arjun", "har_scout"], roles: {} },
      people: { per_arjun: PEOPLE["per_arjun"] } as typeof PEOPLE,
      selfId: "per_arjun",
      lane: false,
    });
    expect(alone).toEqual([]);
    await render(view({}, { handTo: alone }).element);
    expect(screen.queryByRole("button", { name: "Hand to…" })).toBeNull();
  });

  it("leaves guests out, because a guest is in one space and answers there", () => {
    const people = {
      ...PEOPLE,
      per_sam: { participantId: "per_sam", displayName: "Sam", role: "guest" },
    } as unknown as typeof PEOPLE;
    const offered = candidates({
      directory: DIRECTORY,
      space: { members: ["per_arjun"], roles: {} },
      people,
      selfId: "per_arjun",
      lane: false,
    });
    expect(offered.map((each) => each.value)).not.toContain("per_sam");
  });

  it("reaches past the space, because being named is standing enough (ADR 0042)", () => {
    const offered = candidates({
      directory: DIRECTORY,
      space: { members: ["per_arjun"], roles: {} },
      people: PEOPLE,
      selfId: "per_arjun",
      lane: false,
    });
    expect(offered.find((each) => each.value === "per_dana")?.description).toBe(
      "Not in this space",
    );
    // Dana is out of the space, so no standing reaches anybody but the reader.
    expect(offered.map((each) => each.value)).toEqual(["per_dana"]);
  });
});

describe("Luis's ask, polished (10 November 2026)", () => {
  const LUIS = "pkill -f old ; sleep 1; rm -rf /tmp/luis; ls -d /tmp/luis 2>&1 | wc -l";
  const luis = {
    actionKind: "jacobian.shell.shell",
    input: LUIS,
    question: "Run this command?",
    lasts: "once" as const,
    preview: LUIS,
    previewFormat: "plain" as const,
    previewTitle: "shell · shell",
    risk: ["destructive"],
    // The server marks a destructive ask as one that matters (ADR 0195); the fixture says so.
    matters: true,
    editable: false,
  };

  it("draws a shell command sent as bare words on its plate, not as words under shell · shell", async () => {
    await render(view(luis).element);
    expect(screen.getAllByTestId("plate-part")).toHaveLength(5);
    expect(screen.queryByText("shell · shell")).toBeNull();
    expect(screen.queryByText(LUIS)).toBeNull();
    // Answered once, as an ask that matters is, with the never words marked in the tray's line.
    expect(screen.getByTestId("once-dot")).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Always" })).toBeNull();
  });

  it("puts its tags in one row: the risk, then that it waits for you", async () => {
    await render(view(luis).element);
    expect(screen.getByTestId("ask-tags")).toHaveTextContent("DestructiveWaits for you");
  });

  it("offers Hand to… and Open the space as rows of one group", async () => {
    const opened: number[] = [];
    const { element, handed } = view(luis, {
      spaceName: "Health",
      onOpenSpace: () => opened.push(1),
    });
    await render(element);
    const ways = screen.getByTestId("ask-ways");
    expect(ways).toHaveTextContent(/Hand to….*Open the space.*Health/);
    await userEvent.press(screen.getByRole("button", { name: "Open the space" }));
    expect(opened).toEqual([1]);
    await userEvent.press(screen.getByRole("button", { name: "Hand to…" }));
    await userEvent.press(screen.getByRole("radio", { name: "Dana Ruiz" }));
    await userEvent.press(screen.getByRole("button", { name: "Hand on" }));
    expect(handed).toEqual([{ to: "per_dana", reason: undefined }]);
  });

  it("draws no group where there is nowhere else to go", async () => {
    await render(view(luis, { handTo: [] }).element);
    expect(screen.queryByTestId("ask-ways")).toBeNull();
  });
});

describe("the answer, in the hand", () => {
  it("feels the same here as it does on the card in the room", async () => {
    await render(view().element);
    await userEvent.press(screen.getByRole("button", { name: "Approve once" }));
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
    await denyInForm();
    expect(notify).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
    expect(notify).not.toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
  });
});
