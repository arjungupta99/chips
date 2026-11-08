/**
 * A room taking a new width beside the columns (ADR 0284's second addendum): what is noted, how the
 * lines hold the new width, and where each bubble glides from. jsdom lays nothing out, so each box
 * says where it stands; the motion itself was measured frame by frame in Chromium.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PANE_MS } from "../Columns.tsx";
import { noteGlide, startGlide } from "./widthGlide.ts";

/** A box at `left, top`, `width` by `height`. */
function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Each element stands where `boxes` says, read again at every call. */
function standAt(el: Element, box: () => DOMRect): void {
  Object.defineProperty(el, "getBoundingClientRect", { configurable: true, value: box });
}

interface Played {
  readonly target: Element;
  readonly keyframes: Keyframe[];
  readonly options: KeyframeAnimationOptions;
  readonly cancel: ReturnType<typeof vi.fn>;
}

let played: Played[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  played = [];
  Object.assign(HTMLElement.prototype, {
    animate(this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      const cancel = vi.fn();
      played.push({ target: this, keyframes, options, cancel });
      return { cancel } as unknown as Animation;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  document.body.replaceChildren();
});

/** A room's list with a reply of theirs and a line of yours, each a row with a bubble. */
function room(): { list: HTMLElement; theirs: HTMLElement; mine: HTMLElement } {
  const list = document.createElement("div");
  list.className = "msgs";
  const row = (mine: boolean) => {
    const msg = document.createElement("div");
    msg.className = "msg";
    if (mine) msg.dataset["mine"] = "true";
    const body = document.createElement("div");
    body.className = "msg-body";
    const bub = document.createElement("div");
    bub.className = "bub";
    body.append(bub);
    msg.append(body);
    list.append(msg);
    return bub;
  };
  const theirs = row(false);
  const mine = row(true);
  document.body.append(list);
  standAt(list, () => rect(340, 0, 1100, 800));
  return { list, theirs, mine };
}

describe("a room taking a new width", () => {
  it("notes what stands within a window of its list, and nothing when it is not laid out", () => {
    const { list, theirs, mine } = room();
    standAt(theirs, () => rect(426, 100, 480, 60));
    standAt(mine, () => rect(900, 5000, 300, 40));
    expect(noteGlide(list).map(({ el }) => el)).toEqual([theirs]);

    standAt(list, () => rect(0, 0, 0, 0));
    expect(noteGlide(list)).toEqual([]);
  });

  it("holds the lines at the room's new width, and lets them go as the columns come to rest", () => {
    const { list, theirs } = room();
    standAt(theirs, () => rect(426, 100, 480, 60));
    const noted = noteGlide(list);
    const landed = vi.fn();

    startGlide(list, noted, 680, () => undefined, landed);
    expect(list.dataset["held"]).toBe("true");
    expect(list.style.getPropertyValue("--held-room")).toBe("680px");
    // A room of 680: 89.6% of it is the lines, the rest either side of them.
    expect(Number.parseFloat(list.style.getPropertyValue("--held-clear"))).toBeCloseTo(35.36, 2);

    vi.advanceTimersByTime(PANE_MS + 20);
    expect(list.dataset["held"]).toBeUndefined();
    expect(list.style.getPropertyValue("--held-room")).toBe("");
    expect(landed).toHaveBeenCalledOnce();
  });

  it("keeps the reader's place once the lines hold the new width, before anything glides", () => {
    const { list, theirs } = room();
    standAt(theirs, () => rect(426, 100, 200, 40));
    const noted = noteGlide(list);
    const kept: string[] = [];
    // Up the space, the list puts the line being read back where it stood; the glides set off
    // from there, or every line is drawn a whole move off and glides back.
    startGlide(list, noted, 680, () => {
      kept.push(list.style.getPropertyValue("--held-room"));
      standAt(theirs, () => rect(376, 80, 200, 40));
    });
    expect(kept).toEqual(["680px"]);
    expect(played.map(({ keyframes }) => keyframes[0]?.["transform"])).toEqual([
      "translate(50px, 20px)",
    ]);
  });

  it("glides each bubble from where it was drawn, a line of yours from its right edge", () => {
    const { list, theirs, mine } = room();
    // Drawn here, with the list beside the room…
    standAt(theirs, () => rect(426, 100, 200, 40));
    standAt(mine, () => rect(1100, 200, 200, 40));
    const noted = noteGlide(list);
    // …and laid out here, the details open.
    standAt(theirs, () => rect(376, 80, 200, 40));
    standAt(mine, () => rect(700, 180, 200, 40));

    startGlide(list, noted, 680, () => undefined);
    const moves = played.map(({ target, keyframes, options }) => ({
      target,
      from: keyframes[0]?.["transform"],
      to: keyframes[1]?.["transform"],
      options,
    }));
    expect(moves).toEqual([
      {
        target: theirs,
        from: "translate(50px, 20px)",
        to: "none",
        options: expect.objectContaining({ duration: PANE_MS, fill: "forwards" }),
      },
      {
        target: mine,
        from: "translate(400px, 20px)",
        to: "none",
        options: expect.objectContaining({ duration: PANE_MS, fill: "forwards" }),
      },
    ]);
  });

  it("lays a bubble whose shape changes out at both shapes, the space under it its new one, and clips it from the old to the new", () => {
    const { list, theirs } = room();
    for (const corner of ["TopLeft", "TopRight", "BottomRight", "BottomLeft"] as const) {
      theirs.style[`border${corner}Radius`] = "18px";
    }
    standAt(theirs, () => rect(426, 100, 480, 38));
    const noted = noteGlide(list);
    // Narrower and a line taller at the new width; laid out at both, it stands as wide as it was.
    standAt(theirs, () =>
      theirs.style.width === "480px" ? rect(376, 80, 480, 57) : rect(376, 80, 372, 57),
    );
    const row = theirs.closest<HTMLElement>(".msg");
    if (row === null) throw new Error("no row");
    standAt(row, () => rect(376, 80, 400, 57));

    const release = startGlide(list, noted, 680, () => undefined);
    expect(theirs.style.width).toBe("480px");
    expect(theirs.style.height).toBe("57px");
    expect(row.style.height).toBe("57px");
    const clip = played.find(({ keyframes }) => keyframes[0]?.["clipPath"] !== undefined);
    expect(clip?.keyframes).toEqual([
      { clipPath: "inset(0 0px 19px 0 round 18px 18px 18px 18px)" },
      { clipPath: "inset(0 108px 0px 0 round 18px 18px 18px 18px)" },
    ]);

    release();
    expect(theirs.style.width).toBe("");
    expect(theirs.style.height).toBe("");
    expect(row.style.height).toBe("");
    for (const each of played) expect(each.cancel).toHaveBeenCalled();
  });
});
