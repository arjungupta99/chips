/**
 * A harness's Permissions on the web and the Mac (ADR 0299, ADR 0300): the main page, its
 * settings page with the line to paste, the Chips's rules page with its switch, Stop asking and
 * New rule, You → Permissions with every harness, and the room's band.
 */

import {
  buildModel,
  type ClientEvent,
  type Directory,
  EVERY_HARNESS,
  type WorkspaceModel,
} from "@chipschat/core";
import type { OwnRules } from "@chipschat/protocol";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HoldBands } from "../LetWorkBand.tsx";
import { ChipsRules, HarnessPermissions, HarnessSettings } from "./HarnessPermissions.tsx";
import { NewRule } from "./NewRule.tsx";
import type { PermissionsService } from "./service.ts";
import { YouPermissions } from "./YouPermissions.tsx";

const KIT = "hrn_kit";
const LUX = "hrn_lux";
const AGENT = "agt_jiro";
const ARJUN = "usr_arjun";
const SPACE = "spc_1";
// The reader's morning, so the words read the same wherever the suite runs.
const NOW = new Date(2026, 10, 18, 9, 41).getTime();

const directory: Directory = {
  [KIT]: { id: KIT, kind: "harness", displayName: "Claude Code", ownerId: ARJUN },
  [LUX]: { id: LUX, kind: "harness", displayName: "OpenCode", ownerId: ARJUN },
  [AGENT]: { id: AGENT, kind: "agent", displayName: "Jiro", harnessId: KIT },
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
};

let seq = 0;
function event(type: string, extra: Record<string, unknown>): ClientEvent {
  seq += 1;
  return {
    v: 1,
    type,
    id: `evt_${seq}`,
    seq,
    ts: new Date(NOW - 3_600_000 + seq * 1000).toISOString(),
    workspace_id: "ws_1",
    actor: { kind: "person", id: ARJUN },
    ...extra,
  } as ClientEvent;
}

function workspace(events: ClientEvent[]): WorkspaceModel {
  return {
    ...buildModel(events),
    people: {
      [ARJUN]: {
        participantId: ARJUN,
        role: "owner",
        displayName: "Arjun",
        joinedAt: "2026-09-01",
      },
    },
  };
}

const asked = (id: string, command: string) =>
  event("approval.request", {
    space_id: SPACE,
    run_id: "run_1",
    approval_id: id,
    actor: { kind: "harness", id: KIT },
    action: { kind: "acp.bash", input: { command } },
    risk: [],
    sources: [],
    editable: false,
    fallback: "deny",
    expires_in: 600,
  });

function room(extra: ClientEvent[] = []): WorkspaceModel {
  seq = 0;
  return workspace([
    event("space.created", { space_id: SPACE, kind: "group", title: "Chips explain" }),
    event("membership.added", {
      space_id: SPACE,
      participant_id: AGENT,
      participant_kind: "agent",
      role: "member",
      joined_at: new Date(NOW).toISOString(),
    }),
    event("run.started", {
      space_id: SPACE,
      run_id: "run_1",
      harness_id: KIT,
      actor: { kind: "harness", id: KIT },
    }),
    asked("apr_1", "ls -la"),
    asked("apr_2", "git log --oneline"),
    ...extra,
  ]);
}

const CLAUDE_CODE: OwnRules = {
  read_from: ["~/.claude/settings.json"],
  mode: "Default",
  runs: [
    { kind: "read", name: "Read" },
    { kind: "command", name: "Bash", words: ["git"] },
  ],
  ask_line: { entry: '"Bash({words}:*)"', line: '"ask": [{entries}]', where: "`permissions`" },
};

function service(over: Partial<PermissionsService> = {}) {
  const calls: [string, unknown][] = [];
  const said: PermissionsService = {
    setRules: (input) => calls.push(["setRules", input]),
    snoozeHarness: (harnessId, snooze) => calls.push(["snooze", { harnessId, ...snooze }]),
    resumeHarness: (harnessId) => calls.push(["resume", harnessId]),
    setChipsRules: (harnessId, on) => calls.push(["switch", { harnessId, on }]),
    setWorkspaceRules: (input) => calls.push(["every", input]),
    readOwnRules: async () => ({ own_rules: CLAUDE_CODE, heard_at: new Date(NOW).toISOString() }),
    keepsHarnessRules: true,
    keepsOwnRules: true,
    keepsChipsRules: true,
    ...over,
  };
  return { said, calls };
}

const switched = (on: boolean) =>
  event("policy.updated", {
    harness_id: KIT,
    policy: { autonomy: 1, rules: [], chips_rules: on },
    workspace_max_autonomy: 3,
    changed_by: ARJUN,
  });

const held = event("policy.updated", {
  harness_id: KIT,
  policy: {
    autonomy: 1,
    rules: [],
    hold: { until: new Date(NOW + 3_600_000).toISOString(), by: ARJUN },
  },
  workspace_max_autonomy: 3,
  changed_by: ARJUN,
});

describe("a harness's Permissions, in three pages (ADR 0300)", () => {
  beforeEach(() => vi.useFakeTimers({ now: NOW, shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("is a short main page whose two rows open its settings and Chips's rules", async () => {
    const { said } = service();
    const opened: string[] = [];
    render(
      <HarnessPermissions
        model={room()}
        directory={directory}
        harnessId={KIT}
        selfId={ARJUN}
        service={said}
        onOpenSpace={() => undefined}
        onOpenPart={(part) => opened.push(part)}
      />,
    );
    await act(async () => undefined);
    // Never switched and nothing of Chips's: off, one gate.
    expect(screen.getByTestId("perms-headline").textContent).toBe(
      "Claude Code decides what to ask. Chips brings every ask to you.",
    );
    expect(screen.getByTestId("perms-settings-row").textContent).toContain("Default");
    expect(screen.getByTestId("perms-settings-row").textContent).toContain(
      "Lets git push, git reset and git clean through",
    );
    expect(screen.getByTestId("perms-chips-value").textContent).toBe("Off");
    expect(screen.queryByTestId("perms-open")).toBeNull();
    fireEvent.click(screen.getByTestId("perms-settings-row"));
    fireEvent.click(screen.getByTestId("perms-chips-row"));
    expect(opened).toEqual(["settings", "chips"]);
  });

  it("switches Chips's rules on from their page, and Stop asking says yes for a length", async () => {
    const { said, calls } = service();
    const off = render(
      <ChipsRules
        model={room()}
        directory={directory}
        harnessId={KIT}
        selfId={ARJUN}
        service={said}
        onNewRule={() => undefined}
      />,
    );
    await act(async () => undefined);
    expect(screen.getByTestId("perms-off-foot")).toBeTruthy();
    expect(screen.queryByTestId("perms-stop")).toBeNull();
    fireEvent.click(screen.getByTestId("perms-switch"));
    expect(calls).toEqual([["switch", { harnessId: KIT, on: true }]]);
    off.unmount();

    render(
      <ChipsRules
        model={room([switched(true)])}
        directory={directory}
        harnessId={KIT}
        selfId={ARJUN}
        service={said}
        onNewRule={() => undefined}
      />,
    );
    await act(async () => undefined);
    expect(screen.getByTestId("perms-stop").textContent).toContain("never to rm, git push");
    fireEvent.click(screen.getByTestId("perms-stop-open"));
    fireEvent.click(screen.getByTestId("perms-stop-len-8h"));
    const stopped = calls.at(-1) as [
      string,
      { harnessId: string; until: string; matters: boolean },
    ];
    expect(stopped[0]).toBe("snooze");
    expect(stopped[1].matters).toBe(false);
    expect(Math.abs(Date.parse(stopped[1].until) - (NOW + 8 * 3_600_000))).toBeLessThan(5000);
  });

  it("says Chips is saying yes, in plain words, with Ask again", async () => {
    const { said, calls } = service();
    render(
      <ChipsRules
        model={room([held])}
        directory={directory}
        harnessId={KIT}
        selfId={ARJUN}
        service={said}
        onNewRule={() => undefined}
      />,
    );
    await act(async () => undefined);
    expect(screen.getByTestId("perms-stop").textContent).toMatch(/^Saying yes for youUntil /);
    fireEvent.click(screen.getByTestId("perms-ask-again"));
    expect(calls).toEqual([["resume", KIT]]);
  });

  it("names what its own settings let through that Chips never would, with the line to paste", async () => {
    const { said } = service();
    render(<HarnessSettings directory={directory} harnessId={KIT} service={said} />);
    await act(async () => undefined);
    expect(screen.getByTestId("perms-mode").textContent).toContain("Default");
    expect(screen.getByTestId("perms-notice").textContent).toMatch(
      /^Claude Code runs git push, git reset and git clean without a card\./,
    );
    fireEvent.click(screen.getByTestId("perms-make-ask"));
    expect(screen.getByTestId("perms-line").textContent).toBe(
      '"ask": ["Bash(git push:*)", "Bash(git reset:*)", "Bash(git clean:*)"]',
    );
    expect(within(screen.getByTestId("perms-own")).getByText("git").tagName).toBe("EM");
  });
});

describe("New rule (ADR 0299)", () => {
  it("lights its asks as starts are picked, locks the never list under Allow, and saves the rules", () => {
    const { said, calls } = service();
    const done = vi.fn();
    render(
      <NewRule model={room()} directory={directory} harnessId={KIT} service={said} onDone={done} />,
    );
    expect(screen.getByTestId("rule-save")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("rule-chip-rm")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByTestId("rule-chip-git log"));
    expect(screen.getByTestId("rule-count").textContent).toBe("1");
    expect(screen.getByTestId("rule-picked").textContent).toBe("1 picked");
    fireEvent.click(screen.getByTestId("rule-save"));
    expect(calls).toEqual([
      [
        "setRules",
        {
          harnessId: KIT,
          rules: [{ match: "*", when: { starts_with: ["git", "log"] }, decision: "allow" }],
        },
      ],
    ]);
    expect(screen.getByTestId("rule-save").dataset["saved"]).toBe("true");
  });

  it("refuses with Never, every harness's rules through the workspace", () => {
    const { said, calls } = service();
    render(
      <NewRule
        model={room()}
        directory={directory}
        harnessId={EVERY_HARNESS}
        service={said}
        onDone={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Never" }));
    expect(screen.getByTestId("rule-chip-rm")).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByTestId("rule-chip-rm"));
    fireEvent.click(screen.getByTestId("rule-save"));
    expect(calls).toEqual([
      ["every", { rules: [{ match: "*", when: { starts_with: ["rm"] }, decision: "deny" }] }],
    ]);
  });
});

describe("You → Permissions (ADR 0300)", () => {
  it("lists each harness, marks where Chips's rules are on, and opens its page", async () => {
    const { said } = service();
    const opened: string[] = [];
    render(
      <YouPermissions
        model={room([switched(true)])}
        directory={directory}
        selfId={ARJUN}
        service={said}
        onOpenHarness={(harnessId) => opened.push(harnessId)}
      />,
    );
    await act(async () => undefined);
    expect(screen.getByTestId(`perms-harness-${KIT}`).textContent).toContain(
      "Runs 2 kinds of work on its own",
    );
    expect(screen.getByTestId(`perms-chips-on-${KIT}`)).toBeTruthy();
    expect(screen.queryByTestId(`perms-chips-on-${LUX}`)).toBeNull();
    fireEvent.click(within(screen.getByTestId(`perms-harness-${LUX}`)).getByRole("button"));
    expect(opened).toEqual([LUX]);
  });
});

describe("the room's line while Chips says yes for a harness (ADR 0299, 0300)", () => {
  it("says so in a plain line, and Ask again turns its asks back on", () => {
    const { said, calls } = service();
    const model = room([
      event("policy.updated", {
        harness_id: KIT,
        policy: { autonomy: 1, rules: [], hold: { by: ARJUN } },
        workspace_max_autonomy: 3,
        changed_by: ARJUN,
      }),
    ]);
    const space = model.spaces[0];
    if (space === undefined) throw new Error("no room");
    render(
      <HoldBands
        model={model}
        space={space}
        directory={directory}
        now={NOW}
        service={said}
        mayChange
      />,
    );
    expect(screen.getByTestId("hold-bands").textContent).toBe(
      "Chips is saying yes for Claude CodeAsk again",
    );
    expect(screen.getByTestId("let-work-band").getAttribute("data-tone")).toBe("calm");
    fireEvent.click(screen.getByTestId("hold-band-resume"));
    expect(calls).toEqual([["resume", KIT]]);
  });
});
