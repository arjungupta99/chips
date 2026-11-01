/**
 * The film's motion, worked out from the frames the shots saved (ADR 0217). The app's web builds
 * draw a new message in a single frame, where the phone moves its list; the composer finds each such
 * change and moves it on a spring: the list slides by the distance the new line took, and only the
 * rows that changed are drawn again, fading in. Pure, on grey images (`{ w, h, g }`, one value a
 * pixel), so the scene page and the tests run the same code.
 *
 * Distances are in the frame's pixels unless said otherwise; the phone's layout is 393 points wide,
 * and `k` is the frame's pixels a point.
 */

export const FPS = 60;
/** How many frames an arrival takes, and how stiff its spring is. */
export const SPAN = 30;
export const OMEGA = 16;
/** A room's list in points: under its header, over its composer, on a 393 × 852 phone. */
export const LIST = { top: 123, bottom: 742 };
/** The room's header, in points: a list that scrolled keeps it, a new screen does not. */
export const HEADER = { top: 68, bottom: 123 };
/** The room's ground (#0f1013), as grey. */
export const GROUND = 16;

export const smooth = (v) => v * v * (3 - 2 * v);
const settle = (s) => 1 - (1 + OMEGA * s) * Math.exp(-OMEGA * s);

/** Where an arrival's spring stands `frames` frames in, 0 to 1: landing exactly on its last frame. */
export function spring(frames) {
  return Math.min(1, settle(frames / FPS) / settle(SPAN / FPS));
}

/**
 * The mean differences an ffmpeg `signalstats` print holds, a frame a line. A frame almost the same as
 * the one before prints in exponent form (`1.89147e-05`), and must be read whole: read as 1.89 it is a
 * change, and the composer dissolves into it.
 */
export function meanDiffs(text) {
  return [...text.matchAll(/YAVG=([\d.]+(?:e[-+]?\d+)?)/g)].map((m) => Number(m[1]));
}

/**
 * The frames where a shot's state changed at once: much changed, with nothing moving either side;
 * or far more than either side, on a screen that never sits still (search's faces glow) or as a
 * sheet comes to rest (Not right?'s reason picked as it settles); or over two frames with nothing
 * moving either side of both, as a page popped back to the one under it lands (its header first,
 * then the page). `diffs[i]` is how unlike frame i + 1 is to frame i, as ffmpeg's mean
 * difference. A change over two frames is found at its first.
 */
export function changesOf(diffs, frames) {
  const at = (i) => diffs[i - 1] ?? 0;
  const still = (i) => at(i) < 0.5;
  const found = [];
  for (let i = 1; i < frames - 1; i += 1) {
    const [was, now, next] = [at(i - 1), at(i), at(i + 1)];
    if ((now > 1 && still(i - 1) && still(i + 1)) || (now > 3 && now > 3 * was && now > 3 * next)) {
      found.push(i);
    } else if (now > 1 && next > 1 && still(i - 1) && still(i + 2)) {
      found.push(i);
      i += 1;
    }
  }
  return found;
}

/** How unlike two frames are, row by row from `top` to `bottom`, with `after` read `shift` lower. */
function unlike(before, after, top, bottom, shift, stepY, stepX) {
  const { w, g: a } = before;
  const b = after.g;
  let sum = 0;
  let n = 0;
  for (let y = Math.max(top, top - shift); y < Math.min(bottom, bottom - shift); y += stepY) {
    for (let x = 0; x < w; x += stepX) {
      sum += Math.abs(b[y * w + x] - a[(y + shift) * w + x]);
      n += 1;
    }
  }
  return n === 0 ? Number.POSITIVE_INFINITY : sum / n;
}

/**
 * How far the list moved between two frames, on small copies of them: `after(y)` is `before(y +
 * shift)`, up as a line arrives and down as one goes. With how well that fits, as a mean grey
 * difference: a poor fit is a screen that changed, not a list that moved.
 */
export function fitShift(before, after, band, most) {
  let best = 0;
  let low = unlike(before, after, band.top, band.bottom, 0, 1, 2);
  for (let d = -most; d <= most; d += 1) {
    if (d === 0) continue;
    const e = unlike(before, after, band.top, band.bottom, d, 1, 2);
    if (e < low - 0.01) {
      low = e;
      best = d;
    }
  }
  return { shift: best, error: low };
}

/** How unlike two frames' headers are: a list that scrolled keeps its header. */
export function headerDiff(before, after, header) {
  return unlike(before, after, header.top, header.bottom, 0, 1, 1);
}

/** The shift found on small copies, set to the pixel it is at full size. */
function refined(before, after, band, rough) {
  let shift = rough;
  let low = unlike(before, after, band.top, band.bottom, shift, 2, 3);
  for (let d = rough - 4; d <= rough + 4; d += 1) {
    const e = unlike(before, after, band.top, band.bottom, d, 2, 3);
    if (e < low) {
      low = e;
      shift = d;
    }
  }
  return shift;
}

/** How near anything within a pixel of `before`'s (x, yb) is to `after`'s (x, y). */
function nearest(before, after, x, y, yb) {
  const { w } = before;
  const value = after.g[y * w + x];
  let near = 255;
  for (let dy = -1; dy <= 1 && near > 24; dy += 1) {
    const row = (yb + dy) * w;
    for (let dx = -1; dx <= 1; dx += 1)
      near = Math.min(near, Math.abs(value - before.g[row + x + dx]));
  }
  return near;
}

/** Whether row `y` of `after` is unlike row `y + shift` of `before`, or new under it. */
function rowChanged(before, after, band, shift, y) {
  const yb = y + shift;
  if (yb >= band.bottom || yb < band.top) return true;
  let n = 0;
  for (let x = 1; x < before.w - 1; x += 2) if (nearest(before, after, x, y, yb) > 24) n += 1;
  return n > 2;
}

/** The changed rows as runs, `[from, to)`, those nearer than `gapRows` joined. */
function runsOf(changed, band, gapRows) {
  const runs = [];
  let from = -1;
  for (let y = band.top; y <= band.bottom; y += 1) {
    const is = y < band.bottom && changed(y);
    if (is && from < 0) from = y;
    if (is || from < 0) continue;
    const last = runs[runs.length - 1];
    if (last !== undefined && from - last[1] < gapRows) last[1] = y;
    else runs.push([from, y]);
    from = -1;
  }
  return runs;
}

/** Whether a frame's row is bare ground beside the faces. */
function bare(image, band, faces, y) {
  if (y < band.top || y >= band.bottom) return true;
  for (let x = faces; x < image.w; x += 2)
    if (Math.abs(image.g[y * image.w + x] - GROUND) > 6) return false;
  return true;
}

/**
 * The rows of the list that are not the same once it has moved, at the frame's full size: `after(y)`
 * unlike `before(y + shift)`, or new under what was there. The shift, found on small copies, is
 * first set to the pixel it is here. A pixel is unlike only if nothing within a pixel of its place
 * before is like it, since the web build draws a moved line a fraction of a pixel off.
 *
 * Runs of such rows come back a little wider than the rows, near ones joined. A run a bubble high or
 * more is taken out to the ground between bubbles in both frames (beside the faces, which stand by a
 * group's last bubble): cut through a bubble's rounded edge, the old one left a sliver over the new.
 */
export function changedRuns(before, after, band, rough, k) {
  const shift = refined(before, after, band, rough);
  const runs = runsOf((y) => rowChanged(before, after, band, shift, y), band, Math.round(7 * k));
  const faces = Math.round(45 * k);
  const gap = (y) => bare(after, band, faces, y) && bare(before, band, faces, y + shift);
  const sizes = { pad: Math.round(3 * k), bubble: Math.round(40 * k), reach: Math.round(36 * k) };
  const out = [];
  for (const run of runs) {
    const [y0, y1] = widened(run, band, gap, sizes);
    const last = out[out.length - 1];
    if (last !== undefined && y0 <= last[1]) last[1] = Math.max(last[1], y1);
    else out.push([y0, y1]);
  }
  return { shift, runs: out, bubble: sizes.bubble };
}

/** A run a little wider than its rows; a bubble high or more, out to the ground either side. */
function widened([r0, r1], band, gap, { pad, bubble, reach }) {
  let y0 = Math.max(band.top, r0 - pad);
  let y1 = Math.min(band.bottom, r1 + pad);
  if (y1 - y0 <= bubble) return [y0, y1];
  for (let n = 0; n < reach && y0 > band.top && !gap(y0); n += 1) y0 -= 1;
  for (let n = 0; n < reach && y1 < band.bottom && !gap(y1 - 1); n += 1) y1 += 1;
  return [y0, y1];
}

/**
 * What an arrival draws `frames` frames in: how far the spring has gone, the dissolve of what
 * changed in place, and, for a bubble or more, the old dipping to the ground before the new comes up.
 */
export function arrivalAt(frames) {
  return {
    p: spring(frames),
    fade: smooth(Math.min(1, frames / FPS / 0.14)),
    out: Math.min(1, frames / 4),
    in: smooth(Math.min(1, Math.max(0, (frames - 2) / 10))),
  };
}

/**
 * Frames that change far more than both neighbours, from a whole film's mean differences: a jump
 * the eye sees. `diffs[i]` is how unlike frame i + 1 is to frame i.
 */
export function loneJumps(diffs, least = 2) {
  const jumps = [];
  for (let i = 1; i < diffs.length - 1; i += 1) {
    const v = diffs[i];
    if (v > least && v > 3 * diffs[i - 1] && v > 3 * diffs[i + 1]) jumps.push(i);
  }
  return jumps;
}
