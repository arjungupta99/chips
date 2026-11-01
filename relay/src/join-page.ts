/**
 * What a relay serves besides its doors (ADR 0207): the page an invite link opens at,
 * `/join#invite=…&lan=…&relay=…&key=…`, and the file that lets the iPhone app take that link; and
 * since ADR 0210 the page a pairing link opens at, `/pair#…` (`pair-page.ts`).
 *
 * A server with a relay sends its invites as this page's link, since the relay is on the open
 * internet where the server may not be (`inviteRelayUrl` in `@chipschat/protocol`). Tapped on an
 * iPhone with Chips, the link never loads here: iOS has read the relay's
 * `apple-app-site-association`, and Chips opens at its join card. Everywhere else this page loads.
 * Everything it knows is in the fragment, which a browser never sends, so the relay serves the same
 * bytes to everybody and learns nothing of the invite. The page offers the app (`chips://join?…`,
 * the link the apps already take, ADR 0164), and the server's own join page for a browser on the
 * server's network, where it loads.
 *
 * No request is made from the page: no fonts, no pictures, no script from anywhere, which its
 * Content-Security-Policy holds it to (`page-parts.ts`).
 */

import { type RelayPage, relayHtml } from "./page-parts.js";
import { PAIR } from "./pair-page.js";

export type { RelayPage } from "./page-parts.js";

/** The App Store app's id, `<team>.<bundle>`, as `apps/mobile/app.json` names it. */
export const APP_ID = "W9K648WB82.chat.chips.app";

/** The paths the iPhone app takes from this relay's links, for `apple-app-site-association`. */
export const APP_SITE_ASSOCIATION = JSON.stringify({
  applinks: {
    details: [
      {
        appIDs: [APP_ID],
        components: [{ "/": "/join", comment: "An invite to a workspace (ADR 0207)" }],
      },
    ],
  },
});

/**
 * The invite in the page's fragment, as the two links the page offers: the app's, and the
 * server's own page. Nothing for a fragment with no invite, or one naming no server. Run in the
 * browser (it is this source, below), and in the tests from the same source.
 *
 * What is passed on is checked first: a token as the server makes them, a server by its origin on
 * http or https, a relay on ws or wss, a key of the server's length, a time in whole seconds.
 * Anything else is dropped, so a link somebody made up can point the buttons nowhere but at an
 * origin it names in plain sight.
 *
 * `lifeOf` is what the page says about the link's life: when it runs out, the time on its last
 * day and the date before that, and what to do once Chips is installed if it has run out by then.
 * Who sent it can't add anybody to a test of the app, so the page names no store and no test.
 */
export const LINKS_SOURCE = `function invite(hash) {
  var fields = new URLSearchParams(String(hash).replace(/^#/, ""));
  var token = fields.get("invite") || "";
  if (!/^chips_inv_[A-Za-z0-9_-]+$/.test(token)) return null;
  var lan = origin(fields.get("lan"), ["http:", "https:"]);
  if (lan === null) return null;
  var app = new URLSearchParams({ invite: token, lan: lan });
  var key = fields.get("key") || "";
  if (/^[A-Za-z0-9_-]{43}$/.test(key)) {
    var relay = fields.get("relay") || "";
    if (origin(relay, ["ws:", "wss:"]) !== null) app.set("relay", relay);
    app.set("key", key);
  }
  var until = fields.get("until") || "";
  return {
    app: "chips://join?" + app.toString(),
    browser: lan + "/#" + new URLSearchParams({ invite: token }).toString(),
    until: /^[0-9]{9,11}$/.test(until) ? Number(until) * 1000 : null
  };
}
function origin(text, schemes) {
  if (!text) return null;
  var url;
  try { url = new URL(text); } catch (error) { return null; }
  return schemes.indexOf(url.protocol) === -1 ? null : url.origin;
}
function whenOf(until, now) {
  var at = new Date(until);
  if (at.toDateString() === new Date(now).toDateString()) {
    return at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return at.toLocaleDateString([], { month: "long", day: "numeric" });
}
function lifeOf(until, now) {
  var after = "by the time Chips is installed, ask whoever sent it for a new one.";
  if (until === null) return "If this link has run out " + after;
  return "This link works until " + whenOf(until, now) + ". If it has run out " + after;
}`;

const SCRIPT = `${LINKS_SOURCE}
var found = invite(location.hash);
var now = Date.now();
var $ = function (id) { return document.getElementById(id); };
if (found === null) {
  $("none").hidden = false;
} else if (found.until !== null && found.until <= now) {
  $("until").textContent = whenOf(found.until, now);
  $("ranout").hidden = false;
} else {
  $("open").href = found.app;
  $("browser").href = found.browser;
  $("life").textContent = lifeOf(found.until, now);
  $("invite").hidden = false;
}`;

const JOIN = relayHtml({
  title: "Join on Chips",
  description: "An invite to a workspace on Chips, where people and their agents talk.",
  main: `  <section id="invite" hidden>
    <h1>Join on Chips</h1>
    <p>You've been invited to a workspace on Chips, where people and their agents talk.</p>
    <a id="open" class="open" href="#">Open in Chips</a>
    <p id="life" class="note"></p>
    <p class="note"><a id="browser" href="#">Join in this browser</a> instead. It opens only on the same network as the server.</p>
  </section>
  <section id="ranout" hidden>
    <h1>This link has run out</h1>
    <p>It was good until <span id="until"></span>. Ask whoever sent it for a new one.</p>
  </section>
  <section id="none" hidden>
    <h1>Join on Chips</h1>
    <p>This link has lost its invite on the way. Open the whole link from the message it came in, or ask for a new one.</p>
  </section>
  <noscript><h1>Join on Chips</h1><p>This page needs JavaScript to read the invite in its link.</p></noscript>`,
  script: SCRIPT,
});

const ASSOCIATION: RelayPage = {
  status: 200,
  headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
  body: APP_SITE_ASSOCIATION,
};

/** The page a request's path asks for, or nothing when it asks for none of them. */
export function relayPage(method: string | undefined, path: string): RelayPage | undefined {
  if (method !== "GET" && method !== "HEAD") return undefined;
  if (path === "/join") return JOIN;
  if (path === "/pair") return PAIR;
  if (path === "/.well-known/apple-app-site-association") return ASSOCIATION;
  return undefined;
}
