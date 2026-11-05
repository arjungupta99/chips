/**
 * What the page does for Chips for Mac's window (ADR 0267), and nothing in a browser.
 *
 * The window has no title bar of its own: its traffic lights stand over the page, the way a Mac
 * app's stand over its sidebar. So the page says it is in the Mac's window (`data-shell="mac"`),
 * and the rail, the room and the run panel each start a bar's height lower with their own colour
 * running up under the lights (`styles.css`, Chips for Mac's window). Over that bar lies a strip
 * the window is moved by, and zoomed by a double click, as a title bar is. The bar is the lights'
 * height however large the page is drawn (⌘+ and ⌘−), so it is told the size. In full screen
 * there is no title bar to make room for, and the panes go back up.
 *
 * The window waits, hidden, until the page is drawn (`whenDrawn`, ADR 0274), so it never opens
 * white, or on an empty page while a moment's cache is read.
 *
 * And a file let go anywhere but the room is refused here. The window hands a drop to the page
 * (`dragDropEnabled: false`), where a room stages it in its composer; a drop that nothing takes
 * would otherwise be opened by the window in Chips' place, with no way back.
 */

import { useEffect, useRef, useState } from "react";
import { type Desktop, desktop, inDesktop } from "../native.ts";

export function MacWindow() {
  const full = useFullScreen();
  const zoom = useZoom();
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["shell"] = "mac";
    return () => {
      delete root.dataset["shell"];
    };
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (full) root.dataset["fullScreen"] = "true";
    else delete root.dataset["fullScreen"];
  }, [full]);
  useEffect(() => {
    document.documentElement.style.setProperty("--mac-zoom", String(zoom));
  }, [zoom]);
  useEffect(refuseStrayDrops, []);
  useEffect(
    () =>
      whenDrawn(() => {
        void desktop()
          .then((shell) => shell?.drawn?.())
          .catch(() => undefined);
      }),
    [],
  );
  if (full) return null;
  return <div className="mac-bar" data-tauri-drag-region="" aria-hidden="true" />;
}

/** Only in the Mac's window. */
export function MacWindowIfAny() {
  return inDesktop() ? <MacWindow /> : null;
}

function useFullScreen(): boolean {
  return useFromShell(false, (shell, listen) => shell.onFullScreen?.(listen));
}

function useZoom(): number {
  return useFromShell(1, (shell, listen) => shell.onZoom?.(listen));
}

/** Something the shell says now and again whenever it changes, as state; `start` until it has. */
function useFromShell<T>(
  start: T,
  follow: (shell: Desktop, listen: (now: T) => void) => Promise<() => void> | undefined,
): T {
  const [now, setNow] = useState(start);
  const following = useRef(follow);
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    void desktop()
      .then((shell) =>
        shell === undefined ? undefined : following.current(shell, (said) => live && setNow(said)),
      )
      .then((stopping) => {
        if (live) stop = stopping;
        else stopping?.();
      })
      .catch(() => undefined);
    return () => {
      live = false;
      stop?.();
    };
  }, []);
  return now;
}

/**
 * `say` once the page has something on it: anything but this strip, and nothing that asks the
 * window to wait (`data-window-waits`: the room's place, quiet while the cache is read, before a
 * room or the words for none stand in it). Told at once, as the page changes, whether the window
 * is seen or not.
 */
export function whenDrawn(
  say: () => void,
  root: HTMLElement | null = document.getElementById("root"),
): () => void {
  if (root === null) {
    say();
    return () => undefined;
  }
  let said = false;
  const drawn = () =>
    root.querySelector(":scope > :not(.mac-bar)") !== null &&
    root.querySelector("[data-window-waits]") === null;
  const observer = new MutationObserver(() => look());
  const look = () => {
    if (said || !drawn()) return;
    said = true;
    observer.disconnect();
    say();
  };
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-window-waits"],
  });
  look();
  return () => observer.disconnect();
}

/**
 * A file over anything that does not take it is shown as refused, and let go there, is dropped.
 * Whatever does take it (the room) has said so first, by preventing the default. Words or a link
 * dragged inside the page go where they go.
 */
export function refuseStrayDrops(where: Window = window): () => void {
  const files = (event: DragEvent) => event.dataTransfer?.types.includes("Files") === true;
  const over = (event: DragEvent) => {
    if (event.defaultPrevented || !files(event)) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "none";
  };
  const drop = (event: DragEvent) => {
    if (event.defaultPrevented || !files(event)) return;
    event.preventDefault();
  };
  where.addEventListener("dragover", over);
  where.addEventListener("drop", drop);
  return () => {
    where.removeEventListener("dragover", over);
    where.removeEventListener("drop", drop);
  };
}
