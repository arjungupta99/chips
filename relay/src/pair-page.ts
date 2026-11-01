/**
 * The page a pairing link opens at (ADR 0210): `/pair#pair=…&v=1&lan=…&relay=…&key=…&until=…`.
 *
 * You → Pair a computer on a phone sends this link (`pairRelayUrl` in `@chipschat/protocol`), and
 * the computer opens it in a browser, on whatever network it is on. The page shows the code again,
 * so the person can see it is the one on their phone, and offers two ways on: Chips for Mac, by the
 * `chips://pair?…` link it already takes, which reaches the server through the relay when the
 * server's network is out of reach; and the server's own page, for a browser on that network. It
 * says when the code has run out instead of letting a pairing fail, and on a phone, where the link
 * was most likely tapped by mistake, it says the link is for a computer and offers to copy it.
 *
 * The iPhone app does not claim this path: a pairing link tapped on the phone that made it must
 * not pair the phone. Everything the page knows is in the fragment, as for `/join`.
 */

import { relayHtml } from "./page-parts.js";

/**
 * The payload in the page's fragment, as the links the page offers: the app's, and the server's
 * own page. Nothing for a fragment with no code, or one naming no server. Run in the browser (it
 * is this source, below), and in the tests from the same source.
 *
 * What is passed on is checked first: a code from the pairing alphabet, a server by its origin on
 * http or https, a relay on ws or wss, a key of the server's length, a time in whole seconds.
 * Anything else is dropped, so a made-up link can point the buttons nowhere but at an origin it
 * names in plain sight.
 */
export const PAIR_SOURCE = `function pairing(hash) {
  var fields = new URLSearchParams(String(hash).replace(/^#/, ""));
  var code = (fields.get("pair") || "").toUpperCase();
  if (!/^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(code)) return null;
  var lan = origin(fields.get("lan"), ["http:", "https:"]);
  if (lan === null) return null;
  var app = new URLSearchParams({ pair: code, v: "1", lan: lan });
  var browser = new URLSearchParams({ pair: code, v: "1" });
  var key = fields.get("key") || "";
  if (/^[A-Za-z0-9_-]{43}$/.test(key)) {
    var relay = fields.get("relay") || "";
    if (origin(relay, ["ws:", "wss:"]) !== null) {
      app.set("relay", relay);
      browser.set("relay", relay);
    }
    app.set("key", key);
    browser.set("key", key);
  }
  var until = fields.get("until") || "";
  return {
    code: code,
    app: "chips://pair?" + app.toString(),
    browser: lan + "/#" + browser.toString(),
    until: /^[0-9]{9,11}$/.test(until) ? Number(until) * 1000 : null
  };
}
function origin(text, schemes) {
  if (!text) return null;
  var url;
  try { url = new URL(text); } catch (error) { return null; }
  return schemes.indexOf(url.protocol) === -1 ? null : url.origin;
}
function lifeOf(until, now) {
  if (until === null) return "good once";
  var minutes = Math.max(1, Math.ceil((until - now) / 60000));
  return minutes + (minutes === 1 ? " more minute" : " more minutes") + ", once";
}`;

const SCRIPT = `${PAIR_SOURCE}
var found = pairing(location.hash);
var now = Date.now();
var $ = function (id) { return document.getElementById(id); };
if (found === null) {
  $("none").hidden = false;
} else if (found.until !== null && found.until <= now) {
  $("until").textContent = new Date(found.until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("ranout").hidden = false;
} else {
  $("code").textContent = found.code;
  $("life").textContent = lifeOf(found.until, now);
  $("open").href = found.app;
  $("open-phone").href = found.app;
  $("browser").href = found.browser;
  var phone = /iPhone|iPod|Android.+Mobile/.test(navigator.userAgent);
  $(phone ? "on-phone" : "on-computer").hidden = false;
  $("ahead").hidden = !phone;
  $("copy").addEventListener("click", function () {
    var done = function () { $("copy").textContent = "Copied"; };
    var shown = function () { $("whole").textContent = location.href; $("whole").hidden = false; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(location.href).then(done, shown);
    } else {
      shown();
    }
  });
  $("ready").hidden = false;
}`;

export const PAIR = relayHtml({
  title: "Pair a computer with Chips",
  description: "A link from your phone that pairs a computer with your Chips.",
  main: `  <section id="ready" hidden>
    <p id="ahead" class="ahead" hidden>This link is for a computer. Send it to the one you want to pair.</p>
    <h1>Pair this computer</h1>
    <p>Your phone made this link to pair a computer with your Chips. It works on any network.</p>
    <div class="code"><code id="code"></code><span>The code your phone shows · <span id="life"></span></span></div>
    <div id="on-computer" hidden>
      <a id="open" class="open" href="#">Open in Chips</a>
      <p class="note">No Chips on this computer? Chips for Mac is in testing. Ask whoever runs your Chips for a copy.</p>
      <p class="note"><a id="browser" href="#">Pair in this browser</a> instead. It opens only on the same network as your server.</p>
    </div>
    <div id="on-phone" hidden>
      <button id="copy" class="open" type="button">Copy the link</button>
      <p id="whole" class="note" hidden></p>
      <p class="note">Pairing an iPad with Chips? <a id="open-phone" href="#">Open in Chips</a>.</p>
    </div>
  </section>
  <section id="ranout" hidden>
    <h1>This code has run out</h1>
    <p>It was good until <span id="until"></span>. On your phone, open You → Pair a computer and send a new link.</p>
  </section>
  <section id="none" hidden>
    <h1>Pair this computer</h1>
    <p>This link lost its code on the way. Open the whole link from the message it came in, or send a new one from your phone.</p>
  </section>
  <noscript><h1>Pair this computer</h1><p>This page needs JavaScript to read the code in its link.</p></noscript>`,
  script: SCRIPT,
});
