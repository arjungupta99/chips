/**
 * An agent's card, its message history and its face in one pane, for a place with no stack of
 * pages of its own: beside Search's results (ADR 0269). The card's Message history row opens the
 * history in the card's place (ADR 0270), and its face and Icon row the face's page (ADR 0272);
 * each way back, named for the agent, returns to the card.
 */

import { type ComponentProps, type ReactNode, useState } from "react";
import { AgentPage } from "../Agents.tsx";
import type { FileService } from "../files.ts";
import { AgentFace } from "./AgentFace.tsx";
import { AgentHistory } from "./AgentHistory.tsx";

export function AgentPane(
  props: Omit<ComponentProps<typeof AgentPage>, "onOpenHistory" | "onOpenFace"> & {
    readonly files: FileService;
  },
) {
  const { files, ...card } = props;
  const [shown, setShown] = useState<"card" | "history" | "face">("card");
  const name = card.directory[card.agentId]?.displayName ?? "Agent";
  if (shown === "face") {
    return (
      <FacePage name={name} onBack={() => setShown("card")}>
        <AgentFace agentId={card.agentId} directory={card.directory} agents={card.agents} />
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
      onOpenFace={() => setShown("face")}
    />
  );
}

/** The face's page in the pane: its way back to the card, and the picker. */
function FacePage(props: {
  readonly name: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}) {
  return (
    <main className="conv harnesses" aria-label={`${props.name}: Icon`}>
      <header className="conv-h">
        <div className="conv-h-t">
          <button type="button" className="agent-back" onClick={props.onBack}>
            {`‹ ${props.name}`}
          </button>
          <h1>Icon</h1>
        </div>
      </header>
      <div className="harnesses-body">{props.children}</div>
    </main>
  );
}
