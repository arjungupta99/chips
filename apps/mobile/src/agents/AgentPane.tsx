/**
 * An agent's card, or its message history, in the detail half of a wide screen's split (ADR
 * 0177): beside the Agents list, and over the room it was opened from beside the Spaces list,
 * with the way back to it. One component for both, so the card reads and goes the same wherever a
 * thumb found it.
 */

import { nameOf, PERMISSIONS_TITLE, type Snapshot, type Store } from "@chipschat/core";
import { useRouter } from "expo-router";
import { fileHref } from "../context/owner";
import { Pane } from "../ui/Pane";
import { useThirdHost } from "../ui/Split";
import { AgentCard } from "./AgentCard";
import { History } from "./History";
import { Permissions } from "./Permissions";

export function AgentPane({
  store,
  snapshot,
  agentId,
  selfId,
  history,
  permissions = false,
  lockGlow = false,
  onBack,
  onClose,
  onHistory,
  onPermissions,
  onOpenAsks,
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
  /** Its Permissions page rather than its card (ADR 0286). */
  readonly permissions?: boolean;
  /** Opened from its Locked (ADR 0199): the card's lock row glows once. */
  readonly lockGlow?: boolean;
  /** Where the pane's back goes, when it has one: the card from its history, the room from its card. */
  readonly onBack?: (() => void) | undefined;
  /** In a third column, its × (ADR 0276): its history beside its card. */
  readonly onClose?: (() => void) | undefined;
  readonly onHistory: () => void;
  /** Its Permissions page. Absent, the page is pushed, which on a wide screen is the Agents tab. */
  readonly onPermissions?: (() => void) | undefined;
  /** Every ask so far, on its harness's page. Absent, the page is pushed. */
  readonly onOpenAsks?: ((harnessId: string) => void) | undefined;
  readonly onOpenRoom: (spaceId: string) => void;
  /** Another agent's card: the one a copy was forked from, or one its history names. */
  readonly onOpenAgent: (agentId: string) => void;
  /** Its harness's page, flashing the shared file it reads there, if one is named. */
  readonly onOpenHarness: (harnessId: string, fileId?: string) => void;
  /** Deleted from here (ADR 0095): what was showing it steps back. */
  readonly onDeleted: () => void;
}) {
  const router = useRouter();
  const openPermissions = onPermissions ?? (() => router.push(`/agents/${agentId}/permissions`));
  const openAsks =
    onOpenAsks ??
    ((harnessId: string) =>
      router.push({
        pathname: "/harnesses/[id]/[part]",
        params: { id: harnessId, part: "asked" },
      }));
  // Its history and its harness's pages open in the third column on the Agents tab (ADR 0276): a
  // choice of the card's standing there closes for them, rather than stand over them.
  const host = useThirdHost();
  const beside =
    <A extends unknown[]>(open: (...args: A) => void) =>
    (...args: A) => {
      host?.dismiss();
      open(...args);
    };
  return (
    <Pane
      title={
        permissions
          ? PERMISSIONS_TITLE
          : history
            ? "Message history"
            : nameOf(snapshot.directory, agentId)
      }
      onBack={onBack}
      onClose={onClose}
    >
      {permissions ? (
        <Permissions
          store={store}
          snapshot={snapshot}
          agentId={agentId}
          selfId={selfId}
          onOpenHarness={onOpenHarness}
          onOpenAsks={openAsks}
        />
      ) : history ? (
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
          onHistory={beside(onHistory)}
          onPermissions={beside(openPermissions)}
          context={{
            focus: 0,
            onOpenFile: (name, mode) =>
              router.push(fileHref({ kind: "agent", id: agentId }, name, mode)),
            onOpenHarness: beside(onOpenHarness),
          }}
          onOpenRoom={onOpenRoom}
          onOpenAgent={onOpenAgent}
          onDeleted={onDeleted}
        />
      )}
    </Pane>
  );
}
