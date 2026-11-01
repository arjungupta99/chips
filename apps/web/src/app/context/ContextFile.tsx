/**
 * One context file's page (ADR 0135, on the desktop): the editor for a file that may be changed,
 * the page to read one that may not, or the editor begun from a shared file to give an agent its
 * own. It opens on the copy the page behind it showed, so it is exactly what the row said, and
 * reads it again from the server only when there is none. What it opens on is core's
 * (`contextOpening`), the same as the phone's.
 */

import {
  type ContextOwner,
  type ContextReads,
  contextOpening,
  type Directory,
  type EditorWords,
} from "@chipschat/core";
import type { AgentContextView, HarnessContextView } from "@chipschat/protocol";
import { Avatar } from "@chipschat/ui";
import { ContextEditor } from "./ContextEditor.tsx";
import { ReadOnlyPage } from "./ReadOnlyPage.tsx";
import { HarnessMark } from "./rows.tsx";
import { agentKey, harnessKey, useRead } from "./useContext.ts";

/** Whose file, on the dialog that asks: the agent's face, or its harness's mark. */
function OwnerFace({
  owner,
  directory,
  words,
}: {
  readonly owner: ContextOwner;
  readonly directory: Directory;
  readonly words: EditorWords;
}) {
  if (owner.kind !== "agent") return <HarnessMark name={words.harnessName} side={32} />;
  return (
    <Avatar name={words.agentName ?? ""} kind="agent" size="sm" icon={directory[owner.id]?.face} />
  );
}

export function ContextFile({
  reads,
  directory,
  owner,
  name,
  own,
  backLabel,
  onBack,
}: {
  readonly reads: ContextReads;
  readonly directory: Directory;
  readonly owner: ContextOwner;
  readonly name: string;
  readonly own: boolean;
  readonly backLabel: string;
  readonly onBack: () => void;
}) {
  const harnessId = owner.kind === "agent" ? (directory[owner.id]?.harnessId ?? "") : owner.id;
  const view = useRead<AgentContextView>(
    agentKey(owner.id),
    owner.kind === "agent" ? () => reads.agentContext(owner.id) : undefined,
    0,
  );
  const setView = useRead<HarnessContextView>(
    harnessKey(harnessId),
    harnessId === "" ? undefined : () => reads.harnessContext(harnessId),
    0,
  );
  const opening = contextOpening(owner, { view, setView }, directory, name, own);
  if (opening === undefined) {
    return (
      <main className="conv ctx-page" aria-label={name}>
        <header className="conv-h">
          <div className="conv-h-t">
            <button type="button" className="agent-back" onClick={onBack}>
              {`‹ ${backLabel}`}
            </button>
          </div>
        </header>
        <p className="conv-empty">Reading the file…</p>
      </main>
    );
  }
  const { row, words } = opening;
  if (row.opens !== "editor" && !own) {
    return (
      <main className="conv ctx-page" aria-label={row.title}>
        <header className="conv-h">
          <div className="conv-h-t">
            <button type="button" className="agent-back" onClick={onBack}>
              {`‹ ${backLabel}`}
            </button>
            <h1>{row.title}</h1>
          </div>
        </header>
        <div className="ctx-page-scroll">
          <ReadOnlyPage row={row} harnessName={words.harnessName} usedBy={opening.shared?.usedBy} />
        </div>
      </main>
    );
  }
  return (
    <ContextEditor
      // A new editor for each file: what was typed in one is not another's.
      key={`${owner.kind}:${owner.id}:${name}:${own ? "own" : "open"}`}
      reads={reads}
      owner={owner}
      row={row}
      opened={{ text: opening.text, hash: opening.hash }}
      readAt={opening.readAt}
      away={opening.away}
      words={words}
      face={<OwnerFace owner={owner} directory={directory} words={words} />}
      backLabel={backLabel}
      onBack={onBack}
    />
  );
}
