/** How the context editor works, the same on the phone and the web (ADR 0135). */

import type { AgentContextView, ContextEditView, HarnessContextView } from "@chipschat/protocol";
import { describe, expect, it } from "vitest";
import {
  type ContextReads,
  cameBack,
  contextOpening,
  editorCan,
  harnessAway,
  keptMine,
  markdownInks,
  openEditor,
  putOff,
  saveContextEdit,
  sending,
  settled,
  tookTheirs,
  typed,
} from "./contextEditor.js";
import type { Directory } from "./events.js";
import { ServerRefused } from "./transport.js";

const LATHE = "hrn_01K4ZQPX000000000000LATHE";
const SCOUT = "agt_01K4ZQPX000000000000SCOUT";
const READ = "2026-10-07T17:42:00.000Z";
const EDIT = "edt_01K4ZQPX00000000000000000Z";

const directory: Directory = {
  [LATHE]: { id: LATHE, kind: "harness", displayName: "Lathe" },
  [SCOUT]: { id: SCOUT, kind: "agent", displayName: "Scout", harnessId: LATHE },
};

const view: AgentContextView = {
  agent_id: SCOUT,
  harness_id: LATHE,
  files: [
    {
      name: "PERSONA.md",
      title: "Who it is",
      role: "identity",
      text: "Be plain.",
      hash: "h1",
      editable: true,
    },
    { name: "PURPOSE.md", title: "Purpose", editable: false, shared: "default", replaceable: true },
  ],
  not_shown: [],
  read_at: READ,
  away: false,
};

const setView: HarnessContextView = {
  harness_id: LATHE,
  shared: [
    {
      id: "default",
      name: "PURPOSE.md",
      title: "Purpose",
      about: "Lathe's default",
      text: "Be this Space for ‹its name›.",
      hash: "d1",
      editable: false,
      used_by: 3,
      for_new_agents: true,
    },
    {
      id: "starter",
      name: "NOTES.md",
      title: "Notes",
      text: "Start here.",
      hash: "s1",
      editable: true,
      for_new_agents: true,
    },
  ],
  not_shown: [],
  read_at: READ,
  away: false,
};

const edit = (state: ContextEditView["state"], message?: string): ContextEditView => ({
  edit_id: EDIT,
  name: "PERSONA.md",
  state,
  asked_at: READ,
  ...(message === undefined ? {} : { message }),
});

/** A store whose edits come to what each test says. */
function store(more: Partial<ContextReads> = {}): ContextReads & { readonly asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    agentContext: async () => view,
    harnessContext: async () => setView,
    editContext: async (input) => {
      asked.push(input);
      return edit("waiting");
    },
    contextEdit: async () => edit("saved"),
    ...more,
  };
}

const agent = { kind: "agent", id: SCOUT } as const;
const alive = { alive: () => true, sleep: async () => undefined };

describe("an editor's model", () => {
  it("opens as read, as new for an agent's own of a shared file, or as away", () => {
    expect(openEditor({ text: "a", hash: "h" }, false).state).toBe("read");
    expect(openEditor({ text: "a", hash: null }, false).state).toBe("new");
    expect(openEditor({ text: "a", hash: "h" }, true).state).toBe("away");
  });

  it("is edited once typed into, and read again once back to the file's words", () => {
    const opened = openEditor({ text: "a", hash: "h" }, false);
    expect(editorCan(opened)).toEqual({
      dirty: false,
      unsaved: false,
      mayType: true,
      maySave: false,
    });
    const edited = typed(opened, "ab");
    expect(editorCan(edited).unsaved).toBe(true);
    expect(edited.state).toBe("edited");
    expect(editorCan(edited).maySave).toBe(true);
    expect(typed(edited, "a").state).toBe("read");
  });

  it("has something to save from the start when it gives an agent its own", () => {
    const fresh = openEditor({ text: "shared", hash: null }, false);
    // Nothing typed yet: going back loses nothing, so it doesn't ask.
    expect(editorCan(fresh)).toEqual({ dirty: true, unsaved: false, mayType: true, maySave: true });
    expect(typed(fresh, "shared").state).toBe("edited");
  });

  it("takes no typing when it opened away, and saves nothing while away", () => {
    const opened = openEditor({ text: "a", hash: "h" }, true);
    expect(editorCan(opened)).toEqual({
      dirty: false,
      unsaved: false,
      mayType: false,
      maySave: false,
    });
    // Gone away at a save: the words may still be changed, and stay away.
    const later = settled(sending(typed(openEditor({ text: "a", hash: "h" }, false), "ab")), {
      state: "away",
    });
    expect(editorCan(later)).toEqual({ dirty: true, unsaved: true, mayType: true, maySave: false });
    expect(typed(later, "abc").state).toBe("away");
  });

  it("saves again once its harness is back, and takes typing if it opened away", () => {
    const later = settled(sending(typed(openEditor({ text: "a", hash: "h" }, false), "ab")), {
      state: "away",
    });
    const back = cameBack(later);
    expect(back.state).toBe("edited");
    expect(editorCan(back)).toMatchObject({ mayType: true, maySave: true });

    const opened = cameBack(openEditor({ text: "a", hash: "h" }, true));
    expect(opened.state).toBe("read");
    expect(editorCan(opened)).toMatchObject({ mayType: true, maySave: false });
    // An agent's own of a shared file, opened away: there is something to save once it is back.
    const own = cameBack(openEditor({ text: "a", hash: null }, true));
    expect(own.state).toBe("new");
    expect(editorCan(own).maySave).toBe(true);
    // Only away comes back.
    const saving = sending(typed(openEditor({ text: "a", hash: "h" }, false), "ab"));
    expect(cameBack(saving)).toBe(saving);
  });

  it("holds the words while it saves, and once saved", () => {
    const saving = sending(typed(openEditor({ text: "a", hash: "h" }, false), "ab"));
    expect(editorCan(saving)).toEqual({
      dirty: true,
      unsaved: false,
      mayType: false,
      maySave: false,
    });
    expect(typed(saving, "abc").state).toBe("waiting");
    expect(editorCan(settled(saving, { state: "saved" })).maySave).toBe(false);
  });

  it("asks whose words stay: keep mine saves them over theirs", () => {
    const theirs = { text: "theirs", hash: "h2", readAt: READ };
    const asked = settled(sending(typed(openEditor({ text: "a", hash: "h" }, false), "mine")), {
      state: "changed",
      theirs,
    });
    expect(editorCan(asked).maySave).toBe(false);
    const kept = keptMine(asked);
    expect(kept?.from).toEqual({ text: "theirs", hash: "h2" });
    expect(kept?.model.text).toBe("mine");
    expect(kept?.model.theirs).toBeUndefined();
  });

  it("puts theirs in the editor to read, saving nothing, and says so when typed back", () => {
    const theirs = { text: "theirs", hash: "h2", readAt: READ };
    const asked = settled(typed(openEditor({ text: "a", hash: "h" }, false), "mine"), {
      state: "changed",
      theirs,
    });
    const took = tookTheirs(asked);
    expect(took).toMatchObject({ text: "theirs", state: "theirs", theirsAt: READ });
    expect(editorCan(took).dirty).toBe(false);
    expect(typed(typed(took, "theirs!"), "theirs").state).toBe("theirs");
  });

  it("keeps the person's words over theirs when the ask is put away", () => {
    const theirs = { text: "theirs", hash: "h2", readAt: READ };
    const asked = settled(typed(openEditor({ text: "a", hash: "h" }, false), "mine"), {
      state: "changed",
      theirs,
    });
    const later = putOff(asked);
    expect(later).toMatchObject({ text: "mine", state: "edited", base: { hash: "h2" } });
    expect(editorCan(later).maySave).toBe(true);
  });
});

describe("a save", () => {
  it("is sent with the hash it was made from, and saved when the harness answers", async () => {
    const reads = store();
    const outcome = await saveContextEdit(
      reads,
      agent,
      "PERSONA.md",
      { text: "a", hash: "h1" },
      "ab",
      alive,
    );
    expect(outcome.state).toBe("saved");
    expect(reads.asked).toEqual([
      { owner: "agent", id: SCOUT, name: "PERSONA.md", text: "ab", baseHash: "h1" },
    ]);
  });

  it("comes back with theirs when the harness refused it as changed", async () => {
    const changedView = {
      ...view,
      files: [{ ...view.files[0], text: "Hand-written.", hash: "h9" }],
    } as AgentContextView;
    const outcome = await saveContextEdit(
      store({
        contextEdit: async () => edit("changed"),
        agentContext: async () => changedView,
      }),
      agent,
      "PERSONA.md",
      { text: "a", hash: "h1" },
      "ab",
      alive,
    );
    expect(outcome).toEqual({
      state: "changed",
      theirs: { text: "Hand-written.", hash: "h9", readAt: READ },
    });
  });

  it("comes back with theirs when the server's copy had already moved", async () => {
    const outcome = await saveContextEdit(
      store({
        editContext: async () => {
          throw new ServerRefused("stale", 409, {
            error: { code: "stale_context" },
            file: { text: "Newer.", hash: "h7" },
          });
        },
      }),
      agent,
      "PERSONA.md",
      { text: "a", hash: "h1" },
      "ab",
      alive,
    );
    expect(outcome.state).toBe("changed");
    expect(outcome.theirs).toMatchObject({ text: "Newer.", hash: "h7" });
  });

  it("is away, failed with the harness's words, or missed", async () => {
    const from = { text: "a", hash: "h1" };
    const awayStore = store({
      editContext: async () => {
        throw new ServerRefused("away", 409, { error: { refusal: "harness_away" } });
      },
    });
    expect((await saveContextEdit(awayStore, agent, "PERSONA.md", from, "b", alive)).state).toBe(
      "away",
    );
    const failed = store({ contextEdit: async () => edit("failed", "Too long.") });
    expect(await saveContextEdit(failed, agent, "PERSONA.md", from, "b", alive)).toEqual({
      state: "failed",
      message: "Too long.",
    });
    const missed = store({ contextEdit: async () => edit("missed") });
    expect((await saveContextEdit(missed, agent, "PERSONA.md", from, "b", alive)).state).toBe(
      "missed",
    );
  });
});

describe("an away harness, read again", () => {
  it("is still away while its copy says so, or cannot be read", async () => {
    const away = store({ agentContext: async () => ({ ...view, away: true }) });
    expect(await harnessAway(away, agent)).toBe(true);
    const unread = store({
      agentContext: async () => {
        throw new Error("offline");
      },
    });
    expect(await harnessAway(unread, agent)).toBe(true);
    expect(await harnessAway(store(), agent)).toBe(false);
  });

  it("reads a harness's own set for its own files", async () => {
    const away = store({ harnessContext: async () => ({ ...setView, away: true }) });
    expect(await harnessAway(away, { kind: "harness", id: LATHE })).toBe(true);
    expect(await harnessAway(away, agent)).toBe(false);
  });
});

describe("what a file's screen opens on", () => {
  it("opens an agent's own file on the words its row showed", () => {
    const opening = contextOpening(agent, { view, setView }, directory, "PERSONA.md", false);
    expect(opening).toMatchObject({
      text: "Be plain.",
      hash: "h1",
      words: { harnessName: "Lathe", agentName: "Scout", whose: "Scout's own" },
    });
  });

  it("begins an agent's own of a shared file from the shared text, its name filled in", () => {
    const opening = contextOpening(agent, { view, setView }, directory, "PURPOSE.md", true);
    expect(opening).toMatchObject({
      text: "Be this Space for Scout.",
      hash: null,
      row: { tag: "own", opens: "editor" },
      words: { whose: "Scout's own · new", from: "Lathe's default" },
    });
  });

  it("opens a file of the harness's own set, saying whose it is", () => {
    const harness = { kind: "harness", id: LATHE } as const;
    expect(contextOpening(harness, { setView }, directory, "PURPOSE.md", false)?.words.whose).toBe(
      "Shared by Lathe's agents",
    );
    expect(contextOpening(harness, { setView }, directory, "NOTES.md", false)?.words.whose).toBe(
      "Lathe's set for new agents",
    );
  });

  it("is nothing while the copy it needs is not read", () => {
    expect(contextOpening(agent, {}, directory, "PERSONA.md", false)).toBeUndefined();
    expect(contextOpening(agent, { view }, directory, "PURPOSE.md", true)).toBeUndefined();
  });
});

describe("a context file's Markdown, as inks", () => {
  const inks = (text: string) => markdownInks(text).map(({ text, ink }) => [ink, text]);

  it("dims the marks and brings what they mark up, keeping every character", () => {
    const text = "# Who\n- **Plain** and `kind`\n_quiet_ snake_case_name";
    expect(
      markdownInks(text)
        .map((each) => each.text)
        .join(""),
    ).toBe(text);
    expect(inks(text)).toEqual([
      ["mark", "#"],
      ["strong", " Who"],
      ["plain", "\n"],
      ["mark", "-"],
      ["plain", " "],
      ["mark", "**"],
      ["strong", "Plain"],
      ["mark", "**"],
      ["plain", " and "],
      ["mark", "`"],
      ["code", "kind"],
      ["mark", "`"],
      ["plain", "\n"],
      ["mark", "_"],
      ["strong", "quiet"],
      ["mark", "_"],
      ["plain", " snake_case_name"],
    ]);
  });

  it("draws a very long text plain", () => {
    const long = "**a** ".repeat(4000);
    expect(inks(long)).toEqual([["plain", long]]);
  });
});
