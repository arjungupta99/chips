/**
 * The desktop shell, from the page's side.
 *
 * The same build runs in a browser and inside the Tauri window (M2.2), and everything Chips
 * does — the socket, the device key, the fold, what an approval means — is the page's either
 * way. This is the short list of things a native window can do that a tab cannot: find a server
 * on the network, put a number in the menu bar, ask a question in the notification centre, be
 * opened by a link, and carry out what is chosen from its menus.
 *
 * In a browser every one of them is absent rather than broken: `desktop()` answers `undefined`,
 * callers carry on, and nothing here is loaded at all — the Tauri modules are behind a dynamic
 * import, so a browser never fetches them.
 */

import type { FolderAnswer, FolderOp } from "@chipschat/core";
import {
  type InviteLink,
  inviteFromLink,
  type PairingPayload,
  pairingFromUrl,
} from "@chipschat/protocol";

/** A server found on the network, as the shell describes it. */
export interface FoundServer {
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly workspace?: string | undefined;
}

/** Who may reach a server run here, as `chips up --reach` takes it. */
export type Reach = "lan" | "tailnet" | "local";

/** `chips up --json`'s line (ADR 0121), as the shell hands it back after running it here. */
export interface UpAnswer {
  readonly url: string;
  readonly pair_link: string;
  readonly phone_link: string | null;
  readonly service: string;
  readonly reach: Reach | null;
  readonly already_running: boolean;
  readonly created: boolean;
}

/**
 * `chips connect <id> --json` run from the app's copy (ADR 0218, phase 5): how it ended, once it
 * has, and a way to stop it and the bridge it started.
 */
export interface ConnectingHere {
  /** Its exit code, after its last line. */
  readonly done: Promise<number>;
  readonly cancel: () => Promise<void>;
}

/** What a person pressed on a notification. `dismissed` is an answer to nothing. */
export type NotificationChoice = "approved" | "denied" | "opened" | "dismissed";

export interface Decision {
  readonly approvalId: string;
  readonly decision: NotificationChoice;
}

/** What Your folder asks the shell with (ADR 0224): the room, the server, the person, a token. */
export interface FolderAsked {
  readonly spaceId: string;
  readonly title: string;
  readonly server: string;
  readonly personId: string;
  readonly name: string;
  /** A project token the page asked the server for, good for a few minutes. */
  readonly token: string;
  readonly words?: string | undefined;
  readonly file?: string | undefined;
  /** For Run (ADR 0226), the command the person was shown: the Mac runs nothing else. */
  readonly command?: string | undefined;
}

/** The server on this Mac, as the shell found it over loopback (ADR 0231). */
export interface ServerHere {
  readonly url: string;
  readonly key: string;
}

export interface Desktop {
  /** Servers advertising `_chips._tcp` on this network. */
  readonly discover: (millis?: number) => Promise<FoundServer[]>;
  /**
   * Whether the app carries a `chips` to run on this Mac (ADR 0173); false from a shell that
   * carries none, or one built before it could.
   */
  readonly canRunHere?: (() => Promise<boolean>) | undefined;
  /** Run Chips on this Mac from that copy: its `chips up`, and the line it printed. */
  readonly runHere?: ((reach: Reach) => Promise<UpAnswer>) | undefined;
  /**
   * Connect a bridge's card on this Mac from that copy (ADR 0218, phase 5): its
   * `chips connect <id> --json`, with the link in its environment rather than on its command
   * line, each line it prints handed to `onLine` as it comes. `name` is the card's as the sheet
   * showed it, which `chips connect` refuses unless it is its own card's (SEC-51). Refused from a
   * copy macOS moved (App Translocation), as `runHere` is.
   */
  readonly connectHere?:
    | ((
        card: { readonly id: string; readonly name: string },
        link: string,
        onLine: (line: string) => void,
      ) => Promise<ConnectingHere>)
    | undefined;
  /** Ask about one approval in the notification centre; the answer arrives on `onDecision`. */
  readonly ask: (approvalId: string, title: string, body: string) => Promise<void>;
  /**
   * One plain banner — a digest of what is waiting (M5.6) — with no buttons. A shell built
   * before M5.6 has no such command; the call rejects, and the app carries on.
   */
  readonly tell: (title: string, body: string) => Promise<void>;
  /** How many things are waiting on the person, in the menu bar. Zero takes the number away. */
  readonly badge: (count: number) => Promise<void>;
  /**
   * Hold an HTML page a harness sent, with the policy it is served under, and hand back the URL
   * on the shell's own scheme a frame loads it from, good once (ADR 0201's addendum). The shell
   * answers the bytes with the policy as a header, so the page's script runs and nothing leaves,
   * and the bytes never cross the network: the page fetched them through its tunnel. A shell
   * built before the door has no such command; the call rejects, and the view draws the words.
   * Optional, as `runHere` is, so a test's shell need not have one.
   */
  readonly holdPage?: ((html: string, policy: string) => Promise<string>) | undefined;
  /** Bring the window forward, from the menu bar or behind other apps (ADR 0227's Open page). */
  readonly forward?: (() => Promise<void>) | undefined;
  /**
   * Your folder (ADR 0224): the carried `chips project folder <op> --json` for one room, the ask
   * in its environment, and its answer. Optional, as `runHere` is, so a test's shell need not have
   * one; it rejects, in the shell's words, from an app that carries no `chips`.
   */
  readonly projectFolder?:
    | ((op: FolderOp, asked: FolderAsked) => Promise<FolderAnswer>)
    | undefined;
  /**
   * The server this Mac runs (ADR 0231): where it answers on loopback and the key it answers with,
   * or nothing when none answers there. Run and Open happen only for the workspace whose pinned
   * key is that key. A shell built before it has none, and so runs nothing.
   */
  readonly serverHere?: (() => Promise<ServerHere | undefined>) | undefined;
  readonly onDecision: (listen: (decision: Decision) => void) => Promise<() => void>;
  /** Each `chips://` link the shell was opened with, the one that launched it included. */
  readonly onOpen: (listen: (link: ChipsLink) => void) => Promise<() => void>;
  /**
   * The menus' commands the page can do now, and their names (ADR 0267): the shell dims the rest.
   * A shell built before the menus has none, as a test's need not.
   */
  readonly setMenu?: ((standing: readonly MenuStanding[]) => Promise<void>) | undefined;
  /** Each command chosen from the menus, or by its keys, by its id. */
  readonly onMenu?: ((listen: (id: string) => void) => Promise<() => void>) | undefined;
  /** Hand a web or mail link to the browser, from no click on the page (Help's Send Feedback…). */
  readonly openLink?: ((url: string) => Promise<void>) | undefined;
  /** How large the page is drawn (⌘+, ⌘−), now and each time that changes: 1 is actual size. */
  readonly onZoom?: ((listen: (zoom: number) => void) => Promise<() => void>) | undefined;
  /** Whether the window fills the screen, now and each time that changes. */
  readonly onFullScreen?: ((listen: (full: boolean) => void) => Promise<() => void>) | undefined;
  /** The page is drawn: a window waiting for it is shown now (ADR 0274). */
  readonly drawn?: (() => Promise<void>) | undefined;
}

/** One of the menus' commands as the shell takes it (ADR 0267): its id, its name now, and whether it can be done. */
export interface MenuStanding {
  readonly id: string;
  readonly title: string;
  readonly enabled: boolean;
}

/** The minimum of Tauri this file uses, named so a test can pass its own. */
export interface TauriApi {
  readonly invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  readonly listen: <T>(
    event: string,
    handler: (message: { payload: T }) => void,
  ) => Promise<() => void>;
}

/** True when this page is inside the shell rather than in a browser tab. */
export function inDesktop(where: typeof globalThis = globalThis): boolean {
  return "__TAURI_INTERNALS__" in where;
}

/** The shell, or nothing at all in a browser. */
export async function desktop(where: typeof globalThis = globalThis): Promise<Desktop | undefined> {
  if (!inDesktop(where)) return undefined;
  const [core, event] = await Promise.all([
    import("@tauri-apps/api/core"),
    import("@tauri-apps/api/event"),
  ]);
  return desktopWith({ invoke: core.invoke, listen: event.listen });
}

/** The same thing, over an API a test provides. */
export function desktopWith(api: TauriApi): Desktop {
  return {
    discover: (millis) => api.invoke<FoundServer[]>("discover_servers", { millis }),
    canRunHere: () => api.invoke<boolean>("can_run_here").catch(() => false),
    runHere: async (reach) =>
      JSON.parse(await api.invoke<string>("run_here", { reach })) as UpAnswer,
    connectHere: (card, link, onLine) => connectHereWith(api, card, link, onLine),
    ask: (approvalId, title, body) => api.invoke<void>("ask_about", { approvalId, title, body }),
    tell: (title, body) => api.invoke<void>("tell", { title, body }),
    badge: (count) => api.invoke<void>("set_badge", { count }),
    holdPage: (html, policy) => api.invoke<string>("hold_page", { html, policy }),
    forward: () => api.invoke<void>("come_forward"),
    projectFolder: async (op, asked) =>
      JSON.parse(await api.invoke<string>("project_folder", { op, asked })) as FolderAnswer,
    serverHere: () =>
      api
        .invoke<ServerHere | null>("server_here")
        .then((here) => here ?? undefined)
        .catch(() => undefined),
    onDecision: (listen) =>
      api.listen<{ approval_id: string; decision: string }>("chips://approval-decided", (message) =>
        listen({
          approvalId: message.payload.approval_id,
          decision: message.payload.decision as NotificationChoice,
        }),
      ),
    setMenu: (standing) => api.invoke<void>("set_menu", { standing }),
    onMenu: (listen) => api.listen<string>("chips://menu", (message) => listen(message.payload)),
    openLink: (url) => api.invoke<void>("open_link", { url }),
    onZoom: async (listen) => {
      const stop = await api.listen<number>("chips://zoom", (message) => listen(message.payload));
      listen(await api.invoke<number>("page_zoom").catch(() => 1));
      return stop;
    },
    onFullScreen: (listen) => fullScreenWith(api, listen),
    drawn: () => api.invoke<void>("drawn"),
    // The shell holds every link until the page takes it, because the one that launched the app
    // arrived before the page did. So the page takes what is waiting as it starts to listen, and
    // again each time it is told there is more; taking empties the shell, so each comes once.
    onOpen: async (listen) => {
      const take = async () => {
        for (const raw of await api.invoke<string[]>("take_links")) {
          const link = parseLink(raw);
          if (link !== undefined) listen(link);
        }
      };
      const stop = await api.listen<unknown>("chips://open", () => void take());
      await take();
      return stop;
    },
  };
}

/**
 * Whether the window fills the screen, asked now and after each change of its size, which entering
 * and leaving full screen are. One question at a time: a drag of the window's edge is many sizes.
 */
async function fullScreenWith(api: TauriApi, listen: (full: boolean) => void): Promise<() => void> {
  let asking = false;
  let again = false;
  const ask = async () => {
    if (asking) {
      again = true;
      return;
    }
    asking = true;
    try {
      do {
        again = false;
        listen(await api.invoke<boolean>("plugin:window|is_fullscreen"));
      } while (again);
    } catch {
      // A window going away answers nothing; there is nothing to draw then either.
    } finally {
      asking = false;
    }
  };
  const stop = await api.listen<unknown>("tauri://resize", () => void ask());
  await ask();
  return stop;
}

/** A run's lines, and its end, as the shell says them: each tagged with the run they are of. */
interface ConnectSaid {
  readonly run: string;
  readonly line?: string;
  readonly end?: number;
}

/**
 * The shell's `connect_here`: started, its lines heard until the shell says it ended, in the order
 * said, so the last line is in before `done` is.
 */
async function connectHereWith(
  api: TauriApi,
  card: { readonly id: string; readonly name: string },
  link: string,
  onLine: (line: string) => void,
): Promise<ConnectingHere> {
  const run = `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  let ended: (code: number) => void = () => undefined;
  const done = new Promise<number>((resolve) => {
    ended = resolve;
  });
  let stop: () => void = () => undefined;
  stop = await api.listen<ConnectSaid>("chips://connect-line", (message) => {
    const said = message.payload;
    if (said.run !== run) return;
    if (said.line !== undefined) onLine(said.line);
    if (said.end === undefined) return;
    stop();
    ended(said.end);
  });
  try {
    await api.invoke<void>("connect_here", { id: card.id, cardName: card.name, link, run });
  } catch (refused) {
    stop();
    throw refused;
  }
  return { done, cancel: () => api.invoke<void>("cancel_connect", { run }) };
}

/**
 * What a `chips://` link points at. Three shapes, because three things are worth linking to from
 * outside: a room, a decision somebody is waiting on, and a server to pair with.
 *
 *   chips://space/spc_01H…
 *   chips://approval/apr_01H…
 *   chips://pair?pair=ABC-234&v=1&lan=https://…   (`appPairingUrl`, as `pnpm desktop` sends it)
 *   chips://join?invite=chips_inv_…&lan=https://…  (`inviteAppUrl`, the join page's Open in Chips)
 */
export type ChipsLink =
  | { readonly kind: "space"; readonly id: string }
  | { readonly kind: "approval"; readonly id: string }
  | { readonly kind: "pair"; readonly payload: PairingPayload & { readonly lan: string } }
  | { readonly kind: "join"; readonly invite: InviteLink & { readonly lan: string } };

export function parseLink(raw: string): ChipsLink | undefined {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.protocol !== "chips:") return undefined;
  if (url.hostname === "join") return joinLink(raw);
  if (url.hostname === "pair") return pairLink(url);
  // `chips://approval/apr_1` parses with the kind as the host and the id as the path; a
  // person typing `chips:approval/apr_1` gets the same answer, which is worth being lenient about.
  const parts = [url.hostname, ...url.pathname.split("/")].filter((part) => part !== "");
  const [kind, id] = parts;
  if (id === undefined) return undefined;
  if (kind === "space" && id.startsWith("spc_")) return { kind, id };
  if (kind === "approval" && id.startsWith("apr_")) return { kind, id };
  return undefined;
}

/** An invite, with the server it names: one that names none joins nothing (ADR 0164). */
function joinLink(raw: string): ChipsLink | undefined {
  const invite = inviteFromLink(raw);
  return invite?.lan === undefined
    ? undefined
    : { kind: "join", invite: { ...invite, lan: invite.lan } };
}

/** A `chips://` link has no origin of its own, so one that names no server pairs with nothing. */
function pairLink(url: URL): ChipsLink | undefined {
  const payload = pairingFromUrl({ search: url.search, hash: "" });
  return payload?.lan === undefined
    ? undefined
    : { kind: "pair", payload: { ...payload, lan: payload.lan } };
}
