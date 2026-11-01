/**
 * Go direct (ADR 0211, Phase 2): the owner's guide off the relay, from the Connection page while
 * the phone goes through it and the server's address is on a tailnet. Three steps — get
 * Tailscale, sign in to the tailnet the server is in (named, from its address), turn it on — and
 * Chips does the rest.
 *
 * Chips cannot see the first two, so they are said, not ticked. The last waits on the server's
 * own address: while the sheet is open the store is asked to go direct every three seconds, on
 * top of the transport's own checks, and when the socket has moved over every step turns green
 * and the sheet goes by itself. The page behind it says "Direct now" with the time against the
 * time before (`ConnectionPage`), so the sheet says nothing more.
 *
 * Phase 3: somebody who is not an owner cannot sign in to the owner's Tailscale, so their guide
 * asks first (`guest`). Ask an owner (Chips sends the ask; the owners hear by a push), get
 * Tailscale and open the invite the owner sends back, turn Tailscale on. While the ask waits the
 * sheet reads it again every three seconds, and once it is shared it waits on the server as the
 * owner's guide does.
 */

import {
  type AskSeen,
  askRefusedWords,
  GUEST_GUIDE_LEAD,
  GUIDE_LEAD,
  type GuestStep,
  type GuideStep,
  guestGuideSteps,
  guideSteps,
  type StepState,
  type Store,
} from "@chipschat/core";
import { useEffect, useRef, useState } from "react";
import { Animated, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { useReduceMotion } from "../ui/useReduceMotion";
import { SheetHead } from "./SheetHead";

/** How often the sheet asks the store to go direct while it waits. */
export const GUIDE_CHECK_MS = 3000;
/** How long the sheet stays, every step green, once the phone has gone direct. */
export const GUIDE_DONE_MS = 1500;

/** Tailscale's own download page for this platform, which sends a phone to its store. */
const TAILSCALE =
  Platform.OS === "android"
    ? "https://tailscale.com/download/android"
    : "https://tailscale.com/download/ios";

/** A guest's side of the guide: their ask as it stands, and how to make one. */
export interface GuestAsk {
  readonly ask: AskSeen | undefined;
  /** Ask the owners, with the round trip now. */
  readonly onAsk: () => Promise<unknown>;
}

export function GoDirectSheet({
  open,
  onClose,
  store,
  machine,
  tailnet,
  direct,
  guest,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly store: Store;
  readonly machine: string;
  readonly tailnet: string;
  /** The socket has left the relay. */
  readonly direct: boolean;
  /** For somebody who is not an owner: the guide asks an owner first (Phase 3). */
  readonly guest?: GuestAsk | undefined;
}) {
  const palette = usePalette();
  const waiting = guest?.ask?.state === "asked";
  // Before a guest's ask is shared there is nothing for the server's address to answer to.
  const reachable = guest === undefined || (guest.ask !== undefined && !waiting);
  useEffect(() => {
    if (!open || direct || !reachable) return;
    void store.goDirect();
    const every = setInterval(() => void store.goDirect(), GUIDE_CHECK_MS);
    return () => clearInterval(every);
  }, [open, direct, reachable, store]);
  // A guest's ask, read again while it waits: the push may be off, or come late.
  useEffect(() => {
    if (!open || !waiting) return;
    const every = setInterval(
      () => void store.readMyDirectAsk().catch(() => undefined),
      GUIDE_CHECK_MS,
    );
    return () => clearInterval(every);
  }, [open, waiting, store]);
  useEffect(() => {
    if (!open || !direct) return;
    const done = setTimeout(onClose, GUIDE_DONE_MS);
    return () => clearTimeout(done);
  }, [open, direct, onClose]);
  const steps: readonly GuestStep[] =
    guest === undefined
      ? guideSteps(machine, tailnet, "phone", direct).map((step, index, all) => ({
          ...step,
          state: direct ? "done" : index === all.length - 1 ? "waiting" : "said",
        }))
      : guestGuideSteps(machine, guest.ask, "phone", direct);
  return (
    <Sheet open={open} onClose={onClose} testID="go-direct-sheet">
      <SheetHead title="Go direct" />
      <View style={styles.body}>
        <Text style={[styles.lead, { color: palette.ink2 }]}>
          {guest === undefined ? GUIDE_LEAD : GUEST_GUIDE_LEAD}
        </Text>
        <View style={[styles.steps, { backgroundColor: palette.surface }]}>
          {steps.map((step, index) => (
            <Step
              key={step.title}
              number={index + 1}
              step={step}
              state={step.state}
              first={index === 0}
            />
          ))}
        </View>
        {direct ? null : <Actions guest={guest} />}
      </View>
    </Sheet>
  );
}

/**
 * The buttons under the steps: Get Tailscale for an owner; for a guest, Ask an owner until they
 * have, then Get Tailscale, and Open the invite once it is shared.
 */
function Actions({ guest }: { readonly guest: GuestAsk | undefined }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const palette = usePalette();
  const get = (
    <Button label="Get Tailscale" variant="plain" onPress={() => void Linking.openURL(TAILSCALE)} />
  );
  if (guest === undefined) return get;
  const link = guest.ask?.link;
  if (guest.ask === undefined) {
    const ask = () => {
      setBusy(true);
      setFailed(undefined);
      guest
        .onAsk()
        .catch((error: unknown) => setFailed(askRefusedWords(error)))
        .finally(() => setBusy(false));
    };
    return (
      <>
        {failed === undefined ? null : (
          <Text style={[styles.failed, { color: palette.redInk }]}>{failed}</Text>
        )}
        <Button label="Ask an owner" variant="gold" busy={busy} disabled={busy} onPress={ask} />
      </>
    );
  }
  return (
    <>
      {link === undefined ? null : (
        <Button label="Open the invite" variant="gold" onPress={() => void Linking.openURL(link)} />
      )}
      {get}
    </>
  );
}

/** A step: its number, or a tick once done, its title and what it says. */
function Step({
  number,
  step,
  state,
  first,
}: {
  readonly number: number;
  readonly step: GuideStep;
  readonly state: StepState;
  readonly first: boolean;
}) {
  const palette = usePalette();
  const pulse = usePulse(state === "waiting");
  const ring =
    state === "done"
      ? { backgroundColor: palette.green, borderColor: palette.green }
      : state === "waiting"
        ? { borderColor: palette.gold }
        : { borderColor: palette.line };
  return (
    <View
      style={[
        styles.step,
        first ? null : { borderTopColor: palette.line2, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
      testID={`go-direct-step-${number}`}
      accessible
      accessibilityLabel={`Step ${number}${state === "done" ? ", done" : ""}: ${step.title}. ${step.words}`}
    >
      <Animated.View style={[styles.number, ring, { opacity: pulse }]}>
        {state === "done" ? (
          <Icon name="check" size={15} color="#ffffff" weight={2.4} />
        ) : (
          <Text style={[styles.numberText, { color: palette.ink2 }]}>{number}</Text>
        )}
      </Animated.View>
      <View style={styles.stepWords}>
        <Text style={[styles.stepTitle, { color: palette.ink }]}>{step.title}</Text>
        <Text style={[styles.stepSub, { color: palette.ink3 }]}>{step.words}</Text>
      </View>
    </View>
  );
}

/** The waiting step's number breathing while Chips waits on the server; still for Reduce Motion. */
function usePulse(on: boolean): Animated.Value {
  const still = useReduceMotion();
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on || still) {
      value.setValue(1);
      return;
    }
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    breath.start();
    return () => breath.stop();
  }, [on, still, value]);
  return value;
}

const styles = StyleSheet.create({
  body: { gap: SPACE.md, paddingHorizontal: SPACE.lg },
  lead: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md * 1.4,
    textAlign: "center",
    paddingHorizontal: SPACE.sm,
  },
  steps: { borderRadius: 16, overflow: "hidden" },
  step: { flexDirection: "row", gap: SPACE.md, padding: SPACE.md, alignItems: "flex-start" },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: TEXT.sm, fontWeight: "700" },
  stepWords: { flex: 1, gap: 2 },
  stepTitle: { fontSize: TEXT.md, fontWeight: "600" },
  stepSub: { fontSize: TEXT.sm, lineHeight: TEXT.sm * 1.4 },
  failed: { fontSize: TEXT.sm, textAlign: "center" },
});
