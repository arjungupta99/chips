/**
 * The first run on the web and the Mac (ADR 0170), as the mock draws it
 * (https://claude.ai/artifact/SEHZZ4tPRMEqngbj14jnD3):
 *
 * 1. **Your name.** "Chips is running on Arjun's Mac mini", and the name the server gave the
 *    workspace's first person, from the account that started Chips, already in the field.
 * 2. **Bring your first agent.** The gallery: the docs' cards (ADR 0171), then the two the app
 *    carries. Skip for now leaves the setup card to say what's left.
 * 3. **Connect.** The card makes its link at once and follows it to the agent's hello; then its
 *    room opens, and the phone card (`PhoneOffer`) is offered there: the third of three.
 *
 * It covers the whole window while it runs, as a first screen does, and it is this device's: once
 * through it, or skipped, it isn't shown here again.
 */

import {
  type DeviceKind,
  deviceKind,
  INVITE_TURN_ON_RELAY,
  ownsWorkspace,
  type PairedDeviceRecord,
  placeOf,
  type Snapshot,
  type Store,
  setupSteps,
  showsWelcome,
} from "@chipschat/core";
import { appPairingUrl, type Connector, FIRST_PERSON_NAME } from "@chipschat/protocol";
import { Button, ChipMark } from "@chipschat/ui";
import QRCode from "qrcode";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useConnectors, useDeviceFlag, useMyDevices, useServerFacts } from "./firstRun.ts";
import { type Choice, ConnectPage, Gallery, type JoinService } from "./Join.tsx";
import { type SetupActions, SetupRail } from "./SetupCard.tsx";
import { browserPermission, PERMISSION_ANSWERED } from "./useNotifications.ts";
import { useOpenRelay } from "./you/openRelay.ts";

type Stage =
  | { readonly kind: "name" }
  | { readonly kind: "gallery" }
  | { readonly kind: "connect"; readonly way: Choice };

export function FirstRun(props: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly machine: string | undefined;
  readonly cards: readonly Connector[] | undefined;
  readonly join: JoinService;
  /** Where it starts: the setup card's "Add" opens it at the gallery. */
  readonly from?: "name" | "gallery";
  /** Through it, or skipped: the room to open when an agent's hello brought it to an end. */
  readonly onDone: (roomId?: string) => void;
}) {
  const titleId = useId();
  const [stage, setStage] = useState<Stage>({ kind: props.from ?? "name" });
  const { model, directory, joins } = props.snapshot;
  const total = props.from === "gallery" ? undefined : 3;
  return (
    <div
      className="first-run"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="first-run"
    >
      <div
        className={stage.kind === "name" ? "first-run-col" : "first-run-col wide"}
        data-stage={stage.kind}
      >
        {stage.kind === "name" && (
          <YourName
            titleId={titleId}
            store={props.store}
            current={directory[props.selfId]?.displayName}
            machine={props.machine}
            onNext={() => setStage({ kind: "gallery" })}
          />
        )}
        {stage.kind === "gallery" && (
          <>
            {total !== undefined && <span className="first-run-step">2 of {total}</span>}
            <Gallery
              titleId={titleId}
              cards={props.cards}
              title="Bring your first agent"
              lede="Pick the one you already run. It joins as an agent you can talk to and supervise from your phone."
              onPick={(way) => setStage({ kind: "connect", way })}
            />
            <button
              type="button"
              className="join-link first-run-skip"
              data-testid="first-run-skip"
              onClick={() => props.onDone()}
            >
              Skip for now
            </button>
          </>
        )}
        {stage.kind === "connect" && (
          <ConnectPage
            titleId={titleId}
            way={stage.way}
            model={model}
            directory={directory}
            selfId={props.selfId}
            joins={joins}
            join={props.join}
            onOpen={(roomId) => props.onDone(roomId)}
            foldSwitches
            onCancelled={() => setStage({ kind: "gallery" })}
            footer={
              <button
                type="button"
                className="join-link"
                data-testid="first-run-back"
                onClick={() => setStage({ kind: "gallery" })}
              >
                Back
              </button>
            }
          />
        )}
      </div>
    </div>
  );
}

/** The first of three: where Chips is running, and what to call you. */
function YourName(props: {
  readonly titleId: string;
  readonly store: Store;
  readonly current: string | undefined;
  readonly machine: string | undefined;
  readonly onNext: () => void;
}) {
  // The server named the first person from the account that started Chips (ADR 0170); "You" is
  // what it says when it couldn't, and is no name to offer back.
  const offered =
    props.current === undefined || props.current === FIRST_PERSON_NAME ? "" : props.current;
  const [name, setName] = useState(offered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const field = useId();
  const input = useRef<HTMLInputElement>(null);
  // The one thing on the screen to do, so the field is ready for it.
  useEffect(() => input.current?.focus(), []);
  const next = async () => {
    const chosen = name.trim();
    if (chosen === "" || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (chosen !== props.current) await props.store.rename(chosen);
      props.onNext();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setBusy(false);
    }
  };
  return (
    <form
      className="first-run-name"
      data-testid="first-run-name"
      onSubmit={(event) => {
        event.preventDefault();
        void next();
      }}
    >
      <ChipMark size={56} />
      <span className="first-run-step">1 of 3</span>
      <h1 id={props.titleId}>
        {props.machine === undefined ? "Chips is running" : `Chips is running on ${props.machine}`}
      </h1>
      <p className="first-run-lede">
        Your agents talk to it here, and your phone keeps up with them.
      </p>
      <label htmlFor={field}>What should we call you?</label>
      <input
        ref={input}
        id={field}
        type="text"
        value={name}
        maxLength={60}
        data-testid="first-run-name-field"
        onChange={(event) => setName(event.target.value)}
      />
      <small className="first-run-hint">
        {offered === ""
          ? "It's what your agents, and anybody you invite, will call you."
          : "From the account Chips runs as. You can change it any time, in You."}
      </small>
      {error !== undefined && (
        <p className="harness-add-error" role="alert">
          {error}
        </p>
      )}
      <Button
        variant="primary"
        type="submit"
        disabled={name.trim() === "" || busy}
        data-testid="first-run-continue"
      >
        Continue
      </Button>
    </form>
  );
}

/** A phone or an iPad among these devices, paired since `since`, if there is one (ADR 0177). */
export function phonePairedSince(
  devices: readonly PairedDeviceRecord[] | undefined,
  since: number,
): PairedDeviceRecord | undefined {
  return devices?.find(
    (each) =>
      each.revokedAt === undefined &&
      HANDS.includes(deviceKind(each.name)) &&
      Date.parse(each.pairedAt) >= since,
  );
}

/** The kinds of device that are Chips in a hand. */
const HANDS: readonly DeviceKind[] = ["phone", "tablet"];

/** What a pairing code is turned into: the link the camera opens, drawn as a QR. */
interface PairingQr {
  readonly svg: string;
  readonly link: string;
  readonly relay: boolean;
}

type IssuedCode = {
  code: string;
  expiresAt: string;
  serverUrl?: string | undefined;
  relay?: string | undefined;
  serverKey?: string | undefined;
};

const reasonOf = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

/** What the card says where no phone could reach this server: it answers this computer alone. */
export const ONLY_THIS_COMPUTER =
  "The relay is off and Chips here answers only this computer, so a phone can't reach it.";

/** Under it, the way in for a home network: the other way, beside the relay an owner is offered. */
export function letYourWifiIn(besideRelay: boolean): string {
  return `${besideRelay ? "Or run" : "Run"} chips up --reach lan to let your Wi-Fi in.`;
}

/** Whether a phone could reach the address it would be shown: not one on this machine alone. */
function reachableFromAPhone(url: string, relay: string | undefined): boolean {
  if (relay !== undefined) return true;
  try {
    return placeOf(new URL(url).hostname) !== "loopback";
  } catch {
    return false;
  }
}

/**
 * A code for the phone, as a `chips://pair` link the iPhone's camera opens in the app, drawn as a
 * QR. A code is good for fifteen minutes: a fresh one is made as the old one runs out. A server
 * that answers this computer alone, with no relay, gets no QR: it would open nothing.
 */
async function qrOf(issued: IssuedCode, serverUrl: string): Promise<PairingQr | string> {
  const url = issued.serverUrl ?? serverUrl;
  if (!reachableFromAPhone(url, issued.relay)) return ONLY_THIS_COMPUTER;
  const link = appPairingUrl(url, issued.code, { relay: issued.relay, key: issued.serverKey });
  const svg = await QRCode.toString(link, { type: "svg", margin: 1 });
  return { svg, link, relay: issued.relay !== undefined };
}

/**
 * The code and its QR, made again as it runs out, and when the server's relay changes: one turned
 * on from this card's own button gives a code that reaches this computer from anywhere.
 */
function usePairingQr(
  issue: () => Promise<IssuedCode>,
  serverUrl: string,
  relay: string | undefined,
): { readonly qr: PairingQr | undefined; readonly error: string | undefined } {
  const [qr, setQr] = useState<PairingQr | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  // biome-ignore lint/correctness/useExhaustiveDependencies: made again when the relay changes.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const make = async () => {
      // What went wrong, or the code and its QR.
      const made = await issue()
        .then(async (issued) => {
          const qr = await qrOf(issued, serverUrl);
          return typeof qr === "string" ? qr : { issued, qr };
        })
        .catch(reasonOf);
      if (!live) return;
      if (typeof made === "string") {
        setQr(undefined);
        setError(made);
        return;
      }
      setError(undefined);
      setQr(made.qr);
      const left = Date.parse(made.issued.expiresAt) - Date.now();
      timer = setTimeout(() => void make(), Math.max(30_000, left - 30_000));
    };
    void make();
    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [issue, serverUrl, relay]);
  return { qr, error };
}

/**
 * The third of three: "Get Chips on your phone", a QR the iPhone's camera opens in the app, already
 * paired, through the relay when there is one. Where a phone couldn't reach this computer at all,
 * an owner is offered the relay, as an invite is (ADR 0247). It watches for the phone and says when
 * it is paired, then folds away; Later puts it away.
 */
export function PhoneOffer(props: {
  readonly store: Store;
  readonly issue: () => Promise<IssuedCode>;
  readonly serverUrl: string;
  /** The server's relay as it last said: a change makes a fresh code. */
  readonly relay?: string | undefined;
  /** An owner, who is offered the relay where a phone couldn't reach this computer. */
  readonly owner?: boolean | undefined;
  readonly step?: string | undefined;
  readonly onClose: () => void;
}) {
  const since = useRef(Date.now() - 5000);
  const { qr, error } = usePairingQr(props.issue, props.serverUrl, props.relay);
  const openRelay = useOpenRelay();
  const devices = useMyDevices(props.store, 3000);
  const paired = phonePairedSince(devices, since.current);
  const { onClose } = props;

  // Paired: said for a moment, then put away for good.
  useEffect(() => {
    if (paired === undefined) return;
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [paired, onClose]);

  return (
    <aside
      className="phone-offer"
      data-testid="phone-offer"
      data-paired={paired === undefined ? "false" : "true"}
      aria-label="Get Chips on your phone"
    >
      {props.step !== undefined && <span className="first-run-step">{props.step}</span>}
      {paired === undefined ? (
        <PhoneWaiting
          qr={qr}
          error={error}
          onRelay={props.owner === true ? openRelay : undefined}
          onLater={onClose}
        />
      ) : (
        <PhonePaired name={paired.name} relay={qr?.relay === true} />
      )}
    </aside>
  );
}

function PhoneWaiting(props: {
  readonly qr: PairingQr | undefined;
  readonly error: string | undefined;
  /** You at the Relay card, for an owner. */
  readonly onRelay: (() => void) | undefined;
  readonly onLater: () => void;
}) {
  const { qr, onRelay } = props;
  const local = props.error === ONLY_THIS_COMPUTER;
  return (
    <>
      <b>Get Chips on your phone</b>
      {qr === undefined ? (
        <span className="phone-offer-qr empty">{props.error ?? "Making a code…"}</span>
      ) : (
        <img
          className="phone-offer-qr"
          alt={`A QR code that opens ${qr.link}`}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(qr.svg)}`}
          data-link={qr.link}
        />
      )}
      {local && onRelay !== undefined && (
        <Button size="sm" onClick={onRelay} data-testid="phone-offer-turn-on-relay">
          {INVITE_TURN_ON_RELAY}
        </Button>
      )}
      {local && <small>{letYourWifiIn(onRelay !== undefined)}</small>}
      {qr !== undefined && (
        <small>
          Scan it with the iPhone's camera: Chips opens already paired
          {qr.relay ? ", and reaches this computer from anywhere." : "."}
        </small>
      )}
      <button
        type="button"
        className="join-link"
        data-testid="phone-offer-later"
        onClick={props.onLater}
      >
        Later
      </button>
    </>
  );
}

function PhonePaired(props: { readonly name: string; readonly relay: boolean }) {
  return (
    <>
      <span className="phone-offer-ok" aria-hidden="true">
        ✓
      </span>
      <b>{props.name} is paired</b>
      <small>
        {props.relay
          ? "It reaches this computer through your relay, at home or away."
          : "It reaches this computer on this network."}
      </small>
    </>
  );
}

/** Whether this browser will raise a banner when an agent needs this person; the desktop always can. */
function useNotificationsOn(desktop: boolean): boolean {
  const where = globalThis;
  return useSyncExternalStore(
    (changed) => {
      where.addEventListener?.(PERMISSION_ANSWERED, changed);
      return () => where.removeEventListener?.(PERMISSION_ANSWERED, changed);
    },
    () => desktop || browserPermission(where).state === "granted",
  );
}

/**
 * Whether to welcome, decided once, when the directory is the server's word: an agent joining half
 * way through must not take the welcome away from under the person bringing it.
 */
function useWelcome(
  snapshot: Snapshot,
  selfId: string,
  welcomed: boolean,
): [Stage["kind"] | undefined, (stage: "name" | "gallery" | undefined) => void] {
  const [welcome, setWelcome] = useState<"name" | "gallery" | undefined>(undefined);
  const decided = useRef(false);
  const listed = snapshot.directoryFrom !== undefined;
  useEffect(() => {
    if (decided.current || !listed) return;
    decided.current = true;
    if (showsWelcome(snapshot.directory, selfId, welcomed)) setWelcome("name");
  }, [listed, snapshot.directory, selfId, welcomed]);
  return [welcome, setWelcome];
}

/** Where a phone reaches the server, for its QR: the address this device was paired with. */
function serverUrlOf(device: { readonly serverUrl?: string | undefined }): string {
  return device.serverUrl === undefined || device.serverUrl === ""
    ? globalThis.location.origin
    : device.serverUrl;
}

/**
 * The first run's three pieces for the shell (ADR 0170): the welcome over the window while it
 * runs, the setup card for the rail, and the phone card over the room. Each decides for itself
 * whether it is drawn, from what this device knows and keeps.
 */
export function useFirstRun(input: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly device: {
    readonly deviceId: string;
    readonly participantId: string;
    readonly serverUrl?: string | undefined;
  };
  readonly join: JoinService;
  readonly desktop: boolean;
  readonly open: (spaceId: string) => void;
  /** You, at the relay switch: where Away from home is done (ADR 0245). */
  readonly openRelay?: (() => void) | undefined;
}): {
  readonly welcome: ReactNode;
  readonly setup: ReactNode;
  readonly phone: ReactNode;
  /** The gallery's cards from the docs, for Connect a harness too. */
  readonly cards: readonly Connector[] | undefined;
} {
  const { store, snapshot, device, open } = input;
  const selfId = device.participantId;
  const facts = useServerFacts(store, snapshot.model.relay);
  const cards = useConnectors(store);
  const [welcomed, setWelcomed] = useDeviceFlag("welcomed", device.deviceId);
  const [owed, setOwed] = useDeviceFlag("phone", device.deviceId);
  const [hidden, setHidden] = useDeviceFlag("setup-hidden", device.deviceId);
  const [offering, setOffering] = useState(false);
  const notifications = useNotificationsOn(input.desktop);
  const [welcome, setWelcome] = useWelcome(snapshot, selfId, welcomed);

  const owner = ownsWorkspace(snapshot.directory, selfId);
  const devices = useMyDevices(store, owner && !hidden ? 15_000 : undefined);
  const steps = setupSteps({
    server: facts,
    here: input.desktop ? "mac" : "browser",
    devices,
    model: snapshot.model,
    directory: snapshot.directory,
    notifications,
  });
  const phoneDone = steps.find((step) => step.id === "phone")?.done === true;

  const done = (roomId?: string) => {
    setWelcome(undefined);
    setWelcomed(true);
    if (roomId === undefined) return;
    open(roomId);
    if (!phoneDone) setOwed(true);
  };
  const actions: SetupActions = {
    hello: () => setWelcome("gallery"),
    phone: () => setOffering(true),
    ...(input.desktop ? {} : { notify: () => void browserPermission().ask() }),
    ...(input.openRelay === undefined ? {} : { away: input.openRelay }),
  };
  const issue = useCallback(() => store.issuePairingCode(), [store]);
  const closePhone = useCallback(() => {
    setOwed(false);
    setOffering(false);
  }, [setOwed]);
  const welcoming = welcome !== undefined;

  return {
    cards,
    welcome: welcoming && (
      <FirstRun
        store={store}
        snapshot={snapshot}
        selfId={selfId}
        machine={facts?.machine}
        cards={cards}
        join={input.join}
        from={welcome === "gallery" ? "gallery" : "name"}
        onDone={done}
      />
    ),
    setup: facts !== undefined && devices !== undefined && (
      <SetupRail
        theirs={owner && !hidden}
        steps={steps}
        actions={actions}
        onHide={() => setHidden(true)}
      />
    ),
    phone: (owed || offering) && !welcoming && (
      <PhoneOffer
        store={store}
        issue={issue}
        serverUrl={serverUrlOf(device)}
        relay={facts?.relay.url}
        owner={owner}
        step={owed ? "3 of 3" : undefined}
        onClose={closePhone}
      />
    ),
  };
}
