/**
 * Chips on this Wi-Fi, on the first screen of a phone in no workspace (ADR 0172): the servers that
 * answer on the network, each a row to tap. A tap asks to join (ADR 0122's device request): the
 * phone shows a code, the computer shows the same one, and a person allows it there. Nothing is
 * typed. A build that can't look (the web, a build without the module) shows nothing here, and the
 * other ways in stand.
 *
 * On a phone that holds a workspace already, a server other than the one it is paired with is
 * asked about first (SEC-8): the screen names both, and asks to join only on Switch. A tap on a
 * row would otherwise have paired the phone with whichever server answered to the name.
 */

import { askToJoin, type Device } from "@chipschat/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { deviceStorage } from "../device/storage";
import { thisDevice } from "../device/word";
import { ConfirmBody } from "../spaces/ConfirmSheet";
import { Card } from "../ui/Card";
import { ChipPulse } from "../ui/ChipPulse";
import { usePalette } from "../ui/theme";
import { LEADING_PHONE, SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { elsewhereAsking, hostOf, isElsewhere } from "./elsewhere";
import { pairingFailure } from "./failure";
import { canFind, type FoundServer, findServers } from "./finder";
import { Big } from "./JoinCard";
import { phoneName } from "./usePairing";
import { SlideUp } from "./WelcomeMotion";

/** The server and workspace this phone holds, when it holds one. */
export interface HeldServer {
  readonly serverUrl: string | undefined;
  readonly workspace: string;
}

export type State =
  | { readonly kind: "looking" }
  | { readonly kind: "found"; readonly servers: readonly FoundServer[] }
  /** Another server than the one held: a person says so first (SEC-8). */
  | { readonly kind: "confirming"; readonly server: FoundServer }
  | { readonly kind: "asking"; readonly server: FoundServer; readonly code?: string | undefined }
  | { readonly kind: "failed"; readonly server: FoundServer; readonly why: string };

/**
 * At the foot of the first screen (ADR 0213): nothing while it looks or finds nothing, and up from
 * the foot once a Chips answers.
 */
export function OnThisWifi({
  held,
  onPaired,
}: {
  readonly held?: HeldServer | undefined;
  readonly onPaired: (device: Device) => void;
}) {
  const finder = useFinder(held, onPaired);
  return <FinderView finder={finder} held={held} />;
}

/** What the finder knows and does: held by a screen whose layout moves the view (`FinderView`). */
export interface Finder {
  readonly state: State;
  readonly look: () => void;
  readonly ask: (server: FoundServer) => void;
  readonly proceed: (server: FoundServer) => void;
  readonly cancel: () => void;
}

/**
 * The looking and the asking, apart from where they are drawn: an iPad turned on its side moves the
 * finder to the column beside the film, and an ask held in the view was cancelled by the turn and
 * began again at looking (the onboarding audit, Part 2, item 11).
 */
export function useFinder(
  held: HeldServer | undefined,
  onPaired: (device: Device) => void,
): Finder {
  const [state, setState] = useState<State>({ kind: "looking" });
  const stop = useRef<AbortController | undefined>(undefined);
  const look = useCallback(() => {
    setState({ kind: "looking" });
    void findServers(3).then(
      (servers) => setState({ kind: "found", servers }),
      () => setState({ kind: "found", servers: [] }),
    );
  }, []);
  useEffect(() => {
    if (canFind()) look();
    return () => stop.current?.abort();
  }, [look]);
  // The first look runs as the screen comes up, often while iOS's Local Network alert is still on
  // it, and finds nothing however soon it is allowed. So while nothing has answered, it looks again
  // a few times, quietly: what it finds slides in, and nothing found changes nothing on screen
  // (the onboarding audit, Part 2, item 3).
  const [looked, setLooked] = useState(0);
  const nothing = state.kind === "found" && state.servers.length === 0;
  useEffect(() => {
    if (!nothing || looked >= LOOKS_AGAIN) return;
    let gone = false;
    const timer = setTimeout(() => {
      const found = (servers: readonly FoundServer[]) => {
        if (gone) return;
        setLooked((count) => count + 1);
        if (servers.length === 0) return;
        setState((now) =>
          now.kind === "found" && now.servers.length === 0 ? { kind: "found", servers } : now,
        );
      };
      void findServers(3).then(found, () => found([]));
    }, LOOK_AGAIN_MS);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [nothing, looked]);
  const ask = (server: FoundServer) => {
    if (held !== undefined && isElsewhere(held.serverUrl, server.url)) {
      setState({ kind: "confirming", server });
      return;
    }
    proceed(server);
  };
  const proceed = (server: FoundServer) => {
    const asking = new AbortController();
    stop.current = asking;
    setState({ kind: "asking", server });
    void askToJoin({
      serverUrl: server.url,
      name: phoneName(),
      storage: deviceStorage,
      signal: asking.signal,
      onWaiting: ({ code }) => setState({ kind: "asking", server, code }),
    }).then(onPaired, (error: unknown) => {
      if (!asking.signal.aborted) setState({ kind: "failed", server, why: pairingFailure(error) });
    });
  };
  const cancel = () => {
    stop.current?.abort();
    look();
  };
  return { state, look, ask, proceed, cancel };
}

/** The finder drawn: what answered, the ask, and what went wrong. */
export function FinderView({
  finder,
  held,
}: {
  readonly finder: Finder;
  readonly held?: HeldServer | undefined;
}) {
  const palette = usePalette();
  const still = useReduceMotion();
  const { state, look, ask, proceed } = finder;
  if (!canFind() || quietIn(state)) return null;
  return (
    <SlideUp still={still}>
      <View style={styles.section} testID="on-this-wifi">
        {state.kind === "found" ? <Servers servers={state.servers} onAsk={ask} /> : null}
        {state.kind === "confirming" && held !== undefined ? (
          <Card testID="asking-elsewhere">
            <ConfirmBody
              room={{
                face: (
                  <Big scale={1.8}>
                    <ChipPulse
                      gold={palette.gold}
                      ink={palette.ink3}
                      lit={palette.ink}
                      working={false}
                    />
                  </Big>
                ),
                name: state.server.name,
                last: hostOf(state.server.url),
              }}
              confirming={{
                asking: elsewhereAsking(
                  {
                    server: state.server.url,
                    name: state.server.name,
                    heldServer: held.serverUrl,
                    workspace: held.workspace,
                    device: thisDevice(),
                  },
                  "wifi",
                ),
                tone: palette.red,
                busy: false,
              }}
              onConfirm={() => proceed(state.server)}
              onCancel={look}
              cancel={`Stay in ${held.workspace}`}
            />
          </Card>
        ) : null}
        {state.kind === "asking" ? (
          <Asking server={state.server} code={state.code} onCancel={finder.cancel} />
        ) : null}
        {state.kind === "failed" ? (
          <View style={styles.gap}>
            <Text style={[styles.words, { color: palette.red }]}>{state.why}</Text>
            <Link label="Look again" onPress={look} />
          </View>
        ) : null}
      </View>
    </SlideUp>
  );
}

/** How many times, and how far apart, a first screen that found nothing looks again. */
const LOOKS_AGAIN = 4;
const LOOK_AGAIN_MS = 5000;

/** Looking still, or nothing found: what the foot of the first screen shows nothing for. */
function quietIn(state: State): boolean {
  return state.kind === "looking" || (state.kind === "found" && state.servers.length === 0);
}

function Servers({
  servers,
  onAsk,
}: {
  readonly servers: readonly FoundServer[];
  readonly onAsk: (server: FoundServer) => void;
}) {
  const palette = usePalette();
  return (
    <Card padding="none">
      {servers.map((server, index) => (
        <Pressable
          key={server.url}
          accessibilityRole="button"
          onPress={() => onAsk(server)}
          testID={`found-${index}`}
          style={({ pressed }) => [
            styles.server,
            index > 0
              ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.line }
              : null,
            pressed ? { backgroundColor: palette.surface2 } : null,
          ]}
        >
          <View style={styles.serverWords}>
            <Text style={[styles.name, { color: palette.ink }]}>{server.name}</Text>
            <Text style={[styles.small, { color: palette.ink3 }]}>
              {server.url.replace(/^http:\/\//, "")}
            </Text>
          </View>
          <Text style={[styles.ask, { color: palette.blueInk }]}>Ask to join</Text>
        </Pressable>
      ))}
    </Card>
  );
}

function Asking({
  server,
  code,
  onCancel,
}: {
  readonly server: FoundServer;
  readonly code: string | undefined;
  readonly onCancel: () => void;
}) {
  const palette = usePalette();
  return (
    <Card testID="asking-to-join">
      <Text
        style={[styles.name, { color: palette.ink }]}
      >{`Allow ${thisDevice()} on ${server.name}`}</Text>
      {code === undefined ? (
        <ActivityIndicator color={palette.ink3} />
      ) : (
        <Text
          style={[styles.code, { color: palette.ink, backgroundColor: palette.surface2 }]}
          testID="join-code"
        >
          {code}
        </Text>
      )}
      <Text style={[styles.words, { color: palette.ink3 }]}>
        {`Chips on ${server.name} asks about ${thisDevice()}: type this code there and allow it, and ${thisDevice()} is in.`}
      </Text>
      <Link label="Cancel" onPress={onCancel} />
    </Card>
  );
}

function Link({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <Text style={[styles.ask, { color: palette.blueInk }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  gap: { gap: SPACE.sm },
  words: { fontSize: TEXT.md, lineHeight: Math.round(TEXT.md * LEADING_PHONE) },
  server: { flexDirection: "row", alignItems: "center", gap: SPACE.md, padding: SPACE.lg },
  serverWords: { flex: 1, gap: 2 },
  name: { fontSize: TEXT.body, fontWeight: "600" },
  small: { fontSize: TEXT.sm },
  ask: { fontSize: TEXT.md, fontWeight: "600" },
  code: {
    alignSelf: "stretch",
    textAlign: "center",
    paddingVertical: SPACE.md,
    borderRadius: 12,
    overflow: "hidden",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 2,
    fontVariant: ["tabular-nums"],
  },
});
