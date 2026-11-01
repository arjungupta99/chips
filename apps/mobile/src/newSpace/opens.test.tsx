/**
 * Whether the phone shows the + (ADR 0196): an owner's and an admin's, never a member's or a
 * guest's; and a yes until the people are read, so an owner whose phone has just paired is never
 * shown the + and then has it taken back.
 */

import type { Snapshot, Store } from "@chipschat/core";
import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { fakeStore, snapshot } from "../testing/fixtures";
import { useOpens } from "./opens";

function Shows({ store, selfId }: { readonly store?: Store; readonly selfId?: string }) {
  return <Text testID="opens">{String(useOpens(store, selfId))}</Text>;
}

/** The fixture's workspace, with Dana in the role given, or not read yet. */
function withDana(role: "owner" | "admin" | "member" | "guest" | undefined): Snapshot {
  const base = snapshot();
  const { per_dana: _dana, ...others } = base.model.people as Record<string, unknown>;
  const people =
    role === undefined
      ? others
      : { ...others, per_dana: { participantId: "per_dana", displayName: "Dana Ruiz", role } };
  return { ...base, model: { ...base.model, people } } as Snapshot;
}

describe("useOpens (ADR 0196)", () => {
  it.each([
    ["owner", "true"],
    ["admin", "true"],
    ["member", "false"],
    ["guest", "false"],
  ] as const)("is %s → %s", async (role, shown) => {
    await render(<Shows store={fakeStore(withDana(role))} selfId="per_dana" />);
    expect(screen.getByTestId("opens")).toHaveTextContent(shown);
  });

  it("is a yes before the people are read", async () => {
    await render(<Shows store={fakeStore(withDana(undefined))} selfId="per_dana" />);
    expect(screen.getByTestId("opens")).toHaveTextContent("true");
  });

  it("is a yes with no store yet", async () => {
    await render(<Shows />);
    expect(screen.getByTestId("opens")).toHaveTextContent("true");
  });
});
