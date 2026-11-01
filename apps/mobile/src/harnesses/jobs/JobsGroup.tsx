/**
 * A harness's own jobs on its page (ADR 0252, the mock's layout A): the "Its own jobs" group under
 * its agents, a row for each job with how often it runs, for whom, and what it cost this week, and
 * a chevron to the job's own page. What they cost this week in all stands at the heading's right.
 * Only the people who run the harness see it, and only for a harness that sends its jobs.
 *
 * The last copy read is kept while the app runs, so the page opened again draws it at once; before
 * the first, the group stands blank in its place, in two rows as Jacobian's two jobs are, and the
 * rows come in over the blanks under a heading that never moves (ADR 0238). A harness that has sent
 * no jobs, or none any more, leaves no group.
 */

import {
  type JobRow,
  jobRows,
  jobsFoot,
  jobsWeekWords,
  mayChangeJobs,
  nameOf,
  type Snapshot,
  type Store,
} from "@chipschat/core";
import type { HarnessJobsView, JobKind } from "@chipschat/protocol";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BlankBody, useStood } from "../../agents/Waiting";
import { recall, remember } from "../../context/memory";
import { ON_GOLD } from "../../ui/Button";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../../ui/Group";
import { Lands } from "../../ui/growing";
import type { IconName } from "../../ui/icons";
import { usePalette } from "../../ui/theme";
import type { Palette } from "../../ui/tokens";
import { TEXT } from "../../ui/tokens";

/** Where the last copy read is kept, so the page opened again draws it at once. */
export const jobsKey = (harnessId: string) => `jobs:${harnessId}`;

/** A job's mark: what it does, on its own tile, the phone's Settings' way. */
const MARKS: Readonly<Record<JobKind, IconName>> = {
  heartbeat: "pulse",
  memory: "moon",
  skills: "sparkle",
  other: "clock",
};

/** The tile a job's mark stands on while it runs, and the ink on it. */
export function markTint(kind: JobKind, palette: Palette): { tint: string; ink: string } {
  switch (kind) {
    case "heartbeat":
      return { tint: palette.red, ink: "#ffffff" };
    case "memory":
      return { tint: "#8b6cf6", ink: "#ffffff" };
    case "skills":
      return { tint: palette.gold, ink: ON_GOLD };
    default:
      return { tint: palette.blue, ink: "#ffffff" };
  }
}

/** A job's mark, lit while it runs, the quiet grey while it is off. */
export function JobMark({ kind, on }: { readonly kind: JobKind; readonly on: boolean }) {
  const palette = usePalette();
  const { tint, ink } = markTint(kind, palette);
  return <RowMark icon={MARKS[kind]} tint={on ? tint : undefined} ink={on ? ink : palette.ink3} />;
}

/** The icon a job's kind wears, for a larger tile than a row's. */
export const markIcon = (kind: JobKind): IconName => MARKS[kind];

/**
 * The harness's jobs: kept from before at once, then read when the page opens and each time it
 * comes back to the front; whether the first read is still on its way.
 */
export function useHarnessJobs(store: Store, harnessId: string, may: boolean, focus: number) {
  const [view, setView] = useState<HarnessJobsView | undefined>(() =>
    may ? recall<HarnessJobsView>(jobsKey(harnessId)) : undefined,
  );
  const [reading, setReading] = useState(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `focus` is when to read it again.
  useEffect(() => {
    if (!may) {
      setView(undefined);
      return;
    }
    let current = true;
    store
      .readHarnessJobs(harnessId)
      .then(
        (read) => {
          remember(jobsKey(harnessId), read);
          if (current) setView(read);
        },
        // Not sent yet, or none any more: no group.
        () => {
          remember(jobsKey(harnessId), undefined);
          if (current) setView(undefined);
        },
      )
      .finally(() => current && setReading(false));
    return () => {
      current = false;
    };
  }, [store, harnessId, may, focus]);
  return { view, reading };
}

export function JobsGroup({
  store,
  snapshot,
  harnessId,
  selfId,
  focus,
  onOpen,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  /** How many times the page has come to the front: each time, the jobs are read again. */
  readonly focus: number;
  /** Where a job opens. Absent, and its page is pushed. */
  readonly onOpen: ((jobId: string) => void) | undefined;
}) {
  const router = useRouter();
  const may =
    selfId !== undefined && mayChangeJobs(snapshot.model, snapshot.directory, harnessId, selfId);
  const { view, reading } = useHarnessJobs(store, harnessId, may, focus);
  const stood = useStood(may && view === undefined && reading);
  if (!may) return null;
  const harness = nameOf(snapshot.directory, harnessId);
  if (view === undefined || view.jobs.length === 0) {
    if (!reading) return null;
    // The heading stands still from the first frame; only what is under it changes (ADR 0238).
    return (
      <View
        testID="jobs-waiting"
        accessible
        accessibilityLabel={`Asking ${harness} what it runs on its own`}
      >
        <GroupHeading>Its own jobs</GroupHeading>
        <BlankBody
          rows={[
            { mark: true, label: 38, sub: 52, trailing: "value" },
            { mark: true, label: 32, sub: 46, trailing: "value" },
          ]}
          foot={[94, 62]}
          testID="jobs-blank"
        />
      </View>
    );
  }
  return (
    <Jobs
      rows={jobRows(view, snapshot.directory)}
      week={jobsWeekWords(view)}
      harness={harness}
      after={stood}
      onOpen={
        onOpen ??
        ((jobId) =>
          router.push({
            pathname: "/harnesses/[id]/jobs/[job]",
            params: { id: harnessId, job: jobId },
          }))
      }
    />
  );
}

/**
 * The jobs under their heading. When blanks stood for them (`after`), the rows, the foot and the
 * week's cost come in over the blanks while the heading stays where it was.
 */
function Jobs({
  rows,
  week,
  harness,
  after,
  onOpen,
}: {
  readonly rows: readonly JobRow[];
  readonly week: string | undefined;
  readonly harness: string;
  readonly after: boolean;
  readonly onOpen: (jobId: string) => void;
}) {
  const palette = usePalette();
  return (
    <>
      <GroupHeading
        trailing={
          week === undefined ? undefined : (
            <Lands after={after}>
              <Text style={[styles.week, { color: palette.ink3 }]} testID="jobs-week">
                {week}
              </Text>
            </Lands>
          )
        }
      >
        Its own jobs
      </GroupHeading>
      <Lands after={after}>
        <Group inset={MARKED_INSET} testID="jobs-group">
          {rows.map((row) => (
            <GroupRow
              key={row.id}
              label={row.name}
              sub={row.sub}
              value={row.value}
              mark={<JobMark kind={row.kind} on={row.on} />}
              onPress={() => onOpen(row.id)}
              accessibilityHint={`Shows when ${row.name} ran and what it cost`}
              testID={`job-${row.id}`}
            />
          ))}
        </Group>
        <GroupFoot>{jobsFoot(harness)}</GroupFoot>
      </Lands>
    </>
  );
}

const styles = StyleSheet.create({
  week: { fontSize: TEXT.sm, fontWeight: "500", fontVariant: ["tabular-nums"] },
});
