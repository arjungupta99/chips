/**
 * The room's files (ADR 0100, Arjun's B, 3 October 2026), on a page of the room sheet: the current
 * version of each, newest first, read from the server as the sheet opens and again when a line
 * carrying a file lands or is taken back. A click on a file opens what is current; the `v3` at its
 * end unfolds its versions under it, newest first, the current one marked, each opening the same
 * way. The sheet's first page says how many there are and which changed last (`filesUnder`), as
 * the phone's does.
 *
 * Opening is by kind: a page in the page view, a photo or a video in the viewer on a deck of that
 * file's versions, anything else downloaded. A voice note and a photo a picker named are not here
 * (core's `inFiles`); they are in the room.
 */

import {
  type Directory,
  deckOfVersions,
  fileLinesKey,
  inAlbum,
  inFiles,
  kindOf,
  postedBy,
  type RoomFileOf,
  type Space,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { useEffect, useRef, useState } from "react";
import type { FileService } from "./files.ts";
import { opensInView, PageView } from "./PageView.tsx";
import { clockOrDay } from "./time.ts";
import { download } from "./viewer/actions.ts";
import { useViewer } from "./viewer/useViewer.ts";

/** Where the room's files are read from: the store, for this room. */
export interface FilesSource {
  readonly roomFiles: () => Promise<readonly RoomFileOf[]>;
  readonly fileVersions: (name: string) => Promise<readonly RoomFileOf[]>;
}

/** `by Oc2 · 11:52 PM`: who posted a version, and when. */
function byWhen(file: RoomFileOf, directory: Directory, selfId: string): string {
  return `by ${postedBy(file, directory, selfId)} · ${clockOrDay(file.at)}`;
}

/**
 * The room's files as the server lists them, the ones Files shows, read again when a line with a
 * file comes or goes; nothing until the first answer. A name's versions are read when it unfolds
 * and kept while its current version is the one they were read with.
 */
export function useRoomFiles(space: Space, source: FilesSource): RoomFilesRead {
  const [listed, setListed] = useState<readonly RoomFileOf[] | undefined>(undefined);
  const [versions, setVersions] = useState<ReadonlyMap<string, readonly RoomFileOf[]>>(new Map());
  // The sheet's actions are made anew each render: read the latest, not the first.
  const latest = useRef(source);
  latest.current = source;
  const key = fileLinesKey(space);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read again when the room's file lines change.
  useEffect(() => {
    let live = true;
    latest.current.roomFiles().then(
      (files) => {
        if (live) setListed(files.filter((file) => inFiles(file.name, file.attachment.mimeType)));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [space.id, key]);
  const fresh = (name: string): readonly RoomFileOf[] | undefined => {
    const known = versions.get(name);
    const current = listed?.find((file) => file.name === name)?.attachment.id;
    return known?.[0]?.attachment.id === current ? known : undefined;
  };
  const versionsOf = async (name: string): Promise<readonly RoomFileOf[]> => {
    const known = fresh(name);
    if (known !== undefined) return known;
    const read = await latest.current.fileVersions(name);
    setVersions((now) => new Map(now).set(name, read));
    return read;
  };
  return { listed, fresh, versionsOf };
}

/** An unfolded file's versions, read again when a new version of it is listed. */
function useFreshVersions(
  listed: readonly RoomFileOf[] | undefined,
  unfolded: ReadonlySet<string>,
  versionsOf: (name: string) => Promise<readonly RoomFileOf[]>,
) {
  const latest = useRef(versionsOf);
  latest.current = versionsOf;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new list can make them stale.
  useEffect(() => {
    for (const name of unfolded) void latest.current(name).catch(() => undefined);
  }, [listed]);
}

/** What `useRoomFiles` has read: the list once the server has said, and each name's versions. */
export interface RoomFilesRead {
  readonly listed: readonly RoomFileOf[] | undefined;
  readonly fresh: (name: string) => readonly RoomFileOf[] | undefined;
  readonly versionsOf: (name: string) => Promise<readonly RoomFileOf[]>;
}

/** What the Files row says under its name: the newest file and when, or that there are none. */
export function filesUnder(listed: readonly RoomFileOf[] | undefined): string | undefined {
  if (listed === undefined) return undefined;
  const newest = listed[0];
  if (newest === undefined) return "None yet";
  return `${newest.name} · v${newest.version} · ${clockOrDay(newest.at)}`;
}

export function RoomFiles({
  read,
  directory,
  selfId,
  files,
}: {
  readonly read: RoomFilesRead;
  readonly directory: Directory;
  readonly selfId: string;
  readonly files: FileService;
}) {
  const { listed, fresh, versionsOf } = read;
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const [reading, setReading] = useState<RoomFileOf | undefined>(undefined);
  const viewer = useViewer();
  useFreshVersions(listed, unfolded, versionsOf);
  if (listed === undefined || listed.length === 0) return null;

  const open = async (file: RoomFileOf) => {
    const { attachment } = file;
    if (opensInView(attachment)) setReading(file);
    else if (inAlbum(attachment))
      viewer.openDeck(deckOfVersions(await versionsOf(file.name)), attachment.id);
    else await download(files, attachment);
  };
  const toggle = async (name: string) => {
    if (!unfolded.has(name)) await versionsOf(name);
    setUnfolded((now) => {
      const next = new Set(now);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  };

  return (
    <section className="files" aria-label="Files" data-testid="room-files">
      <ul className="files-list">
        {listed.map((file) => (
          <FileRow
            key={file.name}
            file={file}
            files={files}
            said={byWhen(file, directory, selfId)}
            open={unfolded.has(file.name)}
            versions={(fresh(file.name) ?? []).map((each) => ({
              file: each,
              said: byWhen(each, directory, selfId),
            }))}
            onOpen={(which) => void open(which)}
            onToggle={() => void toggle(file.name)}
          />
        ))}
      </ul>
      {reading !== undefined && (
        <PageView
          attachment={reading.attachment}
          files={files}
          said={`v${reading.version} · ${byWhen(reading, directory, selfId)}`}
          onClose={() => setReading(undefined)}
        />
      )}
    </section>
  );
}

/** One file: its mark, its name, who posted the current version and when, and its versions. */
function FileRow({
  file,
  files,
  said,
  open,
  versions,
  onOpen,
  onToggle,
}: {
  readonly file: RoomFileOf;
  readonly files: FileService;
  readonly said: string;
  readonly open: boolean;
  readonly versions: readonly { readonly file: RoomFileOf; readonly said: string }[];
  readonly onOpen: (file: RoomFileOf) => void;
  readonly onToggle: () => void;
}) {
  return (
    <li className="files-item" data-testid="room-file" data-name={file.name}>
      <div className="files-row">
        <button
          type="button"
          className="files-open"
          onClick={() => onOpen(file)}
          aria-label={`Open ${file.name}, version ${file.version}`}
        >
          <FileMark file={file} files={files} />
          <span className="files-name">{file.name}</span>
          <span className="files-said">{said}</span>
        </button>
        {file.version > 1 ? (
          <button
            type="button"
            className="files-versions"
            aria-expanded={open}
            aria-label={`Versions of ${file.name}`}
            onClick={onToggle}
          >
            v{file.version}
            <Icon name="down" size={11} />
          </button>
        ) : (
          <span className="files-version">v1</span>
        )}
      </div>
      <div className="files-older" data-open={open ? "true" : undefined}>
        <ul>
          {versions.map(({ file: version, said: versionSaid }, at) => (
            <li key={version.attachment.id}>
              <button
                type="button"
                className="files-older-open"
                tabIndex={open ? undefined : -1}
                onClick={() => onOpen(version)}
                aria-label={`Open ${version.name}, version ${version.version}`}
                data-testid="room-file-version"
              >
                <span className="files-older-v">v{version.version}</span>
                <span className="files-said">{versionSaid}</span>
                {at === 0 && <span className="files-current">Current</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

/** A photo's thumbnail, or the mark of what it is. */
function FileMark({ file, files }: { readonly file: RoomFileOf; readonly files: FileService }) {
  const [thumb, setThumb] = useState<string | undefined>(undefined);
  const kind = kindOf(file.attachment.mimeType);
  const id = file.attachment.id;
  useEffect(() => {
    if (kind !== "image" || !inAlbum(file.attachment)) return;
    let live = true;
    files.thumb(id).then(
      (url) => {
        if (live) setThumb(url);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [files, id, kind, file.attachment]);
  return (
    <span className="files-mark" aria-hidden="true">
      {thumb !== undefined ? (
        <img src={thumb} alt="" />
      ) : (
        <Icon name={kind === "video" ? "play" : kind === "image" ? "image" : "doc"} size={13} />
      )}
    </span>
  );
}
