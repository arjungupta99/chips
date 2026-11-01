/**
 * A harness's card: what it is doing, and how much of what is waiting on you is its. The foot of
 * the Agents tab lists them (ADR 0087, Phase 5); until then they were the Harnesses tab, the fleet.
 *
 * A harness is a squircle with a ring, and the ring is state — with the word beside it, always,
 * because a colour on its own is not a reading and a ring nobody can name is decoration.
 *
 * A harness with nothing going on wears neither (`saysStatus`, WP5). Idle and Done are the two
 * states a screen can say nothing about: the first is the absence of news and the second is news
 * that has already been read, and twenty rows each ending in a green Done is a fleet that looks
 * busy while doing nothing at all. Nor does one that can't answer (ADR 0083): its last run's state
 * is from before it went, and Working beside Offline said two things at once, of which the second
 * was true (17 October 2026). Its amber mark and its words say it, as its tile on the shelf does.
 */

import type { Snapshot } from "@chipschat/core";
import { agentStateWords, nameOf, takesAutonomy } from "@chipschat/core";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { clockOrDay } from "../spaces/when";
import { Avatar } from "../ui/Avatar";
import { Bar } from "../ui/Bar";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { autonomyLabel, type HarnessStatus } from "../ui/vocabulary";
import { WorkingPill } from "./WorkingPill";
import { budgetWords, rollup, saysStatus, statusOf } from "./words";

/** The state its ring and pill say: none while it can't answer, nor while there is no news. */
function shownStatus(
  status: HarnessStatus,
  trouble: string | undefined,
): HarnessStatus | undefined {
  return trouble === undefined && saysStatus(status) ? status : undefined;
}

export function HarnessCard({
  snapshot,
  harnessId,
  name,
  selected = false,
  onOpen,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly name: string;
  /** Open beside the list, on a wide screen, so its card can say so. */
  readonly selected?: boolean;
  readonly onOpen: (harnessId: string) => void;
}) {
  const palette = usePalette();
  const entry = snapshot.model.fleet.find((each) => each.harnessId === harnessId);
  const policy = snapshot.model.harnesses[harnessId];
  const status = statusOf(entry);
  const budget = budgetWords(policy);
  // Why it can't answer now, when it can't (ADR 0083): offline since when, or its own words.
  const trouble = agentStateWords(snapshot.directory, harnessId, Date.now(), clockOrDay);
  const says = shownStatus(status, trouble);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      aria-selected={selected}
      onPress={() => onOpen(harnessId)}
      style={({ pressed }) => [styles.press, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: selected ? palette.surface2 : palette.surface,
            borderColor: selected ? palette.line2 : palette.line,
          },
        ]}
      >
        <View style={styles.head}>
          <Avatar
            name={name}
            kind="harness"
            size="md"
            cantAnswer={trouble !== undefined}
            {...(says === undefined ? {} : { status: says })}
          />
          <View style={styles.headWords}>
            <Text style={[styles.name, { color: palette.ink }]}>{name}</Text>
            {trouble === undefined ? null : (
              <Text
                style={[styles.note, { color: palette.amberInk }]}
                testID={`trouble-${harnessId}`}
              >
                {trouble}
              </Text>
            )}
            {/* The level only for a harness that takes the dial (ADR 0046). */}
            {takesAutonomy(snapshot.directory, harnessId) ? (
              <Text style={[styles.note, { color: palette.ink3 }]}>
                {policy === undefined ? "No policy yet" : autonomyLabel(policy.autonomy)}
              </Text>
            ) : null}
          </View>
          {says === undefined ? null : (
            <WorkingPill snapshot={snapshot} entry={entry} status={says} />
          )}
        </View>
        <Text style={[styles.note, { color: palette.ink3 }]} testID={`rollup-${harnessId}`}>
          {rollup(entry)}
        </Text>
        {entry?.workingFor === undefined ? null : (
          <Text style={[styles.note, { color: palette.ink3 }]}>
            Working for {nameOf(snapshot.directory, entry.workingFor)}
          </Text>
        )}
        {entry?.contextPercent === undefined ? null : (
          <Bar
            used={entry.contextPercent}
            of={100}
            label="Context"
            caption={`${Math.round(entry.contextPercent)}% used`}
          />
        )}
        {budget === undefined || policy?.budgetUsd === undefined ? null : (
          <Bar used={policy.spentUsd} of={policy.budgetUsd} label="Budget" caption={budget} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  press: { borderRadius: RADIUS.xxl },
  card: { borderWidth: 1, borderRadius: RADIUS.xxl, padding: SPACE.md, gap: SPACE.sm },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md },
  headWords: { flex: 1, gap: 2 },
  name: { fontSize: TEXT.body, fontWeight: "700" },
  note: { fontSize: TEXT.sm },
});
