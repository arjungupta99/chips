/**
 * Delete your account on the web and the Mac (ADR 0243): the dialog says what goes and what stays,
 * Delete wakes once the workspace's name is typed, a refusal keeps the dialog up, and the only
 * owner is told how the workspace itself is deleted.
 */

import { buildModel, type Directory, type PairedDeviceRecord } from "@chipschat/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeleteAccount } from "./DeleteAccount.tsx";
import type { PeopleService } from "./services.ts";

const DIRECTORY: Directory = {
  per_arjun: { id: "per_arjun", kind: "person", displayName: "Arjun" },
  per_dana: { id: "per_dana", kind: "person", displayName: "Dana" },
  hrn_scout: { id: "hrn_scout", kind: "harness", displayName: "Scout", ownerId: "per_dana" },
};

const model = buildModel(
  Object.entries({ per_arjun: "owner", per_dana: "member" }).map(([id, role], index) => ({
    seq: index + 1,
    type: "person.joined",
    id: `evt_${index + 1}`,
    ts: "2026-10-29T00:00:00.000Z",
    workspace_id: "ws_1",
    actor: { kind: "person", id },
    participant_id: id,
    display_name: id,
    role,
  })),
);

const people = {
  devices: async () =>
    [
      { deviceId: "dev_1", revokedAt: undefined },
      { deviceId: "dev_2", revokedAt: undefined },
      { deviceId: "dev_3", revokedAt: "2026-10-01T00:00:00.000Z" },
    ] as unknown as PairedDeviceRecord[],
} as unknown as PeopleService;

function drawn(selfId: string, onDelete: () => Promise<void> = async () => undefined) {
  render(
    <DeleteAccount
      model={model}
      directory={DIRECTORY}
      selfId={selfId}
      workspace="Home"
      people={people}
      onDelete={onDelete}
    />,
  );
  fireEvent.click(screen.getByTestId("delete-account"));
}

describe("deleting your account (ADR 0243)", () => {
  it("says what goes and what stays, and deletes once the workspace's name is typed", async () => {
    const asked: string[] = [];
    drawn("per_dana", async () => {
      asked.push("delete");
    });
    const dialog = screen.getByTestId("delete-account-dialog");
    const goes = within(dialog).getByTestId("delete-goes");
    expect(
      await within(goes).findByText("Your 2 devices and their sign-ins, and push to them"),
    ).toBeDefined();
    expect(
      within(within(dialog).getByTestId("delete-stays")).getByText(
        "Scout, which you connected: it goes to Arjun",
      ),
    ).toBeDefined();
    const confirm = within(dialog).getByTestId("delete-account-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    const typed = within(dialog).getByTestId("delete-account-typed");
    fireEvent.change(typed, { target: { value: "Hom" } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(typed, { target: { value: "home" } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(asked).toEqual(["delete"]));
  });

  it("keeps the dialog up with the server's reason when it refuses", async () => {
    drawn("per_dana", async () => {
      throw new Error("The server could not be reached.");
    });
    const dialog = screen.getByTestId("delete-account-dialog");
    fireEvent.change(within(dialog).getByTestId("delete-account-typed"), {
      target: { value: "Home" },
    });
    fireEvent.click(within(dialog).getByTestId("delete-account-confirm"));
    expect((await within(dialog).findByTestId("confirm-failed")).textContent).toBe(
      "The server could not be reached.",
    );
  });

  it("tells the only owner how the workspace itself is deleted, and offers no delete", () => {
    drawn("per_arjun");
    expect(screen.queryByTestId("delete-account-dialog")).toBeNull();
    const told = screen.getByTestId("confirm-dialog");
    expect(told.textContent).toContain("You own Home");
    expect(told.textContent).toContain("chips uninstall --remove-data");
    fireEvent.click(within(told).getByTestId("confirm-go"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();
  });
});
