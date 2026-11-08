/**
 * A command on its card (ADR 0280): one part to a line, the way Chips reads it, each line led by
 * how it follows the one before (`›` after `;` or `&&`, `|` for a pipe), in place of the command
 * said twice, once cut off in the headline and once as JSON.
 *
 * The words a standing yes would remember are in bold, and under Always they light up gold in
 * their place, one after another, which is what Always keeps. Output thrown away is struck
 * through; a write into a file and a part on the never list are in red, and the line where the
 * choices would be names the same words. A pass of light goes down it as it opens, when the card
 * says so (`sweep`): an open ask drawn for the first time, not a room opened again. The phone's
 * plate is the same (`apps/mobile/src/needs/CommandPlate.tsx`).
 */

import type { Plate, PlateBit, PlateJoint } from "@chipschat/core";
import { plateCaption } from "@chipschat/core";
import type { CSSProperties } from "react";

/** How a screen reader says how a line follows the one before. */
function said(joint: PlateJoint): string {
  if (joint === "pipe") return "piped to ";
  return joint === "first" ? "" : "then ";
}

export function CommandPlate({
  plate,
  lit,
  sweep,
}: {
  readonly plate: Plate;
  readonly lit: boolean;
  readonly sweep: boolean;
}) {
  const caption = plateCaption(plate);
  return (
    <div className="plate-wrap">
      <ol
        className="plate"
        aria-label="The command, a part to a line"
        data-lit={lit ? "true" : undefined}
        data-sweep={sweep ? "true" : undefined}
        data-testid="command-plate"
      >
        {plate.parts.map((part, index) => (
          <li
            // A command's parts have no ids, and their order is the command's.
            // biome-ignore lint/suspicious/noArrayIndexKey: a part is only ever itself.
            key={index}
            className="plate-part"
            data-testid="plate-part"
            aria-label={`${said(part.joint)}${part.bits.map((bit) => bit.text).join(" ")}`}
          >
            <span className="plate-rail" aria-hidden="true">
              {part.joint === "pipe" ? "|" : "›"}
            </span>
            <code>
              {runsOf(part.bits).map((run, at, runs) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a run is only ever itself.
                <Bit key={at} bit={run} last={at === runs.length - 1} />
              ))}
            </code>
          </li>
        ))}
      </ol>
      {caption !== undefined && (
        <p className="plate-caption" data-testid="plate-caption">
          <Words text={caption} />
        </p>
      )}
    </div>
  );
}

/** Words run together where a line marks them as one: `git log`, `rm -rf`. */
type Run = PlateBit;

function runsOf(bits: readonly PlateBit[]): Run[] {
  const runs: Run[] = [];
  for (const bit of bits) {
    const last = runs[runs.length - 1];
    if (
      last !== undefined &&
      last.kind === bit.kind &&
      (bit.kind === "start" || bit.kind === "never")
    ) {
      runs[runs.length - 1] = { ...last, text: `${last.text} ${bit.text}` };
    } else runs.push(bit);
  }
  return runs;
}

/** One run of a line, marked by what it is, and the space after it. */
function Bit({ bit, last }: { readonly bit: Run; readonly last: boolean }) {
  const after = last ? "" : " ";
  if (bit.kind === "word") return <>{bit.text + after}</>;
  if (bit.kind === "start") {
    return (
      <>
        <span className="plate-start" style={{ "--i": bit.order } as CSSProperties}>
          {bit.text}
        </span>
        {after}
      </>
    );
  }
  return (
    <>
      <span className={`plate-${bit.kind}`} data-testid={`${bit.kind}-words`}>
        {bit.text}
      </span>
      {after}
    </>
  );
}

/** Words with their `code` spans in mono: the caption's, and the line that keeps it to once. */
function Words({ text }: { readonly text: string }) {
  const parts = text.split(/(`[^`]+`)/);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          // A split's pieces have no ids, and their order is the sentence's.
          // biome-ignore lint/suspicious/noArrayIndexKey: a piece is only ever itself.
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          part
        ),
      )}
    </>
  );
}
