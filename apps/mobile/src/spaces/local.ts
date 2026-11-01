/**
 * Where bytes live on this phone, and how they leave it. A picked file is read from where the
 * picker put it, a piece at a time; a fetched attachment is written once under the app's cache, named by its id,
 * so a second look costs no request and a photo the person opened yesterday is still there
 * today; and a file is shown in Quick Look where the phone has it (ADR 0124), in the app Android
 * has for its kind, or handed to the platform's share sheet, which is where Save to Files and every
 * other app live. `local.web.ts` is the same shape over object URLs and a download, for the web
 * target the Playwright suite drives.
 */

import type { UploadSource } from "@chipschat/core";
import { Directory, File, Paths } from "expo-file-system";
import { startActivityAsync } from "expo-intent-launcher";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { type KeptPart, partOf, safeName, sentName } from "./keptNames";
import { quickLook } from "./quickLook";

/**
 * A file the picker chose, as an upload reads it: through a handle, a piece at a time, so a
 * two-minute video is never in memory whole (ADR 0052). Close it when the upload is done.
 */
export async function openSource(
  uri: string,
): Promise<UploadSource & { readonly close: () => void }> {
  const file = new File(uri);
  const handle = file.open();
  return {
    size: handle.size ?? file.size,
    read: async (start, end) => {
      handle.offset = start;
      return handle.readBytes(end - start);
    },
    close: () => handle.close(),
  };
}

/**
 * What is kept, by attachment and by part (`keptNames.ts`): read from the disk the first time it
 * is asked, then kept in step by what this module keeps and lets go. The file service looks here
 * before it fetches (ADR 0161), so a photo seen yesterday is drawn from the phone today, and not
 * asked of the server again because the app was opened afresh.
 */
let index: Map<string, Map<KeptPart, string[]>> | undefined;

function indexed(): Map<string, Map<KeptPart, string[]>> {
  if (index !== undefined) return index;
  index = new Map();
  const directory = new Directory(Paths.cache, "attachments");
  if (directory.exists) {
    for (const entry of directory.list()) {
      if (entry instanceof File) note(entry.name, entry.uri);
    }
  }
  return index;
}

function note(name: string, uri: string): void {
  if (index === undefined) return;
  const { id, part } = partOf(name);
  const parts = index.get(id) ?? new Map<KeptPart, string[]>();
  const uris = parts.get(part) ?? [];
  if (!uris.includes(uri)) uris.push(uri);
  parts.set(part, uris);
  index.set(id, parts);
}

/**
 * Where this phone already keeps a part of an attachment, or nothing. A video's copy that plays
 * everywhere is an MP4, and is taken over an original kept while it was still being made. A file
 * the system took from the cache meanwhile is not there, and is forgotten here.
 */
export function findKept(id: string, part: KeptPart): string | undefined {
  const parts = indexed().get(id);
  const uris = parts?.get(part);
  if (parts === undefined || uris === undefined) return undefined;
  const here = uris.filter((uri) => new File(uri).exists);
  parts.set(part, here);
  return part === "play" ? (here.find(isMp4) ?? here[0]) : here[0];
}

const isMp4 = (uri: string) => uri.toLowerCase().endsWith(".mp4");

/**
 * Keep an attachment's bytes on this phone, and say where. Idempotent: the file is written
 * once, and the same id and name find it again.
 */
export async function keepLocally(
  id: string,
  name: string,
  _mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const directory = new Directory(Paths.cache, "attachments");
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${safeName(id)}-${safeName(name)}`);
  if (!file.exists) file.write(bytes);
  note(file.name, file.uri);
  return file.uri;
}

/** One file kept on this phone: an attachment's bytes, its thumbnail, or a viewer's copy of it. */
export interface KeptFile {
  /** As it is named on disk: the attachment's id, a dash, then what it is (`keepLocally`). */
  readonly name: string;
  readonly uri: string;
  readonly size: number;
}

/** Everything kept on this phone, file by file, for Media on this phone (ADR 0159). */
export async function keptFiles(): Promise<readonly KeptFile[]> {
  const directory = new Directory(Paths.cache, "attachments");
  if (!directory.exists) return [];
  return directory
    .list()
    .flatMap((entry) =>
      entry instanceof File ? [{ name: entry.name, uri: entry.uri, size: entry.size ?? 0 }] : [],
    );
}

/**
 * The attachments let go of one by one since the app started, in the order they were: the file
 * service remembers each attachment's kept URI for the life of the app, so it reads the ones added
 * since it last looked and forgets those URIs, and nothing else.
 */
const letGo: string[] = [];

export function keptLetGo(): readonly string[] {
  return letGo;
}

/**
 * Let go of what was kept for these attachments, and their viewer's copies: a room erased from
 * the server (ADR 0067) takes its files off the phone too, and so does Delete on Media on this
 * phone (ADR 0159). A file already gone is not a failure. What is on the server stays there, and
 * the file service fetches it again the next time it is opened.
 */
export async function forgetKept(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  letGo.push(...ids);
  for (const id of ids) index?.delete(safeName(id));
  const directory = new Directory(Paths.cache, "attachments");
  if (!directory.exists) return;
  const prefixes = ids.map((id) => `${safeName(id)}-`);
  for (const entry of directory.list()) {
    if (entry instanceof File && prefixes.some((prefix) => entry.name.startsWith(prefix))) {
      letGoOf(entry);
    }
  }
}

function letGoOf(entry: File): void {
  try {
    entry.delete();
  } catch {
    // Gone already, or going: either way it is not kept.
  }
}

/**
 * How many times what was kept has been cleared from You (ADR 0085). The file service remembers
 * each attachment's kept URI for the life of the app, so it reads this to know when those URIs
 * name files that are no longer there and each must be fetched again.
 */
let clearings = 0;

export function keptClearings(): number {
  return clearings;
}

/** How much is kept on this phone: every attachment's bytes, and their viewer's copies. */
export async function keptBytes(): Promise<number> {
  const directory = new Directory(Paths.cache, "attachments");
  if (!directory.exists) return 0;
  let total = 0;
  for (const entry of directory.list()) {
    if (entry instanceof File) total += entry.size ?? 0;
  }
  return total;
}

/**
 * Let go of everything kept, for Media on this phone's Clear all. What is on the server stays there
 * and comes back the next time it is opened; an upload in progress reads from where the picker
 * put the file, which is not here, so none is cut short.
 */
export async function clearKept(): Promise<void> {
  const directory = new Directory(Paths.cache, "attachments");
  clearings += 1;
  index = new Map();
  if (directory.exists) {
    for (const entry of directory.list()) {
      try {
        entry.delete();
      } catch {
        // Gone already, or going: either way it is not kept.
      }
    }
  }
}

/** A kept file's words, read as UTF-8: an HTML page, to draw in the app. */
export async function readText(uri: string): Promise<string> {
  return new File(uri).text();
}

/**
 * A kept file under the name it was sent with, for whatever takes it out of the app: the share
 * sheet, Quick Look and its Share, the app Android opens it in, the gallery. A kept file is named
 * for the phone (`att_…-Trip_plan.pdf`, `keptNames.ts`), and that was the name the next app showed
 * and saved (the emulator, 16 October 2026). One copy at a time, in a folder outside the kept
 * files, made afresh each time a file leaves.
 */
function asSent(uri: string, name: string): string {
  const folder = new Directory(Paths.cache, "leaving");
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true, idempotent: true });
  const copy = new File(folder, sentName(name));
  new File(uri).copy(copy);
  return copy.uri;
}

/** Hand a kept file to the platform: the share sheet, with Save to Files and every app on it. */
export async function openLocally(uri: string, name: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(asSent(uri, name), { mimeType, dialogTitle: name });
}

/**
 * Bytes made to leave rather than to be kept, a room's project as a zip (ADR 0224): written under
 * their name in the folder files leave from, and handed to the share sheet.
 */
export async function shareBytes(bytes: Uint8Array, name: string, mimeType: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  const folder = new Directory(Paths.cache, "leaving");
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, sentName(name));
  file.write(bytes);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}

/**
 * Bytes to look at rather than keep, a document of the room's project (ADR 0227): written under
 * their name in a folder of their own, and shown as a kept file is, in Quick Look.
 */
export async function previewBytes(
  bytes: Uint8Array,
  name: string,
  mimeType: string,
): Promise<void> {
  const folder = new Directory(Paths.cache, "looking");
  if (folder.exists) folder.delete();
  folder.create({ intermediates: true, idempotent: true });
  const file = new File(folder, sentName(name));
  file.write(bytes);
  await previewLocally(file.uri, name, mimeType);
}

/**
 * Show a kept file to the person: in Quick Look, which has Share in its own bar, where this build
 * has it and the file is one it can draw (ADR 0124); on Android, in the app it has for the file's
 * kind; in the share sheet otherwise, as before.
 */
export async function previewLocally(uri: string, name: string, mimeType: string): Promise<void> {
  const look = quickLook();
  if (look?.canPreview(uri) === true) return look.preview(asSent(uri, name), name);
  if (Platform.OS === "android" && (await viewOnAndroid(asSent(uri, name), mimeType))) return;
  return openLocally(uri, name, mimeType);
}

/** Android's flag that lets the app a file is opened in read that one file, and nothing more. */
const GRANT_READ = 1;

/**
 * Open a kept file in the app Android has for its kind — Drive's viewer for a PDF, Docs, a
 * gallery — as Quick Look does on an iPhone; Open had been the share sheet, headed "Sharing 1
 * file" (the emulator, 16 October 2026). It settles when that app is closed, as the share sheet
 * does. A phone with no app for the kind refuses at once, and says so with false.
 */
async function viewOnAndroid(uri: string, mimeType: string): Promise<boolean> {
  try {
    await startActivityAsync("android.intent.action.VIEW", {
      data: new File(uri).contentUri,
      type: mimeType,
      flags: GRANT_READ,
    });
    return true;
  } catch {
    return false;
  }
}

/** A phone has a library to save a picture into; a browser has downloads, which Share already is. */
export const canSaveToLibrary = true;

/**
 * Put a kept file into Photos, or the gallery, as the media viewer's Save does. It asks to add
 * and never to read — iOS's add-only permission, Android's photos and videos alone — so the
 * prompt is about the one thing asked for, and a refusal is a sentence that says where to change
 * it.
 */
export async function saveToLibrary(uri: string, name: string): Promise<void> {
  const { granted } = await requestPermissionsAsync(true, ["photo", "video"]);
  if (!granted) {
    throw new Error("Chips may not save to your library. Allow it in Settings, under Chips.");
  }
  await Asset.create(asSent(uri, name));
}

/** A kept picture as base64, which is what the clipboard takes an image as. */
export async function base64Of(uri: string): Promise<string> {
  return new File(uri).base64();
}
