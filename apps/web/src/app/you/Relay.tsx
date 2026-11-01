/**
 * Relay on the web and the Mac (ADR 0211, Phase 4): the owner's switch, as a card under the
 * workspace's heading. The phone has it on a page of its own (`apps/mobile/src/you/RelayPage.tsx`);
 * the words and the lists are core's, so both say the same.
 *
 * Use the relay, on or off, with what it does under it, and on Chips's own relay that it counts
 * each day, linking What Chips counts (ADR 0208); while it is on and the server isn't connected to
 * it, why, as the server kept it; every device of the workspace by the way
 * it goes now, read again every five seconds while the card is drawn; and the Tailscale share
 * link kept for the next guest (Phase 3), to forget. A server with no relay has no card. Turning
 * it off asks first, in a dialog that
 * grows out of the switch: how many devices would lose the server, which, what happens to links,
 * "Ask them to go direct first" (a push to their people; the switch stays on), and "Turn off now".
 * On again is one click.
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
import { Button, Icon } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { GrowingDialog } from "../GrowingDialog.tsx";
import { Card, Problem, Row, reasonOf, Switch } from "./controls.tsx";
import type { RelayService } from "./services.ts";

/** How often the list is read again while the card is drawn. */
export const RELAY_EVERY_MS = 5000;
/** How long the word after asking stays. */
const SAID_MS = 4000;

export function RelayCard(props: {
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
  // The switch's place, which the dialog grows out of.
  const switchAt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (said === undefined) return;
    const gone = setTimeout(() => setSaid(undefined), SAID_MS);
    return () => clearTimeout(gone);
  }, [said]);
  const now = facts.value;
  const drawn = now?.configured === true;
  useEffect(() => {
    if (!drawn || service.reveal !== true) return;
    document.querySelector('[data-testid="relay"]')?.scrollIntoView({ block: "center" });
  }, [drawn, service.reveal]);
  // Where the server has no relay there is nothing to turn, and no card.
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
    <Card label="Relay" testId="relay" title="Relay" level={3}>
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
            onChange={(on) => (on ? turn(true) : setFrom(switchAt.current))}
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
      <Devices devices={now.devices} label={label} />
      {now.keptLink !== undefined && (
        <Kept forget={service.forget} onForgot={() => facts.set({ ...now, keptLink: undefined })} />
      )}
      {from !== undefined && (
        <TurnOffDialog
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
    </Card>
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
function TurnOffDialog(props: {
  readonly from: HTMLElement | null;
  readonly losing: readonly RelayDevice[];
  readonly label: (device: RelayDevice) => string;
  readonly selfId: string;
  readonly serverUrl: string | undefined;
  readonly onAsk: () => Promise<unknown>;
  readonly onTurnOff: () => void;
  readonly onGone: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const others = props.losing.some((device) => device.participantId !== props.selfId);
  const ask = () => {
    setBusy(true);
    setError(undefined);
    props
      .onAsk()
      .then(
        () => setLeaving(true),
        (failure: unknown) => setError(reasonOf(failure)),
      )
      .finally(() => setBusy(false));
  };
  return (
    <GrowingDialog
      from={props.from}
      labelledBy="relay-off-title"
      className="go-direct-dialog"
      testId="relay-off-dialog"
      focus=".new-space-close"
      leaving={leaving}
      onLeave={() => setLeaving(true)}
      onGone={props.onGone}
    >
      <div className="go-direct-card">
        <div className="model-head">
          <h2 id="relay-off-title">Turn the relay off?</h2>
          <button
            type="button"
            className="new-space-close"
            aria-label="Close"
            onClick={() => setLeaving(true)}
          >
            <Icon name="x" size={14} />
          </button>
        </div>
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
              setLeaving(true);
            }}
            data-testid="relay-turn-off"
          >
            Turn off now
          </Button>
        </div>
      </div>
    </GrowingDialog>
  );
}
