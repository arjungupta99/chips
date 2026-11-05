/**
 * The Search tab's rows (ADR 0132), one component for each kind core's `searchItems` lists.
 *
 * - **A space:** its face, its name with the typed part marked, who is in it (or the member it was
 *   found by, marked) and when it last spoke, Archived when it is.
 * - **An agent:** its face, its name marked, and the Agents tab's own line under it, with the
 *   harness marked when that is what was typed; the Main tag after a Main agent's name, as on the
 *   Agents tab (ADR 0145); Free in amber, Archived at the right.
 * - **A message:** who said it and where, when, and the server's words with what it matched
 *   marked; a voice note says so, and a step of a run starts with a prompt. One said in an
 *   archived space says Archived before when, and opens it to read.
 *
 * The rows run to both edges with a hairline inset to where the words start, as every list here
 * does, and the marks are the room's flash colours (`Marked`).
 */

import {
  type AgentFound,
  hitArchived,
  hitAuthor,
  hitPlace,
  markedParts,
  plainWords,
  SEARCH_ARRIVAL,
  type SearchHit,
  type SearchItem,
  type Snapshot,
  type SpaceFound,
  snippetParts,
  spaceFoundLine,
} from "@chipschat/core";
import type { ReactElement, ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RowAvatar } from "../spaces/RowAvatar";
import { clockOrDay } from "../spaces/when";
import { Avatar, avatarSide, faceGround } from "../ui/Avatar";
import { Icon } from "../ui/Icon";
import { MainTag } from "../ui/MainTag";
import { Marked } from "../ui/Marked";
import { useSplitSide } from "../ui/Split";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Hint } from "./Hint";
import { hitAt } from "./items";
import { Breathing } from "./ResultsMotion";

/** What a row needs beyond itself: the workspace, the clock, and where each press goes. */
export interface RowContext {
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly now: number;
  readonly onOpenSpace: (spaceId: string) => void;
  readonly onOpenAgent: (agentId: string) => void;
  readonly onOpenHit: (hit: SearchHit) => void;
  readonly onRecent: (text: string) => void;
  readonly onForget: (text: string) => void;
  readonly onClear: () => void;
  readonly onSeeAll: (scope: "spaces" | "agents") => void;
  /** A failed ask, asked again. */
  readonly onRetry: () => void;
  /** The server, reached for again. */
  readonly onWake: () => void;
  /** What is open beside the results on an iPad (ADR 0256), whose row is chosen. */
  readonly open?: OpenBeside | undefined;
}

/** What a result opened beside the results: a room, at a line or at its end, or an agent's card. */
export interface OpenBeside {
  readonly space?: string | undefined;
  readonly at?: string | undefined;
  readonly agent?: string | undefined;
}

type RowOf<K extends SearchItem["kind"]> = (props: {
  readonly item: Extract<SearchItem, { kind: K }>;
  readonly context: RowContext;
}) => ReactElement;

const ROWS: { readonly [K in SearchItem["kind"]]: RowOf<K> } = {
  heading: ({ item }) => <Heading title={item.title} />,
  recents: ({ context }) => <RecentsHeading onClear={context.onClear} />,
  recent: ({ item, context }) => <RecentRow item={item} context={context} />,
  hint: () => <Hint />,
  space: ({ item, context }) => <SpaceRow item={item} context={context} />,
  agent: ({ item, context }) => <AgentResultRow item={item} context={context} />,
  seeAll: ({ item, context }) => <SeeAll item={item} onPress={context.onSeeAll} />,
  message: ({ item, context }) => <MessageRow item={item} context={context} />,
  placeholder: ({ item }) => <Placeholder first={item.first} />,
  offline: ({ context }) => (
    <Notice
      tone="amber"
      icon="offline"
      title="Can't reach your server."
      words="Messages are searched there."
      onPress={context.onWake}
    />
  ),
  failed: ({ context }) => (
    <Notice
      tone="plain"
      icon="alert"
      title="The search didn't go through."
      onPress={context.onRetry}
    />
  ),
  fewLetters: () => <Quiet>Messages are found from two letters on.</Quiet>,
  fetching: () => <Fetching />,
  nothing: ({ item }) => <Nothing text={item.text} looksAt={item.looksAt} />,
};

/** One row of the results, whichever kind it is. */
export function ResultRow({
  item,
  context,
}: {
  readonly item: SearchItem;
  readonly context: RowContext;
}) {
  const Row = ROWS[item.kind] as RowOf<typeof item.kind>;
  return <Row item={item as never} context={context} />;
}

/** The face a result wears: a size down from a list's (`Avatar`'s `result`). */
const FACE = avatarSide("result");

function Heading({ title, action }: { readonly title: string; readonly action?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={[styles.headingText, { color: palette.ink3 }]}>
        {title}
      </Text>
      {action}
    </View>
  );
}

function RecentsHeading({ onClear }: { readonly onClear: () => void }) {
  const palette = usePalette();
  return (
    <Heading
      title="Recent"
      action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear recent searches"
          hitSlop={SPACE.sm}
          onPress={onClear}
        >
          <Text style={[styles.clear, { color: palette.accent }]}>Clear</Text>
        </Pressable>
      }
    />
  );
}

function RecentRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "recent" }>;
  readonly context: RowContext;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Search for ${item.text}`}
      onPress={() => context.onRecent(item.text)}
      style={({ pressed }) => [
        styles.recent,
        // Clear at rest, so the backdrop\'s faces drift behind it (ADR 0136).
        { backgroundColor: pressed ? palette.surface2 : "transparent" },
      ]}
      testID={`recent-${item.text}`}
    >
      {item.first ? null : (
        <View style={[styles.hairline, styles.recentLine, { backgroundColor: palette.line }]} />
      )}
      <Icon name="clock" size={20} color={palette.ink3} />
      <Text style={[styles.recentText, { color: palette.ink }]} numberOfLines={1}>
        {item.text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Forget ${item.text}`}
        hitSlop={SPACE.md}
        onPress={() => context.onForget(item.text)}
      >
        <Icon name="x" size={16} color={palette.ink3} />
      </Pressable>
    </Pressable>
  );
}

function Quiet({ children }: { readonly children: string }) {
  const palette = usePalette();
  return <Text style={[styles.quiet, { color: palette.ink3 }]}>{children}</Text>;
}

/** A row a result is drawn in: pressed, it opens; a hairline over it unless it is first. */
function ResultPress({
  label,
  first,
  selected = false,
  onPress,
  testID,
  children,
}: {
  readonly label: string;
  readonly first: boolean;
  /** Open beside the results: in the split, a tile set in from the list's edges (ADR 0256). */
  readonly selected?: boolean;
  readonly onPress: () => void;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const palette = usePalette();
  const inset = useSplitSide() === "list";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={inset ? { selected } : undefined}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: !inset && pressed ? palette.surface2 : palette.bg },
      ]}
    >
      {({ pressed }) => (
        <>
          {inset && (pressed || selected) ? (
            <View
              pointerEvents="none"
              style={[
                styles.tile,
                { backgroundColor: selected ? palette.surface3 : palette.surface2 },
              ]}
              testID="result-tile"
            />
          ) : null}
          {first || selected ? null : (
            <View style={[styles.hairline, { backgroundColor: palette.line }]} />
          )}
          {children}
        </>
      )}
    </Pressable>
  );
}

function Chevron() {
  const palette = usePalette();
  return <Text style={[styles.chevron, { color: palette.ink4 }]}>{"›"}</Text>;
}

/** The line under a space's name: who it was found by, or who is in it; then when it last spoke. */
function spaceLine(found: SpaceFound, context: RowContext) {
  const at = found.space.lastActivityAt;
  const when = at === undefined ? "" : clockOrDay(at, context.now);
  return spaceFoundLine(found, context.snapshot.directory, context.selfId, when);
}

function SpaceRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "space" }>;
  readonly context: RowContext;
}) {
  const palette = usePalette();
  const { found } = item;
  const { snapshot } = context;
  const line = spaceLine(found, context);
  return (
    <ResultPress
      label={found.title}
      first={item.first}
      selected={
        context.open?.space === found.space.id &&
        context.open.at === undefined &&
        context.open.agent === undefined
      }
      onPress={() => context.onOpenSpace(found.space.id)}
      testID={`result-space-${found.space.id}`}
    >
      <RowAvatar
        space={found.space}
        directory={snapshot.directory}
        title={found.title}
        icon={snapshot.spaceIcons.get(found.space.id)}
        size="result"
      />
      <View style={styles.body}>
        <View style={styles.top}>
          <Marked
            parts={markedParts(found.title, found.marks)}
            style={[styles.name, { color: palette.ink }]}
            lines={1}
          />
          {found.closed ? (
            <Text style={[styles.aside, { color: palette.ink3 }]}>Archived</Text>
          ) : null}
        </View>
        {line.length === 0 ? null : (
          <Marked parts={line} style={[styles.sub, { color: palette.ink3 }]} lines={1} />
        )}
      </View>
      <Chevron />
    </ResultPress>
  );
}

function AgentResultRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "agent" }>;
  readonly context: RowContext;
}) {
  const palette = usePalette();
  const { row, marks, lineMarks } = item.found satisfies AgentFound;
  return (
    <ResultPress
      label={`${row.name}${row.lead ? ", Main agent" : ""}, ${row.line}`}
      first={item.first}
      selected={context.open?.agent === row.id}
      onPress={() => context.onOpenAgent(row.id)}
      testID={`result-agent-${row.id}`}
    >
      <Avatar name={row.name} kind="agent" size="result" icon={row.face} decorative />
      <View style={styles.body}>
        <View style={styles.top}>
          <Marked
            parts={markedParts(row.name, marks)}
            style={[styles.name, { color: palette.ink }]}
            lines={1}
          />
          {row.lead ? <MainTag hue={faceGround(row.name, row.face)} /> : null}
          {row.archived ? (
            <Text style={[styles.aside, { color: palette.ink3 }]}>Archived</Text>
          ) : null}
        </View>
        <Marked
          parts={markedParts(row.line, lineMarks)}
          style={[styles.sub, { color: row.free ? palette.amberInk : palette.ink3 }]}
          lines={1}
        />
      </View>
      <Chevron />
    </ResultPress>
  );
}

function SeeAll({
  item,
  onPress,
}: {
  readonly item: Extract<SearchItem, { kind: "seeAll" }>;
  readonly onPress: (scope: "spaces" | "agents") => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`See all ${item.count} ${item.scope}`}
      onPress={() => onPress(item.scope)}
      style={({ pressed }) => [styles.seeAll, { opacity: pressed ? 0.6 : 1 }]}
      testID={`see-all-${item.scope}`}
    >
      <Text style={[styles.seeAllText, { color: palette.accent }]}>{`See all ${item.count}`}</Text>
    </Pressable>
  );
}

function MessageRow({
  item,
  context,
}: {
  readonly item: Extract<SearchItem, { kind: "message" }>;
  readonly context: RowContext;
}) {
  const palette = usePalette();
  const { hit, space } = item;
  const { model, directory } = context.snapshot;
  const who = hitAuthor(hit, space, directory, context.selfId);
  const where = hitPlace(space, model, directory, context.selfId);
  const step = hit.kind === "receipt";
  const voice = hit.snippetFrom === "transcript";
  const archived = hitArchived(space, model);
  const when = clockOrDay(hit.at, context.now);
  return (
    <ResultPress
      label={`${who.name} in ${where}${archived ? ", archived" : ""}`}
      first={item.first}
      selected={
        context.open?.agent === undefined &&
        context.open?.space === hit.spaceId &&
        context.open.at === hitAt(hit)
      }
      onPress={() => context.onOpenHit(hit)}
      testID={`result-message-${hit.lineId ?? hit.stepId ?? hit.at}`}
    >
      <View style={styles.messageFace}>
        <Avatar name={who.face} kind={who.kind} icon={who.icon} size="md" decorative />
      </View>
      <View style={styles.body}>
        <View style={styles.top}>
          <Text style={[styles.said, { color: palette.ink3 }]} numberOfLines={1}>
            <Text style={[styles.who, { color: palette.ink }]}>{who.name}</Text>
            {step ? " step in " : " in "}
            {where}
          </Text>
          <Text style={[styles.aside, { color: palette.ink3 }]}>
            {archived ? `Archived · ${when}` : when}
          </Text>
        </View>
        <Marked
          parts={snippetParts(plainWords(hit.snippet))}
          style={[styles.snippet, { color: palette.ink }]}
          lines={2}
        >
          {voice ? (
            <Text style={{ color: palette.ink3 }}>
              <Icon name="mic" size={13} color={palette.ink3} />
              {" voice note  "}
            </Text>
          ) : null}
          {step ? <Text style={{ color: palette.ink3 }}>{">_ "}</Text> : null}
        </Marked>
      </View>
    </ResultPress>
  );
}

/**
 * A message on its way, the first time: the shape of a row, with nothing in it yet, breathing — the
 * second a beat after the first — until the messages come and take its place (ADR 0189).
 */
function Placeholder({ first }: { readonly first: boolean }) {
  const palette = usePalette();
  return (
    <View accessibilityLabel="Searching messages" style={styles.row} testID="result-placeholder">
      {first ? null : <View style={[styles.hairline, { backgroundColor: palette.line }]} />}
      <Breathing lag={first ? 0 : SEARCH_ARRIVAL.breathLagMs} style={styles.ghostRow}>
        <View style={[styles.ghostFace, { backgroundColor: palette.surface2 }]} />
        <View style={[styles.body, styles.ghostBody]}>
          <View style={[styles.ghost, styles.ghostShort, { backgroundColor: palette.surface2 }]} />
          <View style={[styles.ghost, { backgroundColor: palette.surface2 }]} />
        </View>
      </Breathing>
    </View>
  );
}

function Notice({
  tone,
  icon,
  title,
  words,
  onPress,
}: {
  readonly tone: "amber" | "plain";
  readonly icon: "offline" | "alert";
  readonly title: string;
  readonly words?: string | undefined;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const ink = tone === "amber" ? palette.amberInk : palette.ink;
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: tone === "amber" ? palette.amberSoft : palette.surface2 },
      ]}
      testID={`search-${icon === "offline" ? "offline" : "failed"}`}
    >
      <Icon name={icon} size={18} color={ink} />
      <Text style={[styles.noticeText, { color: ink }]}>
        <Text style={styles.noticeTitle}>{title}</Text>
        {words === undefined ? "" : ` ${words}`}
      </Text>
      <Pressable accessibilityRole="button" hitSlop={SPACE.sm} onPress={onPress}>
        <Text
          style={[
            styles.noticeAct,
            { color: tone === "amber" ? palette.amberInk : palette.accent },
          ]}
        >
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

function Fetching() {
  const palette = usePalette();
  return (
    <View style={styles.fetching} accessibilityLabel="Finding more messages">
      <ActivityIndicator color={palette.ink3} />
    </View>
  );
}

/** What a search looked at is core's to say: on one letter in All, only the names. */
function Nothing({ text, looksAt }: { readonly text: string; readonly looksAt: string }) {
  const palette = usePalette();
  return (
    <View style={styles.nothing} testID="search-nothing">
      <Icon name="search" size={28} color={palette.ink4} />
      <Text style={[styles.nothingTitle, { color: palette.ink }]}>
        {`Nothing for “${text.trim()}”`}
      </Text>
      <Text style={[styles.nothingWords, { color: palette.ink3 }]}>{looksAt}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.xs,
  },
  headingText: {
    fontSize: TEXT.sm,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  clear: { fontSize: TEXT.md, fontWeight: "600" },
  recent: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    minHeight: 48,
  },
  recentLine: { left: SPACE.lg + 20 + SPACE.md },
  recentText: { flex: 1, fontSize: TEXT.body },
  quiet: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg, fontSize: TEXT.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm + 2,
    minHeight: 64,
  },
  // The margin, the face and the gap: the hairline starts where the words do.
  // The open row beside the results, as Spaces draws its open row beside a room (ADR 0256).
  tile: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: SPACE.sm,
    right: SPACE.sm,
    borderRadius: RADIUS.xl,
  },
  hairline: {
    position: "absolute",
    left: SPACE.lg + FACE + SPACE.md,
    right: 0,
    top: 0,
    height: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 2 },
  top: { flexDirection: "row", alignItems: "baseline", gap: SPACE.sm },
  name: { fontSize: TEXT.body, fontWeight: "600", flexShrink: 1 },
  aside: { fontSize: TEXT.sm, marginLeft: "auto" },
  sub: { fontSize: TEXT.sm },
  chevron: { fontSize: TEXT.body, opacity: 0.8 },
  seeAll: { paddingHorizontal: SPACE.lg, paddingVertical: SPACE.sm, alignSelf: "flex-start" },
  seeAllText: { fontSize: TEXT.md, fontWeight: "600" },
  // A message's face sits level with its first line, not its middle: the words under it run on.
  messageFace: { width: FACE, alignItems: "center", alignSelf: "flex-start", paddingTop: 2 },
  said: { fontSize: TEXT.sm, flexShrink: 1 },
  who: { fontWeight: "600" },
  snippet: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.35 },
  ghostFace: {
    width: avatarSide("md"),
    height: avatarSide("md"),
    borderRadius: RADIUS.pill,
    marginHorizontal: 2,
  },
  ghostRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.md },
  ghostBody: { gap: SPACE.sm },
  ghost: { height: 10, borderRadius: RADIUS.sm },
  ghostShort: { width: "45%" },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    marginHorizontal: SPACE.lg,
    marginTop: SPACE.xs,
    padding: SPACE.md,
    borderRadius: RADIUS.lg,
  },
  noticeText: { flex: 1, fontSize: TEXT.md },
  noticeTitle: { fontWeight: "600" },
  noticeAct: { fontSize: TEXT.md, fontWeight: "600" },
  fetching: { paddingVertical: SPACE.lg },
  nothing: {
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.xxl,
  },
  nothingTitle: { fontSize: TEXT.body, fontWeight: "600", textAlign: "center" },
  nothingWords: { fontSize: TEXT.md, textAlign: "center" },
});
