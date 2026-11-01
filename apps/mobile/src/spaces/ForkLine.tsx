/**
 * A person's ask for an agent, in the room it is for: one line, in the room's margin, that waits
 * and then says the agent joined, with its face, or after a minute that the harness didn't make
 * it, with Try again for whoever may ask.
 *
 * - **A fork** (ADR 0087, Fork): *Forking Shopping…*, then the copy joined (`forkWords`).
 * - **A new agent** (ADR 0108): *Asking Jacobian for Reviewer…*, then Reviewer joined
 *   (`askWords`).
 *
 * The words are core's, so the desktop says the same; the minute is timed here from the ask, as
 * the server times it, and the line wakes once at its end rather than ticking.
 */

import {
  askWords,
  type Directory,
  forkWords,
  type Line,
  type Space,
  type Store,
} from "@chipschat/core";
import { FORK_WAIT_MS, NEW_AGENT_WAIT_MS } from "@chipschat/protocol";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { faceProps } from "../agents/face";
import { useSnapshot } from "../store/provider";
import { Avatar } from "../ui/Avatar";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { clockTime } from "./when";

/** The clock for one ask: now, and again the moment its wait is up. */
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

/** What an ask's line says, whichever kind it is. */
interface Said {
  readonly state: "waiting" | "joined" | "not_made";
  readonly title: string;
  readonly sub: string;
  /** The agent that joined, whose face is on the line. */
  readonly agentId?: string | undefined;
  readonly retry: boolean;
}

export function ForkLine({
  line,
  space,
  selfId,
  store,
}: {
  readonly line: Line;
  readonly space: Space;
  readonly selfId: string;
  readonly store: Store;
}) {
  // Its own read of who is who: the room's rows are not drawn again for every change elsewhere.
  const snapshot = useSnapshot(store);
  const now = useAskClock(line, FORK_WAIT_MS);
  const words = forkWords(snapshot.model, space, line, snapshot.directory, selfId, now);
  if (words === undefined) return null;
  return (
    <AskLine
      line={line}
      directory={snapshot.directory}
      said={{ ...words, agentId: words.copyId }}
      again={() => store.forkAgent(words.agentId, space.id)}
      testID="fork"
    />
  );
}

export function NewAgentLine({
  line,
  space,
  selfId,
  store,
}: {
  readonly line: Line;
  readonly space: Space;
  readonly selfId: string;
  readonly store: Store;
}) {
  const snapshot = useSnapshot(store);
  const now = useAskClock(line, NEW_AGENT_WAIT_MS);
  const words = askWords(snapshot.model, space, line, snapshot.directory, selfId, now);
  if (words === undefined) return null;
  return (
    <AskLine
      line={line}
      directory={snapshot.directory}
      said={words}
      again={() => store.askAgent(words.harnessId, space.id, words.name)}
      testID="new-agent"
    />
  );
}

function AskLine({
  line,
  directory,
  said,
  again,
  testID,
}: {
  readonly line: Line;
  readonly directory: Directory;
  readonly said: Said;
  readonly again: () => Promise<void>;
  readonly testID: string;
}) {
  const palette = usePalette();
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const [asking, setAsking] = useState(false);
  const askAgain = () => {
    setAsking(true);
    setFailed(undefined);
    again()
      .catch((error: unknown) => {
        setFailed(error instanceof Error ? error.message : "The server would not ask again.");
      })
      .finally(() => setAsking(false));
  };
  const warn = said.state === "not_made";
  const sub = warn ? said.sub : `${said.sub} · ${clockTime(line.ts)}`;
  return (
    <View style={styles.line} testID={`${testID}-${said.state}`}>
      <View style={styles.head}>
        {said.state === "waiting" ? <ActivityIndicator size="small" color={palette.ink3} /> : null}
        {said.agentId === undefined ? null : (
          <Avatar
            name={directory[said.agentId]?.displayName ?? said.title}
            {...faceProps(directory, said.agentId)}
            size="xs"
            decorative
          />
        )}
        <Text
          style={[
            styles.title,
            { color: warn ? palette.amberInk : palette.ink2 },
            warn ? styles.warn : null,
          ]}
        >
          {said.title}
        </Text>
      </View>
      <Text style={[styles.sub, { color: palette.ink3 }]}>{sub}</Text>
      {said.retry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Try again"
          accessibilityState={{ busy: asking, disabled: asking }}
          disabled={asking}
          onPress={askAgain}
          testID={`${testID}-again`}
          style={({ pressed }) => [
            styles.again,
            { borderColor: palette.amber, opacity: pressed || asking ? 0.7 : 1 },
          ]}
        >
          <Text style={[styles.againWords, { color: palette.amberInk }]}>Try again</Text>
        </Pressable>
      ) : null}
      {failed === undefined ? null : (
        <Text style={[styles.sub, { color: palette.redInk }]}>{failed}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { alignItems: "center", gap: 3, paddingVertical: SPACE.sm, paddingHorizontal: SPACE.xl },
  head: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  title: { fontSize: TEXT.sm + 1, textAlign: "center" },
  warn: { fontWeight: "600" },
  sub: { fontSize: TEXT.xs + 1, textAlign: "center", lineHeight: (TEXT.xs + 1) * 1.35 },
  again: {
    marginTop: SPACE.xs,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.md,
    paddingVertical: 5,
  },
  againWords: { fontSize: TEXT.sm, fontWeight: "600" },
});
