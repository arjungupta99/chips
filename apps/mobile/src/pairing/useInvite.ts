/**
 * An invite, opened on the phone (ADR 0164). The server is reached once, the way pairing reaches
 * it: inside a tunnel to the key the link carries, through the door on the server's network first
 * and the relay when the network does not answer (ADR 0191), which is why the link carries the
 * server's key and its relay beside the token. What the link is for is asked of the server over
 * that, and the join goes the same way, so the device that comes out of it keeps talking the way
 * it came in.
 *
 * Nothing here is drawn: the card a phone with no workspace sees (`JoinCard`) and the sheet a
 * phone already in one sees (`JoinSheet`) both read it.
 */

import {
  type Device,
  establishLink,
  type InvitePeek,
  joinByInvite,
  type Link,
  PairingError,
  peekInvite,
  type ServerReach,
} from "@chipschat/core";
import type { InviteLink } from "@chipschat/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { deviceStorage } from "../device/storage";
import { waitForAllow } from "./allowWait";
import { phoneName } from "./usePairing";

/** An invite as the phone acts on it: the token, the server, its key, and its relay when there is one. */
export interface InviteOffer extends ServerReach {
  readonly token: string;
  readonly serverUrl: string;
}

/** The offer in a link, or nothing when the link names no server to ask. */
export function offerOf(link: InviteLink | undefined): InviteOffer | undefined {
  if (link?.lan === undefined) return undefined;
  return {
    token: link.token,
    serverUrl: link.lan,
    ...(link.key === undefined ? {} : { serverKey: link.key }),
    ...(link.key === undefined || link.relay === undefined ? {} : { relayUrl: link.relay }),
  };
}

export type Opened =
  | { readonly kind: "asking" }
  | {
      readonly kind: "ready";
      readonly invite: InvitePeek;
      /** Whether the server answered on its network or through the relay. */
      readonly through: "network" | "relay";
    }
  | { readonly kind: "dead" }
  | { readonly kind: "trouble"; readonly message: string };

/** What the server says of a link that was used, withdrawn or has lapsed. */
export const NOT_VALID = "That invite is not valid.";

/** What went wrong reaching the server, in a sentence that says where to look. */
export function troubleOf(error: unknown): string {
  if (error instanceof PairingError) return error.message;
  const said = error instanceof Error ? error.message.trim().replace(/\.$/, "") : "";
  const cause = said === "" ? "" : ` (${said})`;
  return `Chips couldn't reach the server this invite is for, on its network or through its relay${cause}.`;
}

/**
 * Reach the link's server and ask what the link is for: what the card shows next, and the link it
 * went by, which the join that follows goes by too.
 */
export async function openInvite(
  offer: InviteOffer,
): Promise<{ readonly opened: Opened; readonly link?: Link }> {
  let link: Link | undefined;
  try {
    link = await establishLink({
      serverUrl: offer.serverUrl,
      serverKey: offer.serverKey,
      relayUrl: offer.relayUrl,
    });
    const invite = await peekInvite(offer.token, offer.serverUrl, link);
    const through = link.kind === "relay" ? "relay" : "network";
    return { opened: { kind: "ready", invite, through }, link };
  } catch (error) {
    link?.close();
    return { opened: failedOpening(error) };
  }
}

/** A link the server says is no good is dead; anything else is trouble reaching it. */
function failedOpening(error: unknown): Opened {
  return error instanceof PairingError && error.message === NOT_VALID
    ? { kind: "dead" }
    : { kind: "trouble", message: troubleOf(error) };
}

/** Whom a link that asks waits for, and what it opens, as the wait's screen says (ADR 0232). */
function whomFor(opened: Opened): { inviter?: string | undefined; place?: string | undefined } {
  if (opened.kind !== "ready") return {};
  const { invite } = opened;
  return { inviter: invite.invitedByName, place: invite.spaceName ?? invite.workspaceName };
}

export interface Invite {
  readonly opened: Opened;
  /** Join as `name`; resolves with the device, or throws what the server said. */
  readonly join: (name: string) => Promise<Device>;
  /** Ask the server again, after trouble reaching it. */
  readonly retry: () => void;
}

export function useInvite(offer: InviteOffer | undefined): Invite {
  const [opened, setOpened] = useState<Opened>(
    offer === undefined
      ? { kind: "trouble", message: "This link doesn't say where its server is." }
      : { kind: "asking" },
  );
  const [attempt, setAttempt] = useState(0);
  const link = useRef<Link | undefined>(undefined);
  // Once a device has the link it is the device's: leaving the card must not close its tunnel.
  const kept = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is how to ask again
  useEffect(() => {
    if (offer === undefined) return;
    let live = true;
    setOpened({ kind: "asking" });
    void openInvite(offer).then((found) => {
      if (!live) {
        found.link?.close();
        return;
      }
      link.current = found.link;
      setOpened(found.opened);
    });
    return () => {
      live = false;
      if (!kept.current) link.current?.close();
      link.current = undefined;
    };
  }, [offer, attempt]);

  const join = useCallback(
    async (name: string) => {
      if (offer === undefined || link.current === undefined) throw new Error(NOT_VALID);
      // A link that asks waits for its sender's Allow, showing its six digits (ADR 0232).
      const wait = waitForAllow("invite", whomFor(opened));
      try {
        const device = await joinByInvite(
          offer.token,
          name.trim(),
          phoneName(),
          offer.serverUrl,
          deviceStorage,
          { link: link.current, serverKey: offer.serverKey, relayUrl: offer.relayUrl },
          wait,
        );
        kept.current = true;
        return device;
      } catch (error) {
        // Spent while the name was being typed: the link is no good now, and the card says so.
        if (error instanceof PairingError && error.message === NOT_VALID)
          setOpened({ kind: "dead" });
        throw error;
      } finally {
        wait.done();
      }
    },
    [offer, opened],
  );

  const retry = useCallback(() => setAttempt((was) => was + 1), []);
  return { opened, join, retry };
}
