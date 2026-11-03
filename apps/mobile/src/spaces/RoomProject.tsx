/**
 * The room's project on the phone (ADR 0222), as the web and the Mac have it: a change with its
 * files' diffs and Undo, opened from "2 files changed" under the reply that made it; and the room
 * sheet's Project page, with Files at `main` and every Change newest first, and one file with its
 * history. A file opens here as its words or its picture; a page runs once the server builds it
 * (ADR 0223). Files is the files alone: what opens on the phone and what happens on the Mac are in
 * Universe (ADR 0227), and `.chips`, the start page and the run file, is left out.
 */

import {
  changedSince,
  changeOf,
  changeRow,
  type Directory,
  fileNameOf,
  filesByFolder,
  filesChangedWords,
  linesWords,
  type MacsHeard,
  nameOf,
  type ProjectChange,
  type Space,
  type Store,
  shownFiles,
  undoOffer,
} from "@chipschat/core";
import type {
  ProjectChangeAnswer,
  ProjectFilesAnswer,
  ProjectHistoryAnswer,
  ProjectUndoAnswer,
} from "@chipschat/protocol";
import { type ReactNode, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { toBase64 } from "../runtime/base64";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Icon } from "../ui/Icon";
import { PageBack } from "../ui/PageBack";
import { SheetScroll } from "../ui/Sheet";
import { usePalette } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { PageSheet } from "./PageSheet";
import type { RunOnMac } from "./RunBar";

/** What the phone reads of the room's project and the one change it makes, through the store. */
export interface ProjectActions {
  readonly files: (at?: string) => Promise<ProjectFilesAnswer>;
  /** One file's bytes; `signal` gives up on it, so the server sends no more of it. */
  readonly file: (
    path: string,
    at?: string,
    signal?: AbortSignal,
  ) => Promise<{ readonly bytes: Uint8Array; readonly type: string }>;
  readonly history: (path: string) => Promise<ProjectHistoryAnswer>;
  readonly change: (commit: string) => Promise<ProjectChangeAnswer>;
  readonly undo: (commit: string) => Promise<ProjectUndoAnswer>;
  /** A page of the project built into one document, to run in the page sheet (ADR 0223). */
  readonly page: (path: string, at?: string, signal?: AbortSignal) => Promise<string>;
  /**
   * Open folder in Mac (ADR 0225): the person's own Chips for Mac asked, how many heard it, and
   * whether the server opened it first (ADR 0227's second addendum).
   */
  readonly openOnMac: () => Promise<MacsHeard>;
  /** Open page (ADR 0227): the person's own Chips for Mac asked to open the room's page. */
  readonly openPageOnMac: () => Promise<MacsHeard>;
  /** Run program on the person's Mac, and what it says (ADR 0226). */
  readonly runs: RunOnMac;
}

/**
 * A room's project as the store reads it, for one room. Given the reader, Run's bar names who
 * else changed the files since their last run (SEC-40).
 */
export function projectActions(store: Store, spaceId: string, selfId?: string): ProjectActions {
  return {
    files: (at) => store.projectFiles(spaceId, at),
    file: (path, at, signal) => store.projectFile(spaceId, path, at, signal),
    history: (path) => store.projectHistory(spaceId, path),
    change: (commit) => store.projectChange(spaceId, commit),
    undo: (commit) => store.undoChange(spaceId, commit),
    page: (path, at, signal) => store.projectPage(spaceId, path, at, signal),
    openOnMac: () => store.openFolderOnMac(spaceId),
    openPageOnMac: () => store.openPageOnMac(spaceId),
    runs: {
      room: spaceId,
      ask: (ask) => store.runOnMac(spaceId, ask),
      read: () => store.projectRun(spaceId),
      heard: (listen) =>
        store.onRunState((id, run) => {
          if (id === spaceId) listen(run);
        }),
      ...(selfId === undefined
        ? {}
        : {
            changedSince: (commit: string | undefined) => {
              const { model, directory } = store.getSnapshot();
              const space = model.spaces.find((each) => each.id === spaceId);
              return changedSince(space?.project, commit, directory, selfId);
            },
          }),
    },
  };
}

/** A read a page waits on: its answer, or why it failed. */
function useRead<T>(read: () => Promise<T>, key: string): { value?: T; failed?: string } {
  const [state, setState] = useState<{ value?: T; failed?: string }>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again only when what it reads changes.
  useEffect(() => {
    let live = true;
    setState({});
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

/**
 * One change: what it said, who and how much, Undo or Put it back, and each file's diff. Undone,
 * `onDone` says so, and whoever opened it puts it away.
 */
export function ChangeView({
  space,
  directory,
  commit,
  guest,
  project,
  onDone,
  onFile,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly commit: string;
  readonly guest: boolean;
  readonly project: ProjectActions;
  readonly onDone: () => void;
  /** A file's name opens the file, where the page can turn to it. */
  readonly onFile?: ((path: string) => void) | undefined;
}) {
  const palette = usePalette();
  const read = useRead(() => project.change(commit), commit);
  const [undoing, setUndoing] = useState(false);
  const [refused, setRefused] = useState<string | undefined>(undefined);
  const known = changeOf(space.project, commit);
  const offer = known === undefined ? undefined : undoOffer(known, guest);
  const undo = () => {
    setUndoing(true);
    setRefused(undefined);
    project.undo(commit).then(onDone, (error: unknown) => {
      setUndoing(false);
      setRefused(error instanceof Error ? error.message : String(error));
    });
  };
  const change = read.value;
  if (read.failed !== undefined) return <Said words={read.failed} failed />;
  if (change === undefined) return <Said words="Reading the change…" />;
  return (
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.head} testID="project-change-head">
        <Text style={[styles.message, { color: palette.ink }]}>
          {change.message.split("\n")[0] || "A change to the project"}
        </Text>
        <Text style={[styles.under, { color: palette.ink3 }]}>
          {changeUnder(change, known, directory)}
        </Text>
      </View>
      {offer === undefined ? null : (
        <Button
          label={undoing ? undoingWords(offer) : offer}
          busy={undoing}
          disabled={undoing}
          onPress={undo}
          testID="project-undo"
        />
      )}
      {refused === undefined ? null : <Said words={refused} failed />}
      {change.files.map((file) => (
        <FileDiff key={file.path} file={file} onFile={onFile} />
      ))}
    </SheetScroll>
  );
}

const undoingWords = (offer: "Undo" | "Put it back") =>
  offer === "Undo" ? "Undoing…" : "Putting it back…";

/** Who made a change, how many files, its lines, and that it was undone. */
function changeUnder(
  change: ProjectChangeAnswer,
  known: ProjectChange | undefined,
  directory: Directory,
): string {
  const by = change.by.id === undefined ? change.by.name : nameOf(directory, change.by.id);
  return [
    by,
    known === undefined ? undefined : filesChangedWords(known),
    linesWords(totals(change)),
    known?.undoneBy === undefined ? undefined : "Undone",
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

/** One file of a change: its path and lines, which open it where the page can, and its diff. */
function FileDiff({
  file,
  onFile,
}: {
  readonly file: ProjectChangeAnswer["files"][number];
  readonly onFile: ((path: string) => void) | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={styles.diff} testID={`project-diff-${file.path}`}>
      <Pressable
        accessibilityRole={onFile === undefined ? "text" : "button"}
        disabled={onFile === undefined}
        onPress={() => onFile?.(file.path)}
        style={({ pressed }) => [styles.path, pressed ? styles.pressed : null]}
      >
        <Text style={[styles.pathWords, { color: palette.ink }]} numberOfLines={1}>
          {file.path}
        </Text>
        <Text style={[styles.under, { color: palette.ink3 }]}>
          {file.added === null
            ? "binary"
            : linesWords({ added: file.added, removed: file.removed ?? 0 })}
        </Text>
      </Pressable>
      {file.patch === null ? null : <Diff patch={file.patch} />}
      {file.cut ? (
        <Text style={[styles.under, { color: palette.ink3 }]}>
          The rest of this change is too long to show here.
        </Text>
      ) : null}
    </View>
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
  const palette = usePalette();
  const on = useGround();
  const lines = patch
    .split("\n")
    .filter(
      (line) => !/^(diff --git|index |--- |\+\+\+ |new file mode|deleted file mode)/.test(line),
    );
  return (
    <View style={[styles.lines, { backgroundColor: on.fill }]}>
      <Text style={[styles.mono, { color: palette.ink2 }]}>
        {lines.map((line, at) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: a diff's lines are only ever drawn in order.
            key={at}
            style={
              line.startsWith("+")
                ? { color: palette.greenInk, backgroundColor: palette.greenSoft }
                : line.startsWith("-")
                  ? { color: palette.redInk, backgroundColor: palette.redSoft }
                  : line.startsWith("@@")
                    ? { color: palette.ink4 }
                    : null
            }
          >
            {`${line}\n`}
          </Text>
        ))}
      </Text>
    </View>
  );
}

/** Words where a page has nothing else yet: reading, or why it couldn't. */
function Said({ words, failed = false }: { readonly words: string; readonly failed?: boolean }) {
  const palette = usePalette();
  return (
    <Text
      style={[styles.said, { color: failed ? palette.red : palette.ink3 }]}
      testID={failed ? "project-failed" : undefined}
    >
      {words}
    </Text>
  );
}

/** A row on a project page: its mark, its name, what is under it, and the chevron. */
function Row({
  name,
  under,
  first,
  onPress,
  testID,
}: {
  readonly name: string;
  readonly under: string;
  readonly first: boolean;
  readonly onPress: () => void;
  readonly testID?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${under}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        first ? null : [styles.part, { borderTopColor: palette.line }],
        pressed ? { backgroundColor: palette.surface3 } : null,
      ]}
    >
      <View style={[styles.mark, { backgroundColor: palette.surface3 }]}>
        <Icon name="doc" size={16} color={palette.ink3} />
      </View>
      <View style={styles.words}>
        <Text style={[styles.name, { color: palette.ink }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
          {under}
        </Text>
      </View>
      <Icon name="next" size={18} color={palette.ink4} />
    </Pressable>
  );
}

function Card({ children }: { readonly children: ReactNode }) {
  const on = useGround();
  return <View style={[styles.card, { backgroundColor: on.fill }]}>{children}</View>;
}

/** The room sheet's Project page: Files and Changes, under one way back. */
export function ProjectPage({
  space,
  directory,
  project,
  onBack,
  onChange,
  onFile,
}: {
  readonly space: Space;
  readonly directory: Directory;
  readonly project: ProjectActions;
  readonly onBack: () => void;
  readonly onChange: (commit: string) => void;
  readonly onFile: (path: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  const [tab, setTab] = useState<"files" | "changes">("files");
  const changes = space.project?.changes ?? [];
  return (
    <View style={styles.page}>
      <PageBack title="Project" onBack={onBack} testID="room-sheet-project-back" />
      <View style={[styles.tabs, { backgroundColor: on.fill }]} accessibilityRole="tablist">
        {(["files", "changes"] as const).map((each) => (
          <Pressable
            key={each}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === each }}
            onPress={() => setTab(each)}
            testID={`project-tab-${each}`}
            style={[styles.tab, tab === each ? { backgroundColor: palette.surface3 } : null]}
          >
            <Text style={[styles.tabWords, { color: tab === each ? palette.ink : palette.ink3 }]}>
              {each === "files" ? "Files" : "Changes"}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "files" ? (
        <ProjectFiles project={project} space={space} onFile={onFile} />
      ) : changes.length === 0 ? (
        <Said words="No changes yet." />
      ) : (
        <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
          <Card>
            {changes.map((change, at) => {
              const row = changeRow(space.project ?? { files: 0, changes }, change, who(directory));
              return (
                <Row
                  key={change.commit}
                  name={row.title}
                  under={row.under}
                  first={at === 0}
                  onPress={() => onChange(change.commit)}
                  testID={`project-change-${change.commit.slice(0, 7)}`}
                />
              );
            })}
          </Card>
        </SheetScroll>
      )}
    </View>
  );
}

function ProjectFiles({
  project,
  space,
  onFile,
}: {
  readonly project: ProjectActions;
  readonly space: Space;
  readonly onFile: (path: string) => void;
}) {
  const palette = usePalette();
  const read = useRead(() => project.files(), space.id);
  if (read.failed !== undefined) return <Said words={read.failed} failed />;
  if (read.value === undefined) return <Said words="Reading the project…" />;
  const files = shownFiles(read.value.files);
  if (files.length === 0) return <Said words="No files yet." />;
  return (
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
      {filesByFolder(files).map(({ folder, files: inFolder }) => (
        <View key={folder} style={styles.folder}>
          {folder === "" ? null : (
            <Text style={[styles.folderName, { color: palette.ink3 }]}>{`${folder}/`}</Text>
          )}
          <Card>
            {inFolder.map((file, at) => (
              <Row
                key={file.path}
                name={fileNameOf(file.path)}
                under={bytesWords(file.bytes)}
                first={at === 0}
                onPress={() => onFile(file.path)}
                testID={`project-file-${file.path}`}
              />
            ))}
          </Card>
        </View>
      ))}
    </SheetScroll>
  );
}

/** A change on a page of the room sheet, under its way back. */
export function ChangePage(
  props: Parameters<typeof ChangeView>[0] & { readonly onBack: () => void },
) {
  return (
    <View style={styles.page}>
      <PageBack title="Change" onBack={props.onBack} testID="room-sheet-change-back" />
      <ChangeView {...props} />
    </View>
  );
}

/** One file: its words or its picture, and its history under it. */
export function ProjectFilePage({
  path,
  directory,
  project,
  onBack,
  onChange,
}: {
  readonly path: string;
  readonly directory: Directory;
  readonly project: ProjectActions;
  readonly onBack: () => void;
  readonly onChange: (commit: string) => void;
}) {
  const palette = usePalette();
  const read = useRead(() => project.file(path), path);
  const history = useRead(() => project.history(path), `${path}:history`);
  const versions = history.value?.versions ?? [];
  return (
    <View style={styles.page}>
      <PageBack title={fileNameOf(path)} onBack={onBack} testID="room-sheet-file-back" />
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Above the page's own words: under them, a long page left it out of sight. */}
        {read.value?.type === "text/html" ? <OpenPage path={path} project={project} /> : null}
        {read.failed !== undefined ? (
          <Said words={read.failed} failed />
        ) : read.value === undefined ? (
          <Said words="Reading the file…" />
        ) : (
          <FileBody path={path} file={read.value} />
        )}
        {versions.length === 0 ? null : (
          <View style={styles.folder}>
            <Text style={[styles.folderName, { color: palette.ink3 }]}>History</Text>
            <Card>
              {versions.map((version, at) => (
                <Row
                  key={version.commit}
                  name={version.message || "A change to the project"}
                  under={
                    version.by.id === undefined ? version.by.name : nameOf(directory, version.by.id)
                  }
                  first={at === 0}
                  onPress={() => onChange(version.commit)}
                />
              ))}
            </Card>
          </View>
        )}
      </SheetScroll>
    </View>
  );
}

/** A file as the phone can show it: its picture, its words, or that it can't. */
function FileBody({
  path,
  file,
}: {
  readonly path: string;
  readonly file: { readonly bytes: Uint8Array; readonly type: string };
}) {
  const palette = usePalette();
  const on = useGround();
  const { type } = file;
  if (type.startsWith("image/") && type !== "image/svg+xml") {
    return (
      <Image
        source={{ uri: `data:${type};base64,${toBase64(file.bytes)}` }}
        style={styles.picture}
        resizeMode="contain"
        accessibilityLabel={path}
      />
    );
  }
  if (type.startsWith("text/") || type === "application/json" || type === "image/svg+xml") {
    return (
      <View style={[styles.lines, { backgroundColor: on.fill }]}>
        <Text style={[styles.mono, { color: palette.ink }]} selectable testID="project-file-words">
          {new TextDecoder().decode(file.bytes)}
        </Text>
      </View>
    );
  }
  return <Said words="This file can't be shown here." />;
}

/**
 * Open page, for an HTML file of the project (ADR 0223): built on the server into one document with
 * what it names, and run in the page sheet under the page's policy, as a room's page is.
 */
function OpenPage({ path, project }: { readonly path: string; readonly project: ProjectActions }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button label="Open page" onPress={() => setOpen(true)} testID="project-open-page" />
      {open ? (
        <PageSheet
          page={{
            name: fileNameOf(path),
            mimeType: "text/html",
            read: (signal) => project.page(path, undefined, signal),
          }}
          version={path}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function bytesWords(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const styles = StyleSheet.create({
  // A page of the room sheet: its list gives, scrolling in what the sheet leaves it.
  page: { flexShrink: 1, minHeight: 0 },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0, marginTop: SPACE.sm },
  content: { gap: SPACE.md, paddingBottom: SPACE.xs },
  head: { gap: 2, paddingHorizontal: SPACE.xs },
  message: { fontSize: TEXT.body, fontWeight: "600" },
  under: { fontSize: TEXT.sm },
  said: { fontSize: TEXT.md, marginHorizontal: SPACE.xs, marginVertical: SPACE.sm },
  diff: { gap: SPACE.xs },
  path: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACE.sm,
    paddingHorizontal: SPACE.xs,
  },
  pathWords: { fontSize: TEXT.md, fontWeight: "600", flexShrink: 1 },
  pressed: { opacity: 0.6 },
  lines: { borderRadius: RADIUS.md, padding: SPACE.sm },
  mono: { fontFamily: "Menlo", fontSize: TEXT.xs, lineHeight: TEXT.xs * 1.5 },
  tabs: { flexDirection: "row", borderRadius: RADIUS.pill, padding: 3, marginTop: SPACE.sm },
  tab: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.pill,
  },
  tabWords: { fontSize: TEXT.md, fontWeight: "600" },
  folder: { gap: SPACE.xs },
  folderName: { fontSize: TEXT.sm, fontWeight: "600", marginHorizontal: SPACE.xs },
  card: { borderRadius: RADIUS.xl, overflow: "hidden" },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    minHeight: 58,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  words: { flex: 1, gap: 1 },
  name: { fontSize: TEXT.body, fontWeight: "500" },
  picture: { width: "100%", aspectRatio: 1, borderRadius: RADIUS.md },
});
