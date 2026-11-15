# 0295. About Chips is a page under You, and chipschat.ai has an About page

Date: 12 November 2026
Status: Accepted, 12 November 2026, on Arjun's pick from the mocks ("App B Site A") after his ask
of 11 November: "Brainstorm an "About" section that we can have. in the app under You--> About -->
And on the chipschat.ai". Changes ADR 0085's This iPhone group and ADR 0265's This computer group,
and ADR 0267's Chips menu. The letter on the site's page is a placeholder until he writes his own.

## Context

Until now You ended its This iPhone group (and on the Mac and the web, This computer) with a
Version row: the version, the build and the commit, which is what a bug report needs and nothing
a person looks for. Chips had no place that says what it is, who makes it, which version of it the
computer runs, what the last release changed, or under which licences its code and the code it is
built on are given. About Chips in the Mac's Chips menu opened the system's small panel, which
says the name and nothing else. chipschat.ai had no About page either.

One more reason: the iPhone and iPad app ships hundreds of open-source packages, most under MIT or
Apache-2.0, whose licences ask that their notices go with the app. The computers' release carries
`THIRD-PARTY-NOTICES.md` (ADR 0128); the phone carried none.

The mocks (`chips-notes/mocks/about`) showed two pages for the app, A a plain list and B the same
rows under the chip, and two for the site, A the story and B a fact sheet. He picked B and A.

## Decision

1. **Version leaves This iPhone and This computer.** In its place, an **About Chips** row stands
   with Send feedback, wearing the chip in gold and the version as its value ("1.2.4"). It opens
   About: pushed on a phone, beside the list on an iPad, the Mac and the web, as every page of You
   is.
2. **About opens on the chip.** Its pins light once round the circuit as the page comes in, and
   again when it is tapped. Under it the name, then the build in a capsule, "1.2.4 (202611111859) ·
   b45d368", which copies a line for a bug report when tapped: "Chips 1.2.4 (202611111859) ·
   b45d368 · iOS 26.1 · Mac mini on 1.2.3". Then one sentence, the 1.0 notes' first line with the
   device in it: "Chips is a chat app for you and the AI agents you already run. It runs on your
   own computer, and this phone reaches it."
3. **Your computer** says the server's machine and version, from `GET /v1/server`, which the apps
   already read. Where the server is older than the app, the group's foot says what waits for it,
   from the release's own words ("This phone has 1.2.4. Pause, No cap and See all need 1.2.4 on
   Mac mini too."), and a row opens the docs' steps for updating.
4. **What's new in 1.2.4** opens the release's changes. They live in core (`RELEASES` in
   `packages/core/src/about.ts`), newest first, each with its date, one sentence, and on the
   release the app is, its changes and what needs the computer too. The release session adds the
   entry when it cuts a version, and a test holds the newest entry to the repository's version, so
   a cut without its words fails the gate. chipschat.ai reads the same list.
5. **The links**: Website, Docs, Support, and on the phone Rate Chips on the App Store (its
   write-a-review page; the app never asks on its own) and Share Chips (the share sheet with the
   App Store link).
6. **Legal**: Privacy opens the site's page. **Licence** says the split licence in plain words
   (ADR 0128): free, the source on GitHub, the protocol, SDK and conformance kit under Apache-2.0,
   the server and apps under FSL-1.1 and each release Apache-2.0 two years after it comes out, and
   neither licence covering the name or the mark. **Acknowledgements** lists every open-source
   package the app ships, each with its licence, and folds its licence text open in place.
   `pnpm notices` writes the lists: the phone's from the packages in its iOS bundle (Metro's source
   map), the web's from its production dependencies. A test fails when a direct dependency of
   either app is missing from its list or at another version.
7. **At the foot**: "Made by Arjun Gupta." and "Chips is named after the snack, and after the
   silicon chips inside every computer."
8. **On an iPad**, What's new, Licence and Acknowledgements open in a third column beside About
   (ADR 0276); on the Mac and the web they open in About's place with ‹ About, as a person opens
   from People.
9. **About Chips in the Mac's Chips menu** is a command of the page's (ADR 0267), not the system's
   panel: it opens You with About beside the list.
10. **chipschat.ai/about/** is the story (the site's own repository): an opening that says what
   Chips is; why it exists, in Arjun's words, signed; the name and the mark; one drawing of the
   apps, the computer, the relay and the agents; each release from `RELEASES`; the licence; a press
   kit (the marks, the app icon, three screenshots, a paragraph to copy, the colours); and how to
   get in touch. "About" goes first in every page's footer. Until his letter comes, the page
   carries a placeholder and is not shipped.

## Consequences

- The release checklist grows a line: the new version's entry in `RELEASES`, with its changes as
  the App Store's What's New says them.
- A dependency change in either app needs `pnpm notices` before the gate is green.
- The phone's About reads `GET /v1/server` once each time it opens; a server that can't be reached
  leaves Your computer saying so, and the rest of the page is unchanged.
- What the words promise: nothing about what an agent will do (Arjun, 20 October 2026). They say
  what Chips is and what each row opens.
