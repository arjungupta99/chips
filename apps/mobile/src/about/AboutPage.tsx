/**
 * About Chips (ADR 0295): the page About Chips's row opens, pushed over You on a phone and beside
 * its list on an iPad. It opens on the chip, whose pins light once round the circuit as the page
 * comes in and again when it is tapped; under it the name, the build in a capsule that copies a
 * line for a bug report, and one sentence on what Chips is. Then the computer and the version it
 * runs, with what waits for it when it is behind this device, and an Update button where a newer
 * version waits for either, which sends out the update dot's ring as the page comes in (ADR 0296);
 * the Update dot switch; what the release changed; the links;
 * the licence and the open-source code Chips is built on; and who made it.
 *
 * The rows a level deeper (What's new, Licence, Acknowledgements) are screens of their own on a
 * phone, and on an iPad stand in a third column beside the page (ADR 0276).
 */

import {
  ABOUT_LINK_ROWS,
  ABOUT_LINKS,
  aboutBlurb,
  appUpdateLine,
  BUILD_COPIED,
  bugReportLine,
  buildCapsule,
  CHIPS_HEADING,
  COMPUTER_UNREACHED,
  computerBehind,
  computerLine,
  computerRow,
  DOT_SWITCH,
  dotFoot,
  LEGAL_HEADING,
  MADE_BY,
  NAMED_FOR,
  NEEDS_UPDATE_FOOT,
  NEEDS_UPDATE_HEADING,
  type NeedsUpdateRow,
  NIGHT_SWITCH,
  nightFoot,
  releaseOf,
  SELF_UPDATE_COMMAND,
  SHARE_CHIPS,
  type Store,
  UPDATE_BUTTON,
  UPDATE_NOW_HEADING,
  UPDATES_HEADING,
  type UpdateWaiting,
  updateNowNote,
  whatsNewRow,
} from "@chipschat/core";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { thisDevice } from "../device/word";
import { Line } from "../harnesses/Connect";
import { ChipPulse, ROUND } from "../ui/ChipPulse";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { tap } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { UnderName, useColumn } from "../ui/Screen";
import { shareText } from "../ui/share";
import { usePalette } from "../ui/theme";
import { AVATAR_HUES, ICON_GROUNDS, ON_GOLD, SPACE, TEXT } from "../ui/tokens";
import { roundMs } from "../ui/turns";
import { UpdateButton } from "../updates/UpdateButton";
import { NeedsDot } from "../updates/UpdateDot";
import { useUpdates } from "../updates/updates";
import { useThirdPage } from "../you/pages";
import { appBuild, systemWords } from "./build";
import { type Computer, useComputer } from "./useComputer";

/** How long the pins take to go round once, and the last one to go out. */
const ROUND_MS = roundMs(ROUND) + ROUND.fallMs;

/** How long the capsule says it copied before it says the build again. */
const COPIED_MS = 1900;

/** The size the chip is drawn at, over the name. */
const MARK_SIZE = 88;

/** A link's row opens it in Safari; nothing is said if it can't, as everywhere else. */
function open(url: string): void {
  void Linking.openURL(url).catch(() => undefined);
}

export function AboutPage(_props: { readonly store?: Store }) {
  const palette = usePalette();
  const column = useColumn();
  const router = useRouter();
  const build = appBuild();
  const computer = useComputer();
  // Counts up each time the page comes into view: the Update buttons ring for each.
  const [ring, setRing] = useState(0);
  useFocusEffect(useCallback(() => setRing((was) => was + 1), []));
  const whatsNew = useThirdPage("whats-new", () => router.push("/about/whats-new"));
  const licence = useThirdPage("licence", () => router.push("/about/licence"));
  const notices = useThirdPage("notices", () => router.push("/about/notices"));
  const release = releaseOf(build.version);
  const phone = Platform.OS !== "web";

  return (
    <UnderName contentContainerStyle={[styles.page, column]} testID="about-page">
      <Top build={build} computer={computer} />
      <Updates computer={computer} version={build.version} ring={ring} />
      <NeedsUpdate />
      <DotSwitch />
      {release !== undefined && (
        <Group inset={MARKED_INSET} testID="about-whats-new">
          <GroupRow
            label={whatsNewRow(release.version)}
            sub={release.line}
            subLines={2}
            mark={<RowMark icon="sparkle" tint={AVATAR_HUES[5]} ink="#ffffff" />}
            onPress={whatsNew.onPress}
            selected={whatsNew.selected}
            testID="about-whats-new-row"
          />
        </Group>
      )}
      <View>
        <GroupHeading>{CHIPS_HEADING}</GroupHeading>
        <Group inset={MARKED_INSET} testID="about-links">
          <GroupRow
            label={ABOUT_LINK_ROWS.website.label}
            value={ABOUT_LINK_ROWS.website.value}
            mark={<RowMark icon="globe" tint={AVATAR_HUES[4]} ink="#ffffff" />}
            onPress={() => open(ABOUT_LINKS.website)}
            testID="about-website"
          />
          <GroupRow
            label={ABOUT_LINK_ROWS.docs.label}
            mark={<RowMark icon="list" tint={AVATAR_HUES[3]} ink="#ffffff" />}
            onPress={() => open(ABOUT_LINKS.docs)}
            testID="about-docs"
          />
          <GroupRow
            label={ABOUT_LINK_ROWS.support.label}
            mark={<RowMark icon="mail" tint={AVATAR_HUES[7]} ink="#ffffff" />}
            onPress={() => open(ABOUT_LINKS.support)}
            testID="about-support"
          />
          {phone && (
            <GroupRow
              label={ABOUT_LINK_ROWS.rate.label}
              mark={<RowMark icon="star" tint={ICON_GROUNDS[9]} ink="#ffffff" />}
              onPress={() => open(ABOUT_LINKS.review)}
              testID="about-rate"
            />
          )}
          {phone && (
            <GroupRow
              label={ABOUT_LINK_ROWS.share.label}
              mark={<RowMark icon="share" tint={AVATAR_HUES[1]} ink="#ffffff" />}
              onPress={() => void shareText(SHARE_CHIPS).catch(() => undefined)}
              testID="about-share"
            />
          )}
        </Group>
      </View>
      <View>
        <GroupHeading>{LEGAL_HEADING}</GroupHeading>
        <Group inset={MARKED_INSET} testID="about-legal">
          <GroupRow
            label={ABOUT_LINK_ROWS.privacy.label}
            mark={<RowMark icon="lock" tint={ICON_GROUNDS[14]} ink="#ffffff" />}
            onPress={() => open(ABOUT_LINKS.privacy)}
            testID="about-privacy"
          />
          <GroupRow
            label={ABOUT_LINK_ROWS.licence.label}
            sub={ABOUT_LINK_ROWS.licence.sub}
            mark={<RowMark icon="doc" tint={AVATAR_HUES[2]} ink="#ffffff" />}
            onPress={licence.onPress}
            selected={licence.selected}
            testID="about-licence"
          />
          <GroupRow
            label={ABOUT_LINK_ROWS.notices.label}
            sub={ABOUT_LINK_ROWS.notices.sub}
            mark={<RowMark icon="heart" tint={AVATAR_HUES[0]} ink="#ffffff" />}
            onPress={notices.onPress}
            selected={notices.selected}
            testID="about-notices"
          />
        </Group>
      </View>
      <Text style={[styles.made, { color: palette.ink3 }]} testID="about-made">
        {MADE_BY}
        {"\n"}
        {NAMED_FOR}
      </Text>
    </UnderName>
  );
}

/**
 * The chip, the name, the capsule and the sentence. The pins go round once as the page comes into
 * view and once more each time the chip is tapped.
 */
function Top({
  build,
  computer,
}: {
  readonly build: ReturnType<typeof appBuild>;
  readonly computer: Computer;
}) {
  const palette = usePalette();
  const [lighting, setLighting] = useState(false);
  const [copied, setCopied] = useState(false);
  const timers = useRef<{
    light?: ReturnType<typeof setTimeout>;
    copy?: ReturnType<typeof setTimeout>;
  }>({});
  const light = useCallback(() => {
    clearTimeout(timers.current.light);
    setLighting(true);
    timers.current.light = setTimeout(() => setLighting(false), ROUND_MS);
  }, []);
  useFocusEffect(light);
  useEffect(() => {
    const held = timers.current;
    return () => {
      clearTimeout(held.light);
      clearTimeout(held.copy);
    };
  }, []);
  const copy = () => {
    const line = bugReportLine({
      ...build,
      system: systemWords(),
      computer: computer.kind === "read" ? computer.facts : undefined,
    });
    void Clipboard.setStringAsync(line).then(() => {
      tap();
      setCopied(true);
      clearTimeout(timers.current.copy);
      timers.current.copy = setTimeout(() => setCopied(false), COPIED_MS);
    });
  };
  const capsule = buildCapsule(build.version, build.build, build.commit);
  return (
    <View style={styles.top}>
      <Pressable
        onPress={light}
        accessibilityRole="image"
        accessibilityLabel="The Chips mark"
        style={styles.mark}
        testID="about-mark"
      >
        <ChipPulse
          gold={palette.gold}
          ink={palette.ink3}
          lit={palette.ink}
          lighting={lighting}
          size={MARK_SIZE}
        />
      </Pressable>
      <Text
        style={[styles.name, { color: palette.ink }]}
        accessibilityRole="header"
        testID="about-name"
      >
        Chips
      </Text>
      <Pressable
        onPress={copy}
        accessibilityRole="button"
        accessibilityLabel={`Version ${capsule}`}
        accessibilityHint="Copies the version for a bug report"
        style={({ pressed }) => [
          styles.capsule,
          {
            backgroundColor: palette.raised,
            borderColor: palette.line,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
        testID="about-capsule"
      >
        <Text
          style={[styles.capsuleWords, { color: copied ? palette.green : palette.ink2 }]}
          numberOfLines={1}
        >
          {copied ? BUILD_COPIED : capsule}
        </Text>
        <Icon name="copy" size={13} color={copied ? palette.green : palette.ink3} />
      </Pressable>
      <Text style={[styles.blurb, { color: palette.ink2 }]}>{aboutBlurb(thisDevice())}</Text>
    </View>
  );
}

/**
 * This device and the computer: the version each runs, and where a newer one waits, the version
 * and an Update button (ADR 0296). The App Store for this app; the steps for the computer, which
 * only its owner is offered. The foot says what waits for the computer when it is behind this
 * device (ADR 0295).
 */
function Updates({
  computer,
  version,
  ring,
}: {
  readonly computer: Computer;
  readonly version: string;
  readonly ring: number;
}) {
  const { waiting, asking, selfUpdate, setNightly } = useUpdates();
  const [showNow, setShowNow] = useState(false);
  const facts = computer.kind === "read" ? computer.facts : undefined;
  const behind = facts === undefined ? undefined : computerBehind(version, facts, thisDevice(true));
  // A computer from the install line updates itself at night, with its owner's word (ADR 0297).
  const nightly = selfUpdate?.available === true ? selfUpdate : undefined;
  const machine = facts?.machine ?? "Your computer";
  const target = waiting.computer;
  return (
    <View>
      <GroupHeading>{UPDATES_HEADING}</GroupHeading>
      <Group inset={MARKED_INSET} testID="about-updates">
        <AppRow version={version} waiting={waiting.app} ring={ring} />
        <ComputerRow
          computer={computer}
          line={computerLine(target, selfUpdate)}
          updates={asking.computer !== undefined}
          ring={ring}
          order={waiting.app === undefined ? 0 : 1}
          onUpdate={
            nightly === undefined
              ? () => open(ABOUT_LINKS.updating)
              : () => setShowNow((shown) => !shown)
          }
        />
        {nightly !== undefined && <NightRow on={nightly.automatic} onChange={setNightly} />}
      </Group>
      {nightly !== undefined ? (
        <GroupFoot testID="about-night-foot">{nightFoot(nightly, machine, Date.now())}</GroupFoot>
      ) : (
        behind !== undefined && <GroupFoot testID="about-behind">{behind}</GroupFoot>
      )}
      {nightly !== undefined && target !== undefined && showNow && (
        <View testID="about-update-now">
          <GroupHeading>{UPDATE_NOW_HEADING}</GroupHeading>
          <View style={styles.now}>
            <Line
              text={SELF_UPDATE_COMMAND}
              standIn={SELF_UPDATE_COMMAND}
              failed={undefined}
              prose={false}
              run
              note={updateNowNote(machine, target.version)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

/** The night switch under a computer from the install line: off until its owner turns it on. */
function NightRow(props: { readonly on: boolean; readonly onChange: (on: boolean) => void }) {
  return (
    <GroupRow
      label={NIGHT_SWITCH}
      mark={<RowMark icon="moon" tint={AVATAR_HUES[4]} ink="#ffffff" />}
      trailing={
        <Switch
          value={props.on}
          onValueChange={props.onChange}
          accessibilityLabel={NIGHT_SWITCH}
          testID="about-night-switch"
        />
      }
      testID="about-night"
    />
  );
}

/**
 * Everything that needs someone, for the owner, under Updates (ADR 0297): a bridge that couldn't
 * update or needs a line where it runs, which opens its harness page, and the iPhones, iPads and
 * Macs older than what is out, by whose they are. Each wears the update dot at its end, clear of
 * the chevron. Gone when nothing needs an update.
 */
function NeedsUpdate() {
  const { needs } = useUpdates();
  const router = useRouter();
  if (needs.length === 0) return null;
  return (
    <View>
      <GroupHeading>{NEEDS_UPDATE_HEADING}</GroupHeading>
      <Group inset={MARKED_INSET} testID="about-needs">
        {needs.map((row) => (
          <NeedsRow
            key={row.key}
            row={row}
            onOpen={
              row.harnessId === undefined
                ? undefined
                : () =>
                    router.push({
                      pathname: "/harnesses/[id]",
                      params: { id: row.harnessId ?? "" },
                    })
            }
          />
        ))}
      </Group>
      <GroupFoot>{NEEDS_UPDATE_FOOT}</GroupFoot>
    </View>
  );
}

function NeedsRow(props: {
  readonly row: NeedsUpdateRow;
  readonly onOpen?: (() => void) | undefined;
}) {
  const { row, onOpen } = props;
  const icon =
    row.kind === "bridge"
      ? "terminal"
      : row.app === "mac"
        ? "laptop"
        : row.app === "ipad"
          ? "tablet"
          : "handset";
  const tint =
    row.kind === "bridge" ? AVATAR_HUES[5] : row.app === "ipad" ? AVATAR_HUES[3] : AVATAR_HUES[0];
  return (
    <GroupRow
      label={row.label}
      sub={row.sub}
      mark={<RowMark icon={icon} tint={tint} ink="#ffffff" />}
      trailing={
        <View style={styles.needsEnd}>
          <NeedsDot />
          {/* A row that opens nothing keeps the chevron's room, so the dots stand in a column. */}
          {onOpen === undefined && <View style={styles.noChevron} />}
        </View>
      }
      onPress={onOpen}
      testID={`about-needs-${row.kind}`}
    />
  );
}

/** This device's row: its version, or the App Store's newer one with Update. */
function AppRow({
  version,
  waiting,
  ring,
}: {
  readonly version: string;
  readonly waiting: UpdateWaiting | undefined;
  readonly ring: number;
}) {
  return (
    <GroupRow
      label={thisDevice(true)}
      sub={waiting === undefined ? undefined : appUpdateLine("phone", waiting)}
      value={waiting === undefined ? version : undefined}
      mark={<RowMark icon={Platform.OS === "ios" && Platform.isPad ? "tablet" : "handset"} />}
      trailing={
        waiting === undefined ? undefined : (
          <UpdateButton
            label={UPDATE_BUTTON}
            onPress={() => open(ABOUT_LINKS.appStore)}
            ring={ring}
            testID="about-update-app"
          />
        )
      }
      testID="about-app-row"
    />
  );
}

/** What the computer's row says beside its name while nothing waits for it. */
function computerValue(computer: Computer): string {
  if (computer.kind === "read") return computer.facts.version;
  return computer.kind === "unreached" ? COMPUTER_UNREACHED : "…";
}

/**
 * The computer's row: its version, or what waits for it. Its owner gets Update (the steps, or the
 * line to run) where the computer is theirs to update; one that comes with Chips for Mac, or is
 * starting again on its own, asks nothing of anyone and has no button (ADR 0298).
 */
function ComputerRow({
  computer,
  line,
  updates,
  ring,
  order,
  onUpdate,
}: {
  readonly computer: Computer;
  /** What waits for it, in words; none when nothing does. */
  readonly line: string | undefined;
  /** Whether its owner has an update to make. */
  readonly updates: boolean;
  readonly ring: number;
  readonly order: number;
  /** The steps for a computer, or the line to run on one from the install line. */
  readonly onUpdate: () => void;
}) {
  return (
    <GroupRow
      label={
        computer.kind === "read" ? computerRow(computer.facts.machine) : "Chips on your computer"
      }
      sub={line}
      value={line === undefined ? computerValue(computer) : undefined}
      mark={<RowMark icon="laptop" />}
      trailing={
        updates ? (
          <UpdateButton
            label={UPDATE_BUTTON}
            soft
            onPress={onUpdate}
            ring={ring}
            order={order}
            testID="about-update"
          />
        ) : undefined
      }
      testID="about-computer-row"
    />
  );
}

/** Whether the gold dot shows on this device (ADR 0296), and what it does. */
function DotSwitch() {
  const palette = usePalette();
  const { enabled, setEnabled } = useUpdates();
  return (
    <View>
      <Group inset={MARKED_INSET} testID="about-dot">
        <GroupRow
          label={DOT_SWITCH}
          mark={<RowMark icon="dot" tint={palette.gold} ink={ON_GOLD} />}
          trailing={
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              accessibilityLabel={DOT_SWITCH}
              testID="about-dot-switch"
            />
          }
        />
      </Group>
      <GroupFoot testID="about-dot-foot">{dotFoot(enabled, "the top of the screen")}</GroupFoot>
    </View>
  );
}

const styles = StyleSheet.create({
  needsEnd: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  noChevron: { width: 16 },
  now: { paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  page: { paddingTop: SPACE.sm, paddingBottom: SPACE.xxl * 2, gap: SPACE.xl },
  top: { alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.xxl },
  mark: { padding: SPACE.xs, borderRadius: SPACE.xxl },
  name: { fontSize: 28, fontWeight: "700", letterSpacing: -0.4 },
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingLeft: SPACE.md + 2,
    paddingRight: SPACE.md,
    maxWidth: "100%",
  },
  capsuleWords: { fontFamily: "Menlo", fontSize: TEXT.xs, flexShrink: 1 },
  blurb: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.45,
    textAlign: "center",
    maxWidth: 320,
    marginTop: SPACE.xs,
  },
  made: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.5,
    textAlign: "center",
    paddingHorizontal: SPACE.xxl + SPACE.sm,
  },
});
