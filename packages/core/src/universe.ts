/**
 * Universe (ADR 0227): what a space made, from what its agents keep in the room's project. Its
 * documents open in Chips, on the phone and on the Mac; its program runs on the Mac, never in
 * Chips. The phone's Universe, the web's and the Mac's read it here, and so does the Mac when the
 * phone asks it to open the page: one rule, so every device opens the same thing.
 */

import {
  CHIPS_FOLDER,
  RUN_FILE,
  RUN_FILE_BEFORE,
  type RunRecipe,
  runRecipe,
  START_PAGE,
} from "@chipschat/protocol";
import { myRole, type WorkspaceModel } from "./model.js";
import { fileNameOf } from "./projectPage.js";
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
  if (file === undefined) return universeOf(paths, undefined);
  const { bytes } = await store.projectFile(spaceId, file);
  return universeOf(paths, runRecipe(new TextDecoder().decode(bytes), file));
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

/** On the phone's own tab, for a space whose only thing is a program. */
export const PROGRAMS_ON_MAC = {
  title: "Programs run on your Mac",
  body: "This space made a program, so it doesn't open on the phone. Start it from Desktop, and it runs on your Mac.",
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
  body: "This space made a program, so it doesn't open on the phone. The workspace's owner runs it on their Mac.",
} as const;

/**
 * Why Run or Open in browser didn't happen in Chips for Mac (ADR 0231): this Mac doesn't run the
 * workspace's server, or the person isn't its owner.
 */
export const NOT_THIS_MAC =
  "Run and Open in browser work only on the Mac where this workspace's server runs, for its owner.";
