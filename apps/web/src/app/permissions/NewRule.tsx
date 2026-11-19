/**
 * New rule (ADR 0299): a rule a person writes ahead of time, for one harness or for every harness,
 * on a page beside the one that opened it, never a dialog.
 *
 * What it does: run commands, or a kind its asks have been; the kinds it runs on its own, from its
 * settings, are shown dimmed and can't be picked, since no rule would ever see them. For commands,
 * the starts its asks began with, as chips, most asked first, and the listed commands after them,
 * locked while the answer is Allow. The answer, Allow, Ask me or Never; where, every space or one.
 * Under it all, the preview: how many of its real asks this rule would have answered, refused or
 * brought back, as the dots, which light as the chips are picked.
 *
 * Save sends the scope's rules with these added; Chips stamps who made them and when, so they show
 * as one row on the page, and an Allow never covers what matters.
 */

import {
  ANSWER_HEADING,
  COMMANDS_KIND,
  type Directory,
  draftProblem,
  EVERY_HARNESS,
  EVERY_SPACE_WORDS,
  type NewRuleOptions,
  NOT_SAID,
  neverStart,
  newRuleOptions,
  type OwnRulesView,
  PREVIEW_KEY,
  RULE_ANSWERS,
  RUN_COMMANDS_WORDS,
  type RuleAnswer,
  type RuleDraft,
  type RulePreview,
  rulePreview,
  rulesOf,
  SAVE_RULE_WORDS,
  SAVED_WORDS,
  STARTS_HEADING,
  startsNote,
  WHAT_HEADING,
  WHERE_HEADING,
  type WorkspaceModel,
  withDraft,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { type CSSProperties, useEffect, useState } from "react";
import { Choice, Segmented } from "../you/controls.tsx";
import type { PermissionsService } from "./service.ts";

/** How long Saved shows its tick before the page goes back. */
const SAVED_MS = 900;

export function NewRule(props: {
  readonly model: WorkspaceModel;
  readonly directory: Directory;
  /** The harness, or `EVERY_HARNESS`. */
  readonly harnessId: string;
  readonly own?: OwnRulesView | undefined;
  readonly service: PermissionsService;
  /** Saved: back to the page that opened it. */
  readonly onDone: () => void;
}) {
  const { model, directory, harnessId, service } = props;
  const every = harnessId === EVERY_HARNESS;
  const options = newRuleOptions(model, directory, harnessId, props.own ?? NOT_SAID);
  const [draft, setDraft] = useState<RuleDraft>({
    what: COMMANDS_KIND,
    starts: [],
    answer: "allow",
  });
  const [saved, setSaved] = useState(false);
  const preview = rulePreview(model, directory, harnessId, draft);
  const problem = draftProblem(draft);
  const commands = draft.what === COMMANDS_KIND;
  const set = (change: Partial<RuleDraft>) => setDraft((was) => ({ ...was, ...change }));
  const toggle = (start: string) =>
    set({
      starts: draft.starts.includes(start)
        ? draft.starts.filter((each) => each !== start)
        : [...draft.starts, start],
    });
  useEffect(() => {
    if (!saved) return;
    const back = setTimeout(props.onDone, SAVED_MS);
    return () => clearTimeout(back);
  }, [saved, props.onDone]);
  const save = () => {
    if (problem !== undefined || saved) return;
    if (every) {
      service.setWorkspaceRules({ rules: withDraft(model.workspaceRules?.rules ?? [], draft) });
    } else {
      service.setRules({
        harnessId,
        ...(draft.spaceId === undefined ? {} : { spaceId: draft.spaceId }),
        rules: withDraft(rulesOf(model, harnessId, draft.spaceId), draft),
      });
    }
    setSaved(true);
  };
  return (
    <section className="asking perms rule" aria-label="New rule" data-testid="new-rule">
      <Kinds kinds={options.kinds} what={draft.what} onPick={(what) => set({ what })} />
      {commands && <Starts options={options} draft={draft} every={every} onToggle={toggle} />}
      <div className="asking-part-h">
        <h4>{ANSWER_HEADING}</h4>
      </div>
      <Segmented<RuleAnswer>
        label={ANSWER_HEADING}
        value={draft.answer}
        options={RULE_ANSWERS.map((each) => [each.answer, each.words] as const)}
        onChange={(answer) => set({ answer })}
      />
      {!every && options.spaces.length > 0 && (
        <>
          <div className="asking-part-h">
            <h4>{WHERE_HEADING}</h4>
          </div>
          <Choice<string>
            label={WHERE_HEADING}
            value={draft.spaceId ?? ""}
            options={[
              ["", EVERY_SPACE_WORDS],
              ...options.spaces.map((space) => [space.id, space.name] as const),
            ]}
            onChange={(spaceId) => set({ spaceId: spaceId === "" ? undefined : spaceId })}
          />
        </>
      )}
      <Preview preview={preview} answer={draft.answer} />
      {problem !== undefined && (
        <p className="asking-note" data-testid="rule-problem">
          {problem}
        </p>
      )}
      <button
        type="button"
        className="rule-save"
        disabled={problem !== undefined}
        data-saved={saved ? "true" : undefined}
        onClick={save}
        data-testid="rule-save"
      >
        <span className="rule-save-l">{SAVE_RULE_WORDS}</span>
        <span className="rule-save-d">
          <Icon name="check" size={16} />
          {SAVED_WORDS}
        </span>
      </button>
    </section>
  );
}

/** What it does, a radio each; what it runs on its own is shown dimmed and can't be picked. */
function Kinds(props: {
  readonly kinds: NewRuleOptions["kinds"];
  readonly what: string;
  readonly onPick: (what: string) => void;
}) {
  return (
    <>
      <div className="asking-part-h">
        <h4>{WHAT_HEADING}</h4>
      </div>
      <div className="rule-kinds" role="radiogroup" aria-label={WHAT_HEADING}>
        {props.kinds.map((kind) => (
          <KindRow
            key={kind.id}
            kind={kind}
            on={props.what === kind.id}
            onPick={() => props.onPick(kind.id)}
          />
        ))}
      </div>
    </>
  );
}

/** One thing it may do, as a radio row. */
function KindRow(props: {
  readonly kind: NewRuleOptions["kinds"][number];
  readonly on: boolean;
  readonly onPick: () => void;
}) {
  const { kind, on } = props;
  const commands = kind.id === COMMANDS_KIND;
  const icon = commands ? "terminal" : kind.own ? "lock" : "info";
  return (
    <label
      className="rule-kind"
      data-on={on ? "true" : undefined}
      data-own={kind.own ? "true" : undefined}
    >
      <input
        type="radio"
        name="rule-kind"
        checked={on}
        disabled={kind.own}
        onChange={props.onPick}
        data-testid={`rule-kind-${kind.id}`}
      />
      <span className="perms-mark" data-tone={on ? "accent" : undefined}>
        <Icon name={icon} size={15} />
      </span>
      <span className="perms-row-words">
        <b>{commands ? RUN_COMMANDS_WORDS : kind.title}</b>
        {kind.sub !== undefined && (kind.own ? <small>{kind.sub}</small> : <code>{kind.sub}</code>)}
      </span>
      <span className="rule-tick" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
    </label>
  );
}

/** How the commands start: its starts as chips, then the listed ones, locked under Allow. */
function Starts(props: {
  readonly options: NewRuleOptions;
  readonly draft: RuleDraft;
  readonly every: boolean;
  readonly onToggle: (start: string) => void;
}) {
  const { options, draft } = props;
  const locked = draft.answer === "allow";
  const picked = draft.starts.filter((start) => !locked || !neverStart(start));
  return (
    <>
      <div className="asking-part-h">
        <h4>{STARTS_HEADING}</h4>
        <span className="perms-right" data-testid="rule-picked">
          {picked.length} picked
        </span>
      </div>
      <div className="rule-chips" data-answer={draft.answer} data-testid="rule-chips">
        {options.starts.map((start) => (
          <StartChip
            key={start}
            start={start}
            on={draft.starts.includes(start)}
            onToggle={() => props.onToggle(start)}
          />
        ))}
        {options.never.map((start) => (
          <StartChip
            key={start}
            start={start}
            never
            locked={locked}
            on={!locked && draft.starts.includes(start)}
            onToggle={() => props.onToggle(start)}
          />
        ))}
      </div>
      {options.starts.length === 0 && (
        <p className="asking-note">
          {props.every
            ? "No harness has asked to run a command yet."
            : "It hasn't asked to run a command yet."}
        </p>
      )}
      <p className="asking-note">{startsNote(draft.answer)}</p>
    </>
  );
}

/** What it would have done: the count, in words, the dots and their key. */
function Preview(props: { readonly preview: RulePreview; readonly answer: RuleAnswer }) {
  const { preview } = props;
  return (
    <div className="rule-preview" data-answer={props.answer} data-testid="rule-preview">
      <div className="rule-preview-h">
        <b className="rule-count" data-testid="rule-count">
          {preview.count}
        </b>
        <span>{preview.words}</span>
      </div>
      {preview.dots.length > 0 && (
        <span className="rule-dots" aria-hidden="true">
          {preview.dots.map((dot, at) => (
            <i
              // biome-ignore lint/suspicious/noArrayIndexKey: a dot's place is the ask's order.
              key={at}
              data-dot={dot}
              style={{ "--at": at } as CSSProperties}
            />
          ))}
        </span>
      )}
      <span className="rule-key">
        {PREVIEW_KEY.map((each) => (
          <span key={each.dot}>
            <i data-dot={each.dot} />
            {each.words}
          </span>
        ))}
      </span>
    </div>
  );
}

function StartChip(props: {
  readonly start: string;
  readonly on: boolean;
  readonly never?: boolean | undefined;
  readonly locked?: boolean | undefined;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="rule-chip"
      aria-pressed={props.on}
      data-never={props.never === true ? "true" : undefined}
      disabled={props.locked === true}
      title={props.locked === true ? "Never gets a standing yes" : undefined}
      onClick={props.onToggle}
      data-testid={`rule-chip-${props.start}`}
    >
      {props.locked === true && <Icon name="lock" size={11} />}
      <span>{props.start}</span>
    </button>
  );
}
