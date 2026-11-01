/**
 * Send feedback (ADR 0237): a row in its own group under this phone's, and the small sheet it
 * opens. Chips takes feedback prompts, not pull requests, and a prompt is an issue on the
 * repository's form. The sheet offers the Main agent, which finds a line asking for its help in
 * its Main space's field, not sent, and GitHub, which opens the form with this build filled in.
 * Chips sends nothing either way. With no Main agent there is nothing to choose, so the row opens
 * GitHub itself.
 *
 * Not drawn while the switch is off (`FEEDBACK_SHOWN`), until the repository is public, unless
 * the build asked for it (`FEEDBACK_BUILD`).
 */

import {
  type Directory,
  FEEDBACK_ASK,
  FEEDBACK_ON_GITHUB,
  FEEDBACK_ROW,
  FEEDBACK_ROW_SUB,
  FEEDBACK_SENDS_NOTHING,
  FEEDBACK_SHOWN,
  FEEDBACK_TITLE,
  feedbackAgent,
  feedbackLink,
  feedbackWithWords,
  type WorkspaceModel,
} from "@chipschat/core";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { BUILD_COMMIT, FEEDBACK_BUILD } from "../build";
import { Face } from "../people/Faces";
import { fillField } from "../spaces/Composer";
import { Group, GroupFoot, GroupRow, MARK, MARKED_INSET, RowMark } from "../ui/Group";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE } from "../ui/tokens";
import { buildWords } from "./About";
import { SheetHead } from "./SheetHead";

/** Whether You draws the row: the switch, or a build that asked for it. */
export const FEEDBACK_ON = FEEDBACK_SHOWN || FEEDBACK_BUILD;

/** The system, as the form's version box says it after the build: "iOS 26.1". */
function systemWords(): string {
  if (Platform.OS === "ios") return `${Platform.isPad ? "iPadOS" : "iOS"} ${Platform.Version}`;
  return Platform.OS === "android" ? "Android" : "web";
}

/**
 * The version box's words: the Version row's, then the system. "Chips 0.0.0 (202610190718) ·
 * b888e96 · iOS 26.1".
 */
export function feedbackVersion(): string {
  const build = buildWords(
    Constants.expoConfig?.version,
    Constants.platform?.ios?.buildNumber,
    BUILD_COMMIT,
  );
  return `Chips ${build} · ${systemWords()}`;
}

/** Open the form, filled in with this build. */
function openForm(): void {
  void Linking.openURL(feedbackLink(feedbackVersion())).catch(() => undefined);
}

export function useFeedbackGroup({
  shown,
  model,
  directory,
  selfId,
}: {
  readonly shown: boolean;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
}) {
  const palette = usePalette();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // What a pick does once the sheet has gone: a room pushed, or Safari opened, over a sheet still
  // leaving would come up behind it.
  const then = useRef<(() => void) | undefined>(undefined);
  const agent = useMemo(
    () => (shown ? feedbackAgent(model, directory, selfId) : undefined),
    [shown, model, directory, selfId],
  );
  if (!shown) return { group: null, overlays: null };

  const leave = (next: () => void) => {
    then.current = next;
    setOpen(false);
  };
  const group = (
    <View style={styles.own}>
      <Group inset={MARKED_INSET} testID="feedback">
        <GroupRow
          label={FEEDBACK_ROW}
          sub={FEEDBACK_ROW_SUB}
          mark={<RowMark icon="chat" tint={palette.gold} ink="#231a00" />}
          onPress={agent === undefined ? openForm : () => setOpen(true)}
          testID="feedback-row"
        />
      </Group>
    </View>
  );
  const overlays =
    agent === undefined ? null : (
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        onGone={() => {
          const next = then.current;
          then.current = undefined;
          next?.();
        }}
        testID="feedback-sheet"
      >
        <SheetHead title={FEEDBACK_TITLE} />
        <Group inset={MARKED_INSET}>
          <GroupRow
            label={feedbackWithWords(agent.name)}
            mark={
              <View style={styles.face}>
                <Face directory={directory} id={agent.id} size="sm" />
              </View>
            }
            onPress={() =>
              leave(() => {
                fillField(agent.spaceId, FEEDBACK_ASK);
                router.push(`/spaces/${agent.spaceId}`);
              })
            }
            testID="feedback-agent"
          />
          <GroupRow
            label={FEEDBACK_ON_GITHUB}
            mark={<RowMark icon="globe" />}
            onPress={() => leave(openForm)}
            testID="feedback-github"
          />
        </Group>
        <GroupFoot>{FEEDBACK_SENDS_NOTHING}</GroupFoot>
      </Sheet>
    );
  return { group, overlays };
}

const styles = StyleSheet.create({
  // Its own group, with no heading over it: the room a heading would take.
  own: { paddingTop: SPACE.xxl },
  // The agent's face as wide as a row's mark, so both picks' words start at one edge.
  face: { width: MARK, alignItems: "center" },
});
