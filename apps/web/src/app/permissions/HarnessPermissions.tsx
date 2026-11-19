/**
 * A harness's Permissions (ADR 0300, Arjun's split of the plan "Harness first, Chips's rules if
 * you want them"): the page its Permissions row opens, beside the list on the Mac and the web as
 * the phone pushes it, and the two pages behind it.
 *
 * - The main page: the gates on the path from the harness to the person, the yellow banner only
 *   while Claude Code runs in Bypass permissions, "Where it's set" with a row for the harness's
 *   own settings and one for Chips's rules, and every ask so far.
 * - <Harness>'s settings: its mode, the notice when what it runs on its own covers something
 *   Chips would never let a rule allow, and what its settings let through, ask about and never
 *   run, each with where it's kept.
 * - Chips's rules: the switch, then Stop asking and the rules, with Add a rule.
 */

import {
  ADD_RULE_WORDS,
  type AlwaysRule,
  ASK_AGAIN_WORDS,
  alwaysFoot,
  asksGoTo,
  CHIPS_ANSWERS_HEADING,
  CHIPS_GATE_WORDS,
  CHIPS_RULES_TITLE,
  COPIED_WORDS,
  COPY_WORDS,
  type Directory,
  harnessAskKey,
  harnessPermissions,
  MAKE_ASK_WORDS,
  NOT_SAID,
  nameOf,
  OWN_GATE_WORDS,
  OWN_HEADING,
  OWN_RIGHT,
  type OwnNotice,
  type OwnRow,
  type OwnRulesView,
  pasteWords,
  REMOVED_WORDS,
  type SnoozeLength,
  STOP_ASKING_HEADING,
  STOP_ASKING_TITLE,
  segments,
  snoozeUntil,
  WHERE_SET_HEADING,
  type WorkspaceModel,
} from "@chipschat/core";
import { Icon, type IconName } from "@chipschat/ui";
import { Fragment, useState } from "react";
import { AlwaysList } from "../AlwaysList.tsx";
import { AsksSoFar, Count, Hero, UNDO_TITLE } from "../Asking.tsx";
import { GroupRow } from "../GroupRow.tsx";
import { UndoPill } from "../room/UndoPill.tsx";
import { type Always, useAlways } from "../useAlways.ts";
import { Switch } from "../you/controls.tsx";
import { LengthChips } from "./StopLengths.tsx";
import { type PermissionsService, rulesSender, useOwnRules } from "./service.ts";

const MODE_HEADING = "Mode";
const MODE_SUB = "The mode Chips runs its sessions in. Anything not on its lists asks.";
const NOT_SAID_WORDS =
  "It doesn't say yet what it runs on its own. Everything it asks still comes to you.";

/** Words with stretches in code, as core marks them with backticks. */
export function Coded(props: { readonly text: string }) {
  return (
    <>
      {segments(props.text).map((part, at) =>
        part.code === true ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: a stretch's place is its order.
          <code key={at}>{part.text}</code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <Fragment key={at}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** What the three pages read: the store's rules as the list keeps them, and what it last said. */
function usePage(
  model: WorkspaceModel,
  directory: Directory,
  harnessId: string,
  selfId: string | undefined,
  service: PermissionsService | undefined,
) {
  const always = useAlways(model, rulesSender(service));
  const own = useOwnRules(service, directory, harnessId);
  const page = harnessPermissions(
    {
      model: always.model,
      directory,
      keepsHarnessRules: service?.keepsHarnessRules,
      keepsChipsRules: service?.keepsChipsRules,
    },
    harnessId,
    selfId,
    own ?? NOT_SAID,
  );
  return { always, page };
}

/**
 * The main page (ADR 0300): who decides what to ask, the one yellow banner while the harness runs
 * everything without asking, the two rows that open where it's set, and every ask so far.
 */
export function HarnessPermissions(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly service: PermissionsService | undefined;
  readonly onOpenSpace: (spaceId: string) => void;
  /** Opens its own settings, or Chips's rules, beside this page. */
  readonly onOpenPart: (part: "settings" | "chips") => void;
}) {
  const { directory, harnessId, selfId, service } = props;
  const { page } = usePage(props.model, directory, harnessId, selfId, service);
  const owner = directory[harnessId]?.ownerId;
  const to = asksGoTo(directory, harnessId, selfId);
  return (
    <section className="asking perms" aria-label="Permissions" data-testid="permissions">
      <Hero
        harness={page.name}
        person={to.kind === "you" ? "You" : to.kind === "owner" ? to.name : "A person"}
        personName={owner === undefined ? "?" : nameOf(directory, owner)}
        face={owner === undefined ? undefined : directory[owner]?.face}
        working={page.open !== undefined}
        gates={{
          ownLabel: OWN_GATE_WORDS,
          own: page.gates.own,
          chipsLabel: CHIPS_GATE_WORDS,
          chips: page.chipsOn ? page.gates.chips : undefined,
        }}
      />
      <p className="asking-headline" data-testid="perms-headline">
        {page.lead}
      </p>
      {page.open !== undefined && (
        <div className="perms-open" data-testid="perms-open">
          <span className="perms-mark" data-tone="gold">
            <Icon name="info" size={15} />
          </span>
          <span className="perms-row-words">
            <b>{page.open.title}</b>
            <small>{page.open.sub}</small>
          </span>
        </div>
      )}
      <div className="asking-part-h">
        <h4>{WHERE_SET_HEADING}</h4>
      </div>
      <ul className="hp-group perms-where">
        <GroupRow
          label={page.settingsRow.title}
          sub={page.settingsRow.sub}
          value={page.settingsRow.value}
          goldValue={page.open !== undefined}
          tone={page.settingsRow.warn ? "danger" : undefined}
          mark={{ icon: "terminal", ground: 0 }}
          lines={2}
          onClick={() => props.onOpenPart("settings")}
          testId="perms-settings-row"
        />
        <GroupRow
          label={CHIPS_RULES_TITLE}
          sub={page.chipsRow.sub}
          value={page.chipsRow.value}
          tone={page.chipsOn ? "accent" : undefined}
          mark={{ icon: "lock", ground: 0 }}
          lines={2}
          onClick={() => props.onOpenPart("chips")}
          testId="perms-chips-row"
          valueTestId="perms-chips-value"
        />
      </ul>
      {page.history !== undefined && (
        <AsksSoFar
          model={props.model}
          directory={directory}
          harnessId={harnessId}
          selfId={selfId}
          onOpenSpace={props.onOpenSpace}
          dots={page.history.dots}
          askKey={harnessAskKey(props.model, directory, harnessId)}
          line={page.history.line}
        />
      )}
    </section>
  );
}

/** Its own settings (ADR 0300): its mode, the notice, and what its settings let through. */
export function HarnessSettings(props: {
  readonly directory: Directory;
  readonly harnessId: string;
  readonly service: PermissionsService | undefined;
}) {
  const own = useOwnRules(props.service, props.directory, props.harnessId) ?? NOT_SAID;
  return (
    <section
      className="asking perms"
      aria-label={`${nameOf(props.directory, props.harnessId)}'s settings`}
      data-testid="perms-settings"
    >
      <div className="asking-part-h">
        <h4>{MODE_HEADING}</h4>
      </div>
      <ul className="hp-group">
        <GroupRow
          label={own.mode ?? (own.said ? "Its own" : "Not said")}
          sub={own.everything ? "Runs everything without asking" : MODE_SUB}
          goldValue={own.everything}
          mark={{ icon: "terminal", ground: 0 }}
          testId="perms-mode"
        />
      </ul>
      {own.notice !== undefined && <Notice notice={own.notice} />}
      <OwnList own={own} />
      {!own.said && (
        <p className="asking-note" data-testid="perms-not-said">
          {NOT_SAID_WORDS}
        </p>
      )}
    </section>
  );
}

/**
 * Chips's rules for one harness (ADR 0300): the switch; and while it's on, Stop asking, which never
 * says yes to the never list, then the rules and Add a rule.
 */
export function ChipsRules(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  readonly harnessId: string;
  readonly selfId: string | undefined;
  readonly service: PermissionsService | undefined;
  /** Opens New rule beside this page. */
  readonly onNewRule: () => void;
}) {
  const { harnessId, service } = props;
  const { always, page } = usePage(props.model, props.directory, harnessId, props.selfId, service);
  const may = service !== undefined && page.mayChange;
  const chips = page.chipsPage;
  return (
    <section className="asking perms" aria-label="Chips's rules" data-testid="perms-chips">
      <div className="perms-switch" data-testid="perms-switch-row">
        <span className="perms-mark" data-tone="accent">
          <Icon name="lock" size={15} />
        </span>
        <span className="perms-row-words">
          <b>{CHIPS_RULES_TITLE}</b>
          <small>{chips.switchSub}</small>
        </span>
        <Switch
          label={CHIPS_RULES_TITLE}
          checked={page.chipsOn}
          disabled={service === undefined || !page.maySwitch}
          onChange={(on) => service?.setChipsRules(harnessId, on)}
          testId="perms-switch"
        />
      </div>
      {!page.chipsOn ? (
        <p className="asking-note" data-testid="perms-off-foot">
          {chips.offFoot}
        </p>
      ) : (
        <>
          {chips.note !== undefined && <p className="asking-note">{chips.note}</p>}
          <div className="asking-part-h">
            <h4>{STOP_ASKING_HEADING}</h4>
          </div>
          <StopAsking
            pause={chips.pause}
            may={may}
            onStop={(length) =>
              service?.snoozeHarness(harnessId, { until: snoozeUntil(length), matters: false })
            }
            onAgain={() =>
              page.off?.every === true
                ? service?.setWorkspaceRules({ hold: null })
                : service?.resumeHarness(harnessId)
            }
          />
          <ChipsAnswers
            rules={page.rules}
            always={always}
            may={may}
            name={page.name}
            foot={chips.rulesFoot}
            onAdd={props.onNewRule}
          />
        </>
      )}
      <UndoPill
        undoing={
          always.removed === undefined
            ? undefined
            : { lineId: always.removed.key, at: always.removed.at }
        }
        onUndo={always.undo}
        onGone={always.settled}
        words={REMOVED_WORDS}
        title={UNDO_TITLE}
        page
      />
    </section>
  );
}

/** Stop asking: its row, the lengths under it once tapped, or Ask again while Chips says yes. */
function StopAsking(props: {
  readonly pause: { readonly holding: boolean; readonly title: string; readonly sub: string };
  readonly may: boolean;
  readonly onStop: (length: SnoozeLength) => void;
  readonly onAgain: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { pause } = props;
  return (
    <div
      className="perms-stop"
      data-testid="perms-stop"
      data-on={pause.holding ? "true" : undefined}
    >
      <div className="perms-stop-row">
        <span className="perms-mark" data-tone={pause.holding ? "accent" : undefined}>
          <Icon name="clock" size={15} />
        </span>
        <span className="perms-row-words">
          <b>{pause.title}</b>
          <small>
            <Coded text={pause.sub} />
          </small>
        </span>
        {props.may &&
          (pause.holding ? (
            <button
              type="button"
              className="perms-again"
              onClick={props.onAgain}
              data-testid="perms-ask-again"
            >
              {ASK_AGAIN_WORDS}
            </button>
          ) : (
            <button
              type="button"
              className="perms-stop-open"
              aria-expanded={open}
              onClick={() => setOpen((was) => !was)}
              data-testid="perms-stop-open"
            >
              <Icon name="next" size={14} />
            </button>
          ))}
      </div>
      <div className="snz-fold" data-open={open && !pause.holding ? "true" : undefined}>
        <div className="snz-in">
          <LengthChips
            label={STOP_ASKING_TITLE}
            onPick={(length) => {
              setOpen(false);
              props.onStop(length);
            }}
            testId="perms-stop-len"
          />
        </div>
      </div>
    </div>
  );
}

/** What Chips answers: the rules, each switched or removed, Add a rule, and the line under them. */
function ChipsAnswers(props: {
  readonly rules: readonly AlwaysRule[];
  readonly always: Always;
  readonly may: boolean;
  readonly name: string;
  readonly foot: string;
  readonly onAdd: () => void;
}) {
  const { rules, may } = props;
  const some = rules.length > 0;
  return (
    <>
      <div className="asking-part-h">
        <h4>{CHIPS_ANSWERS_HEADING}</h4>
        <Count rules={rules} />
      </div>
      {some && (
        <AlwaysList rules={rules} always={props.always} may={may} testId="perms-rules" titled />
      )}
      {may && (
        <AddRow words={ADD_RULE_WORDS} onClick={() => props.onAdd()} testId="perms-add-rule" />
      )}
      <p className="asking-note" data-testid="perms-rules-foot">
        {some ? `${props.foot} ${alwaysFoot(props.name, may, "cross")}` : props.foot}
      </p>
    </>
  );
}

/** Add a rule: a row in the accent, with its plus and chevron. */
export function AddRow(props: {
  readonly words: string;
  readonly onClick: (from: HTMLButtonElement) => void;
  readonly testId: string;
}) {
  return (
    <button
      type="button"
      className="perms-add"
      onClick={(event) => props.onClick(event.currentTarget)}
      data-testid={props.testId}
    >
      <span className="perms-add-mark">
        <Icon name="plus" size={15} />
      </span>
      <span>{props.words}</span>
      <Icon name="next" size={14} />
    </button>
  );
}

/** What it runs that Chips would never allow: the sentence, and the line to paste with Copy. */
function Notice(props: { readonly notice: OwnNotice }) {
  const { notice } = props;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const line = notice.line;
  return (
    <div className="perms-notice" data-testid="perms-notice">
      <div className="perms-notice-head">
        <span className="perms-mark" data-tone="amber">
          <Icon name="info" size={16} />
        </span>
        <p>
          <b>
            <Coded text={notice.title} />
          </b>{" "}
          {notice.body}
        </p>
      </div>
      {line !== undefined && (
        <>
          <button
            type="button"
            className="perms-notice-btn"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            data-testid="perms-make-ask"
          >
            {MAKE_ASK_WORDS}
          </button>
          <div className="snz-fold" data-open={open ? "true" : undefined}>
            <div className="snz-in">
              <div className="perms-snip">
                <p>
                  <Coded text={pasteWords(notice.where)} />
                </p>
                <pre data-testid="perms-line">
                  <code>{line}</code>
                </pre>
                <button
                  type="button"
                  className="perms-copy"
                  data-copied={copied ? "true" : undefined}
                  onClick={() => {
                    void navigator.clipboard?.writeText(line).then(() => setCopied(true));
                  }}
                  data-testid="perms-copy"
                >
                  <Icon name={copied ? "check" : "copy"} size={14} />
                  <span>{copied ? COPIED_WORDS : COPY_WORDS}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const OWN_ICONS: Readonly<Record<OwnRow["kind"], IconName>> = {
  read: "doc",
  write: "pen",
  web: "globe",
  command: "terminal",
  tool: "info",
};

/** What it runs without asking, from its settings, a row for each kind; nothing before it said. */
function OwnList(props: { readonly own: OwnRulesView }) {
  const { own } = props;
  if (!own.said || (own.rows.length === 0 && own.foot === undefined)) return null;
  return (
    <>
      <div className="asking-part-h">
        <h4>{OWN_HEADING}</h4>
        <span className="perms-right">{OWN_RIGHT}</span>
      </div>
      {own.rows.length > 0 && (
        <ul className="perms-own" data-testid="perms-own">
          {own.rows.map((row) => (
            <li key={`${row.kind}:${row.title}`} className="perms-own-row">
              <span className="perms-mark">
                <Icon name={OWN_ICONS[row.kind]} size={15} />
              </span>
              <span className="perms-row-words">
                <b>{row.title}</b>
                <small>
                  {row.names.map((each, at) => (
                    <Fragment key={each.name}>
                      {at > 0 && ", "}
                      {each.never ? <em>{each.name}</em> : each.name}
                    </Fragment>
                  ))}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {own.foot !== undefined && (
        <p className="asking-note" data-testid="perms-own-foot">
          <Coded text={own.foot} />
        </p>
      )}
    </>
  );
}
