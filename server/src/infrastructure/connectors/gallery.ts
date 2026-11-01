/**
 * The gallery's cards, read from where the server was told (ADR 0171): a file, or an `https:` URL
 * of the docs' `connectors.json`.
 *
 * A URL is read at most once a day, and a failed read is tried again after ten minutes, keeping
 * the cards it had. A file is read when asked: it is on this machine and cheap. Either way, what
 * can't be read is no cards rather than an error, because the gallery's two generic ways in are
 * always there, and a person bringing an agent should never meet a stack trace about the docs.
 * Nothing is sent but the GET: no id, no count, nothing about the workspace.
 */

import { readFile } from "node:fs/promises";
import type { Clock, Logger } from "@chipschat/platform";
import { type Connector, readConnectors } from "@chipschat/protocol";

export interface ConnectorGallery {
  readonly read: () => Promise<{ readonly connectors: Connector[]; readonly readAt?: string }>;
}

/** How long a URL's cards are kept before they are read again. */
export const GALLERY_KEPT_MS = 24 * 60 * 60 * 1000;
/** How long after a failed read of a URL it is tried again. */
export const GALLERY_RETRY_MS = 10 * 60 * 1000;
/** The most of a `connectors.json` read: the docs' list is a few kilobytes. */
export const GALLERY_MAX_BYTES = 256 * 1024;

const isLoopbackHost = (host: string) =>
  host === "127.0.0.1" || host === "localhost" || host === "[::1]";

/** Whether the source is a URL the server will read: `https:`, or `http:` on this machine. */
export function readableUrl(source: string): URL | undefined {
  if (!/^https?:\/\//i.test(source)) return undefined;
  try {
    const url = new URL(source);
    if (url.protocol === "https:" || isLoopbackHost(url.hostname)) return url;
  } catch {
    // Not a URL: read as a file, which will say what it can't find.
  }
  return undefined;
}

export interface GalleryDeps {
  /** `CHIPS_CONNECTORS`. Absent, there are no cards. */
  readonly source: string | undefined;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly fetch?: typeof fetch;
  readonly readText?: (path: string) => Promise<string>;
}

async function fetched(url: URL, fetching: typeof fetch): Promise<unknown> {
  const answer = await fetching(url, {
    headers: { accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(5000),
  });
  if (!answer.ok) throw new Error(`${url.href} answered ${answer.status}`);
  const text = await answer.text();
  if (text.length > GALLERY_MAX_BYTES)
    throw new Error(`${url.href} is over ${GALLERY_MAX_BYTES} bytes`);
  return JSON.parse(text);
}

export function connectorGallery(deps: GalleryDeps): ConnectorGallery {
  const { source, clock, logger } = deps;
  if (source === undefined || source.trim() === "")
    return { read: async () => ({ connectors: [] }) };
  const url = readableUrl(source);
  const fetching = deps.fetch ?? fetch;
  const readText = deps.readText ?? ((path: string) => readFile(path, "utf8"));

  if (url === undefined) {
    return {
      read: async () => {
        try {
          const text = await readText(source);
          if (text.length > GALLERY_MAX_BYTES) throw new Error(`over ${GALLERY_MAX_BYTES} bytes`);
          return { connectors: readConnectors(JSON.parse(text)), readAt: clock.nowIso() };
        } catch (error) {
          logger.warn({ source, error: String(error) }, "connectors not read");
          return { connectors: [] };
        }
      },
    };
  }

  let kept: { connectors: Connector[]; readAt: string; atMs: number } | undefined;
  let failedAtMs: number | undefined;
  let reading: Promise<void> | undefined;
  const refresh = async () => {
    try {
      const connectors = readConnectors(await fetched(url, fetching));
      kept = { connectors, readAt: clock.nowIso(), atMs: clock.nowMs() };
      failedAtMs = undefined;
    } catch (error) {
      failedAtMs = clock.nowMs();
      logger.warn({ source: url.href, error: String(error) }, "connectors not read");
    }
  };
  return {
    read: async () => {
      const now = clock.nowMs();
      const stale = kept === undefined || now - kept.atMs >= GALLERY_KEPT_MS;
      const resting = failedAtMs !== undefined && now - failedAtMs < GALLERY_RETRY_MS;
      if (stale && !resting) {
        reading ??= refresh().finally(() => {
          reading = undefined;
        });
        await reading;
      }
      return kept === undefined
        ? { connectors: [] }
        : { connectors: kept.connectors, readAt: kept.readAt };
    },
  };
}
