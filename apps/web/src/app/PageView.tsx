/**
 * A page a harness sent, opened on the Mac (ADR 0100, which brings ADR 0059's page to the desktop):
 * an HTML file from Files or from its card in the room, drawn over the room rather than downloaded.
 *
 * The page is somebody else's code, so it is an `iframe` sandboxed to scripts and windows, as on
 * the phone's web target: an origin that is nobody's, so it cannot read the app, its storage or
 * its key; no top navigation, so it cannot take the window; no forms, so it sends nothing
 * anywhere. It is loaded from the server's page door (ADR 0201), by a URL good once that a
 * signed ask minted, so the page's own policy comes as a header — core's `HTML_POLICY`, the one
 * the phone writes into the document — and its script runs, as a mock's is meant to. A frame
 * given the document itself would take the app's policy with it, which allows no inline script
 * (ADR 0100); that is still how the page is drawn where the door is out of reach — through a
 * tunnel, where a frame cannot follow the request, or from a server from before the door — and
 * there a mock is still, its words and pictures as they are, under the same policy written into
 * the document (`withHtmlPolicy`). Download hands over the whole file, as the room's card always
 * did.
 *
 * A Markdown file is made into a page as it opens (ADR 0123, core's `markdownPage`), in the
 * colours the app is drawn in at that moment, read off its own tokens, and at the size a document
 * is read at here rather than the size of the app's chrome.
 *
 * A PDF opens here too (ADR 0125), drawn by the browser's own viewer — pages, zoom, search — from
 * the object URL its card already drew the first page from, as an `<object>` the way that card
 * draws it. The server called it a PDF from its bytes, and the URL carries that type, so nothing
 * but the PDF viewer ever draws it. A PDF is not read into memory as text, so it has no size cap.
 *
 * A modal `<dialog>`: the keyboard stays in it, the room behind is inert, and Escape closes it.
 */

import {
  type Attachment,
  isMarkdown,
  isPage,
  isPdf,
  MAX_PAGE_BYTES,
  markdownPage,
  type PageInk,
  withHtmlPolicy,
} from "@chipschat/core";
import { PAGE_SANDBOX } from "@chipschat/protocol";
import { Button, Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FileService } from "./files.ts";
import { download } from "./viewer/actions.ts";

/**
 * Whether a file opens here rather than downloading: a PDF, or a page small enough to read whole
 * (a larger page is downloaded instead).
 */
export function opensInView(attachment: Attachment): boolean {
  if (isPdf(attachment.mimeType)) return true;
  return isPage(attachment.mimeType) && attachment.byteSize <= MAX_PAGE_BYTES;
}

/** A Markdown page's body size: `--text-lg`, a size to read a document at. */
const DOCUMENT_SIZE = 15;

/**
 * The app's palette as it is drawn now, from `tokens.css`: light or dark, chosen or the system's.
 * A token that cannot be read leaves its colour to the frame's own default.
 */
export function inkNow(): PageInk {
  const style = getComputedStyle(document.documentElement);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return {
    scheme: style.colorScheme === "dark" ? "dark" : "light",
    bg: token("--bg"),
    ink: token("--ink"),
    ink2: token("--ink-2"),
    line: token("--line"),
    line2: token("--line-2"),
    surface2: token("--surface-2"),
    blueInk: token("--blue-ink"),
    size: DOCUMENT_SIZE,
  };
}

type Reading =
  | { readonly state: "opening" }
  /** A Markdown file's source, a PDF's object URL, or an HTML page's words where the door is out of reach. */
  | { readonly state: "open"; readonly text: string }
  /** An HTML page's URL on the page door (ADR 0201), for the frame to load itself. */
  | { readonly state: "page"; readonly url: string }
  | { readonly state: "failed"; readonly why: string };

/**
 * What the view draws, asked for with the device's own signature: a PDF's object URL, a Markdown
 * file's source, or, for an HTML page, a URL on the page door — and the page's own words where
 * there is no door to be had.
 */
function useRead(
  files: FileService,
  attachmentId: string,
  kind: "pdf" | "markdown" | "html",
): Reading {
  const [reading, setReading] = useState<Reading>({ state: "opening" });
  useEffect(() => {
    let live = true;
    const read = async (): Promise<Reading> => {
      if (kind === "pdf") return { state: "open", text: await files.file(attachmentId) };
      if (kind === "html") {
        const url = await files.pageUrl(attachmentId);
        if (url !== undefined) return { state: "page", url };
      }
      return { state: "open", text: await files.page(attachmentId) };
    };
    read().then(
      (next) => {
        if (live) setReading(next);
      },
      (failure: unknown) => {
        const why = failure instanceof Error ? failure.message : String(failure);
        if (live) setReading({ state: "failed", why });
      },
    );
    return () => {
      live = false;
    };
  }, [files, attachmentId, kind]);
  return reading;
}

export function PageView({
  attachment,
  files,
  said,
  onClose,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
  /** Which version it is and who posted it, under the name: `v2 · by FreeOC · 11:47 PM`. */
  readonly said?: string | undefined;
  readonly onClose: () => void;
}) {
  return (
    <PageDialog
      name={attachment.filename}
      said={said}
      onClose={onClose}
      acts={
        <Button size="sm" onClick={() => void download(files, attachment)}>
          Download
        </Button>
      }
    >
      <Shown attachment={attachment} files={files} />
    </PageDialog>
  );
}

/**
 * The modal a page opens in: its name, what is said of it, its acts and Close over it, and the
 * page under. A room's file's page and a page of the room's project (ADR 0223) open in it alike.
 */
export function PageDialog({
  name,
  said,
  acts,
  onClose,
  children,
}: {
  readonly name: string;
  readonly said?: string | undefined;
  readonly acts?: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element !== null && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="page-view"
      aria-labelledby={titleId}
      data-testid="page-view-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="page-view-bar">
        <h2 id={titleId} className="page-view-name">
          {name}
        </h2>
        {said !== undefined && <span className="page-view-said">{said}</span>}
        <span className="page-view-acts">
          {acts}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </Button>
        </span>
      </header>
      {children}
    </dialog>,
    document.body,
  );
}

/** Which kind of document a file opens as: a PDF, a page made from Markdown, or an HTML page. */
function kindOf(mimeType: string): "pdf" | "markdown" | "html" {
  if (isPdf(mimeType)) return "pdf";
  return isMarkdown(mimeType) ? "markdown" : "html";
}

/** Where reading it has got to, while there is nothing to draw, or when there never will be. */
function Note({ reading }: { readonly reading: Reading }) {
  if (reading.state === "failed") {
    return (
      <p className="page-view-note" role="alert">
        It would not open: {reading.why}
      </p>
    );
  }
  return <p className="page-view-note">Opening…</p>;
}

/** What stands under the bar: the PDF, the page, or where reading it has got to. */
function Shown({
  attachment,
  files,
}: {
  readonly attachment: Attachment;
  readonly files: FileService;
}) {
  const kind = kindOf(attachment.mimeType);
  const markdown = kind === "markdown";
  const reading = useRead(files, attachment.id, kind);
  const html = useMemo(() => {
    if (reading.state !== "open" || kind === "pdf") return undefined;
    return markdown ? markdownPage(reading.text, inkNow()) : withHtmlPolicy(reading.text);
  }, [reading, markdown, kind]);
  if (reading.state === "opening" || reading.state === "failed") return <Note reading={reading} />;
  if (kind === "pdf" && reading.state === "open") {
    return (
      <object
        className="page-view-frame"
        data={reading.text}
        type="application/pdf"
        aria-label={attachment.filename}
        data-testid="page-view-pdf"
      >
        <p className="page-view-note">This window cannot show a PDF. Download it to read it.</p>
      </object>
    );
  }
  return (
    <iframe
      className="page-view-frame"
      // A page of Markdown has the app's ground, so the frame waits on it rather than on white.
      style={markdown ? { background: "var(--bg)" } : undefined}
      // Loaded from the page door where there is one (ADR 0201); given its document otherwise.
      {...(reading.state === "page" ? { src: reading.url } : { srcDoc: html })}
      title={attachment.filename}
      sandbox={PAGE_SANDBOX}
      referrerPolicy="no-referrer"
      data-testid="page-view"
    />
  );
}
