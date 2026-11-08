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
import { type ReactNode, useMemo } from "react";
import { AgentPane } from "../../src/agents/AgentPane";
import { Agents } from "../../src/agents/Agents";
import { All } from "../../src/harnesses/All";
import { ConnectBeside, ConnectPane, useConnectThird } from "../../src/harnesses/Connect";
import { JobPage } from "../../src/harnesses/jobs/JobPage";
import { Profile } from "../../src/harnesses/Profile";
import { type HarnessPart, isHarnessPart, PART_FROM, PART_TITLE } from "../../src/harnesses/parts";
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
  const { agent, harness } = opened;
  // Connect a harness opens beside the list, in the pane, from the shelf's last tile and View all's
  // foot alike, and its tile is the one chosen while it stands there; a card picked in its gallery
  // stands in the third column (ADR 0284's addendum).
  const connecting = opened["connect"] === "1";
  const connectThird = useConnectThird();
  const here = useMemo(
    () => ({ open: () => go({ connect: "1" }), chosen: connecting }),
    [go, connecting],
  );
  if (!wide) return <Agents store={store} selfId={selfId} server={server} noRelay={noRelay} />;
  const { detail, third } = connecting
    ? { detail: <ConnectPane onClose={() => go({})} />, third: connectThird }
    : beside({
        store,
        snapshot,
        selfId,
        opened,
        go,
        openRoom: (spaceId) => router.push(`/spaces/${spaceId}`),
      });
  return (
    <ConnectBeside value={here}>
      <Split
        tab="agents"
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
        third={third}
        // An agent's card opens its choices in the third column rather than over it (ADR 0276).
        sheetsBeside={agent !== undefined}
      />
    </ConnectBeside>
  );
}

/**
 * What stands beside the list, and in a third column beside that (ADR 0276): an agent's card, with
 * its history or one of its harness's pages beside it; or a harness's page, or every harness's card.
 */
function beside({
  store,
  snapshot,
  selfId,
  opened,
  go,
  openRoom,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly opened: Opened;
  readonly go: (next: Opened) => void;
  readonly openRoom: (spaceId: string) => void;
}): { readonly detail: ReactNode; readonly third: ReactNode } {
  const { agent, harness, history, harnesses, lock, job, part } = opened;
  if (agent === undefined) {
    if (harness === undefined && harnesses === undefined) {
      return {
        detail: (
          <PaneEmpty icon="chip" title="No agent open">
            Choose an agent on the left.
          </PaneEmpty>
        ),
        third: undefined,
      };
    }
    return harnessesBeside({ store, snapshot, selfId, harness, harnesses, job, part, go });
  }
  const pane = (inHistory: boolean) => (
    <AgentPane
      store={store}
      snapshot={snapshot}
      agentId={agent}
      selfId={selfId}
      history={inHistory}
      // Opened from a locked agent's Locked (ADR 0199): the lock's row glows once.
      lockGlow={lock === "1" && !inHistory}
      // Its history stands beside its card, and its × goes back to the card alone (ADR 0276).
      onClose={inHistory ? () => go({ agent }) : undefined}
      onHistory={() => go({ agent, history: "1" })}
      onOpenRoom={openRoom}
      onOpenAgent={(other) => go({ agent: other })}
      // A shared file is on the harness's Context files page (ADR 0254), beside the card.
      onOpenHarness={(harnessId, fileId) =>
        go(
          fileId === undefined
            ? { harness: harnessId }
            : { agent, harness: harnessId, part: "context" },
        )
      }
      // Beside the list, a deleted agent leaves the pane empty rather than going back.
      onDeleted={() => go({})}
    />
  );
  const from = isHarnessPart(part) ? PART_FROM[part] : undefined;
  const third =
    history !== undefined
      ? pane(true)
      : harness !== undefined && isHarnessPart(part)
        ? partPane({
            store,
            snapshot,
            selfId,
            harness,
            part,
            onClose: () => go({ agent }),
            onBack: from === undefined ? undefined : () => go({ agent, harness, part: from }),
            onOpenPart: (next) => go({ agent, harness, part: next }),
          })
        : undefined;
  return { detail: pane(false), third };
}

/**
 * A harness's page beside the list, or every harness's card from View all (ADR 0185). A page opened
 * from that list goes back to it; one opened from the shelf is the top of the pane. One of its own
 * jobs (ADR 0252), and each page its page opens (ADR 0254), stands in a third column beside its page
 * (ADR 0276), whose × goes back to the page alone.
 */
function harnessesBeside({
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
}): { readonly detail: ReactNode; readonly third: ReactNode } {
  if (harness === undefined) {
    return {
      detail: (
        <Pane title="Harnesses">
          <All store={store} selfId={selfId} onOpen={(id) => go({ harness: id, harnesses })} />
        </Pane>
      ),
      third: undefined,
    };
  }
  const close = () => go({ harness, harnesses });
  const third =
    job !== undefined ? (
      <Pane title="" onClose={close}>
        <JobPage
          store={store}
          snapshot={snapshot}
          harnessId={harness}
          jobId={job}
          selfId={selfId}
          focus={0}
        />
      </Pane>
    ) : isHarnessPart(part) ? (
      partPane({
        store,
        snapshot,
        selfId,
        harness,
        part,
        onClose: close,
        onBack:
          PART_FROM[part] === undefined
            ? undefined
            : () => go({ harness, harnesses, part: PART_FROM[part] }),
        onOpenPart: (next) => go({ harness, harnesses, part: next }),
      })
    ) : undefined;
  return {
    detail: (
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
    ),
    third,
  };
}

/** A page a harness's page opens (ADR 0254): an agent's Instructions open its Context files here. */
function partPane({
  store,
  snapshot,
  selfId,
  harness,
  part,
  onClose,
  onBack,
  onOpenPart,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly harness: string;
  readonly part: HarnessPart;
  readonly onClose: () => void;
  /** A page opened from another of its pages goes back to that one, inside the column. */
  readonly onBack?: (() => void) | undefined;
  readonly onOpenPart: (next: HarnessPart) => void;
}) {
  return (
    <Pane title={PART_TITLE[part]} onBack={onBack} onClose={onClose}>
      <Part
        part={part}
        store={store}
        snapshot={snapshot}
        harnessId={harness}
        selfId={selfId}
        focus={0}
        onOpenPart={onOpenPart}
      />
    </Pane>
  );
}

/**
 * What says what is open beside Agents: an agent's card or its history, a harness's page, one of
 * its own jobs (ADR 0252) or a page its page opens (ADR 0254), every harness's card, or Connect a
 * harness (ADR 0284's addendum) — and, with a harness, that it was opened from
 * there; with an agent, that it was
 * opened from its Locked, so its lock's row glows (ADR 0199).
 */
const AGENTS_OPEN = [
  "agent",
  "harness",
  "history",
  "harnesses",
  "lock",
  "job",
  "part",
  "connect",
] as const;
