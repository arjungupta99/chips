/**
 * The shell's hold on the Mac's menu commands (ADR 0267; `menuBar.ts`): what each does here, as
 * the iPad's tab bar holds them there (ADR 0256). The sections and Settings go where the rail's
 * rows go; New Space opens the dialog out of the rail's +; Search Everything puts the caret in
 * Search's field; the space before and after are down the rail as it draws them, while Spaces is
 * in front; and Send Feedback opens GitHub's form as You's Feedback card does.
 */

import { feedbackLink, listRuns, type Space } from "@chipschat/core";
import { useMemo } from "react";
import { desktop } from "../native.ts";
import { stepSpace, useMenuCommand } from "./menuBar.ts";
import type { Tab } from "./Sidebar.tsx";
import { FEEDBACK_ON } from "./you/Feedback.tsx";

export interface MenuCommandsOptions {
  readonly tab: Tab;
  readonly selectTab: (tab: Tab) => void;
  /** Absent for a person who may not open a space (ADR 0196), as the + is. */
  readonly onNewSpace: ((from: HTMLElement | null) => void) | undefined;
  readonly spaces: readonly Space[];
  readonly hiddenSpaces: ReadonlySet<string> | undefined;
  readonly pinnedSpaces: readonly string[] | undefined;
  readonly selectedId: string | undefined;
  readonly open: (spaceId: string) => void;
  /** "Chips 1.0.1 · 1a2b3c4", for the form's version field. */
  readonly build: string;
}

export function useMenuCommands(options: MenuCommandsOptions): void {
  const { tab, selectTab, onNewSpace, open, selectedId } = options;
  useMenuCommand("settings", () => selectTab("you"));
  useMenuCommand("tab-spaces", () => selectTab("spaces"));
  useMenuCommand("tab-agents", () => selectTab("agents"));
  useMenuCommand("tab-search", () => selectTab("search"));
  useMenuCommand("tab-you", () => selectTab("you"));
  useMenuCommand(
    "new-space",
    onNewSpace === undefined
      ? undefined
      : () => onNewSpace(document.querySelector<HTMLElement>('[data-testid="new-space"]')),
  );
  useMenuCommand("search-everything", () => {
    // Search puts the caret in its field as it opens; already open, the caret goes back there.
    if (tab === "search") searchField()?.focus();
    else selectTab("search");
  });

  // The rooms the rail draws first: pinned, then the rest, a hidden room left out (ADR 0240).
  const { spaces, hiddenSpaces, pinnedSpaces } = options;
  const order = useMemo(
    () =>
      listRuns(
        spaces.filter((space) => space.parentSpaceId === undefined && !space.glimpse),
        hiddenSpaces,
        pinnedSpaces,
      ).open.map((space) => space.id),
    [spaces, hiddenSpaces, pinnedSpaces],
  );
  const step = (by: 1 | -1) => () => {
    const to = stepSpace(order, selectedId, by);
    if (to !== undefined) open(to);
  };
  const stepping = tab === "spaces" && order.length > 0;
  useMenuCommand("previous-space", stepping ? step(-1) : undefined);
  useMenuCommand("next-space", stepping ? step(1) : undefined);

  const { build } = options;
  useMenuCommand(
    "feedback",
    FEEDBACK_ON
      ? () => void desktop().then((shell) => shell?.openLink?.(feedbackLink(`${build} · Mac`)))
      : undefined,
  );
}

/** Search's field, in its own page or in the column beside a room on a wide window (ADR 0269). */
function searchField(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('.search input[type="search"]');
}
