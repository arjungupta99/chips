# 0125. A PDF opens in the page view on the Mac and the web

Date: 5 October 2026
Status: Accepted, 5 October 2026. Follows 0124 (a file that is not a page opens in Quick Look on
the iPhone), which left this open. Extends 0100 point 8 (the page view on the Mac) to PDFs, and
gives the Mac app's policy what 0055 gave the served page's.

## Context

After 0124 a PDF an agent sends is read on the iPhone. On the Mac and the web its card in the room
drew the first page, and a click downloaded it, as did its row in Files: to read it a person left
Chips. Arjun: "do the Mac and web PDF next".

And the Mac app drew no first page at all. Its content policy (`tauri.conf.json`) had no
`object-src`, so `default-src 'self'` refused the `blob:` address the card draws a PDF from. ADR
0055 found the same in the page `chipsd` serves and gave that policy `object-src blob:`; the Mac
app's own policy was never given it.

## Decision

1. **A PDF opens in the page view's dialog**, from its card in the room and from Files: the name,
   the version line from Files, Download, and the PDF under them, drawn by the browser's own viewer
   with its pages, zoom and search. `opensInView` says what opens there: a PDF, or a page small
   enough to read whole (0059's 5 MB). A PDF is shown from the object URL, never read as text, so
   it has no size cap.
2. **It is an `<object>` of type `application/pdf`**, as the card's first page already is, given
   the object URL of the bytes fetched with the device's signature. The server named it a PDF from
   its bytes (`%PDF-`) and the URL carries that type, so only the PDF viewer draws it; a browser
   with no viewer shows a line saying so, and Download is above it.
3. **The Mac app's policy gains `object-src blob:`**, as the served page's has had since 0055. It
   allows no plugin from anywhere else and no address but one the app's own script made.

## Consequences

- A PDF is read where it was sent on every client: Quick Look on the iPhone, the page view on the
  Mac and the web. Android still hands it to the share sheet, where a PDF viewer takes it.
- The Mac app draws a PDF card's first page for the first time. It needs `pnpm desktop` to carry
  the policy and the dialog; the web served by `chipsd` needs its build.
- What the viewer looks like is the browser's: Chrome's toolbar in Chrome, WebKit's in Safari and
  the Mac app.
