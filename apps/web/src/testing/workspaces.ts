/**
 * The rail's Workspaces menu (`WorkspaceMenu.tsx`), as a test drives it: the name at the rail's
 * top opens it, and its rows are the workspaces and what can be done from here.
 */

import { fireEvent, screen } from "@testing-library/react";

/** The menu's rows, workspaces and acts alike, in their order. */
function rowsOf(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')];
}

/** The workspace in front, by the name at the rail's top. */
export async function frontWorkspace(): Promise<string> {
  return (await screen.findByTestId("workspace-name")).textContent ?? "";
}

/** Opens the menu under the name and hands it back. */
export async function openWorkspaces(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByTestId("workspace-switcher"));
  return screen.findByRole("menu", { name: "Workspaces" });
}

/** What the menu lists, each row by its name alone: the workspaces, then the rest. */
export function menuRows(menu: HTMLElement): string[] {
  return rowsOf(menu).map((each) => each.querySelector(".line-menu-label")?.textContent ?? "");
}

/** Opens the menu and presses the row named so: a workspace, or one of the rest. */
export async function chooseInWorkspaces(name: string): Promise<void> {
  const menu = await openWorkspaces();
  const row = rowsOf(menu).find(
    (each) => each.querySelector(".line-menu-label")?.textContent === name,
  );
  if (row === undefined) throw new Error(`No "${name}" in the Workspaces menu: ${menuRows(menu)}`);
  fireEvent.click(row);
}
