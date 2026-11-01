/**
 * An invite opened where Chips is in a workspace already (ADR 0164): a paired tab given a link,
 * or the Mac app given `chips://join`. Until this, a paired browser showed the workspace it knew
 * and said nothing (the people review's G4).
 *
 * - One of the workspaces here: it says so and opens it, and the link stays unused for somebody
 *   else. One person to a device; joining as somebody else is a sign-out first.
 * - Another: it joins alongside, as pairing with a second server does (M5.3), under the name you
 *   go by in the one in front, and switches to it. A name somebody there goes by already is asked
 *   for again, in a field holding it, on the same link (ADR 0197).
 * - A link that can't be used, or a server that can't be reached: why, and OK.
 *
 * A space's link (ADR 0168) in a workspace here is about the space: in it, it opens it; not in
 * it, it asks, and joining adds them as the link's maker would, the link left unused; a guest in
 * another space is told why not. Joined alongside, the room it brought them into opens.
 */

import {
  alreadyInAsking,
  DEAD_INVITE,
  type Device,
  type InvitePeek,
  joinAlongsideAsking,
  nameTaken,
  nameTakenWords,
  type Store,
  spaceLinkAsking,
  workspaceLabel,
} from "@chipschat/core";
import type { InviteLink } from "@chipschat/protocol";
import { useEffect, useState } from "react";
import { browserDeviceName } from "./browserName.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { joinBy, type Opened, openInvite, reachOf } from "./invite.ts";

export function InviteArrived({
  invite,
  inShell,
  devices,
  current,
  name,
  storeOf,
  onOpen,
  onLand,
  onJoined,
  onDone,
}: {
  readonly invite: InviteLink;
  /** In the Mac app, where the server is the one the link names. */
  readonly inShell: boolean;
  readonly devices: readonly Device[];
  /** The workspace in front. */
  readonly current: Device;
  /** The name you go by in it, which a workspace joined alongside is joined under. */
  readonly name: string;
  /** The store of a workspace here, in front or behind; none for one muted here. */
  readonly storeOf: (deviceId: string) => Store | undefined;
  readonly onOpen: (deviceId: string) => void;
  /** Open a room of a workspace here (ADR 0168). */
  readonly onLand: (deviceId: string, spaceId: string) => void;
  readonly onJoined: (device: Device, spaceId?: string) => void;
  readonly onDone: () => void;
}) {
  const [opened, setOpened] = useState<Opened>({ kind: "asking" });
  // The name to join under, typed, once the one you go by here was taken there (ADR 0197).
  const [naming, setNaming] = useState<string | undefined>(undefined);
  const reach = reachOf(invite, inShell);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the link by its token, read once a page
  useEffect(() => {
    let live = true;
    void openInvite(invite.token, reach).then((found) => {
      if (live) setOpened(found);
    });
    return () => {
      live = false;
    };
  }, [invite.token]);

  if (opened.kind === "asking") return null;
  if (opened.kind !== "ready") {
    const said =
      opened.kind === "dead"
        ? { title: DEAD_INVITE.title, body: DEAD_INVITE.body }
        : { title: "Couldn't read the invite", body: opened.message };
    return (
      <ConfirmDialog
        asking={{ ...said, confirm: "OK" }}
        danger={false}
        cancel={null}
        onCancel={onDone}
        onConfirm={onDone}
      />
    );
  }

  const room = roomHere(opened.invite, devices, storeOf);
  if (room !== undefined) {
    return (
      <IntoSpace
        invite={opened.invite}
        spaceId={room.spaceId}
        store={room.store}
        device={room.device}
        inFront={room.device.deviceId === current.deviceId}
        name={name}
        onLand={(landIn) => onLand(room.device.deviceId, landIn)}
        onDone={onDone}
        token={invite.token}
      />
    );
  }
  const there = devices.find((each) => each.workspaceId === opened.invite.workspaceId);
  if (there !== undefined) {
    const asking = alreadyInAsking({
      workspace: opened.invite.workspaceName,
      name: there.deviceId === current.deviceId ? name : there.displayName,
      here: inShell ? "Mac" : "browser",
    });
    return (
      <ConfirmDialog
        asking={asking}
        danger={false}
        onCancel={onDone}
        onConfirm={() => {
          if (there.deviceId !== current.deviceId) onOpen(there.deviceId);
          onDone();
        }}
      />
    );
  }

  const joining = opened.invite.workspaceName;
  return (
    <ConfirmDialog
      asking={joinAlongsideAsking({
        invite: opened.invite,
        here: workspaceLabel(current),
        name,
        naming: naming !== undefined,
      })}
      danger={false}
      cancel="Not now"
      onCancel={onDone}
      onConfirm={async () => {
        const named = inShell ? "Chips for Mac" : browserDeviceName();
        const as = (naming ?? name).trim();
        const about = {
          inviter: opened.invite.invitedByName,
          place: opened.invite.spaceName ?? opened.invite.workspaceName,
        };
        const device = await joinBy(invite.token, as, named, reach, opened.link, about).catch(
          (error: unknown) => {
            if (!nameTaken(error)) throw error;
            // Nothing was spent: the same link takes another name, typed where this one is.
            setNaming(as);
            throw new Error(nameTakenWords({ name: as, workspace: joining }));
          },
        );
        onJoined(device, opened.invite.spaceId);
        onDone();
      }}
      field={
        naming === undefined
          ? undefined
          : {
              label: `Your name in ${joining}`,
              value: naming,
              onChange: setNaming,
              testId: "invite-name",
            }
      }
    />
  );
}

/** A room's link to a workspace here, with the store to let them in by (ADR 0168). */
function roomHere(
  invite: InvitePeek,
  devices: readonly Device[],
  storeOf: (deviceId: string) => Store | undefined,
): { readonly spaceId: string; readonly device: Device; readonly store: Store } | undefined {
  const { spaceId } = invite;
  const device = devices.find((each) => each.workspaceId === invite.workspaceId);
  const store = device === undefined ? undefined : storeOf(device.deviceId);
  if (spaceId === undefined || device === undefined || store === undefined) return undefined;
  return { spaceId, device, store };
}

/**
 * A space's link in a workspace here (ADR 0168), in core's words: Open it, Join it, or why a guest
 * can't. Joining asks the server, which adds them as the link's maker would and says which room.
 */
function IntoSpace(props: {
  readonly invite: InvitePeek;
  readonly spaceId: string;
  readonly token: string;
  readonly store: Store;
  readonly device: Device;
  /** Whether it is the workspace in front, where they go by `name`. */
  readonly inFront: boolean;
  readonly name: string;
  readonly onLand: (spaceId: string) => void;
  readonly onDone: () => void;
}) {
  const { store, device } = props;
  const { model, directory } = store.getSnapshot();
  const { kind, asking } = spaceLinkAsking({
    invite: props.invite,
    spaceId: props.spaceId,
    model,
    directory,
    selfId: device.participantId,
    name: props.inFront
      ? props.name
      : (directory[device.participantId]?.displayName ?? device.displayName),
  });
  if (kind === "guest_elsewhere") {
    return (
      <ConfirmDialog
        asking={asking}
        danger={false}
        cancel={null}
        onCancel={props.onDone}
        onConfirm={props.onDone}
      />
    );
  }
  return (
    <ConfirmDialog
      asking={asking}
      danger={false}
      {...(kind === "enter" ? { cancel: "Not now" } : {})}
      onCancel={props.onDone}
      onConfirm={async () => {
        // Somebody a background store had not heard was in it is let in all the same: the server
        // says it was already so, and the room opens.
        const landIn =
          kind === "in" ? props.spaceId : (await store.enterByInvite(props.token)).spaceId;
        props.onLand(landIn);
        props.onDone();
      }}
    />
  );
}
