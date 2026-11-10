/**
 * Whether a page's address answers yet: what Run and open waits for on the Mac before it opens the
 * page in the Mac's browser (ADR 0227's addendum of 9 November 2026). The Mac says a program is
 * running as soon as it has started, which can be a moment before it listens; opened then, the
 * browser would show an error.
 *
 * Any answer at all is one, an error page included: the address is listening. It is asked without
 * reading what comes back (`no-cors`), with the person's own press behind it, and nothing is kept.
 * The Mac app's policy lets it ask any address; a browser's lets it ask only its own server, so a
 * browser never asks and offers Open instead.
 */

/** How long one ask waits for an answer before it counts as none. */
const ONE_ASK_MS = 3000;
/** How long between asks. */
const BETWEEN_MS = 700;

/** Whether the address answers now. */
export async function answers(url: string, signal: AbortSignal): Promise<boolean> {
  const asked = new AbortController();
  const given = setTimeout(() => asked.abort(), ONE_ASK_MS);
  const stop = () => asked.abort();
  signal.addEventListener("abort", stop);
  try {
    await fetch(url, { method: "HEAD", mode: "no-cors", cache: "no-store", signal: asked.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(given);
    signal.removeEventListener("abort", stop);
  }
}

/** Whether it answers within `within`, asking again until it does or `signal` gives up. */
export async function answersWithin(
  url: string,
  within: number,
  signal: AbortSignal,
): Promise<boolean> {
  const until = Date.now() + within;
  while (!signal.aborted && Date.now() < until) {
    if (await answers(url, signal)) return !signal.aborted;
    await new Promise<void>((done) => {
      const pause = setTimeout(done, BETWEEN_MS);
      signal.addEventListener("abort", () => {
        clearTimeout(pause);
        done();
      });
    });
  }
  return false;
}
