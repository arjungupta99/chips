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
  ALLOW_WORDS,
  administers,
  allowArgs,
  arrivalWords,
  askingName,
  askingTitle,
  CANCEL_LINK,
  CONNECT_WAY_ORDER,
  CONNECT_WAYS,
  CONNECT_WHERE,
  type ConnectChoice,
  type ConnectWay,
  type ConnectWhere,
  capabilityWords,
  choiceKey,
  codeWords,
  connectedHereLine,
  connectHead,
  connectNote,
  curlRedeem,
  type Directory,
  decidedWords,
  faceOf,
  fetchesBridge,
  foundFirst,
  GALLERY_LEDE,
  hereAlreadyWords,
  isFoundHere,
  type JoinCard,
  type JoinRequest,
  joinCardOf,
  kindWords,
  type LinkAskWords,
  linkAskWords,
  linkStarts,
  mayAskFromPage,
  myRole,
  NO_AGENT_YET,
  nameOf,
  nextJoinAsk,
  OFFERED,
  ownWayHeading,
  type PairAsChoice,
  pairAsChoices,
  pairedAsWords,
  sayOf,
  sdkLines,
  shellLine,
  startAnswers,
  switchesFor,
  type WorkspaceModel,
} from "@chipschat/core";
import { type Connector, isLinkKind, pairingCode, pairingCodeTyped } from "@chipschat/protocol";
import { Avatar, Button, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  BridgeWays,
  CardLinks,
  type ConnectHere,
  CopyBox,
  LinkSteps,
  useConnectHere,
} from "./ConnectBridge.tsx";
import { useFoundHere } from "./firstRun.ts";
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
 * The docs' cards, then the two the app carries under "Or build your own", as the phone's gallery
 * (ADR 0190, 0271). Choosing one makes its link. With no docs to read, it is the two, under "Build
 * your own". A card for a harness here already says so, and that picking it offers another or a
 * new agent.
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
  /** The card whose page stands beside it, by `choiceKey` (ADR 0284's addendum): it is chosen. */
  readonly chosen?: string | undefined;
  /**
   * I don't have one yet, after the docs' cards, where some card has written steps (ADR 0290).
   * Absent, there is no such row.
   */
  readonly onNone?: (() => void) | undefined;
}) {
  const { found, order } = useFoundHere(props.cards);
  const cards = foundFirst(props.cards ?? [], order);
  const none = props.onNone !== undefined && startAnswers(props.cards).length > 0;
  const chosen = (choice: Choice) =>
    choiceKey(choice) === props.chosen
      ? ({ "data-chosen": "true", "aria-current": "page" } as const)
      : undefined;
  return (
    <section className="join-gallery" data-testid="join-gallery">
      <div className="new-space-head">
        <h2 id={props.titleId}>{props.title ?? "Connect a harness"}</h2>
        {props.onClose !== undefined && <Close onClose={props.onClose} testId="add-agent-close" />}
      </div>
      <p className="join-lede">{props.lede ?? GALLERY_LEDE}</p>
      {cards.length > 0 && (
        <div className="join-cards">
          {cards.map((card) => {
            const kind = kindWords(card);
            const here = props.connected?.has(card.name.toLowerCase()) === true;
            return (
              <button
                type="button"
                key={card.id}
                className="join-card"
                data-testid={`join-card-${card.id}`}
                {...chosen(card)}
                onClick={() => props.onPick(card)}
              >
                <Avatar name={card.name} kind="harness" size="sm" />
                <b>
                  {card.name}{" "}
                  {here ? (
                    <span className="join-kind here">Connected</span>
                  ) : isFoundHere(card, found) ? (
                    <span className="join-kind one found">{CONNECT_WHERE.here}</span>
                  ) : (
                    <span className={kind.one ? "join-kind one" : "join-kind"}>{kind.words}</span>
                  )}
                </b>
                <small>{here ? connectedHereLine("Click") : card.line}</small>
              </button>
            );
          })}
          {none && (
            <button
              type="button"
              className="join-card none"
              data-testid="join-none"
              onClick={props.onNone}
            >
              <Avatar name={NO_AGENT_YET.name} kind="harness" icon={NO_AGENT_YET.face} size="sm" />
              <b>{NO_AGENT_YET.name}</b>
              <small>{NO_AGENT_YET.sub}</small>
              <Icon name="next" size={14} className="join-card-go" />
            </button>
          )}
        </div>
      )}
      <h3 className="agents-h">{ownWayHeading(cards.length)}</h3>
      <div className="join-cards">
        {CONNECT_WAY_ORDER.map((way) => (
          <button
            type="button"
            key={way}
            className="join-card"
            data-testid={`join-way-${way}`}
            {...chosen(way)}
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
 * The Agents page of a workspace with no harness and no agent yet (ADR 0261): the gallery the
 * dialog opens, on the page itself, each docs card saying what has to be on the computer first.
 * Choosing one opens the dialog at that card's link, grown out of the card. The two ways the app
 * carries are for whoever writes their own, so they stand in the line under the cards; with no docs
 * to read, they are the cards.
 */
export function PageGallery(props: {
  readonly cards?: readonly Connector[] | undefined;
  readonly onPick: (choice: Choice, from: HTMLElement) => void;
}) {
  const titleId = useId();
  const { found, order } = useFoundHere(props.cards);
  const cards = foundFirst(props.cards ?? [], order);
  const pick = (choice: Choice) => (event: { readonly currentTarget: HTMLElement }) =>
    props.onPick(choice, event.currentTarget);
  return (
    <section className="page-gallery" aria-labelledby={titleId} data-testid="page-gallery">
      <h2 id={titleId}>Connect a harness to bring in your agents</h2>
      <p className="page-gallery-lede">
        {cards.length > 0
          ? "A harness is the program your agents run in, on this computer or another one. Each one here connects with one command in Terminal, and its agents show on this page once it has."
          : "A harness is the program your agents run in, on this computer or another one. Its agents show on this page once it connects."}
      </p>
      <ul className="page-gallery-cards">
        {cards.map((card) => (
          <li key={card.id}>
            <button
              type="button"
              className="page-gallery-card"
              aria-label={`Connect ${card.name}`}
              data-testid={`page-card-${card.id}`}
              onClick={pick(card)}
            >
              <span className="page-gallery-name">
                <Avatar name={card.name} kind="harness" size="sm" />
                <b>{card.name}</b>
                {isFoundHere(card, found) && (
                  <span className="join-kind one found">{CONNECT_WHERE.here}</span>
                )}
              </span>
              <span className="page-gallery-line">{card.line}</span>
              {card.needs !== undefined && (
                <span className="page-gallery-needs">{`You need ${card.needs}`}</span>
              )}
              <span className="page-gallery-go" aria-hidden="true">
                Connect
              </span>
            </button>
          </li>
        ))}
        {cards.length === 0 &&
          CONNECT_WAY_ORDER.map((way) => (
            <li key={way}>
              <button
                type="button"
                className="page-gallery-card"
                aria-label={`Connect ${CONNECT_WAYS[way].name}`}
                data-testid={`page-way-${way}`}
                onClick={pick(way)}
              >
                <span className="page-gallery-name">
                  <Avatar
                    name={CONNECT_WAYS[way].name}
                    kind="harness"
                    icon={CONNECT_WAYS[way].face}
                    size="sm"
                  />
                  <b>{CONNECT_WAYS[way].name}</b>
                </span>
                <span className="page-gallery-line">{CONNECT_WAYS[way].sub}</span>
                <span className="page-gallery-go" aria-hidden="true">
                  Connect
                </span>
              </button>
            </li>
          ))}
      </ul>
      {cards.length > 0 && (
        <p className="page-gallery-foot">
          If you're writing your own, start from{" "}
          <button
            type="button"
            className="page-gallery-way"
            data-testid="page-way-own"
            onClick={pick("own")}
          >
            {CONNECT_WAYS.own.name}
          </button>{" "}
          or{" "}
          <button
            type="button"
            className="page-gallery-way"
            data-testid="page-way-http"
            onClick={pick("http")}
          >
            {CONNECT_WAYS.http.name}
          </button>
          .
        </p>
      )}
    </section>
  );
}

/**
 * A card for a harness here already, as the phone's asks first (ADR 0190, point 1): a second link
 * makes a second harness, so none is made until another is asked for. Whoever may ask it for an
 * agent has New agent, as the phone's card has, which opens its page with the dialog up (ADR
 * 0271); the one here is put right from its page.
 */
export function HereAlready(props: {
  readonly titleId: string;
  readonly card: Connector;
  readonly harnessId: string;
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly selfId: string;
  readonly onAnother: () => void;
  /** Back to the gallery. Absent, there is none: beside the list the gallery stands beside it. */
  readonly onBack?: (() => void) | undefined;
  /** Its page on the Agents tab. Absent, there is no way there from here. */
  readonly onOpenHarness?: ((harnessId: string) => void) | undefined;
  /** Its page with New agent open, for whoever may ask it for one. Absent, there is none. */
  readonly onNewAgent?: ((harnessId: string) => void) | undefined;
  readonly onClose?: (() => void) | undefined;
}) {
  const { card, harnessId } = props;
  const newAgent = props.onNewAgent;
  const mayAsk =
    newAgent !== undefined && mayAskFromPage(props.model, props.directory, props.selfId, harnessId);
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
        {props.onBack !== undefined && (
          <button
            type="button"
            className="join-link"
            data-testid="join-here-back"
            onClick={props.onBack}
          >
            Back
          </button>
        )}
        <Button data-testid="join-here-another" onClick={props.onAnother}>
          {words.another}
        </Button>
        {open !== undefined && (
          <Button
            variant={mayAsk ? "default" : "primary"}
            data-testid="join-here-page"
            onClick={() => open(harnessId)}
          >
            Open its page
          </Button>
        )}
        {mayAsk && (
          <Button
            variant="primary"
            data-testid="join-here-new-agent"
            onClick={() => newAgent?.(harnessId)}
          >
            <Icon name="plus" size={14} />
            {words.newAgent}
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * A switch row: what it may do, and the line under it. The harness's page draws them too. In the
 * connect card's two columns there is no room for the line, so its short sentence shows when the
 * pointer rests on the row or the keyboard is on its switch (ADR 0257).
 */
export function CapabilityRow(props: {
  readonly name: string;
  readonly on: boolean;
  readonly disabled: boolean;
  readonly onChange: (on: boolean) => void;
  /** The label alone, for the connect card's two columns. */
  readonly compact?: boolean;
}) {
  const words = capabilityWords(props.name);
  const tipId = useId();
  const tip = props.compact === true ? words.hint : undefined;
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
        describedBy={tip === undefined ? undefined : tipId}
      />
      {tip === undefined ? null : (
        <span className="join-tip" role="tooltip" id={tipId}>
          {tip}
        </span>
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
  /**
   * The link this card made before the dialog was put away, while it waits (ADR 0271): the card
   * opens on it rather than making another. With `onKept`, told each link the card makes.
   */
  readonly kept?: KeptLink | undefined;
  readonly onKept?: ((kept: KeptLink) => void) | undefined;
}) {
  const listed = typeof props.way === "string" ? undefined : props.way;
  const bridge = fetchesBridge(props.way) ? props.way : undefined;
  // A card that has a sentence opens on it: saying one sentence is less than running a line.
  const [asking, setAsking] = useState(listed?.sentence !== undefined);
  const { made, granted, error, makeLink, flip } = useLink(
    props.way,
    props.join,
    props.kept,
    props.onKept,
  );
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
          way={props.way}
          nowMs={nowMs}
          listed={listed}
          bridge={bridge !== undefined}
          onThisMac={onThisMac}
          request={request}
          card={card}
          error={made === undefined ? undefined : error}
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
 * Under a card's way in: the link followed in the phone's three steps from the first frame (a
 * bridge's card draws its own, ADR 0271), what went wrong, and the ways out: the welcome's, Cancel
 * link while the link waits, and its room.
 */
function ConnectFoot(props: {
  readonly way: Choice;
  readonly nowMs: number;
  readonly listed: Connector | undefined;
  readonly bridge: boolean;
  readonly onThisMac: boolean;
  readonly request: JoinRequest | undefined;
  readonly card: JoinCard | undefined;
  readonly error: string | undefined;
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
      {!props.bridge && (
        <LinkSteps
          choice={props.way}
          request={request}
          joinCard={card}
          nowMs={props.nowMs}
          testId="join-steps"
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
  way: Choice,
  join: JoinService,
  kept: KeptLink | undefined,
  onKept: ((kept: KeptLink) => void) | undefined,
): {
  readonly made: { readonly id: string; readonly link: string } | undefined;
  readonly granted: readonly string[];
  readonly error: string | undefined;
  /** A new link, allowed with `capabilities`: the link, or nothing when it couldn't be made. */
  readonly makeLink: (capabilities: readonly string[]) => Promise<string | undefined>;
  readonly flip: (name: string, on: boolean) => Promise<void>;
} {
  // A link this card made before the dialog was put away is its link again (ADR 0271).
  const [held] = useState(() =>
    kept !== undefined && choiceKey(kept.choice) === choiceKey(way) ? kept : undefined,
  );
  const [made, setMade] = useState<{ id: string; link: string } | undefined>(held);
  const [granted, setGranted] = useState<readonly string[]>(
    () => held?.granted ?? linkStarts(typeof way === "string" ? undefined : way),
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const making = useRef(false);
  const makeLink = async (capabilities: readonly string[]) => {
    if (making.current) return undefined;
    making.current = true;
    setError(undefined);
    try {
      const answer = await join.makeLink(capabilities);
      setMade({ id: answer.request.requestId, link: answer.link });
      onKept?.({
        id: answer.request.requestId,
        link: answer.link,
        choice: way,
        granted: capabilities,
      });
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
    if (held === undefined) void makeLink(granted);
  }, []);
  const flip = async (name: string, on: boolean) => {
    if (made === undefined) return;
    const next = toggled(granted, name, on);
    setGranted(next);
    onKept?.({ ...made, choice: way, granted: next });
    try {
      await join.allow(made.id, next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  return { made, granted, error, makeLink, flip };
}

/**
 * A link a card made, kept above the dialog while it waits to be used (ADR 0271), as the phone keeps
 * it: put away, the dialog leaves it working, the shelf's last tile counts it down, and the card
 * opens on it again with what it was allowed.
 */
export interface KeptLink {
  readonly id: string;
  readonly link: string;
  readonly choice: Choice;
  readonly granted: readonly string[];
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
        run={said.kind === "command"}
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
      <CardLinks card={card} />
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
      <CopyBox text={curlRedeem(props.link)} testId="join-curl" block run />
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
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [decided, setDecided] = useState(false);
  const [granted, setGranted] = useState<readonly string[]>(request.wants);
  // For a device: the code it shows, typed here (SEC-6).
  const [code, setCode] = useState("");
  const device = request.kind === "device";
  const { choices, as, setAs } = usePairAs(request, props.model, props.directory, props.selfId);
  const name = askingName(request);
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
          <h2 id={titleId}>{words?.title ?? askingTitle(request, name)}</h2>
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
            name={name}
            directory={props.directory}
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
            aria-label={ALLOW_WORDS.codeLabel}
            value={props.code}
            onChange={(event) => props.onCode(event.target.value)}
            placeholder={ALLOW_WORDS.codePlaceholder}
            autoCapitalize="characters"
            autoComplete="one-time-code"
            spellCheck={false}
            maxLength={7}
            disabled={props.busy}
          />
          <p className="join-note center">{codeWords(props.name, true)}</p>
        </>
      ) : (
        <>
          <div className="join-code" data-testid="join-code">
            {request.code}
          </div>
          <p className="join-note center">{codeWords(props.name, false)}</p>
        </>
      )}
      {switches.length > 0 && (
        <fieldset className="join-switches">
          <legend className="join-label">{ALLOW_WORDS.asksTo}</legend>
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
          <legend className="join-label">{ALLOW_WORDS.pairAs}</legend>
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
          {device ? pairedAsWords(props.choices, props.as) : ALLOW_WORDS.agentsNote}
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
          {ALLOW_WORDS.allow}
        </button>
        <button
          type="button"
          className="join-deny"
          data-testid="join-deny"
          disabled={props.busy}
          onClick={() => props.onDecide(false)}
        >
          {ALLOW_WORDS.deny}
        </button>
      </div>
    </>
  );
}

/**
 * Once decided, here or elsewhere: the phone's words (core's `decidedWords`, ADR 0271), a tick and
 * who joined, or that it was allowed and is on its way, or that it was refused or ran out. Done
 * puts it away; a harness's space opens from here once it has one.
 */
function AfterDecision(props: {
  readonly request: JoinRequest;
  readonly name: string;
  readonly directory: Directory;
  readonly onOpen: (spaceId: string) => void;
  readonly onDone: () => void;
}): ReactNode {
  const { request } = props;
  const pairedAs =
    request.pairAs === undefined ? undefined : nameOf(props.directory, request.pairAs);
  const words = decidedWords(request, props.name, pairedAs);
  return (
    <>
      <div className="join-decided" data-testid="join-decided" aria-live="polite">
        {words.ok && (
          <span className="join-decided-tick" aria-hidden="true">
            ✓
          </span>
        )}
        <b className="join-decided-title">{words.title}</b>
        <span className="join-decided-line">{words.line}</span>
      </div>
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

/** The request a person is asked about next, if they may decide (core's `nextJoinAsk`). */
export function nextAsk(
  joins: ReadonlyMap<string, JoinRequest> | undefined,
  shown: ReadonlySet<string>,
  model: WorkspaceModel,
  selfId: string,
): JoinRequest | undefined {
  return nextJoinAsk(joins, shown, administers(myRole(model, selfId)));
}
