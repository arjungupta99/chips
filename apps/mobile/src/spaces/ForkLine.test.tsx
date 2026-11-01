/**
 * The room's line for a fork (ADR 0087, Fork): *Forking Shopping…* while it waits, the copy
 * joining with its face, and after a minute that Jacobian didn't make the copy, with Try again.
 * And the same line for a new agent asked for (ADR 0108): *Asking Jacobian for Reviewer…*.
 */

import type { Directory, Line, Snapshot, Space } from "@chipschat/core";
import { FORK_WAIT_MS, NEW_AGENT_WAIT_MS } from "@chipschat/protocol";
import { render, screen, userEvent } from "@testing-library/react-native";
import { fakeStore, snapshot } from "../testing/fixtures";
import { ForkLine, NewAgentLine } from "./ForkLine";

jest.mock("../store/provider", () => ({
  useSnapshot: (store: { getSnapshot: () => unknown }) => store.getSnapshot(),
}));

const directory: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana Ruiz" },
  hrn_jacobian: {
    id: "hrn_jacobian",
    kind: "harness",
    displayName: "Jacobian",
    ownerId: "per_arjun",
    capabilities: ["agents", "forks", "new_agents"],
  },
  agt_reviewer: {
    id: "agt_reviewer",
    kind: "agent",
    harnessId: "hrn_jacobian",
    displayName: "Reviewer",
    room: "sp_hello",
  },
  agt_shopping: {
    id: "agt_shopping",
    kind: "agent",
    harnessId: "hrn_jacobian",
    displayName: "Shopping",
    room: "sp_shop",
  },
  agt_copy: {
    id: "agt_copy",
    kind: "agent",
    harnessId: "hrn_jacobian",
    displayName: "Shopping · fork",
    room: "sp_hello",
    forkedFrom: "agt_shopping",
  },
};

function ask(ago: number, author = "per_arjun"): Line {
  return {
    id: "evt_fork",
    seq: 9,
    kind: "system",
    authorId: author,
    authorKind: "person",
    text: "asked for a copy of an agent here",
    ts: new Date(Date.now() - ago).toISOString(),
    fork: { agentId: "agt_shopping" },
  };
}

function hello(line: Line, forked?: Record<string, string>): Space {
  return {
    id: "sp_hello",
    title: "Hello",
    kind: "group",
    members: ["per_arjun"],
    roles: { per_arjun: "owner" },
    state: "open",
    lastEventSeq: 9,
    lines: [line],
    runs: [],
    sessions: [],
    pins: [],
    glimpse: false,
    ...(forked === undefined ? {} : { forked }),
  } as Space;
}

function storeFor(space: Space) {
  const base = snapshot();
  const snap = {
    ...base,
    directory,
    model: {
      ...base.model,
      people: { per_arjun: { participantId: "per_arjun", displayName: "Arjun", role: "owner" } },
      spaces: [space, { ...space, id: "sp_shop", title: "Shopping", lines: [] }],
    },
  } as unknown as Snapshot;
  return fakeStore(snap);
}

describe("a fork's line", () => {
  it("waits, saying who asked whom", async () => {
    const line = ask(5000);
    const space = hello(line);
    await render(<ForkLine line={line} space={space} selfId="per_arjun" store={storeFor(space)} />);
    expect(screen.getByTestId("fork-waiting")).toBeOnTheScreen();
    expect(screen.getByText("Forking Shopping…")).toBeOnTheScreen();
    expect(screen.getByText(/^You asked Jacobian for a copy · /)).toBeOnTheScreen();
  });

  it("says the copy joined, by the name it has", async () => {
    const line = ask(5000);
    const space = hello(line, { evt_fork: "agt_copy" });
    await render(<ForkLine line={line} space={space} selfId="per_arjun" store={storeFor(space)} />);
    expect(screen.getByTestId("fork-joined")).toBeOnTheScreen();
    expect(screen.getByText("Shopping · fork joined")).toBeOnTheScreen();
    expect(screen.getByText(/^A copy of Shopping · /)).toBeOnTheScreen();
  });

  it("says Jacobian didn't make the copy after a minute, and asks again", async () => {
    const line = ask(FORK_WAIT_MS + 1000);
    const space = hello(line);
    const store = storeFor(space);
    await render(<ForkLine line={line} space={space} selfId="per_arjun" store={store} />);
    expect(screen.getByText("Jacobian didn't make the copy")).toBeOnTheScreen();
    expect(screen.getByText("No copy in a minute. Shopping is as it was.")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("fork-again"));
    expect(store.calls).toContainEqual({
      name: "forkAgent",
      args: { agentId: "agt_shopping", spaceId: "sp_hello" },
    });
  });

  it("offers Try again only to whoever may fork", async () => {
    const line = ask(FORK_WAIT_MS + 1000);
    const space = hello(line);
    await render(<ForkLine line={line} space={space} selfId="per_dana" store={storeFor(space)} />);
    expect(screen.getByText("Jacobian didn't make the copy")).toBeOnTheScreen();
    expect(screen.queryByTestId("fork-again")).toBeNull();
  });
});

function askedFor(ago: number): Line {
  return {
    id: "evt_ask",
    seq: 9,
    kind: "system",
    authorId: "per_arjun",
    authorKind: "person",
    text: "asked for a new agent here, Reviewer",
    ts: new Date(Date.now() - ago).toISOString(),
    newAgent: { harnessId: "hrn_jacobian", name: "Reviewer" },
  };
}

describe("a new agent's line (ADR 0108)", () => {
  it("waits, saying who asked", async () => {
    const line = askedFor(5000);
    const waiting = hello(line);
    await render(
      <NewAgentLine line={line} space={waiting} selfId="per_arjun" store={storeFor(waiting)} />,
    );
    expect(screen.getByTestId("new-agent-waiting")).toBeOnTheScreen();
    expect(screen.getByText("Asking Jacobian for Reviewer…")).toBeOnTheScreen();
    expect(screen.getByText(/^You asked for a new agent · /)).toBeOnTheScreen();
  });

  it("says the agent joined, by its name", async () => {
    const line = askedFor(5000);
    const joined = { ...hello(line), made: { evt_ask: "agt_reviewer" } } as Space;
    await render(
      <NewAgentLine line={line} space={joined} selfId="per_arjun" store={storeFor(joined)} />,
    );
    expect(screen.getByText("Reviewer joined")).toBeOnTheScreen();
    expect(screen.getByText(/^New in Jacobian, made for this space · /)).toBeOnTheScreen();
  });

  it("says Jacobian didn't make it after a minute, and asks again under the same name", async () => {
    const line = askedFor(NEW_AGENT_WAIT_MS + 1000);
    const space = hello(line);
    const store = storeFor(space);
    await render(<NewAgentLine line={line} space={space} selfId="per_arjun" store={store} />);
    expect(screen.getByText("Jacobian didn't make Reviewer")).toBeOnTheScreen();
    await userEvent.press(screen.getByTestId("new-agent-again"));
    expect(store.calls).toContainEqual({
      name: "askAgent",
      args: { harnessId: "hrn_jacobian", spaceId: "sp_hello", name: "Reviewer" },
    });
  });
});
