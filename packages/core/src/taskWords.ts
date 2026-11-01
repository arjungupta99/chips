/**
 * A harness's queued turn, read out of the one message it edits while it works.
 *
 * A turn a person starts in a room draws its work as that room's run, and the room draws the run
 * itself (`Thinking.tsx`). A turn that runs LATER, out of the harness's own queue, has no run to
 * draw on: the message was answered with a receipt, the room went quiet, and the work shows as
 * ONE message edited in place — `💭 what it is thinking`, a `▸ tool · what it was given` for each
 * of the last calls, `⏳ where it is stuck`, and at the end `💭 Worked 25s · 2 steps` (Jacobian's
 * `src/channels/chips/task-bubble.ts`, the same shape it sends to Telegram, Slack and Discord).
 *
 * Drawn as the markdown it is, that comes out an emoji, a runtime's own id for a tool, and a
 * column of triangles — `▸ local-dev__serve · stop` (Arjun, 20 September 2026, watching the game
 * of life restart itself). Read first, it is the same thing the thinking bubble says, and the
 * room can say it the same way.
 *
 * A convention and not a wire format, so it is read strictly and given up on cheaply: a message
 * with no thought line is not a task bubble, and neither is one with a line under it that is
 * neither a call nor a pulse. Anything that is not one is still drawn as the markdown it is, so a
 * harness that stops sending this, or a person who opens a message with a thought bubble, costs
 * nothing but the reading.
 */

/** What the harness marks each part of it with, and has in every channel it talks in. */
const THOUGHT = "💭";
const CALL = "▸";
const STUCK = "⏳";
/**
 * What makes the last edit a receipt rather than a thought. The harness writes the elapsed time
 * and the count itself — `Worked 25s · 2 steps` — and the room says it in its own register
 * rather than re-reading it.
 */
const WORKED = /^Worked\b/u;

export interface TaskBubble {
  /**
   * The line held above the work for the whole turn and in the receipt: what a queued question
   * from a Space inside asked. A bubble with one is shown even when the work was nothing.
   */
  readonly headline: string | undefined;
  /** What it is thinking now; undefined once the turn has ended. */
  readonly thought: string | undefined;
  /** The calls it has made, oldest first, as the harness named them. */
  readonly steps: readonly string[];
  /** Where the turn is stuck, as the pulse put it. Replaced, never added to. */
  readonly stuck: string | undefined;
  /** How long the work took, once it is over; undefined while it goes on. */
  readonly worked: string | undefined;
}

/** What the message says, or nothing at all if it does not have this shape exactly. */
export function readTaskBubble(text: string): TaskBubble | undefined {
  const lines = text.split("\n").map((line) => line.trim());
  const at = lines.findIndex((line) => line.startsWith(THOUGHT));
  if (at < 0) return undefined;
  const said = (lines[at] ?? "").slice(THOUGHT.length).trim();
  if (said === "") return undefined;
  const above = lines.slice(0, at);
  // A call or a pulse above the thought is not this shape; it is a message that mentions one.
  if (above.some((line) => line.startsWith(CALL) || line.startsWith(STUCK))) return undefined;
  const below = readBelow(lines.slice(at + 1));
  if (below === undefined) return undefined;
  const done = WORKED.test(said);
  const headline = above.join("\n").trim();
  return {
    headline: headline === "" ? undefined : headline,
    thought: done ? undefined : said,
    worked: done ? said : undefined,
    ...below,
  };
}

/**
 * What stands under the thought: the calls it has made and where it is stuck. Nothing at all if
 * a line is neither, which is how a message that merely opens with a thought bubble is told from
 * one of these.
 */
function readBelow(
  lines: readonly string[],
): { readonly steps: string[]; readonly stuck: string | undefined } | undefined {
  const steps: string[] = [];
  let stuck: string | undefined;
  for (const line of lines) {
    if (line === "") continue;
    if (line.startsWith(CALL)) {
      const step = line.slice(CALL.length).trim();
      if (step !== "") steps.push(step);
      continue;
    }
    if (!line.startsWith(STUCK)) return undefined;
    stuck = line.slice(STUCK.length).trim() || undefined;
  }
  return { steps, stuck };
}
