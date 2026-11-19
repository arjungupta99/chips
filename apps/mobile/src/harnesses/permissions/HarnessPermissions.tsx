/**
 * A harness's Permissions (ADR 0300, Arjun's split of the plan "Harness first, Chips's rules if
 * you want them"): the page its Permissions row opens, pushed on a phone and in the Agents tab's
 * pane on an iPad, and the two pages it pushes. The web's
 * (`apps/web/src/app/permissions/HarnessPermissions.tsx`) in the phone's terms.
 *
 * - The main page: the gates, the yellow banner only while Claude Code runs in Bypass
 *   permissions, "Where it's set" with a row for the harness's own settings and one for Chips's
 *   rules, and every ask so far.
 * - <Harness>'s settings: its mode, which a person picks there where the harness offers modes
 *   (ADR 0300, addendum of 19 November 2026), the notice, and what its settings let through, ask
 *   about and never run.
 * - Chips's rules: the switch, then Stop asking and the rules, with Add a rule.
 *
 * The page's Undo pill and the layer its dust is drawn in stand beside the scroll (`overlays`).
 */

import {
  ADD_RULE_WORDS,
  ASK_AGAIN_WORDS,
  alwaysFoot,
  asksGoTo,
  CHIPS_ANSWERS_HEADING,
  CHIPS_GATE_WORDS,
  CHIPS_RULES_TITLE,
  COPIED_WORDS,
  COPY_WORDS,
  harnessAskKey,
  harnessPermissions,
  MAKE_ASK_WORDS,
  MODE_HEADING,
  modePicker,
  NOT_SAID,
  nameOf,
  OWN_GATE_WORDS,
  OWN_HEADING,
  OWN_RIGHT,
  type OwnNotice,
  type OwnRow,
  type OwnRulesView,
  type HarnessPermissions as PermissionsPage,
  pasteWords,
  REMOVED_WORDS,
  type Snapshot,
  type SnoozeLength,
  STOP_ASKING_HEADING,
  STOP_ASKING_TITLE,
  type Store,
  segments,
  snoozeUntil,
  WHERE_SET_HEADING,
} from "@chipschat/core";
import * as Clipboard from "expo-clipboard";
import { Fragment, type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Asker, useDust } from "../../spaces/Dust";
import { ListDust } from "../../spaces/SelectMotion";
import { UndoPill } from "../../spaces/UndoPill";
import { Card } from "../../ui/Card";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../../ui/Group";
import * as feel from "../../ui/haptics";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import { usePalette } from "../../ui/theme";
import { ON_GOLD, RADIUS, SPACE, TEXT } from "../../ui/tokens";
import { useNow } from "../../ui/useNow";
import { useReduceMotion } from "../../ui/useReduceMotion";
import { AlwaysList } from "../AlwaysList";
import { AsksSoFar, Count } from "../Asking";
import { DotRow, Hero } from "../AskingMotion";
import { type Always, useAlways } from "../useAlways";
import { ModePicker } from "./ModePicker";
import { modeKey, useOwnRules } from "./ownRules";
import { LengthChips, useFold } from "./StopLengths";

const MODE_SUB = "The mode Chips runs its sessions in. Anything not on its lists asks.";
const NOT_SAID_WORDS =
  "It doesn't say yet what it runs on its own. Everything it asks still comes to you.";

/** What Undo does, to a screen reader. */
const UNDO_HINT = "Puts the rule back as it was";

/** The page and what stands beside its scroll. */
export interface PermissionsSection {
  readonly page: ReactNode;
  readonly overlays: ReactNode;
}

/** The main page (ADR 0300): who decides, the one yellow banner, where it's set, and the record. */
export function useHarnessPermissions({
  store,
  snapshot,
  harnessId,
  selfId,
  onOpenAsks,
  onOpenPart,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** Opens every ask so far (ADR 0255). */
  readonly onOpenAsks: () => void;
  /** Opens its own settings, or Chips's rules (ADR 0300). */
  readonly onOpenPart: (part: "settings" | "chips") => void;
}): PermissionsSection {
  const always = useAlways(store, snapshot);
  // A pick's end passes while the page is open: the clock moves it on.
  const now = useNow(true);
  const own = useOwnRules(store, snapshot, harnessId, modeKey(snapshot, harnessId, now));
  const page = (
    <Page
      store={store}
      now={now}
      snapshot={snapshot}
      harnessId={harnessId}
      selfId={selfId}
      always={always}
      own={own ?? NOT_SAID}
      onOpenAsks={onOpenAsks}
      onOpenPart={onOpenPart}
    />
  );
  return { page, overlays: null };
}

/** The page model, as all three pages read it. */
function pageOf(
  always: Always,
  snapshot: Snapshot,
  harnessId: string,
  selfId: string | undefined,
  own: OwnRulesView,
  now: number = Date.now(),
) {
  return harnessPermissions(
    {
      model: always.model,
      directory: snapshot.directory,
      keepsHarnessRules: snapshot.keepsHarnessRules,
      keepsChipsRules: snapshot.keepsChipsRules,
      keepsHarnessMode: snapshot.keepsHarnessMode,
    },
    harnessId,
    selfId,
    own,
    now,
  );
}

/**
 * The one yellow banner while it runs everything without asking (ADR 0300), with Back to Default
 * while a mode a person picked is why.
 */
function OpenBanner({
  open,
  onBack,
}: {
  readonly open: NonNullable<PermissionsPage["open"]>;
  readonly onBack: () => void;
}) {
  const palette = usePalette();
  return (
    <View
      style={[styles.open, styles.inset, { backgroundColor: palette.goldSoft }]}
      testID="perms-open"
    >
      <RowMark icon="info" tint={palette.gold} ink={ON_GOLD} />
      <View style={styles.noticeWords}>
        <Text style={[styles.noticeTitle, { color: palette.goldDeep }]}>{open.title}</Text>
        <Text style={[styles.note, { color: palette.ink2 }]}>{open.sub}</Text>
      </View>
      {open.back === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            feel.tap();
            onBack();
          }}
          style={({ pressed }) => [
            styles.again,
            { backgroundColor: palette.goldDeep, opacity: pressed ? 0.7 : 1 },
          ]}
          testID="perms-open-back"
        >
          <Text style={[styles.againWords, { color: palette.bg }]}>{open.back}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Page({
  store,
  now,
  snapshot,
  harnessId,
  selfId,
  always,
  own,
  onOpenAsks,
  onOpenPart,
}: {
  readonly store: Store;
  readonly now: number;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly always: Always;
  readonly own: OwnRulesView;
  readonly onOpenAsks: () => void;
  readonly onOpenPart: (part: "settings" | "chips") => void;
}) {
  const palette = usePalette();
  const { directory } = snapshot;
  const page = pageOf(always, snapshot, harnessId, selfId, own, now);
  const owner = directory[harnessId]?.ownerId;
  const to = asksGoTo(directory, harnessId, selfId);
  return (
    <View style={styles.page} testID="permissions">
      <Card style={styles.inset}>
        <Hero
          harness={page.name}
          person={to.kind === "you" ? "You" : to.kind === "owner" ? to.name : "A person"}
          personName={owner === undefined ? "?" : nameOf(directory, owner)}
          face={owner === undefined ? undefined : directory[owner]?.face}
          working={page.open !== undefined}
          gates={{
            ownLabel: OWN_GATE_WORDS,
            own: page.gates.own,
            chipsLabel: CHIPS_GATE_WORDS,
            chips: page.chipsOn ? page.gates.chips : undefined,
          }}
        />
        <Text style={[styles.headline, { color: palette.ink }]} testID="perms-headline">
          {page.lead}
        </Text>
      </Card>
      {page.open === undefined ? null : (
        <OpenBanner open={page.open} onBack={() => store.setMode(harnessId, null)} />
      )}
      <View>
        <GroupHeading>{WHERE_SET_HEADING}</GroupHeading>
        <Group>
          <GroupRow
            label={page.settingsRow.title}
            sub={page.settingsRow.sub}
            subLines={2}
            value={page.settingsRow.value}
            goldValue={page.settingsRow.gold}
            {...(page.settingsRow.warn ? { tone: "danger" as const } : {})}
            mark={<RowMark icon="terminal" />}
            onPress={() => onOpenPart("settings")}
            testID="perms-settings-row"
          />
          <GroupRow
            label={CHIPS_RULES_TITLE}
            sub={page.chipsRow.sub}
            value={page.chipsRow.value}
            mark={
              <RowMark
                icon="lock"
                tint={page.chipsOn ? palette.accent : undefined}
                ink={page.chipsOn ? "#ffffff" : undefined}
              />
            }
            onPress={() => onOpenPart("chips")}
            testID="perms-chips-row"
          />
        </Group>
      </View>
      {page.history === undefined ? null : (
        <Card style={styles.inset}>
          <AsksSoFar
            dots={<DotRow dots={page.history.dots} />}
            askKey={harnessAskKey(snapshot.model, directory, harnessId)}
            line={page.history.line}
            onOpen={onOpenAsks}
          />
        </Card>
      )}
    </View>
  );
}

/**
 * Its own settings (ADR 0300): its mode, the picker where it offers modes (19 November addendum),
 * the notice, and what its settings let through.
 */
export function HarnessSettings({
  store,
  snapshot,
  harnessId,
  selfId,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
}) {
  const palette = usePalette();
  const now = useNow(true);
  const own =
    useOwnRules(store, snapshot, harnessId, modeKey(snapshot, harnessId, now)) ?? NOT_SAID;
  const picker = modePicker(
    {
      model: snapshot.model,
      directory: snapshot.directory,
      keepsHarnessRules: snapshot.keepsHarnessRules,
      keepsHarnessMode: snapshot.keepsHarnessMode,
    },
    harnessId,
    selfId,
    own,
    now,
  );
  return (
    <View style={styles.page} testID="perms-settings">
      {picker !== undefined ? (
        <ModePicker picker={picker} harnessId={harnessId} store={store} />
      ) : (
        <View>
          <GroupHeading>{MODE_HEADING}</GroupHeading>
          <Group>
            <GroupRow
              label={own.mode ?? (own.said ? "Its own" : "Not said")}
              sub={own.everything ? "Runs everything without asking" : MODE_SUB}
              subLines={2}
              goldValue={own.everything}
              mark={<RowMark icon="terminal" />}
              testID="perms-mode"
            />
          </Group>
        </View>
      )}
      {own.notice === undefined ? null : <Notice notice={own.notice} />}
      <OwnList own={own} />
      {own.said ? null : (
        <Text style={[styles.note, styles.inset, { color: palette.ink3 }]} testID="perms-not-said">
          {NOT_SAID_WORDS}
        </Text>
      )}
    </View>
  );
}

/**
 * Chips's rules for one harness (ADR 0300): the switch; and while it's on, Stop asking, which never
 * says yes to its own short list (`rm`, `git push`), then the rules and Add a rule. Its Undo pill and dust stand beside.
 */
export function useChipsRules({
  store,
  snapshot,
  harnessId,
  selfId,
  onNewRule,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly onNewRule: () => void;
}): PermissionsSection {
  const dust = useDust(useReduceMotion());
  const always = useAlways(store, snapshot);
  const own = useOwnRules(store, snapshot, harnessId);
  const insets = useSafeAreaInsets();
  const removed = always.removed;
  const page = (
    <ChipsPage
      store={store}
      snapshot={snapshot}
      harnessId={harnessId}
      selfId={selfId}
      always={always}
      own={own ?? NOT_SAID}
      dust={dust.asker}
      onNewRule={onNewRule}
    />
  );
  const overlays = (
    <>
      <ListDust dust={dust} />
      <UndoPill
        undoing={removed === undefined ? undefined : { lineId: removed.key, at: removed.at }}
        bottom={insets.bottom + SPACE.lg}
        words={REMOVED_WORDS}
        hint={UNDO_HINT}
        onUndo={always.undo}
        onGone={always.settled}
      />
    </>
  );
  return { page, overlays };
}

function ChipsPage({
  store,
  snapshot,
  harnessId,
  selfId,
  always,
  own,
  dust,
  onNewRule,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly always: Always;
  readonly own: OwnRulesView;
  readonly dust: Asker;
  readonly onNewRule: () => void;
}) {
  const palette = usePalette();
  const page = pageOf(always, snapshot, harnessId, selfId, own);
  const chips = page.chipsPage;
  return (
    <View style={styles.page} testID="perms-chips">
      <View>
        <GroupHeading>{`For ${page.name}`}</GroupHeading>
        <Group>
          <GroupRow
            label={CHIPS_RULES_TITLE}
            sub={chips.switchSub}
            subLines={2}
            mark={<RowMark icon="lock" tint={palette.accent} ink="#ffffff" />}
            trailing={
              <Switch
                value={page.chipsOn}
                disabled={!page.maySwitch}
                onValueChange={(on) => {
                  feel.tick();
                  store.setChipsRules(harnessId, on);
                }}
                accessibilityLabel={CHIPS_RULES_TITLE}
                testID="perms-switch"
              />
            }
            testID="perms-switch-row"
          />
        </Group>
        {page.chipsOn ? null : <GroupFoot testID="perms-off-foot">{chips.offFoot}</GroupFoot>}
      </View>
      {!page.chipsOn ? null : (
        <>
          {chips.note === undefined ? null : (
            <Text style={[styles.note, styles.inset, { color: palette.ink3 }]}>{chips.note}</Text>
          )}
          <StopAsking
            pause={chips.pause}
            may={page.mayChange}
            onStop={(length) =>
              store.snoozeHarness(harnessId, { until: snoozeUntil(length), matters: false })
            }
            onAgain={() =>
              page.off?.every === true
                ? store.setWorkspaceRules({ hold: null })
                : store.resumeHarness(harnessId)
            }
          />
          <ChipsAnswers
            rules={page.rules}
            always={always}
            dust={dust}
            may={page.mayChange}
            name={page.name}
            foot={chips.rulesFoot}
            onAdd={onNewRule}
          />
        </>
      )}
    </View>
  );
}

/** Stop asking: its row, the lengths under it once tapped, or Ask again while Chips says yes. */
function StopAsking({
  pause,
  may,
  onStop,
  onAgain,
}: {
  readonly pause: { readonly holding: boolean; readonly title: string; readonly sub: string };
  readonly may: boolean;
  readonly onStop: (length: SnoozeLength) => void;
  readonly onAgain: () => void;
}) {
  const palette = usePalette();
  const fold = useFold();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <GroupHeading>{STOP_ASKING_HEADING}</GroupHeading>
      <Group>
        {/* One child of the card, so the lengths open under the row with no hairline between. */}
        <View>
          <GroupRow
            label={pause.title}
            sub={<Coded text={pause.sub} style={[styles.note, { color: palette.ink3 }]} />}
            subLines={3}
            mark={
              <RowMark
                icon="clock"
                tint={pause.holding ? palette.accent : undefined}
                ink={pause.holding ? "#ffffff" : undefined}
              />
            }
            {...(may && !pause.holding
              ? {
                  onPress: () => {
                    fold();
                    setOpen((was) => !was);
                  },
                }
              : {})}
            trailing={
              may && pause.holding ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    feel.tap();
                    onAgain();
                  }}
                  style={({ pressed }) => [
                    styles.again,
                    { backgroundColor: palette.accent, opacity: pressed ? 0.7 : 1 },
                  ]}
                  testID="perms-ask-again"
                >
                  <Text style={styles.againWords}>{ASK_AGAIN_WORDS}</Text>
                </Pressable>
              ) : undefined
            }
            testID="perms-stop"
          />
          {/* Under the row, in from the left where its words start, as the web's fold has them.
              A row's `under` is drawn in the row's own line, so the chips there took its width. */}
          {open && !pause.holding ? (
            <View style={styles.lengths}>
              <LengthChips
                label={STOP_ASKING_TITLE}
                onPick={(length) => {
                  fold();
                  setOpen(false);
                  onStop(length);
                }}
                testID="perms-stop-len"
              />
            </View>
          ) : null}
        </View>
      </Group>
    </View>
  );
}

/** What Chips answers: the rules, each switched or swiped away, Add a rule, and the line under. */
function ChipsAnswers({
  rules,
  always,
  dust,
  may,
  name,
  foot,
  onAdd,
}: {
  readonly rules: ReturnType<typeof harnessPermissions>["rules"];
  readonly always: Always;
  readonly dust: Asker;
  readonly may: boolean;
  readonly name: string;
  readonly foot: string;
  readonly onAdd: () => void;
}) {
  const palette = usePalette();
  const some = rules.length > 0;
  return (
    <View>
      <GroupHeading trailing={<Count rules={rules} />}>{CHIPS_ANSWERS_HEADING}</GroupHeading>
      <Card style={styles.inset}>
        {some ? (
          <AlwaysList
            rules={rules}
            always={always}
            dust={dust}
            may={may}
            paint={palette.surface}
            edge
            titled
            testID="perms-rules"
          />
        ) : null}
        {may ? (
          <AddRow words={ADD_RULE_WORDS} onPress={onAdd} under={some} testID="perms-add-rule" />
        ) : null}
        {!some && !may ? (
          <Text style={[styles.note, { color: palette.ink3 }]}>Nobody has written a rule yet.</Text>
        ) : null}
      </Card>
      <GroupFoot testID="perms-rules-foot">
        {some ? `${foot} ${alwaysFoot(name, may)}` : foot}
      </GroupFoot>
    </View>
  );
}

/** Add a rule: a row in the accent, with its plus and chevron. */
export function AddRow({
  words,
  onPress,
  under = false,
  testID,
}: {
  readonly words: string;
  readonly onPress: () => void;
  /** Rows stand over it: a hairline between. */
  readonly under?: boolean;
  readonly testID: string;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={words}
      onPress={() => {
        feel.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.add,
        under ? { borderTopColor: palette.line, borderTopWidth: StyleSheet.hairlineWidth } : null,
        { opacity: pressed ? 0.6 : 1 },
      ]}
      testID={testID}
    >
      <View style={[styles.addMark, { backgroundColor: palette.accent }]}>
        <Icon name="plus" size={15} color="#ffffff" weight={2.6} />
      </View>
      <Text style={[styles.addWords, { color: palette.accent }]}>{words}</Text>
      <Icon name="next" size={14} color={palette.ink4} weight={2.4} />
    </Pressable>
  );
}

/** Words with stretches in code, as core marks them with backticks. */
export function Coded({ text, style }: { readonly text: string; readonly style: object }) {
  return (
    <Text style={style}>
      {segments(text).map((part, at) =>
        part.code === true ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a stretch's place is its order.
          <Text key={at} style={styles.code}>
            {part.text}
          </Text>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <Fragment key={at}>{part.text}</Fragment>
        ),
      )}
    </Text>
  );
}

/** What it runs that Chips would never allow: the sentence, and the line to paste with Copy. */
function Notice({ notice }: { readonly notice: OwnNotice }) {
  const palette = usePalette();
  const fold = useFold();
  const [open, setOpen] = useState(false);
  const line = notice.line;
  return (
    <View
      style={[styles.notice, { backgroundColor: palette.amberSoft, borderColor: palette.amber }]}
      testID="perms-notice"
    >
      <View style={styles.noticeHead}>
        <Icon name="info" size={17} color={palette.amberInk} />
        <View style={styles.noticeWords}>
          <Coded text={notice.title} style={[styles.noticeTitle, { color: palette.ink }]} />
          <Text style={[styles.note, { color: palette.ink2 }]}>{notice.body}</Text>
        </View>
      </View>
      {line === undefined ? null : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => {
              fold();
              setOpen((was) => !was);
            }}
            style={({ pressed }) => [
              styles.noticeButton,
              { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 },
            ]}
            testID="perms-make-ask"
          >
            <Text style={[styles.noticeButtonWords, { color: palette.amberInk }]}>
              {MAKE_ASK_WORDS}
            </Text>
            <Icon name={open ? "up" : "down"} size={13} color={palette.amberInk} weight={2.4} />
          </Pressable>
          {open ? <Snip line={line} where={notice.where} /> : null}
        </>
      )}
    </View>
  );
}

/** Where to paste the line, the line itself, and Copy, which says Copied once it has. */
function Snip({ line, where }: { readonly line: string; readonly where: string | undefined }) {
  const palette = usePalette();
  const [copied, setCopied] = useState(false);
  const ink = copied ? palette.greenInk : palette.accent;
  return (
    <View style={[styles.snip, { backgroundColor: palette.surface }]}>
      <Coded text={pasteWords(where)} style={[styles.note, { color: palette.ink2 }]} />
      <Text
        style={[styles.line, { color: palette.ink, backgroundColor: palette.surface2 }]}
        selectable
        testID="perms-line"
      >
        {line}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? COPIED_WORDS : COPY_WORDS}
        onPress={() => {
          void Clipboard.setStringAsync(line).then(() => {
            feel.success();
            setCopied(true);
          });
        }}
        style={({ pressed }) => [styles.copy, { opacity: pressed ? 0.6 : 1 }]}
        testID="perms-copy"
      >
        <Icon name={copied ? "check" : "copy"} size={14} color={ink} />
        <Text style={[styles.copyWords, { color: ink }]}>{copied ? COPIED_WORDS : COPY_WORDS}</Text>
      </Pressable>
    </View>
  );
}

const OWN_ICONS: Readonly<Record<OwnRow["kind"], IconName>> = {
  read: "doc",
  write: "pen",
  web: "globe",
  command: "terminal",
  tool: "info",
};

/** What it runs without asking, from its settings, a row for each kind; nothing before it said. */
function OwnList({ own }: { readonly own: OwnRulesView }) {
  const palette = usePalette();
  if (!own.said || (own.rows.length === 0 && own.foot === undefined)) return null;
  return (
    <View>
      <GroupHeading
        trailing={<Text style={[styles.right, { color: palette.ink3 }]}>{OWN_RIGHT}</Text>}
      >
        {OWN_HEADING}
      </GroupHeading>
      {own.rows.length === 0 ? null : (
        <Group testID="perms-own">
          {own.rows.map((row) => (
            <GroupRow
              key={`${row.kind}:${row.title}`}
              label={row.title}
              mark={
                <RowMark icon={OWN_ICONS[row.kind]} tint={palette.surface2} ink={palette.ink2} />
              }
              subLines={3}
              sub={
                <Text style={[styles.note, { color: palette.ink3 }]}>
                  {row.names.map((each, at) => (
                    <Fragment key={each.name}>
                      {at > 0 ? ", " : ""}
                      {each.never ? (
                        <Text style={[styles.never, { color: palette.amberInk }]}>{each.name}</Text>
                      ) : (
                        each.name
                      )}
                    </Fragment>
                  ))}
                </Text>
              }
            />
          ))}
        </Group>
      )}
      {own.foot === undefined ? null : (
        <GroupFoot testID="perms-own-foot">
          <Coded text={own.foot} style={[styles.note, { color: palette.ink3 }]} />
        </GroupFoot>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.lg },
  open: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
  },
  again: { borderRadius: 999, paddingHorizontal: SPACE.md, paddingVertical: 6 },
  lengths: { paddingLeft: MARKED_INSET, paddingRight: SPACE.lg, paddingBottom: SPACE.md },
  againWords: { color: "#ffffff", fontSize: TEXT.sm, fontWeight: "700" },
  // Groups keep their own margin from the edge; cards here keep the same.
  inset: { marginHorizontal: SPACE.lg },
  headline: { fontSize: TEXT.xl, lineHeight: 25, fontWeight: "600", paddingTop: SPACE.xs },
  sub: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  right: { fontSize: TEXT.sm },
  code: { fontFamily: "Menlo", fontSize: TEXT.sm - 1 },
  never: { fontWeight: "700" },
  add: { flexDirection: "row", alignItems: "center", gap: SPACE.md, minHeight: 44 },
  addMark: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  addWords: { flex: 1, fontSize: TEXT.md, fontWeight: "600" },
  notice: {
    marginHorizontal: SPACE.lg,
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  noticeHead: { flexDirection: "row", gap: SPACE.sm, alignItems: "flex-start" },
  noticeWords: { flex: 1, gap: 2 },
  noticeTitle: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, fontWeight: "600" },
  noticeButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    minHeight: 36,
    paddingHorizontal: SPACE.md,
    borderRadius: 999,
  },
  noticeButtonWords: { fontSize: TEXT.sm, fontWeight: "700" },
  snip: { borderRadius: RADIUS.md, padding: SPACE.md, gap: SPACE.sm },
  line: {
    fontFamily: "Menlo",
    fontSize: TEXT.xs,
    lineHeight: TEXT.xs * 1.5,
    padding: SPACE.sm,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
  },
  copy: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 32,
  },
  copyWords: { fontSize: TEXT.sm, fontWeight: "600" },
});
