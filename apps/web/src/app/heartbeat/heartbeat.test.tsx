/**
 * An agent's Heartbeat group on the desktop (ADR 0143, Phase 4): the switch that saves when it is
 * flipped, the Every menu while it is on, the foot, a refusal said under the switch, nothing while
 * its harness is away to change it, and no group for a harness that sends no heartbeat. Driven
 * through the Agents tab, so the store reaches the card as it does in the app. OpenClaw is a
 * harness that sends its Main agent's heartbeat; Main is that agent.
 */

import { type AgentStay, buildModel, type ClientEvent, type Directory } from "@chipschat/core";
import type { AgentHeartbeatView, HeartbeatChangeAsk } from "@chipschat/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentsService } from "../Agents.tsx";
import { forget } from "../context/memory.ts";
import type { FileService } from "../files.ts";
import { Harnesses } from "../Harnesses.tsx";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const CLAW = "hrn_01K4ZQPX0000000000000CLAW";
const MAIN = "agt_01K4ZQPX0000000000000MAIN";
const CHOICES = [15, 30, 60, 120, 240, 720, 1440];
/** Long enough for a save's first read, 800 ms after the change is sent. */
const SAVED = { timeout: 2500 };

const joined = (id: string, role: string, seq: number): ClientEvent =>
  ({
    seq,
    type: "person.joined",
    id: `evt_${seq}`,
    ts: "2026-10-09T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id === ARJUN ? "Arjun" : "Dana",
    role,
  }) as unknown as ClientEvent;
const model = buildModel([joined(ARJUN, "owner", 1), joined(DANA, "member", 2)]);

function directory(capabilities: readonly string[] = ["agents", "heartbeats"]): Directory {
  return {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
    [CLAW]: { id: CLAW, kind: "harness", displayName: "OpenClaw", ownerId: ARJUN, capabilities },
    [MAIN]: { id: MAIN, kind: "agent", harnessId: CLAW, displayName: "Main", lead: true },
  } as Directory;
}

function viewOf(over: Partial<AgentHeartbeatView> = {}): AgentHeartbeatView {
  return {
    agent_id: MAIN,
    harness_id: CLAW,
    on: false,
    every: 30,
    choices: CHOICES,
    editable: true,
    read_at: "2026-10-09T09:00:00.000Z",
    away: false,
    ...over,
  } as AgentHeartbeatView;
}

/** A store whose harness answers each change at once: as asked, or refused in its words. */
function reads(first: AgentHeartbeatView, refuse?: string) {
  let now = first;
  const asked: HeartbeatChangeAsk[] = [];
  return {
    asked,
    readAgentHeartbeat: async () => now,
    changeAgentHeartbeat: async (_agentId: string, ask: HeartbeatChangeAsk) => {
      asked.push(ask);
      const every = ask.every ?? now.every;
      const change = {
        change_id: `chg_${asked.length}`,
        asked_at: "2026-10-09T09:01:00.000Z",
        answered_at: "2026-10-09T09:01:01.000Z",
        on: ask.on,
        every,
      };
      now = (
        refuse === undefined
          ? { ...now, on: ask.on, every, change: { ...change, state: "saved" } }
          : { ...now, change: { ...change, state: "failed", message: refuse } }
      ) as AgentHeartbeatView;
      return { ...change, state: "waiting" as const };
    },
  };
}

const agents: AgentsService = {
  stays: async () => [] as readonly AgentStay[],
  move: vi.fn(),
  fork: vi.fn(),
  forkRoom: vi.fn(),
  put: vi.fn(),
  newRoom: vi.fn(),
  refresh: async () => undefined,
  rename: vi.fn(),
  archive: vi.fn(),
  remove: vi.fn(),
  lock: vi.fn(),
  face: vi.fn(),
};

function page(
  heartbeats: ReturnType<typeof reads>,
  options: { selfId?: string; capabilities?: readonly string[] } = {},
) {
  return render(
    <Harnesses
      model={model}
      directory={directory(options.capabilities)}
      serverUrl="http://127.0.0.1:4431"
      onOpen={vi.fn()}
      onAdd={vi.fn()}
      selfId={options.selfId ?? ARJUN}
      agents={agents}
      files={{} as FileService}
      heartbeats={heartbeats}
      initialAgent={MAIN}
    />,
  );
}

const sub = () => screen.getByTestId("heartbeat-sub").textContent;
const foot = () => screen.getByTestId("heartbeat-foot").textContent;
const toggle = () => screen.getByRole("switch", { name: "Heartbeat" }) as HTMLInputElement;

describe("the Heartbeat group on an agent's card", () => {
  it("says off, with no Every row, and what off means", async () => {
    page(reads(viewOf()));
    await screen.findByTestId("heartbeat-group");
    expect(sub()).toBe("Off");
    expect(toggle().checked).toBe(false);
    expect(screen.queryByTestId("heartbeat-every")).toBeNull();
    expect(foot()).toBe("Off. Main only answers when you write to it.");
    expect(screen.getByTestId("heartbeat-from").textContent).toBe("OpenClaw");
  });

  it("turns it on from the switch, and says how often and how many a day", async () => {
    const store = reads(viewOf());
    page(store);
    await screen.findByTestId("heartbeat-group");
    fireEvent.click(toggle());
    expect(sub()).toBe("Saving to OpenClaw");
    expect(toggle().disabled).toBe(true);
    await waitFor(() => expect(sub()).toBe("On"), SAVED);
    expect(store.asked).toEqual([{ on: true }]);
    expect(toggle().checked).toBe(true);
    expect((screen.getByRole("combobox", { name: "Every" }) as HTMLSelectElement).value).toBe("30");
    expect(foot()).toMatch(/about 48 a day/);
  });

  it("picks every hour from the menu, which saves it", async () => {
    const store = reads(viewOf({ on: true }));
    page(store);
    const every = (await screen.findByRole("combobox", { name: "Every" })) as HTMLSelectElement;
    expect([...every.options].map((option) => option.textContent)).toContain("1 hour");
    fireEvent.change(every, { target: { value: "60" } });
    await waitFor(() => expect(foot()).toMatch(/about 24 a day/), SAVED);
    expect(store.asked).toEqual([{ on: true, every: 60 }]);
    expect(every.value).toBe("60");
  });

  it("says why under the switch when the harness refuses, and keeps what holds", async () => {
    page(reads(viewOf(), "rate limited"));
    await screen.findByTestId("heartbeat-group");
    fireEvent.click(toggle());
    await waitFor(() => expect(sub()).toBe("rate limited"), SAVED);
    expect(toggle().checked).toBe(false);
    expect(screen.queryByTestId("heartbeat-every")).toBeNull();
  });

  it("can't be changed while the harness is away, and the foot says why", async () => {
    page(reads(viewOf({ on: true, away: true })));
    await screen.findByTestId("heartbeat-group");
    expect(toggle().disabled).toBe(true);
    expect((screen.getByRole("combobox", { name: "Every" }) as HTMLSelectElement).disabled).toBe(
      true,
    );
    expect(foot()).toMatch(/OpenClaw is away, so this can't be changed now\./);
  });

  it("says so for a harness that sends no heartbeat, and is nothing for a member who doesn't run it", async () => {
    const store = reads(viewOf());
    const first = page(store, { capabilities: ["agents"] });
    await screen.findByTestId("agent-card");
    expect(screen.queryByTestId("heartbeat-group")).toBeNull();
    expect(screen.getByTestId("heartbeat-not-shared-words").textContent).toMatch(
      /^OpenClaw doesn't share a heartbeat for .* with Chips\.$/,
    );
    first.unmount();
    page(store, { selfId: DANA });
    await screen.findByTestId("agent-card");
    expect(screen.queryByTestId("heartbeat-group")).toBeNull();
    expect(screen.queryByTestId("heartbeat-not-shared")).toBeNull();
  });

  it("stands blank in its place until the first copy comes, then is kept (ADR 0238)", async () => {
    const store = reads(viewOf({ on: true }));
    const first = page({
      ...store,
      readAgentHeartbeat: () => new Promise<AgentHeartbeatView>(() => undefined),
    });
    expect((await screen.findByTestId("heartbeat-waiting-from")).textContent).toBe("OpenClaw");
    first.unmount();
    const second = page(store);
    await screen.findByTestId("heartbeat-group");
    second.unmount();
    page({ ...store, readAgentHeartbeat: () => new Promise<AgentHeartbeatView>(() => undefined) });
    await screen.findByTestId("heartbeat-group");
    expect(screen.queryByTestId("heartbeat-waiting")).toBeNull();
  });
});

beforeEach(() => forget());
