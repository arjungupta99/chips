/**
 * One harness: what it is now, its agents, its own jobs, how it is set up, and what it has run
 * (ADR 0254, Arjun's B of the mock "Harness page layouts"). The page is kept short: its agents stop
 * at the first five of the Agents tab's own order, with a row that opens every one of them; Context
 * files, When it asks you and Recent runs are a row each, opening their sections whole on pages of
 * their own (`parts/`). Model is a row there too, the same row and sheet as an agent's page (ADR
 * 0154), since every agent of the harness with no model of its own follows it.
 *
 * The head says what it is now: why it can't answer (ADR 0083), what it is doing, or that it is
 * connected and since when. Until ADR 0254 it said how its last run ended, and a green Done stood
 * under the face long after the run, looking like a button and saying nothing of whether the
 * harness was there. Done and Idle say nothing here, as on its card and its tile (`saysStatus`).
 *
 * New agent (ADR 0190, point 4) and Restart (ADR 0094) share a row under the head, with Pause or
 * Resume while a run of its is going. Restart is for the people who may remove it and a harness
 * that takes restarts: gold while it can't answer, quiet while it can, "Restarting…" while a
 * restart stands, and in words, under the row, with no button while nothing of it is connected.
 *
 * Beside the Agents list on an iPad wide enough (ADR 0256), its agents and own jobs stand on the
 * left and Set up and History on the right (`Columns`), with Restart and Remove side by side at the
 * foot; narrower, one after the other, as on a phone.
 *
 * Removing the harness is the last row (ADR 0078): for its owner and for an owner or admin of the
 * workspace, asked first on the sheet Delete uses, in the desktop's words. Once the server has
 * removed it the profile is left for the list, which no longer holds it.
 *
 * The token screen is deliberately absent: issuing a credential is a desk job, and a phone is not
 * where somebody should be pasting one into a terminal.
 */

import type { FleetHarness, RestartOffer, RunState, Snapshot, Store } from "@chipschat/core";
import {
  agentStateWords,
  agentsTab,
  alwaysRules,
  asksGoTo,
  backFromRestart,
  backWords,
  connectedWords,
  fleetDoing,
  harnessGroups,
  harnessModelAgent,
  mayAskFromPage,
  mayRemoveHarness,
  nameOf,
  permissionsRow,
  removeAsking,
  restartAsking,
  restartOffer,
} from "@chipschat/core";
import type { AgentState } from "@chipschat/protocol";
import { useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AgentRow } from "../agents/AgentRow";
import { NotFound } from "../agents/Arriving";
import { useModelGroup } from "../agents/model/ModelGroup";
import { useHarnessContext } from "../context/useContext";
import { ConfirmSheet } from "../spaces/ConfirmSheet";
import { useHeld } from "../spaces/Thinking";
import { clockOrDay } from "../spaces/when";
import { Avatar, ROW_AVATAR } from "../ui/Avatar";
import { Bar } from "../ui/Bar";
import { Button, ON_GOLD } from "../ui/Button";
import { Card } from "../ui/Card";
import { Group, GroupFoot, GroupHeading, GroupRow, MARKED_INSET, RowMark } from "../ui/Group";
import { GROWS, GroupPlace, GrowingView } from "../ui/growing";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { Dot, toneOf } from "../ui/Pill";
import { useColumn } from "../ui/Screen";
import { usePalette } from "../ui/theme";
import { AVATAR_HUES, ICON_GROUNDS, SPACE, TEXT } from "../ui/tokens";
import { type DotKind, type HarnessStatus, STATUS, statusLabel, type Tone } from "../ui/vocabulary";
import { useConnect } from "./Connect";
import { type HarnessBanners, useHarnessBanners } from "./HarnessBanners";
import { JobsGroup } from "./jobs/JobsGroup";
import type { HarnessPart } from "./parts";
import {
  AGENTS_SHOWN,
  asksValue,
  budgetWords,
  contextValue,
  harnessRuns,
  rollup,
  runsWeekWords,
  saysStatus,
  statusOf,
} from "./words";

export function Profile({
  store,
  snapshot,
  harnessId,
  selfId,
  onRemoved,
  focus = 0,
  onOpenJob,
  onOpenPart,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  /** Who is reading, for whether they may remove it (ADR 0078). Absent, and nobody may here. */
  readonly selfId?: string | undefined;
  /** How many times the page has come to the front: its copies are read again each time. */
  readonly focus?: number;
  /** Where to go once it is removed. Absent, and the profile goes back to what opened it. */
  readonly onRemoved?: (() => void) | undefined;
  /** Where one of its own jobs opens (ADR 0252). Absent, and its page is pushed. */
  readonly onOpenJob?: ((jobId: string) => void) | undefined;
  /** Where its agents, context files, asks and runs open (ADR 0254). Absent, and each is pushed. */
  readonly onOpenPart?: ((part: HarnessPart) => void) | undefined;
}) {
  const router = useRouter();
  const column = useColumn();
  const back = useBack(snapshot.directory[harnessId]?.state);
  const model = useHarnessModel(store, snapshot, harnessId, selfId, focus);
  const context = useHarnessContext(store, snapshot, harnessId, selfId, focus);

  const banners = useHarnessBanners(store, snapshot, harnessId);

  if (snapshot.directory[harnessId] === undefined) {
    return <NotFound snapshot={snapshot} what="harness" />;
  }
  const open =
    onOpenPart ??
    ((part: HarnessPart) =>
      router.push({ pathname: "/harnesses/[id]/[part]", params: { id: harnessId, part } }));

  return (
    <>
      <ScrollView contentContainerStyle={[styles.body, column]}>
        <Head snapshot={snapshot} harnessId={harnessId} selfId={selfId} back={back} />
        <Acts store={store} snapshot={snapshot} harnessId={harnessId} selfId={selfId} />
        <ItsAgents
          snapshot={snapshot}
          harnessId={harnessId}
          selfId={selfId}
          onAll={() => open("agents")}
        />
        {/* Its own jobs in a place that takes their size on `GROWS` as they land over their
              blanks, and what is under them moves with it, as on an agent's page (ADR 0238). */}
        <GroupPlace>
          <JobsGroup
            store={store}
            snapshot={snapshot}
            harnessId={harnessId}
            selfId={selfId}
            focus={focus}
            onOpen={onOpenJob}
          />
        </GroupPlace>

        <GrowingView layout={GROWS}>
          <SetUp
            snapshot={snapshot}
            harnessId={harnessId}
            selfId={selfId}
            model={model}
            context={context.may ? contextValue(set(context.set)) : null}
            banners={banners}
            onOpen={open}
          />
          <History snapshot={snapshot} harnessId={harnessId} onOpen={open} />
        </GrowingView>
        <GrowingView layout={GROWS}>
          <Foot
            store={store}
            snapshot={snapshot}
            harnessId={harnessId}
            selfId={selfId}
            onRemoved={onRemoved ?? (() => router.back())}
          />
        </GrowingView>
      </ScrollView>
      {/* The Model row's sheet and its hint stand beside the scroll, as on the agent's page. */}
      {model.overlays}
      {banners.overlay}
    </>
  );
}

/** The context set's groups, once it has come. */
const set = (read: Parameters<typeof harnessGroups>[0] | undefined) =>
  read === undefined ? undefined : harnessGroups(read);

/** Its Main agent's Model row, whose model is the harness's (ADR 0154): none when it has none. */
function useHarnessModel(
  store: Store,
  snapshot: Snapshot,
  harnessId: string,
  selfId: string | undefined,
  focus: number,
) {
  return useModelGroup({
    store,
    snapshot,
    agentId: harnessModelAgent(snapshot.directory, harnessId) ?? "",
    selfId: selfId ?? "",
    focus,
    inGroup: true,
  });
}

/**
 * The face, and what it is now in a line: why it can't answer, what it is doing, that it is back
 * from a restart this page watched, or that it is connected and since when. Under it, where it works.
 */
function Head({
  snapshot,
  harnessId,
  selfId,
  back,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly back: number | undefined;
}) {
  const palette = usePalette();
  const name = nameOf(snapshot.directory, harnessId);
  const entry = snapshot.model.fleet.find((each) => each.harnessId === harnessId);
  const status = statusOf(entry);
  const trouble = agentStateWords(snapshot.directory, harnessId, Date.now(), clockOrDay, selfId);
  // Done and Idle say nothing, in the ring as in the words, as on its card (`saysStatus`).
  const says = trouble === undefined && saysStatus(status) ? status : undefined;
  return (
    <View style={styles.head}>
      <Avatar
        name={name}
        kind="harness"
        size="lg"
        {...(says === undefined ? {} : { status: says })}
        cantAnswer={trouble !== undefined}
      />
      <View style={styles.headWords}>
        <Now
          snapshot={snapshot}
          harnessId={harnessId}
          entry={entry}
          says={says}
          trouble={trouble}
          back={back}
        />
        {/* Back from a restart under what it is doing; in place of Connected when it is doing nothing. */}
        {trouble === undefined && says !== undefined && back !== undefined ? (
          <Line tone="green" testID="profile-back">
            {backWords(back, Date.now(), clockOrDay)}
          </Line>
        ) : null}
        <Text style={[styles.note, { color: palette.ink3 }]}>
          {headNote(snapshot, harnessId, entry)}
        </Text>
      </View>
    </View>
  );
}

/** The head's line: a dot in the state's colour, and its words. */
function Now({
  snapshot,
  harnessId,
  entry,
  says,
  trouble,
  back,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly entry: FleetHarness | undefined;
  readonly says: HarnessStatus | undefined;
  readonly trouble: string | undefined;
  readonly back: number | undefined;
}) {
  const palette = usePalette();
  if (trouble !== undefined) {
    return (
      <Line tone="amber" dot="hollow" testID="profile-trouble">
        {trouble}
      </Line>
    );
  }
  if (says !== undefined) {
    const doing = says === "working" ? fleetDoing(snapshot.model.spaces, entry) : undefined;
    if (doing !== undefined) return <Working doing={doing} />;
    return (
      <Line tone={STATUS[says].tone} dot={STATUS[says].dot} testID="profile-status">
        {statusLabel(says)}
      </Line>
    );
  }
  if (back !== undefined) {
    return (
      <Line tone="green" testID="profile-back">
        {backWords(back, Date.now(), clockOrDay)}
      </Line>
    );
  }
  const connected = connectedWords(snapshot.directory, harnessId, Date.now(), clockOrDay);
  if (connected === undefined) return null;
  return (
    <Line tone="green" ink={palette.ink} testID="profile-connected">
      {connected}
    </Line>
  );
}

/** Working, and at what, in the words of its thinking bubble's top line, held as it holds them. */
function Working({ doing }: { readonly doing: NonNullable<ReturnType<typeof fleetDoing>> }) {
  return (
    <Line tone={STATUS.working.tone} dot={STATUS.working.dot} testID="profile-status">
      {statusLabel("working", useHeld(doing).label)}
    </Line>
  );
}

function Line({
  tone,
  dot = "solid",
  ink,
  testID,
  children,
}: {
  readonly tone: Tone;
  readonly dot?: DotKind;
  /** The words' colour, when not the tone's own. */
  readonly ink?: string | undefined;
  readonly testID: string;
  readonly children: string;
}) {
  const palette = usePalette();
  return (
    <View style={styles.line}>
      <Dot tone={tone} kind={dot} />
      <Text
        style={[styles.lineWords, { color: ink ?? toneOf(palette, tone).ink }]}
        numberOfLines={2}
        testID={testID}
      >
        {children}
      </Text>
    </View>
  );
}

/**
 * When a restart this page watched ended with the harness able to answer (ADR 0094), for "Back ·
 * 8:33 AM" in the head. Nothing is kept of it: another device, or the page opened later, says
 * nothing, and anything the harness says after it takes the line back.
 */
function useBack(state: AgentState | undefined): number | undefined {
  const before = useRef(state);
  const [at, setAt] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (backFromRestart(before.current, state)) setAt(Date.now());
    else if (state?.restarting !== undefined) setAt(undefined);
    before.current = state;
  }, [state]);
  return at;
}

/**
 * New agent, and Pause or Resume, sharing one row under the head. Restart is a row at the foot,
 * beside Remove (`Removal`).
 */
function Acts({
  store,
  snapshot,
  harnessId,
  selfId,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
}) {
  const entry = snapshot.model.fleet.find((each) => each.harnessId === harnessId);
  const mayNew =
    selfId !== undefined && mayAskFromPage(snapshot.model, snapshot.directory, selfId, harnessId);
  const buttons = [
    mayNew ? (
      <NewAgent key="new" snapshot={snapshot} harnessId={harnessId} selfId={selfId} />
    ) : null,
    <PauseButton key="pause" store={store} entry={entry} />,
  ].filter((each) => each !== null);
  return <View style={styles.acts}>{buttons}</View>;
}

/**
 * Pause or Resume its latest run, greyed out while nothing of it is going (Arjun: "Show it greyed
 * out"), so the row keeps its shape between idle and busy. The server refuses to pause a run that
 * has ended, so an ended run is nothing to press; and a run whose harness never said a Pause holds
 * it is greyed out too, since pausing it would hide work that carries on (ADR 0293).
 */
function PauseButton({
  store,
  entry,
}: {
  readonly store: Store;
  readonly entry: FleetHarness | undefined;
}) {
  const target =
    entry?.spaceId !== undefined && entry.runId !== undefined && runGoing(entry.status)
      ? { spaceId: entry.spaceId, runId: entry.runId }
      : undefined;
  const paused = target !== undefined && entry?.paused === true;
  return (
    <Button
      label={paused ? "Resume" : "Pause"}
      icon={paused ? "play" : "pause"}
      grow
      // Pause only where its harness said a Pause holds the run (ADR 0293); Resume always.
      disabled={target === undefined || (!paused && entry?.pausable !== true)}
      onPress={() => {
        if (target === undefined) return;
        if (paused) store.resumeRun(target);
        else store.pauseRun(target);
      }}
      testID="harness-pause"
    />
  );
}

/** Whether a run is still going, paused or not: queued, running, waiting on someone or paused. */
const runGoing = (state: RunState | undefined) =>
  state === "queued" || state === "running" || state === "waiting" || state === "paused";

/**
 * New agent (ADR 0190, point 4), for whoever may ask this harness for one (`Acts` asks): a sheet that names it
 * and makes it a space of its own (`harnesses/NewAgent.tsx`, held by `Connect.tsx`). Gold while
 * the harness can answer; quiet while it can't, since the ask waits on it.
 */
function NewAgent({
  snapshot,
  harnessId,
  selfId,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
}) {
  const { newAgent } = useConnect();
  const trouble = agentStateWords(snapshot.directory, harnessId, Date.now(), undefined, selfId);
  return (
    <Button
      label="New agent"
      icon="plus"
      variant={trouble === undefined ? "gold" : "default"}
      grow
      onPress={() => newAgent(harnessId)}
    />
  );
}

/** Why the server would not restart it, in words worth reading: an old server says so plainly. */
function notRestarted(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) {
    return "Not restarted: this server is older than the app, and cannot restart a harness yet.";
  }
  return said === "" ? "Not restarted: the server would not do it." : `Not restarted: ${said}`;
}

/**
 * Restart, and the sheet that asks first (ADR 0094). What it offers is core's, so the desktop
 * offers the same to the same people: a row, "Restarting…", or why there is nobody to ask.
 */
function useRestart(
  store: Store,
  snapshot: Snapshot,
  harnessId: string,
  selfId: string | undefined,
): { readonly row: ReactNode; readonly sheet: ReactNode } {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const name = nameOf(snapshot.directory, harnessId);
  const offer =
    selfId === undefined
      ? undefined
      : restartOffer(snapshot.model, snapshot.directory, harnessId, selfId);
  const confirm = async () => {
    setBusy(true);
    setFailed(undefined);
    try {
      await store.restartHarness(harnessId);
    } catch (error) {
      setFailed(notRestarted(error));
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    feel.success();
  };
  const row =
    offer === undefined ? null : (
      <RestartRow
        offer={offer}
        onPress={() => {
          setFailed(undefined);
          setOpen(true);
        }}
      />
    );
  // Asked every render, so a sheet already up stays until it is answered or cancelled.
  const sheet =
    offer === undefined && !open ? null : (
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onGone={() => undefined}
        room={{
          face: <Avatar name={name} kind="harness" />,
          name,
          last:
            agentStateWords(snapshot.directory, harnessId, Date.now(), clockOrDay, selfId) ?? "",
        }}
        confirming={{ asking: restartAsking(name), tone: palette.gold, ink: ON_GOLD, busy, failed }}
        onConfirm={() => void confirm()}
      />
    );
  return { row, sheet };
}

/**
 * Restart as a row at the page's foot, in the accent as the agent page's Archive is: "Restart
 * harness…", the same words as Remove's under it; "Restarting…" while one stands; or, while
 * nothing of it is connected, why there is nobody to ask, which the head already says is offline.
 */
function RestartRow({
  offer,
  onPress,
}: {
  readonly offer: RestartOffer;
  readonly onPress: () => void;
}) {
  switch (offer.kind) {
    case "offer":
      return (
        <GroupRow
          label="Restart harness…"
          tone="accent"
          onPress={onPress}
          testID="restart-harness"
        />
      );
    case "going":
      return <GroupRow label={offer.label} tone="off" testID="restart-harness" />;
    case "unreachable":
      return (
        <GroupRow
          label="Restart harness"
          tone="off"
          sub={offer.body}
          subLines={3}
          testID="restart-unreachable"
        />
      );
  }
}

/** Where a row's words start in the agents' group: past the margin, the face and the gap. */
const AGENT_INSET = SPACE.lg + ROW_AVATAR + SPACE.md;

/**
 * The harness's agents (ADR 0087, Phase 5), as the Agents tab lists them, each opening its card:
 * the first five of its order, and a row that opens all of them on a page of their own (ADR 0254),
 * where its archived ones are too. With five or fewer, its archived ones have the row instead.
 */
function ItsAgents({
  snapshot,
  harnessId,
  selfId,
  onAll,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly onAll: () => void;
}) {
  const palette = usePalette();
  const router = useRouter();
  const tab = agentsTab(snapshot.model, snapshot.directory, selfId ?? "", { harnessId });
  const rows = [...tab.leads, ...tab.agents];
  const archived = tab.archived.here.length + tab.archived.elsewhere.length;
  if (rows.length + archived === 0) return null;
  const open = (id: string) => router.push(`/agents/${id}`);
  return (
    <View testID="its-agents">
      <GroupHeading>{`Agents · ${rows.length}`}</GroupHeading>
      <Group inset={AGENT_INSET}>
        {rows.slice(0, AGENTS_SHOWN).map((row) => (
          <AgentRow
            key={row.id}
            row={row}
            first
            onPress={open}
            ground={palette.surface}
            permission={permissionsRow(snapshot, row.id)}
          />
        ))}
        {rows.length > AGENTS_SHOWN ? (
          <GroupRow
            label={`See all ${rows.length} agents`}
            tone="accent"
            trailing={<Icon name="next" size={16} color={palette.accent} />}
            onPress={onAll}
            testID="its-agents-all"
          />
        ) : archived > 0 ? (
          <GroupRow
            label={`Archived · ${archived}`}
            onPress={() => router.push(`/agents/archived?harness=${harnessId}`)}
            testID="its-archived"
          />
        ) : null}
      </Group>
    </View>
  );
}

/**
 * How it is set up, a row each (ADR 0254): its Main agent's Model row, which opens the model sheet;
 * its context files, for its owner; and When it asks you, for everybody who reads the page. The
 * last two open their sections whole on pages of their own. The Model row's foot stands under it.
 */
function SetUp({
  snapshot,
  harnessId,
  selfId,
  model,
  context,
  banners,
  onOpen,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly model: { readonly row?: ReactNode; readonly foot?: string | undefined };
  /** The Context files row's value; `null` for a reader who may not see them. */
  readonly context: string | undefined | null;
  readonly banners: HarnessBanners;
  readonly onOpen: (part: HarnessPart) => void;
}) {
  const { directory } = snapshot;
  const asks = asksValue(
    alwaysRules(snapshot.model, directory, harnessId, selfId),
    asksGoTo(directory, harnessId, selfId),
  );
  return (
    <View testID="harness-set-up">
      <GroupHeading>Set up</GroupHeading>
      <Group inset={MARKED_INSET}>
        {model.row}
        {context === null ? null : (
          <GroupRow
            label="Context files"
            value={context}
            mark={<RowMark icon="doc" tint={ICON_GROUNDS[9]} ink="#ffffff" />}
            onPress={() => onOpen("context")}
            accessibilityHint="Shows what its agents share and what a new agent starts with"
            testID="harness-context-row"
          />
        )}
        <GroupRow
          label="When it asks you"
          value={asks}
          mark={<RowMark icon="unlock" tint={AVATAR_HUES[3]} ink="#ffffff" />}
          onPress={() => onOpen("asks")}
          accessibilityHint="Shows who decides its asks and what is allowed always"
          testID="harness-asks-row"
        />
        {banners.row}
      </Group>
      {model.foot === undefined ? null : <GroupFoot testID="model-foot">{model.foot}</GroupFoot>}
      {banners.foot}
    </View>
  );
}

/**
 * What it has run (ADR 0254): Recent runs, a row opening the list, with how many began this week;
 * and its budget, for a harness that has one. Nothing for a harness that has never run.
 */
function History({
  snapshot,
  harnessId,
  onOpen,
}: {
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly onOpen: (part: HarnessPart) => void;
}) {
  const policy = snapshot.model.harnesses[harnessId];
  const budget = budgetWords(policy);
  const runs = harnessRuns(snapshot, harnessId);
  if (runs.length === 0 && budget === undefined) return null;
  return (
    <View testID="harness-history">
      <GroupHeading>History</GroupHeading>
      {runs.length === 0 ? null : (
        <Group inset={MARKED_INSET}>
          <GroupRow
            label="Recent runs"
            value={runsWeekWords(runs, Date.now())}
            mark={<RowMark icon="list" tint={ICON_GROUNDS[10]} ink="#ffffff" />}
            onPress={() => onOpen("runs")}
            testID="harness-runs-row"
          />
        </Group>
      )}
      {budget === undefined || policy?.budgetUsd === undefined ? null : (
        <View style={styles.budget}>
          <Card>
            <Bar used={policy.spentUsd} of={policy.budgetUsd} label="Budget" caption={budget} />
          </Card>
        </View>
      )}
    </View>
  );
}

/** The line under the status: where it works, or that it was removed and what stays of it. */
function headNote(snapshot: Snapshot, harnessId: string, entry: FleetHarness | undefined): string {
  return snapshot.directory[harnessId]?.removedAt === undefined
    ? rollup(entry)
    : "Removed from the workspace. What it said stays in its spaces.";
}

/** Why the server would not remove it, in words worth reading: an old server says so plainly. */
function notRemoved(error: unknown): string {
  const said = error instanceof Error ? error.message : "";
  if (/no route matches/i.test(said)) {
    return "Not removed: this server is older than the app, and cannot remove a harness yet.";
  }
  return said === "" ? "Not removed: the server would not do it." : `Not removed: ${said}`;
}

/**
 * The page's foot (ADR 0254): Restart harness… in a group of its own and, apart and in red,
 * Remove harness…, as an agent's page ends with Archive and, apart, Delete.
 */
function Foot({
  store,
  snapshot,
  harnessId,
  selfId,
  onRemoved,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly onRemoved: () => void;
}) {
  const restart = useRestart(store, snapshot, harnessId, selfId);
  return (
    <View style={styles.foot}>
      {restart.row === null ? null : <Group>{restart.row}</Group>}
      <Removal
        store={store}
        snapshot={snapshot}
        harnessId={harnessId}
        selfId={selfId}
        onRemoved={onRemoved}
        apart={restart.row !== null}
      />
      {restart.sheet}
    </View>
  );
}

/**
 * Remove harness…, the last row, and the sheet that asks first (ADR 0078), for whoever may remove
 * it and nobody else. The sheet waits for the server and stays up with its reason when it will not;
 * once it has, the profile is left.
 */
function Removal({
  store,
  snapshot,
  harnessId,
  selfId,
  onRemoved,
  apart,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly onRemoved: () => void;
  /** Whether Restart's group stands over it, so it keeps its distance. */
  readonly apart: boolean;
}) {
  const palette = usePalette();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const name = nameOf(snapshot.directory, harnessId);
  // Asked every render, so a sheet already up stays until it is answered or cancelled.
  const may =
    selfId !== undefined && mayRemoveHarness(snapshot.model, snapshot.directory, harnessId, selfId);
  if (!may && !open) return null;
  const confirm = async () => {
    setBusy(true);
    setFailed(undefined);
    try {
      await store.removeHarness(harnessId);
    } catch (error) {
      setFailed(notRemoved(error));
      setBusy(false);
      return;
    }
    setBusy(false);
    setOpen(false);
    feel.warning();
    onRemoved();
  };
  return (
    <>
      <View style={apart ? styles.apart : null}>
        <Group>
          <GroupRow
            label="Remove harness…"
            tone="danger"
            onPress={() => {
              setFailed(undefined);
              setOpen(true);
            }}
            testID="remove-harness"
          />
        </Group>
      </View>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        onGone={() => undefined}
        room={{ face: <Avatar name={name} kind="harness" />, name, last: "" }}
        confirming={{ asking: removeAsking(name), tone: palette.red, busy, failed }}
        onConfirm={() => void confirm()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // The groups run from their own inset, as on You and an agent's page; the head and the buttons
  // take the same margin.
  body: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.lg,
    paddingHorizontal: SPACE.lg + SPACE.xs,
  },
  headWords: { flex: 1, gap: SPACE.xs, alignItems: "flex-start" },
  line: { flexDirection: "row", alignItems: "center", gap: SPACE.sm, flexShrink: 1 },
  lineWords: { fontSize: TEXT.md, fontWeight: "600", flexShrink: 1 },
  note: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.45 },
  acts: {
    flexDirection: "row",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    paddingTop: SPACE.lg,
  },
  budget: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md },
  foot: { paddingTop: SPACE.xxl },
  // As far apart as an agent's page holds Delete from Archive.
  apart: { paddingTop: SPACE.xl },
});
