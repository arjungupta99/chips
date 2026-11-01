# 0124. A file that is not a page opens in Quick Look

Date: 5 October 2026
Status: Accepted, 5 October 2026. Follows 0123 (a Markdown file opens as a page). Changes what a
file row does on an iPhone, which since M4.4 has been to hand the file to the share sheet.

## Context

ADR 0123 opened a `.md` in the app. Arjun then asked how PDFs are handled. On an iPhone a PDF was
a row that opened the share sheet, as every file that is not a photo, a video, a voice note or a
page did: a Word file, a spreadsheet, a Keynote, a CSV. The share sheet sends a file somewhere;
it does not show it. On the Mac and the web a PDF's card draws its first page and a click
downloads it.

Two options were set out on 5 October 2026: **A**, iOS's own viewer, Quick Look
(`QLPreviewController`), for every file it can draw; **B**, a PDF drawn by the page view's web
view, under Chips's bar, PDFs only. Arjun picked A ("go with A, show me on the simulator first").

## Decision

1. **On an iPhone, a file row opens the file in Quick Look**, where Quick Look can draw it: a PDF,
   Word, Excel, PowerPoint, Pages, Numbers, Keynote, CSV, plain text, and the rest of what iOS
   previews. That holds in the room and in Files. Quick Look has pages, zoom, search and its own
   Share, so Save to Files and every app are one tap further on, as they were.
2. **It is a module of the app's own**, `modules/quick-look` (`ChipsQuickLook`): `canPreview` and
   `preview`, about sixty lines of Swift, presented over whatever is in front. It shows the copy
   the phone already keeps, under the file's own name, and allows no Markup: the copy is the
   app's, and an edit would leave the room's file behind.
3. **Anywhere else, what the row did before.** A build made before the module, Android, a file
   Quick Look cannot draw: the share sheet. The web target: a download. `FileService.preview` is
   the new verb; `open` stays the share sheet, for Share in a page's bar and the viewer.
4. **Pages stay pages.** An HTML or Markdown file opens in Chips's page view (0059, 0123), a photo
   or a measured video in the media viewer (0057), a voice note plays where it stands (0054).

## Consequences

- A PDF, a document or a spreadsheet an agent sends is read on the phone it was sent to.
- The module is native, so the phone needs a new build (`pnpm phone build`, which links it).
  A build without it keeps the share sheet, so nothing breaks before then.
- The bar is Apple's, not Chips's: no version line under the name. The room's Files still says
  which version it is.
- The server types a `.docx`, `.xlsx` or `.pptx` as `application/zip` from its bytes. Quick Look
  goes by the kept file's name, which keeps its extension, so it draws them all the same.
- The Mac and the web still download a PDF on a click. Opening it in the page view's dialog,
  drawn by the browser's own viewer, is the next change and is not decided here.

## Addendum, 16 October 2026: Android opens a file in its own app, and a file leaves under its name

The Android walk ([testing/scenarios/devices/android.md](../../testing/scenarios/devices/android.md),
AN-23 and AN-24) found two things that point 3 left as they were.

- **On Android, Open is the app Android has for the file's kind** (`viewOnAndroid` in
  `spaces/local.ts`). That is a VIEW intent with the file's content URI and leave to read that one
  file, through `expo-intent-launcher` (Android-only, no iOS code). On the emulator a PDF opens in
  Drive's viewer, under its name. It had been the share sheet, headed "Sharing 1 file". A phone
  with no app for the kind refuses at once, and the file goes to the share sheet as before. Like
  the share sheet, it settles when the person comes back, so the row says "Opening…" until then.
- **On every phone, a file leaves the app under the name it was sent with** (`asSent`). The phone
  keeps a file as `att_<id>-<safe name>` (`keptNames.ts`), and that name was what the next app saw:
  the share sheet's file (`att_01M53TSVM728BN577X666MFTJ4-Trip_plan.pdf`), Quick Look's Share,
  and the gallery's entry after Save. So whatever leaves (Share, Open, Quick Look, Save) is a copy
  under the sent name (`sentName`: no folder and nothing unprintable, spaces kept), in a folder of
  its own outside the kept files. There is one copy at a time, made afresh each time.
- The copy costs one write of the file, which for a long video is a beat before the sheet comes
  up, and the space of one file. Media on this phone does not count it.
