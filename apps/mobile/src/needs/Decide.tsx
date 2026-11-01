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
 * An ask that matters (ADR 0195) wears "Waits for you" while it is open, and offers no scope: it
 * is answered once, and a line says why where the choices were. One the harness settled itself, as
 * its own window answered it, says so under its verdict: "Answered by Kit in its own tools."
 *
 * A yes beyond once on a command remembers how each part of it starts (ADR 0239): the card shows
 * the starts under Remembers, and under Always an owner or admin picks every space (the default)
 * or this one. A command Chips can't read, or one that uses `rm` and the like, is answered once,
 * and a line says why.
 */

import type { Approval, AskStanding, Directory, PersonModel, Reach } from "@chipschat/core";
import {
  askMatters,
  askStanding,
  isAgent,
  mayAnswer,
  nameOf,
  ownToolsWords,
  reachWords,
  waitsWords,
} from "@chipschat/core";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { type Choice, Choices } from "../ui/Choices";
import { Field } from "../ui/Field";
import * as feel from "../ui/haptics";
import { Pill } from "../ui/Pill";
import { Risk } from "../ui/Risk";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { timeLeft } from "../ui/when";
import { lapseWords } from "../words";
import { AskPreview, Effect, Headline, Lasts } from "./Asked";
import { HandOn } from "./HandOn";

export type Scope = "once" | "session" | "always";

export interface DecisionInput {
  readonly decision: "approved" | "edited" | "denied";
  readonly scope: Scope;
  /** An Always kept for every space (ADR 0239). */
  readonly everywhere?: boolean | undefined;
  readonly reason?: string | undefined;
  readonly updatedInput?: unknown;
}

const SCOPES: readonly Choice[] = [
  { value: "once", label: "Once" },
  { value: "session", label: "This session" },
  { value: "always", label: "Always" },
];

const WHERE: readonly Choice[] = [
  { value: "everywhere", label: "In every space" },
  { value: "space", label: "In this space" },
];

type Where = "everywhere" | "space";

type Mode = "idle" | "editing" | "denying" | "handing";

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
  /** The space's name, for an Always kept to it: "go ahead without a card in Bakery". */
  readonly spaceName?: string | undefined;
}

/**
 * How far a yes reaches (ADR 0239): an owner's or admin's Always is kept for every space unless
 * they pick this one; anybody else's, for this space; This session, for the rest of the run.
 */
function useReach(scope: Scope, mayEverywhere: boolean) {
  const [where, setWhere] = useState<Where>("everywhere");
  const everywhere = scope === "always" && mayEverywhere && where === "everywhere";
  const reach: Reach = scope === "session" ? "session" : everywhere ? "everywhere" : "space";
  return { where, setWhere, everywhere, reach };
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

function Header(props: DecideProps) {
  const palette = usePalette();
  const { approval } = props;
  const left = timeLeft(approval.expiresAt, props.now);
  return (
    <>
      <Headline approval={approval} style={styles.title} />
      <Effect approval={approval} />
      <AskPreview approval={approval} titled={approval.question !== undefined} />
      <Lasts approval={approval} />
      <Risk classes={approval.risk} />
      {askMatters(approval) && approval.resolved === undefined ? (
        <View style={styles.waits} testID="waits-for-you">
          <Pill>{waitsWords(mayAnswer(approval, props.selfId))}</Pill>
        </View>
      ) : null}
      {approval.sources.length === 0 ? null : (
        <Text style={[styles.line, { color: palette.ink3 }]}>
          From {approval.sources.map((source) => source.label).join(", ")}
        </Text>
      )}
      {left === undefined ? null : (
        <Text style={[styles.line, { color: left === "expired" ? palette.red : palette.ink3 }]}>
          {lapseWords(left, approval.fallback)}
        </Text>
      )}
    </>
  );
}

/**
 * The preview, by the format the harness sent: Markdown as the room draws a message, so a code
 * fence is a code block and not its backticks; a diff, JSON or a table as a code block, its
 * columns kept; anything else as its words. Under its heading, when it has one.
 */
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

export function Decide(props: DecideProps) {
  const palette = usePalette();
  const { approval } = props;
  const [scope, setScope] = useState<Scope>("once");
  const [mode, setMode] = useState<Mode>("idle");
  const [draft, setDraft] = useState(approval.preview ?? "");
  const [reason, setReason] = useState("");
  const decided = verdict(approval, props.directory);
  const mine = mayAnswer(approval, props.selfId);
  const waitingOn = approval.approvers.map((id) => nameOf(props.directory, id)).join(" or ");

  const { where, setWhere, everywhere, reach } = useReach(scope, props.mayEverywhere === true);

  const decide = (input: DecisionInput) => {
    setMode("idle");
    // The same two feelings the card in the room gives, because it is the same answer: an
    // edit is still a yes, and it is the yes that is worth feeling, not the edit.
    if (input.decision === "denied") feel.warning();
    else feel.success();
    props.onDecide(everywhere ? { ...input, everywhere } : input);
  };

  return (
    <View style={styles.body}>
      <Card tone={cardTone(approval)}>
        <Header {...props} />
        <Notices approval={approval} directory={props.directory} />
        {decided === undefined ? null : (
          <Text style={[styles.verdict, { color: palette.ink }]} testID="verdict">
            {decided}
            {approval.executed === undefined ? "" : ` · ${approval.executed}`}
          </Text>
        )}
        <OwnTools approval={approval} directory={props.directory} harnessId={props.harnessId} />
      </Card>

      {decided !== undefined ? null : mine ? (
        <Open
          {...props}
          scope={scope}
          setScope={setScope}
          mode={mode}
          setMode={setMode}
          draft={draft}
          setDraft={setDraft}
          reason={reason}
          setReason={setReason}
          decide={decide}
          where={where}
          setWhere={setWhere}
          reach={reach}
        />
      ) : (
        <Text style={[styles.line, { color: palette.ink3 }]} testID="waiting-on">
          {waitingOn === "" ? "Somebody else" : waitingOn} answers this one.
        </Text>
      )}
    </View>
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

/**
 * Where the scope choices were, for an ask answered once: why there are none. It matters (ADR
 * 0195), or its command can't be read part by part or uses one never given a standing yes (ADR
 * 0239).
 */
function OnceOnly({ why }: { readonly why: string }) {
  const palette = usePalette();
  return (
    <Text style={[styles.onceOnly, { color: palette.ink3 }]} testID="once-only">
      {why}
    </Text>
  );
}

/**
 * Under the choices, for a yes beyond once (ADR 0239): a command's starts under Remembers, in
 * code; under Always, for an owner or admin, every space or this one; and a line saying what goes
 * ahead without a card, where, and that anything else still comes to a person.
 */
function Standing(props: {
  readonly standing: AskStanding;
  readonly reach: Reach;
  readonly spaceName: string;
  /** Where an Always is kept, when this person may pick; absent, it is this space. */
  readonly where: Where | undefined;
  readonly onWhere: (where: Where) => void;
  readonly busy: boolean;
}) {
  const palette = usePalette();
  const { standing, where } = props;
  const commands = standing.kind === "starts";
  return (
    <View style={styles.standing} testID="standing">
      {commands ? (
        <View style={styles.remembers} testID="remembers">
          <Text style={[styles.line, { color: palette.ink3 }]}>Remembers</Text>
          {standing.starts.map((start) => (
            <Text
              key={start}
              style={[styles.start, { color: palette.ink, backgroundColor: palette.surface2 }]}
            >
              {start}
            </Text>
          ))}
        </View>
      ) : null}
      {where === undefined ? null : (
        <Choices
          label="Where this Always holds"
          options={WHERE}
          chosen={[where]}
          onChoose={(value) => props.onWhere(value as Where)}
          row
          disabled={props.busy}
        />
      )}
      <Text style={[styles.line, { color: palette.ink3 }]} testID="reach">
        {reachWords(props.reach, props.spaceName, commands)}
      </Text>
    </View>
  );
}

function cardTone(approval: Approval): "ask" | "approved" | "denied" {
  const decision = approval.resolved?.decision;
  if (decision === undefined) return "ask";
  return decision === "denied" || decision === "expired" ? "denied" : "approved";
}

/** The controls, for an ask that is still open and is this person's to answer. */
function Open(
  props: DecideProps & {
    readonly scope: Scope;
    readonly setScope: (scope: Scope) => void;
    readonly mode: Mode;
    readonly setMode: (mode: Mode) => void;
    readonly draft: string;
    readonly setDraft: (draft: string) => void;
    readonly reason: string;
    readonly setReason: (reason: string) => void;
    readonly decide: (input: DecisionInput) => void;
    readonly where: Where;
    readonly setWhere: (where: Where) => void;
    readonly reach: Reach;
  },
) {
  const { approval, busy, mode, scope } = props;
  // An ask that matters, or a command that can't be remembered, is answered once (ADRs 0195,
  // 0239): no scope to pick, and the door refuses one.
  const standing = askStanding(approval);
  return (
    <>
      {standing.kind === "once" ? null : (
        <Choices
          label="How far this yes reaches"
          options={SCOPES}
          chosen={[scope]}
          onChoose={(value) => props.setScope(value as Scope)}
          row
          disabled={busy}
        />
      )}
      {standing.kind === "once" || scope === "once" ? null : (
        <Standing
          standing={standing}
          reach={props.reach}
          spaceName={props.spaceName ?? "this space"}
          where={scope === "always" && props.mayEverywhere === true ? props.where : undefined}
          onWhere={props.setWhere}
          busy={busy}
        />
      )}
      <View style={styles.buttons}>
        <Button
          label="Deny"
          variant="danger"
          grow
          disabled={busy}
          onPress={() => props.setMode(mode === "denying" ? "idle" : "denying")}
        />
        {approval.editable ? (
          <Button
            label="Edit"
            grow
            disabled={busy}
            onPress={() => props.setMode(mode === "editing" ? "idle" : "editing")}
          />
        ) : null}
        <Button
          label="Approve"
          variant="primary"
          grow
          busy={busy}
          onPress={() => props.decide({ decision: "approved", scope })}
        />
      </View>
      <Button
        label="Hand to…"
        variant="plain"
        disabled={busy}
        onPress={() => props.setMode(mode === "handing" ? "idle" : "handing")}
      />
      {standing.kind === "once" ? <OnceOnly why={standing.why} /> : null}
      {mode === "editing" ? <EditForm {...props} /> : null}
      {mode === "denying" ? <DenyForm {...props} /> : null}
      {mode === "handing" ? (
        <HandOn
          options={props.handTo}
          busy={busy}
          onCancel={() => props.setMode("idle")}
          onHand={(to, reason) => {
            props.setMode("idle");
            props.onHand(to, reason);
          }}
        />
      ) : null}
    </>
  );
}

function EditForm(props: {
  readonly approval: Approval;
  readonly busy: boolean;
  readonly scope: Scope;
  readonly draft: string;
  readonly setDraft: (draft: string) => void;
  readonly setMode: (mode: Mode) => void;
  readonly decide: (input: DecisionInput) => void;
}) {
  return (
    <View style={styles.form} testID="edit-form">
      <Field
        label="What should go instead"
        value={props.draft}
        onChange={props.setDraft}
        lines={4}
        disabled={props.busy}
        testID="edit-input"
      />
      <View style={styles.buttons}>
        <Button label="Cancel" grow disabled={props.busy} onPress={() => props.setMode("idle")} />
        <Button
          label="Approve with edits"
          variant="primary"
          grow
          busy={props.busy}
          disabled={props.draft.trim() === ""}
          onPress={() =>
            props.decide({
              decision: "edited",
              scope: props.scope,
              updatedInput: { ...(props.approval.input as object | undefined), body: props.draft },
            })
          }
        />
      </View>
    </View>
  );
}

function DenyForm(props: {
  readonly busy: boolean;
  readonly scope: Scope;
  readonly reason: string;
  readonly setReason: (reason: string) => void;
  readonly setMode: (mode: Mode) => void;
  readonly decide: (input: DecisionInput) => void;
}) {
  const why = props.reason.trim();
  return (
    <View style={styles.form} testID="deny-form">
      <Field
        label="Why not? The harness gets to read this."
        value={props.reason}
        onChange={props.setReason}
        lines={2}
        disabled={props.busy}
        testID="deny-input"
      />
      <View style={styles.buttons}>
        <Button label="Cancel" grow disabled={props.busy} onPress={() => props.setMode("idle")} />
        <Button
          label="Deny"
          variant="danger"
          grow
          busy={props.busy}
          onPress={() =>
            props.decide({
              decision: "denied",
              scope: props.scope,
              ...(why === "" ? {} : { reason: why }),
            })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg },
  title: { fontSize: TEXT.lg, fontWeight: "700" },
  line: { fontSize: TEXT.sm },
  verdict: { fontSize: TEXT.md, fontWeight: "600" },
  buttons: { flexDirection: "row", gap: SPACE.sm },
  form: { gap: SPACE.md },
  waits: { flexDirection: "row" },
  onceOnly: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45, textAlign: "center" },
  standing: { gap: SPACE.sm },
  remembers: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: SPACE.xs },
  start: {
    fontFamily: "Menlo",
    fontSize: TEXT.sm,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.xs,
    overflow: "hidden",
  },
});
