# 0271. Connect a harness on the Mac and the web says the phone's words

Date: 3 November 2026
Status: Accepted, 3 November 2026: the phone's gallery, its card for a harness here already, its
three steps, its kept link and its words once a request is decided (ADR 0190) brought to the
desktop on Arjun's word of 2 November, "make sure they are parity with phone, highly polished".

## Context

Arjun, 2 November 2026, with Chips for Mac just installed: "I think the desktop app and web are super
behind ... thoroughly walk through each and make sure they are parity with phone, highly polished."

The phone's gallery says "Pick what runs your agents. You run one line on that computer, and it
shows up here.", lists the docs' cards, then the two ways the app carries under **Or build your
own**. A docs card for a harness here already says "Connected here. Tap for another, or a new
agent." Picking it shows the card that asks first (ADR 0190, point 1), whose gold button is **New
{name} agent** for whoever may ask the harness for one.

The desktop's gallery said "Pick how your harness connects. It joins as an agent you can talk to and
supervise from your phone.", drew the two ways in the same list as the docs' cards, and kept a
connected card's own line. Its card for a harness here already said "A new agent of it starts in a
space of its own." and had no button that did it: only Back, Connect another and Open its page.

## Decision

1. **The gallery is the phone's.** Its line is core's `GALLERY_LEDE`; the two ways stand under
   `ownWayHeading` ("Or build your own", or "Build your own" when there are no docs' cards); a
   card for a harness here already says `connectedHereLine("Click")`. The welcome keeps its own
   title and line.
2. **New agent from the card for a harness here already.** For whoever may ask it for an agent
   (`mayAskFromPage`), **New {name} agent** is the card's main button, beside Back, Connect another
   and Open its page. It puts the dialog away and opens the harness's page with its New agent
   dialog up, grown out of the page's New agent button, as the phone opens its New agent sheet.
3. **Every card follows its link in the phone's three steps** (`LinkSteps`): Making a link, then
   Link ready, {name} connects (with its minutes left, or where it took its key) and Says hello,
   under "What happens", from the card's first frame, as a bridge's card on another computer
   already did (ADR 0257). Where the link stopped is said under them with the card's name. The
   desktop's five steps, drawn only once the link was made, go from the connect card.
4. **A link outlives the dialog.** The link a card made is kept above the dialog (`KeptLink`), as
   the phone's provider keeps it (ADR 0190, point 2). Put away while it waits, the dialog leaves it
   working: the shelf's last tile reads **Waiting** with its minutes left ("14:12"), then
   **Connecting** · One moment… once its harness has taken its key (core's `waitingLink` and
   `connectTileWords`), and Connect opens on that card and link again, with what it was allowed,
   making no other. Back from it is the gallery. Once the harness is here, or the link has run
   out or been withdrawn, the tile says Connect again and opens on the gallery.
5. **A request once decided says the phone's words** (core's `decidedWords`): a tick and "Tide
   joined" / "Its space is on your Spaces.", "{name} is paired" / "It opens on Noor's Spaces.",
   "Allowed" / "Tide is collecting its key.", or "Not allowed" / "Somebody said no." and "It
   expired" / "It can ask again.". The desktop's dialog keeps Done, and Open its space once a
   harness has one; its five steps and its one-line sentences ("Paired as Noor.") go.
6. **The allow sheet's words are core's** (`ALLOW_WORDS`, `askingName`, `askingTitle`,
   `codeWords`): "Tide wants to join", "It asks to", "Pair it as", the note under them, the code's
   line, Allow and Don't allow, which both clients said in copies of their own.
7. **A member keeps the shelf's Connect tile.** The phone shows it to owners and admins only, but
   on the desktop a member's tile opens the form that makes a harness and its key, which the phone
   does not have, and ADR 0261 (point 2) keeps it. This is not a difference to close.

## Consequences

- The desktop and the phone say the same thing about what the gallery is for and what a connected
  card offers, from one place in core.
- The phone still has its own copies of these words in `apps/mobile/src/harnesses/Connect.tsx`;
  pointing it at core's is a phone change for another session.
