/**
 * An agent's card and its message history (ADR 0087, Phase 5): where it is, since when, what it is
 * doing, and what may be done with it; and the rooms it has been in, each under its divider.
 */

import type { AgentStay, Snapshot } from "@chipschat/core";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  within,
} from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { agentsSnapshot, CHESS_STAYS, ME } from "../testing/agents";
import { fakeStore } from "../testing/fixtures";
import { drawLibrary } from "../testing/picker";
import { Split } from "../ui/Split";
import { AgentCard } from "./AgentCard";
import { History } from "./History";

const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};
function Phone({ children }: { readonly children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={IPHONE}>{children}</SafeAreaProvider>;
}
const render = (element: ReactElement) => renderBare(element, { wrapper: Phone });

const pushed: string[] = [];
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: (to: string) => pushed.push(to) }),
}));
jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
  useChips: () => ({ paired: undefined }),
}));

beforeEach(() => {
  pushed.length = 0;
});

function storeWith(stays: readonly AgentStay[] = CHESS_STAYS) {
  const store = fakeStore(agentsSnapshot());
  return Object.assign(store, {
    agentStays: async (agentId: string) => {
      store.calls.push({ name: "agentStays", args: agentId });
      return stays;
    },
  });
}

/**
 * The same workspace with Jacobian making copies (ADR 0087, Fork), and Shopping's copy in Hello,
 * named by Jacobian as Shopping is.
 */
function withForks(): Snapshot {
  const base = agentsSnapshot();
  const jacobian = base.directory["hrn_jacobian"];
  return {
    ...base,
    directory: {
      ...base.directory,
      hrn_jacobian: { ...jacobian, capabilities: ["agents", "forks"] },
      agt_copy: {
        id: "agt_copy",
        kind: "agent",
        harnessId: "hrn_jacobian",
        displayName: "Shopping · fork",
        room: "spc_hello",
        forkedFrom: "agt_shopping",
      },
    },
  } as Snapshot;
}

function forkingStore(stays: readonly AgentStay[] = []) {
  const store = fakeStore(withForks());
  return Object.assign(store, { agentStays: async () => stays });
}

function card(
  agentId: string,
  store = storeWith(),
  handlers: Partial<Record<"history" | "room" | "agent" | "deleted", (to?: string) => void>> = {},
) {
  return render(
    <AgentCard
      store={store}
      snapshot={store.getSnapshot()}
      agentId={agentId}
      selfId={ME}
      onHistory={() => handlers.history?.()}
      onOpenRoom={(spaceId) => handlers.room?.(spaceId)}
      onOpenAgent={(other) => handlers.agent?.(other)}
      onDeleted={() => handlers.deleted?.()}
    />,
  );
}

/** The workspace with Arjun the owner of Shopping's room, so he may delete it too (ADR 0067). */
function ownRooms(): Snapshot {
  const base = agentsSnapshot();
  return {
    ...base,
    model: {
      ...base.model,
      spaces: base.model.spaces.map((each) =>
        each.id === "spc_shopping" ? { ...each, roles: { [ME]: "owner" } } : each,
      ),
    },
  } as Snapshot;
}

describe("archiving and deleting from the card (ADR 0095)", () => {
  it("offers Archive and Delete to the harness's owner", async () => {
    await card("agt_shopping");
    expect(screen.getByTestId("agent-archive")).toHaveTextContent("Archive");
    expect(screen.getByTestId("agent-delete")).toHaveTextContent("Delete");
  });

  it("offers Unarchive once it is archived", async () => {
    await card("agt_chess");
    expect(screen.getByTestId("agent-archive")).toHaveTextContent("Unarchive");
  });

  it("offers neither for the Main agent", async () => {
    await card("agt_j");
    expect(screen.queryByTestId("agent-archive")).toBeNull();
    expect(screen.queryByTestId("agent-delete")).toBeNull();
  });

  it("asks before archiving, in core's words, then archives", async () => {
    const store = storeWith();
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-archive"));
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByRole("header")).toHaveTextContent("Archive Shopping?");
    expect(within(sheet).getByText(/archived with it, since no other agent is there/)).toBeTruthy();
    await userEvent.press(within(sheet).getByTestId("confirm-go"));
    expect(store.calls.filter((each) => each.name === "setAgentArchived")).toEqual([
      { name: "setAgentArchived", args: { agentId: "agt_shopping", archived: true } },
    ]);
  });

  it("unarchives without asking", async () => {
    const store = storeWith();
    await card("agt_chess", store);
    await userEvent.press(screen.getByTestId("agent-archive"));
    expect(screen.queryByTestId("confirm-sheet")).toBeNull();
    expect(store.calls.filter((each) => each.name === "setAgentArchived")).toEqual([
      { name: "setAgentArchived", args: { agentId: "agt_chess", archived: false } },
    ]);
  });

  it("deletes it, and its room with it when the switch stays on, then steps back", async () => {
    const store = Object.assign(fakeStore(ownRooms()), { agentStays: async () => [] });
    let deleted = 0;
    await card("agt_shopping", store, { deleted: () => (deleted += 1) });
    await userEvent.press(screen.getByTestId("agent-delete"));
    const sheet = await screen.findByTestId("confirm-sheet");
    expect(within(sheet).getByRole("header")).toHaveTextContent("Delete Shopping?");
    expect(within(sheet).getByText("Delete the space \u201cShopping\u201d too")).toBeTruthy();
    expect(within(sheet).getByTestId("confirm-too-words")).toHaveTextContent(/erased/);
    await userEvent.press(within(sheet).getByTestId("confirm-go"));
    expect(store.calls.filter((each) => each.name === "deleteAgent")).toEqual([
      { name: "deleteAgent", args: { agentId: "agt_shopping", options: { deleteRoom: true } } },
    ]);
    expect(deleted).toBe(1);
  });

  it("leaves the room, archived, when the switch is turned off", async () => {
    const store = Object.assign(fakeStore(ownRooms()), { agentStays: async () => [] });
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-delete"));
    const sheet = await screen.findByTestId("confirm-sheet");
    await fireEvent(within(sheet).getByTestId("confirm-too"), "valueChange", false);
    expect(within(sheet).getByTestId("confirm-too-words")).toHaveTextContent(/stays, archived/);
    await userEvent.press(within(sheet).getByTestId("confirm-go"));
    expect(store.calls.filter((each) => each.name === "deleteAgent")).toEqual([
      { name: "deleteAgent", args: { agentId: "agt_shopping", options: { deleteRoom: false } } },
    ]);
  });
});

/**
 * The workspace as Arjun sees it in `role`, with Jacobian his or another's, and the agents named
 * locked (ADR 0199).
 */
function lockable({
  role = "owner",
  harnessOwner = ME,
  locked = [],
}: {
  readonly role?: string;
  readonly harnessOwner?: string;
  readonly locked?: readonly string[];
} = {}): Snapshot {
  const base = agentsSnapshot();
  const directory: Record<string, object> = { ...base.directory };
  directory["hrn_jacobian"] = { ...directory["hrn_jacobian"], ownerId: harnessOwner };
  for (const id of locked) directory[id] = { ...directory[id], locked: true };
  return {
    ...base,
    directory,
    model: {
      ...base.model,
      people: {
        [ME]: {
          participantId: ME,
          displayName: "Arjun",
          role,
          joinedAt: "2026-09-05T00:00:00.000Z",
        },
      },
    },
  } as unknown as Snapshot;
}

function lockStore(snapshot: Snapshot) {
  return Object.assign(fakeStore(snapshot), { agentStays: async () => [] });
}

describe("locking an agent's changes (ADR 0199)", () => {
  const lock = () => screen.getByTestId("agent-lock-switch");
  const locks = (store: ReturnType<typeof fakeStore>) =>
    store.calls.filter((each) => each.name === "setAgentLock").map((each) => each.args);

  it("stands in a card of its own under the facts, off, and locks it when turned on", async () => {
    const store = lockStore(lockable());
    await card("agt_shopping", store);
    expect(
      screen.getAllByTestId(/^agent-(now|lock|icon)$/).map((row) => row.props["testID"]),
    ).toEqual(["agent-now", "agent-lock", "agent-icon"]);
    const row = within(screen.getByTestId("agent-lock"));
    expect(row.getByText("Lock changes")).toBeTruthy();
    expect(row.getByText("Rename, archive, delete")).toBeTruthy();
    expect(lock().props["value"]).toBe(false);
    await fireEvent(lock(), "valueChange", true);
    expect(locks(store)).toEqual([{ agentId: "agt_shopping", locked: true }]);
    // On at once, while the server is asked.
    expect(lock().props["value"]).toBe(true);
  });

  it.each([
    ["its harness's owner, a member", { role: "member" }],
    ["an owner of the workspace", { harnessOwner: "usr_dana" }],
    ["an admin of the workspace", { role: "admin", harnessOwner: "usr_dana" }],
  ])("is offered to %s", async (_, over) => {
    await card("agt_shopping", lockStore(lockable(over)));
    expect(screen.getByTestId("agent-lock")).toBeOnTheScreen();
  });

  it.each([
    [
      "a member whose harness it is not",
      "agt_shopping",
      { role: "member", harnessOwner: "usr_dana" },
    ],
    ["a guest", "agt_shopping", { role: "guest" }],
    ["anybody, on the Main agent", "agt_j", {}],
  ])("is not offered to %s", async (_, agentId, over) => {
    await card(agentId, lockStore(lockable(over)));
    expect(screen.getByTestId("agent-now")).toBeOnTheScreen();
    expect(screen.queryByTestId("agent-lock")).toBeNull();
  });

  it("takes Archive, Delete and the pen away while locked, and says why at the foot", async () => {
    const store = lockStore(lockable({ locked: ["agt_shopping"] }));
    await card("agt_shopping", store);
    expect(lock().props["value"]).toBe(true);
    expect(screen.queryByTestId("agent-archive")).toBeNull();
    expect(screen.queryByTestId("agent-delete")).toBeNull();
    // Move is not locked.
    expect(screen.getByTestId("agent-move")).toBeOnTheScreen();
    // A padlock where the pen was, and a name that does not edit.
    const name = screen.getByTestId("agent-name");
    expect(name).toBeDisabled();
    expect(name).toHaveAccessibleName("Shopping, changes locked");
    expect(within(name).getByTestId("agent-name-locked")).toBeTruthy();
    await userEvent.press(name);
    expect(screen.queryByTestId("agent-name-field")).toBeNull();
    expect(
      screen.getByText(/Changes are locked\. Unlock them to rename, archive or delete it\./),
    ).toBeTruthy();
    // And it is let go from the same switch.
    await fireEvent(lock(), "valueChange", false);
    expect(locks(store)).toEqual([{ agentId: "agt_shopping", locked: false }]);
  });

  it("wears no padlock on the name while its changes are not locked", async () => {
    await card("agt_shopping", lockStore(lockable()));
    expect(screen.queryByTestId("agent-name-locked")).toBeNull();
    expect(screen.getByTestId("agent-name")).toHaveAccessibleName("Shopping");
  });

  it("still offers Unarchive for an archived agent that is locked, and no Delete", async () => {
    const store = lockStore(lockable({ locked: ["agt_chess"] }));
    await card("agt_chess", store);
    expect(screen.getByTestId("agent-archive")).toHaveTextContent("Unarchive");
    expect(screen.queryByTestId("agent-delete")).toBeNull();
    await userEvent.press(screen.getByTestId("agent-archive"));
    expect(store.calls.filter((each) => each.name === "setAgentArchived")).toEqual([
      { name: "setAgentArchived", args: { agentId: "agt_chess", archived: false } },
    ]);
  });

  it("puts the switch back when the server will not", async () => {
    const store = Object.assign(lockStore(lockable()), {
      setAgentLock: async () => {
        throw new Error("Only its harness's owner or an admin may lock it.");
      },
    });
    await card("agt_shopping", store);
    await fireEvent(lock(), "valueChange", true);
    await act(async () => undefined);
    expect(lock().props["value"]).toBe(false);
  });

  it("glows its row once when opened from Locked, and not otherwise", async () => {
    const store = lockStore(lockable({ locked: ["agt_shopping"] }));
    await card("agt_shopping", store);
    expect(screen.queryByTestId("agent-lock-glow")).toBeNull();
    await render(
      <AgentCard
        store={store}
        snapshot={store.getSnapshot()}
        agentId="agt_shopping"
        selfId={ME}
        lockGlow
        onHistory={() => undefined}
        onOpenRoom={() => undefined}
      />,
    );
    expect(screen.getByTestId("agent-lock-glow")).toBeTruthy();
  });
});

describe("an agent's card", () => {
  it("reads as one column across the whole pane beside the list, in the phone's order (ADR 0276)", async () => {
    const store = storeWith();
    await render(
      <Split
        away
        list={<Text>the agents</Text>}
        detail={
          <AgentCard
            store={store}
            snapshot={store.getSnapshot()}
            agentId="agt_chess"
            selfId={ME}
            onHistory={() => undefined}
            onOpenRoom={() => undefined}
            onOpenAgent={() => undefined}
            onDeleted={() => undefined}
          />
        }
      />,
    );
    expect(screen.queryByTestId("columns")).toBeNull();
    // What it is comes before what it did, one under the other, as on a phone.
    const order = screen
      .getAllByTestId(/^agent-(now|lock-switch|history)$/)
      .map((each) => each.props["testID"] as string);
    expect(order).toEqual(["agent-now", "agent-lock-switch", "agent-history"]);
  });

  it("stands in one column on a phone", async () => {
    await card("agt_chess");
    expect(screen.queryByTestId("columns")).toBeNull();
    expect(screen.getByTestId("agent-history")).toBeTruthy();
  });

  it("changes the agent's face from a tap on it, and takes it back with Use the default", async () => {
    const base = agentsSnapshot();
    const worn = {
      ...base,
      directory: {
        ...base.directory,
        agt_shopping: { ...base.directory["agt_shopping"], face: { icon: "cart", ground: 4 } },
      },
    } as Snapshot;
    const store = Object.assign(fakeStore(worn), { agentStays: async () => [] });
    await card("agt_shopping", store);
    expect(screen.queryByTestId("icon-sheet")).toBeNull();
    await userEvent.press(screen.getByTestId("agent-face"));
    expect(await screen.findByTestId("icon-sheet")).toBeTruthy();
    await drawLibrary();

    // The mark lands on the ground it already wears, and the chosen one is drawn as the agent.
    await userEvent.press(screen.getByTestId("mark-bag"));
    await userEvent.press(screen.getByRole("button", { name: "Use the default" }));
    expect(store.calls.filter((each) => each.name === "setAgentFace")).toEqual([
      { name: "setAgentFace", args: { agentId: "agt_shopping", face: { icon: "bag", ground: 4 } } },
      { name: "setAgentFace", args: { agentId: "agt_shopping", face: undefined } },
    ]);
  });

  it("has an Icon section that says what its face wears and opens the same sheet (ADR 0174)", async () => {
    const base = agentsSnapshot();
    const worn = {
      ...base,
      directory: {
        ...base.directory,
        agt_shopping: { ...base.directory["agt_shopping"], face: { icon: "cart", ground: 4 } },
      },
    } as Snapshot;
    const store = Object.assign(fakeStore(worn), { agentStays: async () => [] });
    await card("agt_shopping", store);
    const row = screen.getByTestId("agent-icon");
    expect(row).toHaveProp("accessibilityLabel", "Icon, Cart on Blue");
    expect(screen.getByRole("header", { name: "Icon" })).toBeOnTheScreen();
    await userEvent.press(row);
    expect(await screen.findByTestId("icon-sheet")).toBeTruthy();
    await userEvent.press(screen.getByRole("radio", { name: "Teal" }));
    expect(store.calls.filter((each) => each.name === "setAgentFace")).toEqual([
      {
        name: "setAgentFace",
        args: { agentId: "agt_shopping", face: { icon: "cart", ground: 3 } },
      },
    ]);
  });

  it("does not offer a guest the face", async () => {
    const base = agentsSnapshot();
    const asGuest = {
      ...base,
      model: {
        ...base.model,
        people: {
          [ME]: {
            participantId: ME,
            displayName: "Arjun",
            role: "guest",
            joinedAt: "2026-09-05T00:00:00.000Z",
          },
        },
      },
    } as Snapshot;
    const store = Object.assign(fakeStore(asGuest), { agentStays: async () => [] });
    await card("agt_shopping", store);
    expect(screen.getByTestId("agent-face")).toBeDisabled();
    // Nor an Icon section, which would be a row that does nothing (ADR 0174).
    expect(screen.queryByTestId("agent-icon")).toBeNull();
    // Nor its name (ADR 0091).
    expect(screen.getByTestId("agent-name")).toBeDisabled();
  });

  it("renames the agent where its name stands, from a tap on it (ADR 0091)", async () => {
    const store = storeWith();
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-name"));
    const field = await screen.findByTestId("agent-name-field");
    expect(field).toHaveDisplayValue("Shopping");
    // In place of what it is, what the name is for.
    expect(screen.queryByTestId("agent-sub")).toBeNull();
    await fireEvent.changeText(field, "Groceries");
    expect(screen.getByTestId("agent-name-hint")).toHaveTextContent(
      /Its @\u2011name is @Groceries/,
    );
    await fireEvent(field, "submitEditing");
    expect(store.calls.filter((each) => each.name === "renameAgent")).toEqual([
      { name: "renameAgent", args: { agentId: "agt_shopping", name: "Groceries" } },
    ]);
    // Saved: the field gives way to the name, with no sheet anywhere.
    expect(await screen.findByTestId("agent-name")).toBeTruthy();
    expect(screen.queryByTestId("agent-name-field")).toBeNull();
  });

  it("says why a name is refused under the field, and keeps what was typed", async () => {
    const store = Object.assign(storeWith(), {
      renameAgent: async () => {
        throw new Error("An agent here goes by Hello already.");
      },
    });
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-name"));
    const field = await screen.findByTestId("agent-name-field");
    await fireEvent.changeText(field, "Hello");
    await fireEvent(field, "submitEditing");
    expect(await screen.findByTestId("agent-name-hint")).toHaveTextContent(
      "An agent here goes by Hello already.",
    );
    expect(screen.getByTestId("agent-name-field")).toHaveDisplayValue("Hello");
  });

  it("puts the name back on a tap anywhere else, and saves nothing", async () => {
    const store = storeWith();
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-name"));
    const field = await screen.findByTestId("agent-name-field");
    await fireEvent.changeText(field, "Groceries");
    await fireEvent(field, "blur");
    expect(screen.queryByTestId("agent-name-field")).toBeNull();
    expect(screen.getByTestId("agent-name")).toHaveAccessibleName("Shopping");
    expect(screen.getByTestId("agent-sub")).toBeTruthy();
    expect(store.calls.filter((each) => each.name === "renameAgent")).toEqual([]);
  });

  it("saves nothing for the name it already has", async () => {
    const store = storeWith();
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-name"));
    await fireEvent(await screen.findByTestId("agent-name-field"), "submitEditing");
    expect(screen.queryByTestId("agent-name-field")).toBeNull();
    expect(store.calls.filter((each) => each.name === "renameAgent")).toEqual([]);
  });

  it("starts a copy's rename from what it is called, without the fork on screen", async () => {
    await card("agt_copy", forkingStore());
    expect(screen.getByText("Shopping · fork")).toBeTruthy();
    await userEvent.press(screen.getByTestId("agent-name"));
    expect(await screen.findByTestId("agent-name-field")).toHaveDisplayValue("Shopping");
  });

  it("says where an archived agent was, from when to when, and offers no Move", async () => {
    const opened: string[] = [];
    let history = 0;
    await card("agt_chess", storeWith(), {
      room: (to) => opened.push(to as string),
      history: () => {
        history += 1;
      },
    });
    expect(screen.getByTestId("agent-sub")).toHaveTextContent("Jacobian · archived");
    expect(await screen.findByText("Was there")).toBeTruthy();
    expect(screen.getByText("5–20 Sep")).toBeTruthy();
    expect(within(screen.getByTestId("agent-now")).getByText("Archived")).toBeTruthy();
    expect(screen.queryByTestId("agent-move")).toBeNull();
    expect(screen.getByText(/Unarchive puts it back in its space/)).toBeTruthy();
    await userEvent.press(screen.getByTestId("agent-room"));
    expect(opened).toEqual(["spc_chess"]);
    expect(screen.getByText("2 spaces")).toBeTruthy();
    await userEvent.press(screen.getByTestId("agent-history"));
    expect(history).toBe(1);
  });

  it("moves an agent in a room to another of yours", async () => {
    const store = storeWith([
      {
        readable: true,
        spaceId: "spc_shopping",
        fromSeq: 1,
        toSeq: null,
        from: "2026-09-05T15:02:00.000Z",
        to: null,
        lines: 9,
      },
    ]);
    await card("agt_shopping", store);
    expect(await screen.findByText("Since")).toBeTruthy();
    expect(within(screen.getByTestId("agent-now")).getByText("Working")).toBeTruthy();
    await userEvent.press(screen.getByTestId("agent-move"));
    expect(screen.getByText("Move Shopping to another space")).toBeTruthy();
    // Not the room it is in, and never the Main room.
    expect(screen.queryByTestId("picker-spc_shopping")).toBeNull();
    expect(screen.queryByTestId("picker-spc_j")).toBeNull();
    await userEvent.press(screen.getByTestId("picker-spc_hello"));
    expect(store.calls).toContainEqual({
      name: "moveAgent",
      args: { agentId: "agt_shopping", spaceId: "spc_hello" },
    });
    // Jacobian doesn't declare forks here, so there is no Fork (rule 3.12).
    expect(screen.queryByTestId("agent-fork")).toBeNull();
  });

  it("holds the row for its dates while the server is asked, so nothing under it moves", async () => {
    // Drawn only once the answer came, the row put itself between Room and Now just after the
    // card had slid in, and everything under it jumped a row (Arjun, 2 October 2026).
    const asked: ((stays: readonly AgentStay[]) => void)[] = [];
    const store = Object.assign(fakeStore(agentsSnapshot()), {
      agentStays: () =>
        new Promise<readonly AgentStay[]>((resolve) => {
          asked.push(resolve);
        }),
    });
    await card("agt_shopping", store);
    const row = screen.getByTestId("agent-stay");
    expect(within(row).getByText("Since")).toBeTruthy();
    expect(within(row).queryByText(/Sep/)).toBeNull();
    await act(async () =>
      asked.at(-1)?.([
        {
          readable: true,
          spaceId: "spc_shopping",
          fromSeq: 1,
          toSeq: null,
          from: "2026-09-05T15:02:00.000Z",
          to: null,
          lines: 9,
        },
      ]),
    );
    expect(within(screen.getByTestId("agent-stay")).getByText("5 Sep")).toBeTruthy();
  });

  it("says an archived agent was there before the server has said when", async () => {
    const store = Object.assign(fakeStore(agentsSnapshot()), {
      agentStays: () => new Promise<readonly AgentStay[]>(() => {}),
    });
    await card("agt_chess", store);
    expect(within(screen.getByTestId("agent-stay")).getByText("Was there")).toBeTruthy();
  });

  it("takes the row away when the server knows of no stay", async () => {
    const store = Object.assign(fakeStore(agentsSnapshot()), { agentStays: async () => [] });
    await card("agt_shopping", store);
    expect(await screen.findByText("0 spaces")).toBeTruthy();
    expect(screen.queryByTestId("agent-stay")).toBeNull();
  });

  it("forks an agent into a new room named for its copy (ADR 0087, Fork)", async () => {
    const store = forkingStore();
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-fork"));
    expect(screen.getByText("Fork Shopping into a space")).toBeTruthy();
    expect(screen.getByText("A new space with the copy")).toBeTruthy();
    expect(screen.queryByTestId("picker-spc_shopping")).toBeNull();
    await userEvent.press(screen.getByTestId("picker-new"));
    // Shopping has a copy already (Shopping · fork), so the room is named as the next will be.
    // One call makes the room and asks for the copy, and takes the room back if the ask fails.
    expect(store.calls).toContainEqual({
      name: "forkIntoNewRoom",
      args: { agentId: "agt_shopping", title: "Shopping · fork 2" },
    });
    expect(pushed).toEqual(["/spaces/sp_new"]);
  });

  it("asks once, however many times the row is pressed while the ask is on its way", async () => {
    // Agents review, finding 20: a second tap was a second room, a second ask and a second copy.
    const store = forkingStore();
    let answer: ((spaceId: string) => void) | undefined;
    let asks = 0;
    (store as { forkIntoNewRoom: unknown }).forkIntoNewRoom = () => {
      asks += 1;
      return new Promise<string>((resolve) => {
        answer = resolve;
      });
    };
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-fork"));
    await userEvent.press(screen.getByTestId("picker-new"));
    await userEvent.press(screen.getByTestId("picker-new"));
    await userEvent.press(screen.getByTestId("picker-spc_direct"));
    expect(asks).toBe(1);
    expect(store.calls.filter((call) => call.name === "forkAgent")).toEqual([]);
    await act(async () => {
      answer?.("sp_new");
    });
    expect(pushed).toEqual(["/spaces/sp_new"]);
  });

  it("forks into one of your rooms", async () => {
    const store = forkingStore();
    await card("agt_shopping", store);
    await userEvent.press(screen.getByTestId("agent-fork"));
    await userEvent.press(screen.getByTestId("picker-spc_direct"));
    expect(store.calls).toContainEqual({
      name: "forkAgent",
      args: { agentId: "agt_shopping", spaceId: "spc_direct" },
    });
  });

  it("offers no Fork for OpenClaw's agents, whose harness doesn't make copies", async () => {
    await card("agt_main", forkingStore());
    expect(screen.getByTestId("agent-move")).toBeTruthy();
    expect(screen.queryByTestId("agent-fork")).toBeNull();
  });

  it("says what a copy was forked from, which opens the original's card", async () => {
    const opened: string[] = [];
    await card("agt_copy", forkingStore(), { agent: (to) => opened.push(to as string) });
    expect(screen.getByText("Shopping · fork")).toBeTruthy();
    await userEvent.press(screen.getByTestId("agent-forked-from"));
    expect(opened).toEqual(["agt_shopping"]);
  });

  it("puts a free agent in a new room with it, where its waiting words are said", async () => {
    const store = storeWith([]);
    await card("agt_bland", store);
    expect(within(screen.getByTestId("agent-waiting")).getByText("1 message")).toBeTruthy();
    // Under the row, what it is (Arjun, 19 October 2026: "What is the '1 waiting' label indicate").
    expect(screen.getByTestId("agent-waiting-note")).toHaveTextContent(
      "Bland Pricing said this while it wasn't in a space. It's posted in the space it joins next.",
    );
    await userEvent.press(screen.getByTestId("agent-put"));
    await userEvent.press(screen.getByTestId("picker-new"));
    expect(store.calls).toContainEqual({ name: "createSpace", args: { title: "Bland Pricing" } });
    expect(store.calls).toContainEqual({
      name: "addMember",
      args: { spaceId: "sp_new", participantId: "agt_bland", kind: "agent" },
    });
    expect(pushed).toEqual(["/spaces/sp_new"]);
  });

  it("doesn't move the Main agent", async () => {
    await card("agt_j");
    expect(screen.queryByTestId("agent-move")).toBeNull();
    expect(screen.getByText(/lives in the Main space/)).toBeTruthy();
  });
});

describe("a message history", () => {
  it("puts each room's lines under its divider, and a room you're not in as a count", async () => {
    const store = storeWith();
    const opened: string[] = [];
    await render(
      <History
        store={store}
        snapshot={store.getSnapshot()}
        agentId="agt_chess"
        selfId={ME}
        onOpenRoom={(spaceId) => opened.push(spaceId)}
      />,
    );
    expect(await screen.findByText("Send me a screenshot of the chess game")).toBeTruthy();
    expect(screen.getByText("Screenshot captured and attached.")).toBeTruthy();
    // A room's own notice is the room's, not the agent's.
    expect(screen.queryByText("A space notice")).toBeNull();
    expect(screen.getByTestId("away-count")).toHaveTextContent(
      "2 messages in a space you're not in",
    );
    const dividers = screen.getAllByTestId("divider");
    expect(dividers).toHaveLength(2);
    await userEvent.press(screen.getByRole("button", { name: /^Chess Game, 5–20 Sep/ }));
    expect(opened).toEqual(["spc_chess"]);
  });

  it("starts a copy's history at the fork, under a line to its original", async () => {
    const store = forkingStore([
      {
        readable: true,
        spaceId: "spc_hello",
        fromSeq: 50,
        toSeq: null,
        from: "2026-10-01T16:12:00.000Z",
        to: null,
        lines: 0,
      },
    ]);
    const opened: string[] = [];
    await render(
      <History
        store={store}
        snapshot={store.getSnapshot()}
        agentId="agt_copy"
        selfId={ME}
        onOpenRoom={() => undefined}
        onOpenAgent={(other) => opened.push(other)}
      />,
    );
    const from = await screen.findByTestId("forked-from");
    expect(from).toHaveTextContent(/Forked from Shopping/);
    expect(from).toHaveTextContent(/1 Oct\. What it knew before then is in Shopping's history\./);
    await userEvent.press(from);
    expect(opened).toEqual(["agt_shopping"]);
  });

  it("marks the room it is in now", async () => {
    const store = storeWith([
      {
        readable: true,
        spaceId: "spc_j",
        fromSeq: 0,
        toSeq: null,
        from: "2026-09-05T15:02:00.000Z",
        to: null,
        lines: 0,
      },
    ]);
    await render(
      <History
        store={store}
        snapshot={store.getSnapshot()}
        agentId="agt_j"
        selfId={ME}
        onOpenRoom={() => undefined}
      />,
    );
    expect(await screen.findByTestId("divider-now")).toBeTruthy();
    expect(screen.getByText("Nothing said here yet.")).toBeTruthy();
  });
});
