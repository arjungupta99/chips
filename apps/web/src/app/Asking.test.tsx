/**
 * When it asks you on the desktop (ADR 0195): the harness card's section, You's Allowed always card,
 * and the ask card's lines. Each rendered on its own against a hand-made model; what a browser
 * paints, the dust and the motion, and the real round trip through the server are the Playwright
 * suite's (`e2e/when-it-asks.spec.ts`).
 */

import type {
  Approval,
  Directory,
  SetRulesInput,
  StopLetWorkInput,
  WorkspaceModel,
  WorkspaceRole,
} from "@chipschat/core";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Asking } from "./Asking.tsx";
import { Decide, type DecisionInput } from "./Decide.tsx";
import { AllowedAlwaysForm } from "./you/AllowedAlways.tsx";

const ARJUN = "per_arjun";
const DANA = "per_dana";
const KIT = "har_kit";

const SHELL = {
  match: "shell.exec",
  decision: "allow",
  made_by: ARJUN,
  made_at: "2026-10-12T09:00:00.000Z",
};
const DRAFT = {
  match: "email.draft",
  decision: "allow",
  made_by: ARJUN,
  made_at: "2026-10-14T09:00:00.000Z",
};

const directory: Directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana Ruiz" },
  [KIT]: { id: KIT, kind: "harness", displayName: "Kit", ownerId: ARJUN },
} as unknown as Directory;

const asked = (id: string, askedAt: string, resolved?: unknown) => ({
  approvalId: id,
  askedAt,
  actionKind: "shell.exec",
  risk: [],
  sources: [],
  approvers: [ARJUN],
  editable: false,
  fallback: "deny",
  ...(resolved === undefined ? {} : { resolved }),
});

/** Kit, Arjun's, its rules as given, read by Arjun at `role`; three asks answered. */
function model(
  over: {
    role?: WorkspaceRole;
    rules?: unknown[];
    room?: unknown[];
    asks?: unknown[];
    letWork?: unknown[];
  } = {},
): WorkspaceModel {
  return {
    people: {
      [ARJUN]: { participantId: ARJUN, displayName: "Arjun", role: over.role ?? "owner" },
    },
    harnesses: {
      [KIT]: {
        harnessId: KIT,
        autonomy: 1,
        maxAutonomy: 2,
        rules: over.rules ?? [SHELL],
        bySpace: over.room === undefined ? {} : { sp_1: { autonomy: 1, rules: over.room } },
        spentUsd: 0,
      },
    },
    spaces: [
      {
        id: "sp_1",
        title: "Bakery",
        state: "open",
        members: [ARJUN, KIT],
        ...(over.letWork === undefined ? {} : { letWork: over.letWork }),
        runs: [
          {
            runId: "run_1",
            harnessId: KIT,
            startedAt: "2026-09-06T09:00:00.000Z",
            approvals: over.asks ?? [
              asked("a1", "2026-09-06T09:00:00.000Z", {
                by: ARJUN,
                decision: "approved",
                scope: "once",
              }),
              asked("a2", "2026-09-07T09:00:00.000Z", {
                by: ARJUN,
                decision: "approved",
                scope: "always",
              }),
              asked("a3", "2026-09-08T09:00:00.000Z", {
                by: ARJUN,
                decision: "denied",
                scope: "once",
              }),
            ],
          },
        ],
      },
    ],
  } as unknown as WorkspaceModel;
}

function section(over: Parameters<typeof model>[0] = {}, read = false) {
  const sent: SetRulesInput[] = [];
  const opened: string[] = [];
  const shown = render(
    <Asking
      model={model(over)}
      directory={directory}
      harnessId={KIT}
      selfId={ARJUN}
      onOpenSpace={(spaceId) => opened.push(spaceId)}
      {...(read ? {} : { onSetRules: (input: SetRulesInput) => sent.push(input) })}
    />,
  );
  return { sent, shown, opened };
}

describe("When it asks you, on the harness card", () => {
  it("says who decides when and who decides the answer, and the three promises", () => {
    section();
    expect(screen.getByTestId("asking-hero")).toBeTruthy();
    expect(screen.getByTestId("asking-headline").textContent).toBe(
      "Kit decides when to ask. You decide the answer.",
    );
    expect(screen.getByTestId("asking-sub").textContent).toMatch(/^Its asks come to you/);
    expect(screen.getByTestId("asking-promise-big").textContent).toContain(
      "The big ones wait for you",
    );
    expect(screen.getByTestId("asking-promise-window")).toBeTruthy();
    expect(screen.getByTestId("asking-promise-silence")).toBeTruthy();
  });

  it("lists what was allowed always, newest first, with who, where and when", () => {
    section({ room: [DRAFT] });
    const list = screen.getByTestId("asking-always");
    expect([...list.querySelectorAll("code")].map((each) => each.textContent)).toEqual([
      "email.draft",
      "shell.exec",
    ]);
    // What each allows in words first, and where it holds before who made it.
    expect([...list.querySelectorAll("b")].map((each) => each.textContent)).toEqual([
      "Draft email",
      // A rule that lets every command through, which only a policy written another way makes.
      "Any command",
    ]);
    expect(within(list).getByText(/^In Bakery · by you, 14 October/)).toBeTruthy();
    expect(within(list).getByText(/^In every space · by you, 12 October/)).toBeTruthy();
    expect(screen.getByTestId("asking-count").textContent).toBe("2 on");
    expect(screen.getByTestId("asking-always-foot")).toBeTruthy();
  });

  it("names a command's rule by its start, in code (ADR 0239)", () => {
    section({ rules: [{ ...SHELL, when: { starts_with: ["node", "--check"] } }] });
    const list = screen.getByTestId("asking-always");
    expect([...list.querySelectorAll("code")].map((each) => each.textContent)).toEqual([
      "node --check …",
      "shell.exec",
    ]);
    expect(within(list).getByText(/^In every space · by you, 12 October/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Allow node --check … always" })).toBeTruthy();
  });

  it("says nothing is allowed always when nothing is", () => {
    section({ rules: [] });
    expect(screen.getByTestId("asking-always-empty").textContent).toMatch(/^Nothing yet/);
    expect(screen.queryByTestId("asking-count")).toBeNull();
  });

  it("switches a rule off, keeping it, and the switch stays off before the server echoes", () => {
    const { sent } = section();
    const toggle = screen.getByRole("switch", { name: "Allow shell.exec always" });
    fireEvent.click(toggle);
    expect(sent).toEqual([{ harnessId: KIT, rules: [{ ...SHELL, off: true }] }]);
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("Off · Kit asks again")).toBeTruthy();
    expect(screen.getByTestId("asking-count").textContent).toBe("0 of 1 on");
  });

  it("removes a rule into dust with its ×, and Undo puts it back where it was", async () => {
    const { sent } = section({ rules: [SHELL, DRAFT] });
    // jsdom lays nothing out, so the dust has nothing to draw over and the row goes at once.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove email.draft" }));
    });
    expect(sent).toEqual([{ harnessId: KIT, rules: [SHELL] }]);
    expect(screen.queryByText("email.draft")).toBeNull();
    expect(screen.getByTestId("undo-pill").textContent).toContain("Removed");

    fireEvent.click(screen.getByTestId("undo-pill-undo"));
    expect(sent.at(-1)).toEqual({ harnessId: KIT, rules: [SHELL, DRAFT] });
    expect(screen.getByText("email.draft")).toBeTruthy();
  });

  it("shows a member the list with still switches and no ×, and sends nothing (SEC-1)", () => {
    const { sent } = section({ role: "member" });
    const toggle = screen.getByRole("switch", { name: "Allow shell.exec always" });
    expect((toggle as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(sent).toEqual([]);
  });

  it("is read only where nothing can be sent", () => {
    section({}, true);
    expect(
      (screen.getByRole("switch", { name: "Allow shell.exec always" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
  });

  it("draws a dot for each ask, and says who answered them", () => {
    section();
    expect(screen.getByTestId("asking-dot-yes")).toBeTruthy();
    expect(screen.getByTestId("asking-dot-session")).toBeTruthy();
    expect(screen.getByTestId("asking-dot-no")).toBeTruthy();
    expect(screen.getByTestId("asking-history").textContent).toContain(
      "3 asks since 6 September · all answered by you",
    );
  });

  it("has no dots before the harness has asked anything", () => {
    section({ asks: [] });
    expect(screen.queryByTestId("asking-history")).toBeNull();
  });

  it("keys the dots, and opens every ask out of them (ADR 0255)", async () => {
    const at = (day: number, minute = 0) =>
      new Date(Date.UTC(2026, 8, day, 16, minute)).toISOString();
    const { opened } = section({
      asks: [
        asked("a1", at(6), { by: ARJUN, decision: "approved", scope: "once", at: at(6, 2) }),
        asked("a2", at(7), { by: ARJUN, decision: "approved", scope: "always", at: at(7, 1) }),
        {
          ...asked("a3", at(8), { by: ARJUN, decision: "denied", scope: "once", at: at(8, 7) }),
          question: "Run `rm -rf build`?",
          preview: "rm -rf build",
          previewFormat: "json",
        },
      ],
    });
    const dots = screen.getByTestId("asking-history");
    expect(screen.getByTestId("asking-key").textContent).toBe("2 yes1 no");
    expect(dots.textContent).toMatch(/^Asks so farSee all/);
    fireEvent.click(dots);
    const dialog = await screen.findByTestId("asks-dialog");
    expect(within(dialog).getByRole("heading", { name: "Kit's asks" })).toBeTruthy();
    const rows = within(dialog)
      .getAllByRole("button")
      .filter((each) => each.dataset["testid"]?.startsWith("ask-row-"));
    expect(rows.map((each) => each.dataset["testid"])).toEqual([
      "ask-row-a3",
      "ask-row-a2",
      "ask-row-a1",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("rm -rf build").tagName).toBe("CODE");
    expect(rows[1]?.textContent).toContain("You said yes always · Kit in Bakery");

    fireEvent.click(within(dialog).getByLabelText("No 1"));
    expect(within(dialog).queryByTestId("ask-row-a1")).toBeNull();
    fireEvent.click(within(dialog).getByTestId("ask-row-a3"));
    const verdict = within(dialog).getByTestId("asks-verdict");
    expect(verdict.textContent).toMatch(
      /^You said noAt \d{1,2}:07 [AP]M, 7 minutes after Kit asked\.$/,
    );
    // The question's command in code, and the preview whole under it.
    expect(
      within(dialog)
        .getAllByText("rm -rf build")
        .map((each) => each.tagName),
    ).toEqual(["CODE", "PRE"]);

    fireEvent.click(within(dialog).getByTestId("asks-open"));
    await act(async () => {
      await new Promise((done) => setTimeout(done, 450));
    });
    expect(opened).toEqual(["sp_1"]);
    expect(screen.queryByTestId("asks-dialog")).toBeNull();
  });

  it("goes back from an ask to the list it came from", async () => {
    section();
    fireEvent.click(screen.getByTestId("asking-history"));
    const dialog = await screen.findByTestId("asks-dialog");
    fireEvent.click(within(dialog).getByTestId("ask-row-a2"));
    expect(within(dialog).getByTestId("asks-whole")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Asks" }));
    expect(within(dialog).queryByTestId("asks-whole")).toBeNull();
    expect(within(dialog).getByTestId("ask-row-a1")).toBeTruthy();
  });
});

describe("Allowed always, on You", () => {
  /** The row the form grows out of. */
  const row = () => document.body.appendChild(document.createElement("button"));

  it("counts every harness's rules and switches them as the harness card does", async () => {
    const sent: SetRulesInput[] = [];
    render(
      <AllowedAlwaysForm
        from={row()}
        model={model()}
        directory={directory}
        selfId={ARJUN}
        onSetRules={(input) => sent.push(input)}
        onGone={() => undefined}
      />,
    );
    const card = await screen.findByTestId("allowed-always");
    expect(within(card).getByTestId("allowed-always-count").textContent).toMatch(/^1 on\. /);
    expect(within(card).getByText("Kit")).toBeTruthy();
    expect(within(card).getByText("Any command")).toBeTruthy();
    expect(within(card).queryByTestId("allowed-always-none")).toBeNull();
    expect(within(card).queryByTestId("allowed-always-asking")).toBeNull();
    fireEvent.click(within(card).getByRole("switch", { name: "Allow shell.exec always" }));
    expect(sent).toEqual([{ harnessId: KIT, rules: [{ ...SHELL, off: true }] }]);
  });

  it("lists who works without asking, where and until when, with Stop (ADR 0281)", async () => {
    const stopped: StopLetWorkInput[] = [];
    render(
      <AllowedAlwaysForm
        from={row()}
        model={model({ letWork: [{ asker: KIT, by: ARJUN, since: "2026-11-06T09:50:00.000Z" }] })}
        directory={directory}
        selfId={ARJUN}
        onSetRules={() => undefined}
        onStopLetWork={(input) => stopped.push(input)}
        onGone={() => undefined}
      />,
    );
    const working = await screen.findByTestId("allowed-always-working");
    expect(working.textContent).toBe("Working without askingKitIn Bakery · Until you stop itStop");
    fireEvent.click(
      within(working).getByRole("button", { name: "Stop Kit working without asking" }),
    );
    expect(stopped).toEqual([{ spaceId: "sp_1", asker: KIT }]);
  });

  it("says once that nothing is allowed, how a rule comes to be there, and every ask so far", async () => {
    render(
      <AllowedAlwaysForm
        from={row()}
        model={model({ rules: [] })}
        directory={directory}
        selfId={ARJUN}
        onSetRules={() => undefined}
        onGone={() => undefined}
      />,
    );
    await screen.findByTestId("allowed-always");
    // Nothing to count: the line under it says so once.
    expect(screen.queryByTestId("allowed-always-count")).toBeNull();
    const none = screen.getByTestId("allowed-always-none");
    expect(
      within(none).getByText("Nothing is allowed always, so every ask comes to you."),
    ).toBeTruthy();
    expect(within(none).getByText(/^When a harness asks to do something small/)).toBeTruthy();
    expect(screen.getByTestId("allowed-always-asking").textContent).toBe("Kit asks every time.");
    expect(screen.queryByText("Nothing allowed always.")).toBeNull();
  });

  it("grows every ask in the workspace out of the dots, as a harness's own do (ADR 0255)", async () => {
    const opened: string[] = [];
    render(
      <AllowedAlwaysForm
        from={row()}
        model={model({ rules: [] })}
        directory={directory}
        selfId={ARJUN}
        onSetRules={() => undefined}
        onOpenSpace={(spaceId) => opened.push(spaceId)}
        onGone={() => undefined}
      />,
    );
    const dots = await screen.findByTestId("allowed-always-history");
    expect(dots.textContent).toMatch(/^Asks so farSee all/);
    fireEvent.click(dots);
    const dialog = await screen.findByTestId("asks-dialog");
    expect(within(dialog).getByRole("heading", { name: "Asks" })).toBeTruthy();
    const rows = within(dialog)
      .getAllByRole("button")
      .filter((each) => each.dataset["testid"]?.startsWith("ask-row-"));
    expect(rows.map((each) => each.dataset["testid"])).toEqual([
      "ask-row-a3",
      "ask-row-a2",
      "ask-row-a1",
    ]);
    fireEvent.click(within(dialog).getByTestId("ask-row-a3"));
    fireEvent.click(within(dialog).getByTestId("asks-open"));
    await act(async () => {
      await new Promise((done) => setTimeout(done, 450));
    });
    expect(opened).toEqual(["sp_1"]);
  });
});

describe("the ask card (ADR 0195)", () => {
  function card(
    over: Partial<Approval> = {},
    harnessId: string | undefined = KIT,
    role: WorkspaceRole | undefined = undefined,
    keepsHeldYes: boolean | undefined = undefined,
  ) {
    const decided: DecisionInput[] = [];
    render(
      <Decide
        approval={
          {
            approvalId: "apr_1",
            runId: "run_1",
            actionKind: "email.send",
            askedAt: "2026-09-07T10:00:00.000Z",
            risk: ["external_communication"],
            sources: [],
            editable: false,
            fallback: "deny",
            approvers: [ARJUN],
            ...over,
          } as Approval
        }
        harnessName="Kit"
        harnessId={harnessId}
        directory={directory}
        selfId={ARJUN}
        busy={false}
        now={Date.now()}
        onDecide={(_, input) => decided.push(input)}
        workspaceRole={role}
        keepsHeldYes={keepsHeldYes}
        spaceName="Bakery"
      />,
    );
    return decided;
  }

  it("offers neither the switch nor the hour to a server that wouldn't keep them (ADR 0281)", () => {
    const decided = card(
      { actionKind: "acp.execute", risk: [], input: { command: "ls -la" } },
      KIT,
      undefined,
      false,
    );
    expect(screen.queryByTestId("let-work-switch")).toBeNull();
    expect(screen.queryByText("For an hour")).toBeNull();
    expect(screen.getByText("Always")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once" }]);
  });

  it("an ask that matters waits for you, offers no scope, says why, and is answered once", () => {
    const decided = card({ matters: true });
    expect(screen.getByTestId("waits-for-you").textContent).toContain("Waits for you");
    expect(screen.getByTestId("once-only").textContent).toBe(
      "You answer asks like this each time, so there is no Always.",
    );
    expect(screen.queryByText("Always")).toBeNull();
    // Nor is the agent let work without asking on it (ADR 0281).
    expect(screen.queryByTestId("let-work-switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once" }]);
  });

  it("an ask that matters, somebody else's, waits for a person", () => {
    card({ matters: true, approvers: [DANA] });
    expect(screen.getByTestId("waits-for-you").textContent).toBe("Waits for a person");
  });

  it("a smaller ask offers the scopes as before", () => {
    card();
    expect(screen.queryByTestId("waits-for-you")).toBeNull();
    expect(screen.getByText("Always")).toBeTruthy();
  });

  it("lights the words a command's Always keeps, in every space by default (ADR 0239, 0280)", () => {
    const command = {
      actionKind: "acp.execute",
      risk: [],
      input: { command: "node --check game.js && echo ok" },
    } as Partial<Approval>;
    const decided = card(command, KIT, "owner");
    expect(
      [...screen.getAllByTestId("plate-part")].map((part) => part.getAttribute("aria-label")),
    ).toEqual(["node --check game.js", "then echo ok"]);
    // Nothing more under the choices while the yes is for this once, and nothing lit.
    expect(screen.queryByTestId("standing")).toBeNull();
    expect(screen.getByTestId("command-plate").dataset["lit"]).toBeUndefined();
    fireEvent.click(screen.getByLabelText("Always"));
    expect(screen.getByTestId("command-plate").dataset["lit"]).toBe("true");
    expect(
      [...screen.getByTestId("command-plate").querySelectorAll(".plate-start")].map(
        (start) => start.textContent,
      ),
    ).toEqual(["node --check", "echo"]);
    expect(screen.queryByTestId("remembers")).toBeNull();
    expect(screen.getByTestId("reach").textContent).toBe(
      "Commands made only of the lit words go ahead without a card in every space. Anything else still comes to you.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve always" }));
    expect(decided).toEqual([{ decision: "approved", scope: "always", everywhere: true }]);
    // Approve turns to what was given, and takes no second press.
    const done = screen.getByRole("button", { name: "Always, in every space" });
    expect(done.dataset["answered"]).toBe("true");
    expect((done as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps an owner's Always to this space when they pick it", () => {
    const decided = card(
      { actionKind: "acp.execute", risk: [], input: { command: "git status" } },
      KIT,
      "owner",
    );
    fireEvent.click(screen.getByLabelText("Always"));
    fireEvent.click(screen.getByLabelText("In this space"));
    expect(screen.getByTestId("reach").textContent).toContain("in Bakery.");
    fireEvent.click(screen.getByRole("button", { name: "Approve always" }));
    expect(decided).toEqual([{ decision: "approved", scope: "always" }]);
    expect(screen.getByRole("button", { name: "Always, in Bakery" })).toBeTruthy();
  });

  it("keeps a member's Always to this space, and draws the hour For an hour gives", () => {
    const decided = card(
      { actionKind: "acp.execute", risk: [], input: { command: "git status" } },
      KIT,
      "member",
    );
    expect(screen.queryByLabelText("This session")).toBeNull();
    fireEvent.click(screen.getByLabelText("Always"));
    expect(screen.queryByLabelText("In every space")).toBeNull();
    expect(screen.getByTestId("reach").textContent).toContain("in Bakery.");
    fireEvent.click(screen.getByLabelText("For an hour"));
    expect(screen.queryByTestId("reach")).toBeNull();
    expect(screen.getByTestId("hour-strip").textContent).toMatch(
      /^Now, \d{1,2}:\d\d [AP]MUntil \d{1,2}:\d\d [AP]M$/,
    );
    expect(screen.getByTestId("for-a-while").textContent).toBe(
      "Everything Kit asks in this space goes ahead without a card for the hour, commands Chips can't read too. Anything that moves money, messages someone outside, or can't be undone still comes to you.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve for an hour" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once", forMinutes: 60 }]);
  });

  it("says why a command is answered once where the choices would be, above the buttons", () => {
    card({ actionKind: "acp.execute", risk: [], input: { command: "printf x > limits.js" } });
    const line = screen.getByTestId("once-only");
    const approve = screen.getByRole("button", { name: "Approve once" });
    expect(line.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("names the file a command writes to, marks it, keeps no Always, and still gives the hour (ADR 0281)", () => {
    const decided = card({
      actionKind: "acp.execute",
      risk: [],
      input: { command: "echo hi > out.txt" },
    });
    expect(screen.queryByText("Always")).toBeNull();
    const line = screen.getByTestId("once-only");
    expect(line.textContent).toBe("This writes to out.txt, so there is no Always for it.");
    expect(line.querySelector("code")?.textContent).toBe("out.txt");
    expect(line.dataset["marked"]).toBe("true");
    expect(screen.getByTestId("writes-words").textContent).toBe("> out.txt");
    fireEvent.click(screen.getByLabelText("For an hour"));
    expect(screen.queryByTestId("once-only")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve for an hour" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once", forMinutes: 60 }]);
  });

  it("lets the agent work without asking from the switch over the choices (ADR 0281)", () => {
    const decided = card({
      actionKind: "acp.execute",
      risk: [],
      input: { command: "for r in a b; do head -3 $r; done" },
    });
    const flip = screen.getByRole("switch", { name: /Let Kit work without asking/ });
    expect(flip.closest("label")?.textContent).toBe(
      "Let Kit work without askingIn Bakery, until you stop it",
    );
    fireEvent.click(flip);
    expect(screen.queryByLabelText("For an hour")).toBeNull();
    expect(screen.queryByTestId("once-only")).toBeNull();
    expect(screen.getByTestId("until-stopped").textContent).toBe(
      "Everything Kit asks here goes ahead without a card until you stop it, commands Chips can't read too. Anything that moves money, messages someone outside, or can't be undone still comes to you.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve and let it work" }));
    expect(decided).toEqual([{ decision: "approved", scope: "once", untilStopped: true }]);
    expect(screen.getByRole("button", { name: "Until you stop it" })).toBeTruthy();
  });

  it("draws a command a part to a line, not again as JSON, under its question", () => {
    const line = "cd ~/room; ls -la; cat package.json 2>/dev/null | head -60";
    card({
      actionKind: "acp.execute",
      risk: [],
      question: `Inspect the room? \`${line.slice(0, 20)}…\``,
      input: { command: line },
      preview: JSON.stringify({ command: line }),
      previewFormat: "json",
      lasts: "once",
    });
    expect(screen.getByRole("article").getAttribute("aria-label")).toBe(
      "Approval: Inspect the room?",
    );
    expect(screen.getAllByTestId("plate-part")).toHaveLength(4);
    expect(screen.getByTestId("dropped-words").textContent).toBe("2>/dev/null");
    expect(screen.getByTestId("plate-caption").textContent).toBe(
      "4 parts. Chips reads each one, and 2>/dev/null writes no file.",
    );
    expect(screen.queryByText(/"command"/)).toBeNull();
    expect(screen.queryByText("Just this once")).toBeNull();
  });

  it("names the listed command that keeps an ask to once (ADR 0239)", () => {
    card({ actionKind: "acp.execute", risk: [], input: { command: "ls && rm -rf build" } });
    expect(screen.getByTestId("once-only").textContent).toBe(
      "There is no Always for asks that use rm.",
    );
    expect(screen.getByTestId("never-words").textContent).toBe("rm -rf");
  });

  it("one its harness settled itself says it was answered in its own tools", () => {
    card({ resolved: { decision: "approved", by: KIT, at: "2026-09-07T10:05:00.000Z" } } as never);
    expect(screen.getByTestId("own-tools").textContent).toBe("Answered by Kit in its own tools.");
  });

  it("one a person answered says nothing of the kind", () => {
    card({ resolved: { decision: "approved", by: DANA, at: "2026-09-07T10:05:00.000Z" } } as never);
    expect(screen.queryByTestId("own-tools")).toBeNull();
  });

  it("lights an open ask's command once, as it is first drawn, and not each time its room is opened", () => {
    const command = { actionKind: "acp.execute", risk: [], input: { command: "git status" } };
    const sweep = () => screen.getByTestId("command-plate").dataset["sweep"];
    // The ask comes in: a pass of light goes down its command, and a choice made meanwhile keeps it.
    card({ approvalId: "apr_sweep", ...command });
    expect(sweep()).toBe("true");
    fireEvent.click(screen.getByLabelText("Always"));
    expect(sweep()).toBe("true");
    // Away to another room and back: the room's cards are drawn anew, and stand still.
    cleanup();
    card({ approvalId: "apr_sweep", ...command });
    expect(sweep()).toBeUndefined();
    // A card already answered asks nothing, so it is still even the first time it is drawn.
    cleanup();
    card({
      approvalId: "apr_answered",
      ...command,
      resolved: {
        decision: "approved",
        by: ARJUN,
        at: "2026-09-07T10:05:00.000Z",
        elsewhere: true,
      },
    } as never);
    expect(sweep()).toBeUndefined();
  });
});
