/**
 * A film's frames, composed (ADR 0217): each beat's shots laid into the phone (and the Mac's window),
 * its words, the camera, and the arrivals the web builds draw in one frame moved on a spring
 * (`motion.mjs`). Shots within a beat dissolve into each other, and so do beats. Every frame is a
 * screenshot of the scene page (`scene.html`), laid out at 1080 × 1920 and drawn at twice that, so
 * the camera's lean and the phone's screen are resampled at four times the pixels the film keeps.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { arrivalAt, changesOf, FPS, meanDiffs, SPAN, smooth } from "./motion.mjs";
import { PHONE_SCALE } from "./shoot.mjs";

/** Pixels a point of the scene: its frames are 2160 × 3840, encoded down to the film's 1080 × 1920. */
export const SCENE_SCALE = 2;

/** Frames over which the last of one shot dissolves into the next, and one beat into the next. */
const JOIN = 16;
const OVER = 24;

const framesOf = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => `${dir}/${f}`);

/**
 * How unlike each frame of a shot is to the one after it. Chromium writes some frames with alpha
 * and some without, so the measure keeps to the first frame's format, or it stops where it changes.
 */
export function diffsOf(dir) {
  return measured(`${dir}/%05d.png`, `${dir}.diff.txt`);
}

/**
 * How unlike each frame of a film or a shot (`input`, anything ffmpeg reads) is to the one after it,
 * on a copy 290 pixels wide, kept in `file` and read from there if it is already measured.
 */
export function measured(input, file) {
  if (!existsSync(file)) {
    const ran = spawnSync("ffmpeg", [
      "-loglevel",
      "error",
      "-reinit_filter",
      "0",
      "-i",
      input,
      "-vf",
      `scale=290:-1,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${file}`,
      "-f",
      "null",
      "-",
    ]);
    if (ran.status !== 0) throw new Error(`ffmpeg could not measure ${input}`);
  }
  return meanDiffs(readFileSync(file, "utf8"));
}

/** Whether the app moves something of its own in the frames an arrival at `at` would take. */
function moves(diffs, found, at, real) {
  for (let i = at + 1; i < Math.min(at + SPAN, real); i += 1) {
    if (diffs[i - 1] > 1 && !found.includes(i)) return true;
  }
  return false;
}

/** A shot's frames, held on its last a while, and where its state changed at once. */
async function prepare(page, shot, dir, served, log) {
  const files = framesOf(dir);
  const real = files.length;
  for (let n = 0; n < Math.round((shot.hold ?? 0) * FPS); n += 1) files.push(files[real - 1]);
  const prepared = { files, events: [], moves: new Map() };
  if (shot.app === "mac") return prepared;
  const diffs = diffsOf(dir);
  const found = changesOf(diffs, real);
  for (const at of found) {
    const measured = await page.evaluate(
      ([a, b]) => window.measure(a, b),
      [served(files[at - 1]), served(files[at])],
    );
    // A list moves on a spring only over frames that stand still: while the app moves something of
    // its own (a sheet sliding up), the spring would hold that still and let it jump at its end. A
    // move of a point or two is no arrival either. Those dissolve where they stand.
    const tiny = Math.abs(measured.shift) < 3 * PHONE_SCALE;
    if (tiny || moves(diffs, found, at, real)) prepared.moves.set(at, { shift: 0 });
    else prepared.moves.set(at, measured);
  }
  // A change that moves nothing, landing while a line is still arriving, rides along with it.
  const moving = (e) => prepared.moves.get(e).shift !== 0;
  prepared.events = found.filter(
    (at) => moving(at) || !found.some((e) => e < at && at < e + SPAN && moving(e)),
  );
  const listed = prepared.events.map((e) => `${e}(${prepared.moves.get(e).shift})`).join(" ");
  log(`  ${dir.split("/").pop()}: ${real} frames, arrivals ${listed || "none"}`);
  return prepared;
}

/** What an arrival draws at frame `i` of a shot, if one is under way. */
function moveAt(shot, i, served) {
  const at = shot.events.filter((e) => e <= i && i < e + SPAN).pop();
  if (at === undefined) return undefined;
  const found = shot.moves.get(at);
  return {
    before: served(shot.files[at - 1]),
    shift: found.shift,
    runs: found.runs ?? [],
    bubble: found.bubble ?? 0,
    ...arrivalAt(i - at + 1),
  };
}

/** What the scene draws for frame `i` of a beat whose shots are `prepared`. */
function phoneFrame(prepared, mac, i, served) {
  let s = 0;
  let j = i;
  while (j >= prepared[s].files.length) j -= prepared[s++].files.length;
  const f = { src: served(prepared[s].files[j]), move: moveAt(prepared[s], j, served) };
  if (s > 0 && j < JOIN)
    f.join = { src: served(prepared[s - 1].files.at(-1)), a: 1 - smooth(j / JOIN) };
  if (mac !== undefined) f.macSrc = served(mac[Math.min(i, mac.length - 1)]);
  return f;
}

/** One beat's frames, numbered on from `made.frame`; answers its first frame and its length. */
async function composeBeat(page, beats, b, made, { shots, served, out, log }) {
  const beat = beats[b];
  const prepared = [];
  for (const [s, shot] of (beat.shots ?? []).entries()) {
    prepared.push(await prepare(page, shot, shots(b, s), served, log));
  }
  const mac = beat.mac === undefined ? undefined : framesOf(shots(b, "mac"));
  const length =
    beat.layout === "end"
      ? Math.round(beat.seconds * FPS)
      : prepared.reduce((n, s) => n + s.files.length, 0);
  await page.evaluate((each) => window.setup(each), {
    ...beat,
    intro: b === 0,
    outro: b === beats.length - 1,
  });
  const start = made.frame;
  for (let i = 0; i < length; i += 1) {
    const drawn = beat.layout === "end" ? {} : phoneFrame(prepared, mac, i, served);
    const over =
      b > 0 && i < OVER ? { src: served(made.last), a: 1 - smooth(i / OVER) } : undefined;
    const f = { t: i / FPS, T: length / FPS, gt: made.frame / FPS, ...drawn, over };
    await page.evaluate((each) => window.render(each), f);
    const path = `${out}/${String(made.frame).padStart(5, "0")}.png`;
    await page.screenshot({ path });
    made.last = path;
    made.frame += 1;
  }
  log(`  beat ${b + 1} (${beat.key}): ${length} frames`);
  return { beat, start, length };
}

/**
 * The beats' frames into `out`, numbered from 0, with the scene served at `scene` and the shots'
 * frames at `served(path)`. Answers how many, and each beat's first frame and length.
 */
export async function compose(browser, { beats, shots, scene, served, out, log = () => {} }) {
  mkdirSync(out, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: SCENE_SCALE,
  });
  await page.goto(`${scene}/scene.html`);
  await page.waitForFunction(() => window.ready === true);
  const made = { frame: 0, last: undefined };
  const timeline = [];
  for (let b = 0; b < beats.length; b += 1) {
    timeline.push(await composeBeat(page, beats, b, made, { shots, served, out, log }));
  }
  await page.close();
  return { frames: made.frame, timeline };
}
