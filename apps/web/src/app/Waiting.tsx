/**
 * An agent's groups before their copies come, and the ones its harness doesn't share (ADR 0238,
 * the mock's B), as the phone draws them (`apps/mobile/src/agents/Waiting.tsx`).
 *
 * A group the person will see stands in its place from the card's first frame, in its real shape:
 * the heading in words with its harness beside it, the rows as flat blank bars, held still. Only
 * the Context window moves while it waits: a light runs along its bars (`.wait-bars`). When the
 * copy lands, it comes in where the blank stood (`useLands`); the gauge's fill climbs and its
 * number counts up (`WindowGroup`'s `climb`).
 *
 * A group its harness doesn't share keeps its heading, with one quiet line that says so.
 */

import { SETTING_HEADINGS, type SettingGroup, WINDOW_BARS } from "@chipschat/core";
import { type Ref, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { HarnessMark } from "./context/rows.tsx";

/** One blank row: a mark or none, a label's bar and maybe a sub's, and what stands at its right. */
export interface BlankRow {
  readonly mark?: boolean;
  /** How long the label's bar is, in percent of the words' room. */
  readonly label: number;
  readonly sub?: number;
  readonly trailing?: "switch" | "value";
}

const PLACES = Array.from({ length: WINDOW_BARS }, (_, at) => at);

function Heading({
  group,
  harnessName,
  testID,
}: {
  readonly group: SettingGroup;
  readonly harnessName: string;
  readonly testID: string;
}) {
  return (
    <div className="ctx-h">
      <h2 className="agents-h">{SETTING_HEADINGS[group]}</h2>
      <span className="ctx-from" data-testid={`${testID}-from`}>
        <HarnessMark name={harnessName} side={14} />
        {harnessName}
      </span>
    </div>
  );
}

function Row({ row }: { readonly row: BlankRow }) {
  return (
    <li className="ctx-row wait-row">
      {row.mark && <span className="wait-mark" />}
      <span className="ctx-row-words">
        <i className="wait-bar wait-label" style={{ width: `${row.label}%` }} />
        {row.sub !== undefined && (
          <i className="wait-bar wait-sub" style={{ width: `${row.sub}%` }} />
        )}
      </span>
      {row.trailing === "switch" && <span className="wait-switch" />}
      {row.trailing === "value" && <i className="wait-bar wait-value" />}
    </li>
  );
}

function Foot({ lines }: { readonly lines: readonly number[] }) {
  if (lines.length === 0) return null;
  return (
    <p className="ctx-foot wait-foot">
      {lines.map((width, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the lines never move.
        <i key={at} className="wait-bar wait-line" style={{ width: `${width}%` }} />
      ))}
    </p>
  );
}

/** How long a group takes to grow to its copy's size as it lands, on the card's easing. */
const LAND_MS = 200;
const EASE_OUT = "cubic-bezier(0.215, 0.61, 0.355, 1)";

/**
 * A group's copy landing where its blank stood (ADR 0238's addendum: "it needs to transition appear
 * in", Arjun, 28 October 2026), as the phone's does: the group grows from the blank's height to its
 * own, clipped, so what is under it moves down with it rather than jumping, while what is under
 * its heading fades in (`.ctx.lands`). A copy there from the first frame, as a kept one is, is
 * drawn as it is, and under Reduce Motion it lands at once.
 *
 * `blank` goes on the blank and `copy` on what takes its place.
 */
export function useLands(standing: boolean): {
  readonly blank: RefObject<HTMLElement | null>;
  readonly copy: RefObject<HTMLElement | null>;
  readonly lands: boolean;
} {
  const blank = useRef<HTMLElement | null>(null);
  const copy = useRef<HTMLElement | null>(null);
  const height = useRef<number | undefined>(undefined);
  const [stood, setStood] = useState(standing);
  if (standing && !stood) setStood(true);
  useLayoutEffect(() => {
    if (standing) {
      height.current = blank.current?.offsetHeight;
      return;
    }
    const from = height.current;
    const place = copy.current;
    height.current = undefined;
    if (from === undefined || place === null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true) return;
    const to = place.offsetHeight;
    if (to === from || typeof place.animate !== "function") return;
    place.style.overflow = "clip";
    const growing = place.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: LAND_MS,
      easing: EASE_OUT,
    });
    const done = () => {
      place.style.overflow = "";
    };
    growing.onfinish = done;
    growing.oncancel = done;
  }, [standing]);
  return { blank, copy, lands: stood && !standing };
}

/** A group on its way: its heading, and blank rows in its rows' shape. */
export function WaitingGroup({
  group,
  harnessName,
  agentName,
  rows,
  foot = [],
  testID,
  place,
}: {
  readonly group: SettingGroup;
  readonly harnessName: string;
  readonly agentName: string;
  readonly rows: readonly BlankRow[];
  readonly foot?: readonly number[];
  readonly testID: string;
  /** Where its height is read, for its copy to grow from (`useLands`). */
  readonly place?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={place}
      className="ctx wait"
      aria-busy="true"
      aria-label={`Asking ${harnessName} for ${agentName}'s ${SETTING_HEADINGS[group].toLowerCase()}`}
      data-testid={testID}
    >
      <Heading group={group} harnessName={harnessName} testID={testID} />
      <ul className="ctx-group">
        {rows.map((row, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the rows never move.
          <Row key={at} row={row} />
        ))}
      </ul>
      <Foot lines={foot} />
    </section>
  );
}

/** The Context window on its way: the gauge's shape, blank, with a light running along its bars. */
export function WaitingWindow({
  harnessName,
  agentName,
  testID = "window-waiting",
  place,
}: {
  readonly harnessName: string;
  readonly agentName: string;
  readonly testID?: string;
  readonly place?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={place}
      className="ctx cw wait"
      aria-busy="true"
      aria-label={`Asking ${harnessName} how full ${agentName}'s context is`}
      data-testid={testID}
    >
      <Heading group="window" harnessName={harnessName} testID={testID} />
      <ul className="ctx-group">
        <li className="cw-gauge">
          <div className="cw-top wait-top">
            <i className="wait-bar wait-big" />
            <i className="wait-bar wait-tokens" />
          </div>
          <div className="cw-bars wait-bars" data-testid={`${testID}-bars`}>
            {PLACES.map((place) => (
              <i key={place} style={{ ["--k" as string]: String(place) }} />
            ))}
          </div>
          <div className="cw-act">
            <span className="cw-note">
              <i className="wait-bar wait-sub" style={{ width: "70%" }} />
            </span>
            <span className="wait-pill" />
          </div>
        </li>
        <Row row={{ label: 34, sub: 62 }} />
      </ul>
      <Foot lines={[94, 90, 46]} />
    </section>
  );
}

/** A group its harness doesn't share: the heading, and a line that says so. */
export function NotShared({
  group,
  words,
  testID,
  place,
  lands = false,
}: {
  readonly group: SettingGroup;
  readonly words: string;
  readonly testID: string;
  /** Where it lands, when a blank stood for it (`useLands`). */
  readonly place?: Ref<HTMLElement>;
  readonly lands?: boolean;
}) {
  return (
    <section
      ref={place}
      className={lands ? "ctx lands" : "ctx"}
      aria-label={SETTING_HEADINGS[group]}
      data-testid={testID}
    >
      <div className="ctx-h">
        <h2 className="agents-h">{SETTING_HEADINGS[group]}</h2>
      </div>
      <p className="ctx-foot ctx-not-shared" data-testid={`${testID}-words`}>
        {words}
      </p>
    </section>
  );
}
