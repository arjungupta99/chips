/**
 * Pairing by link: the app was opened with a pairing offer, or handed one while running.
 *
 * `useDeepLinks` waits for a device before following a link; this is the one link that cannot
 * wait, because it is how the device is got. `pnpm phone` launches the installed app with
 * `chips://pair?pair=ABC-234&v=1&lan=http://…` — a code the server's own machine just issued —
 * and this pairs with it and brings the app up on the result, which is what the pairing screen
 * does after a scan, with nobody touching the phone. A browser that cannot pair offers the same
 * link (a plain-HTTP address is not a secure context, and a browser makes no key there), and the
 * QR's own address arrives here too when the app is what opens it.
 *
 * A phone that already holds a key for the server the link names is left as it is: minting a
 * second key would put another device in the list for nothing. The only reason to pair again is
 * that the server has *turned this key away* — the device was withdrawn — and the link is then
 * the way back in. So the held key's connection is watched until it says something definite:
 * `rejected` means pair again, and anything else — open, or still finding the network on a cold
 * start — means leave it be. An earlier version treated "not yet connected within five seconds"
 * as turned away, and a slow cold launch over the tailnet made a duplicate device every time.
 *
 * And because the launch link's path is `pair`, the router opens the pairing screen on the way
 * in; when the held key was fine, this steps back off it to Spaces, so `pnpm phone connect`
 * on a phone that is already paired is a quiet no-op rather than a dead-end on Pair this phone.
 * The router opens that screen on every opening of the link, so every opening is followed, the
 * same link's second as much as its first (`useOpening`).
 *
 * A link that names *another* server than the one the phone holds is not followed on its own
 * (SEC-8): a `chips://pair?code=…&lan=http://attacker` link, tapped, would otherwise pair the
 * phone with the attacker's server and land in it. The hook hands the ask back instead, and the
 * layout shows it as a sheet (`PairElsewhereSheet`); the pairing happens on Switch, or never. The
 * workspace the phone was in stays, behind the new one (ADR 0197); a link to a server it holds
 * behind the one in front switches to it.
 */

import { type Device, pairDevice, type Store, workspaceLabel } from "@chipschat/core";
import { addEventListener, getLinkingURL } from "expo-linking";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { thisDevice } from "../device/word";
import { deviceStorage, useChips } from "../store/provider";
import { waitForAllow } from "./allowWait";
import { hostOf, isElsewhere } from "./elsewhere";
import { pairingFailure } from "./failure";
import { pairingLink, sameServer } from "./link";
import type { ElsewhereAsk } from "./PairElsewhereSheet";
import { setPairingNow } from "./PairingNow";
import type { Offer } from "./scanned";
import { phoneName } from "./usePairing";

/** How long the held key's connection gets to say open or rejected before we assume it is fine. */
const SETTLE_MS = 8000;

/** The server and workspace this phone holds, while a link is read. */
interface Held {
  readonly serverUrl: string | undefined;
  readonly workspace: string;
  readonly store: Store;
}

type Good = Offer & { readonly ok: true };

type Outcome =
  | { readonly kind: "paired"; readonly device: Device }
  | { readonly kind: "failed"; readonly problem: string }
  | { readonly kind: "nothing" }
  /** The link names another server than the one held: ask before pairing (SEC-8). */
  | { readonly kind: "elsewhere"; readonly offer: Good; readonly held: Held };

/**
 * Follows a pairing link as the app is opened with one. The ask it hands back, when the link names
 * another server than the one the phone holds, is for the layout to show; nothing otherwise.
 */
export function usePairingLink(): ElsewhereAsk | undefined {
  const opening = useOpening();
  const router = useRouter();
  const pathname = usePathname();
  const { ready, paired, began, devices, switchTo } = useChips();
  const followed = useRef<number | undefined>(undefined);
  // Read when the pairing answers rather than when it was asked for: a re-render in between must
  // not lose a pairing the server has already done, or the screen we were on when it started.
  const latest = useRef({ began, router, pathname });
  latest.current = { began, router, pathname };
  const [asking, setAsking] = useState<{ offer: Good; held: Held } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!ready || opening === undefined || opening.nth === followed.current) return;
    const offer = pairingLink(opening.url);
    if (offer === undefined) return;
    followed.current = opening.nth;
    // A server this phone holds behind the one in front (ADR 0197): it comes forward, and no
    // second key is made for it.
    const behind = !offer.ok
      ? undefined
      : devices.find(
          (device) =>
            device.deviceId !== paired?.device.deviceId && sameServer(device.serverUrl, offer.lan),
        );
    if (behind !== undefined) {
      void switchTo(behind.deviceId).then(() => latest.current.router.replace("/"));
      return;
    }
    const held: Held | undefined =
      paired === undefined
        ? undefined
        : {
            serverUrl: paired.device.serverUrl,
            workspace: workspaceLabel(paired.device),
            store: paired.store,
          };
    sayPairing(offer, held);
    void follow(offer, held).then((outcome) => {
      setPairingNow(undefined);
      const { began: begin, router: go, pathname: at } = latest.current;
      if (outcome.kind === "elsewhere") {
        setAsking({ offer: outcome.offer, held: outcome.held });
      } else if (outcome.kind === "paired") {
        begin(outcome.device);
        go.replace("/");
      } else if (outcome.kind === "failed") {
        go.push({ pathname: "/pair", params: { problem: outcome.problem } });
      } else if (at === "/pair") {
        // Already paired with this server, and the link opened the pairing screen on the way in.
        // Step off it, so a no-op does not look like a dead end.
        go.replace("/");
      }
    });
  }, [ready, opening, paired, devices, switchTo]);

  if (asking === undefined) return undefined;
  const { offer, held } = asking;
  return {
    server: offer.lan,
    heldServer: held.serverUrl,
    workspace: held.workspace,
    device: thisDevice(),
    busy,
    failed,
    confirm: () => {
      setBusy(true);
      setFailed(undefined);
      void pair(offer).then((outcome) => {
        setBusy(false);
        if (outcome.kind === "failed") {
          setFailed(outcome.problem);
          return;
        }
        const { began: begin, router: go } = latest.current;
        setAsking(undefined);
        begin(outcome.device);
        go.replace("/");
      });
    },
    dismiss: () => {
      setAsking(undefined);
      // The link opened the pairing screen on the way in; a phone that stays steps off it.
      const { router: go, pathname: at } = latest.current;
      if (at === "/pair") go.replace("/");
    },
  };
}

/** A link the app was opened with, or handed while it ran: which, and the how-many-th opening. */
interface Opening {
  readonly url: string;
  readonly nth: number;
}

/**
 * The link the app was opened with, and each one handed to it since, counted. `useLinkingURL`
 * keeps the latest link as state, and the same link opened again is the same string, which is
 * not a change: the hook never saw the second opening, while the router had opened the pairing
 * screen on it, and Welcome stayed over a paired phone until a relaunch (ADR 0191's walks, 18
 * October 2026). Here the same link opened twice is two openings, and each is followed.
 */
function useOpening(): Opening | undefined {
  const [opening, setOpening] = useState<Opening | undefined>(() => {
    const url = getLinkingURL();
    // A string, or nothing: expo-linking's own hook reads a native `undefined` as nothing too.
    return typeof url === "string" ? { url, nth: 1 } : undefined;
  });
  useEffect(() => {
    const subscription = addEventListener("url", ({ url }) =>
      setOpening((was) => ({ url, nth: (was?.nth ?? 0) + 1 })),
    );
    return () => subscription.remove();
  }, []);
  return opening;
}

/**
 * Said over the screen while a phone with no workspace yet tries the server and its relay
 * (`PairingNow`): one that holds a workspace is asked first, or has nothing to wait for.
 */
function sayPairing(offer: Offer, held: Held | undefined): void {
  if (offer.ok && held === undefined) setPairingNow(hostOf(offer.lan));
}

async function follow(offer: Offer, held: Held | undefined): Promise<Outcome> {
  if (!offer.ok) return { kind: "failed", problem: offer.problem };
  // A key for this server already? Do not make a second one unless the server refuses this one.
  // "Still connecting" is not a refusal — a cold launch takes a moment — so only an explicit
  // `rejected` pairs again; open, closed and a timeout all leave the held key in place.
  if (held !== undefined && sameServer(held.serverUrl, offer.lan)) {
    if ((await connectionVerdict(held.store)) !== "rejected") return { kind: "nothing" };
  } else if (held !== undefined && isElsewhere(held.serverUrl, offer.lan)) {
    // Another server than the one held: a person says so first (SEC-8).
    return { kind: "elsewhere", offer, held };
  }
  return pair(offer);
}

/** The pairing itself: a key made for this server, as the pairing screen makes one after a scan. */
async function pair(
  offer: Good,
): Promise<
  | { readonly kind: "paired"; readonly device: Device }
  | { readonly kind: "failed"; readonly problem: string }
> {
  // A code that asks waits for whoever made it, showing its six digits (ADR 0232).
  const wait = waitForAllow("pairing");
  try {
    const device = await pairDevice(offer.code, phoneName(), offer.lan, offer, deviceStorage, wait);
    return { kind: "paired", device };
  } catch (error) {
    return { kind: "failed", problem: pairingFailure(error, offer) };
  } finally {
    wait.done();
  }
}

/**
 * What the held key's connection says, once it says anything definite: `open` when the server
 * took it, `rejected` when the server turned it away (the device was withdrawn), and `unknown`
 * when neither has happened by the deadline — a network still being found, which is not a reason
 * to pair again.
 */
function connectionVerdict(store: Store): Promise<"open" | "rejected" | "unknown"> {
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const done = (verdict: "open" | "rejected" | "unknown") => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      clearTimeout(timer);
      resolve(verdict);
    };
    const look = () => {
      const state = store.getSnapshot().connection;
      if (state === "open") done("open");
      else if (state === "rejected") done("rejected");
    };
    const timer = setTimeout(() => done("unknown"), SETTLE_MS);
    unsubscribe = store.subscribe(look);
    look();
  });
}
