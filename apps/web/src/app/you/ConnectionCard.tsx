/**
 * Connection, on You on the web and the Mac (ADR 0211): which way this browser or this computer
 * reaches its server, how long a round trip takes, what the way means, and since when. The phone
 * says it on a page of its own, with the route drawn (`apps/mobile/src/you/ConnectionPage.tsx`);
 * the words are core's, so both say the same.
 *
 * A browser on the server's own page has no relay to go through, and says so: "Direct, from this
 * browser". The Mac app reaches its server as the phone does, and moves off the relay by itself
 * when the server's own address answers (`goDirect`); when it does while You is open, the card
 * says "Direct now" with the time now against the time before, for a few seconds.
 *
 * The round trip is measured while the card is drawn and connected: a signed read of the
 * server's health every five seconds, the middle of the last three.
 *
 * Phase 2: on the relay, an owner whose server is on a tailnet gets Go direct, the phone's guide
 * as a dialog (`GoDirectDialog`). The Mac gets Only direct, offered once it has reached its server
 * directly; a browser on the server's own page has no relay, so neither is drawn there.
 *
 * Phase 3: somebody who is not an owner gets Go direct too, guided through an ask that an owner
 * share the server with them in Tailscale (`GoDirectDialog`'s `guest`). Their ask is read as the
 * card is drawn.
 *
 * Phase 4: an owner may turn the server's relay off. A computer that heard it and has lost the
 * server says who turned it off and when, and where the server is still reached, while it is lost
 * and while it tries again; Go direct stays offered then, since going direct is the way back.
 */

import {
  type AskSeen,
  askDirectWords,
  beforeWords,
  type ConnectionState,
  goDirectWords,
  type LinkKind,
  type LinkStretch,
  middleOf,
  onlyDirectFoot,
  onlyDirectLostWords,
  type RelayState,
  relayOffWords,
  sinceWords,
  tailnetOf,
  tripWords,
  wayOf,
  wayTitle,
  wayWords,
  wentDirectWords,
} from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { Card, Row, Switch } from "./controls.tsx";
import { GoDirectDialog, type GuestAsk } from "./GoDirectDialog.tsx";

/** How often the round trip is measured while the card is drawn. */
export const TRIP_EVERY_MS = 5000;
const TRIPS_KEPT = 3;
/** How long "Direct now" stays after the computer leaves the relay. */
export const DIRECT_NOW_MS = 4000;

export interface WayFacts {
  readonly connection: ConnectionState;
  readonly link: LinkKind | undefined;
  /** When the socket began going the way it goes now, and the way before (the snapshot's). */
  readonly since: string | undefined;
  readonly before: LinkStretch | undefined;
  readonly serverUrl: string | undefined;
  /** Whether there is a relay to go through: none for a browser on the server's own page. */
  readonly relayed: boolean;
  /** One signed read of the server, timed (the store's `roundTrip`). */
  readonly roundTrip: () => Promise<number>;
  /** The server's machine, as it names itself (the store's `serverFacts`). */
  readonly machine: () => Promise<string>;
  /** This person owns the workspace, so its server's tailnet is theirs to sign in to. */
  readonly owner: boolean;
  /** Only direct is on here, and whether this device has ever reached its server directly. */
  readonly onlyDirect: boolean;
  readonly wentDirect: boolean;
  /** Leave the relay now if the server's own address answers (the store's `goDirect`). */
  readonly goDirect: () => Promise<boolean>;
  readonly setOnlyDirect: (on: boolean) => void;
  /** This person's own ask to go direct, with who shared it by name (Phase 3). */
  readonly myAsk: AskSeen | undefined;
  /** Ask the owners, with the round trip now; and read the ask again. */
  readonly askDirect: (tripMs?: number) => Promise<unknown>;
  readonly readMyAsk: () => Promise<unknown>;
  /** The relay an owner turned off, with their name (Phase 4). */
  readonly relayOff?: RelayState | undefined;
}

export function ConnectionCard(props: { readonly way: WayFacts; readonly desktop: boolean }) {
  const { way: facts } = props;
  const way = wayOf(facts.connection, facts.link);
  const connected = way === "relay" || way === "direct";
  const machine = useMachine(facts.machine);
  const { trip, before } = useRoundTrips(facts.roundTrip, connected, facts.link);
  // Said only while it is still so: back on the relay, or lost, within its time, it goes.
  const directNow = useDirectNow(facts.link) && way === "direct";
  const here = props.desktop ? "this computer" : "this browser";
  const title =
    way === "direct" && !facts.relayed ? `Direct, from ${here}` : wayTitle(way, machine);
  const tailnet = tailnetOf(facts.serverUrl);
  const words =
    lostWords(way, machine, facts) ??
    wayWords(way, machine, facts.serverUrl, facts.relayed && !facts.onlyDirect);
  return (
    <Card label="Connection" testId="connection" title="Connection">
      <Row
        label={
          <span className="way-title" data-way={way} data-testid="connection-way">
            {title}
          </span>
        }
      >
        {connected && (
          <span className="way-trip" data-testid="connection-trip">
            <b>{tripWords(trip)}</b> round trip
          </span>
        )}
      </Row>
      {directNow && (
        <p className="way-now" role="status" data-testid="connection-now">
          {wentDirectWords(trip, before)}
        </p>
      )}
      <p className="you-card-note" data-testid="connection-words">
        {words}
      </p>
      {tailnet !== undefined && (
        <GoDirect
          facts={facts}
          machine={machine}
          tailnet={tailnet}
          offered={goDirectOffered(way, facts)}
          trip={trip}
        />
      )}
      {facts.relayed && <Relayed facts={facts} />}
    </Card>
  );
}

/** Go direct is offered on the relay, and while lost with the relay off, as the way back. */
function goDirectOffered(way: string, facts: WayFacts): boolean {
  return way === "relay" || (way !== "direct" && facts.relayOff !== undefined);
}

/** Why the computer cannot connect, when it knows: Only direct, or the relay turned off. */
function lostWords(way: string, machine: string, facts: WayFacts): string | undefined {
  if (way === "lost" && facts.onlyDirect) {
    return onlyDirectLostWords(machine, "computer", facts.serverUrl);
  }
  // Lost, or trying again: either way it is the relay being off that keeps it from the server.
  if (way === "relay" || way === "direct" || facts.relayOff === undefined) return undefined;
  return relayOffWords(facts.relayOff.by, facts.relayOff.at, machine, facts.serverUrl);
}

/**
 * Go direct, for a server on a tailnet: the row while on the relay, and the guide it opens, which
 * stays up through the move to show every step green. Somebody who is not an owner is guided
 * through an ask.
 */
function GoDirect(props: {
  readonly facts: WayFacts;
  readonly machine: string;
  readonly tailnet: string;
  readonly offered: boolean;
  readonly trip: number | undefined;
}) {
  const { facts, trip } = props;
  const [from, setFrom] = useState<HTMLElement | null | undefined>(undefined);
  const { owner, readMyAsk } = facts;
  useEffect(() => {
    if (!owner) void readMyAsk().catch(() => undefined);
  }, [owner, readMyAsk]);
  const guest: GuestAsk | undefined = owner
    ? undefined
    : { ask: facts.myAsk, onAsk: () => facts.askDirect(trip), readMine: readMyAsk };
  return (
    <>
      {props.offered && (
        <Row
          label="Go direct"
          sub={owner ? goDirectWords("computer") : askDirectWords("computer")}
          testId="go-direct"
        >
          <Button
            size="sm"
            onClick={(event) => setFrom(event.currentTarget)}
            data-testid="go-direct-open"
          >
            Go direct
          </Button>
        </Row>
      )}
      {from !== undefined && (
        <GoDirectDialog
          from={from}
          machine={props.machine}
          tailnet={props.tailnet}
          direct={facts.link !== undefined && facts.link !== "relay"}
          goDirect={facts.goDirect}
          onGone={() => setFrom(undefined)}
          guest={guest}
        />
      )}
    </>
  );
}

/** What only a device with a relay has: Only direct, and since when and how it went before. */
function Relayed({ facts }: { readonly facts: WayFacts }) {
  return (
    <>
      <Row
        label="Only direct"
        sub={onlyDirectFoot(facts.wentDirect || facts.onlyDirect, "computer", facts.serverUrl)}
        testId="only-direct"
      >
        <Switch
          label="Only direct"
          checked={facts.onlyDirect}
          disabled={!facts.wentDirect && !facts.onlyDirect}
          onChange={facts.setOnlyDirect}
          testId="only-direct-switch"
        />
      </Row>
      {facts.since !== undefined && (
        <Row label="Since" testId="connection-since">
          <span className="way-value">{sinceWords(facts.since)}</span>
        </Row>
      )}
      {facts.before !== undefined && (
        <Row label="Before that" testId="connection-before">
          <span className="way-value">{beforeWords(facts.before, facts.serverUrl)}</span>
        </Row>
      )}
    </>
  );
}

function useMachine(read: () => Promise<string>): string {
  const [machine, setMachine] = useState<string | undefined>(undefined);
  useEffect(() => {
    let live = true;
    read().then(
      (name) => {
        if (live && name !== "") setMachine(name);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [read]);
  return machine ?? "your server";
}

/**
 * The round trip now, and the one before the socket last changed its way. A new way starts the
 * count again at once: a read still on its way over the old one is dropped.
 */
function useRoundTrips(
  roundTrip: () => Promise<number>,
  connected: boolean,
  link: string | undefined,
) {
  const [trips, setTrips] = useState<readonly number[]>([]);
  const [before, setBefore] = useState<number | undefined>(undefined);
  const [seen, setSeen] = useState(link);
  if (seen !== link) {
    setSeen(link);
    setBefore(middleOf(trips));
    setTrips([]);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new way measures again at once.
  useEffect(() => {
    if (!connected) return;
    let live = true;
    const measure = () => {
      roundTrip().then(
        (ms) => {
          if (live) setTrips((now) => [...now, ms].slice(-TRIPS_KEPT));
        },
        () => undefined,
      );
    };
    measure();
    const every = setInterval(measure, TRIP_EVERY_MS);
    return () => {
      live = false;
      clearInterval(every);
    };
  }, [roundTrip, connected, link]);
  return { trip: middleOf(trips), before };
}

/** Whether to say "Direct now": for a few seconds after the socket leaves the relay. */
function useDirectNow(link: string | undefined): boolean {
  const [shown, setShown] = useState(false);
  const last = useRef(link);
  useEffect(() => {
    const was = last.current;
    last.current = link;
    if (was !== "relay" || link === undefined || link === "relay") return;
    setShown(true);
    const hide = setTimeout(() => setShown(false), DIRECT_NOW_MS);
    return () => clearTimeout(hide);
  }, [link]);
  return shown;
}
