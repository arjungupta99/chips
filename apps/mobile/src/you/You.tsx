/**
 * You: a settings list, the way a phone's own Settings is one (ADR 0085). Who you are and the
 * workspace in front, in one card at the top; then what you hear about, how it looks, the
 * workspace's own settings for the people who run it, what this phone keeps and how it reaches
 * the server, with Send feedback under it (ADR 0237) once the repository is public; and at the
 * foot which devices hold your key, with the way out of this one under them, and Delete your
 * account beside it (ADR 0243). One card under each
 * heading, every row wearing a mark so the words of every card start at one edge, and a line
 * under a card only where a row can't say it (ADR 0085's addendum of 20 October 2026, his B: "it
 * appears bit scattered").
 *
 * Every row says what it is set to, and a row that holds a longer setting opens it in a sheet.
 * The sheets stand beside the scroll, not in it, as the agent card's do: touches travel the
 * component tree, so a scroll view round a sheet took a tap on its Done while the sheet's own list
 * was still coasting (Arjun, 10 October 2026). Each part hands its group to the scroll and its
 * sheets to the screen (`YouSection`); and, for an iPad, its sheets as pages, which the route
 * stands beside the list (`useYou`, `YouPane.tsx`).
 * Everything here is this person's or this phone's, except the one group under the workspace's
 * name, which only an owner or an admin sees: People, Invite someone (an owner's), Connect a
 * harness, the attachment limits, the messages between agents and what is allowed always.
 * Issuing a harness a token is not on a phone at all.
 *
 * What stood here before ADR 0085 and is gone: "You are", which said the name again; "Reaching
 * it", which the connection mark at the top right already says; Review and FYI, which the server
 * never pushes, so they changed nothing on a phone; and a note about passkeys, which no build of
 * the phone has.
 */

import {
  administers,
  type Device,
  mayInvite,
  myRole,
  nameOf,
  type Store,
  serverHost,
  signOutWords,
  withdrawLeaving,
  workspaceHarnesses,
  workspaceLabel,
} from "@chipschat/core";
import { type ComponentProps, type ReactElement, useMemo } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useLeave } from "../device/leave";
import { deviceWord, thisDevice } from "../device/word";
import { PlusRoom } from "../newSpace/plusRoom";
import { useChips, useDeferredSnapshot } from "../store/provider";
import {
  APPEARANCES,
  type AppearanceChoice,
  chooseAppearance,
  useAppearance,
} from "../ui/appearance";
import { ConnectionMark } from "../ui/Connection";
import { chooseFaceTheme, useFaceTheme } from "../ui/faceTheme";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET } from "../ui/Group";
import { Screen, UnderName, useColumn } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { SPACE } from "../ui/tokens";
import { useWorkspacesGroup } from "../workspaces/WorkspacesGroup";
import { About } from "./About";
import { useDeleteAccount } from "./DeleteAccount";
import { useDevicesGroup } from "./Devices";
import { FaceThemes } from "./FaceThemes";
import { FEEDBACK_ON, useFeedbackGroup } from "./Feedback";
import { useNotificationsGroup } from "./Notifications";
import { useProfileGroup } from "./Profile";
import { usePushRows } from "./Push";
import type { YouPages } from "./pages";
import { useWorkspaceGroup } from "./Workspace";
import { guestStandingWords, standingWords } from "./words";

export function You(props: { readonly device: Device; readonly store: Store }) {
  return useYou(props).screen;
}

/**
 * You's list, and its sheets as pages for the pane beside it on an iPad. One You holds both, so
 * what a page changes, the row beside it says at once: the notification settings, the devices once
 * a computer has paired, why a face did not stick. A pane that read its own would have held a
 * second copy of each, a step behind the row.
 */
export function useYou({ device, store }: { readonly device: Device; readonly store: Store }): {
  readonly screen: ReactElement;
  readonly pages: YouPages;
} {
  const snapshot = useDeferredSnapshot(store);
  const column = useColumn();
  const signOut = useSignOut(device, store);
  // The directory's name, which a rename on any device changes; the one saved at pairing until
  // the directory has been read.
  const name =
    snapshot.directory[device.participantId] === undefined
      ? device.displayName
      : nameOf(snapshot.directory, device.participantId);
  const role = myRole(snapshot.model, device.participantId);
  // The server's word at the last hello, else the name this phone was paired under.
  const workspace = snapshot.workspaceName ?? device.workspaceName ?? device.workspaceId;
  const connected = snapshot.connection === "open";
  const harnesses = workspaceHarnesses(snapshot.directory).map((participant) => ({
    id: participant.id,
    name: participant.displayName,
  }));
  const profile = useProfileGroup({
    store,
    name,
    face: snapshot.directory[device.participantId]?.face,
    standing:
      (role === "guest"
        ? guestStandingWords(snapshot.model, snapshot.directory, device.participantId)
        : undefined) ?? standingWords(role, workspace),
    connected,
  });
  const notifications = useNotificationsGroup({ store, harnesses, guest: role === "guest" });
  const workspaces = useWorkspacesGroup();
  // The workspaces behind this one that are heard from here, which the push switch tells too.
  const { devices: held } = useChips();
  const behind = useMemo(
    () => held.filter((each) => each.deviceId !== device.deviceId && each.muted !== true),
    [held, device.deviceId],
  );
  const push = usePushRows({ device, others: behind, store });
  const devices = useDevicesGroup({ store, device, connected });
  const deletion = useDeleteAccount({
    device,
    store,
    workspace,
    others: held.filter((each) => each.deviceId !== device.deviceId).length,
  });
  const feedback = useFeedbackGroup({
    shown: FEEDBACK_ON,
    model: snapshot.model,
    directory: snapshot.directory,
    selfId: device.participantId,
  });
  const settings = useWorkspaceGroup({
    store,
    name: workspace,
    caps: snapshot.model.attachmentCaps,
    limits: snapshot.model.exchangeLimits,
    connected,
    may: administers(role),
    invites: mayInvite(role),
    people: Object.keys(snapshot.model.people).length,
    snapshot,
    selfId: device.participantId,
    // Every owner has a relay switch (ADR 0245). Until somebody turns it, it is as the server
    // started it: on when the server gave this phone a relay, off for Chips's own.
    relay:
      role === "owner" ? (snapshot.model.relay?.on ?? device.relayUrl !== undefined) : undefined,
  });

  const pages: YouPages = {
    ...profile.pages,
    ...notifications.pages,
    ...settings.pages,
    ...feedback.pages,
    ...devices.pages,
    ...deletion.pages,
  };

  const screen = (
    <Screen
      grouped
      title="You"
      glass
      action={
        <ConnectionMark
          state={snapshot.connection}
          link={snapshot.link}
          lostAt={snapshot.lostAt}
          server={serverHost(device.serverUrl)}
          noRelay={device.relayUrl === undefined}
          owner={role === "owner"}
          onRetry={store.wake}
        />
      }
    >
      <UnderName
        // The window's inset, not this layout's: the tab bar is glass over the list.
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.body, column]}
      >
        <View style={styles.top}>
          <Group inset={MARKED_INSET} testID="me">
            {profile.group}
            {workspaces.row}
          </Group>
        </View>

        <GroupHeading>Notifications</GroupHeading>
        <Group inset={MARKED_INSET} testID="notifications">
          {push.rows}
          {workspaces.notify}
          {notifications.rows}
        </Group>
        {push.problem}
        {push.problem === null || notifications.failed ? notifications.foot : null}

        <GroupHeading>Appearance</GroupHeading>
        <Look me={{ name, face: snapshot.directory[device.participantId]?.face }} />

        {settings.group}

        <About
          serverUrl={device.serverUrl}
          connection={snapshot.connection}
          link={snapshot.link}
          relayUrl={device.relayUrl}
          rekeyed={snapshot.rekeyed}
        />
        {feedback.group}

        {devices.group}

        <View style={styles.out}>
          <Group>
            <GroupRow
              label={held.length > 1 ? `Sign out of ${workspace}` : "Sign out"}
              tone="danger"
              onPress={signOut}
              testID="sign-out"
            />
            {deletion.row}
          </Group>
          <GroupFoot>
            {held.length > 1
              ? `Only ${workspace} leaves ${thisDevice()}. The other workspaces here stay.`
              : "Sign out leaves the workspace as it is."}
          </GroupFoot>
        </View>
        <PlusRoom />
      </UnderName>
      {profile.overlays}
      {workspaces.overlays}
      {notifications.overlays}
      {devices.overlays}
      {settings.overlays}
      {feedback.overlays}
      {deletion.overlays}
    </Screen>
  );
  return { screen, pages };
}

/**
 * Sign out: withdraw this phone's key at the server, so it is refused from its next request and
 * no push is sent to it, then forget it here and go back to pairing. Until ADR 0085 this only
 * forgot the key, and the server went on holding a live device that was still pushed to; each
 * pairing again added another. The withdrawal failing — the server is away — does not keep the
 * person signed in on a phone they meant to leave, and nor does its answer never coming: it is
 * waited for only while the server is reached, and then briefly (`withdrawLeaving`).
 */
function useSignOut(device: Device, store: Store) {
  const { devices } = useChips();
  const leave = useLeave();
  // The others stay (ADR 0197): the question names the one that goes, and says which stay.
  const stays = devices.filter((each) => each.deviceId !== device.deviceId).map(workspaceLabel);
  return () =>
    Alert.alert(
      stays.length === 0
        ? `Sign out of ${thisDevice()}?`
        : `Sign out of ${workspaceLabel(device)}?`,
      signOutWords(store.getSnapshot().model.people, device.participantId, {
        names: stays,
        device: deviceWord(),
      }),
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            const spaceIds = store.getSnapshot().model.spaces.map((space) => space.id);
            void withdrawLeaving(store, device.deviceId).then(() => leave(device, spaceIds));
          },
        },
      ],
    );
}

/**
 * How this phone looks, in one group (ADR 0176): light or dark on top, and under it the colours
 * the faces wear, as two cards with a face of each kind drawn in each. Light, dark, or whatever
 * the phone is set to is a fact about this phone, not the person: the desktop has its own, and the
 * server never hears of it.
 */
function Look({ me }: { readonly me: ComponentProps<typeof FaceThemes>["me"] }) {
  const chosen = useAppearance();
  const faces = useFaceTheme();
  return (
    <Group testID="appearance">
      <View style={styles.look}>
        <Segmented
          label="Appearance"
          options={APPEARANCES}
          chosen={chosen}
          onChoose={(value) => chooseAppearance(value as AppearanceChoice)}
        />
        <FaceThemes chosen={faces} onChoose={chooseFaceTheme} me={me} />
      </View>
    </Group>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: SPACE.xxl * 2 },
  top: { paddingTop: SPACE.xs },
  look: { padding: SPACE.sm },
  out: { paddingTop: SPACE.xxl + SPACE.sm },
});
