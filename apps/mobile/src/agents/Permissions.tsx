/**
 * An agent's own Permissions page (ADR 0286), opened from its card, from the words of its band in a
 * room, and beside the card on a wide screen.
 *
 * At the top, what it may do right now: the art (an ask flying to whoever decides, or a gold line
 * while nothing has to), the words, and Stop or Let it work…, which opens in place to say what it
 * will do before anything changes. Then the banner, a little picture of it over a switch; what its
 * harness lets it do always, which is shared with the harness's other agents and says so; what it
 * has asked; and its harness, where the banner is switched for all its agents.
 *
 * What it says is core's (`agentPermissions`), so the web and the Mac say the same.
 */

import {
  ASKS_SO_FAR,
  agentPermissions,
  BANNER_FOOT,
  BANNER_HEADING,
  BANNER_ROW_WORDS,
  type AgentPermissions as Facts,
  HARNESS_LINK_LINE,
  LET_IT_WORK_WORDS,
  NOTHING_IN_SPACE_WORDS,
  nameOf,
  REMOVED_WORDS,
  SHOW_AGAIN_WORDS,
  type Snapshot,
  STOP_WORDS,
  type Store,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HarnessMark } from "../context/rows";
import { AlwaysList } from "../harnesses/AlwaysList";
import { Count } from "../harnesses/Asking";
import { DotRow, Hero } from "../harnesses/AskingMotion";
import { type Always, useAlways } from "../harnesses/useAlways";
import { type Asker, useDust } from "../spaces/Dust";
import { ListDust } from "../spaces/SelectMotion";
import { UndoPill } from "../spaces/UndoPill";
import { Avatar } from "../ui/Avatar";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { alpha } from "../ui/glassDial";
import { CLOSES, GROWS, GrowingView, OPENS, Opens } from "../ui/growing";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { ON_GOLD, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { useNow } from "../ui/useNow";
import { useReduceMotion } from "../ui/useReduceMotion";

/** The banner's own mark, the gold it wears in the room. */
export const BANNER_MARK = "#c79a12";
/** What Undo does, to a screen reader. */
const UNDO_HINT = "Puts the rule back, so it goes ahead without asking again";
/** How long a yes just sent stands before the button comes back, if the server never said it. */
const SENT_MS = 8000;

export function Permissions({
  store,
  snapshot,
  agentId,
  selfId,
  onOpenHarness,
  onOpenAsks,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string | undefined;
  readonly onOpenHarness: (harnessId: string) => void;
  /** Every ask so far, on its harness's page. */
  readonly onOpenAsks: (harnessId: string) => void;
}) {
  const column = useColumn();
  const insets = useSafeAreaInsets();
  const dust = useDust(useReduceMotion());
  const always = useAlways(store, snapshot);
  const now = useNow(true);
  const view = agentPermissions(
    {
      model: always.model,
      directory: snapshot.directory,
      banners: snapshot.banners,
      keepsBanners: snapshot.keepsBanners,
      keepsHeldStart: snapshot.keepsHeldStart,
    },
    agentId,
    selfId,
    now,
  );
  const removed = always.removed;
  return (
    <>
      <Opens>
        <ScrollView contentContainerStyle={[styles.body, column]} testID="permissions">
          <Top store={store} snapshot={snapshot} view={view} />
          {view.banner.mayChoose ? <BannerGroup store={store} view={view} /> : null}
          <GrowingView layout={GROWS}>
            <AlwaysGroup view={view} always={always} dust={dust.asker} />
            <AsksGroup view={view} onOpen={() => onOpenAsks(view.harnessId)} />
            <HarnessGroup view={view} onOpen={() => onOpenHarness(view.harnessId)} />
          </GrowingView>
        </ScrollView>
      </Opens>
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
}

/** What it may do right now, and the one thing to do about it. */
function Top({
  store,
  snapshot,
  view,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly view: Facts;
}) {
  const palette = usePalette();
  const { directory } = snapshot;
  const [confirming, setConfirming] = useState(false);
  const [sent, setSent] = useState(false);
  const working = view.held !== undefined;
  useEffect(() => {
    if (working) {
      setConfirming(false);
      setSent(false);
    }
  }, [working]);
  useEffect(() => {
    if (!sent) return;
    const timer = setTimeout(() => setSent(false), SENT_MS);
    return () => clearTimeout(timer);
  }, [sent]);
  const owner = directory[view.harnessId]?.ownerId;
  const spaceId = view.space?.id;
  const stop = () => {
    if (spaceId === undefined) return;
    feel.tap();
    store.stopLetWork({ spaceId, asker: view.agentId });
  };
  const start = () => {
    if (spaceId === undefined) return;
    feel.success();
    store.letAgentWork({ spaceId, asker: view.agentId });
    setConfirming(false);
    setSent(true);
  };
  return (
    <GrowingView
      layout={GROWS}
      style={[styles.top, { backgroundColor: palette.surface }]}
      testID="permissions-top"
    >
      <Hero
        harness={view.name}
        person={view.to}
        personName={owner === undefined ? "?" : nameOf(directory, owner)}
        face={owner === undefined ? undefined : directory[owner]?.face}
        own={
          <Avatar
            name={view.name}
            kind="agent"
            size="lg"
            icon={directory[view.agentId]?.face}
            decorative
          />
        }
        working={working}
      />
      <Text style={[styles.headline, { color: palette.ink }]} testID="permissions-headline">
        {view.headline}
      </Text>
      <Text style={[styles.sub, { color: palette.ink2 }]} testID="permissions-sub">
        {view.sub}
      </Text>
      {view.mayStop ? (
        <Act words={STOP_WORDS} onPress={stop} testID="permissions-stop" />
      ) : view.mayLetWork && !confirming ? (
        <Act
          words={LET_IT_WORK_WORDS}
          disabled={sent}
          onPress={() => {
            feel.tap();
            setConfirming(true);
          }}
          testID="permissions-let-work"
        />
      ) : null}
      {confirming && view.mayLetWork ? (
        <GrowingView entering={OPENS} exiting={CLOSES} style={styles.clip}>
          <View
            style={[styles.confirm, { backgroundColor: palette.goldSoft }]}
            testID="permissions-confirm"
          >
            <Text style={[styles.confirmWords, { color: palette.goldDeep }]}>
              {view.confirmWords}
            </Text>
            <View style={styles.confirmActs}>
              <Act
                words="Cancel"
                quiet
                onPress={() => {
                  feel.tap();
                  setConfirming(false);
                }}
                testID="permissions-cancel"
              />
              <Act
                words={view.confirmButton}
                gold
                onPress={start}
                testID="permissions-confirm-yes"
              />
            </View>
          </View>
        </GrowingView>
      ) : null}
    </GrowingView>
  );
}

function Act({
  words,
  quiet = false,
  gold = false,
  disabled = false,
  onPress,
  testID,
}: {
  readonly words: string;
  readonly quiet?: boolean;
  readonly gold?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const palette = usePalette();
  const ground = gold ? palette.gold : quiet ? "transparent" : palette.surface2;
  const ink = gold ? ON_GOLD : quiet ? palette.ink2 : palette.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.act,
        { backgroundColor: ground },
        pressed ? styles.pressed : null,
        disabled ? styles.dim : null,
      ]}
      testID={testID}
    >
      <Text style={[styles.actWords, { color: ink }]}>{words}</Text>
    </Pressable>
  );
}

/** The banner: a little picture of it, the switch, and that it is closed for now if it is. */
function BannerGroup({ store, view }: { readonly store: Store; readonly view: Facts }) {
  const { banner } = view;
  const [from, setFrom] = useState(false);
  useEffect(() => setFrom(true), []);
  const shows = banner.shown && banner.closed === undefined;
  const reopen = () => {
    if (view.space === undefined) return;
    feel.tap();
    store.reopenBanner({ spaceId: view.space.id, asker: view.agentId }).catch(() => feel.warning());
  };
  return (
    <GrowingView layout={GROWS}>
      <GroupHeading trailing={<OwnerChip name={view.harnessName} />}>{BANNER_HEADING}</GroupHeading>
      <Group inset={MARKED_INSET} testID="permissions-banner">
        <Preview view={view} shows={shows} animate={from} />
        <GroupRow
          label={BANNER_ROW_WORDS}
          sub={banner.sub}
          mark={<RowMark icon="banner" tint={BANNER_MARK} ink="#ffffff" />}
          accessibilityLabel={`${BANNER_ROW_WORDS}. ${banner.sub}`}
          trailing={
            <Switch
              value={banner.shown}
              onValueChange={(on) => {
                feel.tap();
                store.setAgentBanner(view.agentId, on).catch(() => feel.warning());
              }}
              accessibilityLabel={`${BANNER_ROW_WORDS} for ${view.name}`}
              testID="permissions-banner-switch"
            />
          }
          testID="permissions-banner-row"
        />
        {banner.closed === undefined ? null : (
          <GrowingView key="closed" entering={OPENS} exiting={CLOSES} style={styles.clip}>
            <GroupRow
              label={banner.closed.title}
              sub={banner.closed.line}
              trailing={
                <Act words={SHOW_AGAIN_WORDS} onPress={reopen} testID="permissions-show-again" />
              }
              testID="permissions-closed"
            />
          </GrowingView>
        )}
      </Group>
      <GroupFoot>{BANNER_FOOT}</GroupFoot>
    </GrowingView>
  );
}

/** The space's name and, under it, the band as it looks there, folding away when it won't show. */
function Preview({
  view,
  shows,
  animate,
}: {
  readonly view: Facts;
  readonly shows: boolean;
  readonly animate: boolean;
}) {
  const palette = usePalette();
  const moves = animate ? { entering: OPENS, exiting: CLOSES } : {};
  return (
    <GrowingView
      layout={GROWS}
      style={[styles.preview, { backgroundColor: palette.surface2 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="permissions-preview"
    >
      <View
        style={[styles.capsule, { backgroundColor: palette.surface, borderColor: palette.line }]}
      >
        <Text style={[styles.capsuleName, { color: palette.ink }]} numberOfLines={1}>
          {view.space?.name ?? "Its space"}
        </Text>
        <Text style={[styles.capsuleSub, { color: palette.ink3 }]} numberOfLines={1}>
          {view.name}
        </Text>
      </View>
      {shows ? (
        <GrowingView key="band" {...moves} style={styles.foldWide}>
          <View
            style={[
              styles.little,
              { backgroundColor: palette.goldSoft, borderColor: alpha(palette.gold, 0.5) },
            ]}
          >
            <View style={[styles.littleDot, { backgroundColor: palette.gold }]} />
            <Text style={[styles.littleWords, { color: palette.goldDeep }]} numberOfLines={1}>
              {view.banner.preview}
            </Text>
            <View style={[styles.littleStop, { borderColor: alpha(palette.goldDeep, 0.35) }]}>
              <Text style={[styles.littleStopWords, { color: palette.goldDeep }]}>
                {STOP_WORDS}
              </Text>
            </View>
            <Icon name="x" size={11} color={palette.goldDeep} weight={2.6} />
          </View>
        </GrowingView>
      ) : (
        <GrowingView key="none" {...moves} style={styles.foldWide}>
          <Text style={[styles.nothing, { color: palette.ink3 }]} testID="permissions-nothing">
            {NOTHING_IN_SPACE_WORDS}
          </Text>
        </GrowingView>
      )}
    </GrowingView>
  );
}

function OwnerChip({ name }: { readonly name: string }) {
  const palette = usePalette();
  return (
    <View style={styles.owner}>
      <HarnessMark name={name} side={14} />
      <Text style={[styles.ownerWords, { color: palette.ink3 }]} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

function AlwaysGroup({
  view,
  always,
  dust,
}: {
  readonly view: Facts;
  readonly always: Always;
  readonly dust: Asker;
}) {
  const palette = usePalette();
  return (
    <View testID="permissions-always-group">
      <GroupHeading trailing={<Count rules={view.rules} />}>Allowed always</GroupHeading>
      <Group>
        <View style={view.rules.length === 0 ? styles.noRules : null}>
          <AlwaysList
            rules={view.rules}
            always={always}
            dust={dust}
            may={view.mayChangeRules}
            paint={palette.surface}
            testID="permissions-always"
          />
        </View>
      </Group>
      <GroupFoot>{view.rulesFoot}</GroupFoot>
    </View>
  );
}

function AsksGroup({ view, onOpen }: { readonly view: Facts; readonly onOpen: () => void }) {
  const palette = usePalette();
  const { history } = view;
  if (history === undefined) return null;
  return (
    <View>
      <GroupHeading>{ASKS_SO_FAR}</GroupHeading>
      <Group>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${ASKS_SO_FAR}. ${history.line}`}
          accessibilityHint="Opens every ask"
          onPress={onOpen}
          style={({ pressed }) => [
            styles.asks,
            { backgroundColor: pressed ? palette.surface2 : palette.surface },
          ]}
          testID="permissions-asks"
        >
          <View style={styles.asksWords}>
            <DotRow dots={history.dots} />
            <Text style={[styles.asksLine, { color: palette.ink3 }]}>{history.line}</Text>
          </View>
          <Icon name="next" size={16} color={palette.ink4} />
        </Pressable>
      </Group>
    </View>
  );
}

function HarnessGroup({ view, onOpen }: { readonly view: Facts; readonly onOpen: () => void }) {
  return (
    <View>
      <GroupHeading>Harness</GroupHeading>
      <Group inset={MARKED_INSET}>
        <GroupRow
          label={view.harnessName}
          sub={HARNESS_LINK_LINE}
          mark={<HarnessMark name={view.harnessName} side={28} />}
          onPress={onOpen}
          testID="permissions-harness"
        />
      </Group>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingBottom: SPACE.xxl * 2 },
  top: {
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.xl,
    gap: SPACE.sm,
  },
  headline: { fontSize: TEXT.xl, lineHeight: 25, fontWeight: "700" },
  sub: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
  clip: { overflow: "hidden" },
  confirm: { marginTop: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.lg, gap: SPACE.md },
  confirmWords: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4, fontWeight: "500" },
  confirmActs: { flexDirection: "row", justifyContent: "flex-end", gap: SPACE.xs },
  act: {
    alignSelf: "flex-start",
    marginTop: SPACE.xs,
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.sm + 2,
    borderRadius: RADIUS.pill,
  },
  actWords: { fontSize: TEXT.md, fontWeight: "600" },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.45 },
  preview: { alignItems: "center", padding: SPACE.md, paddingBottom: SPACE.sm + 2 },
  capsule: {
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.pill,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 3,
    marginBottom: SPACE.sm,
    maxWidth: "80%",
  },
  capsuleName: { fontSize: TEXT.xs + 0.5, fontWeight: "600" },
  capsuleSub: { fontSize: TEXT.xs - 1.5 },
  foldWide: { alignSelf: "stretch", overflow: "hidden" },
  little: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  littleDot: { width: 6, height: 6, borderRadius: 3 },
  littleWords: { flex: 1, fontSize: TEXT.xs - 0.5, fontWeight: "600" },
  littleStop: {
    borderWidth: 1,
    borderRadius: RADIUS.pill,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  littleStopWords: { fontSize: TEXT.xs - 1, fontWeight: "700" },
  nothing: { textAlign: "center", fontSize: TEXT.xs + 0.5, paddingVertical: 6 },
  owner: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  ownerWords: { fontSize: TEXT.sm, fontWeight: "500" },
  noRules: { padding: SPACE.lg },
  asks: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  asksWords: { flex: 1, gap: SPACE.sm },
  asksLine: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
});
