/**
 * One approval, in full: who wants what, the preview, the risks, how long is left, and the
 * decision — Approve with a scope, Edit the input first, Deny with a reason, or hand it to
 * somebody else.
 *
 * The room's card offers Approve and Deny at scope `once`, which is the thumb-sized version of
 * this screen. Everything wider than a thumb lives here: a scope beyond this one time is a
 * policy rule being written, an edit is words being changed, and neither belongs behind a
 * swipe.
 *
 * Drawn around what is being judged (ADR 0280): the question, large, and a command one part to a
 * line as Chips reads it (`CommandPlate`), in place of the command said twice, once cut off and
 * once as JSON. The answer is in a tray of glass at the foot, in thumb's reach (`Tray`), and the
 * screen scrolls under it. The time left is a ring beside the agent's face in the bar, which the
 * route draws (`timeInBar`); without it, it is a line here.
 *
 * An ask that matters (ADR 0195) wears "Waits for you" while it is open, and offers no scope: it
 * is answered once, and a line says why where the choices were. One the harness settled itself, as
 * its own window answered it, says so under its verdict: "Answered by Kit in its own tools."
 *
 * A yes beyond once on a command remembers how each part of it starts (ADR 0239): under Always the
 * words it keeps light up in the command, and an owner or admin picks every space (the default) or
 * this one. A command Chips can't read, or one that uses `rm` and the like, is answered once, and
 * the tray says why, naming the file a write goes to.
 *
 * For an hour (ADR 0239, addendum of 6 November 2026) is a yes given once that holds on: for the
 * hour, everything the agent asks in this space goes ahead without a card but what matters (ADR
 * 0281). The switch above the choices, Let it work, holds the same way until somebody stops it.
 */

import type { Approval, Directory, Lasting, PersonModel, Plate, Reach } from "@chipschat/core";
import {
  askMatters,
  askStanding,
  commandPlate,
  isAgent,
  mayAnswer,
  nameOf,
  offersLetWork,
  ownToolsWords,
  WHILE_MINUTES,
  waitsWords,
} from "@chipschat/core";
import { type ReactNode, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Choice } from "../ui/Choices";
import { Capsule } from "../ui/Glass";
import { Group, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import * as feel from "../ui/haptics";
import { Pill } from "../ui/Pill";
import { Risk } from "../ui/Risk";
import { useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { timeLeft } from "../ui/when";
import { lapseWords } from "../words";
import { Effect, Headline, Lasts } from "./Asked";
import { AskShown, saysLasts } from "./CommandPlate";
import { type Decided, type Mode, Tray, type TrayProps, type Where } from "./Tray";

/** How far a decision reaches, as it is sent. */
export type Scope = "once" | "session" | "always";

export interface DecisionInput {
  readonly decision: "approved" | "edited" | "denied";
  readonly scope: Scope;
  /** An Always kept for every space (ADR 0239). */
  readonly everywhere?: boolean | undefined;
  /** A yes that holds on in the space for this long (ADR 0239 addendum): For an hour. */
  readonly forMinutes?: number | undefined;
  /** A yes that holds on in the space until somebody stops it (ADR 0281): Let it work. */
  readonly untilStopped?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly updatedInput?: unknown;
}

export interface DecideProps {
  readonly approval: Approval;
  readonly harnessName: string;
  readonly directory: Directory;
  readonly selfId: string;
  readonly busy: boolean;
  readonly now: number;
  readonly onDecide: (input: DecisionInput) => void;
  readonly onHand: (to: string, reason: string | undefined) => void;
  /** Everyone this ask could be handed to, already assembled by `candidates`. */
  readonly handTo: readonly Choice[];
  readonly people: Readonly<Record<string, PersonModel>>;
  /** The harness that asked, so its own settlement is told from a lead's (ADR 0195). */
  readonly harnessId?: string | undefined;
  /** Whether this person may keep an Always for every space: an owner or admin (ADR 0239). */
  readonly mayEverywhere?: boolean | undefined;
  /** False when the server wouldn't keep For an hour or Let it work (ADR 0281): neither is offered. */
  readonly keepsHeldYes?: boolean | undefined;
  /** The space's name, for an Always kept to it: "go ahead without a card in Bakery". */
  readonly spaceName?: string | undefined;
  /** Whether the bar shows the time left, as a ring beside the face, so no line here says it. */
  readonly timeInBar?: boolean | undefined;
  /** The way to the ask's space, as a row beside Hand to…; absent where there is none to go to. */
  readonly onOpenSpace?: (() => void) | undefined;
  /** What the screen draws under the ask, at the end of what scrolls: why there is no space. */
  readonly under?: ReactNode;
}

/**
 * How far an Always reaches (ADR 0239): an owner's or admin's is kept for every space unless they
 * pick this one; anybody else's, for this space.
 */
function useReach(lasting: Lasting, mayEverywhere: boolean) {
  const [where, setWhere] = useState<Where>("everywhere");
  const everywhere = lasting === "always" && mayEverywhere && where === "everywhere";
  const reach: Reach = everywhere ? "everywhere" : "space";
  return { where, setWhere, everywhere, reach };
}

/**
 * The decision as it is sent: Always as a scope; For an hour and Let it work as a yes given once
 * that holds on, for the hour or until stopped.
 */
function sent(decided: Decided, lasting: Lasting, everywhere: boolean): DecisionInput {
  const yes = decided.decision !== "denied";
  return {
    ...decided,
    scope: lasting === "always" ? "always" : "once",
    ...(lasting === "hour" && yes ? { forMinutes: WHILE_MINUTES } : {}),
    ...(lasting === "work" && yes ? { untilStopped: true } : {}),
    ...(everywhere ? { everywhere } : {}),
  };
}

/** What a decided card says, from what the log holds. */
function verdict(approval: Approval, directory: Directory): string | undefined {
  const resolved = approval.resolved;
  if (resolved === undefined) return undefined;
  if (resolved.decision === "expired") {
    return `It lapsed, and policy ${approval.fallback === "allow" ? "let it through" : "denied it"}.`;
  }
  const by = resolved.by === "system" ? "policy" : nameOf(directory, resolved.by);
  const word = resolved.decision === "denied" ? "Denied" : "Approved";
  const why = resolved.reason === undefined ? "" : ` — ${resolved.reason}`;
  return `${word} by ${by}${why}`;
}

/** What the answer is so far: how far a yes reaches, which form is open, and what was given. */
function useAnswer(props: DecideProps) {
  const { approval } = props;
  const [chosen, setLasting] = useState<Lasting>("once");
  const [letWork, setLetWork] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState(approval.preview ?? "");
  const [reason, setReason] = useState("");
  const [answered, setAnswered] = useState<Lasting | undefined>(undefined);
  const plate = useMemo(() => commandPlate(approval), [approval]);
  const standing = useMemo(() => askStanding(approval), [approval]);
  const keeps = props.keepsHeldYes !== false;
  const picked: Lasting = keeps || chosen !== "hour" ? chosen : "once";
  // The switch stands over the choices and keeps the one picked under it (ADR 0281).
  const lasting: Lasting = letWork && keeps ? "work" : picked;
  const mayEverywhere = props.mayEverywhere === true;
  const { where, setWhere, everywhere, reach } = useReach(lasting, mayEverywhere);

  const decide = (input: Decided) => {
    setMode("idle");
    // The same two feelings the card in the room gives, because it is the same answer: an
    // edit is still a yes, and it is the yes that is worth feeling, not the edit.
    if (input.decision === "denied") feel.warning();
    else feel.success();
    if (input.decision === "approved") setAnswered(lasting);
    props.onDecide(sent(input, lasting, everywhere));
  };

  const tray: TrayProps = {
    approval,
    standing,
    plate,
    harnessName: props.harnessName,
    spaceName: props.spaceName ?? "this space",
    now: props.now,
    busy: props.busy,
    lasting: picked,
    setLasting,
    letWork: offersLetWork(standing, keeps) ? letWork : undefined,
    setLetWork,
    keeps,
    where: mayEverywhere ? where : undefined,
    setWhere,
    reach,
    mode,
    setMode,
    draft,
    setDraft,
    reason,
    setReason,
    decide,
    answered,
    handTo: props.handTo,
    onHand: props.onHand,
  };
  return { tray, plate, lit: lasting === "always" && standing.kind === "starts" };
}

export function Decide(props: DecideProps) {
  const insets = useSafeAreaInsets();
  const column = useColumn();
  const [height, setHeight] = useState(0);
  const { tray, plate, lit } = useAnswer(props);
  const open = props.approval.resolved === undefined && mayAnswer(props.approval, props.selfId);
  const foot = Math.max(insets.bottom, SPACE.lg);
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.body,
          column,
          { paddingBottom: open ? height + foot + SPACE.xl : SPACE.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Asking {...props} plate={plate} lit={lit} settled={tray.answered !== undefined} />
        <Below {...props} open={open} tray={tray} />
        {props.under}
      </ScrollView>
      {open ? (
        // Over the foot of what scrolls, and up with the keys when Deny or Edit asks for words.
        <KeyboardStickyView
          pointerEvents="box-none"
          offset={{ closed: 0, opened: foot - SPACE.sm }}
          style={[styles.foot, { bottom: foot }]}
          onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        >
          <Capsule grows style={[styles.tray, column]} testID="answer-tray">
            <Tray {...tray} />
          </Capsule>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}

/**
 * Under the ask: who decided it, once someone has; whose it is, while it is somebody else's; and
 * where else it can go (`Ways`).
 */
function Below(props: DecideProps & { readonly open: boolean; readonly tray: TrayProps }) {
  const palette = usePalette();
  const { approval, directory } = props;
  const decided = verdict(approval, directory);
  const waitingOn = approval.approvers.map((id) => nameOf(directory, id)).join(" or ");
  const theirs = decided === undefined && !mayAnswer(approval, props.selfId);
  return (
    <>
      {decided === undefined ? null : (
        <Text style={[styles.verdict, { color: palette.ink }]} testID="verdict">
          {decided}
          {approval.executed === undefined ? "" : ` · ${approval.executed}`}
        </Text>
      )}
      <OwnTools approval={approval} directory={directory} harnessId={props.harnessId} />
      {theirs ? (
        <Text style={[styles.line, { color: palette.ink3 }]} testID="waiting-on">
          {waitingOn === "" ? "Somebody else" : waitingOn} answers this one.
        </Text>
      ) : null}
      <Ways {...props} />
    </>
  );
}

/**
 * Where else the ask can go, as rows of one group under it: Hand to…, while it is this person's to
 * answer, and Open the space. They were two loose words a few points apart that lined up with
 * nothing (Luis's ask, 10 November 2026).
 */
function Ways(props: DecideProps & { readonly open: boolean; readonly tray: TrayProps }) {
  const { tray, onOpenSpace } = props;
  const hands = props.open && props.handTo.length > 0;
  if (!hands && onOpenSpace === undefined) return null;
  const stopped = props.busy || tray.answered !== undefined;
  return (
    <View style={styles.ways}>
      <Group inset={MARKED_INSET} testID="ask-ways">
        {hands ? (
          <GroupRow
            label="Hand to…"
            mark={<RowMark icon="route" />}
            tone={stopped ? "off" : "plain"}
            onPress={
              stopped ? undefined : () => tray.setMode(tray.mode === "handing" ? "idle" : "handing")
            }
            accessibilityLabel="Hand to…"
            testID="hand-to"
          />
        ) : null}
        {onOpenSpace === undefined ? null : (
          <GroupRow
            label="Open the space"
            value={props.spaceName}
            mark={<RowMark icon="chat" />}
            onPress={onOpenSpace}
            accessibilityLabel="Open the space"
            testID="open-space"
          />
        )}
      </Group>
    </View>
  );
}

/**
 * What is asked: the question, large; what a yes does; the command on its plate, or the preview
 * by its format; how long a yes lasts; the risks; and who it waits on.
 */
function Asking(
  props: DecideProps & {
    readonly plate: Plate | undefined;
    readonly lit: boolean;
    readonly settled: boolean;
  },
) {
  const { approval, plate } = props;
  return (
    <View style={styles.asking}>
      <Headline approval={approval} style={styles.question} plated={plate !== undefined} />
      <Effect approval={approval} />
      <AskShown
        approval={approval}
        plate={plate}
        titled={approval.question !== undefined}
        lit={props.lit}
        settled={props.settled}
      />
      <Tags approval={approval} plate={plate} selfId={props.selfId} />
      <Sources approval={approval} />
      <Lapse approval={approval} now={props.now} hidden={props.timeInBar === true} />
      <Notices approval={approval} directory={props.directory} />
    </View>
  );
}

/**
 * What kind of ask it is, as one row of tags that wraps: its risks, "Waits for you" on an open ask
 * that matters (ADR 0195), and how long a yes lasts where that is worth saying. Each stood on a
 * line of its own, three lines for three words.
 */
function Tags({
  approval,
  plate,
  selfId,
}: {
  readonly approval: Approval;
  readonly plate: Plate | undefined;
  readonly selfId: string;
}) {
  const waits = askMatters(approval) && approval.resolved === undefined;
  const lasts = approval.lasts !== undefined && saysLasts(approval, plate);
  if (approval.risk.length === 0 && !waits && !lasts) return null;
  return (
    <View style={styles.tags} testID="ask-tags">
      <Risk classes={approval.risk} />
      {waits ? (
        <View testID="waits-for-you">
          <Pill>{waitsWords(mayAnswer(approval, selfId))}</Pill>
        </View>
      ) : null}
      {lasts ? <Lasts approval={approval} /> : null}
    </View>
  );
}

/** Where the ask came from, when the harness said. */
function Sources({ approval }: { readonly approval: Approval }) {
  const palette = usePalette();
  if (approval.sources.length === 0) return null;
  return (
    <Text style={[styles.line, { color: palette.ink3 }]}>
      From {approval.sources.map((source) => source.label).join(", ")}
    </Text>
  );
}

/** When it lapses, and what lapsing does, where the bar has no ring to say it. */
function Lapse({
  approval,
  now,
  hidden,
}: {
  readonly approval: Approval;
  readonly now: number;
  readonly hidden: boolean;
}) {
  const palette = usePalette();
  const left = timeLeft(approval.expiresAt, now);
  if (left === undefined || hidden) return null;
  return (
    <Text style={[styles.line, { color: left === "expired" ? palette.red : palette.ink3 }]}>
      {lapseWords(left, approval.fallback)}
    </Text>
  );
}

/** Who it was handed to, and when policy let the lane's lead answer it. */
function Notices({
  approval,
  directory,
}: {
  readonly approval: Approval;
  readonly directory: Directory;
}) {
  const palette = usePalette();
  // The lane's lead: an agent (ADR 0087), or a harness before agents.
  const lead = approval.approvers.find((id) => isAgent(directory, id));
  const named = approval.approvers.map((id) => nameOf(directory, id)).join(", ");
  return (
    <>
      {approval.routedBy === undefined ? null : (
        <Text style={[styles.line, { color: palette.ink3 }]} testID="routed">
          Handed to {named === "" ? "anyone" : named} by {nameOf(directory, approval.routedBy)}
          {approval.routedReason === undefined ? "" : ` · ${approval.routedReason}`}
        </Text>
      )}
      {lead === undefined || approval.resolved !== undefined ? null : (
        <Text style={[styles.line, { color: palette.ink3 }]} testID="lead-notice">
          Policy let {nameOf(directory, lead)}, the lead, answer this.
        </Text>
      )}
    </>
  );
}

/** "Answered by Kit in its own tools.", under the verdict of an ask the harness settled itself. */
function OwnTools({
  approval,
  directory,
  harnessId,
}: {
  readonly approval: Approval;
  readonly directory: Directory;
  readonly harnessId: string | undefined;
}) {
  const palette = usePalette();
  const words = ownToolsWords(approval, directory, harnessId);
  if (words === undefined) return null;
  return (
    <Text style={[styles.line, { color: palette.ink3 }]} testID="own-tools">
      {words}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: SPACE.lg, gap: SPACE.md },
  asking: { gap: SPACE.md },
  question: { fontSize: 22, lineHeight: 27, fontWeight: "700", letterSpacing: -0.2 },
  line: { fontSize: TEXT.sm },
  verdict: { fontSize: TEXT.md, fontWeight: "600" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: SPACE.xs },
  // The group keeps a page's inset of its own, which the body's padding already gives.
  ways: { marginTop: SPACE.sm, marginHorizontal: -SPACE.lg },
  foot: { position: "absolute", left: SPACE.sm, right: SPACE.sm, alignItems: "center" },
  tray: { width: "100%", borderRadius: 24, padding: SPACE.md, gap: SPACE.md },
});
