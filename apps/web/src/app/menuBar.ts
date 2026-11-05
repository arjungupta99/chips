/**
 * The Mac's menus and their keys, from the page's side (ADR 0267): the iPad's commands (ADR 0256,
 * `apps/mobile/src/ui/menuBar.ts`) with the Mac's Settings and Send Feedback beside them. The rows
 * and keys are the shell's (`apps/desktop/src-tauri/src/menu.rs`); what each does is the page's.
 *
 * A screen that can do a command holds it (`useMenuCommand`) while it is mounted and able, with its
 * name for now, and the newest holder is the one it runs. Which are held, and under what name, is
 * handed to the shell whole whenever it changes, once a frame's changes are in, and the shell dims
 * the rest. A command chosen there, from its row or by its keys, comes back by its id.
 *
 * In a browser there is no shell: nothing is handed over, no key is taken from the page, and the
 * commands are only kept here, where the tests run them (`runCommand`).
 */

import { useEffect, useRef } from "react";
import { type Desktop, desktop, type MenuStanding } from "../native.ts";

export type CommandId =
  | "settings"
  | "new-space"
  | "tab-spaces"
  | "tab-agents"
  | "tab-search"
  | "tab-you"
  | "search-everything"
  | "previous-space"
  | "next-space"
  | "feedback";

/** Each command's name while nobody has given it another, as the shell's rows are made. */
const TITLES: Readonly<Record<CommandId, string>> = {
  settings: "Settings…",
  "new-space": "New Space",
  "tab-spaces": "Spaces",
  "tab-agents": "Agents",
  "tab-search": "Search",
  "tab-you": "You",
  "search-everything": "Search Everything",
  "previous-space": "Previous Space",
  "next-space": "Next Space",
  feedback: "Send Feedback…",
};

const ORDER = Object.keys(TITLES) as CommandId[];

/** One command as the shell takes it. */
export interface Standing extends MenuStanding {
  readonly id: CommandId;
}

interface Holder {
  readonly run: () => void;
  readonly title: string | undefined;
}

/** Each command's holders, oldest first: the last one runs it. */
const holders = new Map<CommandId, Holder[]>();

/** The commands as the menus hold them now. */
export function commandsNow(): readonly Standing[] {
  return ORDER.map((id) => {
    const top = holders.get(id)?.at(-1);
    return { id, title: top?.title ?? TITLES[id], enabled: top !== undefined };
  });
}

/** Does a command, as choosing it from the menu or pressing its keys does; nothing if nobody holds it. */
export function runCommand(id: string): void {
  if (id in TITLES)
    holders
      .get(id as CommandId)
      ?.at(-1)
      ?.run();
}

let shell: Promise<Desktop | undefined> | undefined;

/** The shell, found once, and told to send its commands here. */
function found(): Promise<Desktop | undefined> {
  shell ??= desktop().then((there) => {
    void there?.onMenu?.(runCommand);
    return there;
  });
  return shell;
}

let publishing = false;

/** The menus handed over again, once the changes of this frame are all in. */
function publish() {
  if (publishing) return;
  publishing = true;
  queueMicrotask(() => {
    publishing = false;
    void found()
      .then((there) => there?.setMenu?.(commandsNow()))
      .catch(() => undefined);
  });
}

/**
 * Holds a command while `run` is given: the screen in front can do it now. `title` is its name for
 * now, where it says which way it goes.
 */
export function useMenuCommand(id: CommandId, run: (() => void) | undefined, title?: string): void {
  const latest = useRef(run);
  latest.current = run;
  const able = run !== undefined;
  useEffect(() => {
    if (!able) return undefined;
    const holder: Holder = { run: () => latest.current?.(), title };
    holders.set(id, [...(holders.get(id) ?? []), holder]);
    publish();
    return () => {
      holders.set(
        id,
        (holders.get(id) ?? []).filter((each) => each !== holder),
      );
      publish();
    };
  }, [id, able, title]);
}

/**
 * The space before or after the one open, down the list as the rail draws it, pinned first and
 * hidden ones left out (the iPad's `stepSpace`): with none open, or one not in the run, the first
 * or the last; none past either end.
 */
export function stepSpace(
  order: readonly string[],
  current: string | undefined,
  step: 1 | -1,
): string | undefined {
  const at = current === undefined ? -1 : order.indexOf(current);
  if (at === -1) return step === 1 ? order[0] : order.at(-1);
  return order[at + step];
}
