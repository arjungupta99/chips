/**
 * The menu bar an iPad with a keyboard shows, and its shortcuts (ADR 0256, the mock's section 10;
 * `modules/menu-bar`): the tabs at the top of View on ⌘1 to ⌘4, and a Space menu with New Space,
 * Search Everything, the details and the list, and the space before and after. Esc has keys and no
 * row: it closes what stands over the window, the newest first.
 *
 * Every command is here, in its place, and whether it can be done is the screen in front's to say:
 * a screen that can do one holds it (`useMenuCommand`) while it is mounted and able, with its name
 * for now ("Hide Details" while they show), and the newest holder of a command is the one it runs.
 * One nobody holds is drawn dimmed. What the menus hold is handed to UIKit whole whenever it
 * changes, once a frame's changes are in; a command chosen there comes back by its id.
 *
 * Where there is no module, under Node and on the web, nothing is handed over and the commands are
 * only kept here, where the tests run them (`runCommand`).
 */

import { requireOptionalNativeModule } from "expo";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

export type CommandId =
  | "tab-spaces"
  | "tab-agents"
  | "tab-search"
  | "tab-you"
  | "new-space"
  | "search-everything"
  | "details"
  | "list"
  | "previous-space"
  | "next-space"
  | "escape";

type Modifier = "command" | "shift" | "option" | "control";

/** One command as the module takes it (`MenuCommand` in `MenuBarModule.swift`). */
export interface MenuCommand {
  readonly id: CommandId;
  readonly title: string;
  /** A character, or `up`, `down` or `escape`. */
  readonly input: string;
  readonly modifiers: readonly Modifier[];
  /** `view`, `space`, or `hidden` for keys with no row. */
  readonly menu: "view" | "space" | "hidden";
  /** Commands of one group stand together, between separators. */
  readonly group: number;
  readonly enabled: boolean;
}

type Definition = Omit<MenuCommand, "id" | "enabled">;

/** Every command, in the order the menus hold them. */
const COMMANDS: Readonly<Record<CommandId, Definition>> = {
  "tab-spaces": { title: "Spaces", input: "1", modifiers: ["command"], menu: "view", group: 0 },
  "tab-agents": { title: "Agents", input: "2", modifiers: ["command"], menu: "view", group: 0 },
  "tab-search": { title: "Search", input: "3", modifiers: ["command"], menu: "view", group: 0 },
  "tab-you": { title: "You", input: "4", modifiers: ["command"], menu: "view", group: 0 },
  "new-space": { title: "New Space", input: "n", modifiers: ["command"], menu: "space", group: 0 },
  "search-everything": {
    title: "Search Everything",
    input: "f",
    modifiers: ["shift", "command"],
    menu: "space",
    group: 0,
  },
  details: {
    title: "Show Details",
    input: "i",
    modifiers: ["option", "command"],
    menu: "space",
    group: 1,
  },
  list: {
    title: "Hide List",
    input: "s",
    modifiers: ["control", "command"],
    menu: "space",
    group: 1,
  },
  "previous-space": {
    title: "Previous Space",
    input: "up",
    modifiers: ["option"],
    menu: "space",
    group: 2,
  },
  "next-space": {
    title: "Next Space",
    input: "down",
    modifiers: ["option"],
    menu: "space",
    group: 2,
  },
  escape: { title: "Close", input: "escape", modifiers: [], menu: "hidden", group: 0 },
};

const ORDER = Object.keys(COMMANDS) as CommandId[];

interface Holder {
  readonly run: () => void;
  readonly title: string | undefined;
}

/** Each command's holders, oldest first: the last one runs it. */
const holders = new Map<CommandId, Holder[]>();

interface NativeModule {
  readonly setCommands: (commands: readonly MenuCommand[]) => Promise<void>;
  readonly addListener: (
    event: "onCommand",
    listener: (event: { readonly id: string }) => void,
  ) => { remove: () => void };
}

let menus: NativeModule | null | undefined;

function native(): NativeModule | null {
  if (menus !== undefined) return menus;
  menus = Platform.OS === "ios" ? requireOptionalNativeModule<NativeModule>("ChipsMenuBar") : null;
  menus?.addListener("onCommand", ({ id }) => {
    if (id in COMMANDS) runCommand(id as CommandId);
  });
  return menus;
}

/** The commands as the menus hold them now. */
export function commandsNow(): readonly MenuCommand[] {
  return ORDER.map((id) => {
    const top = holders.get(id)?.at(-1);
    return {
      id,
      ...COMMANDS[id],
      title: top?.title ?? COMMANDS[id].title,
      enabled: top !== undefined,
    };
  });
}

/** Does a command, as choosing it from the menu or pressing its keys does; nothing if nobody holds it. */
export function runCommand(id: CommandId): void {
  holders.get(id)?.at(-1)?.run();
}

let publishing = false;

/** The menus handed over again, once the changes of this frame are all in. */
function publish() {
  if (publishing || native() === null) return;
  publishing = true;
  queueMicrotask(() => {
    publishing = false;
    void native()
      ?.setCommands(commandsNow())
      .catch(() => undefined);
  });
}

/**
 * Holds a command while `run` is given: the screen in front can do it now. `title` is its name for
 * now, where it says which way it goes ("Show Details", "Hide Details").
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

/** Esc closes this while it is open: a sheet, a popover, a card, the New space window. */
export function useEscape(open: boolean, close: () => void): void {
  useMenuCommand("escape", open ? close : undefined);
}
