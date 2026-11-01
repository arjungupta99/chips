/**
 * Notifications on You (M5.6, ADR 0085): the person's settings, the same on every device of
 * theirs and saved whole to the server on every change, and one switch that is this device's
 * alone — whether this workspace raises banners here at all.
 *
 * Each row says what it covers in the person's words rather than the tier's name: Decisions are
 * what an agent is waiting on, Finished work is runs that end and questions an agent will answer
 * itself, Checkpoints are an agent saying where it has got to. The quiet hours say what gets
 * through them as it is set, not as it usually is. Agents says what each of its three words
 * lets through, and that the word is a harness's, covering every agent it runs.
 */

import { type Directory, type Participant, workspaceHarnesses } from "@chipschat/core";
import type { HarnessNotifications, NotificationSettings, QuietHours } from "@chipschat/protocol";
import { Avatar, Button } from "@chipschat/ui";
import { Fragment, useEffect, useRef, useState } from "react";
import { Card, Choice, Problem, Row, reasonOf, Switch } from "./controls.tsx";
import type { NotificationsService } from "./services.ts";

const DECIDE_WORDS = [
  ["now", "Right away"],
  ["off", "Off"],
] as const;
const REVIEW_WORDS = [
  ["hourly", "At most one an hour"],
  ["off", "Never"],
] as const;
const FYI_WORDS = [
  ["daily", "At most one a day"],
  ["off", "Never"],
] as const;
const HARNESS_WORDS = [
  ["all", "Everything"],
  ["decide", "Decisions only"],
  ["none", "Nothing"],
] as const satisfies readonly (readonly [HarnessNotifications, string])[];

/** A new window's hours: the evening to the morning, with decisions let through. */
const NIGHT: QuietHours = { from: "22:00", to: "07:00", breakthrough: "decide" };

/**
 * A time the server keeps as `22:00`, as this computer says times — "10:00 PM" on a twelve-hour
 * clock — so the line agrees with the time fields beside it, which the browser draws its own way.
 */
export function clockWords(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(2026, 0, 1, hours, minutes).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** What the quiet hours line says: the window, and what gets through it as it is set. */
export function quietWords(quiet: QuietHours | undefined): string {
  if (quiet === undefined) return "Off: a banner may come at any hour";
  const through =
    quiet.breakthrough === "decide" ? "decisions still get through" : "nothing gets through";
  return `${clockWords(quiet.from)} to ${clockWords(quiet.to)} · ${through}`;
}

export function Notifications(props: {
  readonly service: NotificationsService | undefined;
  readonly directory: Directory;
  readonly workspace: string;
  /** Inside the desktop app: a computer, with a menu bar. */
  readonly desktop: boolean;
  readonly muted: boolean;
  readonly onMute: ((muted: boolean) => void) | undefined;
}) {
  return (
    <Card
      label="Notifications"
      testId="notifications"
      title="Notifications"
      aside={
        <small>
          {props.onMute === undefined
            ? "Yours on every device"
            : "Yours on every device, except the first switch"}
        </small>
      }
    >
      {props.onMute !== undefined && (
        <Banners
          workspace={props.workspace}
          desktop={props.desktop}
          muted={props.muted}
          onMute={props.onMute}
        />
      )}
      {props.service !== undefined && (
        <Settings service={props.service} directory={props.directory} />
      )}
    </Card>
  );
}

/** This device's one switch: whether this workspace raises banners here. The server is not told. */
function Banners(props: {
  readonly workspace: string;
  readonly desktop: boolean;
  readonly muted: boolean;
  readonly onMute: (muted: boolean) => void;
}) {
  const here = props.desktop ? "Banners on this computer" : "Banners in this browser";
  return (
    <Row
      testId="mute"
      label={here}
      sub={`Off, and nothing from ${props.workspace} reaches a banner${props.desktop ? " or the menu bar" : ""} here`}
    >
      <Switch label={here} checked={!props.muted} onChange={(on) => props.onMute(!on)} />
    </Row>
  );
}

/**
 * The settings as the store holds them, with a change shown at once while it saves. The store's
 * word wins once the save is answered, so a refusal puts back what the server has, with the
 * reason above it, and a change made on the phone shows here when the store reads it again.
 */
function useSettings(service: NotificationsService) {
  const [pending, setPending] = useState<NotificationSettings | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const latest = useRef(0);
  useEffect(() => {
    service.load().catch(() => undefined);
  }, [service]);
  const change = (next: NotificationSettings) => {
    const mine = latest.current + 1;
    latest.current = mine;
    setPending(next);
    service.save(next).then(
      () => {
        if (latest.current !== mine) return;
        setError(undefined);
        setPending(undefined);
      },
      (reason: unknown) => {
        if (latest.current !== mine) return;
        setError(reasonOf(reason));
        setPending(undefined);
      },
    );
  };
  return { settings: pending ?? service.settings(), error, change };
}

function Settings(props: {
  readonly service: NotificationsService;
  readonly directory: Directory;
}) {
  const { settings, error, change } = useSettings(props.service);
  // Every agent in the workspace, not only those that have worked yet: one can be quietened
  // before its first run.
  const agents = workspaceHarnesses(props.directory);
  return (
    <>
      <Problem error={error} />
      <Row label="Decisions" sub="An approval or a question an agent is waiting on">
        <Choice
          label="Decisions"
          value={settings.decide}
          options={DECIDE_WORDS}
          onChange={(decide) => change({ ...settings, decide })}
        />
      </Row>
      <Row
        label="Finished work"
        sub="Runs that finish or fail, and questions an agent will answer itself"
      >
        <Choice
          label="Finished work"
          value={settings.review}
          options={REVIEW_WORDS}
          onChange={(review) => change({ ...settings, review })}
        />
      </Row>
      <Row label="Checkpoints" sub="An agent saying where it's got to">
        <Choice
          label="Checkpoints"
          value={settings.fyi}
          options={FYI_WORDS}
          onChange={(fyi) => change({ ...settings, fyi })}
        />
      </Row>
      <Quiet quiet={settings.quiet} onChange={(quiet) => change({ ...settings, quiet })} />
      {agents.length > 0 && (
        <Agents
          agents={agents}
          heard={settings.harnesses}
          onChange={(harnesses) => change({ ...settings, harnesses })}
        />
      )}
      {props.service.browser !== undefined && <BrowserLeave browser={props.service.browser} />}
    </>
  );
}

/** Quiet hours: on or off, the window, and whether a decision still gets through it. */
function Quiet(props: {
  readonly quiet: QuietHours | undefined;
  readonly onChange: (quiet: QuietHours | undefined) => void;
}) {
  const { quiet } = props;
  return (
    <>
      <Row label="Quiet hours" sub={quietWords(quiet)}>
        <Switch
          label="Quiet hours"
          checked={quiet !== undefined}
          onChange={(on) => props.onChange(on ? NIGHT : undefined)}
        />
      </Row>
      {quiet !== undefined && (
        <div className="you-row you-row-more" data-testid="quiet-window">
          <label className="you-time">
            From
            <input
              type="time"
              aria-label="Quiet from"
              value={quiet.from}
              required
              onChange={(event) => {
                if (event.target.value !== "")
                  props.onChange({ ...quiet, from: event.target.value });
              }}
            />
          </label>
          <label className="you-time">
            to
            <input
              type="time"
              aria-label="Quiet to"
              value={quiet.to}
              required
              onChange={(event) => {
                if (event.target.value !== "") props.onChange({ ...quiet, to: event.target.value });
              }}
            />
          </label>
          <span className="you-grow" />
          <span className="you-time">
            <span aria-hidden="true">Let decisions through</span>
            <Switch
              label="Let decisions through"
              checked={quiet.breakthrough === "decide"}
              onChange={(on) => props.onChange({ ...quiet, breakthrough: on ? "decide" : "none" })}
            />
          </span>
        </div>
      )}
    </>
  );
}

/** What each word for a harness lets through, under Agents. A reply is never a notification. */
const HEAR_WORDS = [
  "One choice per harness, for every agent it runs.",
  "Everything: its decisions, finished work, checkpoints, and messages that @ you.",
  "Decisions only: just what it's stopped on until you answer.",
  "Nothing: it never notifies you. Its spaces still show everything.",
] as const;

/** How much the person hears from each harness in the workspace, one word each. */
function Agents(props: {
  readonly agents: readonly Participant[];
  readonly heard: NotificationSettings["harnesses"];
  readonly onChange: (harnesses: NotificationSettings["harnesses"]) => void;
}) {
  return (
    <div className="you-row you-agents" data-testid="notify-harnesses">
      <span className="you-row-lab">
        <span>Agents</span>
        {HEAR_WORDS.map((line) => (
          <small key={line}>{line}</small>
        ))}
      </span>
      <div className="you-agents-grid">
        {props.agents.map(({ id, displayName }) => (
          <Fragment key={id}>
            <span className="you-agent">
              <Avatar name={displayName} kind="harness" size="xs" />
              {displayName}
            </span>
            <Choice
              label={`Hear from ${displayName}`}
              value={props.heard[id] ?? "all"}
              options={HARNESS_WORDS}
              onChange={(word) => props.onChange({ ...props.heard, [id]: word })}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** The browser's own leave to show banners, and the asking; the desktop app needs none. */
function BrowserLeave(props: { readonly browser: NonNullable<NotificationsService["browser"]> }) {
  const [state, setState] = useState(props.browser.state);
  if (state === "unsupported") return null;
  return (
    <Row
      testId="browser-notifications"
      className="you-row-quiet"
      label={
        state === "granted"
          ? "This browser shows banners."
          : state === "denied"
            ? "This browser has refused banners; allow them in its settings to hear from here."
            : "This browser shows no banners yet."
      }
    >
      {state === "default" && (
        <Button
          onClick={() => {
            props.browser.ask().then(setState, () => undefined);
          }}
        >
          Allow banners here
        </Button>
      )}
    </Row>
  );
}
