/**
 * An invite opened where Chips is in a workspace already (ADR 0164): one of the workspaces here
 * opens, another joins alongside under the name you go by and comes to the front, and a link that
 * can't be used says so with one button. A space's link (ADR 0168) opens the room, asks before
 * letting you into it, or tells a guest in another space why not.
 */

import { type Device, PairingError, type Space, type Store } from "@chipschat/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const core = vi.hoisted(() => ({
  establishLink: vi.fn(),
  peekInvite: vi.fn(),
  joinByInvite: vi.fn(),
}));
vi.mock("@chipschat/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chipschat/core")>();
  return { ...actual, ...core };
});

import { InviteArrived } from "./InviteArrived.tsx";

const device = (id: string, workspaceId: string, workspaceName: string): Device => ({
  deviceId: id,
  participantId: `usr_${id}`,
  workspaceId,
  workspaceName,
  displayName: "Arjun",
  privateKey: {} as CryptoKey,
});
const DEMO = device("dev_demo", "ws_demo", "Demo");
const STUDIO = device("dev_studio", "ws_studio", "Studio");
const peek = (workspaceId: string, workspaceName: string) => ({
  inviteId: "inv_1",
  workspaceId,
  workspaceName,
  role: "member",
  singleUse: true,
  expiresAt: "2099-01-01T00:00:00.000Z",
  invitedByName: "Ravi",
});

const bakeryLink = { ...peek("ws_demo", "Demo"), spaceId: "spc_bakery", spaceName: "Bakery" };
const room = (id: string, title: string, members: readonly string[]) =>
  ({ id, title, kind: "group", state: "open", members }) as unknown as Space;

/** Demo's store, with Arjun as `role` in the rooms named; entering answers the space. */
function demoStore(role: "member" | "guest", rooms: readonly Space[]) {
  const enterByInvite = vi.fn(async () => ({ spaceId: "spc_bakery", already: false }));
  const store = {
    getSnapshot: () => ({
      model: {
        spaces: rooms,
        people: { [DEMO.participantId]: { participantId: DEMO.participantId, role } },
      },
      directory: {},
    }),
    enterByInvite,
  } as unknown as Store;
  return { store, enterByInvite };
}

function arrive(
  token: string,
  handlers: Partial<Record<"onOpen" | "onJoined" | "onDone" | "onLand", () => void>> = {},
  store?: Store,
) {
  const props = {
    onOpen: vi.fn(),
    onJoined: vi.fn(),
    onDone: vi.fn(),
    onLand: vi.fn(),
    ...handlers,
  };
  render(
    <InviteArrived
      invite={{ token }}
      inShell={false}
      devices={[DEMO, STUDIO]}
      current={DEMO}
      name="Arjun Gupta"
      storeOf={(deviceId) => (deviceId === DEMO.deviceId ? store : undefined)}
      {...props}
    />,
  );
  return props;
}

afterEach(() => vi.clearAllMocks());

describe("an invite opened in a paired tab", () => {
  it("opens one of the workspaces here, and leaves the link unused", async () => {
    core.peekInvite.mockResolvedValueOnce(peek("ws_studio", "Studio"));
    const { onOpen, onDone } = arrive("chips_inv_studio");
    expect(await screen.findByText("You're already in Studio")).toBeDefined();
    expect(screen.getByText(/on this browser. The link stays unused/)).toBeDefined();
    // By role, waited for: the words are there before the dialog is shown modal, and a dialog not
    // yet open has no roles to find (T-29).
    fireEvent.click(await screen.findByRole("button", { name: "Open Studio" }));
    expect(onOpen).toHaveBeenCalledWith("dev_studio");
    expect(onDone).toHaveBeenCalled();
    expect(core.joinByInvite).not.toHaveBeenCalled();
  });

  it("joins another alongside, under the name you go by, and puts it in front", async () => {
    core.peekInvite.mockResolvedValueOnce(peek("ws_acme", "Acme"));
    const joined = device("dev_acme", "ws_acme", "Acme");
    core.joinByInvite.mockResolvedValueOnce(joined);
    const { onJoined, onDone } = arrive("chips_inv_acme");
    expect(await screen.findByText("Join Acme too?")).toBeDefined();
    expect(screen.getByText(/Demo stays: switch between them/)).toBeDefined();
    expect(
      screen.getByText("You join as Arjun Gupta. You can change your name there in You."),
    ).toBeDefined();
    expect(await screen.findByRole("button", { name: "Not now" })).toBeDefined();
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(joined, undefined));
    expect(onDone).toHaveBeenCalled();
    expect(core.joinByInvite.mock.calls[0]?.slice(0, 2)).toEqual(["chips_inv_acme", "Arjun Gupta"]);
  });

  it("asks for another name when the one you go by is taken there, and joins under it (ADR 0197)", async () => {
    core.peekInvite.mockResolvedValueOnce(peek("ws_acme", "Acme"));
    const joined = device("dev_acme", "ws_acme", "Acme");
    core.joinByInvite
      .mockRejectedValueOnce(
        new PairingError("Somebody here goes by Arjun Gupta already.", "name_taken"),
      )
      .mockResolvedValueOnce(joined);
    const { onJoined, onDone } = arrive("chips_inv_acme_taken");
    expect(await screen.findByText("Join Acme too?")).toBeDefined();
    expect(screen.queryByTestId("invite-name")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));

    // Why, in the dialog's words, and the name tried in a field to change; the link is unspent.
    expect((await screen.findByTestId("confirm-failed")).textContent).toBe(
      "The name Arjun Gupta is taken in Acme. Join under another one.",
    );
    const field = screen.getByTestId("invite-name") as HTMLInputElement;
    expect(field.value).toBe("Arjun Gupta");
    expect(screen.queryByText(/You join as/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    // A blank name is not sent.
    fireEvent.change(field, { target: { value: " " } });
    expect((screen.getByTestId("confirm-go") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(field, { target: { value: "Arjun G." } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(joined, undefined));
    expect(core.joinByInvite.mock.calls.map((call) => call[1])).toEqual([
      "Arjun Gupta",
      "Arjun G.",
    ]);
  });

  it("asks for no name when the join is refused for anything else", async () => {
    core.peekInvite.mockResolvedValueOnce(peek("ws_acme", "Acme"));
    core.joinByInvite.mockRejectedValueOnce(new PairingError("That device is paired already."));
    arrive("chips_inv_acme_paired");
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    expect((await screen.findByTestId("confirm-failed")).textContent).toBe(
      "That device is paired already.",
    );
    expect(screen.queryByTestId("invite-name")).toBeNull();
  });

  it("opens a space's room for somebody in it, and leaves the link unused", async () => {
    core.peekInvite.mockResolvedValueOnce(bakeryLink);
    const { store, enterByInvite } = demoStore("member", [
      room("spc_bakery", "Bakery", [DEMO.participantId]),
    ]);
    const { onLand, onDone } = arrive("chips_inv_bakery", {}, store);
    expect(await screen.findByText("You're already in Bakery")).toBeDefined();
    // The words are drawn before the dialog opens, and a dialog not yet open has no roles (T-29).
    fireEvent.click(await screen.findByRole("button", { name: "Open Bakery" }));
    await waitFor(() => expect(onLand).toHaveBeenCalledWith("dev_demo", "spc_bakery"));
    expect(onDone).toHaveBeenCalled();
    expect(enterByInvite).not.toHaveBeenCalled();
  });

  it("asks somebody in Demo before letting them into Bakery, then lands them there", async () => {
    core.peekInvite.mockResolvedValueOnce(bakeryLink);
    const { store, enterByInvite } = demoStore("member", []);
    const { onLand } = arrive("chips_inv_bakery_enter", {}, store);
    expect(await screen.findByText("Join Bakery?")).toBeDefined();
    expect(
      screen.getByText(/You're in Demo as Arjun Gupta, so it adds you to Bakery/),
    ).toBeDefined();
    expect(await screen.findByRole("button", { name: "Not now" })).toBeDefined();
    fireEvent.click(await screen.findByRole("button", { name: "Join Bakery" }));
    await waitFor(() => expect(onLand).toHaveBeenCalledWith("dev_demo", "spc_bakery"));
    expect(enterByInvite).toHaveBeenCalledWith("chips_inv_bakery_enter");
    expect(core.joinByInvite).not.toHaveBeenCalled();
  });

  it("tells a guest in another space why the link can't add them", async () => {
    core.peekInvite.mockResolvedValueOnce(bakeryLink);
    const { store, enterByInvite } = demoStore("guest", [
      room("spc_studio", "Studio", [DEMO.participantId]),
    ]);
    const { onDone, onLand } = arrive("chips_inv_bakery_guest", {}, store);
    expect(await screen.findByText("A guest is in one space")).toBeDefined();
    expect(screen.getByText(/You're a guest in Studio/)).toBeDefined();
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    expect(onDone).toHaveBeenCalled();
    expect(onLand).not.toHaveBeenCalled();
    expect(enterByInvite).not.toHaveBeenCalled();
  });

  it("joins another workspace by a space's link and lands in its room", async () => {
    core.peekInvite.mockResolvedValueOnce({
      ...peek("ws_acme", "Acme"),
      spaceId: "spc_launch",
      spaceName: "Launch",
    });
    const joined = device("dev_acme", "ws_acme", "Acme");
    core.joinByInvite.mockResolvedValueOnce(joined);
    const { onJoined } = arrive("chips_inv_launch");
    fireEvent.click(await screen.findByRole("button", { name: "Join Acme" }));
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith(joined, "spc_launch"));
  });

  it("says a link that can't be used can't, with OK alone", async () => {
    core.peekInvite.mockRejectedValueOnce(new PairingError("That invite is not valid."));
    const { onDone } = arrive("chips_inv_dead");
    expect(await screen.findByText("This invite can't be used")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "OK" }));
    expect(onDone).toHaveBeenCalled();
  });
});
