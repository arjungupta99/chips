/**
 * One person's page, from People (people review, Phase 1; ADR 0209): their face, their role as a
 * tag, when they joined and who let them in; then what they can and can't do, worked out from their
 * role and their rooms (core's `canDo`), each line with a tick or a cross and the faces it is about;
 * their role, the spaces the reader shares with them, and the link they came by; their devices and
 * when each was last seen, with a new phone for them from an owner (ADR 0206, `NewPhoneSheet`); and
 * Remove from the workspace. As the desktop's People card offers it, to the same people (core's
 * `rolesOffered`, `mayRemovePerson`).
 *
 * The role opens a sheet of the roles this reader may give them, a tick on theirs, Guest off for
 * somebody in more than one space. Picking one turns the sheet to a page that says what they will
 * be able to do, who they would stop or start seeing, and asks (Arjun, 14 October 2026; ADR 0209);
 * the change is an event, and the row shows the new role once the server has it, or says why it
 * would not. Remove asks on the sheet every removal asks on (`ConfirmSheet`), in the desktop's
 * words, and waits for the server.
 */

import {
  type Asking,
  type CanDo,
  cameBy,
  cameByWords,
  canDo,
  type Directory,
  guestRefusal,
  harnessesOf,
  type Invite,
  invitedByWords,
  mayInvite,
  mayRemovePerson,
  myRole,
  nameOf,
  type PersonModel,
  ROLE_MEANS,
  ROLE_WORDS,
  removePersonAsking,
  roleChangeAsking,
  roleChangeSees,
  rolesOffered,
  type Snapshot,
  type Space,
  type Store,
  selfLabel,
  sharedSpaces,
  spaceTitle,
  type WorkspaceModel,
  type WorkspaceRole,
} from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ConfirmSheet } from "../spaces/ConfirmSheet";
import { RowAvatar } from "../spaces/RowAvatar";
import { useSnapshot } from "../store/provider";
import { Avatar, avatarSide } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Group, GroupFoot, GroupHeading, GroupRow } from "../ui/Group";
import { Icon } from "../ui/Icon";
import { Empty, UnderName, useColumn } from "../ui/Screen";
import { CLOSE_ROOM, Sheet } from "../ui/Sheet";
import { SheetPages } from "../ui/SheetPages";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Face, FaceStack } from "./Faces";
import { PopIn } from "./PeopleMotion";
import { RoleTag } from "./RoleTag";
import { PersonDevices } from "./TheirDevices";
import { dayWords, joinedWords } from "./words";

export function Person({
  store,
  selfId,
  personId,
  workspace,
  serverUrl,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly personId: string;
  /** The workspace as a sentence names it. */
  readonly workspace: string;
  /** Where this phone reaches the server: a new phone's QR names it (ADR 0206). */
  readonly serverUrl?: string | undefined;
}) {
  const snapshot = useSnapshot(store);
  const router = useRouter();
  const palette = usePalette();
  const column = useColumn();
  const [roles, setRoles] = useState(false);
  const [removing, setRemoving] = useState(false);
  const { busy, failed, setFailed, remove } = useRemove(store, personId, () => {
    setRemoving(false);
    router.back();
  });
  const { model, directory } = snapshot;
  const person = model.people[personId];
  const reader = myRole(model, selfId);
  const self = personId === selfId;
  const invites = useReads(store, snapshot, personId, selfId);
  if (person === undefined) return <Empty>Not in {workspace}.</Empty>;

  const name = nameOf(directory, personId);
  const face = directory[personId]?.face;
  const owners = Object.values(model.people).filter((each) => each.role === "owner").length;
  const offered = rolesOffered(reader, person, owners);
  const shared = sharedSpaces(model, personId, selfId);
  const changing = snapshot.busy.has(personId);
  const lines = canDo(model, directory, personId, { selfId, workspace });
  const came = cameLine(person, invites, model, directory, selfId);

  return (
    <>
      <UnderName contentContainerStyle={[styles.page, column]} testID="person-page">
        <Head
          name={self ? selfLabel(name) : name}
          face={face}
          role={person.role}
          joined={joinedWords(person.joinedAt, invitedByWords(person.invitedBy, selfId, directory))}
        />
        <CanGroup
          heading={self ? "What you can do" : `What ${name} can do`}
          lines={lines}
          snapshot={snapshot}
          selfId={selfId}
        />
        <Standing
          workspace={workspace}
          role={changing ? "Changing…" : ROLE_WORDS[person.role]}
          onRole={offered.length > 1 && !changing ? () => setRoles(true) : undefined}
          came={came}
          refused={snapshot.refused?.get(personId)}
        />
        <SpacesGroup
          heading={self ? "Your spaces" : "Spaces you share"}
          spaces={shared}
          snapshot={snapshot}
          selfId={selfId}
          onOpen={(id) => router.push(`/spaces/${id}`)}
        />
        <PersonDevices
          store={store}
          snapshot={snapshot}
          personId={personId}
          selfId={selfId}
          name={name}
          serverUrl={serverUrl}
        />
        {mayRemovePerson(model, personId, selfId) ? (
          <RemoveGroup
            name={name}
            workspace={workspace}
            onRemove={() => {
              setFailed(undefined);
              setRemoving(true);
            }}
          />
        ) : null}
      </UnderName>
      <RoleSheet
        open={roles}
        person={person}
        name={name}
        self={self}
        offered={offered}
        directory={directory}
        asking={(to) => roleAsking(snapshot, personId, to, selfId)}
        refusal={(role) => (role === "guest" ? guestRefusal(model, personId) : undefined)}
        onClose={() => setRoles(false)}
        onChange={(role) => {
          store.changeRole({ participantId: personId, role });
          setRoles(false);
        }}
      />
      <ConfirmSheet
        open={removing}
        onClose={() => setRemoving(false)}
        onGone={() => undefined}
        room={{
          face: <Avatar name={name} kind="person" icon={face} />,
          name,
          last: `${ROLE_WORDS[person.role]} · ${workspace}`,
        }}
        confirming={{
          asking: removePersonAsking({
            name,
            workspace,
            harnesses: harnessesOf(directory, personId),
          }),
          tone: palette.red,
          busy,
          failed,
        }}
        onConfirm={() => void remove()}
      />
    </>
  );
}

/** What changing their role asks first: who they'd stop and start seeing, and the faces it stops. */
function roleAsking(snapshot: Snapshot, personId: string, to: WorkspaceRole, selfId: string) {
  const { model, directory } = snapshot;
  const sees = roleChangeSees(model, directory, personId, to, selfId);
  const names = (ids: readonly string[]) => ids.map((id) => nameOf(directory, id));
  return {
    asking: roleChangeAsking({
      name: nameOf(directory, personId),
      to,
      yourself: personId === selfId,
      sees: {
        ...sees,
        stops: names(sees.stops),
        starts: names(sees.starts),
        there: names(sees.there),
      },
    }),
    stops: sees.stops,
  };
}

/** Their face, their name, their role as a tag, and when they joined. */
function Head({
  name,
  face,
  role,
  joined,
}: {
  readonly name: string;
  readonly face: SpaceIcon | undefined;
  readonly role: WorkspaceRole;
  readonly joined: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.head}>
      <Avatar name={name} kind="person" size="profile" icon={face} decorative />
      <Text style={[styles.name, { color: palette.ink }]} accessibilityRole="header">
        {name}
      </Text>
      <View style={styles.standing}>
        <RoleTag role={role} testID="person-role-tag" />
        <Text style={[styles.joined, { color: palette.ink3 }]}>{joined}</Text>
      </View>
    </View>
  );
}

/** What they can and can't do, a tick or a cross a line, each popping in after the one before. */
function CanGroup({
  heading,
  lines,
  snapshot,
  selfId,
}: {
  readonly heading: string;
  readonly lines: readonly CanDo[];
  readonly snapshot: Snapshot;
  readonly selfId: string;
}) {
  return (
    <>
      <GroupHeading>{heading}</GroupHeading>
      <Group testID="person-can" inset={SPACE.lg + MARK + SPACE.md}>
        {lines.map((line, index) => (
          <CanRow
            key={line.words}
            line={line}
            order={index}
            directory={snapshot.directory}
            model={snapshot.model}
            icons={snapshot.spaceIcons}
            selfId={selfId}
          />
        ))}
      </Group>
    </>
  );
}

/**
 * Where they stand: their role, to change for one who may; the link they came by, for an owner;
 * and why a change was refused, when it was.
 */
function Standing({
  workspace,
  role,
  onRole,
  came,
  refused,
}: {
  readonly workspace: string;
  readonly role: string;
  readonly onRole: (() => void) | undefined;
  readonly came: string | undefined;
  readonly refused: string | undefined;
}) {
  const palette = usePalette();
  return (
    <>
      <GroupHeading>{`In ${workspace}`}</GroupHeading>
      <Group testID="person-standing">
        <GroupRow label="Role" value={role} onPress={onRole} testID="person-role" />
        {came === undefined ? null : (
          <GroupRow label="Came by" sub={came} testID="person-came-by" />
        )}
      </Group>
      {refused === undefined ? null : (
        <GroupFoot tone={palette.red} testID="person-refused">
          {refused}
        </GroupFoot>
      )}
    </>
  );
}

/**
 * The spaces you share with them, each with the face the Spaces list draws for it and its name
 * (ADR 0209's addendum): a tap opens the room.
 */
function SpacesGroup({
  heading,
  spaces,
  snapshot,
  selfId,
  onOpen,
}: {
  readonly heading: string;
  readonly spaces: readonly Space[];
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly onOpen: (spaceId: string) => void;
}) {
  const { directory } = snapshot;
  return (
    <>
      <GroupHeading>{heading}</GroupHeading>
      <Group testID="person-spaces" inset={SPACE.lg + avatarSide("sm") + SPACE.md}>
        {spaces.length === 0 ? (
          <GroupRow label="None yet" testID="person-no-spaces" />
        ) : (
          spaces.map((space) => {
            const title = spaceTitle(space, directory, selfId);
            return (
              <GroupRow
                key={space.id}
                mark={
                  <RowAvatar
                    space={space}
                    directory={directory}
                    title={title}
                    icon={snapshot.spaceIcons.get(space.id)}
                    size="sm"
                  />
                }
                label={title}
                onPress={() => onOpen(space.id)}
                testID={`person-space-${space.id}`}
              />
            );
          })
        )}
      </Group>
    </>
  );
}

/** Remove from the workspace, apart at the foot of the page, and what it does. */
function RemoveGroup({
  name,
  workspace,
  onRemove,
}: {
  readonly name: string;
  readonly workspace: string;
  readonly onRemove: () => void;
}) {
  return (
    <>
      <View style={styles.gap} />
      <Group>
        <GroupRow
          label={`Remove from ${workspace}…`}
          tone="danger"
          onPress={onRemove}
          testID="remove-person"
        />
      </Group>
      <GroupFoot>
        Signs {name} out everywhere and takes them out of every space. What they said stays, under
        their name.
      </GroupFoot>
    </>
  );
}

/** "Your member link to Foodie, made 14 October", where an owner can read the links. */
function cameLine(
  person: PersonModel,
  invites: readonly Invite[] | undefined,
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
): string | undefined {
  if (invites === undefined) return undefined;
  const invite = cameBy(person, invites);
  if (invite === undefined) return undefined;
  const space = model.spaces.find((each) => each.id === invite.spaceId);
  return cameByWords({
    invite,
    by: invitedByWords(invite.createdBy, selfId, directory) ?? "",
    space: space === undefined ? undefined : spaceTitle(space, directory, selfId),
    made: dayWords(invite.createdAt),
  });
}

/** Taking them out of the workspace: busy while the server does it, and its reason if it won't. */
function useRemove(store: Store, personId: string, onGone: () => void) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const remove = async () => {
    setBusy(true);
    setFailed(undefined);
    try {
      await store.removePerson(personId);
      onGone();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, failed, setFailed, remove };
}

/**
 * What this page reads beyond the snapshot, while connected, and only of somebody else: the links,
 * for an owner, for the one they came by; and their devices, for an owner or an admin.
 */
function useReads(store: Store, snapshot: Snapshot, personId: string, selfId: string) {
  const reader = myRole(snapshot.model, selfId);
  const asks = snapshot.connection === "open" && personId !== selfId;
  return useInvites(store, asks && mayInvite(reader));
}

/** The workspace's links, for which one brought this person: an owner's alone to read. */
function useInvites(store: Store, may: boolean): readonly Invite[] | undefined {
  const [invites, setInvites] = useState<readonly Invite[] | undefined>(undefined);
  useEffect(() => {
    if (!may) return;
    let live = true;
    store.invites().then(
      (found) => {
        if (live) setInvites(found);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [store, may]);
  return invites;
}

const MARK = 24;

/** One thing they can or can't do: a tick or a cross, the words, and the faces it is about. */
function CanRow({
  line,
  order,
  directory,
  model,
  icons,
  selfId,
}: {
  readonly line: CanDo;
  readonly order: number;
  readonly directory: Directory;
  readonly model: WorkspaceModel;
  /** The marks the reader chose for rooms. */
  readonly icons: Snapshot["spaceIcons"];
  readonly selfId: string;
}) {
  const palette = usePalette();
  const rooms = (line.spaces ?? [])
    .map((id) => model.spaces.find((each) => each.id === id))
    .filter((each) => each !== undefined);
  return (
    <View
      style={[styles.can, { backgroundColor: palette.surface }]}
      accessible
      accessibilityLabel={line.words}
      testID={`can-${order}`}
    >
      <PopIn
        delay={220 + order * 120}
        style={[styles.mark, { backgroundColor: line.can ? palette.greenSoft : palette.surface2 }]}
      >
        <Icon
          name={line.can ? "check" : "x"}
          size={14}
          color={line.can ? palette.greenInk : palette.ink3}
        />
      </PopIn>
      <Text style={[styles.canWords, { color: line.can ? palette.ink : palette.ink2 }]}>
        {line.words}
      </Text>
      {rooms.length > 0 ? (
        <View style={styles.rooms}>
          {rooms.slice(0, 3).map((space) => (
            <RowAvatar
              key={space.id}
              space={space}
              directory={directory}
              title={spaceTitle(space, directory, selfId)}
              icon={icons.get(space.id)}
              size="xs"
            />
          ))}
        </View>
      ) : line.faces !== undefined && line.faces.length > 0 ? (
        <FaceStack directory={directory} ids={line.faces} size="xs" most={4} />
      ) : null}
    </View>
  );
}

type RolePage = { readonly kind: "roles" } | { readonly kind: "asks"; readonly to: WorkspaceRole };

/**
 * The roles this reader may give the person, a tick on theirs; one picked turns the sheet to what
 * it means, and asks.
 */
function RoleSheet({
  open,
  person,
  name,
  self,
  offered,
  directory,
  asking,
  refusal,
  onClose,
  onChange,
}: {
  readonly open: boolean;
  readonly person: PersonModel;
  readonly name: string;
  readonly self: boolean;
  readonly offered: readonly WorkspaceRole[];
  readonly directory: Directory;
  /** What a change to this role asks, and whom they would stop seeing (ADR 0209). */
  readonly asking: (to: WorkspaceRole) => {
    readonly asking: Asking;
    readonly stops: readonly string[];
  };
  /** Why a role can't be given them, from what the reader can see; the door has the last word. */
  readonly refusal: (role: WorkspaceRole) => string | undefined;
  readonly onClose: () => void;
  readonly onChange: (role: WorkspaceRole) => void;
}) {
  const [page, setPage] = useState<RolePage>({ kind: "roles" });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onGone={() => setPage({ kind: "roles" })}
      testID="role-sheet"
    >
      <SheetPages
        page={page}
        keyOf={(shown) => (shown.kind === "asks" ? `asks:${shown.to}` : "roles")}
        render={(shown) =>
          shown.kind === "asks" ? (
            <Asks
              {...asking(shown.to)}
              directory={directory}
              onConfirm={() => onChange(shown.to)}
              onCancel={() => setPage({ kind: "roles" })}
            />
          ) : (
            <Roles
              person={person}
              name={name}
              self={self}
              offered={offered}
              refusal={refusal}
              onPick={(to) => setPage({ kind: "asks", to })}
            />
          )
        }
      />
    </Sheet>
  );
}

/**
 * The roles this reader may give them, a tick on theirs, one off where the door would refuse. The
 * sheet's X puts it away (ADR 0169).
 */
function Roles({
  person,
  name,
  self,
  offered,
  refusal,
  onPick,
}: {
  readonly person: PersonModel;
  readonly name: string;
  readonly self: boolean;
  readonly offered: readonly WorkspaceRole[];
  readonly refusal: (role: WorkspaceRole) => string | undefined;
  readonly onPick: (role: WorkspaceRole) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.sheetPage}>
      <Text style={[styles.sheetTitle, { color: palette.ink }]} accessibilityRole="header">
        {self ? "Your role" : `${name}'s role`}
      </Text>
      <Group>
        {offered.map((role) => {
          const theirs = role === person.role;
          const off = theirs ? undefined : refusal(role);
          return (
            <GroupRow
              key={role}
              label={ROLE_WORDS[role]}
              sub={off ?? ROLE_MEANS[role]}
              tone={off === undefined ? "plain" : "off"}
              trailing={theirs ? <Icon name="check" size={20} color={palette.blue} /> : undefined}
              onPress={theirs || off !== undefined ? undefined : () => onPick(role)}
              testID={`role-${role}`}
            />
          );
        })}
      </Group>
    </View>
  );
}

/**
 * A page that asks: core's words, the faces of whom they would stop seeing fading out, the change
 * in gold, and Cancel back to the roles.
 */
function Asks({
  asking,
  stops,
  directory,
  onConfirm,
  onCancel,
}: {
  readonly asking: Asking;
  readonly stops: readonly string[];
  readonly directory: Directory;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.sheetPage} testID="role-asks">
      <Text accessibilityRole="header" style={[styles.ask, { color: palette.ink }]}>
        {asking.title}
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>{asking.body}</Text>
      {asking.note === undefined ? null : (
        <Text style={[styles.body, { color: palette.ink3 }]}>{asking.note}</Text>
      )}
      {stops.length === 0 ? null : (
        <View style={styles.stops} testID="role-stops">
          {stops.slice(0, 6).map((id, index) => (
            <PopIn key={id} delay={150 + index * 70} style={styles.stopped}>
              <Face directory={directory} id={id} size="md" />
              <View style={[styles.strike, { backgroundColor: palette.ink3 }]} />
            </PopIn>
          ))}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={asking.confirm}
        onPress={onConfirm}
        testID="role-confirm"
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: palette.gold, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={styles.goWords}>{asking.confirm}</Text>
      </Pressable>
      <Button label="Cancel" onPress={onCancel} style={styles.done} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: SPACE.xxl * 2 },
  head: { alignItems: "center", gap: SPACE.xs, paddingTop: SPACE.md, paddingBottom: SPACE.sm },
  name: { fontSize: TEXT.xl + 2, fontWeight: "700", marginTop: SPACE.sm },
  standing: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  joined: { fontSize: TEXT.sm },
  gap: { height: SPACE.xxl },
  can: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 48,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
  },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: MARK / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  canWords: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.3 },
  rooms: { flexDirection: "row", gap: 3 },
  sheetPage: { gap: SPACE.sm, paddingBottom: SPACE.sm },
  // Both titles stop short of the sheet's X, at the right of their line (ADR 0169).
  sheetTitle: {
    fontSize: TEXT.xl,
    fontWeight: "700",
    paddingLeft: SPACE.lg,
    paddingRight: CLOSE_ROOM,
    paddingBottom: SPACE.xs,
  },
  ask: {
    fontSize: TEXT.xl + 2,
    fontWeight: "700",
    letterSpacing: -0.3,
    paddingLeft: SPACE.lg,
    paddingRight: CLOSE_ROOM,
  },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45, paddingHorizontal: SPACE.lg },
  stops: { flexDirection: "row", gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },
  stopped: { opacity: 0.45, justifyContent: "center" },
  strike: {
    position: "absolute",
    left: -2,
    right: -2,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: "-35deg" }],
  },
  go: {
    marginTop: SPACE.md,
    marginHorizontal: SPACE.lg,
    height: 50,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  goWords: { fontSize: TEXT.body, fontWeight: "600", color: "#14161b" },
  done: { marginHorizontal: SPACE.lg, marginTop: SPACE.xs },
});
