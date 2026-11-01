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
 * runs. Each change in how it stands goes to the server for the person's other devices.
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
  type Snapshot,
  type Store,
  spaceTitle,
} from "@chipschat/core";
import type { ProjectRun } from "@chipschat/protocol";
import type { Desktop, FolderAsked } from "../native.ts";

export interface FolderState {
  /** The folder as the last look, open or send found it. */
  readonly answer?: FolderAnswer | undefined;
  /** What is under way. */
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
}

/** What an ask carries beyond the room: Send's words, a file to open, the command Run was shown. */
export interface FolderExtra {
  readonly words?: string;
  readonly file?: string;
  readonly command?: string;
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
  /** Each ask from another of the person's devices to open a room's page here (ADR 0227). */
  readonly onPage: (listen: (spaceId: string) => void) => () => void;
  readonly stop: () => void;
}

const NOTHING: FolderState = {};
/** What fetches the project from this Mac's own server, and happens for no other (ADR 0231). */
const HERE_OPS: ReadonlySet<FolderOp> = new Set(["run", "view"]);
/** A token is asked for again this long before it lapses, so git never meets a stale one. */
const SPARE_MS = 60_000;
/** How often a run is looked at while it runs. */
const RUN_LOOK_MS = 3000;

export function createFolders(input: {
  readonly store: Pick<Store, "projectToken" | "subscribe" | "onFolderAsk" | "sayRun"> & {
    readonly getSnapshot: () => Pick<Snapshot, "model" | "directory">;
  };
  readonly device: Pick<Device, "participantId" | "displayName" | "serverKey">;
  /** The server's own address, which git reaches it at. */
  readonly server: string;
  readonly shell: Promise<Desktop | undefined>;
  readonly now?: (() => number) | undefined;
}): Folders {
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
    settle(room.id, op, { ok: false, why: NOT_THIS_MAC }, states.get(room.id)?.run);
  }

  async function once(room: Room, op: FolderOp, extra: FolderExtra, server: string) {
    const ask = (await input.shell)?.projectFolder;
    if (ask === undefined) return;
    const before = states.get(room.id) ?? NOTHING;
    const starting: ProjectRun | undefined =
      op === "run"
        ? { state: "starting", command: extra.command, since: new Date(now()).toISOString() }
        : before.run;
    set(room.id, { ...before, busy: op, run: starting });
    tell(room.id, starting);
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
      settle(room.id, op, await ask(op, asked), before.run);
    } catch (error) {
      set(room.id, {
        ...(states.get(room.id) ?? NOTHING),
        busy: undefined,
        failed: error instanceof Error ? error.message : String(error),
        run: before.run,
      });
    }
    afterRun(room);
  }

  /** After an ask: the run told to the server when it changed, and looked at again soon while it runs. */
  function afterRun(room: Room) {
    const after = states.get(room.id) ?? NOTHING;
    tell(room.id, after.run);
    clearTimeout(runLooks.get(room.id));
    runLooks.delete(room.id);
    if (after.run?.state === "running") {
      runLooks.set(
        room.id,
        setTimeout(() => {
          runLooks.delete(room.id);
          void run(room, "status");
        }, RUN_LOOK_MS),
      );
    }
  }

  /** The server told how the room's run stands, when that changed since it was last told. */
  function tell(spaceId: string, said: ProjectRun | undefined) {
    if (said === undefined) return;
    const words = JSON.stringify(said);
    if (told.get(spaceId) === words) return;
    told.set(spaceId, words);
    input.store.sayRun(spaceId, said).catch(() => told.delete(spaceId));
  }

  /** What the shell answered, kept: a look's standing, the last change that came in, the run. */
  function settle(
    spaceId: string,
    op: FolderOp,
    answer: FolderAnswer,
    ran: ProjectRun | undefined,
  ) {
    const current = states.get(spaceId) ?? NOTHING;
    set(spaceId, settled(current, op, answer, ran, new Date(now()).toISOString()));
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
    await run(room, op, ask.command === undefined ? {} : { command: ask.command });
  }

  function showPage(spaceId: string) {
    for (const listen of pageListeners) listen(spaceId);
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

/** A room's folder after the shell's answer, from how it stood and how the run stood before. */
function settled(
  current: FolderState,
  op: FolderOp,
  answer: FolderAnswer,
  ran: ProjectRun | undefined,
  at: string,
): FolderState {
  if (!answer.ok && op === "run") {
    // Nothing ran: the run stands as it stood, and says why.
    return {
      ...current,
      busy: undefined,
      run: { ...(ran ?? { state: "never" }), why: answer.why },
    };
  }
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
  };
}
