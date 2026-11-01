/** The archived agents (ADR 0087, Phase 5), from the Agents tab or one harness's page. */

import { useLocalSearchParams } from "expo-router";
import { Archived } from "../../src/agents/Archived";
import { useChips } from "../../src/store/provider";

export default function ArchivedScreen() {
  const { paired } = useChips();
  const { harness } = useLocalSearchParams<{ harness?: string }>();
  if (paired === undefined) return null;
  // The page draws its own screen and bar, since what stands under its name and at the bar's right
  // changes while it picks.
  return <Archived store={paired.store} selfId={paired.device.participantId} harnessId={harness} />;
}
