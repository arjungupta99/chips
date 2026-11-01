#!/usr/bin/env node
/**
 * `pnpm film [watch|agents|trouble]` (ADR 0217): render the films the app plays.
 *
 * 1. Builds the phone's web export and the web build in render mode, into a folder of their own,
 *    never the builds the apps ship.
 * 2. Shoots each beat's shots from them, frame by frame (`shoot.mjs`).
 * 3. Composes the film (`compose.mjs`, `scene.html`), and fails on any frame that jumps: of the
 *    film, and of each Mac shot by itself.
 * 4. Encodes it (H.264, 1080 × 1920, 60 fps, down from frames drawn at twice that) to
 *    `assets/film/<film>.mp4`, and records its beats,
 *    their times and words, and what it was rendered from in `assets/film/films.json`.
 *
 * It needs ffmpeg on this machine. The shots and frames are kept in the system's temporary folder
 * (`chips-film/`) until the next render; `--again` composes again from them, building and shooting
 * nothing.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { compose, diffsOf } from "./compose.mjs";
import {
  ASSETS,
  beatFiles,
  beatsOf,
  FILMS_JSON,
  ROOT,
  readFilms,
  sourceOf,
  withFilm,
} from "./films.mjs";
import { FPS, loneJumps, meanDiffs } from "./motion.mjs";
import { serve } from "./serve.mjs";
import { shoot } from "./shoot.mjs";

const log = (line) => console.log(line);

function needFfmpeg() {
  const found = spawnSync("ffmpeg", ["-version"]);
  if (found.status === 0) return;
  console.error("pnpm film needs ffmpeg on this machine: brew install ffmpeg");
  process.exit(1);
}

/** A command run to its end, its output kept in a log beside the work. */
function run(command, args, { cwd, env, logFile }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => out.push(d));
    child.on("close", (code) => {
      writeFileSync(logFile, Buffer.concat(out));
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed: see ${logFile}`));
    });
  });
}

/** Both clients in render mode, built side by side. */
async function build(work) {
  log("Building the phone's web export and the web build in render mode…");
  await Promise.all([
    run(
      "pnpm",
      [
        "exec",
        "expo",
        "export",
        "--platform",
        "web",
        "--output-dir",
        join(work, "phone"),
        "--clear",
      ],
      {
        cwd: join(ROOT, "apps", "mobile"),
        env: { EXPO_PUBLIC_FILM_SOURCE: "1" },
        logFile: join(work, "phone-build.log"),
      },
    ),
    run("pnpm", ["exec", "vite", "build", "--outDir", join(work, "web"), "--emptyOutDir"], {
      cwd: join(ROOT, "apps", "web"),
      env: { VITE_FILM_SOURCE: "1" },
      logFile: join(work, "web-build.log"),
    }),
  ]);
}

/** Jobs run two at a time. */
async function twoAtATime(jobs) {
  const queue = [...jobs];
  const lanes = [0, 1].map(async () => {
    while (queue.length > 0) await queue.shift()();
  });
  await Promise.all(lanes);
}

/** Each beat's shots, shot from the render-mode builds, two at a time. */
async function shootAll(key, beats, { browser, apps, dirOf }) {
  const jobs = [];
  for (const [b, beat] of beats.beats.entries()) {
    const takes = [
      ...(beat.shots ?? []).map((shot, s) => [shot, s]),
      ...(beat.mac ? [[beat.mac, "mac"]] : []),
    ];
    for (const [shot, s] of takes) {
      jobs.push(async () => {
        const frames = await shoot(browser, shot, { ...apps, out: dirOf(b, s) });
        log(`  shot ${b + 1}·${s} (${beat.key}): ${frames} frames`);
      });
    }
  }
  log(`${key}: shooting ${jobs.length} shots…`);
  await twoAtATime(jobs);
}

/** A film rendered: its shots (or the last render's, `again`), composed, checked and encoded. */
async function render(key, { browser, apps, work, again }) {
  const beats = beatsOf(key);
  const shotsDir = join(work, key, "shots");
  const dirOf = (b, s) => join(shotsDir, `${String(b).padStart(2, "0")}-${s}`);
  if (!again) {
    rmSync(join(work, key), { recursive: true, force: true });
    await shootAll(key, beats, { browser, apps, dirOf });
  }
  rmSync(join(work, key, "frames"), { recursive: true, force: true });
  macShotsStill(key, beats, dirOf);

  log(`${key}: composing…`);
  // The scene and the frames from one place, so the scene may read the frames' pixels.
  const scene = await serve(
    { "/work/": work, "/": import.meta.dirname },
    { files: { "/icon.png": join(ROOT, "apps", "mobile", "assets", "icon.png") } },
  );
  const served = (path) => `${scene.url}/work/${path.slice(work.length + 1)}`;
  const framesDir = join(work, key, "frames");
  try {
    const made = await compose(browser, {
      beats: beats.beats,
      shots: dirOf,
      scene: scene.url,
      served,
      out: framesDir,
      log,
    });
    log(`${key}: checking ${made.frames} frames…`);
    const jumps = loneJumps(wholeDiffs(framesDir));
    if (jumps.length > 0) throw new Error(`${key}: frames that jump, at ${jumps.join(", ")}`);

    log(`${key}: encoding…`);
    mkdirSync(ASSETS, { recursive: true });
    const file = `${key}.mp4`;
    const encoded = spawnSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-framerate",
      String(FPS),
      "-i",
      join(framesDir, "%05d.png"),
      "-vf",
      "scale=1080:1920:flags=lanczos",
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "26",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-movflags",
      "+faststart",
      "-tag:v",
      "avc1",
      join(ASSETS, file),
    ]);
    if (encoded.status !== 0) throw new Error(`${key}: ffmpeg could not encode the film`);
    const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT })
      .stdout.toString()
      .trim();
    const entry = {
      key,
      title: beats.title,
      file,
      width: 1080,
      height: 1920,
      fps: FPS,
      seconds: made.frames / FPS,
      beats: made.timeline.map(({ beat, start, length }) => ({
        key: beat.key,
        ...(beat.caption ?? { line: beat.line }),
        start: start / FPS,
        end: (start + length) / FPS,
      })),
      rendered: { commit, ...sourceOf(key) },
    };
    writeFileSync(FILMS_JSON, `${JSON.stringify(withFilm(readFilms(), entry), null, 2)}\n`);
    log(`${key}: ${join(ASSETS, file)}, ${entry.seconds.toFixed(2)} s`);
  } finally {
    await scene.close();
  }
}

/**
 * Each beat's Mac shot, held to the check the film is held to (ADR 0242). The composer moves the
 * phone's arrivals itself and the whole film is checked once composed, but the Mac's window is drawn
 * as it was shot, small, behind the phone: a room in it whose rows jumped a row at a time passed
 * the film's measure, and went to the site as the clip of the Mac (28 October 2026). The Mac's room
 * moves its own rows now, and a shot of it that jumps fails the render, naming the frames.
 */
function macShotsStill(key, beats, dirOf) {
  for (const [b, beat] of beats.beats.entries()) {
    if (beat.mac === undefined) continue;
    const jumps = loneJumps(diffsOf(dirOf(b, "mac")));
    if (jumps.length === 0) continue;
    const frames = jumps.map((i) => i + 1).join(", ");
    throw new Error(
      `${key}: the Mac's shot in beat ${b + 1} (${beat.key}) jumps, at frames ${frames}`,
    );
  }
}

/** How unlike each frame of a whole film is to the next, at full size. */
function wholeDiffs(dir) {
  const file = `${dir}.whole.txt`;
  rmSync(file, { force: true });
  const measured = spawnSync("ffmpeg", [
    "-loglevel",
    "error",
    "-reinit_filter",
    "0",
    "-i",
    join(dir, "%05d.png"),
    "-vf",
    `format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${file}`,
    "-f",
    "null",
    "-",
  ]);
  if (measured.status !== 0) throw new Error("ffmpeg could not measure the film");
  return meanDiffs(readFileSync(file, "utf8"));
}

async function main() {
  needFfmpeg();
  // `--again` composes again from the last render's shots, for work on the composer alone.
  const again = process.argv.includes("--again");
  const asked = process.argv.slice(2).filter((word) => !word.startsWith("--"));
  const keys = asked.length > 0 ? asked : beatFiles();
  for (const key of keys) {
    if (!beatFiles().includes(key))
      throw new Error(`no beats for a film called ${key} in tools/film/beats`);
  }
  const work = join(tmpdir(), "chips-film");
  mkdirSync(work, { recursive: true });
  if (!again) await build(work);
  const phone = await serve({ "/": join(work, "phone") }, { fallback: "index.html" });
  const mac = await serve({ "/": join(work, "web") }, { fallback: "index.html" });
  const browser = await chromium.launch();
  try {
    for (const key of keys)
      await render(key, { browser, apps: { phone: phone.url, mac: mac.url }, work, again });
  } finally {
    await browser.close();
    await phone.close();
    await mac.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
