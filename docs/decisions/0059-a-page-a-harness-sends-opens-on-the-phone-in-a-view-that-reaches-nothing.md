# 59. A page a harness sends opens on the phone, in a view that reaches nothing

Date: 15 September 2026 · Status: accepted

## Context

On 15 September 2026 Jacobian's Chess Game space asked Arjun to approve a Bronze theme. Its message
said *please open and review the interactive mock that arrived with this approval*, and the mock
was an HTML file of 11 KB: one inline script, no network. The phone drew it as a file row, and
the row opened the share sheet. On an iPhone nothing there draws a web page, so the mock could not
be looked at on the phone it was sent to, while the question it was for waited on it. He asked to
be able to open it in the app.

ADR 0010 decided that the server never renders an uploaded HTML file: it goes out as a download,
with `nosniff` and a sandboxing CSP, because a page drawn on the server's origin could read and act
as whoever opened it. That still holds for the server. What it did not decide is what a client does
with the bytes once it has fetched them with its own signature. The desktop downloads them. The
phone had no answer but the share sheet.

A page from a harness is somebody else's code, and a harness writes what its model writes, so the
page is untrusted whatever the harness is. On a phone the things worth protecting are the device
key in the Keychain, the cache of the workspace's log, the files the app keeps, and the app's own
links. A `chips://pair?…` link opened in the app pairs it with whatever server the link names.

## Decision

1. **An HTML file opens as a page in the app**, over the room, with Done, its name and Share, on
   the iPhone, on Android and on the web target. Anything else still opens as it did. Share is the
   share sheet the row used to open. The page is read from the copy the phone already keeps, so the
   bytes are fetched once, and a page over 5 MB is handed to the share sheet instead.
2. **The page reaches nothing of the app's.** On a phone it is a `react-native-webview` with no
   bridge (no `onMessage`, nothing injected), no file access, no cache, an incognito store that
   goes with the view, and its document at `about:blank`. On the web target it is an `iframe`
   sandboxed to `allow-scripts allow-popups allow-popups-to-escape-sandbox`: an origin that is
   nobody's, no top navigation, no forms. Its scripts run, since a mock is what it is for.
3. **Every load is put to one rule, `pageLoad` in `apps/mobile/src/spaces/page.ts`**, which is pure
   and tested. The page's own document and a jump within it load. A frame inside the page may show
   a web page there. A web address or an email a person *tapped* opens in the platform's browser or
   mail; Android does not say whether it was a tap, so there any web address the page itself goes
   to opens outside. Everything else is refused: a page leaving by itself, a form sent, and every
   other scheme, `chips:`, `file:`, `javascript:`, `data:`, `intent:` and `tel:` among them.
   `originWhitelist` is `["*"]` so that the library hands every load to the rule. Left as it comes,
   the library passes a URL outside the list straight to `Linking.openURL`, which is how a page
   would reach this app's own links.
4. **A build without the native half keeps the share sheet.** `react-native-webview` is a native
   module, and loading it on a build made before it stops the app, so the row asks
   `TurboModuleRegistry.get("RNCWebViewModule")` first and loads the view lazily.

## Consequences

- A mock, a report or a chart a harness sends as HTML is looked at where the question about it
  is answered. The phone needs a build of the app made since this decision, which `pnpm phone`
  makes. The dependency is `react-native-webview` 13.16.1, the version Expo SDK 57 names.
- A page cannot pair the phone, read its key, its cache or its files, keep anything past the view,
  or navigate itself away. It can still draw whatever it likes inside the view, including a form
  that looks like a sign-in. The view stands under a bar with the file's name, and the page's
  address is never shown as a site's. Its scripts can reach the network, as any page can; a page
  that fetches something tells that server it was opened, which a download opened elsewhere would
  have told it too.
- The desktop still downloads an HTML file. Drawing it there would need the same rule in the
  desktop shell's own web view, and is not decided here.
- ADR 0010's server posture is unchanged: the server serves the bytes as a download to a signed
  request, and the client decides how to draw them.

## Addendum, 18 October 2026: a page's script runs, and nothing leaves it

The security review of 17 October found that a page's script could fetch addresses on the
network the phone was on and ask for the camera in Chips's name (SEC-7). Its first fix,
`b907c0fe`, put an HTML file under the policy a Markdown page is made with (ADR 0123):
`default-src 'none'` and no script. That took back decision 2's promise on the phone: the Bronze
mock's button did nothing, and `media.spec.ts` failed on it from then on. Arjun's call, on
18 October: a mock's script runs, under a policy that lets nothing leave.

1. **An HTML file has a policy of its own**, core's `HTML_POLICY`:
   `default-src 'none'; img-src data: blob:; font-src data:; media-src data: blob:;
   style-src 'unsafe-inline'; script-src 'unsafe-inline'`.
   A script written in the page runs, an inline handler too. None is loaded by address, and
   `eval` is not allowed. Nothing is fetched, sent, framed or connected. A picture, a font, a
   sound or a clip comes only from the page itself, as a `data:` address or a `blob:` its script
   made, so a script cannot load one from the network and time the answer. Fonts and media were
   added the same evening, in Arjun's words: "allow fonts, sound and video built into the file
   (font-src data:, media-src data: blob:) … Keep no network otherwise." `withHtmlPolicy` puts
   the policy first in the document, after a doctype, as SEC-7's fix did. A Markdown page keeps
   `PAGE_POLICY`: no script, and pictures from anywhere.
2. **An HTML page is one file, whole.** Its styles, scripts, fonts, pictures, sounds and clips
   are written into it, since it fetches nothing. That is what a harness is told to send.
3. **All three apps draw an HTML page under it.** On the phone (iOS, Android and its web target)
   the script runs. On the web, where the app is served by its server, the frame loads the page
   from the server's page door, and in the Mac app from the shell's own (`chips-page://`); each
   answers the same policy as a header, so the script runs there too and a sound or a clip
   written into it plays (ADR 0201 and its addendum, which amend this point). Wherever a browser
   reaches its server through a tunnel, the page's frame is still given its document and takes
   the app's own policy with it, which allows no inline script (ADR 0100), so a mock there is
   still, as it was: its fonts draw, but a sound or a clip written into it does not play, since
   the app's own `media-src` has no `data:`. What the shared policy adds there is that nothing
   leaves the page either, an outside picture included.
4. **The rest of SEC-7's fix stands.** The phone's view denies the camera and the microphone, and
   on Android a page opens nothing outside, since its web view cannot tell a tap from a page
   leaving by itself. That replaces decision 3's sentence about Android.

Consequences:

- A mock that moves moves on the phone again. The Consequences' "its scripts can reach the
  network, as any page can" no longer holds.
- A page that drew pictures, fonts or media from the web no longer has them. One that carries
  them in itself (`data:`) does. A mock that loads a library or a stylesheet from elsewhere goes
  without.
- What a content policy cannot hold. CSP has no directive for WebRTC, so a page's script could
  still open a peer connection to a server it names, and time addresses through it. A browser
  may also look up a name the page mentions (DNS prefetch). The page holds nothing of the app's to
  send either way. Noted here, not closed.
- A page's scripts on the web run from the server's page door, and on the Mac from the shell's
  own (ADR 0201 and its addendum).

## Addendum, 3 November 2026: a page says the colour it is drawn on

The phone's web view is drawn see-through, and it stood on white for every page, so a dark page
pulled past its top or its foot showed a white band (Arjun, 3 November 2026: "The background behind
dark HTML is also light, which looks off").

A script put in the page as it starts (`GROUND_SCRIPT`) waits for it to load. It then reads the
colour the page is drawn on: the root's background, or the body's, or the canvas's own for the
page's colour scheme. It reads it again when the page turns light or dark. It says the colour by
going to `chips-ground:r,g,b`, which never loads. `pageLoad` answers `ground` for it, tapped or not,
on either platform, and the view stands on that colour. Until the page has said, the view stands on
the app's own ground. A page made from Markdown is drawn on the ground it is given and says nothing.

The view still has no bridge to the app. The library adds the script it runs at a document's end
only with one, which is why this one goes in at the start. The page's own script can go to that
address too, and all it can do is choose the colour shown past its own edges. `groundOfLink` reads
three numbers from 0 to 255 and nothing else.
