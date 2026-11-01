/**
 * What a person changes about an agent from its page (ADRs 0134, 0140, 0143, 0146), and about a
 * harness's own jobs from its page (ADR 0252), as the fake plays it. A harness's copies are taken whole and checked against the protocol's own schemas, as
 * the real door checks them; the answer a copy carries is kept; and a person's change is a frame
 * built from the copy as it stands. The kit asks for what the copy already says (the same model,
 * the same heartbeat, the same limit, the same text), so a harness that answers changes nothing
 * it would not have, and one that refuses has said why.
 */

import {
  agentContextPut,
  agentContextWindowPut,
  agentHeartbeatPut,
  agentModelPut,
  harnessContextPut,
  harnessJobsPut,
  type IdGenerator,
} from "@chipschat/protocol";

/** One of the four copies, the harness's own shared files beside an agent's, and its own jobs. */
export type SettingKind =
  | "context"
  | "harness-context"
  | "model"
  | "heartbeat"
  | "context-window"
  | "jobs";

/** What a socket says in its `hello` to be sent a kind's frames. */
export const ACCEPTS: Readonly<Record<SettingKind, string>> = {
  context: "context",
  "harness-context": "context",
  model: "models",
  heartbeat: "heartbeats",
  "context-window": "context_windows",
  jobs: "jobs",
};

const SCHEMAS = {
  context: agentContextPut,
  "harness-context": harnessContextPut,
  model: agentModelPut,
  heartbeat: agentHeartbeatPut,
  "context-window": agentContextWindowPut,
  jobs: harnessJobsPut,
} as const;

/** A copy's answer to a person's change: made, or refused with the harness's words. */
export interface SettingAnswer {
  readonly kind: SettingKind;
  readonly id: string;
  readonly changeId: string;
  readonly made: boolean;
  readonly message?: string | undefined;
}

export type PutOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly message: string;
      readonly issues: readonly { path: string; message: string }[];
    };

type Copy = Readonly<Record<string, unknown>>;

/** The people and clocks a frame names. */
export interface Asker {
  readonly ids: IdGenerator;
  readonly harnessId: string;
  readonly ownerId: string;
  readonly now: string;
}

export class FakeSettings {
  /** The copy last taken for each `kind:id`, without its answer. */
  private readonly copies = new Map<string, Copy>();
  /** Every answer a copy carried, oldest first. */
  readonly answers: SettingAnswer[] = [];

  /** A copy sent: checked, kept, and its answer, if it carries one, noted. */
  put(kind: SettingKind, id: string, body: unknown): PutOutcome {
    const parsed = SCHEMAS[kind].safeParse(body);
    if (!parsed.success) {
      return {
        ok: false,
        message: `That is not a copy of ${kind === "harness-context" ? "a harness's files" : kind === "jobs" ? "a harness's jobs" : `an agent's ${kind}`}.`,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(root)",
          message: issue.message,
        })),
      };
    }
    const { answers, refuses, ...copy } = parsed.data as Copy & {
      answers?: string;
      refuses?: Readonly<Record<string, unknown>>;
    };
    this.copies.set(`${kind}:${id}`, copy);
    if (answers !== undefined) this.answers.push({ kind, id, changeId: answers, made: true });
    if (refuses !== undefined) {
      const changeId = String(refuses["change_id"] ?? refuses["edit_id"]);
      const message = typeof refuses["message"] === "string" ? refuses["message"] : undefined;
      this.answers.push({ kind, id, changeId, made: false, message });
    }
    return { ok: true };
  }

  copy(kind: SettingKind, id: string): Copy | undefined {
    return this.copies.get(`${kind}:${id}`);
  }

  /** Every copy of a kind, by whose it is. */
  copiesOf(kind: SettingKind): (readonly [id: string, copy: Copy])[] {
    const prefix = `${kind}:`;
    return [...this.copies]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, copy]) => [key.slice(prefix.length), copy] as const);
  }

  answerTo(changeId: string): SettingAnswer | undefined {
    return this.answers.find((answer) => answer.changeId === changeId);
  }

  /**
   * The change a person would ask of a copy as it stands, as the frame the harness is sent, or
   * nothing when the copy offers nothing to change: no file with its text.
   */
  askOf(kind: SettingKind, id: string, asker: Asker): Record<string, unknown> | undefined {
    const copy = this.copy(kind, id);
    if (copy === undefined) return undefined;
    const asked = { harness_id: asker.harnessId, asked_by: asker.ownerId, asked_at: asker.now };
    const change = () => asker.ids.next("change");
    switch (kind) {
      case "model":
        return {
          frame: "model.change",
          change_id: change(),
          agent_id: id,
          model: copy["model"],
          effort: copy["effort"] ?? null,
          ...asked,
        };
      case "heartbeat":
        return {
          frame: "heartbeat.change",
          change_id: change(),
          agent_id: id,
          on: copy["on"],
          every: copy["every"],
          ...asked,
        };
      case "jobs": {
        const job = ((copy["jobs"] ?? []) as readonly Copy[]).find((each) => each["editable"]);
        if (job === undefined) return undefined;
        return {
          frame: "job.change",
          change_id: change(),
          job_id: job["job_id"],
          on: job["on"],
          ...(job["choices"] === undefined ? {} : { every: job["every"] }),
          ...asked,
        };
      }
      case "context-window": {
        const limit = copy["limit"] as { readonly at?: number | null } | undefined;
        return {
          frame: "context_window.change",
          change_id: change(),
          agent_id: id,
          at: limit?.at ?? null,
          ...asked,
        };
      }
      default:
        return this.editOf(kind, id, copy, asked, asker);
    }
  }

  /** A file saved as it is: an agent's, or one of the harness's own set. */
  private editOf(
    kind: SettingKind,
    id: string,
    copy: Copy,
    asked: Readonly<Record<string, unknown>>,
    asker: Asker,
  ): Record<string, unknown> | undefined {
    const files = (copy[kind === "context" ? "files" : "shared"] ?? []) as readonly Copy[];
    const file = files.find(
      (each) => typeof each["text"] === "string" && each["editable"] === true,
    );
    if (file === undefined) return undefined;
    return {
      frame: "context.edit",
      edit_id: asker.ids.next("edit"),
      ...(kind === "context" ? { agent_id: id } : {}),
      name: file["name"],
      text: file["text"],
      base_hash: typeof file["hash"] === "string" ? file["hash"] : "unknown",
      ...asked,
    };
  }
}
