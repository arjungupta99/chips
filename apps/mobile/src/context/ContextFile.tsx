/**
 * One context file's screen (ADR 0135): the editor for a file that may be changed, the page to
 * read one that may not, or the editor begun from a shared file to give an agent its own. It opens
 * on the copy the page behind it showed, so it is exactly what the row said, and reads it again
 * from the server only when there is none (opened from a link). What it opens on is core's
 * (`contextOpening`), the same on the web.
 */

import { contextOpening, type EditorWords, type Snapshot, type Store } from "@chipschat/core";
import type { AgentContextView, HarnessContextView } from "@chipschat/protocol";
import { Avatar } from "../ui/Avatar";
import { Empty } from "../ui/Screen";
import { ContextEditor } from "./ContextEditor";
import type { ContextOwner } from "./owner";
import { ReadOnlyPage } from "./ReadOnlyPage";
import { HarnessMark } from "./rows";
import { agentKey, harnessKey, useRead } from "./useContext";

/** Whose file, on the sheet that asks: the agent's face, or its harness's mark. */
function OwnerFace({
  owner,
  snapshot,
  words,
}: {
  readonly owner: ContextOwner;
  readonly snapshot: Snapshot;
  readonly words: EditorWords;
}) {
  if (owner.kind !== "agent") return <HarnessMark name={words.harnessName} side={36} />;
  return (
    <Avatar
      name={words.agentName ?? ""}
      kind="agent"
      size="md"
      icon={snapshot.directory[owner.id]?.face}
      decorative
    />
  );
}

export function ContextFile({
  store,
  snapshot,
  owner,
  name,
  own,
  onDone,
}: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly owner: ContextOwner;
  readonly name: string;
  readonly own: boolean;
  readonly onDone: () => void;
}) {
  const harnessId =
    owner.kind === "agent" ? (snapshot.directory[owner.id]?.harnessId ?? "") : owner.id;
  const view = useRead<AgentContextView>(
    agentKey(owner.id),
    owner.kind === "agent" ? () => store.agentContext(owner.id) : undefined,
    0,
  );
  const setView = useRead<HarnessContextView>(
    harnessKey(harnessId),
    harnessId === "" ? undefined : () => store.harnessContext(harnessId),
    0,
  );
  const opening = contextOpening(owner, { view, setView }, snapshot.directory, name, own);
  if (opening === undefined) return <Empty>Reading the file…</Empty>;
  const { row, words } = opening;
  if (row.opens !== "editor" && !own) {
    return (
      <ReadOnlyPage row={row} harnessName={words.harnessName} usedBy={opening.shared?.usedBy} />
    );
  }
  return (
    <ContextEditor
      store={store}
      owner={owner}
      row={row}
      opened={{ text: opening.text, hash: opening.hash }}
      readAt={opening.readAt}
      away={opening.away}
      words={words}
      face={<OwnerFace owner={owner} snapshot={snapshot} words={words} />}
      onDone={onDone}
    />
  );
}
