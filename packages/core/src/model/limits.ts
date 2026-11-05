/**
 * What may be attached here (ADR 0047): the caps an owner or an admin set on photos, videos and
 * files, under the server's own ceiling. One event carries all three, so the last one folded is
 * the workspace's word; the audit says who capped what.
 */

import {
  type AttachmentCaps,
  CAP_KINDS,
  CAP_WORDS,
  type CapKind,
  formatLimit,
} from "@chipschat/protocol";
import { type FoldStep, field } from "./state.js";

export const LIMITS_FOLDS: Readonly<Record<string, FoldStep>> = {
  "attachment.limits_set": (state, event) => {
    const read = (name: string): number | null => {
      const value = field<number | null>(event, name);
      return typeof value === "number" ? value : null;
    };
    state.caps = {
      image: read("image_bytes"),
      video: read("video_bytes"),
      file: read("file_bytes"),
    };
    state.audit.push({
      seq: event.seq,
      ts: event.ts,
      kind: "attachment",
      who: event.actor.id,
      what: `capped ${capWords(state.caps)}`,
    });
  },
};

/** `photos at 25 MB, videos at 100 MB, and files at the server's limit`. */
export function capWords(caps: AttachmentCaps): string {
  const parts = CAP_KINDS.map((kind) => {
    const cap = caps[kind];
    return `${CAP_WORDS[kind].many} at ${cap === null ? "the server's limit" : formatLimit(cap)}`;
  });
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

/**
 * The caps as a settings screen says them: `Photos up to 25 MB, videos up to the server's
 * 100 MB, and files up to 50 MB.` The ceiling is named where it is known; where it is not, a
 * kind with no cap is "up to the server's limit".
 */
export function capsSentence(caps: AttachmentCaps, ceiling?: number | undefined): string {
  const parts = CAP_KINDS.map((kind) => {
    const cap = caps[kind];
    const servers =
      ceiling === undefined ? "the server's limit" : `the server's ${formatLimit(ceiling)}`;
    const upTo =
      cap === null || (ceiling !== undefined && cap >= ceiling) ? servers : formatLimit(cap);
    return `${CAP_WORDS[kind].many} up to ${upTo}`;
  });
  const first = parts[0] ?? "";
  return `${first.charAt(0).toUpperCase()}${first.slice(1)}, ${parts[1]}, and ${parts[2]}.`;
}

/**
 * The caps at the right of You's row (ADR 0085, ADR 0265): one size when the three agree, else the
 * smallest and the largest — "100 MB", "25–100 MB" — and the server's own until its ceiling is
 * known.
 */
export function capsWords(caps: AttachmentCaps, ceiling: number | undefined): string {
  const sizes = CAP_KINDS.map((kind) => caps[kind] ?? ceiling).filter(
    (size): size is number => size !== undefined,
  );
  if (sizes.length === 0) return "Server's limit";
  const least = Math.min(...sizes);
  const most = Math.max(...sizes);
  return least === most
    ? formatLimit(least)
    : `${formatLimit(least).replace(" MB", "")}–${formatLimit(most)}`;
}

const MB = 1024 * 1024;

/** The caps as a settings screen's fields hold them: whole megabytes as text, blank for the server's own. */
export function capsDraft(caps: AttachmentCaps): Record<CapKind, string> {
  const words = (cap: number | null) => (cap === null ? "" : String(cap / MB));
  return { image: words(caps.image), video: words(caps.video), file: words(caps.file) };
}

/** The fields as caps, or the reason they are not: a cap is a number of megabytes, or blank. */
export function capsFromDraft(
  draft: Record<CapKind, string>,
): { readonly caps: AttachmentCaps } | { readonly error: string } {
  const caps: Record<CapKind, number | null> = { image: null, video: null, file: null };
  for (const kind of CAP_KINDS) {
    const typed = draft[kind].trim();
    if (typed === "") continue;
    const mb = Number(typed);
    if (!Number.isFinite(mb) || mb <= 0) {
      return {
        error: `A cap on ${CAP_WORDS[kind].many} is a number of megabytes, or blank for the server's limit.`,
      };
    }
    caps[kind] = Math.round(mb * MB);
  }
  return { caps };
}
