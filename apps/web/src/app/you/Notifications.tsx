/**
 * Notifications on You (M5.6, ADR 0085, ADR 0265): one card, as the phone's is. First this
 * device's one switch, whether this workspace raises banners here at all, which the server is not
 * told. Then the person's settings, the same on every device of theirs and saved whole to the
 * server on every change: each a row with what it is set to, opening a form that sets it, as the
 * phone's rows open sheets.
 *
 * Decisions are what an agent is waiting on; Finished work is runs that end and questions an agent
 * will answer itself; Checkpoints are an agent saying where it has got to. The phone has no rows
 * for the last two, which the server never pushes; the open app raises them here as banners. The
 * quiet hours say their window, and under it what gets through them. Agents says what is turned
 * down, and its form one word per harness, covering every agent it runs.
 */

import {
  agentsWords,
  DECIDE_WORDS,
  type Directory,
  FYI_WORDS,
  HEAR_WORDS,
  type Participant,
  quietSub,
  quietWords,
  REVIEW_WORDS,
  workspaceHarnesses,
} from "@chipschat/core";
import type { HarnessNotifications, NotificationSettings, QuietHours } from "@chipschat/protocol";
import { Avatar } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import { Choice, reasonOf, Switch } from "./controls.tsx";
import { ChoiceList, FormPage } from "./Form.tsx";
import { Group, HUES, ListRow, RowMark } from "./list.tsx";
import type { NotificationsService } from "./services.ts";

/** A new window's hours: the evening to the morning, with decisions let through. */
const NIGHT: QuietHours = { from: "22:00", to: "07:00", breakthrough: "decide" };

const HARNESS_WORDS = [
  ["all", "Everything"],
  ["decide", "Decisions only"],
  ["none", "Nothing"],
] as const satisfies readonly (readonly [HarnessNotifications, string])[];

/** Which form is open, and the row that opened it. */
type Open =
  | { readonly form: "decide" | "review" | "fyi" | "quiet" | "agents"; readonly from: HTMLElement }
  | undefined;

export function Notifications(props: {
  readonly service: NotificationsService | undefined;
  readonly directory: Directory;
  readonly workspace: string;
  /** Inside the desktop app: a computer, with a menu bar. */
  readonly desktop: boolean;
  readonly muted: boolean;
  readonly onMute: ((muted: boolean) => void) | undefined;
}) {
  const { service, onMute } = props;
  return (
    <Group heading="Notifications" label="Notifications" testId="notifications">
      {(onMute !== undefined || service?.browser !== undefined) && (
        <Banners
          workspace={props.workspace}
          desktop={props.desktop}
          muted={props.muted}
          onMute={onMute}
          browser={service?.browser}
        />
      )}
      {service !== undefined && <Settings service={service} directory={props.directory} />}
    </Group>
  );
}

type Leave = NonNullable<NotificationsService["browser"]>["state"];

/**
 * Banners here, one switch, as the phone's Notify me is: on only while a banner can be raised. In a
 * browser that is the person's word for this workspace and the browser's own leave together, so a
 * browser that has refused shows the switch off, held, with where to allow it under it; one not
 * asked yet shows it off, and turning it on asks. The desktop app needs no leave.
 */
function Banners(props: {
  readonly workspace: string;
  readonly desktop: boolean;
  readonly muted: boolean;
  readonly onMute: ((muted: boolean) => void) | undefined;
  readonly browser: NotificationsService["browser"];
}) {
  const { browser, onMute } = props;
  const [leave, setLeave] = useState<Leave>(browser?.state ?? "granted");
  const here = props.desktop ? "Banners on this computer" : "Banners in this browser";
  const on = !props.muted && leave !== "denied" && leave !== "default";
  const turn = (to: boolean) => {
    if (!to) return onMute?.(true);
    if (leave !== "default" || browser === undefined) return onMute?.(false);
    browser.ask().then(
      (given) => {
        setLeave(given);
        if (given === "granted") onMute?.(false);
      },
      () => undefined,
    );
  };
  return (
    <ListRow
      label={here}
      sub={bannersSub(leave, on, props.workspace, props.desktop)}
      mark={<RowMark icon="bell" tint="var(--red)" />}
      trailing={
        <Switch
          label={here}
          checked={on}
          disabled={leave === "denied" || onMute === undefined}
          onChange={turn}
        />
      }
      testId="mute"
    />
  );
}

/** What the switch's line says: why it is off, and how to turn it on, where it is off. */
function bannersSub(leave: Leave, on: boolean, workspace: string, desktop: boolean) {
  if (leave === "denied") {
    return "This browser has refused banners. Allow them in its settings to hear from here.";
  }
  if (leave === "default") return "This browser hasn't been asked yet. Turning this on asks it.";
  if (on) return undefined;
  return `Off. Nothing from ${workspace} reaches a banner${desktop ? " or the menu bar" : ""} here.`;
}

/**
 * The settings as the store holds them, with a change shown at once while it saves. The store's
 * word wins once the save is answered, so a refusal puts back what the server has, with the
 * reason under the card, and a change made on the phone shows here when the store reads it again.
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
  const [open, setOpen] = useState<Open>(undefined);
  // Every agent in the workspace, not only those that have worked yet: one can be quietened
  // before its first run.
  const agents = workspaceHarnesses(props.directory);
  const opener = (form: NonNullable<Open>["form"]) => (from: HTMLElement) =>
    setOpen({ form, from });
  const gone = () => setOpen(undefined);
  return (
    <>
      <ListRow
        label="Decisions"
        value={DECIDE_WORDS[settings.decide]}
        mark={<RowMark icon="check" tint="var(--gold)" ink="#231a00" />}
        onOpen={opener("decide")}
        testId="decisions-row"
      />
      <ListRow
        label="Finished work"
        value={REVIEW_WORDS[settings.review]}
        mark={<RowMark icon="inbox" tint={HUES.teal} />}
        onOpen={opener("review")}
        testId="review-row"
      />
      <ListRow
        label="Checkpoints"
        value={FYI_WORDS[settings.fyi]}
        mark={<RowMark icon="bookmark" tint={HUES.green} />}
        onOpen={opener("fyi")}
        testId="fyi-row"
      />
      <ListRow
        label="Quiet hours"
        sub={quietSub(settings.quiet)}
        value={quietWords(settings.quiet)}
        mark={<RowMark icon="moon" tint={HUES.violet} />}
        onOpen={opener("quiet")}
        testId="quiet-row"
      />
      {agents.length > 0 && (
        <ListRow
          label="Agents"
          value={agentsWords(
            agents.map((each) => ({ id: each.id, name: each.displayName })),
            settings.harnesses,
          )}
          mark={<RowMark icon="chip" tint={HUES.blue} />}
          onOpen={opener("agents")}
          testId="agents-row"
        />
      )}
      {error !== undefined && (
        <p className="you-lrow-error" role="alert" data-testid="notifications-error">
          {error}
        </p>
      )}
      {open?.form === "decide" && (
        <OneOf
          title="Decisions"
          from={open.from}
          testId="decide-form"
          value={settings.decide}
          options={[
            {
              value: "now",
              words: DECIDE_WORDS.now,
              sub: "An approval or a question an agent is waiting on, as it comes",
            },
            {
              value: "off",
              words: DECIDE_WORDS.off,
              sub: "Nothing an agent waits on raises a banner",
            },
          ]}
          onChange={(decide) => change({ ...settings, decide })}
          onGone={gone}
        />
      )}
      {open?.form === "review" && (
        <OneOf
          title="Finished work"
          from={open.from}
          testId="review-form"
          value={settings.review}
          options={[
            {
              value: "hourly",
              words: "At most one an hour",
              sub: "Runs that finish or fail, and questions an agent will answer itself, gathered into one banner",
            },
            { value: "off", words: REVIEW_WORDS.off, sub: "They wait in their spaces" },
          ]}
          onChange={(review) => change({ ...settings, review })}
          onGone={gone}
        />
      )}
      {open?.form === "fyi" && (
        <OneOf
          title="Checkpoints"
          from={open.from}
          testId="fyi-form"
          value={settings.fyi}
          options={[
            {
              value: "daily",
              words: "At most one a day",
              sub: "An agent saying where it's got to, gathered into one banner",
            },
            { value: "off", words: FYI_WORDS.off, sub: "They wait in their spaces" },
          ]}
          onChange={(fyi) => change({ ...settings, fyi })}
          onGone={gone}
        />
      )}
      {open?.form === "quiet" && (
        <QuietForm
          from={open.from}
          quiet={settings.quiet}
          onChange={(quiet) => change({ ...settings, quiet })}
          onGone={gone}
        />
      )}
      {open?.form === "agents" && (
        <AgentsForm
          from={open.from}
          agents={agents}
          heard={settings.harnesses}
          onChange={(harnesses) => change({ ...settings, harnesses })}
          onGone={gone}
        />
      )}
    </>
  );
}

/** A setting of two or three answers: picked, it saves, and the form stays up to show the tick. */
function OneOf<T extends string>(props: {
  readonly title: string;
  readonly from: HTMLElement;
  readonly testId: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly words: string; readonly sub?: string }[];
  readonly onChange: (value: T) => void;
  readonly onGone: () => void;
}) {
  return (
    <FormPage
      title={props.title}
      from={props.from}
      testId={props.testId}
      focus=".you-choice input:checked"
      onGone={props.onGone}
    >
      {() => (
        <>
          <ChoiceList
            label={props.title}
            value={props.value}
            options={props.options}
            onChange={props.onChange}
          />
          <p className="you-form-foot">Yours on every device of yours.</p>
        </>
      )}
    </FormPage>
  );
}

/** Quiet hours: on or off, the window, and whether a decision still gets through it. */
function QuietForm(props: {
  readonly from: HTMLElement;
  readonly quiet: QuietHours | undefined;
  readonly onChange: (quiet: QuietHours | undefined) => void;
  readonly onGone: () => void;
}) {
  const { quiet } = props;
  return (
    <FormPage title="Quiet hours" from={props.from} testId="quiet-form" onGone={props.onGone}>
      {() => (
        <>
          <div className="you-form-group">
            <div className="you-form-row">
              <span>Use quiet hours</span>
              <Switch
                label="Quiet hours"
                checked={quiet !== undefined}
                onChange={(on) => props.onChange(on ? NIGHT : undefined)}
                testId="quiet-switch"
              />
            </div>
            {quiet !== undefined && (
              <>
                <div className="you-form-row" data-testid="quiet-window">
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
                        if (event.target.value !== "")
                          props.onChange({ ...quiet, to: event.target.value });
                      }}
                    />
                  </label>
                </div>
                <div className="you-form-row">
                  <span>Let decisions through</span>
                  <Switch
                    label="Let decisions through"
                    checked={quiet.breakthrough === "decide"}
                    onChange={(on) =>
                      props.onChange({ ...quiet, breakthrough: on ? "decide" : "none" })
                    }
                  />
                </div>
              </>
            )}
          </div>
          <p className="you-form-foot" data-testid="quiet-words">
            {quiet === undefined
              ? "Nothing buzzes while they last, except what you let through."
              : `${quietWords(quiet)}. ${quietSub(quiet)}.`}
          </p>
        </>
      )}
    </FormPage>
  );
}

/** How much the person hears from each harness in the workspace, one word each. */
function AgentsForm(props: {
  readonly from: HTMLElement;
  readonly agents: readonly Participant[];
  readonly heard: NotificationSettings["harnesses"];
  readonly onChange: (harnesses: NotificationSettings["harnesses"]) => void;
  readonly onGone: () => void;
}) {
  return (
    <FormPage title="Agents" from={props.from} testId="agents-form" onGone={props.onGone}>
      {() => (
        <>
          <div className="you-form-group" data-testid="notify-harnesses">
            {props.agents.map(({ id, displayName }) => {
              const word = props.heard[id] ?? "all";
              return (
                <div key={id} className="you-form-row you-agent-row">
                  <span className="you-agent">
                    <Avatar name={displayName} kind="harness" size="xs" />
                    <span className="you-choice-lab">
                      <span>{displayName}</span>
                      <small>{HEAR_WORDS[word]}</small>
                    </span>
                  </span>
                  <Choice
                    label={`Hear from ${displayName}`}
                    value={word}
                    options={HARNESS_WORDS}
                    onChange={(next) => props.onChange({ ...props.heard, [id]: next })}
                  />
                </div>
              );
            })}
          </div>
          <p className="you-form-foot">
            One word per harness, for every agent it runs. Whatever you choose, its spaces still
            show everything it says.
          </p>
        </>
      )}
    </FormPage>
  );
}
