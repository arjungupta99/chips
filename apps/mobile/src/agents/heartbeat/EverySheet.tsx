/**
 * How often an agent checks in (ADR 0143): the intervals its harness offers, shortest first, each
 * with roughly how many checks a day it makes, and a tick on the one it beats at. A tap picks one
 * and closes the sheet; the Heartbeat group saves it. A harness's own job that offers intervals
 * opens it too (ADR 0252), with its own words under the title and at the foot.
 */

import type { EveryChoice } from "@chipschat/core";
import { StyleSheet, Text } from "react-native";
import { Group, GroupFoot, GroupRow } from "../../ui/Group";
import { Icon } from "../../ui/Icon";
import { CLOSE_ROOM, Sheet } from "../../ui/Sheet";
import { usePalette } from "../../ui/theme";
import { SPACE, TEXT } from "../../ui/tokens";

export function EverySheet({
  open,
  agentName,
  choices,
  onClose,
  onPick,
  body,
  foot = "Each check is a full turn, so more often costs more. Quiet checks never show.",
}: {
  readonly open: boolean;
  readonly agentName: string;
  /** What the intervals are for, when it isn't an agent's heartbeat. */
  readonly body?: string;
  readonly foot?: string;
  readonly choices: readonly EveryChoice[];
  readonly onClose: () => void;
  readonly onPick: (minutes: number) => void;
}) {
  const palette = usePalette();
  return (
    <Sheet open={open} onClose={onClose} testID="heartbeat-every-sheet">
      <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
        How often
      </Text>
      <Text style={[styles.body, { color: palette.ink2 }]}>
        {body ?? `How often ${agentName} looks over what it's doing.`}
      </Text>
      <Group>
        {choices.map((choice) => (
          <GroupRow
            key={choice.minutes}
            label={choice.label}
            sub={choice.sub}
            onPress={() => onPick(choice.minutes)}
            accessibilityLabel={`${choice.label}${choice.checked ? ", picked" : ""}`}
            trailing={
              choice.checked ? <Icon name="check" size={20} color={palette.accent} /> : undefined
            }
            testID={`heartbeat-every-${choice.minutes}`}
          />
        ))}
      </Group>
      <GroupFoot>{foot}</GroupFoot>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // Short of the sheet's X, at the right of this line (ADR 0169).
  title: {
    fontSize: TEXT.xl + 2,
    fontWeight: "700",
    marginTop: SPACE.xs,
    marginBottom: SPACE.xs,
    marginRight: CLOSE_ROOM,
  },
  body: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.42, marginBottom: SPACE.lg },
});
