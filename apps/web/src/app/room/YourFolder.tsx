/**
 * Your folder (ADR 0224), at the top of Universe on the Mac (ADR 0227): the room's project as a
 * folder in `~/Chips/Projects`, made and opened by Open folder and kept up to date while it is
 * untouched. Once the person has changed something, it lists what, takes words for the change, and
 * sends it; a clash shows its marked lines and holds Send until they are out. Under Open folder,
 * Universe's Documents, then Programs with Run program (ADR 0226). In a browser, Open folder in Mac
 * asks the person's Mac instead (ADR 0225), over the same two.
 */

import {
  FOLDER_ON_MAC_WORDS,
  type FolderAnswer,
  type FolderChange,
  type FolderStanding,
  folderCameWords,
  folderClashWords,
  folderHeadWords,
  folderKeysWords,
  folderMakesWords,
  folderOnMacWords,
  folderOpenedFromWords,
  folderSentWords,
  folderSinceWords,
  folderStanding,
  folderTroubleWords,
  folderWaitingWords,
  GUEST_READS_PROJECT,
  type MacsHeard,
  NOT_THIS_MAC,
  type RecipeRead,
} from "@chipschat/core";
import { Icon } from "@chipschat/ui";
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import type { FolderState, Folders, Room } from "../folders.ts";
import { Failed, Heading } from "./parts.tsx";
import { type ChangedSince, MacRun } from "./RunBar.tsx";
import { useYes } from "./useYes.ts";

type Run = (
  op: "open" | "editor" | "send" | "file",
  extra?: { words?: string; file?: string },
) => void;

/**
 * The card, for a room: the folder, then what is given as `children` (Universe's Documents), then
 * Programs, when the room has a program or a run file that says what is wrong with it.
 */
export function YourFolder({
  room,
  folders,
  program,
  changedSince,
  sends = true,
  children,
}: {
  readonly room: Room;
  readonly folders: Folders;
  readonly program: RecipeRead;
  /** Who changed the files since the last run, for Run's bar (SEC-40). */
  readonly changedSince?: ChangedSince | undefined;
  /** Whether the person sends what they changed: anybody in the room but a guest (SEC-40). */
  readonly sends?: boolean;
  readonly children?: ReactNode;
}) {
  const state = useSyncExternalStore(folders.subscribe, () => folders.state(room.id));
  const [words, setWords] = useState("");
  // Run is the owner's, on the Mac where the workspace's server runs (ADR 0231).
  const here = useYes(folders.runsHere);
  // biome-ignore lint/correctness/useExhaustiveDependencies: looked at once each time a room's card opens.
  useEffect(() => {
    void folders.run(room, "look");
  }, [room.id]);
  const run: Run = (op, extra) =>
    void folders.run(room, op, extra).then(() => {
      // The words go once the change they were for has gone; a held Send keeps them.
      const after = folders.state(room.id).answer;
      if (op === "send" && after?.ok === true && (after.sent?.files.length ?? 0) > 0) setWords("");
    });
  const { answer, busy, failed } = state;
  if (answer === undefined || !answer.ok) {
    return (
      <Unread answer={answer} failed={failed} busy={busy !== undefined} run={run}>
        {children}
      </Unread>
    );
  }
  return (
    <Standing
      answer={answer}
      state={state}
      words={words}
      setWords={setWords}
      run={run}
      sends={sends}
    >
      {children}
      {program === undefined ? null : (
        <>
          <Heading>Programs</Heading>
          {here ? (
            <MacRun
              room={room}
              folders={folders}
              recipe={program}
              where={answer.shown}
              changedSince={changedSince}
            />
          ) : (
            <p className="your-folder-note" data-testid="run-not-here">
              {NOT_THIS_MAC}
            </p>
          )}
        </>
      )}
    </Standing>
  );
}

/** Before the first look has answered, or when it couldn't: the documents still open. */
function Unread(props: {
  readonly answer: FolderAnswer | undefined;
  readonly failed: string | undefined;
  readonly busy: boolean;
  readonly run: Run;
  readonly children?: ReactNode;
}) {
  const why = props.failed ?? (props.answer?.ok === false ? props.answer.why : undefined);
  return (
    <section className="your-folder" data-testid="your-folder">
      <Title head="" />
      {why === undefined ? (
        <p className="sheet-hint">Looking for your folder…</p>
      ) : (
        <>
          <Failed words={why} />
          <button
            type="button"
            className="sheet-go"
            disabled={props.busy}
            onClick={() => props.run("open")}
            data-testid="your-folder-open"
          >
            Open folder
          </button>
        </>
      )}
      {props.children}
    </section>
  );
}

/** The folder as the last answer found it. */
function Standing(props: {
  readonly answer: FolderAnswer & { ok: true };
  readonly state: FolderState;
  readonly words: string;
  readonly setWords: (words: string) => void;
  readonly run: Run;
  readonly sends: boolean;
  /** Universe's Documents and Programs, under Open folder. */
  readonly children: ReactNode;
}) {
  const { answer, run } = props;
  const busy = props.state.busy;
  const standing = folderStanding(answer);
  const changed = answer.changed ?? [];
  return (
    <section className="your-folder" data-testid="your-folder" data-standing={standing}>
      <Title head={folderHeadWords(answer)} warn={standing === "clash"} />
      {standing === "none" ? (
        <>
          <button
            type="button"
            className="sheet-go"
            disabled={busy !== undefined}
            onClick={() => run("open")}
            data-testid="your-folder-open"
          >
            {busy === "open" ? "Making your folder…" : "Open folder"}
          </button>
          <p className="your-folder-note">{folderMakesWords(answer.shown)}</p>
        </>
      ) : (
        <code className="your-folder-path" data-testid="your-folder-path">
          {answer.shown}
        </code>
      )}
      {standing === "clash" && (
        <Clash answer={answer} busy={busy !== undefined} onOpen={(file) => run("file", { file })} />
      )}
      {(standing === "changed" || standing === "clash") && (
        <Sending
          standing={standing}
          changed={changed}
          words={props.words}
          setWords={props.setWords}
          busy={busy}
          sends={props.sends}
          run={run}
        />
      )}
      {standing !== "none" && <Opens editor={answer.editor} busy={busy !== undefined} run={run} />}
      {props.children}
      <Notes answer={answer} standing={standing} state={props.state} />
    </section>
  );
}

/** What the person changed and Send, held while a clash waits; to a guest, that they send nothing. */
function Sending(props: {
  readonly standing: "changed" | "clash";
  readonly changed: readonly FolderChange[];
  readonly words: string;
  readonly setWords: (words: string) => void;
  readonly busy: FolderState["busy"];
  readonly sends: boolean;
  readonly run: Run;
}) {
  const { standing, busy } = props;
  if (!props.sends) {
    // A guest reads the project and sends nothing (SEC-40): the door would refuse it.
    return (
      <p className="your-folder-note" data-testid="your-folder-reads-only">
        {GUEST_READS_PROJECT}
      </p>
    );
  }
  return (
    <>
      {standing === "changed" && (
        <Changed changed={props.changed} words={props.words} setWords={props.setWords} />
      )}
      <button
        type="button"
        className="sheet-go"
        disabled={busy !== undefined || standing === "clash"}
        onClick={() => props.run("send", { words: props.words.trim() })}
        data-testid="your-folder-send"
      >
        {busy === "send" ? "Sending…" : "Send my changes"}
      </button>
    </>
  );
}

/** Open folder, and Open in editor where the Mac has one. */
function Opens(props: {
  readonly editor: string | undefined;
  readonly busy: boolean;
  readonly run: Run;
}) {
  return (
    <div className="your-folder-pair" data-single={props.editor === undefined || undefined}>
      <button
        type="button"
        className="sheet-go"
        data-tone="soft"
        disabled={props.busy}
        onClick={() => props.run("open")}
        data-testid="your-folder-open"
      >
        <Icon name="folder" size={15} />
        Open folder
      </button>
      {props.editor !== undefined && (
        <button
          type="button"
          className="sheet-go"
          data-tone="soft"
          disabled={props.busy}
          onClick={() => props.run("editor")}
          title={`Opens the folder in ${props.editor}`}
          data-testid="your-folder-editor"
        >
          <Icon name="code" size={15} />
          Open in editor
        </button>
      )}
    </div>
  );
}

/** What the person changed, with its lines, and words for the change. */
function Changed(props: {
  readonly changed: readonly FolderChange[];
  readonly words: string;
  readonly setWords: (words: string) => void;
}) {
  return (
    <>
      <ul className="your-folder-changed" data-testid="your-folder-changed">
        {props.changed.map((change) => (
          <li key={change.path}>
            <Icon name="doc" size={14} />
            <span>{change.path}</span>
            <span className="your-folder-lines">
              <b data-kind="added">+{change.added}</b> <b data-kind="removed">−{change.removed}</b>
            </span>
          </li>
        ))}
      </ul>
      <label className="your-folder-words">
        <span>What you changed</span>
        <input
          className="sheet-input"
          value={props.words}
          placeholder="Optional"
          maxLength={500}
          onChange={(event) => props.setWords(event.target.value)}
          data-testid="your-folder-words"
        />
      </label>
    </>
  );
}

/** The sentences under the buttons: what waits, what came in, what was sent, and what went wrong. */
function Notes(props: {
  readonly answer: FolderAnswer & { ok: true };
  readonly standing: FolderStanding;
  readonly state: FolderState;
}) {
  const { answer } = props;
  const note = noteOf(answer, props.standing, props.state);
  return (
    <>
      {note !== undefined && (
        <p className="your-folder-note" data-testid={note.id}>
          {note.words}
        </p>
      )}
      {(answer.keys?.length ?? 0) > 0 && <Failed words={folderKeysWords(answer.keys ?? [])} />}
      {answer.trouble !== undefined && <Failed words={folderTroubleWords(answer.trouble)} />}
      {props.state.failed !== undefined && <Failed words={props.state.failed} />}
    </>
  );
}

/** The one sentence a standing has under its buttons, when it has one. */
function noteOf(
  answer: FolderAnswer & { ok: true },
  standing: FolderStanding,
  { came, asked }: FolderState,
): { readonly id: string; readonly words: string } | undefined {
  if (standing === "clash") {
    const clashes = answer.clashes ?? [];
    const others = (answer.changed ?? [])
      .map((change) => change.path)
      .filter((path) => !clashes.includes(path));
    return { id: "your-folder-waiting", words: folderWaitingWords(others) };
  }
  if (standing === "changed") {
    const since = answer.since ?? [];
    return since.length === 0
      ? undefined
      : { id: "your-folder-since", words: folderSinceWords(answer.by ?? [], since) };
  }
  return standing === "current" ? currentNote(answer, { came, asked }) : undefined;
}

/** Up to date: what was sent, the phone's ask (ADR 0225), or the last change that came in. */
function currentNote(
  answer: FolderAnswer & { ok: true },
  { came, asked }: FolderState,
): { readonly id: string; readonly words: string } | undefined {
  if (answer.sent !== undefined) {
    return { id: "your-folder-sent", words: folderSentWords(answer.sent.files) };
  }
  // Opened from the phone says so until a change comes in after it.
  if (asked !== undefined && (came === undefined || asked.at >= came.at)) {
    return { id: "your-folder-asked", words: folderOpenedFromWords(asked.from, asked.at) };
  }
  return came === undefined
    ? undefined
    : { id: "your-folder-came", words: folderCameWords(came.by, came.files, came.at) };
}

function Title({ head, warn = false }: { readonly head: string; readonly warn?: boolean }) {
  return (
    <div className="your-folder-title">
      <Icon name="folder" size={16} />
      <b>Your folder</b>
      {head !== "" && (
        <span data-warn={warn || undefined} data-testid="your-folder-head">
          {head}
        </span>
      )}
    </div>
  );
}

/** A clash: what clashed with whose, its first marked lines, and the file to open. */
function Clash(props: {
  readonly answer: FolderAnswer & { ok: true };
  readonly busy: boolean;
  readonly onOpen: (file: string) => void;
}) {
  const file = props.answer.clashes?.[0] ?? "";
  const words = folderClashWords(file, props.answer.clashedWith ?? []);
  const name = file.split("/").pop() ?? file;
  return (
    <>
      <div className="your-folder-clash" data-testid="your-folder-clash">
        <b>{words.title}</b>
        <span>{words.body}</span>
      </div>
      {props.answer.marked !== undefined && (
        <pre className="project-file-words" data-testid="your-folder-marked">
          {props.answer.marked}
        </pre>
      )}
      <button
        type="button"
        className="sheet-go"
        data-tone="soft"
        disabled={props.busy}
        onClick={() => props.onOpen(file)}
        data-testid="your-folder-file"
      >
        Open {name}
      </button>
    </>
  );
}

/**
 * Open folder in Mac (ADR 0225), in a browser: the person's own Chips for Mac asked to open the
 * room's folder in Finder, and whether one heard it; Universe's Documents and Programs under it.
 */
export function FolderOnMac(props: {
  readonly openOnMac: () => Promise<MacsHeard>;
  readonly children?: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const [said, setSaid] = useState<MacsHeard | { readonly failed: string }>();
  const open = async () => {
    setAsking(true);
    try {
      setSaid(await props.openOnMac());
    } catch (error) {
      setSaid({ failed: error instanceof Error ? error.message : String(error) });
    } finally {
      setAsking(false);
    }
  };
  return (
    <section className="your-folder" data-testid="project-on-mac-card">
      <Title head="" />
      <button
        type="button"
        className="sheet-go"
        data-tone="soft"
        disabled={asking}
        onClick={() => void open()}
        data-testid="project-on-mac"
      >
        <Icon name="mac" size={15} />
        {asking ? "Asking your Mac…" : "Open folder in Mac"}
      </button>
      {said === undefined ? (
        <p className="your-folder-note">{FOLDER_ON_MAC_WORDS}</p>
      ) : "failed" in said ? (
        <Failed words={said.failed} />
      ) : (
        <p
          className="your-folder-said"
          data-heard={said.macs > 0 || undefined}
          data-testid="project-on-mac-said"
        >
          {folderOnMacWords(said)}
        </p>
      )}
      {props.children}
    </section>
  );
}
