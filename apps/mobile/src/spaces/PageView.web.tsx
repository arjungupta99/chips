/**
 * A page on the web target: an `iframe` given the document itself and sandboxed to scripts (ADR
 * 0059, `page.ts`). Without `allow-same-origin` it has an origin of its own that is nobody's, so it
 * cannot read the app, its storage or its key; without `allow-top-navigation` it cannot take the
 * tab away from the app; without `allow-forms` it sends nothing anywhere. A link that opens a window
 * of its own opens a tab, outside the sandbox, as a link in any page would.
 */

import { createElement } from "react";

export function PageView({
  html,
  title,
  ground = "#fff",
  onReady,
}: {
  readonly html: string;
  readonly title: string;
  readonly ground?: string | undefined;
  readonly onReady: () => void;
  readonly onFailed: (why: string) => void;
}) {
  return createElement("iframe", {
    srcDoc: html,
    title,
    onLoad: onReady,
    sandbox: "allow-scripts allow-popups allow-popups-to-escape-sandbox",
    referrerPolicy: "no-referrer",
    "data-testid": "page-view",
    style: { flex: 1, width: "100%", height: "100%", border: 0, backgroundColor: ground },
  });
}
