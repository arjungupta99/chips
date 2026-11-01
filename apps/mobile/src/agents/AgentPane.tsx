/**
 * An agent's card, or its message history, in the detail half of a wide screen's split (ADR
 * 0177): beside the Agents list, and over the room it was opened from beside the Spaces list,
 * with the way back to it. One component for both, so the card reads and goes the same wherever a
 * thumb found it.
 */

import { nameOf, type Snapshot, type Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { fileHref } from "../context/owner";
import { Pane } from "../ui/Pane";
import { AgentCard } from "./AgentCard";
import { History } from "./History";

export function AgentPane({
  store,
  snapshot,
  agentId,
  selfId,
  history,
  lockGlow = false,
  onBack,
  onHistory,
  onOpenRoom,
  onOpenAgent,
  onOpenHarness,
  onDeleted,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly agentId: string;
  readonly selfId: string;
  /** Its message history rather than its card. */
  readonly history: boolean;
  /** Opened from its Locked (ADR 0199): the card's lock row glows once. */
  readonly lockGlow?: boolean;
  /** Where the pane's back goes, when it has one: the card from its history, the room from its card. */
  readonly onBack?: (() => void) | undefined;
  readonly onHistory: () => void;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Another agent's card: the one a copy was forked from, or one its history names. */
  readonly onOpenAgent: (agentId: string) => void;
  /** Its harness's page, flashing the shared file it reads there, if one is named. */
  readonly onOpenHarness: (harnessId: string, fileId?: string) => void;
  /** Deleted from here (ADR 0095): what was showing it steps back. */
  readonly onDeleted: () => void;
}) {
  const router = useRouter();
  return (
    <Pane title={history ? "Message history" : nameOf(snapshot.directory, agentId)} onBack={onBack}>
      {history ? (
        <History
          store={store}
          snapshot={snapshot}
          agentId={agentId}
          selfId={selfId}
          onOpenRoom={onOpenRoom}
          onOpenAgent={onOpenAgent}
        />
      ) : (
        <AgentCard
          store={store}
          snapshot={snapshot}
          agentId={agentId}
          selfId={selfId}
          lockGlow={lockGlow}
          onHistory={onHistory}
          context={{
            focus: 0,
            onOpenFile: (name, mode) =>
              router.push(fileHref({ kind: "agent", id: agentId }, name, mode)),
            onOpenHarness,
          }}
          onOpenRoom={onOpenRoom}
          onOpenAgent={onOpenAgent}
          onDeleted={onDeleted}
        />
      )}
    </Pane>
  );
}
