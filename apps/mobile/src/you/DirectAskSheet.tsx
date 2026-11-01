/**
 * A guest asks to go direct (ADR 0211, Phase 3), on an owner's phone: who asks and how slow the
 * relay is for them, how to share the server in Tailscale, a field for Tailscale's invite link,
 * what sharing gives them, and Send. Chips carries the link to the guest; the share itself is made
 * in Tailscale.
 *
 * It opens for the oldest ask waiting that this phone has not shown (core's `nextDirectAsk`), to
 * an owner alone: from the read the store makes at each hello and whenever the app comes back to
 * the front, and from the push, tapped or arriving while the app is open. One at a time; once it
 * is put away, the next.
 *
 * A link kept for the next guest fills the field. Once the field holds Tailscale's link, "Give
 * this same link to the next guest" is offered, ticked (Arjun's pick); off, the kept one is
 * forgotten. After Send the sheet says it went, and the owner hears by a push when the guest is
 * direct.
 */

import {
  askTitle,
  askTripWords,
  type Device,
  type DirectAsk,
  KEEP_LINK_FOOT,
  KEEP_LINK_LABEL,
  myRole,
  nameOf,
  nextDirectAsk,
  type Store,
  sharedWords,
  shareHowWords,
  sharerOf,
  shareWarning,
  TAILSCALE_MACHINES,
} from "@chipschat/core";
import { shareLinkOf } from "@chipschat/protocol";
import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useSnapshot } from "../store/provider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useMachine } from "./ConnectionPage";

/** Mounted once, wherever the app is: the sheet for the next ask an owner may answer. */
export function DirectAsks({ store, device }: { readonly store: Store; readonly device: Device }) {
  const snapshot = useSnapshot(store);
  const selfId = device.participantId;
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [up, setUp] = useState(false);
  const owner = myRole(snapshot.model, selfId) === "owner";
  const next = owner ? nextDirectAsk(snapshot.directAsks, shown) : undefined;
  // Back in front: an ask that came while the app was away, its push silenced or missed.
  useEffect(() => {
    if (!owner) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void store.readDirectAsks().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [owner, store]);
  useEffect(() => {
    if (open !== undefined || next === undefined) return;
    setOpen(next.askId);
    setShown((before) => new Set(before).add(next.askId));
    setUp(true);
  }, [open, next]);
  const ask = open === undefined ? undefined : snapshot.directAsks?.get(open);
  if (ask === undefined) return null;
  return (
    <DirectAskSheet
      open={up}
      ask={ask}
      name={nameOf(snapshot.directory, ask.participantId)}
      sharer={sharerOf(ask, snapshot.directory)}
      byMe={ask.sharedBy === selfId}
      kept={snapshot.keptShareLink}
      device={device}
      store={store}
      onClose={() => setUp(false)}
      onGone={() => setOpen(undefined)}
    />
  );
}

export function DirectAskSheet({
  open,
  ask,
  name,
  sharer,
  byMe,
  kept,
  device,
  store,
  onClose,
  onGone,
}: {
  readonly open: boolean;
  readonly ask: DirectAsk;
  /** Who asks, by name. */
  readonly name: string;
  /** The owner who answered, by name, once one has. */
  readonly sharer: string | undefined;
  readonly byMe: boolean;
  /** The link kept for the next guest, which fills the field. */
  readonly kept: string | undefined;
  /** This phone in the workspace, for the server's machine by name. */
  readonly device: Device;
  readonly store: Store;
  readonly onClose: () => void;
  readonly onGone: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const machine = useMachine(store, device);
  const [typed, setTyped] = useState(kept ?? "");
  const [keep, setKeep] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const link = shareLinkOf(typed);
  const send = () => {
    if (link === undefined) return;
    setBusy(true);
    setFailed(undefined);
    store
      .shareDirect(ask.askId, link, keep)
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };
  const answered = ask.state !== "asked";
  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      closable={!busy}
      onGone={onGone}
      keyboard
      testID="direct-ask-sheet"
    >
      <View style={styles.head}>
        <Avatar name={name} kind="person" size="lg" />
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
          {askTitle(name)}
        </Text>
        <Text style={[styles.sub, { color: palette.ink3 }]}>{askTripWords(ask.tripMs)}</Text>
      </View>
      {answered ? (
        <Answered words={sharedWords(name, sharer, byMe)} />
      ) : (
        <View style={styles.body}>
          <Text style={[styles.help, { color: palette.ink2 }]}>{shareHowWords(machine)}</Text>
          <Button
            label="Open Tailscale"
            variant="plain"
            icon="goTo"
            onPress={() => void Linking.openURL(TAILSCALE_MACHINES)}
          />
          <TextInput
            style={[
              styles.field,
              { color: palette.ink, backgroundColor: on.fill, borderColor: palette.line },
            ]}
            testID="direct-ask-link"
            accessibilityLabel="Tailscale's invite link"
            value={typed}
            onChangeText={setTyped}
            placeholder="https://login.tailscale.com/…"
            placeholderTextColor={palette.ink3}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            editable={!busy}
          />
          {link === undefined ? null : (
            <View style={[styles.card, { backgroundColor: on.fill }]}>
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: palette.ink }]}>{KEEP_LINK_LABEL}</Text>
                <Switch
                  testID="direct-ask-keep"
                  accessibilityLabel={KEEP_LINK_LABEL}
                  value={keep}
                  disabled={busy}
                  onValueChange={setKeep}
                />
              </View>
              <Text style={[styles.foot, { color: palette.ink3 }]}>{KEEP_LINK_FOOT}</Text>
            </View>
          )}
          <Text style={[styles.warning, { color: palette.ink3 }]} testID="direct-ask-warning">
            {shareWarning(machine)}
          </Text>
          {failed === undefined ? null : (
            <Text
              style={[styles.failed, { color: palette.redInk, backgroundColor: palette.redSoft }]}
            >
              {failed}
            </Text>
          )}
          <Button
            label={`Send to ${name}`}
            variant="gold"
            busy={busy}
            disabled={link === undefined}
            onPress={send}
          />
        </View>
      )}
    </Sheet>
  );
}

/** After the ask is answered: sent, or answered by another owner first. The X closes it. */
function Answered({
  words,
}: {
  readonly words: { readonly title: string; readonly line: string };
}) {
  const palette = usePalette();
  return (
    <View style={styles.done} testID="direct-ask-answered" accessibilityLiveRegion="polite">
      <View style={[styles.tick, { backgroundColor: palette.green }]}>
        <Text style={styles.tickMark}>✓</Text>
      </View>
      <Text style={[styles.doneTitle, { color: palette.ink }]}>{words.title}</Text>
      <Text style={[styles.help, styles.center, { color: palette.ink3 }]}>{words.line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: SPACE.xs, marginTop: SPACE.xs, marginBottom: SPACE.md },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", textAlign: "center", marginTop: SPACE.xs },
  sub: { fontSize: TEXT.sm, textAlign: "center" },
  body: { gap: SPACE.md },
  help: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  center: { textAlign: "center" },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
    fontSize: TEXT.md,
  },
  card: { borderRadius: RADIUS.lg, overflow: "hidden", padding: SPACE.md, gap: SPACE.xs },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  rowLabel: { flex: 1, fontSize: TEXT.md, fontWeight: "500" },
  foot: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  warning: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  failed: {
    padding: SPACE.sm,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    fontSize: TEXT.sm,
    fontWeight: "600",
  },
  done: { alignItems: "center", gap: SPACE.sm, paddingVertical: SPACE.xl },
  tick: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  tickMark: { color: "#ffffff", fontSize: 32, fontWeight: "700" },
  doneTitle: { fontSize: TEXT.xl, fontWeight: "700" },
});
