/**
 * Universe (ADR 0227): what a space made, from what its agents keep in the room's project. Its
 * documents open in Chips, on the phone and on the Mac; its program runs on the Mac, never in
 * Chips. The phone's Universe, the web's and the Mac's read it here, and so does the Mac when the
 * phone asks it to open the page: one rule, so every device opens the same thing.
 */

import {
  CHIPS_FOLDER,
  projectFileType,
  RUN_FILE,
  RUN_FILE_BEFORE,
  type RunRecipe,
  runRecipe,
  START_PAGE,
} from "@chipschat/protocol";
import type { ProjectChange, RoomProject } from "./model/types.js";
import { myRole, type WorkspaceModel } from "./model.js";
import { fileNameOf, filesByFolder } from "./projectPage.js";
import type { RecipeRead } from "./projectRun.js";
import type { Store } from "./store.js";
import { type MacsHeard, unheardWords } from "./yourFolder.js";

/** How a document opens: a page, Markdown made a page, a PDF, a picture, or anything else. */
export type DocumentKind = "page" | "markdown" | "pdf" | "picture" | "other";

const KINDS: readonly [RegExp, DocumentKind][] = [
  [/\.html?$/i, "page"],
  [/\.(?:md|markdown)$/i, "markdown"],
  [/\.pdf$/i, "pdf"],
  [/\.(?:png|jpe?g|gif|webp|heic)$/i, "picture"],
  [/\.(?:svg|txt|csv|rtf|docx?|xlsx?|pptx?|key|pages|numbers)$/i, "other"],
];

/** What a file of the project is to read as, by its name; nothing for one that isn't a document. */
export function documentKind(path: string): DocumentKind | undefined {
  return KINDS.find(([name]) => name.test(path))?.[1];
}

/** The agents' and Chips's own: the start page and the run file, out of Files. */
function isChips(path: string): boolean {
  return path === CHIPS_FOLDER || path.startsWith(`${CHIPS_FOLDER}/`);
}

/** What Files shows of the project: everything but `.chips` (ADR 0227). */
export function shownFiles<File extends { readonly path: string }>(
  files: readonly File[],
): readonly File[] {
  return files.filter((file) => !isChips(file.path));
}

/**
 * The change Universe calls the reader to (ADR 0227's addendum): the project's newest, when
 * somebody else made it and this device hasn't opened Universe since (`seen`, the change it was
 * last opened at). The button goes round once for it and pulses until it is opened. Arjun, 2
 * November 2026: "when file becomes available / updated in universe, the button should animate to
 * get attention", and "it should keep pulsing until person taps it".
 */
export function universeCalling(
  project: RoomProject | undefined,
  selfId: string,
  seen: string | undefined,
): string | undefined {
  const newest = project?.changes[0];
  if (newest === undefined || newest.by === selfId || newest.commit === seen) return undefined;
  return newest.commit;
}

/** The change Universe is opened at, kept as what this device has seen: the project's newest. */
export function universeSeenAt(project: RoomProject | undefined): string | undefined {
  return project?.changes[0]?.commit;
}

/** What a space made, to read and to run. */
export interface Universe {
  /**
   * What opens to be read: the start page, or the one document, as `start`; several documents and
   * no start page, as `list`. None when there is nothing to read.
   */
  readonly documents?:
    | { readonly start: string }
    | { readonly list: readonly string[] }
    | undefined;
  /** What runs on the Mac, from the run file. */
  readonly program?: (RunRecipe & { readonly run: string }) | undefined;
  /** What is wrong with the run file, when it can't be used. */
  readonly why?: string | undefined;
  /**
   * The phone's Media, Pages and Files, read with the files (`readUniverse`); `universeOf` leaves it
   * out, since the Mac and the web don't split them.
   */
  readonly shelves?: Shelves | undefined;
}

/**
 * What the phone's Phone tab has under Media, Pages and Files (ADR 0227's addenda of 13 and 14
 * November 2026). Arjun, 13 November 2026: "sub tabs under the 'phone | desktop' tabs. 'Media' and
 * 'pages', under the media section, we could have the media shown in tiles, as we show in the media
 * viewer"; and on 14 November, of a space whose agent wrote one Python file: "I think we need a
 * 'files' section as well?".
 */
export interface Shelves {
  /** The pictures, by name; `mediaInOrder` puts them newest first. */
  readonly media: readonly string[];
  /** What Pages has: the start page first when there is one, then the documents beside it. */
  readonly pages: readonly string[];
  /**
   * Every file of the project but Chips' own `.chips`, by path: what the room's Project › Files
   * lists, so nothing the agents keep is missing from Universe. `filesInOrder` groups them.
   */
  readonly files: readonly string[];
  /**
   * What Pages draws when it opens: the start page, or the one document when there is only one.
   * With several and no start page, Pages lists them.
   */
  readonly first?: string | undefined;
  /** Each file's bytes as the files were listed (`readUniverse`): the viewer's details, Files' rows. */
  readonly sizes?: Readonly<Record<string, number>> | undefined;
}

/**
 * Media and Pages, from the project's files at `main` and its run file:
 * - **Media** is every picture, except, in a space with a program, the pictures in a folder of the
 *   program's own pages or under it (Health's `web/assets/` icons), which are its parts as its pages
 *   are. A page at the project's top claims no folder: an agent's screenshot saved beside a program
 *   is still to be seen, and a sprite shown by mistake costs less than a picture hidden.
 * - **Pages** is the start page and the documents beside it that aren't pictures. A start page's
 *   HTML pages are its own and stay out, as do a program's; Markdown, PDFs and the rest stay in.
 * - **Files** is every file, Media's and Pages' too, as Project › Files has them.
 */
export function shelvesOf(paths: readonly string[], recipe: RecipeRead): Shelves {
  const usable = recipe === undefined || "why" in recipe ? undefined : recipe;
  const program = usable?.run !== undefined;
  const start = startIn(paths, program ? undefined : usable?.opens);
  const documents = documentsIn(paths);
  const pictures = documents.filter((path) => documentKind(path) === "picture");
  const parts = program ? pageFolders(documents) : [];
  const media = pictures.filter((path) => !parts.some((folder) => within(path, folder)));
  const others = documents.filter((path) => {
    const kind = documentKind(path);
    if (kind === "picture" || path === start) return false;
    // A start page's pages, or a program's, are theirs: reached from the start page, if at all.
    return !(kind === "page" && (start !== undefined || program));
  });
  const pages = start === undefined ? others : [start, ...others];
  const [only] = pages;
  const first = start ?? (pages.length === 1 ? only : undefined);
  const files = paths.filter((path) => !isChips(path)).sort((a, b) => a.localeCompare(b));
  return { media, pages, files, ...(first === undefined ? {} : { first }) };
}

/** A shelf of Universe's own tab: the pictures, the pages, or every file. */
export type ShelfName = "media" | "pages" | "files";

/**
 * Where Universe opens, on the phone, the web and the Mac: Pages for a start page or one document;
 * else Media when there are pictures; else Pages for several documents, or for a program, which
 * Pages says runs on the Mac; else Files when there is a file.
 */
export function universeOpensOn(universe: Universe | undefined): ShelfName {
  const shelves = universe?.shelves;
  if (shelves === undefined || shelves.first !== undefined) return "pages";
  if (shelves.media.length > 0) return "media";
  if (shelves.pages.length > 0 || universe?.program !== undefined) return "pages";
  return shelves.files.length > 0 ? "files" : "pages";
}

/** The folders under the top that hold a page of the project, outside `.chips`. */
function pageFolders(documents: readonly string[]): string[] {
  const folders = documents
    .filter((path) => documentKind(path) === "page" && path.includes("/"))
    .map((path) => path.slice(0, path.lastIndexOf("/")));
  return [...new Set(folders)];
}

/** Whether a file sits in this folder, or in one under it. */
function within(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

/**
 * A file of Media or Files, and the change that last brought it, when the room's changes name it.
 */
export interface MediaItem {
  readonly path: string;
  readonly change?: ProjectChange | undefined;
}

/** The newest change that names each file, and its place among the room's (0 is the newest). */
function newestChanges(
  changes: readonly ProjectChange[],
): ReadonlyMap<string, { readonly change: ProjectChange; readonly at: number }> {
  const by = new Map<string, { change: ProjectChange; at: number }>();
  changes.forEach((change, at) => {
    for (const file of change.files) {
      if (!by.has(file.path)) by.set(file.path, { change, at });
    }
  });
  return by;
}

/**
 * Media newest first: by the newest change that names each picture, then those no change names
 * (one past a change's listed files), by name. The change also says who made it, when, and the
 * reply that carries it, for the viewer's Go to message.
 */
export function mediaInOrder(
  media: readonly string[],
  changes: readonly ProjectChange[],
): readonly MediaItem[] {
  const by = newestChanges(changes);
  return [...media]
    .sort((a, b) => {
      const one = by.get(a)?.at ?? Number.POSITIVE_INFINITY;
      const two = by.get(b)?.at ?? Number.POSITIVE_INFINITY;
      return one === two ? a.localeCompare(b) : one - two;
    })
    .map((path) => {
      const change = by.get(path)?.change;
      return change === undefined ? { path } : { path, change };
    });
}

/**
 * Files as Project › Files lists them: under their folders, the project's top first, each by name,
 * with the newest change that names it, which says who changed it last and when.
 */
export function filesInOrder(
  files: readonly string[],
  changes: readonly ProjectChange[],
): readonly { readonly folder: string; readonly items: readonly MediaItem[] }[] {
  const by = newestChanges(changes);
  return filesByFolder(files.map((path) => ({ path }))).map(({ folder, files: inFolder }) => ({
    folder,
    items: inFolder.map(({ path }) => {
      const change = by.get(path)?.change;
      return change === undefined ? { path } : { path, change };
    }),
  }));
}

/**
 * Whether a picture or a file is new to this device's reader: a change somebody else made after the one
 * Universe was last opened at (`seen`). Nothing is new before Universe was ever opened here, or
 * when the change it was opened at is no longer among the room's.
 */
export function isNewSince(
  item: MediaItem,
  changes: readonly ProjectChange[],
  selfId: string,
  seen: string | undefined,
): boolean {
  const change = item.change;
  if (change === undefined || seen === undefined || change.by === selfId) return false;
  const at = changes.findIndex((each) => each.commit === seen);
  if (at === -1) return false;
  return changes.indexOf(change) < at;
}

/**
 * Where a file tapped in Files opens: a picture of Media in the viewer among Media's, a document
 * of Pages on Pages, a program's page or note in the page sheet, any other picture in the viewer
 * alone, words (code, text, data) on the file's own page with its history, and anything else in
 * the system's preview.
 */
export type FileOpens = "media" | "pages" | "sheet" | "picture" | "words" | "preview";

export function fileOpensIn(path: string, shelves: Pick<Shelves, "media" | "pages">): FileOpens {
  if (shelves.media.includes(path)) return "media";
  if (shelves.pages.includes(path)) return "pages";
  const kind = documentKind(path);
  if (kind === "page" || kind === "markdown") return "sheet";
  if (kind === "picture") return "picture";
  return readsAsWords(projectFileType(path)) ? "words" : "preview";
}

/** Whether a file of this type is words the phone draws as they are, as Project's file page does. */
export function readsAsWords(type: string): boolean {
  return type.startsWith("text/") || type === "application/json" || type === "image/svg+xml";
}

/** What a document of Pages is called on its chip: its name without the folder. */
export function pageChipName(path: string): string {
  return path === START_PAGE ? "Space page" : fileNameOf(path);
}

/**
 * What a space made, from the project's files at `main` and its run file: the start page at
 * `.chips/index.html`; with none, the file an opens-only run file names; with neither, the one
 * document, or the documents listed. A program's own pages are not documents unless its agents
 * keep a start page.
 */
export function universeOf(paths: readonly string[], recipe: RecipeRead): Universe {
  const usable = recipe === undefined || "why" in recipe ? undefined : recipe;
  const program = usable?.run === undefined ? undefined : { ...usable, run: usable.run };
  const said = {
    ...(program === undefined ? {} : { program }),
    ...(recipe !== undefined && "why" in recipe ? { why: recipe.why } : {}),
  };
  const start = startIn(paths, program === undefined ? usable?.opens : undefined);
  if (start !== undefined) return { documents: { start }, ...said };
  if (program !== undefined) return said;
  const documents = documentsIn(paths);
  const [only] = documents;
  if (only === undefined) return said;
  return { documents: documents.length === 1 ? { start: only } : { list: documents }, ...said };
}

/** The start page, or the file an opens-only run file names, when the project has it. */
function startIn(paths: readonly string[], opens: string | undefined): string | undefined {
  if (paths.includes(START_PAGE)) return START_PAGE;
  const named = opens?.replace(/^\.\//, "");
  return named !== undefined && paths.includes(named) ? named : undefined;
}

/** The project's documents, by name, leaving out Chips' own files. */
function documentsIn(paths: readonly string[]): string[] {
  return paths
    .filter(
      (path) => !isChips(path) && path !== RUN_FILE_BEFORE && documentKind(path) !== undefined,
    )
    .sort((a, b) => a.localeCompare(b));
}

/** The room's Universe at `main`, read through the store. */
export async function readUniverse(
  store: Pick<Store, "projectFiles" | "projectFile">,
  spaceId: string,
): Promise<Universe> {
  const { files } = await store.projectFiles(spaceId);
  const paths = files.map((file) => file.path);
  const file = paths.includes(RUN_FILE)
    ? RUN_FILE
    : paths.includes(RUN_FILE_BEFORE)
      ? RUN_FILE_BEFORE
      : undefined;
  if (file === undefined) {
    return { ...universeOf(paths, undefined), shelves: sized(shelvesOf(paths, undefined), files) };
  }
  const { bytes } = await store.projectFile(spaceId, file);
  const recipe = runRecipe(new TextDecoder().decode(bytes), file);
  return { ...universeOf(paths, recipe), shelves: sized(shelvesOf(paths, recipe), files) };
}

/** The shelves' files' sizes, from the listing, when there are files. */
function sized(
  shelves: Shelves,
  files: readonly { readonly path: string; readonly bytes?: number }[],
): Shelves {
  if (shelves.files.length === 0) return shelves;
  const shown = new Set(shelves.files);
  const sizes = Object.fromEntries(
    files.flatMap((file) =>
      shown.has(file.path) && file.bytes !== undefined ? [[file.path, file.bytes]] : [],
    ),
  );
  return { ...shelves, sizes };
}

/** What Open page opens: the start page, or the one document; nothing for a list or none. */
export function startOf(universe: Universe): string | undefined {
  return universe.documents !== undefined && "start" in universe.documents
    ? universe.documents.start
    : undefined;
}

/** What the start page, or the one document, is called where Universe names it. */
export function startName(start: string): string {
  return start === START_PAGE ? "the space's page" : fileNameOf(start);
}

/**
 * The rows of the phone's Desktop tab, one list (ADR 0227's second addendum): what each is and does.
 * What they say back when pressed is `pageOnMacWords` and `folderOnMacWords`, and the program's row
 * says what `runBar` says once it has started.
 */
export const MAC_ROWS = {
  program: "Program",
  documents: "Documents",
  folder: { title: "Folder", body: "The project's folder, in Finder" },
  /** Under the list, once rather than under each row. */
  under: "These happen in Chips for Mac, on your Mac.",
} as const;

/** The page's row: the space's page, or the one document by its name. */
export function pageRowWords(start: string): { readonly title: string; readonly body: string } {
  return start === START_PAGE
    ? { title: "Page", body: "The space's page, in Chips on your Mac" }
    : { title: fileNameOf(start), body: "In Chips on your Mac" };
}

/** After Open page from the phone: whether a Mac heard it, and whether the server opened it first. */
export function pageOnMacWords(heard: MacsHeard): string {
  if (heard.macs === 0) return unheardWords("opened", heard.opened_app);
  return heard.opened_app === true
    ? "Chips for Mac wasn't open, so Chips opened it. The page opens there."
    : "Sent to your Mac. Chips opens it there.";
}

/** Several documents and no start page: what Universe says over their list. */
export function noStartPageWords(count: number): string {
  return `${count} documents and no start page yet. Ask the agents for one.`;
}

/** On the phone's own tab, or an iPad's, for a space whose only thing is a program. */
export const PROGRAMS_ON_MAC = {
  title: "Programs run on your Mac",
  body: "This space made a program, so it doesn't open here. Start it from Desktop, and it runs on your Mac.",
} as const;

/**
 * Who Run and Open on the Mac are for (ADR 0231): an owner of the workspace. Desktop, Run and
 * Open in browser are shown to nobody else, and the server refuses anybody else's ask.
 */
export function mayUseMac(model: Pick<WorkspaceModel, "people">, selfId: string): boolean {
  return myRole(model as WorkspaceModel, selfId) === "owner";
}

/**
 * Whether the person changes the room's project, Send from Your folder: anybody in the room but a
 * guest, by their standing in the workspace or in the room (SEC-40). The project door refuses a
 * guest's push in the same words.
 */
export function mayChangeProject(
  space: { readonly roles: Readonly<Record<string, string>> } | undefined,
  model: Pick<WorkspaceModel, "people">,
  selfId: string,
): boolean {
  if (space?.roles[selfId] === "guest") return false;
  return myRole(model as WorkspaceModel, selfId) !== "guest";
}

/** What Your folder says to a guest in place of Send. */
export const GUEST_READS_PROJECT =
  "A guest can read the project but can't change it. Ask an agent in the space.";

/** The same tab, for somebody who isn't an owner: the program runs on the owner's Mac. */
export const PROGRAMS_ON_OWNERS_MAC = {
  title: "Programs run on the owner's Mac",
  body: "This space made a program, so it doesn't open here. The workspace's owner runs it on their Mac.",
} as const;

/**
 * Why Run or Open in browser didn't happen in Chips for Mac (ADR 0231): this Mac doesn't run the
 * workspace's server, or the person isn't its owner.
 */
export const NOT_THIS_MAC =
  "Run and Open in browser work only on the Mac where this workspace's server runs, for its owner.";
