/**
 * An agent's card, its message history and its face in one pane, for a place with no stack of
 * pages of its own: beside Search's results (ADR 0269). The card's Message history row opens the
 * history in the card's place (ADR 0270), and its face and Icon row the face's page (ADR 0272);
 * each way back, named for the agent, returns to the card.
 */

import { PERMISSIONS_TITLE, type SetRulesInput } from "@chipschat/core";
import { type ComponentProps, type ReactNode, useState } from "react";
import { AgentPage } from "../Agents.tsx";
import type { FileService } from "../files.ts";
import { AgentFace } from "./AgentFace.tsx";
import { AgentHistory } from "./AgentHistory.tsx";
import { AgentPermissions } from "./AgentPermissions.tsx";

export function AgentPane(
  props: Omit<
    ComponentProps<typeof AgentPage>,
    "onOpenHistory" | "onOpenFace" | "onOpenPermissions"
  > & {
    readonly files: FileService;
    readonly onSetRules?: ((input: SetRulesInput) => void) | undefined;
    readonly onOpenHarness?: ((harnessId: string) => void) | undefined;
  },
) {
  const { files, onSetRules, onOpenHarness, ...card } = props;
  const [shown, setShown] = useState<"card" | "history" | "face" | "permissions">("card");
  const name = card.directory[card.agentId]?.displayName ?? "Agent";
  if (shown === "face") {
    return (
      <FacePage name={name} title="Icon" onBack={() => setShown("card")}>
        <AgentFace agentId={card.agentId} directory={card.directory} agents={card.agents} />
      </FacePage>
    );
  }
  if (shown === "permissions" && card.banners !== undefined) {
    return (
      <FacePage name={name} title={PERMISSIONS_TITLE} onBack={() => setShown("card")}>
        <AgentPermissions
          agentId={card.agentId}
          model={card.model}
          directory={card.directory}
          selfId={card.selfId}
          service={card.banners}
          onSetRules={onSetRules}
          onOpenSpace={card.onOpenRoom}
          onOpenHarness={onOpenHarness ?? (() => setShown("card"))}
        />
      </FacePage>
    );
  }
  if (shown === "history") {
    return (
      <AgentHistory
        agentId={card.agentId}
        model={card.model}
        directory={card.directory}
        selfId={card.selfId}
        files={files}
        faces={card.faces}
        agents={card.agents}
        backLabel={name}
        onBack={() => setShown("card")}
        onOpenRoom={card.onOpenRoom}
        onOpenAgent={card.onOpenAgent}
      />
    );
  }
  return (
    <AgentPage
      {...card}
      onOpenHistory={() => setShown("history")}
      onOpenPermissions={card.banners === undefined ? undefined : () => setShown("permissions")}
      onOpenFace={() => setShown("face")}
    />
  );
}

/** The face's page in the pane: its way back to the card, and the picker. */
function FacePage(props: {
  readonly name: string;
  readonly title: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  return (
    <main className="conv harnesses" aria-label={`${props.name}: ${props.title}`}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={props.onBack}>
            {`‹ ${props.name}`}
          </button>
          <h1>{props.title}</h1>
        </div>
      </header>
      <div className="harnesses-body">{props.children}</div>
    </main>
  );
}
