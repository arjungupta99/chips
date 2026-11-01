/**
 * What the room says under a message an agent hasn't picked up (ADR 0083): the agent's face and
 * "OpenClaw hasn't picked this up · 40s" once the message has waited thirty seconds with nothing
 * from it, or at once "OpenClaw can't answer yet" and why, when the agent is offline or said it is
 * in trouble. It goes the moment anything from the agent arrives. Core finds the waits and words
 * them (`waitingOn`, `waitWords`), so the desktop says the same.
 *
 * The room works them out once, with a clock that ticks only while something waits, and puts them
 * on a small board each message row reads its own line from. A tick then redraws the rows whose
 * words changed, not the room.
 */

import type { Directory, Space, WaitWords } from "@chipschat/core";
import { nameOf, waitingOn, waitWords } from "@chipschat/core";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import { type FaceProps, faceProps } from "../agents/face";
import { Avatar } from "../ui/Avatar";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { clockOrDay } from "./when";

/** One agent a message waits on, and what to say of it. */
interface Row {
  readonly harnessId: string;
  readonly name: string;
  readonly face: FaceProps;
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
      const words = waitWords(wait, directory, now, clockOrDay);
      if (words === undefined) continue;
      const rows = byLine.get(wait.lineId) ?? [];
      rows.push({
        harnessId: wait.harnessId,
        name: nameOf(directory, wait.harnessId),
        face: faceProps(directory, wait.harnessId),
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
export function Waits({ lineId, mine }: { readonly lineId: string; readonly mine: boolean }) {
  const board = useContext(BoardContext);
  const rows = useSyncExternalStore(board?.subscribe ?? alone, () => board?.rowsOf(lineId) ?? NONE);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.waits, mine ? styles.mine : null]} testID={`waits-${lineId}`}>
      {rows.map((row) => (
        <Wait key={row.harnessId} row={row} mine={mine} />
      ))}
    </View>
  );
}

function Wait({ row, mine }: { readonly row: Row; readonly mine: boolean }) {
  const palette = usePalette();
  const { title, waited, why, known } = row.words;
  const said = [title, waited, why].filter((each) => each !== undefined).join(", ");
  return (
    <View
      accessible
      accessibilityLabel={said}
      style={[styles.wait, mine ? styles.waitMine : null]}
      testID={`wait-${row.harnessId}`}
    >
      <View style={[styles.words, mine ? styles.wordsMine : null]}>
        <Text style={[styles.title, { color: known ? palette.amberInk : palette.ink3 }]}>
          {title}
          {waited === undefined ? null : <Text style={{ color: palette.ink3 }}> · {waited}</Text>}
        </Text>
        {why === undefined ? null : (
          <Text style={[styles.why, { color: palette.ink3 }]}>{why}</Text>
        )}
      </View>
      <View style={known ? null : styles.quiet}>
        <Avatar name={row.name} {...row.face} size="xs" cantAnswer={known} decorative />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A step down from the bubble, as it had when it stood in the body with the bubble's own gap.
  waits: { marginTop: SPACE.sm, gap: SPACE.xs },
  mine: { alignItems: "flex-end" },
  // The face first, then the words, at the start of the line, and the words wrap rather than push
  // the face out of the line: long ones ("Restaurant Tracking · fork hasn't picked this up · 18
  // min") put it over the speaker's face (19 October 2026).
  wait: {
    flexDirection: "row-reverse",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    maxWidth: "86%",
  },
  waitMine: { flexDirection: "row", alignSelf: "flex-end" },
  words: { flexShrink: 1 },
  wordsMine: { alignItems: "flex-end" },
  title: { fontSize: TEXT.sm, lineHeight: 17 },
  why: { fontSize: TEXT.xs, lineHeight: 16 },
  // A face that has said nothing is drawn quiet: the room does not know why.
  quiet: { opacity: 0.55 },
});
