/** An agent's context files, as a page draws them (ADR 0134). */

import type { AgentContextView, ContextEditView, HarnessContextView } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  agentContextOf,
  conflictOf,
  contextFoot,
  editWords,
  firstLine,
  harnessContextOf,
  harnessGroups,
  lineChanges,
  mayReadContext,
  notShownWords,
  ownFrom,
  settleEdit,
} from "./context.js";
import type { Directory, Participant } from "./events.js";
import { buildModel } from "./model.js";

const ARJUN = "usr_01K4ZQPX0000000000000ARJUN";
const DANA = "usr_01K4ZQPX00000000000000DANA";
const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const AGENT = "agt_01K4ZQPX000000000000AGENT";
const READ = "2026-10-07T17:42:00.000Z";

const lathe = (more: Partial<Participant> = {}): Participant => ({
  id: LATHE,
  kind: "harness",
  displayName: "Lathe",
  ownerId: ARJUN,
  capabilities: ["agents", "context_files"],
  ...more,
});
const directory = (more: Partial<Participant> = {}): Directory => ({
  [ARJUN]: { id: ARJUN, kind: "person", displayName: "Arjun" },
  [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
  [LATHE]: lathe(more),
});
const model = buildModel(
  Object.entries({ [ARJUN]: "owner", [DANA]: "member" }).map(([id, role], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: "2026-10-07T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

const view = (more: Partial<AgentContextView> = {}): AgentContextView => ({
  agent_id: AGENT,
  harness_id: LATHE,
  files: [
    {
      name: "PERSONA.md",
      title: "Who it is",
      role: "identity",
      text: "# PERSONA.md - Who you are\n\n_Plain and **careful**._",
      hash: "h1",
      editable: true,
    },
    { name: "PURPOSE.md", title: "Purpose", editable: false, shared: "default", replaceable: true },
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
});

/** The set's files as a harness that only copies them into new agents sends them: no count. */
const copied = (files: HarnessContextView["shared"]) =>
  files.map(({ used_by: _, ...file }) => file);

const harnessView: HarnessContextView = {
  harness_id: LATHE,
  shared: [
    {
      id: "default",
      name: "PURPOSE.md",
      title: "Purpose",
      text: "Be this Space for ‹its name›.",
      editable: false,
      used_by: 29,
      for_new_agents: true,
    },
  ],
  not_shown: [],
  read_at: READ,
  away: false,
};

describe("who reads an agent's context (ADR 0134)", () => {
  it("is who may remove its harness, while the harness shares its files", () => {
    expect(mayReadContext(model, directory(), LATHE, ARJUN)).toBe(true);
    expect(mayReadContext(model, directory(), LATHE, DANA)).toBe(false);
    expect(mayReadContext(model, directory({ capabilities: ["agents"] }), LATHE, ARJUN)).toBe(
      false,
    );
  });
});

describe("an agent's context, as rows", () => {
  it("draws each file as the harness named it, with what a tap opens", () => {
    const context = agentContextOf(view(), directory());
    expect(context.harnessName).toBe("Lathe");
    expect(context.rows.map((row) => [row.title, row.line, row.tag, row.opens])).toEqual([
      ["Who it is", "Plain and careful.", undefined, "editor"],
      ["Purpose", "", "shared", "harness_page"],
      ["Rules", "Never guess.", "read_only", "read_only"],
    ]);
    expect(context.rows[1]?.replaces).toBe("default");
    expect(context.rows[0]?.role).toBe("identity");
    expect(context.rows[2]?.role).toBe("other");
  });

  it("tags a file its own when it stands in place of a shared one", () => {
    const own = view({
      files: [{ name: "PURPOSE.md", title: "Purpose", text: "Mine.", hash: "h9", editable: true }],
    });
    expect(agentContextOf(own, directory(), harnessView).rows[0]?.tag).toBe("own");
    expect(agentContextOf(own, directory()).rows[0]?.tag).toBeUndefined();
  });

  it("tags nothing its own after a shared file the set only copies into new agents", () => {
    const own = view({
      files: [{ name: "PURPOSE.md", title: "Purpose", text: "Mine.", hash: "h9", editable: true }],
    });
    const startsWith: HarnessContextView = { ...harnessView, shared: copied(harnessView.shared) };
    expect(agentContextOf(own, directory(), startsWith).rows[0]?.tag).toBeUndefined();
  });

  it("tags its own a file given in place of a shared one that no agent reads now", () => {
    const own = view({
      files: [{ name: "PURPOSE.md", title: "Purpose", text: "Mine.", hash: "h9", editable: true }],
    });
    const nobody: HarnessContextView = {
      ...harnessView,
      shared: harnessView.shared.map((file) => ({ ...file, used_by: 0 })),
    };
    const context = agentContextOf(own, directory(), nobody);
    expect(context.rows[0]?.tag).toBe("own");
    expect(contextFoot(context, harnessContextOf(nobody, directory()), "Scout")).toEqual({
      before:
        "Lathe gives Scout these at the start of every turn. Purpose is Scout's own now, in place of ",
      link: "Lathe's shared one",
      after: ".",
    });
  });

  it("says what it leaves out past the eighth file, and over 64 KB", () => {
    const context = agentContextOf(
      view({
        not_shown: [
          { name: "notes/1.md", reason: "count" },
          { name: "notes/2.md", reason: "count" },
          { name: "BIG.md", reason: "too_large" },
        ],
      }),
      directory(),
    );
    const words = notShownWords(context.notShown, "Lathe", "Scout");
    expect(words?.title).toBe("3 more files not shown");
    expect(words?.line).toBe("notes/1.md, notes/2.md, BIG.md");
    expect(words?.foot).toContain(
      "Chips shows the first 8, in Lathe's order, and doesn't support more than that yet.",
    );
    expect(words?.foot).toContain("over 64 KB: BIG.md");
    expect(words?.foot).toContain("The other 3 are still in Lathe, and Scout still reads them.");
    expect(notShownWords(context.notShown, "Lathe", "Scout", 8)?.foot).toMatch(
      /^Lathe has 11 files for Scout\. Chips shows the first 8/,
    );
    expect(
      notShownWords(agentContextOf(view(), directory()).notShown, "Lathe", "Scout"),
    ).toBeUndefined();
  });
});

describe("the foot under an agent's files", () => {
  const plain = view({
    files: [{ name: "PERSONA.md", title: "Who it is", text: "Me.", hash: "h1", editable: true }],
  });

  it("names a shared file, how many read it, and links its harness's page", () => {
    const context = agentContextOf(view(), directory(), harnessView);
    expect(context.rows[1]?.line).toBe("Be this Space for ‹its name›.");
    expect(contextFoot(context, harnessContextOf(harnessView, directory()), "Scout")).toEqual({
      before: "Purpose is shared by 29 of Lathe's agents, so it lives on ",
      link: "Lathe's page",
      after: ". Who it is and Rules are Scout's own.",
    });
  });

  it("says files copied from the harness's set for new agents are the agent's own", () => {
    const startsWith = harnessContextOf(
      { ...harnessView, shared: copied(harnessView.shared) },
      directory(),
    );
    expect(contextFoot(agentContextOf(plain, directory()), startsWith, "Scout")).toEqual({
      before: "Lathe gives Scout these at the start of every turn. They are its own, copied from ",
      link: "Lathe's set for new agents",
      after: " when it was made.",
    });
  });

  it("links nothing when the harness has no set of its own", () => {
    expect(contextFoot(agentContextOf(plain, directory()), undefined, "Scout")).toEqual({
      before: "Lathe gives Scout these at the start of every turn.",
    });
  });

  it("says when the agent reads them, where its harness says (ADR 0238)", () => {
    const note = "Lathe reads these when a conversation starts.";
    const read = agentContextOf({ ...plain, read_note: note }, directory());
    expect(contextFoot(read, undefined, "Scout")).toEqual({ before: note });
  });

  it("says what Chips leaves out instead, past the eighth file", () => {
    const many = agentContextOf(
      view({ not_shown: [{ name: "notes/1.md", reason: "count" }] }),
      directory(),
    );
    expect(contextFoot(many, undefined, "Scout").before).toMatch(
      /^Lathe has 4 files for Scout\. Chips shows the first 8/,
    );
  });
});

describe("a harness's own set", () => {
  it("draws its shared files read only, with how many read them", () => {
    const context = harnessContextOf(harnessView, directory());
    expect(context.shared[0]).toMatchObject({
      id: "default",
      tag: "read_only",
      opens: "read_only",
      usedBy: 29,
      forNewAgents: true,
    });
  });

  it("begins an agent's own from the shared text, with its name filled in", () => {
    const shared = harnessContextOf(harnessView, directory()).shared[0];
    expect(shared === undefined ? "" : ownFrom(shared, "Shore Writer")).toBe(
      "Be this Space for Shore Writer.",
    );
  });
});

describe("a harness's page, for its owner", () => {
  it("lists the files its agents share, read only and why", () => {
    const groups = harnessGroups(
      harnessContextOf(
        {
          ...harnessView,
          shared: harnessView.shared.map((file) => ({
            ...file,
            why_read_only: "Built into Lathe",
          })),
          new_agents_note: "and an About you of its own",
        },
        directory(),
      ),
    );
    expect(groups.shared.map((row) => row.title)).toEqual(["Purpose"]);
    expect(groups.sharedFoot).toBe(
      "Built into Lathe, so it is read only here. To change one for a single agent, give it its own from its page.",
    );
    expect(groups.forNew).toEqual([]);
    expect(groups.newLine).toBe("Lathe's shared Purpose, and an About you of its own.");
  });

  it("lists what each new agent is given a copy of, and says nothing is shared", () => {
    const groups = harnessGroups(
      harnessContextOf(
        {
          ...harnessView,
          shared: copied(harnessView.shared).map((file) => ({ ...file, editable: true })),
          new_agents_note: "and a Memory of its own",
        },
        directory(),
      ),
    );
    expect(groups.shared).toEqual([]);
    expect(groups.sharedFoot).toBe("Nothing. Each Lathe agent has its own files.");
    expect(groups.forNew.map((row) => [row.title, row.opens])).toEqual([["Purpose", "editor"]]);
    expect(groups.newFoot).toBe(
      "Each new Lathe agent gets its own copy of this, and a Memory of its own. Changing it leaves agents made before as they are.",
    );
    expect(groups.newLine).toBeUndefined();
  });
});

describe("a shared file no agent reads now", () => {
  it("stays shared on its harness's page, with none reading it, and is not what new agents copy", () => {
    const groups = harnessGroups(
      harnessContextOf(
        { ...harnessView, shared: harnessView.shared.map((file) => ({ ...file, used_by: 0 })) },
        directory(),
      ),
    );
    expect(groups.shared.map((row) => [row.title, row.usedBy])).toEqual([["Purpose", 0]]);
    expect(groups.forNew).toEqual([]);
    expect(groups.newLine).toBe("Lathe's shared Purpose.");
  });
});

describe("a conflict's two sides", () => {
  it("finds the lines each side added and took out, in order", () => {
    expect(lineChanges("a\nb\nc", "a\nB\nc\nd")).toEqual({ added: ["B", "d"], removed: ["b"] });
    expect(lineChanges("a\n\nb", "a\nb")).toEqual({ added: [], removed: [] });
  });

  it("compares each side with the text the person opened", () => {
    const opened = "# Soul\n\nBe kind.";
    expect(conflictOf(opened, `${opened}\n\n## Vibe\nCalm.`, `${opened}\nBe brief.`)).toEqual({
      theirs: { added: ["## Vibe", "Calm."], removed: [] },
      mine: { added: ["Be brief."], removed: [] },
    });
  });
});

describe("the editor's words", () => {
  it("says each state in the harness's and the agent's names", () => {
    expect(editWords("waiting", "Lathe", "Scout")).toBe("Saving to Lathe…");
    expect(editWords("saved", "Lathe", "Scout")).toBe("Saved · Scout reads it next turn");
    expect(editWords("away", "Lathe", "Scout")).toBe(
      "Lathe is away. You can read this, not save it.",
    );
    expect(editWords("away", "Lathe", "Scout", { atSave: true })).toBe(
      "Lathe is away. Your words are still here, to save once it's back.",
    );
    // An answer after the minute still saves, so missed says only that none came.
    expect(editWords("missed", "Lathe", "Scout")).toBe(
      "Lathe hasn't answered. Your words are still here.",
    );
    expect(editWords("saved", "Lathe", undefined)).toBe("Saved · new agents get it");
    expect(editWords("new", "Lathe", "Scout", { from: "Lathe's default" })).toBe(
      "Starts as Lathe's default",
    );
    expect(editWords("read", "Lathe", "Scout", { readAt: "10:42 AM" })).toBe(
      "Read from Lathe at 10:42 AM",
    );
  });

  it("reads a file's first line past its headings and marks", () => {
    expect(firstLine("# Title\n\n## Sub\n- **Be** brief.")).toBe("Be brief.");
  });
});

describe("waiting for an edit's harness", () => {
  it("reads until the edit is no longer waiting", async () => {
    const states: ContextEditView["state"][] = ["waiting", "waiting", "saved"];
    let reads = 0;
    const settled = await settleEdit(
      async () => ({
        edit_id: "edt_01K4ZQPX00000000000000000Z",
        name: "PERSONA.md",
        state: states[Math.min(reads++, states.length - 1)] ?? "saved",
        asked_at: READ,
      }),
      "edt_01K4ZQPX00000000000000000Z",
      { sleep: async () => undefined },
    );
    expect(settled.state).toBe("saved");
    expect(reads).toBe(3);
  });
});
