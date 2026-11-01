/**
 * Join requests on the web and the Mac (ADR 0122): how a harness is brought in without a token
 * copied by hand, and how a person allows one that asks.
 *
 * - **The gallery.** Agents → Connect a harness opens it, as You's card does: Your own harness, and
 *   Anything with HTTP. The app names no harness; the cards that name one come from the docs, later
 *   (plan §3.4).
 * - **The connect card.** A card makes a link at once, allowed already with what its switches say:
 *   the one line to run where the harness runs, the switches, and the card that follows the link
 *   from waiting to the harness's hello, saying why when it stops. Anything with HTTP keeps today's
 *   token and lines under Advanced.
 * - **The request dialog.** When something asks, the people who may decide see who, from where,
 *   the code to compare, and what it asks to do, as switches; Allow, or Don't allow. A link that
 *   asks (ADR 0232) shows it to the person who sent the link alone: "Priya is asking to join Japan
 *   trip", and the six digits her screen shows, to compare.
 *
 * Built to the mock's §2 (the connect card) and §3 (the allow sheet). Flat controls.
 */

import {
  administers,
  allowArgs,
  arrivalWords,
  CANCEL_LINK,
  CONNECT_WAY_ORDER,
  CONNECT_WAYS,
  type ConnectChoice,
  type ConnectWay,
  type ConnectWhere,
  capabilityWords,
  connectHead,
  connectNote,
  curlRedeem,
  type Directory,
  faceOf,
  fetchesBridge,
  hereAlreadyWords,
  JOIN_STEPS,
  type JoinCard,
  type JoinRequest,
  joinCardOf,
  kindWords,
  type LinkAskWords,
  linkAskWords,
  linkStarts,
  mayAskFromPage,
  myRole,
  nameOf,
  nextJoinAsk,
  OFFERED,
  type PairAsChoice,
  pairAsChoices,
  pairedAsWords,
  sayOf,
  sdkLines,
  shellLine,
  stallWords,
  switchesFor,
  type WorkspaceModel,
} from "@chipschat/core";
import { type Connector, isLinkKind, pairingCode, pairingCodeTyped } from "@chipschat/protocol";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { BridgeWays, type ConnectHere, CopyBox, useConnectHere } from "./ConnectBridge.tsx";
import { GrowingDialog } from "./GrowingDialog.tsx";
import { useNow } from "./useNow.ts";
import { Switch } from "./you/controls.tsx";

/** What the screens ask of the store. */
export interface JoinService {
  readonly makeLink: (
    capabilities: readonly string[],
  ) => Promise<{ readonly request: JoinRequest; readonly link: string }>;
  /**
   * Allow a request; a device's with the code it shows, typed (SEC-6), and, from an owner, the
   * person already here it is paired as (ADR 0206).
   */
  readonly allow: (
    requestId: string,
    capabilities: readonly string[],
    code?: string,
    as?: string,
  ) => Promise<JoinRequest>;
  readonly deny: (requestId: string) => Promise<JoinRequest>;
}

/** The two ways in the app ships with (core's, ADR 0190). */
export type Way = ConnectWay;

/** A card the gallery shows: one of the two ways, or a connector the docs list (ADR 0171). */
export type Choice = ConnectChoice;

/** The dialog's ×, as New space's is. */
function Close(props: { readonly onClose: () => void; readonly testId: string }) {
  return (
    <button
      type="button"
      className="new-space-close"
      aria-label="Close"
      data-testid={props.testId}
      onClick={props.onClose}
    >
      <Icon name="x" size={14} />
    </button>
  );
}

/**
 * The docs' cards, then the two the app carries. Choosing one makes its link. With no docs to read,
 * it is the two.
 */
export function Gallery(props: {
  readonly titleId: string;
  readonly cards?: readonly Connector[] | undefined;
  readonly onPick: (choice: Choice) => void;
  /** The × in its head. Absent, there is none: the welcome has Skip instead. */
  readonly onClose?: (() => void) | undefined;
  readonly title?: string | undefined;
  readonly lede?: string | undefined;
  /** The harnesses here already, by name (`connectedNames`): their cards say so. */
  readonly connected?: ReadonlySet<string> | undefined;
}) {
  return (
    <section className="join-gallery" data-testid="join-gallery">
      <div className="new-space-head">
        <h2 id={props.titleId}>{props.title ?? "Connect a harness"}</h2>
        {props.onClose !== undefined && <Close onClose={props.onClose} testId="add-agent-close" />}
      </div>
      <p className="join-lede">
        {props.lede ??
          "Pick how your harness connects. It joins as an agent you can talk to and supervise from your phone."}
      </p>
      <div className="join-cards">
        {(props.cards ?? []).map((card) => {
          const kind = kindWords(card);
          const here = props.connected?.has(card.name.toLowerCase()) === true;
          return (
            <button
              type="button"
              key={card.id}
              className="join-card"
              data-testid={`join-card-${card.id}`}
              onClick={() => props.onPick(card)}
            >
              <Avatar name={card.name} kind="harness" size="sm" />
              <b>
                {card.name}{" "}
                {here ? (
                  <span className="join-kind here">Connected</span>
                ) : (
                  <span className={kind.one ? "join-kind one" : "join-kind"}>{kind.words}</span>
                )}
              </b>
              <small>{card.line}</small>
            </button>
          );
        })}
        {CONNECT_WAY_ORDER.map((way) => (
          <button
            type="button"
            key={way}
            className="join-card"
            data-testid={`join-way-${way}`}
            onClick={() => props.onPick(way)}
          >
            <Avatar
              name={CONNECT_WAYS[way].name}
              kind="harness"
              icon={CONNECT_WAYS[way].face}
              size="sm"
            />
            <b>
              {CONNECT_WAYS[way].name} <span className="join-kind">{CONNECT_WAYS[way].kind}</span>
            </b>
            <small>{CONNECT_WAYS[way].sub}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * A card for a harness here already, as the phone's asks first (ADR 0190, point 1): a second link
 * makes a second harness, so none is made until another is asked for. The one here is put right,
 * or given a new agent, from its page.
 */
export function HereAlready(props: {
  readonly titleId: string;
  readonly card: Connector;
  readonly harnessId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onAnother: () => void;
  readonly onBack: () => void;
  /** Its page on the Agents tab. Absent, there is no way there from here. */
  readonly onOpenHarness?: ((harnessId: string) => void) | undefined;
  readonly onClose?: (() => void) | undefined;
}) {
  const { card, harnessId } = props;
  const mayAsk = mayAskFromPage(props.model, props.directory, props.selfId, harnessId);
  const words = hereAlreadyWords(nameOf(props.directory, harnessId), mayAsk);
  const open = props.onOpenHarness;
  return (
    <section className="join-connect" data-testid="join-here-already" data-way={card.id}>
      <div className="new-space-head">
        <Avatar name={card.name} kind="harness" size="sm" />
        <div className="join-head">
          <h2 id={props.titleId}>{connectHead(card, false).title}</h2>
          <small>{card.line}</small>
        </div>
        {props.onClose !== undefined && <Close onClose={props.onClose} testId="add-agent-close" />}
      </div>
      <p className="join-here">{words.note}</p>
      <div className="harness-add-actions">
        <button
          type="button"
          className="join-link"
          data-testid="join-here-back"
          onClick={props.onBack}
        >
          Back
        </button>
        <Button data-testid="join-here-another" onClick={props.onAnother}>
          {words.another}
        </Button>
        {open !== undefined && (
          <Button variant="primary" data-testid="join-here-page" onClick={() => open(harnessId)}>
            Open its page
          </Button>
        )}
      </div>
    </section>
  );
}

/** A switch row: what it may do, and the line under it. The harness's page draws them too. */
export function CapabilityRow(props: {
  readonly name: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onChange: (on: boolean) => void;
  /** The label alone, for the connect card's two columns. */
  readonly compact?: boolean;
}) {
  const words = capabilityWords(props.name);
  return (
    <div className="join-switch" data-testid={`join-cap-${props.name}`}>
      <span>
        <b>{words.label}</b>
        {words.detail !== undefined && props.compact !== true && <small>{words.detail}</small>}
      </span>
      <Switch
        label={words.label}
        checked={props.on}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </div>
  );
}

/** Each step's words, and the line under it where there is one. */
function stepWords(
  step: (typeof JOIN_STEPS)[number],
  request: JoinRequest,
  selfId: string,
  directory: Directory,
): { label: string; detail?: string | undefined } {
  const name = request.name ?? "It";
  switch (step) {
    case "waiting":
      return {
        label: request.startedBy === "person" ? "Waiting for your harness" : `${name} asked`,
      };
    case "asked": {
      const where = [request.machine, request.fromAddr].filter((each) => each !== undefined);
      return {
        label: `${name} asked to join`,
        detail: where.length > 0 ? `from ${where.join(" · ")}` : undefined,
      };
    }
    case "allowed": {
      const by = request.decidedBy;
      const who = by === selfId ? "you" : (directory[by ?? ""]?.displayName ?? "a person");
      return {
        label: "Allowed",
        detail: request.startedBy === "person" ? `${who} started it here` : `by ${who}`,
      };
    }
    case "connected":
      return { label: "Connected", detail: request.software };
    case "hello":
      return { label: "Said hello" };
  }
}

/** The card that follows a request from waiting to its hello. */
export function JoinProgress(props: {
  readonly request: JoinRequest;
  readonly card: JoinCard;
  readonly selfId: string;
  readonly directory: Directory;
  readonly onRenew?: (() => void) | undefined;
}) {
  const { request, card } = props;
  const stall = card.stall === undefined ? undefined : stallWords(card.stall, request.name);
  const renews =
    card.stall !== undefined && ["expired", "denied", "revoked"].includes(card.stall.kind);
  return (
    <div className="join-progress" data-testid="join-progress" data-done={card.done}>
      <ol>
        {JOIN_STEPS.map((step, index) => {
          const words = stepWords(step, request, props.selfId, props.directory);
          const state =
            index < card.done ? "ok" : index === card.done && stall === undefined ? "wait" : "";
          return (
            <li key={step} className={state} data-testid={`join-step-${step}`} data-state={state}>
              <i aria-hidden="true">{state === "ok" ? "✓" : ""}</i>
              <span>
                {words.label}
                {words.detail !== undefined && <small>{words.detail}</small>}
              </span>
            </li>
          );
        })}
      </ol>
      {stall !== undefined && (
        <div className="join-stall" role="status" data-testid="join-stall">
          <b>{stall.says}</b>
          {renews && props.onRenew !== undefined ? (
            <button type="button" className="join-link" onClick={props.onRenew}>
              {stall.doing}
            </button>
          ) : (
            <span>{stall.doing}.</span>
          )}
        </div>
      )}
    </div>
  );
}

/** A request's card as it stands, from what the store holds (core's, ADR 0190). */
export const cardOf = joinCardOf;

/** One of the gallery's cards, connected by a link made as the page opens. */
export function ConnectPage(props: {
  readonly titleId: string;
  readonly way: Choice;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly joins: ReadonlyMap<string, JoinRequest> | undefined;
  readonly join: JoinService;
  readonly onOpen: (spaceId: string) => void;
  readonly onAdvanced?: (() => void) | undefined;
  /** The × in its head. Absent, there is none: the welcome has its own way back. */
  readonly onClose?: (() => void) | undefined;
  /** Under the card, in place of nothing: the welcome's way back to the gallery. */
  readonly footer?: ReactNode;
  /** What it may do, behind a row to open: the welcome's card is about the sentence. */
  readonly foldSwitches?: boolean;
  /**
   * The link was withdrawn with Cancel link: back to the gallery. Absent, there is no Cancel link.
   */
  readonly onCancelled?: (() => void) | undefined;
  /**
   * How a bridge's card runs on this Mac (ADR 0218, phase 5): the shell's, found by the page when
   * absent; `null` for none, as in a browser.
   */
  readonly connectHere?: ConnectHere | null | undefined;
}) {
  const listed = typeof props.way === "string" ? undefined : props.way;
  const bridge = fetchesBridge(props.way) ? props.way : undefined;
  // A card that has a sentence opens on it: saying one sentence is less than running a line.
  const [asking, setAsking] = useState(listed?.sentence !== undefined);
  const { made, granted, error, makeLink, flip } = useLink(listed, props.join);
  const here = useConnectHere(bridge === undefined ? null : props.connectHere);
  const [where, setWhere] = useState<ConnectWhere>("here");
  const nowMs = useNow(1000);
  const request = made === undefined ? undefined : props.joins?.get(made.id);
  const card =
    request === undefined ? undefined : cardOf(request, props.model, props.directory, nowMs);
  // On this Mac only where the shell can run the line here; anywhere else, the other computer.
  const onThisMac = here !== undefined && where === "here";
  return (
    <Hello
      titleId={props.titleId}
      request={request}
      card={card}
      directory={props.directory}
      onOpen={props.onOpen}
      onClose={props.onClose}
    >
      <section
        className="join-connect"
        data-testid="join-connect"
        data-way={listed?.id ?? props.way}
        data-link={made?.link}
      >
        <ConnectHead
          titleId={props.titleId}
          way={props.way}
          asking={asking}
          onClose={props.onClose}
        />
        {bridge === undefined ? (
          <ListedWay
            way={props.way}
            link={made?.link}
            error={error}
            asking={asking}
            onAsking={setAsking}
            onAdvanced={props.onAdvanced}
          />
        ) : (
          <BridgeWays
            card={bridge}
            here={here}
            where={where}
            onWhere={setWhere}
            link={made?.link}
            request={request}
            joinCard={card}
            nowMs={nowMs}
            onNewLink={() => makeLink(request?.capabilities ?? granted)}
          />
        )}
        <Switches
          folded={props.foldSwitches === true}
          on={request?.capabilities ?? granted}
          disabled={request === undefined || request.state !== "allowed"}
          onFlip={(name, on) => void flip(name, on)}
        />
        <ConnectFoot
          listed={listed}
          bridge={bridge !== undefined}
          onThisMac={onThisMac}
          request={request}
          card={card}
          error={made === undefined ? undefined : error}
          selfId={props.selfId}
          directory={props.directory}
          join={props.join}
          footer={props.footer}
          onRenew={() => void makeLink(granted)}
          onCancelled={props.onCancelled}
          onOpen={props.onOpen}
          onClose={props.onClose}
        />
      </section>
    </Hello>
  );
}

/**
 * Under a card's way in: the link followed in five steps (a bridge's card draws its own), what
 * went wrong, and the ways out: the welcome's, Cancel link while the link waits, and its room.
 */
function ConnectFoot(props: {
  readonly listed: Connector | undefined;
  readonly bridge: boolean;
  readonly onThisMac: boolean;
  readonly request: JoinRequest | undefined;
  readonly card: JoinCard | undefined;
  readonly error: string | undefined;
  readonly selfId: string;
  readonly directory: Directory;
  readonly join: JoinService;
  readonly footer: ReactNode;
  readonly onRenew: () => void;
  readonly onCancelled: (() => void) | undefined;
  readonly onOpen: (spaceId: string) => void;
  readonly onClose: (() => void) | undefined;
}) {
  const { listed, request, card } = props;
  return (
    <>
      {!props.bridge && request !== undefined && card !== undefined && (
        <JoinProgress
          request={request}
          card={card}
          selfId={props.selfId}
          directory={props.directory}
          onRenew={props.onRenew}
        />
      )}
      {props.error !== undefined && (
        <p className="harness-add-error" role="alert">
          {props.error}
        </p>
      )}
      <div className="harness-add-actions">
        {props.footer}
        {props.onThisMac ? null : (
          <CancelLink
            request={request}
            card={card}
            join={props.join}
            onCancelled={props.onCancelled}
          />
        )}
        {/* A bridge's card offers it once there is a room: in the dialog the arrival's Say hello
            follows, and the welcome, which has no arrival, goes on by it. */}
        {props.bridge && request?.spaceId === undefined ? null : (
          <OpenRoom
            roomId={request?.spaceId}
            name={listed === undefined ? undefined : (request?.name ?? listed.name)}
            onOpen={props.onOpen}
            onClose={props.onClose}
          />
        )}
      </div>
    </>
  );
}

/**
 * Cancel link, while the link waits to be used (core's `CANCEL_LINK`): withdrawn, its harness can
 * no longer use it. Closed, the dialog leaves a link working for its minutes; this says it is not
 * wanted.
 */
function CancelLink(props: {
  readonly request: JoinRequest | undefined;
  readonly card: JoinCard | undefined;
  readonly join: JoinService;
  readonly onCancelled: (() => void) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const { request, onCancelled } = props;
  // Only while the link waits to be used: not once it is taken, nor once it has stopped.
  const waits = request?.state === "allowed" && props.card?.stall === undefined;
  if (!waits || request === undefined || onCancelled === undefined) return null;
  const cancel = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await props.join.deny(request.requestId);
      onCancelled();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };
  return (
    <>
      {failed && (
        <p className="harness-add-error" role="alert">
          {CANCEL_LINK.failed}
        </p>
      )}
      <button
        type="button"
        className="join-link"
        data-testid="join-cancel"
        disabled={busy}
        onClick={() => void cancel()}
      >
        {CANCEL_LINK.label}
      </button>
    </>
  );
}

/**
 * The hello, in the dialog: the card gives way to the arrival (ADR 0190, point 3). The welcome,
 * which has no way out of its own here, goes on to its setup card and keeps Open its room.
 */
function Hello(props: {
  readonly titleId: string;
  readonly request: JoinRequest | undefined;
  readonly card: JoinCard | undefined;
  readonly directory: Directory;
  readonly onOpen: (roomId: string) => void;
  readonly onClose?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const close = props.onClose;
  if (close === undefined || !helloIn(props.request, props.card)) return <>{props.children}</>;
  return (
    <Arrived
      titleId={props.titleId}
      request={props.request}
      directory={props.directory}
      onOpen={props.onOpen}
      onClose={close}
    />
  );
}

/**
 * The harness is here (ADR 0190): its face lands with the light running round it, its Main agent's
 * face comes in at its corner, and the words say from where; Say hello opens its room.
 */
function Arrived(props: {
  readonly titleId: string;
  readonly request: JoinRequest;
  readonly directory: Directory;
  readonly onOpen: (roomId: string) => void;
  readonly onClose: () => void;
}) {
  const words = arrivalWords(props.request, props.directory);
  const name =
    words.harnessId === undefined ? words.title : nameOf(props.directory, words.harnessId);
  const main = words.mainAgentId;
  const roomId = words.roomId;
  return (
    <section className="join-arrived" data-testid="join-arrived">
      <Close onClose={props.onClose} testId="add-agent-close" />
      <div className="join-arrived-faces" aria-hidden="true">
        <span className="join-arrived-face">
          <Avatar name={name} kind="harness" size="lg" busy />
        </span>
        {main === undefined ? null : (
          <span className="join-arrived-agent">
            <Avatar
              name={nameOf(props.directory, main)}
              kind="agent"
              size="sm"
              icon={faceOf(props.directory, main)}
            />
          </span>
        )}
      </div>
      <h2 id={props.titleId}>{words.title}</h2>
      <p className="join-lede">{words.line}</p>
      <div className="harness-add-actions">
        <Button variant="ghost" data-testid="join-arrived-done" onClick={props.onClose}>
          Done
        </Button>
        {roomId === undefined ? null : (
          <Button
            variant="primary"
            data-testid="join-arrived-hello"
            onClick={() => {
              props.onOpen(roomId);
              props.onClose();
            }}
          >
            Say hello
          </Button>
        )}
      </div>
    </section>
  );
}

/** What it may do: the switches, or, folded, a row that opens them. */
function Switches(props: {
  readonly folded: boolean;
  readonly on: readonly string[];
  readonly disabled: boolean;
  readonly onFlip: (name: string, on: boolean) => void;
}) {
  const [open, setOpen] = useState(!props.folded);
  if (!open) {
    return (
      <button
        type="button"
        className="join-link"
        data-testid="join-switches-open"
        onClick={() => setOpen(true)}
      >
        What it may do
      </button>
    );
  }
  return (
    <fieldset className="join-switches compact">
      <legend className="join-label">It may</legend>
      {OFFERED.map((name) => (
        <CapabilityRow
          key={name}
          name={name}
          on={props.on.includes(name)}
          disabled={props.disabled}
          onChange={(on) => props.onFlip(name, on)}
          compact
        />
      ))}
    </fieldset>
  );
}

/**
 * A card's link: made as the page opens, allowed with what the card asks for (`linkStarts`), made
 * again on asking, and its grant changed by the switches until it is used.
 */
function useLink(
  listed: Connector | undefined,
  join: JoinService,
): {
  readonly made: { readonly id: string; readonly link: string } | undefined;
  readonly granted: readonly string[];
  readonly error: string | undefined;
  /** A new link, allowed with `capabilities`: the link, or nothing when it couldn't be made. */
  readonly makeLink: (capabilities: readonly string[]) => Promise<string | undefined>;
  readonly flip: (name: string, on: boolean) => Promise<void>;
} {
  const [made, setMade] = useState<{ id: string; link: string } | undefined>(undefined);
  const [granted, setGranted] = useState<readonly string[]>(() => linkStarts(listed));
  const [error, setError] = useState<string | undefined>(undefined);
  const making = useRef(false);
  const makeLink = async (capabilities: readonly string[]) => {
    if (making.current) return undefined;
    making.current = true;
    setError(undefined);
    try {
      const answer = await join.makeLink(capabilities);
      setMade({ id: answer.request.requestId, link: answer.link });
      return answer.link;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      return undefined;
    } finally {
      making.current = false;
    }
  };
  // The link is made as the page opens: the mock's card shows the line at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, as the page opens.
  useEffect(() => {
    void makeLink(granted);
  }, []);
  const flip = async (name: string, on: boolean) => {
    if (made === undefined) return;
    const next = toggled(granted, name, on);
    setGranted(next);
    try {
      await join.allow(made.id, next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return { made, granted, error, makeLink, flip };
}

/** A grant with one capability turned on or off. */
function toggled(granted: readonly string[], name: string, on: boolean): readonly string[] {
  return on ? [...granted, name] : granted.filter((each) => each !== name);
}

/** Whether the harness a link brought has said hello: the card's last step. */
function helloIn(
  request: JoinRequest | undefined,
  card: JoinCard | undefined,
): request is JoinRequest {
  return request !== undefined && card !== undefined && card.done >= 5;
}

/** Open its room, once the harness has one: by the agent's name when there is one to say. */
function OpenRoom(props: {
  readonly roomId: string | undefined;
  readonly name: string | undefined;
  readonly onOpen: (roomId: string) => void;
  /** The dialog's way out, taken once the room is open. */
  readonly onClose?: (() => void) | undefined;
}) {
  const { roomId } = props;
  return (
    <Button
      variant="primary"
      disabled={roomId === undefined}
      data-testid="join-open-room"
      onClick={() => {
        if (roomId === undefined) return;
        props.onOpen(roomId);
        props.onClose?.();
      }}
    >
      {props.name === undefined ? "Open its space" : `Open ${props.name}'s space`}
    </Button>
  );
}

/** A card that isn't a bridge's, or one of the app's two: its way in once its link is made. */
function ListedWay(props: {
  readonly way: Choice;
  readonly link: string | undefined;
  readonly error: string | undefined;
  readonly asking: boolean;
  readonly onAsking: (asking: boolean) => void;
  readonly onAdvanced?: (() => void) | undefined;
}) {
  if (props.link === undefined)
    return <p className="join-lede">{props.error ?? "Making a link…"}</p>;
  return (
    <WayIn
      way={props.way}
      link={props.link}
      asking={props.asking}
      onAsking={props.onAsking}
      onAdvanced={props.onAdvanced}
    />
  );
}

/** The way in for what was picked: a docs card's sentence or line, or one of the app's two. */
function WayIn(props: {
  readonly way: Choice;
  readonly link: string;
  readonly asking: boolean;
  readonly onAsking: (asking: boolean) => void;
  readonly onAdvanced?: (() => void) | undefined;
}) {
  if (typeof props.way === "string") {
    return <Commands way={props.way} link={props.link} onAdvanced={props.onAdvanced} />;
  }
  return (
    <CardCommands
      card={props.way}
      link={props.link}
      asking={props.asking}
      onAsking={props.onAsking}
    />
  );
}

/** The connect card's head: whose face, what to do with what's under it, and its ×. */
function ConnectHead(props: {
  readonly titleId: string;
  readonly way: Choice;
  readonly asking: boolean;
  readonly onClose?: (() => void) | undefined;
}) {
  const head = connectHead(props.way, props.asking);
  const close = props.onClose;
  // A bridge's card says what to do in its body, under the toggle: its own line goes here.
  const sub = fetchesBridge(props.way) ? props.way.line : head.sub;
  return (
    <div className="new-space-head">
      <Avatar name={head.name} kind="harness" icon={head.face} size="sm" />
      <div className="join-head">
        <h2 id={props.titleId}>{head.title}</h2>
        <small>{sub}</small>
      </div>
      {close !== undefined && <Close onClose={close} testId="add-agent-close" />}
    </div>
  );
}

/**
 * A docs card's way in: the sentence to say to the agent, so it connects itself, or the line to
 * run where it runs, each with the link in it.
 */
function CardCommands(props: {
  readonly card: Connector;
  readonly link: string;
  readonly asking: boolean;
  readonly onAsking: (asking: boolean) => void;
}) {
  const { card, link } = props;
  const said = sayOf(card, link, props.asking);
  return (
    <>
      {card.sentence !== undefined && card.command !== undefined && (
        <AskOrRun name={card.name} asking={props.asking} onAsking={props.onAsking} />
      )}
      <CopyBox
        text={said.text}
        testId={said.testId}
        block={said.kind === "command"}
        prose={said.kind === "sentence"}
      />
      <CardNote card={card} link={link} />
    </>
  );
}

/** The two ways a card with both can be brought in: say it, or run it. */
function AskOrRun(props: {
  readonly name: string;
  readonly asking: boolean;
  readonly onAsking: (asking: boolean) => void;
}) {
  return (
    <div className="join-seg" role="tablist" aria-label="How it connects">
      <button
        type="button"
        role="tab"
        aria-selected={props.asking}
        className={props.asking ? "on" : ""}
        data-testid="join-ask-tab"
        onClick={() => props.onAsking(true)}
      >
        Ask {props.name} to do it
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!props.asking}
        className={props.asking ? "" : "on"}
        data-testid="join-line-tab"
        onClick={() => props.onAsking(false)}
      >
        Run a line yourself
      </button>
    </div>
  );
}

/** Under a card's way in: how long the link lasts, what else it needs (core's), and its page. */
function CardNote(props: { readonly card: Connector; readonly link: string }) {
  const { card } = props;
  return (
    <p className="join-note">
      {connectNote(card, props.link)}
      {card.docs !== undefined && (
        <>
          {" "}
          <a href={card.docs} target="_blank" rel="noreferrer">
            Its page
          </a>
        </>
      )}
    </p>
  );
}

/** The line to run, for each way, and the note under it. */
function Commands(props: {
  readonly way: Way;
  readonly link: string;
  readonly onAdvanced?: (() => void) | undefined;
}) {
  const [shell, setShell] = useState(false);
  const note = connectNote(props.way, props.link);
  if (props.way === "own") {
    return (
      <>
        <div className="join-seg" role="tablist" aria-label="Where it runs">
          <button
            type="button"
            role="tab"
            aria-selected={!shell}
            className={shell ? "" : "on"}
            onClick={() => setShell(false)}
          >
            In code
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={shell}
            className={shell ? "on" : ""}
            data-testid="join-shell-tab"
            onClick={() => setShell(true)}
          >
            In any language
          </button>
        </div>
        {shell ? (
          <CopyBox text={shellLine(props.link)} testId="join-shell" />
        ) : (
          <CopyBox text={sdkLines(props.link)} testId="join-sdk" block />
        )}
        <p className="join-note">
          {shell ? "Its address, id, key and space, in the environment. " : ""}
          {note}
        </p>
      </>
    );
  }
  return (
    <>
      <CopyBox text={curlRedeem(props.link)} testId="join-curl" block />
      <p className="join-note">{note}</p>
      {props.onAdvanced !== undefined && (
        <button
          type="button"
          className="join-link"
          data-testid="join-advanced"
          onClick={props.onAdvanced}
        >
          Advanced: make a key here instead
        </button>
      )}
    </>
  );
}

/**
 * Something asks to join: who, from where, the code to compare, what it asks to do, and Allow or
 * Don't allow. Once allowed, the same dialog follows it to its hello.
 */
export function JoinRequestDialog(props: {
  readonly request: JoinRequest;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  /** What the workspace is called, for an invite's request into no room (ADR 0232). */
  readonly workspaceName?: string | undefined;
  readonly join: JoinService;
  readonly onOpen: (spaceId: string) => void;
  readonly onClosed: () => void;
}) {
  const { request } = props;
  const words = linkWordsOf(request, props);
  const titleId = useId();
  const nowMs = useNow(1000);
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [decided, setDecided] = useState(false);
  const [granted, setGranted] = useState<readonly string[]>(request.wants);
  // For a device: the code it shows, typed here (SEC-6).
  const [code, setCode] = useState("");
  const device = request.kind === "device";
  const { choices, as, setAs } = usePairAs(request, props.model, props.directory, props.selfId);
  const name = request.name ?? (device ? "A device" : "A harness");
  const where = [request.software, request.machine, request.fromAddr].filter(
    (each) => each !== undefined,
  );
  const decide = async (allow: boolean) => {
    setBusy(true);
    setError(undefined);
    try {
      if (allow) await props.join.allow(...allowArgs(request, granted, code, as, props.selfId));
      else await props.join.deny(request.requestId);
      setDecided(true);
      if (!allow) setLeaving(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const elsewhere = !decided && request.state !== "waiting";
  return (
    <GrowingDialog
      from={null}
      labelledBy={titleId}
      className="harness-dialog"
      testId="join-request-dialog"
      focus={device ? "[data-testid=join-code-field]" : "[data-testid=join-allow]"}
      leaving={leaving}
      onLeave={() => setLeaving(true)}
      onGone={props.onClosed}
    >
      <div className="harness-dialog-card join-ask">
        <div className="join-ask-head">
          <Avatar name={name} kind={request.kind === "harness" ? "harness" : "person"} size="lg" />
          <h2 id={titleId}>
            {words?.title ?? `${name} wants to ${request.kind === "device" ? "pair" : "join"}`}
          </h2>
          {words !== undefined ? (
            <small data-testid="join-line">{words.line}</small>
          ) : (
            where.length > 0 && <small>{where.join(" · ")}</small>
          )}
          <Close onClose={() => setLeaving(true)} testId="join-request-close" />
        </div>
        {decided || elsewhere ? (
          <AfterDecision
            request={request}
            model={props.model}
            directory={props.directory}
            selfId={props.selfId}
            nowMs={nowMs}
            onOpen={(spaceId) => {
              props.onOpen(spaceId);
              setLeaving(true);
            }}
            onDone={() => setLeaving(true)}
          />
        ) : (
          <Ask
            request={request}
            name={name}
            words={words}
            granted={granted}
            code={code}
            busy={busy}
            error={error}
            onGrant={setGranted}
            onCode={setCode}
            onDecide={(allow) => void decide(allow)}
            choices={choices}
            as={as}
            onAs={setAs}
          />
        )}
      </div>
    </GrowingDialog>
  );
}

/** A link's request in words: who asks to join what, and the six digits to compare (ADR 0232). */
function linkWordsOf(
  request: JoinRequest,
  where: {
    readonly model: WorkspaceModel;
    readonly directory: Directory;
    readonly workspaceName?: string | undefined;
  },
): LinkAskWords | undefined {
  if (!isLinkKind(request.kind)) return undefined;
  return linkAskWords(request, {
    spaces: where.model.spaces,
    workspaceName: where.workspaceName,
    pairAsName: request.pairAs === undefined ? undefined : nameOf(where.directory, request.pairAs),
  });
}

/**
 * Whom a device that asks may be paired as (ADR 0206): this person, picked, and for an owner
 * everybody else here too, for somebody whose phone is new. Nothing to pick for a harness.
 */
function usePairAs(
  request: JoinRequest,
  model: WorkspaceModel,
  directory: Directory,
  selfId: string,
) {
  const choices = request.kind === "device" ? pairAsChoices(model, directory, selfId) : [];
  const [as, setAs] = useState(selfId);
  return { choices, as, setAs };
}

/**
 * The question itself: a harness's code to compare, or a device's to type (SEC-6), the switches,
 * Allow or Don't allow. Allow waits for a device's code to be a code.
 */
function Ask(props: {
  readonly request: JoinRequest;
  readonly name: string;
  /** A link's request (ADR 0232): its code is shown to compare, not typed. */
  readonly words?: LinkAskWords | undefined;
  readonly granted: readonly string[];
  readonly code: string;
  readonly busy: boolean;
  readonly error: string | undefined;
  readonly onGrant: (granted: readonly string[]) => void;
  readonly onCode: (code: string) => void;
  readonly onDecide: (allow: boolean) => void;
  /** Whom a device may be paired as: the one deciding first; more than one only for an owner. */
  readonly choices: readonly PairAsChoice[];
  readonly as: string;
  readonly onAs: (id: string) => void;
}) {
  const { request, granted } = props;
  const switches = switchesFor(request);
  const device = request.kind === "device";
  const ready = !device || pairingCode.safeParse(pairingCodeTyped(props.code)).success;
  return (
    <>
      {props.words !== undefined ? (
        <>
          <p className="join-label center">{props.words.shows}</p>
          <div className="join-code" data-testid="join-code">
            {props.words.code}
          </div>
          <p className="join-note center" data-testid="join-check">
            {props.words.check}
          </p>
        </>
      ) : device ? (
        <>
          <input
            className="join-code join-code-field"
            data-testid="join-code-field"
            aria-label="The code on the device"
            value={props.code}
            onChange={(event) => props.onCode(event.target.value)}
            placeholder="ABC-234"
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={7}
            disabled={props.busy}
          />
          <p className="join-note center">Type the code {props.name} shows.</p>
        </>
      ) : (
        <>
          <div className="join-code" data-testid="join-code">
            {request.code}
          </div>
          <p className="join-note center">Check it matches the code {props.name} printed.</p>
        </>
      )}
      {switches.length > 0 && (
        <fieldset className="join-switches">
          <legend className="join-label">It asks to</legend>
          {switches.map((each) => (
            <CapabilityRow
              key={each.name}
              name={each.name}
              on={granted.includes(each.name)}
              disabled={props.busy}
              onChange={(on) =>
                props.onGrant(on ? [...granted, each.name] : granted.filter((g) => g !== each.name))
              }
            />
          ))}
        </fieldset>
      )}
      {props.choices.length > 1 && (
        <fieldset className="join-switches" data-testid="join-pair-as">
          <legend className="join-label">Pair it as</legend>
          {props.choices.map((each) => (
            <label key={each.id} className="join-switch join-as">
              <span className="join-as-face" aria-hidden="true">
                <Avatar name={each.name} kind="person" size="xs" />
              </span>
              <span>
                <b>{each.label}</b>
              </span>
              <input
                type="radio"
                name={`pair-as-${request.requestId}`}
                checked={each.id === props.as}
                disabled={props.busy}
                onChange={() => props.onAs(each.id)}
              />
            </label>
          ))}
        </fieldset>
      )}
      {props.words === undefined && (
        <p className="join-note" data-testid="join-paired-words">
          {device
            ? pairedAsWords(props.choices, props.as)
            : "Every agent can talk in the spaces it's in, and asks you before anything risky."}
        </p>
      )}
      {props.error !== undefined && (
        <p className="harness-add-error" role="alert">
          {props.error}
        </p>
      )}
      <div className="join-decide">
        <button
          type="button"
          className="join-allow"
          data-testid="join-allow"
          disabled={props.busy || !ready}
          onClick={() => props.onDecide(true)}
        >
          Allow
        </button>
        <button
          type="button"
          className="join-deny"
          data-testid="join-deny"
          disabled={props.busy}
          onClick={() => props.onDecide(false)}
        >
          Don't allow
        </button>
      </div>
    </>
  );
}

/** After Allow: the card that follows it, or what was decided elsewhere. */
function AfterDecision(props: {
  readonly request: JoinRequest;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly nowMs: number;
  readonly onOpen: (spaceId: string) => void;
  readonly onDone: () => void;
}): ReactNode {
  const { request } = props;
  const card = cardOf(request, props.model, props.directory, props.nowMs);
  return (
    <>
      {request.kind === "harness" ? (
        <JoinProgress
          request={request}
          card={card}
          selfId={props.selfId}
          directory={props.directory}
        />
      ) : (
        <p className="join-note center" data-testid="join-device-state">
          {deviceState(request, props.directory, card)}
        </p>
      )}
      <div className="harness-add-actions">
        {request.kind === "harness" && request.spaceId !== undefined && (
          <Button variant="ghost" onClick={() => props.onOpen(request.spaceId ?? "")}>
            Open its space
          </Button>
        )}
        <Button variant="primary" onClick={props.onDone}>
          Done
        </Button>
      </div>
    </>
  );
}

/** Where a device's request, or a link's (ADR 0232), stands once decided, in a line. */
function deviceState(request: JoinRequest, directory: Directory, card: JoinCard): string {
  if (request.state === "redeemed") {
    if (request.kind === "invite") return "Joined.";
    return request.pairAs === undefined
      ? "Paired."
      : `Paired as ${nameOf(directory, request.pairAs)}.`;
  }
  if (request.state === "allowed") {
    return request.kind === "invite"
      ? "Allowed. They're on the way in."
      : "Allowed. It is collecting its key.";
  }
  return stallWords(card.stall ?? { kind: "expired" }).says;
}

/** The request a person is asked about next, if they may decide (core's `nextJoinAsk`). */
export function nextAsk(
  joins: ReadonlyMap<string, JoinRequest> | undefined,
  shown: ReadonlySet<string>,
  model: WorkspaceModel,
  selfId: string,
): JoinRequest | undefined {
  return nextJoinAsk(joins, shown, administers(myRole(model, selfId)));
}
