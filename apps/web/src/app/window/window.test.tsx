/**
 * An agent's Context window group on the desktop (ADR 0146, Phase 5): how full, the limit as a
 * slider stepped from limit to limit and saved, a switch where the harness lets it go off, Compact
 * now asking first and the fill draining when it is done, a refusal said, quiet while its harness is
 * away, and nothing for a harness that sends no copy or anyone who doesn't run it. Driven through
 * the Agents tab, so the store reaches the card as it does in the app.
 */

import {
  type AgentStay,
  buildModel,
  type ClientEvent,
  type Directory,
  ServerRefused,
} from "@chipschat/core";
import type { AgentContextWindowView, WindowLimitAsk } from "@chipschat/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentsService } from "../Agents.tsx";
import { forget } from "../context/memory.ts";
import type { FileService } from "../files.ts";
import { Harnesses } from "../Harnesses.tsx";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const JAC = "hrn_01K4ZQPX00000000000000JAC";
const J = "agt_01K4ZQPX000000000000000000J";
const CHOICES = [50, 60, 70, 80, 90];
/** Long enough for a save's first read, 800 ms after the change is sent. */
const SAVED = { timeout: 2500 };
/** Long enough for a compaction's two reads, two seconds apart. */
const COMPACTED = { timeout: 6000 };

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

function directory(capabilities: readonly string[] = ["agents", "context_windows"]): Directory {
  return {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
    [JAC]: { id: JAC, kind: "harness", displayName: "Jacobian", ownerId: ARJUN, capabilities },
    [J]: { id: J, kind: "agent", harnessId: JAC, displayName: "J", lead: true },
  } as Directory;
}

function viewOf(over: Partial<AgentContextWindowView> = {}): AgentContextWindowView {
  return {
    agent_id: J,
    harness_id: JAC,
    used: 172_000,
    window: 272_000,
    model: "gpt-6.1-sol",
    as_of: "2026-10-09T09:00:00.000Z",
    compacts: true,
    limit: { at: 80, choices: CHOICES, default: 80, may_turn_off: false },
    editable: true,
    read_at: "2026-10-09T09:00:00.000Z",
    away: false,
    ...over,
  } as AgentContextWindowView;
}

const ASKED = { change_id: "chg_1", asked_at: "2026-10-09T09:01:00.000Z" };

/** A store whose harness answers a limit at once, and a Compact now in two reads: taken, then done. */
function reads(first: AgentContextWindowView, refuse?: Error) {
  let now = first;
  let since = 0;
  const asked: WindowLimitAsk[] = [];
  const compacted: string[] = [];
  return {
    asked,
    compacted,
    readAgentContextWindow: async () => {
      since += 1;
      if (now.compaction?.state === "taken" && since >= 2) {
        now = {
          ...now,
          used: 24_000,
          compacting: undefined,
          last: { at: "2026-10-09T09:01:30.000Z", from: 172_000, to: 24_000, by: "asked" },
          compaction: { ...ASKED, state: "done", done_at: "2026-10-09T09:01:30.000Z" },
        } as AgentContextWindowView;
      }
      return now;
    },
    changeAgentContextWindow: async (_agentId: string, ask: WindowLimitAsk) => {
      if (refuse) throw refuse;
      asked.push(ask);
      now = {
        ...now,
        limit: now.limit === undefined ? undefined : { ...now.limit, at: ask.at },
        change: { ...ASKED, state: "saved", at: ask.at, answered_at: "2026-10-09T09:01:01.000Z" },
      } as AgentContextWindowView;
      return { ...ASKED, state: "waiting" as const, at: ask.at };
    },
    compactAgent: async (agentId: string) => {
      if (refuse) throw refuse;
      compacted.push(agentId);
      since = 0;
      now = {
        ...now,
        compacting: "running",
        compaction: { ...ASKED, state: "taken" },
      } as AgentContextWindowView;
      return { ...ASKED, state: "waiting" as const };
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
};

function page(
  windows: ReturnType<typeof reads>,
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
      windows={windows}
      initialAgent={J}
    />,
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const slider = () => screen.getByRole("slider", { name: "Compacts itself at" });

beforeEach(() => forget());

/** Once the fill has climbed to the first copy: its number counted up, its bars lit. */
async function climbed(percent: string) {
  await screen.findByTestId("window-group");
  // The count takes most of a second; a loaded machine stretches it.
  await waitFor(() => expect(text("window-percent")).toBe(percent), { timeout: 5000 });
}

describe("the Context window group on an agent's card", () => {
  it("says how full, of what, and where it compacts itself", async () => {
    page(reads(viewOf()));
    await screen.findByTestId("window-group");
    // Just read: the number counts up from none as the fill climbs.
    expect(text("window-percent")).toBe("0%");
    await climbed("63%");
    expect(text("window-tokens")).toBe("172k of 272k tokens");
    expect(text("window-marker")).toBe("80%");
    expect(slider().getAttribute("aria-valuenow")).toBe("80");
    expect(screen.getByTestId("window-bars").querySelectorAll('i[data-lit="true"]')).toHaveLength(
      25,
    );
    expect(text("window-auto-sub")).toBe("At 80%. Drag the marker to change it.");
    // Jacobian's limit can't be turned off: no switch.
    expect(screen.queryByRole("switch", { name: "Compacts itself" })).toBeNull();
    expect(text("window-note")).toBe("It hasn't compacted yet.");
    expect(text("window-foot")).toMatch(/^Compacting sums up J's conversation so far/);
    expect(text("window-from")).toBe("Jacobian");
  });

  it("draws its last long turn past the fill, in that turn's tone, and says so", async () => {
    const turn = { at: "2026-10-09T09:16:00.000Z", peak: 218_000, folds: 1 };
    page(reads(viewOf({ used: 11_600, long_turn: turn })));
    await climbed("4%");
    const bars = screen.getByTestId("window-bars");
    expect(bars.querySelectorAll('i[data-lit="true"]')).toHaveLength(2);
    // Bars 3 to 31 faint, bar 32 held: 80% is amber's, whatever the fill's tone.
    expect(bars.querySelectorAll('i[data-ghost="faint"][data-tone="warn"]')).toHaveLength(29);
    const top = bars.querySelectorAll("i")[31];
    expect(top?.getAttribute("data-ghost")).toBe("top");
    expect(bars.querySelectorAll('i[data-ghost][data-past="true"]')).toHaveLength(0);
    expect(text("window-ghost")).toBe("Last long turn 80%");
    expect(text("window-end")).toBe("272k");
    expect(text("window-note")).toMatch(
      /^Its last long turn reached 218k and compacted itself once/,
    );
    // The scale's ends are hidden from a screen reader; the turn's words are read.
    expect(screen.getByTestId("window-ghost").closest('[aria-hidden="true"]')).toBeNull();
  });

  it("draws no last long turn that doesn't reach past the fill", async () => {
    const turn = { at: "2026-10-09T08:00:00.000Z", peak: 150_000, folds: 0 };
    page(reads(viewOf({ long_turn: turn })));
    await screen.findByTestId("window-group");
    expect(screen.getByTestId("window-bars").querySelectorAll("i[data-ghost]")).toHaveLength(0);
    expect(screen.queryByTestId("window-ghost")).toBeNull();
  });

  it("steps the limit down with the arrow keys and saves it", async () => {
    const store = reads(viewOf());
    page(store);
    await screen.findByTestId("window-group");
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(text("window-auto-sub")).toBe("Saving to Jacobian");
    await waitFor(
      () => expect(text("window-auto-sub")).toBe("At 70%. Drag the marker to change it."),
      SAVED,
    );
    expect(store.asked).toEqual([{ at: 70 }]);
    expect(text("window-marker")).toBe("70%");
  });

  it("turns OpenClaw's limit off from its switch, to only when asked", async () => {
    const store = reads(
      viewOf({ limit: { at: 80, choices: CHOICES, default: null, may_turn_off: true } }),
    );
    page(store);
    await screen.findByTestId("window-group");
    fireEvent.click(screen.getByRole("switch", { name: "Compacts itself" }));
    await waitFor(
      () => expect(text("window-auto-sub")).toBe("Only when you ask, or when it is full."),
      SAVED,
    );
    expect(store.asked).toEqual([{ at: null }]);
    expect(screen.queryByTestId("window-marker")).toBeNull();
  });

  it("asks first, then compacts, and the fill drains when it is done", async () => {
    const store = reads(viewOf());
    page(store);
    // Past the count up to 63%, which runs through 9% on its way.
    await climbed("63%");
    fireEvent.click(screen.getByTestId("window-compact"));
    expect(screen.getByText("Compact J's context?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    await waitFor(() => expect(store.compacted).toEqual([J]));
    expect(text("window-compact")).toBe("Compacting");
    await waitFor(() => expect(text("window-percent")).toBe("9%"), COMPACTED);
    expect(text("window-note")).toMatch(/^Compacted when asked .* 172k to 24k\.$/);
    expect(text("window-compact")).toBe("Compact now");
  }, 10_000);

  it("says the harness is away when a Compact now can't reach it", async () => {
    const away = new ServerRefused("away", 422, { error: { refusal: "harness_away" } });
    page(reads(viewOf(), away));
    await screen.findByTestId("window-group");
    fireEvent.click(screen.getByTestId("window-compact"));
    fireEvent.click(screen.getByRole("button", { name: "Compact" }));
    await waitFor(() => expect(text("window-note")).toBe("Jacobian is away"));
  });

  it("is quiet while the harness is away: no drag, no Compact now, and the foot says why", async () => {
    page(reads(viewOf({ away: true })));
    await screen.findByTestId("window-group");
    expect(slider().getAttribute("aria-disabled")).toBe("true");
    expect(slider().getAttribute("title")).toBe("Jacobian is away");
    expect((screen.getByTestId("window-compact") as HTMLButtonElement).disabled).toBe(true);
    expect(text("window-foot")).toMatch(/Jacobian is away, so nothing can be asked of it now\.$/);
  });

  it("says so for a harness that sends none, and is nothing for someone who doesn't run it", async () => {
    const { unmount } = page(reads(viewOf()), { capabilities: ["agents"] });
    await screen.findByRole("heading", { name: "J" });
    expect(screen.queryByTestId("window-group")).toBeNull();
    expect(text("window-not-shared-words")).toBe("Jacobian doesn't share how full J's context is.");
    unmount();
    page(reads(viewOf()), { selfId: DANA });
    await screen.findByRole("heading", { name: "J" });
    expect(screen.queryByTestId("window-group")).toBeNull();
    expect(screen.queryByTestId("window-not-shared")).toBeNull();
  });
});

describe("the Context window on its way (ADR 0238)", () => {
  const never = (): ReturnType<typeof reads> => ({
    ...reads(viewOf()),
    readAgentContextWindow: () => new Promise<AgentContextWindowView>(() => undefined),
  });

  it("stands blank in its place, with its harness named, until the first copy comes", async () => {
    page(never());
    expect((await screen.findByTestId("window-waiting-from")).textContent).toBe("Jacobian");
    expect(screen.queryByTestId("window-group")).toBeNull();
  });

  it("says the harness hasn't said yet when it holds no copy of the agent", async () => {
    page({
      ...reads(viewOf()),
      readAgentContextWindow: async () => {
        throw Object.assign(new Error("answered 404"), { status: 404 });
      },
    });
    expect((await screen.findByTestId("window-not-yet-words")).textContent).toBe(
      "Jacobian hasn't said how full J's context is yet.",
    );
    expect(screen.queryByTestId("window-waiting")).toBeNull();
  });

  it("comes in where its blank stood, fading in under its heading (the addendum)", async () => {
    let answer: (view: AgentContextWindowView) => void = () => undefined;
    page({
      ...reads(viewOf()),
      readAgentContextWindow: () =>
        new Promise<AgentContextWindowView>((resolve) => {
          answer = resolve;
        }),
    });
    await screen.findByTestId("window-waiting");
    answer(viewOf());
    expect((await screen.findByTestId("window-group")).classList.contains("lands")).toBe(true);
  });

  it("draws the copy kept from before at once, opened again, with no climb", async () => {
    const { unmount } = page(reads(viewOf()));
    await climbed("63%");
    unmount();
    page(never());
    expect((await screen.findByTestId("window-group")).classList.contains("lands")).toBe(false);
    expect(text("window-percent")).toBe("63%");
    expect(screen.getByTestId("window-bars").querySelectorAll('i[data-lit="true"]')).toHaveLength(
      25,
    );
  });
});
