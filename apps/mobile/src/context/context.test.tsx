/**
 * An agent's context on the phone (ADR 0135): the Context group on its card, the editor and what
 * becomes of a save, the sheet that asks whose words stay, the page that reads a file kept read
 * only, and its harness's own set on the harness's page. Lathe is a harness that sends its files;
 * Scout is its agent.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { AWAY_READ_MS, ServerRefused } from "@chipschat/core";
import type {
  AgentContextView,
  ContextEditView,
  ContextFile as File,
  HarnessContextView,
} from "@chipschat/protocol";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  within,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Keyboard } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Profile } from "../harnesses/Profile";
import { Part } from "../harnesses/parts/Part";
import { agentsSnapshot, ME } from "../testing/agents";
import { fakeStore } from "../testing/fixtures";
import { ContextFile } from "./ContextFile";
import { ContextGroup } from "./ContextGroup";
import { forget, land } from "./memory";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const pushed: unknown[] = [];
const prevented: boolean[] = [];
jest.mock("expo-router", () => {
  const { View } = require("react-native");
  return {
    useRouter: () => ({ push: (to: unknown) => pushed.push(to), back: jest.fn() }),
    useNavigation: () => ({ dispatch: jest.fn() }),
    // The bar's right-hand item, drawn where a test can press it.
    Stack: {
      Screen: ({
        options,
      }: {
        options: {
          title?: string;
          unstable_headerRightItems?: () => { element: ReactElement }[];
        };
      }) => (
        <View testID={`bar-${options.title ?? ""}`}>
          {options.unstable_headerRightItems?.().map((item, at) => (
            <View key={String(at)}>{item.element}</View>
          ))}
        </View>
      ),
    },
  };
});
jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (prevent: boolean) => {
    prevented.push(prevent);
  },
}));

const DANA = "usr_dana";
const LATHE = "hrn_lathe";
const SCOUT = "agt_scout";
const READ = "2026-10-07T17:42:00.000Z";

function snapshot(capabilities: readonly string[] = ["agents", "context_files"]): Snapshot {
  const base = agentsSnapshot();
  return {
    ...base,
    directory: {
      ...base.directory,
      [DANA]: { id: DANA, kind: "person", displayName: "Dana" },
      [LATHE]: { id: LATHE, kind: "harness", displayName: "Lathe", ownerId: ME, capabilities },
      [SCOUT]: { id: SCOUT, kind: "agent", harnessId: LATHE, displayName: "Scout", room: null },
    },
    model: {
      ...base.model,
      people: {
        ...base.model.people,
        [DANA]: { participantId: DANA, displayName: "Dana", role: "member" },
      },
    },
  } as unknown as Snapshot;
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

interface Seen {
  edits: { name: string; text: string; baseHash: string | null }[];
}

function storeWith(
  copy: AgentContextView = agentCopy(),
  answers: ContextEditView["state"][] = ["saved"],
  options: { refuse?: Error; snap?: Snapshot; set?: HarnessContextView } = {},
) {
  const seen: Seen = { edits: [] };
  let reads = 0;
  const store = Object.assign(fakeStore(options.snap ?? snapshot()), {
    agentContext: jest.fn(async () => copy),
    harnessContext: jest.fn(async () => options.set ?? harnessCopy),
    editContext: jest.fn(async (input: { name: string; text: string; baseHash: string | null }) => {
      seen.edits.push({ name: input.name, text: input.text, baseHash: input.baseHash });
      if (options.refuse !== undefined && seen.edits.length === 1) throw options.refuse;
      return view("waiting");
    }),
    contextEdit: jest.fn(async () =>
      view(answers[Math.min(reads++, answers.length - 1)] ?? "saved"),
    ),
  });
  return { store: store as unknown as Store & typeof store, seen };
}

const view = (state: ContextEditView["state"]): ContextEditView => ({
  edit_id: "edt_01K4ZQPX00000000000000000Z" as ContextEditView["edit_id"],
  name: "PERSONA.md",
  state,
  asked_at: READ,
});

beforeEach(() => {
  pushed.length = 0;
  prevented.length = 0;
  forget();
});

describe("the Context group on an agent's card", () => {
  function group(store: Store, selfId = ME, handlers: Partial<Record<string, jest.Mock>> = {}) {
    return render(
      <ContextGroup
        store={store}
        snapshot={store.getSnapshot()}
        agentId={SCOUT}
        agentName="Scout"
        selfId={selfId}
        focus={1}
        onOpenFile={handlers["file"] ?? jest.fn()}
        onOpenHarness={handlers["harness"] ?? jest.fn()}
      />,
    );
  }

  it("lists each file as its harness named it, tagged shared or read only", async () => {
    const { store } = storeWith();
    await group(store);
    expect(await screen.findByTestId("context-row-PERSONA.md")).toHaveTextContent(
      /Who it isPERSONA\.md · Be plain\./,
    );
    expect(screen.getByTestId("context-row-PURPOSE.md")).toHaveTextContent(
      /PurposePURPOSE\.md · Lathe's default.*Shared/,
    );
    expect(screen.getByTestId("context-row-RULES.md")).toHaveTextContent(/Read only/);
    expect(screen.getByTestId("context-read-from")).toHaveTextContent(/^Lathe · /);
  });

  it("says a shared file lives on its harness's page, and links it", async () => {
    const harness = jest.fn();
    const { store } = storeWith();
    await group(store, ME, { harness });
    expect(await screen.findByTestId("context-foot")).toHaveTextContent(
      "Purpose is shared by 12 of Lathe's agents, so it lives on Lathe's page. Who it is and Rules are Scout's own.",
    );
    await userEvent.press(screen.getByTestId("context-foot-link"));
    expect(harness).toHaveBeenCalledWith(LATHE);
    await userEvent.press(screen.getByTestId("context-row-PURPOSE.md"));
    expect(harness).toHaveBeenLastCalledWith(LATHE, "purpose");
  });

  it("opens a file of its own in the editor, and offers to give it its own of a shared one", async () => {
    const file = jest.fn();
    const { store } = storeWith();
    await group(store, ME, { file });
    await userEvent.press(await screen.findByTestId("context-row-PERSONA.md"));
    expect(file).toHaveBeenCalledWith("PERSONA.md", "open");
    expect(screen.getByTestId("context-give-PURPOSE.md")).toHaveTextContent(
      "Give Scout its own Purpose…",
    );
    await userEvent.press(screen.getByTestId("context-give-PURPOSE.md"));
    expect(file).toHaveBeenLastCalledWith("PURPOSE.md", "own");
  });

  it("shows eight and names the rest, saying Chips doesn't show them", async () => {
    const eight = Array.from({ length: 8 }, (_, at) => ({
      ...PERSONA,
      name: `notes/${at}.md`,
      title: `Note ${at}`,
    }));
    const { store } = storeWith(
      agentCopy({
        files: eight,
        not_shown: [
          { name: "notes/8.md", reason: "count" },
          { name: "notes/9.md", reason: "count" },
          { name: "notes/10.md", reason: "count" },
        ],
      }),
    );
    await group(store);
    expect(await screen.findByTestId("context-not-shown")).toHaveTextContent(
      "3 more files not shownnotes/8.md, notes/9.md, notes/10.md",
    );
    expect(screen.getByTestId("context-foot")).toHaveTextContent(
      /^Lathe has 11 files for Scout\. Chips shows the first 8, in Lathe's order, and doesn't support more than that yet\. The other 3 are still in Lathe, and Scout still reads them\.$/,
    );
  });

  it("is not there for anybody but its harness's owner, and asks nothing", async () => {
    const { store } = storeWith();
    await group(store, DANA);
    expect(screen.queryByTestId("context-group")).toBeNull();
    expect(store.agentContext).not.toHaveBeenCalled();
  });

  it("says so, for a harness that doesn't send its files, and asks nothing", async () => {
    const { store } = storeWith(agentCopy(), ["saved"], { snap: snapshot(["agents"]) });
    await group(store);
    expect(screen.queryByTestId("context-group")).toBeNull();
    expect(screen.getByTestId("context-not-shared-words")).toHaveTextContent(
      "Lathe doesn't share Scout's context files with Chips.",
    );
    expect(store.agentContext).not.toHaveBeenCalled();
  });

  it("stands blank in its place until the first copy comes (ADR 0238)", async () => {
    const { store } = storeWith();
    store.agentContext.mockImplementation(() => new Promise<AgentContextView>(() => undefined));
    await group(store);
    expect(screen.queryByTestId("context-group")).toBeNull();
    expect(screen.getByTestId("context-waiting-from")).toHaveTextContent("Lathe");
  });

  it("says when the agent reads its files, where its harness says (ADR 0238)", async () => {
    const note = "Lathe reads these when a conversation starts.";
    const { store } = storeWith(agentCopy({ files: [PERSONA], not_shown: [], read_note: note }));
    await group(store);
    expect(await screen.findByTestId("context-foot")).toHaveTextContent(note);
  });

  it("flashes the row of a file just saved", async () => {
    land(`agent:${SCOUT}`, "PERSONA.md");
    const { store } = storeWith();
    await group(store);
    expect(await screen.findByTestId("context-row-PERSONA.md")).toBeVisible();
  });
});

describe("the editor", () => {
  async function open(store: Store, name = "PERSONA.md", own = false, onDone = jest.fn()) {
    await render(
      <ContextFile
        store={store}
        snapshot={store.getSnapshot()}
        owner={{ kind: "agent", id: SCOUT }}
        name={name}
        own={own}
        onDone={onDone}
      />,
    );
    await screen.findByTestId("context-text");
    return onDone;
  }

  /** Words typed at the end: the field says its whole text, as a phone's does. */
  const type = async (words: string) => {
    const field = screen.getByTestId("context-text");
    await act(async () => {
      fireEvent.changeText(field, `${PERSONA.text}${words}`);
    });
  };

  it("reads as the harness sent it, Save off until something changes", async () => {
    const { store } = storeWith();
    await open(store);
    expect(screen.getByTestId("context-status-words")).toHaveTextContent(/^Read from Lathe at /);
    expect(screen.getByTestId("context-save")).toBeDisabled();
    expect(prevented.at(-1)).toBe(false);
  });

  it("puts the keys away at a tap off the words", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    try {
      const { store } = storeWith();
      await open(store);
      await fireEvent.press(screen.getByTestId("context-page"));
      expect(dismiss).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  it("leaves the keys up at a swipe off the words", async () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    try {
      const { store } = storeWith();
      await open(store);
      const page = screen.getByTestId("context-page");
      await fireEvent(page, "pressIn", { nativeEvent: { pageX: 200, pageY: 140 } });
      await fireEvent.press(page, { nativeEvent: { pageX: 204, pageY: 320 } });
      expect(dismiss).not.toHaveBeenCalled();
      await fireEvent(page, "pressIn", { nativeEvent: { pageX: 200, pageY: 140 } });
      await fireEvent.press(page, { nativeEvent: { pageX: 204, pageY: 146 } });
      expect(dismiss).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  it("saves to the harness, says so, and goes back a second later", async () => {
    jest.useFakeTimers();
    try {
      const { store, seen } = storeWith(agentCopy(), ["waiting", "saved"]);
      const onDone = await open(store);
      await type(" Be brief.");
      expect(screen.getByTestId("context-status-words")).toHaveTextContent(
        "Edited · not saved yet",
      );
      expect(prevented.at(-1)).toBe(true);
      await userEvent.press(screen.getByTestId("context-save"));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(2000);
      });
      expect(seen.edits).toEqual([
        { name: "PERSONA.md", text: "# PERSONA.md\n\nBe **plain**. Be brief.", baseHash: "h1" },
      ]);
      expect(screen.getByTestId("context-status-words")).toHaveTextContent(
        "Saved · Scout reads it next turn",
      );
      expect(screen.getByTestId("context-save-done")).toBeOnTheScreen();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the words when the harness doesn't take them in its minute", async () => {
    const { store } = storeWith(agentCopy(), ["missed"]);
    await open(store);
    await type(" Be brief.");
    await userEvent.press(screen.getByTestId("context-save"));
    expect(
      await screen.findByText("Lathe hasn't answered. Your words are still here."),
    ).toBeOnTheScreen();
    expect(screen.getByTestId("context-save")).toBeEnabled();
  });

  it("reads and does not save while its harness is away", async () => {
    const { store } = storeWith(agentCopy({ away: true }));
    await open(store);
    expect(screen.getByTestId("context-status-words")).toHaveTextContent(
      "Lathe is away. You can read this, not save it.",
    );
    expect(screen.getByTestId("context-text").props["editable"]).toBe(false);
    expect(screen.getByTestId("context-save")).toBeDisabled();
  });

  it("takes typing once its harness is back, having opened while it was away", async () => {
    jest.useFakeTimers();
    try {
      let away = true;
      const { store } = storeWith(agentCopy({ away: true }));
      store.agentContext.mockImplementation(async () => agentCopy({ away }));
      await open(store);
      expect(screen.getByTestId("context-text").props["editable"]).toBe(false);
      away = false;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(AWAY_READ_MS);
      });
      expect(screen.getByTestId("context-text").props["editable"]).toBe(true);
      await type(" Be brief.");
      expect(screen.getByTestId("context-save")).toBeEnabled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("keeps the words when its harness goes away at a save, and saves once it is back", async () => {
    jest.useFakeTimers();
    try {
      let away = false;
      const gone = new ServerRefused("away", 422, { error: { refusal: "harness_away" } });
      const { store, seen } = storeWith(agentCopy(), ["saved"], { refuse: gone });
      store.agentContext.mockImplementation(async () => agentCopy({ away }));
      await open(store);
      await type(" Be brief.");
      away = true;
      await userEvent.press(screen.getByTestId("context-save"));
      expect(screen.getByTestId("context-status-words")).toHaveTextContent(
        "Lathe is away. Your words are still here, to save once it's back.",
      );
      expect(screen.getByTestId("context-save")).toBeDisabled();
      away = false;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(AWAY_READ_MS);
      });
      expect(screen.getByTestId("context-save")).toBeEnabled();
      await userEvent.press(screen.getByTestId("context-save"));
      expect(seen.edits).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("asks whose words stay when the file changed first, and keeps mine over theirs", async () => {
    const stale = new ServerRefused("changed", 409, {
      error: { code: "stale_context" },
      file: { ...PERSONA, text: "# PERSONA.md\n\nBe **plain**.\n\n## Vibe\nCalm.", hash: "h9" },
    });
    const { store, seen } = storeWith(agentCopy(), ["saved"], { refuse: stale });
    await open(store);
    await type(" Be brief.");
    await userEvent.press(screen.getByTestId("context-save"));
    const sheet = await screen.findByTestId("context-conflict");
    expect(within(sheet).getByText("Changed in Lathe while you were editing")).toBeOnTheScreen();
    expect(screen.getByText("+  ## Vibe")).toBeVisible();
    expect(screen.getByText("+  Be **plain**. Be brief.")).toBeVisible();
    await userEvent.press(screen.getByTestId("context-keep-mine"));
    expect(await screen.findByText("Saved · Scout reads it next turn")).toBeOnTheScreen();
    expect(seen.edits.map((edit) => edit.baseHash)).toEqual(["h1", "h9"]);
  });

  it("puts theirs in the editor to read, saving nothing", async () => {
    const theirs = "# PERSONA.md\n\nBe **plain**.\n\n## Vibe\nCalm.";
    const stale = new ServerRefused("changed", 409, {
      error: { code: "stale_context" },
      file: { ...PERSONA, text: theirs, hash: "h9" },
    });
    const { store, seen } = storeWith(agentCopy(), ["saved"], { refuse: stale });
    await open(store);
    await type(" Be brief.");
    await userEvent.press(screen.getByTestId("context-save"));
    await userEvent.press(await screen.findByTestId("context-use-theirs"));
    expect(screen.getByTestId("context-status-words")).toHaveTextContent(/^Theirs, from Lathe at /);
    expect(screen.getByTestId("context-save")).toBeDisabled();
    expect(seen.edits).toHaveLength(1);
    expect(prevented.at(-1)).toBe(false);
  });

  it("gives an agent its own of a shared file, begun from the shared text", async () => {
    const { store, seen } = storeWith();
    await open(store, "PURPOSE.md", true);
    expect(screen.getByTestId("context-status-words")).toHaveTextContent(
      "Starts as Lathe's default",
    );
    expect(screen.getByTestId("context-save")).toBeEnabled();
    // Nothing typed yet: going back loses nothing, so it doesn't ask.
    expect(prevented.at(-1)).toBe(false);
    await userEvent.press(screen.getByTestId("context-save"));
    expect(await screen.findByText("Saved · Scout reads it next turn")).toBeOnTheScreen();
    expect(seen.edits).toEqual([
      { name: "PURPOSE.md", text: "Be this for Scout.", baseHash: null },
    ]);
  });

  it("reads a file its harness keeps read only, with why", async () => {
    const { store } = storeWith();
    await render(
      <ContextFile
        store={store}
        snapshot={store.getSnapshot()}
        owner={{ kind: "agent", id: SCOUT }}
        name="RULES.md"
        own={false}
        onDone={jest.fn()}
      />,
    );
    expect(await screen.findByTestId("context-read-only")).toHaveTextContent(
      /Never guess\. · Built into LatheRead only/,
    );
    expect(screen.queryByTestId("context-text")).toBeNull();
  });
});

describe("a harness's own set, on the Context files page its page opens (ADR 0254)", () => {
  it("is a row on its page, saying how many are shared, opening their page", async () => {
    const { store } = storeWith();
    await render(
      <Profile store={store} snapshot={store.getSnapshot()} harnessId={LATHE} selfId={ME} />,
    );
    const row = await screen.findByTestId("harness-context-row");
    expect(row).toHaveProp("accessibilityLabel", "Context files, 1 shared");
    expect(screen.queryByTestId("harness-context")).toBeNull();
    await userEvent.press(row);
    expect(pushed.at(-1)).toEqual({
      pathname: "/harnesses/[id]/[part]",
      params: { id: LATHE, part: "context" },
    });
  });

  it("lists what its agents share, with how many, for its owner", async () => {
    const { store } = storeWith();
    await render(
      <Part
        part="context"
        store={store}
        snapshot={store.getSnapshot()}
        harnessId={LATHE}
        selfId={ME}
        focus={0}
        onOpenPart={() => {}}
      />,
    );
    expect(await screen.findByTestId("harness-context-shared")).toHaveTextContent(
      /Shared by its agentsPurposePURPOSE\.md · Lathe's default.*12Built into Lathe, so it is read only here\./,
    );
    expect(screen.getByTestId("harness-context-new")).toHaveTextContent(
      "New agents start withLathe's shared Purpose, and an About you of its own.",
    );
    // How many read it, and no faces: Chips knows how many, not which (AC-4).
    expect(screen.queryByTestId("context-faces")).toBeNull();
    await userEvent.press(screen.getByTestId("context-row-PURPOSE.md"));
    expect(pushed.at(-1)).toEqual({
      pathname: "/context",
      params: { harness: LATHE, name: "PURPOSE.md" },
    });
  });

  it("lists what each new agent is given a copy of, and that nothing is shared", async () => {
    const copied: HarnessContextView = {
      ...harnessCopy,
      shared: [{ ...PERSONA, id: "persona", for_new_agents: true }],
      new_agents_note: "and a Memory of its own",
    };
    const { store } = storeWith(agentCopy(), ["saved"], { set: copied });
    await render(
      <Part
        part="context"
        store={store}
        snapshot={store.getSnapshot()}
        harnessId={LATHE}
        selfId={ME}
        focus={0}
        onOpenPart={() => {}}
      />,
    );
    expect(await screen.findByTestId("harness-context-new")).toHaveTextContent(
      /New agents start withWho it isPERSONA\.md · Be plain\.Each new Lathe agent gets its own copy of this, and a Memory of its own\./,
    );
    expect(screen.getByTestId("harness-context-shared")).toHaveTextContent(
      "Shared by its agentsNothing. Each Lathe agent has its own files.",
    );
  });

  it("is not there for anybody else", async () => {
    const { store } = storeWith();
    await render(
      <Profile store={store} snapshot={store.getSnapshot()} harnessId={LATHE} selfId={DANA} />,
    );
    expect(screen.queryByTestId("harness-context-row")).toBeNull();
    expect(store.harnessContext).not.toHaveBeenCalled();
  });
});
