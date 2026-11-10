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
  commandOf,
  HERE_ONLY_MS,
  type LinkAsk,
  linkAsk,
  linkTap,
  OPEN_ANYWAY,
  PROGRAM_BANNER,
  type ProgramBanner,
  type RecipeRead,
  RUN_AND_OPEN,
  SETTLES_MS,
} from "@chipschat/core";
import type { HeldRun } from "@chipschat/protocol";
import { useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Sheet } from "../ui/Sheet";
import { CLOSE_ROOM } from "../ui/SheetClose";
import { OverWindow } from "../ui/Split";
import { Swap } from "../ui/Swap";
import { usePalette } from "../ui/theme";
import { type Palette, RADIUS, SPACE, TEXT } from "../ui/tokens";
import { answersWithin } from "./answers";
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
  onRun,
  onStop,
}: {
  readonly banner: ProgramBanner;
  /** Asking the Mac, or waiting on what it says. */
  readonly busy: boolean;
  /** A localhost link was just tapped: the banner says it opens only on the Mac. */
  readonly hereOnly: boolean;
  readonly onRun: () => void;
  readonly onStop: () => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const fresh = useFresh(banner.kind);
  const { body, tone } = bannerWords(banner, hereOnly, fresh);
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
 * one was tapped; nothing once a run that just started has settled; else its own words.
 */
function bannerWords(
  banner: ProgramBanner,
  hereOnly: boolean,
  fresh: boolean,
): { readonly body: string | undefined; readonly tone: ProgramBanner["tone"] } {
  if (hereOnly) return { body: PROGRAM_BANNER.hereOnly, tone: "plain" };
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
  readonly kind: AskKind;
  /** What the Mac said when it couldn't. */
  readonly said?: string | undefined;
  /** Who changed the files since the person last ran it (SEC-40). */
  readonly changed?: string | undefined;
}

/** The browser or mail: at once, or after `after` milliseconds. */
function outside(url: string, after = 0): void {
  const go = () => void Linking.openURL(url).catch(() => undefined);
  if (after === 0) go();
  else setTimeout(go, after);
}

/**
 * What a tapped link does in Universe, and the sheet it brings up: asked, run, waited for, opened.
 * `held` is the person's run, `banner` how it stands as the banner says it.
 */
export function useLinkAsk({
  held,
  banner,
  recipe,
  program,
  owner,
}: {
  readonly held: RunHeld;
  readonly banner: ProgramBanner;
  readonly recipe: RecipeRead;
  /** The space has a program its run file says how to run. */
  readonly program: boolean;
  /** The person is the workspace's owner, who runs it (ADR 0231). */
  readonly owner: boolean;
}) {
  const [asked, setAsked] = useState<Asked | undefined>();
  const [open, setOpen] = useState(false);
  const [hereOnlyAt, setHereOnlyAt] = useState<number | undefined>();
  // The run as it stood when the sheet began to wait on it, so what the Mac says after is news;
  // `null` while the sheet waits on nothing.
  const before = useRef<HeldRun | undefined | null>(null);
  const [heard, setHeard] = useState(false);

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

  const tap = (tapped: string) => {
    const what = linkTap({ url: tapped, program, owner, kind: banner.kind });
    if (what === "open") return outside(tapped);
    if (what === "here-only") return setHereOnlyAt(Date.now());
    setHeard(false);
    if (banner.kind === "starting") {
      // Already starting: the sheet waits on that run.
      before.current = held.run;
      setAsked({ url: tapped, kind: "starting" });
    } else {
      before.current = null;
      setAsked({
        url: tapped,
        kind: "ask",
        changed: banner.tone === "changed" ? banner.body : undefined,
      });
    }
    setOpen(true);
  };

  const anyway = () => {
    if (asked === undefined) return;
    setOpen(false);
    outside(asked.url, AFTER_SHEET_MS);
  };

  const go = async () => {
    if (asked?.kind === "quiet") return anyway();
    if (asked === undefined || waits(asked.kind) || recipe === undefined || "why" in recipe) return;
    before.current = held.run;
    setHeard(false);
    setAsked({ url: asked.url, kind: "starting" });
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
    close: () => setOpen(false),
    gone: () => {
      before.current = null;
      setAsked(undefined);
    },
  };
}

/** The sheet is waiting on the Mac or the page: a press does nothing more. */
function waits(kind: AskKind): boolean {
  return kind === "starting" || kind === "opening";
}

/** The sheet's mark: how the program stands, as the banner's would. */
function askMark(words: LinkAsk): MarkKind {
  if (words.kind === "starting") return "starting";
  if (words.kind === "opening") return "running";
  if (words.tone === "bad") return "failed";
  return "off";
}

/**
 * The sheet a tapped link brings up while the program isn't running: what it needs, the address,
 * Run and open, and Open anyway. It stands over the window, the page it asks about under it.
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
          <AskShown
            asked={asked}
            words={linkAsk(asked.kind, asked)}
            onGo={onGo}
            onAnyway={onAnyway}
          />
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

/** What the sheet holds: what the link needs and its address, then Run and open and Open anyway. */
function AskShown({
  asked,
  words,
  onGo,
  onAnyway,
}: {
  readonly asked: Asked;
  readonly words: LinkAsk;
  readonly onGo: () => void;
  readonly onAnyway: () => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.ask}>
      <View style={styles.askRow}>
        <RowMark kind={askMark(words)} icon="play" />
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
      <Moves>
        <Button
          label={words.go ?? RUN_AND_OPEN}
          variant="gold"
          busy={words.busy === true}
          onPress={onGo}
          testID="link-ask-go"
        />
      </Moves>
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
