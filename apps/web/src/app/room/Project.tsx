/**
 * The room's project in the room's sheet (ADR 0222), for the web and the Mac: the Project page
 * with its two tabs, Files at `main` and every Change newest first; one change with its files'
 * diffs and Undo; and one file with its history. A file opens here as its words, or its picture,
 * with Download for the rest; a page runs once the server builds it (ADR 0223). Files is the files
 * alone, `.chips` left out: the folder, Open page and Run program are Universe's (ADR 0227).
 */

import {
  changeOf,
  changeRow,
  type Directory,
  fileNameOf,
  filesByFolder,
  filesChangedWords,
  linesWords,
  type MacsHeard,
  nameOf,
  type Space,
  shownFiles,
  type Universe,
  undoOffer,
} from "@chipschat/core";
import type {
  ProjectChangeAnswer,
  ProjectFilesAnswer,
  ProjectHistoryAnswer,
  ProjectUndoAnswer,
} from "@chipschat/protocol";
import { Icon } from "@chipschat/ui";
import { useEffect, useState } from "react";
import type { FileService } from "../files.ts";
import type { Folders, Room } from "../folders.ts";
import { ProjectDocument } from "./ProjectDocument.tsx";
import { Back, Chev, Failed, Group, Heading, Row, Tile } from "./parts.tsx";
import type { RunOnMac } from "./RunBar.tsx";

/** What the sheet reads of the room's project and the one change it makes, through the store. */
export interface ProjectActions {
  readonly files: (at?: string) => Promise<ProjectFilesAnswer>;
  readonly file: (
    path: string,
    at?: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly type: string }>;
  readonly history: (path: string) => Promise<ProjectHistoryAnswer>;
  readonly change: (commit: string) => Promise<ProjectChangeAnswer>;
  readonly undo: (commit: string) => Promise<ProjectUndoAnswer>;
  /** A page of the project built into one document (ADR 0223), and where a frame loads it from. */
  readonly page: (path: string, at?: string) => Promise<string>;
  readonly pageUrl: (path: string, at?: string) => Promise<string | undefined>;
  /** The Mac's folders, for Your folder (ADR 0224); none where nothing keeps one. */
  readonly folders?: Folders | undefined;
  /**
   * Open folder on Mac (ADR 0225): the person's own Chips for Mac asked to open the folder, and how
   * many heard it. A browser's; none in the Mac app, which opens its own.
   */
  readonly openOnMac?: (() => Promise<MacsHeard>) | undefined;
  /** What the space made, to read and to run (ADR 0227). */
  readonly universe: () => Promise<Universe>;
  /** Run from a browser: the person's Chips for Mac asked, and what it says. None in the Mac app. */
  readonly runs?: RunOnMac | undefined;
  /**
   * Open in browser, in the Mac app: a page of the project opened in the Mac's browser from the
   * room's folder; why not, or nothing when it opened. None in a browser, which is one already.
   */
  readonly browse?: ((path: string) => Promise<string | undefined>) | undefined;
  /**
   * Whether Run and Open on the Mac are this person's from here (ADR 0231): in the Mac app, this
   * Mac runs the workspace's server and they own it; in a browser, they own it. Nothing shows
   * them otherwise.
   */
  readonly onTheMac?: (() => Promise<boolean>) | undefined;
  /**
   * Who changed the project since a run at this commit, when anybody but the person and their own
   * agents did (SEC-40): what the Run bar names.
   */
  readonly changedSince?: ((commit: string | undefined) => readonly string[]) | undefined;
  /** Whether the person sends changes from Your folder: anybody in the room but a guest (SEC-40). */
  readonly sends?: (() => boolean) | undefined;
  /** The room, by its name now: what a run on this Mac is for, its folder named after it. */
  readonly room?: (() => Room) | undefined;
  /** The workspace's owner by name, for the banner somebody else reads over a page (ADR 0231). */
  readonly ownerName?: (() => string | undefined) | undefined;
  /** An address opened outside Chips: the Mac's browser from the Mac app, a new tab in a browser. */
  readonly openLink?: ((url: string) => void) | undefined;
}

interface PageProps {
  readonly titleId: string;
  readonly space: Space;
  readonly directory: Directory;
  readonly project: ProjectActions;
  /** How this client's files are fetched and its pages held: the Mac shell's door (ADR 0223). */
  readonly files?: FileService | undefined;
  readonly onBack: () => void;
}

/**
 * A read the page waits on: its answer, or why it failed. With `keep`, the last answer stays drawn
 * while the next is read, for the same thing read again.
 */
export function useRead<T>(
  read: () => Promise<T>,
  key: string,
  keep = false,
): { value?: T; failed?: string } {
  const [state, setState] = useState<{ value?: T; failed?: string }>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again only when what it reads changes.
  useEffect(() => {
    let live = true;
    setState(keep ? (was) => (was.value === undefined ? {} : { value: was.value }) : {});
    read().then(
      (value) => live && setState({ value }),
      (error: unknown) =>
        live && setState({ failed: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return state;
}

const who = (directory: Directory) => (id: string) => nameOf(directory, id);

/** The project's pages as the sheet turns between them: back from a change or a file is the project. */
export function ProjectPages(
  props: Omit<PageProps, "onBack" | "project"> & {
    /** The store's reads of the project, where this client has them. */
    readonly project: ProjectActions | undefined;
    readonly page:
      | { readonly kind: "project" }
      | { readonly kind: "change"; readonly commit: string }
      | { readonly kind: "file"; readonly path: string };
    readonly guest: boolean;
    readonly go: (
      page:
        | { readonly kind: "who" | "project" }
        | { readonly kind: "change"; readonly commit: string }
        | { readonly kind: "file"; readonly path: string },
    ) => void;
  },
) {
  const { page, go, project } = props;
  if (project === undefined) return null;
  const toChange = (commit: string) => go({ kind: "change", commit });
  const toFile = (path: string) => go({ kind: "file", path });
  if (page.kind === "project") {
    return (
      <ProjectPage
        {...props}
        project={project}
        onBack={() => go({ kind: "who" })}
        onChange={toChange}
        onFile={toFile}
      />
    );
  }
  if (page.kind === "change") {
    return (
      <ChangePage
        {...props}
        project={project}
        commit={page.commit}
        onBack={() => go({ kind: "project" })}
        onFile={toFile}
      />
    );
  }
  return (
    <ProjectFilePage
      {...props}
      project={project}
      path={page.path}
      onBack={() => go({ kind: "project" })}
      onChange={toChange}
    />
  );
}

/** Files and Changes, under one title. */
export function ProjectPage(
  props: PageProps & {
    readonly onChange: (commit: string) => void;
    readonly onFile: (path: string) => void;
  },
) {
  const [tab, setTab] = useState<"files" | "changes">("files");
  const changes = props.space.project?.changes ?? [];
  return (
    <>
      <Back
        titleId={props.titleId}
        title="Project"
        onBack={props.onBack}
        testId="room-sheet-project-back"
      />
      <div className="project-tabs" role="tablist">
        {(["files", "changes"] as const).map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            aria-selected={tab === each}
            className="project-tab"
            onClick={() => setTab(each)}
            data-testid={`project-tab-${each}`}
          >
            {each === "files" ? "Files" : "Changes"}
          </button>
        ))}
      </div>
      <div className="sheet-scroll">
        {tab === "files" ? (
          <ProjectFiles project={props.project} space={props.space} onFile={props.onFile} />
        ) : changes.length === 0 ? (
          <p className="sheet-hint">No changes yet.</p>
        ) : (
          <Group>
            {changes.map((change) => {
              const row = changeRow(
                props.space.project ?? { files: 0, changes },
                change,
                who(props.directory),
              );
              return (
                <Row
                  key={change.commit}
                  face={
                    <Tile>
                      <Icon name={change.undoes === undefined ? "doc" : "reply"} size={14} />
                    </Tile>
                  }
                  name={row.title}
                  under={row.under}
                  onClick={() => props.onChange(change.commit)}
                  trailing={<Chev />}
                  testId={`project-change-${change.commit.slice(0, 7)}`}
                />
              );
            })}
          </Group>
        )}
      </div>
    </>
  );
}

/** Whether this app keeps a folder for a room: the Mac app, carrying `chips` (ADR 0224). */
export function useFolders(folders: Folders | undefined): boolean | undefined {
  const [can, setCan] = useState<boolean | undefined>(folders === undefined ? false : undefined);
  useEffect(() => {
    if (folders === undefined) return setCan(false);
    let live = true;
    void folders.available().then((yes) => live && setCan(yes));
    return () => {
      live = false;
    };
  }, [folders]);
  return can;
}

function ProjectFiles(props: {
  readonly project: ProjectActions;
  readonly space: Space;
  readonly onFile: (path: string) => void;
}) {
  const { space, project } = props;
  // Read again as the project moves on, a Send of the person's own included.
  const head = space.project?.changes[0]?.commit ?? "";
  const read = useRead(() => project.files(), `${space.id}:${head}`, true);
  const files = shownFiles(read.value?.files ?? []);
  return (
    <>
      {read.failed !== undefined && <Failed words={read.failed} />}
      {read.value === undefined && read.failed === undefined && (
        <p className="sheet-hint">Reading the project…</p>
      )}
      {read.value !== undefined && files.length === 0 && (
        <p className="sheet-hint">No files yet.</p>
      )}
      {filesByFolder(files).map(({ folder, files: inFolder }) => (
        <section key={folder}>
          {folder !== "" && <Heading>{`${folder}/`}</Heading>}
          <Group>
            {inFolder.map((file) => (
              <Row
                key={file.path}
                face={
                  <Tile>
                    <Icon name="doc" size={14} />
                  </Tile>
                }
                name={fileNameOf(file.path)}
                under={bytesWords(file.bytes)}
                onClick={() => props.onFile(file.path)}
                trailing={<Chev />}
                testId={`project-file-${file.path}`}
              />
            ))}
          </Group>
        </section>
      ))}
    </>
  );
}

/** One change: what it said, its files' diffs, and Undo or Put it back. */
export function ChangePage(
  props: PageProps & {
    readonly commit: string;
    readonly guest: boolean;
    readonly onFile: (path: string) => void;
  },
) {
  const read = useRead(() => props.project.change(props.commit), props.commit);
  const [undoing, setUndoing] = useState(false);
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const known = changeOf(props.space.project, props.commit);
  const offer = known === undefined ? undefined : undoOffer(known, props.guest);
  const undo = () => {
    setUndoing(true);
    setRefused(undefined);
    props.project.undo(props.commit).then(
      () => props.onBack(),
      (error: unknown) => {
        setUndoing(false);
        setRefused(error instanceof Error ? error.message : String(error));
      },
    );
  };
  const change = read.value;
  return (
    <>
      <Back
        titleId={props.titleId}
        title="Change"
        onBack={props.onBack}
        testId="room-sheet-change-back"
      />
      <div className="sheet-scroll">
        {read.failed !== undefined && <Failed words={read.failed} />}
        {change === undefined && read.failed === undefined && (
          <p className="sheet-hint">Reading the change…</p>
        )}
        {change !== undefined && (
          <>
            <p className="project-change-head" data-testid="project-change-head">
              <strong>{change.message.split("\n")[0]}</strong>
              <span className="sheet-hint">
                {[
                  change.by.id === undefined
                    ? change.by.name
                    : nameOf(props.directory, change.by.id),
                  known === undefined ? undefined : filesChangedWords(known),
                  linesWords(totals(change)),
                  known?.undoneBy === undefined ? undefined : "Undone",
                ]
                  .filter((part) => part !== undefined)
                  .join(" · ")}
              </span>
            </p>
            {offer !== undefined && (
              <button
                type="button"
                className="sheet-go"
                disabled={undoing}
                onClick={undo}
                data-testid="project-undo"
              >
                {undoing ? (offer === "Undo" ? "Undoing…" : "Putting it back…") : offer}
              </button>
            )}
            {refused !== undefined && <Failed words={refused} />}
            {change.files.map((file) => (
              <section
                key={file.path}
                className="project-diff"
                data-testid={`project-diff-${file.path}`}
              >
                <button
                  type="button"
                  className="project-diff-path"
                  onClick={() => props.onFile(file.path)}
                >
                  {file.path}
                  <span className="sheet-hint">
                    {" "}
                    {file.added === null
                      ? "binary"
                      : linesWords({ added: file.added, removed: file.removed ?? 0 })}
                  </span>
                </button>
                {file.patch !== null && <Diff patch={file.patch} />}
                {file.cut && (
                  <p className="sheet-hint">The rest of this change is too long to show here.</p>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}

function totals(change: ProjectChangeAnswer): { added: number; removed: number } {
  return change.files.reduce(
    (sum, file) => ({
      added: sum.added + (file.added ?? 0),
      removed: sum.removed + (file.removed ?? 0),
    }),
    { added: 0, removed: 0 },
  );
}

/** A file's diff, each line coloured by whether it was added or taken out; git's headers left out. */
function Diff({ patch }: { readonly patch: string }) {
  const lines = patch
    .split("\n")
    .filter(
      (line) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(line),
    );
  return (
    <pre className="project-diff-lines">
      {lines.map((line, at) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a diff's lines are only ever drawn in order.
          key={at}
          className="project-diff-line"
          data-kind={
            line.startsWith("+")
              ? "added"
              : line.startsWith("-")
                ? "removed"
                : line.startsWith("@@")
                  ? "hunk"
                  : undefined
          }
        >
          {`${line}\n`}
        </span>
      ))}
    </pre>
  );
}

/** One file: its words or its picture, Download, and its history under it. */
export function ProjectFilePage(
  props: PageProps & {
    readonly path: string;
    readonly onChange: (commit: string) => void;
  },
) {
  const read = useRead(() => props.project.file(props.path), props.path);
  const history = useRead(() => props.project.history(props.path), `${props.path}:history`);
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (read.value === undefined) return;
    const made = URL.createObjectURL(
      new Blob([read.value.bytes as BlobPart], { type: read.value.type }),
    );
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [read.value]);
  return (
    <>
      <Back
        titleId={props.titleId}
        title={fileNameOf(props.path)}
        onBack={props.onBack}
        testId="room-sheet-file-back"
      />
      <div className="sheet-scroll">
        {/* Above the page's own words: under them, a long page left it out of sight. */}
        {read.value?.type === "text/html" && (
          <OpenPage path={props.path} project={props.project} files={props.files} />
        )}
        {read.failed !== undefined && <Failed words={read.failed} />}
        {read.value !== undefined && <FileShown file={read.value} path={props.path} url={url} />}
        {url !== undefined && (
          <a className="sheet-go" href={url} download={fileNameOf(props.path)}>
            Download
          </a>
        )}
        {(history.value?.versions.length ?? 0) > 0 && (
          <>
            <Heading>History</Heading>
            <Group>
              {history.value?.versions.map((version) => (
                <Row
                  key={version.commit}
                  face={
                    <Tile>
                      <Icon name="doc" size={14} />
                    </Tile>
                  }
                  name={version.message || "A change to the project"}
                  under={
                    version.by.id === undefined
                      ? version.by.name
                      : nameOf(props.directory, version.by.id)
                  }
                  onClick={() => props.onChange(version.commit)}
                  trailing={<Chev />}
                />
              ))}
            </Group>
          </>
        )}
      </div>
    </>
  );
}

/** A file as the sheet can show it: its picture, or its words. */
function FileShown(props: {
  readonly file: { readonly bytes: Uint8Array; readonly type: string };
  readonly path: string;
  readonly url: string | undefined;
}) {
  const { type } = props.file;
  if (type.startsWith("image/") && type !== "image/svg+xml") {
    return props.url === undefined ? null : (
      <img className="project-file-picture" src={props.url} alt={props.path} />
    );
  }
  if (!(type.startsWith("text/") || type === "application/json" || type === "image/svg+xml"))
    return null;
  return (
    <pre className="project-file-words" data-testid="project-file-words">
      {new TextDecoder().decode(props.file.bytes)}
    </pre>
  );
}

/**
 * Open page, for an HTML file of the project (ADR 0223): the page built into one document with
 * what it names, run in the page dialog under the page's policy; a link on it to another file of
 * the project turns the dialog to that file (ADR 0227).
 */
function OpenPage(props: {
  readonly path: string;
  readonly project: ProjectActions;
  readonly files: FileService | undefined;
}) {
  const [open, setOpen] = useState<string | undefined>(undefined);
  return (
    <>
      <button
        type="button"
        className="sheet-go"
        onClick={() => setOpen(props.path)}
        data-testid="project-open-page"
      >
        Open page
      </button>
      {open !== undefined && (
        <ProjectDocument
          path={open}
          project={props.project}
          files={props.files}
          onFile={setOpen}
          onClose={() => setOpen(undefined)}
        />
      )}
    </>
  );
}

function bytesWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
