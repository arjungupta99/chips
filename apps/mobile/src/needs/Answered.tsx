/**
 * An ask that is not waiting on the reader, whole (ADR 0255): one opened from the Asks page, or a
 * card whose ask somebody answered while it was open. Who asked, where and when; the question and
 * its preview as the card drew them; the answer and when it came, "You said no" over "At 5:37 AM,
 * 4 minutes after Thea asked."; and Open in its space, which lands on the run the ask was part of.
 *
 * Nothing on it answers anything: an ask still waiting on this reader is `Decide`'s.
 */

import {
  askAnswer,
  askedAtWords,
  askerName,
  askVerdict,
  commandPlate,
  type Directory,
  type FoundAsk,
  roomName,
  type WorkspaceModel,
} from "@chipschat/core";
import { StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { AskMark, answerInk } from "../harnesses/AskRow";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Risk } from "../ui/Risk";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { Effect, Headline, Lasts } from "./Asked";
import { AskShown, saysLasts } from "./CommandPlate";

export function Answered({
  found,
  model,
  directory,
  selfId,
  now,
  onOpenSpace,
}: {
  readonly found: FoundAsk;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly now: number;
  /** Opens its space at its run. */
  readonly onOpenSpace: () => void;
}) {
  const palette = usePalette();
  const { approval, run, spaceId } = found;
  const plate = commandPlate(approval);
  const asker = askerName(run, directory);
  const space = roomName(model, spaceId, directory);
  const verdict = askVerdict(found, directory, selfId, now);
  const answer = verdict ?? askAnswer(approval, directory, selfId, run.harnessId);
  const ground = {
    no: palette.redSoft,
    open: palette.amberSoft,
    lapsed: palette.surface2,
  } as Partial<Record<typeof answer.end, string>>;
  return (
    <View style={styles.body} testID="answered">
      <View style={styles.head}>
        <Avatar name={asker} size="md" {...faceProps(directory, run.harnessId)} />
        <View style={styles.headWords}>
          <Text style={[styles.who, { color: palette.ink }]}>{`${asker} in ${space}`}</Text>
          <Text style={[styles.when, { color: palette.ink3 }]}>
            {askedAtWords(approval.askedAt, now)}
          </Text>
        </View>
      </View>
      <Card>
        <View style={styles.card}>
          <Headline approval={approval} style={styles.title} plated={plate !== undefined} />
          <Effect approval={approval} />
          <AskShown approval={approval} plate={plate} titled={approval.question !== undefined} />
          {saysLasts(approval, plate) ? <Lasts approval={approval} /> : null}
          <Risk classes={approval.risk} />
          <View
            style={[styles.verdict, { backgroundColor: ground[answer.end] ?? palette.greenSoft }]}
            accessible
            accessibilityLabel={
              verdict === undefined ? answer.words : `${answer.words}. ${verdict.line}`
            }
            testID="answered-verdict"
          >
            <AskMark end={answer.end} size={26} />
            <View style={styles.verdictWords}>
              <Text style={[styles.answer, { color: answerInk(answer.end, palette) }]}>
                {answer.words}
              </Text>
              {verdict === undefined ? null : (
                <Text style={[styles.line, { color: palette.ink2 }]}>{verdict.line}</Text>
              )}
            </View>
          </View>
        </View>
      </Card>
      <Button label={`Open in ${space}`} onPress={onOpenSpace} testID="answered-open" />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.md, paddingHorizontal: SPACE.xs },
  headWords: { flex: 1, minWidth: 0, gap: 1 },
  who: { fontSize: TEXT.md, fontWeight: "600" },
  when: { fontSize: TEXT.sm },
  card: { gap: SPACE.md },
  title: { fontSize: TEXT.lg, fontWeight: "700" },
  verdict: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm + 2,
  },
  verdictWords: { flex: 1, minWidth: 0, gap: 1 },
  answer: { fontSize: TEXT.md, fontWeight: "600" },
  line: { fontSize: TEXT.sm },
});
