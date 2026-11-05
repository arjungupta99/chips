/**
 * Pair a computer, from the phone (ADR 0085): the code a computer types in, large enough to read
 * across a desk, how long it has left, and the link to send it. Until ADR 0085 only the desktop
 * issued codes (You → Devices there), so a person whose only paired device was this phone had to
 * go back to a terminal to add a laptop.
 *
 * Since ADR 0210 the sheet leads with the link. The server makes it beside the code: the relay's
 * `/pair` page when it has a relay, which opens on any network and hands the code to Chips for Mac
 * with the relay and the server's key, so the computer pairs from wherever it is. A code typed by
 * hand carries none of that, and works only on the server's own network, which is what the line at
 * the foot says. The sheet used to name the server's address to "choose" on the computer, which
 * was a tailnet name the Mac's list of servers never shows (20 October 2026).
 *
 * The code is asked for when the sheet opens, and a fresh one when it runs out or is asked for;
 * one code pairs one device, once. While the code is good the sheet reads the person's devices
 * every few seconds, and the first one paired after the code was made turns it to say so, so
 * nobody has to walk to the computer to find out whether it worked.
 *
 * Beside the list on an iPad the same is a page (`PairPage`): a code is asked for as it opens, and
 * Done once the computer is paired goes back to nothing open.
 */

import type { PairedDeviceRecord, Store } from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text, View } from "react-native";
import { NotInDemo, useInDemo } from "../demo/NotInDemo";
import { Button } from "../ui/Button";
import * as feel from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { shareText } from "../ui/share";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { SheetPage } from "./pages";
import { SheetHead } from "./SheetHead";
import { hostOf } from "./words";

/** How often the sheet asks whether the computer has arrived, while the code is good. */
export const ARRIVAL_POLL_MS = 3000;
/** How far the phone's clock and the server's may disagree about when a device was paired. */
const CLOCK_SKEW_MS = 60_000;

type Issued =
  | { readonly kind: "asking" }
  | {
      readonly kind: "code";
      readonly code: string;
      readonly expiresAt: number;
      readonly at: string;
      /** The link to send a computer, from a server that makes one (ADR 0210). */
      readonly link: string | undefined;
      /** Whether that link is the relay's, which opens on any network. */
      readonly relayed: boolean;
      /** When the code was made, by this phone's clock. */
      readonly since: number;
      /** The devices there were when it was made, when the server said. */
      readonly known: ReadonlySet<string> | undefined;
    }
  | { readonly kind: "paired"; readonly name: string }
  | { readonly kind: "failed"; readonly why: string };

/**
 * The device that arrived since a code was made: not this one, not signed out, not one there was
 * already, and paired no earlier than the code (give or take the two clocks).
 */
export function arrivedSince(
  devices: readonly PairedDeviceRecord[],
  since: number,
  known: ReadonlySet<string> | undefined,
): PairedDeviceRecord | undefined {
  return devices.find(
    (each) =>
      !each.current &&
      each.revokedAt === undefined &&
      known?.has(each.deviceId) !== true &&
      Date.parse(each.pairedAt) >= since - CLOCK_SKEW_MS,
  );
}

interface Pair {
  /** Done, once a computer is paired: the sheet closes, the page goes. */
  readonly onClose: () => void;
  /** A computer paired with this sheet's code: the list of devices is read again. */
  readonly onPaired?: (() => void) | undefined;
  readonly store: Store;
  /** Where this phone reaches the server, for a server too old to say where it is itself. */
  readonly serverUrl: string | undefined;
}

const TITLE = "Pair a computer";

export function PairSheet({ open, ...rest }: Pair & { readonly open: boolean }) {
  return (
    <Sheet open={open} onClose={rest.onClose} testID="pair-sheet">
      <SheetHead title={TITLE} />
      <PairBody open={open} {...rest} />
    </Sheet>
  );
}

export function PairPage(props: Pair) {
  return (
    <SheetPage title={TITLE} testID="pair-page">
      <PairBody open {...props} />
    </SheetPage>
  );
}

/** What the sheet and the page hold: the code, or in the demo why there is none. */
function PairBody({ open, ...rest }: Pair & { readonly open: boolean }) {
  // The demo's workspace lives on this phone: no code is asked for, and none would pair (ADR 0213).
  const demo = useInDemo();
  return demo ? (
    <View style={styles.body}>
      <NotInDemo />
    </View>
  ) : (
    <Pairing open={open} {...rest} />
  );
}

/** The code, asked for as the sheet opens, and what became of it. */
function Pairing({
  open,
  onClose,
  onPaired,
  store,
  serverUrl,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onPaired?: (() => void) | undefined;
  readonly store: Store;
  readonly serverUrl: string | undefined;
}) {
  const { issued, setIssued, ask, left } = useIssued(open, store, serverUrl);
  const expired = issued.kind === "code" && left === 0;
  useArrival(open && issued.kind === "code" && !expired ? issued : undefined, store, (device) => {
    setIssued({ kind: "paired", name: device.name });
    feel.success();
    AccessibilityInfo.announceForAccessibility(`${device.name} is paired`);
    onPaired?.();
  });
  return (
    <>
      {issued.kind === "paired" ? (
        <Paired name={issued.name} onDone={onClose} />
      ) : (
        <>
          <View style={styles.body}>
            <CodeShown issued={issued} left={left} />
            {issued.kind === "code" ? <SendWords issued={issued} /> : null}
          </View>
          <View style={styles.buttons}>
            {issued.kind === "code" && !expired ? <SendButton issued={issued} /> : null}
            <Button
              label="Another code"
              variant="plain"
              onPress={ask}
              disabled={issued.kind === "asking"}
            />
            {issued.kind === "code" && issued.link !== undefined ? <AtHome /> : null}
          </View>
        </>
      )}
    </>
  );
}

/**
 * The code, asked for each time the sheet opens and again on Another code, with the devices there
 * were when it was made, and how long it has left, counted down while the sheet is open.
 */
function useIssued(open: boolean, store: Store, serverUrl: string | undefined) {
  const [issued, setIssued] = useState<Issued>({ kind: "asking" });
  const [now, setNow] = useState(Date.now());
  const ask = () => {
    setIssued({ kind: "asking" });
    const since = Date.now();
    const known = store.devices().then(
      (found) => new Set(found.map((each) => each.deviceId)),
      () => undefined,
    );
    Promise.all([store.issuePairingCode(), known]).then(
      ([code, there]) => {
        setNow(Date.now());
        setIssued({
          kind: "code",
          code: code.code,
          expiresAt: Date.parse(code.expiresAt),
          at: code.serverUrl ?? serverUrl ?? "",
          link: code.link,
          relayed: code.relay !== undefined && code.link !== undefined,
          since,
          known: there,
        });
      },
      (failure: unknown) =>
        setIssued({
          kind: "failed",
          why: failure instanceof Error ? failure.message : "The server did not answer.",
        }),
    );
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a code each time the sheet opens
  useEffect(() => {
    if (open) ask();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [open]);
  const left = issued.kind === "code" ? Math.max(0, issued.expiresAt - now) : 0;
  return { issued, setIssued, ask, left };
}

/** The code large, or why there is none, and how long it has. */
function CodeShown({ issued, left }: { readonly issued: Issued; readonly left: number }) {
  const palette = usePalette();
  if (issued.kind === "failed") {
    return <Text style={[styles.words, { color: palette.red }]}>{issued.why}</Text>;
  }
  const code = issued.kind === "code" ? issued.code : undefined;
  return (
    <>
      <Text
        selectable
        accessibilityLabel={
          code === undefined ? "Asking for a code" : `Pairing code ${code.split("").join(" ")}`
        }
        testID="pair-code"
        style={[
          styles.code,
          { color: code !== undefined && left === 0 ? palette.ink4 : palette.ink },
        ]}
      >
        {code ?? "···-···"}
      </Text>
      <Text style={[styles.life, { color: palette.ink3 }]}>{lifeWords(issued, left)}</Text>
    </>
  );
}

/** The link alone, or from a server too old to make one, the code and its server. */
function SendButton({ issued }: { readonly issued: Extract<Issued, { kind: "code" }> }) {
  return (
    <Button
      label={issued.link === undefined ? "Send the code" : "Send the link"}
      variant="primary"
      onPress={() =>
        void shareText(
          issued.link ?? `${issued.code} — a Chips pairing code for ${hostOf(issued.at)}`,
        )
      }
    />
  );
}

/** A code typed by hand carries no relay, so it pairs only on the server's own network. */
function AtHome() {
  const palette = usePalette();
  return (
    <Text style={[styles.foot, { color: palette.ink3 }]} testID="pair-foot">
      At home? You can type the code in Chips on the computer instead.
    </Text>
  );
}

/**
 * Reads the person's devices every few seconds while a code is good, and says once when one has
 * arrived. Nothing while there is no code to wait on.
 */
function useArrival(
  waiting: Extract<Issued, { kind: "code" }> | undefined,
  store: Store,
  onArrived: (device: PairedDeviceRecord) => void,
): void {
  const said = useRef(onArrived);
  said.current = onArrived;
  useEffect(() => {
    if (waiting === undefined) return;
    let done = false;
    const look = setInterval(() => {
      store.devices().then(
        (found) => {
          const arrived = done ? undefined : arrivedSince(found, waiting.since, waiting.known);
          if (arrived === undefined) return;
          done = true;
          said.current(arrived);
        },
        () => undefined,
      );
    }, ARRIVAL_POLL_MS);
    return () => {
      done = true;
      clearInterval(look);
    };
  }, [waiting, store]);
}

/** What to do with the code: send the link, or, from a server too old to make one, which server. */
function SendWords({ issued }: { readonly issued: Extract<Issued, { kind: "code" }> }) {
  const palette = usePalette();
  if (issued.link === undefined) {
    return (
      <Text style={[styles.words, { color: palette.ink2 }]}>
        On the computer, open Chips, choose <Text style={styles.strong}>{hostOf(issued.at)}</Text>,
        and type this code.
      </Text>
    );
  }
  return (
    <Text style={[styles.words, { color: palette.ink2 }]} testID="pair-words">
      {issued.relayed
        ? "Send the link to the computer and open it there. It reaches your Chips from any network."
        : "Send the link to the computer and open it there. It opens on the same network as your server."}
    </Text>
  );
}

/** The computer arrived: a tick that springs in, its name, and Done. */
function Paired({ name, onDone }: { readonly name: string; readonly onDone: () => void }) {
  const palette = usePalette();
  const grow = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(grow, {
      toValue: 1,
      damping: 11,
      stiffness: 180,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [grow]);
  return (
    <View style={styles.paired} testID="pair-paired">
      <Animated.View
        style={[styles.ring, { backgroundColor: palette.greenSoft, transform: [{ scale: grow }] }]}
      >
        <Icon name="check" size={38} color={palette.green} />
      </Animated.View>
      <Text style={[styles.pairedName, { color: palette.ink }]}>{name} is paired</Text>
      <Text style={[styles.life, { color: palette.ink3 }]}>Just now. It's under Devices now.</Text>
      <View style={styles.done}>
        <Button label="Done" variant="primary" onPress={onDone} />
      </View>
    </View>
  );
}

/** How long the code has, in minutes while there are some, then that it has run out. */
function lifeWords(issued: Issued, left: number): string {
  if (issued.kind !== "code") return "Asking the server for a code…";
  if (left === 0) return "This code has run out. Ask for another.";
  const minutes = Math.ceil(left / 60_000);
  return `Good for ${minutes} ${minutes === 1 ? "minute" : "minutes"}, once`;
}

const styles = StyleSheet.create({
  body: { alignItems: "center", gap: SPACE.sm, paddingHorizontal: SPACE.xl },
  code: {
    fontSize: 44,
    fontWeight: "700",
    letterSpacing: 4,
    fontVariant: ["tabular-nums"],
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    paddingTop: SPACE.md,
  },
  life: { fontSize: TEXT.md, textAlign: "center" },
  words: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    textAlign: "center",
    paddingTop: SPACE.md,
  },
  strong: { fontWeight: "600" },
  buttons: { gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg },
  foot: { fontSize: TEXT.sm, textAlign: "center", lineHeight: TEXT.sm * 1.35 },
  paired: {
    alignItems: "center",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.lg,
  },
  ring: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  pairedName: { fontSize: 22, fontWeight: "700", textAlign: "center", paddingTop: SPACE.sm },
  done: { alignSelf: "stretch", paddingTop: SPACE.lg },
});
