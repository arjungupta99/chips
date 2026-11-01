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
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
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

type State =
  | { readonly kind: "looking" }
  | { readonly kind: "found"; readonly servers: readonly FoundServer[] }
  /** Another server than the one held: a person says so first (SEC-8). */
  | { readonly kind: "confirming"; readonly server: FoundServer }
  | { readonly kind: "asking"; readonly server: FoundServer; readonly code?: string | undefined }
  | { readonly kind: "failed"; readonly server: FoundServer; readonly why: string };

export function OnThisWifi({
  held,
  onPaired,
  foot = false,
}: {
  readonly held?: HeldServer | undefined;
  readonly onPaired: (device: Device) => void;
  /**
   * At the foot of the first screen's new top (ADR 0213): nothing while it looks or finds nothing,
   * and up from the foot, with no heading, once a Chips answers.
   */
  readonly foot?: boolean;
}) {
  const palette = usePalette();
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
  if (!canFind() || (foot && quietIn(state))) return null;
  return (
    <AtFoot foot={foot}>
      <View style={styles.section} testID="on-this-wifi">
        <Heading shown={!foot} />
        {state.kind === "looking" ? <Looking /> : null}
        {state.kind === "found" ? (
          <Servers servers={state.servers} onAsk={ask} onLook={look} />
        ) : null}
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
          <Asking
            server={state.server}
            code={state.code}
            onCancel={() => {
              stop.current?.abort();
              look();
            }}
          />
        ) : null}
        {state.kind === "failed" ? (
          <View style={styles.gap}>
            <Text style={[styles.words, { color: palette.red }]}>{state.why}</Text>
            <Link label="Look again" onPress={look} />
          </View>
        ) : null}
      </View>
    </AtFoot>
  );
}

/** Looking still, or nothing found: what the foot of the first screen shows nothing for. */
function quietIn(state: State): boolean {
  return state.kind === "looking" || (state.kind === "found" && state.servers.length === 0);
}

/** Up from the foot of the first screen, where it is there; else where it stands. */
function AtFoot({ foot, children }: { readonly foot: boolean; readonly children: ReactNode }) {
  const still = useReduceMotion();
  return foot ? <SlideUp still={still}>{children}</SlideUp> : children;
}

function Heading({ shown }: { readonly shown: boolean }) {
  const palette = usePalette();
  if (!shown) return null;
  return <Text style={[styles.heading, { color: palette.ink3 }]}>On this Wi-Fi</Text>;
}

function Looking() {
  const palette = usePalette();
  return (
    <View style={styles.row}>
      <ActivityIndicator color={palette.ink3} />
      <Text style={[styles.words, { color: palette.ink3 }]}>Looking on this Wi-Fi…</Text>
    </View>
  );
}

function Servers({
  servers,
  onAsk,
  onLook,
}: {
  readonly servers: readonly FoundServer[];
  readonly onAsk: (server: FoundServer) => void;
  readonly onLook: () => void;
}) {
  const palette = usePalette();
  if (servers.length === 0) {
    return (
      <View style={styles.gap}>
        <Text style={[styles.words, { color: palette.ink3 }]}>
          Nothing here yet. Open Chips on your computer, then look again.
        </Text>
        <Link label="Look again" onPress={onLook} />
      </View>
    );
  }
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
        {`Chips on ${server.name} shows the same code. Allow it there, and ${thisDevice()} is in.`}
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
  heading: { fontSize: TEXT.sm, textTransform: "uppercase", letterSpacing: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
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
