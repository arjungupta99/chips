/**
 * Universe on the Mac and in a browser (ADR 0227): what the space made, opened from the four rings
 * at the room's head.
 *
 * - At its top, what happens on the person's Mac, the phone's Desktop tab acting here: on the Mac,
 *   Your folder (ADR 0224), Open folder, Open in editor, what came in, and Run program, which runs
 *   it on this Mac and never in Chips (ADR 0226); in a browser, Open folder in Mac and Run program
 *   ask the person's Mac (ADRs 0225, 0226).
 * - Under it, Media, Pages and Files, as on the phone (the addenda of 13 and 14 November 2026), each
 *   always there with its count. **Media** is the project's pictures as squares, three across,
 *   newest first, each the small copy the computer makes, opening in the viewer on its screen copy
 *   (`universePictures.ts`); a gold dot marks one somebody else brought since Universe was last
 *   opened here. **Pages** is Open page for the start page, or the one document, and the documents
 *   beside it, each opening in the page dialog. **Files** is every file of the project under its
 *   folder, as Project › Files lists them, each opening where it belongs: a picture in the viewer,
 *   a document in the page dialog, anything else on the file's own page in Universe's place, with
 *   its history and Download.
 *
 * What the space has is core's `readUniverse`, read again as the project moves on; where Universe
 * opens is core's `universeOpensOn`, as on the phone.
 */

import {
  type Directory,
  documentKind,
  fileNameOf,
  fileOpensIn,
  filesInOrder,
  isNewSince,
  isRoomLine,
  listsPrograms,
  type MediaItem,
  mediaInOrder,
  nameOf,
  noStartPageWords,
  type ProjectChange,
  pageChipName,
  pictureDeckOf,
  picturesOf,
  type RecipeRead,
  type ShelfName,
  type Shelves,
  type ShownPicture,
  type Space,
  startName,
  startOf,
  type Universe,
  universeOpensOn,
} from "@chipschat/core";
import type { RunFile } from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FileService } from "../files.ts";
import { PageDialog } from "../PageView.tsx";
import { clockTime, dayWords } from "../time.ts";
import { useThumb } from "../viewer/useThumb.ts";
import { useViewer } from "../viewer/useViewer.ts";
import { ViewerHost } from "../viewer/ViewerHost.tsx";
import { AwayPrograms } from "./ProgramRows.tsx";
import {
  bytesWords,
  ChangePage,
  type ProjectActions,
  ProjectFilePage,
  useFolders,
  useRead,
} from "./Project.tsx";
import { ProjectDocument } from "./ProjectDocument.tsx";
import { Back, Chev, Failed, Group, Heading, Row, Tile } from "./parts.tsx";
import { AwayRun } from "./RunBar.tsx";
import { UniverseMark, UniverseReading } from "./UniverseMark.tsx";
import { createPictureFiles, type PictureFiles } from "./universePictures.ts";
import { seenBefore } from "./universeSeen.ts";
import { useYes } from "./useYes.ts";
import { FolderOnMac, YourFolder } from "./YourFolder.tsx";

type UniverseProps = {
  readonly titleId: string;
  readonly space: Space;
  readonly directory: Directory;
  /** Who reads it: what they brought themselves is never new to them. */
  readonly selfId: string;
  /** The room's name, which its folder is named for. */
  readonly title: string;
  readonly project: ProjectActions;
  /** How this client's files are fetched and its pages held: the Mac shell's door (ADR 0223). */
  readonly files?: FileService | undefined;
  /** *Open message* from the viewer: the sheet goes, and the room lands on the reply. */
  readonly onGoTo?: ((lineId: string) => void) | undefined;
  readonly onBack: () => void;
};

/** What Universe shows in its own place: a file's page from Files, or a change from its history. */
type Opened =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "change"; readonly commit: string; readonly from?: string | undefined };

/** The shelves as their tabs stand, Pages first (Arjun, 14 November 2026), and their words. */
const SHELVES: readonly { readonly shelf: ShelfName; readonly name: string }[] = [
  { shelf: "pages", name: "Pages" },
  { shelf: "media", name: "Media" },
  { shelf: "files", name: "Files" },
];

const NONE: readonly never[] = [];
const NO_SIZES: Readonly<Record<string, number>> = {};

/** Universe, where this client reads the room's project; nothing where it doesn't. */
export function UniversePage(
  props: Omit<UniverseProps, "project"> & { readonly project: ProjectActions | undefined },
) {
  const { project } = props;
  return project === undefined ? null : <UniverseOf {...props} project={project} />;
}

function UniverseOf(props: UniverseProps) {
  const { space, project, directory, onGoTo } = props;
  const head = space.project?.changes[0]?.commit ?? "";
  const read = useRead(() => project.universe(), `${space.id}:${head}`, true);
  const [open, setOpen] = useState<string | undefined>(undefined);
  const [opened, setOpened] = useState<Opened | undefined>(undefined);
  const [shelf, setShelf] = useState<ShelfName | undefined>(undefined);
  const pictures = useMemo(() => createPictureFiles(project, space.id), [project, space.id]);
  // What this computer had seen before this opening, which opening has just moved on to the newest.
  const [seen] = useState(() => seenBefore(space.id));
  const scroller = useRef<HTMLDivElement>(null);
  const cameFrom = useRef<string | undefined>(undefined);
  // Back from a file's page lands on its row, for the keyboard (and Escape) as for the eye.
  useLayoutEffect(() => {
    if (opened !== undefined || cameFrom.current === undefined) return;
    const testId = `universe-file-${cameFrom.current}`;
    cameFrom.current = undefined;
    const rows = scroller.current?.querySelectorAll<HTMLElement>("[data-testid^='universe-file-']");
    [...(rows ?? [])].find((row) => row.dataset["testid"] === testId)?.focus();
  }, [opened]);
  const universe = read.value;
  const shown = shelf ?? universeOpensOn(universe);
  const page = { titleId: props.titleId, space, directory, project, files: props.files };
  return (
    <ViewerHost
      space={space}
      lanes={NONE}
      directory={directory}
      files={pictures}
      onGoToMessage={(lineId) => {
        if (isRoomLine(lineId)) onGoTo?.(lineId);
      }}
    >
      {opened === undefined ? (
        <>
          <Back
            titleId={props.titleId}
            title="Universe"
            onBack={props.onBack}
            testId="universe-back"
          />
          <div ref={scroller} className="sheet-scroll universe" data-testid="universe">
            <p className="universe-under">
              <UniverseMark size={18} />
              {props.title}
            </p>
            {read.failed !== undefined && <Failed words={read.failed} />}
            {universe === undefined && read.failed === undefined && (
              <UniverseReading words="Reading the space…" />
            )}
            {universe !== undefined && (
              // What it read arrives where the planets went round: it fades in and rises into place.
              <div className="universe-came">
                <Here
                  room={{ id: space.id, title: props.title }}
                  project={project}
                  universe={universe}
                />
                <ShelfTabs shelves={universe.shelves} shelf={shown} onShelf={setShelf} />
                <div
                  key={shown}
                  className="universe-shelved"
                  data-turned={shelf === undefined ? undefined : "true"}
                >
                  <Shelf
                    shelf={shown}
                    universe={universe}
                    changes={space.project?.changes ?? NONE}
                    head={head}
                    directory={directory}
                    fresh={(item) =>
                      isNewSince(item, space.project?.changes ?? NONE, props.selfId, seen)
                    }
                    pictures={pictures}
                    onDocument={setOpen}
                    onFile={(path) => {
                      cameFrom.current = path;
                      setOpened({ kind: "file", path });
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <OpenedPage
          {...page}
          opened={opened}
          guest={space.roles[props.selfId] === "guest"}
          onOpened={setOpened}
        />
      )}
      {open !== undefined && (
        <ProjectDocument
          path={open}
          project={project}
          files={props.files}
          onFile={setOpen}
          onClose={() => setOpen(undefined)}
        />
      )}
    </ViewerHost>
  );
}

/** A file Files opened in Universe's place, or a change from its history; each with its way back. */
function OpenedPage(props: {
  readonly titleId: string;
  readonly space: Space;
  readonly directory: Directory;
  readonly project: ProjectActions;
  readonly files: FileService | undefined;
  readonly opened: Opened;
  readonly guest: boolean;
  readonly onOpened: (opened: Opened | undefined) => void;
}) {
  const { opened, onOpened, guest, ...page } = props;
  if (opened.kind === "file") {
    return (
      <ProjectFilePage
        {...page}
        path={opened.path}
        onBack={() => onOpened(undefined)}
        onChange={(commit) => onOpened({ kind: "change", commit, from: opened.path })}
      />
    );
  }
  const back = () =>
    onOpened(opened.from === undefined ? undefined : { kind: "file", path: opened.from });
  return (
    <ChangePage
      {...page}
      commit={opened.commit}
      guest={guest}
      onBack={back}
      onFile={(path) => onOpened({ kind: "file", path })}
    />
  );
}

/**
 * What Programs shows for one program: it, or what is wrong with the run file. Nothing for a run
 * file that lists programs, which Programs draws a row each (ADR 0303).
 */
function programOf(universe: Universe): RecipeRead {
  const [one] = universe.programs?.programs ?? [];
  if (listedOf(universe) !== undefined) return undefined;
  return one ?? (universe.why === undefined ? undefined : { why: universe.why });
}

/** The run file's programs, where it lists them and Programs draws a row each (ADR 0303). */
function listedOf(universe: Universe): RunFile | undefined {
  return listsPrograms(universe.programs) ? universe.programs : undefined;
}

/**
 * The folder and Programs, where this client has them: the Mac's own, or a browser asking the Mac;
 * nothing for somebody else in a browser, or in a Mac app that carries no `chips`.
 */
function Here(props: {
  readonly room: { readonly id: string; readonly title: string };
  readonly project: ProjectActions;
  readonly universe: Universe;
}) {
  const { project } = props;
  const program = programOf(props.universe);
  const listed = listedOf(props.universe);
  const folders = useFolders(project.folders);
  // From a browser, the Mac is asked only by an owner (ADR 0231).
  const mine = useYes(project.onTheMac);
  if (folders === true && project.folders !== undefined) {
    return (
      <YourFolder
        room={props.room}
        folders={project.folders}
        program={program}
        programs={listed}
        changedSince={project.changedSince}
        sends={project.sends?.() ?? true}
      />
    );
  }
  if (project.openOnMac !== undefined && mine) {
    return (
      <FolderOnMac openOnMac={project.openOnMac}>
        {listed !== undefined && project.runs !== undefined && (
          <AwayPrograms runs={project.runs} file={listed} changedSince={project.changedSince} />
        )}
        {program !== undefined && project.runs !== undefined && (
          <>
            <Heading>Programs</Heading>
            <AwayRun runs={project.runs} recipe={program} changedSince={project.changedSince} />
          </>
        )}
      </FolderOnMac>
    );
  }
  return null;
}

/**
 * Media, Pages and Files (the addenda of 13 and 14 November 2026): words with their counts, all
 * always there so they stand where they were learnt, and a gold line that slides to the one chosen.
 */
function ShelfTabs(props: {
  readonly shelves: Shelves | undefined;
  readonly shelf: ShelfName;
  readonly onShelf: (shelf: ShelfName) => void;
}) {
  const { shelves, shelf } = props;
  const list = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ x: number; w: number; moves: boolean } | undefined>(undefined);
  // The line is placed under the chosen word, at once the first time and sliding after.
  useLayoutEffect(() => {
    const tab = list.current?.querySelector<HTMLElement>(`[data-shelf="${shelf}"]`);
    if (tab === undefined || tab === null) return;
    setLine((was) => ({ x: tab.offsetLeft, w: tab.offsetWidth, moves: was !== undefined }));
  }, [shelf]);
  if (shelves === undefined) return null;
  const counts: Record<ShelfName, number> = {
    media: shelves.media.length,
    pages: shelves.pages.length,
    files: shelves.files.length,
  };
  return (
    <div ref={list} role="tablist" className="universe-shelves" data-testid="universe-shelves">
      {SHELVES.map(({ shelf: each, name }) => (
        <button
          key={each}
          type="button"
          role="tab"
          className="universe-shelf"
          aria-selected={each === shelf}
          aria-label={`${name}, ${counts[each]}`}
          data-shelf={each}
          onClick={() => {
            if (each !== shelf) props.onShelf(each);
          }}
          data-testid={`universe-shelf-${each}`}
        >
          {name}
          <span className="universe-shelf-count">{counts[each]}</span>
        </button>
      ))}
      {line !== undefined && (
        <span
          className="universe-shelf-line"
          data-moves={line.moves ? "true" : undefined}
          style={{ transform: `translateX(${line.x}px)`, width: `${line.w}px` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** What a shelf is handed: the space's things, and where a tap on one goes. */
interface ShelfProps {
  readonly universe: Universe;
  readonly changes: readonly ProjectChange[];
  readonly head: string;
  readonly directory: Directory;
  /** Whether a file is new to the reader since Universe was last opened here. */
  readonly fresh: (item: MediaItem) => boolean;
  readonly pictures: PictureFiles;
  /** A document in the page dialog. */
  readonly onDocument: (path: string) => void;
  /** Anything else on its own page in Universe's place. */
  readonly onFile: (path: string) => void;
}

/** The shelf Universe shows: Media's squares, Pages, or Files. */
function Shelf(props: ShelfProps & { readonly shelf: ShelfName }) {
  if (props.shelf === "media") return <MediaShelf {...props} />;
  if (props.shelf === "files") return <FilesShelf {...props} />;
  return <PagesShelf universe={props.universe} onDocument={props.onDocument} />;
}

/** Words where a shelf has nothing yet: what would be there. */
function Empty(props: { readonly title: string; readonly body: string; readonly testId: string }) {
  return (
    <div className="universe-empty" data-testid={props.testId}>
      <b>{props.title}</b>
      <p>{props.body}</p>
    </div>
  );
}

/** Media's pictures as the viewer takes them, newest first, and the deck read when one opens. */
function useMediaShown(props: ShelfProps): readonly ShownPicture[] {
  const { universe, changes, head, pictures } = props;
  const media = universe.shelves?.media ?? NONE;
  const sizes = universe.shelves?.sizes ?? NO_SIZES;
  return useMemo(
    () => picturesOf(mediaInOrder(media, changes), head, sizes, pictures.know),
    [media, changes, head, sizes, pictures],
  );
}

/** `Today`, `Yesterday`, or the date: the day Media's pictures came. */
function dayOf(ts: string, now: number): string {
  const at = new Date(ts);
  if (Number.isNaN(at.getTime())) return "Earlier";
  const today = new Date(now);
  if (at.toDateString() === today.toDateString()) return "Today";
  today.setDate(today.getDate() - 1);
  if (at.toDateString() === today.toDateString()) return "Yesterday";
  return dayWords(ts);
}

/**
 * The project's pictures as squares, three across, newest first under the day each came, each
 * opening in the viewer on Media's pictures.
 */
function MediaShelf(props: ShelfProps) {
  const shown = useMediaShown(props);
  if (shown.length === 0) {
    return (
      <Empty
        title="No pictures yet"
        body="A picture that an agent keeps in this space shows here."
        testId="universe-media-empty"
      />
    );
  }
  const now = Date.now();
  const days: { label: string; shown: ShownPicture[] }[] = [];
  for (const each of shown) {
    const at = each.item.change?.at;
    const label = at === undefined ? "Earlier" : dayOf(at, now);
    const last = days.at(-1);
    if (last?.label === label) last.shown.push(each);
    else days.push({ label, shown: [each] });
  }
  const deck = () => pictureDeckOf(shown, props.pictures.sizeOf);
  return (
    <div className="universe-media" data-testid="universe-media">
      {days.map((day, at) => (
        <section key={day.label} className="universe-day">
          <p className="universe-day-head">
            {day.label}
            {at === 0 && <span>Newest first</span>}
          </p>
          <div className="universe-squares">
            {day.shown.map((each) => (
              <Square
                key={each.attachment.id}
                shown={each}
                deck={deck}
                pictures={props.pictures}
                fresh={props.fresh(each.item)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * A picture opened: into the viewer on the deck, flying from where it was clicked, once its small
 * copy has said its size, so the stage draws it at its shape.
 */
function useOpenPicture(pictures: PictureFiles) {
  const viewer = useViewer();
  return (shown: ShownPicture, deck: () => ReturnType<typeof pictureDeckOf>) => {
    const id = shown.attachment.id;
    void pictures.thumb(id).then(
      () => viewer.openDeck(deck(), id),
      () => viewer.openDeck(deck(), id),
    );
  };
}

/** One picture's square: its small copy, faded in as it comes, and a gold dot while it is new. */
function Square(props: {
  readonly shown: ShownPicture;
  readonly deck: () => ReturnType<typeof pictureDeckOf>;
  readonly pictures: PictureFiles;
  readonly fresh: boolean;
}) {
  const { shown, pictures } = props;
  const { attachment } = shown;
  const viewer = useViewer();
  const open = useOpenPicture(pictures);
  return (
    <button
      type="button"
      ref={(element) => viewer.registerTile(attachment.id, element)}
      className="universe-square"
      onClick={() => open(shown, props.deck)}
      aria-label={`Open ${attachment.filename}${props.fresh ? ", new" : ""}`}
      data-testid={`universe-media-${shown.item.path}`}
    >
      <Thumb files={pictures} id={attachment.id} />
      {props.fresh && (
        <span className="universe-new" data-testid={`universe-new-${shown.item.path}`} />
      )}
    </button>
  );
}

/** A picture's small copy, faded in once it has loaded. */
function Thumb(props: { readonly files: FileService; readonly id: string }) {
  const url = useThumb(props.files, props.id);
  const [loaded, setLoaded] = useState(false);
  if (url === undefined) return null;
  return (
    <img
      className="universe-thumb"
      src={url}
      alt=""
      data-loaded={loaded ? "true" : undefined}
      onLoad={() => setLoaded(true)}
    />
  );
}

/**
 * Pages: Open page for the start page, or the one document, and the documents beside it, each
 * opening in the page dialog; several with no start page, listed; none, what would go here.
 */
function PagesShelf(props: {
  readonly universe: Universe;
  readonly onDocument: (path: string) => void;
}) {
  const shelves = props.universe.shelves;
  const pages = shelves?.pages ?? NONE;
  const first = shelves?.first;
  if (pages.length === 0) {
    return (
      <Empty
        title="No pages here yet"
        body="An HTML page, a Markdown note or a PDF that an agent keeps in this space opens here."
        testId="universe-pages-empty"
      />
    );
  }
  const others = pages.filter((path) => path !== first);
  return (
    <section className="universe-documents" data-testid="universe-documents">
      {first === undefined ? (
        <p className="your-folder-note">{noStartPageWords(pages.length)}</p>
      ) : (
        <>
          <button
            type="button"
            className="sheet-go"
            onClick={() => props.onDocument(first)}
            data-testid="universe-open-page"
          >
            <Icon name="doc" size={15} />
            Open page
          </button>
          <p className="your-folder-note">{`Opens ${startName(first)} here, in Chips.`}</p>
        </>
      )}
      {others.length > 0 && (
        <Group>
          {others.map((path) => (
            <Row
              key={path}
              face={
                <Tile>
                  <Icon name="doc" size={14} />
                </Tile>
              }
              name={pageChipName(path)}
              under={path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ""}
              onClick={() => props.onDocument(path)}
              trailing={<Chev />}
              testId={`universe-document-${path}`}
            />
          ))}
        </Group>
      )}
    </section>
  );
}

/**
 * Files (the addendum of 14 November 2026): every file of the project under its folder, as Project
 * › Files lists them, each with its size, who changed it last and when, and a gold dot while it is
 * new. A click opens it where it belongs (core's `fileOpensIn`).
 */
function FilesShelf(props: ShelfProps) {
  const { universe, changes, head, directory, pictures } = props;
  const shelves = universe.shelves;
  const files = shelves?.files ?? NONE;
  const media = useMediaShown(props);
  const groups = useMemo(() => filesInOrder(files, changes), [files, changes]);
  if (shelves === undefined || files.length === 0) {
    return (
      <Empty
        title="No files yet"
        body="A file that an agent keeps in this space shows here."
        testId="universe-files-empty"
      />
    );
  }
  const sizes = shelves.sizes ?? NO_SIZES;
  const now = Date.now();
  const row = (item: MediaItem) => {
    const opens = fileOpensIn(item.path, shelves);
    const said = {
      item,
      under: fileUnder(sizes[item.path], item.change, directory, now),
      fresh: props.fresh(item),
    };
    const picture = pictureIn(item, opens, media, () =>
      picturesOf([item], head, sizes, pictures.know),
    );
    if (picture !== undefined) {
      return (
        <PictureRow
          key={item.path}
          {...said}
          shown={picture.shown}
          deck={() => pictureDeckOf(picture.deck, pictures.sizeOf)}
          pictures={pictures}
        />
      );
    }
    const inDialog = opens === "pages" || opens === "sheet";
    return (
      <FileRow
        key={item.path}
        {...said}
        code={opens === "words" && documentKind(item.path) === undefined}
        onOpen={() => (inDialog ? props.onDocument(item.path) : props.onFile(item.path))}
      />
    );
  };
  return (
    <div className="universe-files" data-testid="universe-files">
      {groups.map(({ folder, items }) => (
        <section key={folder} className="universe-folder">
          {folder !== "" && <p className="universe-folder-name">{`${folder}/`}</p>}
          <Group>{items.map(row)}</Group>
        </section>
      ))}
    </div>
  );
}

/**
 * A picture opened from Files, as the viewer takes it: one of Media's pages on through Media's,
 * and any other (a program's icon) alone.
 */
function pictureIn(
  item: MediaItem,
  opens: ReturnType<typeof fileOpensIn>,
  media: readonly ShownPicture[],
  alone: () => readonly ShownPicture[],
): { readonly shown: ShownPicture; readonly deck: readonly ShownPicture[] } | undefined {
  if (opens === "media") {
    const shown = media.find((each) => each.item.path === item.path);
    return shown === undefined ? undefined : { shown, deck: media };
  }
  if (opens !== "picture") return undefined;
  const [shown] = alone();
  return shown === undefined ? undefined : { shown, deck: [shown] };
}

/** Under a file's name: its size, who changed it last, and when; as much of that as is known. */
function fileUnder(
  bytes: number | undefined,
  change: ProjectChange | undefined,
  directory: Directory,
  now: number,
): string {
  const said: string[] = bytes === undefined ? [] : [bytesWords(bytes)];
  if (change !== undefined) {
    const day = dayOf(change.at, now);
    const recent = day === "Today" || day === "Yesterday";
    said.push(nameOf(directory, change.by), recent ? `${day} ${clockTime(change.at)}` : day);
  }
  return said.join(" · ");
}

/** A long name cut in the middle, so the end that tells files apart still shows. */
function middleOf(name: string): string {
  const most = 34;
  if (name.length <= most) return name;
  const tail = 12;
  return `${name.slice(0, most - tail - 1)}…${name.slice(-tail)}`;
}

/** What a Files row says: the file, the line under its name, and whether it is new. */
interface RowSaid {
  readonly item: MediaItem;
  readonly under: string;
  readonly fresh: boolean;
}

/** A file that isn't a picture: its kind's mark, code or a document, and where a click takes it. */
function FileRow(props: RowSaid & { readonly code: boolean; readonly onOpen: () => void }) {
  const { item } = props;
  return (
    <Row
      face={
        <span
          className="ctx-tile ctx-tile-quiet sheet-tile universe-file-face"
          data-code={props.code ? "true" : undefined}
          aria-hidden="true"
        >
          <Icon name={props.code ? "code" : "doc"} size={14} />
          {props.fresh && <span className="universe-new" />}
        </span>
      }
      name={middleOf(fileNameOf(item.path))}
      under={props.under}
      label={`Open ${fileNameOf(item.path)}${props.fresh ? ", new" : ""}`}
      onClick={props.onOpen}
      trailing={<Chev />}
      testId={`universe-file-${item.path}`}
    />
  );
}

/** A picture's row: its small copy as its face, which the viewer flies from and back to. */
function PictureRow(
  props: RowSaid & {
    readonly shown: ShownPicture;
    readonly deck: () => ReturnType<typeof pictureDeckOf>;
    readonly pictures: PictureFiles;
  },
) {
  const { item, shown, pictures } = props;
  const viewer = useViewer();
  const open = useOpenPicture(pictures);
  return (
    <Row
      face={
        <PictureFace
          id={shown.attachment.id}
          pictures={pictures}
          fresh={props.fresh}
          onTile={(element) => viewer.registerTile(shown.attachment.id, element)}
        />
      }
      name={middleOf(fileNameOf(item.path))}
      under={props.under}
      label={`Open ${fileNameOf(item.path)}${props.fresh ? ", new" : ""}`}
      onClick={() => open(shown, props.deck)}
      trailing={<Chev />}
      testId={`universe-file-${item.path}`}
    />
  );
}

/** A row's face that is the picture itself, with the gold dot at its corner while it is new. */
function PictureFace(props: {
  readonly id: string;
  readonly pictures: PictureFiles;
  readonly fresh: boolean;
  readonly onTile: (element: HTMLElement | null) => void;
}): ReactNode {
  return (
    <span
      ref={props.onTile}
      className="ctx-tile ctx-tile-quiet sheet-tile universe-file-face universe-file-picture"
      aria-hidden="true"
    >
      <Thumb files={props.pictures} id={props.id} />
      {props.fresh && <span className="universe-new" />}
    </span>
  );
}

/**
 * The room's page, opened in this window because the person asked from another device of theirs
 * (ADR 0227): the start page, or the one document; or, where the space has neither, a word saying
 * so in the dialog it would have opened in.
 */
export function AskedPage(props: {
  readonly project: ProjectActions;
  readonly files: FileService | undefined;
  readonly title: string;
  readonly onClose: () => void;
}) {
  const read = useRead(() => props.project.universe(), "asked", false);
  const [open, setOpen] = useState<string | undefined>(undefined);
  const start = read.value === undefined ? undefined : startOf(read.value);
  const shown = open ?? start;
  if (shown !== undefined) {
    return (
      <ProjectDocument
        path={shown}
        project={props.project}
        files={props.files}
        onFile={setOpen}
        onClose={props.onClose}
      />
    );
  }
  return (
    <PageDialog name={props.title} onClose={props.onClose}>
      {read.failed === undefined && read.value === undefined ? (
        <UniverseReading words="Opening…" />
      ) : (
        <p className="page-view-note" role={read.failed === undefined ? undefined : "alert"}>
          {read.failed ?? "This space has no page to open yet."}
        </p>
      )}
    </PageDialog>
  );
}
