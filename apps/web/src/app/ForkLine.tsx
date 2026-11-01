/**
 * A person's ask for an agent, in the room it is for, in the phone's words: it waits, then says
 * the agent joined with its face, or after a minute that the harness didn't make it, with Try
 * again for whoever may ask. The wait is timed from the ask, as the server times it; the line
 * wakes once at its end.
 *
 * - **A fork** (ADR 0087, Fork): *Forking Shopping…*, then the copy joined (`forkWords`).
 * - **A new agent** (ADR 0108): *Asking Jacobian for Reviewer…*, then Reviewer joined
 *   (`askWords`).
 */

import {
  askWords,
  type Directory,
  forkWords,
  type Line,
  type Space,
  type WorkspaceModel,
} from "@chipschat/core";
import { FORK_WAIT_MS, NEW_AGENT_WAIT_MS } from "@chipschat/protocol";
import { Avatar, Button } from "@chipschat/ui";
import { useEffect, useState } from "react";
import { clockTime } from "./time.ts";

/** Now, and again the moment this ask's wait is up. */
function useAskClock(line: Line, wait: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const left = Date.parse(line.ts) + wait - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(timer);
  }, [line.ts, wait]);
  return now;
}

interface Asked {
  readonly line: Line;
  readonly space: Space;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
}

export function ForkLine(
  props: Asked & {
    /** Ask again; rejects with the server's reason. */
    readonly onFork?: ((agentId: string) => Promise<void>) | undefined;
  },
) {
  const now = useAskClock(props.line, FORK_WAIT_MS);
  const words = forkWords(props.model, props.space, props.line, props.directory, props.selfId, now);
  if (words === undefined) return null;
  const { onFork } = props;
  return (
    <AskLine
      line={props.line}
      directory={props.directory}
      said={{ ...words, agentId: words.copyId }}
      again={onFork === undefined ? undefined : () => onFork(words.agentId)}
      testId="fork"
    />
  );
}

export function NewAgentLine(
  props: Asked & {
    /** Ask again, under the same name; rejects with the server's reason. */
    readonly onAsk?: ((harnessId: string, name: string) => Promise<void>) | undefined;
  },
) {
  const now = useAskClock(props.line, NEW_AGENT_WAIT_MS);
  const words = askWords(props.model, props.space, props.line, props.directory, props.selfId, now);
  if (words === undefined) return null;
  const { onAsk } = props;
  return (
    <AskLine
      line={props.line}
      directory={props.directory}
      said={words}
      again={onAsk === undefined ? undefined : () => onAsk(words.harnessId, words.name)}
      testId="new-agent"
    />
  );
}

function AskLine(props: {
  readonly line: Line;
  readonly directory: Directory;
  readonly said: {
    readonly state: "waiting" | "joined" | "not_made";
    readonly title: string;
    readonly sub: string;
    readonly agentId?: string | undefined;
    readonly retry: boolean;
  };
  readonly again: (() => Promise<void>) | undefined;
  readonly testId: string;
}) {
  const { line, directory, said, again } = props;
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const askAgain = () => {
    if (again === undefined) return;
    setAsking(true);
    setFailed(undefined);
    again()
      .catch((error: unknown) => {
        setFailed(error instanceof Error ? error.message : "The server would not ask again.");
      })
      .finally(() => setAsking(false));
  };
  const warn = said.state === "not_made";
  return (
    <div
      className={`sys fork-line${warn ? " fork-warn" : ""}`}
      data-testid={`${props.testId}-${said.state}`}
    >
      <div className="fork-head">
        {said.state === "waiting" && <span className="fork-spin" aria-hidden="true" />}
        {said.agentId !== undefined && (
          <Avatar
            name={directory[said.agentId]?.displayName ?? said.title}
            kind="agent"
            icon={directory[said.agentId]?.face}
            size="xs"
          />
        )}
        <span className="fork-title">{said.title}</span>
      </div>
      <div className="fork-sub">{warn ? said.sub : `${said.sub} · ${clockTime(line.ts)}`}</div>
      {said.retry && again !== undefined && (
        <Button
          size="sm"
          onClick={askAgain}
          disabled={asking}
          data-testid={`${props.testId}-again`}
        >
          Try again
        </Button>
      )}
      {failed !== undefined && (
        <p className="confirm-failed" role="alert">
          {failed}
        </p>
      )}
    </div>
  );
}
