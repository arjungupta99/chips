/**
 * A context file's row (ADR 0135), as the phone draws it: the tile its role picks, its title, its
 * file's name and line under it, and a tag for what is not simply the agent's own: **Shared** with
 * its harness's mark, **Its own** in gold once it was given one in place of a shared file, **Read
 * only** with a lock. A row that was just saved flashes gold as the page comes back.
 */

import {
  CONTEXT_GROUND_INDEX,
  CONTEXT_MARKS,
  type ContextIcon,
  type ContextRow,
  type ContextTag,
  type LinkedWords,
} from "@chipschat/core";
import type { ContextRole } from "@chipschat/protocol";
import { faceGround, groundVar, Icon, type IconName } from "@chipschat/ui";
import type { ReactNode } from "react";

const ICON: Readonly<Record<ContextIcon, IconName>> = {
  sparkle: "sparkle",
  list: "list",
  person: "user",
  drawers: "drawers",
  page: "doc",
};

/** A role's icon and the colour of its tile: the same grounds as the phone's, by index. */
export function markOf(role: ContextRole): { readonly icon: IconName; readonly tint: string } {
  const mark = CONTEXT_MARKS[role];
  return { icon: ICON[mark.icon], tint: groundVar(CONTEXT_GROUND_INDEX[mark.ground]) };
}

/** A harness's squircle, small and without its letters: where a file came from, and whose page. */
export function HarnessMark({ name, side }: { readonly name: string; readonly side: number }) {
  return (
    <span
      className="ctx-harness-mark"
      style={{ width: side, height: side, background: faceGround(name, undefined) }}
      aria-hidden="true"
    />
  );
}

/** A tile for a role: its icon, white, on its ground. */
export function RoleTile({
  role,
  side = 30,
}: {
  readonly role: ContextRole;
  readonly side?: number;
}) {
  const mark = markOf(role);
  return (
    <span
      className="ctx-tile"
      style={{ width: side, height: side, background: mark.tint }}
      aria-hidden="true"
    >
      <Icon name={mark.icon} size={Math.round(side * 0.62)} />
    </span>
  );
}

const TAG_WORDS: Readonly<Record<ContextTag, string>> = {
  shared: "Shared",
  own: "Its own",
  read_only: "Read only",
};

/** What is not simply the agent's own about a file. */
export function Tag({
  tag,
  harnessName,
}: {
  readonly tag: ContextTag | undefined;
  readonly harnessName: string;
}) {
  if (tag === undefined) return null;
  return (
    <span className="ctx-tag" data-tag={tag} data-testid={`tag-${tag}`}>
      {tag === "shared" && <HarnessMark name={harnessName} side={16} />}
      {tag === "read_only" && <Icon name="lock" size={13} />}
      {TAG_WORDS[tag]}
    </span>
  );
}

/**
 * The gold under a row that was just saved: lit at once, held a beat, then gone, as the phone's
 * landing does. Each new `pulse` lights it again; still for Reduce Motion (the stylesheet's).
 */
export function Glow({ pulse }: { readonly pulse: number }) {
  if (pulse === 0) return null;
  return <span key={pulse} className="ctx-glow" data-testid="context-flash" aria-hidden="true" />;
}

export function FileRow({
  row,
  harnessName,
  pulse = 0,
  trailing,
  onOpen,
}: {
  readonly row: ContextRow;
  readonly harnessName: string;
  readonly pulse?: number;
  /** In the tag's place: on a harness's card, how many of its agents read it. */
  readonly trailing?: ReactNode;
  readonly onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className="ctx-row"
        onClick={onOpen}
        data-testid={`context-row-${row.name}`}
      >
        <Glow pulse={pulse} />
        <RoleTile role={row.role} />
        <span className="ctx-row-words">
          <span className="ctx-row-title">{row.title}</span>
          <span className="ctx-row-line">
            <span className="ctx-row-file">{row.name}</span>
            {row.line === "" ? "" : ` · ${row.line}`}
          </span>
        </span>
        {trailing ?? <Tag tag={row.tag} harnessName={harnessName} />}
        <span className="ctx-row-chev" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

/** The quiet last row past the eighth file: how many Chips leaves out, and which. */
export function NotShownRow({ title, line }: { readonly title: string; readonly line: string }) {
  return (
    <li className="ctx-row ctx-row-quiet" data-testid="context-not-shown">
      <span className="ctx-tile ctx-tile-quiet" aria-hidden="true">
        <Icon name="more" size={18} />
      </span>
      <span className="ctx-row-words">
        <span className="ctx-row-title">{title}</span>
        <span className="ctx-row-line">{line}</span>
      </span>
    </li>
  );
}

/** A foot with a link in it, the link in the system's blue. */
export function LinkedFoot({
  words,
  onLink,
  testId,
}: {
  readonly words: LinkedWords;
  readonly onLink: () => void;
  readonly testId?: string;
}) {
  return (
    <p className="ctx-foot" data-testid={testId}>
      {words.before}
      {words.link !== undefined && (
        <button
          type="button"
          className="ctx-link"
          onClick={onLink}
          data-testid={testId === undefined ? undefined : `${testId}-link`}
        >
          {words.link}
        </button>
      )}
      {words.after ?? ""}
    </p>
  );
}
