/**
 * One of a harness's own jobs (ADR 0252), pushed from "Its own jobs" on the harness's page. On a
 * wide screen it opens beside the Agents list instead, through the tab's own params.
 *
 * Its bar names nothing: the page names the job large under it, and the way back says the harness.
 */

import type { Store } from "@chipschat/core";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import { useFocusCount } from "../../../../src/context/useFocusCount";
import { JobPage } from "../../../../src/harnesses/jobs/JobPage";
import { useChips, useSnapshot } from "../../../../src/store/provider";
import { useLayout } from "../../../../src/ui/layout";
import { Screen } from "../../../../src/ui/Screen";

export default function JobScreen() {
  const { paired } = useChips();
  const { id, job } = useLocalSearchParams<{ id: string; job: string }>();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (wide) {
    return <Redirect href={{ pathname: "/(tabs)/agents", params: { harness: id, job } }} />;
  }
  return (
    <One store={paired.store} selfId={paired.device.participantId} harnessId={id} jobId={job} />
  );
}

function One({
  store,
  selfId,
  harnessId,
  jobId,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly harnessId: string;
  readonly jobId: string;
}) {
  const snapshot = useSnapshot(store);
  const focus = useFocusCount();
  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <JobPage
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        jobId={jobId}
        selfId={selfId}
        focus={focus}
      />
    </Screen>
  );
}
