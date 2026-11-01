# 0145. The Main agent and its Main room wear a Main tag, in their face's colour

Date: 9 October 2026

## Status

Accepted (Arjun, 9 October 2026: "B2, build it on phone and Web").

## Context

ADR 0087 gave each harness a Main agent living in its Main room, and the 8 October addendum named
them so. Nothing in the lists says which they are: on Spaces, *Jacobian main* and *OpenClaw main*
sit among the other rooms in the order they last spoke, and the Agents tab sets the Main agents
apart only with a "Main agent" heading. Arjun asked for a way to label both that looks "cool and
polished", and chose from a canvas of eight
(https://claude.ai/artifact/UtDbrnHJLqQuUdbfwJVPu5): a shelf of pinned faces, five tags, and a
crest on the face. He picked **B2, a tag in its own colour**.

"Lead" stays the room lead's (ADR 0104): gold, upper case. The Main tag must not read as it.

## Decision

- **The tag.** The word *Main*, sentence case, 12 points, bold, in a pill 20 points high: its
  ground is the colour the face stands on, mixed into the page's background (16% light, 30% dark),
  and its word is that colour mixed into the ink (72% light, 55% dark). So Jacobian's is orange and
  OpenClaw's pink, as their faces are, and both read as one thing with their face and as different
  from Lead's gold. Flat: no outline, no shadow, no gradient.
- **The colour** is the face's own ground, worked out the way the face does it: the ground of the
  face chosen for it, else its name's own hue (`faceGround` on the phone and in `@chipschat/ui`), from
  the same name and mark the row's face is drawn with. A face changed changes its tag.
- **Spaces.** A Main room (`space.home`) wears the tag at the start of its second line, before
  the gear and its last words. Its place in the list does not change.
- **Agents.** The Main agent wears it after its name. The "Main agent" heading goes: the Main
  agents stay first, and the tag says what the heading did. Its line under the name says where it
  is, as every other agent's does (*Jacobian · in Jacobian main*), rather than *Main agent ·
  Jacobian*, which the tag now says.
- **Said, not only seen.** A screen reader hears "Main room" or "Main agent" with the row.
- **Search.** An agent found wears it after its name too: its line is the Agents tab's, so it no
  longer says *Main agent*. A room found does not; its row never said Main.
- **Both clients**, the phone and the web (so the Mac app). Elsewhere (the room's header, the
  room sheet, an agent's page) is unchanged: those still say *Main agent* in words.

## Consequences

- One small component on each client (`MainTag`), drawn from the face's colour; no new tokens.
- The phone mixes the colours in JavaScript (`mixHex`); the web in CSS (`color-mix`).
- The Agents tab has one heading fewer; tests that looked for "Main agent" look for the tag.
