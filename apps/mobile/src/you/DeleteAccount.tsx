/**
 * Delete your account (ADR 0243), under Sign out at the foot of You: a sheet that says what goes
 * and what stays, and wakes Delete once the workspace's name is typed (Arjun's B). What goes is
 * the person's devices and their sign-ins, their face and, an owner's, the invites they made; what
 * stays is what they said, under their name, and the harnesses they connected, which an owner takes
 * on. Once the server has done it the workspace leaves this phone as after a sign-out, and a line
 * says so.
 *
 * The only owner is told how the workspace itself is deleted instead, in an alert: it is theirs,
 * on the computer it runs on, and nothing on a phone takes it away. The demo's made-up workspace
 * has no account to delete, and no row.
 *
 * Beside the list on an iPad what the sheet holds is a page, named in the pane's bar; Keep it goes
 * back to nothing open. The only owner's alert stays an alert.
 */

import {
  type DeleteAccountSheet,
  type Device,
  deleteAccountSheet,
  deleteAccountTyped,
  isDemo,
  type Store,
} from "@chipschat/core";
import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useLeave } from "../device/leave";
import { thisDevice } from "../device/word";
import { Button } from "../ui/Button";
import { GroupRow } from "../ui/Group";
import { useGround } from "../ui/ground";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { SheetPage, useSheetPage, type YouPages } from "./pages";

type Asked = Extract<DeleteAccountSheet, { kind: "delete" }>;

export function useDeleteAccount({
  device,
  store,
  workspace,
  others,
}: {
  readonly device: Device;
  readonly store: Store;
  /** The workspace's name, which is what is typed. */
  readonly workspace: string;
  /** How many other workspaces this phone holds, which stay. */
  readonly others: number;
}) {
  const leave = useLeave();
  const [asked, setAsked] = useState<Asked | undefined>(undefined);
  const [up, setUp] = useState(false);
  const page = useSheetPage("delete", () => setUp(true));
  const words = (devices?: number) => {
    const { model, directory } = store.getSnapshot();
    return deleteAccountSheet({
      model,
      directory,
      selfId: device.participantId,
      workspace,
      devices,
    });
  };
  const open = () => {
    const first = words();
    if (first.kind === "only_owner") {
      Alert.alert(first.title, first.body, [{ text: "OK" }]);
      return;
    }
    setAsked(first);
    page.onPress();
    // The count of devices is the server's, read once the sheet is up; the words wait for nothing.
    void store
      .devices()
      .then((held) => {
        const live = held.filter((each) => each.revokedAt === undefined).length;
        const counted = words(live);
        if (counted.kind === "delete") setAsked(counted);
      })
      .catch(() => undefined);
  };
  const deleted = async () => {
    const spaceIds = store.getSnapshot().model.spaces.map((space) => space.id);
    await leave(device, spaceIds);
    Alert.alert(
      `You've left ${workspace}`,
      others > 0
        ? `Your account there is deleted. Your other workspaces on ${thisDevice()} are as they were.`
        : "Your account there is deleted.",
      [{ text: "OK" }],
    );
  };
  const row = isDemo(device) ? null : (
    <GroupRow
      label="Delete your account"
      tone="danger"
      onPress={open}
      selected={page.selected}
      testID="delete-account"
    />
  );
  // Beside the list the page can be open before this has asked, when You is drawn again with it
  // open: it says the words, without the count of devices until it is asked again.
  const shown = asked ?? (page.selected === true && !isDemo(device) ? askable(words()) : undefined);
  const pages: YouPages = {
    delete:
      shown === undefined ? undefined : (
        <SheetPage title={shown.title} testID="delete-account-page">
          <DeleteAccountBody words={shown} store={store} onKeep={page.done} onDeleted={deleted} />
        </SheetPage>
      ),
  };
  const overlays =
    asked === undefined ? null : (
      <DeleteAccountSheetView
        open={up}
        words={asked}
        store={store}
        onClose={() => setUp(false)}
        onGone={() => setAsked(undefined)}
        onDeleted={deleted}
      />
    );
  return { row, overlays, pages };
}

const askable = (words: DeleteAccountSheet): Asked | undefined =>
  words.kind === "delete" ? words : undefined;

export function DeleteAccountSheetView({
  open,
  words,
  store,
  onClose,
  onGone,
  onDeleted,
}: {
  readonly open: boolean;
  readonly words: Asked;
  readonly store: Store;
  readonly onClose: () => void;
  readonly onGone: () => void;
  /** The server has done it: the workspace leaves this phone. */
  readonly onDeleted: () => Promise<void>;
}) {
  const form = useDeleteForm({ words, store, onKeep: onClose, onDeleted, titled: true });
  return (
    <Sheet
      open={open}
      onClose={form.busy ? () => undefined : onClose}
      closable={!form.busy}
      onGone={onGone}
      keyboard
      testID="delete-account-sheet"
    >
      {form.body}
    </Sheet>
  );
}

/** The same beside the list, under the pane's bar, which names it. */
function DeleteAccountBody(props: {
  readonly words: Asked;
  readonly store: Store;
  readonly onKeep: () => void;
  readonly onDeleted: () => Promise<void>;
}) {
  const form = useDeleteForm({ ...props, titled: false });
  return <View style={styles.page}>{form.body}</View>;
}

/**
 * What the sheet and the page hold: what goes and what stays, the name to type, and Delete, which
 * the sheet waits on before it may be closed.
 */
function useDeleteForm({
  words,
  store,
  onKeep,
  onDeleted,
  titled,
}: {
  readonly words: Asked;
  readonly store: Store;
  readonly onKeep: () => void;
  readonly onDeleted: () => Promise<void>;
  /** The sheet says its title over the rest; a page's bar says it. */
  readonly titled: boolean;
}) {
  const palette = usePalette();
  const on = useGround();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const ready = deleteAccountTyped(typed, words.typed);
  const remove = () => {
    if (!ready) return;
    setBusy(true);
    setFailed(undefined);
    store
      .deleteAccount()
      .then(onDeleted)
      .catch((error: unknown) => {
        setFailed(error instanceof Error ? error.message : String(error));
        setBusy(false);
      });
  };
  const body = (
    <View style={styles.body}>
      <View style={styles.head}>
        {titled ? (
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            {words.title}
          </Text>
        ) : null}
        <Text style={[styles.lead, { color: palette.ink2 }]}>{words.lead}</Text>
      </View>
      <View style={[styles.card, { backgroundColor: on.fill }]}>
        <Listed heading="Goes" lines={words.goes} dot={palette.red} testID="delete-goes" />
        <Listed heading="Stays" lines={words.stays} dot={palette.green} testID="delete-stays" />
      </View>
      <TextInput
        style={[
          styles.field,
          { color: palette.ink, backgroundColor: on.fill, borderColor: palette.line },
        ]}
        testID="delete-account-typed"
        accessibilityLabel={words.placeholder}
        value={typed}
        onChangeText={setTyped}
        placeholder={words.placeholder}
        placeholderTextColor={palette.ink3}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        editable={!busy}
      />
      {failed === undefined ? null : (
        <Text
          style={[styles.failed, { color: palette.redInk, backgroundColor: palette.redSoft }]}
          accessibilityLiveRegion="polite"
        >
          {failed}
        </Text>
      )}
      <Button
        label={words.confirm}
        variant="red"
        busy={busy}
        disabled={!ready}
        onPress={remove}
        testID="delete-account-confirm"
      />
      <Button label="Keep it" variant="plain" disabled={busy} onPress={onKeep} />
    </View>
  );
  return { busy, body };
}

/** Goes, or Stays: its heading, then a line for each, with a dot in its colour. */
function Listed({
  heading,
  lines,
  dot,
  testID,
}: {
  readonly heading: string;
  readonly lines: readonly string[];
  readonly dot: string;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <View testID={testID}>
      <Text style={[styles.heading, { color: palette.ink3 }]}>{heading}</Text>
      {lines.map((line, index) => (
        <View
          key={line}
          style={[
            styles.line,
            index === 0
              ? null
              : { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth },
          ]}
        >
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={[styles.words, { color: palette.ink }]}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.md },
  // A sheet keeps its own margin; a page's is a group's, so the card stands where a group would.
  page: { paddingHorizontal: SPACE.lg },
  head: { gap: SPACE.xs, marginTop: SPACE.xs },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700" },
  lead: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  card: { borderRadius: RADIUS.lg, overflow: "hidden", paddingBottom: SPACE.xs },
  heading: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.sm,
  },
  line: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  words: { flex: 1, fontSize: TEXT.md, lineHeight: TEXT.md * 1.35 },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    fontSize: TEXT.md,
  },
  failed: {
    padding: SPACE.sm,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    fontSize: TEXT.sm,
    fontWeight: "600",
  },
});
