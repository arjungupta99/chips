# 0138. Agents drift in Search's backdrop too, each face in a breathing glow

Date: 7 October 2026
Status: Accepted, 7 October 2026. Phone, Mac and web; live on 4431's page, the Mac app and his
iPhone that night. Revised later that night (decision 5): eighteen places, and faces dim but never
see-through. Amends ADR 0136 (decisions 1 and 2, and its "not done: agents' faces").

## Context

Search's backdrop drifts the faces of your open spaces (ADR 0136). Seeing it live, Arjun asked
for "a halo effect behind the floating icons", "the agent icons floating as well", and "agent
icons show with the pins".

A mock (a private artifact, kept out of the repo) showed today's backdrop, the agents added with
no halo, and four halos behind every face, room or agent: **A · Glow** (a steady glow of the face's
own colour), **B · Breathing glow** (the same, swelling and settling, each face out of step),
**C · Gold aura** (one gold glow behind every face) and **D · Ripple** (a ring leaving each face
and fading). He picked **B**.

## Decision

1. **Spaces and agents lend their faces together**, the most recently active first: the open
   spaces by their last line, the agents that aren't archived by their room's last line, as the
   Agents tab orders them. On a tie a room goes before its agent; an agent in no room goes after
   every one in a room. As many as there are places (eighteen since decision 5), filling them round
   and round as before (`backdropLenders`, core's `searchBackdrop.ts`).
2. **An agent wears its pins at every depth.** Its face is its bitten body with its pins, as the
   lists draw it; on the phone the far faces (28 points) are under the 32 points at which a face
   otherwise drops its pins, and keep them here. The pins rest as lit as the mark's (0.55, not the
   lists' 0.3), or the backdrop's faintness would put them out.
3. **A breathing glow behind every face**: a round light of the face's own colour (the ground it
   stands on), 2.3 times the face across, 80% strong at its middle, 34% half way out and nothing at
   its edge. It swells from 0.72 of that size and 0.3 of its strength to 1.1 and its whole strength
   and settles back, eighteen times in the backdrop's four-minute round (a breath in a little over
   13 seconds), each place starting at its own point in a breath, so no two swell together. It
   sits inside the face's sway, so it drifts, sways and fades with the face, at the face's depth.
4. Everything else is ADR 0136's (but for decision 5): hidden from VoiceOver and screen readers,
   taps go through, a third of its strength, gone once you type, stopped where it can't be seen,
   still with Reduce Motion (or `prefers-reduced-motion`), and the faces held while you look.
5. **Denser, and dim rather than see-through** (revised that night, on his "increase the density
   of icons by 15%. And the icons should not be transparent, they can be dim. Transparent icons
   look off when they overlap"):
   - **Eighteen places**, not sixteen: one more at the middle depth and one more near, in the two
     widest gaps across (0.80 and 0.48), their starts and sways the same steps on.
   - **Each face over its own silhouette** in the page's colour, the face drawn over it at its
     depth's strength (full, 72%, 46%, as before). A far face is as dim as it was, but where faces
     cross the nearer hides the farther instead of showing it through. The glow keeps the face's
     depth. The fade under the field still thins a face out as it reaches the top.

### How each client draws it

- **Core** (`searchBackdrop.ts`): `backdropLenders` (spaces and agents, from `agentsTab`), and
  `BACKDROP_GLOW` (its size, its breath and how many breaths a round).
- **The phone** (`search/Backdrop.tsx`, `search/drift.ts`): each glow is an SVG radial gradient
  drawn once behind its face; its size and strength read the backdrop's one native clock through
  `breathe`, a cosine sampled eight times a breath. An agent is `Avatar` with `pinsAlways`, which
  `AgentFace` takes as pins inside its box at any size, resting at the mark's light.
- **The silhouette** (decision 5): on the phone a rounded view in the page's colour for a room's
  face (`avatarCorner`), and for an agent an SVG of its bitten body and its pins (`bittenPath`,
  `pinsOf`), with the face in a view at its depth's strength over it. On the web the face is drawn
  twice: once through an SVG filter that floods its shape with `--bg` (its half-lit pins made
  solid), and once at its depth's strength over that.
- **The web and the Mac** (`SearchBackdrop.tsx`, `styles.css`): each glow is a `radial-gradient`
  behind its face, breathing by one CSS animation that goes each way in half a breath, its place's
  start a negative delay. An agent is the lists' `Avatar`, drawn at 32 pixels with its pins and
  scaled to its depth; the backdrop lights its pins to 0.55.

## Consequences

- Eighteen glows on the phone, each a gradient drawn once, and eighteen silhouettes; the breath is
  two more interpolations of the clock per face, on the native side. On the web each face is drawn
  twice, and the browser's compositor runs the motion.
- A room named after its one agent and that agent can both drift: one as the room's face, one as
  the agent's bitten body.
- Walked on a Release simulator (iPhone 17 Pro, iOS 26.5) over a scratch copy of his workspace,
  light and dark, and on the web in the app's browser, light and dark (16 faces, 10 of them agents,
  every one with its pins). Not walked: Reduce Motion on a device, his iPhone, the Mac app and
  4431's page.
- Decision 5 walked on the Release simulator, dark and light: an agent crossing a room's face and
  one agent crossing another, the farther hidden where they cross; and on the web, eighteen faces
  each over a silhouette flooded with the page's colour.
