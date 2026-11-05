/**
 * Delete your account on the web and the Mac (ADR 0243): its page says what goes and what stays
 * (ADR 0265's addendum), its button asks the last time in a dialog where Delete wakes once the
 * workspace's name is typed, a refusal keeps the dialog up, and the only owner is told how the
 * workspace itself is deleted.
 */

import { buildModel, type Directory, type PairedDeviceRecord } from "@chipschat/core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeleteAccountRow } from "./DeleteAccount.tsx";
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
    <DeleteAccountRow
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
    // The page says it all; nothing is asked yet.
    const page = screen.getByTestId("delete-account-page");
    const goes = within(page).getByTestId("delete-goes");
    expect(
      await within(goes).findByText("Your 2 devices and their sign-ins, and push to them"),
    ).toBeDefined();
    expect(
      within(within(page).getByTestId("delete-stays")).getByText(
        "Scout, which you connected: it goes to Arjun",
      ),
    ).toBeDefined();
    expect(screen.queryByTestId("delete-account-dialog")).toBeNull();
    // Its button asks the last time.
    fireEvent.click(within(page).getByTestId("delete-account-ask"));
    const dialog = screen.getByTestId("delete-account-dialog");
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

  it("keeps the dialog up with the server's reason when it refuses, and Keep it goes back", async () => {
    drawn("per_dana", async () => {
      throw new Error("The server could not be reached.");
    });
    fireEvent.click(screen.getByTestId("delete-account-ask"));
    const dialog = screen.getByTestId("delete-account-dialog");
    fireEvent.change(within(dialog).getByTestId("delete-account-typed"), {
      target: { value: "Home" },
    });
    fireEvent.click(within(dialog).getByTestId("delete-account-confirm"));
    expect((await within(dialog).findByTestId("confirm-failed")).textContent).toBe(
      "The server could not be reached.",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep it" }));
    expect(screen.queryByTestId("delete-account-dialog")).toBeNull();
    expect(screen.getByTestId("delete-account-page")).toBeDefined();
  });

  it("tells the only owner how the workspace itself is deleted, and offers no delete", () => {
    drawn("per_arjun");
    const page = screen.getByTestId("delete-account-page");
    expect(page.textContent).toContain("You own Home");
    expect(page.textContent).toContain("chips uninstall --remove-data");
    expect(within(page).queryByTestId("delete-account-ask")).toBeNull();
  });
});
