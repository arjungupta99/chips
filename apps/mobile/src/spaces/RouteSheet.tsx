/**
 * Who a message went to, every one of them, people too (ADR 0113, ADR 0204): what a tap on the route over a message
 * opens. Arjun, 4 October 2026: "tapping the route UI should also provide a scrollable list of all
 * the agents". A route draws faces and never names, and from four agents it is one mark and a
 * number (`Faces`), so this is where the names are.
 *
 * "To Everyone", how many, and which message, then each agent with its harness and the room's
 * lead marked, as the room sheet lists them. The list scrolls in what the sheet leaves it, and
 * the sheet's X closes it. Nothing on it does anything else: who is in the room, and what each can do, is
 * the room sheet's.
 */

import type { Directory, Line, MessageTrail } from "@chipschat/core";
import { countedWords, harnessOf, nameOf, plainWords } from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { Avatar } from "../ui/Avatar";
import { useGround } from "../ui/ground";
import { Sheet, SheetScroll, SheetTitle } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { LeadMark } from "./LeadMark";
import { clockTime } from "./when";

/**
 * A route as the room draws it: with the words the field said for it ("Everyone") and the room's
 * lead, for the sheet a tap on it opens.
 */
export interface RouteDrawn extends MessageTrail {
  readonly words: string;
  readonly lead?: string | undefined;
}

/** As much of the message as the line under the title has room for. */
const QUOTED = 40;

/**
 * "17 agents · “Hello all” at 13:38": how many, and which message, by its words without marks.
 * People are counted as people (ADR 0204): "1 person, 1 agent".
 */
export function routeHint(route: RouteDrawn, line: Line, directory: Directory): string {
  const count = countedWords(route.to, directory);
  const words = plainWords(line.text);
  const quoted = words.length > QUOTED ? `${words.slice(0, QUOTED - 1).trimEnd()}…` : words;
  const at = clockTime(line.ts);
  return [count, quoted === "" ? undefined : `“${quoted}”${at === "" ? "" : ` at ${at}`}`]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function RouteSheet({
  open,
  onClose,
  onGone,
  route,
  line,
  directory,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onGone: () => void;
  readonly route: RouteDrawn;
  readonly line: Line;
  readonly directory: Directory;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onGone={onGone}
      sizing="bounded"
      cap={0.8}
      testID="route-sheet"
    >
      <View style={styles.page}>
        <SheetTitle hint={routeHint(route, line, directory)}>{`To ${route.words}`}</SheetTitle>
        <SheetScroll style={styles.scroll} testID="route-sheet-list">
          <View style={[styles.card, { backgroundColor: on.fill }]}>
            {route.to.map((id, at) => (
              <View
                key={id}
                style={[styles.row, at === 0 ? null : [styles.part, { borderColor: palette.line }]]}
                accessible
                accessibilityLabel={`${nameOf(directory, id)}${id === route.lead ? ", lead" : ""}`}
                testID={`route-sheet-agent-${id}`}
              >
                <Avatar
                  name={nameOf(directory, id)}
                  {...faceProps(directory, id)}
                  size="md"
                  decorative
                />
                <View style={styles.words}>
                  <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
                    {nameOf(directory, id)}
                  </Text>
                  {harnessOf(directory, id) === id ? null : (
                    <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
                      {nameOf(directory, harnessOf(directory, id))}
                    </Text>
                  )}
                </View>
                {id === route.lead ? <LeadMark /> : null}
              </View>
            ))}
          </View>
        </SheetScroll>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  // A page the sheet bounds, whose list is what gives: it scrolls in what is left (`RoomSheet`).
  page: { flexShrink: 1, minHeight: 0 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  card: { borderRadius: RADIUS.xl, overflow: "hidden" },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 58,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.body, fontWeight: "500" },
  under: { fontSize: TEXT.sm },
});
