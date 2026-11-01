/**
 * What somebody else's HTML page may do (ADR 0059 and its addendum, ADR 0201). A harness writes
 * what its model writes, so a page it sends is untrusted whatever the harness is; and a mock is
 * what it is for, so its script runs. Under this policy a script written in the page runs, an
 * inline handler too, and a picture, a font, a sound or a clip the page carries in itself is
 * drawn and played (a `data:` address, or a `blob:` its script made), so a page that is one
 * file whole is everything it needs. Nothing leaves: no script by address, no `eval`, nothing
 * fetched, sent, framed or connected, and no picture, font or media from the network, so a
 * script cannot reach the network the device is on, not even by loading something from it and
 * timing the answer.
 *
 * It is here, in the package the server and the clients share, because it is written in two
 * places that must agree: the phone writes it into the document (`withHtmlPolicy` in core), and
 * the server answers it as a header from the page door (`GET /v1/pages/:ticket`), where the
 * frame on the web loads the page from. A directive added for one is added for both.
 */
export const HTML_POLICY =
  "default-src 'none'; img-src data: blob:; font-src data:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";

/**
 * What the frame the Mac and the web draw a page in may do (ADR 0059, decision 2; ADR 0100):
 * scripts, and a window opened by a tap, which escapes the sandbox so a link in a mock opens as a
 * page of its own. No `allow-same-origin`, so the page's origin is nobody's and it reaches nothing
 * of the app's; no top navigation, no forms. The page door answers the same words in its policy's
 * `sandbox` directive, so the document sandboxes itself wherever it is opened.
 */
export const PAGE_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/**
 * The policy a page's door answers as a header, on the server (`GET /v1/pages/:ticket`) and in
 * the Mac shell (`chips-page://`, ADR 0201's addendum): what the page may do, and the sandbox it
 * is drawn in, so the document sandboxes itself wherever it is opened.
 */
export const PAGE_HEADER_POLICY = `${HTML_POLICY}; sandbox ${PAGE_SANDBOX}`;
