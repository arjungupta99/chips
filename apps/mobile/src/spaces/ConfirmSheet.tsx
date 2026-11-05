/**
 * The sheet that asks before a room is archived or deleted (22 September 2026, Arjun: "Upon
 * selection I should be presented with a confirmation screen"), before a harness is removed from
 * its profile (ADR 0078), and before an agent is archived or deleted (ADR 0095), each of which
 * puts what it asks about where the room goes.
 *
 * The room is on it — its face, its name, the last thing said — because a swipe is quick and a
 * list is long, and the one question worth a second look is *which one*. Then what will happen,
 * in the words core gives the desktop too (`archiveAsking`, `eraseAsking`), and two buttons:
 * the act, filled, and Cancel under it. Delete's is red and Archive's is the archive colour the
 * swipe showed, so the button under the thumb is the one the thumb chose. Cancel stays though the
 * sheet has its X (ADR 0169): a plain way out right under a red button is the point of asking.
 *
 * Delete waits for the server — the room goes only when it is gone — and says why, in red, if
 * the server will not; the sheet stays up with its reason rather than closing on nothing.
 * Archive is an event like any other and closes the sheet at once.
 */

import type { Asking } from "@chipschat/core";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button } from "../ui/Button";
import type { SheetFrom } from "../ui/beside";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { CLOSE_ROOM, Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/** What the button says and is painted with, and whether the server is being asked. */
export interface Confirming {
  readonly asking: Asking;
  /** The fill behind the button's word: the swipe's colour for the same act. */
  readonly tone: string;
  /** The word's colour on that fill: white unless the fill is light, as gold is. */
  readonly ink?: string | undefined;
  readonly busy: boolean;
  /** Why the server would not, when it would not. */
  readonly failed?: string | undefined;
}

export function ConfirmSheet({
  open,
  onClose,
  onGone,
  room,
  confirming,
  onConfirm,
  too,
  from,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onGone: () => void;
  /** The room as its row draws it: its face, its name and the line under it. */
  readonly room: Who;
  readonly confirming: Confirming;
  readonly onConfirm: () => void;
  /**
   * The switch a delete offers: a room's one agent going in its harness too (ADR 0087, rule 5),
   * or an agent's room going with it (ADR 0095). Its words are the asking's; whether it is on is
   * the caller's.
   */
  readonly too?: Too | undefined;
  /** What asked: on an iPad the sheet opens beside it. */
  readonly from?: SheetFrom | undefined;
}) {
  return (
    <Sheet
      open={open}
      onClose={confirming.busy ? () => undefined : onClose}
      closable={!confirming.busy}
      onGone={onGone}
      from={from}
      testID="confirm-sheet"
    >
      <ConfirmBody
        room={room}
        confirming={confirming}
        onConfirm={onConfirm}
        onCancel={onClose}
        too={too}
      />
    </Sheet>
  );
}

/** What the asking is about, as its row draws it: a face, a name and the line under it. */
export interface Who {
  readonly face: ReactNode;
  readonly name: string;
  readonly last: string;
}

type Too = { readonly on: boolean; readonly onChange: (on: boolean) => void };

/**
 * A word the act goes with, typed under why it is asked for: the name to join under when the one
 * you go by is taken there (ADR 0197). The keys' own button is the act's, and a blank one stops it.
 */
export interface Field {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly testID: string;
}

/**
 * What the sheet holds, for a sheet whose words change while it is up: an invite opened on a phone
 * already in a workspace reads the link first and asks after (`pairing/JoinSheet.tsx`).
 */
export function ConfirmBody({
  room,
  confirming,
  onConfirm,
  onCancel,
  cancel = "Cancel",
  too,
  field,
}: {
  readonly room: Who;
  readonly confirming: Confirming;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** The word under the act: "Cancel", or what staying is called ("Stay in Demo"). */
  readonly cancel?: string;
  readonly too?: Too | undefined;
  readonly field?: Field | undefined;
}) {
  const palette = usePalette();
  const on = useGround();
  const { asking, tone, busy, failed } = confirming;
  const words = asking.agentToo ?? asking.roomToo ?? asking.agentsToo ?? asking.roomsToo;
  const ink = confirming.ink ?? "#ffffff";
  const blank = blankIn(field);
  return (
    <>
      <View style={[styles.who, { backgroundColor: on.fill }]}>
        {room.face}
        <View style={styles.whoWords}>
          <Text style={[styles.whoName, { color: palette.ink }]} numberOfLines={1}>
            {room.name}
          </Text>
          {room.last === "" ? null : (
            <Text style={[styles.whoLast, { color: palette.ink3 }]} numberOfLines={1}>
              {room.last}
            </Text>
          )}
        </View>
      </View>
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {asking.title}
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>{asking.body}</Text>
      {asking.note === undefined ? null : (
        <Text style={[styles.note, { color: palette.ink3 }]}>{asking.note}</Text>
      )}
      <TooSwitch words={words} too={too} busy={busy} />
      {failed === undefined ? null : (
        <View style={[styles.failed, { backgroundColor: palette.redSoft }]} testID="confirm-failed">
          <Icon name="alert" size={17} color={palette.redInk} />
          <Text style={[styles.failedWords, { color: palette.redInk }]}>{failed}</Text>
        </View>
      )}
      {field === undefined ? null : <Typed field={field} busy={busy} onSubmit={onConfirm} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={asking.confirm}
        accessibilityState={{ busy, disabled: busy || blank }}
        disabled={busy || blank}
        onPress={onConfirm}
        testID="confirm-go"
        style={({ pressed }) => [
          styles.go,
          { backgroundColor: tone, opacity: goOpacity(pressed, blank) },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={ink} />
        ) : (
          <Text style={[styles.goWord, { color: ink }]}>{asking.confirm}</Text>
        )}
      </Pressable>
      <Button label={cancel} onPress={onCancel} disabled={busy} style={styles.cancel} />
    </>
  );
}

/** Whether the act waits on a word not typed yet. */
function blankIn(field: Field | undefined): boolean {
  return field !== undefined && field.value.trim() === "";
}

/** The act's fill: dimmed while it waits on a word, a shade lighter under the thumb. */
function goOpacity(pressed: boolean, blank: boolean): number {
  if (blank) return 0.45;
  return pressed ? 0.82 : 1;
}

/** The switch a delete offers, and what it means as it stands; nothing when it offers none. */
function TooSwitch({
  words,
  too,
  busy,
}: {
  readonly words: { readonly label: string; readonly on: string; readonly off: string } | undefined;
  readonly too: Too | undefined;
  readonly busy: boolean;
}) {
  const palette = usePalette();
  const on = useGround();
  if (words === undefined || too === undefined) return null;
  return (
    <>
      <View style={[styles.too, { backgroundColor: on.fill }]}>
        <Text style={[styles.tooWords, { color: palette.ink }]}>{words.label}</Text>
        <Switch
          value={too.on}
          onValueChange={too.onChange}
          disabled={busy}
          accessibilityLabel={words.label}
          testID="confirm-too"
        />
      </View>
      <Text style={[styles.note, { color: palette.ink3 }]} testID="confirm-too-words">
        {too.on ? words.on : words.off}
      </Text>
    </>
  );
}

/** The word typed, up as it comes (the keys with it); the keys' Join is the act's. */
function Typed({
  field,
  busy,
  onSubmit,
}: {
  readonly field: Field;
  readonly busy: boolean;
  readonly onSubmit: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <TextInput
      accessibilityLabel={field.label}
      placeholder={field.label}
      placeholderTextColor={palette.ink3}
      value={field.value}
      onChangeText={field.onChange}
      onSubmitEditing={() => {
        if (!blankIn(field)) onSubmit();
      }}
      submitBehavior="submit"
      returnKeyType="join"
      autoFocus
      autoCapitalize="words"
      autoComplete="name"
      textContentType="name"
      autoCorrect={false}
      maxLength={120}
      editable={!busy}
      testID={field.testID}
      style={[styles.field, { backgroundColor: on.fill, color: palette.ink }]}
    />
  );
}

const styles = StyleSheet.create({
  who: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.xxl,
    marginTop: SPACE.sm,
    marginBottom: SPACE.lg,
    // Short of the sheet's X, at the right of this line.
    marginRight: CLOSE_ROOM,
  },
  whoWords: { flex: 1, gap: 1 },
  whoName: { fontSize: TEXT.md, fontWeight: "600" },
  whoLast: { fontSize: TEXT.sm },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", letterSpacing: -0.3, marginBottom: SPACE.xs },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.45 },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45, marginTop: SPACE.sm },
  failed: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    marginTop: SPACE.md,
  },
  failedWords: { flex: 1, fontSize: TEXT.sm, fontWeight: "600" },
  field: {
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    minHeight: 50,
    fontSize: TEXT.body,
    marginTop: SPACE.md,
  },
  // A thumb's height and then some: the act a whole sheet was put up to ask about.
  go: {
    minHeight: 52,
    borderRadius: RADIUS.xl,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.xl,
  },
  goWord: { color: "#ffffff", fontSize: TEXT.body, fontWeight: "600" },
  too: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    marginTop: SPACE.lg,
  },
  tooWords: { flex: 1, fontSize: TEXT.md, fontWeight: "500" },
  cancel: { marginTop: SPACE.sm },
});
