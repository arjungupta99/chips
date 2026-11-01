/**
 * Joining by an invite on a phone that is in no workspace yet (ADR 0164): the card the web's
 * join page is, in the phone's hand. Who sent the link, to which workspace, as what and what that
 * role may do; a name; Join. The mark works while the link is read, through the relay when the
 * phone is off the server's network, and the card says which way it came.
 *
 * A link that was used, withdrawn or has lapsed says so and who to ask, with another paste or the
 * pairing screen to go on with.
 */

import {
  DEAD_INVITE,
  type Device,
  invitedWords,
  joinFacts,
  joinTitle,
  roleMeansFor,
} from "@chipschat/core";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { thisDevice } from "../device/word";
import { Button } from "../ui/Button";
import { ChipPulse } from "../ui/ChipPulse";
import { useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { type InviteOffer, troubleOf, useInvite } from "./useInvite";
import { usePasteInvite } from "./usePasteInvite";

export function JoinCard({
  offer,
  onJoined,
  onCancel,
}: {
  readonly offer: InviteOffer | undefined;
  /** Joined, with the space a space's link put them in (ADR 0168). */
  readonly onJoined: (device: Device, spaceId?: string) => void;
  /** Back where the card came from, or to the pairing screen when it came from nowhere. */
  readonly onCancel: () => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const { opened, join, retry } = useInvite(offer);

  if (opened.kind === "dead") return <Dead onCancel={onCancel} />;

  const invite = opened.kind === "ready" ? opened.invite : undefined;
  return (
    <View
      style={[styles.page, { backgroundColor: palette.bg, paddingTop: insets.top }]}
      testID="join-card"
    >
      <Cancel onPress={onCancel} />
      {/* The name is typed where the keys come up; the card scrolls it above them, on Android as
          on iOS (`automaticallyAdjustKeyboardInsets` is iOS's alone). */}
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.body, column, { paddingBottom: insets.bottom + SPACE.xl }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={SPACE.lg}
      >
        <View style={styles.head}>
          <Big>
            <ChipPulse
              gold={palette.gold}
              ink={palette.ink3}
              lit={palette.ink}
              working={opened.kind === "asking"}
            />
          </Big>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            {invite === undefined ? "An invite" : joinTitle(invite)}
          </Text>
          <Text style={[styles.invited, { color: palette.ink2 }]} testID="join-role">
            {invite === undefined ? "Reading the invite…" : invitedWords(invite)}
          </Text>
          {invite === undefined ? null : (
            <Text style={[styles.means, { color: palette.ink3 }]}>
              {roleMeansFor(invite.role, invite.spaceName)}
            </Text>
          )}
          {invite === undefined ? null : (
            // What a newcomer would ask before joining: what they'll find, and what they set up.
            <View style={styles.facts} testID="join-facts">
              {joinFacts(invite).map((fact) => (
                <Text key={fact} style={[styles.means, { color: palette.ink3 }]}>
                  {fact}
                </Text>
              ))}
            </View>
          )}
        </View>
        {opened.kind === "trouble" ? (
          <View style={styles.trouble}>
            <Text style={[styles.failed, { color: palette.red }]} testID="join-trouble">
              {opened.message}
            </Text>
            <Button label="Try again" onPress={retry} />
          </View>
        ) : (
          <JoinForm
            workspace={invite?.workspaceName}
            through={opened.kind === "ready" ? opened.through : undefined}
            join={join}
            onJoined={(device) => onJoined(device, invite?.spaceId)}
          />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** A name, and Join: open once the link has been read, and put right where it was typed. */
function JoinForm({
  workspace,
  through,
  join,
  onJoined,
}: {
  /** The workspace's name, once the link has been read; nothing to join until then. */
  readonly workspace: string | undefined;
  readonly through: "network" | "relay" | undefined;
  readonly join: (name: string) => Promise<Device>;
  readonly onJoined: (device: Device) => void;
}) {
  const palette = usePalette();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const field = useRef<TextInput>(null);
  const ready = workspace !== undefined && !busy;
  // The one thing to do is type a name: the cursor is there once the link has been read (JR-14).
  useEffect(() => {
    if (workspace !== undefined) field.current?.focus();
  }, [workspace]);

  const submit = () => {
    if (!ready || name.trim() === "") return;
    setBusy(true);
    setFailed(undefined);
    join(name)
      .then(onJoined)
      .catch((error: unknown) => {
        setFailed(troubleOf(error));
        setBusy(false);
        // A name somebody has is put right where it was typed (JR-1).
        field.current?.focus();
      });
  };

  return (
    <>
      <TextInput
        ref={field}
        accessibilityLabel="Your name"
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={palette.ink3}
        autoComplete="name"
        textContentType="name"
        autoCapitalize="words"
        returnKeyType="join"
        editable={ready}
        onSubmitEditing={submit}
        testID="join-name"
        style={[
          styles.input,
          { backgroundColor: palette.surface, borderColor: palette.line, color: palette.ink },
        ]}
      />
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.red }]} testID="join-failed">
          {failed}
        </Text>
      )}
      <Button
        label={busy ? "Joining…" : "Join"}
        variant="gold"
        onPress={submit}
        disabled={!ready || name.trim() === ""}
        busy={busy}
      />
      {through === "relay" ? (
        <Text style={[styles.note, { color: palette.ink3 }]} testID="join-through-relay">
          {`Through the relay: ${thisDevice()} isn't on the server's network.`}
        </Text>
      ) : null}
      <Text style={[styles.note, { color: palette.ink3 }]}>
        {`No password: ${thisDevice()} makes a key it keeps to itself, and the invite tells `}
        {workspace ?? "the workspace"} whose key it is.
      </Text>
    </>
  );
}

/** How much bigger than its inline twenty points the card's mark is. */
const MARK_SCALE = 2.6;

/** The mark at the size a card that is about one thing wears it, as the empty states do. */
export function Big({
  children,
  scale = MARK_SCALE,
}: {
  readonly children: ReactNode;
  readonly scale?: number;
}) {
  const box = 20 * scale;
  return (
    <View style={[styles.bigBox, { width: box, height: box }]}>
      <View style={{ transform: [{ scale }] }}>{children}</View>
    </View>
  );
}

function Cancel({ onPress }: { readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <View style={styles.nav}>
      <Pressable accessibilityRole="button" onPress={onPress} testID="join-cancel" hitSlop={12}>
        <Text style={[styles.navWord, { color: palette.blue }]}>Cancel</Text>
      </Pressable>
    </View>
  );
}

/** A link that can no longer let anybody in: why, who to ask, and two ways on. */
function Dead({ onCancel }: { readonly onCancel: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const { paste, problem } = usePasteInvite({ replace: true });
  return (
    <View
      style={[styles.page, { backgroundColor: palette.bg, paddingTop: insets.top }]}
      testID="join-dead"
    >
      <Cancel onPress={onCancel} />
      <View style={[styles.body, column]}>
        <View style={[styles.head, styles.deadHead]}>
          <Big>
            <ChipPulse
              gold={palette.surface3}
              ink={palette.ink4}
              lit={palette.ink3}
              working={false}
            />
          </Big>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
            {DEAD_INVITE.title}
          </Text>
          <Text style={[styles.invited, { color: palette.ink2 }]}>{DEAD_INVITE.body}</Text>
        </View>
        <Button label="Paste another link" variant="gold" onPress={paste} />
        {problem === undefined ? null : (
          <Text style={[styles.failed, { color: palette.red }]}>{problem}</Text>
        )}
        <Button label="Pair with your computer" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  bigBox: { alignItems: "center", justifyContent: "center" },
  nav: { height: 44, justifyContent: "center", paddingHorizontal: SPACE.lg },
  navWord: { fontSize: TEXT.body },
  body: { paddingHorizontal: SPACE.lg, gap: SPACE.md },
  head: { alignItems: "center", gap: SPACE.sm, paddingTop: SPACE.lg, paddingBottom: SPACE.md },
  deadHead: { paddingTop: SPACE.xxl },
  title: {
    fontSize: TEXT.xl + 6,
    fontWeight: "700",
    letterSpacing: -0.3,
    textAlign: "center",
    marginTop: SPACE.sm,
  },
  invited: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.42, textAlign: "center" },
  means: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.42, textAlign: "center" },
  facts: { marginTop: SPACE.sm, gap: SPACE.xs },
  input: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    minHeight: 50,
    fontSize: TEXT.body,
  },
  trouble: { gap: SPACE.md },
  failed: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.42 },
  note: { fontSize: TEXT.sm - 0.5, lineHeight: TEXT.sm * 1.42, textAlign: "center" },
});
