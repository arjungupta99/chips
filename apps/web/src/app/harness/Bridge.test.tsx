/**
 * A harness's Bridge group (ADR 0297): the line that takes one of seven states, the dot for what
 * needs the owner, and the owner's switch "Keep this bridge up to date"; and when the page asks
 * what the bridge runs, and what it keeps showing when the computer doesn't answer.
 */

import { buildModel, type ClientEvent, type Directory, type Software } from "@chipschat/core";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpdatesProvider, type UpdatesServer } from "../updates.tsx";
import { HarnessPage } from "./HarnessPage.tsx";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const HERMES = "hrn_01K4ZQPX000000000000HERMES";
const CODEX = "hrn_01K4ZQPX0000000000000CODEX";

const joined = (id: string, role: string, seq: number): ClientEvent =>
  ({
    seq,
    type: "person.joined",
    id: `evt_${seq}`,
    ts: "2026-11-13T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id === ARJUN ? "Arjun" : "Dana",
    role,
  }) as unknown as ClientEvent;
const model = buildModel([joined(ARJUN, "owner", 1), joined(DANA, "member", 2)]);
const directory = {
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [HERMES]: { id: HERMES, kind: "harness", displayName: "Hermes", ownerId: ARJUN },
  [CODEX]: { id: CODEX, kind: "harness", displayName: "Codex", ownerId: ARJUN },
} as Directory;

const now = new Date().toISOString();
const software = (phase: "waiting" | "refused", keepCurrent = true): Software => ({
  harnesses: [
    {
      harnessId: HERMES,
      name: "chips-hermes",
      version: "1.0.31",
      seenAt: now,
      keepCurrent,
      bridgeUpdate: {
        package: "@chipschat/hermes",
        running: "1.0.31",
        phase,
        since: now,
        target: "1.0.32",
        ...(phase === "refused" ? { reason: "room" as const } : {}),
      },
    },
  ],
  devices: [],
});

/** How the computer answers, for a test to change: reads counted, and failing when said. */
interface Answers {
  /** How many times what everything runs was asked for. */
  reads: number;
  /** The computer has gone away: it takes no write and answers no read. */
  away: boolean;
}

function page(
  read: Software,
  selfId: string,
  kept: [string, boolean][] = [],
  answers: Answers = { reads: 0, away: false },
) {
  const server: UpdatesServer = {
    // As the computer answers: with the switch as last turned.
    software: async () => {
      answers.reads += 1;
      if (answers.away) throw new Error("offline");
      const on = kept.at(-1)?.[1];
      return on === undefined
        ? read
        : { ...read, harnesses: read.harnesses.map((each) => ({ ...each, keepCurrent: on })) };
    },
    setSelfUpdate: async () => undefined,
    keepBridgeCurrent: async (id, on) => {
      if (answers.away) throw new Error("offline");
      kept.push([id, on]);
    },
    me: selfId,
    thisDevice: "dev_1",
    harnessName: () => "Hermes",
    personName: () => undefined,
  };
  const at = (harnessId: string) => (
    <UpdatesProvider
      read={async () => ({
        machine: "Mac mini",
        version: "1.2.5",
        publicUrl: "https://mini",
        relay: { url: undefined, status: "off" },
      })}
      owner={selfId === ARJUN}
      device="browser"
      server={server}
    >
      <HarnessPage
        harnessId={harnessId}
        model={model}
        directory={directory}
        selfId={selfId}
        onOpenAgent={() => undefined}
        onOpenPart={() => undefined}
        contextValue={undefined}
      />
    </UpdatesProvider>
  );
  const view = render(at(HERMES));
  /** The page turned to another harness, as the Agents list does. */
  return { ...view, turnTo: (harnessId: string) => view.rerender(at(harnessId)) };
}

describe("a harness's Bridge group (ADR 0297)", () => {
  it("says it waits for a quiet moment, with a still dot: it fixes itself", async () => {
    page(software("waiting"), ARJUN);
    const line = await screen.findByTestId("harness-bridge-line");
    expect(line.getAttribute("data-tone")).toBe("working");
    expect(line.textContent).toContain("1.0.32 is ready");
    expect(line.querySelector(".needs-dot")).toBeNull();
  });

  it("wears the update dot when it couldn't update, and gives the owner the switch", async () => {
    const kept: [string, boolean][] = [];
    page(software("refused"), ARJUN, kept);
    const line = await screen.findByTestId("harness-bridge-line");
    expect(line.getAttribute("data-tone")).toBe("needs");
    expect(line.textContent).toContain("Couldn't update to 1.0.32");
    expect(line.querySelector(".needs-dot")).not.toBeNull();
    const keep = screen.getByTestId("harness-bridge-switch");
    expect(keep.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(keep);
    await waitFor(() => expect(kept).toEqual([[HERMES, false]]));
    await waitFor(() =>
      expect(screen.getByTestId("harness-bridge-line").textContent).toContain("Updates are off"),
    );
  });

  it("shows a member the line, and no switch", async () => {
    page(software("waiting"), DANA);
    await screen.findByTestId("harness-bridge-line");
    expect(screen.queryByTestId("harness-bridge-switch")).toBeNull();
  });
});

describe("what a harness's page asks of the computer (ADR 0297)", () => {
  it("asks what the bridge runs as it opens, and again for each harness it is turned to", async () => {
    const answers = { reads: 0, away: false };
    const view = page(software("waiting"), ARJUN, [], answers);
    await screen.findByTestId("harness-bridge-line");
    // Once for the page and once as the shell opened, which here is the same moment.
    const opened = answers.reads;
    expect(opened).toBeGreaterThanOrEqual(1);
    view.turnTo(CODEX);
    await waitFor(() => expect(answers.reads).toBe(opened + 1));
    view.turnTo(HERMES);
    await waitFor(() => expect(answers.reads).toBe(opened + 2));
    // Drawn again with the same harness, it asks nothing.
    view.turnTo(HERMES);
    await act(async () => {
      await Promise.resolve();
    });
    expect(answers.reads).toBe(opened + 2);
  });

  it("keeps the bridge's line when a later read fails", async () => {
    const answers = { reads: 0, away: false };
    const view = page(software("refused"), ARJUN, [], answers);
    await screen.findByTestId("harness-bridge-line");
    answers.away = true;
    const before = answers.reads;
    // Away and back, which asks again; the computer doesn't answer.
    view.turnTo(CODEX);
    view.turnTo(HERMES);
    await waitFor(() => expect(answers.reads).toBeGreaterThan(before));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId("harness-bridge-line").textContent).toContain(
      "Couldn't update to 1.0.32",
    );
    expect(screen.getByTestId("harness-bridge-switch")).toBeTruthy();
  });

  it("puts the switch back when the computer didn't take it, though the read after fails too", async () => {
    const kept: [string, boolean][] = [];
    const answers = { reads: 0, away: false };
    page(software("waiting"), ARJUN, kept, answers);
    const keep = await screen.findByTestId("harness-bridge-switch");
    expect(keep.getAttribute("aria-checked")).toBe("true");
    answers.away = true;
    const before = answers.reads;
    fireEvent.click(keep);
    // Shown at once, as turned.
    expect(screen.getByTestId("harness-bridge-switch").getAttribute("aria-checked")).toBe("false");
    await waitFor(() => expect(answers.reads).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.getByTestId("harness-bridge-switch").getAttribute("aria-checked")).toBe("true"),
    );
    expect(kept).toEqual([]);
    expect(screen.getByTestId("harness-bridge-line").textContent).toContain("1.0.32 is ready");
  });
});
