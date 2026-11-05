# 0272. The face picker on the Mac and the web is a page

Date: 3 November 2026
Status: Accepted, 3 November 2026, on Arjun's "Build C, I want us to minimise popups in ipad, mac
and web where possible".
Mock: `chips-notes/mocks/web-face-picker/web-face-picker.html` (today, A, B and C, each with its
cost; sent in the session, not published).

## Context

On the phone a face is chosen in one picker (`apps/mobile/src/spaces/FacePicker.tsx`, ADR 0174):
your own from You (ADR 0139), a space's from a long press on Spaces or its details, an agent's from
its card (ADR 0089). It is a sheet on a phone and, since ADR 0256, a popover beside the face on an
iPad. The web and Chips for Mac had none: nothing on the web called `setMyFace`, `setSpaceIcon` or
`setAgentFace`, so faces there only showed. You on the web became the iPad's split the same day
(ADR 0265), and the sessions bringing the sidebar and the agents' pages level with the phone each
left the picker to this one.

The mock drew today's You beside three ways for the picker to stand on a computer: A, a dialog grown
out of your face, as You's short forms are (`FormDialog`); B, a popover beside the face, its arrow
on it, as on the iPad; C, a page beside You's list, as People and Relay are. A was recommended, as
the web's existing way to stand a phone sheet. Arjun chose C, and said why: fewer popups on the
iPad, the Mac and the web wherever a page can do.

## Decision

1. **A page, not a popup.** Your face on You wears the phone's pen and opens **Your face** as a page
   beside the list, the face wearing a gold ring while its page is the one open. Where You is
   narrower than 720 px the page stands in the list's place with **‹ You** at its top, as every
   page of You's does (ADR 0265). Nothing dims and nothing floats over the list.
2. **The phone's picker, part for part.** `apps/web/src/app/face/FacePicker.tsx`: the head is the
   thing being changed, its face at a row's size and its name, with "Owner · Demo" under yours;
   then the 27 colours, nine across and three deep; the letters field (a letter or two, or an emoji,
   ADR 0139); the families' names, held at the top of the page as the marks scroll under them,
   which jump to a family rather than filter; the whole library, a heading per family; and **Use
   the default** past the last mark. There is no Save: a colour saves on its own, a mark saves on
   the colour the picker is on, and letters save when the typing stops, on Enter, on leaving the
   field or on leaving the page. The head wears each pick from the click until the store's face
   is another, so it does not flicker back while the store catches up (ADR 0139's addendum of
   9 October). A refusal puts the old face back and says why at the top of the page.
3. **On a computer.** A mark says its name when the pointer rests on it. Tab reaches the colours,
   the letters, the families and the marks; inside the colours and the marks the arrow keys move
   the keyboard, and Enter or Space picks. An arrow never picks, since every save of a person's or
   an agent's face is a line in the log.
4. **The marks not chosen are drawn as on the phone.** `SpaceMark` in `packages/ui` learns the
   phone's cell paint (`cell`): ink on a quiet cell, the fold's sides the two mixed, so the paper is
   there before anything is picked. The chosen mark is lit on its colour, and an agent's in its own
   outline.
5. **One set of words.** The colours' names and their order, the letters field's words, Use the
   default, "Your face", and why a pick did not stick are core's (`packages/core/src/faceWords.ts`);
   the phone reads them from there too, and its `faceWords` and `whyNotSaved` are core's.
6. **A body any page can hold.** The picker has no frame of its own: it takes the face's name and
   line, its kind (a person, a space, an agent), the face chosen and a save. A space's page or an
   agent's page can hold it the way You does, rather than opening a dialog over the window.

## Consequences

- Your face is chosen on the Mac and the web as on the phone, and the store saves it as the phone's
  does (`store.setMyFace`, `PUT /v1/people/:id/face`). The You service gains `setMyFace`.
- The sidebar's "Change icon…" and an agent's face on its page are not wired by this change. Under
  this decision they open the picker as a page (a space's details, an agent's page), not a dialog;
  the sessions that own those places are told.
- The iPad still opens the picker as a popover beside the face (ADR 0256). Arjun's words cover the
  iPad too; moving it to a page of its split is separate work on the phone app.
- `FormDialog` forms on You (Workspace, Attachment limits, and the rest) are popups by this measure;
  they stay as they are until someone asks.
