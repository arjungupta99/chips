/**
 * A web page a harness sent — an HTML file — opened in the app rather than handed to the share
 * sheet, which on an iPhone has nothing that draws one (ADR 0059). Jacobian's designer sends its
 * mocks this way: *the interactive mock that arrived with this approval* (the Chess Game space,
 * 15 September 2026) could not be looked at on the phone it was sent to.
 *
 * The page is somebody else's code, so it is drawn where it can reach nothing of the app's. On a
 * phone that is a web view with no bridge, no files, no cache and no storage that outlives it,
 * whose document stands at `about:blank`. Nothing it does moves the view off that document. A link
 * a person taps to a web address or an email opens in the platform's own browser or mail, where
 * the platform says it was a tap: iOS does, and Android's web view does not, so on Android a page
 * goes nowhere at all (SEC-7). Anything else is refused: a page leaving on its own, a form sent, a
 * `chips://` link that would pair the phone with another server, a `file:` or a `javascript:` URL.
 * On the web target it is an `iframe` sandboxed to scripts alone. Its script runs, under a policy
 * that lets nothing leave (core's `HTML_POLICY`). This file is the rule, pure, so both are tested
 * against it.
 *
 * A page of the room's project links to its other files as `chips-file:` links (ADR 0227), which
 * chipsd makes as it builds the page. A tap on one opens that file in Chips, over the page: on iOS,
 * where the platform says it was a tap, and nowhere on Android, as with any other link.
 *
 * A page says what colour it is drawn on by going to a `chips-ground:` address (`GROUND_SCRIPT`),
 * which never loads: the view takes the colour for what shows past the page's edges. The page's
 * own script could go there too, and all it can do is choose that colour.
 */

import { FILE_LINK } from "@chipschat/protocol";

/** What opens as a page, and the largest drawn: core's, which the Mac's page view shares. */
export { isPage, MAX_PAGE_BYTES } from "@chipschat/core";

/** What a web view asks before it loads anything, as `react-native-webview` hands it over. */
export interface PageRequest {
  readonly url: string;
  /** iOS alone: whether the document loading is the page itself, not a frame inside it. */
  readonly isTopFrame?: boolean | undefined;
  /** iOS alone: `click` when a person tapped a link, `other` when the page went by itself. */
  readonly navigationType?: string | undefined;
  /** iOS alone: false for a link that asks for a window of its own. */
  readonly hasTargetFrame?: boolean | undefined;
}

/**
 * Load it in the view, open it in the platform's browser or mail, open a file of the room's project
 * in Chips (`fileOfLink` says which), take the colour the page is drawn on (`groundOfLink`), or do
 * nothing at all.
 */
export type PageLoad = "load" | "outside" | "file" | "ground" | "refuse";

/** Where a page says the colour it is drawn on: `chips-ground:15,17,21`. */
export const GROUND_LINK = "chips-ground:";

/**
 * Put in the page as it starts, and run once it has loaded and again as it turns light or dark: the
 * colour it is drawn on, said at `GROUND_LINK`. That is the root's background, or the body's, which the root takes
 * when it has none, or else the canvas's own, which follows the page's `color-scheme`. A 1-point
 * canvas reads any way of writing a colour as three numbers; one that isn't solid isn't the ground.
 * The view behind a page is otherwise one colour for every page, and a dark report pulled past its
 * top showed white there (Arjun, 3 November 2026: "The background behind dark HTML is also
 * light"). It ends in `true`, as `react-native-webview` asks of what it injects.
 */
export const GROUND_SCRIPT = `(function () {
  var said = "";
  function solid(color) {
    var canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    var pen = canvas.getContext("2d");
    if (!pen || !color) return undefined;
    pen.fillStyle = color;
    pen.fillRect(0, 0, 1, 1);
    var dot = pen.getImageData(0, 0, 1, 1).data;
    return dot[3] === 255 ? dot[0] + "," + dot[1] + "," + dot[2] : undefined;
  }
  function canvasColor() {
    var probe = document.createElement("div");
    probe.style.display = "none";
    probe.style.backgroundColor = "Canvas";
    document.documentElement.appendChild(probe);
    var color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }
  function say() {
    var root = document.documentElement;
    var ground =
      solid(getComputedStyle(root).backgroundColor) ||
      (document.body && solid(getComputedStyle(document.body).backgroundColor)) ||
      solid(canvasColor());
    if (!ground || ground === said) return;
    said = ground;
    location.href = "${GROUND_LINK}" + ground;
  }
  if (document.readyState === "complete") say();
  else addEventListener("load", say);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", say);
})();
true;`;

/** The colour a `chips-ground:` address says, as `rgb(…)`, or nothing for one that can't be read. */
export function groundOfLink(url: string): string | undefined {
  if (!url.startsWith(GROUND_LINK)) return undefined;
  const parts = /^(\d{1,3}),(\d{1,3}),(\d{1,3})$/.exec(url.slice(GROUND_LINK.length));
  if (parts === null) return undefined;
  const [red, green, blue] = parts.slice(1).map(Number);
  if ([red, green, blue].some((part) => part === undefined || part > 255)) return undefined;
  return `rgb(${red}, ${green}, ${blue})`;
}

/** The path a `chips-file:` link names, or nothing for any other URL or one that can't be read. */
export function fileOfLink(url: string): string | undefined {
  if (!url.startsWith(FILE_LINK)) return undefined;
  try {
    const path = decodeURIComponent(url.slice(FILE_LINK.length));
    return path === "" || path.split("/").includes("..") ? undefined : path;
  } catch {
    return undefined;
  }
}

/** The document the page is written into, and a jump to a heading within it. */
function isOwnDocument(url: string): boolean {
  return url === "about:blank" || url.startsWith("about:blank#") || url === "about:srcdoc";
}

export function pageLoad(request: PageRequest, platform: "ios" | "android"): PageLoad {
  const { url } = request;
  if (isOwnDocument(url)) return "load";
  // Said by the page, tapped or not: a colour, and nothing loads.
  if (url.startsWith(GROUND_LINK)) return "ground";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  if (url.startsWith(FILE_LINK)) {
    return tappedOn(request, platform) && fileOfLink(url) !== undefined ? "file" : "refuse";
  }
  const web = scheme === "http" || scheme === "https";
  // A frame the page draws inside itself may show a web page there; it is still inside the view.
  if (web && request.isTopFrame === false && request.hasTargetFrame !== false) return "load";
  if (!web && scheme !== "mailto") return "refuse";
  // The page itself going somewhere: only where the platform says a person tapped. iOS says;
  // Android's web view calls every load `other`, a tap and a script's `location` alike, so
  // taking every load for a tap there let a page open any address outside on its own (SEC-7).
  // Until the platform can say, a page on Android stays put.
  return tappedOn(request, platform) ? "outside" : "refuse";
}

/** Whether the platform says a person tapped it: iOS does, Android's web view never. */
function tappedOn(request: PageRequest, platform: "ios" | "android"): boolean {
  return platform === "ios" && request.navigationType === "click";
}
