/**
 * The rooms' projects (ADR 0220): where each room's git repository is kept and how git answers
 * for it. The adapter is `infrastructure/projects/repositories.ts`, git's own `http-backend`; the
 * use case says who may and records what a push did.
 */

/** One request to a room's project, as git's smart HTTP makes it. */
export interface ProjectRequest {
  readonly spaceId: string;
  readonly method: string;
  /** What follows `project.git`: `/info/refs`, `/git-upload-pack`, `/git-receive-pack`. */
  readonly rest: string;
  /** The query, without its `?`. */
  readonly query: string;
  readonly contentType: string | undefined;
  readonly contentLength: string | undefined;
  readonly contentEncoding: string | undefined;
  /** `Git-Protocol`, which asks for git's protocol version 2. */
  readonly gitProtocol: string | undefined;
  readonly body: ReadableStream<Uint8Array> | null;
  /** Whose request it is, for git's own log: the agent's id, or the person's. */
  readonly who: string;
  /** For a push: the most one file may be, and what the room has left. */
  readonly push?:
    | {
        readonly fileCap: number;
        readonly fileCapWords: string;
        readonly bytesLeft: number;
      }
    | undefined;
}

/** git's answer, its body still streaming; `done` settles with git's exit code once it has gone. */
export interface Served {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ReadableStream<Uint8Array>;
  readonly done: Promise<number | null>;
}

/** What a push did to `main`, between where it was and where it is. */
export interface ProjectChanges {
  readonly commits: number;
  /** The first line of the newest commit's message. */
  readonly message: string;
  readonly files: readonly {
    readonly path: string;
    readonly added: number | null;
    readonly removed: number | null;
  }[];
  /** How many more files changed than `files` names. */
  readonly moreFiles: number;
  /** How many files `main` has after it (ADR 0222). */
  readonly fileCount: number;
}

/** A file of the project at a commit. */
export interface ProjectFile {
  readonly path: string;
  readonly bytes: number;
}

/** One file of a change, with its diff: none for a binary file, cut when the change's diff is long. */
export interface ProjectChangeFile {
  readonly path: string;
  readonly added: number | null;
  readonly removed: number | null;
  readonly patch: string | null;
  readonly cut: boolean;
}

/** One change on `main`, as a person opens it (ADR 0222). */
export interface ProjectChange {
  readonly commit: string;
  readonly parent: string | null;
  /** Its author, as git signed it: an agent's name and `<agent id>@agents.chips.invalid`, or a person's. */
  readonly name: string;
  readonly email: string;
  readonly at: string;
  readonly message: string;
  readonly files: readonly ProjectChangeFile[];
  readonly moreFiles: number;
}

/** One change to a file, for its history. */
export interface ProjectFileVersion {
  readonly commit: string;
  readonly name: string;
  readonly email: string;
  readonly at: string;
  readonly message: string;
}

/** What Undo did: taken back as a new commit, or why not. */
export type Undone =
  | { readonly state: "done"; readonly before: string; readonly after: string }
  /** A later change builds on the same lines of these files. */
  | { readonly state: "clash"; readonly files: readonly string[] }
  /** No such change on `main`. */
  | { readonly state: "not_on_main" }
  | { readonly state: "unsupported"; readonly why: string };

export interface ProjectStore {
  /** The git it runs on. */
  readonly git: { readonly path: string; readonly version: string };
  /** One request, the room's repository made first when it has none. */
  readonly serve: (request: ProjectRequest) => Promise<Served>;
  /** Where `main` is, or `null` before anything was pushed. */
  readonly head: (spaceId: string) => Promise<string | null>;
  readonly changes: (
    spaceId: string,
    before: string | null,
    after: string,
  ) => Promise<ProjectChanges>;
  /** The files at `main`, or at a commit `main` has; nothing for a commit it hasn't. */
  readonly files: (spaceId: string, at?: string) => Promise<readonly ProjectFile[] | undefined>;
  /** One file's bytes at `main` or a commit, up to `max`; nothing when it isn't there. */
  readonly read: (
    spaceId: string,
    path: string,
    at: string | undefined,
    max: number,
  ) => Promise<{ bytes: Buffer } | { tooBig: number } | undefined>;
  /**
   * The files at `main` or a commit as one zip, as `git archive` makes it (ADR 0224); `tooBig`,
   * with their size, when the files come to more than `max`; nothing before anything was pushed,
   * or for a commit `main` hasn't.
   */
  readonly archive: (
    spaceId: string,
    at: string | undefined,
    max: number,
  ) => Promise<{ bytes: Buffer } | { tooBig: number } | undefined>;
  /** Who signed a commit `main` has, by their email; nothing for a commit it hasn't. */
  readonly authorOf: (spaceId: string, commit: string) => Promise<string | undefined>;
  /** The changes to one file, newest first. */
  readonly history: (spaceId: string, path: string) => Promise<readonly ProjectFileVersion[]>;
  /** One change `main` has, with its diff; nothing for one it hasn't. */
  readonly change: (spaceId: string, commit: string) => Promise<ProjectChange | undefined>;
  /** One change taken back as a new commit on `main` by the person, signed as `name` and `email`. */
  readonly undo: (
    spaceId: string,
    input: { commit: string; name: string; email: string; message: string },
  ) => Promise<Undone>;
  /** What the room's repository holds on disk, in bytes; 0 when it has none. */
  readonly sizeOf: (spaceId: string) => Promise<number>;
  /** The room's repository gone, as an erase takes it (ADR 0067); nothing when it has none. */
  readonly remove: (spaceId: string) => Promise<void>;
}

/**
 * A page of the room's project built into one document (ADR 0223), or why it isn't: a file the
 * page needs and can't have, a page too big once its files are in it, scripts that don't build, or
 * no bundler on this server for a page whose modules import each other.
 */
export type BuiltPage =
  | { readonly ok: true; readonly html: string }
  | {
      readonly ok: false;
      readonly kind: "not_found" | "too_big" | "invalid" | "unavailable";
      readonly why: string;
    };

/** Builds a page of a room's project into one document, reading its files through `read`. */
export interface PageBuilder {
  readonly build: (input: {
    /** The page, by its path in the project. */
    readonly path: string;
    /** A file's bytes, by its path in the project, or nothing when it isn't there. */
    readonly read: (path: string) => Promise<Uint8Array | undefined>;
    /** The most the built document may be. */
    readonly maxBytes: number;
  }) => Promise<BuiltPage>;
}
