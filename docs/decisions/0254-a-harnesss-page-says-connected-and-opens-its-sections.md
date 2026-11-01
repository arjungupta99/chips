# 0254. A harness's page says it is connected, shows five agents, and opens its sections on pages

Date: 31 October 2026
Status: Accepted, 31 October 2026, on Arjun's "Build B". Mock:
<https://claude.ai/artifact/6kVFQW6MrymBimGioUXgdf> (layout B).

## Context

Arjun, 31 October 2026: "in harness detail page, we show a green "Done" button, what is the
meaning of this? maybe say "connected" or something better?" and "right now the "Agents" section
can be very long, if there are a lot of them, we need a truncation, show 5 at most, if we need to
open all, then they open in a pushed view controller. Need better organization of the other
sections and whole section as well."

The green Done was the state of the harness's latest run (`statusOf`), drawn as a pill under its
face with a green ring round it. Done meant the last thing it was asked to do had finished, which
could be hours ago, and it said nothing about whether the harness was there. Its card and its tile
already drew nothing for Done or Idle (`saysStatus`, WP5); the page's head never took the rule.

The page had grown one section at a time: two full-width buttons, the Model group, the two context
groups, every agent in one card, its own jobs (ADR 0252), When it asks you (ADR 0195), the dial,
the budget, the last five runs as lines of text, a note about tokens, and Remove. Some sections drew
their heading in a card and some above it. Jacobian, with 83 agents at 80 points a row, made a page
13 screens long, 8 of them its agents.

The mock drew Jacobian's page today and three layouts: A, the same page put in order (3.8 screens);
B, a short page whose rows open pages (2.0); C, tiles as on a space's sheet (1.8). He chose B.

## Decision

1. **The head says what the harness is now**, in a line with a dot, not a pill that looks like a
   button: why it can't answer (ADR 0083), in amber; what it is doing, in the status vocabulary's
   colour; back from a restart this page watched (ADR 0094); or, while it can answer and nothing
   is going on, **"Connected · since 8:02 AM"** with a green dot (core's `connectedWords`, from the
   `since` the server already keeps in each harness's state). Done and Idle say nothing, in the
   ring as in the words, as on its card. The desktop's harness card says the same connected line.
2. **New agent and Restart share a row** under the head, with Pause or Resume while a run of its is
   going. Restart's words while nothing of it is connected stand under the row.
3. **Its agents stop at five**: the first five of the Agents tab's own order (its Main agent, the
   free ones, then by their rooms' last line), in a group, with **See all N agents** under them.
   That row opens a page of its own (`/harnesses/[id]/agents`): a field that finds an agent by its
   name or its space, its Main agent, every other agent, and its archived ones behind a row at the
   foot. With five or fewer agents there is no See all, and the archived ones keep their row.
4. **Set up** is one group: its Main agent's Model row, the same row as on an agent's page, opening
   the model sheet (ADR 0154), with its foot under the group; **Context files**, for its owner, with
   how many files its agents share; and **When it asks you**, for everybody who reads the page, with
   how many things are allowed always, or who decides. Context files and When it asks you open
   their sections whole on pages of their own (`/harnesses/[id]/context`, `/harnesses/[id]/asks`).
   The dial (ADR 0046), for a harness that takes it, stands under When it asks you on its page.
5. **History** is a Recent runs row, with how many began this week, opening every run as a row:
   what it was asked, its space, when, how it ended, what it cost, each opening its space
   (`/harnesses/[id]/runs`). A harness that has never run has no row. A budget stands under it.
6. **Remove harness…** is the last row, in red, in a group of its own. The note about tokens goes:
   the token screen is still not on the phone.
7. On a wide screen each page opens in the Agents tab's pane, through its `part` param, and goes back
   to the harness's page. A link to a shared file (`/harnesses/[id]?file=`) opens Context files.

## What is left out

- The desktop's harness card keeps its layout: it lists no agents and never said Done.
- Reordering the agents, or the Agents tab's own list, which this page follows.

## Consequences

- Jacobian's page is two screens long, and its first screen shows what it is now, its buttons and
  its first agents.
- When it asks you, a section Arjun chose with its motion (ADR 0195), is a tap further away. Its row
  says how much is allowed always, which is what changes from day to day.

## Addendum, 31 October 2026: New agent and Pause on top, Restart at the foot

Arjun, on his iPhone, of Jacobian's page with New agent, Restart… and Pause in one row: "These 3
button layout looks off", then, asked why there is a Restart: "new agent and pause on top row,
restart on lower row".

Pause was there because the page offered it whenever the harness had a latest run at all
(`FleetHarness.runId` is "its latest run, when it has had one"), finished or not, and the server
refuses to pause a run that has ended. Jacobian, idle, had three buttons for that reason alone.

1. The row under the head is **New agent** and **Pause**, or **Resume** while its run is paused.
   Pause presses only while its latest run is queued, running or waiting; otherwise it stands
   greyed out, so the row keeps its shape between idle and busy (his "Show it greyed out", after
   a build that hid it while idle drew "where did the pause button go?").
2. **Restart harness…** is a row at the page's foot, in the accent, in a group of its own, with
   **Remove harness…** apart under it in red: an agent's page ends the same way, with Archive and,
   apart, Delete. While a restart stands the row says "Restarting…" with nothing to press; while
   nothing of the harness is connected it says why there is nobody to ask, and the box that said so
   under the buttons goes. It is no longer gold while the harness can't answer: the head says that,
   in amber, and the row is where it always is.
3. Then, his words: "memory and database sections need to have section loading animation similar
   to agent detail page. Should look polished with no abrupt transitions". **Its own jobs arrive as
   an agent's groups do** (ADR 0238's addendum): the heading stands from the first frame, two blank
   rows (Jacobian's two jobs) hold under it, and the rows, their foot and the week's cost come in
   over the blanks while the blanks hold and then fade. The group stands in a place of its own that
   takes the rows' size on `GROWS`, and Set up, History and the foot move with it. The Model row in
   Set up comes in the same way over the blank row that stood for it.
