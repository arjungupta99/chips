/**
 * Relay on the web and the Mac (ADR 0211, Phase 4): the owner's switch, on a page of its own, as
 * the phone has it (`apps/mobile/src/you/RelayPage.tsx`), beside You's list (ADR 0265); its row
 * there says On or Off. The words and the lists are core's, so both say the same.
 *
 * Use the relay, on or off, with what it does under it, and on Chips's own relay that it counts
 * each day, linking What Chips counts (ADR 0208); while it is on and the server isn't connected to
 * it, why, as the server kept it; every device of the workspace by the way
 * it goes now, read again every five seconds while the page is open; and the Tailscale share
 * link kept for the next guest (Phase 3), to forget. A server with no relay has no row. Turning
 * it off asks first, on a page in this one's place with the way back to it (ADR 0265's addendum
 * of 3 November 2026): how many devices would lose the server, which, what happens to links, "Ask
 * them to go direct first" (a push to their people; the switch stays on), and "Turn off now". On
 * again is one click.
 */

import {
  askedWords,
  type Directory,
  deviceLabel,
  directSince,
  lastWay,
  type RelayDevice,
  type RelayFacts,
  relayFootWords,
  relayLists,
  relayNotConnectedWords,
  turnOffLead,
  turnOffNote,
  WHAT_CHIPS_COUNTS,
  wouldLose,
} from "@chipschat/core";
import { Button } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { Problem, Row, reasonOf, Switch } from "./controls.tsx";
import { FormPage } from "./Form.tsx";
import type { RelayService } from "./services.ts";

/** How often the list is read again while the card is drawn. */
export const RELAY_EVERY_MS = 5000;
/** How long the word after asking stays. */
const SAID_MS = 4000;

/**
 * Whether the server has a relay, for You's row, and whether it is on as the server last said:
 * read when the connection opens. The workspace's own word (`model.relay`) wins once anybody has
 * turned it, on any device.
 */
export function useRelayRow(
  service: RelayService | undefined,
  connected: boolean,
): RelayFacts | undefined {
  const [facts, setFacts] = useState<RelayFacts | undefined>(undefined);
  useEffect(() => {
    if (service === undefined || !connected) return;
    let live = true;
    service.read().then(
      (read) => {
        if (live) setFacts(read);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [service, connected]);
  return facts;
}

export function RelayPage(props: {
  readonly service: RelayService;
  readonly directory: Directory;
  readonly selfId: string;
}) {
  const { service } = props;
  const facts = useRelayFacts(service.read);
  const machine = useMachine(service.machine);
  const [from, setFrom] = useState<HTMLElement | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [said, setSaid] = useState<string | undefined>(undefined);
  // The switch's place: Turn off's page hands the keyboard back to the switch in it.
  const switchAt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (said === undefined) return;
    const gone = setTimeout(() => setSaid(undefined), SAID_MS);
    return () => clearTimeout(gone);
  }, [said]);
  const now = facts.value;
  const drawn = now?.configured === true;
  // Sent here by Away from home: the page opens and its card lights gold, fading back, as a link
  // just made does, so it is plain which was meant (Arjun, 1 November 2026: "Else it is
  // confusing"). Each ask lights it again: the card is drawn anew under its key.
  const [lit, setLit] = useState(0);
  const reveal = service.reveal ?? 0;
  useEffect(() => {
    if (drawn && reveal !== 0) setLit(reveal);
  }, [drawn, reveal]);
  // Into view once the lit card is drawn.
  useEffect(() => {
    if (lit === 0) return;
    document.querySelector('[data-testid="relay-card"]')?.scrollIntoView({ block: "nearest" });
  }, [lit]);
  // Where the server has no relay there is nothing to turn; its row is not drawn either.
  if (now === undefined || !now.configured) return null;
  const turn = (on: boolean) => {
    setBusy(true);
    setError(undefined);
    service
      .set(on)
      .then(facts.set, (failure: unknown) => setError(reasonOf(failure)))
      .finally(() => setBusy(false));
  };
  const label = (device: RelayDevice) =>
    deviceLabel(device, props.directory, props.selfId, service.here);
  // The server says which relay, on or off (ADR 0245): Chips's own, before it was ever on.
  const foot = relayFootWords(hostOf(now.url) ?? service.relayHost, machine, service.serverUrl);
  const notConnected = relayNotConnectedWords(now);
  return (
    <div className="you-page" data-testid="relay">
      <div
        key={lit}
        className={lit === 0 ? "you-card" : "you-card is-lit"}
        data-testid="relay-card"
      >
        <Row
          label="Use the relay"
          sub={
            <>
              {foot.before}
              {foot.link !== undefined && (
                <a href={WHAT_CHIPS_COUNTS} target="_blank" rel="noreferrer">
                  {foot.link}
                </a>
              )}
            </>
          }
          testId="relay-row"
        >
          <span ref={switchAt}>
            <Switch
              label="Use the relay"
              checked={now.on}
              disabled={busy}
              onChange={(on) =>
                on ? turn(true) : setFrom(switchAt.current?.querySelector("input") ?? null)
              }
              testId="relay-switch"
            />
          </span>
        </Row>
        {notConnected !== undefined && (
          <p className="you-card-note relay-not-connected" data-testid="relay-not-connected">
            {notConnected}
          </p>
        )}
        <Problem error={error} />
        {said !== undefined && (
          <p className="way-now" role="status" data-testid="relay-said">
            {said}
          </p>
        )}
      </div>
      {now.devices.length > 0 && (
        <div className="you-card">
          <Devices devices={now.devices} label={label} />
        </div>
      )}
      {now.keptLink !== undefined && (
        <div className="you-card">
          <Kept
            forget={service.forget}
            onForgot={() => facts.set({ ...now, keptLink: undefined })}
          />
        </div>
      )}
      {from !== undefined && (
        <TurnOffPage
          from={from}
          losing={wouldLose(now.devices)}
          label={label}
          selfId={props.selfId}
          serverUrl={service.serverUrl}
          onAsk={() => service.ask().then((asked) => setSaid(askedWords(asked)))}
          onTurnOff={() => turn(false)}
          onGone={() => setFrom(undefined)}
        />
      )}
    </div>
  );
}

/** `relay.chipschat.ai` of `wss://relay.chipschat.ai`; nothing for nothing. */
function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** The switch's facts, read as the card is drawn and every five seconds while it is. */
function useRelayFacts(read: () => Promise<RelayFacts>) {
  const [value, set] = useState<RelayFacts | undefined>(undefined);
  useEffect(() => {
    let live = true;
    const again = () => {
      read().then(
        (facts) => {
          if (!live) return;
          set(facts);
          // No relay is not going to change while the card is drawn.
          if (!facts.configured) clearInterval(every);
        },
        () => undefined,
      );
    };
    const every = setInterval(again, RELAY_EVERY_MS);
    again();
    return () => {
      live = false;
      clearInterval(every);
    };
  }, [read]);
  return { value, set };
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

/** Every device, by the way it goes now. A list with nobody in it is not drawn. */
function Devices(props: {
  readonly devices: readonly RelayDevice[];
  readonly label: (device: RelayDevice) => string;
}) {
  const { relayed, direct, away } = relayLists(props.devices);
  return (
    <>
      <DeviceList
        title="Through the relay now"
        devices={relayed}
        label={props.label}
        value={(device) => directSince(device)}
        testId="relay-relayed"
      />
      <DeviceList
        title="Direct now"
        devices={direct}
        label={props.label}
        value={() => "direct"}
        testId="relay-direct"
      />
      <DeviceList
        title="Not connected"
        devices={away}
        label={props.label}
        value={(device) => lastWay(device)}
        testId="relay-away"
      />
    </>
  );
}

function DeviceList(props: {
  readonly title: string;
  readonly devices: readonly RelayDevice[];
  readonly label: (device: RelayDevice) => string;
  readonly value: (device: RelayDevice) => string;
  readonly testId: string;
}) {
  if (props.devices.length === 0) return null;
  return (
    <div data-testid={props.testId}>
      <p className="relay-list-h">{props.title}</p>
      {props.devices.map((device) => (
        <Row key={device.deviceId} label={props.label(device)}>
          <span className="way-value">{props.value(device)}</span>
        </Row>
      ))}
    </div>
  );
}

/** The share link kept for the next guest, which an owner forgets from here. */
function Kept(props: { readonly forget: () => Promise<void>; readonly onForgot: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Row
      label="Guests go direct"
      sub="The next guest who asks gets the Tailscale share link kept here, filled in for whichever owner answers."
      testId="relay-kept"
    >
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          props
            .forget()
            .then(props.onForgot, () => undefined)
            .finally(() => setBusy(false));
        }}
      >
        Forget
      </Button>
    </Row>
  );
}

/**
 * Before the relay goes: how many devices would lose the server and which, what happens to links,
 * and the two ways on.
 */
function TurnOffPage(props: {
  readonly from: HTMLElement | null;
  readonly losing: readonly RelayDevice[];
  readonly label: (device: RelayDevice) => string;
  readonly selfId: string;
  readonly serverUrl: string | undefined;
  readonly onAsk: () => Promise<unknown>;
  readonly onTurnOff: () => void;
  readonly onGone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const others = props.losing.some((device) => device.participantId !== props.selfId);
  return (
    <FormPage
      title="Turn the relay off?"
      from={props.from}
      testId="relay-off-page"
      onGone={props.onGone}
    >
      {({ close }) => {
        const ask = () => {
          setBusy(true);
          setError(undefined);
          props
            .onAsk()
            .then(close, (failure: unknown) => setError(reasonOf(failure)))
            .finally(() => setBusy(false));
        };
        return (
          <>
            <p className="go-direct-lead" data-testid="relay-off-lead">
              {turnOffLead(props.losing.length)}
            </p>
            {props.losing.length > 0 && (
              <ul className="go-direct-steps relay-losing">
                {props.losing.map((device) => (
                  <li key={device.deviceId}>
                    <span className="go-direct-words">
                      <b>{props.label(device)}</b>
                    </span>
                    <span className="way-value">{directSince(device)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="join-note">{turnOffNote(props.serverUrl)}</p>
            {error !== undefined && (
              <p className="harness-add-error" role="alert">
                {error}
              </p>
            )}
            <div className="relay-off-decide">
              {others && (
                <button
                  type="button"
                  className="go-direct-ask"
                  disabled={busy}
                  onClick={ask}
                  data-testid="relay-ask"
                >
                  Ask them to go direct first
                </button>
              )}
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  props.onTurnOff();
                  close();
                }}
                data-testid="relay-turn-off"
              >
                Turn off now
              </Button>
            </div>
          </>
        );
      }}
    </FormPage>
  );
}
