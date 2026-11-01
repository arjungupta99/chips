/**
 * Universe on the phone (ADR 0227): what the space made, from the icon at the room's top right, in
 * a sheet with two tabs.
 *
 * - **Phone** has the space's documents, here: the start page the agents keep, or its one
 *   document, loaded in the tab; a picture drawn; any other document one row that opens in Quick
 *   Look; several with no start page, listed. A link on a page to another file of the project
 *   opens that file over the sheet. A program never opens on the phone, and the tab says so.
 * - **Desktop** is what happens on the person's Mac, as one list (the ADR's second addendum): the
 *   program, which runs on the Mac and never in Chips (ADR 0226's bar), the page, which Chips for
 *   Mac opens in its own window, and the folder, in Finder (ADR 0225).
 *
 * What the space has is core's `readUniverse`, read again as the project moves on.
 */

import {
  documentKind,
  fileNameOf,
  folderOnMacWords,
  MAC_ROWS,
  type MacsHeard,
  markdownPage,
  mayUseMac,
  noStartPageWords,
  PROGRAMS_ON_MAC,
  PROGRAMS_ON_OWNERS_MAC,
  pageOnMacWords,
  pageRowWords,
  readUniverse,
  type Space,
  type Store,
  type Universe,
  withHtmlPolicy,
} from "@chipschat/core";
import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { toBase64 } from "../runtime/base64";
import { Arrival } from "../ui/Arrival";
import { Button } from "../ui/Button";
import { useGround } from "../ui/ground";
import { Opens } from "../ui/growing";
import { Icon } from "../ui/Icon";
import { Segmented } from "../ui/Segmented";
import { Sheet, SheetScroll } from "../ui/Sheet";
import { CLOSE_ROOM } from "../ui/SheetClose";
import { usePalette, useScheme } from "../ui/theme";
import { RADIUS, SPACE, TEXT } from "../ui/tokens";
import { UniverseMark, UniverseReading } from "../ui/UniverseMark";
import { previewBytes } from "./local";
import { Moves } from "./MacMotion";
import { MacRow, RowButton, RowMark } from "./MacRow";
import { PageSheet } from "./PageSheet";
import { PAGE_WAITS_MS } from "./pages";
import { type ProjectActions, projectActions } from "./RoomProject";
import { PhoneRun } from "./RunBar";

// Required only once a page is drawn, for the reason `pages.ts` gives.
const PageView = lazy(async () => ({
  default: (require("./PageView") as typeof import("./PageView")).PageView,
}));

type Tab = "phone" | "desktop";

/**
 * A read the sheet waits on, made while it is up and again when what it reads changes. The sheet
 * closing gives it up, so a page still coming through the relay stops (ADR 0153's addendum), and
 * one that came is not read again when the sheet opens on the same thing.
 */
function useRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  key: string,
  live: boolean,
): { readonly value?: T; readonly failed?: string } {
  const [state, setState] = useState<{ key?: string; value?: T; failed?: string }>({});
  const has = state.key === key && state.value !== undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again only when what it reads changes.
  useEffect(() => {
    if (!live || has) return;
    const reading = new AbortController();
    read(reading.signal).then(
      (value) => {
        if (!reading.signal.aborted) setState({ key, value });
      },
      (error: unknown) => {
        if (reading.signal.aborted) return;
        setState({ key, failed: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => reading.abort();
  }, [key, live, has]);
  return state;
}

export function UniverseSheet({
  store,
  space,
  selfId,
  title,
  open,
  onClose,
}: {
  readonly store: Store;
  /** The room; Universe is only for one with a project. */
  readonly space: Space | undefined;
  /** Who reads it: Desktop is an owner's (ADR 0231). */
  readonly selfId: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  if (space?.project === undefined) return null;
  return (
    <UniverseOf
      store={store}
      space={space}
      selfId={selfId}
      title={title}
      open={open}
      onClose={onClose}
    />
  );
}

function UniverseOf({
  store,
  space,
  selfId,
  title,
  open,
  onClose,
}: {
  readonly store: Store;
  readonly space: Space;
  readonly selfId: string;
  readonly title: string;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { tab, setTab, toDesktop } = useWhere(store, selfId);
  const project = useMemo(() => projectActions(store, space.id, selfId), [store, space.id, selfId]);
  const head = space.project?.changes[0]?.commit ?? "";
  const read = useRead(() => readUniverse(store, space.id), `${space.id}:${head}`, open);
  // A document opened from the page or the list: a page or Markdown over the sheet, anything else
  // in Quick Look.
  const [paged, setPaged] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const openFile = (path: string) => {
    setFailed(undefined);
    const kind = documentKind(path);
    if (kind === "page" || kind === "markdown") {
      setPaged(path);
      return;
    }
    project
      .file(path)
      .then(({ bytes, type }) => previewBytes(bytes, fileNameOf(path), type))
      .catch((error: unknown) => setFailed(error instanceof Error ? error.message : String(error)));
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      onGone={() => {
        setTab("phone");
        setPaged(undefined);
        setFailed(undefined);
      }}
      sizing="full"
      testID="universe-sheet"
    >
      <View style={styles.sheet}>
        <Head title={title} />
        <WhereTabs tab={tab} onTab={toDesktop === undefined ? undefined : setTab} />
        {failed === undefined ? null : <Said words={failed} failed />}
        {read.failed !== undefined ? (
          <Said words={read.failed} failed />
        ) : (
          <Arrival
            ready={read.value !== undefined}
            waiting={<UniverseReading words="Reading the space…" />}
          >
            {read.value === undefined ? null : tab === "phone" ? (
              <PhoneTab
                universe={read.value}
                project={project}
                live={open}
                onFile={openFile}
                onDesktop={toDesktop}
              />
            ) : (
              <DesktopTab universe={read.value} project={project} />
            )}
          </Arrival>
        )}
      </View>
      {paged === undefined ? null : (
        <PageSheet
          key={paged}
          page={pageOf(paged, project)}
          onFile={openFile}
          onClose={() => setPaged(undefined)}
        />
      )}
    </Sheet>
  );
}

/** A page or Markdown of the project, as the page sheet opens it. */
function pageOf(path: string, project: ProjectActions) {
  const markdown = documentKind(path) === "markdown";
  return {
    name: fileNameOf(path),
    mimeType: markdown ? "text/markdown" : "text/html",
    read: textOf(path, project, markdown),
  };
}

/** A page built into one document, or Markdown's own words: what a view of it draws from. */
function textOf(path: string, project: ProjectActions, markdown: boolean) {
  return async (signal: AbortSignal) =>
    markdown
      ? new TextDecoder().decode((await project.file(path, undefined, signal)).bytes)
      : await project.page(path, undefined, signal);
}

/** Universe, with the space's name under it, clear of the sheet's X. */
function Head({ title }: { readonly title: string }) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={styles.head}>
      <View style={[styles.mark, { backgroundColor: on.fill }]}>
        <UniverseMark size={22} ink={palette.ink} ground={on.fill} />
      </View>
      <View style={styles.named}>
        <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
          Universe
        </Text>
        <Text numberOfLines={1} style={[styles.under, { color: palette.ink3 }]}>
          {title}
        </Text>
      </View>
    </View>
  );
}

/** Words where the tab has nothing else: reading, nothing yet, or why it couldn't. */
function Said({ words, failed = false }: { readonly words: string; readonly failed?: boolean }) {
  const palette = usePalette();
  return (
    <Text
      style={[styles.said, { color: failed ? palette.red : palette.ink3 }]}
      testID={failed ? "universe-failed" : "universe-said"}
    >
      {words}
    </Text>
  );
}

/**
 * Phone or Desktop, and Desktop only for an owner (ADR 0231): Run and Open on the Mac are theirs,
 * so nobody else is shown it at all.
 */
function useWhere(store: Store, selfId: string) {
  const [chosen, setTab] = useState<Tab>("phone");
  const mac = useSyncExternalStore(store.subscribe, () =>
    mayUseMac(store.getSnapshot().model, selfId),
  );
  return {
    tab: mac ? chosen : ("phone" as Tab),
    setTab,
    toDesktop: mac ? () => setTab("desktop") : undefined,
  };
}

/** The two tabs, where there is a Desktop to choose; nothing where there isn't. */
function WhereTabs({
  tab,
  onTab,
}: {
  readonly tab: Tab;
  readonly onTab: ((tab: Tab) => void) | undefined;
}) {
  if (onTab === undefined) return null;
  return (
    <View style={styles.tabs}>
      <Segmented
        label="Where it opens"
        options={[
          { value: "phone", label: "Phone" },
          { value: "desktop", label: "Desktop" },
        ]}
        chosen={tab}
        onChoose={(value) => onTab(value === "desktop" ? "desktop" : "phone")}
        testID="universe-tabs"
      />
    </View>
  );
}

/** The documents, here; or that the program runs on the Mac. */
function PhoneTab({
  universe,
  project,
  live,
  onFile,
  onDesktop,
}: {
  readonly universe: Universe;
  readonly project: ProjectActions;
  /** The sheet is up: its document is read, and given up on when it closes. */
  readonly live: boolean;
  readonly onFile: (path: string) => void;
  /** Desktop, for an owner; nobody else has it (ADR 0231). */
  readonly onDesktop: (() => void) | undefined;
}) {
  const { documents } = universe;
  if (documents !== undefined && "start" in documents) {
    return <Start path={documents.start} project={project} live={live} onFile={onFile} />;
  }
  if (documents !== undefined) {
    return (
      <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
        <Said words={noStartPageWords(documents.list.length)} />
        <Rows paths={documents.list} onFile={onFile} />
      </SheetScroll>
    );
  }
  if (universe.program !== undefined) return <ProgramsOnMac onDesktop={onDesktop} />;
  return <Said words="Nothing here opens on the phone yet." />;
}

/** The start page, or the one document, as the phone draws it. */
function Start({
  path,
  project,
  live,
  onFile,
}: {
  readonly path: string;
  readonly project: ProjectActions;
  readonly live: boolean;
  readonly onFile: (path: string) => void;
}) {
  const kind = documentKind(path);
  if (kind === "page" || kind === "markdown") {
    return (
      <Drawn
        path={path}
        project={project}
        live={live}
        onFile={onFile}
        markdown={kind === "markdown"}
      />
    );
  }
  if (kind === "picture") return <Picture path={path} project={project} live={live} />;
  return (
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
      <Rows paths={[path]} onFile={onFile} />
    </SheetScroll>
  );
}

/** A page of the project, or Markdown made a page, loaded in the tab; its links open in Chips. */
function Drawn({
  path,
  project,
  live,
  onFile,
  markdown,
}: {
  readonly path: string;
  readonly project: ProjectActions;
  readonly live: boolean;
  readonly onFile: (path: string) => void;
  readonly markdown: boolean;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const read = useRead(textOf(path, project, markdown), path, live);
  const [drawn, setDrawn] = useState(false);
  const [failed, setFailed] = useState<string | undefined>(undefined);
  const html = useMemo(() => {
    if (read.value === undefined) return undefined;
    return markdown
      ? markdownPage(read.value, { ...palette, scheme, size: TEXT.body })
      : withHtmlPolicy(read.value);
  }, [read.value, markdown, palette, scheme]);
  // Seen once it says it has loaded, or after a while if it never does, as the page sheet's is.
  useEffect(() => {
    if (html === undefined || drawn) return;
    const waited = setTimeout(() => setDrawn(true), PAGE_WAITS_MS);
    return () => clearTimeout(waited);
  }, [html, drawn]);
  const why = read.failed ?? failed;
  if (why !== undefined) return <Said words={why} failed />;
  return (
    <View style={[styles.page, { borderColor: palette.line }]} testID="universe-page">
      <Arrival ready={drawn} waiting={<UniverseReading words="Opening…" />}>
        {html === undefined ? null : (
          <Suspense fallback={null}>
            <PageView
              html={html}
              title={fileNameOf(path)}
              ground={markdown ? palette.bg : undefined}
              onReady={() => setDrawn(true)}
              onFailed={setFailed}
              onFile={onFile}
            />
          </Suspense>
        )}
      </Arrival>
    </View>
  );
}

/** The one document, a picture: drawn in the tab. */
function Picture({
  path,
  project,
  live,
}: {
  readonly path: string;
  readonly project: ProjectActions;
  readonly live: boolean;
}) {
  const read = useRead((signal) => project.file(path, undefined, signal), path, live);
  if (read.failed !== undefined) return <Said words={read.failed} failed />;
  return (
    <Arrival ready={read.value !== undefined} waiting={<UniverseReading words="Opening…" />}>
      {read.value === undefined ? null : (
        <Image
          source={{ uri: `data:${read.value.type};base64,${toBase64(read.value.bytes)}` }}
          style={styles.picture}
          resizeMode="contain"
          accessibilityLabel={fileNameOf(path)}
          testID="universe-picture"
        />
      )}
    </Arrival>
  );
}

/** Documents as rows, each opening in Chips. */
function Rows({
  paths,
  onFile,
}: {
  readonly paths: readonly string[];
  readonly onFile: (path: string) => void;
}) {
  const palette = usePalette();
  const on = useGround();
  return (
    <View style={[styles.card, { backgroundColor: on.fill }]}>
      {paths.map((path, at) => (
        <Pressable
          key={path}
          accessibilityRole="button"
          accessibilityLabel={`Open ${fileNameOf(path)}`}
          onPress={() => onFile(path)}
          testID={`universe-document-${path}`}
          style={({ pressed }) => [
            styles.row,
            at === 0 ? null : [styles.part, { borderTopColor: palette.line }],
            pressed ? { backgroundColor: palette.surface3 } : null,
          ]}
        >
          <View style={[styles.rowMark, { backgroundColor: palette.surface3 }]}>
            <Icon name="doc" size={16} color={palette.ink3} />
          </View>
          <View style={styles.rowWords}>
            <Text style={[styles.rowName, { color: palette.ink }]} numberOfLines={1}>
              {fileNameOf(path)}
            </Text>
            {path.includes("/") ? (
              <Text style={[styles.under, { color: palette.ink3 }]} numberOfLines={1}>
                {path.slice(0, path.lastIndexOf("/"))}
              </Text>
            ) : null}
          </View>
          <Icon name="next" size={18} color={palette.ink4} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * A program's space on the phone: it runs on the Mac, never here. An owner is pointed to Desktop;
 * anybody else is told it runs on the owner's Mac (ADR 0231).
 */
function ProgramsOnMac({ onDesktop }: { readonly onDesktop: (() => void) | undefined }) {
  const palette = usePalette();
  const on = useGround();
  const words = onDesktop === undefined ? PROGRAMS_ON_OWNERS_MAC : PROGRAMS_ON_MAC;
  return (
    <View style={[styles.programs, { backgroundColor: on.fill }]} testID="universe-programs-here">
      <View style={[styles.mark, { backgroundColor: palette.surface3 }]}>
        <UniverseMark size={24} ink={palette.ink} ground={palette.surface3} />
      </View>
      <Text style={[styles.programsTitle, { color: palette.ink }]}>{words.title}</Text>
      <Text style={[styles.programsBody, { color: palette.ink3 }]}>{words.body}</Text>
      {onDesktop === undefined ? null : (
        <Button label="Go to Desktop" onPress={onDesktop} testID="universe-to-desktop" />
      )}
    </View>
  );
}

/** What a press from the phone said came of it: heard, or no Mac open. */
type Heard = { readonly words: string; readonly heard: boolean } | undefined;

/**
 * What happens on the person's Mac, as one list (ADR 0227's second addendum): the program, the
 * page, the folder, each a row with its button at the right, and once under them that they happen
 * on the Mac. What a list opens with is there; what opens in it after, opens.
 */
function DesktopTab({
  universe,
  project,
}: {
  readonly universe: Universe;
  readonly project: ProjectActions;
}) {
  const palette = usePalette();
  const on = useGround();
  const { documents, program, why } = universe;
  const runs = program !== undefined || why !== undefined;
  return (
    <SheetScroll style={styles.scroll} contentContainerStyle={styles.content}>
      {documents === undefined && !runs ? (
        <Said words="Nothing here opens on your Mac yet." />
      ) : null}
      <Opens>
        <Moves style={[styles.card, { backgroundColor: on.fill }]}>
          {runs ? <PhoneRun runs={project.runs} recipe={program ?? { why: why ?? "" }} /> : null}
          {documents === undefined ? null : (
            <PageRow documents={documents} project={project} parted={runs} />
          )}
          <AskMac
            icon="folder"
            title={MAC_ROWS.folder.title}
            body={MAC_ROWS.folder.body}
            label="Open folder in Mac"
            tone="blue"
            ask={project.openOnMac}
            say={folderOnMacWords}
            parted={runs || documents !== undefined}
            testID="universe-open-folder"
          />
        </Moves>
        <Moves>
          <Text style={[styles.under, styles.note, { color: palette.ink3 }]}>{MAC_ROWS.under}</Text>
        </Moves>
      </Opens>
    </SheetScroll>
  );
}

/** The page's row: Open page, or why there's nothing to open yet. */
function PageRow({
  documents,
  project,
  parted,
}: {
  readonly documents: NonNullable<Universe["documents"]>;
  readonly project: ProjectActions;
  readonly parted: boolean;
}) {
  if (!("start" in documents)) {
    return (
      <MacRow
        mark={<RowMark kind="quiet" icon="doc" />}
        title={MAC_ROWS.documents}
        body={noStartPageWords(documents.list.length)}
        bodyKey="none"
        actionKey="none"
        parted={parted}
      />
    );
  }
  const words = pageRowWords(documents.start);
  return (
    <AskMac
      icon="doc"
      title={words.title}
      body={words.body}
      label="Open page"
      tone="gold"
      ask={project.openPageOnMac}
      say={pageOnMacWords}
      parted={parted}
      testID="universe-open-page"
    />
  );
}

/** A row whose button asks the person's Mac, and whose words become what came of it. */
function AskMac({
  icon,
  title,
  body,
  label,
  tone,
  ask,
  say,
  parted,
  testID,
}: {
  readonly icon: "folder" | "doc";
  readonly title: string;
  /** What it opens, until it has been pressed. */
  readonly body: string;
  /** The whole of what the button does: "Open folder in Mac". */
  readonly label: string;
  /** Gold for the page, as Run is; the blue tint for the folder. */
  readonly tone: "gold" | "blue";
  /** The ask to the person's Macs, and what it came to. */
  readonly ask: () => Promise<MacsHeard>;
  /** The words for what it came to: "Sent to your Mac…" when a Mac heard it. */
  readonly say: (heard: MacsHeard) => string;
  readonly parted: boolean;
  readonly testID: string;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Heard>(undefined);
  const press = async () => {
    setBusy(true);
    try {
      const heard = await ask();
      setSaid({ words: say(heard), heard: heard.macs > 0 });
    } catch (error) {
      setSaid({ words: error instanceof Error ? error.message : String(error), heard: false });
    } finally {
      setBusy(false);
    }
  };
  return (
    <MacRow
      mark={<RowMark kind="plain" icon={icon} />}
      title={title}
      body={said?.words ?? body}
      bodyKey={said?.words ?? body}
      voice={said === undefined ? "plain" : said.heard ? "heard" : "bad"}
      bodyTestID={said === undefined ? undefined : `${testID}-said`}
      action={
        <RowButton
          label="Open"
          busy={busy}
          onPress={() => void press()}
          tone={tone}
          accessibilityLabel={label}
          testID={testID}
        />
      }
      actionKey="open"
      parted={parted}
    />
  );
}

const styles = StyleSheet.create({
  // The whole height the sheet gives, the page below the tabs taking what is left.
  sheet: { flex: 1, minHeight: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingRight: CLOSE_ROOM,
    paddingBottom: SPACE.sm,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  named: { flex: 1, minWidth: 0 },
  title: { fontSize: TEXT.lg, fontWeight: "700" },
  under: { fontSize: TEXT.sm },
  tabs: { paddingVertical: SPACE.sm },
  said: { fontSize: TEXT.md, marginHorizontal: SPACE.xs, marginVertical: SPACE.sm },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  content: { gap: SPACE.md, paddingBottom: SPACE.lg },
  page: {
    flex: 1,
    minHeight: 0,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  picture: { flex: 1, minHeight: 200 },
  card: { borderRadius: RADIUS.lg, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  part: { borderTopWidth: StyleSheet.hairlineWidth },
  rowMark: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
  },
  rowWords: { flex: 1, minWidth: 0 },
  rowName: { fontSize: TEXT.md, fontWeight: "600" },
  programs: {
    alignItems: "center",
    gap: SPACE.sm,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
  },
  programsTitle: { fontSize: TEXT.body, fontWeight: "700", textAlign: "center" },
  programsBody: { fontSize: TEXT.sm, lineHeight: 19, textAlign: "center" },
  // The line under the Desktop tab's list, on its words' edge.
  note: { lineHeight: 18, marginHorizontal: SPACE.xs },
});
