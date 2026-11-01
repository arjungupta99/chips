/**
 * Handoff details and the full reply share one bounded native modal. The sheet's X closes both;
 * a drag or the back button takes the reply back to the details.
 */
import type { Lane } from "@chipschat/core";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { formatCost } from "../ui/format";
import { CLOSE_ROOM, Sheet, SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { CopyText, TextReader } from "./TextReader";
import { clockTime } from "./when";

export function LaneDetails({
  lane,
  name,
  trail,
  open,
  onClose,
  onGone,
}: {
  readonly lane: Lane;
  readonly name: string;
  readonly trail: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onGone: () => void;
}) {
  const palette = usePalette();
  const [reader, setReader] = useState(false);
  const reply = lane.summary?.trim() ? lane.summary : undefined;
  const back = () => setReader(false);
  const close = reader ? back : onClose;
  return (
    <Sheet
      open={open}
      onClose={close}
      onCloseButton={onClose}
      onGone={onGone}
      sizing={reader ? "full" : "bounded"}
      testID={`lane-${lane.laneId}`}
    >
      <View
        style={[styles.details, reader ? styles.hidden : null]}
        accessibilityElementsHidden={reader}
        importantForAccessibility={reader ? "no-hide-descendants" : "auto"}
      >
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text
              accessibilityRole="header"
              numberOfLines={2}
              style={[styles.title, { color: palette.ink }]}
            >
              {name}
            </Text>
            <Text style={{ color: palette.ink3 }}>Handoff details</Text>
          </View>
        </View>
        <SheetScroll
          style={styles.scroll}
          contentContainerStyle={styles.body}
          testID="lane-details-scroll"
        >
          <Text style={[styles.trail, { color: palette.ink2 }]}>{trail}</Text>
          <Text style={{ color: palette.ink2 }}>
            {STATE[lane.state]} · {DELIVERY[lane.delivery]}
          </Text>
          <Request lane={lane} />
          {reply === undefined ? null : (
            <View
              style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}
            >
              <Fact label="Reply" text={reply} lines={4} />
              <Button label="Read full reply" onPress={() => setReader(true)} />
            </View>
          )}
        </SheetScroll>
        {reply === undefined ? null : (
          <CopyText text={reply} label="Copy reply" cancelable={false} />
        )}
      </View>
      {reader ? <TextReader title={`${name}’s reply`} text={reply ?? ""} onBack={back} /> : null}
    </Sheet>
  );
}

function Request({ lane }: { readonly lane: Lane }) {
  const palette = usePalette();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.line }]}>
      <Fact label="Requested" text={lane.goal} lines={expanded ? undefined : 4} />
      <Button
        label={expanded ? "Hide request details" : "Request details"}
        variant="plain"
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <>
          {lane.constraints.length === 0 ? null : (
            <Fact label="Within" text={lane.constraints.join("\n")} />
          )}
          {lane.deadline === undefined ? null : <Fact label="By" text={clockTime(lane.deadline)} />}
          {lane.costUsd === undefined ? null : (
            <Fact label="Cost" text={formatCost(lane.costUsd)} />
          )}
        </>
      ) : null}
    </View>
  );
}

function Fact({
  label,
  text,
  lines,
}: {
  readonly label: string;
  readonly text: string;
  readonly lines?: number | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: palette.ink3 }]}>{label}</Text>
      <Text selectable numberOfLines={lines} style={[styles.words, { color: palette.ink }]}>
        {text}
      </Text>
    </View>
  );
}

const STATE = {
  queued: "Queued",
  running: "Working",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
const DELIVERY = {
  pending: "Delivery pending",
  direct: "Direct reply",
  queued_to_lead: "Queued for lead",
  delivered: "Delivered",
  failed: "Delivery failed",
};
const styles = StyleSheet.create({
  details: { flexShrink: 1, minHeight: 0, gap: SPACE.md },
  hidden: { display: "none" },
  // Short of the sheet's X, at the right of the name's first line.
  header: { flexShrink: 0, marginRight: CLOSE_ROOM },
  heading: { gap: SPACE.xs },
  title: { fontSize: TEXT.lg, fontWeight: "700" },
  scroll: { flexShrink: 1, minHeight: 0 },
  body: { gap: SPACE.md, paddingBottom: SPACE.sm },
  trail: { fontSize: TEXT.sm },
  card: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.md, gap: SPACE.md },
  fact: { gap: SPACE.xs },
  label: { fontSize: TEXT.xs, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  words: { fontSize: TEXT.md, lineHeight: TEXT.md * 1.4 },
});
