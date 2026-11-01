/**
 * A Markdown file a harness sent, as a page (ADR 0123). Jacobian's agents hand their finished work
 * over as `.md` — the Mission Murals walking tour of 5 October 2026 was eight stops of headings,
 * lists and sourced links — and the phone handed it to the share sheet, where nothing draws
 * Markdown. So it is turned into a document here, once, and drawn by the same view an HTML page
 * is drawn in (ADR 0059 on the phone, ADR 0100 on the Mac), which reaches nothing of the app's.
 *
 * This is the whole of Markdown, tables included, which a message's own words are not
 * (`markdown.ts`): a file a person chose to open is a document, and a document is what they asked
 * to see. The author's HTML is not part of it. `markdown-it` escapes raw HTML (`html: false`) and
 * refuses `javascript:`, `vbscript:`, `file:` and `data:` links on its own, and the document's
 * policy allows no script and nothing fetched but pictures, so a page made from somebody else's
 * Markdown is words, links and pictures and nothing else.
 *
 * It is drawn in the app's own colours and type, so it reads as the app's and not as a web page:
 * the caller hands over its palette, light or dark, and the size its body is set in.
 */

import { HTML_POLICY } from "@chipschat/protocol";
import MarkdownIt from "markdown-it";

/** The colours a page is drawn in: the client's own palette, by the names both clients use. */
export interface PageInk {
  readonly scheme: "light" | "dark";
  /** The page's ground. */
  readonly bg: string;
  readonly ink: string;
  /** A quotation's words. */
  readonly ink2: string;
  /** A rule, and a table's lines. */
  readonly line: string;
  /** A quotation's bar, and the line under a link. */
  readonly line2: string;
  /** Behind code and a table's heading row. */
  readonly surface2: string;
  readonly blueInk: string;
  /** The body's size in pixels: 17 on a phone, as a message is set; 15 on the Mac. */
  readonly size: number;
}

const markdown = new MarkdownIt({ html: false, linkify: true, typographer: false });

// A link is to the web, to mail, or within the page, and nothing else is one (SEC-31): a
// `chips://` link would reach the app itself on the Mac and the web target, where the frame hands
// a scheme it cannot load to the system. Written any other way, it stays the words it was.
markdown.validateLink = (url) => /^(https?:|mailto:|#)/i.test(url.trim());

// A link to the web or to mail opens outside the page: in a new tab on the Mac and the web target,
// where the frame may not navigate the app's window; in Safari or Mail on a phone, where every
// load is put to `pageLoad`. One within the page stays in it.
markdown.renderer.rules["link_open"] = (tokens, index, options, _env, self) => {
  const token = tokens[index];
  const href = String(token?.attrGet("href") ?? "");
  if (token !== undefined && /^(https?:|mailto:)/i.test(href)) {
    token.attrSet("target", "_blank");
    token.attrSet("rel", "noopener noreferrer");
  }
  return self.renderToken(tokens, index, options);
};
// A table wider than the screen scrolls on its own, rather than taking the page sideways with it.
markdown.renderer.rules["table_open"] = () => '<div class="wide"><table>\n';
markdown.renderer.rules["table_close"] = () => "</table></div>\n";

/**
 * What a Markdown page may do (ADR 0123): no script, no frame, no font or style fetched, nothing
 * sent anywhere; only pictures may be loaded, from anywhere, and the page's own styles apply.
 */
export const PAGE_POLICY =
  "default-src 'none'; img-src http: https: data:; style-src 'unsafe-inline'";

/**
 * What somebody else's HTML page may do (ADR 0059 and its addendum): its own script runs, written
 * in the page, since a mock that moves is what it is for, and nothing leaves. The string is the
 * protocol's (ADR 0201), since the server answers it as a header from the page door the Mac and
 * the web load a page from, and the phone writes it into the document here; it is re-exported so
 * every client reads it from one place.
 */
export { HTML_POLICY };

const meta = (policy: string) => `<meta http-equiv="Content-Security-Policy" content="${policy}">`;

/** A whole HTML document for a Markdown file, drawn in the given ink. */
export function markdownPage(source: string, ink: PageInk): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${meta(PAGE_POLICY)}
<style>${style(ink)}</style>
</head><body>
${markdown.render(source)}</body></html>`;
}

/**
 * Somebody else's HTML document under `HTML_POLICY`: an HTML file an agent or a person posted
 * went to the phone's web view as it came, and its script could probe the network the phone was
 * on and ask for the camera in Chips's name (SEC-7). Under it the script still runs, and reaches
 * nothing.
 *
 * The policy goes first, after the doctype if there is one, and not into the author's `<head>`:
 * a browser applies a meta policy from where it stands, so anything written before it — a
 * script ahead of the head, say — would run free. Put first, the parser opens the head for it,
 * and the author's own `<html>`, `<head>` and everything in them land where they meant them to.
 * What the author wrote is kept whole; a policy of their own still applies beside this one. The
 * Mac and the web load a page from the server's page door instead, which answers the same policy
 * as a header (ADR 0201), and write it into the document only where the door is out of reach.
 */
export function withHtmlPolicy(html: string): string {
  const doctype = /^\s*<!doctype\b[^>]*>/i.exec(html);
  const at = doctype === null ? 0 : doctype[0].length;
  return `${html.slice(0, at)}${meta(HTML_POLICY)}${html.slice(at)}`;
}

function style(ink: PageInk): string {
  return `
:root { color-scheme: ${ink.scheme}; }
html { -webkit-text-size-adjust: 100%; background: ${ink.bg}; }
body { margin: 0; padding: 16px 20px 48px; color: ${ink.ink}; background: ${ink.bg};
  font: ${ink.size}px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  overflow-wrap: anywhere; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.5em; font-weight: 700; letter-spacing: -0.01em; }
h1 { font-size: 1.6em; margin-top: 0.4em; }
h2 { font-size: 1.3em; }
h3 { font-size: 1.12em; }
h4, h5, h6 { font-size: 1em; }
p, ul, ol, blockquote, pre, .wide { margin: 0 0 0.85em; }
strong { font-weight: 650; }
a { color: ${ink.blueInk}; text-decoration: underline; text-decoration-color: ${ink.line2}; text-underline-offset: 2px; }
ul, ol { padding-left: 1.3em; }
li { margin: 0.3em 0; }
li > p { margin: 0; }
hr { border: 0; border-top: 1px solid ${ink.line}; margin: 1.6em 0; }
blockquote { margin-left: 0; padding: 0 0 0 0.9em; border-left: 3px solid ${ink.line2}; color: ${ink.ink2}; }
code { font: 0.88em/1.4 ui-monospace, "SF Mono", Menlo, monospace; background: ${ink.surface2}; border-radius: 5px; padding: 0.1em 0.3em; }
pre { background: ${ink.surface2}; border-radius: 10px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: 0.85em; overflow-wrap: normal; }
.wide { overflow-x: auto; }
table { border-collapse: collapse; font-size: 0.9em; overflow-wrap: normal; }
th, td { border: 1px solid ${ink.line}; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: ${ink.surface2}; font-weight: 650; }
img { max-width: 100%; height: auto; border-radius: 10px; }
`;
}
