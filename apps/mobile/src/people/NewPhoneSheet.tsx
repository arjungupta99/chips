/**
 * A new phone for somebody already here (ADR 0206), from their page: an owner's alone. The code
 * pairs a phone as them, with every space and everything they said, for a person whose phone is
 * new or had Chips deleted from it and who has nothing left to make a code of their own with.
 *
 * Natalie, 19 October 2026: Chips deleted and put back, no passkey, and her invite refused by her
 * own name. The QR is for the phone beside this one: her Welcome screen's Scan a QR code reads it,
 * and the relay and the server's key in it reach the server from anywhere. The link is for a
 * phone that is not here: sent, and pasted on that phone's Welcome screen. A fresh code each time
 * the sheet opens, when one runs out, or when asked; one code pairs one phone, once.
 *
 * Opened from one of their phones' rows, it reconnects that phone (ADR 0236): the code names it,
 * and the phone that uses it takes its place, the old one signed out once the new one is allowed,
 * so a phone that had Chips deleted and put back is listed once.
 */

import type { Store } from "@chipschat/core";
import { appPairingUrl, pairingUrl } from "@chipschat/protocol";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { NotInDemo, useInDemo } from "../demo/NotInDemo";
import { Button } from "../ui/Button";
import { QrCode } from "../ui/QrCode";
import { Sheet } from "../ui/Sheet";
import { shareText } from "../ui/share";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { SheetHead } from "../you/SheetHead";

/** The phone a reconnect code is for (ADR 0236): the row of theirs that was tapped. */
export interface Reconnecting {
  readonly deviceId: string;
  readonly name: string;
}

type Issued =
  | { readonly kind: "asking" }
  | {
      readonly kind: "code";
      readonly code: string;
      readonly expiresAt: number;
      /** What the QR carries, read by Welcome's camera. */
      readonly scan: string;
      /** What is sent, opened or pasted on the new phone. */
      readonly link: string;
    }
  | { readonly kind: "failed"; readonly why: string };

export function NewPhoneSheet({
  open,
  onClose,
  store,
  personId,
  name,
  serverUrl,
  replacing,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly store: Store;
  /** Whose phone it is. */
  readonly personId: string;
  readonly name: string;
  /** Where this phone reaches the server, for a server too old to say where it is itself. */
  readonly serverUrl: string | undefined;
  /** The phone of theirs this one reconnects in the place of (ADR 0236); a new phone without. */
  readonly replacing?: Reconnecting | undefined;
}) {
  // The demo's workspace lives on this phone: no code is asked for, and none would pair (ADR 0213).
  const demo = useInDemo();
  const title = replacing === undefined ? `A new phone for ${name}` : `Reconnect ${replacing.name}`;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      testID={replacing === undefined ? "new-phone-sheet" : "reconnect-sheet"}
    >
      <SheetHead title={title} />
      {demo ? (
        <View style={styles.body}>
          <NotInDemo />
        </View>
      ) : (
        <Code
          store={store}
          personId={personId}
          name={name}
          serverUrl={serverUrl}
          open={open}
          replacing={replacing}
        />
      )}
    </Sheet>
  );
}

/** The code, and the ways to send it or ask for another. */
function Code({
  store,
  personId,
  name,
  serverUrl,
  open,
  replacing,
}: {
  readonly store: Store;
  readonly personId: string;
  readonly name: string;
  readonly serverUrl: string | undefined;
  readonly open: boolean;
  readonly replacing: Reconnecting | undefined;
}) {
  const palette = usePalette();
  const { issued, left, ask } = useNewPhoneCode(
    store,
    personId,
    serverUrl,
    open,
    replacing?.deviceId,
  );
  const live = issued.kind === "code" && left > 0;
  return (
    <>
      <View style={styles.body}>
        {issued.kind === "failed" ? (
          <Text style={[styles.words, { color: palette.red }]} testID="new-phone-failed">
            {issued.why}
          </Text>
        ) : (
          <CodeShown issued={issued} left={left} name={name} replacing={replacing} />
        )}
      </View>
      <View style={styles.buttons}>
        {issued.kind === "code" && live ? (
          <Button
            label="Send the link"
            variant="primary"
            onPress={() =>
              void shareText(
                `${replacing === undefined ? "Your Chips, on your new phone" : "Your Chips, back on your phone"}: copy this message, open Chips, and tap Paste.\n\n${issued.link}`,
              )
            }
          />
        ) : null}
        <Button
          label="Another code"
          variant="plain"
          onPress={ask}
          disabled={issued.kind === "asking"}
        />
      </View>
    </>
  );
}

/** A code for the person's new phone each time the sheet opens, and how long it has left. */
function useNewPhoneCode(
  store: Store,
  personId: string,
  serverUrl: string | undefined,
  open: boolean,
  /** The device the phone that uses it replaces (ADR 0236). */
  replaces: string | undefined,
): { readonly issued: Issued; readonly left: number; readonly ask: () => void } {
  const [issued, setIssued] = useState<Issued>({ kind: "asking" });
  const [now, setNow] = useState(Date.now());
  const ask = () => {
    setIssued({ kind: "asking" });
    store.issuePairingCode(personId, replaces).then(
      (code) => {
        const base = code.serverUrl ?? serverUrl ?? "";
        const offer = { relay: code.relay, key: code.serverKey };
        setNow(Date.now());
        setIssued({
          kind: "code",
          code: code.code,
          expiresAt: Date.parse(code.expiresAt),
          scan: pairingUrl(base, code.code, offer),
          link: appPairingUrl(base, code.code, offer),
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
  return { issued, left, ask };
}

/** The QR, the code under it, how long it has, and what to do with it on the new phone. */
function CodeShown({
  issued,
  left,
  name,
  replacing,
}: {
  readonly issued: Exclude<Issued, { readonly kind: "failed" }>;
  readonly left: number;
  readonly name: string;
  readonly replacing: Reconnecting | undefined;
}) {
  const palette = usePalette();
  const code = issued.kind === "code" ? issued : undefined;
  const live = code !== undefined && left > 0;
  return (
    <>
      <View style={[styles.qr, !live && styles.spent]}>
        {code === undefined ? (
          <View style={styles.qrRoom} />
        ) : (
          <QrCode text={code.scan} size={200} testID="new-phone-qr" />
        )}
      </View>
      <Text
        selectable
        accessibilityLabel={
          code === undefined ? "Asking for a code" : `Pairing code ${code.code.split("").join(" ")}`
        }
        testID="new-phone-code"
        style={[styles.code, { color: live ? palette.ink : palette.ink4 }]}
      >
        {code?.code ?? "···-···"}
      </Text>
      <Text style={[styles.life, { color: palette.ink3 }]}>{lifeWords(issued, left)}</Text>
      <Text style={[styles.words, { color: palette.ink2 }]}>{scanWords(name, replacing)}</Text>
    </>
  );
}

/** What to do with the code on the phone, and what it brings back. */
function scanWords(name: string, replacing: Reconnecting | undefined): string {
  if (replacing === undefined) {
    return `On ${name}'s phone, open Chips and choose Scan a QR code. ${name} comes back as ${name}, in every space they were in.`;
  }
  const phone = replacing.name;
  return `Chips deleted from it, or the phone reset? On it, open Chips and choose Scan a QR code. It takes this ${phone}'s place, with every space and everything ${name} said, and the old one is signed out.`;
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
  qr: { paddingTop: SPACE.sm },
  spent: { opacity: 0.25 },
  qrRoom: { width: 200, height: 200 },
  code: {
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 3,
    fontVariant: ["tabular-nums"],
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    paddingTop: SPACE.xs,
  },
  life: { fontSize: TEXT.md },
  words: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    textAlign: "center",
    paddingTop: SPACE.sm,
  },
  buttons: { gap: SPACE.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg },
});
