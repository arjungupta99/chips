# 0112. A space is renamed where its title stands

Date: 4 October 2026
Status: Accepted, 4 October 2026. Extended the same day to an agent's name on its page (below).

## Context

Arjun: "I need the ability to change a Space name in the sheet shown when we tap the Nav title in
a space."

Most of it was there already:

- **The server.** A person's `space.updated` with a `title` (1 to 200 characters) is allowed for
  anybody in the space but a guest (rule 7). A harness may retitle only a space it opened, and a
  person's name holds over it afterwards (`open-space.ts`).
- **Core.** `store.updateSpace` sends it, and the fold writes the space's muted line, "Arjun
  renamed this space to Kitchen". The title, the Spaces list and the nav capsule follow the fold.
- **The harnesses.** Jacobian and the OpenClaw bridge read the rename in the space's context, as
  "(Arjun renamed the room "Kitchen")". Neither keeps a name of its own for the space: Jacobian's
  Space is its agent, and keeps the agent's name.
- **The Mac.** The Members panel has the name in a field with Rename beside it, shown to everyone
  in the space, a guest included.

The phone had no way to ask.

The mock ("Rename a Space", a private Artifact) drew three ways for the room sheet:

- A: the title's pencil opens a Name page, as an agent's name does on its page (ADR 0111).
- B: the title becomes a field where it stands.
- C: a Name row beside Lead and Files.

Arjun: "Go with B". The other two calls were kept as drawn:

- Who may is the server's rule.
- Renaming a space leaves its agents' names alone.

## Decision

- **The sheet's title is the room's name, and a tap edits it where it stands** (`RoomTitle` in
  `RoomSheet.tsx`), for whoever may rename the room. A pencil beside the title says so.
  - The tap turns the title into a field in the title's own size, on a well with a blue edge, and
    the keyboard comes up.
  - The keyboard's done saves. A name left empty or unchanged sends nothing.
  - A tap anywhere else puts the old name back. On the list of who is here, that is all the tap
    does while the keys are up: the list takes it to put them away, as a scroll view does.
  - A room with no name of its own (a harness's room, called by its agents) starts the field
    empty, with what it is called now as the placeholder.
- **The sheet rides the keys with its title in sight.** `Sheet`'s `keyboard` lifted the panel with
  React Native's avoiding view, which padded it by the keys' height in one go. A short page landed
  above the keys, but the room sheet's first page is tall: lifted whole, its title went off the
  top of the screen. Making the page shorter to fit was tried and dropped. The panel's glide to
  a new height (ADR 0110) sprang on its own clock, so on the simulator the sheet flew up past the
  top and then came down. The avoiding view's padding didn't animate inside the modal either: the
  panel jumped in one frame while the keys took a quarter of a second.
  - So on a phone the panel now rises with the keys' own measured frames (the keyboard
    controller's height, which the room's composer already follows). That is added to the panel's
    move on the native driver and clamped to what stands below the edge (`useLift`).
  - A page that fits above the keys rides them whole, as before. A taller one rises until its
    top reaches the top, and the keys cover its foot (Add, Lead, Files and Done) while the title
    is a field.
  - Nothing it holds changes height, so nothing springs.
  - The room sheet rides the keys on every page, so leaving New agent or Name with the keys up
    lets it down with them. A card on a wide screen keeps the avoiding view, and Android is
    unchanged.
- **The new name shows at once.** The store sends the rename and the server's echo brings it back.
  Until then the title shows the name just saved, so the field doesn't flash the old name on its
  way out. Once the room's own name changes, the title follows it.
- **A refusal is the room's notice.** A change to the room itself is now tracked as a change to
  who is in it already is (`store.updateSpace`). Turned away, it leaves the server's words above
  the room's field, and the title goes back to the old name after three seconds. Archiving and
  unarchiving from the Spaces list get the same notice.
- **Who may is core's, and matches the server** (`mayRename` in `rooms.ts`): anybody in the space
  but a guest. A guest sees the title alone, without the pencil. The Mac's Members panel uses the
  same rule, so a guest there no longer sees a Rename field the server would refuse.

## An agent's name, too

Once the title edited in place, Arjun: "I need in place renaming for the Agent detail page as
well". The agent's page (ADR 0111) had a pencil on the name that turned the sheet to a Name page,
with a field, the card's words and a gold Save.

- **The agent's name edits where it stands** (`AgentName` in `RoomSheet.tsx`), as the title does.
  A tap makes it a field, centred under the face in the name's own size. The card's words
  (`nameWords`) take the place of the harness line under it.
- **Done keeps the field until the server answers** (`submitBehavior="submit"`). A rename is a
  request the server can refuse, which a room's title is not: another agent may have the name.
  Taken, the field goes, and the page shows the new name, read again from the directory. Turned
  away, the name stays as typed, with the server's reason in red where the card's words were. A
  name left empty or as it was sends nothing.
- **A tap anywhere else puts the name back**, as for the title.
- **The Name page is gone**, and so is the sheet's `rename` page.
- Who may rename an agent, and the name the field starts from (without a fork's " · fork"), are
  still the card's (`agentCard`'s `mayName` and `ownName`, ADR 0091).

## Consequences

- Nothing changes on the server, the protocol, Jacobian or the bridge, and there is no migration.
  Going live means installing the phone and the Mac app, and rebuilding the web copy 4431 serves.
- B has no room for words about what a rename does. The room's line says it after the fact.
- Every sheet that holds a field (the room sheet, You's name and workspace sheets) rises with the
  keys' own frames on a phone, instead of jumping with the avoiding view's padding.
- A space made with + often has a lead agent named after it. Renaming the space leaves the agent's
  name, and its own page renames it (ADR 0111).
- A name can't be cleared back to none: the server takes 1 to 200 characters.

## Addendum, 16 October 2026: a sheet rides the keys on Android too

"Android is unchanged" left Android's sheets on the avoiding view's padding, and since the
keyboard controller puts the app edge to edge, Android's window no longer resizes for the keys.
On the emulator the room sheet's rename and You's name went under them (AN-7). `useLift` now
rises with the keys' measured frames on any phone (`NATIVE`, not iOS alone). The keyboard
controller's height works inside Android's Modal dialogs, so the sheet rides the keys there as it
does on an iPhone. A card on a wide screen still keeps the avoiding view.
