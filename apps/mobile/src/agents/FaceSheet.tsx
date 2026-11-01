/**
 * The sheet an agent's face is chosen on (ADR 0089): the one a space's is chosen on (`IconSheet`),
 * with the agent as the row at its head. A tap applies; the face is the agent's, so everybody in
 * the workspace sees it change, and *Use the default* gives it its initials back.
 *
 * Opened by pressing and holding an agent's row on the Agents tab, as a space's is on Spaces, and
 * by tapping the face on the agent's card.
 */

import { harnessOf, nameOf, type Snapshot, type Store } from "@chipschat/core";
import { useState } from "react";
import { IconSheet, whyNotSaved } from "../spaces/IconSheet";

export function FaceSheet({
  store,
  snapshot,
  agentId,
  onClose,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  /** The agent whose face is being chosen, or nothing while the sheet is shut. */
  readonly agentId: string | undefined;
  readonly onClose: () => void;
}) {
  // Why the last pick did not stick. The store puts the old face back when the server refuses;
  // this is what says so, rather than the sheet looking like a row of dead buttons.
  const [failed, setFailed] = useState<string | undefined>(undefined);
  // The agent the sheet is about, held past the close, so it slides away still saying who.
  const [showing, setShowing] = useState(agentId);
  if (agentId !== undefined && agentId !== showing) setShowing(agentId);
  if (showing === undefined) return null;
  const { directory } = snapshot;
  const id = showing;
  return (
    <IconSheet
      open={agentId !== undefined}
      onClose={() => {
        setFailed(undefined);
        onClose();
      }}
      onGone={() => setShowing(undefined)}
      title={nameOf(directory, id)}
      subtitle={nameOf(directory, harnessOf(directory, id))}
      kind="agent"
      chosen={directory[id]?.face}
      failed={failed}
      onChoose={(face) => {
        setFailed(undefined);
        void store.setAgentFace(id, face).catch((error: unknown) => setFailed(whyNotSaved(error)));
      }}
    />
  );
}
