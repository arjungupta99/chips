/**
 * A bridge's card (ADR 0218, phase 5): its line, `chips connect <id> '{link}'`, fetches the
 * harness's bridge from npm. Built to the mock's three boards.
 *
 * - **On this Mac.** Chips for Mac carries `chips`, so it runs the line itself. The four steps of
 *   `chips connect <id> --json` stand on their line from the first frame, under What Connect does,
 *   so the dialog never changes height (ADR 0190) and nothing reads as a row to pick (ADR 0257);
 *   Connect runs them, each in the bridge's own words where it gives some. Where the bridge stops,
 *   the step stops in amber, its words say what to do, any line to run says Run in Terminal, and
 *   Try again runs the same line with the same link while it is still good.
 * - **On another computer.** The installer's line, which installs Chips there when it isn't, then
 *   connects; the link followed in the phone's three steps, counting its minutes down.
 *
 * In a browser, and in a shell that carries no `chips`, there is only the other computer.
 */

import {
  alreadyThere,
  CONNECT_WHERE,
  type ConnectChoice,
  type ConnectStep,
  type ConnectWhere,
  connectHead,
  connectingName,
  connectNote,
  connectSteps,
  type HereLine,
  type HereStep,
  type HereStop,
  hereButton,
  hereLine,
  hereNote,
  hereSentence,
  hereSteps,
  type JoinCard,
  type JoinRequest,
  type JoinStall,
  LINK_REMADE,
  makingSteps,
  RUN_IN_TERMINAL,
  STEPS_LABEL,
  sayOf,
  stallWords,
  stillWorks,
} from "@chipschat/core";
import type { Connector } from "@chipschat/protocol";
import { Button } from "@chipschat/ui";
import { Fragment, useEffect, useRef, useState } from "react";
import { type ConnectingHere, type Desktop, desktop } from "../native.ts";

/** The shell's way to run a card's line here. */
export type ConnectHere = NonNullable<Desktop["connectHere"]>;

/** After a card's note: its page in the docs, and its maker's terms (ADR 0288). */
export function CardLinks(props: { readonly card: Connector }) {
  const links = [
    ["Its page", props.card.docs],
    ["Its terms", props.card.terms],
  ] as const;
  return links.map(([words, href]) =>
    href === undefined ? null : (
      <Fragment key={words}>
        {" "}
        <a href={href} target="_blank" rel="noreferrer">
          {words}
        </a>
      </Fragment>
    ),
  );
}

/**
 * The shell's way to connect here, once it has said it carries `chips`: nothing in a browser.
 * `given` is a test's: a function to use, or `null` for none.
 */
export function useConnectHere(given: ConnectHere | null | undefined): ConnectHere | undefined {
  const [found, setFound] = useState<ConnectHere | undefined>(undefined);
  useEffect(() => {
    if (given !== undefined) return;
    let live = true;
    void desktop()
      .then(async (shell) => {
        const connect = shell?.connectHere;
        const carries = (await shell?.canRunHere?.()) ?? false;
        if (live && connect !== undefined && carries) setFound(() => connect);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [given]);
  return given === null ? undefined : (given ?? found);
}

/**
 * A box of text with a Copy button that says so for a moment. A line to run says Run in Terminal
 * over it, with Copy at the end of those words (ADR 0257).
 */
export function CopyBox(props: {
  readonly text: string;
  readonly testId: string;
  readonly block?: boolean;
  /** Words to say rather than a line to run: set as the page's text, not as code. */
  readonly prose?: boolean;
  /** A line the person runs in a terminal. */
  readonly run?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = (
    <button
      type="button"
      className="join-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(props.text).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
  const className = [
    "join-cmd",
    props.block === true && "block",
    props.prose === true && "prose",
    props.run === true && "run",
  ]
    .filter(Boolean)
    .join(" ");
  if (props.run === true) {
    return (
      <div className={className}>
        <div className="join-run" data-testid={`${props.testId}-run`}>
          <span className="join-run-mark" aria-hidden="true">
            {">_"}
          </span>
          <span>{RUN_IN_TERMINAL}</span>
          {copy}
        </div>
        <code data-testid={props.testId}>{props.text}</code>
      </div>
    );
  }
  return (
    <div className={className}>
      <code data-testid={props.testId}>{props.text}</code>
      {copy}
    </div>
  );
}

/** On this Mac, or on another computer: the two places a bridge's card runs, on Chips for Mac. */
export function WhereTabs(props: {
  readonly name: string;
  readonly where: ConnectWhere;
  readonly onWhere: (where: ConnectWhere) => void;
}) {
  return (
    <div className="join-seg" role="tablist" aria-label={`Where ${props.name} runs`}>
      {(["here", "another"] as const).map((where) => (
        <button
          key={where}
          type="button"
          role="tab"
          aria-selected={props.where === where}
          className={props.where === where ? "on" : ""}
          data-testid={`join-where-${where}`}
          onClick={() => props.onWhere(where)}
        >
          {CONNECT_WHERE[where]}
        </button>
      ))}
    </div>
  );
}

/**
 * Steps as the mock draws them (ADR 0257): under a label that says what they are, each on one line
 * with a mark (done, under way, stopped, to come), the step, and a line of its own. No box and no
 * rules, so they read as what will happen, not rows to pick.
 */
function StepList(props: {
  readonly label: string;
  readonly steps: readonly (HereStep | ConnectStep)[];
  readonly testId: string;
}) {
  return (
    <div className="join-steps-group">
      <span className="join-label" aria-hidden="true">
        {props.label}
      </span>
      <ol className="join-steps" aria-label={props.label} data-testid={props.testId}>
        {props.steps.map((step) => (
          <li
            key={step.key}
            className={step.state}
            data-testid={`${props.testId}-${step.key}`}
            data-state={step.state}
          >
            <i aria-hidden="true">
              {step.state === "done" ? "✓" : step.state === "stopped" ? "!" : ""}
            </i>
            <span>
              <b>{step.label}</b>
              <small>{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The link followed in the phone's three steps, from the page's first frame (core's `makingSteps`,
 * then `connectSteps`), and where it stopped, named as the card names it. A bridge's card on
 * another computer and every other card draw it alike (ADR 0257, 0271).
 */
export function LinkSteps(props: {
  readonly choice: ConnectChoice;
  readonly request: JoinRequest | undefined;
  readonly joinCard: JoinCard | undefined;
  readonly nowMs: number;
  readonly testId: string;
  readonly onRenew: () => void;
}) {
  const { request, joinCard } = props;
  const name = connectingName(request, props.choice);
  const steps =
    request === undefined || joinCard === undefined
      ? makingSteps(name)
      : connectSteps(request, joinCard, name, props.nowMs);
  return (
    <>
      <StepList label={STEPS_LABEL.another} steps={steps} testId={props.testId} />
      {joinCard?.stall === undefined ? null : (
        <StallBox stall={joinCard.stall} name={name} testId="join-stall" onRenew={props.onRenew} />
      )}
    </>
  );
}

/** Where the bridge stopped: its sentence, what to do, and the line it gives to copy. */
function StopBox(props: { readonly stop: HereStop }) {
  const { stop } = props;
  return (
    <div className="join-fix" role="status" data-testid="join-here-stop">
      <b>{stop.says}</b>
      {stop.doing === undefined ? null : <p>{stop.doing}</p>}
      {stop.copy === undefined ? null : (
        <CopyBox text={stop.copy} testId="join-here-copy" run={stop.run} />
      )}
    </div>
  );
}

/**
 * Where the link's card has stopped (core's `stallWords`): what happened, and the one thing to do,
 * a button where that is a new link.
 */
function StallBox(props: {
  readonly stall: JoinStall;
  readonly name: string | undefined;
  readonly testId: string;
  readonly onRenew: () => void;
}) {
  const words = stallWords(props.stall, props.name);
  const renews = ["expired", "denied", "revoked"].includes(props.stall.kind);
  return (
    <div className="join-stall" role="status" data-testid={props.testId}>
      <b>{words.says}</b>
      {renews ? (
        <button type="button" className="join-link" onClick={props.onRenew}>
          {words.doing}
        </button>
      ) : (
        <span>{words.doing}.</span>
      )}
    </div>
  );
}

/**
 * A run of the card's line here: its lines as they come, folded into the four steps, and how to
 * start it, with the page's link or, once that has run out, a new one. Closed while it runs, what
 * it started is stopped.
 */
function useHereRun(
  card: Connector,
  connect: ConnectHere,
  link: string | undefined,
  spent: boolean,
  onNewLink: () => Promise<string | undefined>,
) {
  const [lines, setLines] = useState<readonly HereLine[]>([]);
  const [running, setRunning] = useState(false);
  const run = useRef<ConnectingHere | undefined>(undefined);
  useEffect(
    () => () => {
      void run.current?.cancel().catch(() => undefined);
    },
    [],
  );
  const heard = (text: string) => {
    const line = hereLine(text);
    if (line !== undefined) setLines((before) => [...before, line]);
  };
  const start = async () => {
    setRunning(true);
    setLines([]);
    try {
      const using = spent || link === undefined ? await onNewLink() : link;
      if (using === undefined) return;
      run.current = await connect(card, using, heard);
      await run.current.done;
    } catch (failure) {
      const sentence = failure instanceof Error ? failure.message : String(failure);
      setLines((before) => [...before, { step: "failed", sentence }]);
    } finally {
      run.current = undefined;
      setRunning(false);
    }
  };
  return { steps: hereSteps(card.name, lines, running), running, start };
}

/** Under Connect: what has to be here first and its page; under Try again, the link's minutes. */
function HereNote(props: {
  readonly card: Connector;
  readonly stopped: boolean;
  readonly spent: boolean;
  readonly request: JoinRequest | undefined;
  readonly nowMs: number;
}) {
  const { card, request } = props;
  if (props.stopped) {
    return (
      <p className="join-note center" data-testid="join-here-note">
        {props.spent || request === undefined ? LINK_REMADE : stillWorks(request, props.nowMs)}
      </p>
    );
  }
  return (
    <p className="join-note center" data-testid="join-here-note">
      {hereNote(card)}
      <CardLinks card={card} />
    </p>
  );
}

/** Connect, spinning while it runs and waits for the hello, Try again where the bridge stopped. */
function HereGo(props: {
  readonly name: string;
  readonly state: "ready" | "running" | "stopped";
  readonly disabled: boolean;
  readonly onGo: () => void;
}) {
  const busy = props.state === "running";
  return (
    <Button
      size="lg"
      className={busy ? "you-gold join-go busy" : "you-gold join-go"}
      disabled={busy || props.disabled}
      onClick={props.onGo}
      data-testid="join-here-go"
    >
      {busy ? <span className="join-go-spin" aria-hidden="true" /> : null}
      {hereButton(props.name, props.state)}
    </Button>
  );
}

/**
 * On this Mac: what Connect does, its four steps, and Connect, which runs the card's line here
 * (`connectHere`) with the link the page made; where the bridge stops, its words and Try again.
 * Once the bridge has joined, it waits for the hello; where the link's card stops there (the
 * harness said nothing, or was removed), it says so in place of Connect, as On another computer
 * does, rather than spinning on.
 */
export function OnThisMac(props: {
  readonly card: Connector;
  readonly connect: ConnectHere;
  /** The link made as the page opened, once it is. */
  readonly link: string | undefined;
  readonly request: JoinRequest | undefined;
  /** Where the link's card has stopped, if it has. */
  readonly stall?: JoinStall | undefined;
  /** The link can't be used any more: Try again makes another first. */
  readonly spent: boolean;
  readonly nowMs: number;
  readonly onNewLink: () => Promise<string | undefined>;
}) {
  const { card } = props;
  const { steps, running, start } = useHereRun(
    card,
    props.connect,
    props.link,
    props.spent,
    props.onNewLink,
  );
  const stop = running ? undefined : steps.stop;
  // Connected, it waits for the hello, which the arrival follows, unless the card stops there.
  const stalled = steps.connected && !running ? props.stall : undefined;
  const busy = running || steps.connected;
  return (
    <>
      <p className="join-lede">{hereSentence(card.name)}</p>
      <StepList label={STEPS_LABEL.here} steps={steps.steps} testId="join-here-steps" />
      {stop === undefined ? null : <StopBox stop={stop} />}
      {stalled === undefined ? (
        <HereGo
          name={card.name}
          state={busy ? "running" : stop === undefined ? "ready" : "stopped"}
          disabled={props.link === undefined}
          onGo={() => void start()}
        />
      ) : (
        <StallBox
          stall={stalled}
          name={props.request?.name}
          testId="join-here-stall"
          onRenew={() => void start()}
        />
      )}
      <HereNote
        card={card}
        stopped={stop !== undefined}
        spent={props.spent}
        request={props.request}
        nowMs={props.nowMs}
      />
    </>
  );
}

/**
 * The bridge's card's two places, on Chips for Mac: the toggle, and the one chosen. On this Mac is
 * kept while the other computer is shown, so a run under way goes on. Without a shell that runs
 * the line here, the other computer alone.
 */
export function BridgeWays(props: {
  readonly card: Connector;
  readonly here: ConnectHere | undefined;
  readonly where: ConnectWhere;
  readonly onWhere: (where: ConnectWhere) => void;
  readonly link: string | undefined;
  readonly request: JoinRequest | undefined;
  readonly joinCard: JoinCard | undefined;
  readonly nowMs: number;
  /** A new link, allowed as the card's first was. */
  readonly onNewLink: () => Promise<string | undefined>;
}) {
  const { card, here, request } = props;
  const another = (
    <OnAnother
      card={card}
      link={props.link}
      request={request}
      joinCard={props.joinCard}
      nowMs={props.nowMs}
      onRenew={() => void props.onNewLink()}
    />
  );
  if (here === undefined) return another;
  return (
    <>
      <WhereTabs name={card.name} where={props.where} onWhere={props.onWhere} />
      <div className="join-where" hidden={props.where !== "here"}>
        <OnThisMac
          card={card}
          connect={here}
          link={props.link}
          request={request}
          stall={props.joinCard?.stall}
          spent={request?.state !== "allowed" || props.joinCard?.stall !== undefined}
          nowMs={props.nowMs}
          onNewLink={props.onNewLink}
        />
      </div>
      {props.where === "another" ? another : null}
    </>
  );
}

/**
 * On another computer: the installer's line to paste where the harness runs, the card's own for a
 * computer with Chips already, and the link followed in three steps, as on the phone.
 */
export function OnAnother(props: {
  readonly card: Connector;
  readonly link: string | undefined;
  readonly request: JoinRequest | undefined;
  readonly joinCard: JoinCard | undefined;
  readonly nowMs: number;
  readonly onRenew: () => void;
}) {
  const { card, request, joinCard } = props;
  const said = props.link === undefined ? undefined : sayOf(card, props.link, false);
  // The card's own line carries the link too, so it waits for one.
  const there = props.link === undefined ? undefined : alreadyThere(card, props.link);
  return (
    <>
      <p className="join-lede">{connectHead(card, false).sub}</p>
      {said === undefined ? (
        <p className="join-lede">Making a link…</p>
      ) : (
        <CopyBox text={said.text} testId={said.testId} block run={said.kind === "command"} />
      )}
      {there === undefined ? null : (
        <p className="join-note">
          {there.before}
          <code>{there.code}</code>
          {there.after}
        </p>
      )}
      <LinkSteps
        choice={card}
        request={request}
        joinCard={joinCard}
        nowMs={props.nowMs}
        testId="join-another-steps"
        onRenew={props.onRenew}
      />
      <p className="join-note center">{connectNote(card, props.link)}</p>
    </>
  );
}
