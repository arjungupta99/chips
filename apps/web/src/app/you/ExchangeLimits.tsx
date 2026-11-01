/**
 * When Chips steps in on agents talking to each other (ADR 0187): a card under the workspace's
 * heading, the phone's sheet laid out for a wide screen. Why it is there, then the stop, the
 * circles switch and the hold, each number four choices, Other and Never, the settings as one
 * sentence, and how Chips counts behind a disclosure. A hold picked at or under the stop takes the
 * stop down to fit; Save shows once the card says something new and whole.
 */

import {
  LIMITS_CHOICES,
  LIMITS_HOW,
  LIMITS_RANGES,
  LIMITS_SETTINGS,
  LIMITS_WHY,
  type LimitsDraft,
  limitsDraft,
  limitsFoot,
  limitsFromDraft,
  limitsSentence,
  pickLimit,
  sameLimits,
  stopFits,
} from "@chipschat/core";
import { DEFAULT_EXCHANGE_LIMITS, type ExchangeLimits } from "@chipschat/protocol";
import { Button } from "@chipschat/ui";
import { useEffect, useState } from "react";
import { Card, Problem, Row, Segmented, Switch } from "./controls.tsx";

type Kind = "stop" | "hold";

export function ExchangeLimitsCard(props: {
  readonly limits: ExchangeLimits;
  readonly onSave: (limits: ExchangeLimits) => void;
}) {
  const { limits, onSave } = props;
  const [draft, setDraft] = useState<LimitsDraft>(() => limitsDraft(limits));
  // The server's word replaces the draft: what was saved, on any device, is what the card shows.
  useEffect(() => setDraft(limitsDraft(limits)), [limits]);
  const read = limitsFromDraft(draft);
  const ready = "limits" in read && !sameLimits(read.limits, limits);
  const foot = limitsFoot(draft);
  const pick = (kind: Kind, value: string) => setDraft(pickLimit(draft, kind, value).draft);
  const type = (kind: Kind, typed: string) =>
    setDraft(
      pickLimit({ ...draft, typed: { ...draft.typed, [kind]: typed } }, kind, "other").draft,
    );

  return (
    <Card
      label="Messages between agents"
      testId="exchange-limits"
      title="Messages between agents"
      level={3}
    >
      <p className="you-card-note">{LIMITS_WHY}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if ("limits" in read && ready) onSave(read.limits);
        }}
      >
        <LimitNumber kind="stop" draft={draft} onPick={pick} onType={type} />
        <Row label={LIMITS_SETTINGS.circles.title} sub={LIMITS_SETTINGS.circles.words}>
          <Switch
            label={LIMITS_SETTINGS.circles.title}
            checked={draft.circles}
            onChange={(on) => setDraft({ ...draft, circles: on })}
          />
        </Row>
        <LimitNumber kind="hold" draft={draft} onPick={pick} onType={type} />
        <Row
          className="you-row-more you-exchange-words"
          label={
            <span data-testid="exchange-words">
              {limitsSentence("limits" in read ? read.limits : limits)}
            </span>
          }
        >
          {ready && (
            <Button type="submit" data-testid="save-exchange-limits">
              Save
            </Button>
          )}
        </Row>
      </form>
      {"error" in read ? (
        <Problem error={read.error} />
      ) : (
        foot.warn && <p className="you-card-note you-warn">{foot.text}</p>
      )}
      <details className="you-how" data-testid="exchange-how">
        <summary>How Chips counts</summary>
        <ul>
          {LIMITS_HOW.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
    </Card>
  );
}

/** One of the two numbers: its choices, and Other's field beside them while it is picked. */
function LimitNumber(props: {
  readonly kind: Kind;
  readonly draft: LimitsDraft;
  readonly onPick: (kind: Kind, value: string) => void;
  readonly onType: (kind: Kind, typed: string) => void;
}) {
  const { kind, draft } = props;
  const words = LIMITS_SETTINGS[kind];
  const range = LIMITS_RANGES[kind];
  const fallback = DEFAULT_EXCHANGE_LIMITS[kind];
  const options = [
    ...LIMITS_CHOICES[kind].map((value) => [String(value), String(value)] as const),
    ["other", "Other"] as const,
    ["never", "Never"] as const,
  ];
  return (
    <Row
      className="you-exchange"
      label={words.title}
      sub={`${words.words} Default ${fallback}.`}
      testId={`exchange-${kind}`}
    >
      <Segmented
        label={words.title}
        value={draft[kind]}
        options={options}
        disabled={
          kind === "stop"
            ? LIMITS_CHOICES.stop.filter((value) => !stopFits(draft, value)).map(String)
            : []
        }
        onChange={(value) => props.onPick(kind, value)}
      />
      {draft[kind] === "other" && (
        <label className="you-mb">
          <input
            type="number"
            min={range.least}
            max={range.most}
            step={1}
            aria-label={`${words.title}, a number from ${range.least} to ${range.most.toLocaleString("en-US")}`}
            data-testid={`exchange-${kind}-other`}
            value={draft.typed[kind]}
            onChange={(event) => props.onType(kind, event.target.value)}
          />
        </label>
      )}
    </Row>
  );
}
