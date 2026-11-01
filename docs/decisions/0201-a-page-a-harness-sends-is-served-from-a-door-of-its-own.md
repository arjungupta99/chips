# 0201. A page a harness sends is served from a door of its own, so its script runs on the web and the Mac

Date: 18 October 2026
Status: Accepted, 18 October 2026, on Arjun's call that a mock's script runs "on the phone and
the web" under a policy that lets nothing leave (ADR 0059's addendum); the Mac's door accepted
the same evening on his "ok proceed with the 'Build the Mac app's own page door'" (the
addendum). Amends ADR 0059's addendum, point 2, and ADR 0100's point that a page's scripts do
not run on the desktop.

## Context

ADR 0059 promised that a mock's script runs. Its addendum of 18 October put an HTML page under a
policy of its own, core's `HTML_POLICY`, and the phone kept the promise. The web and the Mac did
not: the page view there (ADR 0100, `apps/web/src/app/PageView.tsx`) draws the page as an
`iframe` given its document itself, and a frame given its document takes the embedding page's
policy with it. The app's policy, served by `server/src/interfaces/http/routes/web.ts` and written
into the Mac app's `tauri.conf.json`, is `script-src 'self'`, which allows no inline script. So
the Bronze mock's Flip has never flipped on the desktop. A `blob:` or `data:` URL inherits the
same way. Loosening the app's own policy for a stranger's page is not the answer.

A frame has to load its document from a URL of its own, so that the response's headers, and
nothing of the app's, are the document's policy. The server already serves an attachment's bytes
that way, with `sandbox; default-src 'none'` and as a download (ADR 0010), to a signed request or
to a grant in the URL (ADR 0058). A frame's request can carry no device signature (ADR 0006), and
a device grant is a bearer for ten minutes: fine for a player that asks for runs of a video, more
than a page needs, and it would put the device's id in a URL the page's own script can read. The
socket already has the shape wanted here (SEC-22, finding 5): a signed request mints a
single-use ticket, and a request that cannot sign spends it.

## Decision

1. **A page door.** `POST /v1/attachments/:id/page`, signed by a person's device, for an HTML
   attachment the caller may read (its uploader, or a member of a space it was sent in; a
   harness is refused, as a grant refuses one), answers `201 { url: "/v1/pages/<ticket>",
   expires_in: 30 }`. `GET /v1/pages/:ticket` carries no credential: the ticket is spent on it,
   once, the server asks again whether the person may still read the file, and the bytes go out
   as they were stored, `text/html; charset=utf-8`, under these headers and no others of note:

   - `content-security-policy: <HTML_POLICY>; sandbox allow-scripts allow-popups
     allow-popups-to-escape-sandbox` — the policy the phone writes into the document, and the
     sandbox the frame's attribute names, so the document sandboxes itself wherever it is opened;
   - `x-content-type-options: nosniff`, `cache-control: no-store`, `referrer-policy: no-referrer`.

   A wrong, spent or expired ticket is `401`, and counts against the address by one limiter, five
   a minute, as a wrong pairing code does. The attachment route (`GET /v1/attachments/:id`) is
   unchanged: a harness's URL and a download are what they were.
2. **One ticket mechanism.** The socket ticket's store (`createSocketTickets`) becomes an
   instance of `createTickets<T>`: 32 random bytes, base64url, held in memory with a short expiry,
   good once. The page ticket is a second instance, holding the principal and the attachment it
   was minted for, for thirty seconds.
3. **One policy, in one place.** `HTML_POLICY` moves to `@chipschat/protocol`, which the server
   and the clients share; core re-exports it, so the phone's `withHtmlPolicy` and the server's
   header are the same string. A directive added for one is added for both.
4. **The web and Mac view loads an HTML page by `src`** from the door, keeping the frame's
   sandbox attribute and `referrerPolicy="no-referrer"`, where the device is on the plain link:
   a browser the server itself served, whose page came over that link anyway (ADR 0191 leaves
   that one to TLS). Where the device reaches its server through a tunnel — the relay's, or the
   door on the server's own network, which is every device holding the server's key (ADR 0191):
   the Mac app, and a browser paired to another address — a frame cannot follow the request
   inside, and a plain load would put the page's bytes on the network in the clear, which is
   what ADR 0191 refused a grant for. There, and from a server from before this door (`404`),
   the view draws the page as it did, given its document, still. A Markdown page is unchanged
   (ADR 0123). The web app's policy names the frame, `frame-src 'self'`, since the page and the
   door share an origin; the Mac app's is untouched, since it frames nothing of the server's.

What the page can see of its own URL is a spent ticket. What it cannot reach: the app (an opaque
origin, by the attribute and by the header's `sandbox`, so `window.parent` throws), the server
(`default-src 'none'`), and the network. `frame-ancestors` is not set: the app's origin on the Mac
is the shell's scheme, and a document whose ticket is spent, on an origin that is nobody's, is
worth nothing to a page that framed it.

Cost against value: one route module with its tests, one generic store the socket ticket already
paid for, one core function, one branch in the view, one line of policy; no migration, no
protocol event, no phone change. For it, a mock moves on the web as it does on the phone, under
a policy the server enforces rather than one the view writes into the document.

**The Mac app was left open here**, and is settled by the addendum below. It bundles its own
copy of the app and reaches the server through the tunnel (ADR 0191), so the server's door is
out of its reach by that decision, as a grant is.

## Consequences

- A mock's button works on the web, where the app is served by its server, which is how the web
  app is used. A page is still fetched once: the door reads the stored bytes, and the view no
  longer reads them itself for an HTML file there.
- Through the relay, and in a browser paired to another address, a page is still, as before,
  and the view reads its words as it did. Serving a page through the relay would need the relay
  to carry a frame's request, which is not decided here. The Mac app has the addendum's door.
- The web's Playwright suite runs the page's spec in a project of its own, `served`, where the
  app comes from `chipsd` itself: the Vite-served app of every other spec pairs by a typed code,
  holds the key, and goes through the tunnel, where a frame cannot follow.
- A device from before this decision draws a still page from a new server, as it did. A new
  device against an older server asks the door, is told `404`, and draws a still page.
- The ticket's thirty seconds start at the ask; the frame loads at once. A page that reloads
  itself finds its ticket spent and shows the refusal, which is the price of a URL that is worth
  nothing afterwards.
- A server change: a 4431 restart (with a backup first), then `pnpm web:build` and `pnpm desktop`.

## Addendum, 18 October 2026: the Mac app's own door

Arjun's word, the same evening: "ok proceed with the 'Build the Mac app's own page door'".

1. **The shell holds the page and serves it once.** The window fetches the page's bytes through
   its tunnel, as it does for the page's words, and hands them to the shell with the policy
   they are served under (`hold_page`, the protocol's `PAGE_HEADER_POLICY`, the same string the
   server's door answers). The shell keeps them under a key of 256 random bits for a minute at
   most and answers `chips-page://localhost/<key>`, a scheme it registers, with the bytes as
   `text/html` and the policy, `nosniff`, `no-store` and `no-referrer` as headers; the key is
   spent on the first load, and a second asks gets "That page is gone." The bytes never leave
   the window, so ADR 0191's rule stands: nothing of a keyed device crosses the network plain.
2. **The view asks the shell first.** `FileService.pageUrl` asks the shell's door where there is
   a shell, and the server's where there is none; a shell built before its door refuses the
   command, and the server's door is asked then, which through the tunnel answers nothing, so
   such a shell draws the words, still, as it did. The Mac app's policy names the scheme,
   `frame-src chips-page:`.
3. **WebKit was asked first.** A standalone WKWebView with a `WKURLSchemeHandler`
   (`probe.swift`, kept out of the repo) served a page under this header at top level and inside
   a frame of another custom scheme: the inline script ran, the document's origin was `null`
   (the header's `sandbox` held), a picture from `http:` was blocked, `fetch` was refused with a
   `TypeError`, `window.parent.document` threw `SecurityError`, and each URL was served once.
   wry 0.55.1 builds its `NSHTTPURLResponse` from the handler's header fields, so the shell's
   headers reach WebKit the same way.

Consequences:

- A mock moves on the Mac as it does on the phone and the web, and a sound or a clip written
  into it plays there now, since the app's own `media-src` no longer applies to the frame.
- Two doors, one policy: a directive added to `HTML_POLICY` or `PAGE_SANDBOX` reaches the
  server's header and the shell's by the same constant. The shell checks only that a policy was
  given; which one is the window's to say, and the window is the app's own code.
- No server change: `pnpm desktop` alone takes it live.
