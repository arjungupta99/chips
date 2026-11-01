/**
 * Something asks to join (ADR 0122), on the phone: the mock's §3 sheet. Who is asking, from where,
 * the code to compare with the one it printed, what it asks to do — each a switch, on, for the
 * person to turn off what they won't grant — and Allow, or Don't allow.
 *
 * It opens for the oldest request waiting that this phone has not shown, to an owner or admin
 * (core's `nextJoinAsk`): from the `join` frame while the app is open, and from the read the store
 * makes at each hello, which is what a tap on the push brings about. One at a time; once it is
 * put away, the next. After Allow it says when the harness has collected its key.
 *
 * A device is paired as the person who allows it, or, from an owner, as somebody already here
 * whose phone is new (ADR 0206): the phone a reinstall left on Welcome asks to join over the Wi-Fi,
 * and is let back in as the person it was.
 *
 * A link that asks (ADR 0232) opens it too, on the phones of the one person who handed the link
 * out: "Priya is asking to join Japan trip", with the six digits her screen shows. They compare,
 * and Allow or not; nothing is typed.
 */

import {
  administers,
  allowArgs,
  type JoinRequest,
  type LinkAskWords,
  linkAskWords,
  myRole,
  nameOf,
  nextJoinAsk,
  type PairAsChoice,
  pairAsChoices,
  pairedAsWords,
  type Snapshot,
  type Store,
  switchesFor,
} from "@chipschat/core";
import { isLinkKind, pairingCode, pairingCodeTyped } from "@chipschat/protocol";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSnapshot } from "../store/provider";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";

/** Mounted once, wherever the app is: the sheet for the next request this person may decide. */
export function JoinAsks({ store, selfId }: { readonly store: Store; readonly selfId: string }) {
  const snapshot = useSnapshot(store);
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [up, setUp] = useState(false);
  const next = nextJoinAsk(snapshot.joins, shown, administers(myRole(snapshot.model, selfId)));
  useEffect(() => {
    if (open !== undefined || next === undefined) return;
    setOpen(next.requestId);
    setShown((before) => new Set(before).add(next.requestId));
    setUp(true);
  }, [open, next]);
  const request = open === undefined ? undefined : snapshot.joins?.get(open);
  if (request === undefined) return null;
  return (
    <JoinSheet
      open={up}
      request={request}
      snapshot={snapshot}
      store={store}
      selfId={selfId}
      onClose={() => setUp(false)}
      onGone={() => setOpen(undefined)}
    />
  );
}

export function JoinSheet({
  open,
  request,
  snapshot,
  store,
  selfId,
  onClose,
  onGone,
}: {
  readonly open: boolean;
  readonly request: JoinRequest;
  readonly snapshot: Snapshot;
  readonly store: Store;
  /** Who is deciding: a device is paired as them unless an owner picks somebody else. */
  readonly selfId?: string | undefined;
  readonly onClose: () => void;
  readonly onGone: () => void;
}) {
  const [granted, setGranted] = useState<readonly string[]>(request.wants);
  const { choices, as, setAs } = usePairAs(request, snapshot, selfId);
  // For a device: the code it shows, typed here (SEC-6).
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [decided, setDecided] = useState(false);
  const device = request.kind === "device";
  const name = request.name ?? (device ? "A device" : "A harness");
  const where = [request.software, request.machine, request.fromAddr].filter(
    (each): each is string => each !== undefined,
  );
  // A link's request says who asks to join what, and the six digits to compare (ADR 0232).
  const words = isLinkKind(request.kind)
    ? linkAskWords(request, {
        spaces: snapshot.model.spaces,
        workspaceName: snapshot.workspaceName,
        pairAsName: pairedName(request, snapshot),
      })
    : undefined;
  const decide = async (allow: boolean) => {
    setBusy(true);
    setFailed(undefined);
    try {
      if (allow) await store.allowJoin(...allowArgs(request, granted, code, as, selfId));
      else await store.denyJoin(request.requestId);
      setDecided(true);
      if (!allow) onClose();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const asking = !decided && request.state === "waiting";
  return (
    <Sheet
      open={open}
      onClose={busy ? () => undefined : onClose}
      closable={!busy}
      onGone={onGone}
      testID="join-sheet"
    >
      {asking ? (
        <>
          <Head request={request} name={name} where={where} words={words} />
          <Asking
            request={request}
            name={name}
            words={words}
            granted={granted}
            code={code}
            busy={busy}
            failed={failed}
            onGrant={setGranted}
            onCode={setCode}
            onDecide={(allow) => void decide(allow)}
            choices={choices}
            as={as}
            onAs={setAs}
          />
        </>
      ) : (
        <Decided request={request} name={name} pairedAs={pairedName(request, snapshot)} />
      )}
    </Sheet>
  );
}

/**
 * Whom a device that asks may be paired as (ADR 0206): the one deciding, picked, and for an owner
 * everybody else here too. Nothing to pick for a harness.
 */
function usePairAs(request: JoinRequest, snapshot: Snapshot, selfId: string | undefined) {
  const choices =
    selfId === undefined || request.kind !== "device"
      ? []
      : pairAsChoices(snapshot.model, snapshot.directory, selfId);
  const [as, setAs] = useState<string | undefined>(selfId);
  return { choices, as, setAs };
}

/** Whom a device was paired as, by name, when an owner chose somebody else (ADR 0206). */
function pairedName(request: JoinRequest, snapshot: Snapshot): string | undefined {
  return request.pairAs === undefined ? undefined : nameOf(snapshot.directory, request.pairAs);
}

/** Who is asking, and from where; for a link's request, to join what, and as what. */
function Head({
  request,
  name,
  where,
  words,
}: {
  readonly request: JoinRequest;
  readonly name: string;
  readonly where: readonly string[];
  readonly words?: LinkAskWords | undefined;
}) {
  const palette = usePalette();
  const line = words === undefined ? where.join(" · ") : words.line;
  return (
    <View style={styles.head}>
      <Avatar name={name} kind={request.kind === "harness" ? "harness" : "person"} size="lg" />
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        {words?.title ?? `${name} wants to ${request.kind === "device" ? "pair" : "join"}`}
      </Text>
      {line === "" ? null : (
        <Text style={[styles.where, { color: palette.ink3 }]} testID="join-line">
          {line}
        </Text>
      )}
    </View>
  );
}

/** A link's six digits, to compare with the joining screen's, and what to check (ADR 0232). */
function LinkCode({ words }: { readonly words: LinkAskWords }) {
  const palette = usePalette();
  const on = useGround();
  return (
    <>
      <Text style={[styles.label, { color: palette.ink3 }]}>{words.shows}</Text>
      <Text
        style={[styles.code, styles.codeShown, { color: palette.ink, backgroundColor: on.fill }]}
        testID="join-code"
      >
        {words.code}
      </Text>
      <Text style={[styles.help, styles.center, { color: palette.ink3 }]} testID="join-check">
        {words.check}
      </Text>
    </>
  );
}

/**
 * The question: a harness's code to compare, or a device's to type (SEC-6), the switches, and the
 * two answers. Allow waits for a device's code to be a code.
 */
function Asking({
  request,
  name,
  words,
  granted,
  code,
  busy,
  failed,
  onGrant,
  onCode,
  onDecide,
  choices,
  as,
  onAs,
}: {
  readonly request: JoinRequest;
  readonly name: string;
  /** A link's request (ADR 0232): the code is shown to compare, not typed. */
  readonly words?: LinkAskWords | undefined;
  readonly granted: readonly string[];
  readonly code: string;
  readonly busy: boolean;
  readonly failed: string | undefined;
  readonly onGrant: (granted: readonly string[]) => void;
  readonly onCode: (code: string) => void;
  readonly onDecide: (allow: boolean) => void;
  /** Who a device may be paired as: the one deciding first; more than one only for an owner. */
  readonly choices: readonly PairAsChoice[];
  readonly as: string | undefined;
  readonly onAs: (id: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const switches = switchesFor(request);
  const device = request.kind === "device";
  const ready = !device || pairingCode.safeParse(pairingCodeTyped(code)).success;
  return (
    <>
      <CodeToCheck
        request={request}
        name={name}
        words={words}
        code={code}
        busy={busy}
        onCode={onCode}
      />
      {switches.length === 0 ? null : (
        <>
          <Text style={[styles.label, { color: palette.ink3 }]}>It asks to</Text>
          <View style={[styles.card, { backgroundColor: on.fill }]}>
            {switches.map((each, at) => (
              <View
                key={each.name}
                style={[styles.row, at > 0 && { borderTopColor: palette.line, ...styles.rule }]}
                testID={`join-cap-${each.name}`}
              >
                <View style={styles.rowWords}>
                  <Text style={[styles.rowLabel, { color: palette.ink }]}>{each.label}</Text>
                  {each.detail === undefined ? null : (
                    <Text style={[styles.rowDetail, { color: palette.ink3 }]}>{each.detail}</Text>
                  )}
                </View>
                <Switch
                  value={granted.includes(each.name)}
                  disabled={busy}
                  accessibilityLabel={each.label}
                  onValueChange={(on) =>
                    onGrant(on ? [...granted, each.name] : granted.filter((g) => g !== each.name))
                  }
                />
              </View>
            ))}
          </View>
        </>
      )}
      {choices.length > 1 ? (
        <>
          <Text style={[styles.label, { color: palette.ink3 }]}>Pair it as</Text>
          <View style={[styles.card, { backgroundColor: on.fill }]} testID="join-pair-as">
            {choices.map((each, at) => {
              const picked = each.id === as;
              return (
                <Pressable
                  key={each.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: picked, disabled: busy }}
                  accessibilityLabel={each.label}
                  disabled={busy}
                  onPress={() => onAs(each.id)}
                  testID={`join-as-${each.id}`}
                  style={[styles.row, at > 0 && { borderTopColor: palette.line, ...styles.rule }]}
                >
                  <Avatar name={each.name} kind="person" size="xs" decorative />
                  <Text style={[styles.rowLabel, styles.rowWords, { color: palette.ink }]}>
                    {each.label}
                  </Text>
                  {picked ? <Icon name="check" size={20} color={palette.blue} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
      {words === undefined ? (
        <Text style={[styles.help, { color: palette.ink3 }]} testID="join-paired-words">
          {device
            ? pairedAsWords(choices, as)
            : "Every agent can talk in the spaces it's in, and asks you before anything risky."}
        </Text>
      ) : null}
      {failed === undefined ? null : (
        <Text style={[styles.failed, { color: palette.redInk, backgroundColor: palette.redSoft }]}>
          {failed}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Allow"
        accessibilityState={{ busy, disabled: busy || !ready }}
        disabled={busy || !ready}
        onPress={() => onDecide(true)}
        testID="join-allow"
        style={({ pressed }) => [
          styles.allow,
          { backgroundColor: palette.gold, opacity: !ready ? 0.45 : pressed ? 0.82 : 1 },
        ]}
      >
        {busy ? <ActivityIndicator color="#231a00" /> : <Text style={styles.allowWord}>Allow</Text>}
      </Pressable>
      <Button
        label="Don't allow"
        onPress={() => onDecide(false)}
        disabled={busy}
        style={styles.deny}
      />
    </>
  );
}

/** The code to check: a link's six digits, a device's to type (SEC-6), or a harness's printed one. */
function CodeToCheck({
  request,
  name,
  words,
  code,
  busy,
  onCode,
}: {
  readonly request: JoinRequest;
  readonly name: string;
  readonly words?: LinkAskWords | undefined;
  readonly code: string;
  readonly busy: boolean;
  readonly onCode: (code: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  if (words !== undefined) return <LinkCode words={words} />;
  if (request.kind === "device") {
    return (
      <>
        <TextInput
          style={[
            styles.code,
            styles.codeField,
            { color: palette.ink, backgroundColor: on.fill, borderColor: palette.line },
          ]}
          testID="join-code-field"
          accessibilityLabel="The code on the device"
          value={code}
          onChangeText={(typed) => {
            onCode(typed);
            // A whole code typed: the keys go, so Pair it as and Allow are in sight (ADR 0206).
            if (pairingCode.safeParse(pairingCodeTyped(typed)).success) Keyboard.dismiss();
          }}
          returnKeyType="done"
          placeholder="ABC-234"
          placeholderTextColor={palette.ink3}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="one-time-code"
          maxLength={7}
          editable={!busy}
        />
        <Text style={[styles.help, styles.center, { color: palette.ink3 }]}>
          Type the code {name} shows.
        </Text>
      </>
    );
  }
  return (
    <>
      <Text
        style={[styles.code, { color: palette.ink, backgroundColor: on.fill }]}
        testID="join-code"
      >
        {request.code}
      </Text>
      <Text style={[styles.help, styles.center, { color: palette.ink3 }]}>
        Check it matches the code {name} printed.
      </Text>
    </>
  );
}

/** After the question: joined, collecting its key, or what happened elsewhere. The X closes it. */
function Decided({
  request,
  name,
  pairedAs,
}: {
  readonly request: JoinRequest;
  readonly name: string;
  /** Whom a device was paired as, when an owner chose somebody else (ADR 0206). */
  readonly pairedAs?: string | undefined;
}) {
  const palette = usePalette();
  const words = afterWords(request, name, pairedAs);
  return (
    <View style={styles.done} testID="join-decided" accessibilityLiveRegion="polite">
      {words.ok ? (
        <View style={[styles.tick, { backgroundColor: palette.green }]}>
          <Text style={styles.tickMark}>✓</Text>
        </View>
      ) : null}
      <Text style={[styles.doneTitle, { color: palette.ink }]}>{words.title}</Text>
      <Text style={[styles.help, styles.center, { color: palette.ink3 }]}>{words.line}</Text>
    </View>
  );
}

function afterWords(
  request: JoinRequest,
  name: string,
  pairedAs?: string,
): { ok: boolean; title: string; line: string } {
  switch (request.state) {
    case "redeemed":
      if (request.kind === "invite") {
        return { ok: true, title: `${name} joined`, line: "They're in People now." };
      }
      if (request.kind === "harness") {
        return { ok: true, title: `${name} joined`, line: "Its space is on your Spaces." };
      }
      return pairedAs === undefined
        ? { ok: true, title: `${name} is paired`, line: "It opens on your Spaces." }
        : { ok: true, title: `${name} is paired`, line: `It opens on ${pairedAs}'s Spaces.` };
    case "allowed":
      return {
        ok: true,
        title: "Allowed",
        line:
          request.kind === "invite"
            ? `${name} is on the way in.`
            : `${name} is collecting its key.`,
      };
    case "denied":
      return { ok: false, title: "Not allowed", line: "Somebody said no." };
    case "expired":
      return { ok: false, title: "It expired", line: "It can ask again." };
    default:
      return { ok: false, title: "Waiting", line: "" };
  }
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: SPACE.xs, marginTop: SPACE.xs, marginBottom: SPACE.xs },
  title: { fontSize: TEXT.xl + 2, fontWeight: "700", textAlign: "center", marginTop: SPACE.xs },
  where: { fontSize: TEXT.sm, textAlign: "center" },
  code: {
    marginTop: SPACE.md,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 2.4,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    fontFamily: "Menlo",
  },
  codeField: { borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: SPACE.md },
  codeShown: { marginTop: 0, letterSpacing: 4 },
  help: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4, marginTop: SPACE.sm },
  center: { textAlign: "center" },
  label: {
    fontSize: TEXT.sm,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: SPACE.lg,
    marginBottom: SPACE.xs,
    marginHorizontal: SPACE.xs,
  },
  card: { borderRadius: RADIUS.lg, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 52,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  rule: { borderTopWidth: StyleSheet.hairlineWidth },
  rowWords: { flex: 1, gap: 1 },
  rowLabel: { fontSize: TEXT.md, fontWeight: "500" },
  rowDetail: { fontSize: TEXT.sm },
  failed: {
    marginTop: SPACE.md,
    padding: SPACE.sm,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    fontSize: TEXT.sm,
    fontWeight: "600",
  },
  allow: {
    minHeight: 50,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACE.lg,
  },
  allowWord: { color: "#231a00", fontSize: TEXT.body, fontWeight: "600" },
  deny: { marginTop: SPACE.sm },
  done: { alignItems: "center", gap: SPACE.sm, paddingVertical: SPACE.xl },
  tick: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  tickMark: { color: "#ffffff", fontSize: 32, fontWeight: "700" },
  doneTitle: { fontSize: TEXT.xl, fontWeight: "700" },
});
