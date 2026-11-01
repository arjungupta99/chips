/**
 * The Agents tab (ADR 0087, Phase 5). The list itself is `src/agents/Agents.tsx`; this is the
 * route. Harnesses until 30 September 2026, which `/harnesses` still reaches.
 *
 * On a wide screen the list and what it opens sit side by side — an agent's card, its history, a
 * harness's page, or every harness's card from View all under the shelf (ADR 0185), whose cards
 * open their pages with a way back to it — kept by the tabs, as Spaces keeps its room
 * (`ui/opened.tsx`, ADR 0177).
 */

import type { Snapshot, Store } from "@chipschat/core";
import { nameOf, serverHost } from "@chipschat/core";
import { useRouter } from "expo-router";
import { AgentPane } from "../../src/agents/AgentPane";
import { Agents } from "../../src/agents/Agents";
import { All } from "../../src/harnesses/All";
import { JobPage } from "../../src/harnesses/jobs/JobPage";
import { Profile } from "../../src/harnesses/Profile";
import { isHarnessPart, PART_FROM, PART_TITLE } from "../../src/harnesses/parts";
import { Part } from "../../src/harnesses/parts/Part";
import { useChips, useDeferredSnapshot } from "../../src/store/provider";
import { useLayout } from "../../src/ui/layout";
import { type Opened, useOpened } from "../../src/ui/opened";
import { Pane, PaneEmpty } from "../../src/ui/Pane";
import { Split } from "../../src/ui/Split";

export default function AgentsScreen() {
  const { paired } = useChips();
  if (paired === undefined) return null;
  return (
    <Tab
      store={paired.store}
      selfId={paired.device.participantId}
      server={serverHost(paired.device.serverUrl)}
      noRelay={paired.device.relayUrl === undefined}
    />
  );
}

function Tab({
  store,
  selfId,
  server,
  noRelay,
}: {
  readonly store: Store;
  readonly selfId: string;
  readonly server: string | undefined;
  readonly noRelay: boolean;
}) {
  const snapshot = useDeferredSnapshot(store);
  const router = useRouter();
  const { wide } = useLayout();
  const [opened, go] = useOpened("agents", AGENTS_OPEN);
  const { agent, harness, history, harnesses, lock, job, part } = opened;
  if (!wide) return <Agents store={store} selfId={selfId} server={server} noRelay={noRelay} />;
  const openRoom = (spaceId: string) => router.push(`/spaces/${spaceId}`);
  const detail =
    agent !== undefined ? (
      <AgentPane
        store={store}
        snapshot={snapshot}
        agentId={agent}
        selfId={selfId}
        history={history !== undefined}
        // Opened from a locked agent's Locked (ADR 0199): the lock's row glows once.
        lockGlow={lock === "1"}
        // Its history goes back to its card (ADR 0177); the card is the top of this pane.
        onBack={history === undefined ? undefined : () => go({ agent })}
        onHistory={() => go({ agent, history: "1" })}
        onOpenRoom={openRoom}
        onOpenAgent={(other) => go({ agent: other })}
        // A shared file is on the harness's Context files page (ADR 0254).
        onOpenHarness={(harnessId, fileId) =>
          go(
            fileId === undefined ? { harness: harnessId } : { harness: harnessId, part: "context" },
          )
        }
        // Beside the list, a deleted agent leaves the pane empty rather than going back.
        onDeleted={() => go({})}
      />
    ) : harness !== undefined || harnesses !== undefined ? (
      <HarnessPane
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        harness={harness}
        harnesses={harnesses}
        job={job}
        part={part}
        go={go}
      />
    ) : (
      <PaneEmpty icon="chip" title="No agent open">
        Choose an agent on the left.
      </PaneEmpty>
    );
  return (
    <Split
      list={
        <Agents
          store={store}
          selfId={selfId}
          server={server}
          noRelay={noRelay}
          selected={agent ?? harness}
          onOpen={(id) => go({ agent: id })}
          onOpenLocked={(id) => go({ agent: id, lock: "1" })}
          onOpenHarness={(id) => go({ harness: id })}
          onAllHarnesses={() => go({ harnesses: "all" })}
        />
      }
      detail={detail}
    />
  );
}

/**
 * A harness's page beside the list, or every harness's card from View all (ADR 0185). A page opened
 * from that list goes back to it; one opened from the shelf is the top of the pane. One of its own
 * jobs (ADR 0252), and each page its page opens (ADR 0254), goes back to its page.
 */
function HarnessPane({
  store,
  snapshot,
  selfId,
  harness,
  harnesses,
  job,
  part,
  go,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly harness: string | undefined;
  readonly harnesses: string | undefined;
  readonly job: string | undefined;
  readonly part: string | undefined;
  readonly go: (next: Opened) => void;
}) {
  if (harness === undefined) {
    return (
      <Pane title="Harnesses">
        <All store={store} selfId={selfId} onOpen={(id) => go({ harness: id, harnesses })} />
      </Pane>
    );
  }
  if (job !== undefined) {
    return (
      <Pane title="" onBack={() => go({ harness, harnesses })}>
        <JobPage
          store={store}
          snapshot={snapshot}
          harnessId={harness}
          jobId={job}
          selfId={selfId}
          focus={0}
        />
      </Pane>
    );
  }
  if (isHarnessPart(part)) {
    return (
      <Pane
        title={PART_TITLE[part]}
        onBack={() => go({ harness, harnesses, part: PART_FROM[part] })}
      >
        <Part
          part={part}
          store={store}
          snapshot={snapshot}
          harnessId={harness}
          selfId={selfId}
          focus={0}
          onOpenPart={(next) => go({ harness, harnesses, part: next })}
        />
      </Pane>
    );
  }
  return (
    <Pane
      title={nameOf(snapshot.directory, harness)}
      onBack={harnesses === undefined ? undefined : () => go({ harnesses })}
    >
      <Profile
        store={store}
        snapshot={snapshot}
        harnessId={harness}
        selfId={selfId}
        // Beside the list, a removed harness leaves the pane empty rather than going back.
        onRemoved={() => go({})}
        onOpenJob={(jobId) => go({ harness, harnesses, job: jobId })}
        onOpenPart={(next) => go({ harness, harnesses, part: next })}
      />
    </Pane>
  );
}

/**
 * What says what is open beside Agents: an agent's card or its history, a harness's page, one of
 * its own jobs (ADR 0252) or a page its page opens (ADR 0254), or every harness's card — and, with a harness, that it was opened from
 * there; with an agent, that it was
 * opened from its Locked, so its lock's row glows (ADR 0199).
 */
const AGENTS_OPEN = ["agent", "harness", "history", "harnesses", "lock", "job", "part"] as const;
