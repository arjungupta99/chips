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
  firstRunLede,
  INVITE_TURN_ON_RELAY,
  type JoinRequest,
  ownsWorkspace,
  type PairedDeviceRecord,
  placeOf,
  relayTurnOnAsk,
  type Snapshot,
  type StartAnswer,
  type Store,
  setupSteps,
  showsWelcome,
} from "@chipschat/core";
import { type Connector, FIRST_PERSON_NAME, phonePairingUrl } from "@chipschat/protocol";
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
import {
  useConnectors,
  useDeviceFlag,
  useFoundHere,
  useMyDevices,
  useServerFacts,
} from "./firstRun.ts";
import { type Choice, ConnectPage, Gallery, type JoinService } from "./Join.tsx";
import { type SetupActions, SetupRail } from "./SetupCard.tsx";
import { StartGuide, StartQuestion } from "./StartSteps.tsx";
import { browserPermission, PERMISSION_ANSWERED } from "./useNotifications.ts";

type Stage =
  | { readonly kind: "name" }
  | { readonly kind: "gallery" }
  /** Somebody with no agent yet: what they already have (ADR 0290). */
  | { readonly kind: "start" }
  | { readonly kind: "steps"; readonly answer: StartAnswer }
  /** A card's page; Back goes where it came from, the gallery or the steps. */
  | {
      readonly kind: "connect";
      readonly way: Choice;
      readonly from?: Stage;
      /** On this Mac, Connect at once: the steps followed along and saw them done. */
      readonly start?: boolean;
    };

/**
 * A card's link put away unused as the welcome goes Back (the onboarding audit, Part 2, item 34):
 * withdrawn, rather than left working for its fifteen minutes. One already used, or ended, stays as
 * it is; one not heard of yet was just made, and is withdrawn too.
 */
const GALLERY: Stage = { kind: "gallery" };

export function withdrawUnused(
  join: Pick<JoinService, "deny">,
  joins: ReadonlyMap<string, JoinRequest> | undefined,
  id: string | undefined,
): void {
  if (id === undefined) return;
  const state = joins?.get(id)?.state;
  if (state !== undefined && state !== "allowed") return;
  void join.deny(id).catch(() => undefined);
}

export function FirstRun(props: {
  readonly store: Store;
  readonly snapshot: Snapshot;
  readonly selfId: string;
  readonly machine: string | undefined;
  readonly cards: readonly Connector[] | undefined;
  readonly join: JoinService;
  /** Chips for Mac, where the written steps run in this Mac's Terminal. */
  readonly onMac?: boolean;
  /** Where it starts: the setup card's "Add" opens it at the gallery. */
  readonly from?: "name" | "gallery";
  /** Through it, or skipped: the room to open when an agent's hello brought it to an end. */
  readonly onDone: (roomId?: string) => void;
}) {
  const titleId = useId();
  const [stage, setStage] = useState<Stage>({ kind: props.from ?? "name" });
  const { model, directory, joins } = props.snapshot;
  // The link the open card made last, for Back to withdraw while it waits.
  const made = useRef<string | undefined>(undefined);
  const back = () => {
    withdrawUnused(props.join, joins, made.current);
    made.current = undefined;
    setStage(stage.kind === "connect" && stage.from !== undefined ? stage.from : GALLERY);
  };
  const total = props.from === "gallery" ? undefined : 3;
  // Asked from the first step, so the gallery opens already in order.
  const { found } = useFoundHere(props.cards);
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
              lede={firstRunLede(props.cards, found)}
              onPick={(way) => setStage({ kind: "connect", way })}
              onNone={() => setStage({ kind: "start" })}
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
        {stage.kind === "start" && (
          <>
            {total !== undefined && <span className="first-run-step">2 of {total}</span>}
            <StartQuestion
              titleId={titleId}
              cards={props.cards}
              onAnswer={(answer) => setStage({ kind: "steps", answer })}
              onBack={() => setStage(GALLERY)}
            />
          </>
        )}
        {stage.kind === "steps" && (
          <StartGuide
            key={stage.answer.key}
            titleId={titleId}
            answer={stage.answer}
            onMac={props.onMac === true}
            onConnect={(card, start) =>
              setStage({ kind: "connect", way: card, from: stage, start: start === true })
            }
            onBack={() => setStage({ kind: "start" })}
          />
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
            startHere={stage.start === true}
            foldSwitches
            onKept={(kept) => {
              made.current = kept.id;
            }}
            onCancelled={() => {
              made.current = undefined;
              setStage(GALLERY);
            }}
            footer={
              <button
                type="button"
                className="join-link"
                data-testid="first-run-back"
                onClick={back}
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
export function reachableFromAPhone(url: string, relay: string | undefined): boolean {
  if (relay !== undefined) return true;
  try {
    return placeOf(new URL(url).hostname) !== "loopback";
  } catch {
    return false;
  }
}

/**
 * A code for the phone, as the chipschat.ai/p link the iPhone's camera opens (the install plan,
 * §3.2): in Chips when it is there, at where to get it when it isn't. Drawn as a QR. A code is good
 * for fifteen minutes: a fresh one is made as the old one runs out. A server that answers this
 * computer alone, with no relay, gets no QR: it would open nothing.
 */
async function qrOf(issued: IssuedCode, serverUrl: string): Promise<PairingQr | string> {
  const url = issued.serverUrl ?? serverUrl;
  if (!reachableFromAPhone(url, issued.relay)) return ONLY_THIS_COMPUTER;
  const link = phonePairingUrl(url, issued.code, { relay: issued.relay, key: issued.serverKey });
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
  /** The server's machine, as it names itself, for what turning the relay on means. */
  readonly machine?: string | undefined;
  readonly step?: string | undefined;
  readonly onClose: () => void;
}) {
  const since = useRef(Date.now() - 5000);
  const { qr, error } = usePairingQr(props.issue, props.serverUrl, props.relay);
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
          onRelay={
            props.owner === true
              ? {
                  machine: props.machine,
                  turnOn: async () => {
                    await props.store.setRelay(true);
                  },
                }
              : undefined
          }
          onLater={onClose}
        />
      ) : (
        <PhonePaired name={paired.name} relay={qr?.relay === true} />
      )}
    </aside>
  );
}

/**
 * Turn on the relay, on the phone card where a phone couldn't reach this computer: asked first,
 * then turned on here (the onboarding audit, Part 2, item 35). The card makes a code with the relay
 * in it once the server says it's on.
 */
function RelayOffer(props: { readonly relay: RelayTurnOn }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const ask = relayTurnOnAsk(props.relay.machine);
  if (!asking) {
    return (
      <Button size="sm" onClick={() => setAsking(true)} data-testid="phone-offer-turn-on-relay">
        {INVITE_TURN_ON_RELAY}
      </Button>
    );
  }
  const turnOn = () => {
    setBusy(true);
    setError(undefined);
    props.relay.turnOn().then(
      () => setBusy(false),
      (failure: unknown) => {
        setError(failure instanceof Error ? failure.message : String(failure));
        setBusy(false);
      },
    );
  };
  return (
    <div className="phone-offer-relay" data-testid="phone-offer-relay-ask">
      <small>{ask.says}</small>
      {error !== undefined && (
        <small className="harness-add-error" role="alert">
          {error}
        </small>
      )}
      <Button size="sm" onClick={turnOn} disabled={busy} data-testid="phone-offer-relay-yes">
        {busy ? ask.busy : ask.yes}
      </Button>
      <button
        type="button"
        className="join-link"
        disabled={busy}
        data-testid="phone-offer-relay-cancel"
        onClick={() => setAsking(false)}
      >
        Cancel
      </button>
    </div>
  );
}

/** The relay turned on from the card, for an owner, once asked. */
interface RelayTurnOn {
  readonly machine: string | undefined;
  readonly turnOn: () => Promise<void>;
}

function PhoneWaiting(props: {
  readonly qr: PairingQr | undefined;
  readonly error: string | undefined;
  readonly onRelay: RelayTurnOn | undefined;
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
      {local && onRelay !== undefined && <RelayOffer relay={onRelay} />}
      {local && <small>{letYourWifiIn(onRelay !== undefined)}</small>}
      {qr !== undefined && <small>{scanWords(qr.relay)}</small>}
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

/**
 * Under the QR. With the relay on, a code a device makes asks first (ADR 0232), so the phone waits
 * for an Allow here rather than opening already paired (the onboarding audit, item 31).
 */
export function scanWords(relay: boolean): string {
  return relay
    ? "Scan it with your iPhone's camera, then allow the phone when Chips asks here. It reaches this computer from anywhere. No Chips on the phone yet? The code leads to the App Store first."
    : "Scan it with your iPhone's camera: Chips opens already paired. No Chips on the phone yet? The code leads to the App Store first.";
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
/** How often the setup card asks for this person's devices: while an owner's card waits on one. */
function devicesEvery(owner: boolean, hidden: boolean, allIn: boolean): number | undefined {
  return owner && !hidden && !allIn ? 15_000 : undefined;
}

/** Whether this browser has refused banners for the page; never in the Mac app, which has its own. */
function refusedHere(desktop: boolean): boolean {
  return !desktop && browserPermission().state === "denied";
}

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
  // Somebody invited, an owner among them, was not who set the workspace up: the welcome is that
  // person's, on any device of theirs (the onboarding audit, Part 2, item 15).
  const invited = snapshot.model.people[selfId]?.invitedBy !== undefined;
  useEffect(() => {
    if (decided.current || !listed) return;
    decided.current = true;
    if (showsWelcome(snapshot.directory, selfId, welcomed || invited)) setWelcome("name");
  }, [listed, snapshot.directory, selfId, welcomed, invited]);
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
  // Asked again every 15 s while the card waits on a device, and no more once it has them all
  // (the onboarding audit, Part 2, item 24): before, an owner's page asked for good.
  const [devicesIn, setDevicesIn] = useState(false);
  const devices = useMyDevices(store, devicesEvery(owner, hidden, devicesIn));
  const steps = setupSteps({
    server: facts,
    here: input.desktop ? "mac" : "browser",
    devices,
    model: snapshot.model,
    directory: snapshot.directory,
    notifications,
    notificationsRefused: refusedHere(input.desktop),
  });
  const phoneDone = steps.find((step) => step.id === "phone")?.done === true;
  const computerDone = steps.find((step) => step.id === "computer")?.done === true;
  useEffect(() => setDevicesIn(phoneDone && computerDone), [phoneDone, computerDone]);

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
        onMac={input.desktop}
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
        machine={facts?.machine}
        step={owed ? "3 of 3" : undefined}
        onClose={closePhone}
      />
    ),
  };
}
