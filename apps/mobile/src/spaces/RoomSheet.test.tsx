/**
 * The room sheet and the notice above the field (ADR 0087, Phase 4, option A): who is here, adding
 * a free agent, moving a busy one, and what a room says when its last agent left; and the room's
 * files, a page of the sheet (ADR 0100).
 */

import type {
  Attachment,
  Directory,
  Line,
  RoomFileOf,
  Snapshot,
  Space,
  Store,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import {
  act,
  fireEvent,
  render as renderBare,
  screen,
  userEvent,
  waitFor,
  within,
} from "@testing-library/react-native";
import { type ReactElement, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fakeStore, snapshot } from "../testing/fixtures";
import { drawLibrary } from "../testing/picker";
import { ICON_GROUNDS } from "../ui/tokens";
import type { FileService } from "./files";
import { RoomNotice } from "./RoomNotice";
import { RoomSheet } from "./RoomSheet";

/** A sheet asks for the safe area, so every render gets an iPhone's, as `Sheet.test.tsx` does. */
const IPHONE = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, left: 0, right: 0, bottom: 34 },
};

const render = (element: ReactElement) =>
  renderBare(<SafeAreaProvider initialMetrics={IPHONE}>{element}</SafeAreaProvider>);

const directory: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
  hrn_jacobian: {
    id: "hrn_jacobian",
    kind: "harness",
    displayName: "Jacobian",
    ownerId: "per_arjun",
    capabilities: ["follows_rooms", "agents"],
  },
  agt_hello: {
    id: "agt_hello",
    kind: "agent",
    harnessId: "hrn_jacobian",
    displayName: "Hello",
    room: "sp_1",
  },
  agt_shopping: {
    id: "agt_shopping",
    kind: "agent",
    harnessId: "hrn_jacobian",
    displayName: "Shopping",
    room: "sp_shop",
  },
  agt_garage: {
    id: "agt_garage",
    kind: "agent",
    harnessId: "hrn_jacobian",
    displayName: "Garage door",
    room: null,
  },
};

function room(over: Partial<Space> = {}): Space {
  return {
    id: "sp_1",
    title: "Hello",
    kind: "group",
    members: ["per_arjun", "agt_hello"],
    roles: { per_arjun: "owner", agt_hello: "member" },
    state: "open",
    lastEventSeq: 1,
    lines: [],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...over,
  } as Space;
}

/** Jacobian, making copies of its agents (ADR 0087, Fork). */
const forking: Directory = {
  ...directory,
  hrn_jacobian: {
    ...directory["hrn_jacobian"],
    id: "hrn_jacobian",
    kind: "harness",
    displayName: "Jacobian",
    ownerId: "per_arjun",
    capabilities: ["follows_rooms", "agents", "forks"],
  },
};

/** Jacobian and OpenClaw, each making new agents for a room (ADR 0108). */
const making: Directory = {
  ...directory,
  hrn_jacobian: {
    ...directory["hrn_jacobian"],
    id: "hrn_jacobian",
    kind: "harness",
    displayName: "Jacobian",
    ownerId: "per_arjun",
    capabilities: ["follows_rooms", "agents", "new_agents"],
  },
  hrn_openclaw: {
    id: "hrn_openclaw",
    kind: "harness",
    displayName: "OpenClaw",
    ownerId: "per_arjun",
    capabilities: ["agents", "new_agents"],
  },
};

function withRoom(space: Space, names: Directory = directory): Snapshot {
  const base = snapshot();
  return {
    ...base,
    directory: names,
    model: {
      ...base.model,
      lanes: [],
      spaces: [space, { ...room(), id: "sp_shop", title: "Shopping", members: ["agt_shopping"] }],
    },
  } as Snapshot;
}

describe("a link into the room (ADR 0168)", () => {
  const sheet = (
    store: ReturnType<typeof fakeStore>,
    snap: Snapshot,
    selfId = "per_arjun",
    space = room(),
  ) =>
    render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId={selfId}
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
        workspace="Demo"
      />,
    );

  it("is an owner's row under People, and makes a guest's link into the room", async () => {
    const snap = withRoom(room());
    const store = fakeStore(snap);
    await sheet(store, snap);
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    expect(screen.getByText("Invite someone new")).toBeOnTheScreen();
    expect(screen.getByText("A link that brings them straight into Hello")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-invite"));
    expect(screen.getByText("Invite to Hello")).toBeOnTheScreen();
    expect(
      screen.getByText("Whoever opens it names themselves, joins Demo, and lands in Hello."),
    ).toBeOnTheScreen();
    // Who they'll find there, by name (ADR 0209).
    expect(screen.getByTestId("invite-role-means")).toHaveTextContent(
      /^A guest in Hello sees only who's there: Arjun and .+\. Nothing else in Demo\.$/,
    );
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    expect(await screen.findByTestId("issued-invite")).toHaveTextContent(/into Hello/);
    expect(store.calls).toContainEqual({
      name: "createInvite",
      args: { role: "guest", singleUse: true, spaceId: "sp_1" },
    });
  });

  it("glides down to the link it made, so its QR code isn't left below the fold", async () => {
    const snap = withRoom(room());
    await sheet(fakeStore(snap), snap);
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    await userEvent.press(screen.getByTestId("room-sheet-invite"));
    // The page as a phone holds it: 600 points of a list that is 1,400 tall once the link is in.
    const list = screen.getByTestId("room-sheet-invite-list");
    await fireEvent(list, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 393, height: 600 } },
    });
    const scrollTo = jest.mocked(ScrollView.prototype.scrollTo);
    scrollTo.mockClear();
    await userEvent.press(screen.getByRole("button", { name: "Make a link" }));
    await fireEvent(list, "contentSizeChange", 393, 1400);
    const card = { x: 16, y: 520, width: 361, height: 480 };
    await fireEvent(await screen.findByTestId("issued-invite"), "layout", {
      nativeEvent: { layout: card },
    });
    // Down until the card, with its room above it, stands at the top: over frames, not at once.
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith({ y: card.y - 12, animated: false }),
    );
    expect(scrollTo.mock.calls.length).toBeGreaterThan(2);
  });

  it("is offered in a room of one agent, where an owner alone is told nobody else is here yet", async () => {
    const solo = room({ kind: "direct" });
    const base = withRoom(solo);
    const snap = {
      ...base,
      model: { ...base.model, people: { per_arjun: base.model.people["per_arjun"] } },
    } as Snapshot;
    await sheet(fakeStore(snap), snap, "per_arjun", solo);
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    expect(screen.getByText("Nobody else is in your workspace yet")).toBeOnTheScreen();
    expect(screen.getByTestId("room-sheet-invite")).toBeOnTheScreen();
  });

  it("is not offered to somebody who isn't an owner", async () => {
    const hers = room({
      members: ["per_dana", "agt_hello"],
      roles: { per_dana: "member", agt_hello: "member" },
    });
    const base = withRoom(hers);
    const snap = {
      ...base,
      model: {
        ...base.model,
        people: { per_dana: { participantId: "per_dana", displayName: "Dana", role: "member" } },
      },
    } as unknown as Snapshot;
    const store = fakeStore(snap);
    await sheet(store, snap, "per_dana", hers);
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    expect(screen.queryByText("Invite someone new")).toBeNull();
  });
});

describe("the room sheet", () => {
  it("says who is here, and adds a free agent", async () => {
    const snap = withRoom(room());
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.getByText("1 agent and you")).toBeOnTheScreen();
    expect(screen.getByText("Jacobian")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    expect(screen.getByText("Add to Hello")).toBeOnTheScreen();
    expect(screen.getByText("Free")).toBeOnTheScreen();
    expect(screen.getByText("In other spaces")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-agent-agt_garage"));
    expect(store.calls).toContainEqual({
      name: "addMember",
      args: { spaceId: "sp_1", participantId: "agt_garage", kind: "agent" },
    });
  });

  it("stays on Add while several are put in, each ticked where it was, until its X (ADR 0148, ADR 0169)", async () => {
    const snap = withRoom(room());
    const store = fakeStore(snap);
    const closed = jest.fn();
    const sheet = (space: Space) => (
      <RoomSheet
        store={store}
        snapshot={withRoom(space)}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={closed}
        onOpenAgent={() => undefined}
      />
    );
    await render(sheet(room()));
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    const garage = () => screen.getByTestId("room-sheet-agent-agt_garage");
    expect(garage()).not.toBeChecked();
    await userEvent.press(garage());
    expect(closed).not.toHaveBeenCalled();
    // In the room now: the row is where it was, ticked, and not taken off the page.
    const added = room({
      members: ["per_arjun", "agt_hello", "agt_garage"],
      roles: { per_arjun: "owner", agt_hello: "member", agt_garage: "member" },
    });
    await screen.rerender(
      <SafeAreaProvider initialMetrics={IPHONE}>{sheet(added)}</SafeAreaProvider>,
    );
    expect(screen.getByText("Add to Hello")).toBeOnTheScreen();
    expect(garage()).toBeChecked();
    // Its tick taken off takes it out again.
    await userEvent.press(garage());
    expect(store.calls).toContainEqual({
      name: "removeMember",
      args: { spaceId: "sp_1", participantId: "agt_garage" },
    });
    await userEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it("comes up on Add when it is told to, as a room made empty from the + is (ADR 0148)", async () => {
    const snap = withRoom(room());
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        opensOn="add"
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.getByText("Add to Hello")).toBeOnTheScreen();
    expect(screen.getByTestId("room-sheet-agent-agt_garage")).toBeOnTheScreen();
  });

  it("offers no guest who is in another space already (ADR 0034, finding PP-2)", async () => {
    const names: Directory = {
      ...directory,
      per_priya: {
        id: "per_priya",
        kind: "person",
        displayName: "Priya",
        role: "guest",
        guestOf: "sp_shop",
      },
      per_vendor: {
        id: "per_vendor",
        kind: "person",
        displayName: "Vendor",
        role: "guest",
        guestOf: null,
      },
    };
    const person = (participantId: string, role: "owner" | "member" | "guest") => ({
      participantId,
      displayName: participantId,
      role,
      joinedAt: "2026-10-09T00:00:00.000Z",
    });
    const base = withRoom(room(), names);
    const snap = {
      ...base,
      model: {
        ...base.model,
        people: {
          per_arjun: person("per_arjun", "owner"),
          per_dana: person("per_dana", "member"),
          per_priya: person("per_priya", "guest"),
          per_vendor: person("per_vendor", "guest"),
        },
      },
    } as Snapshot;
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByRole("button", { name: "Add agents or people" }));
    expect(screen.getByText("Dana Ruiz")).toBeOnTheScreen();
    expect(screen.getByText("Vendor")).toBeOnTheScreen();
    expect(screen.queryByText("Priya")).toBeNull();
  });

  it("asks a harness picked by its face for a new agent, under the name typed (ADR 0108)", async () => {
    const snap = withRoom(room(), making);
    const store = fakeStore(snap);
    const closed = jest.fn();
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={closed}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-add"));
    // A row of its own, in one card with In other rooms, and no heading over them.
    expect(screen.getByText("New agent")).toBeOnTheScreen();
    expect(screen.queryByText("New")).toBeNull();
    expect(screen.getByText("Jacobian or OpenClaw makes it for this space")).toBeOnTheScreen();
    expect(screen.getByTestId("room-sheet-other-rooms")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-new"));
    expect(screen.getByText("New agent")).toBeOnTheScreen();
    // Nobody picked yet: Add waits for a face.
    expect(screen.getByText("Pick who makes it first.")).toBeOnTheScreen();
    expect(screen.getByTestId("room-sheet-new-add")).toBeDisabled();
    await userEvent.press(screen.getByTestId("room-sheet-new-pick-hrn_jacobian"));
    expect(screen.getByText("Left empty, it's Jacobian.")).toBeOnTheScreen();
    expect(screen.getByText("Add Jacobian")).toBeOnTheScreen();
    await userEvent.type(screen.getByTestId("room-sheet-new-name"), "Hello");
    // Hello is the agent here already: the name is numbered.
    expect(screen.getByText("Hello is taken here, so it will be Hello 2.")).toBeOnTheScreen();
    await userEvent.clear(screen.getByTestId("room-sheet-new-name"));
    await userEvent.type(screen.getByTestId("room-sheet-new-name"), "Reviewer");
    expect(screen.getByText("What everyone here will @ it by.")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-new-add"));
    expect(store.calls).toContainEqual({
      name: "askAgent",
      args: { harnessId: "hrn_jacobian", spaceId: "sp_1", name: "Reviewer" },
    });
    // Back on Add, which stays up for the next, with the ask ticked under New agent (ADR 0148).
    await waitFor(() => expect(screen.getByText("Add to Hello")).toBeOnTheScreen());
    expect(within(screen.getByTestId("room-sheet-asked-0")).getByText("Reviewer")).toBeTruthy();
    expect(screen.getByText("Asked of Jacobian")).toBeOnTheScreen();
    expect(closed).not.toHaveBeenCalled();
  });

  it("offers no new agent where no harness makes one", async () => {
    const plain = withRoom(room());
    await render(
      <RoomSheet
        store={fakeStore(plain)}
        snapshot={plain}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-add"));
    expect(screen.queryByTestId("room-sheet-new")).toBeNull();
  });

  it("offers no new agent in a Main room, whose only agent is its lead", async () => {
    const home = room({ home: true });
    const lead = withRoom(home, making);
    await render(
      <RoomSheet
        store={fakeStore(lead)}
        snapshot={lead}
        space={home}
        title="J"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-add"));
    expect(screen.queryByTestId("room-sheet-new")).toBeNull();
  });

  it("asks before it moves a busy agent, and moves it", async () => {
    const snap = withRoom(room());
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-add"));
    // The agents in other rooms are a row of their own on Add, as New agent is.
    expect(screen.queryByTestId("room-sheet-agent-agt_shopping")).toBeNull();
    const row = screen.getByTestId("room-sheet-other-rooms");
    expect(within(row).getByText("1")).toBeOnTheScreen();
    await userEvent.press(row);
    expect(screen.getByText("Jacobian · in Shopping")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-agent-agt_shopping"));
    expect(screen.getByText("Move Shopping here?")).toBeOnTheScreen();
    // Cancel goes back to where it was picked from.
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Jacobian · in Shopping")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-agent-agt_shopping"));
    // Jacobian doesn't declare forks here, so the page offers no Fork (rule 3.12).
    expect(screen.queryByTestId("room-sheet-fork")).toBeNull();
    await userEvent.press(screen.getByTestId("room-sheet-move"));
    expect(store.calls).toContainEqual({
      name: "moveAgent",
      args: { agentId: "agt_shopping", spaceId: "sp_1" },
    });
    // And back to Add for the next (ADR 0148).
    await waitFor(() => expect(screen.getByText("Add to Hello")).toBeOnTheScreen());
  });

  it("offers Fork here beside Move where the harness makes copies (ADR 0087, Fork)", async () => {
    const snap = withRoom(room(), forking);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-add"));
    await userEvent.press(screen.getByTestId("room-sheet-other-rooms"));
    await userEvent.press(screen.getByTestId("room-sheet-agent-agt_shopping"));
    expect(
      screen.getByText(
        "A copy joins Hello, remembering everything up to now. Shopping stays where it is.",
      ),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-fork"));
    expect(store.calls).toContainEqual({
      name: "forkAgent",
      args: { agentId: "agt_shopping", spaceId: "sp_1" },
    });
    expect(store.calls.some((call) => call.name === "moveAgent")).toBe(false);
  });
});

describe("renaming the room where its title stands (ADR 0112)", () => {
  /** The sheet on Hello's room, as `selfId` sees it. */
  const sheet = async (space: Space, selfId = "per_arjun") => {
    const snap = withRoom(space);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId={selfId}
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    return store;
  };
  const renamed = (calls: readonly { readonly name: string }[]) =>
    calls.filter((call) => call.name === "updateSpace");

  it("turns the title into a field, and the keyboard's done renames the room", async () => {
    const store = await sheet(room());
    await userEvent.press(screen.getByRole("button", { name: "Hello" }));
    const field = () => screen.getByTestId("room-sheet-title-field");
    expect(field().props["value"]).toBe("Hello");
    await fireEvent.changeText(field(), "  Kitchen ");
    await fireEvent(field(), "submitEditing");
    await fireEvent(field(), "blur");
    expect(store.calls).toContainEqual({
      name: "updateSpace",
      args: { spaceId: "sp_1", title: "Kitchen" },
    });
    // The name just saved stands in the title until the room's own says the server has it.
    expect(screen.getByTestId("room-sheet-title")).toHaveTextContent("Kitchen");
  });

  it("puts the old name back on a tap anywhere else, and sends nothing empty or unchanged", async () => {
    const store = await sheet(room());
    await userEvent.press(screen.getByTestId("room-sheet-title"));
    await fireEvent.changeText(screen.getByTestId("room-sheet-title-field"), "Kitchen");
    await fireEvent(screen.getByTestId("room-sheet-title-field"), "blur");
    expect(screen.getByTestId("room-sheet-title")).toHaveTextContent("Hello");
    await userEvent.press(screen.getByTestId("room-sheet-title"));
    const field = () => screen.getByTestId("room-sheet-title-field");
    // From the room's name again, not the words let go.
    expect(field().props["value"]).toBe("Hello");
    await fireEvent(field(), "submitEditing");
    await fireEvent.changeText(field(), "   ");
    await fireEvent(field(), "submitEditing");
    expect(renamed(store.calls)).toEqual([]);
  });

  it("starts an untitled room's field empty, with what it is called under it", async () => {
    await sheet(room({ title: undefined } as Partial<Space>));
    await userEvent.press(screen.getByTestId("room-sheet-title"));
    const field = screen.getByTestId("room-sheet-title-field");
    expect(field.props["value"]).toBe("");
    expect(field.props["placeholder"]).toBe("Hello");
  });

  it("gives a guest the title alone", async () => {
    await sheet(
      room({
        members: ["per_arjun", "per_dana", "agt_hello"],
        roles: { per_arjun: "owner", per_dana: "guest", agt_hello: "member" },
      }),
      "per_dana",
    );
    expect(screen.getByRole("header", { name: "Hello" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Hello" })).toBeNull();
  });
});

describe("the room's icon (ADR 0174)", () => {
  /** The sheet on Hello's room as `selfId` sees it, wearing `icon`, on a store that may refuse. */
  const sheet = async (
    space: Space,
    {
      icon,
      selfId = "per_arjun",
      refuse,
    }: { icon?: SpaceIcon; selfId?: string; refuse?: string } = {},
  ) => {
    const snap = {
      ...withRoom(space),
      spaceIcons: new Map(icon === undefined ? [] : [[space.id, icon]]),
    } as Snapshot;
    const store = fakeStore(snap);
    if (refuse !== undefined) {
      Object.assign(store, {
        setSpaceIcon: async () => {
          throw new Error(refuse);
        },
      });
    }
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId={selfId}
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    return store;
  };
  const faces = (calls: readonly { readonly name: string }[]) =>
    calls.filter((call) => call.name === "setSpaceIcon");
  const row = () => screen.getByTestId("room-sheet-icon");

  it("is the face beside the title, saying what it wears, Default while nothing is chosen (ADR 0202)", async () => {
    await sheet(room());
    expect(row()).toHaveProp("accessibilityLabel", "Icon, Default");
    expect(row()).toHaveProp("accessibilityHint", "Changes the space's icon");
    // No row of its own: the face stands at the head, before who is here.
    expect(screen.queryByText("Icon")).toBeNull();
  });

  it("says a chosen face in words", async () => {
    await sheet(room(), { icon: { icon: "cup", ground: 3 } });
    expect(row()).toHaveProp("accessibilityLabel", "Icon, Cup on Teal");
  });

  it("turns to the picker, saves a colour and then a mark at once, and turns back", async () => {
    const store = await sheet(room());
    await userEvent.press(row());
    expect(await screen.findByRole("header", { name: "Icon" })).toBeOnTheScreen();
    await drawLibrary();
    await userEvent.press(screen.getByRole("radio", { name: "Teal" }));
    await userEvent.press(screen.getByTestId("mark-cup"));
    expect(faces(store.calls)).toEqual([
      { name: "setSpaceIcon", args: { spaceId: "sp_1", icon: { icon: "", ground: 3 } } },
      { name: "setSpaceIcon", args: { spaceId: "sp_1", icon: { icon: "cup", ground: 3 } } },
    ]);
    await userEvent.press(screen.getByTestId("room-sheet-icon-back"));
    expect(await screen.findByTestId("room-sheet-icon")).toBeOnTheScreen();
  });

  it("goes back from a tap on the page's name, as from its arrow", async () => {
    await sheet(room());
    await userEvent.press(row());
    const name = await screen.findByRole("header", { name: "Icon" });
    await userEvent.press(name);
    expect(await screen.findByTestId("room-sheet-icon")).toBeOnTheScreen();
    expect(screen.queryByRole("header", { name: "Icon" })).toBeNull();
  });

  it("puts the default back from the page", async () => {
    const store = await sheet(room(), { icon: { icon: "cup", ground: 3 } });
    await userEvent.press(row());
    await userEvent.press(await screen.findByRole("button", { name: "Use the default" }));
    expect(faces(store.calls)).toEqual([
      { name: "setSpaceIcon", args: { spaceId: "sp_1", icon: undefined } },
    ]);
  });

  it("is a guest's too: the face is their own", async () => {
    const store = await sheet(
      room({
        members: ["per_arjun", "per_dana", "agt_hello"],
        roles: { per_arjun: "owner", per_dana: "guest", agt_hello: "member" },
      }),
      { selfId: "per_dana" },
    );
    await userEvent.press(row());
    await userEvent.press(await screen.findByRole("radio", { name: "Teal" }));
    expect(faces(store.calls)).toHaveLength(1);
  });

  it("says why when the server will not take it", async () => {
    await sheet(room(), { refuse: "No route matches that." });
    await userEvent.press(row());
    await userEvent.press(await screen.findByRole("radio", { name: "Teal" }));
    expect(await screen.findByTestId("icon-failed")).toHaveTextContent(
      "Not saved: this server is older than the app, and has no icons yet.",
    );
  });

  it("saves letters typed and not yet saved when the sheet closes from the page", async () => {
    jest.useFakeTimers();
    try {
      const store = await sheet(room());
      await fireEvent.press(row());
      await act(async () => jest.advanceTimersByTimeAsync(600));
      await fireEvent.changeText(screen.getByTestId("face-letters"), "AB");
      await fireEvent.press(screen.getByTestId("room-sheet-close"));
      expect(faces(store.calls)).toEqual([
        {
          name: "setSpaceIcon",
          args: { spaceId: "sp_1", icon: expect.objectContaining({ icon: "", letters: "AB" }) },
        },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("the first page's one scroll (ADR 0202's addendum)", () => {
  it("holds who is here whole, Media & files and the tiles, under the head that stays put", async () => {
    const space = room({ members: ["per_arjun", "per_dana", "agt_hello", "agt_garage"] });
    await render(
      <RoomSheet
        store={fakeStore(withRoom(space))}
        snapshot={withRoom(space)}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    const page = within(screen.getByTestId("room-sheet-who"));
    for (const id of ["agt_hello", "agt_garage", "per_arjun", "per_dana"]) {
      expect(page.getByTestId(`room-sheet-member-${id}`)).toBeOnTheScreen();
    }
    expect(page.getByTestId("room-sheet-media")).toBeOnTheScreen();
    // Lock changes and Hide share the last row, half the width each.
    const foot = within(page.getByTestId("room-sheet-tiles-foot"));
    expect(foot.getByTestId("room-sheet-lock")).toBeOnTheScreen();
    expect(foot.getByTestId("room-sheet-hide")).toHaveTextContent(/Hide.*Off your list/);
    expect(foot.queryByTestId("room-sheet-notify")).toBeNull();
    // The face and the name are out of the scroll, and the list is no scroll of its own.
    expect(page.queryByTestId("room-sheet-icon")).toBeNull();
    expect(screen.queryByTestId("room-sheet-members")).toBeNull();
    expect(screen.queryByTestId("room-sheet-members-fade")).toBeNull();
  });
});

describe("locking the room's changes (ADR 0156)", () => {
  /** The sheet on Hello's room, as `selfId` sees it, on a store that may be told to refuse. */
  const sheet = async (space: Space, selfId = "per_arjun", refuse?: string) => {
    const snap = withRoom(space);
    const store = fakeStore(snap);
    const asked = Object.assign(
      store,
      refuse === undefined
        ? {}
        : {
            setLock: async () => {
              throw new Error(refuse);
            },
          },
    );
    const draw = (now: Space) => (
      <RoomSheet
        store={asked}
        snapshot={withRoom(now)}
        space={now}
        title="Hello"
        selfId={selfId}
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />
    );
    await render(draw(space));
    return {
      store,
      again: (now: Space) =>
        screen.rerender(<SafeAreaProvider initialMetrics={IPHONE}>{draw(now)}</SafeAreaProvider>),
    };
  };
  const lock = () => screen.getByTestId("room-sheet-lock-switch");
  const locks = (calls: readonly { readonly name: string }[]) =>
    calls.filter((call) => call.name === "setLock");

  it("is the last tile, off, and locks the room when it is turned on (ADR 0202)", async () => {
    const { store, again } = await sheet(room());
    expect(
      screen
        .getAllByTestId(/^room-sheet-(media|lead|spend|notify|lock)$/)
        .map((each) => each.props["testID"]),
    ).toEqual([
      "room-sheet-media",
      "room-sheet-lead",
      "room-sheet-spend",
      "room-sheet-notify",
      "room-sheet-lock",
    ]);
    const tile = within(screen.getByTestId("room-sheet-lock"));
    expect(tile.getByText("Lock changes")).toBeTruthy();
    expect(tile.getByText("Off")).toBeTruthy();
    expect(lock().props["value"]).toBe(false);
    await fireEvent(lock(), "valueChange", true);
    expect(locks(store.calls)).toEqual([
      { name: "setLock", args: { spaceId: "sp_1", locked: true } },
    ]);
    // On at once, and still on once the room says the server has it.
    expect(lock().props["value"]).toBe(true);
    expect(within(screen.getByTestId("room-sheet-lock")).getByText("On")).toBeTruthy();
    await again(room({ locked: true }));
    expect(lock().props["value"]).toBe(true);
  });

  it("gives each tile's mark a colour of its own, and the padlock gold while it is shut", async () => {
    await sheet(room());
    const ground = (name: string) =>
      StyleSheet.flatten(screen.getByTestId(`room-sheet-mark-${name}`).props["style"])
        .backgroundColor;
    const colours = ["lead", "spend", "notify", "lock"].map(ground);
    expect(new Set(colours).size).toBe(4);
    expect(colours).toEqual([ICON_GROUNDS[5], ICON_GROUNDS[7], ICON_GROUNDS[12], ICON_GROUNDS[3]]);
    await fireEvent(lock(), "valueChange", true);
    expect(ground("locked")).toBe(ICON_GROUNDS[9]);
  });

  it("takes the pen off the title while the room is locked, and lets the lock go", async () => {
    const { store } = await sheet(room({ locked: true }));
    expect(screen.getByRole("header", { name: "Hello" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Hello" })).toBeNull();
    expect(lock().props["value"]).toBe(true);
    await fireEvent(lock(), "valueChange", false);
    expect(locks(store.calls)).toEqual([
      { name: "setLock", args: { spaceId: "sp_1", locked: false } },
    ]);
    expect(lock().props["value"]).toBe(false);
  });

  it("gives a guest no switch", async () => {
    await sheet(
      room({
        members: ["per_arjun", "per_dana", "agt_hello"],
        roles: { per_arjun: "owner", per_dana: "guest", agt_hello: "member" },
      }),
      "per_dana",
    );
    expect(screen.getByTestId("room-sheet-notify")).toBeOnTheScreen();
    expect(screen.queryByTestId("room-sheet-lock")).toBeNull();
  });

  it("puts the switch back and says why when the server will not", async () => {
    await sheet(room(), "per_arjun", "Only somebody in the space may lock it.");
    await fireEvent(lock(), "valueChange", true);
    expect(await screen.findByTestId("room-sheet-failed")).toHaveTextContent(
      "Only somebody in the space may lock it.",
    );
    expect(lock().props["value"]).toBe(false);
  });
});

describe("an agent's row (ADR 0111 and its addendum)", () => {
  /** The sheet on Hello's room, as `selfId` sees it, closing as a room closes it. */
  const sheet = async (space: Space, selfId = "per_arjun") => {
    const snap = withRoom(space);
    const store = fakeStore(snap);
    const closed = jest.fn();
    const opened = jest.fn();
    function Room() {
      const [open, setOpen] = useState(true);
      return (
        <RoomSheet
          store={store}
          snapshot={snap}
          space={space}
          title="Hello"
          selfId={selfId}
          open={open}
          onClose={() => {
            closed();
            setOpen(false);
          }}
          onOpenAgent={opened}
        />
      );
    }
    await render(<Room />);
    return { store, closed, opened };
  };
  const removed = { name: "removeMember", args: { spaceId: "sp_1", participantId: "agt_hello" } };

  it("closes the sheet, and once it has gone opens the agent's card, the Agents tab's", async () => {
    const { store, closed, opened } = await sheet(room());
    await userEvent.press(screen.getByTestId("room-sheet-member-agt_hello"));
    expect(closed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("room-sheet-panel")).toBeNull());
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith("agt_hello");
    expect(store.calls.some((call) => call.name === "removeMember")).toBe(false);
  });

  it("takes an agent out from its row's Remove, which a screen reader reaches as an action", async () => {
    const { store, closed, opened } = await sheet(room());
    const row = screen.getByTestId("room-sheet-member-agt_hello");
    expect(row.props["accessibilityActions"]).toEqual([
      { name: "remove", label: "Remove from space" },
    ]);
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "remove" } });
    expect(store.calls).toContainEqual(removed);
    // The sheet stays open on its first page, and no card opens.
    expect(screen.getByTestId("room-sheet-add")).toBeOnTheScreen();
    expect(closed).not.toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
  });

  it("offers no Remove to a member who isn't the room's owner, and still opens the card", async () => {
    const { store, opened } = await sheet(
      room({
        members: ["per_arjun", "per_dana", "agt_hello"],
        roles: { per_arjun: "owner", per_dana: "member", agt_hello: "member" },
      }),
      "per_dana",
    );
    const row = screen.getByTestId("room-sheet-member-agt_hello");
    expect(row.props["accessibilityActions"]).toBeUndefined();
    await userEvent.press(row);
    await waitFor(() => expect(opened).toHaveBeenCalledWith("agt_hello"));
    expect(store.calls.some((call) => call.name === "removeMember")).toBe(false);
  });
});

describe("a person's row (JR-7)", () => {
  const withDana = (selfId: string) => {
    const space = room({
      members: ["per_arjun", "per_dana", "agt_hello"],
      roles: { per_arjun: "owner", per_dana: "member", agt_hello: "member" },
    });
    const snap = withRoom(space);
    const store = fakeStore(snap);
    return { store, space, snap, selfId };
  };

  it("takes a person out from their row's Remove after asking, for the room's owner, and the sheet stays", async () => {
    const { store, space, snap } = withDana("per_arjun");
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    const row = screen.getByTestId("room-sheet-member-per_dana");
    expect(row.props["accessibilityActions"]).toEqual([
      { name: "remove", label: "Remove from space" },
    ]);
    expect(screen.getByTestId("room-sheet-swipe-per_dana")).toBeOnTheScreen();
    await fireEvent(row, "accessibilityAction", { nativeEvent: { actionName: "remove" } });
    // It asks first (Arjun, 14 October 2026), and nothing has happened yet.
    expect(screen.getByTestId("room-sheet-takeout-asks")).toBeOnTheScreen();
    expect(screen.getByText("Take Dana Ruiz out of Hello?")).toBeOnTheScreen();
    expect(store.calls.some((call) => call.name === "removeMember")).toBe(false);
    await userEvent.press(screen.getByRole("button", { name: "Take out" }));
    expect(store.calls).toContainEqual({
      name: "removeMember",
      args: { spaceId: "sp_1", participantId: "per_dana" },
    });
    expect(screen.getByTestId("room-sheet-add")).toBeOnTheScreen();
    // Nobody is offered Remove on their own row: they leave by Leave.
    expect(
      screen.getByTestId("room-sheet-member-per_arjun").props["accessibilityActions"],
    ).toBeUndefined();
  });

  it("offers a workspace admin in the room Remove on somebody else's row, not their own (ADR 0111)", async () => {
    const space = room({
      members: ["per_arjun", "per_dana", "per_priya", "agt_hello"],
      roles: { per_arjun: "owner", per_dana: "member", per_priya: "member", agt_hello: "member" },
    });
    const names: Directory = {
      ...directory,
      per_priya: { id: "per_priya", kind: "person", displayName: "Priya Nair" },
    };
    const base = withRoom(space, names);
    const snap = {
      ...base,
      model: {
        ...base.model,
        people: {
          per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: "owner" },
          per_dana: { participantId: "per_dana", displayName: "Dana Ruiz", role: "admin" },
          per_priya: { participantId: "per_priya", displayName: "Priya Nair", role: "member" },
        },
      },
    } as unknown as Snapshot;
    const sheetAs = (selfId: string) =>
      render(
        <RoomSheet
          store={fakeStore(snap)}
          snapshot={snap}
          space={space}
          title="Hello"
          selfId={selfId}
          open
          onClose={() => {}}
          onOpenAgent={() => undefined}
        />,
      );
    // Dana, an admin of the workspace though only a member of the room, may take Priya out.
    await sheetAs("per_dana");
    expect(screen.getByTestId("room-sheet-member-per_priya").props["accessibilityActions"]).toEqual(
      [{ name: "remove", label: "Remove from space" }],
    );
    // Not on herself: she leaves by Leave.
    expect(
      screen.getByTestId("room-sheet-member-per_dana").props["accessibilityActions"],
    ).toBeUndefined();
    // Nor on Arjun, an owner of the workspace, whom an owner alone takes out (JR-23).
    expect(
      screen.getByTestId("room-sheet-member-per_arjun").props["accessibilityActions"],
    ).toBeUndefined();
  });

  it("offers a member of the workspace no Remove on anybody", async () => {
    const space = room({
      members: ["per_arjun", "per_dana", "agt_hello"],
      roles: { per_arjun: "owner", per_dana: "member", agt_hello: "member" },
    });
    const snap = withRoom(space);
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_dana"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    for (const id of ["per_arjun", "per_dana", "agt_hello"]) {
      expect(
        screen.getByTestId(`room-sheet-member-${id}`).props["accessibilityActions"],
      ).toBeUndefined();
    }
  });

  it("asks before taking a person out, and Cancel turns back with nothing done", async () => {
    const { store, space, snap } = withDana("per_arjun");
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    await fireEvent(screen.getByTestId("room-sheet-member-per_dana"), "accessibilityAction", {
      nativeEvent: { actionName: "remove" },
    });
    await userEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("room-sheet-takeout-asks")).toBeNull();
    expect(screen.getByTestId("room-sheet-member-per_dana")).toBeOnTheScreen();
    expect(store.calls.some((call) => call.name === "removeMember")).toBe(false);
  });

  it("leaves the room after asking, and the room screen goes back once the sheet has gone", async () => {
    const { store, space, snap } = withDana("per_dana");
    const left = jest.fn();
    const closed = jest.fn();
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_dana"
        open
        onClose={closed}
        onOpenAgent={() => undefined}
        onLeft={left}
      />,
    );
    await userEvent.press(screen.getByRole("button", { name: "Leave Hello" }));
    expect(screen.getByText("Leave Hello?")).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Leave" }));
    expect(store.calls).toContainEqual({ name: "leaveSpace", args: { spaceId: "sp_1" } });
    expect(closed).toHaveBeenCalled();
  });

  it("offers a guest no Add, and Leave", async () => {
    const space = room({
      members: ["per_arjun", "per_dana", "agt_hello"],
      roles: { per_arjun: "owner", per_dana: "guest", agt_hello: "member" },
    });
    const snap = withRoom(space);
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_dana"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.queryByTestId("room-sheet-add")).toBeNull();
    expect(screen.getByTestId("room-sheet-leave")).toBeOnTheScreen();
  });

  it("offers the workspace's owner no Leave: the room's agents are his (ADR 0204's addendum)", async () => {
    const { store, space, snap } = withDana("per_arjun");
    const owner = {
      participantId: "per_arjun",
      displayName: "Arjun",
      role: "owner",
      joinedAt: "2026-10-01T00:00:00.000Z",
    } as const;
    const owned = {
      ...snap,
      model: { ...snap.model, people: { ...snap.model.people, per_arjun: owner } },
    } as Snapshot;
    await render(
      <RoomSheet
        store={store}
        snapshot={owned}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.getByTestId("room-sheet-member-per_dana")).toBeOnTheScreen();
    expect(screen.queryByTestId("room-sheet-leave")).toBeNull();
  });

  it("offers somebody alone in a room no Leave: nobody could add them back", async () => {
    const alone = room({
      members: ["per_arjun", "agt_hello"],
      roles: { per_arjun: "owner", agt_hello: "member" },
    });
    const solo = withRoom(alone);
    await render(
      <RoomSheet
        store={fakeStore(solo)}
        snapshot={solo}
        space={alone}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.queryByTestId("room-sheet-leave")).toBeNull();
  });

  it("offers no Remove on a person to a member who doesn't own the room", async () => {
    const { store, space, snap } = withDana("per_dana");
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_dana"
        open
        onClose={() => {}}
        onOpenAgent={() => undefined}
      />,
    );
    expect(
      screen.getByTestId("room-sheet-member-per_arjun").props["accessibilityActions"],
    ).toBeUndefined();
    expect(screen.queryByTestId("room-sheet-swipe-per_arjun")).toBeNull();
  });
});

describe("who leads the room (ADR 0104)", () => {
  /** Hello and Garage door in the room, Hello leading it. */
  const two = () =>
    room({
      members: ["per_arjun", "agt_hello", "agt_garage"],
      roles: { per_arjun: "owner", agt_hello: "member", agt_garage: "member" },
      lead: "agt_hello",
    });

  it("marks the lead's row, says who leads, and moves the lead to the agent chosen", async () => {
    const space = two();
    const snap = withRoom(space);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.getAllByText("Lead").length).toBeGreaterThan(0);
    const row = screen.getByTestId("room-sheet-lead");
    expect(within(row).getByText("Hello")).toBeOnTheScreen();
    await userEvent.press(row);
    expect(
      screen.getByText("The lead hands out the work. Chips gives it what is nobody's turn."),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-lead-agt_garage"));
    expect(store.calls).toContainEqual({
      name: "setLead",
      args: { spaceId: "sp_1", agentId: "agt_garage" },
    });
  });

  it("takes the lead away with No lead, and says Nobody when nobody leads", async () => {
    const space = two();
    const snap = withRoom(space);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-lead"));
    await userEvent.press(screen.getByTestId("room-sheet-lead-nobody"));
    expect(store.calls).toContainEqual({
      name: "setLead",
      args: { spaceId: "sp_1", agentId: null },
    });

    const none = room({ ...two(), lead: undefined });
    const quiet = withRoom(none);
    await render(
      <RoomSheet
        store={fakeStore(quiet)}
        snapshot={quiet}
        space={none}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    const rows = screen.getAllByTestId("room-sheet-lead");
    const last = rows[rows.length - 1];
    if (last === undefined) throw new Error("no Lead row");
    expect(within(last).getByText("Nobody")).toBeOnTheScreen();
  });
});

describe("the notice above the field", () => {
  it("says the room has no agent, where it went, and offers to move it back", async () => {
    const left = room({
      members: ["per_arjun"],
      left: [{ agentId: "agt_shopping", reason: "moved", movedTo: "sp_shop", seq: 4 }],
    });
    const snap = withRoom(left);
    const store = fakeStore(snap);
    await render(<RoomNotice store={store} space={left} snapshot={snap} selfId="per_arjun" />);
    expect(screen.getByText("No agent in this space")).toBeOnTheScreen();
    expect(
      screen.getByText("Shopping is in Shopping. Messages here reach people only."),
    ).toBeOnTheScreen();
    await userEvent.press(screen.getByRole("button", { name: "Move back" }));
    expect(store.calls).toContainEqual({
      name: "moveAgent",
      args: { agentId: "agt_shopping", spaceId: "sp_1" },
    });
  });

  it("offers Fork beside Move back, and asks before it forks", async () => {
    const left = room({
      members: ["per_arjun"],
      left: [{ agentId: "agt_shopping", reason: "moved", movedTo: "sp_shop", seq: 4 }],
    });
    const snap = withRoom(left, forking);
    const store = fakeStore(snap);
    await render(<RoomNotice store={store} space={left} snapshot={snap} selfId="per_arjun" />);
    await userEvent.press(screen.getByRole("button", { name: "Fork" }));
    expect(screen.getByText("Fork Shopping here?")).toBeOnTheScreen();
    expect(store.calls.some((call) => call.name === "forkAgent")).toBe(false);
    await userEvent.press(screen.getByTestId("fork-sheet-fork"));
    expect(store.calls).toContainEqual({
      name: "forkAgent",
      args: { agentId: "agt_shopping", spaceId: "sp_1" },
    });
  });

  it("offers no Fork for a harness that doesn't make copies", async () => {
    const left = room({
      members: ["per_arjun"],
      left: [{ agentId: "agt_shopping", reason: "moved", movedTo: "sp_shop", seq: 4 }],
    });
    const snap = withRoom(left);
    await render(
      <RoomNotice store={fakeStore(snap)} space={left} snapshot={snap} selfId="per_arjun" />,
    );
    expect(screen.getByRole("button", { name: "Move back" })).toBeOnTheScreen();
    expect(screen.queryByRole("button", { name: "Fork" })).toBeNull();
  });

  it("says nothing in a room whose agents are here", async () => {
    const snap = withRoom(room());
    await render(
      <RoomNotice store={fakeStore(snap)} space={room()} snapshot={snap} selfId="per_arjun" />,
    );
    expect(screen.queryByTestId("no-agent")).toBeNull();
  });
});

describe("the room's files (ADR 0100)", () => {
  /** One of the room's files at one of its versions, as the store hands them over. */
  function version(
    name: string,
    n: number,
    mimeType: string,
    by: string,
    extra: Partial<RoomFileOf["attachment"]> = {},
  ): RoomFileOf {
    return {
      name,
      version: n,
      attachment: { id: `att_${name}_${n}`, filename: name, mimeType, byteSize: 100 * n, ...extra },
      by,
      byName: directory[by]?.displayName ?? by,
      at: `2026-10-02T18:${String(10 + n).padStart(2, "0")}:00.000Z`,
      lineId: `evt_${name}_${n}`,
    };
  }

  /** Files that open nothing but say what they were asked. */
  function fakeFiles(): FileService & {
    readonly opened: string[];
    readonly previewed: string[];
    readonly pages: string[];
  } {
    const opened: string[] = [];
    const previewed: string[] = [];
    const pages: string[] = [];
    return {
      opened,
      previewed,
      pages,
      upload: async () => {
        throw new Error("not here");
      },
      thumb: async (id) => `file:///thumbs/${id}.webp`,
      file: async (attachment) => `file:///files/${attachment.id}`,
      view: async (attachment) => ({ uri: `file:///views/${attachment.id}`, original: false }),
      play: async (attachment) => ({ uri: `file:///play/${attachment.id}`, beingMade: false }),
      streamUrl: async () => undefined,
      async open(attachment) {
        opened.push(attachment.id);
      },
      async preview(attachment) {
        previewed.push(attachment.id);
      },
      async page(attachment) {
        pages.push(attachment.id);
        return "<h1>A–E</h1>";
      },
    };
  }

  async function openSheet(listed: RoomFileOf[], versions: Record<string, RoomFileOf[]> = {}) {
    const snap = withRoom(room());
    const store = Object.assign(fakeStore(snap), {
      roomFiles: async () => listed,
      fileVersions: async (_spaceId: string, name: string) => versions[name] ?? [],
    });
    const files = fakeFiles();
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={room()}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
        files={files}
      />,
    );
    return files;
  }

  it("says how many on the Media & files card, and lists them newest first under its pictures (ADR 0202)", async () => {
    await openSheet([
      version("gallery.html", 3, "text/html", "agt_hello"),
      version("voice-note-1002-2336.m4a", 1, "audio/mp4", "per_arjun"),
      version("IMG_0233.png", 1, "image/png", "per_arjun"),
      version("brief.pdf", 1, "application/pdf", "per_arjun"),
    ]);
    const card = screen.getByTestId("room-sheet-media");
    await waitFor(() => expect(card).toHaveTextContent(/2 files/));
    await userEvent.press(card);
    expect(screen.getByRole("header", { name: "Files" })).toBeOnTheScreen();
    const listed = within(screen.getByTestId("room-files")).getAllByTestId("room-file");
    expect(listed).toHaveLength(2);
    expect(listed[0]).toHaveTextContent(/gallery\.html.*by Hello/);
    expect(listed[1]).toHaveTextContent(/brief\.pdf.*by you.*v1/);
  });

  it("says when there are none yet", async () => {
    await openSheet([]);
    await waitFor(() =>
      expect(screen.getByTestId("room-sheet-media")).toHaveTextContent(/None yet/),
    );
    await userEvent.press(screen.getByTestId("room-sheet-media"));
    expect(await screen.findByText("No files yet.")).toBeOnTheScreen();
  });

  it("unfolds a file's versions newest first, the current marked, and opens an older page over the sheet", async () => {
    const v2 = version("gallery.html", 2, "text/html", "agt_hello");
    const v1 = version("gallery.html", 1, "text/html", "per_arjun");
    const files = await openSheet([v2], { "gallery.html": [v2, v1] });
    await userEvent.press(await screen.findByTestId("room-sheet-media"));
    await userEvent.press(await screen.findByRole("button", { name: "Versions of gallery.html" }));
    const versions = await screen.findAllByTestId("room-file-version");
    expect(versions.map((each) => each.props["accessibilityLabel"])).toEqual([
      "Open gallery.html, version 2",
      "Open gallery.html, version 1",
    ]);
    expect(versions[0]).toHaveTextContent(/Current/);
    expect(versions[1]).not.toHaveTextContent(/Current/);

    await userEvent.press(versions[1] as never);
    expect(await screen.findByTestId("page-sheet")).toBeTruthy();
    expect(files.pages).toEqual(["att_gallery.html_1"]);
    expect(screen.getByText(/v1 · by you/)).toBeOnTheScreen();
  });

  it("opens a photo in the viewer on a deck of its versions, and shows anything else (ADR 0124)", async () => {
    const shape = { width: 1200, height: 800 };
    const v2 = version("preview.png", 2, "image/png", "agt_hello", shape);
    const v1 = version("preview.png", 1, "image/png", "agt_hello", shape);
    const pdf = version("brief.pdf", 1, "application/pdf", "per_arjun");
    const files = await openSheet([v2, pdf], { "preview.png": [v2, v1] });
    await userEvent.press(await screen.findByTestId("room-sheet-media"));
    await userEvent.press(await screen.findByRole("button", { name: "Open brief.pdf, version 1" }));
    await waitFor(() => expect(files.previewed).toEqual(["att_brief.pdf_1"]));
    expect(files.opened).toEqual([]);
    await userEvent.press(screen.getByRole("button", { name: "Open preview.png, version 2" }));
    expect(await screen.findByTestId("viewer-counter")).toHaveTextContent("2 of 2");
  });
});

describe("what the room allows a job (ADR 0117)", () => {
  const two = () =>
    room({
      members: ["per_arjun", "agt_hello", "agt_garage"],
      roles: { per_arjun: "owner", agt_hello: "member", agt_garage: "member" },
    });

  it("shows the ceiling and the job's spend, and sets a preset with Save", async () => {
    const space = two();
    const snap = withRoom(space);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    // A tile (ADR 0202): what the job has spent of the ceiling, the bar, and the row's words aloud.
    const tile = screen.getByTestId("room-sheet-spend");
    expect(await within(tile).findByText("$1.23 of $3.00")).toBeOnTheScreen();
    expect(tile).toHaveProp("accessibilityLabel", "Spend per job, $3.00, This job so far: $1.23");
    expect(screen.getByTestId("room-sheet-spend-bar")).toBeOnTheScreen();
    await userEvent.press(tile);
    expect(await screen.findByTestId("room-sheet-spend-save")).toBeOnTheScreen();
    // The default is picked, so Save waits for another.
    await userEvent.press(screen.getByTestId("room-sheet-spend-save"));
    expect(store.calls.some((call) => call.name === "setSpendCeiling")).toBe(false);
    await userEvent.press(screen.getByTestId("room-sheet-spend-10"));
    expect(screen.getByText("$1.23 of $10.00")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-spend-save"));
    expect(store.calls).toContainEqual({
      name: "setSpendCeiling",
      args: { spaceId: "sp_1", usd: 10 },
    });
  });

  it("takes an exact amount with Other, and sets the default back as null", async () => {
    const space = room({ ...two(), spendCeiling: 25 });
    const snap = withRoom(space);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-spend"));
    await userEvent.press(screen.getByTestId("room-sheet-spend-other"));
    await userEvent.type(screen.getByTestId("room-sheet-spend-amount"), "7.3");
    await userEvent.press(screen.getByTestId("room-sheet-spend-save"));
    expect(store.calls.some((call) => call.name === "setSpendCeiling")).toBe(false);
    // Not a whole number of quarters: Save waits for one that is.
    await userEvent.clear(screen.getByTestId("room-sheet-spend-amount"));
    await userEvent.type(screen.getByTestId("room-sheet-spend-amount"), "7.50");
    await userEvent.press(screen.getByTestId("room-sheet-spend-save"));
    expect(store.calls).toContainEqual({
      name: "setSpendCeiling",
      args: { spaceId: "sp_1", usd: 7.5 },
    });
    await userEvent.press(screen.getByTestId("room-sheet-spend"));
    await userEvent.press(screen.getByTestId("room-sheet-spend-default"));
    await userEvent.press(screen.getByTestId("room-sheet-spend-save"));
    expect(store.calls).toContainEqual({
      name: "setSpendCeiling",
      args: { spaceId: "sp_1", usd: null },
    });
  });

  /** The room as somebody else in it sees it: a member or a guest of the workspace. */
  const asOther = async (role: "member" | "guest") => {
    const space = room({
      members: ["per_arjun", "per_gus", "agt_hello"],
      roles: { per_arjun: "owner", per_gus: role, agt_hello: "member" },
    });
    const base = withRoom(space);
    const snap = {
      ...base,
      model: {
        ...base.model,
        people: {
          ...base.model.people,
          per_gus: { participantId: "per_gus", displayName: "Gus", role, joinedAt: "t1" },
        },
      },
    } as Snapshot;
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_gus"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
  };

  it("is shown to a member with who sets it, and opens nothing for them (ADR 0196)", async () => {
    await asOther("member");
    const tile = screen.getByTestId("room-sheet-spend");
    await waitFor(() =>
      expect(tile.props["accessibilityLabel"]).toMatch(/^Spend per job, \$3\.00, Arjun sets it/),
    );
    expect(tile.props["accessibilityRole"]).toBeUndefined();
    await userEvent.press(tile);
    expect(screen.queryByTestId("room-sheet-spend-save")).toBeNull();
  });

  it("is no row for a guest, whose Lead row opens nothing either (ADR 0196)", async () => {
    await asOther("guest");
    expect(screen.queryByTestId("room-sheet-spend")).toBeNull();
    await userEvent.press(screen.getByTestId("room-sheet-lead"));
    expect(screen.queryByTestId("room-sheet-lead-nobody")).toBeNull();
  });

  it("names whose an agent is to everybody, its harness after but to a guest (ADR 0196, ADR 0234)", async () => {
    await asOther("guest");
    const guest = within(screen.getByTestId("room-sheet-member-agt_hello"));
    expect(guest.getByText("Arjun's agent")).toBeOnTheScreen();
    expect(guest.queryByText(/Jacobian/)).toBeNull();
    await asOther("member");
    expect(
      within(screen.getByTestId("room-sheet-member-agt_hello")).getByText(
        "Arjun's agent · Jacobian",
      ),
    ).toBeOnTheScreen();
  });

  it("wears the shared tag before who is here, where somebody else reads it (ADR 0234)", async () => {
    await asOther("member");
    expect(screen.getByTestId("shared-tag")).toHaveTextContent("shared");
    // The owner alone with their own agent: nobody else reads it, and the agent says its harness.
    const mine = room({
      members: ["per_arjun", "agt_hello"],
      roles: { per_arjun: "owner", agt_hello: "member" },
    });
    const snap = withRoom(mine);
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={mine}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.queryByTestId("shared-tag")).toBeNull();
    expect(
      within(screen.getByTestId("room-sheet-member-agt_hello")).getByText("Jacobian"),
    ).toBeOnTheScreen();
  });
});

describe("hiding the room from your own list (ADR 0205)", () => {
  const withDana = (hidden: readonly string[] = []) => {
    const space = room({
      members: ["per_arjun", "per_dana", "agt_hello"],
      roles: { per_arjun: "owner", per_dana: "member", agt_hello: "member" },
    });
    const snap = withRoom(space);
    const owner = {
      participantId: "per_arjun",
      displayName: "Arjun",
      role: "owner",
      joinedAt: "2026-10-01T00:00:00.000Z",
    } as const;
    const owned = {
      ...snap,
      hiddenSpaces: new Set(hidden),
      model: { ...snap.model, people: { ...snap.model.people, per_arjun: owner } },
    } as Snapshot;
    return { space, snap: owned, store: fakeStore(owned) };
  };

  it("offers the workspace's owner Hide as a tile, at once, and the sheet goes", async () => {
    const { space, snap, store } = withDana();
    const closed = jest.fn();
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={closed}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.queryByTestId("room-sheet-leave")).toBeNull();
    expect(screen.getByTestId("room-sheet-hide")).toHaveTextContent(/Hide.*Off your list/);
    expect(screen.getByTestId("room-sheet-hide")).toHaveProp(
      "accessibilityHint",
      "Off your list, and quiet. The others here carry on.",
    );
    await userEvent.press(screen.getByRole("button", { name: "Hide Hello" }));
    expect(store.calls.filter((call) => call.name === "setSpaceHidden")).toEqual([
      { name: "setSpaceHidden", args: { spaceId: "sp_1", hidden: true } },
    ]);
    // It asks nothing, and the sheet goes, as Leave's does.
    expect(screen.queryByText("Hide Hello?")).toBeNull();
    expect(closed).toHaveBeenCalled();
  });

  it("offers a member Leave in the list and Hide on the tiles under it", async () => {
    const { space, snap, store } = withDana();
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_dana"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    const labels = screen
      .getAllByRole("button")
      .map((button) => button.props["accessibilityLabel"] as string | undefined);
    expect(labels.indexOf("Leave Hello")).toBeGreaterThan(-1);
    expect(labels.indexOf("Hide Hello")).toBeGreaterThan(labels.indexOf("Leave Hello"));
    expect(
      within(screen.getByTestId("room-sheet-tiles-foot")).getByTestId("room-sheet-hide"),
    ).toBeOnTheScreen();
  });

  it("offers Unhide on a hidden room, which stays, and says Off while hidden", async () => {
    const { space, snap, store } = withDana(["sp_1"]);
    const closed = jest.fn();
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={closed}
        onOpenAgent={() => undefined}
      />,
    );
    expect(await screen.findByTestId("room-sheet-notify")).toHaveTextContent(/Off while hidden/);
    await userEvent.press(screen.getByRole("button", { name: "Unhide Hello" }));
    expect(store.calls.filter((call) => call.name === "setSpaceHidden")).toEqual([
      { name: "setSpaceHidden", args: { spaceId: "sp_1", hidden: false } },
    ]);
    expect(closed).not.toHaveBeenCalled();
  });
});

describe("what the room sends this phone (ADRs 0198, 0216)", () => {
  it("wears the Notifications tile's red on every level, as Lead's page wears Lead's violet", async () => {
    const space = room();
    const snap = withRoom(space);
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    const ground = (id: string) =>
      StyleSheet.flatten(screen.getByTestId(id).props["style"]).backgroundColor;
    await userEvent.press(await screen.findByTestId("room-sheet-notify"));
    await screen.findByTestId("room-sheet-notify-all");
    for (const level of ["all", "people", "mentions", "none"]) {
      expect(ground(`room-sheet-notify-${level}-mark`)).toBe(ICON_GROUNDS[12]);
    }
    await userEvent.press(screen.getByRole("header", { name: "Notifications" }));
    await userEvent.press(await screen.findByTestId("room-sheet-lead"));
    await screen.findByTestId("room-sheet-lead-nobody");
    expect(ground("room-sheet-lead-nobody-mark")).toBe(ICON_GROUNDS[5]);
  });

  it("is people's messages until chosen, and saves every message for this room alone", async () => {
    const space = room();
    const snap = withRoom(space);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={space}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    const row = await screen.findByTestId("room-sheet-notify");
    expect(row).toHaveTextContent(/People's messages/);
    await userEvent.press(row);
    expect(await screen.findByTestId("room-sheet-notify-all")).toHaveTextContent(
      /Whenever anyone writes here, agents too/,
    );
    expect(screen.getByTestId("room-sheet-notify-mentions")).toHaveTextContent(/Only @ you/);
    await userEvent.press(screen.getByTestId("room-sheet-notify-all"));
    expect(store.calls.filter((call) => call.name === "saveNotificationSettings")).toEqual([
      {
        name: "saveNotificationSettings",
        args: {
          decide: "now",
          review: "hourly",
          fyi: "daily",
          harnesses: {},
          spaces: { [space.id]: "all" },
        },
      },
    ]);
    // Back on the first page, which says so.
    expect(await screen.findByTestId("room-sheet-notify")).toHaveTextContent(/Every message/);
  });
});

describe("what the room sends a member's or a guest's phone (ADR 0198)", () => {
  for (const role of ["member", "guest"] as const) {
    it(`is the ${role}'s own to choose, for this space alone, as the owner's is`, async () => {
      const space = room({
        members: ["per_arjun", "per_dana", "agt_hello"],
        roles: { per_arjun: "owner", per_dana: role, agt_hello: "member" },
      });
      const base = withRoom(space);
      const snap = {
        ...base,
        model: {
          ...base.model,
          people: {
            per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: "owner" },
            per_dana: { participantId: "per_dana", displayName: "Dana Ruiz", role },
          },
        },
      } as unknown as Snapshot;
      const store = fakeStore(snap);
      await render(
        <RoomSheet
          store={store}
          snapshot={snap}
          space={space}
          title="Hello"
          selfId="per_dana"
          open
          onClose={() => undefined}
          onOpenAgent={() => undefined}
        />,
      );
      const row = await screen.findByTestId("room-sheet-notify");
      expect(row).toHaveTextContent(/People's messages/);
      await userEvent.press(row);
      await userEvent.press(await screen.findByTestId("room-sheet-notify-none"));
      expect(store.calls.filter((call) => call.name === "saveNotificationSettings")).toEqual([
        {
          name: "saveNotificationSettings",
          args: expect.objectContaining({ spaces: { [space.id]: "none" } }),
        },
      ]);
    });
  }
});

describe("Media & files (ADR 0202, ADR 0165)", () => {
  const PHOTO: Attachment = {
    id: "att_ring",
    filename: "ring.jpg",
    mimeType: "image/jpeg",
    byteSize: 1,
  };
  const CLIP: Attachment = {
    id: "att_clip",
    filename: "clip.mp4",
    mimeType: "video/mp4",
    byteSize: 1,
    durationMs: 31_000,
  };
  const PDF: Attachment = {
    id: "att_spec",
    filename: "spec.pdf",
    mimeType: "application/pdf",
    byteSize: 1,
  };
  const said = (id: string, minute: number, attachments: Attachment[]) =>
    ({
      id,
      seq: minute,
      kind: "text",
      authorId: "per_arjun",
      authorKind: "person",
      text: id,
      ts: new Date(Date.UTC(2026, 9, 14, 9, minute)).toISOString(),
      attachments,
    }) as unknown as Line;

  /** Files that open nothing, and say what Quick Look was asked to show. */
  const service = (previewed: string[]): FileService => ({
    upload: async () => {
      throw new Error("not here");
    },
    thumb: async (id) => `file:///thumbs/${id}.webp`,
    file: async (attachment) => `file:///files/${attachment.id}`,
    view: async (attachment) => ({ uri: `file:///views/${attachment.id}`, original: false }),
    play: async (attachment) => ({ uri: `file:///play/${attachment.id}`, beingMade: false }),
    streamUrl: async () => undefined,
    open: async () => undefined,
    async preview(attachment) {
      previewed.push(attachment.id);
    },
    page: async () => "",
  });

  /** The sheet on Hello's room, with somewhere for See all to go. */
  const sheet = async (space: Space, onOpenMedia?: () => void, previewed: string[] = []) => {
    const snap = withRoom(space);
    const closed = jest.fn();
    function Room() {
      const [open, setOpen] = useState(true);
      return (
        <RoomSheet
          store={fakeStore(snap)}
          snapshot={snap}
          space={space}
          title="Hello"
          selfId="per_arjun"
          open={open}
          onClose={() => {
            closed();
            setOpen(false);
          }}
          onOpenAgent={() => undefined}
          onOpenMedia={onOpenMedia}
          files={service(previewed)}
        />
      );
    }
    await render(<Room />);
    return { closed };
  };

  it("counts what the room carries, documents too, and shows the newest first, before the tiles", async () => {
    await sheet(
      room({ lines: [said("ln_1", 1, [PHOTO, PDF]), said("ln_2", 2, [CLIP])] }),
      jest.fn(),
    );
    const card = screen.getByTestId("room-sheet-media");
    // The PDF counts, as voice notes do: the photo, the PDF and the clip.
    await waitFor(() => expect(card).toHaveTextContent(/Media & files3/));
    expect(card).toHaveProp("accessibilityLabel", "Media and files, 3");
    const strip = within(screen.getByTestId("room-sheet-media-strip"));
    // The clip, newest, first: its length on its poster; the PDF by its kind.
    expect(strip.getByText("0:31")).toBeOnTheScreen();
    expect(strip.getByText("PDF")).toBeOnTheScreen();
    const ids = screen
      .getAllByTestId(/^room-sheet-(media|lead|notify)$/)
      .map((each) => each.props["testID"]);
    expect(ids).toEqual(["room-sheet-media", "room-sheet-lead", "room-sheet-notify"]);
  });

  it("turns to its page, whose See all closes the sheet and opens the space's own Media", async () => {
    const opened = jest.fn();
    const { closed } = await sheet(room({ lines: [said("ln_1", 1, [PHOTO])] }), opened);
    await userEvent.press(screen.getByTestId("room-sheet-media"));
    expect(await screen.findByRole("header", { name: "Media" })).toBeOnTheScreen();
    expect(closed).not.toHaveBeenCalled();
    await userEvent.press(screen.getByTestId("room-media-all"));
    expect(closed).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId("room-sheet-panel")).toBeNull());
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("opens a photo in the viewer over the sheet, and a document in Quick Look", async () => {
    const previewed: string[] = [];
    await sheet(
      room({ lines: [said("ln_1", 1, [PHOTO, PDF]), said("ln_2", 2, [CLIP])] }),
      jest.fn(),
      previewed,
    );
    await userEvent.press(screen.getByTestId("room-sheet-media"));
    await userEvent.press(await screen.findByTestId("room-media-att_spec"));
    await waitFor(() => expect(previewed).toEqual(["att_spec"]));
    await userEvent.press(screen.getByTestId("room-media-att_ring"));
    // The room's photos and videos newest first, as the page lists them: the clip, then the photo
    // (Arjun, 19 October 2026: oldest first, the viewer ran against the page).
    expect(await screen.findByTestId("viewer-counter")).toHaveTextContent("2 of 2");
  });

  it("flies a photo from its square, which hides while the picture is up and is back as it goes", async () => {
    await sheet(room({ lines: [said("ln_1", 1, [PHOTO])] }), jest.fn());
    await userEvent.press(screen.getByTestId("room-sheet-media"));
    await userEvent.press(await screen.findByTestId("room-media-att_ring"));
    // The square is the viewer's tile, as the space's own Media's are: the picture on the stage
    // is the one it stood for, so it hides, and the close lands back on it (Arjun, 19 October
    // 2026: it opened with a crossfade from nowhere).
    const viewer = await screen.findByTestId("viewer");
    await act(async () => viewer.props["onShow"]());
    await waitFor(() =>
      expect(screen.getByTestId("room-media-att_ring")).toHaveStyle({ opacity: 0 }),
    );
    await act(async () => screen.getByTestId("stage").props["onDismiss"]());
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
    expect(screen.getByTestId("room-media-att_ring")).not.toHaveStyle({ opacity: 0 });
  });

  it("lands the pictures past the eighth on the square that says how many more", async () => {
    // Ten photos, one to a line: the page shows the newest eight, and the eighth says +2 (Foodie,
    // 24 October 2026: paged past it, the viewer had nowhere to go back to).
    const photos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
      ...PHOTO,
      id: `att_p${n}`,
      filename: `p${n}.jpg`,
    }));
    await sheet(
      room({ lines: photos.map((each, at) => said(`ln_${at + 1}`, at + 1, [each])) }),
      jest.fn(),
    );
    await userEvent.press(screen.getByTestId("room-sheet-media"));
    const more = await screen.findByTestId("room-media-more");
    expect(more).toHaveTextContent("+2");
    // Newest first, the seventh square is p4, and the eighth, the one that says +2, is p3.
    await userEvent.press(screen.getByTestId("room-media-att_p4"));
    const viewer = await screen.findByTestId("viewer");
    await act(async () => viewer.props["onShow"]());
    await waitFor(() =>
      expect(screen.getByTestId("room-media-att_p4")).toHaveStyle({ opacity: 0 }),
    );
    const next = () => act(async () => screen.getByTestId("stage").props["onNext"]());
    await next();
    await waitFor(() => expect(screen.getByTestId("room-media-more")).toHaveStyle({ opacity: 0 }));
    expect(screen.getByTestId("room-media-att_p4")).not.toHaveStyle({ opacity: 0 });
    // p2 and p1 have no square: the +2 stands for them, hidden while they are up.
    await next();
    expect(screen.getByTestId("viewer-counter")).toHaveTextContent("9 of 10");
    expect(screen.getByTestId("room-media-more")).toHaveStyle({ opacity: 0 });
    await next();
    expect(screen.getByTestId("room-media-more")).toHaveStyle({ opacity: 0 });
    await act(async () => screen.getByTestId("stage").props["onDismiss"]());
    await waitFor(() => expect(screen.queryByTestId("viewer")).toBeNull());
    expect(screen.getByTestId("room-media-more")).not.toHaveStyle({ opacity: 0 });
  });

  it("says None yet where nothing has been sent or filed", async () => {
    await sheet(room(), jest.fn());
    await waitFor(() =>
      expect(screen.getByTestId("room-sheet-media")).toHaveTextContent(/None yet/),
    );
    expect(screen.queryByTestId("room-sheet-media-strip")).toBeNull();
  });

  it("has no See all where it would open nothing", async () => {
    await sheet(room({ lines: [said("ln_1", 1, [PHOTO])] }));
    await userEvent.press(screen.getByTestId("room-sheet-media"));
    expect(await screen.findByTestId("room-media")).toBeOnTheScreen();
    expect(screen.queryByTestId("room-media-all")).toBeNull();
  });
});

describe("the room's project (ADR 0222)", () => {
  const commit = "a".repeat(40);
  const withProject = room({
    project: {
      files: 2,
      changes: [
        {
          commit,
          before: null,
          by: "agt_hello",
          byKind: "agent",
          at: new Date().toISOString(),
          seq: 4,
          message: "Two, not one",
          files: [{ path: "src/game.js", added: 1, removed: 1 }],
          moreFiles: 0,
        },
      ],
    },
  });

  it("is a tile once the room has one, with its files, its changes and Undo", async () => {
    const snap = withRoom(withProject);
    const store = fakeStore(snap);
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={withProject}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Project, 2 files" })).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("room-sheet-project"));
    expect(await screen.findByText("index.html")).toBeOnTheScreen();
    expect(screen.getByText("src/")).toBeOnTheScreen();
    expect(screen.getByText("game.js")).toBeOnTheScreen();

    await userEvent.press(screen.getByTestId("project-tab-changes"));
    expect(screen.getByText("Two, not one")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId(`project-change-${commit.slice(0, 7)}`));
    expect(await screen.findByText("Hello · 1 file changed · +1 −1")).toBeOnTheScreen();
    expect(screen.getByText("+export const a = 2;\n")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("project-undo"));
    expect(store.calls).toContainEqual({ name: "undoChange", args: { spaceId: "sp_1", commit } });
    expect(await screen.findByTestId("project-tab-files")).toBeOnTheScreen();
  });

  it("opens an HTML file of it as a page, built on the server (ADR 0223)", async () => {
    const snap = withRoom(withProject);
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={withProject}
        title="Hello"
        selfId="per_arjun"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-project"));
    await userEvent.press(await screen.findByTestId("project-file-index.html"));
    await userEvent.press(await screen.findByTestId("project-open-page"));
    const sheet = await screen.findByTestId("page-sheet");
    expect(within(sheet).getByRole("header")).toHaveTextContent("index.html");
    // A page built for the asking has no file to share.
    expect(within(sheet).queryByTestId("page-share")).toBeNull();
  });

  it("is the files and their changes alone: no Your folder, no zip, and no .chips (ADR 0227)", async () => {
    const snap = withRoom(withProject);
    const store = fakeStore(snap);
    const writable = store as { projectFiles: Store["projectFiles"] };
    writable.projectFiles = async () => ({
      at: "c".repeat(40),
      files: [
        { path: ".chips/index.html", bytes: 300, type: "text/html" },
        { path: ".chips/run.json", bytes: 40, type: "application/json" },
        { path: "index.html", bytes: 120, type: "text/html" },
      ],
    });
    await render(
      <RoomSheet
        store={store}
        snapshot={snap}
        space={withProject}
        title="Hello"
        selfId="per_arjun"
        open
        opensOn="project"
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    expect(await screen.findByTestId("project-file-index.html")).toBeOnTheScreen();
    expect(screen.queryByTestId("project-file-.chips/index.html")).toBeNull();
    expect(screen.queryByText(".chips/")).toBeNull();
    for (const gone of ["project-on-mac", "run-bar", "project-zip"]) {
      expect(screen.queryByTestId(gone)).toBeNull();
    }
  });

  it("offers a guest no Undo", async () => {
    const guest = { ...withProject, roles: { ...withProject.roles, per_dana: "guest" } } as Space;
    const snap = withRoom(guest);
    await render(
      <RoomSheet
        store={fakeStore(snap)}
        snapshot={snap}
        space={guest}
        title="Hello"
        selfId="per_dana"
        open
        onClose={() => undefined}
        onOpenAgent={() => undefined}
      />,
    );
    await userEvent.press(screen.getByTestId("room-sheet-project"));
    await userEvent.press(screen.getByTestId("project-tab-changes"));
    await userEvent.press(screen.getByTestId(`project-change-${commit.slice(0, 7)}`));
    expect(await screen.findByTestId("project-change-head")).toBeOnTheScreen();
    expect(screen.queryByTestId("project-undo")).toBeNull();
  });
});
