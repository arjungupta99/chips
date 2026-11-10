/**
 * The program's banner over a page of the room's project, on the Mac and the web (ADR 0227's
 * addendum of 9 November 2026; Arjun's pick B of the desktop mock): the phone's banner, at the
 * top of the page window, and the question the phone's sheet asks, asked by the banner itself.
 *
 * It says whether the program runs, with Run while it doesn't and Stop while it does. A link on
 * the page to a web address, clicked while it doesn't, comes to this window rather than opening
 * (the page builder's few lines, told by `frameAsks` which to hand over), and the banner turns
 * gold and asks: Run and open, Open anyway, or ✕. On the Mac, Run and open runs it, waits for the
 * address to answer and opens it in the Mac's browser. A browser can't ask the address, and opens
 * a window only on a press, so there it offers Open once the program runs. In a browser that isn't
 * on the Mac, localhost is not the Mac, and the banner says so. Somebody who isn't the workspace's
 * owner reads whose Mac it runs on, and their links open as they would anywhere (ADR 0231).
 *
 * The words are core's (`programBanner`, `linkAsk`), so the phone, the Mac and the web say the same.
 */

import {
  ANSWER_WAIT_MS,
  type AskKind,
  addressShown,
  askAfterNews,
  askUnheard,
  commandOf,
  type FrameAsks,
  frameAsks,
  HERE_ONLY_MS,
  type LinkAsk,
  linkAsk,
  linkTap,
  memberBanner,
  OPEN_ANYWAY,
  PROGRAM_BANNER,
  type ProgramBanner,
  programBanner,
  type RecipeRead,
  SETTLES_MS,
  type Universe,
} from "@chipschat/core";
import type { ProjectRun } from "@chipschat/protocol";
import { Button, Icon } from "@chipschat/ui";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { Folders, Room } from "../folders.ts";
import { answersWithin } from "./answers.ts";
import {
  type ChangedSince,
  type RunHere,
  type RunOnMac,
  useAwayRun,
  useMacRun,
} from "./RunBar.tsx";

/** What the banner reads of the room's project. Each is the project's own, where it has one. */
export interface PageProgramProject {
  readonly universe?: (() => Promise<Universe>) | undefined;
  readonly folders?: Folders | undefined;
  readonly runs?: RunOnMac | undefined;
  readonly onTheMac?: (() => Promise<boolean>) | undefined;
  readonly changedSince?: ChangedSince | undefined;
  readonly room?: (() => Room) | undefined;
  readonly ownerName?: (() => string | undefined) | undefined;
  readonly openLink?: ((url: string) => void) | undefined;
}

/** A link the banner is asking about, and where the asking stands. */
interface Asked {
  readonly url: string;
  readonly kind: AskKind;
  readonly said?: string | undefined;
  readonly changed?: string | undefined;
}

/** Where an address goes when this client has no way to open one. */
const NOWHERE = (_url: string) => undefined;

/** How long a sheet that heard Run and open waits for the Mac to say the run started. */
const NEWS_WAIT_MS = 15_000;

/**
 * The banner, where the room's project has a program: whose run it is decides what it can do.
 * `frame` is the page's frame, `loaded` whether it has drawn, so it can be told which links to
 * hand over.
 */
export function PageProgram({
  project,
  frame,
  loaded,
}: {
  readonly project: PageProgramProject;
  readonly frame: RefObject<HTMLIFrameElement | null>;
  readonly loaded: boolean;
}) {
  const recipe = useProgram(project.universe);
  const runsHere = useRunsHere(project.folders);
  const mine = useAnswer(project.onTheMac);
  if (recipe === undefined || mine === undefined) return null;
  if (!mine) {
    return <PageBannerView banner={memberBanner(project.ownerName?.())} />;
  }
  if (runsHere === true && project.folders !== undefined && project.room !== undefined) {
    return (
      <OnTheMac
        project={project}
        folders={project.folders}
        room={project.room()}
        recipe={recipe}
        frame={frame}
        loaded={loaded}
      />
    );
  }
  if (project.runs !== undefined) {
    return (
      <AwayFromTheMac
        project={project}
        runs={project.runs}
        recipe={recipe}
        frame={frame}
        loaded={loaded}
      />
    );
  }
  return null;
}

interface HeldProps {
  readonly project: PageProgramProject;
  readonly recipe: Exclude<RecipeRead, undefined | { readonly why: string }>;
  readonly frame: RefObject<HTMLIFrameElement | null>;
  readonly loaded: boolean;
}

/** In Chips for Mac, on the Mac that runs it: Run runs it here, and localhost is this Mac. */
function OnTheMac(props: HeldProps & { readonly folders: Folders; readonly room: Room }) {
  const here = useMacRun({
    room: props.room,
    folders: props.folders,
    recipe: props.recipe,
    changedSince: props.project.changedSince,
    ticks: false,
  });
  return <AskingBanner {...props} here={here} onTheMac />;
}

/** In a browser: the press goes to the person's Mac, whose word comes back. */
function AwayFromTheMac(props: HeldProps & { readonly runs: RunOnMac }) {
  const here = useAwayRun({
    runs: props.runs,
    recipe: props.recipe,
    changedSince: props.project.changedSince,
    ticks: false,
  });
  return <AskingBanner {...props} here={here} onTheMac={false} />;
}

/** The space's program, once its project is read; nothing while it isn't, or where it has none. */
function useProgram(universe: PageProgramProject["universe"]): HeldProps["recipe"] | undefined {
  const [recipe, setRecipe] = useState<HeldProps["recipe"] | undefined>();
  useEffect(() => {
    if (universe === undefined) return;
    let live = true;
    universe().then(
      (read) => live && setRecipe(read.program),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [universe]);
  return recipe;
}

/** Whether this app keeps the Mac's folders, once it has said; nothing until then. */
function useRunsHere(folders: Folders | undefined): boolean | undefined {
  return useAnswer(folders === undefined ? undefined : folders.available);
}

/** A yes or no asked once: nothing until it answers, and no when it fails or there is no asking. */
function useAnswer(ask: (() => Promise<boolean>) | undefined): boolean | undefined {
  const [said, setSaid] = useState<boolean | undefined>(ask === undefined ? false : undefined);
  useEffect(() => {
    if (ask === undefined) return setSaid(false);
    let live = true;
    ask().then(
      (yes) => live && setSaid(yes),
      () => live && setSaid(false),
    );
    return () => {
      live = false;
    };
  }, [ask]);
  return said;
}

/** The banner of a run this person holds: Run and Stop, and the question a link brings up. */
function AskingBanner({
  project,
  recipe,
  here,
  onTheMac,
  frame,
  loaded,
}: HeldProps & { readonly here: RunHere; readonly onTheMac: boolean }) {
  const banner = programBanner(here.bar);
  const asking = usePageAsk({ here, banner, recipe, onTheMac, opens: project.openLink ?? NOWHERE });
  useFrameAsks(
    frame,
    loaded,
    frameAsks({ program: true, owner: true, kind: banner.kind, onTheMac }),
  );
  useHandedOver(frame, asking.tap);
  if (asking.asked !== undefined) {
    return (
      <PageAskView
        asked={asking.asked}
        words={linkAsk(asking.asked.kind, asking.asked)}
        onGo={asking.go}
        onAnyway={asking.anyway}
        onClose={asking.close}
      />
    );
  }
  return (
    <PageBannerView
      banner={banner}
      hereOnly={asking.hereOnly}
      busy={here.busy}
      onRun={() => void here.press({ op: "run", command: commandOf(recipe) })}
      onStop={() => void here.press({ op: "stop" })}
    />
  );
}

/** The frame told which links to hand over: when it has drawn, and again as that changes. */
function useFrameAsks(
  frame: RefObject<HTMLIFrameElement | null>,
  loaded: boolean,
  asks: FrameAsks,
) {
  useEffect(() => {
    if (!loaded) return;
    frame.current?.contentWindow?.postMessage({ chipsAsks: asks }, "*");
  }, [frame, loaded, asks]);
}

/** A web address the frame handed over, from this frame's page and no other. */
function useHandedOver(frame: RefObject<HTMLIFrameElement | null>, tap: (url: string) => void) {
  const latest = useRef(tap);
  latest.current = tap;
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source === null || event.source !== frame.current?.contentWindow) return;
      const url = (event.data as { chipsAddress?: unknown } | null)?.chipsAddress;
      if (typeof url === "string" && /^https?:\/\//i.test(url)) latest.current(url);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [frame]);
}

/**
 * What a link handed over does, and the question the banner asks about it: asked, run, waited for,
 * opened. `here` is the person's run, `banner` how it stands as the banner says it.
 */
function usePageAsk({
  here,
  banner,
  recipe,
  onTheMac,
  opens,
}: {
  readonly here: RunHere;
  readonly banner: ProgramBanner;
  readonly recipe: HeldProps["recipe"];
  readonly onTheMac: boolean;
  readonly opens: (url: string) => void;
}) {
  const [asked, setAsked] = useState<Asked | undefined>();
  const [hereOnlyAt, setHereOnlyAt] = useState<number | undefined>();
  // Read when the page answers, whenever that is, so the waiting isn't begun again for it.
  const opening = useRef(opens);
  opening.current = opens;
  // The run as it stood when the banner began to wait on it, so what the Mac says after is news;
  // `null` while it waits on nothing.
  const before = useRef<ProjectRun | undefined | null>(null);
  const [heard, setHeard] = useState(false);

  useEffect(() => {
    if (hereOnlyAt === undefined) return;
    const done = setTimeout(() => setHereOnlyAt(undefined), HERE_ONLY_MS);
    return () => clearTimeout(done);
  }, [hereOnlyAt]);

  // While it starts: what the Mac says. Running, the Mac waits for the page to answer and a
  // browser offers Open; ended, failed or stopped, the banner says so.
  const { run } = here;
  // biome-ignore lint/correctness/useExhaustiveDependencies: news is a new word from the Mac, read with the words of that moment.
  useEffect(() => {
    if (asked?.kind !== "starting" || before.current === null) return;
    if (run === before.current) return;
    before.current = run;
    setHeard(true);
    const next = askAfterNews(run, banner);
    if (next === undefined) return;
    before.current = null;
    setAsked({
      ...asked,
      ...next,
      kind: next.kind === "opening" && !onTheMac ? "ready" : next.kind,
    });
  }, [run, asked?.kind]);

  // A Mac that heard Run and open but says nothing: the waiting doesn't go on for ever.
  useEffect(() => {
    if (asked?.kind !== "starting" || heard || before.current === null) return;
    const given = setTimeout(() => {
      before.current = null;
      setAsked((was) =>
        was?.kind === "starting"
          ? {
              ...was,
              kind: "unheard",
              said: "Your Mac hasn’t said it started. Programs in Universe shows how it stands.",
            }
          : was,
      );
    }, NEWS_WAIT_MS);
    return () => clearTimeout(given);
  }, [asked?.kind, heard]);

  // Running, on the Mac: the page is opened once its address answers, or the banner says it hasn't.
  const url = asked?.url;
  useEffect(() => {
    if (asked?.kind !== "opening" || url === undefined) return;
    const giving = new AbortController();
    void answersWithin(url, ANSWER_WAIT_MS, giving.signal).then((answered) => {
      if (giving.signal.aborted) return;
      if (!answered) {
        setAsked((was) => (was === undefined ? was : { ...was, kind: "quiet" }));
        return;
      }
      setAsked(undefined);
      opening.current(url);
    });
    return () => giving.abort();
  }, [asked?.kind, url]);

  const tap = (tapped: string) => {
    const what = linkTap({ url: tapped, program: true, owner: true, kind: banner.kind, onTheMac });
    if (what === "open") return opens(tapped);
    if (what === "here-only") return setHereOnlyAt(Date.now());
    setHeard(false);
    if (banner.kind === "starting") {
      // Already starting: the banner waits on that run.
      before.current = here.run;
      return setAsked({ url: tapped, kind: "starting" });
    }
    before.current = null;
    setAsked({
      url: tapped,
      kind: "ask",
      changed: banner.tone === "changed" ? banner.body : undefined,
    });
  };

  const anyway = () => {
    if (asked === undefined) return;
    before.current = null;
    setAsked(undefined);
    opens(asked.url);
  };

  const go = async () => {
    if (asked === undefined) return;
    if (asked.kind === "quiet" || asked.kind === "ready") return anyway();
    if (asked.kind === "starting" || asked.kind === "opening") return;
    before.current = here.run;
    setHeard(false);
    setAsked({ url: asked.url, kind: "starting" });
    const said = askUnheard(await here.press({ op: "run", command: commandOf(recipe) }));
    if (said === undefined) return;
    before.current = null;
    setAsked((was) =>
      was === undefined ? was : { ...was, kind: onTheMac ? "failed" : "unheard", said },
    );
  };

  return {
    asked,
    hereOnly: hereOnlyAt !== undefined,
    tap,
    go: () => void go(),
    anyway,
    close: () => {
      before.current = null;
      setAsked(undefined);
    },
  };
}

/**
 * A run that has just started says its links open now, then the banner folds to one line: the
 * words are there for a moment, not for as long as it runs. Opened on a run already going, it
 * starts folded.
 */
function useFresh(kind: ProgramBanner["kind"]): boolean {
  const was = useRef(kind);
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const came = kind === "running" && was.current !== "running";
    was.current = kind;
    if (!came) return setFresh(false);
    setFresh(true);
    const done = setTimeout(() => setFresh(false), SETTLES_MS);
    return () => clearTimeout(done);
  }, [kind]);
  return fresh;
}

/** The dot that says how it stands, as the run bar's does. */
function markOf(banner: ProgramBanner): "off" | "starting" | "running" | "bad" {
  if (banner.kind === "starting") return "starting";
  if (banner.kind === "running") return "running";
  return banner.tone === "bad" ? "bad" : "off";
}

/** How the program stands: its line, its words, and Run or Stop. */
export function PageBannerView({
  banner,
  hereOnly = false,
  busy = false,
  onRun,
  onStop,
}: {
  readonly banner: ProgramBanner;
  readonly hereOnly?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly onRun?: (() => void) | undefined;
  readonly onStop?: (() => void) | undefined;
}) {
  const fresh = useFresh(banner.kind);
  const settled = banner.settles === true && !fresh;
  const body = hereOnly ? PROGRAM_BANNER.hereOnly : settled ? undefined : banner.body;
  const tone = hereOnly ? "plain" : banner.tone;
  return (
    <div className="page-banner" data-kind={banner.kind} data-testid="page-banner">
      <span className="page-banner-mark" data-mark={markOf(banner)} aria-hidden="true" />
      <div className="page-banner-words" key={`${banner.title}|${body ?? ""}`}>
        <b className="page-banner-title" data-testid="page-banner-title">
          {banner.title}
        </b>
        {body !== undefined && (
          <span className="page-banner-body" data-tone={tone} data-testid="page-banner-words">
            {body}
          </span>
        )}
      </div>
      <div className="page-banner-acts" key={banner.press ?? "none"}>
        {banner.press === "run" && onRun !== undefined && (
          <button
            type="button"
            className="page-banner-go"
            disabled={busy}
            onClick={onRun}
            aria-label="Run program"
            data-testid="page-banner-run"
          >
            <Icon name="play" size={12} />
            Run
          </button>
        )}
        {banner.press === "stop" && onStop !== undefined && (
          <button
            type="button"
            className="page-banner-go"
            data-tone="stop"
            disabled={busy}
            onClick={onStop}
            aria-label="Stop program"
            data-testid="page-banner-stop"
          >
            <Icon name="stop" size={11} />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

/** The dot of the question: how the program stands while it asks, waits or says why not. */
function askMark(words: LinkAsk): "off" | "starting" | "running" | "bad" {
  if (words.kind === "starting") return "starting";
  if (words.kind === "opening" || words.kind === "ready") return "running";
  return words.tone === "bad" ? "bad" : "off";
}

/** The banner asking about a link: what it needs and its address, then the presses. */
export function PageAskView({
  asked,
  words,
  onGo,
  onAnyway,
  onClose,
}: {
  readonly asked: Asked;
  readonly words: LinkAsk;
  readonly onGo: () => void;
  readonly onAnyway: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div
      className="page-banner"
      data-asking=""
      data-kind={words.kind}
      role="alert"
      data-testid="page-banner"
    >
      <span className="page-banner-mark" data-mark={askMark(words)} aria-hidden="true" />
      <div className="page-banner-words" key={`${words.title}|${words.body ?? ""}`}>
        <b className="page-banner-title" data-testid="page-banner-title">
          {words.title}
        </b>
        {words.body !== undefined && (
          <span className="page-banner-body" data-tone={words.tone} data-testid="page-banner-words">
            {words.body}
          </span>
        )}
        <code className="page-banner-address" title={asked.url} data-testid="page-banner-address">
          {addressShown(asked.url)}
        </code>
      </div>
      <div className="page-banner-acts" key={`ask|${words.kind}`}>
        {words.go !== undefined && (
          <button
            type="button"
            className="page-banner-go"
            data-busy={words.busy === true || undefined}
            disabled={words.busy === true}
            onClick={onGo}
            data-testid="page-banner-ask-go"
          >
            {words.busy === true && <span className="page-banner-ring" aria-hidden="true" />}
            {words.go}
          </button>
        )}
        {words.anyway && (
          <Button size="sm" variant="ghost" onClick={onAnyway} data-testid="page-banner-ask-anyway">
            {OPEN_ANYWAY}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          aria-label="Not now"
          data-testid="page-banner-ask-close"
        >
          <Icon name="x" size={14} />
        </Button>
      </div>
    </div>
  );
}
