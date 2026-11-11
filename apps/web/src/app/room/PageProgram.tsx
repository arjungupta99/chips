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
  type Blocked,
  blockedBy,
  cleared,
  commandOf,
  type FrameAsks,
  frameAsks,
  HERE_ONLY_MS,
  isReachKind,
  type LinkAsk,
  type LinkSeen,
  linkAsk,
  linkName,
  linksThroughTailscale,
  linkTap,
  memberBanner,
  needsLooking,
  networkOf,
  OPEN_ANYWAY,
  PROGRAM_BANNER,
  type ProgramBanner,
  programBanner,
  REACH_AFTER_MS,
  REACH_LOOKS_MS,
  REACH_NOTE_MS,
  REACH_SHOWS_MS,
  type ReachDevice,
  type ReachKind,
  type RecipeRead,
  reachAsk,
  reachLine,
  reachNote,
  SETTLES_MS,
  type Universe,
} from "@chipschat/core";
import type { ProjectRun } from "@chipschat/protocol";
import { Button, Icon } from "@chipschat/ui";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
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
  /**
   * What the Mac sees of a link only some devices reach, before it opens it (ADR 0227's addendum
   * of 10 November 2026): the Mac app's; a browser can't look.
   */
  readonly look?:
    | ((url: string, ask: boolean, signal: AbortSignal) => Promise<LinkSeen | undefined>)
    | undefined;
  /** The Mac's tunnels now, for the banner's line. */
  readonly tunnels?: (() => Promise<Pick<LinkSeen, "tailscale"> | undefined>) | undefined;
  /** Tailscale on the Mac, or its download page. */
  readonly openTailscale?: ((get: boolean) => void) | undefined;
}

/** A link the banner is asking about, and where the asking stands. */
interface Asked {
  readonly url: string;
  readonly kind: AskKind | ReachKind;
  readonly said?: string | undefined;
  readonly changed?: string | undefined;
  /** The link's name, as the page says it. */
  readonly name?: string | undefined;
  /** The person's program wasn't running when the link was clicked. */
  readonly stopped?: boolean | undefined;
  /** Whose tailnet it is, for somebody who isn't the owner. */
  readonly ownerName?: string | undefined;
  /** Tailscale has just come on: the page is given longer to answer. */
  readonly after?: boolean | undefined;
}

/**
 * The device, as the words name it. Only the Mac app looks at a link before it opens it, so only
 * it says what stands in a link's way; a browser's note after says "this computer" (`reachNote`).
 */
const DEVICE: ReachDevice = "Mac";

/** The banner's words, for where it is: the program's question, or what stands in a link's way. */
function askWords(asked: Asked): LinkAsk<AskKind | ReachKind> {
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

/** Where an address goes when this client has no way to open one. */
const NOWHERE = (_url: string) => undefined;

/** How long a sheet that heard Run and open waits for the Mac to say the run started. */
const NEWS_WAIT_MS = 15_000;

/**
 * The banner, where the room's project has a program: whose run it is decides what it can do.
 * `frame` is the page's frame, `loads` how many times it has drawn a page, so each can be told
 * which links to hand over.
 */
export function PageProgram({
  project,
  frame,
  loads,
  html,
}: {
  readonly project: PageProgramProject;
  readonly frame: RefObject<HTMLIFrameElement | null>;
  readonly loads: number;
  /** The page's words, where the window has them, so the banner can say its links need Tailscale. */
  readonly html?: string | undefined;
}) {
  const recipe = useProgram(project.universe);
  const runsHere = useRunsHere(project.folders);
  const mine = useAnswer(project.onTheMac);
  if (recipe === undefined || mine === undefined) return null;
  if (!mine) return <MemberBanner project={project} frame={frame} loads={loads} />;
  if (runsHere === true && project.folders !== undefined && project.room !== undefined) {
    return (
      <OnTheMac
        project={project}
        folders={project.folders}
        room={project.room()}
        recipe={recipe}
        frame={frame}
        loads={loads}
        html={html}
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
        loads={loads}
        html={html}
      />
    );
  }
  return null;
}

interface HeldProps {
  readonly project: PageProgramProject;
  readonly recipe: Exclude<RecipeRead, undefined | { readonly why: string }>;
  readonly frame: RefObject<HTMLIFrameElement | null>;
  readonly loads: number;
  readonly html: string | undefined;
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
  loads,
  html,
}: HeldProps & { readonly here: RunHere; readonly onTheMac: boolean }) {
  const banner = programBanner(here.bar);
  const asking = usePageAsk({
    here,
    banner,
    recipe,
    onTheMac,
    opens: project.openLink ?? NOWHERE,
    look: project.look,
    openTailscale: project.openTailscale,
  });
  const note = useOpenedNote(frame);
  const line = useTailscaleLine(html, project.tunnels, isUp(banner.kind));
  useFrameAsks(
    frame,
    loads,
    frameAsks({ program: true, owner: true, kind: banner.kind, onTheMac }),
  );
  useHandedOver(frame, asking.tap);
  if (asking.asked !== undefined) {
    return (
      <PageAskView
        asked={asking.asked}
        words={askWords(asking.asked)}
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
      note={note}
      line={line}
      busy={here.busy}
      onRun={() => void here.press({ op: "run", command: commandOf(recipe) })}
      onStop={() => void here.press({ op: "stop" })}
    />
  );
}

/**
 * The frame told which links to hand over: each time it has drawn a page, and again as that
 * changes. Nothing is told while `loads` is 0.
 */
function useFrameAsks(frame: RefObject<HTMLIFrameElement | null>, loads: number, asks: FrameAsks) {
  useEffect(() => {
    if (loads === 0) return;
    frame.current?.contentWindow?.postMessage({ chipsAsks: asks }, "*");
  }, [frame, loads, asks]);
}

/**
 * A web address this frame's page said, and no other's: one it handed over (`chipsAddress`) or
 * one it opened itself (`chipsOpened`), with the link's name as the page builder read it.
 */
function heardFrom(
  event: MessageEvent,
  frame: RefObject<HTMLIFrameElement | null>,
  key: "chipsAddress" | "chipsOpened",
): { readonly url: string; readonly name: string | undefined } | undefined {
  if (event.source === null || event.source !== frame.current?.contentWindow) return undefined;
  const data = event.data as Record<string, unknown> | null;
  const url = data?.[key];
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return undefined;
  const words = data?.["chipsWords"];
  return { url, name: linkName(typeof words === "string" ? words : undefined) };
}

/** Running, or on its way: the banner's Tailscale line says only Tailscale is missing. */
function isUp(kind: ProgramBanner["kind"]): boolean {
  return kind === "running" || kind === "starting";
}

/** A web address the frame handed over, with its name, from this frame's page and no other. */
function useHandedOver(
  frame: RefObject<HTMLIFrameElement | null>,
  tap: (url: string, name: string | undefined) => void,
) {
  const latest = useRef(tap);
  latest.current = tap;
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      const heard = heardFrom(event, frame, "chipsAddress");
      if (heard !== undefined) latest.current(heard.url, heard.name);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [frame]);
}

/**
 * What a link handed over does, and the question the banner asks about it: asked, run, waited for,
 * opened. `here` is the person's run, `banner` how it stands as the banner says it. In the Mac
 * app, a link only some devices reach (Tailscale's, a private network's) is looked at first (ADR
 * 0227's addendum of 10 November 2026).
 */
function usePageAsk({
  here,
  banner,
  recipe,
  onTheMac,
  opens,
  look,
  openTailscale,
}: {
  readonly here: RunHere;
  readonly banner: ProgramBanner;
  readonly recipe: HeldProps["recipe"];
  readonly onTheMac: boolean;
  readonly opens: (url: string) => void;
  readonly look: PageProgramProject["look"];
  readonly openTailscale: PageProgramProject["openTailscale"];
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
  // Each look at a link, so one overtaken by a later click or a closed question says nothing.
  const looking = useRef(0);
  // How the program stands now, for a look that answers after it changed.
  const standing = useRef(banner);
  standing.current = banner;

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

  // Running, on the Mac: the page is opened once its address answers, or the banner says it
  // hasn't. Just after Tailscale came on, the same, with longer for the new tunnel.
  const url = asked?.url;
  const after = asked?.after === true;
  useEffect(() => {
    const waiting = asked?.kind === "opening" || (asked?.kind === "reaching" && after);
    if (!waiting || url === undefined) return;
    const giving = new AbortController();
    void answersWithin(url, after ? REACH_AFTER_MS : ANSWER_WAIT_MS, giving.signal).then(
      (answered) => {
        if (giving.signal.aborted) return;
        if (!answered) {
          setAsked((was) =>
            was === undefined ? was : { ...was, kind: after ? "mac-quiet" : "quiet", after: false },
          );
          return;
        }
        setAsked(undefined);
        opening.current(url);
      },
    );
    return () => giving.abort();
  }, [asked?.kind, url, after]);

  /** The program's question for a link: waiting on a run already starting, or asking to run it. */
  const askToRun = (tapped: string, name: string | undefined) => {
    const now = standing.current;
    setHeard(false);
    before.current = now.kind === "starting" ? here.run : null;
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
  };

  /** The program's own question for a link, as before a link had to be reached first. */
  const programTap = (tapped: string, name: string | undefined) => {
    const kind = standing.current.kind;
    const what = linkTap({ url: tapped, program: true, owner: true, kind, onTheMac });
    if (what === "open") {
      setAsked(undefined);
      return opens(tapped);
    }
    if (what === "here-only") return setHereOnlyAt(Date.now());
    askToRun(tapped, name);
  };

  /**
   * A link only some devices reach: looked at, and opened, or the banner says what stands in its
   * way. It shows it's opening only when the look takes a while.
   */
  const reach = async (tapped: string, name: string | undefined) => {
    if (look === undefined) return programTap(tapped, name);
    const turn = ++looking.current;
    const stopped = standing.current.kind !== "running";
    const shows = setTimeout(() => {
      if (looking.current !== turn) return;
      before.current = null;
      setAsked({ url: tapped, name, kind: "reaching" });
    }, REACH_SHOWS_MS);
    const seen = await look(tapped, !stopped, new AbortController().signal);
    clearTimeout(shows);
    if (looking.current !== turn) return;
    const blocked = seen === undefined ? undefined : blockedBy(networkOf(tapped), seen, true);
    if (blocked === undefined) return programTap(tapped, name);
    before.current = null;
    setAsked({ url: tapped, name, kind: blocked, stopped });
  };

  // Waiting for Tailscale: looked at again until the name is found, then on to the program's
  // question while it isn't running, else to opening the page.
  const waiting = asked !== undefined && WAITS_FOR_TAILSCALE.has(asked.kind) ? asked : undefined;
  useLooksAgain(waiting, look, (on) => {
    if (standing.current.kind !== "running") return programTap(on.url, on.name);
    setAsked({ ...on, kind: "reaching", after: true });
  });

  const tap = (tapped: string, name: string | undefined) => {
    if (needsLooking(tapped)) return void reach(tapped, name);
    looking.current += 1;
    programTap(tapped, name);
  };

  const anyway = () => {
    if (asked === undefined) return;
    looking.current += 1;
    before.current = null;
    setAsked(undefined);
    opens(asked.url);
  };

  /** The gold button, for a link the Mac has to reach first: Tailscale, or another look. */
  const reachGo = (on: Asked) => {
    const { opens: does } = askWords(on);
    if (does === "again") return void reach(on.url, on.name);
    if (does === undefined) return;
    openTailscale?.(does === "get");
    setAsked({ ...on, kind: "tailscale-wait" });
  };

  const go = async () => {
    if (asked === undefined) return;
    if (isReachKind(asked.kind)) return reachGo(asked);
    if (asked.kind === "quiet" || asked.kind === "ready") return anyway();
    if (asked.kind === "starting" || asked.kind === "opening") return;
    before.current = here.run;
    setHeard(false);
    setAsked({ url: asked.url, name: asked.name, kind: "starting" });
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
      looking.current += 1;
      before.current = null;
      setAsked(undefined);
    },
  };
}

/** Where the banner waits for Tailscale to come on, looking again as it waits. */
const WAITS_FOR_TAILSCALE: ReadonlySet<string> = new Set([
  "tailscale-off",
  "other-vpn",
  "not-installed",
  "tailscale-wait",
  "vpn-in-way",
]);

/** How often the banner reads the Mac's tunnels again while it shows a page through Tailscale. */
const LINE_READS_MS = 3000;

/**
 * While the banner waits for Tailscale, the link looked at again as the window comes forward and
 * every moment while it waits; `clear` once its name is found.
 */
function useLooksAgain(
  waiting: Asked | undefined,
  look: PageProgramProject["look"],
  clear: (on: Asked) => void,
) {
  const latest = useRef(clear);
  latest.current = clear;
  useEffect(() => {
    if (waiting === undefined || look === undefined) return;
    const giving = new AbortController();
    let busy = false;
    const again = async () => {
      if (busy) return;
      busy = true;
      const seen = await look(waiting.url, false, giving.signal);
      busy = false;
      if (!giving.signal.aborted && seen !== undefined && cleared(seen)) latest.current(waiting);
    };
    const every = setInterval(() => void again(), REACH_LOOKS_MS);
    const back = () => void again();
    window.addEventListener("focus", back);
    return () => {
      giving.abort();
      clearInterval(every);
      window.removeEventListener("focus", back);
    };
  }, [waiting, look]);
}

/**
 * The banner's line while the page links through Tailscale and this Mac isn't on it: read from
 * the Mac's tunnels as the page is shown, as the window comes forward, and every few seconds, so
 * it folds away once Tailscale comes on. Nothing in a browser, which can't tell.
 */
function useTailscaleLine(
  html: string | undefined,
  tunnels: PageProgramProject["tunnels"],
  running: boolean,
): string | undefined {
  const through = useMemo(() => html !== undefined && linksThroughTailscale(html), [html]);
  const [off, setOff] = useState(false);
  useEffect(() => {
    if (!through || tunnels === undefined) {
      setOff(false);
      return;
    }
    let live = true;
    const read = () =>
      void tunnels().then((seen) => {
        if (live) setOff(seen?.tailscale === false);
      });
    read();
    const every = setInterval(read, LINE_READS_MS);
    window.addEventListener("focus", read);
    return () => {
      live = false;
      clearInterval(every);
      window.removeEventListener("focus", read);
    };
  }, [through, tunnels]);
  return off ? reachLine(running, DEVICE) : undefined;
}

/**
 * What a browser says after a link opened by itself, should it need what the browser can't look
 * at (Tailscale, a private network): heard from this frame's page, said for a few seconds.
 */
function useOpenedNote(frame: RefObject<HTMLIFrameElement | null>): string | undefined {
  const [note, setNote] = useState<{ readonly words: string; readonly at: number } | undefined>();
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      const heard = heardFrom(event, frame, "chipsOpened");
      const words = heard === undefined ? undefined : reachNote(heard.url, heard.name);
      if (words !== undefined) setNote({ words, at: Date.now() });
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [frame]);
  useEffect(() => {
    if (note === undefined) return;
    const done = setTimeout(() => setNote(undefined), REACH_NOTE_MS);
    return () => clearTimeout(done);
  }, [note]);
  return note?.words;
}

/** What stands in a link's way for somebody who isn't the owner, where the Mac can look. */
async function memberBlocked(
  url: string,
  look: PageProgramProject["look"],
): Promise<Blocked | undefined> {
  if (!needsLooking(url) || look === undefined) return undefined;
  const seen = await look(url, false, new AbortController().signal);
  return seen === undefined ? undefined : blockedBy(networkOf(url), seen, false);
}

/**
 * The banner for somebody who isn't the workspace's owner (ADR 0231): whose Mac it runs on. In
 * the Mac app their links are looked at first too, and a link on the owner's tailnet says so; in
 * a browser, what a link needed is said after it opened.
 */
function MemberBanner({
  project,
  frame,
  loads,
}: {
  readonly project: PageProgramProject;
  readonly frame: RefObject<HTMLIFrameElement | null>;
  readonly loads: number;
}) {
  const ownerName = project.ownerName?.();
  const banner = memberBanner(ownerName);
  const opens = project.openLink ?? NOWHERE;
  const [asked, setAsked] = useState<Asked | undefined>();
  const looking = useRef(0);
  const note = useOpenedNote(frame);
  // Only the Mac app looks, so only it hears their links; a browser leaves them to open.
  useFrameAsks(
    frame,
    project.look === undefined ? 0 : loads,
    frameAsks({ program: true, owner: false, kind: banner.kind, onTheMac: true }),
  );
  const tap = (url: string, name: string | undefined) => {
    const turn = ++looking.current;
    void memberBlocked(url, project.look).then((blocked) => {
      if (looking.current !== turn) return;
      if (blocked === undefined) {
        setAsked(undefined);
        return opens(url);
      }
      setAsked({ url, name, kind: blocked, ownerName });
    });
  };
  useHandedOver(frame, tap);
  if (asked !== undefined) {
    return (
      <PageAskView
        asked={asked}
        words={askWords(asked)}
        onGo={() => tap(asked.url, asked.name)}
        onAnyway={() => {
          setAsked(undefined);
          opens(asked.url);
        }}
        onClose={() => {
          looking.current += 1;
          setAsked(undefined);
        }}
      />
    );
  }
  return <PageBannerView banner={banner} note={note} />;
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
  note,
  line,
  busy = false,
  onRun,
  onStop,
}: {
  readonly banner: ProgramBanner;
  readonly hereOnly?: boolean | undefined;
  /** What a link a browser opened by itself needed, for a few seconds after (`reachNote`). */
  readonly note?: string | undefined;
  /** The page's links need Tailscale and this Mac isn't on it (`reachLine`). */
  readonly line?: string | undefined;
  readonly busy?: boolean | undefined;
  readonly onRun?: (() => void) | undefined;
  readonly onStop?: (() => void) | undefined;
}) {
  const fresh = useFresh(banner.kind);
  const { body, tone } = bannerWords(banner, { hereOnly, note, line, fresh });
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

/**
 * What the banner says under its title: that localhost opens only on the Mac, or what a link a
 * browser opened needed, for a moment after; what went wrong, when something did; that the page's
 * links need Tailscale, while this Mac isn't on it; nothing once a run that just started has
 * settled; else its own words.
 */
function bannerWords(
  banner: ProgramBanner,
  said: {
    readonly hereOnly: boolean;
    readonly note: string | undefined;
    readonly line: string | undefined;
    readonly fresh: boolean;
  },
): { readonly body: string | undefined; readonly tone: ProgramBanner["tone"] } {
  if (said.hereOnly) return { body: PROGRAM_BANNER.hereOnly, tone: "plain" };
  if (said.note !== undefined) return { body: said.note, tone: "changed" };
  if (banner.tone === "bad") return { body: banner.body, tone: "bad" };
  if (said.line !== undefined) return { body: said.line, tone: "changed" };
  const settled = banner.settles === true && !said.fresh;
  return { body: settled ? undefined : banner.body, tone: banner.tone };
}

/** The dot of the question: how the program stands while it asks, waits or says why not. */
function askMark(words: LinkAsk<AskKind | ReachKind>): "off" | "starting" | "running" | "bad" {
  if (words.kind === "starting" || words.kind === "tailscale-wait") return "starting";
  if (words.kind === "opening" || words.kind === "ready" || words.kind === "reaching") {
    return "running";
  }
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
  readonly words: LinkAsk<AskKind | ReachKind>;
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
