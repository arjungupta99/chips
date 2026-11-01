/**
 * One shot of a film (ADR 0217): a render-mode build plays a chapter of the demo, and every frame
 * is a screenshot. The page's clock is Playwright's, installed and paused so it moves only when told,
 * a little under a sixtieth of a second a frame (`PACE`); every animation the page starts is paused
 * and set to the same clock. So no frame can drop, however busy the machine.
 *
 * A shot is `{ app, film, chapter, from, to }`: the phone's build or the Mac's (the web build), a
 * chapter of a film, and the part of it to keep, in milliseconds into the chapter (to its end when
 * `to` is left out). Or `{ app: "phone", look: "search", query, seconds }`: the demo looked around,
 * Search opened and the words typed into it.
 *
 * The app does nothing of the person's by itself (ADR 0217's addendum). What a person does in a
 * chapter is in `acts.json`, by `film:chapter`, each step at its time in the chapter, on the app's
 * own controls, a moment before the script's act for it is due: a control by its test ID (a
 * string), by the words on it (`{ text }`, the newest that says them), or by what it is called
 * (`{ label }`: a close's ✕, an effort's bar).
 *
 * - `tap`: a click on it.
 * - `press`: the pointer down on it, held `ms` while the frames run, then up: a message lifted.
 * - `type`: `text` put after the field's words a key at a time, a key every `every` ms.
 * - `scroll`: the page under it moved until it stands a little under the page's top, over `ms`,
 *   eased in and out, set a frame at a time (the browser's own smooth scroll runs on its own clock).
 * - `reveal`: the same, at once.
 * - `slide`: the pointer down on it, then moved through `path`, each `[up, across, ms]` reached
 *   from the last over `ms`, eased, a frame at a time (a finger sliding up the faces, ADR 0229);
 *   then up where it is.
 *
 * A step whose control is not there fails the shot, naming the step; so does an act of the
 * chapter whose moment comes with nobody having done it (the page's `data-film-missed`).
 */

import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FPS = 60;
/**
 * Pixels a point on the phone, three as the iPhone draws: the scene shows the screen at about
 * 1,230 pixels wide, and a shot narrower than that is enlarged, which softens every line of text.
 */
export const PHONE_SCALE = 3;
/** The phone the films show: an iPhone's points, its safe area, and its pixels a point. */
const PHONE = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: PHONE_SCALE,
  colorScheme: "dark",
};
const SAFE = { top: 59, bottom: 34, left: 0, right: 0 };
/** The Mac's window. */
const MAC = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: "dark" };
/** The film's morning: the clock every shot starts at. */
const MORNING = new Date("2026-10-21T09:41:00");
/** How long a shot may wait for its chapter to start. */
const WAIT_MOST = 60_000;
/** How long, in real time, a step may look for its control before its shot fails. */
const FIND_MOST = 5000;
/** Where a scroll leaves its control: under the bar over the page, and a little more. */
const UNDER_TOP = 140;
/** What a person does in each chapter shot, by `film:chapter`. */
const ACTS = JSON.parse(readFileSync(join(import.meta.dirname, "acts.json"), "utf8"));

/** A page of the build the shot is from, on a clock that moves only when told. */
async function opened(browser, shot, apps) {
  const onPhone = shot.app === "phone";
  const context = await browser.newContext(onPhone ? PHONE : MAC);
  const page = await context.newPage();
  if (onPhone) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: SAFE });
  }
  // The browser's own focus ring is not the app's.
  await page.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "*:focus, *:focus-visible { outline: none !important; }";
      document.head.append(style);
    });
  });
  await page.clock.install({ time: MORNING });
  // Installed, the clock still runs with real time; paused, it moves only when told.
  await page.clock.pauseAt(new Date(MORNING.getTime() + 1000));
  const asked = shot.look ? "?look=1" : `?film=${shot.film}&chapter=${shot.chapter}`;
  await page.goto(`${onPhone ? apps.phone : apps.mac}/${asked}`);
  return { context, page };
}

/** Every animation the page has started, paused and set to the fake clock. */
function synced(page) {
  return page.evaluate(() => {
    if (window.__seen === undefined) window.__seen = new WeakMap();
    const seen = window.__seen;
    const now = performance.now();
    for (const animation of document.getAnimations()) {
      // One a scroll drives keeps to its scroll.
      if (!(animation.timeline instanceof DocumentTimeline)) continue;
      let start = seen.get(animation);
      if (start === undefined) {
        animation.pause();
        start = now - (Number(animation.currentTime) || 0);
        seen.set(animation, start);
      }
      animation.currentTime = now - start;
    }
  });
}

/** The page's mark: the chapter playing, `film:chapter`, or `film:end` once its last has played. */
function chapterOf(page) {
  return page.evaluate(() => document.body.dataset.filmChapter ?? "");
}

/** The page's marks: the chapter playing, and the act of it nobody did by its moment. */
function marksOf(page) {
  return page.evaluate(() => ({
    chapter: document.body.dataset.filmChapter ?? "",
    missed: document.body.dataset.filmMissed ?? "",
  }));
}

/**
 * How fast the app plays in a film: each frame moves its clock this share of a frame's time, so what a
 * tap does, what arrives and what slides plays slower than life while the film keeps 60 frames a
 * second. At full speed the actions went by too fast to follow (Arjun, 21 October 2026).
 */
export const PACE = 1 / 1.2;

/**
 * The clock, a frame at a time (about 14 milliseconds at `PACE`), and the animations with it.
 *
 * Playwright's clock gives the page an animation frame every 16 milliseconds. At a shorter step one
 * frame in six would have none, and whatever the app moves frame by frame (a sheet's spring) would
 * stand still in it and catch up in the next. So each frame's animation frame comes at its end, and
 * one asked for there comes at the end of the frame after.
 */
function clockOf(page) {
  const step = (1000 / FPS) * PACE;
  const clock = { due: 0 };
  clock.tick = async () => {
    const ms = Math.round(clock.due + step) - Math.round(clock.due);
    const next = Math.round(clock.due + 2 * step) - Math.round(clock.due + step);
    clock.due += step;
    await page.evaluate(
      ([ms, next]) => {
        const c = globalThis.__pwClock.controller;
        c.frameEnd = c._now.ticks + ms;
        c.frameAfter = c.frameEnd + next;
        c.getTimeToNextFrame = function () {
          const now = this._now.ticks;
          return now < this.frameEnd ? this.frameEnd - now : this.frameAfter - now;
        };
      },
      [ms, next],
    );
    await page.clock.runFor(ms);
    await synced(page);
  };
  return clock;
}

/** Played until the shot can start: its chapter playing, or the demo looked around. */
async function started(page, shot, clock) {
  const want = `${shot.film}:${shot.chapter}`;
  const ready = shot.look
    ? () => page.getByTestId("tab-bar").isVisible()
    : async () => (await chapterOf(page)) === want;
  while (!(await ready().catch(() => false))) {
    if (clock.due > WAIT_MOST) throw new Error(`the shot never started: ${JSON.stringify(shot)}`);
    await clock.tick();
  }
  return clock.due;
}

/** What a person does to search: Search opened, then the words typed as the field fills. */
function searching(page, query) {
  const tap = (locator) => locator.first().click({ force: true, noWaitAfter: true });
  const field = page.getByTestId("search");
  const doing = [
    {
      at: 500,
      run: () => tap(page.getByRole("tab", { name: /Search/ }).or(page.getByTestId("tab-search"))),
    },
    { at: 1300, run: () => tap(field) },
  ];
  // Filled rather than typed: keys sent to the page went astray once the results drew the field again.
  for (let i = 0; i < query.length; i += 1) {
    doing.push({
      at: 1700 + i * 110,
      run: () => field.fill(query.slice(0, i + 1), { force: true }),
    });
  }
  return doing;
}

/** A step's control on the page: by its test ID, the words on it, or what it is called. */
function controlOf(page, control) {
  const found =
    typeof control === "string"
      ? page.getByTestId(control)
      : control.text !== undefined
        ? page.getByText(control.text, { exact: true })
        : page.getByLabel(control.label, { exact: true });
  return found.filter({ visible: true }).last();
}

/**
 * A step's control, its box on the screen; the shot fails, naming the step, if it is not there, or
 * if it is to be pressed (`onScreen`) and is not on the screen, where a person could not press it.
 */
async function boxOf(page, step, control, onScreen = false) {
  const box = await controlOf(page, control)
    .boundingBox({ timeout: FIND_MOST })
    .catch(() => null);
  if (box === null) throw new Error(`no control for ${JSON.stringify(step)}`);
  const { width, height } = page.viewportSize();
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  if (onScreen && (x < 0 || x > width || y < 0 || y > height)) {
    throw new Error(
      `the control is off the screen for ${JSON.stringify(step)}: scroll to it first`,
    );
  }
  return box;
}

const eased = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * In the page: the nearest part over `el` that scrolls, marked with where it stands and where it
 * goes to bring `el` to `under` from its top, or as near as it goes; null when nothing scrolls.
 * Which way it runs is tried with a nudge, since a room's list may be drawn upside down.
 */
function scrollerOver(el, under) {
  let at = el.parentElement;
  while (at !== null) {
    const { overflowY } = getComputedStyle(at);
    if (/(auto|scroll)/.test(overflowY) && at.scrollHeight > at.clientHeight) break;
    at = at.parentElement;
  }
  if (at === null) return null;
  const was = at.scrollTop;
  const top = el.getBoundingClientRect().top - at.getBoundingClientRect().top;
  at.scrollTop = was + 2;
  if (at.scrollTop === was) at.scrollTop = was - 2;
  const nudged = at.scrollTop - was;
  const moved = el.getBoundingClientRect().top - at.getBoundingClientRect().top - top;
  at.scrollTop = was;
  const way = nudged === 0 || moved === 0 ? 1 : -moved / nudged;
  const most = at.scrollHeight - at.clientHeight;
  at.dataset.filmTo = String(Math.min(most, Math.max(0, was + (top - under) * way)));
  at.dataset.filmFrom = String(was);
  return at;
}

/** In the page: the scroller moved `t` of the way from where it stood to where it goes. */
function scrollerAt(at, t) {
  const from = Number(at.dataset.filmFrom);
  at.scrollTop = from + (Number(at.dataset.filmTo) - from) * t;
}

/**
 * A scroll: the page under the control moved over `ms` until the control stands `UNDER_TOP` under
 * the page's top, or as near as the page goes; a frame at a time, each frame's place by the time
 * played, so a frame that comes late catches up rather than jumping.
 */
function scrolling(page, step, control, ms) {
  let scroller;
  return async (played) => {
    if (scroller === undefined) {
      await boxOf(page, step, control);
      scroller = await controlOf(page, control).evaluateHandle(scrollerOver, UNDER_TOP);
      if (scroller.asElement() === null) {
        throw new Error(`nothing scrolls under the control of ${JSON.stringify(step)}`);
      }
    }
    const t = ms === 0 ? 1 : Math.min(1, (played - step.at) / ms);
    await scroller.evaluate(scrollerAt, eased(t));
    return t < 1;
  };
}

/** A slide: down on the control, along `step.path`, a frame at a time, and up at its end. */
function sliding(page, step, control) {
  let from;
  const legs = [];
  let ends = step.at;
  for (const [up, across, ms] of step.path) {
    legs.push({ up, across, starts: ends, ms });
    ends += ms;
  }
  return async (played) => {
    if (from === undefined) {
      const box = await boxOf(page, step, control, true);
      from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
    }
    let at = { up: 0, across: 0 };
    for (const leg of legs) {
      const t = leg.ms === 0 ? 1 : Math.min(1, Math.max(0, (played - leg.starts) / leg.ms));
      if (played < leg.starts) break;
      const e = eased(t);
      at = { up: at.up + (leg.up - at.up) * e, across: at.across + (leg.across - at.across) * e };
    }
    await page.mouse.move(from.x + at.across, from.y - at.up);
    if (played < ends) return true;
    await page.mouse.up();
    return false;
  };
}

/**
 * Words typed: put after what the field holds, a key at a time. Filled rather than sent as keys,
 * as Search's are: keys sent to the page went astray once what they changed drew the field again.
 */
function typing(page, step) {
  let before;
  const field = () => controlOf(page, step.type);
  return [...step.text].map((_, i) => ({
    at: step.at + i * step.every,
    run: async () => {
      if (before === undefined) {
        await boxOf(page, step, step.type);
        before = await field().inputValue();
      }
      await field().fill(before + step.text.slice(0, i + 1), { force: true });
    },
  }));
}

/** One step of `acts.json`, as what is done at which times in the chapter. */
function doingOf(page, step) {
  const { at } = step;
  if (step.tap !== undefined) {
    return [
      {
        at,
        run: async () => {
          await boxOf(page, step, step.tap, true);
          await controlOf(page, step.tap).click({ force: true, noWaitAfter: true });
        },
      },
    ];
  }
  if (step.press !== undefined) {
    return [
      {
        at,
        run: async () => {
          const box = await boxOf(page, step, step.press, true);
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
        },
      },
      { at: at + step.ms, run: () => page.mouse.up() },
    ];
  }
  if (step.type !== undefined) return typing(page, step);
  if (step.slide !== undefined) return [{ at, frame: sliding(page, step, step.slide) }];
  if (step.scroll !== undefined || step.reveal !== undefined) {
    const control = step.scroll ?? step.reveal;
    return [{ at, frame: scrolling(page, step, control, step.scroll === undefined ? 0 : step.ms) }];
  }
  throw new Error(`a step the shooter does not know: ${JSON.stringify(step)}`);
}

/** What a person does in a chapter (`acts.json`), in the order of its times. */
function acting(page, want) {
  return (ACTS[want] ?? []).flatMap((step) => doingOf(page, step)).sort((a, b) => a.at - b.at);
}

/** What is due by `played`: steps done, scrolls begun; then each scroll under way moved a frame. */
async function due(doing, moving, played) {
  while (doing.length > 0 && doing[0].at <= played) {
    const next = doing.shift();
    if (next.frame === undefined) await next.run();
    else moving.push(next.frame);
  }
  const still = [];
  for (const frame of moving) if (await frame(played)) still.push(frame);
  return still;
}

/** The shot's frames into `out`; answers how many. */
export async function shoot(browser, shot, { phone, mac, out }) {
  mkdirSync(out, { recursive: true });
  const { context, page } = await opened(browser, shot, { phone, mac });
  const clock = clockOf(page);
  const start = await started(page, shot, clock);
  const want = `${shot.film}:${shot.chapter}`;
  const doing = shot.look ? searching(page, shot.query) : acting(page, want);
  /** Scrolls under way, each moved every frame until it has arrived. */
  let moving = [];
  const from = shot.from ?? 0;
  const to = shot.look ? shot.seconds * 1000 : (shot.to ?? Number.POSITIVE_INFINITY);
  /** A frame's time played, and whether it is the shot's: false once its chapter has ended. */
  const step = async () => {
    await clock.tick();
    const played = clock.due - start;
    if (!shot.look) {
      const marks = await marksOf(page);
      // The chapter has ended: this frame is the next one's.
      if (marks.chapter !== want) return false;
      if (marks.missed !== "")
        throw new Error(`${want} missed its act, ${marks.missed}: see acts.json`);
    }
    moving = await due(doing, moving, played);
    return true;
  };
  let frame = 0;
  while (clock.due - start <= to && (await step())) {
    if (clock.due - start < from) continue;
    await page.screenshot({ path: `${out}/${String(frame).padStart(5, "0")}.png` });
    frame += 1;
  }
  await context.close();
  if (frame === 0) throw new Error(`the shot kept no frame: ${JSON.stringify(shot)}`);
  return frame;
}
