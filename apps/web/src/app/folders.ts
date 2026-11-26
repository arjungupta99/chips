/**
 * Your folder on the Mac (ADR 0224), from the page's side: each room's folder as the shell's
 * `chips project folder` last answered for it, what is under way, and the change that came in
 * last. The page asks the server for a project token, kept until a minute before it lapses, and
 * the shell for the rest, one ask at a time for each room.
 *
 * What keeps the folder current is here too: when a room's project moves on, its folder is looked
 * at again, and a look brings it up to the room's `main` while nothing in it is the person's. A
 * room this page hasn't asked about yet is asked once; one with no folder is left alone after.
 *
 * Run (ADR 0226) is the shell's too: started, stopped, and looked at every few seconds while it
 * runs. Each change in how it stands goes to the server for the person's other devices. A run file
 * can list programs (ADR 0303): each has a run of its own, told to the server by its name, and
 * Show, asked from another device, opens again in the browser what a running program serves.
 *
 * Open page from the phone (ADR 0227) is the window's, not the shell's: the ask is passed to
 * whoever listens (`onPage`), which brings the window forward and opens the room's page in it.
 *
 * Run, Open in browser, and every ask from another device happen only on the Mac where the
 * workspace's server runs, for an owner (ADR 0231). The Mac tells its server by key: the one the
 * device was pinned to at pairing, against the one its loopback server answers. A server elsewhere
 * can send a `folder.run`, and it is dropped here.
 */

import {
  type Device,
  type FolderAnswer,
  type FolderAsk,
  type FolderOp,
  mayUseMac,
  NOT_THIS_MAC,
  readRunFile,
  runOf,
  type Snapshot,
  type Store,
  spaceTitle,
} from "@chipschat/core";
import { type ProjectRun, programsInOrder, type RunFile } from "@chipschat/protocol";
import type { Desktop, FolderAsked } from "../native.ts";

export interface FolderState {
  /** The folder as the last look, open or send found it. */
  readonly answer?: FolderAnswer | undefined;
  /** What somebody pressed that is under way. */
  readonly busy?: FolderOp | undefined;
  /** What went wrong the last time, in the shell's or the server's words. */
  readonly failed?: string | undefined;
  /** The last change that came into the folder, whose, and when. */
  readonly came?:
    | {
        readonly files: readonly string[];
        readonly by: readonly string[];
        readonly at: string;
      }
    | undefined;
  /** The last time another of the person's devices had it opened here (ADR 0225). */
  readonly asked?: { readonly from: string; readonly at: string } | undefined;
  /** How the room's run on this Mac stands (ADR 0226), as the shell last said. */
  readonly run?: ProjectRun | undefined;
  /** Each program's run, by name, for a run file that lists them (ADR 0303). */
  readonly programs?: Readonly<Record<string, ProjectRun>> | undefined;
}

/** What an ask carries beyond the room: Send's words, a file to open, the command Run was shown. */
export interface FolderExtra {
  readonly words?: string;
  readonly file?: string;
  readonly command?: string;
  /** For Run and Stop, a program of a run file that lists them, by name; none for all (ADR 0303). */
  readonly program?: string;
}

export interface Room {
  readonly id: string;
  readonly title: string;
}

export interface Folders {
  /** Whether this app keeps folders: the Mac app, carrying `chips`. */
  readonly available: () => Promise<boolean>;
  /**
   * Whether Run and Open in browser happen here (ADR 0231): this Mac runs the workspace's server,
   * and the person is its owner.
   */
  readonly runsHere: () => Promise<boolean>;
  readonly state: (spaceId: string) => FolderState;
  readonly subscribe: (listen: () => void) => () => void;
  readonly run: (room: Room, op: FolderOp, extra?: FolderExtra) => Promise<void>;
  /**
   * Open again in this Mac's browser what a running program serves (ADR 0303): one of a run file
   * that lists them, by name, or the one program.
   */
  readonly show: (room: Room, program: string | undefined) => Promise<void>;
  /** Each ask from another of the person's devices to open a room's page here (ADR 0227). */
  readonly onPage: (listen: (spaceId: string) => void) => () => void;
  readonly stop: () => void;
}

const NOTHING: FolderState = {};
/** What fetches the project from this Mac's own server, and happens for no other (ADR 0231). */
const HERE_OPS: ReadonlySet<FolderOp> = new Set(["run", "view"]);
/**
 * Asks nobody pressed, which keep the card current. They show nothing under way, or a running
 * program's look every few seconds would grey the card's buttons each time.
 */
const UNPRESSED: ReadonlySet<FolderOp> = new Set(["look", "status"]);
/** A token is asked for again this long before it lapses, so git never meets a stale one. */
const SPARE_MS = 60_000;
/** How often a run is looked at while it runs. */
const RUN_LOOK_MS = 3000;

export function createFolders(input: {
  readonly store: Pick<
    Store,
    "projectToken" | "subscribe" | "onFolderAsk" | "sayRun" | "projectFile"
  > & {
    readonly getSnapshot: () => Pick<Snapshot, "model" | "directory">;
  };
  readonly device: Pick<Device, "participantId" | "displayName" | "serverKey">;
  /** The server's own address, which git reaches it at. */
  readonly server: string;
  readonly shell: Promise<Desktop | undefined>;
  readonly now?: (() => number) | undefined;
}): Folders {
  const programsOf = createProgramsOf(input.store);
  const now = input.now ?? Date.now;
  const states = new Map<string, FolderState>();
  const listeners = new Set<() => void>();
  const tokens = new Map<string, { readonly token: string; readonly until: number }>();
  const queues = new Map<string, Promise<void>>();
  const looking = new Set<string>();
  const heads = new Map<string, string | undefined>();
  /** Each room's run as the server was last told it, and the next look at a running one. */
  const told = new Map<string, string>();
  const runLooks = new Map<string, ReturnType<typeof setTimeout>>();
  let can: Promise<boolean> | undefined;

  const set = (spaceId: string, state: FolderState) => {
    states.set(spaceId, state);
    for (const listen of listeners) listen();
  };
  const available = () => {
    can ??= input.shell
      .then(
        async (shell) =>
          shell?.projectFolder !== undefined && (await shell.canRunHere?.()) === true,
      )
      .catch(() => false);
    return can;
  };

  /** Where this Mac's server answers, kept once it is found to be this workspace's. */
  let ours: string | undefined;
  /**
   * This Mac's server, when it is the workspace's: the key the device was pinned to is the key it
   * answers with. Asked again until it is, since the server may still be starting; a key that
   * differs is another workspace's server, so nothing of this one happens here.
   */
  const hereUrl = async (): Promise<string | undefined> => {
    if (ours !== undefined) return ours;
    const pinned = input.device.serverKey;
    if (pinned === undefined) return undefined;
    const here = await input.shell.then((shell) => shell?.serverHere?.()).catch(() => undefined);
    if (here?.key === pinned) ours = here.url;
    return ours;
  };
  const owner = () => {
    const { model } = input.store.getSnapshot();
    return mayUseMac(model, input.device.participantId);
  };
  /** This Mac's workspace, and its owner: whom asks from elsewhere are believed for. */
  const ownersHere = async () => owner() && (await hereUrl()) !== undefined;
  const runsHere = async () => (await ownersHere()) && (await available());
  /**
   * Where an ask reaches the project: Run and Open in browser at this Mac's own server, for its
   * owner, and nowhere for anybody else, so they happen for no other server (the shell refuses any
   * other address for them too); the rest at the server the device knows.
   */
  const serverFor = async (op: FolderOp): Promise<string | undefined> => {
    if (!HERE_OPS.has(op)) return input.server;
    return owner() ? await hereUrl() : undefined;
  };

  async function tokenFor(spaceId: string): Promise<string> {
    const kept = tokens.get(spaceId);
    if (kept !== undefined && kept.until - SPARE_MS > now()) return kept.token;
    const given = await input.store.projectToken(spaceId);
    tokens.set(spaceId, { token: given.token, until: Date.parse(given.expires_at) });
    return given.token;
  }

  /** An ask, where this Mac makes it: Run and Open in browser for its own server alone (ADR 0231). */
  async function where(room: Room, op: FolderOp, extra: FolderExtra) {
    const server = await serverFor(op);
    if (server !== undefined) return await once(room, op, extra, server);
    settle(
      room.id,
      op,
      { ok: false, why: NOT_THIS_MAC },
      states.get(room.id) ?? NOTHING,
      extra.program,
    );
  }

  /**
   * An ask setting out: under way on the card if somebody pressed it, and the run as it stands. A
   * press of a run file that lists programs starts each of them it names (ADR 0303): what isn't
   * running yet reads as starting, a need as starting for the program pressed.
   */
  async function begin(spaceId: string, op: FolderOp, extra: FolderExtra, before: FolderState) {
    const file = op === "run" ? await programsOf(spaceId) : undefined;
    if (file !== undefined) {
      const since = new Date(now()).toISOString();
      const programs = startingOf(file, extra.program, before, since);
      set(spaceId, { ...before, busy: op, programs });
      for (const [name, run] of Object.entries(programs)) tell(spaceId, run, name);
      return;
    }
    const starting: ProjectRun | undefined =
      op === "run"
        ? { state: "starting", command: extra.command, since: new Date(now()).toISOString() }
        : before.run;
    if (!UNPRESSED.has(op)) set(spaceId, { ...before, busy: op, run: starting });
    tell(spaceId, starting);
  }

  async function once(room: Room, op: FolderOp, extra: FolderExtra, server: string) {
    const ask = (await input.shell)?.projectFolder;
    if (ask === undefined) return;
    const before = states.get(room.id) ?? NOTHING;
    await begin(room.id, op, extra, before);
    try {
      const asked: FolderAsked = {
        spaceId: room.id,
        title: room.title,
        server,
        personId: input.device.participantId,
        name: input.device.displayName,
        token: await tokenFor(room.id),
        ...extra,
      };
      settle(room.id, op, await ask(op, asked), before, extra.program);
    } catch (error) {
      set(room.id, {
        ...(states.get(room.id) ?? NOTHING),
        busy: undefined,
        failed: error instanceof Error ? error.message : String(error),
        run: before.run,
        programs: before.programs,
      });
    }
    afterRun(room);
  }

  /** After an ask: the run told to the server when it changed, and looked at again soon while it runs. */
  function afterRun(room: Room) {
    const after = states.get(room.id) ?? NOTHING;
    tell(room.id, after.run);
    for (const [name, run] of Object.entries(after.programs ?? {})) tell(room.id, run, name);
    clearTimeout(runLooks.get(room.id));
    runLooks.delete(room.id);
    const runs = [after.run, ...Object.values(after.programs ?? {})];
    if (runs.some((run) => run?.state === "running")) {
      runLooks.set(
        room.id,
        setTimeout(() => {
          runLooks.delete(room.id);
          void run(room, "status");
        }, RUN_LOOK_MS),
      );
    }
  }

  /**
   * The server told how the room's run stands, when that changed since it was last told: the one
   * program's, or a listed program's by name (ADR 0303).
   */
  function tell(spaceId: string, said: ProjectRun | undefined, program?: string) {
    if (said === undefined) return;
    const key = `${spaceId}/${program?.toLowerCase() ?? ""}`;
    const words = JSON.stringify(said);
    if (told.get(key) === words) return;
    told.set(key, words);
    input.store.sayRun(spaceId, said, program).catch(() => told.delete(key));
  }

  /** What the shell answered, kept: a look's standing, the last change that came in, the runs. */
  function settle(
    spaceId: string,
    op: FolderOp,
    answer: FolderAnswer,
    before: FolderState,
    program?: string,
  ) {
    const current = states.get(spaceId) ?? NOTHING;
    set(spaceId, settled(current, op, answer, before, new Date(now()).toISOString(), program));
  }

  function run(room: Room, op: FolderOp, extra: FolderExtra = {}) {
    // A look already waiting its turn is the same look: one is enough.
    if (op === "look" && looking.has(room.id)) return queues.get(room.id) ?? Promise.resolve();
    if (op === "look") looking.add(room.id);
    const next = (queues.get(room.id) ?? Promise.resolve()).then(() => {
      if (op === "look") looking.delete(room.id);
      return where(room, op, extra);
    });
    queues.set(room.id, next);
    return next;
  }

  /** Each room whose project moved on, looked at again: what keeps its folder up to date. */
  function watch() {
    const { model, directory } = input.store.getSnapshot();
    for (const space of model.spaces) {
      const head = space.project?.changes[0]?.commit;
      if (!heads.has(space.id)) {
        heads.set(space.id, head);
        continue;
      }
      if (heads.get(space.id) === head) continue;
      heads.set(space.id, head);
      const answer = states.get(space.id)?.answer;
      if (answer?.ok === true && !answer.made) continue;
      const room = { id: space.id, title: spaceTitle(space, directory) };
      void available().then((yes) => (yes ? run(room, "look") : undefined));
    }
  }
  watch();
  const unsubscribe = input.store.subscribe(watch);

  /**
   * Open folder on Mac, pressed on the person's phone or in a browser (ADR 0225): the folder
   * opened here as Open folder opens it, for a room this Mac has, and the card says who asked.
   * Run and Stop pressed there (ADR 0226) run here as they do on this card. Each happens only on
   * the Mac where the workspace's server runs, for its owner (ADR 0231): an ask from a server
   * elsewhere is dropped, whatever it says the person pressed.
   */
  function heard(ask: FolderAsk) {
    const { model, directory } = input.store.getSnapshot();
    const space = model.spaces.find((each) => each.id === ask.spaceId);
    if (space === undefined) return;
    const room = { id: space.id, title: spaceTitle(space, directory) };
    void ownersHere().then((ours) => (ours ? answer(room, ask) : undefined));
  }

  /** An ask from another device, once it is believed: the page to the window, the rest here. */
  async function answer(room: Room, ask: FolderAsk) {
    const { op } = ask;
    if (op === "page") return showPage(room.id);
    if (!(await available())) return;
    if (op === "open") return await openAsked(room, ask);
    if (op === "show") return await showProgram(room.id, ask.program);
    await run(room, op, {
      ...(ask.command === undefined ? {} : { command: ask.command }),
      ...(ask.program === undefined ? {} : { program: ask.program }),
    });
  }

  function showPage(spaceId: string) {
    for (const listen of pageListeners) listen(spaceId);
  }

  /**
   * Show, asked from another device (ADR 0303): what a running program serves, opened again in
   * this Mac's browser, as Run opened it.
   */
  async function showProgram(spaceId: string, program: string | undefined) {
    const state = states.get(spaceId) ?? NOTHING;
    const run = program === undefined ? state.run : runOf(state, { name: program });
    const address = run?.state === "running" ? run.opened : undefined;
    if (address === undefined || !/^https?:\/\//i.test(address)) return;
    await (await input.shell)?.openLink?.(address).catch(() => undefined);
  }

  /** The folder opened as the phone asked, and the card saying who did. */
  async function openAsked(room: Room, ask: FolderAsk) {
    await run(room, "open");
    const after = states.get(room.id) ?? NOTHING;
    if (after.answer?.ok !== true || after.failed !== undefined) return;
    set(room.id, { ...after, asked: { from: ask.from, at: ask.at } });
  }
  const pageListeners = new Set<(spaceId: string) => void>();
  const unhear = input.store.onFolderAsk(heard);

  return {
    available,
    runsHere,
    state: (spaceId) => states.get(spaceId) ?? NOTHING,
    subscribe: (listen) => {
      listeners.add(listen);
      return () => listeners.delete(listen);
    },
    run,
    show: (room, program) => showProgram(room.id, program),
    onPage: (listen) => {
      pageListeners.add(listen);
      return () => pageListeners.delete(listen);
    },
    stop: () => {
      unsubscribe();
      unhear();
      for (const look of runLooks.values()) clearTimeout(look);
      runLooks.clear();
    },
  };
}

/**
 * Asks that leave the folder's standing as the last look found it: opening the editor or a file,
 * which say only where the folder is, and Stop and a look at the run, which say only how it stands.
 */
const STANDING_KEPT: ReadonlySet<FolderOp> = new Set(["editor", "file", "stop", "status"]);

/** A room's folder after the shell's answer, from how it stood and how the runs stood before. */
function settled(
  current: FolderState,
  op: FolderOp,
  answer: FolderAnswer,
  before: FolderState,
  at: string,
  program?: string,
): FolderState {
  if (!answer.ok && op === "run") return refused(current, before, answer.why, program);
  if (!answer.ok) return { ...current, busy: undefined, failed: answer.why };
  const came =
    (answer.came?.length ?? 0) > 0
      ? { files: answer.came ?? [], by: answer.cameBy ?? [], at }
      : current.came;
  return {
    answer: STANDING_KEPT.has(op) ? (current.answer ?? answer) : answer,
    came,
    asked: current.asked,
    run: answer.run ?? current.run,
    programs: answer.programs ?? current.programs,
  };
}

/**
 * Nothing ran: the runs stand as they stood, and the one pressed says why. Run all's refusal is
 * said by every program it would have started, and by the one program of a run file of one `run`.
 */
function refused(
  current: FolderState,
  before: FolderState,
  why: string,
  program: string | undefined,
): FolderState {
  const named = Object.keys({ ...before.programs, ...current.programs });
  if (named.length === 0 && program === undefined) {
    return { ...current, busy: undefined, run: { ...(before.run ?? { state: "never" }), why } };
  }
  const programs: Record<string, ProjectRun> = {};
  for (const name of new Set([...named, ...(program === undefined ? [] : [program])])) {
    const was = runOf(before, { name }) ?? { state: "never" };
    const said = program === undefined || name.toLowerCase() === program.toLowerCase();
    programs[name] = said ? { ...was, why } : was;
  }
  return { ...current, busy: undefined, programs };
}

/**
 * Each program as a press starts it (ADR 0303): the pressed one, or every one, and what it needs,
 * reads as starting where it isn't running yet; a need, as starting for the program pressed.
 */
function startingOf(
  file: RunFile,
  program: string | undefined,
  before: FolderState,
  since: string,
): Readonly<Record<string, ProjectRun>> {
  const programs: Record<string, ProjectRun> = { ...before.programs };
  const order = programsInOrder(file, program);
  const pressed = order.at(-1);
  const forPressed = program === undefined ? {} : { runs_for: [program] };
  for (const each of order) {
    if (runOf(before, each)?.state === "running") continue;
    programs[each.name ?? ""] = {
      state: "starting",
      since,
      ...(each === pressed ? {} : forPressed),
    };
  }
  return programs;
}

/**
 * A room's run file as programs, read from the room's `main` as a press sets out: what it starts,
 * and in what order (ADR 0303). Nothing for a run file of one `run`, or one that can't be used.
 */
function createProgramsOf(store: Pick<Store, "projectFile">) {
  return async (spaceId: string) => {
    const file = await readRunFile(store, spaceId).catch(() => undefined);
    if (file === undefined || "why" in file) return undefined;
    return file.programs.some((program) => program.name !== undefined) ? file : undefined;
  };
}
