/**
 * A document of the room's project, open in the page dialog on the web and the Mac (ADRs 0223,
 * 0227): a page built into one document with what it names, Markdown made a page, a PDF in the
 * browser's own viewer, or a picture. A page's links to other files of the project open here too:
 * chipsd made them `chips-file:` links, and the few lines it added hand the path to this window,
 * which turns the dialog to that file. Nothing else a page says to the window is heard.
 *
 * In the Mac app a page has Open in browser beside the close (Arjun, 24 October 2026: "add a
 * button to open page in browser"): the room's folder, brought up to `main`, opens the file as
 * Finder would, in the Mac's browser, where it reloads and its links work as files.
 *
 * Over a page of a space with a program, the program's banner (`PageProgram`, ADR 0227's addendum
 * of 9 November 2026): Run and Stop, and the question a link to its address asks while it isn't
 * running.
 */

import { documentKind, fileNameOf, markdownPage, withHtmlPolicy } from "@chipschat/core";
import { PAGE_SANDBOX } from "@chipschat/protocol";
import { Button, Icon } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import type { FileService } from "../files.ts";
import { inkNow, PageDialog } from "../PageView.tsx";
import { PageProgram, type PageProgramProject } from "./PageProgram.tsx";
import { UniverseArrival } from "./UniverseMark.tsx";
import { useYes } from "./useYes.ts";

/** What the dialog reads of the project, and the program's banner over a page. */
export interface ProjectDocuments extends PageProgramProject {
  readonly file: (path: string) => Promise<{ readonly bytes: Uint8Array; readonly type: string }>;
  readonly page: (path: string) => Promise<string>;
  readonly pageUrl: (path: string) => Promise<string | undefined>;
  /** Open in browser, in the Mac app: why not, or nothing when it opened. */
  readonly browse?: ((path: string) => Promise<string | undefined>) | undefined;
  /** Whether Open in browser is this person's on this Mac (ADR 0231). */
  readonly onTheMac?: (() => Promise<boolean>) | undefined;
}

type Reading =
  | { readonly state: "opening" }
  /** A page loaded by the frame itself, from the Mac's door or the server's. */
  | { readonly state: "url"; readonly url: string }
  /** A page or Markdown written into the frame. */
  | { readonly state: "words"; readonly html: string; readonly markdown: boolean }
  /** A PDF or a picture, as an object URL. */
  | { readonly state: "bytes"; readonly url: string; readonly pdf: boolean }
  | { readonly state: "other" }
  | { readonly state: "failed"; readonly why: string };

/** Where a page is loaded from: the Mac's door, the server's, or its words where neither is. */
async function readPage(
  project: ProjectDocuments,
  files: FileService | undefined,
  path: string,
): Promise<Reading> {
  if (files !== undefined) {
    const held = await files.holdPage(await project.page(path));
    if (held !== undefined) return { state: "url", url: held };
  }
  const url = await project.pageUrl(path);
  if (url !== undefined) return { state: "url", url };
  return { state: "words", html: withHtmlPolicy(await project.page(path)), markdown: false };
}

async function readDocument(
  project: ProjectDocuments,
  files: FileService | undefined,
  path: string,
): Promise<Reading> {
  const kind = documentKind(path);
  if (kind === "page") return await readPage(project, files, path);
  if (kind === "markdown") {
    const { bytes } = await project.file(path);
    return {
      state: "words",
      html: markdownPage(new TextDecoder().decode(bytes), inkNow()),
      markdown: true,
    };
  }
  if (kind === "pdf" || kind === "picture") {
    const { bytes, type } = await project.file(path);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
    return { state: "bytes", url, pdf: kind === "pdf" };
  }
  return { state: "other" };
}

/** The path a frame's word names, when it is a `chips-file:` link's and inside the project. */
function fileOf(said: unknown): string | undefined {
  const path = (said as { chipsFile?: unknown } | null)?.chipsFile;
  if (typeof path !== "string" || path === "" || path.split("/").includes("..")) return undefined;
  return path;
}

export function ProjectDocument({
  path,
  project,
  files,
  onFile,
  onClose,
}: {
  readonly path: string;
  readonly project: ProjectDocuments;
  readonly files: FileService | undefined;
  /** A link on the page to another file of the project: the dialog turns to it. */
  readonly onFile: (path: string) => void;
  readonly onClose: () => void;
}) {
  const [reading, setReading] = useState<Reading>({ state: "opening" });
  // The frame has loaded its page, so it can be seen: until then the planets go round over it.
  const [loaded, setLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    let live = true;
    setReading({ state: "opening" });
    setLoaded(false);
    let made: string | undefined;
    readDocument(project, files, path).then(
      (next) => {
        if (next.state === "bytes") made = next.url;
        if (live) setReading(next);
        else if (made !== undefined) URL.revokeObjectURL(made);
      },
      (error: unknown) =>
        live &&
        setReading({
          state: "failed",
          why: error instanceof Error ? error.message : String(error),
        }),
    );
    return () => {
      live = false;
      if (made !== undefined) URL.revokeObjectURL(made);
    };
  }, [project, files, path]);
  // A tap on a link to another file of the project, said by this frame's page and no other.
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.source === null || event.source !== frame.current?.contentWindow) return;
      const file = fileOf(event.data);
      if (file !== undefined) onFile(file);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [onFile]);
  const name = fileNameOf(path);
  return (
    <PageDialog
      name={name}
      said={path}
      acts={<OpenInBrowser path={path} browse={project.browse} here={project.onTheMac} />}
      onClose={onClose}
    >
      {documentKind(path) === "page" && (
        <PageProgram project={project} frame={frame} loaded={loaded} />
      )}
      {(reading.state === "opening" || reading.state === "url" || reading.state === "words") && (
        <UniverseArrival ready={loaded} words="Opening…">
          {(reading.state === "url" || reading.state === "words") && (
            <iframe
              ref={frame}
              className="page-view-frame"
              style={
                reading.state === "words" && reading.markdown
                  ? { background: "var(--bg)" }
                  : undefined
              }
              {...(reading.state === "url" ? { src: reading.url } : { srcDoc: reading.html })}
              title={name}
              sandbox={PAGE_SANDBOX}
              referrerPolicy="no-referrer"
              onLoad={() => setLoaded(true)}
              data-testid="project-page-view"
            />
          )}
        </UniverseArrival>
      )}
      {reading.state === "failed" && (
        <p className="page-view-note" role="alert">
          It would not open: {reading.why}
        </p>
      )}
      {reading.state === "other" && (
        <p className="page-view-note">
          Chips can't show this kind of file. Open it from the project's folder on your Mac.
        </p>
      )}
      {reading.state === "bytes" &&
        (reading.pdf ? (
          <object
            className="page-view-frame"
            data={reading.url}
            type="application/pdf"
            aria-label={name}
            data-testid="project-document-pdf"
          >
            <p className="page-view-note">This window cannot show a PDF.</p>
          </object>
        ) : (
          <img
            className="page-view-picture"
            src={reading.url}
            alt={name}
            data-testid="project-document-picture"
          />
        ))}
    </PageDialog>
  );
}

/**
 * Open in browser: the page from the room's folder, in the Mac's browser; why not, if it can't.
 * Only for a page, and only where something can open one: nothing in a browser, and in the Mac
 * app only on the Mac where the workspace's server runs, for its owner (ADR 0231).
 */
function OpenInBrowser({
  path,
  browse,
  here,
}: {
  readonly path: string;
  readonly browse: ((path: string) => Promise<string | undefined>) | undefined;
  readonly here: (() => Promise<boolean>) | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | undefined>(undefined);
  const mine = useYes(here);
  if (browse === undefined || !mine || documentKind(path) !== "page") return null;
  return (
    <>
      {why !== undefined && (
        <span className="page-view-said" role="alert">
          {why}
        </span>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setWhy(undefined);
          browse(path)
            .then(setWhy, (error: unknown) =>
              setWhy(error instanceof Error ? error.message : String(error)),
            )
            .finally(() => setBusy(false));
        }}
        data-testid="project-document-browser"
      >
        <Icon name="globe" size={14} />
        {busy ? "Opening…" : "Open in browser"}
      </Button>
    </>
  );
}
