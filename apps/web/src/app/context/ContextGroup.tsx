/**
 * An agent's Context group on its card (ADR 0135, the phone's on the desktop): the files its
 * harness builds it from at every turn, as the harness named them. Only its harness's owner sees
 * it (ADR 0134); for anybody else, and for a harness that doesn't send its files, the card has no
 * Context group at all.
 *
 * A row opens the editor, the harness's page for a file the agent reads from its harness's set,
 * or a page to read for one the harness keeps read only. Past the eighth file a quiet last row
 * names the rest, and the foot says Chips doesn't show them. A shared file the harness lets an
 * agent have its own of offers "Give it its own" under the foot.
 */

import {
  type AgentContext,
  type ContextReads,
  type ContextRow,
  contextFoot,
  type Directory,
  type HarnessContext,
  harnessOf,
  nameOf,
  notSharedWords,
  notShownWords,
  settingLook,
  type WorkspaceModel,
} from "@chipschat/core";
import { useEffect, useState } from "react";
import { clockOrDay } from "../time.ts";
import { NotShared, useLands, WaitingGroup } from "../Waiting.tsx";
import { takeLanding } from "./memory.ts";
import type { ContextPage } from "./pages.ts";
import { FileRow, HarnessMark, LinkedFoot, NotShownRow } from "./rows.tsx";
import { agentKey, useAgentContext } from "./useContext.ts";

export function ContextGroup({
  reads,
  model,
  directory,
  agentId,
  agentName,
  selfId,
  onOpen,
}: {
  readonly reads: ContextReads | undefined;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly agentId: string;
  readonly agentName: string;
  readonly selfId: string;
  readonly onOpen: (page: ContextPage) => void;
}) {
  const { context, set, waiting } = useAgentContext(reads, model, directory, agentId, selfId);
  const pulse = useLanding(agentKey(agentId));
  const land = useLands(context === undefined && waiting);
  if (settingLook(model, directory, agentId, selfId, "context") === "not_shared") {
    return (
      <NotShared
        group="context"
        words={notSharedWords("context", directory, agentId)}
        testID="context-not-shared"
      />
    );
  }
  if (context === undefined) {
    if (!waiting) return null;
    return (
      <WaitingGroup
        group="context"
        harnessName={nameOf(directory, harnessOf(directory, agentId))}
        agentName={agentName}
        rows={[
          { mark: true, label: 30, sub: 66 },
          { mark: true, label: 44, sub: 58 },
          { mark: true, label: 28, sub: 52 },
        ]}
        foot={[84]}
        testID="context-waiting"
        place={land.blank}
      />
    );
  }
  const owner = { kind: "agent", id: agentId } as const;
  const open = (row: ContextRow) =>
    onOpen(
      row.opens === "harness_page"
        ? {
            kind: "harness_part",
            harnessId: context.harnessId,
            part: "context",
            flash: row.readsShared,
          }
        : { kind: "file", owner, name: row.name, own: false },
    );
  const leftOut = notShownWords(context.notShown, context.harnessName, agentName);
  return (
    <section
      ref={land.copy}
      className={land.lands ? "ctx lands" : "ctx"}
      aria-label="Context"
      data-testid="context-group"
    >
      <div className="ctx-h">
        <h2 className="agents-h">Context</h2>
        <ReadFrom context={context} />
      </div>
      <ul className="ctx-group">
        {context.rows.map((row) => (
          <FileRow
            key={row.name}
            row={row}
            harnessName={context.harnessName}
            pulse={pulse?.name === row.name ? pulse.at : 0}
            onOpen={() => open(row)}
          />
        ))}
        {leftOut !== undefined && <NotShownRow title={leftOut.title} line={leftOut.line} />}
      </ul>
      <LinkedFoot
        words={contextFoot(context, set, agentName)}
        onLink={() => onOpen({ kind: "harness_page", harnessId: context.harnessId })}
        testId="context-foot"
      />
      <GiveOwn
        context={context}
        set={set}
        agentName={agentName}
        onGive={(name) => onOpen({ kind: "file", owner, name, own: true })}
      />
    </section>
  );
}

/** Which row to flash, and a new number each time a file comes back saved. */
export function useLanding(key: string): { name: string; at: number } | undefined {
  const [landed, setLanded] = useState<{ name: string; at: number } | undefined>(undefined);
  useEffect(() => {
    const name = takeLanding(key);
    if (name !== undefined) setLanded({ name, at: Date.now() });
  }, [key]);
  return landed;
}

/** At the heading's right: the harness's mark, its name, and when its copy was read. */
export function ReadFrom({ context }: { readonly context: AgentContext | HarnessContext }) {
  return (
    <span className="ctx-from" data-testid="context-read-from">
      <HarnessMark name={context.harnessName} side={14} />
      {`${context.harnessName} · ${clockOrDay(context.readAt)}`}
    </span>
  );
}

/** For each shared file the harness lets this agent have its own of: an act to give it one. */
function GiveOwn({
  context,
  set,
  agentName,
  onGive,
}: {
  readonly context: AgentContext;
  readonly set: HarnessContext | undefined;
  readonly agentName: string;
  readonly onGive: (name: string) => void;
}) {
  const ownable = context.rows.filter(
    (row) => row.replaces !== undefined && set?.shared.some((each) => each.id === row.replaces),
  );
  if (ownable.length === 0 || context.away) return null;
  return (
    <ul className="ctx-group ctx-acts">
      {ownable.map((row) => (
        <li key={row.name}>
          <button
            type="button"
            className="ctx-act"
            onClick={() => onGive(row.name)}
            data-testid={`context-give-${row.name}`}
          >
            {`Give ${agentName} its own ${row.title}…`}
          </button>
        </li>
      ))}
    </ul>
  );
}
