/**
 * Making an invite link: as what, into which room, once or by several, and for how long, with who
 * and what the newcomer will see under the choices, changing as they change (ADR 0209), and the
 * link once it is made, shown once with its QR code, Share… to the share sheet (`shareText`, ADR
 * 0127) and Copy (ADR 0164), and the card it opens to.
 *
 * Two places make one. You's Invite someone makes a link into the workspace, as any role, and, for
 * a guest or a member, into one of the rooms the maker is in (ADR 0209). A space's Add page makes
 * one into that space (ADR 0168): a guest of it, or a member who starts in it, and whoever joins by
 * it lands there.
 *
 * An owner still called "You" is asked for a name first (JR-17): whoever opens the link reads who
 * sent it.
 *
 * With the relay turned off (ADR 0211, Phase 4) a link carries no relay, so it opens only where the
 * server's own address does, and the link says so under it. With it on, the link asks (ADR 0232):
 * whoever opens it waits for the maker's Allow, and the link says that instead. Once somebody has
 * used up a link made once, it shows as used, with nothing left to share or copy.
 *
 * The link comes in under the form, below the fold on a phone, so the form says where once it is
 * laid out (`onShown`), and the page it is on glides its list down to it.
 */

import {
  INVITE_ASKS_WORDS,
  INVITE_TURN_ON_RELAY,
  type IssuedInvite,
  inviteIntoWords,
  inviteOpensAnywhere,
  inviteRelayOffWords,
  inviteShareWords,
  inviteSpaces,
  inviteToSpaceHint,
  inviteUsesMeans,
  linkUsedWords,
  myRole,
  nameOf,
  ROLE_WORDS,
  type Snapshot,
  SPACE_INVITE_ROLES,
  type Space,
  type Store,
  spaceTitle,
  type WorkspaceRole,
} from "@chipschat/core";
import { FIRST_PERSON_NAME } from "@chipschat/protocol";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { type ReactNode, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { NotInDemo, useInDemo } from "../demo/NotInDemo";
import { RowAvatar } from "../spaces/RowAvatar";
import { useSnapshot } from "../store/provider";
import { Button } from "../ui/Button";
import { GroupFoot, GroupHeading } from "../ui/Group";
import { useGround } from "../ui/ground";
import * as feel from "../ui/haptics";
import { QrCode } from "../ui/QrCode";
import { Segmented } from "../ui/Segmented";
import { shareText } from "../ui/share";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { InviteSees, JoinPreview } from "./InviteSees";
import { PopIn } from "./PeopleMotion";
import { untilWords } from "./words";

const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "admin", "member", "guest"];
const USES = [
  { value: "once", label: "Once" },
  { value: "open", label: "By several" },
] as const;

export function InviteForm({
  store,
  selfId,
  workspace,
  space,
  gone = [],
  onMade,
  onShown,
}: {
  readonly store: Store;
  readonly selfId: string;
  /** The workspace as a sentence names it. */
  readonly workspace: string;
  /** The space the link brings them into (ADR 0168); absent for the workspace alone. */
  readonly space?: { readonly id: string; readonly name: string } | undefined;
  /** Links withdrawn since: the one made here goes from the form too. */
  readonly gone?: readonly string[] | undefined;
  /** A link was made: the open links are read again. */
  readonly onMade?: ((inviteId: string) => void) | undefined;
  /**
   * The link just made is laid out: `top` is where its card starts, with the room above it, among
   * the views the form is drawn in. Once a link.
   */
  readonly onShown?: ((top: number) => void) | undefined;
}) {
  const snapshot = useSnapshot(store);
  const demo = useInDemo();
  const palette = usePalette();
  const roles = space === undefined ? WORKSPACE_ROLES : SPACE_INVITE_ROLES;
  // A workspace's link starts on Member, as it always has; a space's on Guest (ADR 0168).
  const [role, setRole] = useState<WorkspaceRole>(space === undefined ? "member" : "guest");
  const [uses, setUses] = useState<"once" | "open">("once");
  // You's form names a room too, for a guest or a member (ADR 0209); a space's form has its own.
  const [into, setInto] = useState<string | undefined>(undefined);
  const [issued, setIssued] = useState<IssuedInvite | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const unnamed = nameOf(snapshot.directory, selfId) === FIRST_PERSON_NAME;
  const { rooms, placed, spaceId, room, roomName } = linkRoom(snapshot, selfId, space, role, into);

  const make = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const made = await store.createInvite({
        role,
        singleUse: uses === "once",
        ...(spaceId === undefined ? {} : { spaceId }),
      });
      setIssued(made);
      onMade?.(made.inviteId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The server would not do it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Text style={[styles.note, { color: palette.ink3 }]}>
        {space === undefined
          ? `A link that lets one person, or several, into ${workspace}. Whoever opens it names themselves and joins.`
          : inviteToSpaceHint(workspace, space.name)}
      </Text>
      {unnamed ? (
        <Text style={[styles.warn, { color: palette.red }]} testID="name-first">
          Give yourself a name first, at the top of You: whoever opens your link sees who sent it.
        </Text>
      ) : null}
      <Choice label="As">
        <Segmented
          label="Invite role"
          options={roles.map((each) => ({ value: each, label: ROLE_WORDS[each] }))}
          chosen={role}
          onChoose={(value) => setRole(value as WorkspaceRole)}
          testID="invite-role"
        />
      </Choice>
      {rooms.length === 0 ? null : (
        <Choice label="Into">
          <RoomPick
            snapshot={snapshot}
            selfId={selfId}
            rooms={rooms}
            chosen={placed ? into : undefined}
            off={!placed}
            onChoose={setInto}
          />
          <Text style={[styles.hint, { color: palette.ink3 }]} testID="invite-into-means">
            {inviteIntoWords(role, roomName)}
          </Text>
        </Choice>
      )}
      <GroupHeading>{"What they'll see"}</GroupHeading>
      <InviteSees
        snapshot={snapshot}
        selfId={selfId}
        workspace={workspace}
        role={role}
        space={room}
        rooms={rooms}
      />
      <Choice label="Can be used">
        <Segmented
          label="Invite uses"
          options={USES}
          chosen={uses}
          onChoose={(value) => setUses(value as "once" | "open")}
          testID="invite-uses"
        />
        <Text style={[styles.hint, { color: palette.ink3 }]} testID="invite-uses-means">
          {inviteUsesMeans(uses)}
        </Text>
      </Choice>
      <View style={styles.make}>
        {/* The demo's workspace lives on this phone: a link made in it leads nowhere (ADR 0213). */}
        {demo ? (
          <NotInDemo />
        ) : (
          <Button
            label="Make a link"
            variant="gold"
            busy={busy}
            disabled={busy}
            onPress={() => void make()}
          />
        )}
      </View>
      {error === undefined ? null : (
        <GroupFoot tone={palette.red} testID="invite-error">
          {error}
        </GroupFoot>
      )}
      {issued === undefined || gone.includes(issued.inviteId) ? null : (
        <Made
          key={issued.inviteId}
          issued={issued}
          snapshot={snapshot}
          selfId={selfId}
          workspace={workspace}
          onShown={onShown}
        />
      )}
    </>
  );
}

/**
 * The room a link names (ADR 0168): a space's own, from its sheet; or on You the one picked, for a
 * guest or a member, out of the rooms a link may name.
 */
function linkRoom(
  snapshot: Snapshot,
  selfId: string,
  space: { readonly id: string; readonly name: string } | undefined,
  role: WorkspaceRole,
  into: string | undefined,
) {
  const rooms = space === undefined ? inviteSpaces(snapshot.model, snapshot.directory, selfId) : [];
  const placed = SPACE_INVITE_ROLES.includes(role);
  const spaceId = space?.id ?? (placed ? into : undefined);
  const room = snapshot.model.spaces.find((each) => each.id === spaceId);
  const roomName =
    space?.name ?? (room === undefined ? undefined : spaceTitle(room, snapshot.directory, selfId));
  return { rooms, placed, spaceId, room, roomName };
}

/** The link just made, and under it the card it opens to. */
function Made({
  issued,
  snapshot,
  selfId,
  workspace,
  onShown,
}: {
  readonly issued: IssuedInvite;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly workspace: string;
  readonly onShown?: ((top: number) => void) | undefined;
}) {
  const room = issuedRoom(issued, snapshot, selfId);
  return (
    <>
      <Issued
        issued={issued}
        space={room}
        relayOff={!inviteOpensAnywhere(issued.url)}
        owner={myRole(snapshot.model, selfId) === "owner"}
        used={linkUsedWords(snapshot.model, snapshot.directory, issued)}
        onShown={onShown}
      />
      <GroupHeading>{"When they open it"}</GroupHeading>
      <JoinPreview
        directory={snapshot.directory}
        selfId={selfId}
        workspace={workspace}
        role={issued.role}
        spaceName={room}
      />
    </>
  );
}

/** The room a link just made brings them into, as the reader calls it. */
function issuedRoom(issued: IssuedInvite, snapshot: Snapshot, selfId: string): string | undefined {
  const room = snapshot.model.spaces.find((each) => each.id === issued.spaceId);
  return room === undefined ? undefined : spaceTitle(room, snapshot.directory, selfId);
}

/**
 * The rooms a link may bring somebody into (ADR 0209), as faces in a row that scrolls, No space
 * first: the one picked rides a ring and grows a touch. Off, and dimmed, for an admin's or an
 * owner's link, which names no room.
 */
function RoomPick({
  snapshot,
  selfId,
  rooms,
  chosen,
  off,
  onChoose,
}: {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly rooms: readonly Space[];
  readonly chosen: string | undefined;
  readonly off: boolean;
  readonly onChoose: (id: string | undefined) => void;
}) {
  const palette = usePalette();
  const pick = (id: string | undefined, face: ReactNode, name: string) => (
    <RoomChoice
      key={id ?? "none"}
      id={id}
      on={!off && id === chosen}
      off={off}
      name={name}
      onChoose={onChoose}
    >
      {face}
    </RoomChoice>
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel="Into"
      contentContainerStyle={styles.rooms}
      testID="invite-into"
    >
      {pick(undefined, <View style={[styles.noRoom, { borderColor: palette.ink4 }]} />, "No space")}
      {rooms.map((each) =>
        pick(
          each.id,
          <RowAvatar
            space={each}
            directory={snapshot.directory}
            title={spaceTitle(each, snapshot.directory, selfId)}
            icon={snapshot.spaceIcons.get(each.id)}
            size="md"
          />,
          spaceTitle(each, snapshot.directory, selfId),
        ),
      )}
    </ScrollView>
  );
}

/** One room in the picker, or No space: a ring and a touch bigger when it is the one. */
function RoomChoice({
  id,
  on,
  off,
  name,
  onChoose,
  children,
}: {
  readonly id: string | undefined;
  readonly on: boolean;
  readonly off: boolean;
  readonly name: string;
  readonly onChoose: (id: string | undefined) => void;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: off }}
      accessibilityLabel={name}
      disabled={off}
      onPress={() => {
        if (on) return;
        feel.tick();
        onChoose(id);
      }}
      style={[
        styles.room,
        {
          borderColor: on ? palette.accent : "transparent",
          backgroundColor: on ? palette.surface : "transparent",
          opacity: off ? 0.35 : 1,
        },
      ]}
      testID={`into-${id ?? "none"}`}
    >
      <RoomFace on={on}>{children}</RoomFace>
      <Text
        numberOfLines={1}
        style={[
          styles.roomName,
          { color: on ? palette.ink : palette.ink2, fontWeight: on ? "600" : "400" },
        ]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

/** A room's face in the picker, popping a little bigger as it is picked. */
function RoomFace({ on, children }: { readonly on: boolean; readonly children: ReactNode }) {
  if (!on) return <>{children}</>;
  // The pop is the wrapper's, the scale the face's: one transform each, so neither overwrites.
  return (
    <PopIn key="on" delay={0}>
      <View style={styles.picked}>{children}</View>
    </PopIn>
  );
}

/** The link just made, shown once: a QR code for somebody beside you, Share… and Copy. */
function Issued({
  issued,
  space,
  relayOff,
  owner,
  used,
  onShown,
}: {
  readonly issued: IssuedInvite;
  readonly space: string | undefined;
  /**
   * The link isn't the relay's, so it opens only where the server's address does: the relay is
   * off, or was never turned on (ADR 0245).
   */
  readonly relayOff: boolean;
  /** An owner, who can turn the relay on from here. */
  readonly owner: boolean;
  /** Who used it up, for a link made once that somebody joined by: nothing left to do with it. */
  readonly used: string | undefined;
  readonly onShown?: ((top: number) => void) | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  const [copied, setCopied] = useState(false);
  // Told once: the card is laid out again as the words under it change.
  const told = useRef(false);
  const laid = (event: LayoutChangeEvent) => {
    if (told.current) return;
    told.current = true;
    onShown?.(event.nativeEvent.layout.y - styles.issued.marginTop);
  };
  const into = space === undefined ? "" : ` · into ${space}`;
  const what = (
    <Text style={[styles.issuedWhat, { color: palette.ink2 }]}>
      {ROLE_WORDS[issued.role]} · {issued.singleUse ? "once" : "by several"} ·{" "}
      {untilWords(issued.expiresAt)}
      {into}
    </Text>
  );
  if (used !== undefined) {
    return (
      <View style={[styles.issued, { backgroundColor: on.fill }]} testID="issued-invite">
        {what}
        <Text style={[styles.url, { color: palette.ink3 }]} testID="invite-url">
          {issued.url}
        </Text>
        <Text style={[styles.hint, { color: palette.ink2 }]} testID="invite-used">
          {used}.
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.issued, { backgroundColor: on.fill }]}
      onLayout={laid}
      testID="issued-invite"
    >
      <View style={styles.qr}>
        <QrCode text={issued.url} size={200} testID="invite-qr" />
        <Text style={[styles.hint, styles.centred, { color: palette.ink3 }]}>
          For somebody beside you: they scan it with Chips, on its first screen.
        </Text>
      </View>
      {what}
      <Text selectable style={[styles.url, { color: palette.ink }]} testID="invite-url">
        {issued.url}
      </Text>
      <WhereItOpens url={issued.url} relayOff={relayOff} owner={owner} />
      <View style={styles.pair}>
        <Button
          label="Share…"
          onPress={() => void shareText(inviteShareWords(issued.url))}
          style={styles.half}
        />
        <Button
          label={copied ? "Copied" : "Copy"}
          onPress={() => void Clipboard.setStringAsync(issued.url).then(() => setCopied(true))}
          style={styles.half}
        />
      </View>
      <Text style={[styles.hint, { color: palette.ink3 }]}>
        Shown once: only you have it. Withdraw it if it goes to the wrong person.
      </Text>
    </View>
  );
}

/**
 * Under the link, where it opens: only where the server's address does, with the relay offered to
 * an owner; or from anywhere, when it asks the maker to allow whoever opens it (ADR 0232).
 */
function WhereItOpens({
  url,
  relayOff,
  owner,
}: {
  readonly url: string;
  readonly relayOff: boolean;
  readonly owner: boolean;
}) {
  const router = useRouter();
  const palette = usePalette();
  if (!relayOff) {
    return (
      <Text style={[styles.hint, styles.centred, { color: palette.ink3 }]} testID="invite-asks">
        {INVITE_ASKS_WORDS}
      </Text>
    );
  }
  return (
    <>
      <Text
        style={[styles.hint, styles.centred, { color: palette.ink3 }]}
        testID="invite-relay-off"
      >
        {inviteRelayOffWords(url)}
      </Text>
      {owner ? (
        <Button
          label={INVITE_TURN_ON_RELAY}
          variant="plain"
          onPress={() => router.push("/relay")}
          testID="invite-turn-on-relay"
        />
      ) : null}
    </>
  );
}

/** A labelled control, as the mock has them: the label over it, small. */
function Choice({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.choice}>
      <Text style={[styles.label, { color: palette.ink3 }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.4,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  warn: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, paddingHorizontal: SPACE.lg },
  choice: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, gap: SPACE.xs },
  label: { fontSize: TEXT.sm, paddingHorizontal: SPACE.xs },
  hint: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.35, paddingHorizontal: SPACE.xs },
  make: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg },
  issued: {
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    borderRadius: RADIUS.xxl,
    padding: SPACE.md,
    gap: SPACE.sm,
  },
  issuedWhat: { fontSize: TEXT.sm },
  url: { fontSize: TEXT.sm, fontFamily: "Menlo" },
  pair: { flexDirection: "row", gap: SPACE.sm },
  half: { flex: 1 },
  qr: { alignItems: "center", gap: SPACE.sm, paddingVertical: SPACE.sm },
  centred: { textAlign: "center" },
  rooms: { gap: SPACE.xs, paddingVertical: 2 },
  room: {
    width: 72,
    alignItems: "center",
    gap: SPACE.xs,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xs,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
  },
  roomName: { fontSize: TEXT.xs, maxWidth: 64 },
  noRoom: { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderStyle: "dashed" },
  picked: { transform: [{ scale: 1.08 }] },
});
