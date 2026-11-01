/**
 * What the room says under a message an agent hasn't picked up (ADR 0083), as the phone says it
 * (`apps/mobile/src/spaces/Waits.tsx`): the agent's face and "OpenClaw hasn't picked this up · 40s"
 * once the message has waited thirty seconds with nothing from it, or at once "OpenClaw can't
 * answer yet" and why, when the agent is offline or said it is in trouble. Core finds and words
 * them (`waitingOn`, `waitWords`).
 *
 * The room works them out once, with a clock that ticks only while something waits, and each
 * message row reads its own line from a small board, so a tick redraws only the rows it changes.
 */

import type { Directory, Space, WaitWords } from "@chipschat/core";
import { faceKind, faceOf, nameOf, waitingOn, waitWords } from "@chipschat/core";
import type { SpaceIcon } from "@chipschat/protocol";
import { Avatar } from "@chipschat/ui";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

interface Row {
  readonly harnessId: string;
  readonly name: string;
  /** An agent is drawn in its own outline, wearing its own face (ADR 0089). */
  readonly kind: "harness" | "agent";
  readonly icon: SpaceIcon | undefined;
  readonly words: WaitWords;
}

const NONE: readonly Row[] = [];
/** How often the room's clock ticks while something waits: the words count in tens of seconds. */
const TICK_MS = 5000;

/** The waits by message, keeping each message's rows the same object while their words hold. */
class Board {
  private rows = new Map<string, readonly Row[]>();
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly rowsOf = (lineId: string): readonly Row[] => this.rows.get(lineId) ?? NONE;

  set(next: ReadonlyMap<string, readonly Row[]>): void {
    const kept = new Map<string, readonly Row[]>();
    let changed = next.size !== this.rows.size;
    for (const [lineId, rows] of next) {
      const was = this.rows.get(lineId);
      const same = was !== undefined && JSON.stringify(was) === JSON.stringify(rows);
      kept.set(lineId, same ? was : rows);
      if (!same) changed = true;
    }
    this.rows = kept;
    if (changed) for (const listener of this.listeners) listener();
  }
}

const BoardContext = createContext<Board | undefined>(undefined);

/** Works out the room's waits and hands each message row its own. */
export function WaitsProvider({
  space,
  directory,
  children,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly children: ReactNode;
}) {
  const board = useMemo(() => new Board(), []);
  const waits = useMemo(() => waitingOn(space, directory), [space, directory]);
  const waiting = waits.length > 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return;
    setNow(Date.now());
    const clock = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(clock);
  }, [waiting]);
  useEffect(() => {
    const byLine = new Map<string, Row[]>();
    for (const wait of waits) {
      const words = waitWords(wait, directory, now);
      if (words === undefined) continue;
      const rows = byLine.get(wait.lineId) ?? [];
      rows.push({
        harnessId: wait.harnessId,
        name: nameOf(directory, wait.harnessId),
        kind: faceKind(directory, wait.harnessId) === "agent" ? "agent" : "harness",
        icon: faceOf(directory, wait.harnessId),
        words,
      });
      byLine.set(wait.lineId, rows);
    }
    board.set(byLine);
  }, [board, waits, directory, now]);
  return <BoardContext.Provider value={board}>{children}</BoardContext.Provider>;
}

const alone = () => () => undefined;

/** Under a message: each agent it waits on, and why when the room knows. */
export function Waits({ lineId }: { readonly lineId: string }) {
  const board = useContext(BoardContext);
  const rows = useSyncExternalStore(board?.subscribe ?? alone, () => board?.rowsOf(lineId) ?? NONE);
  if (rows.length === 0) return null;
  return (
    <div className="msg-waits" data-testid={`waits-${lineId}`}>
      {rows.map(({ harnessId, name, kind, icon, words }) => (
        <div
          key={harnessId}
          className="msg-wait"
          data-known={words.known ? "true" : undefined}
          data-testid={`wait-${harnessId}`}
        >
          <Avatar name={name} kind={kind} icon={icon} size="xs" cantAnswer={words.known} />
          <span className="msg-wait-words">
            <span className="msg-wait-title">
              {words.title}
              {words.waited === undefined ? null : (
                <span className="msg-wait-time"> · {words.waited}</span>
              )}
            </span>
            {words.why === undefined ? null : <span className="msg-wait-why">{words.why}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
