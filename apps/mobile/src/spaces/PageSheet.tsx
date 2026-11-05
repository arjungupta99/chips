/**
 * An HTML file, open over the room (ADR 0059): a bar with Done, the file's name and Share, and the
 * page under it, drawn where it can reach nothing of the app's (`PageView`). Share is the share
 * sheet the row used to open straight away, for Save to Files and the other apps. The back
 * gesture closes it, as Done does.
 *
 * The page is read once from the copy the phone keeps (`files.ts`), or from the room's project.
 * Until it has been read the sheet says so, and for a page of the project Universe's planets go
 * round as they do while Universe reads (ADR 0227); if it cannot be read, or the view gives up on
 * it, the sheet says why and Share is still there. Closed before its page came, the sheet gives up
 * on the read, so a server through the relay sends no more of a page nobody is waiting for. A
 * Markdown file is made into a page as it is drawn (ADR 0123, core's `markdownPage`), in the
 * palette the app is showing, so it follows light and dark as they change.
 * An HTML file is drawn as it came, under a policy of its own (`withHtmlPolicy`, ADR 0059's
 * addendum): its script runs, and nothing leaves.
 *
 * The view is held back until it has a document to draw (Arjun, 20 September 2026: "it opens with a
 * white background that then suddenly brings the content into view"). A web view's canvas is white
 * from the moment it is mounted, so mounting it as soon as the file was read put a white sheet of
 * paper on the glass a beat before anything was written on it. *Opening…* stands over it until it
 * says it has loaded — or, if it never does, until `PAGE_WAITS_MS`, since a page that will not
 * announce itself is better seen than waited for — and then gives way to it as the page arrives
 * (`Arrival`, 24 October 2026: "the content showing after loading is very abrupt").
 *
 * Done and Share keep a press while the page coasts (Arjun, 10 October 2026: Done was "untappable
 * 'while' the view is scrolling"). The sheet is a `Modal` opened from a row in the room, so in
 * React's tree it still sits inside the room's list: a finger on Done tells that list it is being
 * touched, every scroll the coasting page reports asks the list whether it wants the finger, and
 * it does. A press gives way to a scroll that asks unless it is not `cancelable`.
 *
 * On an iPad it covers the window, which is how Universe's Full screen opens a page, and Esc on its
 * keys closes it as Done does.
 */

import { type Attachment, isMarkdown, markdownPage, withHtmlPolicy } from "@chipschat/core";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Arrival } from "../ui/Arrival";
import { IconButton } from "../ui/Button";
import { useEscape } from "../ui/menuBar";
import { usePalette, useScheme } from "../ui/theme";
import { SPACE, TEXT } from "../ui/tokens";
import { UniverseReading } from "../ui/UniverseMark";
import type { FileService } from "./files";
import { PAGE_WAITS_MS } from "./pages";

// Required only once a page is opened, for the reason `pages.ts` gives.
const PageView = lazy(async () => ({
  default: (require("./PageView") as typeof import("./PageView")).PageView,
}));

type Read =
  | { readonly state: "reading" }
  | { readonly state: "read"; readonly text: string }
  | { readonly state: "failed"; readonly why: string };

/** A page the sheet opens: its name and type, how its words are read, and Share where it has one. */
export interface PageSource {
  readonly name: string;
  readonly mimeType: string;
  /** Its words; `signal` is the sheet closing before they came. */
  readonly read: (signal: AbortSignal) => Promise<string>;
  /** Share or open it elsewhere; absent, the bar has no Share. */
  readonly share?: (() => Promise<void>) | undefined;
}

/** A file the room carries, as the sheet opens it: from the copy the phone keeps. */
function attachmentPage(attachment: Attachment, files: FileService): PageSource {
  return {
    name: attachment.filename,
    mimeType: attachment.mimeType,
    read: () => files.page(attachment),
    share: () => files.open(attachment),
  };
}

export function PageSheet(
  props: (
    | { readonly attachment: Attachment; readonly files: FileService }
    /** A page from somewhere else: one of the room's project, built into one document (ADR 0223). */
    | { readonly page: PageSource }
  ) & {
    /** Which version it is and who posted it, under the name (ADR 0100): `v2 · by FreeOC · 11:47 PM`. */
    readonly version?: string | undefined;
    /** A tapped link to a file of the room's project (ADR 0227). */
    readonly onFile?: ((path: string) => void) | undefined;
    readonly onClose: () => void;
  },
) {
  const { version, onClose, onFile } = props;
  const project = "page" in props;
  const source = project ? props.page : attachmentPage(props.attachment, props.files);
  // The source is read once for the sheet's life, as the attachment it was made from was.
  const [page] = useState(source);
  return (
    <PageSheetOf page={page} orbit={project} version={version} onFile={onFile} onClose={onClose} />
  );
}

function PageSheetOf({
  page,
  orbit,
  version,
  onFile,
  onClose,
}: {
  readonly page: PageSource;
  /** A page of the room's project: Universe's planets go round while it opens. */
  readonly orbit: boolean;
  readonly version?: string | undefined;
  readonly onFile?: ((path: string) => void) | undefined;
  readonly onClose: () => void;
}) {
  const palette = usePalette();
  const scheme = useScheme();
  const insets = useSafeAreaInsets();
  useEscape(true, onClose);
  const [read, setRead] = useState<Read>({ state: "reading" });
  const markdown = isMarkdown(page.mimeType);
  const html = useMemo(() => {
    if (read.state !== "read") return undefined;
    // An HTML file under the policy of its own (ADR 0059's addendum, SEC-7): its own script runs,
    // and nothing is fetched or sent, not even a picture from elsewhere.
    if (!markdown) return withHtmlPolicy(read.text);
    return markdownPage(read.text, { ...palette, scheme, size: TEXT.body });
  }, [read, markdown, palette, scheme]);
  const [sharing, setSharing] = useState<string | undefined>(undefined);
  const [drawn, setDrawn] = useState(false);
  const draw = useCallback(() => setDrawn(true), []);

  useEffect(() => {
    if (read.state !== "read" || drawn) return;
    const waited = setTimeout(draw, PAGE_WAITS_MS);
    return () => clearTimeout(waited);
  }, [read.state, drawn, draw]);

  useEffect(() => {
    const reading = new AbortController();
    page.read(reading.signal).then(
      (text) => {
        if (!reading.signal.aborted) setRead({ state: "read", text });
      },
      (failure: unknown) => {
        if (!reading.signal.aborted) setRead({ state: "failed", why: messageOf(failure) });
      },
    );
    return () => reading.abort();
  }, [page]);

  const share = () => {
    setSharing(undefined);
    page.share?.().catch((failure: unknown) => setSharing(messageOf(failure)));
  };

  const said = (words: string, failed: boolean) => (
    <View style={styles.middle}>
      <Text
        style={[styles.said, { color: failed ? palette.red : palette.ink3 }]}
        testID={failed ? "page-failed" : "page-reading"}
      >
        {words}
      </Text>
    </View>
  );

  return (
    <Modal
      visible
      animationType="slide"
      supportedOrientations={["portrait", "landscape"]}
      onRequestClose={onClose}
      testID="page-sheet"
    >
      <View style={[styles.sheet, { backgroundColor: palette.bg }]}>
        <View
          style={[styles.bar, { paddingTop: insets.top + SPACE.xs, borderColor: palette.line }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close the page"
            onPress={onClose}
            cancelable={false}
            hitSlop={SPACE.sm}
            testID="page-done"
          >
            <Text style={[styles.done, { color: palette.blueInk }]}>Done</Text>
          </Pressable>
          <View style={styles.named}>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.title, { color: palette.ink }]}
            >
              {page.name}
            </Text>
            {version === undefined ? null : (
              <Text numberOfLines={1} style={[styles.version, { color: palette.ink3 }]}>
                {version}
              </Text>
            )}
          </View>
          {page.share === undefined ? (
            <View style={styles.noShare} />
          ) : (
            <IconButton
              icon="share"
              label={`Share ${page.name}`}
              tone="quiet"
              onPress={share}
              cancelable={false}
              testID="page-share"
            />
          )}
        </View>
        {sharing === undefined ? null : (
          <Text style={[styles.note, { color: palette.red }]}>{sharing}</Text>
        )}
        <View style={[styles.page, { paddingBottom: insets.bottom }]}>
          {read.state === "failed" ? (
            said(read.why, true)
          ) : (
            <Arrival
              ready={drawn}
              waiting={orbit ? <UniverseReading words="Opening…" /> : said("Opening…", false)}
            >
              {html === undefined ? null : (
                <Suspense fallback={null}>
                  <PageView
                    html={html}
                    title={page.name}
                    ground={markdown ? palette.bg : undefined}
                    onReady={draw}
                    onFailed={(why) => setRead({ state: "failed", why })}
                    onFile={onFile}
                  />
                </Suspense>
              )}
            </Arrival>
          )}
        </View>
      </View>
    </Modal>
  );
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingBottom: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  done: { fontSize: TEXT.md, fontWeight: "600" },
  // Where Share stands, kept so the name stays in the middle of the bar.
  noShare: { width: 44 },
  named: { flex: 1, alignItems: "center" },
  title: { fontSize: TEXT.md, fontWeight: "600", textAlign: "center" },
  version: { fontSize: TEXT.sm, textAlign: "center" },
  note: { fontSize: TEXT.sm, paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },
  page: { flex: 1 },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACE.xl },
  said: { fontSize: TEXT.md, textAlign: "center" },
});
