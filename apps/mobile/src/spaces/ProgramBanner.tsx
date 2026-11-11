/**
 * The program's banner over a page in Universe, and the sheet a tapped link brings up (ADR 0227's
 * addendum of 9 November 2026; Arjun: "Banner shows up for program. the bottom sheet only shows up if
 * the program is not running", "also show stop button on the banner when the program is running",
 * "All transitions must be smooth and polished").
 *
 * The banner is a row as the Desktop tab draws one (`MacRow`) on a card of its own: whether the
 * program runs, with Run while it doesn't and Stop while it does. Its words crossfade as they
 * change, its button crossfades between Run and Stop, and the card and the page under it move to
 * their new heights on one clock (`MacMotion.tsx`). A run that has just started says its links open
 * now, then folds to one row.
 *
 * A link to a web address tapped while the program isn't running brings up the sheet: Run and open,
 * which runs it, waits until the page answers and opens it, or Open anyway. A link tapped while it
 * runs opens at once; one to localhost, which on a phone is the phone, never opens and the banner
 * says so for a moment. What a tap does is core's `linkTap`, and the words are core's.
 */

import {
  ANSWER_WAIT_MS,
  type AskKind,
  addressShown,
  askAfterNews,
  askUnheard,
  blockedBy,
  cleared,
  commandOf,
  HERE_ONLY_MS,
  isReachKind,
  type LinkAsk,
  linkAsk,
  linkNameIn,
  linksThroughTailscale,
  linkTap,
  needsLooking,
  networkOf,
  OPEN_ANYWAY,
  PROGRAM_BANNER,
  type ProgramBanner,
  REACH_AFTER_MS,
  REACH_LOOKS_MS,
  REACH_SHOWS_MS,
  type ReachDevice,
  type ReachKind,
  type RecipeRead,
  reachAsk,
  reachLine,
  SETTLES_MS,
} from "@chipschat/core";
import type { HeldRun } from "@chipschat/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Sheet } from "../ui/Sheet";
import { CLOSE_ROOM } from "../ui/SheetClose";
import { OverWindow } from "../ui/Split";
import { Swap } from "../ui/Swap";
import { usePalette } from "../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { answersWithin } from "./answers";
import { getTailscale, look, openTailscale, seesTunnels, tunnelsNow } from "./linkReach";
import { Moves, Opening } from "./MacMotion";
import { MacRow, type MarkKind, RowButton, RowMark } from "./MacRow";
import type { RunHeld } from "./RunBar";

/** How long Run and open waits for the Mac to say anything at all before saying it hasn't. */
const NEWS_WAIT_MS = 15_000;
/** How long after the sheet starts down the browser opens, so the sheet is seen to go first. */
const AFTER_SHEET_MS = 260;

/** The banner's mark: a grey dot while it doesn't run, gold while it starts, green while it runs. */
function markOf(banner: ProgramBanner): MarkKind {
  if (banner.kind === "starting") return "starting";
  if (banner.kind === "running") return "running";
  if (banner.kind === "ended" && banner.tone === "bad") return "failed";
  return "off";
}

/** A run that has just started, as this banner saw it start: its words stay for a moment. */
function useFresh(kind: ProgramBanner["kind"]): boolean {
  const was = useRef(kind);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const before = was.current;
    was.current = kind;
    if (kind !== "running") {
      setFresh(false);
      return;
    }
    if (before === "running") return;
    setFresh(true);
    const settle = setTimeout(() => setFresh(false), SETTLES_MS);
    return () => clearTimeout(settle);
  }, [kind]);
  return fresh;
}

/** Words in the voice they are said in: amber for somebody else's change (SEC-40). */
function voiced(words: string, tone: ProgramBanner["tone"], palette: Palette) {
  return tone === "changed" ? (
    <Text style={[styles.strong, { color: palette.amberInk }]}>{words}</Text>
  ) : (
    words
  );
}

/** The banner over the page: how the program stands, and Run or Stop. */
export function ProgramBannerView({
  banner,
  busy,
  hereOnly,
  line,
  onRun,
  onStop,
}: {
  readonly banner: ProgramBanner;
  /** Asking the Mac, or waiting on what it says. */
  readonly busy: boolean;
  /** A localhost link was just tapped: the banner says it opens only on the Mac. */
  readonly hereOnly: boolean;
  /**
   * The page links through Tailscale and this phone isn't on it (`reachLine`): said in amber,
   * before a tap that couldn't work, for as long as it's so.
   */
  readonly line?: string | undefined;
  readonly onRun: () => void;
  readonly onStop: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const fresh = useFresh(banner.kind);
  const { body, tone } = bannerWords(banner, hereOnly, fresh, line);
  const press = <BannerPress press={banner.press} busy={busy} onRun={onRun} onStop={onStop} />;
  return (
    <Moves style={[styles.card, { backgroundColor: on.fill }]} testID="program-banner">
      <MacRow
        mark={<RowMark kind={markOf(banner)} icon="play" />}
        title={banner.title}
        titleBad={banner.kind === "ended" && banner.tone === "bad"}
        titleTestID="program-banner-title"
        body={body === undefined ? undefined : voiced(body, tone, palette)}
        bodyKey={body ?? "none"}
        voice={tone === "bad" ? "bad" : "plain"}
        bodyTestID="program-banner-words"
        action={press}
        actionKey={banner.press ?? "none"}
        parted={false}
      />
    </Moves>
  );
}

/**
 * What the banner says under its title: that localhost opens only on the Mac, for a moment after
 * one was tapped; what went wrong, when something did; that the page's links need Tailscale,
 * while this phone isn't on it; nothing once a run that just started has settled; else its own
 * words.
 */
export function bannerWords(
  banner: ProgramBanner,
  hereOnly: boolean,
  fresh: boolean,
  line?: string,
): { readonly body: string | undefined; readonly tone: ProgramBanner["tone"] } {
  if (hereOnly) return { body: PROGRAM_BANNER.hereOnly, tone: "plain" };
  if (banner.tone === "bad") return { body: banner.body, tone: "bad" };
  if (line !== undefined) return { body: line, tone: "changed" };
  const settled = banner.settles === true && !fresh;
  return { body: settled ? undefined : banner.body, tone: banner.tone };
}

/** Run while it doesn't run, Stop while it does: the Desktop tab's gold Run and red Stop. */
function BannerPress({
  press,
  busy,
  onRun,
  onStop,
}: {
  readonly press: ProgramBanner["press"];
  readonly busy: boolean;
  readonly onRun: () => void;
  readonly onStop: () => void;
}) {
  if (press === "run") {
    return (
      <RowButton
        label="Run"
        icon="playFill"
        tone="gold"
        busy={busy}
        onPress={onRun}
        accessibilityLabel="Run program"
        testID="program-banner-run"
      />
    );
  }
  if (press === "stop") {
    return (
      <RowButton
        label="Stop"
        icon="stop"
        tone="stop"
        busy={busy}
        onPress={onStop}
        accessibilityLabel="Stop the program"
        testID="program-banner-stop"
      />
    );
  }
  return null;
}

/** What the sheet is about: the tapped address, where the sheet is, and what it says. */
export interface Asked {
  readonly url: string;
  readonly kind: AskKind | ReachKind;
  /** What the Mac said when it couldn't. */
  readonly said?: string | undefined;
  /** Who changed the files since the person last ran it (SEC-40). */
  readonly changed?: string | undefined;
  /** The link's name, as the page says it, for a link the phone has to reach first. */
  readonly name?: string | undefined;
  /** The person's program wasn't running when the link was tapped. */
  readonly stopped?: boolean | undefined;
  /** Whose tailnet it is, for somebody who isn't the owner. */
  readonly ownerName?: string | undefined;
  /** Tailscale has just come on: the page is given longer to answer. */
  readonly after?: boolean | undefined;
}

/** The device, as the words name it. */
export const DEVICE: ReachDevice = Platform.OS === "ios" && Platform.isPad ? "iPad" : "iPhone";

/** How often the banner reads the phone's tunnels again while it shows a page through Tailscale. */
const LINE_READS_MS = 3000;

/**
 * The banner's line while the page links through Tailscale and this phone isn't on it (ADR
 * 0227's addendum of 10 November 2026): read from the phone's tunnels as the page is shown, as the
 * person comes back to Chips, and every few seconds, so it folds away once Tailscale comes on.
 */
export function useTailscaleLine(
  html: string | undefined,
  live: boolean,
  running: boolean,
): string | undefined {
  const through = useMemo(() => html !== undefined && linksThroughTailscale(html), [html]);
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (!live || !through || !seesTunnels()) {
      setOff(false);
      return;
    }
    const read = () => setOff(tunnelsNow().tailscale === false);
    read();
    const every = setInterval(read, LINE_READS_MS);
    const back = AppState.addEventListener("change", (state) => {
      if (state === "active") read();
    });
    return () => {
      clearInterval(every);
      back.remove();
    };
  }, [live, through]);
  return off ? reachLine(running, DEVICE) : undefined;
}

/** The browser or mail: at once, or after `after` milliseconds. */
function outside(url: string, after = 0): void {
  const go = () => void Linking.openURL(url).catch(() => undefined);
  if (after === 0) go();
  else setTimeout(go, after);
}

/** The sheet's words, for where it is: the program's question, or what stands in a link's way. */
export function askWords(asked: Asked): LinkAsk<AskKind | ReachKind> {
  if (isReachKind(asked.kind)) {
    return reachAsk(asked.kind, {
      name: asked.name,
      device: DEVICE,
      url: asked.url,
      stopped: asked.stopped,
      ownerName: asked.ownerName,
    });
  }
  return linkAsk(asked.kind, asked);
}

/** Where the sheet waits for Tailscale to come on, looking again as it waits. */
const WAITS_FOR_TAILSCALE: ReadonlySet<string> = new Set([
  "tailscale-off",
  "other-vpn",
  "not-installed",
  "tailscale-wait",
  "vpn-in-way",
]);

/**
 * What a tapped link does in Universe, and the sheet it brings up: asked, run, waited for, opened.
 * `held` is the person's run, `banner` how it stands as the banner says it. A link only some
 * devices reach (Tailscale's, a private network's) is looked at first (ADR 0227's addendum of 10
 * November 2026), on any page, program or not.
 */
export function useLinkAsk({
  held,
  banner,
  recipe,
  program,
  owner,
  ownerName,
}: {
  readonly held: RunHeld;
  readonly banner: ProgramBanner;
  readonly recipe: RecipeRead;
  /** The space has a program its run file says how to run. */
  readonly program: boolean;
  /** The person is the workspace's owner, who runs it (ADR 0231). */
  readonly owner: boolean;
  /** The owner by name, for somebody who isn't. */
  readonly ownerName?: string | undefined;
}) {
  const [asked, setAsked] = useState<Asked | undefined>();
  const [open, setOpen] = useState(false);
  const [hereOnlyAt, setHereOnlyAt] = useState<number | undefined>();
  // The run as it stood when the sheet began to wait on it, so what the Mac says after is news;
  // `null` while the sheet waits on nothing.
  const before = useRef<HeldRun | undefined | null>(null);
  const [heard, setHeard] = useState(false);
  // Each look at a link, so one overtaken by a later tap or a closed sheet says nothing.
  const looking = useRef(0);
  // How the program stands now, for a look that answers after it changed.
  const standing = useRef(banner);
  standing.current = banner;

  useEffect(() => {
    if (hereOnlyAt === undefined) return;
    const done = setTimeout(() => setHereOnlyAt(undefined), HERE_ONLY_MS);
    return () => clearTimeout(done);
  }, [hereOnlyAt]);

  // While it starts: what the Mac says. Running, the sheet waits for the page to answer; ended,
  // failed or stopped, it says so.
  const { run } = held;
  // biome-ignore lint/correctness/useExhaustiveDependencies: news is a new word from the Mac, read with the words of that moment.
  useEffect(() => {
    if (!open || asked?.kind !== "starting" || before.current === null) return;
    if (run === before.current) return;
    before.current = run;
    setHeard(true);
    const next = askAfterNews(run, banner);
    if (next !== undefined) setAsked({ ...asked, ...next });
  }, [run, open, asked?.kind]);

  // A Mac that heard Run and open but says nothing: the spinner doesn't go on for ever.
  useEffect(() => {
    if (!open || asked?.kind !== "starting" || heard || before.current === null) return;
    const given = setTimeout(() => {
      setAsked((was) =>
        was?.kind === "starting"
          ? {
              ...was,
              kind: "unheard",
              said: "Your Mac hasn’t said it started. Desktop shows how it stands.",
            }
          : was,
      );
    }, NEWS_WAIT_MS);
    return () => clearTimeout(given);
  }, [open, asked?.kind, heard]);

  // Running: the page is opened once its address answers, or the sheet says it hasn't.
  const url = asked?.url;
  useEffect(() => {
    if (!open || asked?.kind !== "opening" || url === undefined) return;
    const giving = new AbortController();
    answersWithin(url, ANSWER_WAIT_MS, giving.signal).then((answered) => {
      if (giving.signal.aborted) return;
      if (answered) {
        setOpen(false);
        outside(url, AFTER_SHEET_MS);
      } else {
        setAsked((was) => (was === undefined ? was : { ...was, kind: "quiet" }));
      }
    });
    return () => giving.abort();
  }, [open, asked?.kind, url]);

  /** The link opened outside, after the sheet has started down if it was up. */
  const leave = (tapped: string) => {
    if (open) setOpen(false);
    outside(tapped, open ? AFTER_SHEET_MS : 0);
  };

  /** The program's question for a link: waiting on a run already starting, or asking to run it. */
  const askToRun = (tapped: string, name: string | undefined) => {
    const now = standing.current;
    setHeard(false);
    before.current = now.kind === "starting" ? held.run : null;
    setAsked(
      now.kind === "starting"
        ? { url: tapped, name, kind: "starting" }
        : {
            url: tapped,
            name,
            kind: "ask",
            changed: now.tone === "changed" ? now.body : undefined,
          },
    );
    setOpen(true);
  };

  /** The program's own question for a link, as before a link had to be reached first. */
  const programTap = (tapped: string, name: string | undefined) => {
    const what = linkTap({ url: tapped, program, owner, kind: standing.current.kind });
    // localhost on a page with no program has no banner to say so: it opens as it always did.
    if (what === "open" || (what === "here-only" && !program)) return leave(tapped);
    if (what === "here-only") return setHereOnlyAt(Date.now());
    askToRun(tapped, name);
  };

  /** Whether the page should be up: anybody's but the owner's own program while it isn't running. */
  const stoppedNow = () => owner && program && standing.current.kind !== "running";

  /**
   * A link only some devices reach: looked at, and opened, or the sheet says what stands in its
   * way. The sheet shows it's opening only when the look takes a while.
   */
  const reach = async (tapped: string, name: string | undefined) => {
    const turn = ++looking.current;
    const stopped = stoppedNow();
    const shows = setTimeout(() => {
      if (looking.current !== turn) return;
      before.current = null;
      setAsked({ url: tapped, name, kind: "reaching" });
      setOpen(true);
    }, REACH_SHOWS_MS);
    const seen = await look(tapped, owner && !stopped, new AbortController().signal);
    clearTimeout(shows);
    if (looking.current !== turn) return;
    const blocked = blockedBy(networkOf(tapped), seen, owner);
    if (blocked !== undefined) {
      before.current = null;
      setAsked({ url: tapped, name, kind: blocked, stopped, ownerName });
      setOpen(true);
      return;
    }
    programTap(tapped, name);
  };

  // Waiting for Tailscale: looked at again until the name is found. Then it goes on: to the
  // program's question while the program isn't running, else to opening the page.
  const waiting =
    open && asked !== undefined && WAITS_FOR_TAILSCALE.has(asked.kind) ? asked : undefined;
  useLooksAgain(waiting, (on) => {
    if (stoppedNow()) return programTap(on.url, on.name);
    setAsked({ ...on, kind: "reaching", after: true });
  });

  // Tailscale has just come on: the page is given a while to answer, its tunnel being new.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opened with the words of that moment.
  useEffect(() => {
    if (!open || asked?.kind !== "reaching" || asked.after !== true) return;
    const giving = new AbortController();
    const tapped = asked.url;
    answersWithin(tapped, REACH_AFTER_MS, giving.signal).then((answered) => {
      if (giving.signal.aborted) return;
      if (answered) {
        setOpen(false);
        outside(tapped, AFTER_SHEET_MS);
      } else {
        setAsked((was) => (was === undefined ? was : { ...was, kind: "mac-quiet", after: false }));
      }
    });
    return () => giving.abort();
  }, [open, asked?.kind, asked?.after]);

  /** A tapped link, with the page it was tapped on, whose words name it. */
  const tap = (tapped: string, html?: string) => {
    const name = html === undefined ? undefined : linkNameIn(html, tapped);
    if (needsLooking(tapped)) return void reach(tapped, name);
    looking.current += 1;
    programTap(tapped, name);
  };

  const anyway = () => {
    if (asked === undefined) return;
    looking.current += 1;
    setOpen(false);
    outside(asked.url, AFTER_SHEET_MS);
  };

  /** The gold button, for a link the phone has to reach first: Tailscale, or another look. */
  const reachGo = (on: Asked) => {
    const { opens } = askWords(on);
    if (opens === "again") return void reach(on.url, on.name);
    if (opens === undefined) return;
    if (opens === "get") getTailscale();
    else openTailscale();
    setAsked({ ...on, kind: "tailscale-wait" });
  };

  const go = async () => {
    if (asked === undefined) return;
    if (isReachKind(asked.kind)) return reachGo(asked);
    if (asked.kind === "quiet") return anyway();
    if (waits(asked.kind) || recipe === undefined || "why" in recipe) return;
    before.current = held.run;
    setHeard(false);
    setAsked({ url: asked.url, name: asked.name, kind: "starting" });
    const said = askUnheard(await held.press({ op: "run", command: commandOf(recipe) }));
    if (said === undefined) return;
    before.current = null;
    setAsked((was) => (was === undefined ? was : { ...was, kind: "unheard", said }));
  };

  return {
    asked,
    open,
    hereOnly: hereOnlyAt !== undefined,
    tap,
    go: () => void go(),
    anyway,
    close: () => {
      looking.current += 1;
      setOpen(false);
    },
    gone: () => {
      before.current = null;
      setAsked(undefined);
    },
  };
}

/**
 * While the sheet waits for Tailscale, the link looked at again as the person comes back to
 * Chips and every moment while the sheet is up; `clear` once its name is found.
 */
function useLooksAgain(waiting: Asked | undefined, clear: (on: Asked) => void) {
  const latest = useRef(clear);
  latest.current = clear;
  useEffect(() => {
    if (waiting === undefined) return;
    const giving = new AbortController();
    let busy = false;
    const again = async () => {
      // Away in Tailscale's app, Chips is in the background: it looks again on coming back.
      if (busy || AppState.currentState === "background") return;
      busy = true;
      const seen = await look(waiting.url, false, giving.signal);
      busy = false;
      if (!giving.signal.aborted && cleared(seen)) latest.current(waiting);
    };
    const every = setInterval(() => void again(), REACH_LOOKS_MS);
    const back = AppState.addEventListener("change", (state) => {
      if (state === "active") void again();
    });
    return () => {
      giving.abort();
      clearInterval(every);
      back.remove();
    };
  }, [waiting]);
}

/** The sheet is waiting on the Mac or the page: a press does nothing more. */
function waits(kind: AskKind | ReachKind): boolean {
  return kind === "starting" || kind === "opening" || kind === "reaching";
}

/** The sheet's mark: how the program stands, as the banner's would, or the link's way. */
function askMark(words: LinkAsk<AskKind | ReachKind>): MarkKind {
  if (words.kind === "starting" || words.kind === "tailscale-wait") return "starting";
  if (words.kind === "opening" || words.kind === "reaching") return "running";
  if (words.tone === "bad") return "failed";
  return isReachKind(words.kind) ? "plain" : "off";
}

/**
 * The sheet a tapped link brings up while the program isn't running, or while what it links to
 * can't be reached from here: what it needs, the address, and what to press. It stands over the
 * window, the page it asks about under it.
 */
export function LinkAskSheet({
  asked,
  open,
  onGo,
  onAnyway,
  onClose,
  onGone,
}: {
  readonly asked: Asked | undefined;
  readonly open: boolean;
  readonly onGo: () => void;
  readonly onAnyway: () => void;
  readonly onClose: () => void;
  readonly onGone: () => void;
}) {
  return (
    <OverWindow>
      <Sheet open={open} onClose={onClose} onGone={onGone} testID="link-ask">
        {asked === undefined ? null : (
          <AskShown asked={asked} words={askWords(asked)} onGo={onGo} onAnyway={onAnyway} />
        )}
      </Sheet>
    </OverWindow>
  );
}

/** The ink the sheet's line is said in: trouble red, somebody else's change amber, else quiet. */
function askInk(tone: LinkAsk["tone"], palette: Palette): string {
  if (tone === "bad") return palette.redInk;
  return tone === "changed" ? palette.amberInk : palette.ink3;
}

/** What the sheet holds: what the link needs and its address, then what to press. */
function AskShown({
  asked,
  words,
  onGo,
  onAnyway,
}: {
  readonly asked: Asked;
  readonly words: LinkAsk<AskKind | ReachKind>;
  readonly onGo: () => void;
  readonly onAnyway: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.ask}>
      <View style={styles.askRow}>
        <RowMark kind={askMark(words)} icon={isReachKind(words.kind) ? "offline" : "play"} />
        <View style={styles.askWords}>
          <Swap swapKey={words.title}>
            <Text
              accessibilityRole="header"
              style={[styles.askTitle, { color: palette.ink }]}
              testID="link-ask-title"
            >
              {words.title}
            </Text>
          </Swap>
          <Swap swapKey={words.body ?? "none"}>
            {words.body === undefined ? null : (
              <Text
                style={[
                  styles.askBody,
                  { color: askInk(words.tone, palette) },
                  words.tone === "changed" ? styles.strong : null,
                ]}
                testID="link-ask-words"
              >
                {words.body}
              </Text>
            )}
          </Swap>
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            style={[styles.address, { color: palette.ink4 }]}
            testID="link-ask-address"
          >
            {addressShown(asked.url)}
          </Text>
        </View>
      </View>
      {words.go === undefined ? null : (
        <Moves>
          <Button
            label={words.go}
            variant="gold"
            busy={words.busy === true}
            onPress={onGo}
            testID="link-ask-go"
          />
        </Moves>
      )}
      {words.anyway ? (
        <Opening>
          <Button label={OPEN_ANYWAY} variant="plain" onPress={onAnyway} testID="link-ask-anyway" />
        </Opening>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.lg, overflow: "hidden" },
  strong: { fontWeight: "600" },
  ask: { gap: SPACE.md, paddingTop: SPACE.xs },
  askRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACE.md,
    paddingRight: CLOSE_ROOM,
  },
  askWords: { flex: 1, minWidth: 0, gap: 3 },
  askTitle: { fontSize: TEXT.body, fontWeight: "700", lineHeight: 22 },
  askBody: { fontSize: TEXT.md, lineHeight: 20 },
  address: { fontSize: TEXT.xs, fontFamily: "Menlo", marginTop: 2 },
});
