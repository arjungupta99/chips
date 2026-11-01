/**
 * Files, from the phone's side of decision 10. An upload goes through the device's signature
 * (core's `uploadFile`, the same call the desktop makes), a piece at a time from the file where
 * the picker left it, and goes on from where it got to when the connection drops (ADR 0052); a thumbnail or a file comes back as
 * bytes and is kept on the phone, so an `<Image>` has a URI to draw and the share sheet a file to
 * hand on. Kept once per attachment, and looked for on the phone before it is fetched (ADR 0161):
 * a room redrawn fifty times fetches each thumbnail once, and a room opened tomorrow, in a new
 * process, fetches none it drew today.
 *
 * A video can also be streamed (ADR 0058): on the server's network the phone asks for a grant and
 * hands its URL to the player, which asks for the runs it needs as it plays, and nothing is kept.
 * Through the relay there is no URL a player can follow, and the video is fetched as before.
 *
 * Injected into the screens, so a test hands them a fake instead of a socket and a key.
 */

import {
  type Attachment,
  type Device,
  fetchAttachmentBytes,
  fetchAttachmentWithType,
  grantAttachment,
  kindOf,
  UploadError,
  uploadFile,
} from "@chipschat/core";
import {
  findKept,
  keepLocally,
  keptClearings,
  keptLetGo,
  openLocally,
  openSource,
  previewLocally,
  readText,
} from "./local";
import { MAX_PAGE_BYTES } from "./page";
import type { Picked } from "./pick";

/** How much of a download has come, and how many bytes there are when the server said. */
export type Progress = (received: number, total: number | undefined) => void;

/** What the viewer plays a video from. */
export interface Played {
  readonly uri: string;
  /** The file as it was sent is what plays, while the copy that plays everywhere is being made. */
  readonly beingMade: boolean;
  /** A grant's URL on the server, streamed as it plays, rather than a file kept on the phone. */
  readonly streamed?: boolean | undefined;
}

/** A grant is used again only while it has longer than this to run; nearer its end, another is asked for. */
const GRANT_SPARE_MS = 60_000;

/** What the viewer draws for a photo: a URI, and whether it is the file as it was sent. */
export interface Viewed {
  readonly uri: string;
  /** The file itself, not a copy made for viewing: nothing larger to open, and soft when zoomed far. */
  readonly original: boolean;
}

export interface FileService {
  /**
   * Upload one picked file, saying how many bytes are in as they arrive. A photo's location is
   * stripped, as the server does by default.
   */
  readonly upload: (
    picked: Picked,
    onProgress?: (sent: number, total: number) => void,
  ) => Promise<Attachment>;
  /** A URI this platform can draw: the thumbnail, fetched once. */
  readonly thumb: (id: string) => Promise<string>;
  /** A URI this platform can show, play or hand on: the file itself, fetched once. */
  readonly file: (attachment: Attachment) => Promise<string>;
  /**
   * A URI for the viewer: a photo's view copy, no longer than 2,048 pixels on its longer side
   * (ADR 0058), fetched once — or the file itself where the server has no copy to give, which it
   * says, and which is kept once as the file. A server from before the copy answers with the file
   * and says nothing, so the size and the type say it; one that refuses with a 404 is asked for the
   * file instead.
   */
  readonly view: (attachment: Attachment) => Promise<Viewed>;
  /**
   * A URI to play a video from: its copy that plays everywhere once the server has made it, and
   * the file itself until then (ADR 0053), fetched once. `onProgress` hears the download as it
   * comes, from wherever it has got to when it is given, so a viewer that asks again mid-way
   * shows the same ring.
   *
   * `forCopy` asks the server again when what was fetched is the original, while its copy was still
   * being made: for the copy alone, leaving the original unfetched if it is still to come. It is
   * how Try again goes on when this phone could not play the original (the media viewer, Phase 3).
   *
   * `signal` is the asker letting go: the viewer closed, or paged on. Once every asker that gave
   * one has let go and none asked without one, the download stops where it is and is forgotten,
   * and through the relay the server stops sending it (ADR 0153). Asked again, it starts again.
   */
  readonly play: (
    attachment: Attachment,
    onProgress?: Progress,
    forCopy?: boolean,
    signal?: AbortSignal,
  ) => Promise<Played>;
  /**
   * A URL to stream a video from (ADR 0058): a grant for what plays, which the player fetches with
   * nothing else, asking for runs of it as it plays, so a clip starts without being fetched whole.
   * Nothing when the phone reaches its server through the relay, where a player cannot follow, or
   * when the server grants nothing — one from before grants, or a refusal: `play` fetches it then.
   *
   * The same URL comes back while the grant has more than a minute to run, so a video paged back to
   * is not loaded again. `fresh` asks for another: Try again, after the stream would not play, or
   * the original would not while its copy was being made.
   */
  readonly streamUrl: (attachment: Attachment, fresh?: boolean) => Promise<Played | undefined>;
  /** Hand the file to the platform: the share sheet on a phone, a download in a browser. */
  readonly open: (attachment: Attachment) => Promise<void>;
  /**
   * Show the file to the person: Quick Look on an iPhone, which has Share of its own (ADR 0124);
   * where there is none, or it cannot draw the file, what `open` does.
   */
  readonly preview: (attachment: Attachment) => Promise<void>;
  /**
   * A page's words, to draw in the app: an HTML file's document (ADR 0059), or a Markdown file's
   * source, which `PageSheet` makes into one (ADR 0123). Read from the copy kept on the phone,
   * which Share hands on too, so the bytes are fetched once. Refused past `MAX_PAGE_BYTES`.
   */
  readonly page: (attachment: Attachment) => Promise<string>;
}

export function createFileService(device: Device): FileService {
  const uris = new Map<string, Promise<string>>();
  const viewed = new Map<string, Promise<Viewed>>();
  const plays = new Map<string, Download>();
  // What was kept is cleared from You, all of it or some attachments' (ADR 0159), and a URI
  // remembered from before then names nothing.
  let clearings = keptClearings();
  let read = keptLetGo().length;
  const fresh = () => {
    const gone = keptLetGo();
    if (clearings !== keptClearings()) {
      clearings = keptClearings();
      read = gone.length;
      uris.clear();
      viewed.clear();
      plays.clear();
      return;
    }
    for (const id of gone.slice(read)) {
      uris.delete(`file:${id}`);
      uris.delete(`thumb:${id}`);
      viewed.delete(id);
      plays.delete(id);
    }
    read = gone.length;
  };
  const cached = (key: string, load: () => Promise<string>): Promise<string> => {
    fresh();
    let uri = uris.get(key);
    if (uri === undefined) {
      uri = load();
      uris.set(key, uri);
      uri.catch(() => uris.delete(key));
    }
    return uri;
  };
  // Each looks on the phone before it asks the server (ADR 0161): what was kept on a day the app
  // was open before is still kept, and is not fetched again because this is a new day's process.
  const file = (attachment: Attachment) =>
    cached(
      `file:${attachment.id}`,
      async () =>
        findKept(attachment.id, "file") ??
        keepLocally(
          attachment.id,
          attachment.filename,
          attachment.mimeType,
          await fetchAttachmentBytes(device, attachment.id),
        ),
    );
  const view = (attachment: Attachment): Promise<Viewed> => {
    fresh();
    let found = viewed.get(attachment.id);
    if (found === undefined) {
      const onPhone = viewOnPhone(attachment);
      found = onPhone === undefined ? viewOf(attachment) : Promise.resolve(onPhone);
      viewed.set(attachment.id, found);
      found.catch(() => viewed.delete(attachment.id));
    }
    return found;
  };
  const viewOf = async (attachment: Attachment): Promise<Viewed> => {
    try {
      const {
        bytes,
        mimeType,
        view: said,
      } = await fetchAttachmentWithType(device, attachment.id, "view");
      const itself =
        said === undefined
          ? bytes.byteLength === attachment.byteSize && mimeType === attachment.mimeType
          : said === "original";
      if (itself) {
        // The file itself, from a server with no copy to make: kept once, where `file` looks.
        const uri = cached(`file:${attachment.id}`, () =>
          keepLocally(attachment.id, attachment.filename, attachment.mimeType, bytes),
        );
        return { uri: await uri, original: true };
      }
      return {
        uri: await keepLocally(`${attachment.id}-view`, viewName(mimeType), mimeType, bytes),
        original: false,
      };
    } catch (failure) {
      if (failure instanceof UploadError && failure.status === 404) {
        return { uri: await file(attachment), original: true };
      }
      throw failure;
    }
  };
  const grants = new Map<string, { readonly played: Played; readonly expiresAt: number }>();
  const streamUrl = async (attachment: Attachment, fresh = false): Promise<Played | undefined> => {
    // A copy already on the phone plays from there, with nothing asked of the server; unless this
    // is Try again, after what was kept would not play.
    const onPhone = fresh ? undefined : findKept(attachment.id, "play");
    if (onPhone !== undefined) return { uri: onPhone, beingMade: false };
    const kept = grants.get(attachment.id);
    if (!fresh && kept !== undefined && kept.expiresAt - Date.now() > GRANT_SPARE_MS) {
      return kept.played;
    }
    const grant = await grantAttachment(device, attachment.id, "play").catch(() => undefined);
    if (grant === undefined) return undefined;
    const played: Played = {
      uri: grant.url,
      beingMade: grant.playable === "pending",
      streamed: true,
    };
    grants.set(attachment.id, { played, expiresAt: grant.expiresAt });
    return played;
  };
  const play = (
    attachment: Attachment,
    onProgress?: Progress,
    forCopy = false,
    signal?: AbortSignal,
  ): Promise<Played> => {
    fresh();
    if (!forCopy) fromPhone(attachment);
    const kept = plays.get(attachment.id);
    const before = kept?.played();
    let download = kept;
    if (download === undefined || (forCopy && asksAgain(kept))) {
      const next = playOf(attachment, forCopy ? before : undefined);
      plays.set(attachment.id, next);
      next.done.catch(() => {
        if (plays.get(attachment.id) !== next) return;
        // A failed ask for the copy leaves the original that was already here.
        if (kept === undefined) plays.delete(attachment.id);
        else plays.set(attachment.id, kept);
      });
      download = next;
    }
    if (onProgress !== undefined) download.hear(onProgress, signal);
    download.hold(signal);
    return download.done;
  };
  /** A video's copy the phone keeps already, to play with nothing fetched (ADR 0161). */
  const fromPhone = (attachment: Attachment) => {
    if (plays.has(attachment.id)) return;
    const onPhone = findKept(attachment.id, "play");
    if (onPhone !== undefined)
      plays.set(attachment.id, settled({ uri: onPhone, beingMade: false }));
  };
  /** A download of what plays, or, given the original already here, of its copy alone. */
  const playOf = (attachment: Attachment, original?: Played): Download => {
    const listeners = new Set<Progress>();
    let last: [number, number | undefined] | undefined;
    let played: Played | undefined;
    const stop = new AbortController();
    /** Askers that may let go and have not; and whether one asked that never will. */
    let holding = 0;
    let kept = false;
    const done = (async (): Promise<Played> => {
      const { bytes, mimeType, playable } = await fetchAttachmentWithType(
        device,
        attachment.id,
        "play",
        {
          signal: stop.signal,
          copyOnly: original !== undefined,
          onProgress: (received, total) => {
            last = [received, total];
            for (const listener of listeners) listener(received, total);
          },
        },
      );
      if (original !== undefined && (playable === "pending" || playable === "failed")) {
        played = { ...original, beingMade: playable === "pending" };
        return played;
      }
      // Named for what came back, since a player goes by the name: the copy is an MP4.
      const uri = await keepLocally(
        `${attachment.id}-play`,
        nameFor(attachment.filename, mimeType),
        mimeType,
        bytes,
      );
      played = { uri, beingMade: playable === "pending" };
      return played;
    })();
    return {
      done,
      played: () => played,
      hear(listener, signal) {
        listeners.add(listener);
        if (last !== undefined) listener(...last);
        const deaf = () => void listeners.delete(listener);
        done.then(deaf, deaf);
        signal?.addEventListener("abort", deaf, { once: true });
      },
      hold(signal) {
        if (signal === undefined) {
          kept = true;
          return;
        }
        holding += 1;
        const release = () => {
          holding -= 1;
          if (holding === 0 && !kept && played === undefined) stop.abort();
        };
        if (signal.aborted) release();
        else signal.addEventListener("abort", release, { once: true });
      },
    };
  };
  return {
    async upload(picked, onProgress) {
      const source = await openSource(picked.uri);
      try {
        return await uploadFile(
          device,
          { name: picked.name, source, keepMetadata: false },
          { onProgress },
        );
      } finally {
        source.close();
      }
    },
    thumb: (id) =>
      cached(
        `thumb:${id}`,
        async () =>
          findKept(id, "thumb") ??
          keepLocally(
            `${id}-thumb`,
            "thumb.webp",
            "image/webp",
            await fetchAttachmentBytes(device, id, "thumb"),
          ),
      ),
    file,
    view,
    play,
    streamUrl,
    async open(attachment) {
      await openLocally(await file(attachment), attachment.filename, attachment.mimeType);
    },
    async preview(attachment) {
      await previewLocally(await file(attachment), attachment.filename, attachment.mimeType);
    },
    async page(attachment) {
      if (attachment.byteSize > MAX_PAGE_BYTES) {
        throw new Error("This page is too large to open here. Share it to open it elsewhere.");
      }
      return readText(await file(attachment));
    },
  };
}

/** A video on its way to the phone once, and who is listening to how far it has got. */
interface Download {
  readonly done: Promise<Played>;
  /** Hear how much has come, until it is done or `signal` lets go. */
  readonly hear: (listener: Progress, signal?: AbortSignal) => void;
  /** One more asker: one with a signal may let go (`play`), one without keeps it to the end. */
  readonly hold: (signal: AbortSignal | undefined) => void;
  /** What it came to, once it has. */
  readonly played: () => Played | undefined;
  /** Kept on the phone already, and not fetched (ADR 0161). */
  readonly onPhone?: boolean;
}

/**
 * What the viewer draws a photo with, where the phone keeps it already (ADR 0161): its view copy,
 * or its file itself, kept when it was once opened whole.
 */
function viewOnPhone(attachment: Attachment): Viewed | undefined {
  const copy = findKept(attachment.id, "view");
  if (copy !== undefined) return { uri: copy, original: false };
  if (kindOf(attachment.mimeType) !== "image") return undefined;
  const itself = findKept(attachment.id, "file");
  return itself === undefined ? undefined : { uri: itself, original: true };
}

/**
 * Whether Try again asks the server for the copy: when what played was the original while the copy
 * was being made, or was what the phone kept, which may be that original.
 */
function asksAgain(kept: Download | undefined): boolean {
  return kept?.played()?.beingMade === true || kept?.onPhone === true;
}

/** What plays from a copy already kept on the phone: nothing to download, hear or hold. */
function settled(played: Played): Download {
  return {
    done: Promise.resolve(played),
    played: () => played,
    hear: () => undefined,
    hold: () => undefined,
    onPhone: true,
  };
}

/** What a view copy is kept as on this phone, named for the type it was served as. */
function viewName(mimeType: string): string {
  const extension = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" }[mimeType];
  return `view.${extension ?? "img"}`;
}

/** A file's name with the extension its type has, where the type is a video a player knows. */
export function nameFor(filename: string, mimeType: string): string {
  const extension = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[
    mimeType
  ];
  if (extension === undefined) return filename;
  const dot = filename.lastIndexOf(".");
  return `${dot === -1 ? filename : filename.slice(0, dot)}.${extension}`;
}
