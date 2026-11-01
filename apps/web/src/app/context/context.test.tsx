/**
 * An agent's context on the desktop (ADR 0135, Phase 5): the Context group on its card, the
 * editor and what becomes of a save, the dialog that asks whose words stay, a file kept read only,
 * a harness's page that a shared file opens on, and its own set on its card. Driven through the
 * Agents tab itself, so the pages it opens and goes back from are the tab's. Lathe is a harness
 * that sends its files; Scout is its agent.
 */

import {
  type AgentStay,
  AWAY_READ_MS,
  buildModel,
  type ClientEvent,
  type ContextReads,
  type Directory,
  ServerRefused,
  type WorkspaceModel,
} from "@chipschat/core";
import type {
  AgentContextView,
  ContextEditView,
  ContextFile as File,
  HarnessContextView,
} from "@chipschat/protocol";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentsService } from "../Agents.tsx";
import type { FileService } from "../files.ts";
import { Harnesses } from "../Harnesses.tsx";
import { forget } from "./memory.ts";

const words = (element: Element) => element.textContent ?? "";
const value = (element: Element) => (element as HTMLTextAreaElement).value;
const off = (element: Element) => (element as HTMLButtonElement).disabled;

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const SCOUT = "agt_01K4ZQPX000000000000SCOUT";
const READ = "2026-10-07T17:42:00.000Z";

const joined = (id: string, role: string, seq: number): ClientEvent =>
  ({
    seq,
    type: "person.joined",
    id: `evt_${seq}`,
    ts: "2026-10-07T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id === ARJUN ? "Arjun" : "Dana",
    role,
  }) as unknown as ClientEvent;
const model = buildModel([joined(ARJUN, "owner", 1), joined(DANA, "member", 2)]);
/** Dana in a room with Scout: a member is shown the agents in her rooms (ADR 0034's addendum). */
const withScout = buildModel([
  joined(ARJUN, "owner", 1),
  joined(DANA, "member", 2),
  ...(
    [
      { type: "space.created", kind: "group", title: "Workshop" },
      { type: "membership.added", participant_id: DANA, participant_kind: "person" },
      { type: "membership.added", participant_id: SCOUT, participant_kind: "agent" },
    ] as const
  ).map(
    (fields, at) =>
      ({
        seq: 3 + at,
        id: `evt_${3 + at}`,
        ts: "2026-10-07T00:00:00.000Z",
        workspace_id: "ws_1",
        actor: { kind: "person", id: ARJUN },
        space_id: "spc_01K4ZQPX00000000000WORKSHOP",
        role: "member",
        ...fields,
      }) as unknown as ClientEvent,
  ),
]);

function directory(capabilities: readonly string[] = ["agents", "context_files"]): Directory {
  return {
    [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
    [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
    [LATHE]: { id: LATHE, kind: "harness", displayName: "Lathe", ownerId: ARJUN, capabilities },
    [SCOUT]: { id: SCOUT, kind: "agent", harnessId: LATHE, displayName: "Scout" },
  } as Directory;
}

const PERSONA: File = {
  name: "PERSONA.md",
  title: "Who it is",
  role: "identity",
  text: "# PERSONA.md\n\nBe **plain**.",
  hash: "h1",
  editable: true,
};

function agentCopy(more: Partial<AgentContextView> = {}): AgentContextView {
  return {
    agent_id: SCOUT as AgentContextView["agent_id"],
    harness_id: LATHE as AgentContextView["harness_id"],
    files: [
      PERSONA,
      {
        name: "PURPOSE.md",
        title: "Purpose",
        editable: false,
        shared: "purpose",
        replaceable: true,
      },
      {
        name: "RULES.md",
        title: "Rules",
        text: "- Never guess.",
        hash: "h2",
        editable: false,
        why_read_only: "Built into Lathe",
      },
    ],
    not_shown: [],
    read_at: READ,
    away: false,
    ...more,
  };
}

const harnessCopy: HarnessContextView = {
  harness_id: LATHE as HarnessContextView["harness_id"],
  shared: [
    {
      id: "purpose",
      name: "PURPOSE.md",
      title: "Purpose",
      about: "Lathe's default",
      text: "Be this for ‹its name›.",
      hash: "hp",
      editable: false,
      why_read_only: "Built into Lathe",
      used_by: 12,
      for_new_agents: true,
    },
  ],
  not_shown: [],
  new_agents_note: "and an About you of its own",
  read_at: READ,
  away: false,
};

const edit = (state: ContextEditView["state"]): ContextEditView => ({
  edit_id: "edt_01K4ZQPX00000000000000000Z" as ContextEditView["edit_id"],
  name: "PERSONA.md",
  state,
  asked_at: READ,
});

/** A store whose edits come to the states given, one a read, the last standing. */
function reads(
  copy: AgentContextView = agentCopy(),
  answers: ContextEditView["state"][] = ["saved"],
  refuse?: Error,
) {
  const edits: { name: string; text: string; baseHash: string | null }[] = [];
  let read = 0;
  const service: ContextReads = {
    agentContext: vi.fn(async () => copy),
    harnessContext: vi.fn(async () => harnessCopy),
    editContext: vi.fn(async (input) => {
      edits.push({ name: input.name, text: input.text, baseHash: input.baseHash });
      if (refuse !== undefined && edits.length === 1) throw refuse;
      return edit("waiting");
    }),
    contextEdit: vi.fn(async () => edit(answers[Math.min(read++, answers.length - 1)] ?? "saved")),
  };
  return { service, edits };
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

function tab(
  service: ContextReads,
  /** `agent: null` opens on the list rather than on Scout's page. */
  options: {
    selfId?: string;
    capabilities?: readonly string[];
    agent?: string | null;
    model?: WorkspaceModel;
  } = {},
) {
  return render(
    <Harnesses
      model={options.model ?? model}
      directory={directory(options.capabilities)}
      serverUrl="http://127.0.0.1:4431"
      onOpen={vi.fn()}
      onAdd={vi.fn()}
      selfId={options.selfId ?? ARJUN}
      agents={agents}
      files={{} as FileService}
      context={service}
      {...(options.agent === null ? {} : { initialAgent: options.agent ?? SCOUT })}
    />,
  );
}

beforeEach(() => {
  forget();
});

describe("the Context group on an agent's card", () => {
  it("lists each file as its harness named it, tagged shared or read only", async () => {
    tab(reads().service);
    const group = await screen.findByTestId("context-group");
    expect(words(within(group).getByTestId("context-read-from"))).toContain("Lathe ·");
    expect(words(screen.getByTestId("context-row-PERSONA.md"))).toContain(
      "Who it isPERSONA.md · Be plain.",
    );
    expect(
      words(within(screen.getByTestId("context-row-PURPOSE.md")).getByTestId("tag-shared")),
    ).toContain("Shared");
    expect(
      words(within(screen.getByTestId("context-row-RULES.md")).getByTestId("tag-read_only")),
    ).toContain("Read only");
    expect(words(screen.getByTestId("context-foot"))).toContain(
      "Purpose is shared by 12 of Lathe's agents, so it lives on Lathe's page. Who it is and Rules are Scout's own.",
    );
  });

  it("shows eight and names the rest, saying Chips doesn't show them", async () => {
    const files = Array.from({ length: 8 }, (_, at) => ({
      ...PERSONA,
      name: `F${at}.md`,
      title: `File ${at}`,
    }));
    tab(
      reads(
        agentCopy({
          files,
          not_shown: [
            { name: "F8.md", reason: "count" },
            { name: "BIG.md", reason: "too_large" },
          ],
        }),
      ).service,
    );
    expect(words(await screen.findByTestId("context-not-shown"))).toContain(
      "2 more files not shownF8.md, BIG.md",
    );
    expect(words(screen.getByTestId("context-foot"))).toContain(
      "Lathe has 10 files for Scout. Chips shows the first 8, in Lathe's order",
    );
  });

  it("is not there for anybody but its harness's owner, and asks nothing", async () => {
    const { service } = reads();
    tab(service, { selfId: DANA });
    await screen.findByTestId("agent-card");
    expect(screen.queryByTestId("context-group")).toBeNull();
    expect(service.agentContext).not.toHaveBeenCalled();
  });

  it("says so for a harness that doesn't send its files, and asks nothing", async () => {
    const { service } = reads();
    tab(service, { capabilities: ["agents"] });
    await screen.findByTestId("agent-card");
    expect(screen.queryByTestId("context-group")).toBeNull();
    expect(screen.getByTestId("context-not-shared-words").textContent).toMatch(
      /^Lathe doesn't share .*'s context files with Chips\.$/,
    );
    expect(service.agentContext).not.toHaveBeenCalled();
  });
});

describe("the editor", () => {
  async function openPersona(service: ContextReads) {
    tab(service);
    fireEvent.click(await screen.findByTestId("context-row-PERSONA.md"));
    return screen.findByTestId("context-text");
  }

  it("reads as the harness sent it, its marks dimmed, Save off until something changes", async () => {
    const field = await openPersona(reads().service);
    expect(value(field)).toBe(PERSONA.text);
    expect(off(screen.getByTestId("context-save"))).toBe(true);
    expect(words(screen.getByTestId("context-status-words"))).toContain("Read from Lathe at");
    const marks = document.querySelectorAll(".ctx-ink-mark");
    expect([...marks].map((each) => each.textContent)).toEqual(["#", "**", "**"]);
  });

  it("saves to the harness, says so, goes back a second later, and the row flashes", async () => {
    const { service, edits } = reads();
    const field = await openPersona(service);
    fireEvent.change(field, { target: { value: `${PERSONA.text}\nBe brief.` } });
    expect(words(screen.getByTestId("context-status-words"))).toContain("Edited · not saved yet");
    fireEvent.click(screen.getByTestId("context-save"));
    await waitFor(() =>
      expect(words(screen.getByTestId("context-status-words"))).toContain(
        "Saved · Scout reads it next turn",
      ),
    );
    expect(screen.getByTestId("context-save-done")).toBeTruthy();
    expect(edits).toEqual([
      { name: "PERSONA.md", text: `${PERSONA.text}\nBe brief.`, baseHash: "h1" },
    ]);
    await waitFor(() => expect(screen.getByTestId("agent-card")).toBeTruthy(), {
      timeout: 2500,
    });
    expect(
      within(await screen.findByTestId("context-row-PERSONA.md")).getByTestId("context-flash"),
    ).toBeTruthy();
  });

  it("saves with ⌘S", async () => {
    const { service, edits } = reads(agentCopy(), ["waiting"]);
    const field = await openPersona(service);
    fireEvent.change(field, { target: { value: "Be kind." } });
    fireEvent.keyDown(field, { key: "s", metaKey: true });
    await waitFor(() => expect(edits).toHaveLength(1));
  });

  it("keeps the words when the harness doesn't take them in its minute", async () => {
    const field = await openPersona(reads(agentCopy(), ["missed"]).service);
    fireEvent.change(field, { target: { value: "Be kind." } });
    fireEvent.click(screen.getByTestId("context-save"));
    expect(
      await screen.findByText("Lathe hasn't answered. Your words are still here."),
    ).toBeTruthy();
    expect(value(field)).toBe("Be kind.");
    expect(off(screen.getByTestId("context-save"))).toBe(false);
  });

  it("reads and does not save while its harness is away", async () => {
    const field = await openPersona(reads(agentCopy({ away: true })).service);
    expect(field.hasAttribute("readonly")).toBe(true);
    expect(off(screen.getByTestId("context-save"))).toBe(true);
    expect(words(screen.getByTestId("context-status-words"))).toContain(
      "Lathe is away. You can read this, not save it.",
    );
  });

  it("takes typing once its harness is back, having opened while it was away", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let away = true;
      const { service } = reads(agentCopy({ away: true }));
      const field = await openPersona({
        ...service,
        agentContext: vi.fn(async () => agentCopy({ away })),
      });
      expect(field.hasAttribute("readonly")).toBe(true);
      away = false;
      await act(() => vi.advanceTimersByTimeAsync(AWAY_READ_MS));
      await waitFor(() => expect(field.hasAttribute("readonly")).toBe(false));
      fireEvent.change(field, { target: { value: "Be kind." } });
      expect(off(screen.getByTestId("context-save"))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the words when its harness goes away at a save, and saves once it is back", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      let away = false;
      const gone = new ServerRefused("away", 422, { error: { refusal: "harness_away" } });
      const { service, edits } = reads(agentCopy(), ["saved"], gone);
      const field = await openPersona({
        ...service,
        agentContext: vi.fn(async () => agentCopy({ away })),
      });
      fireEvent.change(field, { target: { value: "Be kind." } });
      away = true;
      fireEvent.click(screen.getByTestId("context-save"));
      expect(
        await screen.findByText(
          "Lathe is away. Your words are still here, to save once it's back.",
        ),
      ).toBeTruthy();
      expect(off(screen.getByTestId("context-save"))).toBe(true);
      away = false;
      await act(() => vi.advanceTimersByTimeAsync(AWAY_READ_MS));
      await waitFor(() => expect(off(screen.getByTestId("context-save"))).toBe(false));
      expect(value(field)).toBe("Be kind.");
      fireEvent.click(screen.getByTestId("context-save"));
      await waitFor(() => expect(edits).toHaveLength(2));
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks whose words stay when the file changed first, and keeps mine over theirs", async () => {
    const stale = new ServerRefused("stale", 409, {
      error: { code: "stale_context" },
      file: { text: "# PERSONA.md\n\nBe careful.", hash: "h9" },
    });
    const { service, edits } = reads(agentCopy(), ["saved"], stale);
    const field = await openPersona(service);
    fireEvent.change(field, { target: { value: "# PERSONA.md\n\nBe kind." } });
    fireEvent.click(screen.getByTestId("context-save"));
    const asking = await screen.findByTestId("context-conflict");
    expect(words(asking)).toContain("Changed in Lathe while you were editing");
    expect(words(asking)).toContain("+  Be careful.");
    expect(words(asking)).toContain("+  Be kind.");
    fireEvent.click(within(asking).getByTestId("context-keep-mine"));
    await waitFor(() => expect(edits).toHaveLength(2));
    expect(edits[1]).toEqual({
      name: "PERSONA.md",
      text: "# PERSONA.md\n\nBe kind.",
      baseHash: "h9",
    });
  });

  it("puts theirs in the editor to read, saving nothing", async () => {
    const stale = new ServerRefused("stale", 409, {
      error: { code: "stale_context" },
      file: { text: "Theirs.", hash: "h9" },
    });
    const { service, edits } = reads(agentCopy(), ["saved"], stale);
    const field = await openPersona(service);
    fireEvent.change(field, { target: { value: "Mine." } });
    fireEvent.click(screen.getByTestId("context-save"));
    fireEvent.click(await screen.findByTestId("context-use-theirs"));
    expect(value(field)).toBe("Theirs.");
    expect(words(screen.getByTestId("context-status-words"))).toContain("Theirs, from Lathe at");
    expect(screen.queryByTestId("context-conflict")).toBeNull();
    expect(edits).toHaveLength(1);
  });

  it("asks once before leaving with words unsaved", async () => {
    const field = await openPersona(reads().service);
    fireEvent.change(field, { target: { value: "Unsaved." } });
    fireEvent.click(screen.getByRole("button", { name: "‹ Scout" }));
    const asking = await screen.findByTestId("confirm-dialog");
    expect(words(asking)).toContain("Your changes to Who it is aren't saved.");
    fireEvent.click(within(asking).getByRole("button", { name: "Keep editing" }));
    expect(value(screen.getByTestId("context-text"))).toBe("Unsaved.");
    fireEvent.click(screen.getByRole("button", { name: "‹ Scout" }));
    fireEvent.click(within(await screen.findByTestId("confirm-dialog")).getByTestId("confirm-go"));
    expect(await screen.findByTestId("agent-card")).toBeTruthy();
  });

  it("gives an agent its own of a shared file, begun from the shared text", async () => {
    const { service, edits } = reads();
    tab(service);
    fireEvent.click(await screen.findByTestId("context-give-PURPOSE.md"));
    const field = await screen.findByTestId("context-text");
    expect(value(field)).toBe("Be this for Scout.");
    expect(words(screen.getByTestId("context-status-words"))).toContain(
      "Starts as Lathe's default",
    );
    fireEvent.click(screen.getByTestId("context-save"));
    await waitFor(() => expect(edits).toHaveLength(1));
    expect(edits[0]).toEqual({ name: "PURPOSE.md", text: "Be this for Scout.", baseHash: null });
  });

  it("goes back from giving it its own without asking, when nothing was typed", async () => {
    tab(reads().service);
    fireEvent.click(await screen.findByTestId("context-give-PURPOSE.md"));
    await screen.findByTestId("context-text");
    fireEvent.click(screen.getByRole("button", { name: "‹ Scout" }));
    expect(await screen.findByTestId("agent-card")).toBeTruthy();
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });

  it("reads a file its harness keeps read only, with why", async () => {
    tab(reads().service);
    fireEvent.click(await screen.findByTestId("context-row-RULES.md"));
    const page = await screen.findByTestId("context-read-only");
    expect(words(page)).toContain("Never guess. · Built into Lathe");
    expect(within(page).getByTestId("tag-read_only")).toBeTruthy();
    expect(screen.queryByTestId("context-text")).toBeNull();
  });
});

describe("a harness's page and card", () => {
  it("opens a shared file on its harness's page, the file flashing there, and goes back", async () => {
    tab(reads().service);
    fireEvent.click(await screen.findByTestId("context-row-PURPOSE.md"));
    const page = await screen.findByRole("main", { name: "Lathe" });
    const shared = await within(page).findByTestId("harness-context-shared");
    const row = within(shared).getByTestId("context-row-PURPOSE.md");
    expect(words(row)).toContain("12");
    expect(within(row).getByTestId("context-flash")).toBeTruthy();
    expect(words(within(page).getByTestId("harness-context-new"))).toContain(
      "New agents start withLathe's shared Purpose, and an About you of its own.",
    );
    fireEvent.click(within(page).getByRole("button", { name: "‹ Scout" }));
    expect(await screen.findByTestId("agent-card")).toBeTruthy();
  });

  it("opens a shared file to read from the harness's page, going back to it", async () => {
    tab(reads().service);
    fireEvent.click(await screen.findByTestId("context-foot-link"));
    fireEvent.click(await screen.findByTestId("context-row-PURPOSE.md"));
    const page = await screen.findByTestId("context-read-only");
    expect(words(within(page).getByTestId("context-used-by"))).toContain("12 agents");
    fireEvent.click(screen.getByRole("button", { name: "‹ Lathe" }));
    expect(await screen.findByRole("main", { name: "Lathe" })).toBeTruthy();
  });

  it("lists what its agents share on its card in every harness's list, for its owner only", async () => {
    const { service } = reads();
    const { unmount } = tab(service, { agent: null });
    // Under the shelf's View all (ADR 0185).
    fireEvent.click(await screen.findByRole("button", { name: "View all harnesses" }));
    const shared = await screen.findByTestId("harness-context-shared");
    expect(words(shared)).toContain("Built into Lathe, so it is read only here.");
    // How many read it, and no faces: Chips knows how many, not which (AC-4).
    expect(words(within(shared).getByTestId("context-row-PURPOSE.md"))).toContain("12");
    expect(within(shared).queryAllByRole("img")).toHaveLength(0);
    expect(document.querySelector(".ctx-faces")).toBeNull();
    unmount();
    act(() => forget());
    const other = reads();
    tab(other.service, { selfId: DANA, agent: null, model: withScout });
    fireEvent.click(await screen.findByRole("button", { name: "View all harnesses" }));
    await screen.findByTestId("harness-card");
    expect(screen.queryByTestId("harness-context")).toBeNull();
    expect(other.service.harnessContext).not.toHaveBeenCalled();
  });
});
