/**
 * The editor's two pieces of chrome (ADR 0135), flat as every control is and moving instead, as
 * on the phone: Save at the bar's right — grey until there is something to save, gold when there
 * is, the chip's running pins while it saves, a green tick once the harness has it — and the
 * status capsule at the foot, which says in a line what the file is doing. Each arrives on a
 * spring (`ctx-arrive` in the stylesheet), still for Reduce Motion.
 */

import { type EditorState, editWords } from "@chipschat/core";
import { ChipMark, Icon } from "@chipschat/ui";
import { clockTime } from "../time.ts";
import type { Editor } from "./useEditor.ts";

export type SaveLook = "off" | "on" | "busy" | "done";

export function saveLook(editor: Editor): SaveLook {
  if (editor.state === "waiting") return "busy";
  if (editor.state === "saved") return "done";
  return editor.maySave ? "on" : "off";
}

export function SaveButton({
  look,
  onSave,
}: {
  readonly look: SaveLook;
  readonly onSave: () => void;
}) {
  if (look === "busy") {
    return (
      <span className="ctx-save-round ctx-arrive" data-testid="context-save-busy">
        <ChipMark size={22} state="working" label="Saving" />
      </span>
    );
  }
  if (look === "done") {
    return (
      <span className="ctx-save-round ctx-save-done ctx-pop" data-testid="context-save-done">
        <Icon name="check" size={18} label="Saved" />
      </span>
    );
  }
  return (
    <button
      // A new element when it turns gold, so it arrives.
      key={look}
      type="button"
      className={look === "on" ? "ctx-save ctx-arrive" : "ctx-save"}
      data-on={look === "on" ? "true" : undefined}
      disabled={look !== "on"}
      onClick={onSave}
      data-testid="context-save"
    >
      Save
    </button>
  );
}

/** The dot, the pins or the tick before the status line's words. */
function StatusMark({ state }: { readonly state: EditorState }) {
  if (state === "waiting") return <ChipMark size={18} state="working" />;
  if (state === "saved") return <Icon name="check" size={16} className="ctx-status-tick" />;
  return <span className="ctx-dot" data-state={state} aria-hidden="true" />;
}

export function EditorStatus({
  editor,
  harnessName,
  agentName,
  readAt,
  from,
}: {
  readonly editor: Editor;
  readonly harnessName: string;
  /** Whose the file is; absent for the harness's own set. */
  readonly agentName: string | undefined;
  readonly readAt: string;
  /** For giving an agent its own: what it starts as. */
  readonly from?: string | undefined;
}) {
  const { state } = editor;
  const at = state === "theirs" ? (editor.theirsAt ?? readAt) : readAt;
  // Away with typing still on: it went away at a save, and the words wait for it to be back.
  const words = editWords(state, harnessName, agentName, {
    readAt: clockTime(at),
    from,
    atSave: editor.mayType,
  });
  return (
    <div className="ctx-status" data-state={state} data-testid="context-status" role="status">
      <StatusMark state={state} />
      <span key={state} className="ctx-status-words ctx-rise" data-testid="context-status-words">
        {editor.message === undefined || state !== "failed" ? words : `${words} ${editor.message}`}
      </span>
    </div>
  );
}
